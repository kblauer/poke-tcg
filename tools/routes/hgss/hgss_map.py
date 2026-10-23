"""Renders a HeartGold/SoulSilver map (or several maps of one matrix, joined) from the pret/pokeheartgold decompilation,
as the Johto routes use them: its terrain chunks and buildings converted to GLB with apicula (the Nintendo DS model
converter, github.com/scurest/apicula) and drawn tilted (render_hgss.py), and writes which tiles can be walked on.

Usage: python hgss_map.py <out prefix> <MAP_CONST>[,<MAP_CONST>...] [--tilt 0.6] [--room] [--overhead <material>,...] [--apicula <apicula.exe>] [--cache <dir>]
(--room: a building's inside, whose buildings are bm_room's. --overhead: these materials (a bridge's) also drawn alone, see-through
elsewhere, to <out prefix>-overhead.png, for the route map to draw over the people walking under them.)
Writes <out prefix>.png and <out prefix>.json: the size in tiles and `rows`, one string per tile row: '.' walkable, '#' not
(collision, doors and warps), '~' water (surfable), and ledges by the way they're jumped: '>' east, '<' west, '^' north,
'v' south; `grass`, the same size: 'g' tall grass (behaviours 2 and 3), '.' not; and `ice` alike: 'i' ice (behaviour
32, slid across), '.' not. People and item balls are not in the map data (they're events), so their tiles are walkable. Needs numpy and
Pillow (pip install numpy pillow) and apicula on the PATH or given with --apicula."""
import collections, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hgss_data as hd
from render_hgss import Scene, UNIT

CHUNK = 32  # tiles across a terrain chunk
# Tile behaviours (include/constants/metatile_behavior.h).
WATER = {16, 17, 19, 21}  # river, whirlpool, waterfall, sea
LEDGES = {56: '>', 57: '<', 58: '^', 59: 'v'}
BLOCKED = set(range(60, 64)) | set(range(94, 112))  # ladders, warps, doors
GRASS = {2, 3}  # tall grass, very tall grass
ICE = {32}  # ice (TILE_BEHAVIOR_ICE)


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


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    tilt = float(opt('--tilt', '0.6'))
    overhead = set(filter(None, opt('--overhead', '').split(',')))
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokeheartgold'))
    out, consts = args[0], args[1].split(',')

    ids = hd.map_ids(cache)
    header = hd.map_header(cache, consts[0])
    w, h, cells = hd.matrix(cache, header['matrix'])
    wanted = {ids[c] for c in consts}
    mine = [c for c in cells if c['header'] in wanted or (c['header'] is None and c['land'] != 0xFFFF)]
    x0, y0 = min(c['x'] for c in mine), min(c['y'] for c in mine)
    cw, ch = max(c['x'] for c in mine) - x0 + 1, max(c['y'] for c in mine) - y0 + 1
    ar = hd.area(cache, header['area'], room='--room' in sys.argv)
    land = hd.narc(hd.fetch(cache, hd.LAND_DATA))
    textures = hd.narc(hd.fetch(cache, hd.MAP_TEXTURES))[ar['textures']]
    buildings = hd.narc(hd.fetch(cache, hd.BUILDINGS[ar['buildings']]))
    work = tempfile.mkdtemp(prefix='hgss_map_')
    tex_path = os.path.join(work, 'tex.nsbtx'); open(tex_path, 'wb').write(textures)

    rows = [['#'] * (cw * CHUNK) for _ in range(ch * CHUNK)]
    grass = [['.'] * (cw * CHUNK) for _ in range(ch * CHUNK)]
    ice = [['.'] * (cw * CHUNK) for _ in range(ch * CHUNK)]
    parts, ys = [], collections.Counter()
    for c in mine:
        chunk = hd.land_chunk(land[c['land']])
        ox, oz = (c['x'] - x0) * CHUNK, (c['y'] - y0) * CHUNK
        for ty in range(CHUNK):
            for tx in range(CHUNK):
                lo, hi = chunk['perm'][(ty * CHUNK + tx) * 2], chunk['perm'][(ty * CHUNK + tx) * 2 + 1]
                rows[oz + ty][ox + tx] = tile_char(lo, hi)
                if lo in GRASS:
                    grass[oz + ty][ox + tx] = 'g'
                if lo in ICE:
                    ice[oz + ty][ox + tx] = 'i'
        model = os.path.join(work, f"land{c['land']}.nsbmd"); open(model, 'wb').write(chunk['model'])
        glb = convert(apicula, [model, tex_path], os.path.join(work, f"land{c['land']}"))
        # The chunk's model origin is its centre.
        centre = ((ox + CHUNK / 2) * UNIT, 0, (oz + CHUNK / 2) * UNIT)
        parts.append((glb, centre, hd.texture_matrices(chunk['model'])))
        for b in chunk['buildings']:
            bm = os.path.join(work, f"bm{b['model']}.nsbmd")
            if not os.path.exists(bm):
                open(bm, 'wb').write(buildings[b['model']])
            # Some buildings take textures from the map's set (bridges, waterfalls), most have their own.
            bglb = convert(apicula, [bm, tex_path], os.path.join(work, f"bm{b['model']}"))
            parts.append((bglb, (centre[0] + b['pos'][0], b['pos'][1], centre[2] + b['pos'][2]), hd.texture_matrices(buildings[b['model']])))

    # The ground's height: the commonest height of the terrain's vertices (most of it is flat ground).
    from render_hgss import _load_glb, _primitives, _accessor
    for glb, _, _ in parts[:1]:
        gj, bin_ = _load_glb(glb)
        for m, p in _primitives(gj):
            for y in _accessor(gj, bin_, p['attributes']['POSITION'])[:, 1]:
                ys[round(y)] += 1
    ground = ys.most_common(1)[0][0] if ys else 0
    scene = Scene(cw * CHUNK * 16, ch * CHUNK * 16, tilt=tilt, ground=ground)
    for glb, origin, texmtx in parts:
        scene.glb(glb, origin, texmtx)
    scene.render(out + '.png')
    if overhead:
        # The parts drawn over the people walking under them (a bridge), on their own, see-through elsewhere.
        top = Scene(cw * CHUNK * 16, ch * CHUNK * 16, tilt=tilt, ground=ground)
        for glb, origin, texmtx in parts:
            top.glb(glb, origin, texmtx, only=overhead)
        top.render(out + '-overhead.png', transparent=True)
    json.dump({'width': cw * CHUNK, 'height': ch * CHUNK, 'rows': [''.join(r) for r in rows], 'grass': [''.join(r) for r in grass], 'ice': [''.join(r) for r in ice], 'chunks':[[c['x'] - x0, c['y'] - y0, c['land']] for c in mine]}, open(out + '.json', 'w'))
    print('rendered', consts, cw * CHUNK, 'x', ch * CHUNK, 'tiles; texture set', ar['textures'], '; ground', ground)


if __name__ == '__main__':
    main()
