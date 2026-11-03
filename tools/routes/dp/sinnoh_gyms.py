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
import json, math, os, re, shutil, subprocess, sys, tempfile
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
# Where the player comes into a leader's room for the Gym Challenge and Champion runs, where it isn't 5 tiles from them
# (entrance_near): the user's, 2026-11-03.
USER_LEADER_ENTRANCE = {'oreburgh': (5, 12), 'eterna': (12, 11), 'pastoria': (13, 12), 'hearthome': (14, 13), 'canalave': (16, 9), 'snowpoint': (11, 11), 'sunyshore': (11, 7)}
# Tiles walkable in a leader's room for those runs that aren't in the gym (none now: Sunyshore Gym's 9-10,7 were for its
# In tile at 9,7, since moved onto its top gear's north arm, the user's).
USER_LEADER_OPEN = {}
USER_GYM_TRAINER = {'oreburgh': {'spot': (5, 11), 'stand': (7, 11)}, 'hearthome': {'spot': (17, 26), 'stand': (17, 25)},
                    # Snowpoint Gym's Ace Trainer Isaiah at 14,13, the player slid up to him from the south at 14,14 (the
                    # user's, 2026-11-03: never stopping at 14,12 across the ice).
                    'snowpoint': {'spot': (14, 14), 'stand': (14, 13)},
                    # Canalave Gym's at 11,50 (its ground floor's 11,21), the player at 12,50, on his way along its track (the user's).
                    'canalave': {'spot': (12, 50), 'stand': (11, 50)}}
# Tiles drawn over the player (the route's `overhead`): bridges he walks under. Oreburgh Gym's wooden bridge (the user's).
USER_OVERHEAD = {'oreburgh': [(x, 17) for x in range(4, 8)]}
# The user's tracks (the one way through, in the cropped map's tiles; only its tiles walkable), as johto_gyms.py's: from
# the door, its legs' corners in turn, a leg `under` where the gym's overhead is drawn over him. Pastoria Gym's
# (2026-11-02): round its walls as its water would have him, up past the Gym Trainer and on to Crasher Wake, below the
# raised floor at 6-9,20.
USER_TRACKS = {
    # Canalave Gym's ground floor (the user's, 2026-11-02; its tiles 29 rows down in the joined map, USER_UPPER): in at its
    # door, up to row 21 and west past the Gym Trainer, up column 8 to row 16, east to the lift at 15,13. Only the rows it
    # spans are the track's: Byron's floor above them is walked as its own.
    'canalave': {'start': (16, 56), 'legs': [{'to': [(16, 50), (8, 50), (8, 45), (15, 45), (15, 42)]}], 'rows': (29, 60)},
    'pastoria': {'start': (13, 42), 'legs': [{'to': [(13, 29), (8, 29), (8, 33), (6, 33), (6, 23), (7, 23), (4, 23), (4, 20), (5, 20)]},
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
# Gyms slid across as Mahogany Gym's ice (the user's, 2026-11-03): Snowpoint Gym's, its ice (behaviour 0x20) a pit of 4
# floors with ramps between (its tiles' levels from the render's heights, LEVEL_UNITS each: never slid up but by its
# stairs, behaviours 0x4A and 0x49) and its snowballs (OBJ_EVENT_GFX_SNOWBALL, SNOWBALL), crushed by a slide into them.
USER_SLIDES = {'snowpoint'}
LEVEL_UNITS = 8
SNOWBALL = 118
# Gyms with gears turning bridges, walked across where their arms are (the user's, 2026-11-03): Sunyshore Gym's leader's
# room, its room 3 (pokeplatinum's gym_features.c: sSunyshoreRoom3Gears, props drawn turned as each of the gears' 4
# states has them, `<model>_s<state>` renders; their arms walkable only as sSunyshoreRoom3State<n>Collisions leaves
# them; its buttons, scripts_sunyshore_city_gym_room_3.s's coord events: 6,8 and 16,13 turning them once, 6,18 and 16,18
# twice), drawn turning frame by frame (GEAR_FRAMES a turn, 5.625° each: FieldTask_SunyshoreGym_RotateGears; one sheet,
# `<city>_gym_gears.png`, of the part of the picture they change, GEAR_SHEET_COLUMNS wide). The pits between its top
# floor's platforms (`gaps`: 7-8 and 13-14,3-5, walkable in the map's data) aren't walked across (the user's, 2026-11-03).
# Its floors are 96 units apart, joined by the ramps at its sides: each tile's level from the renders' heights,
# GEAR_LEVEL_UNITS each (base 36), a step up or down at most GEAR_LEVEL_STEP (terrain_collision_manager.c: none onto a
# floor 20 units off).
USER_GEARS = {'sunyshore': {'room': 3, 'buttons': {(6, 8): 1, (16, 13): 1, (6, 18): 2, (16, 18): 2},
                             'gaps': [(x, y) for x in (7, 8, 13, 14) for y in (3, 4, 5)]}}
GEAR_FRAMES = 64
GEAR_SHEET_COLUMNS = 8
GEAR_LEVEL_UNITS = 4
GEAR_LEVEL_STEP = 4
GEAR_STATES = 4
# Props the game places by its code, drawn in the gym's picture (model, and the tile centre it stands on, in the map's own
# tiles): Canalave Gym's lifts (the user's, 2026-11-02, from Diamond's gym): Byron's red one (297) in the top row's middle
# pit, and yellow ones (296) in the four pits of the second row and the bottom row's left one, each centred in its pit (a
# row above its lift tile, behaviour 0x6E, which is its pit's bottom row).
USER_PROPS = {'canalave': [(297, 16.5, 9.5)] + [(296, x + 0.5, 13.5) for x in (11, 19, 24)] + [(296, 21.5, 22.5)]}
# A gym's floor above, drawn above it as one map (the user's, 2026-11-02): Canalave Gym's top floor, Byron's (pokeplatinum's
# gym_features.c: canalave_gym_fourth_floor, model 302, 30 tiles up at 16,16, with its lifts where they start, and its
# walkable tiles, sCanalaveGymCollisionMaps[3]), its first `rows` rows on top, the gym below them; ridden up to from the
# ground floor's lift at 15,13 (model 296, drawn apart: dp_map.py --lift), arriving at `arrive` (16,9, where its red lift
# comes up below Byron), as Iron Island's lifts are ridden (the user's: in place of the gym's lifts and floors between).
USER_UPPER = {'canalave': {'height': 480, 'rows': 29, 'floor': 3, 'arrive': (16, 9), 'lift': (296, 15, 13),
                           'props': [(302, 16, 16), (297, 7.5, 9.5), (295, 19.5, 4.5), (295, 26.5, 26.5), (294, 29.5, 7.5), (294, 2.5, 23.5)]}}


def canalave_floor(floor):
    """pokeplatinum's Canalave Gym collision map for a floor (gym_features.c's sCanalaveGymCollisionMaps), as rows."""
    s = open(pt_data.fetch(os.path.join(tempfile.gettempdir(), 'pokeplatinum'), 'src/overlay008/gym_features.c'), encoding='utf-8').read()
    a = s.index('sCanalaveGymCollisionMaps[4]')
    nums = re.findall(r'\b[01]\b', s[s.index('{', a) + 1:s.index('};', a)])
    m = nums[floor * 1024:(floor + 1) * 1024]
    return [''.join('#' if m[z * 32 + x] == '1' else '.' for x in range(32)) for z in range(32)]
def gym_features(name):
    """pokeplatinum's gym_features.c, its table `name`'s text."""
    s = open(pt_data.fetch(os.path.join(tempfile.gettempdir(), 'pokeplatinum'), 'src/overlay008/gym_features.c'), encoding='utf-8').read()
    a = s.index(name)
    return s[a:s.index('};', a)]


def sunyshore_gears(room):
    """A Sunyshore Gym room's gears (model number in map_prop_models.order's order, x, y, z, initialRotation,
    turnsClockwise, isVertical), its collision regions (x, z, sizeX, sizeZ) and each state's blocked regions."""
    order = open(pt_data.fetch(os.path.join(tempfile.gettempdir(), 'pokeplatinum'), 'res/field/props/models/map_prop_models.order'), encoding='utf-8').read().split()
    gears = [(order.index(m[0] + '.nsbmd'), int(m[1]), int(m[2]), int(m[3]), int(m[4]), m[5] == 'TRUE', m[6] == 'TRUE') for m in re.findall(
        r'\.modelID = (\w+)_nsbmd,\s*\.x = (\d+),\s*\.y = (\d+),\s*\.z = (\d+),\s*\.initialRotation = (\d),\s*\.turnsClockwise = (\w+),\s*\.isVertical = (\w+)',
        gym_features(f'sSunyshoreRoom{room}Gears['))]
    regions = [tuple(map(int, m)) for m in re.findall(r'\.x = (\d+), \.z = (\d+), \.sizeX = (\d+), \.sizeZ = (\d+)', gym_features(f'sSunyshoreRoom{room}CollisionRegions['))]
    states = [[int(v) for v in re.findall(r'\d+', gym_features(f'sSunyshoreRoom{room}State{s}Collisions[]').split('{')[1])] for s in range(GEAR_STATES)]
    return gears, regions, states


def gear_props(room, state, frame=0):
    """The gears of a Sunyshore Gym room as dp_map.py --props, in a state: at their tiles' centres (a vertical one half a
    tile up), turned 90° for each of initialRotation, then 90° on (back if it turns clockwise) for each state
    (SunyshoreGym_SetGearRotation), and `frame` frames of a turn on from it (360° / GEAR_FRAMES each)."""
    turn = 90 * state + 360 / GEAR_FRAMES * frame
    return ';'.join(f"{m}@{x + 0.5},{z + 0.5},{y * 16 + (8 if v else 0)},r{'x' if v else 'y'}{90 * r + (-turn if cw else turn)}" for m, x, y, z, r, cw, v in sunyshore_gears(room)[0])


def floor_height(heights, x, y, ground):
    """The highest floor drawn on a tile in any of `heights` (the renders' heights, None for a state whose render it's
    no floor in), where its middle column meets it as tilted (tile_level's), or None."""
    found = []
    for h in heights:
        if h is None:
            continue
        col = h[:, x * TILE + TILE // 2]
        at = ~np.isnan(col) & (np.abs(np.arange(len(col)) - (y * TILE + TILE // 2 - (col - ground) * 0.6)) <= 1.5)
        found += [float(v) for v in col[at]]
    return max(found) if found else None


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


def render(work, name, map_const, apicula, cache, state=0):
    prefix = os.path.join(work, name + (f'_s{state}' if state else ''))
    if not os.path.exists(prefix + '.png'):
        props = ['--props', ';'.join(f'{m}@{x},{z}' for m, x, z in USER_PROPS[name])] if name in USER_PROPS else []
        props = ['--props', gear_props(USER_GEARS[name]['room'], state)] if name in USER_GEARS else props
        lift = ['--lift', '{}@{},{},0'.format(USER_UPPER[name]['lift'][0], USER_UPPER[name]['lift'][1] + 0.5, USER_UPPER[name]['lift'][2] + 0.5)] if name in USER_UPPER else []
        subprocess.run([sys.executable, os.path.join(HERE, 'dp_map.py'), prefix, map_const, '--apicula', apicula, '--cache', cache, *props, *lift], check=True)
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


def tile_level(heights, x, y, ground):
    """A tile's floor level (LEVEL_UNITS each, from the lowest, -2: Snowpoint Gym's pit), from the render's heights: the
    height drawn where the tile's middle column meets the floor as tilted (dp_map.py: y = z*16 - (height - ground)*0.6)."""
    for py in range(heights.shape[0]):
        v = heights[py, x * TILE + TILE // 2]
        if not np.isnan(v) and abs(py - (y * TILE + TILE // 2 - (v - ground) * 0.6)) <= 1.5:
            return max(0, min(9, round((float(v) + 2) / LEVEL_UNITS)))
    return None


def tile_levels(heights, x0, y0, x1, y1, ground):
    """Each tile's level (tile_level) as rows of digits; one whose floor isn't seen (hidden behind a statue: Snowpoint Gym's
    9,26 and 13,26) is its nearest seen neighbour's in the row, else 0."""
    out = []
    for y in range(y0, y1 + 1):
        row = [tile_level(heights, x, y, ground) for x in range(x0, x1 + 1)]
        seen = [i for i, v in enumerate(row) if v is not None]
        out.append(''.join(str(v if v is not None else row[min(seen, key=lambda j: abs(j - i))] if seen else 0) for i, v in enumerate(row)))
    return out


def gym_ts(const, title, doc, image, w, h, door, spots, stands, guide, rows, overhead=None, track=None, links=(), lifts=(), slides=None, gears=None):
    legs = lambda: ', '.join('{ ' + ('under: true, ' if leg.get('under') else '') + f"to: [{', '.join(f'[{x}, {y}]' for x, y in leg['to'])}] }}" for leg in track['legs'])
    track_ = f"\n  track: trackLine([{track['start'][0]}, {track['start'][1]}], {legs()})," if track else ''
    lifts_ = ('\n  lifts: [' + ', '.join(f"{{ image: '{i}', top: {{ x: {t[0]}, y: {t[1]} }}, bottom: {{ x: {b[0]}, y: {b[1]} }}, offset: {{ x: {o[0]}, y: {o[1]} }} }}" for i, t, b, o in lifts) + '],') if lifts else ''
    links_ = ('\n  links: [' + ', '.join(f'[{{ x: {a[0]}, y: {a[1]} }}, {{ x: {b[0]}, y: {b[1]} }}]' for a, b in links) + '],') if links else ''
    pts = lambda ps: '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in ps)
    walk = '\n'.join(f"    '{r}'," for r in rows)
    name = f'"{title}"' if "'" in title else f"'{title}'"
    npcs = f"\n  npcs: [{{ sprite: 'dp/sunglasses', tile: {{ x: {guide[0]}, y: {guide[1]} }}, face: 'down' }}]," if guide else ''
    grid = lambda k, rs: f'%s  {k}: [' % chr(10) + ''.join(f"%s    '{r}'," % chr(10) for r in rs) + '%s  ],' % chr(10)
    # (Its people drawn by their level below its door's, the picture's ground, wherever a run comes in: leaderRoom.)
    slides_ = (grid('ice', slides['ice']) + grid('levels', slides['levels']) + '%s  levelPx: %s,%s  levelGround: %s,' % (chr(10), round(LEVEL_UNITS * 0.6, 2), chr(10), slides['levels'][door[1]][door[0]]) + grid('stairs', slides['stairs']) +
               '%s  snowballs: [' % chr(10) + ', '.join(f'{{ x: {x}, y: {y} }}' for x, y in slides['balls']) + "],%s  snowballImage: '/overworld/dp/snowball.png'," % chr(10)) if slides else ''
    spot = lambda t: f'{{ x: {t[0]}, y: {t[1]} }}'
    if gears:
        slides_ += (grid('levels', gears['levels']) + '%s  levelPx: %s,%s  levelStep: %s,%s  levelGround: %s,' % (chr(10), round(GEAR_LEVEL_UNITS * 0.6, 2), chr(10), GEAR_LEVEL_STEP, chr(10), gears['ground'])
                    + '%s  gears: {%s    blocked: [' % (chr(10), chr(10)) + ''.join('%s      [%s],' % (chr(10), ', '.join(spot(t) for t in b)) for b in gears['blocked'])
                    + '%s    ],%s    buttons: [%s],' % (chr(10), chr(10), ', '.join(f'{{ tile: {spot(t)}, turns: {n} }}' for t, n in gears['buttons']))
                    + '%s    frames: { %s },%s  },' % (chr(10), ', '.join(f"{k}: '{v}'" if isinstance(v, str) else f'{k}: {v}' for k, v in gears['frames'].items()), chr(10)))
    return f"""
/** {doc} */
export const {const}: Route = {{
  flow: 'up',
  sprites: 'dp',
  name: {name},
  image: '/routes/{image}',{f"{chr(10)}  overhead: '/routes/{overhead}'," if overhead else ''}
  width: {w * TILE},
  height: {h * TILE},
  entrance: {{ x: {door[0]}, y: {door[1]} }},{track_}{links_}{lifts_}
  spots: [
{pts(spots)}
  ],
  stands: [
{pts(stands)}
  ],{npcs}
  walkable: [
{walk}
  ],{slides_}
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
        links, who, never, lifts = [], None, [], []
        if city in USER_UPPER:
            # The floor above (its props alone, seen from its height) on top, the gym below it; the gym's people and
            # doors moved down with it, but the leader, who's on the floor above.
            u = USER_UPPER[city]; oy = u['rows']
            top = os.path.join(work, city + '_top')
            if not os.path.exists(top + '.png'):
                subprocess.run([sys.executable, os.path.join(HERE, 'dp_map.py'), top, map_const, '--apicula', apicula, '--cache', cache, '--no-land', '--ground', str(u['height']),
                                '--props', ';'.join(f'{m}@{x},{z},{u["height"]}' for m, x, z in u['props'])], check=True)
            ground = Image.open(prefix + '.png')
            joined = Image.new('RGBA', (ground.width, (oy + len(rows)) * TILE))
            joined.paste(Image.open(top + '.png').crop((0, 0, ground.width, oy * TILE)), (0, 0))
            joined.paste(ground, (0, oy * TILE))
            rows = canalave_floor(u['floor'])[:oy] + rows
            lead = leader_sprite(events, sprites)
            events = {'objects': [o if o['sprite'] == lead else {**o, 'z': o['z'] + oy} for o in events['objects']], 'warps': [{**w, 'z': w['z'] + oy} for w in events['warps']]}
            ride = json.load(open(prefix + '.json'))['lift']
            bottom = (u['lift'][1], u['lift'][2] + oy)
            offset = (ride['offset'][0] + (ride['bottom'][0] - bottom[0]) * TILE, ride['offset'][1] + (ride['bottom'][1] + oy - bottom[1]) * TILE)
            lifts = [(u['arrive'], bottom, offset)]
            shutil.copy(prefix + '_lift.png', os.path.join(PUBLIC, f'{city}_gym_lift.png'))
            prefix = os.path.join(work, city + '_joined')
            joined.save(prefix + '.png')
            for x, y in (t for l in lifts for t in l[:2]):
                rows[y] = rows[y][:x] + '.' + rows[y][x + 1:]
        if city in USER_PLATINUM:
            prefix, rows, door, spots, stands, guide, who, links, never = platinum_gym(USER_PLATINUM[city], work, city, apicula)
            trainer = None
        else:
            rows, door, spots, stands, guide, trainer = place(rows, events, warp_to and headers[warp_to]['id'], leader_sprite(events, sprites), sprites['SUNGLASSES'], cache)
        keep = [t for a, b in links + [l[:2] for l in lifts] for t in [*bfs(rows, a), *bfs(rows, b)]]
        x0, y0, x1, y1 = crop_box(rows, door, [*spots, *stands] + ([guide] if guide else []) + keep)
        gears = None
        if city in USER_GEARS:
            for x, y in USER_GEARS[city]['gaps']:
                rows[y] = rows[y][:x] + '#' + rows[y][x + 1:]
            # Each tile's level, the highest floor drawn there in any state its arm is there in (an arm's, where one's
            # ever there, flat); the picture as low as its lowest floor is drawn (people drawn lower on it: dropAt).
            ground = json.load(open(prefix + '.json'))['ground']
            _, regions, states = sunyshore_gears(USER_GEARS[city]['room'])
            off = [{(x, z) for i in states[s] for x in range(regions[i][0], regions[i][0] + regions[i][2]) for z in range(regions[i][1], regions[i][1] + regions[i][3])} for s in range(GEAR_STATES)]
            heights = [np.load(render(work, city, map_const, apicula, cache, s)[0] + '_height.npy') for s in range(GEAR_STATES)]
            floor = [[floor_height([h if (x, y) not in off[s] else None for s, h in enumerate(heights)], x, y, ground) for x in range(len(rows[0]))] for y in range(len(rows))]
            level = lambda h: max(0, min(35, round(h / GEAR_LEVEL_UNITS)))
            lowest = min(level(h) for r in floor for h in r if h is not None)
            y1 = min(len(rows) - 1, y1 + math.ceil((level(ground) - lowest) * GEAR_LEVEL_UNITS * 0.6 / TILE))
            base36 = lambda n: '0123456789abcdefghijklmnopqrstuvwxyz'[n]
            gears = {'levels': [''.join(base36(level(floor[y][x]) if floor[y][x] is not None else lowest) for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)],
                     'ground': level(ground),
                     'blocked': [[(x - x0, z - y0) for i in states[s] for x in range(regions[i][0], regions[i][0] + regions[i][2]) for z in range(regions[i][1], regions[i][1] + regions[i][3])] for s in range(GEAR_STATES)],
                     'buttons': [((x - x0, y - y0), n) for (x, y), n in USER_GEARS[city]['buttons'].items()]}
            # Every frame of a whole turn from state 0 (each state's GEAR_FRAMES / 4 frames on), the room drawn once.
            frames = os.path.join(work, city + '_frames')
            if not os.path.exists(f'{frames}_f{GEAR_FRAMES - 1}.png'):
                json.dump([gear_props(USER_GEARS[city]['room'], 0, f) for f in range(GEAR_FRAMES)], open(frames + '.json', 'w'))
                subprocess.run([sys.executable, os.path.join(HERE, 'dp_map.py'), frames, map_const, '--apicula', apicula, '--cache', cache, '--frames', frames + '.json'], check=True)
            box = (x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE)
            pics = [np.asarray(Image.open(f'{frames}_f{f}.png').convert('RGBA').crop(box)) for f in range(GEAR_FRAMES)]
            # Only the part of the picture the gears change, a sheet of its frames.
            moved = np.any([np.any(p != pics[0], axis=2) for p in pics], axis=0)
            ys, xs = np.nonzero(moved)
            part = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
            pw, ph = part[2] - part[0], part[3] - part[1]
            sheet = Image.new('RGBA', (pw * GEAR_SHEET_COLUMNS, ph * math.ceil(GEAR_FRAMES / GEAR_SHEET_COLUMNS)))
            for f, p in enumerate(pics):
                sheet.paste(Image.fromarray(p).crop(part), (f % GEAR_SHEET_COLUMNS * pw, f // GEAR_SHEET_COLUMNS * ph))
            # (In 256 colours: the DS's own are fewer, and it's 64 frames.)
            sheet.quantize(256, dither=Image.Dither.NONE).save(os.path.join(PUBLIC, f'{city}_gym_gears.png'), optimize=True)
            gears['frames'] = {'image': f'/routes/{city}_gym_gears.png', 'x': part[0], 'y': part[1], 'width': pw, 'height': ph, 'columns': GEAR_SHEET_COLUMNS, 'count': GEAR_FRAMES}
        shift = lambda t: (t[0] - x0, t[1] - y0)
        links = [(shift(a), shift(b)) for a, b in links]
        lifts = [(shift(a), shift(b), o) for a, b, o in lifts]
        never = [shift(t) for t in never]
        rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
        slides = None
        if city in USER_SLIDES:
            j = json.load(open(prefix + '.json'))
            heights = np.load(prefix + '_height.npy')
            slides = {'ice': [r[x0:x1 + 1] for r in j['ice'][y0:y1 + 1]], 'stairs': [r[x0:x1 + 1] for r in j['stairs'][y0:y1 + 1]],
                      'levels': tile_levels(heights, x0, y0, x1, y1, j['ground']),
                      'balls': [shift((o['x'], o['z'])) for o in events['objects'] if o['sprite'] == SNOWBALL]}
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
            # Only the track's tiles walkable (in the rows it's for, if it says).
            on = set(track_tiles(track))
            y0_, y1_ = track.get('rows', (0, len(rows)))
            rows = [''.join('.' if (x, y) in on else '#' if y0_ <= y <= y1_ else c for x, c in enumerate(r)) for y, r in enumerate(rows)]
        # (A link is walked from its first tile to its second; a lift ridden up, from its bottom to its top.)
        ridden = links + [(l[1], l[0]) for l in lifts]
        if spots[0] not in bfs(rows, door, ridden):
            problems.append((city, 'door', door, 'Gym Trainer spot', spots[0]))
        if spots[1] not in bfs(rows, spots[0], ridden):
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
        lifts_ = [(f'/routes/{city}_gym_lift.png', a, b, o) for a, b, o in lifts]
        if slides:
            doc = doc[:-1] + f", its ice slid across as Mahogany Gym's (the user's): never up a ramp but by its stairs, its snowballs ({', '.join(f'{x},{y}' for x, y in slides['balls'])}, the map's) crushed by a slide into them."
        if gears:
            doc = doc[:-1] + f", its gears' bridges turned by its buttons ({', '.join(f'{x},{y}' for (x, y), _ in gears['buttons'])}), walked across where they are, as Diamond has them (the user's)."
        out.append(gym_ts(const, title, doc, image, len(rows[0]), len(rows), door, spots, stands, guide, rows, overhead, track, links, lifts_, slides, gears))
        entrances[boss] = (const, USER_LEADER_ENTRANCE.get(city) or entrance_near(rows, spots[1]), USER_LEADER_OPEN.get(city, []))
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
    lines = [f'  {key(b)}: leaderRoom({c}, {{ x: {e[0]}, y: {e[1]} }}' + (', [' + ', '.join(f'{{ x: {x}, y: {y} }}' for x, y in o) + ']' if o else '') + '),' for b, (c, e, o) in entrances.items()]
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
