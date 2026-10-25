"""Makes the Idle Adventure's Kanto areas (README: Idle Adventure) from a checkout of the pret/pokefirered decompilation:
packages/idle/src/data/gen1/maps.ts (each FireRed map the run walks: its picture, size, walkable tiles, tall grass,
encounter tiles, battle terrain, trainers with their sight lines) and areas.ts (the run's areas in the game's order:
routes, dungeons, towns, gyms and the League, each with the player's planned track), and the maps' pictures
(apps/web/public/idle/gen1/maps/<map>.png; a map the run maps already draw keeps theirs, public/routes/) and any trainer
overworld sprite not drawn yet (public/overworld/, as tools/battle-tower/frlg_sprites.py cuts them).

Each area is legs, each over one or more maps: from its start to its end, past every trainer's sight line, nearest
first (trainers reached only off the walkable map are left out and listed), then out; legs are joined by a fade. A leg's
maps are joined where the game joins them: map connections, warps between them (stairs and ladders), and gatehouses
(a warp into a building whose other warp comes back out onto one of the leg's maps). Walking follows the game:
collision and elevation, ledges jumped one way, water only where the area surfs; obstacles an HM would clear (Cut trees,
boulders, Snorlax) are walked through, and the gyms' puzzles by the fixes below (agreed with the user: no HMs needed).
A trainer sees `trainer_sight_or_berry_tree_id` tiles straight ahead (every way for those that look around), stopping
at anything in the way (trainer_see.c); one with no sight is battled from the tile in front.

Usage: python tools/idle/kanto_areas.py <pokefirered checkout>. Needs Pillow."""
import collections, json, os, re, struct, sys
from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen1')
PUB = os.path.join(ROOT, 'apps', 'web', 'public')
sys.path.insert(0, os.path.join(ROOT, 'tools', 'routes', 'emerald'))
import emerald_sprites as es  # noqa: E402

DIRS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}


def read(path):
    return open(os.path.join(SRC, path), encoding='utf8').read()


def key(const, prefix):
    return const[len(prefix):].lower().replace('_', '-')


def snake(tileset):
    words = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', tileset.replace('gTileset_', ''))
    return words.lower()


SHARED_GRAPHICS = {'silph_co': 'condominiums'}
BEHAVIORS = {int(v, 0): n for n, v in re.findall(r'#define\s+(MB_\w+)\s+(0x[0-9A-Fa-f]+|\d+)', read('include/constants/metatile_behaviors.h'))}
LAYOUTS = {l['id']: l for l in json.loads(read('data/layouts/layouts.json'))['layouts'] if 'id' in l}
MAP_DIRS = {json.loads(read(f'data/maps/{d}/map.json'))['id']: d for d in os.listdir(os.path.join(SRC, 'data', 'maps')) if os.path.exists(os.path.join(SRC, 'data', 'maps', d, 'map.json'))}

# Every script label's first trainerbattle (data/scripts/trainers.inc and the maps' scripts): its trainer constants.
SCRIPT_TRAINERS = {}
for f in [os.path.join('data', 'scripts', 'trainers.inc')] + [os.path.join('data', 'maps', d, 'scripts.inc') for d in MAP_DIRS.values()]:
    if not os.path.exists(os.path.join(SRC, f)):
        continue
    label = None
    for line in read(f).split('\n'):
        m = re.match(r'^(\w+)::', line)
        if m:
            label = m.group(1)
            SCRIPT_TRAINERS.setdefault(label, [])
            continue
        m = re.search(r'trainerbattle\w*\s+(TRAINER_\w+)', line)
        if m and label:
            SCRIPT_TRAINERS[label].append(m.group(1))
        m = re.search(r'goto\w*\s+(?:VAR_\w+,\s*\w+,\s*)?(\w+_EventScript_\w+)', line)

# Graphics that don't block: item balls, Cut trees, boulders and rocks (walked through: no HMs needed), Snorlax.
FREE_GFX = ('ITEM_BALL', 'CUT_TREE', 'PUSHABLE_BOULDER', 'ROCK_SMASH_ROCK', 'SNORLAX', 'FOSSIL')
# Trainers left out (agreed: no rival battles or Team Rocket events in this version).
SKIP_TRAINER = re.compile(r'^(rival|team-rocket|champion-first|champion-rematch)')


class Map:
    """A FireRed map: its blocks (metatile, collision, elevation), behaviours, encounter types, objects and warps."""

    def __init__(self, name):
        self.name = name
        self.json = json.loads(read(f'data/maps/{name}/map.json'))
        layout = LAYOUTS[self.json['layout']]
        self.w, self.h = layout['width'], layout['height']
        data = open(os.path.join(SRC, layout['blockdata_filepath']), 'rb').read()
        self.blocks = list(struct.unpack('<%dH' % (len(data) // 2), data))
        self.tilesets = []
        for kind, ts in (('primary', layout['primary_tileset']), ('secondary', layout['secondary_tileset'])):
            folder = f'data/tilesets/{kind}/{snake(ts)}'
            gfx = f'data/tilesets/{kind}/{SHARED_GRAPHICS.get(snake(ts), snake(ts))}'
            self.tilesets.append((folder, gfx))
        self.attrs_p = self.u32s(self.tilesets[0][0] + '/metatile_attributes.bin')
        self.attrs_s = self.u32s(self.tilesets[1][0] + '/metatile_attributes.bin')
        self.id = self.json['id']
        self.type = self.json['map_type']
        self.objects = self.json.get('object_events', [])
        self.warps = self.json.get('warp_events', [])

    def u32s(self, p):
        d = open(os.path.join(SRC, p), 'rb').read()
        return list(struct.unpack('<%dI' % (len(d) // 4), d))

    def attr(self, x, y):
        mid = self.blocks[y * self.w + x] & 0x3FF
        return self.attrs_p[mid] if mid < 640 else self.attrs_s[mid - 640]

    def behavior(self, x, y):
        return BEHAVIORS.get(self.attr(x, y) & 0x1FF, '')

    def collision(self, x, y):
        return (self.blocks[y * self.w + x] >> 10) & 3

    def elevation(self, x, y):
        return self.blocks[y * self.w + x] >> 12

    def encounter(self, x, y):
        return (self.attr(x, y) >> 24) & 7

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def render(self, out):
        """The map's picture (as tools/routes/render_route.py draws it)."""
        def pal(p):
            lines = open(os.path.join(SRC, p)).read().split()
            return [tuple(int(v) for v in lines[3 + i * 3: 6 + i * 3]) for i in range(int(lines[2]))]
        pals = [pal(f'{self.tilesets[0][1]}/palettes/%02d.pal' % i) for i in range(7)] + [pal(f'{self.tilesets[1][1]}/palettes/%02d.pal' % i) for i in range(7, 16)]

        def tiles(p):
            im = Image.open(os.path.join(SRC, p))
            px = im.load()
            out = []
            for ty in range(im.size[1] // 8):
                for tx in range(im.size[0] // 8):
                    out.append([[px[tx * 8 + x, ty * 8 + y] & 15 for x in range(8)] for y in range(8)])
            return out
        t = tiles(self.tilesets[0][1] + '/tiles.png')[:640] + tiles(self.tilesets[1][1] + '/tiles.png')
        meta_p = struct.unpack('<%dH' % (len(open(os.path.join(SRC, self.tilesets[0][0] + '/metatiles.bin'), 'rb').read()) // 2), open(os.path.join(SRC, self.tilesets[0][0] + '/metatiles.bin'), 'rb').read())
        meta_s = struct.unpack('<%dH' % (len(open(os.path.join(SRC, self.tilesets[1][0] + '/metatiles.bin'), 'rb').read()) // 2), open(os.path.join(SRC, self.tilesets[1][0] + '/metatiles.bin'), 'rb').read())
        img = Image.new('RGB', (self.w * 16, self.h * 16), pals[0][0])
        px = img.load()
        for by in range(self.h):
            for bx in range(self.w):
                mid = self.blocks[by * self.w + bx] & 0x3FF
                entries = meta_p[mid * 8: mid * 8 + 8] if mid < 640 else meta_s[(mid - 640) * 8: (mid - 640) * 8 + 8]
                for layer in range(2):
                    for q in range(4):
                        e = entries[layer * 4 + q]
                        tile, hf, vf, p = e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1, (e >> 12) & 0xF
                        tt = t[tile] if tile < len(t) else [[0] * 8] * 8
                        ox, oy = bx * 16 + (q % 2) * 8, by * 16 + (q // 2) * 8
                        for y in range(8):
                            row = tt[7 - y if vf else y]
                            for x in range(8):
                                v = row[7 - x if hf else x]
                                if v:
                                    px[ox + x, oy + y] = pals[p][v]
        os.makedirs(os.path.dirname(out), exist_ok=True)
        img.save(out, optimize=True)


MAPS = {}


def load(name):
    if name not in MAPS:
        MAPS[name] = Map(name)
    return MAPS[name]


def trainer_of(obj):
    """An object's trainer constant, if its script battles (the first trainerbattle under its label)."""
    t = SCRIPT_TRAINERS.get(obj.get('script', ''), [])
    return t[0] if t else None


def facings(movement):
    """The ways a trainer looks, from its movement type: every way for those that look around or wander."""
    m = movement.replace('MOVEMENT_TYPE_', '')
    if any(k in m for k in ('LOOK_AROUND', 'ROTATE', 'WANDER_AROUND', 'RANDOMLY')):
        return ['down', 'up', 'left', 'right']
    found = [d for d in ('down', 'up', 'left', 'right') if d.upper() in m]
    return found or ['down']


# ---- Walking ----
UNWALKABLE = re.compile(r'WATERFALL|IMPASSABLE|MB_COUNTER|BOOKSHELF|PC|CABINET|KITCHEN|DRESSER|SNACKS|PAINTING|POWER_PLANT|TELEVISION|SHELF|VASE|BLUEPRINT|MACHINE|BURGLARY|TRASH|FOOD|CUP|WIRELESS|QUESTIONNAIRE|POKEMART')
WATER = re.compile(r'WATER|POND|OCEAN|CURRENT|DIVE')
LEDGES = {'MB_JUMP_SOUTH': 'down', 'MB_JUMP_NORTH': 'up', 'MB_JUMP_EAST': 'right', 'MB_JUMP_WEST': 'left'}


class Grid:
    """One map's walkable tiles for an area (water when it surfs; `fixes` add tiles), objects in the way."""

    def __init__(self, m, surf, fixes=()):
        self.m = m
        self.blocked = set()
        for o in m.objects:
            gfx = o['graphics_id'].replace('OBJ_EVENT_GFX_', '')
            if not any(f in gfx for f in FREE_GFX):
                self.blocked.add((o['x'], o['y']))
        self.warp_tiles = {(w['x'], w['y']) for w in m.warps}
        self.fixes = set(fixes)
        self.surf = surf

    def ledge(self, x, y):
        return LEDGES.get(self.m.behavior(x, y))

    def water(self, x, y):
        b = self.m.behavior(x, y)
        return bool(WATER.search(b)) and 'WATERFALL' not in b and 'SHALLOW' not in b and 'PUDDLE' not in b

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
        return self.m.collision(x, y) == 0

    def char(self, x, y):
        if (x, y) in self.blocked and not any((o['x'], o['y']) == (x, y) for o in self.m.objects if trainer_of(o)):
            return '#'
        l = self.ledge(x, y)
        if l:
            return {'down': 'v', 'up': '^', 'left': '<', 'right': '>'}[l]
        if self.water(x, y) and self.m.collision(x, y) == 0:
            return '~'
        return '.' if self.walkable(x, y) else '#'


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
        if g.walkable(nx, ny) and (elev_ok(g.m, x, y, nx, ny) or g.water(x, y) or g.water(nx, ny)):
            yield (mi, nx, ny), 0
    for to in links.get(node, ()):
        yield to, 1


def bfs(grids, links, start, targets):
    """The shortest walk from start to any of `targets` (a set of nodes): the steps [(node, flag)], or None."""
    prev = {start: None}
    q = collections.deque([start])
    while q:
        n = q.popleft()
        if n in targets:
            path = []
            while prev[n]:
                p, flag = prev[n]
                path.append((n, flag))
                n = p
            return path[::-1]
        for to, flag in neighbours(grids, links, n):
            if to not in prev:
                prev[to] = (n, flag)
                q.append(to)
    return None


def build_links(names, grids):
    """The leg's links between nodes: warps between its maps, gatehouses (in and back out onto its maps), map connections."""
    links = collections.defaultdict(list)
    index = {load(n).id: i for i, n in enumerate(names)}
    for i, n in enumerate(names):
        m = load(n)
        for w in m.warps:
            dest = w['dest_map']
            here = (i, w['x'], w['y'])
            if dest in index:
                dm = load(names[index[dest]])
                dw = dm.warps[int(w['dest_warp_id'])]
                links[here].append((index[dest], dw['x'], dw['y']))
            elif dest in MAP_DIRS:
                # A gatehouse: its other warps leading back out onto one of the leg's maps.
                g_warps = json.loads(read(f'data/maps/{MAP_DIRS[dest]}/map.json')).get('warp_events', [])
                entered = int(w['dest_warp_id'])
                for j, gw in enumerate(g_warps):
                    if j == entered or gw['dest_map'] not in index:
                        continue
                    om = load(names[index[gw['dest_map']]])
                    ow = om.warps[int(gw['dest_warp_id'])]
                    to = (index[gw['dest_map']], ow['x'], ow['y'])
                    if to != here:
                        links[here].append(to)
        for c in m.json.get('connections') or []:
            if c['map'] not in index:
                continue
            j = index[c['map']]
            o = load(names[j])
            off = int(c['offset'])
            d = c['direction']
            span = range(m.w) if d in ('up', 'down') else range(m.h)
            for k in span:
                if d == 'up':
                    a, b = (k, 0), (k - off, o.h - 1)
                elif d == 'down':
                    a, b = (k, m.h - 1), (k - off, 0)
                elif d == 'left':
                    a, b = (0, k), (o.w - 1, k - off)
                else:
                    a, b = (m.w - 1, k), (0, k - off)
                if o.inside(*b) and grids[i].walkable(*a) and grids[j].walkable(*b):
                    links[(i, *a)].append((j, *b))
    return links


def edge_tile(g, d):
    """The tile a leg starts or ends at on a map edge: the middle of the longest run of walkable tiles along it."""
    m = g.m
    if d in ('up', 'down'):
        y = 0 if d == 'up' else m.h - 1
        cells = [(x, y) for x in range(m.w)]
    else:
        x = 0 if d == 'left' else m.w - 1
        cells = [(x, y) for y in range(m.h)]
    runs, cur = [], []
    for c in cells:
        if g.walkable(*c):
            cur.append(c)
        else:
            if cur:
                runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    if not runs:
        raise SystemExit(f'{m.name}: nothing walkable on its {d} edge')
    best = max(runs, key=len)
    return best[len(best) // 2]


def spec_tile(names, grids, spec):
    """A leg's start or end: (map, 'edge', way), (map, 'warp', index or destination map), (map, 'tile', x, y)."""
    mi = names.index(spec[0])
    g = grids[mi]
    if spec[1] == 'edge':
        return (mi, *edge_tile(g, spec[2]))
    if spec[1] == 'warp':
        ws = g.m.warps
        w = ws[spec[2]] if isinstance(spec[2], int) else next(w for w in ws if w['dest_map'] == spec[2])
        return (mi, w['x'], w['y'])
    return (mi, spec[2], spec[3])


def sight_tiles(g, o, sight):
    """The tiles a trainer sees: `sight` tiles straight ahead each way it looks, stopping at anything in the way; with no sight, the tile in front."""
    out = set()
    for d in facings(o['movement_type']):
        dx, dy = DIRS[d]
        for i in range(1, max(1, sight) + 1):
            x, y = o['x'] + dx * i, o['y'] + dy * i
            if not g.walkable(x, y):
                break
            out.add((x, y))
    if not out:
        # Looking at a wall (Viridian Forest's Charlie): talked to from beside them, as in the game.
        out = {(o['x'] + dx, o['y'] + dy) for dx, dy in DIRS.values() if g.walkable(o['x'] + dx, o['y'] + dy)}
    return out


def plan_leg(leg, trainers_seen, report):
    """A leg's track (steps [map index, x, y, flags]) and its trainers (with their sight lines)."""
    names = leg['maps']
    grids = [Grid(load(n), leg.get('surf', False), leg.get('fixes', {}).get(n, ())) for n in names]
    links = build_links(names, grids)
    start = spec_tile(names, grids, leg['start'])
    end = spec_tile(names, grids, leg['end'])
    trainers = []
    for mi, n in enumerate(names):
        for oi, o in enumerate(load(n).objects):
            const = trainer_of(o)
            # A League room's boss: its first person (their battle starts from the room's own script, not the object's).
            if leg.get('boss') and mi == 0 and oi == 0:
                const = 'TRAINER_' + leg['boss'].upper().replace('-', '_')
            if not const:
                continue
            k = key(const, 'TRAINER_')
            if leg.get('boss') == k:
                pass
            elif leg.get('boss'):
                continue
            if SKIP_TRAINER.match(k) or (n, k) in trainers_seen or k in leg.get('skip', ()):
                continue
            sight = int(o.get('trainer_sight_or_berry_tree_id', '0') or 0) if o.get('trainer_type', 'TRAINER_TYPE_NONE') != 'TRAINER_TYPE_NONE' else 0
            tiles = sight_tiles(grids[mi], o, sight)
            trainers.append({'key': k, 'const': const, 'map': mi, 'x': o['x'], 'y': o['y'], 'gfx': o['graphics_id'].replace('OBJ_EVENT_GFX_', '').lower(),
                             'face': facings(o['movement_type'])[0], 'sight': {(mi, x, y) for x, y in tiles}, 'range': sight})
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
        path = bfs(grids, links, here, {end})
        if path is None:
            raise SystemExit(f'{names}: no way from {here} to the end {end}')
        walk(path)
    for t in order:
        trainers_seen.add((names[t['map']], t['key']))
    return names, grids, track, order


# ---- The run's areas, in the game's order (agreed with the user; the list checked against the game's path) ----
def edge(m, d):
    return (m, 'edge', d)


def warp(m, w):
    return (m, 'warp', w)


def leg(maps, start, end, **kw):
    return {'maps': maps, 'start': start, 'end': end, **kw}


def opened_tiles(m):
    """The tiles a map's scripts open (setmetatile with no collision: Cinnabar Gym's quiz gates), walked as open: the puzzles count as solved."""
    return [(int(x), int(y)) for x, y in re.findall(r'setmetatile\s+(\d+),\s*(\d+),\s*\w+,\s*0\b', read(f'data/maps/{m}/scripts.inc'))]


def gym(area_id, name, town, m, leader, badge, **kw):
    door = next(w for w in load(m).warps)
    kw.setdefault('fixes', {})
    kw['fixes'][m] = list(kw['fixes'].get(m, [])) + opened_tiles(m)
    return {'id': area_id, 'name': name, 'kind': 'gym', 'town': town, 'badge': badge, 'leader': leader,
            'legs': [leg([m], (m, 'tile', door['x'], door['y'] - 1), None, last=(leader,), ends_at_last=True, **kw)]}


def league(area_id, name, m, boss, **kw):
    entrance = next(w for w in load(m).warps if w['y'] == max(x['y'] for x in load(m).warps))
    return {'id': area_id, 'name': name, 'kind': 'league', 'leader': boss,
            'legs': [leg([m], (m, 'tile', entrance['x'], entrance['y'] - 1), None, last=(boss,), ends_at_last=True, boss=boss, **kw)]}


def town(area_id, name, m, marts, gym=None, **kw):
    return {'id': area_id, 'name': name, 'kind': 'town', 'map': m, 'marts': marts, 'gym': gym, **kw}


AREAS = [
    {'id': 'route-1', 'name': 'Route 1', 'kind': 'route', 'legs': [leg(['Route1'], edge('Route1', 'down'), edge('Route1', 'up'))]},
    town('viridian-city', 'Viridian City', 'ViridianCity', ['ViridianCity_Mart_Items']),
    {'id': 'route-2', 'name': 'Route 2', 'kind': 'route', 'legs': [leg(['Route2', 'ViridianForest'], edge('Route2', 'down'), edge('Route2', 'up'), via=('ViridianForest',))]},
    town('pewter-city', 'Pewter City', 'PewterCity', ['PewterCity_Mart_Items'], 'pewter-gym'),
    gym('pewter-gym', 'Pewter Gym', 'pewter-city', 'PewterCity_Gym', 'leader-brock', 'Boulder'),
    {'id': 'route-3', 'name': 'Route 3', 'kind': 'route', 'legs': [leg(['Route3', 'Route4'], edge('Route3', 'left'), warp('Route4', 'MAP_MT_MOON_1F'))]},
    {'id': 'mt-moon', 'name': 'Mt. Moon', 'kind': 'dungeon', 'legs': [
        leg(['MtMoon_1F', 'MtMoon_B1F', 'MtMoon_B2F'], warp('MtMoon_1F', 'MAP_ROUTE4'), warp('MtMoon_B1F', 'MAP_ROUTE4'), via=('MtMoon_B2F',)),
        leg(['Route4'], warp('Route4', 'MAP_MT_MOON_B1F'), edge('Route4', 'right')),
    ]},
    town('cerulean-city', 'Cerulean City', 'CeruleanCity', ['CeruleanCity_Mart_Items'], 'cerulean-gym'),
    gym('cerulean-gym', 'Cerulean Gym', 'cerulean-city', 'CeruleanCity_Gym', 'leader-misty', 'Cascade'),
    {'id': 'route-24', 'name': 'Routes 24 and 25', 'kind': 'route', 'legs': [leg(['Route24', 'Route25'], edge('Route24', 'down'), warp('Route25', 'MAP_ROUTE25_SEA_COTTAGE'))]},
    {'id': 'route-5', 'name': 'Routes 5 and 6', 'kind': 'route', 'legs': [
        leg(['Route5'], edge('Route5', 'up'), warp('Route5', 'MAP_UNDERGROUND_PATH_NORTH_ENTRANCE')),
        leg(['Route6'], warp('Route6', 'MAP_UNDERGROUND_PATH_SOUTH_ENTRANCE'), edge('Route6', 'down')),
    ]},
    town('vermilion-city', 'Vermilion City', 'VermilionCity', ['VermilionCity_Mart_Items'], 'vermilion-gym'),
    # Through the electric barrier (the trash can puzzle's gate): the run maps' fix, from the user.
    gym('vermilion-gym', 'Vermilion Gym', 'vermilion-city', 'VermilionCity_Gym', 'leader-lt-surge', 'Thunder', fixes={'VermilionCity_Gym': [(6, 6), (6, 7), (5, 6)]}),
    {'id': 'route-9', 'name': 'Routes 9 and 10', 'kind': 'route', 'legs': [leg(['Route9', 'Route10'], edge('Route9', 'left'), warp('Route10', 0))]},
    {'id': 'rock-tunnel', 'name': 'Rock Tunnel', 'kind': 'dungeon', 'legs': [
        leg(['RockTunnel_1F', 'RockTunnel_B1F'], warp('RockTunnel_1F', 0), warp('RockTunnel_1F', 5), via=('RockTunnel_B1F',)),
        leg(['Route10'], warp('Route10', 1), edge('Route10', 'down')),
    ]},
    town('lavender-town', 'Lavender Town', 'LavenderTown', ['LavenderTown_Mart_Items']),
    {'id': 'route-8', 'name': 'Routes 8 and 7', 'kind': 'route', 'legs': [
        leg(['Route8'], edge('Route8', 'right'), warp('Route8', 'MAP_UNDERGROUND_PATH_EAST_ENTRANCE')),
        leg(['Route7'], warp('Route7', 'MAP_UNDERGROUND_PATH_WEST_ENTRANCE'), edge('Route7', 'left')),
    ]},
    town('celadon-city', 'Celadon City', 'CeladonCity', ['CeladonCity_DepartmentStore_2F_Items', 'CeladonCity_DepartmentStore_4F_Items'], 'celadon-gym'),
    gym('celadon-gym', 'Celadon Gym', 'celadon-city', 'CeladonCity_Gym', 'leader-erika', 'Rainbow'),
    {'id': 'route-16', 'name': 'Routes 16, 17 and 18', 'kind': 'route', 'legs': [leg(['Route16', 'Route17', 'Route18'], edge('Route16', 'right'), edge('Route18', 'right'))]},
    town('fuchsia-city', 'Fuchsia City', 'FuchsiaCity', ['FuchsiaCity_Mart_Items'], 'fuchsia-gym'),
    gym('fuchsia-gym', 'Fuchsia Gym', 'fuchsia-city', 'FuchsiaCity_Gym', 'leader-koga', 'Soul'),
    {'id': 'route-15', 'name': 'Routes 15, 14, 13 and 12', 'kind': 'route', 'legs': [leg(['Route15', 'Route14', 'Route13', 'Route12'], edge('Route15', 'left'), edge('Route12', 'up'))]},
    town('saffron-city', 'Saffron City', 'SaffronCity', ['SaffronCity_Mart_Items'], 'saffron-gym'),
    gym('saffron-gym', 'Saffron Gym', 'saffron-city', 'SaffronCity_Gym', 'leader-sabrina', 'Marsh'),
    {'id': 'route-19', 'name': 'Routes 19 and 20', 'kind': 'route', 'legs': [leg(['Route19', 'Route20'], edge('Route19', 'up'), warp('Route20', 1), surf=True)]},
    {'id': 'seafoam-islands', 'name': 'Seafoam Islands', 'kind': 'dungeon', 'legs': [
        leg(['SeafoamIslands_1F', 'SeafoamIslands_B1F', 'SeafoamIslands_B2F', 'SeafoamIslands_B3F', 'SeafoamIslands_B4F'], warp('SeafoamIslands_1F', 4), warp('SeafoamIslands_1F', 3), via=('SeafoamIslands_B4F',), surf=True),
        leg(['Route20'], warp('Route20', 0), edge('Route20', 'left'), surf=True),
    ]},
    town('cinnabar-island', 'Cinnabar Island', 'CinnabarIsland', ['CinnabarIsland_Mart_Items'], 'cinnabar-gym'),
    gym('cinnabar-gym', 'Cinnabar Gym', 'cinnabar-island', 'CinnabarIsland_Gym', 'leader-blaine', 'Volcano'),
    {'id': 'route-21', 'name': 'Route 21', 'kind': 'route', 'legs': [leg(['Route21_South', 'Route21_North'], edge('Route21_South', 'down'), edge('Route21_North', 'up'), surf=True)]},
    town('viridian-city-gym', 'Viridian City', 'ViridianCity', ['ViridianCity_Mart_Items'], 'viridian-gym'),
    gym('viridian-gym', 'Viridian Gym', 'viridian-city-gym', 'ViridianCity_Gym', 'leader-giovanni', 'Earth'),
    {'id': 'route-22', 'name': 'Routes 22 and 23', 'kind': 'route', 'legs': [leg(['Route22', 'Route23'], edge('Route22', 'right'), warp('Route23', 0), surf=True)]},
    {'id': 'victory-road', 'name': 'Victory Road', 'kind': 'dungeon', 'legs': [
        leg(['VictoryRoad_1F', 'VictoryRoad_2F', 'VictoryRoad_3F'], warp('VictoryRoad_1F', 1), warp('VictoryRoad_2F', 5), via=('VictoryRoad_3F',)),
        leg(['Route23'], warp('Route23', 1), edge('Route23', 'up'), surf=True),
    ]},
    town('indigo-plateau', 'Indigo Plateau', 'IndigoPlateau_Exterior', ['IndigoPlateau_PokemonCenter_1F_Items'], 'lorelei'),
    league('lorelei', "Lorelei's Room", 'PokemonLeague_LoreleisRoom', 'elite-four-lorelei'),
    league('bruno', "Bruno's Room", 'PokemonLeague_BrunosRoom', 'elite-four-bruno'),
    league('agatha', "Agatha's Room", 'PokemonLeague_AgathasRoom', 'elite-four-agatha'),
    league('lance', "Lance's Room", 'PokemonLeague_LancesRoom', 'elite-four-lance'),
    league('champion', "The Champion's Room", 'PokemonLeague_ChampionsRoom', 'champion'),
]

# ---- Battle terrain (BattleSetup_GetTerrainId) ----
def terrain(m, x, y):
    b = m.behavior(x, y)
    if b in ('MB_TALL_GRASS', 'MB_CYCLING_ROAD_PULL_DOWN_GRASS'):
        return 'g'
    if b in ('MB_SAND', 'MB_SHALLOW_WATER'):
        return 's'
    if m.type == 'MAP_TYPE_UNDERGROUND':
        if b == 'MB_INDOOR_ENCOUNTER':
            return 'b'
        return 'p' if WATER.search(b) else 'c'
    if m.type in ('MAP_TYPE_INDOOR', 'MAP_TYPE_SECRET_BASE'):
        return 'b'
    if m.type == 'MAP_TYPE_OCEAN_ROUTE':
        return 'w' if WATER.search(b) else '.'
    if b in ('MB_FAST_WATER', 'MB_DEEP_WATER', 'MB_OCEAN_WATER'):
        return 'w'
    if WATER.search(b):
        return 'p'
    if b == 'MB_MOUNTAIN_TOP':
        return 'm'
    return '.'


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


def sprite_name(gfx):
    """A trainer's overworld sprite in public/overworld/ (cut from the game when it isn't there yet)."""
    return gfx


def main():
    if '--dump' in sys.argv:
        # Prints a map's walkable grid (with its objects and warps) to find tiles for the fixes.
        g = Grid(load(sys.argv[sys.argv.index('--dump') + 1]), False)
        marks = {(o['x'], o['y']): ('T' if trainer_of(o) else 'o') for o in g.m.objects} | {(w['x'], w['y']): 'W' for w in g.m.warps}
        print('    ' + ''.join(str(x % 10) for x in range(g.m.w)))
        for y in range(g.m.h):
            print('%3d ' % y + ''.join(marks.get((x, y), g.char(x, y)) for x in range(g.m.w)), ' ', ' '.join(g.m.behavior(x, y)[3:9] for x in range(g.m.w) if not g.walkable(x, y) and g.m.collision(x, y) == 0)[:120])
        return
    report = []
    seen = set()
    out_maps = {}
    out_areas = []
    sprites = set()
    used_maps = {}
    for a in AREAS:
        if a['kind'] == 'town':
            used_maps.setdefault(a['map'], Grid(load(a['map']), False))
            m = load(a['map'])
            pc = next((w for w in m.warps if 'POKEMON_CENTER_1F' in w['dest_map']), m.warps[0])
            out_areas.append({'id': a['id'], 'name': a['name'], 'kind': 'town', 'map': a['map'], 'stand': [pc['x'], pc['y'] + 1],
                              'marts': a['marts'], 'gym': a['gym']})
            continue
        legs = []
        trainers = []
        for lg in a['legs']:
            if lg['end'] is None:
                lg['end'] = lg['start']
            names, grids, track, order = plan_leg(lg, seen, report)
            for n, g in zip(names, grids):
                used_maps.setdefault(n, g)
                if g.surf:
                    used_maps[n].surf = True
            # Each step: [map index, x, y, flags (1 a fade, 2 a ledge jump), tile]: the tile's wild encounters (the
            # metatile's encounter type: 'l' land, 'w' water, '.' none) and battle terrain (BattleSetup_GetTerrainId).
            def tile(node):
                mm = grids[node[0]].m
                return {1: 'l', 2: 'w'}.get(mm.encounter(node[1], node[2]), '.') + terrain(mm, node[1], node[2])
            legs.append({'maps': names, 'track': [[n[0], n[1], n[2], f, tile(n)] for n, f in track]})
            for t in order:
                sprites.add(t['gfx'])
                trainers.append({'key': t['key'], 'leg': len(legs) - 1, 'map': t['map'], 'x': t['x'], 'y': t['y'], 'face': t['face'], 'sprite': sprite_name(t['gfx']),
                                 'sight': sorted([x, y] for _, x, y in t['sight'])})
        area = {'id': a['id'], 'name': a['name'], 'kind': a['kind'], 'legs': legs, 'trainers': trainers}
        for k in ('town', 'badge', 'leader'):
            if a.get(k):
                area[k] = a[k]
        if a['kind'] == 'gym' or a['kind'] == 'league':
            if not any(t['key'] == a['leader'] for t in trainers):
                raise SystemExit(f"{a['id']}: its leader {a['leader']} wasn't found")
        out_areas.append(area)
        print(a['id'], '-', sum(len(l['track']) for l in legs), 'steps,', len(trainers), 'trainers')
    # Maps only shown (the starter's scene: Professor Oak's lab).
    for n in ('PalletTown_ProfessorOaksLab',):
        used_maps.setdefault(n, Grid(load(n), False))
    for n, g in used_maps.items():
        m = g.m
        route_png = os.path.join(PUB, 'routes', n.lower() + '.png')
        image = '/routes/' + n.lower() + '.png' if os.path.exists(route_png) else '/idle/gen1/maps/' + n.lower() + '.png'
        if not os.path.exists(route_png):
            m.render(os.path.join(PUB, 'idle', 'gen1', 'maps', n.lower() + '.png'))
        rows = lambda f: [''.join(f(x, y) for x in range(m.w)) for y in range(m.h)]
        enc_key = m.id[len('MAP_'):]
        del rows
        out_maps[n] = {
            'name': n,
            'image': image,
            'width': m.w,
            'height': m.h,
            'encounters': enc_key,
            'scene': m.json.get('battle_scene', 'MAP_BATTLE_SCENE_NORMAL')[len('MAP_BATTLE_SCENE_'):].lower(),
            'music': m.json.get('music', ''),
        }
    # Overworld sprites the trainers need, cut from the game where public/overworld/ has none (and Professor Oak, in the
    # starter's scene).
    sprites.add('prof_oak')
    gfx = es.Graphics(SRC)
    for s in sorted(sprites):
        p = os.path.join(PUB, 'overworld', s + '.png')
        if not os.path.exists(p):
            try:
                es.strip(gfx.frames('OBJ_EVENT_GFX_' + s.upper())).save(p)
            except Exception as e:  # noqa: BLE001
                report.append(f'sprite {s}: {e}')
    head = "// Generated by tools/idle/kanto_areas.py from the pret/pokefirered decompilation. Don't edit by hand.\n"
    open(os.path.join(OUT_TS, 'maps.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "import type { IdleMap } from '../../areas.js';\n\n/** The FireRed maps the Kanto areas walk, by name (data/maps/<name>). */\nexport const KANTO_MAPS: Record<string, IdleMap> = {\n"
        + ''.join(f'  {k}: {js(v)},\n' for k, v in out_maps.items()) + '};\n')
    open(os.path.join(OUT_TS, 'areas.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "import type { IdleArea } from '../../areas.js';\n\n/** Kanto's areas in the game's order, each with its legs' planned tracks ([map index in the leg, x, y, flags: 1 a fade, 2 a ledge jump, the tile: wild encounters and battle terrain]) and trainers. */\nexport const KANTO_AREAS: IdleArea[] = [\n"
        + ''.join(f'  {js(a)},\n' for a in out_areas) + '];\n')
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
    for r in report:
        print('  !', r)


main()
