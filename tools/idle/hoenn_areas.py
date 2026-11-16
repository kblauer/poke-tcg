"""Makes the Idle Adventure's Hoenn areas (README: Idle Adventure, Hoenn's main road; issue #226, step 4) from a checkout
of the pret/pokeemerald decompilation: packages/idle/src/data/gen3/maps.ts (each Emerald map the run walks: its picture,
size, wild table, battle scene, map section, music and weather), areas.ts (the run's areas on Hoenn's main road in the
game's order, each with the player's planned track and its trainers), collision.ts (each map's collision, only for
hoenn-areas.test.ts), the maps' pictures (a map the Hoenn Badge Challenge already draws keeps its picture, public/routes/;
the others apps/web/public/idle/gen3/maps/<map>.png, as tools/routes/emerald/emerald_map.py renders them, with
<map>_overhead.png, the game's top layer) and any person's overworld sprite not drawn yet (public/overworld/rse/, as
tools/routes/emerald/emerald_sprites.py cuts them).

The planning is kanto_areas.py's, copied here (not shared, so Kanto's generated tracks can never change: saved runs hold
steps along them) over Emerald's maps, whose tilesets are read as emerald_map.py reads them (512 primary metatiles,
16-bit attributes: the behaviour in the low byte) and whose wild encounter tiles are the behaviour's flags
(src/metatile_behavior.c's sTileBitAttributes: encounters, and surfable for water). Each area is legs over one or more
maps, from its start to its end past every trainer's sight line, nearest first, through tall grass and cave floors where
it can, then out; maps joined where the game joins them (connections, warps between them, gatehouses); ledges jumped one
way; water only where the area surfs. Obstacles an HM or a story scene clears (Cut trees, Rock Smash rocks, Strength
boulders, the Kecleon the Devon Scope shows, the story's people: those a FLAG_HIDE_ flag shows or hides) are walked
through, as Kanto's; the gyms by the Badge Challenge's fixes, the user's (tools/routes/emerald/hoenn_maps.py's USER_
tables). A trainer sees `trainer_sight_or_berry_tree_id` tiles
straight ahead (every way for those that look around), stopping at anything in the way (trainer_see.c).

Usage: python tools/idle/hoenn_areas.py <pokeemerald checkout> [--dump <Map>] [--draw <dir>]. Needs Pillow."""
import collections, heapq, json, os, re, sys
from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen3')
PUB = os.path.join(ROOT, 'apps', 'web', 'public')
sys.path.insert(0, os.path.join(ROOT, 'tools', 'routes', 'emerald'))
import emerald_map as em  # noqa: E402
import emerald_sprites as es  # noqa: E402
import hoenn_maps as hmaps  # noqa: E402  (the Badge Challenge's Hoenn maps: the user's fixes to its gyms)

DIRS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}


def read(path):
    return open(os.path.join(SRC, path), encoding='utf8').read()


def key(const, prefix):
    return const[len(prefix):].lower().replace('_', '-')


BEHAVIORS = em.behaviour_names(SRC)
# Each behaviour's flags (src/metatile_behavior.c's sTileBitAttributes: 1 wild encounters, 2 surfable), by its name.
HAS_ENCOUNTERS, SURFABLE = 1, 2
_BITS = read('src/metatile_behavior.c').split('sTileBitAttributes[NUM_METATILE_BEHAVIORS] =')[1].split('};')[0]
TILE_BITS = {b: ('TILE_FLAG_HAS_ENCOUNTERS' in f and HAS_ENCOUNTERS) | ('TILE_FLAG_SURFABLE' in f and SURFABLE) for b, f in re.findall(r'\[(MB_\w+)\]\s*=\s*([^,\n]+)', _BITS)}
LAYOUTS = {l['id']: l for l in json.loads(read('data/layouts/layouts.json'))['layouts'] if 'id' in l}
MAP_DIRS = {json.loads(read(f'data/maps/{d}/map.json'))['id']: d for d in os.listdir(os.path.join(SRC, 'data', 'maps')) if os.path.exists(os.path.join(SRC, 'data', 'maps', d, 'map.json'))}

# Every script label's trainerbattles (data/scripts/*.inc and the maps' scripts): its trainer constants.
SCRIPT_TRAINERS = {}
SCRIPT_GOTOS = collections.defaultdict(list)
for f in [os.path.join('data', 'scripts', s) for s in os.listdir(os.path.join(SRC, 'data', 'scripts')) if s.endswith('.inc')] + [os.path.join('data', 'maps', d, 'scripts.inc') for d in MAP_DIRS.values()]:
    if not os.path.exists(os.path.join(SRC, f)):
        continue
    label = None
    for line in read(f).split('\n'):
        m = re.match(r'^(\w+)::?', line)
        if m:
            label = m.group(1)
            SCRIPT_TRAINERS.setdefault(label, [])
            continue
        m = re.search(r'trainerbattle\w*\s+(?:TRAINER_BATTLE_\w+,\s*)?(TRAINER_\w+)', line)
        if m and label:
            SCRIPT_TRAINERS[label].append(m.group(1))
        # The labels it goes to (goto, call, a switch's case), for a script that battles only after one (Norman's).
        for t in re.findall(r'(?:goto|call|case)\w*\s+(?:[\w-]+,\s*)*(\w+_EventScript_\w+)', line):
            if label:
                SCRIPT_GOTOS[label].append(t)

# Each map's wild tables (src/data/wild_encounters.json): its encounter types, 1 land and 2 water (as the metatiles').
_WILD = [g for g in json.loads(read('src/data/wild_encounters.json'))['wild_encounter_groups'] if g.get('label') == 'gWildMonHeaders']
WILD_TABLES = collections.defaultdict(set)
for group in _WILD:
    for e in group['encounters']:
        WILD_TABLES[e['map']] |= {k for k, f in ((1, 'land_mons'), (2, 'water_mons')) if f in e}
# The maps with fishing: an area walking one fishes there (WalkArea.fishing).
FISH_TABLES = {e['map'] for group in _WILD for e in group['encounters'] if 'fishing_mons' in e}

# Graphics that don't block: item balls, Cut trees, Rock Smash rocks, Strength boulders (walked through: no HMs needed),
# and the Kecleon the Devon Scope shows on Routes 119 and 120 (the user's: story obstacles walked through).
FREE_GFX = ('ITEM_BALL', 'CUTTABLE_TREE', 'BREAKABLE_ROCK', 'PUSHABLE_BOULDER', 'KECLEON')
# Trainers left out (agreed: no rival, Wally, Team Aqua or Team Magma battles, nor Steven's).
SKIP_TRAINER = re.compile(r'^(grunt-|brendan-|may-|wally-|archie|maxie-|shelly-|tabitha-|matt$|courtney-|steven)')


class Map:
    """An Emerald map: its blocks (metatile, collision, elevation), behaviours, encounter types, objects and warps."""

    def __init__(self, name):
        self.name = name
        self.json = json.loads(read(f'data/maps/{name}/map.json'))
        layout = LAYOUTS[self.json['layout']]
        self.w, self.h = layout['width'], layout['height']
        self.blocks = em.u16s(os.path.join(SRC, layout['blockdata_filepath']))
        p, s = em.tileset_dir(SRC, 'primary', layout['primary_tileset']), em.tileset_dir(SRC, 'secondary', layout['secondary_tileset'])
        attrs = em.u16s(os.path.join(p, 'metatile_attributes.bin'))[:em.NUM_METATILES_PRIMARY]
        self.attrs = attrs + [0] * (em.NUM_METATILES_PRIMARY - len(attrs)) + em.u16s(os.path.join(s, 'metatile_attributes.bin'))
        self.id = self.json['id']
        self.type = self.json['map_type']
        self.objects = self.json.get('object_events', [])
        self.warps = self.json.get('warp_events', [])

    def behavior(self, x, y):
        mid = self.blocks[y * self.w + x] & 0x3FF
        return BEHAVIORS.get(self.attrs[mid] & 0xFF if mid < len(self.attrs) else 0, '')

    def collision(self, x, y):
        return (self.blocks[y * self.w + x] >> 10) & 3

    def elevation(self, x, y):
        return self.blocks[y * self.w + x] >> 12

    def encounter(self, x, y):
        """1 a land wild encounter tile, 2 a water one, 0 none (MetatileBehavior_IsLandWildEncounter, IsWaterWildEncounter)."""
        f = TILE_BITS.get(self.behavior(x, y), 0)
        return 0 if not f & HAS_ENCOUNTERS else 2 if f & SURFABLE else 1

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h


MAPS = {}


def load(name):
    if name not in MAPS:
        MAPS[name] = Map(name)
    return MAPS[name]


def trainer_of(obj):
    """An object's trainer constant, if its script battles: the first trainerbattle under its label, else under the
    labels it goes to, nearest first (Norman's, after a switch on the gym's state)."""
    seen, q = set(), collections.deque([obj.get('script', '')])
    while q:
        label = q.popleft()
        if label in seen or len(seen) > 30:
            continue
        seen.add(label)
        if SCRIPT_TRAINERS.get(label):
            return SCRIPT_TRAINERS[label][0]
        q.extend(SCRIPT_GOTOS.get(label, ()))
    return None


def story(obj):
    """Whether an object is the story's (shown or hidden by a FLAG_HIDE_ flag: the rival, Team Aqua and Magma, the people
    standing in the way until a scene moves them, Gabby and Ty moving from route to route): walked through, as Johto's
    story people, and never battled."""
    return obj.get('flag', '0').startswith('FLAG_HIDE_')


def facings(obj):
    """The ways a trainer looks, from its movement type: every way for those that look around or wander (and Emerald's
    TRAINER_TYPE_SEE_ALL_DIRECTIONS)."""
    m = obj['movement_type'].replace('MOVEMENT_TYPE_', '')
    if any(k in m for k in ('LOOK_AROUND', 'ROTATE', 'WANDER_AROUND', 'RANDOMLY')) or obj.get('trainer_type') == 'TRAINER_TYPE_SEE_ALL_DIRECTIONS':
        return ['down', 'up', 'left', 'right']
    found = [d for d in ('down', 'up', 'left', 'right') if d.upper() in m]
    return found or ['down']


# ---- Walking ----
UNWALKABLE = re.compile(r'WATERFALL|IMPASSABLE|MB_COUNTER|BOOKSHELF|MB_PC|CABINET|KITCHEN|DRESSER|SNACKS|PAINTING|TELEVISION|SHELF|VASE|BLUEPRINT|TRASH|POKEBLOCK_FEEDER|CRACKED_FLOOR_HOLE|LAVARIDGE_GYM_B1F_WARP')
LEDGES = {'MB_JUMP_SOUTH': 'down', 'MB_JUMP_NORTH': 'up', 'MB_JUMP_EAST': 'right', 'MB_JUMP_WEST': 'left'}


class Grid:
    """One map's walkable tiles for an area (water when it surfs; `fixes` add tiles, `blocked` take them away), objects
    in the way (but those walked through); `ledges_free`: ledges walked either way, `people_free`: only its trainers in
    the way, but those `walk_past` (a gym's, as the Badge Challenge's: Mossdeep Gym's statues and Gym Guide aside, and its
    Psychic Blake, standing in the only way on to its leaders, walked past once beaten); `gym`: its warps not walked on."""

    def __init__(self, m, surf, fixes=(), blocked=(), ledges_free=False, people_free=False, gym=False, walk_past=()):
        self.m = m
        # The people in the way (collision.ts's), then the tiles taken away.
        self.people = set()
        for o in m.objects:
            gfx = o['graphics_id'].replace('OBJ_EVENT_GFX_', '')
            if o.get('type', 'object') == 'object' and not any(f in gfx for f in FREE_GFX) and not story(o) and not (people_free and (not trainer_of(o) or key(trainer_of(o), 'TRAINER_') in walk_past)):
                self.people.add((o['x'], o['y']))
        self.blocked = self.people | set(blocked)
        self.warp_tiles = {(w['x'], w['y']) for w in m.warps}
        if gym:
            # A gym's warps (Lavaridge Gym's holes, Mossdeep Gym's spin panels) aren't walked on, as the Badge
            # Challenge has them: only its doors from room to room (Petalburg Gym's).
            self.warp_tiles = {(w['x'], w['y']) for w in m.warps if w['dest_map'] == m.id}
        self.fixes = set(fixes)
        self.surf = surf
        self.ledges_free = ledges_free

    def ledge(self, x, y):
        return None if self.ledges_free else LEDGES.get(self.m.behavior(x, y))

    def water(self, x, y):
        b = self.m.behavior(x, y)
        return bool(TILE_BITS.get(b, 0) & SURFABLE) and b != 'MB_WATERFALL'

    def walkable(self, x, y):
        if not self.m.inside(x, y) or (x, y) in self.blocked:
            return False
        if (x, y) in self.fixes or (x, y) in self.warp_tiles:
            return True
        b = self.m.behavior(x, y)
        if self.ledge(x, y):
            return False
        if self.water(x, y):
            return self.surf and self.m.collision(x, y) == 0
        if UNWALKABLE.search(b):
            return False
        return self.m.collision(x, y) == 0 or (self.ledges_free and b in LEDGES)

    def char(self, x, y):
        """The map's own collision ('.' walkable, '#' not, '~' water, a ledge's way), as collision.ts has it."""
        if not self.m.inside(x, y):
            return '#'
        l = LEDGES.get(self.m.behavior(x, y))
        if l:
            return {'down': 'v', 'up': '^', 'left': '<', 'right': '>'}[l]
        if self.water(x, y) and self.m.collision(x, y) == 0:
            return '~'
        b = self.m.behavior(x, y)
        return '.' if self.m.collision(x, y) == 0 and not UNWALKABLE.search(b) else '#'


def elev_ok(m, x0, y0, x1, y1):
    """The game's elevation check: between two tiles of different heights only through 0 or 15 (bridges, stairs)."""
    a, b = m.elevation(x0, y0), m.elevation(x1, y1)
    return a == b or a in (0, 15) or b in (0, 15)


def neighbours(grids, links, node):
    """The tiles a step reaches from a node (map index, x, y): walking, ledge jumps (flag 2) and links (flag 1, a fade)."""
    mi, x, y = node
    g = grids[mi]
    for d, (dx, dy) in DIRS.items():
        nx, ny = x + dx, y + dy
        if not g.m.inside(nx, ny):
            continue
        if g.ledge(nx, ny) == d:
            jx, jy = nx + dx, ny + dy
            if g.walkable(jx, jy):
                yield (mi, jx, jy), 2
            continue
        # Surfing onto land or off it changes height freely (the game's own checks for getting on and off the water).
        if g.walkable(nx, ny) and (elev_ok(g.m, x, y, nx, ny) or g.water(x, y) or g.water(nx, ny) or g.ledges_free):
            yield (mi, nx, ny), 0
    for to in links.get(node, ()):
        yield to, 1


# A step's cost for the planner (the user's, as Kanto's: through tall grass where it can): onto a wild encounter tile
# GRASS_STEP, onto any other PLAIN_STEP.
PLAIN_STEP = 4
GRASS_STEP = 1


def bfs(grids, links, start, targets):
    """The cheapest walk from start to any of `targets` (Dijkstra, wild tiles cheaper), the first found on a tie: [(node, flag)], or None."""
    def cost(node):
        mi, x, y = node
        return GRASS_STEP if grids[mi].m.encounter(x, y) else PLAIN_STEP
    prev = {start: None}
    best = {start: 0}
    q = [(0, 0, start)]
    order = 1
    done = set()
    while q:
        d, _, n = heapq.heappop(q)
        if n in done:
            continue
        done.add(n)
        if n in targets:
            path = []
            while prev[n]:
                p, flag = prev[n]
                path.append((n, flag))
                n = p
            return path[::-1]
        for to, flag in neighbours(grids, links, n):
            nd = d + cost(to)
            if to not in best or nd < best[to]:
                best[to] = nd
                prev[to] = (n, flag)
                heapq.heappush(q, (nd, order, to))
                order += 1
    return None


def connection_pairs(m, c, o):
    """The tiles across a map connection: (tile on m, tile on o) for each tile along the shared edge."""
    off = int(c['offset'])
    d = c['direction']
    for k in (range(m.w) if d in ('up', 'down') else range(m.h)):
        if d == 'up':
            a, b = (k, 0), (k - off, o.h - 1)
        elif d == 'down':
            a, b = (k, m.h - 1), (k - off, 0)
        elif d == 'left':
            a, b = (0, k), (o.w - 1, k - off)
        else:
            a, b = (m.w - 1, k), (0, k - off)
        if o.inside(*b):
            yield a, b


def build_links(names, grids, extra=(), own_warps=True, gatehouses=True):
    """The leg's links: warps between its maps (and within one, as Petalburg Gym's doors, but where `own_warps` is off:
    Mossdeep Gym's, whose user's links replace them), gatehouses (in and back out onto its maps; none in a gym, as the
    Badge Challenge's: Lavaridge Gym's holes down to its B1F), map connections, and
    `extra` ((map, x, y) pairs, both ways: the cable car, the Dive, the waterfall, the user's gym links)."""
    links = collections.defaultdict(list)
    index = {load(n).id: i for i, n in enumerate(names)}
    at = {n: i for i, n in enumerate(names)}
    for (am, ax, ay), (bm, bx, by) in extra:
        links[(at[am], ax, ay)].append((at[bm], bx, by))
        links[(at[bm], bx, by)].append((at[am], ax, ay))
    for i, n in enumerate(names):
        m = load(n)
        for w in m.warps:
            dest = w['dest_map']
            here = (i, w['x'], w['y'])
            if dest == m.id and not own_warps:
                continue
            if dest in index:
                dm = load(names[index[dest]])
                dw = dm.warps[int(w['dest_warp_id'])]
                links[here].append((index[dest], dw['x'], dw['y']))
            elif dest in MAP_DIRS and gatehouses and load(MAP_DIRS[dest]).type == 'MAP_TYPE_INDOOR':
                # A gatehouse (a building: never a cave or a forest walked as an area of its own, Petalburg Woods, the
                # Fiery Path): its other warps leading back out onto one of the leg's maps.
                g_warps = load(MAP_DIRS[dest]).warps
                entered = int(w['dest_warp_id']) if str(w['dest_warp_id']).isdigit() else -1
                for j, gw in enumerate(g_warps):
                    if j == entered or gw['dest_map'] not in index or not str(gw['dest_warp_id']).isdigit():
                        continue
                    om = load(names[index[gw['dest_map']]])
                    ow = om.warps[int(gw['dest_warp_id'])]
                    to = (index[gw['dest_map']], ow['x'], ow['y'])
                    # Not the next door along the same doorway (a building's two doors side by side).
                    if to != here and not (to[0] == i and abs(to[1] - w['x']) + abs(to[2] - w['y']) <= 1):
                        links[here].append(to)
        for c in m.json.get('connections') or []:
            if c['map'] not in index or c['direction'] not in DIRS:
                continue
            j = index[c['map']]
            for a, b in connection_pairs(m, c, load(names[j])):
                if grids[i].walkable(*a) and grids[j].walkable(*b):
                    links[(i, *a)].append((j, *b))
    return links


def edge_tile(g, d, to=None):
    """The tile a leg starts or ends at on a map edge: the middle of the longest run of walkable tiles along it that go on
    across its connection that way (to `to`, a map's name, where two maps join that edge: Route 124's Mossdeep City)."""
    m = g.m
    across = set()
    for c in m.json.get('connections') or []:
        if c['direction'] == d and (to is None or c['map'] == load(to).id):
            o = Grid(load(MAP_DIRS[c['map']]), g.surf)
            across |= {a for a, b in connection_pairs(m, c, o.m) if o.walkable(*b)}
    cells = [(x, 0 if d == 'up' else m.h - 1) for x in range(m.w)] if d in ('up', 'down') else [(0 if d == 'left' else m.w - 1, y) for y in range(m.h)]
    runs, cur = [], []
    for c in cells:
        if g.walkable(*c) and (c in across or not across):
            cur.append(c)
        else:
            if cur:
                runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    if not runs:
        raise SystemExit(f'{m.name}: nothing walkable on its {d} edge')

    # The run on the map's biggest walkable area first (johto_areas.py's: a patch walled off by trees), then the longest.
    def area(c):
        seen, q = {c}, [c]
        while q:
            x, y = q.pop()
            for ex, ey in DIRS.values():
                n = (x + ex, y + ey)
                if n not in seen and g.m.inside(*n) and (g.walkable(*n) or g.ledge(*n)):
                    seen.add(n)
                    q.append(n)
        return len(seen)
    best = max(runs, key=lambda r: (area(r[0]), len(r)))
    return best[len(best) // 2]


def spec_tile(names, grids, spec):
    """A leg's start or end: (map, 'edge', way[, the map across]), (map, 'warp', index or destination map), (map, 'tile', x, y)."""
    mi = names.index(spec[0])
    g = grids[mi]
    if spec[1] == 'edge':
        return (mi, *edge_tile(g, spec[2], spec[3] if len(spec) > 3 else None))
    if spec[1] == 'warp':
        ws = g.m.warps
        w = ws[spec[2]] if isinstance(spec[2], int) else next(w for w in ws if w['dest_map'] == spec[2])
        return (mi, w['x'], w['y'])
    return (mi, spec[2], spec[3])


def sight_tiles(g, o, sight):
    """The tiles a trainer sees: `sight` tiles straight ahead each way it looks, stopping at anything in the way; with no sight, the tile in front."""
    out = set()
    for d in facings(o):
        dx, dy = DIRS[d]
        for i in range(1, max(1, sight) + 1):
            x, y = o['x'] + dx * i, o['y'] + dy * i
            if not g.walkable(x, y):
                break
            out.add((x, y))
    if not out:
        # Looking at a wall: talked to from beside them, as in the game.
        out = {(o['x'] + dx, o['y'] + dy) for dx, dy in DIRS.values() if g.walkable(o['x'] + dx, o['y'] + dy)}
    return out


def leg_grids(leg):
    """A leg's maps' grids, by its options (surf, fixes, blocked, a gym's)."""
    gym = leg.get('gym', False)
    return [Grid(load(n), leg.get('surf', False), leg.get('fixes', {}).get(n, ()), leg.get('blocked', {}).get(n, ()), gym, gym, gym, leg.get('walk_past', ())) for n in leg['maps']]


def leg_links(names, grids, leg):
    return build_links(names, grids, leg.get('links', ()), leg.get('own_warps', True), not leg.get('gym'))


# Double battles (trainers.ts's `double`): two people whose scripts start the same battle (Twins, the gym's Tate & Liza),
# listed once (the first), the other's sight line counting too: (map, key) -> the other person's tile.
PAIRS = {}


def plan_leg(leg, trainers_seen, report):
    """A leg's track (steps [map index, x, y, flags]) and its trainers (with their sight lines)."""
    names = leg['maps']
    grids = leg_grids(leg)
    links = leg_links(names, grids, leg)
    start = spec_tile(names, grids, leg['start'])
    end = spec_tile(names, grids, leg['end'])
    trainers = []
    for mi, n in enumerate(names):
        for o in load(n).objects:
            const = trainer_of(o)
            # A League room's boss whose battle the room's own script starts (Wallace's): the person with their sprite.
            if leg.get('boss_gfx') and o['graphics_id'] == leg['boss_gfx']:
                const = 'TRAINER_' + leg['boss'].upper().replace('-', '_')
            # (The story's trainers left out: Gabby and Ty, moving from route to route; but a leader the story moves away.)
            if not const or o.get('type', 'object') != 'object' or (story(o) and key(const, 'TRAINER_') not in leg.get('last', ())):
                continue
            k = key(const, 'TRAINER_')
            if leg.get('boss') and k != leg['boss']:
                continue
            # A leg's maps whose trainers it passes by (`pass_by`: Routes 105 to 109 on Mr. Briney's boat, the user's).
            if SKIP_TRAINER.match(k) or (n, k) in trainers_seen or k in leg.get('skip', ()) or n in leg.get('pass_by', ()):
                continue
            sight = int(o.get('trainer_sight_or_berry_tree_id', '0') or 0) if o.get('trainer_type', 'TRAINER_TYPE_NONE') != 'TRAINER_TYPE_NONE' else 0
            tiles = {(mi, x, y) for x, y in sight_tiles(grids[mi], o, sight)}
            same = next((t for t in trainers if t['key'] == k), None)
            if same:
                # The second of a pair (one battle for both): its sight line the first's too.
                same['sight'] |= tiles
                PAIRS[(n, k)] = (same['x'], same['y'], o['x'], o['y'])
                continue
            trainers.append({'key': k, 'const': const, 'map': mi, 'x': o['x'], 'y': o['y'], 'gfx': o['graphics_id'].replace('OBJ_EVENT_GFX_', '').lower(),
                             'face': facings(o)[0], 'sight': tiles, 'range': sight})
    if leg.get('path'):
        # The user's track (Sootopolis Gym's, across its thin ice): walked as it is, each trainer met where it first
        # comes into their sight.
        track = [((0, x, y), 0) for x, y in leg['path']]
        order = []
        for node, _ in track:
            order += [t for t in trainers if t not in order and node in t['sight']]
        if not order or order[-1]['key'] not in leg.get('last', ()):
            raise SystemExit(f"{names}: the track doesn't end at {leg.get('last')}")
        for t in [t for t in trainers if t not in order]:
            report.append(f"{names[t['map']]}: {t['key']} out of reach")
        for t in order:
            trainers_seen.add((names[t['map']], t['key']))
        return names, grids, track, order
    last = [t for t in trainers if t['key'] in leg.get('last', ())]
    pending = [t for t in trainers if t not in last]
    via = [mi for mi, n in enumerate(names) if n in leg.get('via', ())]
    track = [(start, 0)]
    here = start
    order = []
    visited_maps = {start[0]}

    def walk(path):
        nonlocal here
        for node, flag in path:
            track.append((node, flag))
            visited_maps.add(node[0])
            for t in list(pending):
                if node in t['sight']:
                    pending.remove(t)
                    order.append(t)
        if path:
            here = path[-1][0]

    while pending or any(v not in visited_maps for v in via):
        targets = set().union(*(t['sight'] for t in pending)) if pending else set()
        for v in via:
            if v not in visited_maps:
                targets |= {(v, x, y) for y in range(grids[v].m.h) for x in range(grids[v].m.w) if grids[v].walkable(x, y)}
        path = bfs(grids, links, here, targets)
        if path is None:
            for t in pending:
                report.append(f"{leg['maps'][t['map']]}: {t['key']} out of reach")
            pending.clear()
            if any(v not in visited_maps for v in via):
                raise SystemExit(f"{names}: can't reach {[names[v] for v in via if v not in visited_maps]}")
            break
        walk(path)
    for t in last:
        path = bfs(grids, links, here, t['sight'])
        if path is None:
            raise SystemExit(f"{names}: can't reach {t['key']}")
        walk(path)
        order.append(t)
    if not leg.get('ends_at_last'):
        # A leg that has met no wild encounter tile yet (the user's: through tall grass where it can): into the middle of
        # the nearest patch of it the leg's end can still be reached from, then on (kanto_areas.py's).
        def wild(node):
            mi, x, y = node
            return grids[mi].m.encounter(x, y) != 0

        def into_patch(tiles):
            depth = {}
            q = collections.deque()
            for n in tiles:
                mi, x, y = n
                if any(grids[mi].walkable(x + dx, y + dy) and (mi, x + dx, y + dy) not in tiles for dx, dy in DIRS.values()):
                    depth[n] = 0
                    q.append(n)
            while q:
                n = q.popleft()
                mi, x, y = n
                for dx, dy in DIRS.values():
                    m = (mi, x + dx, y + dy)
                    if m in tiles and m not in depth:
                        depth[m] = depth[n] + 1
                        q.append(m)
            deep = {n for n, d in depth.items() if d >= 2}
            patch = deep or {n for n, d in depth.items() if d >= 1} or tiles
            while patch:
                detour = bfs(grids, links, here, patch)
                if detour is None:
                    return None
                if bfs(grids, links, detour[-1][0], {end}) is not None:
                    walk(detour)
                    return detour[-1][0]
                patch.discard(detour[-1][0])
            return None

        if not leg.get('no_wild') and not any(wild(n) for n, _ in track):
            into_patch({(mi, x, y) for mi, g in enumerate(grids) for y in range(g.m.h) for x in range(g.m.w) if g.walkable(x, y) and wild((mi, x, y))})
        path = bfs(grids, links, here, {end})
        if path is None:
            raise SystemExit(f'{names}: no way from {here} to the end {end}')
        walk(path)
    for t in order:
        trainers_seen.add((names[t['map']], t['key']))
    return names, grids, track, order


# ---- The run's areas on Hoenn's main road, in the game's order (agreed with the user, issue #226) ----
def edge(m, d, to=None):
    return (m, 'edge', d) if to is None else (m, 'edge', d, to)


def warp(m, w):
    return (m, 'warp', w)


def tile(m, x, y):
    return (m, 'tile', x, y)


def leg(maps, start, end, **kw):
    return {'maps': maps, 'start': start, 'end': end, **kw}


def route(area_id, name, legs, kind='route', **kw):
    return {'id': area_id, 'name': name, 'kind': kind, 'legs': legs, **kw}


def track_tiles(start, *legs):
    """A track's tiles from trackLine's corners (packages/campaign's routes.ts: each leg straight lines to its corners)."""
    tiles = [start]
    for lg in legs:
        for x, y in lg['to']:
            lx, ly = tiles[-1]
            if lx != x and ly != y:
                raise SystemExit(f'track corner {x},{y} is not in line with {lx},{ly}')
            dx, dy = (x > lx) - (x < lx), (y > ly) - (y < ly)
            while tiles[-1] != (x, y):
                tiles.append((tiles[-1][0] + dx, tiles[-1][1] + dy))
    return tiles


def gym(area_id, name, town, city, leader, badge):
    """A gym (the Badge Challenge's, tools/routes/emerald/hoenn_maps.py's GYMS): in at its door (the warp out to its town;
    the tile above it), to its leader, met last; the user's fixes from the Badge Challenge (its tiles made walkable and
    unwalkable, its links, Mossdeep Gym's links in place of its spin panels' warps, Sootopolis Gym's track across the
    ice) and its ledges walked either way, as there."""
    m, _, warp_to = hmaps.GYMS[city][:3]
    door = next(w for w in load(m).warps if w['dest_map'] == warp_to)
    links = hmaps.USER_GYM_LINKS.get(city, hmaps.USER_LINKS.get(city, []))
    kw = {'gym': True, 'fixes': {m: hmaps.USER_WALKABLE.get(city, []) + [t for pair in links for t in pair]}, 'blocked': {m: hmaps.USER_UNWALKABLE.get(city, [])},
          'walk_past': ('blake',) if city == 'mossdeep' else (), 'links': [((m, *a), (m, *b)) for a, b in links], 'own_warps': city not in hmaps.USER_GYM_LINKS}
    if city in hmaps.USER_GYM_TRACKS:
        start, *legs = hmaps.USER_GYM_TRACKS[city]
        kw['path'] = track_tiles(start, *legs)
    return {'id': area_id, 'name': name, 'kind': 'gym', 'town': town, 'badge': badge, 'leader': leader,
            'legs': [leg([m], tile(m, door['x'], door['y'] - 1), None, last=(leader,), ends_at_last=True, **kw)]}


def league(area_id, name, key_, boss):
    """A League room (the Badge Challenge's, hoenn_maps.py's LEAGUE): in at its door (its lowest warp; the tile above it),
    to its boss (the person with their sprite)."""
    m, gfx = hmaps.LEAGUE[key_][:2]
    door = max(load(m).warps, key=lambda w: w['y'])
    return {'id': area_id, 'name': name, 'kind': 'league', 'leader': boss,
            'legs': [leg([m], tile(m, door['x'], door['y'] - 1), None, last=(boss,), ends_at_last=True, boss=boss, boss_gfx=gfx)]}


def town(area_id, name, m, marts, gym=None, **kw):
    return {'id': area_id, 'name': name, 'kind': 'town', 'map': m, 'marts': marts, 'gym': gym, **kw}


def dive_spot(above, below, to):
    """Where Route 126's Dive goes down to Sootopolis (the user's: a fade): the diveable water (MetatileBehavior_IsDiveable)
    of `above` nearest the underwater map's warp to `to` (its Dive connection keeps the tile)."""
    w = next(w for w in load(below).warps if w['dest_map'] == to)
    m = load(above)
    spots = [(x, y) for y in range(m.h) for x in range(m.w) if m.behavior(x, y) in ('MB_DEEP_WATER', 'MB_INTERIOR_DEEP_WATER', 'MB_SOOTOPOLIS_DEEP_WATER') and m.collision(x, y) == 0]
    return min(spots, key=lambda t: (abs(t[0] - w['x']) + abs(t[1] - w['y']), t))


def emerge_spot(m, under):
    """Where the Dive comes up on `m`: the tile its underwater map's script surfaces at (setdivewarp: Sootopolis City's lake)."""
    x, y = re.search(r'setdivewarp ' + load(m).id + r', (\d+), (\d+)', read(f'data/maps/{under}/scripts.inc')).groups()
    return (int(x), int(y))


def scripted_region(m, inside, outside, rows):
    """The tiles of a map a weather's coord triggers enclose (Route 111's desert): flooded from the triggers whose script
    ends with `inside` over the tiles the player can walk or surf on (its people aside), never past one whose script
    ends with `outside`, within `rows` (the map's OnTransition script's band)."""
    mm = load(m)
    g = Grid(mm, True)
    g.blocked = set()
    triggers = [c for c in mm.json.get('coord_events', []) if c['type'] == 'trigger']
    walls = {(c['x'], c['y']) for c in triggers if c['script'].endswith(outside)}
    region = {(c['x'], c['y']) for c in triggers if c['script'].endswith(inside)}
    q = list(region)
    while q:
        x, y = q.pop()
        for dx, dy in DIRS.values():
            n = (x + dx, y + dy)
            if n not in region and n not in walls and rows[0] <= n[1] <= rows[1] and mm.inside(*n) and (g.walkable(*n) or LEDGES.get(mm.behavior(*n))):
                region.add(n)
                q.append(n)
    return region


def rects(tiles, open_=lambda x, y: True):
    """A set of tiles as rectangles ([x0, y0, x1, y1], both ends in): each row's span (its runs where the span would
    take in an `open_` tile that isn't one of them), spans alike on rows after each other one."""
    out = []
    for y in sorted({y for _, y in tiles}):
        xs = sorted(x for x, ty in tiles if ty == y)
        if all((x, y) in tiles or not open_(x, y) for x in range(xs[0], xs[-1] + 1)):
            xs = list(range(xs[0], xs[-1] + 1))
        runs = []
        for x in xs:
            if runs and runs[-1][1] == x - 1:
                runs[-1][1] = x
            else:
                runs.append([x, x])
        for x0, x1 in runs:
            prev = next((r for r in out if r[0] == x0 and r[2] == x1 and r[3] == y - 1), None)
            if prev:
                prev[3] = y
            else:
                out.append([x0, y, x1, y])
    return out


# Route 111's desert (the user's: its sandstorm only there): what its sandstorm triggers enclose, inside
# Route111_EventScript_CheckSetSandstorm's rows 34–107, its sun triggers the edge. Walking in from Mauville the game sets
# no sandstorm (the OnTransition check finds the player south of row 107) until one is stepped on. The main road keeps
# out of it (Go-Goggles in the game; the user's: Route 111's south).
DESERT = scripted_region('Route111', '_SandstormTrigger', '_SunTrigger', (34, 107))
# Route 126's Dive down to Sootopolis City and back up (the user's: a fade each way).
DIVE = dive_spot('Route126', 'Underwater_Route126', 'MAP_UNDERWATER_SOOTOPOLIS_CITY')
EMERGE = emerge_spot('SootopolisCity', 'Underwater_SootopolisCity')


# Ever Grande City's waterfall (the user's: a fade), from the water at its foot to the water at its top.
def waterfall_ends(m):
    """The water tile below a map's waterfall (MB_WATERFALL) and the tile above it: the column with the most waterfall tiles."""
    mm = load(m)
    cols = collections.Counter(x for y in range(mm.h) for x in range(mm.w) if mm.behavior(x, y) == 'MB_WATERFALL')
    x = max(cols, key=lambda c: (cols[c], -c))
    ys = [y for y in range(mm.h) if mm.behavior(x, y) == 'MB_WATERFALL']
    return (m, x, max(ys) + 1), (m, x, min(ys) - 1)


WATERFALL = waterfall_ends('EverGrandeCity')

AREAS = [
    # A run starts coming out of Professor Birch's lab, on its door (as Kanto's from Oak's, Johto's from Elm's; mine, to
    # check with the user: the player's house's door the other choice), then up Route 101.
    route('route-101', 'Route 101', [leg(['LittlerootTown', 'Route101'], warp('LittlerootTown', 'MAP_LITTLEROOT_TOWN_PROFESSOR_BIRCHS_LAB'), edge('Route101', 'up'))]),
    # Oldale's Poké Mart sells Poké Balls once the adventure has started (FLAG_ADVENTURE_STARTED, Birch's Pokédex, before
    # the game's player walks on west): always, as the run has no rival battle on Route 103.
    town('oldale-town', 'Oldale Town', 'OldaleTown', ['OldaleTown_Mart_Pokemart_Expanded']),
    route('route-102', 'Route 102', [leg(['Route102'], edge('Route102', 'right'), edge('Route102', 'left'))]),
    # Petalburg's Poké Mart's more once Norman's gym is ready for the player (Common_EventScript_ReadyPetalburgGymForBattle: the 4th badge).
    town('petalburg-city', 'Petalburg City', 'PetalburgCity', ['PetalburgCity_Mart_Pokemart_Basic'], expanded={'badges': 4, 'marts': ['PetalburgCity_Mart_Pokemart_Expanded']}),
    route('route-104', 'Route 104', [leg(['Route104'], edge('Route104', 'right'), warp('Route104', 4))]),
    route('petalburg-woods', 'Petalburg Woods', [
        leg(['PetalburgWoods'], warp('PetalburgWoods', 2), warp('PetalburgWoods', 0)),
        leg(['Route104'], warp('Route104', 2), edge('Route104', 'up')),
    ], kind='dungeon'),
    # Rustboro's Poké Mart's more (the Timer and Repeat Balls) once the player has met the Devon employee on Route 116
    # (FLAG_MET_DEVON_EMPLOYEE), right after Roxanne in the game: from the 1st badge.
    town('rustboro-city', 'Rustboro City', 'RustboroCity', ['RustboroCity_Mart_Pokemart_Basic'], 'rustboro-gym', expanded={'badges': 1, 'marts': ['RustboroCity_Mart_Pokemart_Expanded']}),
    gym('rustboro-gym', 'Rustboro Gym', 'rustboro-city', 'rustboro', 'roxanne-1', 'Stone'),
    # Mr. Briney's boat in the game, from his cottage's door: surfed (agreed with the user), with their trainers.
    # Mr. Briney's boat trips, surfed (the user's), past their trainers and with no wild Pokémon (the user's, 2026-11-15:
    # the trainers 24 to 27 and the water's Pokémon up to 35, met in the game once Surf is had after Norman, before
    # Brawly's 16 here; the boat meets none).
    route('route-105', 'Routes 105 and 106', [leg(['Route104', 'Route105', 'Route106'], warp('Route104', 'MAP_ROUTE104_MR_BRINEYS_HOUSE'), edge('Route106', 'down'), surf=True, pass_by=('Route105', 'Route106'), no_wild=True)]),
    # Dewford Town has no Poké Mart.
    town('dewford-town', 'Dewford Town', 'DewfordTown', [], 'dewford-gym'),
    gym('dewford-gym', 'Dewford Gym', 'dewford-town', 'dewford', 'brawly-1', 'Knuckle'),
    route('route-107', 'Routes 107, 108 and 109', [leg(['Route107', 'Route108', 'Route109'], edge('Route107', 'left'), edge('Route109', 'up'), surf=True, pass_by=('Route107', 'Route108', 'Route109'), no_wild=True)]),
    town('slateport-city', 'Slateport City', 'SlateportCity', ['SlateportCity_Mart_Pokemart']),
    route('route-110', 'Route 110', [leg(['Route110'], edge('Route110', 'down'), edge('Route110', 'up'))]),
    town('mauville-city', 'Mauville City', 'MauvilleCity', ['MauvilleCity_Mart_Pokemart'], 'mauville-gym'),
    gym('mauville-gym', 'Mauville Gym', 'mauville-city', 'mauville', 'wattson-1', 'Dynamo'),
    route('route-111', 'Routes 111 and 112', [leg(['Route111', 'Route112'], edge('Route111', 'down'), warp('Route112', 'MAP_FIERY_PATH'), blocked={'Route111': DESERT})]),
    # Through the Fiery Path, then Route 112's north to its east edge (the game's way on, to Route 111's north and Route
    # 113); then the cable car (the user's: a fade up to Mt. Chimney, the next area's start). Route 112's north is walled
    # off from its cable car: the game goes round by Route 113, Fallarbor Town and Meteor Falls, left out.
    route('fiery-path', 'Fiery Path', [
        leg(['FieryPath'], warp('FieryPath', 0), warp('FieryPath', 1)),
        leg(['Route112'], warp('Route112', 5), tile('Route112', 39, 9)),
    ], kind='dungeon'),
    route('mt-chimney', 'Mt. Chimney and Jagged Pass', [leg(['MtChimney', 'JaggedPass', 'Route112'], warp('MtChimney', 0), edge('Route112', 'left'))]),
    town('lavaridge-town', 'Lavaridge Town', 'LavaridgeTown', ['LavaridgeTown_Mart_Pokemart'], 'lavaridge-gym'),
    gym('lavaridge-gym', 'Lavaridge Gym', 'lavaridge-town', 'lavaridge', 'flannery-1', 'Heat'),
    # Back to Petalburg walking the real path (agreed with the user): Routes 112 and 111 to Mauville, through it to Route
    # 117 and Verdanturf Town, Rusturf Tunnel and Route 116 to Rustboro, through it down Route 104 and Petalburg Woods.
    route('route-112-south', 'Routes 112, 111 and 117', [leg(['Route112', 'Route111', 'MauvilleCity', 'Route117'], edge('Route112', 'left'), edge('Route117', 'left'), blocked={'Route111': DESERT})]),
    town('verdanturf-town', 'Verdanturf Town', 'VerdanturfTown', ['VerdanturfTown_Mart_Pokemart']),
    route('rusturf-tunnel', 'Rusturf Tunnel and Route 116', [
        leg(['VerdanturfTown', 'RusturfTunnel', 'Route116'], warp('VerdanturfTown', 'MAP_RUSTURF_TUNNEL'), edge('Route116', 'left')),
        leg(['RustboroCity', 'Route104', 'PetalburgWoods'], edge('RustboroCity', 'right'), edge('Route104', 'right')),
    ], kind='dungeon'),
    town('petalburg-city-gym', 'Petalburg City', 'PetalburgCity', ['PetalburgCity_Mart_Pokemart_Basic'], 'petalburg-gym', expanded={'badges': 4, 'marts': ['PetalburgCity_Mart_Pokemart_Expanded']}),
    gym('petalburg-gym', 'Petalburg Gym', 'petalburg-city-gym', 'petalburg', 'norman-1', 'Balance'),
    # Then back the same way to Mauville City (the user's), and Route 118 surfed across its water up Route 119.
    route('route-104-north', 'Back to Mauville City', [leg(['Route104', 'PetalburgWoods', 'RustboroCity', 'Route116', 'RusturfTunnel', 'VerdanturfTown', 'Route117'], edge('Route104', 'right'), edge('Route117', 'right'))]),
    route('route-118', 'Routes 118 and 119', [leg(['MauvilleCity', 'Route118', 'Route119'], edge('MauvilleCity', 'left'), edge('Route119', 'right'), surf=True)]),
    town('fortree-city', 'Fortree City', 'FortreeCity', ['FortreeCity_Mart_Pokemart'], 'fortree-gym'),
    gym('fortree-gym', 'Fortree Gym', 'fortree-city', 'fortree', 'winona-1', 'Feather'),
    route('route-120', 'Routes 120 and 121', [leg(['Route120', 'Route121'], edge('Route120', 'left'), edge('Route121', 'right'))]),
    # Lilycove's Department Store: its 2F (balls, medicine) and Emerald's six evolution stones (the user's, 2026-11-15:
    # emerald_data.py's 'LilycoveCity_DepartmentStore_Stones'); its 4F's TMs are the run's TM list's.
    town('lilycove-city', 'Lilycove City', 'LilycoveCity', ['LilycoveCity_DepartmentStore_2F_Pokemart1', 'LilycoveCity_DepartmentStore_2F_Pokemart2', 'LilycoveCity_DepartmentStore_Stones']),
    route('route-124', 'Route 124', [leg(['Route124'], edge('Route124', 'left'), edge('Route124', 'right', 'MossdeepCity'), surf=True)]),
    town('mossdeep-city', 'Mossdeep City', 'MossdeepCity', ['MossdeepCity_Mart_Pokemart'], 'mossdeep-gym'),
    gym('mossdeep-gym', 'Mossdeep Gym', 'mossdeep-city', 'mossdeep', 'tate-and-liza-1', 'Mind'),
    # Route 124 again, then Route 126 to its Dive spot (the user's: Dive a fade, under Route 126 into Sootopolis City).
    route('route-126', 'Routes 124 and 126', [leg(['Route124', 'Route126'], edge('Route124', 'right', 'MossdeepCity'), tile('Route126', *DIVE), surf=True)]),
    town('sootopolis-city', 'Sootopolis City', 'SootopolisCity', ['SootopolisCity_Mart_Pokemart'], 'sootopolis-gym'),
    gym('sootopolis-gym', 'Sootopolis Gym', 'sootopolis-city', 'sootopolis', 'juan-1', 'Rain'),
    # Up by Dive and on over Routes 126, 127 and 128 (127 joins them) to Ever Grande City, up its waterfall (a fade).
    route('route-128', 'Routes 126, 127 and 128', [leg(['SootopolisCity', 'Route126', 'Route127', 'Route128', 'EverGrandeCity'], tile('SootopolisCity', *EMERGE), warp('EverGrandeCity', 'MAP_VICTORY_ROAD_1F'), surf=True,
                                                    links=[(('SootopolisCity', *EMERGE), ('Route126', *DIVE)), WATERFALL])]),
    route('victory-road', 'Victory Road', [leg(['VictoryRoad_1F', 'VictoryRoad_B1F', 'VictoryRoad_B2F'], warp('VictoryRoad_1F', 0), warp('VictoryRoad_1F', 1), via=('VictoryRoad_B1F', 'VictoryRoad_B2F'), surf=True)], kind='dungeon'),
    # Before the Pokémon League's door (its 1F is the Pokémon Center and Poké Mart).
    town('ever-grande-city', 'Ever Grande City', 'EverGrandeCity', ['EverGrandeCity_PokemonLeague_1F_Pokemart'], 'sidney', stand_to='MAP_EVER_GRANDE_CITY_POKEMON_LEAGUE_1F'),
    league('sidney', "Sidney's Room", 'sidney', 'sidney'),
    league('phoebe', "Phoebe's Room", 'phoebe', 'phoebe'),
    league('glacia', "Glacia's Room", 'glacia', 'glacia'),
    league('drake', "Drake's Room", 'drake', 'drake'),
    league('wallace', "The Champion's Room", 'wallace', 'wallace'),
]


def wild_letter(m, x, y):
    """A tile's wild encounters: 'l' land, 'w' water, '.' none (an encounter tile on a map with no such table: none, as the game has it)."""
    e = m.encounter(x, y)
    return {1: 'l', 2: 'w'}[e] if e in WILD_TABLES.get(m.id, ()) else '.'


# ---- Battle terrain (BattleSetup_GetEnvironmentId) ----
def terrain(m, x, y):
    """A tile's battle terrain letter (areas.ts's TERRAIN_LETTERS): tall grass, long grass (Emerald's 'L'), sand, then by
    the map's type: a cave's floor, pond water or an indoor encounter; a building; the ocean's water; deep or ocean water,
    pond water, the mountain top, else plain."""
    b = m.behavior(x, y)
    surfable = bool(TILE_BITS.get(b, 0) & SURFABLE)
    if b == 'MB_TALL_GRASS':
        return 'g'
    if b == 'MB_LONG_GRASS':
        return 'L'
    if b in ('MB_SAND', 'MB_DEEP_SAND'):
        return 's'
    if m.type == 'MAP_TYPE_UNDERGROUND':
        if b == 'MB_INDOOR_ENCOUNTER':
            return 'b'
        return 'p' if surfable else 'c'
    if m.type in ('MAP_TYPE_INDOOR', 'MAP_TYPE_SECRET_BASE'):
        return 'b'
    if m.type == 'MAP_TYPE_OCEAN_ROUTE':
        return 'w' if surfable else '.'
    if b in ('MB_OCEAN_WATER', 'MB_INTERIOR_DEEP_WATER', 'MB_DEEP_WATER'):
        return 'w'
    if surfable:
        return 'p'
    if b == 'MB_MOUNTAIN_TOP':
        return 'm'
    return '.'


# ---- Weather (the user's, issue #226): the weather battles start in, where Emerald's scripts give each map its own ----
def weather_of(m):
    """A map's weather for battles (AbilityBattleEffects' ABILITYEFFECT_SWITCH_IN_WEATHER: rain, a sandstorm, the sun of
    a drought), and where only parts of it have it, those parts ([x0, y0, x1, y1] rectangles, both ends in), and the
    daily cycle it follows (rolled once a run, the user's): {weather, weatherAreas, weatherCycle}, or {}."""
    mm = load(m)
    w, h = mm.w - 1, mm.h - 1
    if m == 'Route111':
        # Its desert's (DESERT).
        g = Grid(mm, True)
        return {'weather': 'sandstorm', 'weatherAreas': rects(DESERT, lambda x, y: g.walkable(x, y) or (x, y) in g.blocked)}
    if m == 'Route120':
        # Route120_EventScript_SetWeather: rain in rows 15–60, west of column 8 and east of column 19.
        return {'weather': 'rain', 'weatherAreas': [[0, 15, 7, 60], [20, 15, w, 60]]}
    if m == 'Route119':
        # SetRoute119Weather (WEATHER_ROUTE119_CYCLE: sWeatherCycleRoute119, rain 3 days of 4), set between its coord
        # events' lines: south of the north end's (row 13, west of column 35's sunny line) and north of the south end's.
        return {'weather': 'rain', 'weatherAreas': [[0, 0, 34, 133], [35, 10, w, 133]], 'weatherCycle': 'route119'}
    if m == 'Route123':
        # SetRoute123Weather (sWeatherCycleRoute123: rain 1 day of 4), the whole route.
        return {'weather': 'rain', 'weatherCycle': 'route123'}
    weather = {'WEATHER_RAIN': 'rain', 'WEATHER_RAIN_THUNDERSTORM': 'rain', 'WEATHER_DOWNPOUR': 'rain', 'WEATHER_SANDSTORM': 'sandstorm', 'WEATHER_DROUGHT': 'sun'}.get(mm.json['weather'])
    return {'weather': weather} if weather else {}


# ---- Auto-grind (the user's): a loop near the exit of the area before a gym's town, as Kanto's ----
RINGS = [(3, 3), (4, 3), (3, 4), (2, 3), (3, 2), (2, 2)]


def ring(x, y, w, h):
    return [(x + i, y) for i in range(w)] + [(x + w - 1, y + j) for j in range(1, h)] + [(x + i, y + h - 1) for i in range(w - 2, -1, -1)] + [(x, y + j) for j in range(h - 2, 0, -1)]


def grind_loop(names, grids, track, links):
    """The loop a grind runs round (kanto_areas.py's): the ring of walkable tiles with wild encounters of one kind (and
    one battle terrain) fewest steps from the leg's last step, rounder rings winning a tie or a step or two, starting on
    its tile nearest the exit; None when the leg has no such ring."""
    def tile_of(n):
        m = grids[n[0]].m
        return wild_letter(m, n[1], n[2]) + terrain(m, n[1], n[2])
    end = track[-1][0]
    dist = {end: 0}
    q = collections.deque([end])
    while q:
        n = q.popleft()
        for to, _ in neighbours(grids, links, n):
            if to not in dist:
                dist[to] = dist[n] + 1
                q.append(to)
    best = None
    for mi, g in enumerate(grids):
        m = g.m
        for k, (w, h) in enumerate(RINGS):
            for y in range(m.h - h + 1):
                for x in range(m.w - w + 1):
                    nodes = [(mi, tx, ty) for tx, ty in ring(x, y, w, h)]
                    if not all(n in dist and (n[1], n[2]) not in g.warp_tiles and tile_of(n)[0] != '.' for n in nodes):
                        continue
                    if len({tile_of(n) for n in nodes}) != 1:
                        continue
                    if not all(elev_ok(m, a[1], a[2], b[1], b[2]) or g.water(a[1], a[2]) or g.water(b[1], b[2]) for a, b in zip(nodes, nodes[1:] + nodes[:1])):
                        continue
                    near = min(range(len(nodes)), key=lambda i: dist[nodes[i]])
                    score = (dist[nodes[near]] + k, k)
                    if best is None or score < best[0]:
                        best = (score, nodes[near:] + nodes[:near])
    return best and [[n[0], n[1], n[2], 0, tile_of(n)] for n in best[1]]


def fishing_spot(g, steps):
    """The tile nearest a map's track steps ([(step, x, y)]) facing fishable water (surfable, no collision, not a
    waterfall), walked to over land (surfing only where nothing on land faces any, and the area surfs: then a 1 after),
    the nearest first: (step, way, x, y), or None (kanto_areas.py's)."""
    fishable = lambda x, y: g.m.inside(x, y) and g.water(x, y) and g.m.collision(x, y) == 0
    for over_water in (False, True):
        seen = {}
        q = collections.deque()
        for i, x, y in steps:
            if (x, y) not in seen and (over_water or not g.water(x, y)):
                seen[(x, y)] = i
                q.append((x, y))
        while q:
            x, y = q.popleft()
            for way, (dx, dy) in DIRS.items():
                if fishable(x + dx, y + dy) and (over_water or not g.water(x, y)):
                    return (seen[(x, y)], way, x, y, 1) if g.water(x, y) else (seen[(x, y)], way, x, y)
            for dx, dy in DIRS.values():
                n = (x + dx, y + dy)
                if n not in seen and g.walkable(*n) and (over_water or not g.water(*n)):
                    seen[n] = seen[(x, y)]
                    q.append(n)
    return None


# The Badge Challenge's names for Emerald's sprites (emerald_sprites.py's SPRITES and BOSSES), by graphics constant;
# any other one its constant's name, cut here.
SPRITE_NAMES = {gfx: name for name, gfx in es.SPRITES.items()} | {gid: (boss if not isinstance(g, tuple) else gid.replace('OBJ_EVENT_GFX_', '').lower()) for boss, g in es.BOSSES.items() for gid in (g if isinstance(g, tuple) else (g,))}


def sprite_name(gfx):
    """A person's overworld sprite in public/overworld/rse/ (OBJ_EVENT_GFX_YOUNGSTER: 'rse/youngster')."""
    gfx = gfx if gfx.startswith('OBJ_EVENT_GFX_') else 'OBJ_EVENT_GFX_' + gfx.upper()
    return 'rse/' + SPRITE_NAMES.get(gfx, gfx[len('OBJ_EVENT_GFX_'):].lower())


def mart_of(marts, sprites):
    """A town's Poké Mart (the store, the user's): the map its first list is sold on, the player across the counter from
    the clerk who sells it (the person whose script opens that list, else any `pokemart`), two tiles ahead of them and
    facing them, and everyone there as the map places them (the clerk facing the player; but the story's people)."""
    name = max((d for d in MAP_DIRS.values() if marts[0].startswith(d + '_')), key=len)
    m = load(name)
    script = read(f'data/maps/{name}/scripts.inc')
    block = lambda label: (re.search(re.escape(label) + r'::((?:(?!\n\w+::)[\s\S])*)', script) or [None, ''])[1]

    def sells(o, what):
        # Its script, or one it goes to (Rustboro's clerk's basic and expanded lists, by a flag).
        text = block(o['script'])
        text += ''.join(block(t) for t in re.findall(r'goto\w*\s+(?:\w+,\s*)*(\w+_EventScript_\w+)', text))
        return re.search(r'pokemart\s+' + what + r'\b', text)
    clerk = next((o for o in m.objects if sells(o, marts[0])), None) or next(o for o in m.objects if sells(o, r'\w+'))
    face = facings(clerk)[0]
    dx, dy = DIRS[face]
    back = {'down': 'up', 'up': 'down', 'left': 'right', 'right': 'left'}[face]
    people = []
    for o in m.objects:
        if o.get('type', 'object') != 'object' or story(o) or 'VAR_' in o['graphics_id']:
            continue
        sprites.add(o['graphics_id'])
        people.append({'sprite': sprite_name(o['graphics_id']), 'x': o['x'], 'y': o['y'], 'face': face if o is clerk else facings(o)[0]})
    return name, {'map': name, 'x': clerk['x'] + 2 * dx, 'y': clerk['y'] + 2 * dy, 'face': back, 'people': people}


def js(v):
    if isinstance(v, str):
        return "'" + v.replace('\\', '\\\\').replace("'", "\\'") + "'"
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    if v is None:
        return 'null'
    if isinstance(v, (list, tuple)):
        return '[' + ', '.join(js(x) for x in v) + ']'
    if isinstance(v, dict):
        return '{ ' + ', '.join((k if re.match(r'^[A-Za-z_]\w*$', k) else js(k)) + ': ' + js(x) for k, x in v.items() if x is not None) + ' }'
    raise TypeError(v)


# The Badge Challenge's pictures of the maps it draws (hoenn_maps.py: its routes', gyms' and League rooms'), by map.
ROUTE_PICTURES = {c['map']: c['image'] for c in hmaps.ROUTES.values()} | {g[0]: f'{city}_gym.png' for city, g in hmaps.GYMS.items()} | {v[0]: f'rse_evergrande_{k}s_room.png' for k, v in hmaps.LEAGUE.items()}


def ts_keys(path, pattern):
    """The entries of a generated table (data/gen3/<path>), each key with its line."""
    return {m.group(1): m.group(2) for m in re.finditer(pattern, open(os.path.join(OUT_TS, path), encoding='utf8').read(), re.M)}


TRAINER_KEYS = set(ts_keys('trainers.ts', r"^  '([\w-]+)': (\{.*)$"))
MART_KEYS = set(ts_keys('marts.ts', r"^  (\w+): (\[.*\]),$"))


def main():
    if '--dump' in sys.argv:
        # Prints a map's walkable grid (with its objects and warps) to find tiles for the fixes.
        g = Grid(load(sys.argv[sys.argv.index('--dump') + 1]), True)
        marks = {(o['x'], o['y']): ('T' if trainer_of(o) else 's' if story(o) else 'o') for o in g.m.objects} | {(w['x'], w['y']): 'W' for w in g.m.warps}
        print('    ' + ''.join(str(x % 10) for x in range(g.m.w)))
        for y in range(g.m.h):
            print('%3d ' % y + ''.join(marks.get((x, y), g.char(x, y)) for x in range(g.m.w)))
        return
    report = []
    seen = set()
    out_areas = []
    sprites = set()
    used_maps = {}
    # Tiles walked only by the fixes (the gyms' user's tiles, ledges walked either way, Sootopolis Gym's track), by map, for collision.ts.
    fixed = collections.defaultdict(set)
    last_legs = []
    walked_legs = []
    for a in AREAS:
        if a['kind'] == 'town':
            m = load(a['map'])
            used_maps.setdefault(a['map'], Grid(m, False))
            # Where the player stands: before the Pokémon Center's door (Ever Grande City's: the Pokémon League's, its 1F the Center).
            pc = next(w for w in m.warps if w['dest_map'] == a['stand_to']) if a.get('stand_to') else next(w for w in m.warps if w['dest_map'].endswith('_POKEMON_CENTER_1F'))
            marts = a['marts'] + (a['expanded']['marts'] if a.get('expanded') else [])
            for k in marts:
                if k not in MART_KEYS:
                    raise SystemExit(f"{a['id']}: {k} isn't in marts.ts")
            area = {'id': a['id'], 'name': a['name'], 'kind': 'town', 'map': a['map'], 'stand': [pc['x'], pc['y'] + 1], 'marts': a['marts'], 'gym': a['gym']}
            if a.get('expanded'):
                area['expanded'] = a['expanded']
            if a['marts']:
                mart_map, area['mart'] = mart_of(a['marts'], sprites)
                used_maps.setdefault(mart_map, Grid(load(mart_map), False))
            out_areas.append(area)
            # The area before the town's (Kanto's rule); else, where it has no loop (Dewford's, after the boat trips with no
            # wild Pokémon: the user's), the nearest walked before it that has one.
            if a['gym'] and walked_legs:
                for area_id, li, names, grids, track, links in reversed(last_legs if any(grind_loop(*l[2:]) for l in last_legs) else walked_legs):
                    loop = grind_loop(names, grids, track, links)
                    if loop:
                        area['grind'] = {'area': area_id, 'leg': li, 'loop': loop}
                        print(' ', a['id'], 'grinds on', area_id, 'leg', li, names[loop[0][0]], loop[0][1:3])
                        break
                else:
                    report.append(f"{a['id']}: no loop to grind on")
            print(a['id'], '- town', a['map'], marts)
            continue
        legs = []
        trainers = []
        last_legs = []
        fishing_maps = {}
        for lg in a['legs']:
            if lg['end'] is None:
                lg['end'] = lg['start']
            names, grids, track, order = plan_leg(lg, seen, report)
            for n, g in zip(names, grids):
                # (A gym's people as it has them: only its trainers in the way, or no one in Mossdeep Gym.)
                used_maps.setdefault(n, g if lg.get('gym') else Grid(g.m, False))
                fixed[n] |= {(x, y) for x, y in g.fixes if g.m.inside(x, y) and g.char(x, y) != '.'}
                if g.ledges_free:
                    fixed[n] |= {(x, y) for y in range(g.m.h) for x in range(g.m.w) if g.char(x, y) in 'v^<>' and g.walkable(x, y)}
            if lg.get('path'):
                fixed[names[0]] |= {(x, y) for (_, x, y), _ in track if grids[0].char(x, y) != '.'}

            def tile_of(node):
                mm = grids[node[0]].m
                return ('.' if lg.get('no_wild') else wild_letter(mm, node[1], node[2])) + terrain(mm, node[1], node[2])
            # Each step: [map index, x, y, flags (1 a fade, 2 a ledge jump), tile]: its wild encounters and battle terrain.
            legs.append({'maps': names, 'track': [[n[0], n[1], n[2], f, tile_of(n)] for n, f in track]})
            # (A leg with no wild Pokémon, the boat trips', grinds nowhere.)
            if not lg.get('no_wild'):
                last_legs.append((a['id'], len(legs) - 1, names, grids, track, leg_links(names, grids, lg)))
                walked_legs.append(last_legs[-1])
            # Where it fishes on each map with fishing, one a map (Kanto's rule).
            for mi, n in enumerate(names):
                if grids[mi].m.id not in FISH_TABLES or n in fishing_maps or lg.get('no_wild'):
                    continue
                spot = fishing_spot(grids[mi], [(i, x, y) for i, ((tm, x, y), _) in enumerate(track) if tm == mi])
                if spot is None:
                    report.append(f"{a['id']}: no water to fish in on {n}")
                    continue
                fishing_maps[n] = [len(legs) - 1, *spot]
            # Each trainer faces where the player meets them: the first step of the track in their sight (every one not
            # yet met whose sight a step is in, one battle after another, as idle.ts's trainerHere).
            met = {}
            for node, _ in track:
                for t in order:
                    if t['key'] not in met and node in t['sight']:
                        met[t['key']] = node
            for t in order:
                if t['key'] in met:
                    _, mx, my = met[t['key']]
                    dx, dy = mx - t['x'], my - t['y']
                    t['face'] = ('right' if dx > 0 else 'left') if abs(dx) >= abs(dy) and dx else ('down' if dy > 0 else 'up')
                if t['key'] not in TRAINER_KEYS:
                    report.append(f"{a['id']}: {t['key']} isn't in trainers.ts")
                sprites.add('OBJ_EVENT_GFX_' + t['gfx'].upper())
                trainers.append({'key': t['key'], 'leg': len(legs) - 1, 'map': t['map'], 'x': t['x'], 'y': t['y'], 'face': t['face'], 'sprite': sprite_name(t['gfx']),
                                 'sight': sorted([x, y] for _, x, y in t['sight']),
                                 # Standing in tall grass (MetatileBehavior_IsTallGrass): its grass drawn over their feet.
                                 **({'grass': True} if terrain(grids[t['map']].m, t['x'], t['y']) == 'g' else {})})
        area = {'id': a['id'], 'name': a['name'], 'kind': a['kind'], 'legs': legs, 'trainers': trainers}
        if fishing_maps:
            area['fishing'] = list(fishing_maps.values())
        for k in ('town', 'badge', 'leader'):
            if a.get(k):
                area[k] = a[k]
        if a['kind'] in ('gym', 'league') and not any(t['key'] == a['leader'] for t in trainers):
            raise SystemExit(f"{a['id']}: its leader {a['leader']} wasn't found")
        out_areas.append(area)
        print(a['id'], '-', sum(len(l['track']) for l in legs), 'steps,', [t['key'] for t in trainers])
    # Maps only shown (the starter's scene: Professor Birch's lab).
    for n in ('LittlerootTown_ProfessorBirchsLab',):
        used_maps.setdefault(n, Grid(load(n), False))
    out_maps = {}
    os.makedirs(os.path.join(PUB, 'idle', 'gen3', 'maps'), exist_ok=True)
    for n, g in used_maps.items():
        m = g.m
        own = os.path.join(PUB, 'idle', 'gen3', 'maps', n.lower())
        picture = ROUTE_PICTURES.get(n)
        if picture and os.path.exists(os.path.join(PUB, 'routes', picture)):
            image = '/routes/' + picture
            # Its top layer: the Badge Challenge's overhead where it has one (the user's), else the game's (emerald_map.render's).
            if os.path.exists(os.path.join(PUB, 'routes', picture[:-len('.png')] + '_overhead.png')):
                top = '/routes/' + picture[:-len('.png')] + '_overhead.png'
            else:
                if not os.path.exists(own + '_overhead.png'):
                    em.render(SRC, n, own)
                    os.remove(own + '.png')
                    os.remove(own + '.json')
                top = '/idle/gen3/maps/' + n.lower() + '_overhead.png'
        else:
            image = '/idle/gen3/maps/' + n.lower() + '.png'
            top = '/idle/gen3/maps/' + n.lower() + '_overhead.png'
            if not os.path.exists(own + '.png'):
                em.render(SRC, n, own)
                os.remove(own + '.json')
        out_maps[n] = {
            'name': n,
            'image': image,
            'width': m.w,
            'height': m.h,
            'encounters': m.id[len('MAP_'):],
            'scene': m.json.get('battle_scene', 'MAP_BATTLE_SCENE_NORMAL')[len('MAP_BATTLE_SCENE_'):].lower(),
            'section': m.json['region_map_section'][len('MAPSEC_'):].lower(),
            'music': m.json.get('music', ''),
            'top': top,
            **weather_of(n),
        }
    # Overworld sprites the trainers and the marts' people need, cut from the game where public/overworld/rse/ has none
    # (and Professor Birch, in the starter's scene).
    sprites.add('OBJ_EVENT_GFX_PROF_BIRCH')
    gfx = es.Graphics(SRC)
    for s in sorted(sprites):
        p = os.path.join(PUB, 'overworld', sprite_name(s) + '.png')
        if not os.path.exists(p):
            try:
                es.strip(gfx.frames(s)).save(p)
                print('  cut', sprite_name(s))
            except Exception as e:  # noqa: BLE001
                report.append(f'sprite {s}: {e}')
    head = "// Generated by tools/idle/hoenn_areas.py from the pret/pokeemerald decompilation. Don't edit by hand.\n"
    open(os.path.join(OUT_TS, 'maps.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "import type { IdleMap } from '../../areas.js';\n\n/** The Emerald maps the Hoenn areas walk, by name (data/maps/<name>). */\nexport const HOENN_MAPS: Record<string, IdleMap> = {\n"
        + ''.join(f'  {k}: {js(v)},\n' for k, v in out_maps.items()) + '};\n')
    open(os.path.join(OUT_TS, 'areas.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "import type { IdleArea } from '../../areas.js';\n\n/** Hoenn's areas in the game's order, from Littleroot Town to Wallace, each with its legs' planned tracks ([map index in the leg, x, y, flags: 1 a fade, 2 a ledge jump, the tile: wild encounters and battle terrain]) and trainers. */\nexport const HOENN_AREAS: IdleArea[] = [\n"
        + ''.join(f'  {js(a)},\n' for a in out_areas) + '];\n')
    # Each map's collision, for hoenn-areas.test.ts's check that every step is walkable: its tiles ('.' walkable, '#'
    # not, '~' water, a ledge's way), its warps, the people in the way and the tiles the fixes open.
    collision = {}
    for n, g in used_maps.items():
        m = g.m
        collision[n] = {'rows': [''.join(g.char(x, y) for x in range(m.w)) for y in range(m.h)], 'warps': sorted([w['x'], w['y']] for w in m.warps),
                        'people': sorted([x, y] for x, y in g.people), 'fixed': sorted([x, y] for x, y in fixed.get(n, ()))}
    open(os.path.join(OUT_TS, 'collision.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "/** The collision of the Emerald maps the Hoenn areas walk (maps.ts's), only for hoenn-areas.test.ts: each map's tiles by row ('.' walkable, '#' not, '~' water, '<', '>', '^', 'v' a ledge), warps, the people in the way and the tiles walkable by the fixes. */\nexport const HOENN_COLLISION: Record<string, { rows: string[]; warps: [number, number][]; people: [number, number][]; fixed: [number, number][] }> = {\n"
        + ''.join(f'  {k}: {js(v)},\n' for k, v in collision.items()) + '};\n')
    if '--draw' in sys.argv:
        # Each leg's track and its trainers' sight lines over its maps' pictures (to check the plans by eye).
        out = sys.argv[sys.argv.index('--draw') + 1]
        os.makedirs(out, exist_ok=True)
        for a in out_areas:
            for li, lg in enumerate(a.get('legs', [])):
                for mi, n in enumerate(lg['maps']):
                    img = Image.open(os.path.join(PUB, out_maps[n]['image'].lstrip('/'))).convert('RGB')
                    px = img.load()
                    for t in a['trainers']:
                        if t['leg'] == li and t['map'] == mi:
                            for sx, sy in t['sight']:
                                for d in range(4, 12):
                                    px[sx * 16 + d, sy * 16 + d] = (255, 0, 0)
                    for s in lg['track']:
                        if s[0] == mi:
                            for dy in range(6, 10):
                                for dx in range(6, 10):
                                    px[s[1] * 16 + dx, s[2] * 16 + dy] = (255, 255, 0) if not s[3] else (0, 200, 255)
                    img.save(os.path.join(out, f"{a['id']}-{li}-{n}.png"))
    print(len(out_maps), 'maps,', len(out_areas), 'areas')
    for (n, k), (x0, y0, x1, y1) in sorted(PAIRS.items()):
        print(f'  pair: {n} {k}: {x0},{y0} and {x1},{y1}')
    for r in report:
        print('  !', r)


main()
