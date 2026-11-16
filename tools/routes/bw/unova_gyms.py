"""Makes the Unova gyms' interiors and the League's rooms (issue #231), as sinnoh_gyms.py does for Sinnoh, and writes
packages/campaign/src/unova-gyms.ts, copying the images to apps/web/public/routes/:

- each gym's leader's zone rendered by bw_map.py, cropped to the tiles walked to from its door (Nacrene's is Lenora's own
  room, as Hearthome's is Fantina's);
- from the zone's events: the door the player comes in at (the warp out, walkable here; Driftveil's room has none, its
  lift's foot then, the walkable tile furthest down), the leader in their place (by their event sprite, LEADERS; the player
  below them), the Gym Trainer where the gym's trainer nearest halfway in along the walk to the leader stands (the player
  beside them, on the side they face; a room with no trainers, halfway between the door and the leader);
- the Unova Gym Challenge and Champion runs' other rooms: the Elite Four's and Alder's (the player coming in at the room's
  door) and Nimbasa City's Pokémon Center (after the fourth gym), with UNOVA_BOSS_ROOMS (each gym's leader room, the player
  coming in 5 tiles from the leader, south where it can).

Black's puzzles (Nimbasa's coasters, Driftveil's lifts, Mistralton's cannons, Icirrus's ice, Opelucid's dragons) aren't in
the tile data: a walk it can't find is printed, for the user's fixes (USER_ tables), map by map in the review.

Usage: python unova_gyms.py [--apicula <apicula.exe>] [--cache <dir>] [--work <dir>]"""
import os, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image
from unova_routes import MARGIN, PUBLIC, REPO, STEP, TILE, bfs, preview, render

OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'unova-gyms.ts')
# Event facing: 0 up, 1 down, 2 left, 3 right (Black's people, as Diamond's).
FACE = {0: 'up', 1: 'down', 2: 'left', 3: 'right'}

# Each gym: its constant, name, the leader's zone and season, the leader's event sprite, and the zone the door leads out to.
GYMS = {
    'striaton': ('STRIATON_GYM', 'Striaton Gym', 7, 'spring', 85, 6),
    'nacrene': ('NACRENE_GYM', 'Nacrene Gym', 19, 'spring', 86, 18),
    'castelia': ('CASTELIA_GYM', 'Castelia Gym', 29, 'spring', 87, 31),
    'nimbasa': ('NIMBASA_GYM', 'Nimbasa Gym', 63, 'summer', 88, 64),
    'driftveil': ('DRIFTVEIL_GYM', 'Driftveil Gym', 97, 'summer', 89, None),
    'mistralton': ('MISTRALTON_GYM', 'Mistralton Gym', 108, 'summer', 90, 107),
    'icirrus': ('ICIRRUS_GYM', 'Icirrus Gym', 114, 'autumn', 91, 113),
    'opelucid': ('OPELUCID_GYM', 'Opelucid Gym', 121, 'autumn', 162, 120),
}
# Each gym's bosses (their ids, for UNOVA_BOSS_ROOMS): Striaton's three share its room.
GYM_BOSSES = {'striaton': ['cilan', 'chili', 'cress'], 'nacrene': ['lenora'], 'castelia': ['burgh'], 'nimbasa': ['elesa'], 'driftveil': ['clay'],
              'mistralton': ['skyla'], 'icirrus': ['brycen'], 'opelucid': ['drayden']}
# The League's rooms: constant, name, zone, the boss's event sprite (+5 is their sheet: bw_sprites.py), the boss.
LEAGUE = [
    ('UNOVA_SHAUNTALS_ROOM', "Shauntal's Room", 140, 93, 'shauntal'),
    ('UNOVA_GRIMSLEYS_ROOM', "Grimsley's Room", 141, 94, 'grimsley'),
    ('UNOVA_MARSHALS_ROOM', "Marshal's Room", 142, 95, 'marshal'),
    ('UNOVA_CAITLINS_ROOM', "Caitlin's Room", 143, 96, 'caitlin'),
    ('UNOVA_ALDERS_ROOM', "Alder's Room", 144, 97, 'alder'),
]
# Nimbasa City's Pokémon Center (the Gym Challenge's, after the fourth gym): its zone and Nurse Joy's event sprite.
CENTER = ('UNOVA_POKEMON_CENTER', 'Pokémon Center', 65, 78)

HEAD = """// The Unova gyms' interiors and the League's rooms, from Pokémon Black (issue #231), as the Sinnoh gyms have Diamond's
// (sinnoh-gyms.ts): each the leader's zone, drawn as the Unova routes are (bw_map.py), cropped to the room (Nacrene's is
// Lenora's own room, as Hearthome's is Fantina's). The door the player comes in at, the Gym Trainer where the gym's trainer
// nearest halfway in stands (the player beside them, on the side they face), the leader in their place (the player below
// them), all from the zone's events. Black's puzzles (coasters, lifts, cannons, ice, dragons) aren't in its tile data:
// walks they need come from the user, gym by gym. Then the Unova Gym Challenge and Champion runs' other rooms: the Elite
// Four's and Alder's, and Nimbasa City's Pokémon Center; and each boss's map for those runs (UNOVA_BOSS_ROOMS). Written by
// tools/routes/bw/unova_gyms.py.
import type { UnovaBossId } from './bosses.js';
import { leaderRoom, type Route } from './routes.js';
"""


def nearest_walkable(rows, t, toward=None):
    h, w = len(rows), len(rows[0])
    if 0 <= t[1] < h and 0 <= t[0] < w and rows[t[1]][t[0]] == '.':
        return t
    cands = [(x, y) for y in range(h) for x in range(w) if rows[y][x] == '.']
    return min(cands, key=lambda c: (abs(c[0] - t[0]) + abs(c[1] - t[1]), 0 if toward is None else -((c[0] - t[0]) * toward[0] + (c[1] - t[1]) * toward[1])))


def dist_from(rows, start):
    prev = bfs(rows, start)
    dist = {start: 0}
    for t in prev:
        n, d = t, 0
        while prev[n] is not None:
            n, d = prev[n], d + 1
        dist[t] = d
    return dist


def entrance_near(rows, spot):
    """Where the player comes in for a boss's room: 4 steps from their spot, straight south where the room allows."""
    dist = dist_from(rows, spot)
    for steps in (4, 3, 5, 2):
        cands = [t for t, d in dist.items() if d == steps]
        if cands:
            return min(cands, key=lambda t: (t != (spot[0], spot[1] + steps), -t[1], abs(t[0] - spot[0])))
    return spot


def door_of(rows, j, out_zone):
    """The warp out to `out_zone` (made walkable), or with none (Driftveil's), the walkable tile furthest down."""
    rows = [list(r) for r in rows]
    w = next((w for w in j['warps'] if w['to'] == out_zone), None) if out_zone is not None else None
    if w:
        rows[w['y']][w['x']] = '.'
        door = (w['x'], w['y'])
    else:
        door = max(((x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == '.'), key=lambda t: (t[1], -abs(t[0] - len(rows[0]) / 2)))
    return [''.join(r) for r in rows], door


def crop(rows, img, door, keep):
    h, w = len(rows), len(rows[0])
    tiles = list(bfs(rows, door)) + keep
    x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(w - 1, max(t[0] for t in tiles) + MARGIN['side'])
    y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(h - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
    return [r[x0:x1 + 1] for r in rows[y0:y1 + 1]], img.crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE)), (x0, y0)


def place(rows, j, door, leader_sprite):
    """The leader's and Gym Trainer's stands and the player's spots (the Gym Trainer's first), and the trainer's label."""
    people = j['people']
    leader = next(p for p in people if p['sprite'] == leader_sprite)
    lstand = (leader['x'], leader['y'])
    lspot = nearest_walkable(rows, (lstand[0], lstand[1] + 1), (0, 1))
    dist = dist_from(rows, door)
    half = dist.get(lspot, 0) / 2
    trainers = [p for p in people if 'trainer' in p]

    def spot_of(p):
        dx, dy = STEP[FACE.get(p['face'], 'down')]
        return nearest_walkable(rows, (p['x'] + dx, p['y'] + dy), (dx, dy))
    if not trainers:
        walk = sorted((t for t, d in dist.items() if abs(d - half) <= 1), key=lambda t: (abs(t[0] - door[0]), t))
        tspot = walk[0] if walk else lspot
        return [tspot, lspot], [(tspot[0], tspot[1] - 1), lstand], None
    trainer = min(trainers, key=lambda p: (spot_of(p) not in dist, abs(dist.get(spot_of(p), 1e9) - half)))
    return [spot_of(trainer), lspot], [(trainer['x'], trainer['y']), lstand], trainer['trainer']


def route_ts(const, title, doc, image, w, h, door, spots, stands, rows):
    pts = lambda ps: '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in ps)
    name = f'"{title}"' if "'" in title else f"'{title}'"
    walk = '\n'.join(f"    '{r}'," for r in rows)
    return f"""
/** {doc} */
export const {const}: Route = {{
  flow: 'up',
  sprites: 'bw',
  name: {name},
  image: '/routes/{image}',
  width: {w * TILE},
  height: {h * TILE},
  entrance: {{ x: {door[0]}, y: {door[1]} }},
  spots: [
{pts(spots)}
  ],
  stands: [
{pts(stands)}
  ],
  walkable: [
{walk}
  ],
}};
"""


def room(work, name, zone, season, apicula, cache, out_zone, boss_sprite, two=True):
    """A room rendered, cropped and placed: (rows, image, door, spots, stands, trainer)."""
    prefix, j = render(name, [zone], season, work, apicula, cache)
    rows, door = door_of(j['rows'], j, out_zone)
    if two:
        spots, stands, trainer = place(rows, j, door, boss_sprite)
    else:
        boss = next(p for p in j['people'] if p['sprite'] == boss_sprite and (zone != 144 or p['script'] != 2000))
        stand = (boss['x'], boss['y'])
        spot = nearest_walkable(rows, (stand[0], stand[1] + 1), (0, 1))
        spots, stands, trainer = [spot], [stand], None
    img = Image.open(prefix + '.png')
    rows, img, (x0, y0) = crop(rows, img, door, list(stands))
    shift = lambda t: (t[0] - x0, t[1] - y0)
    door, spots, stands = shift(door), [shift(s) for s in spots], [shift(s) for s in stands]
    reach = bfs(rows, door)
    for t in spots:
        if t not in reach:
            print('NO WALK:', name, 'door', door, 'to', t)
    preview(img, door, spots[:-1], spots[-1], prefix + '-preview.png')
    return rows, img, door, spots, stands, trainer


def main():
    args = sys.argv[1:]

    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', None)
    work = opt('--work', None) or tempfile.mkdtemp(prefix='unova_gyms_')
    os.makedirs(work, exist_ok=True)
    out, rooms = [], {}
    for city, (const, title, zone, season, leader, out_zone) in GYMS.items():
        name = f'bw_{city}_gym'
        rows, img, door, spots, stands, trainer = room(work, name, zone, season, apicula, cache, out_zone, leader)
        img.save(os.path.join(PUBLIC, name + '.png'))
        who = f'the Gym Trainer where {trainer} stands' if trainer else 'the Gym Trainer halfway in'
        out.append(route_ts(const, title, f"{title}, from Black's zone {zone}: in at its door, {who}, the leader in their place.", name + '.png', len(rows[0]), len(rows), door, spots, stands, rows))
        for boss in GYM_BOSSES[city]:
            rooms[boss] = f'leaderRoom({const}, {{ x: {entrance_near(rows, spots[-1])[0]}, y: {entrance_near(rows, spots[-1])[1]} }})'
        print(city, 'door', door, 'spots', spots, 'stands', stands, trainer)
    for const, title, zone, sprite, boss in LEAGUE:
        name = f'bw_{boss}s_room'
        rows, img, door, spots, stands, _ = room(work, name, zone, 'spring', apicula, cache, 137 if zone != 144 else 138, sprite, two=False)
        # The Elite Four's rooms are ridden up to on a platform from their doors (no walk in the tile data): the player
        # comes in near the boss, as leaderRoom brings him in, 5 tiles from them.
        if spots[0] not in bfs(rows, door):
            door = entrance_near(rows, spots[0])
        img.save(os.path.join(PUBLIC, name + '.png'))
        out.append(route_ts(const, title, f"{title}, from Black's zone {zone}: in 5 tiles from the boss (a platform rides up to them from the door in Black), the boss in their place.", name + '.png', len(rows[0]), len(rows), door, spots, stands, rows))
        rooms[boss] = const
        print(boss, 'door', door, 'spot', spots, 'stand', stands)
    const, title, zone, nurse = CENTER
    rows, img, door, spots, stands, _ = room(work, 'bw_nimbasa_pokemoncenter', zone, 'summer', apicula, cache, 62, nurse, two=False)
    # The counter between Nurse Joy and the player: his spot two below her.
    spots = [(stands[0][0], stands[0][1] + 2)] if rows[stands[0][1] + 2][stands[0][0]] == '.' else spots
    img.save(os.path.join(PUBLIC, 'bw_nimbasa_pokemoncenter.png'))
    out.append(route_ts(const, title, "Nimbasa City's Pokémon Center, from Black's zone 65: the Unova Gym Challenge's, after the fourth gym.", 'bw_nimbasa_pokemoncenter.png', len(rows[0]), len(rows), door, spots, stands, rows))
    order = ['cilan', 'chili', 'cress', 'lenora', 'burgh', 'elesa', 'clay', 'skyla', 'brycen', 'drayden', 'shauntal', 'grimsley', 'caitlin', 'marshal', 'alder']
    out.append('\n/** Each Unova boss\'s map for the Gym Challenge and Champion runs, by boss id: their gym (leaderRoom, the player coming in 5 tiles from them, south where it can; Striaton\'s three share theirs) or League room. */\n'
               'export const UNOVA_BOSS_ROOMS: Record<UnovaBossId, Route> = {\n' + ''.join(f'  {b}: {rooms[b]},\n' for b in order) + '};\n')
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'previews in', work)


if __name__ == '__main__':
    main()
