"""Makes every Sinnoh gym run's maps and writes packages/campaign/src/sinnoh-routes.ts, copying the images to
apps/web/public/routes/ (the maps agreed with the user, 2026-10-31):

- each map rendered by dp_map.py (one map, or several of one matrix joined: Route 212's north and south halves), its
  warps' tiles walkable where the player comes in or leaves by one;
- the player comes in at `entrance` (an edge: a tile in from it, in the largest walkable area; or a warp's tile) and
  leaves at `exit` (a warp's tile, or the walkable tile furthest towards an edge), and the map's spots are picked along
  the shortest walk between the two, evenly spaced, each nudged onto the most open tile near it;
- two doors of a map into the same building (Route 213's into Hotel Grand Lake's reception, north and south) are a
  `link`, walked through with a fade, as Route 2's gatehouse is;
- a map with much more than its walk (Eterna Forest, Route 212) is cropped to the tiles walked to from its entrance, with
  a margin.

Usage: python sinnoh_routes.py [--apicula <apicula.exe>] [--cache <dir>] [--work <dir>]
(--work: where the renders go; each map also gets a <name>-preview.png there with its entrance, spots and exit marked.)"""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
from collections import deque
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw
import dp_data as dd

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'routes')
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'sinnoh-routes.ts')
TILE = 16

# Each map, in run order: its maps, the run it's for, how many spots, where the player comes in and leaves ('left',
# 'right', 'top' or 'bottom': an edge; ('warp', MAP_…): the warp to that map; ('tile', x, y): that tile), the way its
# encounters go, its constant,
# name and what it is.
MAPS = {
    'route203': (['MAP_ROUTE_203'], 8, 'left', ('warp', 'MAP_OREBURGH_GATE_1F'), 'right', 'ROUTE_203', 'Route 203',
                 'Jubilife City (west) to Oreburgh Gate (east), for the Oreburgh City run, then Oreburgh Gate'),
    'oreburgh_gate': (['MAP_OREBURGH_GATE_1F'], 2, ('warp', 'MAP_ROUTE_203'), ('warp', 'MAP_OREBURGH'), 'right', 'OREBURGH_GATE', 'Oreburgh Gate',
                      "Oreburgh Gate's ground floor, from Route 203 (west) to Oreburgh City (east), after Route 203"),
    'eterna_forest': (['MAP_ETERNA_FOREST_INTERIOR'], 8, ('warp', 'MAP_ROUTE_205_SOUTH'), ('warp', 'MAP_ROUTE_205_NORTH'), 'up', 'ETERNA_FOREST', 'Eterna Forest',
                      "from Route 205's south half (south) to its north half (east), for the Eterna City run, then Route 205"),
    'route205n': (['MAP_ROUTE_205_NORTH'], 2, ('warp', 'MAP_ETERNA_FOREST_INTERIOR'), 'top', 'up', 'ROUTE_205', 'Route 205',
                  "Route 205's upper part (agreed with the user), from Eterna Forest (west) up to Eterna City (north), after Eterna Forest"),
    'route215': (['MAP_ROUTE_215'], 10, 'left', ('warp', 'MAP_VEILSTONE_ROUTE_215_GATEHOUSE'), 'right', 'ROUTE_215', 'Route 215',
                 "Route 210 (west) to Veilstone City's gatehouse (east), for the Veilstone City run"),
    # Rendered with Route 213 below it (BOX), or its last rows, drawn tilted, are left black (the user's, 2026-11-02).
    'valor_lakefront': (['MAP_VALOR_LAKEFRONT', 'MAP_ROUTE_213'], 4, 'top', 'bottom', 'down', 'VALOR_LAKEFRONT', 'Valor Lakefront',
                        'from Route 214 (north) down to Route 213 (south), for the Pastoria City run, then Route 213'),
    # In below Valor Lakefront's exit (its columns are Route 213's 32 on).
    'route213': (['MAP_ROUTE_213'], 6, ('tile', 66, 0), ('warp', 'MAP_ROUTE_213_PASTORIA_GATEHOUSE'), 'left', 'ROUTE_213', 'Route 213',
                 "from Valor Lakefront (north) along the beach to Pastoria City's gatehouse (west), after Valor Lakefront"),
    'route212': (['MAP_ROUTE_212_NORTH', 'MAP_ROUTE_212_SOUTH'], 10, 'right', ('warp', 'MAP_HEARTHOME_ROUTE_212_GATEHOUSE'), 'up', 'ROUTE_212', 'Route 212',
                 "all of it (agreed with the user), its south half from Pastoria City (east) west through the marsh, then its north half up to Hearthome City's gatehouse (north), for the Hearthome City run"),
    'iron_island_b1f': (['MAP_IRON_ISLAND_B1F_ROOM_2'], 3, ('warp', 'MAP_IRON_ISLAND_1F'), ('warp', 'MAP_IRON_ISLAND_B2F_ROOM_2'), 'down', 'IRON_ISLAND_B1F', 'Iron Island B1F',
                        'from the stairs down from 1F to the stairs down to B2F, for the Canalave City run (its three floors, agreed with the user), then B2F'),
    'iron_island_b2f': (['MAP_IRON_ISLAND_B2F_ROOM_2'], 4, ('warp', 'MAP_IRON_ISLAND_B1F_ROOM_2'), ('warp', 'MAP_IRON_ISLAND_B3F'), 'down', 'IRON_ISLAND_B2F', 'Iron Island B2F',
                        'from the stairs down from B1F to the stairs down to B3F, after B1F, then B3F'),
    'iron_island_b3f': (['MAP_IRON_ISLAND_B3F'], 3, ('warp', 'MAP_IRON_ISLAND_B2F_ROOM_2'), ('warp', 'MAP_IRON_ISLAND_EXTERIOR'), 'left', 'IRON_ISLAND_B3F', 'Iron Island B3F',
                        "from the stairs down from B2F to the way out, after B2F"),
    'route217': (['MAP_ROUTE_217'], 6, 'bottom', 'top', 'up', 'ROUTE_217', 'Route 217',
                 'from Route 216 (south) up through the snow to Acuity Lakefront (north), for the Snowpoint City run, then Acuity Lakefront'),
    'acuity_lakefront': (['MAP_ACUITY_LAKEFRONT'], 4, 'bottom', 'right', 'right', 'ACUITY_LAKEFRONT', 'Acuity Lakefront',
                         'from Route 217 (south) to Snowpoint City (east), after Route 217'),
    # Hotel Grand Lake has no map of its own: its grounds are Valor Lakefront's south and Route 213's north, cut out of the
    # two joined (BOX; the user's screenshot's bounds, east to Route 222). In at the reception's north door.
    'hotel_grand_lake': (['MAP_VALOR_LAKEFRONT', 'MAP_ROUTE_213'], 3, ('tile', 66, 76), 'right', 'right', 'HOTEL_GRAND_LAKE', 'Hotel Grand Lake',
                         "its grounds (Valor Lakefront's south and Route 213's north, agreed with the user), from the reception up past the cottages and the Seven Stars Restaurant and east to Route 222, for the Sunyshore City run, then Route 222"),
    'route222': (['MAP_ROUTE_222'], 7, 'left', ('warp', 'MAP_ROUTE_222_SUNYSHORE_GATEOUSE'), 'right', 'ROUTE_222', 'Route 222',
                 "from Valor Lakefront (west) along the beach to Sunyshore City's gatehouse (east), for the Sunyshore City run"),
}
# Maps cropped to the tiles walked to from their entrance (most of their render is trees or nothing).
CROP = {'eterna_forest', 'route212'}
# Maps cut out of a bigger render: only this box's tiles (left, top, right, bottom), and the image cropped to it.
BOX = {'hotel_grand_lake': (43, 41, 95, 81), 'valor_lakefront': (32, 0, 95, 63)}
# How far past the walked tiles a crop goes: above (drawn tilted), and the other sides.
MARGIN = {'top': 4, 'side': 2, 'bottom': 2}
# The maps' fixes from the user, in the map's own tiles (after any crop), made once its spots are picked: spots moved (by
# spot number on the map, from 1), the entrance and exit (made walkable), tiles moved (left, top, right, bottom, rows
# down: negative is up; the tiles they leave walkable), and higher ground (columns left to right, and how many rows higher
# it's drawn than the map data has it: its walkable tiles and grass moved up that many, down when it's negative, the user's). Route 203 (the user's,
# 2026-10-31): in at its west edge (0,23), out at Oreburgh Gate's cave mouth (55,11); its middle part (23-34) is drawn a
# row higher and its eastern part (37-54) two, as its trees, ledge and grass show. Oreburgh Gate: in and out at its cave
# mouths (3,22 and 28,22).
USER_SPOTS = {'route203': {1: (6, 13), 2: (19, 13), 3: (15, 21), 4: (25, 15), 5: (34, 20), 6: (51, 19), 7: (39, 13), 8: (48, 9)},
              'oreburgh_gate': {1: (14, 24), 2: (23, 22)},
              # Eterna Forest's 7th on the way to its exit and 8th by the cottage (the user's, 2026-11-01: Route 205's first
              # two moved there), the others kept.
              'eterna_forest': {1: (25, 69), 2: (37, 54), 3: (41, 70), 4: (62, 68), 5: (72, 55), 6: (64, 41), 7: (53, 32), 8: (63, 16)},
              'route205n': {1: (7, 19), 2: (26, 22)},
              'route215': {1: (10, 22), 2: (11, 14), 3: (37, 21), 4: (33, 10), 5: (48, 13), 6: (56, 7), 7: (65, 9), 8: (81, 6), 9: (68, 18), 10: (84, 22)},
              # Valor Lakefront's 3rd and 4th (the user's, 2026-11-02), the others kept.
              'valor_lakefront': {1: (50, 12), 2: (50, 29), 3: (49, 44), 4: (34, 54)},
              'route213': {1: (72, 27), 2: (63, 30), 3: (26, 40), 4: (27, 28), 5: (32, 14), 6: (14, 18)}}
USER_ENTRANCE = {'route203': (0, 23), 'oreburgh_gate': (3, 22), 'eterna_forest': (16, 81), 'route205n': (2, 12), 'route215': (0, 22)}
USER_EXIT = {'route203': (55, 11), 'oreburgh_gate': (28, 22), 'eterna_forest': (75, 31), 'route205n': (31, 21), 'route215': (95, 23), 'valor_lakefront': (34, 63)}
USER_MOVES = {}
# Links in place of the map's own (its two doors into one building): Route 213's reception, walked into at its north door
# and out at its south one (the user's, 2026-11-02; 66,17 below it walkable, his way out).
USER_LINKS = {'route213': [((66, 12), (66, 16))]}
# Tiles of the picture drawn over the player (copied into the route's overhead): Route 213's reception's north door, so
# he walks into the building (the user's).
USER_OVERHEAD = {'route213': [(66, 12)]}
# Tiles made walkable or unwalkable (after USER_RAISED). Eterna Forest (the user's, 2026-11-01): out at 75,31, so 74,31
# walkable and 74,30 not; 32-35,56 walkable; 44-47,70, 48-49,72, 40-43,54, 15-27,58 unwalkable, and its cliffs' feet:
# 60-61 and 68-69,54, 62-67,56, 66-73,40, 74-75,42, 48-71,52 and 66-73,28. Route 205: 3,12 walkable, the way from its
# door (2,12, the user's) through the trees. Valor Lakefront (the user's, 2026-11-02): the hotel's terrace, 37-48,49-50,
# its edge, 40-52,51, and the ground below it to its west, 31-39,51-54, walkable (drawn higher than its map data has them); 40,52-55, the
# terrace's cliff, not, nor 49-50,47-48, 39-45,47, 37,54-57, 26-32,61, 36-43,61-62 and 32-36,49-50.
USER_WALKABLE = {'eterna_forest': [(74, 31)] + [(x, 56) for x in range(32, 36)], 'route205n': [(3, 12)],
                 'valor_lakefront': [(x, y) for x in range(37, 49) for y in (49, 50)] + [(x, y) for x in range(31, 40) for y in range(51, 55)]
                                    + [(x, 51) for x in range(40, 53)],
                 'route213': [(66, 17)]}
# Route 215: 35-36,7 and 13-14,11 (the user's), and 24-27,7, the top bridge's west platform's wall. Valor Lakefront: above.
USER_BLOCKED = {'route215': [(35, 7), (36, 7), (13, 11), (14, 11), (24, 7), (25, 7), (26, 7), (27, 7)],
                'valor_lakefront': [(40, y) for y in range(52, 56)] + [(x, y) for x in (49, 50) for y in (47, 48)] + [(x, 47) for x in range(39, 46)]
                                   + [(37, y) for y in range(54, 58)] + [(x, 61) for x in range(26, 33)] + [(x, y) for x in range(36, 44) for y in (61, 62)]
                                   + [(x, y) for x in range(32, 37) for y in (49, 50)],
                'eterna_forest': [(74, 30)] + [(x, 70) for x in range(44, 48)] + [(48, 72), (49, 72)] + [(x, 54) for x in range(40, 44)]
                                  + [(60, 54), (61, 54), (68, 54), (69, 54)] + [(x, 56) for x in range(62, 68)]
                                  + [(x, 40) for x in range(66, 74)] + [(74, 42), (75, 42)] + [(x, 58) for x in range(15, 28)]
                                  + [(x, 52) for x in range(48, 72)] + [(x, 28) for x in range(66, 74)]}
# Eterna Forest is drawn a row lower than its map data has it, all of it (its trees, fences and grass: the user's): -1.
USER_RAISED = {'route203': [(23, 34, 1), (37, 54, 2)], 'eterna_forest': [(0, 77, -1)]}
# Spots whose figures stand beside the player along the map's flow, not across it (the Route's `spotFlows`, by spot number
# from 1): Route 203 flows right, so its encounters 1, 2, 4 and 8 have theirs left and right (the user's), the third above.
# Route 205's encounters (9 and 10) have their figures above and below the player, the third to his right (the user's).
# Route 215's 2, 4 and 8 have theirs left and right (the user's).
USER_SPOT_FLOWS = {'route203': {1: 'up', 2: 'up', 4: 'up', 8: 'up'}, 'route205n': {1: 'right', 2: 'right'}, 'route215': {2: 'up', 4: 'up', 8: 'up'}, 'route213': {3: 'up', 4: 'up', 6: 'up'}}
# Treetops drawn over the player (the user's: the 2 tiles above a tree's unwalkable tiles): in each walkable tile within 2
# above an unwalkable one, the pixels of what stands more than TREETOP_HIGH model units (a tile is 16) above the ground
# round it (from dp_map.py's heights: the highest median height of the walkable tiles near it, not themselves under
# treetops, that's no higher than the tile's own lower pixels, so at a cliff or stairs it's its own level's) are copied
# into the route's overhead image (<name>_overhead.png). Tiles never treetops: stairs up a cliff, whose own steps stand
# above the ground below (Route 203's between its parts, 22,20-23 and 35-36,9-10 and 20-23).
USER_TREETOPS = {'route203', 'eterna_forest', 'route205n', 'route215', 'valor_lakefront', 'route213'}
# How many tiles above a tree's unwalkable ones its treetop reaches, where it isn't 2: Route 215's trees stand taller over
# theirs (the user's: those standing in front of them weren't masked).
USER_TREETOP_ROWS = {'route215': 3}
# Maps whose treetops are only their green pixels: Route 215's raised platforms, stairs and cliff edges stand as high, as
# do Valor Lakefront's and Route 213's roofs, fences and rocks.
USER_TREETOP_GREEN = {'route215', 'valor_lakefront', 'route213'}
USER_NOT_TREETOPS = {'route203': [(22, y) for y in range(20, 24)] + [(x, y) for x in (35, 36) for y in (9, 10, 20, 21, 22, 23)]}
TREETOP_HIGH = 8
# Fewer pixels than this standing high in a tile aren't a treetop: grass blades and flowers (Eterna Forest's).
TREETOP_MIN = 24
# Nor is a piece of them no wider than this: a stem's tip standing up beside a tree (Eterna Gym's).
TREETOP_THIN = 4
# How far a bridge's edges and rails overhang the tiles beside it, in pixels.
BRIDGE_EDGE = 3
# The most tiles a rock standing alone takes (USER_ROCKS): more is a cliff or an outcrop.
ROCK_TILES = 6
# Maps whose tall rocks are drawn over the player though their treetops are only green (USER_TREETOP_GREEN): Route 213's
# beach rocks (the user's, 2026-11-02).
USER_ROCKS = {'route213'}
# Cave mouths the player goes in and out by, drawn over him (the user's): only their rock in front of him, not the whole
# tile (the user's): of the mouth's tile and those round it, the rock (higher than the ground he walks in from) beyond the
# hollow (sunk below it), across it from him, or below it.
USER_CAVE_MOUTHS = {'route203': [(55, 11)], 'oreburgh_gate': [(3, 22), (28, 22)]}
# Bridges (the Route's `bridges`: the deck's columns `x` and rows `y`, the way it `runs`, 'y' up and down or 'x' across, and
# the rows (or columns) walked `under` it, if any): the walk gets onto the deck only at its ends and never off its sides,
# and crosses under it only from side to side (the user's), and what stands above the ground beside it, by height, over
# the way under it (and the row above, the deck over his head), is the route's `bridgeOverhead` (<name>_bridges.png),
# drawn over the player only while he's under it. Route 215's three (2026-11-01): 15-17 from its upper platform to its
# lower one (rows 13-18), the way from the west up onto the route, and 37-39 from the top bridge down to the cliff (rows
# 7-20), both over rows 14-17; and the top bridge across, 26-36 on rows 5-6, over the ground at 28-34 (the way from the
# north to encounter 4's ground, east of the ledge on 31,14-17).
USER_BRIDGES = {'route215': [{'x': (15, 17), 'y': (13, 18), 'under': (14, 17)}, {'x': (37, 39), 'y': (7, 20), 'under': (14, 17)},
                             {'x': (26, 36), 'y': (5, 6), 'runs': 'x', 'under': (28, 34)}]}
STEP = {'left': (-1, 0), 'right': (1, 0), 'up': (0, -1), 'down': (0, 1)}
HEAD = """// The Sinnoh gym runs' maps, from Diamond and Pearl (the pret/pokediamond decompilation; tools/routes/dp/): its maps are
// 3D, so dp_map.py converts each one's terrain chunks and buildings with apicula and draws them looking down, slightly
// tilted, as the Johto maps are (16 px to a tile), with which tiles can be walked on from the map data (ledges not; people
// and item balls aren't in it). Every map uses Diamond and Pearl's overworld sprites (`sprites: 'dp'`, 32x32). The maps
// are the user's (2026-10-31); each run's maps are walked one after another, fading from one's exit to the next's entrance.
// Written by tools/routes/dp/sinnoh_routes.py.
import type { Route } from './routes.js';
"""


def moves(rows, x, y, links=()):
    for dx, dy in STEP.values():
        n = (x + dx, y + dy)
        if 0 <= n[1] < len(rows) and 0 <= n[0] < len(rows[0]) and rows[n[1]][n[0]] == '.':
            yield n
    yield from [b for a, b in links if a == (x, y)] + [a for a, b in links if b == (x, y)]


def bfs(rows, start, links=()):
    prev = {start: None}; q = deque([start])
    while q:
        t = q.popleft()
        for n in moves(rows, *t, links):
            if n not in prev:
                prev[n] = t; q.append(n)
    return prev


def largest_area(rows):
    h, w = len(rows), len(rows[0])
    seen, best = set(), set()
    for y0 in range(h):
        for x0 in range(w):
            if rows[y0][x0] != '.' or (x0, y0) in seen:
                continue
            comp = set(bfs(rows, (x0, y0)))
            seen |= comp
            if len(comp) > len(best):
                best = comp
    return best


def edge_tile(rows, area, edge, inward=True):
    """The tile of `area` nearest `edge` (the most central of those), a tile in from the map's very edge (`inward`)."""
    h, w = len(rows), len(rows[0])
    toward = {'bottom': lambda t: t[1], 'top': lambda t: -t[1], 'left': lambda t: -t[0], 'right': lambda t: t[0]}[edge]
    far = max(toward(t) for t in area)
    x, y = min((t for t in area if toward(t) == far), key=lambda t: abs(t[0] - w / 2) + abs(t[1] - h / 2))
    if inward and (y in (0, h - 1) or x in (0, w - 1)):
        dx, dy = (0, -1) if y == h - 1 else (0, 1) if y == 0 else (-1, 0) if x == w - 1 else (1, 0)
        if rows[y + dy][x + dx] == '.':
            x, y = x + dx, y + dy
    return x, y


def thin(mask):
    """The pixels of `mask`'s pieces (8-connected) no more than TREETOP_THIN wide: grass blades' and stems' tips, not trees."""
    out, seen = np.zeros_like(mask), np.zeros_like(mask)
    h, w = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        piece, todo = [], [(y0, x0)]
        seen[y0, x0] = True
        while todo:
            y, x = todo.pop()
            piece.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        todo.append((ny, nx))
        xs = [x for _, x in piece]
        if max(xs) - min(xs) + 1 <= TREETOP_THIN:
            for y, x in piece:
                out[y, x] = True
    return out


def overhead(img, rows, heights, treetops, never=(), mouths=(), bridges=(), green=False, rocks=False):
    """The map's overhead image (see-through but for what's drawn over the player), or None, from `heights` (each pixel's
    model height): the treetops in the `treetops` tiles above its trees (USER_TREETOPS, USER_TREETOP_ROWS; 0: none; only their green pixels if `green`, USER_TREETOP_GREEN, but by
    `rocks`, USER_ROCKS, a tall rock's whatever their colour: one standing alone, ROCK_TILES tiles or fewer) but on the `never` tiles, and the rock in
    front of its cave `mouths` (USER_CAVE_MOUTHS), and the decks of the `bridges` over the walk (USER_BRIDGES)."""
    img = img.convert('RGBA')
    h, w = len(rows), len(rows[0])
    src, dst = np.asarray(img), np.zeros((img.height, img.width, 4), np.uint8)
    tile = lambda x, y: heights[y * TILE:(y + 1) * TILE, x * TILE:(x + 1) * TILE]
    top = np.zeros((img.height, img.width), bool)
    if treetops:
        tops = {(x, y - k) for y in range(1, h) for x in range(w) for k in range(1, treetops + 1) if y - k >= 0 and rows[y - k][x] == '.' and rows[y][x] == '#'}
        # And beside a tree, left or right: its canopy's edge over the side of whoever walks past (the user's).
        sides = {(x + d, y) for y in range(h) for x in range(w) for d in (-1, 1) if 0 <= x + d < w and rows[y][x] == '#' and rows[y][x + d] == '.'}
        rocky = set()
        if rocks:
            seen = set()
            for y in range(h):
                for x in range(w):
                    if rows[y][x] != '#' or (x, y) in seen:
                        continue
                    part, todo = [], [(x, y)]
                    seen.add((x, y))
                    while todo and len(part) <= ROCK_TILES:
                        t = todo.pop(); part.append(t)
                        for n in ((t[0] + 1, t[1]), (t[0] - 1, t[1]), (t[0], t[1] + 1), (t[0], t[1] - 1)):
                            if 0 <= n[0] < w and 0 <= n[1] < h and rows[n[1]][n[0]] == '#' and n not in seen:
                                seen.add(n); todo.append(n)
                    if len(part) <= ROCK_TILES and not todo:
                        rocky |= {(rx + dx, ry + dy) for rx, ry in part for dx, dy in [(0, -k) for k in range(1, treetops + 1)] + [(-1, 0), (1, 0)]}
        for x, y in (tops | sides) - set(never):
            near = [np.nanmedian(tile(xx, yy)) for yy in range(max(0, y - 3), y + 1) for xx in range(max(0, x - 3), min(w, x + 4))
                    if rows[yy][xx] == '.' and (xx, yy) not in tops and not np.isnan(tile(xx, yy)).all()]
            if not near:
                continue
            # The ground at its own level: the highest of the ground near it no higher than its own lower pixels.
            own = np.nanpercentile(tile(x, y), 25)
            ground = max((g for g in near if g <= own + 2), default=min(near))
            high = tile(x, y) > ground + TREETOP_HIGH
            if green and (x, y) not in rocky:
                r, g, b = (src[y * TILE:(y + 1) * TILE, x * TILE:(x + 1) * TILE, c].astype(int) for c in range(3))
                high &= (g >= np.maximum(r, b) + 16) & (b < 100)  # the leaves: not the stairs' rails nor the platforms' grass
            if high.sum() < TREETOP_MIN:
                continue
            top[y * TILE:(y + 1) * TILE, x * TILE:(x + 1) * TILE] |= high
        top &= ~thin(top)
        dst[top] = src[top]
    for mx, my in mouths:
        # The ground he walks in from (the walkable tile beside the mouth), the hollow sunk below it and the rock above it,
        # in the mouth's tiles and those round it.
        side = next(d for d in (-1, 1) if rows[my][mx + d] == '.' and (mx + d, my) not in mouths)
        ground = np.nanmedian(tile(mx + side, my))
        x0, y0 = (mx - 1) * TILE, (my - 1) * TILE
        area = heights[y0:y0 + 3 * TILE, x0:x0 + 3 * TILE]
        hollow, rock = area < ground - 0.5, area > ground + 0.5
        # Rock beyond the hollow, across it from where he comes in (its side wall and roof), or below it (its outer wall).
        cum = lambda a, axis: np.maximum.accumulate(a, axis=axis)
        beyond = cum(hollow, 1) if side < 0 else cum(hollow[:, ::-1], 1)[:, ::-1]
        front = rock & (beyond | cum(hollow, 0))
        dst[y0:y0 + 3 * TILE, x0:x0 + 3 * TILE][front] = src[y0:y0 + 3 * TILE, x0:x0 + 3 * TILE][front]
    for br in bridges:
        if 'under' not in br:
            continue
        # The way under it, and the row above it (the deck over his head).
        (l, r), (t, b) = (br['under'], (br['y'][0] - 1, br['y'][1])) if br.get('runs') == 'x' else (br['x'], (br['under'][0] - 1, br['under'][1]))
        # The ground: the way beside the bridge, either side of it where it's walked under.
        beside = [(x, y) for y in (t - 1, b + 1) for x in range(l, r + 1)] if br.get('runs') == 'x' else [(x, y) for y in range(t, b + 1) for x in (l - 1, r + 1)]
        ground = np.nanmedian([np.nanmedian(tile(x, y)) for x, y in beside if rows[y][x] == '.'])
        # And its edges and rails standing over the ground in the tiles either side of the way under it (the user's: 14,14-17
        # by Route 215's), the BRIDGE_EDGE pixels nearest it, but no leaves there.
        y0, y1, x0, x1 = t * TILE, (b + 1) * TILE, l * TILE, (r + 1) * TILE
        if br.get('runs') == 'x':
            y1 += BRIDGE_EDGE
        else:
            x0, x1 = x0 - BRIDGE_EDGE, x1 + BRIDGE_EDGE
        red, green, blue = (src[y0:y1, x0:x1, c].astype(int) for c in range(3))
        deck = (heights[y0:y1, x0:x1] > ground + TREETOP_HIGH) & ~((green >= np.maximum(red, blue) + 16) & (blue < 100))
        deck &= ~thin(deck)
        dst[y0:y1, x0:x1][deck] = src[y0:y1, x0:x1][deck]
    out = Image.fromarray(dst)
    return out if out.getbbox() else None


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    work = opt('--work', None) or tempfile.mkdtemp(prefix='sinnoh_routes_')
    os.makedirs(work, exist_ok=True)
    headers = dd.map_headers(cache)
    out = []
    for name, (consts, count, entrance, exit_, flow, const, title, what) in MAPS.items():
        prefix = os.path.join(work, name)
        if not os.path.exists(prefix + '.json'):
            subprocess.run([sys.executable, os.path.join(HERE, 'dp_map.py'), prefix, ','.join(consts), '--apicula', apicula, '--cache', cache], check=True)
        j = json.load(open(prefix + '.json'))
        rows = [list(r) for r in j['rows']]
        # The maps' warps, in this render's tiles (an overworld map's are the whole matrix's: less its first cell's).
        ox, oz = (j['origin'][0] * 32, j['origin'][1] * 32) if headers[consts[0]]['matrix'] == 0 else (0, 0)
        warps = [(w['x'] - ox, w['z'] - oz, w['header']) for c in consts for w in dd.events(cache, headers[c]['events'])['warps']]

        def warp_tile(to):
            x, y, _ = next(w for w in warps if w[2] == headers[to]['id'])
            rows[y][x] = '.'
            return x, y
        place = lambda spec: (spec[1], spec[2]) if spec[0] == 'tile' else warp_tile(spec[1])
        ent = place(entrance) if isinstance(entrance, tuple) else None
        end = place(exit_) if isinstance(exit_, tuple) else None
        # Two doors into one building, not side by side: walked through, a link.
        links = [((a[0], a[1]), (b[0], b[1])) for i, a in enumerate(warps) for b in warps[i + 1:] if a[2] == b[2] and abs(a[0] - b[0]) + abs(a[1] - b[1]) > 1]
        for (ax, ay), (bx, by) in links:
            rows[ay][ax] = rows[by][bx] = '.'
        box = BOX.get(name)
        if box:
            inside = lambda t: box[0] <= t[0] <= box[2] and box[1] <= t[1] <= box[3]
            rows = [[c if inside((x, y)) else '#' for x, c in enumerate(r)] for y, r in enumerate(rows)]
            links = [(a, b) for a, b in links if inside(a) and inside(b)]
        rows = [''.join(r) for r in rows]
        area = largest_area(rows)
        ent = ent or edge_tile(rows, area, entrance)
        prev = bfs(rows, ent, links)
        # Only the links walked to.
        links = [(a, b) for a, b in links if a in prev and b in prev]
        end = end or edge_tile(rows, [t for t in prev], exit_, inward=False)
        assert end in prev, (name, 'no walk from the entrance to the exit', ent, end)
        walk = [end]
        while prev[walk[-1]] is not None:
            walk.append(prev[walk[-1]])
        walk = walk[::-1]
        h, w = len(rows), len(rows[0])

        def openness(t):
            return sum(rows[y][x] == '.' for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w)
        spots = []
        for i in range(count):
            t = walk[round((i + 1) * (len(walk) - 1) / (count + 1))]
            near = [(x, y) for y in range(t[1] - 2, t[1] + 3) for x in range(t[0] - 2, t[0] + 3) if 0 <= y < h and 0 <= x < w and rows[y][x] == '.' and (x, y) in prev and (x, y) not in spots and (x, y) not in (ent, end)]
            spots.append(max(near, key=lambda n: openness(n) * 2 - abs(n[0] - t[0]) - abs(n[1] - t[1])))
        img = Image.open(prefix + '.png')
        heights = np.load(prefix + '_height.npy') if name in USER_TREETOPS or name in USER_CAVE_MOUTHS or name in USER_BRIDGES else None
        grass = j['grass']
        if name in CROP or box:
            tiles = list(prev)
            x0 = max(0, min(t[0] for t in tiles) - MARGIN['side']); x1 = min(w - 1, max(t[0] for t in tiles) + MARGIN['side'])
            y0 = max(0, min(t[1] for t in tiles) - MARGIN['top']); y1 = min(h - 1, max(t[1] for t in tiles) + MARGIN['bottom'])
            if box:
                x0, y0, x1, y1 = box
            rows, grass = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]], [r[x0:x1 + 1] for r in grass[y0:y1 + 1]]
            shift = lambda t: (t[0] - x0, t[1] - y0)
            ent, end, spots = shift(ent), shift(end), [shift(s) for s in spots]
            links = [(shift(a), shift(b)) for a, b in links]
            img = img.crop((x0 * TILE, y0 * TILE, (x1 + 1) * TILE, (y1 + 1) * TILE))
            heights = heights if heights is None else heights[y0 * TILE:(y1 + 1) * TILE, x0 * TILE:(x1 + 1) * TILE]
        # The user's fixes.
        rows, grass = [list(r) for r in rows], [list(r) for r in grass]
        for l, r, up in USER_RAISED.get(name, []):
            for x in range(l, r + 1):
                for layer, fill in ((rows, '#'), (grass, '.')):
                    col = [layer[y][x] for y in range(len(layer))]
                    col = col[up:] + [fill] * up if up > 0 else [fill] * -up + col[:len(col) + up]
                    for y, c in enumerate(col):
                        layer[y][x] = c
        grass = [''.join(r) for r in grass]
        for (l, t, r, b), dy in USER_MOVES.get(name, []):
            moved = {(x, y + dy): rows[y][x] for y in range(t, b + 1) for x in range(l, r + 1)}
            for y in range(t, b + 1):
                for x in range(l, r + 1):
                    rows[y][x] = '.'
            for (x, y), c in moved.items():
                rows[y][x] = c
        for x, y in USER_WALKABLE.get(name, []):
            rows[y][x] = '.'
        for x, y in USER_BLOCKED.get(name, []):
            rows[y][x] = '#'
        ent, end = USER_ENTRANCE.get(name, ent), USER_EXIT.get(name, end)
        for x, y in (ent, end):
            rows[y][x] = '.'
        links = USER_LINKS.get(name, links)
        for a, b in USER_LINKS.get(name, []):
            for x, y in (a, b):
                rows[y][x] = '.'
        rows = [''.join(r) for r in rows]
        spots = [USER_SPOTS.get(name, {}).get(i + 1, s) for i, s in enumerate(spots)]
        reach = bfs(rows, ent, links)
        for t in spots + [end]:
            if t not in reach or rows[t[1]][t[0]] != '.':
                print('NO WALK:', name, 'entrance', ent, 'to', t)
        flows = USER_SPOT_FLOWS.get(name)
        over = heights is not None and overhead(img, rows, heights, USER_TREETOP_ROWS.get(name, 2) if name in USER_TREETOPS else 0, USER_NOT_TREETOPS.get(name, []), USER_CAVE_MOUTHS.get(name, []), green=name in USER_TREETOP_GREEN, rocks=name in USER_ROCKS)
        if name in USER_OVERHEAD:
            over = over or Image.new('RGBA', img.size)
            for x, y in USER_OVERHEAD[name]:
                box_ = (x * 16, y * 16, (x + 1) * 16, (y + 1) * 16)
                over.paste(img.convert('RGBA').crop(box_), box_)
        if over:
            over.save(os.path.join(PUBLIC, name + '_overhead.png'))
        bridges = USER_BRIDGES.get(name, [])
        if bridges:
            overhead(img, rows, heights, 0, bridges=bridges).save(os.path.join(PUBLIC, name + '_bridges.png'))
        img.save(os.path.join(PUBLIC, name + '.png'))
        pv = img.convert('RGB'); d = ImageDraw.Draw(pv)
        for k, (x, y) in enumerate([ent] + spots + [end]):
            col = (0, 255, 0) if k == 0 else (255, 0, 255) if k == len(spots) + 1 else (255, 0, 0)
            d.ellipse([x * 16 + 1, y * 16 + 1, x * 16 + 15, y * 16 + 15], outline=col, width=2)
            d.text((x * 16 + 16, y * 16), 'IN' if k == 0 else 'OUT' if k == len(spots) + 1 else str(k), fill=(255, 255, 255))
        pv.save(prefix + '-preview.png')
        spots_ = '\n'.join(f'    {{ x: {x}, y: {y} }},' for x, y in spots)
        walk_ = '\n'.join(f"    '{r}'," for r in rows)
        grass_ = ('\n  grass: [' + ''.join(f"\n    '{r}'," for r in grass) + '\n  ],') if any('g' in r for r in grass) else ''
        links_ = ('\n  links: [' + ', '.join(f'[{{ x: {a[0]}, y: {a[1]} }}, {{ x: {b[0]}, y: {b[1]} }}]' for a, b in links) + '],') if links else ''
        flows_ = ('\n  spotFlows: { ' + ', '.join(f"{n - 1}: '{f}'" for n, f in sorted(flows.items())) + ' },') if flows else ''
        over_ = f"\n  overhead: '/routes/{name}_overhead.png'," if over else ''
        over_ += ('\n  bridges: [' + ', '.join('{ ' + ', '.join(f"{k}: [{v[0]}, {v[1]}]" if isinstance(v, tuple) else f"{k}: '{v}'" for k, v in br.items()) + ' }' for br in bridges)
                  + f"],\n  bridgeOverhead: '/routes/{name}_bridges.png',") if bridges else ''
        out.append(f"""
/** {title}: {what}. Spots along the walk from its entrance to its exit, picked by the generator. */
export const {const}: Route = {{
  flow: '{flow}',
  sprites: 'dp',
  entrance: {{ x: {ent[0]}, y: {ent[1]} }},
  exit: {{ x: {end[0]}, y: {end[1]} }},{links_}{flows_}
  name: '{title}',
  image: '/routes/{name}.png',{over_}
  width: {len(rows[0]) * TILE},
  height: {len(rows) * TILE},
  spots: [
{spots_}
  ],
  walkable: [
{walk_}
  ],{grass_}
}};
""")
        print(name, 'entrance', ent, 'exit', end, 'spots', spots, 'size', len(rows[0]), 'x', len(rows))
    open(OUT, 'w', encoding='utf-8', newline='\n').write(HEAD + ''.join(out))
    print('wrote', OUT, 'previews in', work)


if __name__ == '__main__':
    main()
