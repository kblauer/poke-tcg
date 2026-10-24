"""Renders a Pokémon Emerald map from a checkout of the pret/pokeemerald decompilation, as render_route.py does FireRed's:
its layout's blocks drawn with its primary and secondary tilesets (both layers of each 16px metatile), and which tiles
can be walked on, are tall grass, or are surfable water.

Emerald's tilesets differ from FireRed's in their sizes (512 tiles and metatiles in a primary tileset, 6 palettes) and
in their metatile attributes (16 bits each: the behaviour in the low byte).

Usage: python emerald_map.py <pokeemerald checkout> <MapName, as in data/maps/, e.g. Route102> <out prefix>
Writes <out prefix>.png, <out prefix>_overhead.png (what the game draws over the people: its top layer, see-through
elsewhere) and <out prefix>.json: the size in tiles, `rows` ('.' walkable, '#' not: collision, ledges, water,
doors, warps and the map's people, but for item balls and cut trees; '~' surfable water; ledges by the way they're
jumped, '>' east, '<' west, '^' north, 'v' south), `grass` (1 where tall grass) and the map's events (map.json). Needs
Pillow (pip install pillow)."""
import json, os, re, struct, sys
from PIL import Image

NUM_TILES_PRIMARY = NUM_METATILES_PRIMARY = 512
NUM_PALS_PRIMARY = 6
LEDGES = {'MB_JUMP_EAST': '>', 'MB_JUMP_WEST': '<', 'MB_JUMP_NORTH': '^', 'MB_JUMP_SOUTH': 'v'}
# Not walked on: water, doors, warps, ladders and the rest (MB_CAVE is an indoor floor, where Dig works, not an entrance).
UNSAFE = re.compile(r'JUMP|WATER|DEEP|POND|OCEAN|WATERFALL|DOOR|WARP|LADDER|STAIRS|ARROW|ESCALATOR|SOOTOPOLIS_DEEP|SEAWEED|CRACKED|HOLE')
SURF = re.compile(r'WATER|DEEP|POND|OCEAN|SEAWEED')
FREE = ('OBJ_EVENT_GFX_ITEM_BALL', 'OBJ_EVENT_GFX_CUTTABLE_TREE')


def tileset_dir(repo, kind, name):
    """gTileset_PokemonCenter -> data/tilesets/secondary/pokemon_center."""
    snake = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', name.replace('gTileset_', '')).lower()
    return os.path.join(repo, 'data', 'tilesets', kind, snake)


def read_pal(path):
    lines = open(path).read().split()
    n = int(lines[2])
    return [tuple(int(v) for v in lines[3 + i * 3: 6 + i * 3]) for i in range(n)]


def read_tiles(path):
    im = Image.open(path)
    px = im.load()
    w, h = im.size
    tiles = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            tiles.append([[px[tx * 8 + x, ty * 8 + y] & 15 for x in range(8)] for y in range(8)])
    return tiles


def u16s(path):
    data = open(path, 'rb').read()
    return list(struct.unpack('<%dH' % (len(data) // 2), data))


def load(repo, map_name):
    """The map's json, its layout's size and blocks, and its tilesets (tiles, palettes, metatiles, attributes)."""
    m = json.load(open(os.path.join(repo, 'data', 'maps', map_name, 'map.json')))
    layout = next(l for l in json.load(open(os.path.join(repo, 'data', 'layouts', 'layouts.json')))['layouts'] if l.get('id') == m['layout'])
    W, H = layout['width'], layout['height']
    blocks = u16s(os.path.join(repo, layout['blockdata_filepath']))
    assert len(blocks) == W * H, (len(blocks), W, H)
    p, s = tileset_dir(repo, 'primary', layout['primary_tileset']), tileset_dir(repo, 'secondary', layout['secondary_tileset'])
    palettes = [read_pal(os.path.join(p, 'palettes', '%02d.pal' % i)) for i in range(NUM_PALS_PRIMARY)]
    palettes += [read_pal(os.path.join(s, 'palettes', '%02d.pal' % i)) for i in range(NUM_PALS_PRIMARY, 16)]
    tiles = read_tiles(os.path.join(p, 'tiles.png'))[:NUM_TILES_PRIMARY]
    tiles += [[[0] * 8] * 8] * (NUM_TILES_PRIMARY - len(tiles))
    tiles += read_tiles(os.path.join(s, 'tiles.png'))
    meta = u16s(os.path.join(p, 'metatiles.bin'))[:NUM_METATILES_PRIMARY * 8]
    meta += [0] * (NUM_METATILES_PRIMARY * 8 - len(meta))
    meta += u16s(os.path.join(s, 'metatiles.bin'))
    attrs = u16s(os.path.join(p, 'metatile_attributes.bin'))[:NUM_METATILES_PRIMARY]
    attrs += [0] * (NUM_METATILES_PRIMARY - len(attrs))
    attrs += u16s(os.path.join(s, 'metatile_attributes.bin'))
    return m, W, H, blocks, tiles, palettes, meta, attrs


def behaviour_names(repo):
    names = {}
    text = open(os.path.join(repo, 'include', 'constants', 'metatile_behaviors.h')).read()
    for name, value in re.findall(r'#define\s+(MB_\w+)\s+(0x[0-9A-Fa-f]+|\d+)', text):
        names[int(value, 0)] = name
    if not names:
        # An enum: MB_NORMAL, MB_SECRET_BASE_WALL, … in order.
        body = text[text.index('{'):text.index('}')]
        for i, name in enumerate(re.findall(r'\b(MB_\w+)', body)):
            names.setdefault(i, name)
    return names


def render(repo, map_name, out_prefix=None, block_people=True):
    """The map's image (PIL) and its tile info (size, rows, grass, events); written to <out_prefix>.png/.json if given.
    `block_people`: the map's people block their tiles (not in a gym, where only the Gym Trainer and leader are drawn)."""
    m, W, H, blocks, tiles, palettes, meta, attrs = load(repo, map_name)
    names = behaviour_names(repo)
    backdrop = palettes[0][0]
    im = Image.new('RGB', (W * 16, H * 16), backdrop)
    px = im.load()
    # What the game draws over the people (its top background layer): the second layer of each metatile whose layer type
    # (attribute bits 12-15) is NORMAL (0) or SPLIT (2), not COVERED (1); written apart, see-through elsewhere.
    top = Image.new('RGBA', (W * 16, H * 16), (0, 0, 0, 0))
    tpx = top.load()
    for by in range(H):
        for bx in range(W):
            mid = blocks[by * W + bx] & 0x3FF
            entries = meta[mid * 8: mid * 8 + 8]
            over = mid < len(attrs) and (attrs[mid] >> 12) & 0xF in (0, 2)
            for layer in range(2):
                for q in range(4):
                    e = entries[layer * 4 + q] if layer * 4 + q < len(entries) else 0
                    tile, hflip, vflip, pal = e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1, (e >> 12) & 0xF
                    t = tiles[tile] if tile < len(tiles) else [[0] * 8] * 8
                    ox, oy = bx * 16 + (q % 2) * 8, by * 16 + (q // 2) * 8
                    colors = palettes[pal] if pal < len(palettes) else palettes[0]
                    for y in range(8):
                        row = t[7 - y if vflip else y]
                        for x in range(8):
                            v = row[7 - x if hflip else x]
                            if v:
                                px[ox + x, oy + y] = colors[v]
                                if layer == 1 and over:
                                    tpx[ox + x, oy + y] = (*colors[v], 255)
    blocked = {(o['x'], o['y']) for o in m.get('object_events', []) if block_people and o['graphics_id'] not in FREE} | {(w['x'], w['y']) for w in m.get('warp_events', [])}
    rows, grass = [], []
    for by in range(H):
        r, g = [], []
        for bx in range(W):
            b = blocks[by * W + bx]
            mid, collision = b & 0x3FF, (b >> 10) & 3
            name = names.get(attrs[mid] & 0xFF if mid < len(attrs) else 0, '')
            if name in LEDGES:
                c = LEDGES[name]
            elif collision == 0 and SURF.search(name) and 'WATERFALL' not in name and (bx, by) not in blocked:
                c = '~'
            elif collision == 0 and not UNSAFE.search(name) and (bx, by) not in blocked:
                c = '.'
            else:
                c = '#'
            r.append(c)
            g.append(1 if 'TALL_GRASS' in name or 'LONG_GRASS' in name else 0)
        rows.append(''.join(r))
        grass.append(g)
    info = {'width': W, 'height': H, 'rows': rows, 'grass': grass, 'events': {k: m.get(k, []) for k in ('object_events', 'warp_events', 'coord_events', 'bg_events')}, 'connections': m.get('connections') or []}
    if out_prefix:
        im.save(out_prefix + '.png')
        top.save(out_prefix + '_overhead.png')
        json.dump(info, open(out_prefix + '.json', 'w'))
    return im, info


if __name__ == '__main__':
    repo, name, out = sys.argv[1:4]
    _, info = render(repo, name, out)
    print('rendered', name, info['width'], 'x', info['height'], 'walkable', sum(r.count('.') for r in info['rows']), 'water', sum(r.count('~') for r in info['rows']))
