"""Makes the Battle Tower's rooms (the user's: a lobby with the desk, an elevator and the battle room for each generation's
floors, with Emerald's and HGSS's corridor between their elevator and battle room) and writes
packages/campaign/src/battle-tower-maps.ts, copying the images to apps/web/public/routes/battle-tower/<gen>-<room>.png:

- Gen 1 (floors 1-10), FireRed's Trainer Tower (FireRed has no Battle Tower; the user's): its lobby, its elevator and
  its 1F as the battle room, drawn by fetch_map.py and render_route.py;
- Gen 2 (11-20), HeartGold/SoulSilver's Battle Tower: its lobby and elevator by hgss_map.py (field maps), its corridor and
  battle room by hgss_rooms.py (2D frontier scenes, not field maps: their floors are this file's, `FLOORS`);
- Gen 3 (21+), Emerald's Battle Tower: its lobby, elevator, corridor and battle room by emerald_map.py.

Each room's places (`points`, in its own tiles) are the games' where their map events or scripts give them (the
receptionist, the door, the elevator, the battle room's opponent and attendant and where the player stops), and the
user's or this file's otherwise (noted in `POINTS`).

Usage: python tower_maps.py --emerald <pokeemerald checkout> [--apicula <apicula.exe>] [--work <dir>]
Needs Python with numpy and Pillow (and pypng for render_route.py), and apicula for HGSS's field maps."""
import json, os, subprocess, sys, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ROUTES = os.path.join(REPO, 'tools', 'routes')
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes', 'battle-tower')
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'battle-tower-maps.ts')
PY = sys.executable

# Each room: its generation's sprite set, how it's drawn (the tool and its map), its name and the way its people face
# by default (`flow`).
ROOMS = {
    'frlg-lobby': ('frlg', 'frlg', 'TrainerTower_Lobby', 'Trainer Tower', 'up'),
    'frlg-elevator': ('frlg', 'frlg', 'TrainerTower_Elevator', 'Trainer Tower Elevator', 'down'),
    # Gen 1's battle room is HGSS's Battle Room (the user's: up the Trainer Tower's stairs into a Battle Room), with
    # FireRed's sprites.
    'frlg-room': ('frlg', 'scene', 'battle_room', 'Battle Room', 'up'),
    'hgss-lobby': ('hgss', 'hgss', 'MAP_BATTLE_TOWER', 'Battle Tower', 'up'),
    'hgss-elevator': ('hgss', 'hgss', 'MAP_BATTLE_TOWER_ELEVATOR', 'Battle Tower Elevator', 'down'),
    'hgss-corridor': ('hgss', 'scene', 'corridor', 'Battle Tower Corridor', 'up'),
    'hgss-room': ('hgss', 'scene', 'battle_room', 'Battle Room', 'up'),
    'rse-lobby': ('rse', 'rse', 'BattleFrontier_BattleTowerLobby', 'Battle Tower', 'up'),
    'rse-elevator': ('rse', 'rse', 'BattleFrontier_BattleTowerElevator', 'Battle Tower Elevator', 'down'),
    'rse-corridor': ('rse', 'rse', 'BattleFrontier_BattleTowerCorridor', 'Battle Tower Corridor', 'right'),
    'rse-room': ('rse', 'rse', 'BattleFrontier_BattleTowerBattleRoom', 'Battle Room', 'right'),
}
# HGSS's frontier scenes' floors (they have no tile data), rectangles (left, top, right, bottom) in their 16px tiles, read
# off the images: the corridor's walkway in front of its doors, round its four pillars' feet (5, 9, 13 and 17 on row 5);
# the battle room's floor inside its walls, round its corner pillars, with the gap in the bottom wall.
FLOORS = {
    'hgss-corridor': [(1, 3, 21, 4), (1, 5, 4, 5), (6, 5, 8, 5), (10, 5, 12, 5), (14, 5, 16, 5), (18, 5, 21, 5)],
    # (Read off the battle room as shifted by SHIFT: inside its walls, between its corner pillars at 2 and 12.)
    'hgss-room': [(3, 3, 11, 9), (2, 5, 2, 7), (12, 5, 12, 7)],
}
# Scenes moved left this many pixels (the right edge padded black): the battle room's door is centred between two tiles in
# the image, which made walking in and out of it look off (the user's); half a tile over, it's on tile 7.
SHIFT = {'hgss-room': 8, 'frlg-room': 8}
FLOORS['frlg-room'] = FLOORS['hgss-room']
# Each room's places, in the map's own tiles (before cropping): the games' from their events and scripts, otherwise ours
# (marked). A lobby: `entrance` (the door in from outside), `receptionist` (where they stand behind the desk), `desk`
# (where the player stops before them), `elevator` (the door the receptionist leads the player into), and where there's a BP
# Shop its `vendor` and `shop` (where the player stands before him). An elevator:
# `entrance` (where the player stands), `attendant`. A corridor: `entrance`, `attendant`, `door` (to the battle room). A
# battle room: `entrance` (the player's way in), `player` (where the player stops), `opponentEntrance` (the opponent's way
# in and out), `opponent` (where the opponent stops), `attendant` (where the attendant waits) and `attendantSpot` (where
# they come up to the player between battles).
POINTS = {
    # FireRed's lobby: the door, the receptionist behind her counter by the stairs up to 1F (11,6; the game has her at
    # 11,7) and where the player talks to her across it (9,6), both the user's; a challenge goes up those stairs (9,2), as
    # in the game, never its elevator (17,8), which only brings players down from the roof: `elevator` is the stairs here
    # (10,2, the user's)
    # (Gen 1's elevator is only between generations). The BP Shop's vendor, a Poké Mart clerk at the right-hand counter
    # (14,9, where the game has its other receptionist), and where the player stands before him (14,11): the user's. The
    # Pokémon Center's nurse at her counter (4,9), as the game has her (the user's).
    'frlg-lobby': {'entrance': (9, 15), 'receptionist': (11, 6), 'desk': (9, 6), 'elevator': (10, 2), 'vendor': (14, 9), 'shop': (14, 11), 'nurse': (4, 9)},
    # The elevator's door (2,5); FireRed's has no attendant, so the receptionist stands beside the player (ours).
    'frlg-elevator': {'entrance': (2, 5), 'attendant': (1, 4)},

    # HGSS's lobby: the door (15,19), the single battles' receptionist (11,5) at the desk below the left elevator door (10-11,1),
    # whom she walks up into (her script: WalkNormalNorth 2).
    'hgss-lobby': {'entrance': (15, 18), 'receptionist': (11, 5), 'desk': (11, 6), 'elevator': (11, 3)},
    # The elevator: the player at 3,6 (the lobby's warp), the attendant at 4,4 (its event).
    'hgss-elevator': {'entrance': (3, 6), 'attendant': (4, 4)},
    # The corridor: the attendant at the first door (its scene's object, 56,32 px); coming in at the right end (ours).
    'hgss-corridor': {'entrance': (20, 4), 'attendant': (3, 3), 'door': (3, 2)},
    # The battle room as the user's screenshot of HGSS has it (in its tiles as shifted, SHIFT): the player fading in at the
    # top door (7,2) and walking to the court's left edge (4,6), the attendant behind him (2,6), speaking from there; the
    # opponent in by the same door, to the right edge (10,6), facing him across the court.
    'hgss-room': {'entrance': (7, 2), 'player': (4, 6), 'opponentEntrance': (7, 2), 'opponent': (10, 6), 'attendant': (2, 6)},
    # Emerald's lobby: the door (12,9), the single battles' receptionist Teala (6,5) and the elevator door behind her (6,1).
    'rse-lobby': {'entrance': (12, 8), 'receptionist': (6, 5), 'desk': (6, 6), 'elevator': (6, 2)},
    # The elevator: the player at its door (2,6), Teala at 1,5.
    'rse-elevator': {'entrance': (2, 5), 'attendant': (1, 5)},
    # The corridor: in from the elevator at 8,1, Teala at 9,2, the battle room's door at 12,1 (its script).
    'rse-corridor': {'entrance': (8, 1), 'attendant': (9, 2), 'door': (12, 1)},
    # The battle room (its script): the player in at 4,8, up 3 to 4,5 facing right; the opponent down 4 from the door
    # (5,1) to 5,5 facing left; the attendant from 1,7 to 4,6, below the player.
    'rse-room': {'entrance': (4, 8), 'player': (4, 5), 'opponentEntrance': (5, 1), 'opponent': (5, 5), 'attendant': (1, 7), 'attendantSpot': (4, 6)},
}
# Gen 1's battle room is HGSS's (ROOMS), with its places.
POINTS['frlg-room'] = POINTS['hgss-room']
# Tiles made walkable that the map data blocks (the user's): the Trainer Tower lobby's 9,2, the way up its stairs.
USER_OPEN = {'frlg-lobby': [(9, 2)]}

# The lobbies whose receptionist walks the player to the elevator, up through her counter (their scripts).
LEADING_RECEPTIONISTS = {'hgss-lobby', 'rse-lobby'}
# How far past the walkable tiles an HGSS field map is cropped: its walls above (drawn tilted), a tile elsewhere.
MARGIN = {'top': 3, 'side': 1, 'bottom': 1}


def run(*args):
    subprocess.run([PY, *args], check=True, capture_output=True)


def frlg(work, name):
    d = os.path.join(work, name)
    wh = subprocess.run([PY, os.path.join(ROUTES, 'fetch_map.py'), name, d], check=True, capture_output=True, text=True).stdout.split()[-2:]
    run(os.path.join(ROUTES, 'render_route.py'), d, d + '.png', d + '.json', *wh, '--overhead', d + '_overhead.png')
    j = json.load(open(d + '.json'))
    return Image.open(d + '.png'), [''.join('.' if c else '#' for c in r) for r in j['grid']], Image.open(d + '_overhead.png')


def rse(work, emerald, name):
    prefix = os.path.join(work, name)
    run(os.path.join(ROUTES, 'emerald', 'emerald_map.py'), emerald, name, prefix)
    return Image.open(prefix + '.png'), json.load(open(prefix + '.json'))['rows'], Image.open(prefix + '_overhead.png')


def hgss(work, const, apicula):
    prefix = os.path.join(work, const)
    run(os.path.join(ROUTES, 'hgss', 'hgss_map.py'), prefix, const, '--room', '--apicula', apicula)
    return Image.open(prefix + '.png'), json.load(open(prefix + '.json'))['rows']


def scene(work, name, key):
    out = os.path.join(work, 'scenes')
    if not os.path.exists(os.path.join(out, name + '.png')):
        run(os.path.join(HERE, 'hgss_rooms.py'), os.path.join(work, 'dl'), out)
    im = Image.open(os.path.join(out, name + '.png'))
    if SHIFT.get(key):
        moved = Image.new(im.mode, im.size, 'black')
        moved.paste(im.crop((SHIFT[key], 0, im.width, im.height)), (0, 0))
        im = moved
    w, h = im.width // 16, im.height // 16
    rows = [''.join('.' if any(l <= x <= r and t <= y <= b for l, t, r, b in FLOORS[key]) else '#' for x in range(w)) for y in range(h)]
    return im, rows


def crop(im, rows, points):
    """An HGSS field map cut to its room: the tiles walked to from its entrance (tiles outside a room can count as walkable
    in the map data, as johto_gyms.py finds) and its places, with MARGIN round them."""
    seen, todo = {points['entrance']}, [points['entrance']]
    while todo:
        x, y = todo.pop()
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= n[1] < len(rows) and 0 <= n[0] < len(rows[0]) and rows[n[1]][n[0]] == '.' and n not in seen:
                seen.add(n); todo.append(n)
    tiles = list(seen) + list(points.values())
    x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(len(rows[0]) - 1, max(t[0] for t in tiles) + MARGIN['side'])
    y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(len(rows) - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
    return (im.crop((x0 * 16, y0 * 16, (x1 + 1) * 16, (y1 + 1) * 16)), [r[x0:x1 + 1] for r in rows[y0:y1 + 1]],
            {k: (x - x0, y - y0) for k, (x, y) in points.items()})


def main():
    args = sys.argv[1:]
    def opt(name, default=None):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    emerald = opt('--emerald')
    apicula = opt('--apicula', 'apicula')
    work = opt('--work') or tempfile.mkdtemp(prefix='battle_tower_')
    os.makedirs(work, exist_ok=True); os.makedirs(PUBLIC, exist_ok=True)
    out = [HEAD]
    for key, (sprites, tool, source, title, flow) in ROOMS.items():
        points = dict(POINTS[key])
        # What's drawn over the people (a counter's near edge, over the receptionist behind it): FireRed's and Emerald's top
        # layer; the HGSS rooms (3D renders and 2D scenes) have none.
        overhead = None
        if tool == 'frlg':
            im, rows, overhead = frlg(work, source)
        elif tool == 'rse':
            im, rows, overhead = rse(work, emerald, source)
        elif tool == 'hgss':
            im, rows, points = crop(*hgss(work, source, apicula), points)
        else:
            im, rows = scene(work, source, key)
        # The places stood on are walked to: each made walkable (a door, the warp the player comes in at); and a lobby's
        # receptionist's, whom the player follows through the gap in the counter she stands in (Emerald's and HGSS's).
        rows = [list(r) for r in rows]
        for name, (x, y) in points.items():
            if name not in ('receptionist', 'attendant', 'opponentEntrance', 'vendor', 'nurse') or (name == 'receptionist' and key in LEADING_RECEPTIONISTS):
                rows[y][x] = '.'
        for x, y in USER_OPEN.get(key, []):
            rows[y][x] = '.'
        rows = [''.join(r) for r in rows]
        image = f'{key}.png'
        im.convert('RGB').save(os.path.join(PUBLIC, image))
        over = ''
        if overhead is not None and overhead.convert('RGBA').getbbox():
            overhead.convert('RGBA').save(os.path.join(PUBLIC, f'{key}-overhead.png'))
            over = f"\n  overhead: '/routes/battle-tower/{key}-overhead.png',"
        pts = ', '.join(f'{k}: {{ x: {x}, y: {y} }}' for k, (x, y) in points.items())
        walk = '\n'.join(f"    '{r}'," for r in rows)
        const = key.upper().replace('-', '_')
        # FireRed's sprites are a route's default (no `sprites`).
        sprites_ = '' if sprites == 'frlg' else f"\n  sprites: '{sprites}',"
        out.append(f"""
export const {const}: TowerRoom = {{
  flow: '{flow}',{sprites_}
  name: '{title}',
  image: '/routes/battle-tower/{image}',{over}
  width: {im.width},
  height: {im.height},
  entrance: {{ x: {points['entrance'][0]}, y: {points['entrance'][1]} }},
  spots: [],
  points: {{ {pts} }},
  walkable: [
{walk}
  ],
}};
""")
        print(key, im.size, points)
    out.append(TAIL)
    open(OUT, 'w', encoding='utf-8', newline='\n').write(''.join(out))
    print('wrote', OUT)


HEAD = """// The Battle Tower's rooms (the user's): for each generation's floors a lobby with the desk, an elevator and the battle
// room, with Emerald's and HGSS's corridor between: FireRed's Trainer Tower for Gen 1 (FireRed has no Battle Tower), HGSS's
// Battle Tower for Gen 2 and Emerald's for Gen 3, each room's places from the game's events and scripts where they give
// them (tools/battle-tower/tower_maps.py has which are). Written by tools/battle-tower/tower_maps.py.
import type { Route, RouteSpot } from './routes.js';

/**
 * A Battle Tower room: a map (as a route's: its image, walkable tiles and sprite set; no encounter spots) with its named
 * places: a lobby's `entrance`, `receptionist`, `desk` and `elevator` (Gen 1's: the stairs up to 1F); an elevator's `entrance` and `attendant`; a
 * corridor's `entrance`, `attendant` and `door`; a battle room's `entrance`, `player`, `opponentEntrance`, `opponent`,
 * `attendant` and `attendantSpot` (none in Gen 1's, whose attendant speaks from his counter).
 */
export interface TowerRoom extends Route {
  points: Record<string, RouteSpot>;
}
"""
TAIL = """
/** Each generation's rooms, in the order the player goes through them: the lobby, the elevator, the corridor (if any), the battle room. */
export const TOWER_ROOMS = {
  1: { lobby: FRLG_LOBBY, elevator: FRLG_ELEVATOR, corridor: undefined, room: FRLG_ROOM },
  2: { lobby: HGSS_LOBBY, elevator: HGSS_ELEVATOR, corridor: HGSS_CORRIDOR, room: HGSS_ROOM },
  3: { lobby: RSE_LOBBY, elevator: RSE_ELEVATOR, corridor: RSE_CORRIDOR, room: RSE_ROOM },
} as const;
"""


if __name__ == '__main__':
    main()
