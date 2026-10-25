"""Renders a FireRed map from pret/pokefirered data (layout blockdata + primary/secondary tilesets) to a PNG, and writes
which tiles are walkable as JSON (and, apart, which are surfable water: `water`). Usage: python render_route.py <dir> <out.png> <out.json> <width> <height>, where <dir> holds
the layout's map.bin, the map's map.json, include/constants/metatile_behaviors.h as behaviors.h, and the primary and
secondary tilesets' tiles.png, metatiles.bin, metatile_attributes.bin and palettes (00.pal to 15.pal) in p/ and s/, and
<width> and <height> are the layout's size in metatiles (data/layouts/layouts.json; Route 2 is 24 by 80; fetch_map.py
downloads all of this and prints them). The map's objects block their tiles, except item balls and cut-trees; with
`--only GFX,...` (a gym), only objects of those graphics do (OBJ_EVENT_GFX_ left off: GYM_GUY). `--overhead <png>`
also writes what the game draws over the people (its top layer: a counter's near edge, a tree's top), see-through elsewhere. Needs pypng
(pip install --target pylib pypng, next to this script)."""
import json, os, re, struct, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import png

src, out_png, out_json = sys.argv[1:4]
W, H = int(sys.argv[4]), int(sys.argv[5])  # the layout's size, in 16px metatiles (layouts.json)
NUM_TILES_PRIMARY = NUM_METATILES_PRIMARY = 640
NUM_PALS_PRIMARY = 7


def read_pal(path):
    lines = open(path).read().split()
    n = int(lines[2])
    return [tuple(int(v) for v in lines[3 + i * 3: 6 + i * 3]) for i in range(n)]


def read_tiles(path):
    w, h, rows, info = png.Reader(filename=path).read()
    rows = [list(r) for r in rows]
    if info['bitdepth'] == 8 and max(max(r) for r in rows) > 15:
        rows = [[v & 15 for v in r] for r in rows]
    tiles = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            tiles.append([rows[ty * 8 + y][tx * 8: tx * 8 + 8] for y in range(8)])
    return tiles


palettes = [read_pal(os.path.join(src, 'p', '%02d.pal' % i)) for i in range(NUM_PALS_PRIMARY)]
palettes += [read_pal(os.path.join(src, 's', '%02d.pal' % i)) for i in range(NUM_PALS_PRIMARY, 16)]
tiles = read_tiles(os.path.join(src, 'p', 'tiles.png'))[:NUM_TILES_PRIMARY]
tiles += read_tiles(os.path.join(src, 's', 'tiles.png'))


def u16s(path):
    data = open(path, 'rb').read()
    return list(struct.unpack('<%dH' % (len(data) // 2), data))


def u32s(path):
    data = open(path, 'rb').read()
    return list(struct.unpack('<%dI' % (len(data) // 4), data))


meta_p, meta_s = u16s(os.path.join(src, 'p', 'metatiles.bin')), u16s(os.path.join(src, 's', 'metatiles.bin'))
attr_p, attr_s = u32s(os.path.join(src, 'p', 'metatile_attributes.bin')), u32s(os.path.join(src, 's', 'metatile_attributes.bin'))
blocks = u16s(os.path.join(src, 'map.bin'))
assert len(blocks) == W * H, len(blocks)

# Behaviour names by value (include/constants/metatile_behaviors.h).
names = {}
for name, value in re.findall(r'#define\s+(MB_\w+)\s+(0x[0-9A-Fa-f]+|\d+)', open(os.path.join(src, 'behaviors.h')).read()):
    names[int(value, 0)] = name


def metatile(mid):
    return meta_p[mid * 8: mid * 8 + 8] if mid < NUM_METATILES_PRIMARY else meta_s[(mid - NUM_METATILES_PRIMARY) * 8: (mid - NUM_METATILES_PRIMARY) * 8 + 8]


def behavior(mid):
    a = attr_p[mid] if mid < NUM_METATILES_PRIMARY else attr_s[mid - NUM_METATILES_PRIMARY]
    return a & 0x1FF


backdrop = palettes[0][0]
pixels = [[backdrop] * (W * 16) for _ in range(H * 16)]
# What the game draws over the people (its top background layer): the second layer of each metatile whose layer type
# (attribute bits 29-30) is NORMAL (0) or SPLIT (2), not COVERED (1); with --overhead, written apart, see-through elsewhere.
top = [[(0, 0, 0, 0)] * (W * 16) for _ in range(H * 16)]


def layer_type(mid):
    a = attr_p[mid] if mid < NUM_METATILES_PRIMARY else attr_s[mid - NUM_METATILES_PRIMARY]
    return (a >> 29) & 3


for by in range(H):
    for bx in range(W):
        mid = blocks[by * W + bx] & 0x3FF
        entries = metatile(mid)
        over = layer_type(mid) in (0, 2)
        for layer in range(2):
            for q in range(4):
                e = entries[layer * 4 + q]
                tile, hflip, vflip, pal = e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1, (e >> 12) & 0xF
                t = tiles[tile] if tile < len(tiles) else [[0] * 8] * 8
                ox, oy = bx * 16 + (q % 2) * 8, by * 16 + (q // 2) * 8
                for y in range(8):
                    for x in range(8):
                        v = t[7 - y if vflip else y][7 - x if hflip else x]
                        if v == 0:
                            continue  # transparent: the layer below (or the backdrop) shows
                        pixels[oy + y][ox + x] = palettes[pal][v]
                        if layer == 1 and over:
                            top[oy + y][ox + x] = (*palettes[pal][v], 255)

png.Writer(W * 16, H * 16, greyscale=False).write(open(out_png, 'wb'), [[c for p in row for c in p] for row in pixels])
if '--overhead' in sys.argv:
    png.Writer(W * 16, H * 16, greyscale=False, alpha=True).write(open(sys.argv[sys.argv.index('--overhead') + 1], 'wb'), [[c for p in row for c in p] for row in top])

# Walkability: the block's collision bits clear, and not a ledge, water, door or warp tile.
UNSAFE = re.compile(r'JUMP|WATER|DEEP|POND|OCEAN|WATERFALL|DOOR|WARP|LADDER|STAIRS|ARROW|ESCALATOR')  # MB_CAVE is an indoor floor (where Dig works), not an entrance
SURF = re.compile(r'WATER|DEEP|POND|OCEAN')
m = json.load(open(os.path.join(src, 'map.json')))
only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
FREE = ('OBJ_EVENT_GFX_ITEM_BALL', 'OBJ_EVENT_GFX_CUT_TREE')
blocking = lambda o: o['graphics_id'].replace('OBJ_EVENT_GFX_', '') in only if only is not None else o['graphics_id'] not in FREE
blocked = {(o['x'], o['y']) for o in m.get("object_events", []) if blocking(o)} | {(w['x'], w['y']) for w in m.get('warp_events', [])}
grid = []
for by in range(H):
    row = []
    for bx in range(W):
        b = blocks[by * W + bx]
        mid, collision = b & 0x3FF, (b >> 10) & 3
        name = names.get(behavior(mid), '')
        walk = collision == 0 and not UNSAFE.search(name) and (bx, by) not in blocked
        # Surfable water (for a route crossed by surfing): open water, not a waterfall.
        water = collision == 0 and bool(SURF.search(name)) and 'WATERFALL' not in name and (bx, by) not in blocked
        row.append({'walk': walk, 'grass': 'TALL_GRASS' in name, 'water': water, 'b': name})
    grid.append(row)
json.dump({'width': W, 'height': H, 'tile': 16, 'grid': [[1 if c['walk'] else 0 for c in r] for r in grid], 'grass': [[1 if c['grass'] else 0 for c in r] for r in grid], 'water': [[1 if c['water'] else 0 for c in r] for r in grid]}, open(out_json, 'w'))
print('rendered', W * 16, 'x', H * 16, 'walkable tiles:', sum(c['walk'] for r in grid for c in r), 'grass:', sum(c['grass'] for r in grid for c in r))
