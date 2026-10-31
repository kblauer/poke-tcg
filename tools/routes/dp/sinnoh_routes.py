"""Makes every Sinnoh gym run's maps and writes packages/campaign/src/sinnoh-routes.ts, copying the images to
apps/web/public/routes/ (the maps agreed with the user, 2026-10-31):

- each map rendered by dp_map.py (one map, or several of one matrix joined: Route 212's north and south halves), its
  warps' tiles walkable where the player comes in or leaves by one;
- the player comes in at `entrance` (an edge: a tile in from it, in the largest walkable area; or a warp's tile) and
  leaves at `exit` (a warp's tile, or the walkable tile furthest towards an edge), and the map's spots are picked along
  the shortest walk between the two, evenly spaced, each nudged onto the most open tile near it;
- two doors of a map into the same building (Route 213's into Hotel Grand Lake's reception, north and south) are a
  `link`, walked through with a fade, as Route 2's gatehouse is;
- a map with much more than its walk (Eterna Forest, Route 212) is cropped to the tiles walked to from its entrance, with
  a margin.

Usage: python sinnoh_routes.py [--apicula <apicula.exe>] [--cache <dir>] [--work <dir>]
(--work: where the renders go; each map also gets a <name>-preview.png there with its entrance, spots and exit marked.)"""
import json, os, shutil, subprocess, sys, tempfile
from collections import deque
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw
import dp_data as dd

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes')
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'sinnoh-routes.ts')
TILE = 16

# Each map, in run order: its maps, the run it's for, how many spots, where the player comes in and leaves ('left',
# 'right', 'top' or 'bottom': an edge; ('warp', MAP_…): the warp to that map; ('tile', x, y): that tile), the way its
# encounters go, its constant,
# name and what it is.
MAPS = {
    'route203': (['MAP_ROUTE_203'], 7, 'left', ('warp', 'MAP_OREBURGH_GATE_1F'), 'right', 'ROUTE_203', 'Route 203',
                 'Jubilife City (west) to Oreburgh Gate (east), for the Oreburgh City run, then Oreburgh Gate'),
    'oreburgh_gate': (['MAP_OREBURGH_GATE_1F'], 3, ('warp', 'MAP_ROUTE_203'), ('warp', 'MAP_OREBURGH'), 'right', 'OREBURGH_GATE', 'Oreburgh Gate',
                      "Oreburgh Gate's ground floor, from Route 203 (west) to Oreburgh City (east), after Route 203"),
    'eterna_forest': (['MAP_ETERNA_FOREST_INTERIOR'], 6, ('warp', 'MAP_ROUTE_205_SOUTH'), ('warp', 'MAP_ROUTE_205_NORTH'), 'up', 'ETERNA_FOREST', 'Eterna Forest',
                      "from Route 205's south half (south) to its north half (east), for the Eterna City run, then Route 205"),
    'route205n': (['MAP_ROUTE_205_NORTH'], 4, ('warp', 'MAP_ETERNA_FOREST_INTERIOR'), 'top', 'up', 'ROUTE_205', 'Route 205',
                  "Route 205's upper part (agreed with the user), from Eterna Forest (west) up to Eterna City (north), after Eterna Forest"),
    'route215': (['MAP_ROUTE_215'], 10, 'left', ('warp', 'MAP_VEILSTONE_ROUTE_215_GATEHOUSE'), 'right', 'ROUTE_215', 'Route 215',
                 "Route 210 (west) to Veilstone City's gatehouse (east), for the Veilstone City run"),
    'valor_lakefront': (['MAP_VALOR_LAKEFRONT'], 4, 'top', 'bottom', 'down', 'VALOR_LAKEFRONT', 'Valor Lakefront',
                        'from Route 214 (north) down to Route 213 (south), for the Pastoria City run, then Route 213'),
    # In below Valor Lakefront's exit (its columns are Route 213's 32 on).
    'route213': (['MAP_ROUTE_213'], 6, ('tile', 64, 0), ('warp', 'MAP_ROUTE_213_PASTORIA_GATEHOUSE'), 'left', 'ROUTE_213', 'Route 213',
                 "from Valor Lakefront (north) along the beach to Pastoria City's gatehouse (west), after Valor Lakefront"),
    'route212': (['MAP_ROUTE_212_NORTH', 'MAP_ROUTE_212_SOUTH'], 10, 'right', ('warp', 'MAP_HEARTHOME_ROUTE_212_GATEHOUSE'), 'up', 'ROUTE_212', 'Route 212',
                 "all of it (agreed with the user), its south half from Pastoria City (east) west through the marsh, then its north half up to Hearthome City's gatehouse (north), for the Hearthome City run"),
    'iron_island_b1f': (['MAP_IRON_ISLAND_B1F_ROOM_2'], 3, ('warp', 'MAP_IRON_ISLAND_1F'), ('warp', 'MAP_IRON_ISLAND_B2F_ROOM_2'), 'down', 'IRON_ISLAND_B1F', 'Iron Island B1F',
                        'from the stairs down from 1F to the stairs down to B2F, for the Canalave City run (its three floors, agreed with the user), then B2F'),
    'iron_island_b2f': (['MAP_IRON_ISLAND_B2F_ROOM_2'], 4, ('warp', 'MAP_IRON_ISLAND_B1F_ROOM_2'), ('warp', 'MAP_IRON_ISLAND_B3F'), 'down', 'IRON_ISLAND_B2F', 'Iron Island B2F',
                        'from the stairs down from B1F to the stairs down to B3F, after B1F, then B3F'),
    'iron_island_b3f': (['MAP_IRON_ISLAND_B3F'], 3, ('warp', 'MAP_IRON_ISLAND_B2F_ROOM_2'), ('warp', 'MAP_IRON_ISLAND_EXTERIOR'), 'left', 'IRON_ISLAND_B3F', 'Iron Island B3F',
                        "from the stairs down from B2F to the way out, after B2F"),
    'route217': (['MAP_ROUTE_217'], 6, 'bottom', 'top', 'up', 'ROUTE_217', 'Route 217',
                 'from Route 216 (south) up through the snow to Acuity Lakefront (north), for the Snowpoint City run, then Acuity Lakefront'),
    'acuity_lakefront': (['MAP_ACUITY_LAKEFRONT'], 4, 'bottom', 'right', 'right', 'ACUITY_LAKEFRONT', 'Acuity Lakefront',
                         'from Route 217 (south) to Snowpoint City (east), after Route 217'),
    # Hotel Grand Lake has no map of its own: its grounds are Valor Lakefront's south and Route 213's north, cut out of the
    # two joined (BOX; the user's screenshot's bounds, east to Route 222). In at the reception's north door.
    'hotel_grand_lake': (['MAP_VALOR_LAKEFRONT', 'MAP_ROUTE_213'], 3, ('tile', 66, 76), 'right', 'right', 'HOTEL_GRAND_LAKE', 'Hotel Grand Lake',
                         "its grounds (Valor Lakefront's south and Route 213's north, agreed with the user), from the reception up past the cottages and the Seven Stars Restaurant and east to Route 222, for the Sunyshore City run, then Route 222"),
    'route222': (['MAP_ROUTE_222'], 7, 'left', ('warp', 'MAP_ROUTE_222_SUNYSHORE_GATEOUSE'), 'right', 'ROUTE_222', 'Route 222',
                 "from Valor Lakefront (west) along the beach to Sunyshore City's gatehouse (east), for the Sunyshore City run"),
}
# Maps cropped to the tiles walked to from their entrance (most of their render is trees or nothing).
CROP = {'eterna_forest', 'route212'}
# Maps cut out of a bigger render: only this box's tiles (left, top, right, bottom), and the image cropped to it.
BOX = {'hotel_grand_lake': (43, 41, 95, 81)}
# How far past the walked tiles a crop goes: above (drawn tilted), and the other sides.
MARGIN = {'top': 4, 'side': 2, 'bottom': 2}
STEP = {'left': (-1, 0), 'right': (1, 0), 'up': (0, -1), 'down': (0, 1)}
HEAD = """// The Sinnoh gym runs' maps, from Diamond and Pearl (the pret/pokediamond decompilation; tools/routes/dp/): its maps are
// 3D, so dp_map.py converts each one's terrain chunks and buildings with apicula and draws them looking down, slightly
// tilted, as the Johto maps are (16 px to a tile), with which tiles can be walked on from the map data (ledges not; people
// and item balls aren't in it). Every map uses Diamond and Pearl's overworld sprites (`sprites: 'dp'`, 32x32). The maps
// are the user's (2026-10-31); each run's maps are walked one after another, fading from one's exit to the next's entrance.
// Written by tools/routes/dp/sinnoh_routes.py.
import type { Route } from './routes.js';
"""


def moves(rows, x, y, links=()):
    for dx, dy in STEP.values():
        n = (x + dx, y + dy)
        if 0 <= n[1] < len(rows) and 0 <= n[0] < len(rows[0]) and rows[n[1]][n[0]] == '.':
            yield n
    yield from [b for a, b in links if a == (x, y)] + [a for a, b in links if b == (x, y)]


def bfs(rows, start, links=()):
    prev = {start: None}; q = deque([start])
    while q:
        t = q.popleft()
        for n in moves(rows, *t, links):
            if n not in prev:
                prev[n] = t; q.append(n)
    return prev


def largest_area(rows):
    h, w = len(rows), len(rows[0])
    seen, best = set(), set()
    for y0 in range(h):
        for x0 in range(w):
            if rows[y0][x0] != '.' or (x0, y0) in seen:
                continue
            comp = set(bfs(rows, (x0, y0)))
            seen |= comp
            if len(comp) > len(best):
                best = comp
    return best


def edge_tile(rows, area, edge, inward=True):
    """The tile of `area` nearest `edge` (the most central of those), a tile in from the map's very edge (`inward`)."""
    h, w = len(rows), len(rows[0])
    toward = {'bottom': lambda t: t[1], 'top': lambda t: -t[1], 'left': lambda t: -t[0], 'right': lambda t: t[0]}[edge]
    far = max(toward(t) for t in area)
    x, y = min((t for t in area if toward(t) == far), key=lambda t: abs(t[0] - w / 2) + abs(t[1] - h / 2))
    if inward and (y in (0, h - 1) or x in (0, w - 1)):
        dx, dy = (0, -1) if y == h - 1 else (0, 1) if y == 0 else (-1, 0) if x == w - 1 else (1, 0)
        if rows[y + dy][x + dx] == '.':
            x, y = x + dx, y + dy
    return x, y


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    work = opt('--work', None) or tempfile.mkdtemp(prefix='sinnoh_routes_')
    os.makedirs(work, exist_ok=True)
    headers = dd.map_headers(cache)
    out = []
    for name, (consts, count, entrance, exit_, flow, const, title, what) in MAPS.items():
        prefix = os.path.join(work, name)
        if not os.path.exists(prefix + '.json'):
            subprocess.run([sys.executable, os.path.join(HERE, 'dp_map.py'), prefix, ','.join(consts), '--apicula', apicula, '--cache', cache], check=True)
        j = json.load(open(prefix + '.json'))
        rows = [list(r) for r in j['rows']]
        # The maps' warps, in this render's tiles (an overworld map's are the whole matrix's: less its first cell's).
        ox, oz = (j['origin'][0] * 32, j['origin'][1] * 32) if headers[consts[0]]['matrix'] == 0 else (0, 0)
        warps = [(w['x'] - ox, w['z'] - oz, w['header']) for c in consts for w in dd.events(cache, headers[c]['events'])['warps']]

        def warp_tile(to):
            x, y, _ = next(w for w in warps if w[2] == headers[to]['id'])
            rows[y][x] = '.'
            return x, y
        place = lambda spec: (spec[1], spec[2]) if spec[0] == 'tile' else warp_tile(spec[1])
        ent = place(entrance) if isinstance(entrance, tuple) else None
        end = place(exit_) if isinstance(exit_, tuple) else None
        # Two doors into one building, not side by side: walked through, a link.
        links = [((a[0], a[1]), (b[0], b[1])) for i, a in enumerate(warps) for b in warps[i + 1:] if a[2] == b[2] and abs(a[0] - b[0]) + abs(a[1] - b[1]) > 1]
        for (ax, ay), (bx, by) in links:
            rows[ay][ax] = rows[by][bx] = '.'
        box = BOX.get(name)
        if box:
            inside = lambda t: box[0] <= t[0] <= box[2] and box[1] <= t[1] <= box[3]
            rows = [[c if inside((x, y)) else '#' for x, c in enumerate(r)] for y, r in enumerate(rows)]
            links = [(a, b) for a, b in links if inside(a) and inside(b)]
        rows = [''.join(r) for r in rows]
        area = largest_area(rows)
        ent = ent or edge_tile(rows, area, entrance)
        prev = bfs(rows, ent, links)
        # Only the links walked to.
        links = [(a, b) for a, b in links if a in prev and b in prev]
        end = end or edge_tile(rows, [t for t in prev], exit_, inward=False)
        assert end in prev, (name, 'no walk from the entrance to the exit', ent, end)
        walk = [end]
        while prev[walk[-1]] is not None:
            walk.append(prev[walk[-1]])
        walk = walk[::-1]
        h, w = len(rows), len(rows[0])

        def openness(t):
            return sum(rows[y][x] == '.' for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w)
        spots = []
        for i in range(count):
            t = walk[round((i + 1) * (len(walk) - 1) / (count + 1))]
            near = [(x, y) for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w and rows[y][x] == '.' and (x, y) in prev and (x, y) not in spots and (x, y) not in (ent, end)]
            spots.append(max(near, key=lambda n: openness(n) * 2 - abs(n[0] - t[0]) - abs(n[1] - t[1])))
        img = Image.open(prefix + '.png')
        grass = j['grass']
        if name in CROP or box:
            tiles = list(prev)
            x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(w - 1, max(t[0] for t in tiles) + MARGIN['side'])
            y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(h - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
            if box:
                x0, y0, x1, y1 = box
            rows, grass = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]], [r[x0:x1 + 1] for r in grass[y0:y1 + 1]]
            shift = lambda t: (t[0] - x0, t[1] - y0)
            ent, end, spots = shift(ent), shift(end), [shift(s) for s in spots]
            links = [(shift(a), shift(b)) for a, b in links]
            img = img.crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE))
        img.save(os.path.join(PUBLIC, name + '.png'))
        pv = img.convert('RGB'); d = ImageDraw.Draw(pv)
        for k, (x, y) in enumerate([ent] + spots + [end]):
            col = (0, 255, 0) if k == 0 else (255, 0, 255) if k == len(spots) + 1 else (255, 0, 0)
            d.ellipse([x * 16 + 1, y * 16 + 1, x * 16 + 15, y * 16 + 15], outline=col, width=2)
            d.text((x * 16 + 16, y * 16), 'IN' if k == 0 else 'OUT' if k == len(spots) + 1 else str(k), fill=(255, 255, 255))
        pv.save(prefix + '-preview.png')
        spots_ = '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in spots)
        walk_ = '\n'.join(f"    '{r}'," for r in rows)
        grass_ = ('\n  grass: [' + ''.join(f"\n    '{r}'," for r in grass) + '\n  ],') if any('g' in r for r in grass) else ''
        links_ = ('\n  links: [' + ', '.join(f'[{{ x: {a[0]}, y: {a[1]} }}, {{ x: {b[0]}, y: {b[1]} }}]' for a, b in links) + '],') if links else ''
        out.append(f"""
/** {title}: {what}. Spots along the walk from its entrance to its exit, picked by the generator. */
export const {const}: Route = {{
  flow: '{flow}',
  sprites: 'dp',
  entrance: {{ x: {ent[0]}, y: {ent[1]} }},
  exit: {{ x: {end[0]}, y: {end[1]} }},{links_}
  name: '{title}',
  image: '/routes/{name}.png',
  width: {len(rows[0]) * TILE},
  height: {len(rows) * TILE},
  spots: [
{spots_}
  ],
  walkable: [
{walk_}
  ],{grass_}
}};
""")
        print(name, 'entrance', ent, 'exit', end, 'spots', spots, 'size', len(rows[0]), 'x', len(rows))
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'previews in', work)


if __name__ == '__main__':
    main()
