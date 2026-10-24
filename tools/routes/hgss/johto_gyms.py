"""Makes the Johto gyms' interiors, as the Kanto gyms have theirs (kanto-routes.ts), and writes
packages/campaign/src/johto-gyms.ts, copying the images to apps/web/public/routes/<city>_gym.png:

- each gym's leader's room rendered by hgss_map.py (--room; Azalea's and Mahogany's gyms are several maps, and only the
  leader's is shown, agreed with the user), cropped to the room;
- from the map's events (zone_event): the door the player comes in at (the warp out to the town, walkable here), the
  Gym Trainer where the gym's trainer nearest halfway in along the walk to the leader stands (the player beside them, on
  the side they face), the leader in their place (the player below them), and the Gym Guide where there is one.
  Olivine's gym has no trainers, so its Gym Trainer stands where its girl does (Olivine's pool is the Lighthouse's,
  bosses.ts);
- the Johto Gym Challenge and Champion runs' rooms (as Kanto's KANTO_BOSS_ROOMS): each gym's leader-only version (the
  player coming in 5 tiles from the leader, south where it can), the Pokémon League's rooms (hgss_pokemonleague_<boss>s_room.png)
  and Ecruteak's Pokémon Center (hgss_ecruteak_pokemoncenter_1f.png), with JOHTO_BOSS_ROOMS.

Usage: python johto_gyms.py [--apicula <apicula.exe>] [--cache <dir>] [--work <dir>]
(--work: where the renders go, a temporary directory by default; each gym also gets a <city>-preview.png there with its
door, stands and spots marked.) Needs numpy and Pillow, and apicula. Prints any walk it can't find (a gym puzzle the
map data doesn't show: fixes come from the user, as for Kanto)."""
import json, os, subprocess, sys, tempfile
from collections import deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import hgss_data as hd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes')
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'johto-gyms.ts')
TILE = 16
EVENTS = 'files/fielddata/eventdata/zone_event/'

# Each gym: its map, its events file, the warp out to the town (its map), its constant and name.
GYMS = {
    'violet': ('MAP_VIOLET_GYM', '131_T22GYM0101', 'MAP_VIOLET', 'VIOLET_GYM', 'Violet Gym'),
    'azalea': ('MAP_AZALEA_GYM', '173_T23GYM0102', 'MAP_AZALEA_GYM_ENTRANCE', 'AZALEA_GYM', 'Azalea Gym'),
    'goldenrod': ('MAP_GOLDENROD_GYM', '133_T25GYM0101', 'MAP_GOLDENROD', 'GOLDENROD_GYM', 'Goldenrod Gym'),
    'ecruteak': ('MAP_ECRUTEAK_GYM', '077_T27GYM0101', 'MAP_ECRUTEAK', 'ECRUTEAK_GYM', 'Ecruteak Gym'),
    'cianwood': ('MAP_CIANWOOD_GYM', '135_T24GYM0101', 'MAP_CIANWOOD', 'CIANWOOD_GYM', 'Cianwood Gym'),
    'olivine': ('MAP_OLIVINE_GYM', '134_T26GYM0101', 'MAP_OLIVINE', 'OLIVINE_GYM', 'Olivine Gym'),
    'mahogany': ('MAP_MAHOGANY_GYM_LEADER_ROOM', '136_T28GYM0101', 'MAP_MAHOGANY_GYM_ROOM_2', 'MAHOGANY_GYM', 'Mahogany Gym'),
    'blackthorn': ('MAP_BLACKTHORN_GYM', '137_T30GYM0101', 'MAP_BLACKTHORN', 'BLACKTHORN_GYM', 'Blackthorn Gym'),
}
# The Johto Gym Challenge and Champion runs' other rooms (as Kanto's KANTO_BOSS_ROOMS): the Elite Four's and Lance's at
# the Pokémon League (their map, events, the boss's sprite, the boss id, constant and name), and the Pokémon Center after
# the fourth gym, Ecruteak's (the nurse's sprite).
LEAGUE = {
    'will': ('MAP_POKEMON_LEAGUE_WILL_ROOM', '272_T10R0201', 'SPRITE_GSBIGFOUR1', 'will', 'WILLS_ROOM', "Will's Room"),
    'koga': ('MAP_POKEMON_LEAGUE_KOGA_ROOM', '273_T10R0301', 'SPRITE_GSBIGFOUR2', 'johto-koga', 'KOGAS_ROOM', "Koga's Room"),
    'bruno': ('MAP_POKEMON_LEAGUE_BRUNO_ROOM', '274_T10R0401', 'SPRITE_GSBIGFOUR3', 'johto-bruno', 'BRUNOS_ROOM', "Bruno's Room"),
    'karen': ('MAP_POKEMON_LEAGUE_KAREN_ROOM', '275_T10R0501', 'SPRITE_GSBIGFOUR4', 'karen', 'KARENS_ROOM', "Karen's Room"),
    'lance': ('MAP_POKEMON_LEAGUE_LANCE_ROOM', '276_T10R0601', 'SPRITE_WATARU', 'johto-lance', 'LANCES_ROOM', "Lance's Room"),
}
CENTER = ('MAP_ECRUTEAK_POKECENTER_1F', '078_T27PC0101', 'MAP_ECRUTEAK', 'SPRITE_PCWOMAN1')
# The boss ids of the Johto gyms' leaders, for their leader-only rooms.
LEADERS = {'violet': 'falkner', 'azalea': 'bugsy', 'goldenrod': 'whitney', 'ecruteak': 'morty', 'cianwood': 'chuck', 'olivine': 'jasmine', 'mahogany': 'pryce', 'blackthorn': 'clair'}
# The user's Gym Trainer places, in place of the generator's (in the cropped map's tiles): the player's spot and where
# the Gym Trainer stands.
USER_GYM_TRAINER = {
    'azalea': {'spot': (9, 20), 'stand': (7, 20)},
    'goldenrod': {'spot': (7, 10), 'stand': (6, 10)},
    'cianwood': {'spot': (5, 9), 'stand': (4, 9)},
}
# The user's links (fading walks between tiles the map data doesn't join), in the cropped map's tiles: Azalea's Spinarak
# carts, from the door's floor to the middle one (9,33 to 9,23) and from there to Bugsy's (9,18 to 9,8).
USER_LINKS = {
    'azalea': [((9, 33), (9, 23)), ((9, 18), (9, 8))],
    # Blackthorn Gym's warp panels, floor to floor: the door's to the middle floor's added one, the middle floor's own to
    # the upper floor's (the Gym Trainer's), and the upper floor's added one to Clair's (the user's).
    'blackthorn': [((7, 83), (12, 64)), ((2, 62), (22, 41)), ((13, 38), (4, 9))],
}
# What a gym's links are, for its doc.
LINK_NAMES = {'azalea': 'Spinarak carts', 'blackthorn': 'warp panels'}
# The user's added warp panels (in the cropped map's tiles): each a copy of the panel at `from` (cut from the render
# against the floor 3 tiles right of it: only what's lighter than the floor, the beam, or blue or green, the panel),
# pasted on these tiles. Blackthorn Gym's own four can't take the player all the way to Clair (in the game its moving
# platforms cross the lava, which aren't drawn), so two more pair with them (the user's).
USER_PADS = {
    'blackthorn': {'from': (7, 83), 'at': [(12, 64), (13, 38)]},
}
# The user's floors (the only walkable tiles, in the cropped map's tiles): rectangles (left, top, right, bottom). Ecruteak
# Gym: the brown walkways, Morty's platform and the entrance room, never the grey (the invisible floor's pit).
USER_FLOORS = {
    'ecruteak': [(2, 3, 4, 5), (1, 6, 5, 6), (3, 7, 3, 13), (3, 14, 4, 15), (4, 16, 4, 23), (5, 15, 6, 15), (6, 16, 6, 17), (5, 18, 6, 18), (2, 24, 13, 24), (5, 25, 7, 25), (12, 25, 13, 26),
                 (12, 27, 12, 32), (9, 33, 12, 34), (9, 35, 9, 43), (8, 44, 10, 45), (7, 46, 11, 46), (6, 47, 12, 48)],
    # Blackthorn Gym: its four floors (the door's, the middle one, the Gym Trainer's and Clair's), never the lava (walkable
    # in the map data: in the game its moving platforms cross it), the statues or the spikes; the warp panels walkable.
    'blackthorn': [(10, 3, 12, 4), (11, 5, 11, 5), (10, 6, 13, 6), (9, 7, 13, 8), (4, 9, 13, 10), (12, 37, 14, 39), (12, 40, 19, 40), (12, 41, 23, 42), (15, 43, 20, 45),
                   (17, 46, 20, 47), (18, 48, 20, 51), (19, 52, 20, 56), (18, 57, 20, 58), (4, 60, 6, 60), (2, 61, 7, 61), (2, 62, 11, 62), (2, 63, 13, 63), (4, 64, 13, 65),
                   (8, 66, 13, 66), (11, 67, 13, 70), (11, 80, 13, 81), (7, 82, 16, 82), (7, 83, 17, 84), (7, 85, 9, 86), (11, 85, 13, 86), (15, 85, 17, 86), (7, 87, 10, 87),
                   (12, 87, 17, 87)],
}
# What a gym's floors are, for its doc.
FLOOR_NAMES = {'ecruteak': 'the brown walkways', 'blackthorn': 'its four floors, never the lava'}
# The user's tiles not walkable (in the cropped map's tiles): rectangles (left, top, right, bottom).
USER_BLOCKED = {
    'cianwood': [(1, 11, 5, 11), (7, 11, 10, 11)],
    'olivine': [(3, 5, 3, 5), (5, 5, 5, 5)],
}
# The user's tracks (the one way through, in the cropped map's tiles; only its tiles walkable): from the door, the corners
# walked over the walkways and stairs, then those walked under the bridges ('under'); and the bridges' tiles (left, top,
# right, bottom), drawn over the player while he's under them. Goldenrod Gym: the green walkways are bridges, and only the
# line drawn is walked (the user's), past the Gym Trainer to Whitney (13,5).
USER_TRACKS = {
    'goldenrod': {
        'start': (6, 25),
        'over': [(6, 22), (3, 22), (3, 20), (2, 20), (2, 17), (4, 17), (4, 16), (6, 16), (6, 14), (7, 14), (7, 9), (10, 9), (10, 8), (17, 8), (17, 9), (22, 9), (22, 11), (23, 11), (23, 12), (26, 12), (26, 8), (19, 8)],
        'under': [(19, 15), (13, 15), (13, 5)],
        'bridges': [(12, 8, 14, 9), (18, 9, 20, 10)],
    },
}
# The user's overheads: a gym's materials drawn over the player walking under them (hgss_map.py's --overhead), always.
# Olivine Gym: the steel arches and their gems, from row 9 down (the gems' material has glints by Jasmine too).
USER_OVERHEAD = {
    'olivine': (['tekkin', 'houseki3', 'j_houseki_lm1', 'j_houseki2_lm1'], 9),
}
FACE = {0: 'up', 1: 'down', 2: 'left', 3: 'right'}
STEP = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}
# How far past the room's walkable tiles the image goes: its walls above (drawn tilted), a tile elsewhere.
MARGIN = {'top': 3, 'side': 1, 'bottom': 1}


def bfs(rows, start, links=()):
    """Steps from `start` to every tile walked to, over walkable tiles and through `links` (pairs of tiles, both ways)."""
    h, w = len(rows), len(rows[0])
    dist = {start: 0}; q = deque([start])
    while q:
        x, y = q.popleft()
        through = [b for a, b in links if a == (x, y)] + [a for a, b in links if b == (x, y)]
        for n in [(x + dx, y + dy) for dx, dy in STEP.values()] + through:
            if 0 <= n[0] < w and 0 <= n[1] < h and rows[n[1]][n[0]] == '.' and n not in dist:
                dist[n] = dist[(x, y)] + 1; q.append(n)
    return dist


def nearest_walkable(rows, t, toward=None):
    """`t` if it can be walked on, else the walkable tile nearest it (first `toward` that way)."""
    h, w = len(rows), len(rows[0])
    if rows[t[1]][t[0]] == '.':
        return t
    cands = [(x, y) for y in range(h) for x in range(w) if rows[y][x] == '.']
    return min(cands, key=lambda c: (abs(c[0] - t[0]) + abs(c[1] - t[1]), 0 if toward is None else -((c[0] - t[0]) * toward[0] + (c[1] - t[1]) * toward[1])))


def place(name, rows, events, warp_to):
    """The door, the Gym Trainer's and leader's stands and the player's spots, and the guide, from the map's events."""
    rows = [list(r) for r in rows]
    door = next((w['x'], w['z']) for w in events['warps'] if w['header'] == warp_to)
    rows[door[1]][door[0]] = '.'
    rows = [''.join(r) for r in rows]
    objs = events['objects']
    leader = next(o for o in objs if o['spriteId'].startswith('SPRITE_GSLEADER'))
    lstand = (leader['x'], leader['z'])
    lspot = nearest_walkable(rows, (lstand[0], lstand[1] + 1), (0, 1))
    trainers = [o for o in objs if 'trainer' in str(o['scriptId'])]
    if not trainers:
        # Olivine: the girl who stands in its gym.
        trainers = [o for o in objs if o['spriteId'] == 'SPRITE_GSGIRL1']
    from_door = bfs(rows, door)
    half = from_door.get(lspot, 0) / 2

    def spot_of(o):
        dx, dy = STEP[FACE[o['facingDirection']]]
        return nearest_walkable(rows, (o['x'] + dx, o['z'] + dy), (dx, dy))
    # Trainers with no walk to them from the door come last; then the one nearest halfway in.
    trainer = min(trainers, key=lambda o: (spot_of(o) not in from_door, abs(from_door.get(spot_of(o), 1e9) - half)))
    tstand, tspot = (trainer['x'], trainer['z']), spot_of(trainer)
    guide = next(((o['x'], o['z']) for o in objs if o['spriteId'] == 'SPRITE_SUNGLASSES'), None)
    gaps = []
    if tspot not in from_door:
        gaps.append(('door', door, 'Gym Trainer spot', tspot))
    if lspot not in bfs(rows, tspot):
        gaps.append(('Gym Trainer spot', tspot, 'leader spot', lspot))
    return rows, door, [tspot, lspot], [tstand, lstand], guide, gaps, trainer


def entrance_near(rows, spot):
    """Where the player comes in for a boss's room: 4 steps from their spot (5 tiles from them, as Kanto's), straight
    south where the room allows, else the most southern such tile, nearest the spot's column."""
    dist = bfs(rows, spot)
    for steps in (4, 3, 5, 2):
        cands = [t for t, d in dist.items() if d == steps]
        if cands:
            return min(cands, key=lambda t: (t != (spot[0], spot[1] + steps), -t[1], abs(t[0] - spot[0])))
    return spot


def boss_room(rows, events, boss_sprite, door_to=None):
    """A room with one boss (an Elite Four member, Lance) or the Pokémon Center's nurse (`door_to`: the warp the player
    comes in by, made walkable): their stand, the player's spot (below the boss; across the counter from the nurse) and
    the entrance (5 tiles from the boss; the Center's door)."""
    rows = [list(r) for r in rows]
    door = None
    if door_to:
        door = next((w['x'], w['z']) for w in events['warps'] if w['header'] == door_to)
        rows[door[1]][door[0]] = '.'
    rows = [''.join(r) for r in rows]
    who = next(o for o in events['objects'] if o['spriteId'] == boss_sprite)
    stand = (who['x'], who['z'])
    spot = nearest_walkable(rows, (stand[0], stand[1] + (2 if door_to else 1)), (0, 1))
    return rows, stand, spot, door or entrance_near(rows, spot)


def render(work, name, map_const, apicula, cache):
    prefix = os.path.join(work, name)
    if not os.path.exists(prefix + '.png'):
        subprocess.run([sys.executable, os.path.join(HERE, 'hgss_map.py'), prefix, map_const, '--room', '--apicula', apicula, '--cache', cache], check=True)
    return prefix, json.load(open(prefix + '.json'))['rows']


def crop_box(rows, door, keep):
    """The room: the bounds of the tiles walked to from its door (and `keep`'s: the people), with MARGIN round them.
    Tiles outside the room can count as walkable in the map data, so only the door's area counts."""
    h, w = len(rows), len(rows[0])
    tiles = list(bfs(rows, door)) + keep
    x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(w - 1, max(t[0] for t in tiles) + MARGIN['side'])
    y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(h - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
    return x0, y0, x1, y1


def paste_pads(im, pads):
    """`im` (the cropped room, RGBA) with copies of the warp panel at `pads['from']` pasted on `pads['at']` (USER_PADS)."""
    import numpy as np
    px = np.array(im).astype(int)
    x, y = pads['from']
    # The panel's tile and the beam above it, half a tile each side; the floor 3 tiles right (it repeats every 16 px).
    left, top = x * TILE - 8, y * TILE - 16
    a, b = px[top:top + 32, left:left + 32, :3], px[top:top + 32, left + 48:left + 80, :3]
    lum = lambda c: c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11
    mask = (np.abs(a - b).sum(axis=2) > 24) & ((lum(a) > lum(b) + 6) | (a[..., 2] - a[..., 0] > 8) | (a[..., 1] - a[..., 0] > 8))
    mask[:, :8] = False; mask[:, 25:] = False
    sprite = np.zeros((32, 32, 4), np.uint8); sprite[..., :3] = a; sprite[..., 3] = mask * 255
    sprite = Image.fromarray(sprite)
    for tx, ty in pads['at']:
        im.alpha_composite(sprite, (tx * TILE - 8, ty * TILE - 16))
    return im


def track_tiles(track):
    """A user track's tiles, every one on the way from corner to corner."""
    tiles = [track['start']]
    for x, y in track['over'] + track['under']:
        x0, y0 = tiles[-1]
        assert x == x0 or y == y0, ('track corner not in line', (x0, y0), (x, y))
        dx, dy = (x > x0) - (x < x0), (y > y0) - (y < y0)
        while tiles[-1] != (x, y):
            tiles.append((tiles[-1][0] + dx, tiles[-1][1] + dy))
    return tiles


def gym_ts(const, title, doc, image, w, h, door, spots, stands, guide, rows, links=(), track=None, overhead=False, ice=None, blocks=()):
    pts = lambda ps: '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in ps)
    corners = lambda ps: ', '.join(f'[{x}, {y}]' for x, y in ps)
    track_ = (f"\n  overhead: '/routes/{image.replace('.png', '_overhead.png')}',"
              f"\n  track: trackLine([{track['start'][0]}, {track['start'][1]}], {{ to: [{corners(track['over'])}] }}, {{ under: true, to: [{corners(track['under'])}] }}),") if track else \
        f"\n  overhead: '/routes/{image.replace('.png', '_overhead.png')}'," if overhead else ''
    links_ = '\n  links: [' + ', '.join(f'[{{ x: {a[0]}, y: {a[1]} }}, {{ x: {b[0]}, y: {b[1]} }}]' for a, b in links) + '],' if links else ''
    walk = '\n'.join(f"    '{r}'," for r in rows)
    # The ice (the map's ice behaviour), slid across, on a gym with any.
    ice_ = ('\n  ice: [' + ''.join(f"\n    '{r}'," for r in ice) + '\n  ],') if ice and any('i' in r for r in ice) else ''
    # Double quotes for a name with an apostrophe ("Will's Room"), as kanto-routes.ts has them.
    name = f'"{title}"' if "'" in title else f"'{title}'"
    people = ([('hgss/gym_guide', guide)] if guide else []) + [('hgss/ice', b) for b in blocks]
    npcs = ("\n  npcs: [" + ', '.join(f"{{ sprite: '{sprite}', tile: {{ x: {x}, y: {y} }}, face: 'down' }}" for sprite, (x, y) in people) + '],') if people else ''
    return f"""
/** {doc} */
export const {const}: Route = {{
  flow: 'up',
  sprites: 'hgss',
  name: {name},
  image: '/routes/{image}',
  width: {w * TILE},
  height: {h * TILE},
  entrance: {{ x: {door[0]}, y: {door[1]} }},{links_}{track_}
  spots: [
{pts(spots)}
  ],
  stands: [
{pts(stands)}
  ],{npcs}
  walkable: [
{walk}
  ],{ice_}
}};
"""


HEAD = """// The Johto gyms' interiors, from HeartGold/SoulSilver (the pret/pokeheartgold decompilation; tools/routes/hgss/), as
// the Kanto gyms have FireRed's (kanto-routes.ts): each the leader's room, drawn as the Johto routes are (hgss_map.py),
// cropped to the room. The door the player comes in at, the Gym Trainer where the gym's trainer nearest halfway in
// stands (the player beside them, on the side they face), the leader in their place (the player below them), and the Gym
// Guide where there is one, all from the map's events. Walking connections the map data doesn't show (a gym's puzzle)
// come from the user, as `links` or walkable tiles. Then the Johto Gym Challenge and Champion runs' other rooms, as Kanto's:
// the Pokémon League's, each boss in their place and the player coming in 5 tiles from them, and Ecruteak's Pokémon
// Center; and each boss's map for those runs (JOHTO_BOSS_ROOMS). Written by tools/routes/hgss/johto_gyms.py.
import type { JohtoBossId } from './bosses.js';
import { leaderRoom, trackLine, type Route } from './routes.js';
"""


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokeheartgold'))
    work = opt('--work', None) or tempfile.mkdtemp(prefix='johto_gyms_')
    os.makedirs(work, exist_ok=True)
    out, problems, entrances = [], [], {}
    for city, (map_const, events_file, warp_to, const, title) in GYMS.items():
        prefix = os.path.join(work, city)
        if not os.path.exists(prefix + '.png'):
            over = ['--overhead', ','.join(USER_OVERHEAD[city][0])] if city in USER_OVERHEAD else []
            subprocess.run([sys.executable, os.path.join(HERE, 'hgss_map.py'), prefix, map_const, '--room', *over, '--apicula', apicula, '--cache', cache], check=True)
        rows, ice = (json.load(open(prefix + '.json')).get(k) for k in ('rows', 'ice'))
        events = json.load(open(hd.fetch(cache, EVENTS + events_file + '.json'), encoding='utf-8'))
        rows, door, spots, stands, guide, _, trainer = place(city, rows, events, warp_to)
        x0, y0, x1, y1 = crop_box(rows, door, [*spots, *stands] + ([guide] if guide else []))
        shift = lambda t: (t[0] - x0, t[1] - y0)
        rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
        ice = ice and [r[x0:x1 + 1] for r in ice[y0:y1 + 1]]
        door, spots, stands = shift(door), [shift(s) for s in spots], [shift(s) for s in stands]
        guide = guide and shift(guide)
        # The ice blocks on the ice (Mahogany Gym's: the map's SPRITE_ICE objects), each blocking its tile: drawn as
        # people are (HGSS's ice block sprite, hgss/ice), and slides stop against them.
        blocks = [shift((o['x'], o['z'])) for o in events['objects'] if o['spriteId'] == 'SPRITE_ICE']
        floors = USER_FLOORS.get(city)
        if floors:
            rows = [''.join('.' if any(l <= x <= r and t <= y <= b for l, t, r, b in floors) else '#' for x in range(len(row))) for y, row in enumerate(rows)]
        track = USER_TRACKS.get(city)
        if track:
            on = set(track_tiles(track))
            rows = [''.join('.' if (x, y) in on else '#' for x in range(len(r))) for y, r in enumerate(rows)]
        blocked = USER_BLOCKED.get(city, []) + [(x, y, x, y) for x, y in blocks]
        rows = [''.join('#' if any(l <= x <= r and t <= y <= b for l, t, r, b in blocked) else c for x, c in enumerate(row)) for y, row in enumerate(rows)]
        user = USER_GYM_TRAINER.get(city)
        if user:
            assert rows[user['spot'][1]][user['spot'][0]] == '.', (city, 'user Gym Trainer spot not walkable')
            spots[0], stands[0] = user['spot'], user['stand']
        # The walks from the door to the Gym Trainer and on to the leader (through the user's links), with any missing.
        links = USER_LINKS.get(city, [])
        for a, b in links:
            assert rows[a[1]][a[0]] == '.' and rows[b[1]][b[0]] == '.', (city, 'user link not walkable', a, b)
        if spots[0] not in bfs(rows, door, links):
            problems.append((city, 'door', door, 'Gym Trainer spot', spots[0]))
        if spots[1] not in bfs(rows, spots[0], links):
            problems.append((city, 'Gym Trainer spot', spots[0], 'leader spot', spots[1]))
        if guide and not (0 <= guide[1] < len(rows) and 0 <= guide[0] < len(rows[0])):
            guide = None
        im = Image.open(prefix + '.png').crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE))
        if city in USER_PADS:
            im = paste_pads(im.convert('RGBA'), USER_PADS[city])
        image = f'{city}_gym.png'
        im.save(os.path.join(PUBLIC, image))
        if track:
            top = Image.new('RGBA', im.size, (0, 0, 0, 0))
            for left, top_, right, bottom in track['bridges']:
                box = (left * TILE, top_ * TILE, (right + 1) * TILE, (bottom + 1) * TILE)
                top.paste(im.crop(box), box[:2])
            top.save(os.path.join(PUBLIC, image.replace('.png', '_overhead.png')))
        elif city in USER_OVERHEAD:
            top = Image.open(prefix + '-overhead.png').convert('RGBA').crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE))
            top.paste((0, 0, 0, 0), (0, 0, top.width, USER_OVERHEAD[city][1] * TILE))
            top.save(os.path.join(PUBLIC, image.replace('.png', '_overhead.png')))
        pv = im.convert('RGB'); d = ImageDraw.Draw(pv)
        for label, (x, y), col in [('IN', door, (0, 255, 0)), ('T', stands[0], (255, 160, 0)), ('L', stands[1], (255, 0, 0)), ('1', spots[0], (0, 200, 255)), ('2', spots[1], (0, 200, 255))] + ([('G', guide, (200, 200, 200))] if guide else []):
            d.rectangle([x * TILE, y * TILE, x * TILE + 15, y * TILE + 15], outline=col, width=2)
            d.text((x * TILE + 17, y * TILE), label, fill=col)
        pv.save(prefix + '-preview.png')
        who = str(trainer['scriptId']).replace('std_trainer(TRAINER_', '').rstrip(')') if 'trainer' in str(trainer['scriptId']) else 'its girl'
        doc = f"{title}, the leader's room: the Gym Trainer where {who.replace('_', ' ').title() if who != 'its girl' else who} stands ({stands[0][0]},{stands[0][1]}), the leader in their place ({stands[1][0]},{stands[1][1]})."
        if user:
            doc = f"{title}, the leader's room: the Gym Trainer at {stands[0][0]},{stands[0][1]}, the player stopping beside them at {spots[0][0]},{spots[0][1]} (the user's), the leader in their place ({stands[1][0]},{stands[1][1]})."
        if floors:
            doc = doc[:-1] + f", walked only on {FLOOR_NAMES[city]} (the user's)."
        if blocked and not blocks:
            doc = doc[:-1] + ', ' + ' and '.join(f"{l if l == r else f'{l}-{r}'},{t if t == b else f'{t}-{b}'}" for l, t, r, b in blocked) + " not walkable (the user's)."
        if city in USER_OVERHEAD:
            doc = doc[:-1] + ", the arches drawn over the player walking under them (the user's)."
        if links:
            doc = doc[:-1] + ', the walk from floor to floor through ' + ' and '.join(f'{a[0]},{a[1]} to {b[0]},{b[1]}' for a, b in links) + f" (the user's links: {LINK_NAMES[city]})."
        if city in USER_PADS:
            doc = doc[:-1] + ', ' + ' and '.join(f'{x},{y}' for x, y in USER_PADS[city]['at']) + " added warp panels (the user's: copies of the one at " + ','.join(map(str, USER_PADS[city]['from'])) + ').'
        if ice and any('i' in r for r in ice):
            doc = doc[:-1] + ", its ice slid across (the map's ice behaviour; agreed with the user), a slide stopped by its ice blocks (" + ', '.join(f'{x},{y}' for x, y in blocks) + ", the map's) and by the Gym Trainer standing on it."
        out.append(gym_ts(const, title, doc, image, len(rows[0]), len(rows), door, spots, stands, guide, rows, links, track, city in USER_OVERHEAD, ice, blocks))
        entrances[city] = entrance_near(rows, spots[1])
        print(city, 'door', door, 'spots', spots, 'stands', stands, 'guide', guide, 'trainer', who, 'leader room entrance', entrances[city])

    # The League's rooms and the Pokémon Center, each cropped to the area walked to from its entrance.
    rooms = {}
    for key, (map_const, events_file, sprite, boss, const, title) in list(LEAGUE.items()) + [('center', CENTER[:2] + (CENTER[3], None, 'POKEMON_CENTER', 'Pokémon Center'))]:
        prefix, rows = render(work, key, map_const, apicula, cache)
        events = json.load(open(hd.fetch(cache, EVENTS + events_file + '.json'), encoding='utf-8'))
        rows, stand, spot, ent = boss_room(rows, events, sprite, CENTER[2] if key == 'center' else None)
        x0, y0, x1, y1 = crop_box(rows, ent, [stand, spot])
        shift = lambda t: (t[0] - x0, t[1] - y0)
        rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
        stand, spot, ent = shift(stand), shift(spot), shift(ent)
        image = 'hgss_pokemonleague_' + key + 's_room.png' if key != 'center' else 'hgss_ecruteak_pokemoncenter_1f.png'
        Image.open(prefix + '.png').crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE)).save(os.path.join(PUBLIC, image))
        if key == 'center':
            doc = f"A Pokémon Center's ground floor (Ecruteak City's, HGSS's), for the Pokémon Center in the middle of the Johto Gym Challenge: the player comes in at the door ({ent[0]},{ent[1]}) and walks up to the counter ({spot[0]},{spot[1]}), the nurse behind it ({stand[0]},{stand[1]})."
            const = 'JOHTO_POKEMON_CENTER'
        else:
            doc = f"{title} at the Pokémon League (HGSS's), for the Johto Champion run: {title.split(chr(39))[0]} in their place ({stand[0]},{stand[1]}), the player coming in 5 tiles from them ({ent[0]},{ent[1]})."
            const = 'JOHTO_' + const
            rooms[boss] = const
        out.append(gym_ts(const, title, doc, image, len(rows[0]), len(rows), ent, [spot], [stand], None, rows))
        print(key, 'entrance', ent, 'spot', spot, 'stand', stand)

    # Each Johto boss's map for the Gym Challenge and Champion runs.
    lines = [f'  {LEADERS[c]}: leaderRoom({GYMS[c][3]}, {{ x: {e[0]}, y: {e[1]} }}),' for c, e in entrances.items()]
    lines += [f"  '{boss}': {const}," if '-' in boss else f'  {boss}: {const},' for boss, const in rooms.items()]
    out.append('\n/** Each Johto boss\'s map for the Gym Challenge and Champion runs, by boss id: their gym (leaderRoom, the player coming in 5 tiles from them, south where it can) or Pokémon League room. */\nexport const JOHTO_BOSS_ROOMS: Record<JohtoBossId, Route> = {\n' + '\n'.join(lines) + '\n};\n')
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'previews in', work)
    for p in problems:
        print('NO WALK:', p)


if __name__ == '__main__':
    main()
