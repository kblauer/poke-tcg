"""Makes the Sinnoh gyms' interiors, as the Johto gyms have theirs (johto_gyms.py), and writes
packages/campaign/src/sinnoh-gyms.ts, copying the images to apps/web/public/routes/<city>_gym.png:

- each gym's leader's room rendered by dp_map.py (Hearthome's and Sunyshore's gyms are several maps, and only the
  leader's is shown, as Johto's Azalea and Mahogany), cropped to the room;
- from the map's events (Diamond's zone events): the door the player comes in at (the warp out, walkable here), the Gym
  Trainer where the gym's trainer nearest halfway in along the walk to the leader stands (the player beside them, on the
  side they face; Eterna's trainers battle through the gym's script, so its other people), the leader in their place (the
  player below them), and the Gym Guide where there is one. Hearthome's
  leader's room has no trainers, so its Gym Trainer stands halfway between the door and Fantina;
- the Sinnoh Gym Challenge and Champion runs' rooms: each gym's leader-only version (the player coming in 5 tiles from the
  leader, south where it can), the Pokémon League's rooms (dp_pokemonleague_<boss>s_room.png) and Pastoria's Pokémon Center
  (agreed with the user; dp_pastoria_pokemoncenter_1f.png), with SINNOH_BOSS_ROOMS.

Usage: python sinnoh_gyms.py [--apicula <apicula.exe>] [--cache <dir>] [--work <dir>]
(--work: where the renders go; each gym also gets a <city>-preview.png there with its door, stands and spots marked.)
Prints any walk it can't find (a gym puzzle the map data doesn't show: fixes come from the user, as for Johto)."""
import json, os, re, subprocess, sys, tempfile
from collections import deque
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw
import numpy as np
import dp_data as dd
import pt_data
from sinnoh_routes import TREETOP_HIGH, overhead as treetops_overhead

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes')
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'sinnoh-gyms.ts')
TILE = 16

# Each gym: its map, the map its door leads to, its constant and name, and its leader's boss id.
GYMS = {
    'oreburgh': ('MAP_OREBURGH_GYM', 'MAP_OREBURGH', 'OREBURGH_GYM', 'Oreburgh Gym', 'roark'),
    'eterna': ('MAP_ETERNA_GYM', 'MAP_ETERNA_GYM_ENTRANCE', 'ETERNA_GYM', 'Eterna Gym', 'gardenia'),
    'veilstone': ('MAP_VEILSTONE_GYM', 'MAP_VEILSTONE', 'VEILSTONE_GYM', 'Veilstone Gym', 'maylene'),
    'pastoria': ('MAP_PASTORIA_GYM', 'MAP_PASTORIA', 'PASTORIA_GYM', 'Pastoria Gym', 'crasher-wake'),
    'hearthome': ('MAP_HEARTHOME_GYM_LEADER_ROOM', None, 'HEARTHOME_GYM', 'Hearthome Gym', 'fantina'),
    'canalave': ('MAP_CANALAVE_GYM', 'MAP_CANALAVE', 'CANALAVE_GYM', 'Canalave Gym', 'byron'),
    'snowpoint': ('MAP_SNOWPOINT_GYM', 'MAP_SNOWPOINT', 'SNOWPOINT_GYM', 'Snowpoint Gym', 'candice'),
    'sunyshore': ('MAP_SUNYSHORE_GYM_ROOM_3', 'MAP_SUNYSHORE_GYM_ROOM_2', 'SUNYSHORE_GYM', 'Sunyshore Gym', 'volkner'),
}
# The Gym Challenge and Champion runs' other rooms: the Elite Four's and Cynthia's at the Pokémon League (their map, the
# boss's sprite, the boss id, constant and name), and the Pokémon Center after the fourth gym, Pastoria's.
LEAGUE = {
    'aaron': ('MAP_POKEMON_LEAGUE_AARON_ROOM', 'BIGFOUR1', 'aaron', 'AARONS_ROOM', "Aaron's Room"),
    'bertha': ('MAP_POKEMON_LEAGUE_BERTHA_ROOM', 'BIGFOUR2', 'bertha', 'BERTHAS_ROOM', "Bertha's Room"),
    'flint': ('MAP_POKEMON_LEAGUE_FLINT_ROOM', 'BIGFOUR3', 'flint', 'FLINTS_ROOM', "Flint's Room"),
    'lucian': ('MAP_POKEMON_LEAGUE_LUCIAN_ROOM', 'BIGFOUR4', 'lucian', 'LUCIANS_ROOM', "Lucian's Room"),
    'cynthia': ('MAP_POKEMON_LEAGUE_CYNTHIA_ROOM', 'CHAMPION', 'cynthia', 'CYNTHIAS_ROOM', "Cynthia's Room"),
}
CENTER = ('MAP_PASTORIA_POKECENTER', 'MAP_PASTORIA', 'PCWOMAN1')
# The user's fixes, in the gym's own tiles (after the crop): the door the player comes in at (made walkable), and the Gym
# Trainer's spot (the player's) and where they stand. Oreburgh Gym (2026-10-31, 2026-11-01): in at 5,25, the bottom of the
# doormat; the Gym Trainer in Youngster Darius's place, 7,11, the player at 5,11. Hearthome Gym's at 17,26 in its second
# statue room, the trainer above at 17,25 (2026-11-02).
USER_DOOR = {'oreburgh': (5, 25)}
USER_GYM_TRAINER = {'oreburgh': {'spot': (5, 11), 'stand': (7, 11)}, 'hearthome': {'spot': (17, 26), 'stand': (17, 25)}}
# Tiles drawn over the player (the route's `overhead`): bridges he walks under. Oreburgh Gym's wooden bridge (the user's).
USER_OVERHEAD = {'oreburgh': [(x, 17) for x in range(4, 8)]}
# The user's tracks (the one way through, in the cropped map's tiles; only its tiles walkable), as johto_gyms.py's: from
# the door, its legs' corners in turn, a leg `under` where the gym's overhead is drawn over him. Pastoria Gym's
# (2026-11-02): round its walls as its water would have him, up past the Gym Trainer and on to Crasher Wake, below the
# raised floor at 6-9,20.
USER_TRACKS = {'pastoria': {'start': (13, 42), 'legs': [{'to': [(13, 29), (8, 29), (8, 33), (6, 33), (6, 23), (7, 23), (4, 23), (4, 20), (5, 20)]},
                                                        {'under': True, 'to': [(9, 20)]}, {'to': [(13, 20), (13, 5)]}]}}
# Tiles whose raised pixels (above the floor of the tile given) are drawn over the player: Pastoria Gym's raised floor
# along 6-9,20, its upper half, the floor beside it at 5,20 (the user's).
USER_RAISED_OVER = {'pastoria': ([(x, 20) for x in range(6, 10)], (5, 20))}
# Tiles painted over with another tile of the gym's (tile: the one copied). Pastoria Gym's gate across the channel in from
# its door, 13,33-35, gone: the channel's floor above it; the walkway at 6,27-30 up to 6,23, and the floor at 13,8-9 up to
# Crasher Wake's platform (the user's, 2026-11-02).
USER_FLOOR = {'pastoria': {**{(13, y): (13, 32) for y in range(33, 36)}, **{(6, y): (6, 28) for y in range(23, 27)}, **{(13, y): (13, 8) for y in range(5, 8)}}}
# Gyms whose treetops are drawn over the player, found by height as the routes' are (sinnoh_routes.py's `overhead`,
# USER_TREETOPS there): Eterna Gym's (the user's, 2026-11-01).
USER_TREETOPS = {'eterna', 'hearthome'}
# How high above the floor a treetop's pixels stand, where it isn't the routes' TREETOP_HIGH: Hearthome Gym's Duskull
# statues, about 11 units tall, masked from 2 up (the user's: their tops drawn over the player behind them, 2026-11-02).
USER_TREETOP_HIGH = {'hearthome': 2}
# Gyms drawn from Platinum's rooms (pt_data.py, dp_map.py --game platinum), the user's, 2026-11-02: Hearthome Gym, as
# Platinum lays it out (Diamond's is quiz rooms): its entrance room, in from the city, its two rooms of Duskull statues
# and Fantina's room, each room's render (its map, where it's drawn in the joined map, its size in tiles) stacked bottom
# to top, each one's middle door a link to the next room's entrance (all its doors lead on: Platinum's puzzle is its
# darkness), the doors in line on column 14. The Gym Trainer is its trainer nearest halfway in, as the other gyms'.
USER_PLATINUM = {'hearthome': {'door_to': 'MAP_HEARTHOME_CITY', 'leader': 'OBJ_EVENT_GFX_FANTINA', 'guide': 'OBJ_EVENT_GFX_GYM_GUIDE',
                               'rooms': [('MAP_HEARTHOME_CITY_GYM_LEADER_ROOM', (10, 0), (15, 15)), ('MAP_HEARTHOME_CITY_GYM_TRAINER_ROOM_2', (0, 15), (28, 24)),
                                         ('MAP_HEARTHOME_CITY_GYM_TRAINER_ROOM_1', (6, 39), (16, 12)), ('MAP_HEARTHOME_CITY_GYM_ENTRANCE_ROOM', (10, 51), (12, 10))],
                               'links': [((14, 53), (14, 49)), ((14, 41), (14, 37)), ((14, 17), (14, 13))]}}
FACE = {0: 'up', 1: 'down', 2: 'left', 3: 'right'}
STEP = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}
# How far past the room's walkable tiles the image goes: its walls above (drawn tilted), a tile elsewhere.
MARGIN = {'top': 3, 'side': 1, 'bottom': 1}


def sprite_ids(cache):
    """Diamond's sprite names (include/constants/sprites.h, without SPRITE_) -> ids."""
    text = open(dd.fetch(cache, 'include/constants/sprites.h'), encoding='utf-8').read()
    return {m.group(1): int(m.group(2)) for m in re.finditer(r'#define\s+SPR[A-Z]*_(\w+)\s+(\d+)', text)}


def bfs(rows, start, links=()):
    h, w = len(rows), len(rows[0])
    far = {a: b for a, b in links}
    dist = {start: 0}; q = deque([start])
    while q:
        x, y = q.popleft()
        for n in [(x + dx, y + dy) for dx, dy in STEP.values()] + ([far[(x, y)]] if (x, y) in far else []):
            if 0 <= n[0] < w and 0 <= n[1] < h and rows[n[1]][n[0]] == '.' and n not in dist:
                dist[n] = dist[(x, y)] + 1; q.append(n)
    return dist


def nearest_walkable(rows, t, toward=None):
    """`t` if it can be walked on, else the walkable tile nearest it (first `toward` that way)."""
    h, w = len(rows), len(rows[0])
    if 0 <= t[1] < h and 0 <= t[0] < w and rows[t[1]][t[0]] == '.':
        return t
    cands = [(x, y) for y in range(h) for x in range(w) if rows[y][x] == '.']
    return min(cands, key=lambda c: (abs(c[0] - t[0]) + abs(c[1] - t[1]), 0 if toward is None else -((c[0] - t[0]) * toward[0] + (c[1] - t[1]) * toward[1])))


def door_of(rows, events, warp_to):
    """The warp the player comes in by (to `warp_to`'s header id, or the room's only warp when None), made walkable."""
    warps = [w for w in events['warps'] if warp_to is None or w['header'] == warp_to]
    w = warps[0]
    rows = [list(r) for r in rows]
    rows[w['z']][w['x']] = '.'
    return [''.join(r) for r in rows], (w['x'], w['z'])


def place(rows, events, warp_to, leader_sprite, guide_sprite, cache):
    """The door, the Gym Trainer's and leader's stands and the player's spots, the guide and the trainer, from the events."""
    rows, door = door_of(rows, events, warp_to)
    objs = events['objects']
    leader = next(o for o in objs if o['sprite'] == leader_sprite)
    lstand = (leader['x'], leader['z'])
    lspot = nearest_walkable(rows, (lstand[0], lstand[1] + 1), (0, 1))
    from_door = bfs(rows, door)
    half = from_door.get(lspot, 0) / 2
    trainers = [o for o in objs if dd.trainer_of(cache, o)]
    # Eterna's trainers battle through the gym's own script, not a trainer's: its other people (not the leader or guide).
    trainers = trainers or [o for o in objs if o['sprite'] not in (leader_sprite, guide_sprite)]

    def spot_of(o):
        dx, dy = STEP[FACE.get(o['face'], 'down')]
        return nearest_walkable(rows, (o['x'] + dx, o['z'] + dy), (dx, dy))
    guide = next(((o['x'], o['z']) for o in objs if o['sprite'] == guide_sprite), None)
    if not trainers:
        # Hearthome's leader's room: the Gym Trainer halfway along the walk from the door to Fantina, the player below them.
        walk = sorted((t for t, d in from_door.items() if abs(d - half) <= 1), key=lambda t: (abs(t[0] - door[0]), t))
        tspot = walk[0] if walk else lspot
        return rows, door, [tspot, lspot], [(tspot[0], tspot[1] - 1), lstand], guide, None
    # Trainers with no walk to them from the door come last; then the one nearest halfway in.
    trainer = min(trainers, key=lambda o: (spot_of(o) not in from_door, abs(from_door.get(spot_of(o), 1e9) - half)))
    return rows, door, [spot_of(trainer), lspot], [(trainer['x'], trainer['z']), lstand], guide, trainer


def entrance_near(rows, spot):
    """Where the player comes in for a boss's room: 4 steps from their spot (5 tiles from them), straight south where
    the room allows, else the most southern such tile, nearest the spot's column."""
    dist = bfs(rows, spot)
    for steps in (4, 3, 5, 2):
        cands = [t for t, d in dist.items() if d == steps]
        if cands:
            return min(cands, key=lambda t: (t != (spot[0], spot[1] + steps), -t[1], abs(t[0] - spot[0])))
    return spot


def crop_box(rows, door, keep):
    """The room: the bounds of the tiles walked to from its door (and `keep`'s: the people), with MARGIN round them."""
    h, w = len(rows), len(rows[0])
    tiles = list(bfs(rows, door)) + keep
    x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(w - 1, max(t[0] for t in tiles) + MARGIN['side'])
    y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(h - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
    return x0, y0, x1, y1


def platinum_gym(spec, work, city, apicula):
    """A gym of Platinum's rooms (USER_PLATINUM) joined into one map: its picture (<work>/<city>_joined.png), rows, door,
    spots, stands, guide, its Gym Trainer's name, its links, and the tiles never treetops: each room's floor along its
    bottom wall (its lowest walkable tile in each column, and the one above it if walkable), the wall no statue."""
    cache = os.path.join(tempfile.gettempdir(), 'pokeplatinum')
    headers = pt_data.map_headers(cache)
    W = max(ox + w for _, (ox, _), (w, _) in spec['rooms']); H = max(oy + h for _, (_, oy), (_, h) in spec['rooms'])
    rows = [['#'] * W for _ in range(H)]
    joined = Image.new('RGBA', (W * TILE, H * TILE))
    heights = np.full((H * TILE, W * TILE), np.nan, dtype=np.float32)
    objects, door, never = [], None, []
    for map_const, (ox, oy), (w, h) in spec['rooms']:
        prefix = os.path.join(work, 'pt_' + map_const.replace('MAP_', '').lower())
        if not os.path.exists(prefix + '.png'):
            subprocess.run([sys.executable, os.path.join(HERE, 'dp_map.py'), prefix, map_const, '--game', 'platinum', '--apicula', apicula, '--cache', cache], check=True)
        joined.paste(Image.open(prefix + '.png').crop((0, 0, w * TILE, h * TILE)), (ox * TILE, oy * TILE))
        heights[oy * TILE:(oy + h) * TILE, ox * TILE:(ox + w) * TILE] = np.load(prefix + '_height.npy')[:h * TILE, :w * TILE]
        own = json.load(open(prefix + '.json'))['rows']
        for y in range(h):
            rows[oy + y][ox:ox + w] = own[y][:w]
        for x in range(w):
            floor = [y for y in range(h) if own[y][x] == '.']
            if floor:
                never += [(ox + x, oy + floor[-1])] + ([(ox + x, oy + floor[-1] - 1)] if own[floor[-1] - 1][x] == '.' else [])
        ev = pt_data.events(cache, headers[map_const]['events'])
        objects += [{**o, 'x': o['x'] + ox, 'z': o['z'] + oy} for o in ev['objects']]
        door = door or next(((wp['x'] + ox, wp['z'] + oy) for wp in ev['warps'] if wp['to'] == spec['door_to']), None)
    for x, y in [door] + [t for link in spec['links'] for t in link]:
        rows[y][x] = '.'
    rows = [''.join(r) for r in rows]
    prefix = os.path.join(work, city + '_joined')
    joined.save(prefix + '.png')
    np.save(prefix + '_height.npy', heights)
    links = spec['links']
    leader = next(o for o in objects if o['gfx'] == spec['leader'])
    lstand = (leader['x'], leader['z'])
    lspot = nearest_walkable(rows, (lstand[0], lstand[1] + 1), (0, 1))
    from_door = bfs(rows, door, links)
    half = from_door.get(lspot, 0) / 2

    def spot_of(o):
        dx, dy = STEP[FACE.get(o['face'], 'down')]
        return nearest_walkable(rows, (o['x'] + dx, o['z'] + dy), (dx, dy))
    trainer = min((o for o in objects if o['trainer']), key=lambda o: (spot_of(o) not in from_door, abs(from_door.get(spot_of(o), 1e9) - half)))
    who = ' '.join(w.title() for w in trainer['trainer'].replace('TRAINER_', '').split('_'))
    guide = next(((o['x'], o['z']) for o in objects if o['gfx'] == spec['guide']), None)
    return prefix, rows, door, [spot_of(trainer), lspot], [(trainer['x'], trainer['z']), lstand], guide, who, links, never


def render(work, name, map_const, apicula, cache):
    prefix = os.path.join(work, name)
    if not os.path.exists(prefix + '.png'):
        subprocess.run([sys.executable, os.path.join(HERE, 'dp_map.py'), prefix, map_const, '--apicula', apicula, '--cache', cache], check=True)
    return prefix, json.load(open(prefix + '.json'))['rows']


def track_tiles(track):
    """A user track's tiles, every one on the way from corner to corner."""
    tiles = [track['start']]
    for x, y in (c for leg in track['legs'] for c in leg['to']):
        x0, y0 = tiles[-1]
        assert x == x0 or y == y0, ('track corner not in line', (x0, y0), (x, y))
        dx, dy = (x > x0) - (x < x0), (y > y0) - (y < y0)
        while tiles[-1] != (x, y):
            tiles.append((tiles[-1][0] + dx, tiles[-1][1] + dy))
    return tiles


def gym_ts(const, title, doc, image, w, h, door, spots, stands, guide, rows, overhead=None, track=None, links=()):
    legs = lambda: ', '.join('{ ' + ('under: true, ' if leg.get('under') else '') + f"to: [{', '.join(f'[{x}, {y}]' for x, y in leg['to'])}] }}" for leg in track['legs'])
    track_ = f"\n  track: trackLine([{track['start'][0]}, {track['start'][1]}], {legs()})," if track else ''
    links_ = ('\n  links: [' + ', '.join(f'[{{ x: {a[0]}, y: {a[1]} }}, {{ x: {b[0]}, y: {b[1]} }}]' for a, b in links) + '],') if links else ''
    pts = lambda ps: '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in ps)
    walk = '\n'.join(f"    '{r}'," for r in rows)
    name = f'"{title}"' if "'" in title else f"'{title}'"
    npcs = f"\n  npcs: [{{ sprite: 'dp/sunglasses', tile: {{ x: {guide[0]}, y: {guide[1]} }}, face: 'down' }}]," if guide else ''
    return f"""
/** {doc} */
export const {const}: Route = {{
  flow: 'up',
  sprites: 'dp',
  name: {name},
  image: '/routes/{image}',{f"{chr(10)}  overhead: '/routes/{overhead}'," if overhead else ''}
  width: {w * TILE},
  height: {h * TILE},
  entrance: {{ x: {door[0]}, y: {door[1]} }},{track_}{links_}
  spots: [
{pts(spots)}
  ],
  stands: [
{pts(stands)}
  ],{npcs}
  walkable: [
{walk}
  ],
}};
"""


HEAD = """// The Sinnoh gyms' interiors, from Diamond and Pearl (the pret/pokediamond decompilation; tools/routes/dp/), as the Johto
// gyms have HGSS's (johto-gyms.ts): each the leader's room, drawn as the Sinnoh routes are (dp_map.py), cropped to the
// room (Hearthome's with its first question room beside it, the user's). The door the player comes in at, the Gym Trainer
// where the gym's trainer nearest halfway in stands (the player beside them, on the side they face), the leader in their
// place (the player below them), and the Gym Guide where there is one, all from the map's events. Walking connections the
// map data doesn't show (a gym's puzzle) come from the user. Then the Sinnoh Gym Challenge and Champion runs' other rooms:
// the Pokémon League's, each boss in their place and the player coming in 5 tiles from them, and Pastoria's Pokémon Center;
// and each boss's map for those runs (SINNOH_BOSS_ROOMS). Written by tools/routes/dp/sinnoh_gyms.py.
import type { SinnohBossId } from './bosses.js';
import { leaderRoom, trackLine, type Route } from './routes.js';
"""


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    work = opt('--work', None) or tempfile.mkdtemp(prefix='sinnoh_gyms_')
    os.makedirs(work, exist_ok=True)
    headers = dd.map_headers(cache)
    sprites = sprite_ids(cache)
    out, problems, entrances = [], [], {}
    for city, (map_const, warp_to, const, title, boss) in GYMS.items():
        prefix, rows = render(work, city, map_const, apicula, cache)
        events = dd.events(cache, headers[map_const]['events'])
        links, who, never = [], None, []
        if city in USER_PLATINUM:
            prefix, rows, door, spots, stands, guide, who, links, never = platinum_gym(USER_PLATINUM[city], work, city, apicula)
            trainer = None
        else:
            rows, door, spots, stands, guide, trainer = place(rows, events, warp_to and headers[warp_to]['id'], leader_sprite(events, sprites), sprites['SUNGLASSES'], cache)
        keep = [t for a, b in links for t in [*bfs(rows, a), *bfs(rows, b)]]
        x0, y0, x1, y1 = crop_box(rows, door, [*spots, *stands] + ([guide] if guide else []) + keep)
        shift = lambda t: (t[0] - x0, t[1] - y0)
        links = [(shift(a), shift(b)) for a, b in links]
        never = [shift(t) for t in never]
        rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
        door, spots, stands = shift(door), [shift(s) for s in spots], [shift(s) for s in stands]
        guide = guide and shift(guide)
        if guide and not (0 <= guide[1] < len(rows) and 0 <= guide[0] < len(rows[0])):
            guide = None
        if city in USER_DOOR:
            door = USER_DOOR[city]
            rows[door[1]] = rows[door[1]][:door[0]] + '.' + rows[door[1]][door[0] + 1:]
        if city in USER_GYM_TRAINER:
            spots[0], stands[0] = USER_GYM_TRAINER[city]['spot'], USER_GYM_TRAINER[city]['stand']
            trainer = next((o for o in events['objects'] if (o['x'] - x0, o['z'] - y0) in (spots[0], stands[0]) and dd.trainer_of(cache, o)), trainer)
        track = USER_TRACKS.get(city)
        if track:
            on = set(track_tiles(track))
            rows = [''.join('.' if (x, y) in on else '#' for x in range(len(r))) for y, r in enumerate(rows)]
        if spots[0] not in bfs(rows, door, links):
            problems.append((city, 'door', door, 'Gym Trainer spot', spots[0]))
        if spots[1] not in bfs(rows, spots[0], links):
            problems.append((city, 'Gym Trainer spot', spots[0], 'leader spot', spots[1]))
        im = Image.open(prefix + '.png').crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE))
        for (x, y), (fx, fy) in USER_FLOOR.get(city, {}).items():
            im.paste(im.crop((fx * TILE, fy * TILE, (fx + 1) * TILE, (fy + 1) * TILE)), (x * TILE, y * TILE))
        image = f'{city}_gym.png'
        im.save(os.path.join(PUBLIC, image))
        pv = im.convert('RGB'); d = ImageDraw.Draw(pv)
        for label, (x, y), col in [('IN', door, (0, 255, 0)), ('T', stands[0], (255, 160, 0)), ('L', stands[1], (255, 0, 0)), ('1', spots[0], (0, 200, 255)), ('2', spots[1], (0, 200, 255))] + ([('G', guide, (200, 200, 200))] if guide else []):
            d.rectangle([x * TILE, y * TILE, x * TILE + 15, y * TILE + 15], outline=col, width=2)
            d.text((x * TILE + 17, y * TILE), label, fill=col)
        pv.save(prefix + '-preview.png')
        overhead = None
        over = None
        if city in USER_TREETOPS:
            heights = np.load(prefix + '_height.npy')[y0 * TILE:(y1 + 1) * TILE, x0 * TILE:(x1 + 1) * TILE]
            over = treetops_overhead(im, rows, heights, 2, never, tall=USER_TREETOP_HIGH.get(city, TREETOP_HIGH)) or None
        if city in USER_RAISED_OVER:
            heights = np.load(prefix + '_height.npy')[y0 * TILE:(y1 + 1) * TILE, x0 * TILE:(x1 + 1) * TILE]
            tiles, (fx, fy) = USER_RAISED_OVER[city]
            floor = np.nanmedian(heights[fy * TILE:(fy + 1) * TILE, fx * TILE:(fx + 1) * TILE])
            over = over or Image.new('RGBA', im.size)
            src, dst = np.asarray(im.convert('RGBA')), np.array(over)
            for x, y in tiles:
                box = (slice(y * TILE, (y + 1) * TILE), slice(x * TILE, (x + 1) * TILE))
                high = heights[box] > floor + 2
                print('  raised', city, (x, y), int(high.sum()), 'of', TILE * TILE, 'pixels')
                dst[box][high] = src[box][high]
            over = Image.fromarray(dst)
        if city in USER_OVERHEAD:
            over = over or Image.new('RGBA', im.size)
            for x, y in USER_OVERHEAD[city]:
                box = (x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE)
                over.paste(im.convert('RGBA').crop(box), box)
        if over:
            overhead = f'{city}_gym_overhead.png'
            over.save(os.path.join(PUBLIC, overhead))
        who = dd.trainer_of(cache, trainer) if trainer else who
        who = who if who is None or isinstance(who, str) else f"{re.sub(r' (M|F|Snow M|Snow F)$', '', who['class'].replace('TRAINER_CLASS_', '').replace('_', ' ').title())} {who['name'].replace('{TRNAME}', '')}" if who else 'its trainer' if trainer else None
        doc = (f"{title}, Platinum's (the user's): its rooms stacked, in from the city at its door ({door[0]},{door[1]}), each room's middle door a link to the next one's entrance, the Gym Trainer {f"where {who} stands" if city not in USER_GYM_TRAINER else "in the second statue room"} ({stands[0][0]},{stands[0][1]}{"; the user's" if city in USER_GYM_TRAINER else ''}), the leader in their place ({stands[1][0]},{stands[1][1]})." if city in USER_PLATINUM else
               f"{title}, the leader's room: the Gym Trainer where {who} stands ({stands[0][0]},{stands[0][1]}{'; the user' + chr(39) + 's' if city in USER_GYM_TRAINER else ''}), the leader in their place ({stands[1][0]},{stands[1][1]})." if who else
               f"{title}, the leader's room (no trainers in it): the Gym Trainer halfway in ({stands[0][0]},{stands[0][1]}), the leader in their place ({stands[1][0]},{stands[1][1]}).")
        out.append(gym_ts(const, title, doc, image, len(rows[0]), len(rows), door, spots, stands, guide, rows, overhead, track, links))
        entrances[boss] = (const, entrance_near(rows, spots[1]))
        print(city, 'door', door, 'spots', spots, 'stands', stands, 'guide', guide, 'trainer', who, 'leader room entrance', entrances[boss][1])

    # The League's rooms and the Pokémon Center, each cropped to the area walked to from its entrance.
    rooms = {}
    for key, (map_const, sprite, boss, const, title) in list(LEAGUE.items()) + [('center', (CENTER[0], CENTER[2], None, 'SINNOH_POKEMON_CENTER', 'Pokémon Center'))]:
        prefix, rows = render(work, key, map_const, apicula, cache)
        events = dd.events(cache, headers[map_const]['events'])
        if key == 'center':
            rows, ent = door_of(rows, events, headers[CENTER[1]]['id'])
        who = next(o for o in events['objects'] if o['sprite'] == sprites[sprite])
        stand = (who['x'], who['z'])
        spot = nearest_walkable(rows, (stand[0], stand[1] + (2 if key == 'center' else 1)), (0, 1))
        if key != 'center':
            ent = entrance_near(rows, spot)
        x0, y0, x1, y1 = crop_box(rows, ent, [stand, spot])
        shift = lambda t: (t[0] - x0, t[1] - y0)
        rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
        stand, spot, ent = shift(stand), shift(spot), shift(ent)
        image = 'dp_pokemonleague_' + key + 's_room.png' if key != 'center' else 'dp_pastoria_pokemoncenter_1f.png'
        Image.open(prefix + '.png').crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE)).save(os.path.join(PUBLIC, image))
        if key == 'center':
            doc = f"A Pokémon Center's ground floor (Pastoria City's, Diamond's; agreed with the user), for the Pokémon Center in the middle of the Sinnoh Gym Challenge: the player comes in at the door ({ent[0]},{ent[1]}) and walks up to the counter ({spot[0]},{spot[1]}), the nurse behind it ({stand[0]},{stand[1]})."
        else:
            doc = f"{title} at the Pokémon League (Diamond's), for the Sinnoh Champion run: {title.split(chr(39))[0]} in their place ({stand[0]},{stand[1]}), the player coming in 5 tiles from them ({ent[0]},{ent[1]})."
            const = 'SINNOH_' + const
            rooms[boss] = const
        out.append(gym_ts(const, title, doc, image, len(rows[0]), len(rows), ent, [spot], [stand], None, rows))
        print(key, 'entrance', ent, 'spot', spot, 'stand', stand)

    # Each Sinnoh boss's map for the Gym Challenge and Champion runs.
    key = lambda b: f"'{b}'" if '-' in b else b
    lines = [f'  {key(b)}: leaderRoom({c}, {{ x: {e[0]}, y: {e[1]} }}),' for b, (c, e) in entrances.items()]
    lines += [f'  {key(b)}: {c},' for b, c in rooms.items()]
    out.append("\n/** Each Sinnoh boss's map for the Gym Challenge and Champion runs, by boss id: their gym (leaderRoom, the player coming in 5 tiles from them, south where it can) or Pokémon League room. */\nexport const SINNOH_BOSS_ROOMS: Record<SinnohBossId, Route> = {\n" + '\n'.join(lines) + '\n};\n')
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'previews in', work)
    for p in problems:
        print('NO WALK:', p)


def leader_sprite(events, sprites):
    """The leader's sprite among a gym's people: whichever of Diamond's LEADER1 to LEADER8 stands in it."""
    leaders = {sprites[f'LEADER{i}'] for i in range(1, 9)}
    return next(o['sprite'] for o in events['objects'] if o['sprite'] in leaders)


if __name__ == '__main__':
    main()
