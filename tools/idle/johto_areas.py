"""Makes the Idle Adventure's Johto areas (README: Idle Adventure, Johto's areas; issue #170, step 4b) from a checkout of
the pret/pokeheartgold decompilation, read by hgss_maps.py: packages/idle/src/data/gen2/maps.ts (each HGSS map the run
walks: its picture, size, wild table, battle background, map section, music) and areas.ts (the run's areas on Johto's
main road in the game's order, each with the player's planned track and its trainers).

The planning is kanto_areas.py's, copied here (not shared, so Kanto's generated tracks can never change: saved runs hold
steps along them) over HGSS's maps: each area is legs over one or more maps, from its start to its end past every
trainer's sight line, nearest first, through tall grass and cave floors where it can, then out; maps joined where the
game joins them (beside each other in their matrix, and warps between them); ledges jumped one way; water only where the
area surfs (Surf as in Kanto's run, the user's); HM obstacles (Cut trees, Rock Smash rocks, whirlpools, waterfalls) and
the story's blocks walked through; the Strength boulders and their puzzles disregarded (the user's: neither drawn nor
in the way). A trainer sees `param0` tiles straight ahead (every way for those whose movement turns them), stopping at
anything in the way.

Usage: python tools/idle/johto_areas.py <pokeheartgold checkout> [--print]"""
import collections, heapq, itertools, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hgss_maps as hm  # noqa: E402
import johto_gyms as jg  # noqa: E402  (tools/routes/hgss: the card runs' gyms, the user's fixes to them)

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2')
J = hm.Johto(SRC)
DIRS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}
LEDGE_WAYS = {'>': 'right', '<': 'left', '^': 'up', 'v': 'down'}
# Tile behaviours (include/constants/metatile_behavior.h): the cave floor, tall grass, the waterfall and the whirlpool.
CAVE_FLOOR = {8}
GRASS = {2, 3}
WATERFALL = 19
WHIRLPOOL = 17
ICE = 32
# Each behaviour's flags (src/metatile_behavior.c's sMetatileBehaviorFlags: 1 surfable, 2 wild encounters), by its number.
SURFABLE, ENCOUNTER = 1, 2
_FLAG_LINES = open(os.path.join(SRC, 'src', 'metatile_behavior.c'), encoding='utf8').read().split('sMetatileBehaviorFlags[] = {')[1].split('};')[0]
_FLAG_VALUE = {'TILE_BEHAVIOR_FLAG_NONE': 0, 'TILE_BEHAVIOR_FLAG_SURFABLE': 1, 'TILE_BEHAVIOR_FLAG_ENCOUNTER': 2, 'TILE_BEHAVIOR_FLAG_SURFABLE_ENCOUNTER': 3}
_ENUM = [l.strip().rstrip(',').split(' ')[0] for l in open(os.path.join(SRC, 'include', 'constants', 'metatile_behavior.h'), encoding='utf8').read().split('enum TILE_BEHAVIOR {')[1].split('}')[0].splitlines() if l.strip().startswith('TILE_BEHAVIOR_')]
BEHAVIOR_FLAGS = {_ENUM.index(b): _FLAG_VALUE[f] for b, f in re.findall(r'\[(TILE_BEHAVIOR_\w+)\]\s*=\s*(TILE_BEHAVIOR_FLAG_\w+)', _FLAG_LINES) if b in _ENUM}
# Trainers the road leaves out (the user's: no rival or Team Rocket).
SKIP_TRAINER = ('rival', 'team-rocket', 'executive')


class Map:
    """One HGSS map, read once: its tiles (hgss_maps.tiles), behaviours, events, and its place in its matrix."""

    def __init__(self, const):
        self.name = const
        self.id = const
        self.header = J.header(const)
        t = J.tiles(const)
        self.ox, self.oy = t['origin']
        self.w, self.h = t['width'], t['height']
        self.rows = t['rows']
        self.lo = t['lo']
        self.events = J.events(const)
        self.type = self.header['type']

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def char(self, x, y):
        return self.rows[y][x]

    def behavior(self, x, y):
        return self.lo[y][x]

    def encounter(self, x, y):
        """1 a land encounter tile, 2 a water one, 0 none (the behaviour's flags: encounters, and surfable for water)."""
        f = BEHAVIOR_FLAGS.get(self.behavior(x, y), 0)
        return 0 if not f & ENCOUNTER else 2 if f & SURFABLE else 1


MAPS = {}


def load(const):
    if const not in MAPS:
        MAPS[const] = Map(const)
    return MAPS[const]


class Grid:
    """A map's walkable tiles for an area: water when it surfs, people in the way (not the Cut trees, Strength
    boulders and item balls, walked through or ignored as Kanto's), `fixes` adding tiles."""

    def __init__(self, m, surf, fixes=(), floors=None, blocked=(), slides=True):
        self.m = m
        self.surf = surf
        # Ice slid across (the user's: as the game, where the leg can still be planned): onto it, on until a tile that
        # isn't ice or something in the way.
        self.slides = slides
        self.fixes = set(fixes)
        # The only tiles walkable (the user's floors and tracks in the card runs' gyms), or None.
        self.floors = floors
        e = m.events
        # People in the way, but the story's (hgss_maps: shown only for a scene), walked through as Kanto's story blocks.
        self.blocked = {(p['x'], p['y']) for p in e['people'] if not p.get('story')} | {(t['x'], t['y']) for t in e['trainers']} | set(blocked)
        self.warp_tiles = {(w['x'], w['y']) for w in e['warps']}

    def ledge(self, x, y):
        return LEDGE_WAYS.get(self.m.char(x, y)) if self.m.inside(x, y) else None

    def water(self, x, y):
        return self.m.inside(x, y) and self.m.char(x, y) == '~'

    def walkable(self, x, y):
        m = self.m
        if not m.inside(x, y) or (x, y) in self.blocked:
            return False
        if (x, y) in self.fixes or (x, y) in self.warp_tiles:
            return True
        if self.floors is not None:
            return (x, y) in self.floors
        c = m.char(x, y)
        if c in LEDGE_WAYS:
            return False
        if c == '~':
            return self.surf
        return c == '.'


# The tiles slid over on the way to a slide's end: {(from, to): [the tiles between]}.
SLIDES = {}


def neighbours(grids, links, node):
    """The tiles a step reaches from a node (map index, x, y): walking, ledge jumps (flag 2), links (flag 1, a fade) and
    slides across ice (flag 4: to where it stops, SLIDES holding the tiles between)."""
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
        if g.walkable(nx, ny):
            if g.slides and g.m.behavior(nx, ny) == ICE:
                path = [(mi, nx, ny)]
                while g.m.behavior(path[-1][1], path[-1][2]) == ICE and g.walkable(path[-1][1] + dx, path[-1][2] + dy) and not g.ledge(path[-1][1] + dx, path[-1][2] + dy):
                    path.append((mi, path[-1][1] + dx, path[-1][2] + dy))
                SLIDES[(node, path[-1])] = path[:-1]
                yield path[-1], 4
            else:
                yield (mi, nx, ny), 0
    for to in links.get(node, ()):
        yield to, 1


# A step's cost (the user's, as Kanto's: through tall grass where it can): onto a wild encounter tile GRASS_STEP, onto any other PLAIN_STEP.
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


def build_links(names, grids, extra=()):
    """The leg's links: warps between its maps (to the warp its anchor names), maps beside each other in a matrix (the
    same matrix: a step across their shared edge), and `extra` ((map, x, y) pairs, both ways: the user's carts and panels)."""
    links = collections.defaultdict(list)
    index = {n: i for i, n in enumerate(names)}
    for (am, ax, ay), (bm, bx, by) in extra:
        links[(index[am], ax, ay)].append((index[bm], bx, by))
        links[(index[bm], bx, by)].append((index[am], ax, ay))
    for i, n in enumerate(names):
        m = grids[i].m
        for w in m.events['warps']:
            here = (i, w['x'], w['y'])
            if w['to'] in index:
                dm = grids[index[w['to']]].m
                dw = dm.events['warps'][w['anchor']]
                links[here].append((index[w['to']], dw['x'], dw['y']))
            elif w['to'] in J.headers:
                # A gatehouse: its other warps leading back out onto one of the leg's maps.
                for gi, gw in enumerate(J.events(w['to'])['warps']):
                    if gi == w['anchor'] or gw['to'] not in index:
                        continue
                    ow = grids[index[gw['to']]].m.events['warps'][gw['anchor']]
                    to = (index[gw['to']], ow['x'], ow['y'])
                    if to != here:
                        links[here].append(to)
        for j, o in enumerate(grids):
            om = o.m
            if j == i or om.header['matrix'] != m.header['matrix']:
                continue
            # Tiles of map i on its edge, the next tile over in the matrix on map j.
            for y in range(m.h):
                for x in range(m.w):
                    if x not in (0, m.w - 1) and y not in (0, m.h - 1):
                        continue
                    for dx, dy in DIRS.values():
                        gx, gy = m.ox + x + dx, m.oy + y + dy
                        ox, oy = gx - om.ox, gy - om.oy
                        if not m.inside(x + dx, y + dy) and om.inside(ox, oy) and grids[i].walkable(x, y) and o.walkable(ox, oy):
                            links[(i, x, y)].append((j, ox, oy))
    return links


def edge_tile(g, d):
    """The tile a leg starts or ends at on a map edge: the middle of the longest run of walkable tiles along it that go on
    onto the map beside it there (its matrix's: a map's cells can hold tiles walkable in the data but out of reach)."""
    m = g.m
    cells = [(x, 0 if d == 'up' else m.h - 1) for x in range(m.w)] if d in ('up', 'down') else [(0 if d == 'left' else m.w - 1, y) for y in range(m.h)]
    dx, dy = DIRS[d]
    beside = [Grid(load(n), g.surf) for n, side in J.neighbours(m.name).items() if side == d]
    on = lambda c: not beside or any(o.walkable(m.ox + c[0] + dx - o.m.ox, m.oy + c[1] + dy - o.m.oy) for o in beside)
    runs, cur = [], []
    for c in cells:
        if g.walkable(*c) and on(c):
            cur.append(c)
        else:
            if cur:
                runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    if not runs:
        raise SystemExit(f'{m.name}: nothing walkable on its {d} edge')
    # The run on the map's biggest walkable area first (padding cells hold small walkable patches), then the longest.
    def area(c):
        seen, q = {c}, [c]
        while q:
            x, y = q.pop()
            for ex, ey in DIRS.values():
                n = (x + ex, y + ey)
                if n not in seen and g.walkable(*n):
                    seen.add(n)
                    q.append(n)
        return len(seen)
    best = max(runs, key=lambda r: (area(r[0]), len(r)))
    return best[len(best) // 2]


def spec_tile(names, grids, spec):
    """A leg's start or end: (map, 'edge', way), (map, 'warp', index or destination map), (map, 'tile', x, y)."""
    mi = names.index(spec[0])
    g = grids[mi]
    if spec[1] == 'edge':
        return (mi, *edge_tile(g, spec[2]))
    if spec[1] == 'warp':
        ws = g.m.events['warps']
        w = ws[spec[2]] if isinstance(spec[2], int) else next(w for w in ws if w['to'] == spec[2])
        return (mi, w['x'], w['y'])
    return (mi, spec[2], spec[3])


def sight_tiles(g, t):
    """The tiles a trainer sees: `sight` tiles straight ahead each way it looks, stopping at anything in the way; with no sight, the tile in front."""
    out = set()
    for d in (DIRS if t['turns'] else [t['face']]):
        dx, dy = DIRS[d]
        for i in range(1, max(1, t['sight']) + 1):
            x, y = t['x'] + dx * i, t['y'] + dy * i
            if not g.walkable(x, y):
                break
            out.add((x, y))
    if not out:
        out = {(t['x'] + dx, t['y'] + dy) for dx, dy in DIRS.values() if g.walkable(t['x'] + dx, t['y'] + dy)}
    return out


def plan_leg(leg, trainers_seen, report):
    """A leg's track (steps [map index, x, y, flags]) and its trainers (with their sight lines), as kanto_areas.py
    plans; sliding across ice, or walking it where the leg can't be planned with slides (reported)."""
    icy = [n for n in leg['maps'] if any(ICE in row for row in load(n).lo)]
    # Slid on every icy map, else walked on the fewest that make the leg plannable and meet the most trainers (one map, then two…).
    tries = [set()] + [set(c) for k in range(1, len(icy) + 1) for c in itertools.combinations(icy, k)]
    best = None
    for walked in tries:
        if best and len(walked) > len(best[0]):
            break
        attempt = []
        try:
            out = plan_leg_once(leg, set(trainers_seen), attempt, walked)
        except SystemExit:
            continue
        if not best or len(out[3]) > len(best[1][3]):
            best = (walked, out, attempt)
    if not best:
        raise SystemExit(f"{leg['maps']}: no plan, slid or walked")
    walked, out, attempt = best
    report.extend(attempt)
    for n in sorted(walked):
        report.append(f'{n}: ice walked, not slid (no plan slides on it)')
    for t in out[3]:
        trainers_seen.add((out[0][t['map']], t['key']))
    return out


def plan_leg_once(leg, trainers_seen, report, walked=()):
    names = leg['maps']
    grids = [Grid(load(n), leg.get('surf', False), leg.get('fixes', {}).get(n, ()), leg.get('floors', {}).get(n), leg.get('blocked', {}).get(n, ()), n not in walked) for n in names]
    links = build_links(names, grids, leg.get('links', ()))
    start = spec_tile(names, grids, leg['start'])
    end = spec_tile(names, grids, leg['end'])
    trainers = []
    for mi, n in enumerate(names):
        for t in grids[mi].m.events['trainers']:
            k = hm.trainer_key(t['trainer'])
            if leg.get('boss') and k != leg['boss']:
                continue
            if k.startswith(SKIP_TRAINER) or (n, k) in trainers_seen or k in leg.get('skip', ()):
                continue
            trainers.append({'key': k, 'map': mi, 'x': t['x'], 'y': t['y'], 'sprite': t['sprite'], 'face': t['face'], 'time': t.get('time'),
                             'sight': {(mi, x, y) for x, y in sight_tiles(grids[mi], t)}})
    if leg.get('path'):
        # The user's track (Goldenrod Gym's): walked as it is, each trainer met where it first comes into their sight,
        # its steps from `under` on under the bridges (flag 8).
        track = [((0, x, y), 8 if i >= leg['under'] else 0) for i, (x, y) in enumerate(leg['path'])]
        order = []
        for node, _ in track:
            order += [t for t in trainers if t not in order and node in t['sight']]
        if not order or order[-1]['key'] not in leg.get('last', ()):
            raise SystemExit(f"{names}: the track doesn't end at {leg.get('last')}")
        for t in [t for t in trainers if t not in order]:
            report.append(f"{names[t['map']]}: {t['key']} out of reach")
        return names, grids, track, order
    last = [t for t in trainers if t['key'] in leg.get('last', ())]
    pending = [t for t in trainers if t not in last]
    via = [mi for mi, n in enumerate(names) if n in leg.get('via', ())]
    track = [(start, 0)]
    here = start
    order = []
    visited = {start[0]}

    def walk(path):
        nonlocal here
        prev = here
        for node, flag in path:
            # A slide's tiles each a step (flag 4), its end too.
            for n in SLIDES.get((prev, node), []) if flag == 4 else []:
                track.append((n, 4))
                for t in list(pending):
                    if n in t['sight']:
                        pending.remove(t)
                        order.append(t)
            prev = node
            track.append((node, flag))
            visited.add(node[0])
            for t in list(pending):
                if node in t['sight']:
                    pending.remove(t)
                    order.append(t)
        if path:
            here = path[-1][0]

    while pending or any(v not in visited for v in via):
        targets = set().union(*(t['sight'] for t in pending)) if pending else set()
        for v in via:
            if v not in visited:
                targets |= {(v, x, y) for y in range(grids[v].m.h) for x in range(grids[v].m.w) if grids[v].walkable(x, y)}
        path = bfs(grids, links, here, targets)
        if path is None:
            for t in pending:
                report.append(f"{names[t['map']]}: {t['key']} out of reach")
            pending.clear()
            if any(v not in visited for v in via):
                raise SystemExit(f"{names}: can't reach {[names[v] for v in via if v not in visited]}")
            break
        walk(path)
    for t in last:
        path = bfs(grids, links, here, t['sight'])
        if path is None:
            raise SystemExit(f"{names}: can't reach {t['key']}")
        walk(path)
        order.append(t)
    if not leg.get('ends_at_last'):
        wild = lambda node: grids[node[0]].m.encounter(node[1], node[2]) != 0
        if not leg.get('no_wild') and not any(wild(n) for n, _ in track):
            tiles = {(mi, x, y) for mi, g in enumerate(grids) for y in range(g.m.h) for x in range(g.m.w) if g.walkable(x, y) and wild((mi, x, y))}
            while tiles:
                detour = bfs(grids, links, here, tiles)
                if detour is None:
                    break
                if bfs(grids, links, detour[-1][0], {end}) is not None:
                    walk(detour)
                    break
                tiles.discard(detour[-1][0])
        path = bfs(grids, links, here, {end})
        if path is None:
            raise SystemExit(f'{names}: no way from {here} to the end {end}')
        walk(path)
    for t in order:
        trainers_seen.add((names[t['map']], t['key']))
    return names, grids, track, order


# ---- The run's areas on Johto's main road, in the game's order (the user's: from New Bark Town; the list to be checked against the game's path) ----
def edge(m, d):
    return (m, 'edge', d)


def warp(m, w):
    return (m, 'warp', w)


def leg(maps, start, end, **kw):
    return {'maps': maps, 'start': start, 'end': end, **kw}


def route(area_id, name, legs, kind='route', **kw):
    return {'id': area_id, 'name': name, 'kind': kind, 'legs': legs, **kw}


def rects(rs):
    return {(x, y) for l, t, r, b in rs for y in range(t, b + 1) for x in range(l, r + 1)}


def gym_fixes(m):
    """The user's fixes to a gym in the card runs (tools/routes/hgss/johto_gyms.py's USER_ tables, in its cropped room's
    tiles, moved back onto the map's by the same crop): its links (Azalea's Spinarak carts, Blackthorn's warp panels) as
    fades, its floors (Ecruteak's walkways, Blackthorn's floors over the lava) and track (Goldenrod's line) as the only
    tiles walked, and its tiles not walkable. The leg's fixes, floors, blocked and links; a track (Goldenrod's: its
    walkways' bridges crossed over, then walked under) the leg's `path` itself, its steps under the bridges `under`, and
    the bridges (`bridges`, the map's overhead)."""
    city = next((c for c, g in jg.GYMS.items() if g[0] == m), None)
    if not city:
        return {}
    _, events_file, warp_to, _, _ = jg.GYMS[city]
    rows = load(m).rows
    rows, door, spots, stands, guide, _, _ = jg.place(city, rows, J._events[J.header(m)['events']], warp_to)
    x0, y0, _, _ = jg.crop_box(rows, door, [*spots, *stands] + ([guide] if guide else []))
    at = lambda t: (t[0] + x0, t[1] + y0)
    out = {}
    floors = rects(jg.USER_FLOORS.get(city, ()))
    if city in jg.USER_TRACKS:
        floors |= set(jg.track_tiles(jg.USER_TRACKS[city]))
    if floors:
        out['floors'] = {m: {at(t) for t in floors}}
    if city in jg.USER_BLOCKED:
        out['blocked'] = {m: {at(t) for t in rects(jg.USER_BLOCKED[city])}}
    if city in jg.USER_LINKS:
        out['links'] = [((m, *at(a)), (m, *at(b))) for a, b in jg.USER_LINKS[city]]
    if city in jg.USER_TRACKS:
        track = jg.USER_TRACKS[city]
        over = len(jg.track_tiles({**track, 'under': []}))
        out['path'] = [at(t) for t in jg.track_tiles(track)]
        out['under'] = over
        out['bridges'] = {m: [(l + x0, t + y0, r + x0, b + y0) for l, t, r, b in track['bridges']]}
    return out


def gym(area_id, name, town, m, leader, badge, maps=None, **kw):
    """A gym: in at its door (its lowest warp; the tile above it), to its leader, met last; `maps` its rooms when it
    has several; the user's fixes from the card runs' gym, on its leader's room (gym_fixes)."""
    door = max(load(m).events['warps'], key=lambda w: w['y'])
    kw = {**gym_fixes((maps or [m])[-1]), **kw}
    return {'id': area_id, 'name': name, 'kind': 'gym', 'town': town, 'badge': badge, 'leader': leader,
            'legs': [leg(maps or [m], (m, 'tile', door['x'], door['y'] - 1), None, last=(leader,), ends_at_last=True, **kw)]}


def league(area_id, name, m, boss, sprite=None, **kw):
    """A League room: in at its lowest warp, to its boss; the door the game shuts behind the player (the blocked tiles
    straight up from the entrance to the room) open."""
    e = load(m).events
    if sprite:
        # A boss whose battle a floor trigger starts (Lance: his own script is none): the person with that sprite is the room's battle.
        who = next(p for p in e['people'] if p['sprite'] == sprite)
        e['people'].remove(who)
        e['trainers'].append({'trainer': next(iter(J.battles(J.codes[m]).values())), 'x': who['x'], 'y': who['y'], 'face': who['face'], 'turns': False, 'sight': 0, 'sprite': sprite, 'talk': True})
    door = max(e['warps'], key=lambda w: w['y'])
    g = Grid(load(m), False)
    shut = []
    y = door['y'] - 1
    while y > 0 and g.walkable(door['x'], y):
        y -= 1
    while y > 0 and not g.walkable(door['x'], y):
        shut.append((door['x'], y))
        y -= 1
    return {'id': area_id, 'name': name, 'kind': 'league', 'leader': boss,
            'legs': [leg([m], (m, 'tile', door['x'], door['y'] - 1), None, last=(boss,), ends_at_last=True, boss=boss, fixes={m: shut}, **kw)]}


def town(area_id, name, m, gym=None, **kw):
    return {'id': area_id, 'name': name, 'kind': 'town', 'map': m, 'gym': gym, **kw}


AREAS = [
    # A run starts coming out of Professor Elm's lab, on its door (as Kanto's from Oak's), then west down Route 29.
    route('route-29', 'Route 29', [leg(['MAP_NEW_BARK', 'MAP_ROUTE_29'], warp('MAP_NEW_BARK', 'MAP_NEW_BARK_ELMS_LAB_1F'), edge('MAP_ROUTE_29', 'left'))]),
    town('cherrygrove-city', 'Cherrygrove City', 'MAP_CHERRYGROVE'),
    route('route-30', 'Routes 30 and 31', [leg(['MAP_ROUTE_30', 'MAP_ROUTE_31'], edge('MAP_ROUTE_30', 'down'), warp('MAP_ROUTE_31', 'MAP_ROUTE_31_VIOLET_GATEHOUSE'))]),
    town('violet-city', 'Violet City', 'MAP_VIOLET', 'violet-gym'),
    gym('violet-gym', 'Violet Gym', 'violet-city', 'MAP_VIOLET_GYM', 'leader-falkner', 'Zephyr'),
    route('route-32', 'Route 32', [leg(['MAP_VIOLET', 'MAP_ROUTE_32'], edge('MAP_VIOLET', 'down'), warp('MAP_ROUTE_32', 'MAP_UNION_CAVE_1F'))]),
    route('union-cave', 'Union Cave', [leg(['MAP_UNION_CAVE_1F'], warp('MAP_UNION_CAVE_1F', 'MAP_ROUTE_32'), warp('MAP_UNION_CAVE_1F', 'MAP_ROUTE_33'))], kind='dungeon'),
    route('route-33', 'Route 33', [leg(['MAP_ROUTE_33', 'MAP_AZALEA'], warp('MAP_ROUTE_33', 'MAP_UNION_CAVE_1F'), edge('MAP_AZALEA', 'right'))]),
    town('azalea-town', 'Azalea Town', 'MAP_AZALEA', 'azalea-gym'),
    gym('azalea-gym', 'Azalea Gym', 'azalea-town', 'MAP_AZALEA_GYM', 'leader-bugsy', 'Hive'),
    route('ilex-forest', 'Ilex Forest', [leg(['MAP_ILEX_FOREST', 'MAP_ROUTE_34'], warp('MAP_ILEX_FOREST', 'MAP_AZALEA_ILEX_FOREST_GATEHOUSE'), edge('MAP_ROUTE_34', 'up'))], kind='dungeon'),
    # Goldenrod's Department Store: its 2F (medicine, balls), 3F (X items) and 4F (vitamins), shown by the 2F's clerk; its 5F's TMs are the run's TM list's.
    town('goldenrod-city', 'Goldenrod City', 'MAP_GOLDENROD', 'goldenrod-gym', stores=['MAP_GOLDENROD_DEPARTMENT_STORE_2F', 'MAP_GOLDENROD_DEPARTMENT_STORE_3F', 'MAP_GOLDENROD_DEPARTMENT_STORE_4F']),
    gym('goldenrod-gym', 'Goldenrod Gym', 'goldenrod-city', 'MAP_GOLDENROD_GYM', 'leader-whitney', 'Plain'),
    route('route-35', 'Routes 35, 36 and 37', [leg(['MAP_ROUTE_35', 'MAP_NATIONAL_PARK', 'MAP_ROUTE_36', 'MAP_ROUTE_37'], warp('MAP_ROUTE_35', 'MAP_ROUTE_35_GOLDENROD_GATEHOUSE'), edge('MAP_ROUTE_37', 'up'), via=('MAP_NATIONAL_PARK',))]),
    town('ecruteak-city', 'Ecruteak City', 'MAP_ECRUTEAK', 'ecruteak-gym'),
    gym('ecruteak-gym', 'Ecruteak Gym', 'ecruteak-city', 'MAP_ECRUTEAK_GYM', 'leader-morty', 'Fog'),
    route('route-38', 'Routes 38 and 39', [leg(['MAP_ROUTE_38', 'MAP_ROUTE_39'], warp('MAP_ROUTE_38', 'MAP_ROUTE_38_ECRUTEAK_GATEHOUSE'), edge('MAP_ROUTE_39', 'down'))]),
    town('olivine-city', 'Olivine City', 'MAP_OLIVINE'),
    route('route-40', 'Routes 40 and 41', [leg(['MAP_OLIVINE', 'MAP_ROUTE_40', 'MAP_ROUTE_41'], edge('MAP_OLIVINE', 'left'), edge('MAP_ROUTE_41', 'left'), surf=True)]),
    town('cianwood-city', 'Cianwood City', 'MAP_CIANWOOD', 'cianwood-gym'),
    gym('cianwood-gym', 'Cianwood Gym', 'cianwood-city', 'MAP_CIANWOOD_GYM', 'leader-chuck', 'Storm'),
    route('route-41', 'Routes 41 and 40', [leg(['MAP_CIANWOOD', 'MAP_ROUTE_41', 'MAP_ROUTE_40'], edge('MAP_CIANWOOD', 'right'), edge('MAP_ROUTE_40', 'right'), surf=True)]),
    town('olivine-city-gym', 'Olivine City', 'MAP_OLIVINE', 'olivine-gym'),
    gym('olivine-gym', 'Olivine Gym', 'olivine-city-gym', 'MAP_OLIVINE_GYM', 'leader-jasmine', 'Mineral'),
    route('route-42', 'Route 42', [leg(['MAP_ROUTE_42'], warp('MAP_ROUTE_42', 'MAP_ROUTE_42_ECRUTEAK_GATEHOUSE'), edge('MAP_ROUTE_42', 'right'), surf=True)]),
    town('mahogany-town', 'Mahogany Town', 'MAP_MAHOGANY', 'mahogany-gym'),
    gym('mahogany-gym', 'Mahogany Gym', 'mahogany-town', 'MAP_MAHOGANY_GYM_ROOM_1', 'leader-pryce', 'Glacier', maps=['MAP_MAHOGANY_GYM_ROOM_1', 'MAP_MAHOGANY_GYM_ROOM_2', 'MAP_MAHOGANY_GYM_LEADER_ROOM']),
    route('route-44', 'Route 44', [leg(['MAP_MAHOGANY', 'MAP_ROUTE_44'], edge('MAP_MAHOGANY', 'right'), warp('MAP_ROUTE_44', 'MAP_ICE_PATH_1F'))]),
    route('ice-path', 'Ice Path', [leg(['MAP_ICE_PATH_1F', 'MAP_ICE_PATH_B1F', 'MAP_ICE_PATH_B2F', 'MAP_ICE_PATH_B3F'], warp('MAP_ICE_PATH_1F', 'MAP_ROUTE_44'), warp('MAP_ICE_PATH_1F', 'MAP_BLACKTHORN'))], kind='dungeon'),
    town('blackthorn-city', 'Blackthorn City', 'MAP_BLACKTHORN', 'blackthorn-gym'),
    gym('blackthorn-gym', 'Blackthorn Gym', 'blackthorn-city', 'MAP_BLACKTHORN_GYM', 'leader-clair', 'Rising'),
    route('route-27', 'Routes 27 and 26', [leg(['MAP_NEW_BARK', 'MAP_ROUTE_27', 'MAP_TOHJO_FALLS', 'MAP_ROUTE_26'], edge('MAP_NEW_BARK', 'right'), warp('MAP_ROUTE_26', 'MAP_ROUTE_22_POKEMON_LEAGUE_RECEPTION_GATE'), surf=True, via=('MAP_TOHJO_FALLS',))]),
    route('victory-road', 'Victory Road', [leg(['MAP_VICTORY_ROAD_1F', 'MAP_VICTORY_ROAD_2F', 'MAP_VICTORY_ROAD_3F'], warp('MAP_VICTORY_ROAD_1F', 'MAP_ROUTE_22_POKEMON_LEAGUE_RECEPTION_GATE'), warp('MAP_VICTORY_ROAD_3F', 'MAP_INDIGO_PLATEAU'))], kind='dungeon'),
    town('indigo-plateau', 'Indigo Plateau', 'MAP_INDIGO_PLATEAU', 'will'),
    league('will', "Will's room", 'MAP_POKEMON_LEAGUE_WILL_ROOM', 'elite-four-will'),
    league('koga', "Koga's room", 'MAP_POKEMON_LEAGUE_KOGA_ROOM', 'elite-four-koga'),
    league('bruno', "Bruno's room", 'MAP_POKEMON_LEAGUE_BRUNO_ROOM', 'elite-four-bruno'),
    league('karen', "Karen's room", 'MAP_POKEMON_LEAGUE_KAREN_ROOM', 'elite-four-karen'),
    league('lance', "Lance's room", 'MAP_POKEMON_LEAGUE_LANCE_ROOM', 'champion-lance', sprite='SPRITE_WATARU'),
]


# ---- What each step's tile says: its wild encounters and its battle terrain ----
def ts_keys(path, pattern):
    """The entries of a generated table (data/gen2/<path>), each key with its line."""
    return {m.group(1): m.group(2) for m in re.finditer(pattern, open(os.path.join(OUT_TS, path), encoding='utf8').read(), re.M)}


# The wild tables' kinds by map code (hgss_data.py's encounters.ts), the mart clerks' lists by mart map (marts.ts).
ENC_KINDS = {k: set(re.findall(r'\b(land|water|oldRod|goodRod|superRod|rockSmash): \{', v)) for k, v in ts_keys('encounters.ts', r"^  '(\w+)': (\{.*\}),$").items()}
MART_CLERKS = {k: re.findall(r"'([\w-]+)'", v) for k, v in ts_keys('marts.ts', r"^  '(\w+)': (\[.*\]),$").items()}
TRAINER_KEYS = set(ts_keys('trainers.ts', r"^  '([\w-]+)': (\{.*)$"))


def wild_letter(m, x, y):
    """A tile's wild encounters: 'l' land, 'w' water, '.' none (an encounter tile on a map with no such table: none, as the game has it)."""
    e = m.encounter(x, y)
    kinds = ENC_KINDS.get(m.header['encounters'] or '', set())
    return 'l' if e == 1 and 'land' in kinds else 'w' if e == 2 and 'water' in kinds else '.'


# The battle background's terrain (battle_setup.c's _020FC4C0: the League's rooms are "others", as building).
BG_TERRAIN = {'general': '.', 'ocean': 'w', 'city': 'b', 'forest': 'g', 'mountain': 'm', 'snow': 'n', 'building-1': 'b', 'building-2': 'b', 'building-3': 'b',
              'cave-1': 'c', 'cave-2': 'c', 'cave-3': 'c', 'will': 'b', 'koga': 'b', 'bruno': 'b', 'karen': 'b', 'lance': 'b'}
SAND, SNOW = 33, 168


def terrain(m, x, y):
    """A tile's battle terrain (battle_setup.c's FieldSystem_GetTerrainFromStandingTile): ice, tall grass, sand, snow, a
    cave's floor, surfable water, else the map's battle background's."""
    b = m.behavior(x, y)
    if b == ICE:
        return 'i'
    if b in GRASS:
        return 'g'
    if b == SAND:
        return 's'
    if b == SNOW:
        return 'n'
    if b in CAVE_FLOOR:
        return 'c'
    if BEHAVIOR_FLAGS.get(b, 0) & SURFABLE:
        return 'w'
    return BG_TERRAIN.get(m.header['battleBg'], '.')


# ---- Auto-grind (the user's): a loop near the exit of the area before a gym's town, as Kanto's ----
RINGS = [(3, 3), (4, 3), (3, 4), (2, 3), (3, 2), (2, 2)]


def ring(x, y, w, h):
    return [(x + i, y) for i in range(w)] + [(x + w - 1, y + j) for j in range(1, h)] + [(x + i, y + h - 1) for i in range(w - 2, -1, -1)] + [(x, y + j) for j in range(h - 2, 0, -1)]


def grind_loop(names, grids, track, links):
    """The loop a grind runs round (kanto_areas.py's): the ring of walkable tiles with wild encounters of one kind (and
    one battle terrain) fewest steps from the leg's last step, rounder rings winning a tie or a step or two, starting on
    its tile nearest the exit; None when the leg has no such ring."""
    def tile(n):
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
                    if not all(n in dist and (n[1], n[2]) not in g.warp_tiles and tile(n)[0] != '.' for n in nodes):
                        continue
                    if len({tile(n) for n in nodes}) != 1:
                        continue
                    near = min(range(len(nodes)), key=lambda i: dist[nodes[i]])
                    score = (dist[nodes[near]] + k, k)
                    if best is None or score < best[0]:
                        best = (score, nodes[near:] + nodes[:near])
    return best and [[n[0], n[1], n[2], 0, tile(n)] for n in best[1]]


def fishing_spot(g, steps):
    """The tile nearest a map's track steps ([(step, x, y)]) facing fishable water (surfable, not a waterfall or a
    whirlpool), walked to over land (surfing only where nothing on land faces any, and the area surfs: then a 1 after),
    the nearest first: (step, way, x, y), or None (kanto_areas.py's)."""
    fishable = lambda x, y: g.m.inside(x, y) and g.water(x, y) and g.m.behavior(x, y) not in (WATERFALL, WHIRLPOOL)
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


def sprite_name(sprite):
    """A person's overworld sprite by the game's SPRITE_ constant (SPRITE_GSBOY3: 'gsboy3'), cut for the HGSS look in step 5."""
    return sprite[len('SPRITE_'):].lower()


def map_key(const):
    """A map's key in maps.ts (MAP_ROUTE_29: 'Route29', MAP_NEW_BARK: 'NewBark'), as Kanto's map names."""
    return ''.join(w.capitalize() for w in const[len('MAP_'):].split('_'))


def mart_of(town, stores=None):
    """A town's Poké Mart (the store, the user's): the map behind one of its doors whose clerks sell (MART_CLERKS; the
    one selling by badges first), the player two tiles ahead of the clerk across the counter (the person whose script
    opens a mart: std_pokemart, the badges' list, else std_special_mart), facing them, and everyone there."""
    doors = stores or [w['to'] for w in load(town).events['warps'] if J.codes.get(w['to']) in MART_CLERKS]
    if not doors:
        raise SystemExit(f'{town}: no Poké Mart')
    name = stores[0] if stores else min(doors, key=lambda d: 'badges' not in MART_CLERKS[J.codes[d]])
    m = load(name)
    code = J.codes[name]
    labels = J.labels(code)
    opens = lambda p, std: any(std in l for l in labels.get(J.label_of(p['script']) or '', ()))
    clerk = next((p for p in m.events['people'] if opens(p, 'std_pokemart')), None) or next(p for p in m.events['people'] if opens(p, 'std_special_mart'))
    face = hm.FIXED_FACING.get(clerk['movement'], clerk['face'])
    dx, dy = DIRS[face]
    back = {'down': 'up', 'up': 'down', 'left': 'right', 'right': 'left'}[face]
    people = [{'sprite': sprite_name(p['sprite']), 'x': p['x'], 'y': p['y'], 'face': face if p is clerk else p['face']} for p in m.events['people'] if not p.get('story')]
    lists = [l for d in (stores or [name]) for l in MART_CLERKS[J.codes[d]]]
    return name, lists, {'map': map_key(name), 'x': clerk['x'] + 2 * dx, 'y': clerk['y'] + 2 * dy, 'face': back, 'people': people}


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


def main():
    report = []
    seen = set()
    out_areas = []
    used_maps = {}
    # Tiles walked only by the user's fixes (gym floors and links, the League's shut doors), by map, for collision.ts.
    fixed = {}
    # The last walked area's legs (where a gym's town grinds: its last leg with a loop, as Kanto's).
    last_legs = []
    for a in AREAS:
        if a['kind'] == 'town':
            m = load(a['map'])
            used_maps.setdefault(a['map'], m)
            # Where the player stands: before the Pokémon Center's door (the Indigo Plateau's is in the League's entrance).
            pc = next((w for w in m.events['warps'] if w['to'].endswith('_POKECENTER_1F')), None) or next(w for w in m.events['warps'] if w['to'] == 'MAP_POKEMON_LEAGUE_ENTRANCE')
            mart_map, marts, mart = mart_of(a['map'], a.get('stores'))
            used_maps.setdefault(mart_map, load(mart_map))
            out_areas.append({'id': a['id'], 'name': a['name'], 'kind': 'town', 'map': map_key(a['map']), 'stand': [pc['x'], pc['y'] + 1], 'marts': marts, 'gym': a['gym'], 'mart': mart})
            if a['gym'] and last_legs:
                for area_id, li, names, grids, track, links in reversed(last_legs):
                    loop = grind_loop(names, grids, track, links)
                    if loop:
                        out_areas[-1]['grind'] = {'area': area_id, 'leg': li, 'loop': loop}
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
                used_maps.setdefault(n, g.m)
                fixed.setdefault(n, set()).update((x, y) for x, y in g.fixes | (g.floors or set()) if g.m.inside(x, y) and g.m.char(x, y) != '.')

            def tile(node):
                mm = grids[node[0]].m
                return ('.' if lg.get('no_wild') else wild_letter(mm, node[1], node[2])) + terrain(mm, node[1], node[2])
            legs.append({'maps': [map_key(n) for n in names], 'track': [[n[0], n[1], n[2], f, tile(n)] for n, f in track]})
            last_legs.append((a['id'], len(legs) - 1, names, grids, track, build_links(names, grids, lg.get('links', ()))))
            # Where it fishes on each map with a rod's table, one a map (Kanto's rule).
            if not lg.get('no_wild'):
                for mi, n in enumerate(names):
                    if not ENC_KINDS.get(grids[mi].m.header['encounters'] or '', set()) & {'oldRod', 'goodRod', 'superRod'} or n in fishing_maps:
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
                trainers.append({'key': t['key'], 'leg': len(legs) - 1, 'map': t['map'], 'x': t['x'], 'y': t['y'], 'face': t['face'], 'sprite': sprite_name(t['sprite']),
                                 'sight': sorted([x, y] for _, x, y in t['sight']),
                                 # Shown only at night or only by day (hgss_maps' time_flags; the user's: only then).
                                 **({t['time']: True} if t.get('time') else {}),
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
        if '--print' in sys.argv:
            for lg in legs:
                for mi, key in enumerate(lg['maps']):
                    m = next(mm for mm in used_maps.values() if map_key(mm.name) == key)
                    steps = {(x, y) for tm, x, y, _, _ in lg['track'] if tm == mi}
                    print(' ', key)
                    for y in range(m.h):
                        row = ''.join('o' if (x, y) in steps else 'T' if any(t['x'] == x and t['y'] == y and t['map'] == mi for t in trainers) else m.char(x, y) for x in range(m.w))
                        if row.strip('#'):
                            print('   ', row)
    # Maps only shown (the starter's scene: Professor Elm's lab).
    for n in ('MAP_NEW_BARK_ELMS_LAB_1F',):
        used_maps.setdefault(n, load(n))
    out_maps = {}
    BRIDGES = {n: b for a in AREAS for lg in a.get('legs', []) for n, b in lg.get('bridges', {}).items()}
    for n, m in used_maps.items():
        h = m.header
        out_maps[map_key(n)] = {
            'name': map_key(n),
            # Drawn from the 3D map by tools/idle/hgss_render.py (step 4c).
            'image': '/idle/gen2/maps/' + n[len('MAP_'):].lower() + '.png',
            'width': m.w,
            'height': m.h,
            'encounters': h['encounters'] or '',
            'scene': h['battleBg'],
            'section': h['mapsec'],
            'music': h['dayMusic'],
            **({'nightMusic': h['nightMusic']} if h['nightMusic'] and h['nightMusic'] != h['dayMusic'] else {}),
            # What's drawn over the player under it (Goldenrod Gym's bridges), cut from the picture by hgss_render.py.
            **({'overhead': '/idle/gen2/maps/' + n[len('MAP_'):].lower() + '_overhead.png', 'bridges': [list(b) for b in BRIDGES[n]]} if n in BRIDGES else {}),
        }
    head = "// Generated by tools/idle/johto_areas.py from the pret/pokeheartgold decompilation. Don't edit by hand.\n"
    open(os.path.join(OUT_TS, 'maps.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "import type { IdleMap } from '../../areas.js';\n\n/** The HeartGold maps the Johto areas walk, by name (include/constants/maps.h's MAP_ constants, as Kanto's names). */\nexport const JOHTO_MAPS: Record<string, IdleMap> = {\n"
        + ''.join(f'  {k}: {js(v)},\n' for k, v in out_maps.items()) + '};\n')
    open(os.path.join(OUT_TS, 'areas.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "import type { IdleArea } from '../../areas.js';\n\n/** Johto's areas in the game's order, from New Bark Town to Lance, each with its legs' planned tracks ([map index in the leg, x, y, flags: 1 a fade, 2 a ledge jump, the tile: wild encounters and battle terrain]) and trainers. */\nexport const JOHTO_AREAS: IdleArea[] = [\n"
        + ''.join(f'  {js(a)},\n' for a in out_areas) + '];\n')
    # Each map's collision, for areas.test.ts's check that every step is walkable: its tiles (hgss_maps.tiles: '.'
    # walkable, '#' not, '~' water, a ledge's way), its warps, the people in the way and the tiles the user's fixes open.
    collision = {}
    for n, m in used_maps.items():
        e = m.events
        collision[map_key(n)] = {'rows': m.rows, 'warps': sorted([w['x'], w['y']] for w in e['warps']),
                                 'people': sorted([p['x'], p['y']] for p in e['people'] if not p.get('story')),
                                 'fixed': sorted([x, y] for x, y in fixed.get(n, ()))}
    open(os.path.join(OUT_TS, 'collision.ts'), 'w', encoding='utf8', newline='\n').write(
        head + "/** The collision of the HeartGold maps the Johto areas walk (maps.ts's), only for areas.test.ts: each map's tiles by row ('.' walkable, '#' not, '~' water, '<', '>', '^', 'v' a ledge), warps, the people in the way and the tiles walkable by the user's fixes. */\nexport const JOHTO_COLLISION: Record<string, { rows: string[]; warps: [number, number][]; people: [number, number][]; fixed: [number, number][] }> = {\n"
        + ''.join(f'  {k}: {js(v)},\n' for k, v in collision.items()) + '};\n')
    print(len(out_maps), 'maps,', len(out_areas), 'areas')
    for r in report:
        print('  !', r)


main()
