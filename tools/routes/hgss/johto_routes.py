"""Makes every Johto gym run's map and writes packages/campaign/src/johto-routes.ts, copying the images to
apps/web/public/routes/:

- the real routes (30, 32, 34, 35 and 45): each rendered by hgss_map.py, then 10 spots picked along the walk from its
  entrance (a tile in from the edge the run starts at) to its far end (the walkable tile furthest the way its encounters
  go), evenly spaced, each nudged onto the most open tile near it;
- the made-up ones (40, 42 and 44), by generate_johto.py, which places their spots itself.

Usage: python johto_routes.py [--apicula <apicula.exe>] [--cache <dir>] [--work <dir>]
(--work: where the renders go, a temporary directory by default; each real route also gets a <name>-preview.png there
with its spots ringed and numbered.) Needs numpy and Pillow, and apicula."""
import json, os, shutil, subprocess, sys, tempfile
from collections import deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import generate_johto as gen

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes')
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'johto-routes.ts')

# The real routes: their map, the edge the run starts at, the way its encounters go, its constant, name and comment.
REAL = {
    'route30': ('MAP_ROUTE_30', 'bottom', 'up', 'ROUTE_30', 'Route 30', 'Cherrygrove City (south) up to Route 31 (north), for the Violet City run (agreed with the user)', 'south end'),
    'route32': ('MAP_ROUTE_32', 'top', 'down', 'ROUTE_32', 'Route 32', 'Violet City (north) to Union Cave (south), for the Azalea Town run', 'north end'),
    'route34': ('MAP_ROUTE_34', 'bottom', 'up', 'ROUTE_34', 'Route 34', 'Ilex Forest (south) to Goldenrod City (north), for the Goldenrod City run', 'south end'),
    'route35': ('MAP_ROUTE_35', 'bottom', 'up', 'ROUTE_35', 'Route 35', 'Goldenrod City (south) to the National Park (north), for the Ecruteak City run', 'south end'),
    'route45': ('MAP_ROUTE_45', 'top', 'down', 'ROUTE_45', 'Route 45', 'Blackthorn City (north) down to Route 46 (south), for the Blackthorn City run (agreed with the user: top to bottom, its ledges jumped going down only, `v`)', 'north end'),
}
# The made-up routes: their constant, name, flow, comment and any more fields.
MADE_UP = {
    'route40': ('ROUTE_40', 'Route 40', 'down', """ * Route 40, made up (agreed with the user), for the Cianwood City run: surfed from Olivine's beach at the top (the real
 * route's beach chunk) down a sea lane between two columns of rocks near the edges, with sandbars of random sizes for
 * non-battle encounters to stand on (surfed routes' spots by land offer only those, out at sea only battles), and a
 * beach across the south end; its trainers Swimmers, as on Route 20. The band sloping into the sea round the sand, and
 * the row above the sand (drawn half a tile up), are land, as they're drawn (the user's).""", "\n  travel: 'surf',\n  trainers: { names: SWIMMERS, share: 1 },"),
    'route42': ('ROUTE_42', 'Route 42', 'right', """ * Route 42, made up as a cave (agreed with the user), for the Olivine City run, in two maps (the user's): this, from
 * the left edge to the right through three chambers of Mt. Mortar's rock (Mt. Moon's crystal rocks against the walls),
 * the middle one with a small waterfall (HGSS's dsm_fal1) falling from a pool up a level, in a small floor of its own,
 * into a pool whose stream is crossed by a bridge (Route 48's: the user's); then up the third chamber's ladder (67,23, HGSS's own), its `exit`,
 * faded from to the fourth chamber (ROUTE_42_UPPER). The spots the user's: 1-8 here; spot 1's and 7's figures left and
 * right of it, then above, spot 2's and 4's left and right of it, then below; 66-67,20, 66,21-22 and 58,14 not
 * walkable (the user's).""", "\n  spotFlows: { 0: 'up', 1: 'down', 3: 'down', 6: 'up' },"),
    'route42_upper': ('ROUTE_42_UPPER', 'Route 42 (upper)', 'right', """ * Route 42's fourth chamber (the user's name), the second of its two maps: in at the hole the third chamber's ladder
 * comes up through (57,18, HGSS's ladder down in a lit pit copied from Mt. Moon's), with a pool, leaving by its right
 * edge (71,12); encounters 9 and 10 (the user's; spot 9's figures left and right of it, then below).""", "\n  spotFlows: { 0: 'down' },"),
    'route44': ('ROUTE_44', 'Route 44', 'up', """ * Route 44, made up as an ice cave (agreed with the user), for the Mahogany Town run, in two maps (the user's):
 * this, the lower area, from the bottom edge up through the Ice Path's rock and ice to its ladder (8,13, HGSS's own
 * ladder model, the user's), its `exit`, faded from to the upper area (ROUTE_44_UPPER). Its ice as Ice Path B2F's (the
 * user's). A raised area two tiers up across its top and down its right side, encounters 4 and 5 on it, its cliffs two
 * tiles deep, its stairs down at 27-28,23-24 and 15-16,15-16, and icy rocks big and small round it, as Ice Path's (the
 * user's; as are spot 5's figures, above and below it, then left).""", "\n  spotFlows: { 4: 'left' },"),
    'route44_upper': ('ROUTE_44_UPPER', 'Route 44 (upper)', 'up', """ * Route 44's upper area (the user's name), the second of its two maps: in at the hole the lower area's ladder
 * comes up through (21,21, HGSS's ladder down in Ice Path B2F's own pit, the ring round it in the Ice Path's colours:
 * the user's) on a raised area two tiers up (16-29,20-23, its cliffs two tiles deep), down its stairs at 28-29,23-24
 * and up through its rock and ice, leaving by the top edge (encounters 1-3 at 23,26, 11,22 and 10,16, spot 1's figures
 * above and below it, then left; icy rocks big and small: the user's).""", "\n  spotFlows: { 0: 'left' },"),
}
# The materials drawn over people walking under them, by route: Route 32's Magnet Train bridge (its girders and deck; not
# its pillars, which stand on the ground).
OVERHEAD = {
    'route32': ['overpass', 'lambert76'],
}
# Tiles the user says can't be walked on, though the map data has them walkable, by route.
USER_BLOCKED = {
    'route35': [(14, 56), (17, 53), (21, 43), (11, 29), (10, 21), (6, 51)],
    'route30': [(13, 86)],
    'route34': [(10, 20)],
    'route32': [
        (21, 44),
        (6, 74),
        (9, 107), (10, 107), (11, 107), (12, 107),
        (12, 121), (12, 122), (12, 123), (12, 124), (12, 125), (13, 125), (14, 125), (14, 126), (14, 127), (15, 127), (16, 127),
        (18, 131), (19, 131),
        (12, 143), (13, 143), (15, 143), (16, 143),
        (12, 146), (13, 146), (14, 146), (16, 146), (17, 146),
    ],
}
# Tiles the user says are tall grass, though the map data doesn't, by route.
USER_GRASS = {
    'route32': [(9, 114), (10, 114), (8, 115), (9, 115), (10, 115), (8, 116)],
}
# Tiles the user says aren't tall grass, though the map data has them as grass, by route.
USER_NOT_GRASS = {
    'route32': [(8, 105), (8, 106), (8, 107)],
}
# Tiles the user says can be walked on, though the map data has them blocked, by route: rectangles (left, top, right, bottom).
USER_OPEN = {
    'route35': [(4, 60, 9, 63)],
}
# The user's entrances, in place of the generator's.
USER_ENTRANCES = {
    'route35': (6, 63),
}
# The user's exits: where the player walks after the last spot before fading into the gym (Route 32's Union Cave mouth).
USER_EXITS = {
    'route32': (14, 143),
    'route35': (26, 0),
}
# The user's spots whose figures stand another way (`spotFlows`): by encounter number (from 1), the way the encounters go
# there (Route 35's 3rd, 6th and 9th: 'right', 'left' and 'right', the way the walk goes on, their figures above and below them).
USER_SPOT_FLOWS = {
    'route35': {3: 'right', 6: 'left', 9: 'right'},
}
# The user's spots on the real routes, in place of the generator's: by encounter number (from 1).
USER_SPOTS = {
    'route32': {5: (5, 74)},
    'route35': {1: (6, 57), 2: (7, 51), 3: (17, 49), 4: (22, 43), 5: (22, 35), 6: (17, 31), 7: (10, 29), 8: (11, 21), 9: (16, 12), 10: (26, 11)},
}
STEP = {'left': (-1, 0), 'right': (1, 0), 'up': (0, -1), 'down': (0, 1)}
HEAD = """// The Johto gym runs' maps, from HeartGold/SoulSilver (the pret/pokeheartgold decompilation; tools/routes/hgss/): its
// maps are 3D, so hgss_map.py converts each one's terrain chunks and buildings with apicula and draws them looking down,
// slightly tilted (agreed with the user), 16 px to a tile, with which tiles can be walked on from the map data (ledges
// not, but for Route 45's, jumped going down: `v`; people and item balls aren't in it). Every map uses HGSS's overworld
// sprites (`sprites: 'hgss'`, 32x32). Routes 40, 42 and 44 are made up (generate_johto.py), agreed with the user.
// Written by tools/routes/hgss/johto_routes.py.
import { SWIMMERS } from './kanto-routes.js';
import type { Route } from './routes.js';
"""


def moves(rows, x, y):
    # A step to a walkable tile; ledges ('v') only going down.
    for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        n = (x + dx, y + dy)
        if not (0 <= n[1] < len(rows) and 0 <= n[0] < len(rows[0])):
            continue
        c, cur = rows[n[1]][n[0]], rows[y][x]
        if (c == '.' or (c == 'v' and dy == 1)) and not (cur == 'v' and dy != 1):
            yield n


def bfs(rows, start):
    prev = {start: None}; q = deque([start])
    while q:
        t = q.popleft()
        for n in moves(rows, *t):
            if n not in prev:
                prev[n] = t; q.append(n)
    return prev


def pick(name, rows, edge, flow, image, preview):
    """The entrance and 10 spots of a real route, as described above, and a preview of them."""
    # Ledges are walls, but for Route 45's, jumped going down.
    rows = [r if name == 'route45' else r.replace('v', '#') for r in rows]
    rows = [''.join('#' if c in '<>^' else c for c in r) for r in rows]
    h, w = len(rows), len(rows[0])
    # The entrance: in the largest walkable area (ignoring ledges' one-way rule), its tile nearest the start edge, the
    # one most central.
    seen, best = set(), set()
    for y0 in range(h):
        for x0 in range(w):
            if rows[y0][x0] != '.' or (x0, y0) in seen:
                continue
            comp, q = {(x0, y0)}, deque([(x0, y0)])
            while q:
                x, y = q.popleft()
                for ddx, ddy in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                    n = (x + ddx, y + ddy)
                    if 0 <= n[1] < h and 0 <= n[0] < w and rows[n[1]][n[0]] in '.v' and n not in comp:
                        comp.add(n); q.append(n)
            seen |= comp
            if len(comp) > len(best):
                best = comp
    toward = {'bottom': lambda t: t[1], 'top': lambda t: -t[1], 'left': lambda t: -t[0], 'right': lambda t: t[0]}[edge]
    cands = [t for t in best if rows[t[1]][t[0]] == '.']
    far = max(toward(t) for t in cands)
    ent = min((t for t in cands if toward(t) == far), key=lambda t: abs(t[0] - w / 2) + abs(t[1] - h / 2))
    ent = USER_ENTRANCES.get(name, ent)
    prev = bfs(rows, ent)
    dx, dy = STEP[flow]
    end = max(prev, key=lambda t: (t[0] * dx + t[1] * dy, -abs(t[0] - w / 2) - abs(t[1] - h / 2)))
    walk = [end]
    while prev[walk[-1]] is not None:
        walk.append(prev[walk[-1]])
    walk = walk[::-1]
    def openness(t):
        return sum(rows[y][x] == '.' for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w)
    spots = []
    for i in range(10):
        t = walk[round((i + 1) * (len(walk) - 1) / 10)]
        near = [(x, y) for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w and rows[y][x] == '.' and (x, y) in prev and (x, y) not in spots and (x, y) != ent]
        spots.append(max(near, key=lambda n: openness(n) * 2 - abs(n[0] - t[0]) - abs(n[1] - t[1])))
    for n, t in USER_SPOTS.get(name, {}).items():
        assert rows[t[1]][t[0]] == '.', (name, 'user spot not walkable', n, t)
        spots[n - 1] = t
    stops = [ent] + spots
    gaps = [(a, b) for a, b in zip(stops, stops[1:]) if b not in bfs(rows, a)]
    assert not gaps, (name, 'no walk', gaps)
    im = Image.open(image).convert('RGB'); d = ImageDraw.Draw(im)
    for k, (x, y) in enumerate(stops):
        d.ellipse([x * 16 + 1, y * 16 + 1, x * 16 + 15, y * 16 + 15], outline=(255, 0, 0) if k else (0, 255, 0), width=2)
        d.text((x * 16 + 16, y * 16), str(k) if k else 'IN', fill=(255, 255, 255))
    im.save(preview)
    # An entrance on the map's very edge moves a tile in from it, as the Kanto routes' do.
    ex, ey = ent
    if name not in USER_ENTRANCES and (ey in (0, h - 1) or ex in (0, w - 1)):
        ddx, ddy = (0, -1) if ey == h - 1 else (0, 1) if ey == 0 else (-1, 0) if ex == w - 1 else (1, 0)
        if rows[ey + ddy][ex + ddx] == '.':
            ex, ey = ex + ddx, ey + ddy
    return rows, (ex, ey), spots


def route_ts(doc, const, fields, name, image, w, h, spots, rows, grass=None, ice=None):
    spots_ = '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in spots)
    walk = '\n'.join(f"    '{r}'," for r in rows)
    # The tall grass, on a map with any.
    grass_ = ''.join(f"\n    '{r}'," for r in grass) if grass and any('g' in r for r in grass) else ''
    grass_ = f'\n  grass: [{grass_}\n  ],' if grass_ else ''
    # The ice, on a map with any.
    grass_ += ('\n  ice: [' + ''.join(f"\n    '{r}'," for r in ice) + '\n  ],') if ice and any('i' in r for r in ice) else ''
    return f"""
{doc}
export const {const}: Route = {{
{fields}
  name: '{name}',
  image: '/routes/{image}',
  width: {w * 16},
  height: {h * 16},
  spots: [
{spots_}
  ],
  walkable: [
{walk}
  ],{grass_}
}};
"""


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokeheartgold'))
    work = opt('--work', None) or tempfile.mkdtemp(prefix='johto_routes_')
    os.makedirs(work, exist_ok=True)
    out = []
    for name, (map_const, edge, flow, const, title, what, start) in REAL.items():
        prefix = os.path.join(work, name)
        overhead = ['--overhead', ','.join(OVERHEAD[name])] if name in OVERHEAD else []
        subprocess.run([sys.executable, os.path.join(HERE, 'hgss_map.py'), prefix, map_const, *overhead, '--apicula', apicula, '--cache', cache], check=True)
        j = json.load(open(prefix + '.json'))
        for x, y in USER_BLOCKED.get(name, []):
            j['rows'][y] = j['rows'][y][:x] + '#' + j['rows'][y][x + 1:]
        for left, top, right, bottom in USER_OPEN.get(name, []):
            for y in range(top, bottom + 1):
                j['rows'][y] = j['rows'][y][:left] + '.' * (right - left + 1) + j['rows'][y][right + 1:]
        for x, y in USER_GRASS.get(name, []):
            j['grass'][y] = j['grass'][y][:x] + 'g' + j['grass'][y][x + 1:]
        for x, y in USER_NOT_GRASS.get(name, []):
            j['grass'][y] = j['grass'][y][:x] + '.' + j['grass'][y][x + 1:]
        rows, (ex, ey), spots = pick(name, j['rows'], edge, flow, prefix + '.png', prefix + '-preview.png')
        shutil.copy(prefix + '.png', os.path.join(PUBLIC, name + '.png'))
        fields = f"  flow: '{flow}',\n  sprites: 'hgss',\n  entrance: {{ x: {ex}, y: {ey} }},"
        if name in USER_EXITS:
            x, y = USER_EXITS[name]
            assert rows[y][x] == '.', (name, 'user exit not walkable')
            fields += f'\n  exit: {{ x: {x}, y: {y} }},'
        if name in USER_SPOT_FLOWS:
            fields += '\n  spotFlows: { ' + ', '.join(f"{n - 1}: '{f}'" for n, f in USER_SPOT_FLOWS[name].items()) + ' },'
        if overhead:
            shutil.copy(prefix + '-overhead.png', os.path.join(PUBLIC, name + '_overhead.png'))
            fields += f"\n  overhead: '/routes/{name}_overhead.png',"
        users = f', entrance at {USER_ENTRANCES[name][0]},{USER_ENTRANCES[name][1]}' if name in USER_ENTRANCES else ''
        users += ''.join(f', spot {n} at {x},{y}' for n, (x, y) in USER_SPOTS.get(name, {}).items())
        blocked = USER_BLOCKED.get(name, [])
        users += f", {' '.join(f'{x},{y}' for x, y in blocked)} not walkable" if blocked else ''
        users += ''.join(f', {l}-{r},{t}-{b} walkable' for l, t, r, b in USER_OPEN.get(name, []))
        grassy = USER_GRASS.get(name, [])
        users += f", {' '.join(f'{x},{y}' for x, y in grassy)} tall grass" if grassy else ''
        bare = USER_NOT_GRASS.get(name, [])
        users += f", {' '.join(f'{x},{y}' for x, y in bare)} not grass" if bare else ''
        users += ''.join(f", spot {n}'s figures {'above and below' if f in ('left', 'right') else 'left and right of'} it" for n, f in USER_SPOT_FLOWS.get(name, {}).items())
        users += f', leaving by {USER_EXITS[name][0]},{USER_EXITS[name][1]} for the gym' if name in USER_EXITS else ''
        users = f' (the user\'s{users[1:]})' if users else ''
        out.append(route_ts(f'/** {title}: {what}. Spots along the walk from the {start}, picked by the generator{users}. */', const, fields, title, name + '.png', len(rows[0]), len(rows), spots, rows, j.get('grass')))
        print(name, 'entrance', (ex, ey), 'spots', spots)
    a = gen.Assets(apicula, cache)
    gen.route40(a, work); gen.route42(a, work); gen.route44(a, work)
    for name, (const, title, flow, doc, extra) in MADE_UP.items():
        j = json.load(open(os.path.join(work, name + '.json')))
        shutil.copy(os.path.join(work, name + '.png'), os.path.join(PUBLIC, name + '.png'))
        ex, ey = j['entrance']
        lines = [f"  flow: '{flow}',", "  sprites: 'hgss',", f'  entrance: {{ x: {ex}, y: {ey} }},']
        if j.get('exit'):
            lines.append(f"  exit: {{ x: {j['exit'][0]}, y: {j['exit'][1]} }},")
        if j['links']:
            lines.append('  links: [' + ', '.join(f'[{{ x: {p[0]}, y: {p[1]} }}, {{ x: {q[0]}, y: {q[1]} }}]' for p, q in j['links']) + '],')
        out.append(route_ts(f'/**\n{doc}\n */', const, '\n'.join(lines) + extra, title, name + '.png', j['width'], j['height'], j['spots'], j['rows'], ice=j.get('ice')))
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'renders in', work)


if __name__ == '__main__':
    main()
