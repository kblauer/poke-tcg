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
 * beach across the south end; its trainers Swimmers, as on Route 20.""", "\n  travel: 'surf',\n  trainers: { names: SWIMMERS, share: 1 },"),
    'route42': ('ROUTE_42', 'Route 42', 'right', """ * Route 42, made up as a cave (agreed with the user), for the Olivine City run: from the left edge to the right through
 * three chambers of Mt. Mortar's rock (Mt. Moon's crystal rocks against the walls), the middle one with a small
 * waterfall (HGSS's dsm_fal1) falling from a pool up a level, in a small floor of its own, into a pool whose stream is
 * crossed by a bridge; leaving by the right edge.""", ''),
    'route44': ('ROUTE_44', 'Route 44', 'up', """ * Route 44, made up as an ice cave (agreed with the user), for the Mahogany Town run: from the bottom edge up through
 * two areas of the Ice Path's rock and ice, the lower one's ladder climbing to the upper one (a fading link, from the
 * foot of the ladder to beside its hole above); leaving by the top edge.""", ''),
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
    if ey in (0, h - 1) or ex in (0, w - 1):
        ddx, ddy = (0, -1) if ey == h - 1 else (0, 1) if ey == 0 else (-1, 0) if ex == w - 1 else (1, 0)
        if rows[ey + ddy][ex + ddx] == '.':
            ex, ey = ex + ddx, ey + ddy
    return rows, (ex, ey), spots


def route_ts(doc, const, fields, name, image, w, h, spots, rows):
    spots_ = '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in spots)
    walk = '\n'.join(f"    '{r}'," for r in rows)
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
  ],
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
        subprocess.run([sys.executable, os.path.join(HERE, 'hgss_map.py'), prefix, map_const, '--apicula', apicula, '--cache', cache], check=True)
        j = json.load(open(prefix + '.json'))
        rows, (ex, ey), spots = pick(name, j['rows'], edge, flow, prefix + '.png', prefix + '-preview.png')
        shutil.copy(prefix + '.png', os.path.join(PUBLIC, name + '.png'))
        fields = f"  flow: '{flow}',\n  sprites: 'hgss',\n  entrance: {{ x: {ex}, y: {ey} }},"
        out.append(route_ts(f'/** {title}: {what}. Spots along the walk from the {start}, picked by the generator. */', const, fields, title, name + '.png', len(rows[0]), len(rows), spots, rows))
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
        out.append(route_ts(f'/**\n{doc}\n */', const, '\n'.join(lines) + extra, title, name + '.png', j['width'], j['height'], j['spots'], j['rows']))
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'renders in', work)


if __name__ == '__main__':
    main()
