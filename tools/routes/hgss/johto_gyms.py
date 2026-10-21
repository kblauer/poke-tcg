"""Makes the Johto gyms' interiors, as the Kanto gyms have theirs (kanto-routes.ts), and writes
packages/campaign/src/johto-gyms.ts, copying the images to apps/web/public/routes/<city>_gym.png:

- each gym's leader's room rendered by hgss_map.py (--room; Azalea's and Mahogany's gyms are several maps, and only the
  leader's is shown, agreed with the user), cropped to the room;
- from the map's events (zone_event): the door the player comes in at (the warp out to the town, walkable here), the
  Gym Trainer where the gym's trainer nearest halfway in along the walk to the leader stands (the player beside them, on
  the side they face), the leader in their place (the player below them), and the Gym Guide where there is one.
  Olivine's gym has no trainers, so its Gym Trainer stands where its girl does (Olivine's pool is the Lighthouse's,
  bosses.ts).

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
FACE = {0: 'up', 1: 'down', 2: 'left', 3: 'right'}
STEP = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}
# How far past the room's walkable tiles the image goes: its walls above (drawn tilted), a tile elsewhere.
MARGIN = {'top': 3, 'side': 1, 'bottom': 1}


def bfs(rows, start):
    h, w = len(rows), len(rows[0])
    dist = {start: 0}; q = deque([start])
    while q:
        x, y = q.popleft()
        for dx, dy in STEP.values():
            n = (x + dx, y + dy)
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


def crop_box(rows, door, keep):
    """The room: the bounds of the tiles walked to from its door (and `keep`'s: the people), with MARGIN round them.
    Tiles outside the room can count as walkable in the map data, so only the door's area counts."""
    h, w = len(rows), len(rows[0])
    tiles = list(bfs(rows, door)) + keep
    x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(w - 1, max(t[0] for t in tiles) + MARGIN['side'])
    y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(h - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
    return x0, y0, x1, y1


def gym_ts(const, title, doc, image, w, h, door, spots, stands, guide, rows):
    pts = lambda ps: '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in ps)
    walk = '\n'.join(f"    '{r}'," for r in rows)
    npcs = f"\n  npcs: [{{ sprite: 'hgss/gym_guide', tile: {{ x: {guide[0]}, y: {guide[1]} }}, face: 'down' }}]," if guide else ''
    return f"""
/** {doc} */
export const {const}: Route = {{
  flow: 'up',
  sprites: 'hgss',
  name: '{title}',
  image: '/routes/{image}',
  width: {w * TILE},
  height: {h * TILE},
  entrance: {{ x: {door[0]}, y: {door[1]} }},
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


HEAD = """// The Johto gyms' interiors, from HeartGold/SoulSilver (the pret/pokeheartgold decompilation; tools/routes/hgss/), as
// the Kanto gyms have FireRed's (kanto-routes.ts): each the leader's room, drawn as the Johto routes are (hgss_map.py),
// cropped to the room. The door the player comes in at, the Gym Trainer where the gym's trainer nearest halfway in
// stands (the player beside them, on the side they face), the leader in their place (the player below them), and the Gym
// Guide where there is one, all from the map's events. Walking connections the map data doesn't show (a gym's puzzle)
// come from the user, as `links` or walkable tiles. Written by tools/routes/hgss/johto_gyms.py.
import type { Route } from './routes.js';
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
    out, problems = [], []
    for city, (map_const, events_file, warp_to, const, title) in GYMS.items():
        prefix = os.path.join(work, city)
        if not os.path.exists(prefix + '.png'):
            subprocess.run([sys.executable, os.path.join(HERE, 'hgss_map.py'), prefix, map_const, '--room', '--apicula', apicula, '--cache', cache], check=True)
        rows = json.load(open(prefix + '.json'))['rows']
        events = json.load(open(hd.fetch(cache, EVENTS + events_file + '.json'), encoding='utf-8'))
        rows, door, spots, stands, guide, gaps, trainer = place(city, rows, events, warp_to)
        problems += [(city,) + g for g in gaps]
        x0, y0, x1, y1 = crop_box(rows, door, [*spots, *stands] + ([guide] if guide else []))
        shift = lambda t: (t[0] - x0, t[1] - y0)
        rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
        door, spots, stands = shift(door), [shift(s) for s in spots], [shift(s) for s in stands]
        guide = guide and shift(guide)
        if guide and not (0 <= guide[1] < len(rows) and 0 <= guide[0] < len(rows[0])):
            guide = None
        im = Image.open(prefix + '.png').crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE))
        image = f'{city}_gym.png'
        im.save(os.path.join(PUBLIC, image))
        pv = im.convert('RGB'); d = ImageDraw.Draw(pv)
        for label, (x, y), col in [('IN', door, (0, 255, 0)), ('T', stands[0], (255, 160, 0)), ('L', stands[1], (255, 0, 0)), ('1', spots[0], (0, 200, 255)), ('2', spots[1], (0, 200, 255))] + ([('G', guide, (200, 200, 200))] if guide else []):
            d.rectangle([x * TILE, y * TILE, x * TILE + 15, y * TILE + 15], outline=col, width=2)
            d.text((x * TILE + 17, y * TILE), label, fill=col)
        pv.save(prefix + '-preview.png')
        who = str(trainer['scriptId']).replace('std_trainer(TRAINER_', '').rstrip(')') if 'trainer' in str(trainer['scriptId']) else 'its girl'
        doc = f"{title}, the leader's room: the Gym Trainer where {who.replace('_', ' ').title() if who != 'its girl' else who} stands ({stands[0][0]},{stands[0][1]}), the leader in their place ({stands[1][0]},{stands[1][1]})."
        out.append(gym_ts(const, title, doc, image, len(rows[0]), len(rows), door, spots, stands, guide, rows))
        print(city, 'door', door, 'spots', spots, 'stands', stands, 'guide', guide, 'trainer', who)
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'previews in', work)
    for p in problems:
        print('NO WALK:', p)


if __name__ == '__main__':
    main()
