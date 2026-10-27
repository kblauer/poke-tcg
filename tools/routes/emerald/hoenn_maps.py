"""Makes the Hoenn (Generation 3) runs' maps from Pokémon Emerald, as the Kanto ones come from FireRed and the Johto ones
from HeartGold/SoulSilver, and writes packages/campaign/src/hoenn-routes.ts and hoenn-gyms.ts, copying the images to
apps/web/public/routes/:

- each gym run's map (ROUTES), drawn by emerald_map.py, with 10 spots picked along the walk from its entrance (a tile in
  from the edge the run starts at) to its far end (the walkable tile furthest the way its encounters go, or the door of
  the gym where the map has it: Sootopolis's), evenly spaced, each nudged onto the most open tile near it; on a surfed map
  (its water walkable), spots out at sea (no land within 3 tiles: only battles there) but every third, by the shore (only
  non-battle encounters, whose people stand on land), as on the other surf routes, but for a map whose spots on land are
  ordinary (`land_spots`: Sootopolis's streets); ledges are walls (`ledges` would make those jumped going down, 'v', walkable);
- each gym's interior (GYMS), from the map's events: the door the player comes in at (the warp out to the town, walkable
  here), the Gym Trainer where the gym's trainer nearest halfway in along the walk to the leader stands (the player beside
  them, on the side they face), the leader in their place (the player below them), the Gym Guide; doors within the map
  (Petalburg Gym's rooms) join their tiles as `links` (a fading walk);
- the Hoenn Gym Challenge and Champion runs' rooms (as Kanto's and Johto's): each gym's leader-only version (the player
  coming in 5 tiles from the leader, south where it can), the Elite Four's and the Champion's rooms at the Pokémon League,
  and Lavaridge Town's Pokémon Center (the fourth gym's), with HOENN_BOSS_ROOMS.

Usage: python hoenn_maps.py <pokeemerald checkout> [--work <dir>]
(--work: where the renders and previews go, a temporary directory by default.) Needs Pillow. Prints the gyms' trainers
(for hoenn-bosses.ts) and any walk it can't find (a gym puzzle the map data doesn't show: fixes come from the user, as for
Kanto and Johto)."""
import json, os, re, sys, tempfile
from collections import deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import emerald_map

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes')
ROUTES_OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'hoenn-routes.ts')
GYMS_OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'hoenn-gyms.ts')
TILE = 16
STEP = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}

# Each gym run's map: its Emerald map, the edge the run starts at and the way its encounters go, its constant, name and
# comment; `surf` (its water walkable, its trainers Swimmers), `land_spots` (its spots on land ordinary ones: Sootopolis's
# streets), `bike` (ridden), `ledges` (ledges jumped going down), `end_warp` (the walk ends at the door to that map).
ROUTES = {
    'rustboro': dict(map='PetalburgWoods', edge='bottom', flow='up', const='PETALBURG_WOODS', title='Petalburg Woods', image='petalburg_woods.png',
                     what='from Route 104 at the south up through the woods towards Rustboro City, for the Rustboro City run'),
    'dewford': dict(map='Route106', edge='left', flow='right', const='ROUTE_106', title='Route 106', image='route106.png', surf=True, land_spots=True,
                    what="surfed from Route 105 in the west to Dewford Town's beach in the east, for the Dewford Town run; its trainers Swimmers, but for its last 2 spots, on the beach"),
    'mauville': dict(map='Route110', edge='bottom', flow='up', const='ROUTE_110', title='Route 110', image='route110.png', bike=True,
                     what="from Slateport City at the south up to Mauville City along the Seaside Cycling Road, on a bike (walking twice as fast), for the Mauville City run; most of its trainers the Cycling Road's Triathletes"),
    'lavaridge': dict(map='JaggedPass', edge='top', flow='down', const='JAGGED_PASS', title='Jagged Pass', image='jagged_pass.png',
                      what="from Mt. Chimney at the top down to Route 112 towards Lavaridge Town (its ledges, hopped going north, walls on the way down), for the Lavaridge Town run"),
    'petalburg': dict(map='Route102', edge='right', flow='left', const='ROUTE_102', title='Route 102', image='route102.png',
                      what='from Oldale Town in the east to Petalburg City in the west, for the Petalburg City run'),
    'fortree': dict(map='Route119', edge='bottom', flow='up', const='ROUTE_119', title='Route 119', image='route119.png',
                    what='from Route 118 at the south up along the river to Fortree City, for the Fortree City run'),
    'mossdeep': dict(map='Route124', edge='left', flow='right', const='ROUTE_124', title='Route 124', image='route124.png', surf=True,
                     what='surfed from Lilycove City in the west towards Mossdeep City in the east, for the Mossdeep City run; its trainers Swimmers'),
    'sootopolis': dict(map='SootopolisCity', edge='top', flow='down', const='SOOTOPOLIS_CITY', title='Sootopolis City', image='sootopolis_city.png', surf=True,
                       end_warp='MAP_SOOTOPOLIS_CITY_GYM_1F', land_spots=True,
                       what="inside the crater: from the top (the way to the Cave of Origin) down through the city to its lake, then surfing to the gym's island, for the Sootopolis City run; its trainers Swimmers"),
}
# Each gym: its leader's map (and the gym's other maps, for its trainers), the warp out to the town, its constant, name
# and the leader's sprite (with a second one beside them: Liza with Tate).
GYMS = {
    'rustboro': ('RustboroCity_Gym', [], 'MAP_RUSTBORO_CITY', 'RUSTBORO_GYM', 'Rustboro Gym', 'OBJ_EVENT_GFX_ROXANNE'),
    'dewford': ('DewfordTown_Gym', [], 'MAP_DEWFORD_TOWN', 'DEWFORD_GYM', 'Dewford Gym', 'OBJ_EVENT_GFX_BRAWLY'),
    'mauville': ('MauvilleCity_Gym', [], 'MAP_MAUVILLE_CITY', 'MAUVILLE_GYM', 'Mauville Gym', 'OBJ_EVENT_GFX_WATTSON'),
    'lavaridge': ('LavaridgeTown_Gym_1F', ['LavaridgeTown_Gym_B1F'], 'MAP_LAVARIDGE_TOWN', 'LAVARIDGE_GYM', 'Lavaridge Gym', 'OBJ_EVENT_GFX_FLANNERY'),
    'petalburg': ('PetalburgCity_Gym', [], 'MAP_PETALBURG_CITY', 'PETALBURG_GYM', 'Petalburg Gym', 'OBJ_EVENT_GFX_NORMAN'),
    'fortree': ('FortreeCity_Gym', [], 'MAP_FORTREE_CITY', 'FORTREE_GYM', 'Fortree Gym', 'OBJ_EVENT_GFX_WINONA'),
    'mossdeep': ('MossdeepCity_Gym', [], 'MAP_MOSSDEEP_CITY', 'MOSSDEEP_GYM', 'Mossdeep Gym', ('OBJ_EVENT_GFX_TATE', 'OBJ_EVENT_GFX_LIZA')),
    'sootopolis': ('SootopolisCity_Gym_1F', ['SootopolisCity_Gym_B1F'], 'MAP_SOOTOPOLIS_CITY', 'SOOTOPOLIS_GYM', 'Sootopolis Gym', 'OBJ_EVENT_GFX_JUAN'),
}
LEADERS = {'rustboro': 'roxanne', 'dewford': 'brawly', 'mauville': 'wattson', 'lavaridge': 'flannery', 'petalburg': 'norman', 'fortree': 'winona', 'mossdeep': 'tate-liza', 'sootopolis': 'juan'}
# The Pokémon League's rooms (their map, the boss's sprite, boss id, constant, name) and the Pokémon Center.
LEAGUE = {
    'sidney': ('EverGrandeCity_SidneysRoom', 'OBJ_EVENT_GFX_SIDNEY', 'sidney', 'SIDNEYS_ROOM', "Sidney's Room"),
    'phoebe': ('EverGrandeCity_PhoebesRoom', 'OBJ_EVENT_GFX_PHOEBE', 'phoebe', 'PHOEBES_ROOM', "Phoebe's Room"),
    'glacia': ('EverGrandeCity_GlaciasRoom', 'OBJ_EVENT_GFX_GLACIA', 'glacia', 'GLACIAS_ROOM', "Glacia's Room"),
    'drake': ('EverGrandeCity_DrakesRoom', 'OBJ_EVENT_GFX_DRAKE', 'drake', 'DRAKES_ROOM', "Drake's Room"),
    'wallace': ('EverGrandeCity_ChampionsRoom', 'OBJ_EVENT_GFX_WALLACE', 'wallace', 'CHAMPIONS_ROOM', "Champion's Room"),
}
CENTER = ('LavaridgeTown_PokemonCenter_1F', 'MAP_LAVARIDGE_TOWN', 'OBJ_EVENT_GFX_NURSE')
# Gym puzzles the map data doesn't show solved (in the map's tiles): Mauville's electric barriers across the middle (4,7
# and 5,7), open as its switches leave them. Fixes from the user, as for Kanto and Johto, go here too: tiles to make
# walkable, links, Gym Trainer places.
USER_WALKABLE = {'mauville': [(4, 7), (5, 7)]}
USER_LINKS = {}
USER_GYM_TRAINER = {}
# The routes' fixes from the user: rectangles of tiles to make walkable (x0, y0, x1, y1, corners included), the entrance,
# the exit (walked to from the last spot before the fade to the gym) and the spots, in place of the picked ones.
USER_ROUTES = {
    'rustboro': dict(walkable=[(36, 38, 37, 43), (14, 0, 15, 5)], entrance=(36, 41), exit=(14, 2),
                     spots=[(35, 35), (24, 34), (16, 35), (7, 29), (12, 25), (22, 25), (23, 17), (12, 18), (6, 10), (15, 9)]),
    'dewford': dict(entrance=(13, 0), exit=(68, 19),
                    spots=[(15, 5), (22, 7), (27, 9), (32, 10), (38, 8), (46, 9), (52, 8), (58, 8), (62, 15), (66, 17)]),
}
# The other routes' entrances and spots as picked while the map's people still blocked their tiles, kept so that change
# (they don't any more) leaves them where they were.
KEPT_PICKS = {
    'mauville': ((24, 95), [(28, 85), (26, 79), (18, 69), (18, 55), (13, 43), (5, 39), (5, 28), (6, 14), (12, 8), (15, 2)]),
    'lavaridge': ((14, 6), [(18, 9), (19, 12), (20, 19), (19, 22), (21, 30), (16, 29), (11, 31), (12, 35), (15, 36), (15, 39)]),
    'petalburg': ((48, 10), [(45, 11), (40, 13), (37, 15), (29, 15), (23, 10), (20, 9), (13, 4), (10, 4), (5, 7), (2, 7)]),
    'fortree': ((20, 138), [(24, 124), (24, 112), (29, 100), (27, 86), (15, 84), (10, 73), (14, 61), (7, 51), (9, 39), (12, 31)]),
    'mossdeep': ((1, 28), [(10, 30), (14, 32), (18, 37), (24, 41), (35, 43), (42, 44), (50, 45), (61, 48), (69, 43), (78, 46)]),
    'sootopolis': ((45, 7), [(48, 13), (49, 16), (45, 20), (45, 24), (48, 28), (49, 31), (42, 39), (37, 40), (36, 35), (31, 34)]),
}


# --- Walking ---

def walkable(c, surf):
    return c == '.' or (surf and c == '~')


def moves(rows, x, y, surf, links=()):
    """Steps to a walkable tile (a ledge 'v' only going down), and through `links` (pairs of tiles, both ways)."""
    h, w = len(rows), len(rows[0])
    for dx, dy in STEP.values():
        n = (x + dx, y + dy)
        if not (0 <= n[0] < w and 0 <= n[1] < h):
            continue
        c, cur = rows[n[1]][n[0]], rows[y][x]
        if (walkable(c, surf) or (c == 'v' and dy == 1)) and not (cur == 'v' and dy != 1):
            yield n
    for a, b in links:
        if a == (x, y):
            yield b
        elif b == (x, y):
            yield a


def bfs(rows, start, surf=False, links=()):
    prev = {start: None}; q = deque([start])
    while q:
        t = q.popleft()
        for n in moves(rows, *t, surf, links):
            if n not in prev:
                prev[n] = t; q.append(n)
    return prev


def path(prev, end):
    p = [end]
    while prev[p[-1]] is not None:
        p.append(prev[p[-1]])
    return p[::-1]


def nearest_walkable(rows, t, toward=None, surf=False):
    h, w = len(rows), len(rows[0])
    if 0 <= t[1] < h and 0 <= t[0] < w and walkable(rows[t[1]][t[0]], surf):
        return t
    cands = [(x, y) for y in range(h) for x in range(w) if walkable(rows[y][x], surf)]
    return min(cands, key=lambda c: (abs(c[0] - t[0]) + abs(c[1] - t[1]), 0 if toward is None else -((c[0] - t[0]) * toward[0] + (c[1] - t[1]) * toward[1])))


def land_near(rows, x, y, r):
    h, w = len(rows), len(rows[0])
    return any(rows[y + dy][x + dx] == '.' for dy in range(-r, r + 1) for dx in range(-r, r + 1) if abs(dx) + abs(dy) <= r and 0 <= y + dy < h and 0 <= x + dx < w)


# --- Routes ---

def route_rows(info, cfg, user):
    """The map's rows as the route has them: ledges walls (but Jagged Pass's, jumped down), water only on a surfed map, and
    the user's walkable tiles."""
    rows = []
    for r in info['rows']:
        r = ''.join('#' if c in '<>^' or (c == 'v' and not cfg.get('ledges')) or (c == '~' and not cfg.get('surf')) else c for c in r)
        rows.append(list(r))
    for x0, y0, x1, y1 in user.get('walkable', []):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                rows[y][x] = '.'
    return [''.join(r) for r in rows]


def pick(name, rows, info, cfg):
    """The entrance, the 10 spots and the walk's end, as described above."""
    surf = bool(cfg.get('surf'))
    h, w = len(rows), len(rows[0])
    # The largest area walked across (ignoring the ledges' one-way rule).
    seen, best = set(), set()
    for y0 in range(h):
        for x0 in range(w):
            if not walkable(rows[y0][x0], surf) or (x0, y0) in seen:
                continue
            comp, q = {(x0, y0)}, deque([(x0, y0)])
            while q:
                x, y = q.popleft()
                for dx, dy in STEP.values():
                    n = (x + dx, y + dy)
                    if 0 <= n[1] < h and 0 <= n[0] < w and (walkable(rows[n[1]][n[0]], surf) or rows[n[1]][n[0]] == 'v') and n not in comp:
                        comp.add(n); q.append(n)
            seen |= comp
            if len(comp) > len(best):
                best = comp
    toward = {'bottom': lambda t: t[1], 'top': lambda t: -t[1], 'left': lambda t: -t[0], 'right': lambda t: t[0]}[cfg['edge']]
    cands = [t for t in best if walkable(rows[t[1]][t[0]], surf)]
    far = max(toward(t) for t in cands)
    ent = min((t for t in cands if toward(t) == far), key=lambda t: abs(t[0] - w / 2) + abs(t[1] - h / 2))
    prev = bfs(rows, ent, surf)
    if cfg.get('end_warp'):
        door = next((wp['x'], wp['y']) for wp in info['events']['warp_events'] if wp['dest_map'] == cfg['end_warp'])
        end = nearest_walkable(rows, (door[0], door[1] + 1), (0, 1), surf)
    else:
        dx, dy = STEP[cfg['flow']]
        end = max(prev, key=lambda t: (t[0] * dx + t[1] * dy, -abs(t[0] - w / 2) - abs(t[1] - h / 2)))
    walk = path(prev, end)

    def openness(t):
        return sum(walkable(rows[y][x], surf) for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w)
    spots = []
    for i in range(10):
        t = walk[round((i + 1) * (len(walk) - 1) / 10)]
        near = [(x, y) for y in range(t[1] - 3, t[1] + 4) for x in range(t[0] - 3, t[0] + 4) if 0 <= y < h and 0 <= x < w and walkable(rows[y][x], surf) and (x, y) in prev and (x, y) not in spots and (x, y) != ent]
        # At least 3 tiles from the other spots, where the walk allows.
        near = [n for n in near if all(max(abs(n[0] - s[0]), abs(n[1] - s[1])) >= 3 for s in spots)] or near
        if i == 9 and cfg.get('end_warp'):
            spots.append(end)
            continue
        if surf:
            # Out at sea (only battles there), but every third by the shore (only non-battle encounters), when there's either.
            shore = i % 3 == 2
            kind = [n for n in near if (rows[n[1]][n[0]] == '~' and land_near(rows, *n, 2)) if shore] or [n for n in near if not shore and rows[n[1]][n[0]] == '~' and not land_near(rows, *n, 3)]
            near = kind or near
        spots.append(max(near, key=lambda n: openness(n) * 2 - abs(n[0] - t[0]) - abs(n[1] - t[1])))
    stops = [ent] + spots
    gaps = [(a, b) for a, b in zip(stops, stops[1:]) if b not in bfs(rows, a, surf)]
    assert not gaps, (name, 'no walk', gaps)
    # An entrance on the map's very edge moves a tile in from it, as the Kanto routes' do.
    ex, ey = ent
    if ey in (0, h - 1) or ex in (0, w - 1):
        ddx, ddy = (0, -1) if ey == h - 1 else (0, 1) if ey == 0 else (-1, 0) if ex == w - 1 else (1, 0)
        if walkable(rows[ey + ddy][ex + ddx], surf):
            ex, ey = ex + ddx, ey + ddy
    return (ex, ey), spots


def preview(img, marks, out):
    pv = img.convert('RGB'); d = ImageDraw.Draw(pv)
    for label, (x, y), col in marks:
        d.rectangle([x * TILE, y * TILE, x * TILE + 15, y * TILE + 15], outline=col, width=2)
        d.text((x * TILE + 17, y * TILE), label, fill=col)
    pv.save(out)


def pts(ps):
    return '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in ps)


def rows_ts(rows):
    return '\n'.join(f"    '{r}'," for r in rows)


def route_ts(cfg, ent, spots, rows, grass, long_grass, exit=None, picked_by_user=False):
    surf = cfg.get('surf')
    exit_ts = f'\n  exit: {{ x: {exit[0]}, y: {exit[1]} }},' if exit else ''
    extra = "\n  travel: 'surf',\n  trainers: { names: SWIMMERS, share: 1 }," if surf else ''
    if cfg.get('land_spots'):
        extra += '\n  landSpots: true,'
    if cfg.get('bike'):
        extra = "\n  travel: 'bike',\n  trainers: { names: TRIATHLETES, share: 0.8 },"
    grass_ts = ''
    if any(any(r) for r in grass):
        # Tall grass 'g', long grass (Route 119's very tall grass) 'L'.
        grass_ts = '\n  grass: [\n' + '\n'.join("    '" + ''.join('L' if lg else 'g' if g else '.' for g, lg in zip(r, lr)) + "'," for r, lr in zip(grass, long_grass)) + '\n  ],'
    return f"""
/** {cfg['title']}: {cfg['what']}. Spots along the walk, {'from the user' if picked_by_user else 'picked by tools/routes/emerald/hoenn_maps.py'}. */
export const {cfg['const']}: Route = {{
  flow: '{cfg['flow']}',
  sprites: 'rse',
  entrance: {{ x: {ent[0]}, y: {ent[1]} }},{exit_ts}{extra}
  name: '{cfg['title']}',
  image: '/routes/{cfg['image']}',
  width: {len(rows[0]) * TILE},
  height: {len(rows) * TILE},
  spots: [
{pts(spots)}
  ],
  walkable: [
{rows_ts(rows)}
  ],{grass_ts}
}};
"""


ROUTES_HEAD = """// The Hoenn gym runs' maps, from Pokémon Emerald (the pret/pokeemerald decompilation; tools/routes/emerald/), as the
// Kanto ones come from FireRed: each drawn with its tilesets (emerald_map.py), 16 px to a tile, with which tiles can be
// walked on from the map data, its tall grass, and 10 spots along the walk. Every map uses Emerald's overworld sprites
// (`sprites: 'rse'`). Written by tools/routes/emerald/hoenn_maps.py.
import { SWIMMERS, type Route } from './routes.js';
"""


# --- Gyms ---

def trainer_names(repo):
    """Each trainer constant's name as the run has them ("Youngster Josh"), and its class, from src/data/trainers.h."""
    classes = dict(re.findall(r'\[(TRAINER_CLASS_\w+)\]\s*=\s*_\("([^"]*)"\)', open(os.path.join(repo, 'src', 'data', 'text', 'trainer_class_names.h'), encoding='utf-8').read()))
    names = {}
    text = open(os.path.join(repo, 'src', 'data', 'trainers.h'), encoding='utf-8').read()
    for const, body in re.findall(r'\[(TRAINER_\w+)\]\s*=\s*\{(.*?)\n    \}', text, re.S):
        cls = re.search(r'\.trainerClass\s*=\s*(TRAINER_CLASS_\w+)', body)
        nm = re.search(r'\.trainerName\s*=\s*_\("([^"]*)"\)', body)
        if cls and nm:
            title = lambda s: ' '.join(w.capitalize() for w in s.replace('♂', '').replace('♀', '').replace('{PKMN}', 'PKMN').split())
            names[const] = f'{title(classes.get(cls.group(1), ""))} {title(nm.group(1))}'.replace('Pkmn ', 'Pokémon ').strip()
    return names


def script_trainers(repo, map_name):
    """The trainer each of the map's scripts battles (its label -> TRAINER_ constant)."""
    path = os.path.join(repo, 'data', 'maps', map_name, 'scripts.inc')
    out = {}
    label = None
    for line in open(path, encoding='utf-8'):
        m = re.match(r'^(\w+)::', line)
        if m:
            label = m.group(1)
            continue
        t = re.search(r'trainerbattle\w*\s+(?:TRAINER_BATTLE_\w+,\s*)?(TRAINER_\w+)', line)
        if t and label and label not in out:
            out[label] = t.group(1)
    return out


def facing(o):
    mt = o.get('movement_type', '')
    for k in ('UP', 'DOWN', 'LEFT', 'RIGHT'):
        if 'FACE_' + k in mt or mt.endswith(k):
            return k.lower()
    return 'down'


def sprite_name(gfx):
    return gfx.replace('OBJ_EVENT_GFX_', '').lower()


def gym_trainers(repo, maps, names, scripts_from=None):
    """The gym's trainers (every room's): their names and sprites. A room's scripts can be in another's file (Lavaridge
    Gym's B1F's in 1F's), so every map's of `scripts_from` (the gym's) are looked in."""
    out = []
    scripts = {}
    for m in scripts_from or maps:
        scripts.update(script_trainers(repo, m))
    for m in maps:
        info = json.load(open(os.path.join(repo, 'data', 'maps', m, 'map.json')))
        for o in info.get('object_events', []):
            if o.get('trainer_type', 'TRAINER_TYPE_NONE') == 'TRAINER_TYPE_NONE':
                continue
            const = scripts.get(o['script'])
            if const and const in names:
                out.append((names[const], sprite_name(o['graphics_id']), o, m))
    return out


def place(repo, city, rows, info, cfg, names):
    leader_map, others, warp_to, const, title, leader_gfx = cfg
    # Ledges walked either way (Lavaridge's sand slopes, hopped going north on the way to the leader).
    rows = [list(r.replace('<', '.').replace('>', '.').replace('^', '.').replace('v', '.')) for r in rows]
    warps = info['events']['warp_events']
    door = next((w['x'], w['y']) for w in warps if w['dest_map'] == warp_to)
    rows[door[1]][door[0]] = '.'
    # Doors within the map (Petalburg Gym's rooms): their tiles walkable, each joined to the door it leads to.
    own = json.load(open(os.path.join(repo, 'data', 'maps', leader_map, 'map.json')))['id']
    links = []
    for w in warps:
        if w['dest_map'] == own:
            to = warps[int(w['dest_warp_id'])]
            a, b = (w['x'], w['y']), (to['x'], to['y'])
            rows[a[1]][a[0]] = rows[b[1]][b[0]] = '.'
            if (b, a) not in links:
                links.append((a, b))
    for t in USER_WALKABLE.get(city, []):
        rows[t[1]][t[0]] = '.'
    rows = [''.join(r) for r in rows]
    links += USER_LINKS.get(city, [])
    objs = info['events']['object_events']
    gfx = leader_gfx if isinstance(leader_gfx, tuple) else (leader_gfx,)
    leader = next(o for o in objs if o['graphics_id'] == gfx[0])
    partner = next((o for o in objs if len(gfx) > 1 and o['graphics_id'] == gfx[1]), None)
    lstand = (leader['x'], leader['y'])
    lspot = nearest_walkable(rows, (lstand[0], lstand[1] + 1), (0, 1))
    from_door = bfs(rows, door, links=links)
    half = len(path(from_door, lspot)) / 2 if lspot in from_door else 0
    trainers = gym_trainers(repo, [leader_map], names, [leader_map] + others)

    def spot_of(o):
        # The tile they face, or the walkable one nearest it (not their own: people don't block tiles in a gym).
        dx, dy = STEP[facing(o)]
        own = [list(r) for r in rows]
        own[o['y']][o['x']] = '#'
        return nearest_walkable([''.join(r) for r in own], (o['x'] + dx, o['y'] + dy), (dx, dy))
    dist = {t: len(path(from_door, t)) for t in from_door}
    # Only trainers walked to from the door and on to the leader on this floor (Lavaridge's are joined through B1F).
    trainers = [t for t in trainers if spot_of(t[2]) in from_door and lspot in bfs(rows, spot_of(t[2]), links=links)]
    if trainers:
        tname, tsprite, tobj, _ = min(trainers, key=lambda t: (spot_of(t[2]) not in from_door, abs(dist.get(spot_of(t[2]), 1e9) - half)))
        tstand, tspot = (tobj['x'], tobj['y']), spot_of(tobj)
    else:
        # No trainers in the leader's room walked to on the way (Sootopolis's are all downstairs, Lavaridge's 1F's past B1F's
        # holes): the Gym Trainer stands beside the walk to the leader halfway along it, the player on the walk.
        walk = path(from_door, lspot) if lspot in from_door else [door]
        tspot = walk[len(walk) // 2]
        tname = 'no one (halfway along the walk)'
        tstand = next(((tspot[0] + dx, tspot[1]) for dx in (-1, 1) if rows[tspot[1]][tspot[0] + dx] == '.' and (tspot[0] + dx, tspot[1]) not in walk), (tspot[0] - 1, tspot[1]))
    user = USER_GYM_TRAINER.get(city)
    if user:
        tspot, tstand = user['spot'], user['stand']
    guide = next(((o['x'], o['y']) for o in objs if 'GymGuide' in o.get('script', '')), None)
    guide_sprite = next((sprite_name(o['graphics_id']) for o in objs if 'GymGuide' in o.get('script', '')), None)
    gaps = []
    if tspot not in from_door:
        gaps.append((city, 'door', door, 'Gym Trainer spot', tspot))
    if lspot not in bfs(rows, tspot, links=links):
        gaps.append((city, 'Gym Trainer spot', tspot, 'leader spot', lspot))
    partner_at = (partner['x'], partner['y']) if partner else None
    return rows, door, links, [tspot, lspot], [tstand, lstand], (guide, guide_sprite), partner_at, gaps, tname


def entrance_near(rows, spot, links=()):
    """Where the player comes in for a boss's room: 4 steps from their spot (5 tiles from them, as Kanto's), straight
    south where the room allows, else the most southern such tile, nearest the spot's column."""
    prev = bfs(rows, spot, links=links)
    dist = {t: len(path(prev, t)) - 1 for t in prev}
    for steps in (4, 3, 5, 2):
        cands = [t for t, d in dist.items() if d == steps]
        if cands:
            return min(cands, key=lambda t: (t != (spot[0], spot[1] + steps), -t[1], abs(t[0] - spot[0])))
    return spot


def gym_ts(const, title, doc, image, rows, door, spots, stands, npcs=(), links=()):
    links_ = '\n  links: [' + ', '.join(f'[{{ x: {a[0]}, y: {a[1]} }}, {{ x: {b[0]}, y: {b[1]} }}]' for a, b in links) + '],' if links else ''
    name = f'"{title}"' if "'" in title else f"'{title}'"
    npcs_ = ''
    if npcs:
        npcs_ = '\n  npcs: [' + ', '.join(f"{{ sprite: 'rse/{s}', tile: {{ x: {t[0]}, y: {t[1]} }}, face: '{f}' }}" for s, t, f in npcs) + '],'
    return f"""
/** {doc} */
export const {const}: Route = {{
  flow: 'up',
  sprites: 'rse',
  name: {name},
  image: '/routes/{image}',
  width: {len(rows[0]) * TILE},
  height: {len(rows) * TILE},
  entrance: {{ x: {door[0]}, y: {door[1]} }},{links_}
  spots: [
{pts(spots)}
  ],
  stands: [
{pts(stands)}
  ],{npcs_}
  walkable: [
{rows_ts(rows)}
  ],
}};
"""


GYMS_HEAD = """// The Hoenn gyms' interiors, from Pokémon Emerald (the pret/pokeemerald decompilation; tools/routes/emerald/), as the
// Kanto gyms have FireRed's (kanto-routes.ts) and the Johto ones HeartGold/SoulSilver's (johto-gyms.ts): each the leader's
// map, drawn as the Hoenn routes are (emerald_map.py). The door the player comes in at, the Gym Trainer where the gym's
// trainer nearest halfway in stands (the player beside them, on the side they face), the leader in their place (the
// player below them), and the Gym Guide, all from the map's events; doors within the map (Petalburg Gym's rooms) join
// their tiles (`links`), and ledges are walked either way. Walking connections the map data doesn't show (a gym's puzzle) come from the user, as `links` or
// walkable tiles. Then the Hoenn Gym Challenge and Champion runs' other rooms, as Kanto's and Johto's: the Pokémon
// League's, each boss in their place and the player coming in 5 tiles from them, and Lavaridge Town's Pokémon Center; and
// each boss's map for those runs (HOENN_BOSS_ROOMS). Written by tools/routes/emerald/hoenn_maps.py.
import type { HoennBossId } from './bosses.js';
import { leaderRoom, type Route } from './routes.js';
"""


def main():
    args = sys.argv[1:]
    work = None
    if '--work' in args:
        i = args.index('--work'); work = args[i + 1]; del args[i:i + 2]
    repo = args[0]
    work = work or tempfile.mkdtemp(prefix='hoenn_maps_')
    os.makedirs(work, exist_ok=True)
    names = trainer_names(repo)

    # Routes; the trainers on Route 110 who ride the Cycling Road (TRIATHLETES), for its battles.
    riders = sorted({t[0] for t in gym_trainers(repo, ['Route110'], names) if t[0].startswith('Triathlete ')})
    out = ['\n/** The trainers on the Seaside Cycling Road (Route 110, the Mauville City run): its Triathletes, as Emerald has them. */\nexport const TRIATHLETES = [' + ', '.join(f"'{n}'" for n in riders) + '];\n']
    for key, cfg in ROUTES.items():
        # The map's people aren't drawn on a route (only the encounters' figures are), so their tiles aren't walls.
        img, info = emerald_map.render(repo, cfg['map'], block_people=False)
        user = USER_ROUTES.get(key, {})
        rows = route_rows(info, cfg, user)
        ent, spots = KEPT_PICKS[key] if key in KEPT_PICKS else pick(key, rows, info, cfg)
        ent, spots, ext = user.get('entrance', ent), user.get('spots', spots), user.get('exit')
        stops = [ent] + spots + ([ext] if ext else [])
        gaps = [(a, b) for a, b in zip(stops, stops[1:]) if not walkable(rows[b[1]][b[0]], cfg.get('surf')) or b not in bfs(rows, a, cfg.get('surf'))]
        assert not gaps, (key, "the user's spots: no walk", gaps)
        img.save(os.path.join(PUBLIC, cfg['image']))
        preview(img, [('IN', ent, (0, 255, 0))] + ([('OUT', ext, (0, 128, 255))] if ext else []) + [(str(i + 1), s, (255, 0, 0)) for i, s in enumerate(spots)], os.path.join(work, key + '-route.png'))
        out.append(route_ts(cfg, ent, spots, rows, info['grass'], info['long_grass'], ext, 'spots' in user))
        print('route', key, cfg['map'], 'entrance', ent, 'spots', spots)
    open(ROUTES_OUT, 'w', encoding='utf-8', newline='\n').write(ROUTES_HEAD + ''.join(out))

    # Gyms.
    out, problems, entrances = [], [], {}
    for city, cfg in GYMS.items():
        leader_map, others, warp_to, const, title, leader_gfx = cfg
        img, info = emerald_map.render(repo, leader_map, block_people=False)
        rows, door, links, spots, stands, (guide, guide_sprite), partner, gaps, tname = place(repo, city, info['rows'], info, cfg, names)
        problems += gaps
        image = f'{city}_gym.png'
        img.save(os.path.join(PUBLIC, image))
        npcs = []
        if guide:
            npcs.append((guide_sprite, guide, 'down'))
        if partner:
            npcs.append(('liza', partner, 'down'))
        preview(img, [('IN', door, (0, 255, 0)), ('T', stands[0], (255, 160, 0)), ('L', stands[1], (255, 0, 0)), ('1', spots[0], (0, 200, 255)), ('2', spots[1], (0, 200, 255))] + ([('G', guide, (200, 200, 200))] if guide else []), os.path.join(work, city + '-gym.png'))
        doc = f"{title}, the leader's room: the Gym Trainer where {tname} stands ({stands[0][0]},{stands[0][1]}), the leader in their place ({stands[1][0]},{stands[1][1]})"
        if partner:
            doc += f', Liza beside Tate ({partner[0]},{partner[1]})'
        if links:
            doc += ', its rooms joined through their doors (' + '; '.join(f'{a[0]},{a[1]} to {b[0]},{b[1]}' for a, b in links) + ')'
        out.append(gym_ts(const, title, doc + '.', image, rows, door, spots, stands, npcs, links))
        entrances[city] = (entrance_near(rows, spots[1], links), links)
        trainers = gym_trainers(repo, [leader_map] + others, names, [leader_map] + others)
        print('gym', city, 'door', door, 'spots', spots, 'stands', stands, 'trainer', tname, 'links', links)
        print('  trainers:', json.dumps([t[0] for t in trainers]), 'sprites:', json.dumps({t[0]: t[1] for t in trainers}))

    # The League's rooms and the Pokémon Center.
    rooms = {}
    for key, (map_name, gfx, boss, const, title) in list(LEAGUE.items()) + [('center', (CENTER[0], CENTER[2], None, 'POKEMON_CENTER', 'Pokémon Center'))]:
        img, info = emerald_map.render(repo, map_name)
        rows = [list(r) for r in info['rows']]
        door = None
        if key == 'center':
            door = next((w['x'], w['y']) for w in info['events']['warp_events'] if w['dest_map'] == CENTER[1])
            rows[door[1]][door[0]] = '.'
        rows = [''.join(r) for r in rows]
        who = next(o for o in info['events']['object_events'] if o['graphics_id'] == gfx)
        stand = (who['x'], who['y'])
        spot = nearest_walkable(rows, (stand[0], stand[1] + (2 if key == 'center' else 1)), (0, 1))
        ent = door or entrance_near(rows, spot)
        image = f'rse_evergrande_{key}s_room.png' if key != 'center' else 'rse_lavaridge_pokemoncenter_1f.png'
        img.save(os.path.join(PUBLIC, image))
        if key == 'center':
            doc = f"A Pokémon Center's ground floor (Lavaridge Town's, Emerald's), for the Pokémon Center in the middle of the Hoenn Gym Challenge: the player comes in at the door ({ent[0]},{ent[1]}) and walks up to the counter ({spot[0]},{spot[1]}), the nurse behind it ({stand[0]},{stand[1]})."
            const_ = 'HOENN_POKEMON_CENTER'
        else:
            who_name = title.split("'")[0] if key != 'wallace' else 'Wallace'
            doc = f"{title} at the Pokémon League (Emerald's), for the Hoenn Champion run: {who_name} in their place ({stand[0]},{stand[1]}), the player coming in 5 tiles from them ({ent[0]},{ent[1]})."
            const_ = 'HOENN_' + const
            rooms[boss] = const_
        if ent not in bfs(rows, spot) and key != 'center':
            problems.append((key, 'entrance', ent, 'spot', spot))
        out.append(gym_ts(const_, title, doc, image, rows, ent, [spot], [stand]))
        print(key, 'entrance', ent, 'spot', spot, 'stand', stand)

    lines = [f"  {LEADERS[c] if '-' not in LEADERS[c] else repr(LEADERS[c])}: leaderRoom({GYMS[c][3]}, {{ x: {e[0]}, y: {e[1]} }})," for c, (e, _) in entrances.items()]
    lines += [f'  {boss}: {const},' for boss, const in rooms.items()]
    out.append("\n/** Each Hoenn boss's map for the Gym Challenge and Champion runs, by boss id: their gym (leaderRoom, the player coming in 5 tiles from them, south where it can) or Pokémon League room. */\nexport const HOENN_BOSS_ROOMS: Record<HoennBossId, Route> = {\n" + '\n'.join(lines) + '\n};\n')
    open(GYMS_OUT, 'w', encoding='utf-8', newline='\n').write(GYMS_HEAD + ''.join(out))
    print('wrote', ROUTES_OUT, GYMS_OUT, 'previews in', work)
    for p in problems:
        print('NO WALK:', p)


if __name__ == '__main__':
    main()
