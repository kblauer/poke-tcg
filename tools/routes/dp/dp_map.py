"""Renders a Diamond/Pearl map (or several maps of one matrix, joined) from the pret/pokediamond decompilation, as the
Sinnoh routes use them: its terrain chunks and buildings converted to GLB with apicula and drawn tilted by the HGSS
maps' renderer (../hgss/render_hgss.py), and writes which tiles can be walked on.

Usage: python dp_map.py <out prefix> <MAP_CONST>[,<MAP_CONST>...] [--tilt 0.6] [--apicula <apicula.exe>] [--cache <dir>]
Writes <out prefix>.png, <out prefix>_height.npy (each pixel's model height, for what stands above the ground) and
<out prefix>.json: the size in tiles and `rows`, one string per tile row: '.' walkable, '#'
not (collision, doors and warps), '~' water (surfable), and ledges by the way they're jumped: '>' east, '<' west, '^'
north, 'v' south; `grass`, the same size: 'g' tall grass, '.' not; `snow`: 's' snow (Route 217), '.' not. Its tile
behaviours are Gen 4's (pokeplatinum's include/constants/field/map_tile_behaviors.h names them; Diamond's are the same).
A map in a matrix of one map (a building's inside, a cave) is every cell of its matrix. People and item balls are not in
the map data (they're events), so their tiles are walkable. Needs numpy and Pillow, and apicula on the PATH or given."""
import collections, json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'hgss'))
import dp_data as dd
from render_hgss import Scene, UNIT, _load_glb, _primitives, _accessor
from hgss_data import texture_matrices

CHUNK = 32  # tiles across a terrain chunk
WATER = {0x10, 0x13, 0x15}  # river, waterfall, sea
LEDGES = {0x38: '>', 0x39: '<', 0x3A: '^', 0x3B: 'v'}
BLOCKED = set(range(0x5E, 0x70))  # warp stairs, entrances, doors, escalators, warps
GRASS = {0x02, 0x03, 0xA6, 0xA7}  # tall grass, very tall grass, mud with grass
SNOW = {0xA1, 0xA2, 0xA3, 0xA8}  # deep, deeper, deepest and shallow snow


def tile_char(lo, hi):
    if lo in LEDGES:
        return LEDGES[lo]
    if lo in BLOCKED:
        return '#'
    if lo in WATER:
        return '~'
    return '#' if hi & 0x80 else '.'


def convert(apicula, files, out):
    subprocess.run([apicula, 'convert', *files, '-o', out, '-f', 'glb', '--overwrite'], check=True, capture_output=True)
    return next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb'))


def map_cells(cache, headers, consts):
    """The matrix cells of the maps (`consts`, one matrix), and their matrix's first map's header."""
    first = headers[consts[0]]
    _, _, cells = dd.matrix(cache, first['matrix'])
    ids = {headers[c]['id'] for c in consts}
    return first, [c for c in cells if c['land'] != 0xFFFF and (c['header'] is None or c['header'] in ids)]


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    tilt = float(opt('--tilt', '0.6'))
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    out, consts = args[0], args[1].split(',')

    headers = dd.map_headers(cache)
    first, mine = map_cells(cache, headers, consts)
    x0, y0 = min(c['x'] for c in mine), min(c['y'] for c in mine)
    cw, ch = max(c['x'] for c in mine) - x0 + 1, max(c['y'] for c in mine) - y0 + 1
    textures = dd.read(cache, dd.MAP_TEXTURES, dd.area_textures(cache, first['area']))
    work = tempfile.mkdtemp(prefix='dp_map_')
    tex_path = os.path.join(work, 'tex.nsbtx'); open(tex_path, 'wb').write(textures)

    W, H = cw * CHUNK, ch * CHUNK
    rows = [['#'] * W for _ in range(H)]
    grass = [['.'] * W for _ in range(H)]
    snow = [['.'] * W for _ in range(H)]
    parts, ys = [], collections.Counter()
    for c in mine:
        chunk = dd.land_chunk(dd.read(cache, dd.LAND_DATA, c['land']))
        ox, oz = (c['x'] - x0) * CHUNK, (c['y'] - y0) * CHUNK
        for ty in range(CHUNK):
            for tx in range(CHUNK):
                lo, hi = chunk['perm'][(ty * CHUNK + tx) * 2], chunk['perm'][(ty * CHUNK + tx) * 2 + 1]
                rows[oz + ty][ox + tx] = tile_char(lo, hi)
                if lo in GRASS:
                    grass[oz + ty][ox + tx] = 'g'
                if lo in SNOW:
                    snow[oz + ty][ox + tx] = 's'
        model = os.path.join(work, f"land{c['land']}.nsbmd"); open(model, 'wb').write(chunk['model'])
        glb = convert(apicula, [model, tex_path], os.path.join(work, f"land{c['land']}"))
        # The chunk's model origin is its centre, raised by the cell's altitude.
        centre = ((ox + CHUNK / 2) * UNIT, c['alt'] * UNIT / 2, (oz + CHUNK / 2) * UNIT)
        parts.append((glb, centre, texture_matrices(chunk['model'])))
        for b in chunk['buildings']:
            bm = os.path.join(work, f"bm{b['model']}.nsbmd")
            if not os.path.exists(bm):
                open(bm, 'wb').write(dd.read(cache, dd.BUILDING, b['model']))
            try:
                bglb = convert(apicula, [bm, tex_path], os.path.join(work, f"bm{b['model']}"))
            except (subprocess.CalledProcessError, StopIteration):
                print('  building', b['model'], "didn't convert")
                continue
            parts.append((bglb, (centre[0] + b['pos'][0], centre[1] + b['pos'][1], centre[2] + b['pos'][2]), texture_matrices(dd.read(cache, dd.BUILDING, b['model']))))

    # The ground's height: the commonest height of the first chunk's vertices (most of it is flat ground).
    for glb, origin, _ in parts[:1]:
        gj, bin_ = _load_glb(glb)
        for m, p in _primitives(gj):
            for y in _accessor(gj, bin_, p['attributes']['POSITION'])[:, 1]:
                ys[round(y + origin[1])] += 1
    ground = ys.most_common(1)[0][0] if ys else 0
    scene = Scene(W * 16, H * 16, tilt=tilt, ground=ground)
    for glb, origin, texmtx in parts:
        scene.glb(glb, origin, texmtx)
    scene.render(out + '.png', heights=out + '_height.npy')
    json.dump({'width': W, 'height': H, 'rows': [''.join(r) for r in rows], 'grass': [''.join(r) for r in grass], 'snow': [''.join(r) for r in snow],
               'origin': [x0, y0], 'chunks': [[c['x'] - x0, c['y'] - y0, c['land']] for c in mine]}, open(out + '.json', 'w'))
    print('rendered', consts, W, 'x', H, 'tiles; ground', ground)


if __name__ == '__main__':
    main()
