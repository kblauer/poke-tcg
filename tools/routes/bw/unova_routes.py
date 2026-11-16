"""Makes every Unova gym run's maps (issue #231; the maps proposed there, agreed with the user 2026-11-16) and writes
packages/campaign/src/unova-routes.ts, copying the images to apps/web/public/routes/, as sinnoh_routes.py does for Sinnoh:

- each map rendered by bw_map.py from Black's zones, in its run's season (the user's: spring for gym runs 1-3, summer for
  4-6, autumn for 7-8);
- the player comes in at `entrance` and leaves at `exit` (an edge: the walkable tile nearest it; a warp to a zone: its
  tile, made walkable; a tile), and the map's spots are picked along the shortest walk between the two, evenly spaced, each
  nudged onto the most open tile near it;
- each map is cropped to the tiles walked to from its entrance, with a margin (Black's zones are whole 32x32 chunks, most
  of them trees or rock past the road).

The maps are first drafts, as Sinnoh's were before their review: the user's fixes (spots, entrances and exits, walkable and
unwalkable tiles) go in the USER_ tables, map by map (issue #231's review).

Usage: python unova_routes.py [--apicula <apicula.exe>] [--cache <dir>] [--work <dir>]
(--work: where the renders go; each map also gets a <name>-preview.png there with its entrance, spots and exit marked.)
Prints any walk it can't find."""
import json, os, subprocess, sys, tempfile
from collections import deque
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes')
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'unova-routes.ts')
TILE = 16
STEP = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}
# How far past the walked tiles a crop goes: above (drawn tilted), and the other sides.
MARGIN = {'top': 4, 'side': 2, 'bottom': 2}

# Each map, in run order: its zones, season, spots, entrance and exit ('left', 'right', 'top', 'bottom': an edge;
# ('warp', zone): the warp to that zone; ('tile', x, y)), the way its encounters go, its constant, name and what it is.
MAPS = {
    'bw_route1': ([317], 'spring', 4, ('tile', 53, 66), ('tile', 55, 0), 'up', 'UNOVA_ROUTE_1', 'Route 1',
                  'from Nuvema Town (south) up to Accumula Town (north), for the Striaton City run, then Route 2'),
    'bw_route2': ([319], 'spring', 6, ('tile', 50, 0), ('warp', 320), 'down', 'UNOVA_ROUTE_2', 'Route 2',
                  "from Accumula Town (north) round to Striaton City's gate (south), after Route 1"),
    'bw_route3': ([321], 'spring', 8, ('tile', 59, 23), ('warp', 324), 'left', 'UNOVA_ROUTE_3', 'Route 3',
                  "from Striaton City (east) west past the Day Care and the pond to Wellspring Cave's mouth, for the Nacrene City run, then Wellspring Cave"),
    'bw_wellspring_cave': ([324], 'spring', 2, ('warp', 321), ('warp', 325), 'down', 'WELLSPRING_CAVE', 'Wellspring Cave',
                           'from Route 3 down to its lower floor, after Route 3'),
    'bw_pinwheel_forest': ([155], 'spring', 10, ('warp', 154), ('warp', 250), 'up', 'PINWHEEL_FOREST', 'Pinwheel Forest',
                           "its inside, from its south-east edge up to Skyarrow Bridge (north), for the Castelia City run"),
    'bw_route4': ([326], 'summer', 10, ('warp', 51), ('warp', 90), 'up', 'UNOVA_ROUTE_4', 'Route 4',
                  "from Castelia City's gate (south) up through the desert to Nimbasa City's (north), for the Nimbasa City run"),
    'bw_route5': ([329], 'summer', 4, ('warp', 91), ('warp', 253), 'left', 'UNOVA_ROUTE_5', 'Route 5',
                  'from Nimbasa City (east) west to Driftveil Drawbridge, for the Driftveil City run, then Cold Storage'),
    'bw_cold_storage': ([192], 'summer', 6, ('warp', 191), ('warp', 193), 'up', 'COLD_STORAGE', 'Cold Storage',
                        'inside, from its door up through the containers, after Route 5'),
    'bw_route6': ([331], 'summer', 5, 'bottom', 'top', 'up', 'UNOVA_ROUTE_6', 'Route 6',
                  'from Driftveil City (south) up across the rivers towards Chargestone Cave (north), for the Mistralton City run, then Chargestone Cave'),
    'bw_chargestone_cave': ([195], 'summer', 5, ('warp', 194), ('warp', 107), 'up', 'CHARGESTONE_CAVE', 'Chargestone Cave',
                            "its first floor, from Route 6's mouth to the way out to Mistralton City, after Route 6"),
    'bw_route7': ([337], 'autumn', 5, 'bottom', 'right', 'up', 'UNOVA_ROUTE_7', 'Route 7',
                  'from Mistralton City (south) up past the tall grass and its walkways towards Twist Mountain (east), for the Icirrus City run, then Twist Mountain'),
    'bw_twist_mountain': ([199], 'autumn', 5, ('warp', 200), ('warp', 201), 'up', 'TWIST_MOUNTAIN', 'Twist Mountain',
                          'its great chamber, from its first tunnel round its ledges to the way up, after Route 7'),
    'bw_route8': ([345], 'autumn', 5, 'left', ('warp', 347), 'right', 'UNOVA_ROUTE_8', 'Route 8',
                  "from Icirrus City (west) east past the marsh's puddles to Tubeline Bridge's gate, for the Opelucid City run, then Route 9"),
    'bw_route9': ([348], 'autumn', 5, ('warp', 349), ('warp', 131), 'right', 'UNOVA_ROUTE_9', 'Route 9',
                  "from Tubeline Bridge's gate (west) east past the Shopping Mall to Opelucid City's, after Route 8"),
}
# The user's fixes, by map, in the map's own tiles (after the crop): spots (by number, from 1), entrance, exit, tiles made
# walkable or not. Empty until the review (issue #231).
USER_SPOTS = {}
USER_ENTRANCE = {}
USER_EXIT = {}
USER_WALKABLE = {}
USER_BLOCKED = {}

HEAD = """// The Unova gym runs' maps, from Pokémon Black (issue #231; the maps proposed there, agreed with the user 2026-11-16): each
// rendered from Black's 3D zones by tools/routes/bw/bw_map.py with the HGSS renderer, in its run's season (spring for gym
// runs 1-3, summer for 4-6, autumn for 7-8: the user's), cropped to the road, and its spots picked along the walk from its
// entrance to its exit. First drafts, to review with the user map by map as Sinnoh's were. Written by
// tools/routes/bw/unova_routes.py.
import type { Route } from './routes.js';
"""


def moves(rows, x, y):
    for dx, dy in STEP.values():
        n = (x + dx, y + dy)
        if 0 <= n[1] < len(rows) and 0 <= n[0] < len(rows[0]) and rows[n[1]][n[0]] == '.':
            yield n


def bfs(rows, start):
    prev = {start: None}; q = deque([start])
    while q:
        t = q.popleft()
        for n in moves(rows, *t):
            if n not in prev:
                prev[n] = t; q.append(n)
    return prev


def largest_area(rows):
    seen, best = set(), set()
    for y0 in range(len(rows)):
        for x0 in range(len(rows[0])):
            if rows[y0][x0] != '.' or (x0, y0) in seen:
                continue
            comp = set(bfs(rows, (x0, y0)))
            seen |= comp
            if len(comp) > len(best):
                best = comp
    return best


def edge_tile(rows, area, edge):
    """The tile of `area` nearest `edge` (the most central of those)."""
    h, w = len(rows), len(rows[0])
    toward = {'bottom': lambda t: t[1], 'top': lambda t: -t[1], 'left': lambda t: -t[0], 'right': lambda t: t[0]}[edge]
    far = max(toward(t) for t in area)
    return min((t for t in area if toward(t) == far), key=lambda t: abs(t[0] - w / 2) + abs(t[1] - h / 2))


def nearest(rows, t, area):
    """`t`, or the tile of `area` nearest it."""
    return t if t in area else min(area, key=lambda a: abs(a[0] - t[0]) + abs(a[1] - t[1]))


def render(name, zones, season, work, apicula, cache):
    prefix = os.path.join(work, name)
    if not os.path.exists(prefix + '.json'):
        subprocess.run([sys.executable, os.path.join(HERE, 'bw_map.py'), prefix, ','.join(map(str, zones)), '--season', season, '--apicula', apicula,
                        *(['--cache', cache] if cache else [])], check=True)
    return prefix, json.load(open(prefix + '.json'))


def place_end(spec, rows, warps, area):
    """An entrance or exit: an edge's tile, a warp's (made walkable) or a tile (or the walkable tile nearest it)."""
    if isinstance(spec, str):
        return edge_tile(rows, area, spec)
    if spec[0] == 'warp':
        w = next(w for w in warps if w['to'] == spec[1])
        rows[w['y']][w['x']] = '.'
        return w['x'], w['y']
    return spec[1], spec[2]


def crop(rows, layers, reach, img, ends):
    """The map cut to its walked tiles (and `ends`) with MARGIN round them: rows, layers, the image and the shift."""
    h, w = len(rows), len(rows[0])
    tiles = list(reach) + list(ends)
    x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(w - 1, max(t[0] for t in tiles) + MARGIN['side'])
    y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(h - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
    cut = lambda grid: [r[x0:x1 + 1] for r in grid[y0:y1 + 1]]
    return cut(rows), [cut(l) for l in layers], img.crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE)), (x0, y0)


def spots_along(rows, walk, prev, count, ends):
    h, w = len(rows), len(rows[0])

    def openness(t):
        return sum(rows[y][x] == '.' for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w)
    spots = []
    for i in range(count):
        t = walk[round((i + 1) * (len(walk) - 1) / (count + 1))]
        near = [(x, y) for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3)
                if 0 <= y < h and 0 <= x < w and rows[y][x] == '.' and (x, y) in prev and (x, y) not in spots and (x, y) not in ends]
        spots.append(max(near, key=lambda n: openness(n) * 2 - abs(n[0] - t[0]) - abs(n[1] - t[1])) if near else t)
    return spots


def preview(img, ent, spots, end, out):
    pv = img.convert('RGB'); d = ImageDraw.Draw(pv)
    for k, (x, y) in enumerate([ent] + spots + [end]):
        col = (0, 255, 0) if k == 0 else (255, 0, 255) if k == len(spots) + 1 else (255, 0, 0)
        d.ellipse([x * 16 + 1, y * 16 + 1, x * 16 + 15, y * 16 + 15], outline=col, width=2)
        d.text((x * 16 + 16, y * 16), 'IN' if k == 0 else 'OUT' if k == len(spots) + 1 else str(k), fill=(255, 255, 255))
    pv.save(out)


def grid_ts(key, rows):
    return f'\n  {key}: [' + ''.join(f"\n    '{r}'," for r in rows) + '\n  ],'


def main():
    args = sys.argv[1:]

    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', None)
    work = opt('--work', None) or tempfile.mkdtemp(prefix='unova_routes_')
    os.makedirs(work, exist_ok=True)
    out = []
    for name, (zones, season, count, entrance, exit_, flow, const, title, what) in MAPS.items():
        prefix, j = render(name, zones, season, work, apicula, cache)
        rows = [list(r) for r in j['rows']]
        area = largest_area([''.join(r) for r in rows])
        ent = place_end(entrance, rows, j['warps'], area)
        end = place_end(exit_, rows, j['warps'], area)
        rows = [''.join(r) for r in rows]
        # A tile given (or an edge's) moves to the nearest walkable tile of the map's largest area; a warp's is opened as it is.
        area = largest_area(rows)
        snap = lambda t, spec: t if isinstance(spec, tuple) and spec[0] == 'warp' else nearest(rows, t, area)
        ent, end = snap(ent, entrance), snap(end, exit_)
        prev = bfs(rows, ent)
        if end not in prev:
            print('NO WALK:', name, 'from', ent, 'to', end, '(the exit moved to the walked tile nearest it)')
            end = nearest(rows, end, set(prev))
        walk = [end]
        while prev[walk[-1]] is not None:
            walk.append(prev[walk[-1]])
        walk = walk[::-1]
        spots = spots_along(rows, walk, prev, count, (ent, end))
        img = Image.open(prefix + '.png')
        rows, (grass, ice), img, (x0, y0) = crop(rows, [j['grass'], j['ice']], prev, img, (ent, end))
        shift = lambda t: (t[0] - x0, t[1] - y0)
        ent, end, spots = shift(ent), shift(end), [shift(s) for s in spots]
        # The user's fixes.
        rows = [list(r) for r in rows]
        for x, y in USER_WALKABLE.get(name, []):
            rows[y][x] = '.'
        for x, y in USER_BLOCKED.get(name, []):
            rows[y][x] = '#'
        ent, end = USER_ENTRANCE.get(name, ent), USER_EXIT.get(name, end)
        for x, y in (ent, end):
            rows[y][x] = '.'
        rows = [''.join(r) for r in rows]
        spots = [USER_SPOTS.get(name, {}).get(i + 1, s) for i, s in enumerate(spots)]
        reach = bfs(rows, ent)
        for t in spots + [end]:
            if t not in reach:
                print('NO WALK:', name, 'entrance', ent, 'to', t)
        img.save(os.path.join(PUBLIC, name + '.png'))
        preview(img, ent, spots, end, prefix + '-preview.png')
        spots_ = '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in spots)
        grass_ = grid_ts('grass', grass) if any('g' in r for r in grass) else ''
        # Ice makes the player slide (routePath): left out until it's known which of Black's icy floors slide (Cold
        # Storage's patches may not; issue #231's review). bw_map.py's `ice` keeps them.
        ice_ = ''
        out.append(f"""
/** {title} ({season}): {what}. Spots along the walk from its entrance to its exit, picked by the generator. */
export const {const}: Route = {{
  flow: '{flow}',
  sprites: 'bw',
  entrance: {{ x: {ent[0]}, y: {ent[1]} }},
  exit: {{ x: {end[0]}, y: {end[1]} }},
  name: '{title}',
  image: '/routes/{name}.png',
  width: {len(rows[0]) * TILE},
  height: {len(rows) * TILE},
  spots: [
{spots_}
  ],{grid_ts('walkable', rows)}{grass_}{ice_}
}};
""")
        print(name, 'entrance', ent, 'exit', end, 'spots', spots, 'size', len(rows[0]), 'x', len(rows))
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'previews in', work)


if __name__ == '__main__':
    main()
