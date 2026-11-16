"""Renders a Pokémon Black zone (or several zones of one matrix, joined) as the Unova routes use it (issue #231): its land
chunks' terrain and buildings converted to GLB with apicula and drawn tilted by the HGSS maps' renderer
(../hgss/render_hgss.py, as dp_map.py does for Sinnoh), in a season's textures, and writes which tiles can be walked on.

Usage: python bw_map.py <out prefix> <zone>[,<zone>...] [--season spring|summer|autumn] [--tilt 0.6]
       [--apicula <apicula.exe>] [--cache <dir>] [--indoor-pack <n>] [--no-buildings]
Writes <out prefix>.png, <out prefix>_height.npy (each pixel's model height) and <out prefix>.json: the size in tiles,
`rows` (one string per tile row: '.' walkable, '#' not (blocked, warps' tiles), '~' water, ledges by the way they're
jumped: '>' '<' '^' 'v'), `grass` ('g' tall grass), `ice` ('i'), `behaviours` (each tile's behaviour, two hex digits, for
working out the ones not named yet), `warps` and `people` (the zones' events in the picture's tiles: warps' target zones,
people's sprites, scripts, facing and trainers), `origin` (the first cell, in chunks) and `chunks`.

Black's formats (bw_data.py): a chunk is 32x32 tiles, its model's origin its centre, 16 units a tile; a tile is blocked
when its permission's flags have bit 0; a `GC` chunk's two layers (bridges and walkways crossed over and under) are joined
here, a tile walkable on either (its tracks to be set by hand, as Goldenrod Gym's). A zone of the overworld (matrix 0) is
its own cells; any other is its matrix's every cell. Warps' and people's positions: tiles (people's) or sixteenths of a
tile (warps'), in the whole matrix's tiles. Outdoor buildings come from the zone's pack (its header's), an interior's from
the indoor pack its area names (or --indoor-pack). Needs numpy and Pillow, and apicula on the PATH or given."""
import collections, json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'hgss'))
import bw_data
from render_hgss import Scene, UNIT, _load_glb, _primitives, _accessor
from hgss_data import texture_matrices

CHUNK = 32
# Behaviours named so far (Black's, read off its maps with their `behaviours` grids drawn over the pictures): tall grass
# (0x04 and 0x06 on most routes, 0x08 and 0x09 Route 7's very tall grass), water (0x3D-0x3F), ice (0x18: Icirrus Gym's
# floor, and Cold Storage's frozen patches). Others seen: 0x03 paths, 0x0A cave floor, 0x0B and 0x0C sand, 0x1C Route 8's
# puddles, 0x41 and 0x44 shores (blocked), 0x51-0x54 door mats, 0xBE and 0xBF Route 7's raised walkways and their ends.
# No ledges found as behaviours (Gen 5 may keep them in the permissions' height table: to read with the review).
GRASS = {0x04, 0x05, 0x06, 0x07, 0x08, 0x09}
WATER = {0x3D, 0x3E, 0x3F}
LEDGES = {}
ICE = {0x18}
# Buildings this big (model units across) are sky boxes or backdrops, not buildings: left out.
BACKDROP = 32 * UNIT * 3


def convert(apicula, files, out):
    subprocess.run([apicula, 'convert', *files, '-o', out, '-f', 'glb', '--overwrite'], check=True, capture_output=True)
    return next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb'))


def tile_char(t):
    b = t['behaviour'] & 0xFF
    if b in LEDGES:
        return LEDGES[b]
    if bw_data.blocked(t):
        return '#'
    return '~' if b in WATER else '.'


def zone_cells(g, zones):
    """The cells of the zones (one matrix): the overworld's cells of each, or a zone's own matrix's every cell."""
    first = g.zones()[zones[0]]
    cells = []
    for z in zones:
        cells += [c for c in g.zone_cells(z) if c not in cells]
    return first, cells


def choose_pack(g, zone, area, cells, indoor_pack=None):
    """The building pack the zone's buildings come from: (outdoor?, pack). Neither the zone's pack byte (16 for every
    interior and for caves and forests) nor the area's first field names it every time, so it's the first pack holding
    every building the cells place: the zone's own (outdoor), then the area's first field (indoor, then outdoor), then
    every pack, outdoor ones first for an outdoor area."""
    if indoor_pack is not None:
        return False, int(indoor_pack)
    ids = {b['id'] for c in cells for b in g.land(c['land'])['buildings']}
    if not ids:
        return area['outdoor'], zone['pack']
    outdoor_n, indoor_n = len(g.archive('outdoor_buildings')), len(g.archive('indoor_buildings'))
    tries = [(True, zone['pack']), (False, area['buildings']), (True, area['buildings'])]
    kinds = (True, False) if area['outdoor'] else (False, True)
    tries += [(k, n) for k in kinds for n in range(outdoor_n if k else indoor_n)]
    for outdoor, n in tries:
        if n < (outdoor_n if outdoor else indoor_n) and ids <= set(g.building_pack(n, outdoor)['models']):
            return outdoor, n
    return area['outdoor'], zone['pack']


def main():
    args = sys.argv[1:]

    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    tilt = float(opt('--tilt', '0.6'))
    apicula = opt('--apicula', 'apicula')
    season = opt('--season', 'spring')
    indoor_pack = opt('--indoor-pack', None)
    no_buildings = '--no-buildings' in args
    if no_buildings:
        args.remove('--no-buildings')
    g = bw_data.Game(opt('--cache', None))
    out, zones = args[0], [int(z) for z in args[1].split(',')]
    first, cells = zone_cells(g, zones)
    x0, y0 = min(c['x'] for c in cells), min(c['y'] for c in cells)
    cw, ch = max(c['x'] for c in cells) - x0 + 1, max(c['y'] for c in cells) - y0 + 1
    area = g.area(first['area'], season)
    outdoor, pack_id = choose_pack(g, first, area, cells, indoor_pack)
    work = tempfile.mkdtemp(prefix='bw_map_')
    tex = os.path.join(work, 'tex.nsbtx'); open(tex, 'wb').write(g.map_textures(area['textures']))
    btex = os.path.join(work, 'btex.nsbtx'); open(btex, 'wb').write(g.building_textures(pack_id, outdoor))
    pack = g.building_pack(pack_id, outdoor)['models']

    W, H = cw * CHUNK, ch * CHUNK
    rows = [['#'] * W for _ in range(H)]
    grass = [['.'] * W for _ in range(H)]
    ice = [['.'] * W for _ in range(H)]
    behaviours = [['00'] * W for _ in range(H)]
    parts, ys, converted, missing = [], collections.Counter(), {}, set()
    for c in cells:
        chunk = g.land(c['land'])
        ox, oz = (c['x'] - x0) * CHUNK, (c['y'] - y0) * CHUNK
        for layer in chunk['layers']:
            for i, t in enumerate(layer['tiles']):
                tx, ty = i % CHUNK, i // CHUNK
                b = t['behaviour'] & 0xFF
                ch_ = tile_char(t)
                # GC's second layer: a tile walkable on either layer is walkable.
                if rows[oz + ty][ox + tx] == '#' or ch_ != '#':
                    rows[oz + ty][ox + tx] = ch_
                    behaviours[oz + ty][ox + tx] = '%02x' % b
                if b in GRASS:
                    grass[oz + ty][ox + tx] = 'g'
                if b in ICE:
                    ice[oz + ty][ox + tx] = 'i'
        model = os.path.join(work, f"land{c['land']}.nsbmd"); open(model, 'wb').write(chunk['model'])
        glb = convert(apicula, [model, tex], os.path.join(work, f"land{c['land']}"))
        centre = ((ox + CHUNK / 2) * UNIT, 0, (oz + CHUNK / 2) * UNIT)
        parts.append((glb, centre, texture_matrices(chunk['model']), None))
        for b in [] if no_buildings else chunk['buildings']:
            if b['id'] not in pack:
                missing.add(b['id'])
                continue
            if b['id'] not in converted:
                bm = os.path.join(work, f"bm{b['id']}.nsbmd"); open(bm, 'wb').write(pack[b['id']])
                try:
                    converted[b['id']] = convert(apicula, [bm, btex, tex], os.path.join(work, f"bm{b['id']}"))
                except (subprocess.CalledProcessError, StopIteration):
                    converted[b['id']] = None
            if not converted[b['id']]:
                continue
            gj, bin_ = _load_glb(converted[b['id']])
            xs = [v for _m, p in _primitives(gj) for v in _accessor(gj, bin_, p['attributes']['POSITION'])[:, 0]]
            if xs and max(xs) - min(xs) > BACKDROP:
                continue
            at = (centre[0] + b['pos'][0], centre[1] + b['pos'][1], centre[2] + b['pos'][2])
            parts.append((converted[b['id']], at, texture_matrices(pack[b['id']]), ('y', b['yaw']) if b['yaw'] else None))
    if missing:
        print('  buildings not in pack', pack_id, sorted(missing))
    # The ground's height: the commonest height of the first chunk's vertices.
    for glb, origin, *_ in parts[:1]:
        gj, bin_ = _load_glb(glb)
        for _m, p in _primitives(gj):
            for y in _accessor(gj, bin_, p['attributes']['POSITION'])[:, 1]:
                ys[round(y + origin[1])] += 1
    ground = ys.most_common(1)[0][0] if ys else 0
    scene = Scene(W * 16, H * 16, tilt=tilt, ground=ground)
    for glb, origin, texmtx, turn in parts:
        scene.glb(glb, origin, texmtx, turn=turn)
    scene.render(out + '.png', heights=out + '_height.npy')

    # The zones' warps and people, in this picture's tiles (the overworld's are the whole matrix's).
    mx, mz = x0 * CHUNK, y0 * CHUNK
    warps, people = [], []
    for z in zones:
        ev = g.events(g.zones()[z]['events'])
        for w in ev['warps']:
            warps.append({'zone': z, 'to': w['zone'], 'warp': w['warp'], 'x': w['x'] // 16 - mx, 'y': w['z'] // 16 - mz, 'width': w['width'], 'height': w['height']})
        for o in ev['objects']:
            p = {'zone': z, 'id': o['id'], 'sprite': o['sprite'], 'script': o['script'], 'face': o['face'], 'x': o['x'] - mx, 'y': o['z'] - mz}
            if 'trainer' in o:
                p['trainer'] = g.trainer(o['trainer'])['label']
            people.append(p)
    for w in warps:
        if 0 <= w['y'] < H and 0 <= w['x'] < W:
            rows[w['y']][w['x']] = '#'
    json.dump({'width': W, 'height': H, 'zones': zones, 'season': season, 'rows': [''.join(r) for r in rows], 'grass': [''.join(r) for r in grass],
               'ice': [''.join(r) for r in ice], 'behaviours': [' '.join(r) for r in behaviours], 'warps': warps, 'people': people,
               'ground': ground, 'origin': [x0, y0], 'chunks': [[c['x'] - x0, c['y'] - y0, c['land']] for c in cells]}, open(out + '.json', 'w'))
    print('rendered', zones, first['name'], W, 'x', H, 'tiles; ground', ground, '; buildings from', 'outdoor' if outdoor else 'indoor', 'pack', pack_id)


if __name__ == '__main__':
    main()
