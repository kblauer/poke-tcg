"""Makes the Extras page's assets (the Berry Farm and the Berry Blender) from a checkout of the pret/pokeemerald
decompilation, as the game draws them:

- the berries' bag icons (graphics/items/icons/<berry>_berry.png, coloured with its icon palette):
  apps/web/public/extras/berries/<berry>.png, 24x24;
- the berries' pictures (graphics/berries/<berry>.png, the Berry Blender's berries thrown in): apps/web/public/extras/berry-pics/<berry>.png, 48x48;
- each berry's tree (src/data/object_events/berry_tree_graphics_tables.h: the dirt pile, the sprout's 2 frames and the
  tree's 6 frames, each stage in the palette its palette slot table gives it, slots 2-5 being the NPC palettes 1-4):
  apps/web/public/extras/trees/<berry>.png, a strip of 9 frames 16x32, the 16x16 ones at the bottom of theirs;
- the Berry Farm's map: the Berry Master's garden on Route 123 made bigger from its own metatiles (its soil-and-grass
  columns repeated, its two rows of soil made three, the house and its path on the right as they are), drawn with the
  route's tilesets as tools/routes/emerald/emerald_map.py draws a map: apps/web/public/extras/farm.png, and
  packages/campaign/src/berry-farm-map.ts (its size, walkable tiles, entrance and the soil plots, 48 of them);
- the Berry Blender (src/berry_blender.c, graphics/berry_blender/): its frame (BG 1, outer.png with outer_map.bin,
  256x256), its spinning centre (BG 2, the affine 8bpp center.png with center_map.bin, 256x256, colour 0 see-through), the
  players' arrows (4 frames 32x32: off, lit, and the 2 of its flash), the score symbols (Good, Miss, Best and Best's
  flash, 16x16), the particles (8x8), the countdown's 1, 2, 3 (32x32) and START (64x32), all in their palettes
  (misc.pal for the sprites but the arrows), and the frame's tiles drawn over it as the game plays (the RPM digits,
  0x72-0x7B, and the progress bar's empty to full top and bottom tiles, 0xE1-0xE9 and 0xF1-0xF9):
  apps/web/public/extras/blender/*.png;
- the Berry Blender's sounds (the sound effects berry_blender.c plays, and the Pokéblock's fanfare), rendered by
  m4a_render.py: apps/web/public/extras/blender/sounds/<song>.wav (the blender's whirring, se_berry_blender, its loop once);
- the Pokéblock (graphics/pokeblock/pokeblock.png) in each colour's palette: apps/web/public/extras/pokeblocks/<colour>.png;
- the berries' data (src/berry.c's gBerries: name, size, firmness, yields, stage duration, flavours, smoothness and
  description), but the Enigma Berry (an e-Reader event's): packages/campaign/src/berry-data.ts.

Usage: python tools/extras/emerald_extras.py <pokeemerald checkout>
Needs Pillow."""
import json, os, re, struct, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'routes', 'emerald'))
import emerald_map  # noqa: E402
sys.path.insert(0, HERE)
import m4a_render  # noqa: E402

PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'extras')
CAMPAIGN = os.path.join(REPO, 'packages', 'campaign', 'src')


def read_pal(path):
    """A JASC palette's colours."""
    lines = open(path).read().split()
    n = int(lines[2])
    return [tuple(int(v) for v in lines[3 + i * 3: 6 + i * 3]) for i in range(n)]


def png_pal(im):
    p = im.getpalette()
    return [tuple(p[i * 3: i * 3 + 3]) for i in range(len(p) // 3)]


def colour(im, pal):
    """An indexed image in the colours of `pal`, index 0 see-through."""
    src = im.load()
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    px = out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            v = src[x, y]
            if v:
                px[x, y] = pal[v] + (255,)
    return out


def tiles_of(im):
    """An indexed image's 8x8 tiles, left to right then top to bottom, each its rows of indexes."""
    src = im.load()
    w, h = im.size
    return [[[src[tx * 8 + x, ty * 8 + y] for x in range(8)] for y in range(8)] for ty in range(h // 8) for tx in range(w // 8)]


def sprite_frames(im, fw, fh):
    """A sprite sheet's frames as the game reads them: its 8x8 tiles in order, `fw`x`fh` pixels a frame (1D mapping)."""
    t = tiles_of(im)
    per = (fw // 8) * (fh // 8)
    frames = []
    for f in range(len(t) // per):
        out = Image.new('P', (fw, fh))
        px = out.load()
        for i in range(per):
            tile = t[f * per + i]
            ox, oy = (i % (fw // 8)) * 8, (i // (fw // 8)) * 8
            for y in range(8):
                for x in range(8):
                    px[ox + x, oy + y] = tile[y][x]
        frames.append(out)
    return frames


def across(im, fw):
    """An object event's frames, side by side in its image (made into metatiles by gbagfx's -mwidth/-mheight)."""
    return [im.crop((x, 0, x + fw, im.size[1])) for x in range(0, im.size[0], fw)]


def strip(frames, pal, w, h):
    """Frames side by side in a strip, coloured with `pal`."""
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(colour(f, pal), (i * w, 0))
    return out


# ---- Berries ----

def snake(name):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', name).lower()


def berry_data(repo):
    """gBerries, in order (but the Enigma Berry): each berry's fields."""
    text = open(os.path.join(repo, 'src', 'berry.c')).read()
    descriptions = dict(re.findall(r'static const u8 (sBerryDescriptionPart\d_\w+)\[\] = _\("(.*?)"\);', text))
    body = text[text.index('const struct Berry gBerries[] ='):]
    body = body[:body.index('\n};')]
    berries = []
    for item, fields in re.findall(r'\[ITEM_(\w+)_BERRY - FIRST_BERRY_INDEX\]\s*=\s*\{(.*?)\n    \}', body, re.S):
        if item == 'ENIGMA':
            continue
        f = dict(re.findall(r'\.(\w+)\s*=\s*([^,\n]+),', fields))
        berries.append({
            'id': item.lower(),
            'name': item.capitalize(),
            'size': int(f['size']),
            'firmness': f['firmness'].replace('BERRY_FIRMNESS_', '').lower(),
            'minYield': int(f['minYield']),
            'maxYield': int(f['maxYield']),
            'stageHours': int(f['stageDuration']),
            'flavors': [int(f[k]) for k in ('spicy', 'dry', 'sweet', 'bitter', 'sour')],
            'smoothness': int(f['smoothness']),
            'description': ' '.join(descriptions[f[k]] for k in ('description1', 'description2')).replace('BERRY', 'Berry').replace('BERRIES', 'Berries').replace('POKéMON', 'Pokémon'),
        })
    return berries


def berry_icons(repo, berries):
    out = os.path.join(PUBLIC, 'berries')
    os.makedirs(out, exist_ok=True)
    for b in berries:
        im = Image.open(os.path.join(repo, 'graphics', 'items', 'icons', b['id'] + '_berry.png'))
        colour(im, read_pal(os.path.join(repo, 'graphics', 'items', 'icon_palettes', b['id'] + '_berry.pal'))).save(os.path.join(out, b['id'] + '.png'))


def berry_pics(repo, berries):
    out = os.path.join(PUBLIC, 'berry-pics')
    os.makedirs(out, exist_ok=True)
    for b in berries:
        im = Image.open(os.path.join(repo, 'graphics', 'berries', b['id'] + '.png'))
        colour(im, png_pal(im)).save(os.path.join(out, b['id'] + '.png'))


def berry_trees(repo, berries):
    tables = open(os.path.join(repo, 'src', 'data', 'object_events', 'berry_tree_graphics_tables.h')).read()
    pics = dict(re.findall(r'\[ITEM_(\w+)_BERRY - FIRST_BERRY_INDEX\]\s*=\s*sPicTable_(\w+)BerryTree,', tables))
    slots = dict(re.findall(r'\[ITEM_(\w+)_BERRY - FIRST_BERRY_INDEX\]\s*=\s*gBerryTreePaletteSlotTable_(\w+),', tables))
    slot_values = {k: [int(v) for v in vs.split(',')] for k, vs in re.findall(r'gBerryTreePaletteSlotTable_(\w+)\[\] = \{([\d, ]+)\};', tables)}
    npc = {s: read_pal(os.path.join(repo, 'graphics', 'object_events', 'palettes', 'npc_%d.pal' % (s - 1))) for s in (2, 3, 4, 5)}
    pics_dir = os.path.join(repo, 'graphics', 'object_events', 'pics', 'berry_trees')
    dirt = across(Image.open(os.path.join(pics_dir, 'dirt_pile.png')), 16)
    sprout = across(Image.open(os.path.join(pics_dir, 'sprout.png')), 16)
    out = os.path.join(PUBLIC, 'trees')
    os.makedirs(out, exist_ok=True)
    # The animation's frames by stage (object_event_anims.h's sAnim_BerryTreeStage0-4): the dirt pile; the sprout; the
    # tree's 2 taller, 2 flowering and 2 with berries.
    stage_of = [0, 1, 1, 2, 2, 3, 3, 4, 4]
    for b in berries:
        key = b['id'].upper()
        tree = across(Image.open(os.path.join(pics_dir, snake(pics[key]) + '.png')), 16)
        stage_slots = slot_values[slots[key]]
        sheet = Image.new('RGBA', (16 * 9, 32), (0, 0, 0, 0))
        for i, f in enumerate(dirt + sprout + tree):
            sheet.paste(colour(f, npc[stage_slots[stage_of[i]]]), (i * 16, 32 - f.size[1]))
        sheet.save(os.path.join(out, b['id'] + '.png'))


def write_berry_data(berries):
    lines = [
        '// Generated by tools/extras/emerald_extras.py from the pret/pokeemerald decompilation (src/berry.c\'s gBerries,',
        '// in the game\'s order, but the Enigma Berry): don\'t edit by hand.',
        '',
        "import type { BerryInfo } from './berries.js';",
        '',
        'export const BERRY_DATA: BerryInfo[] = [',
    ]
    def literal(v):
        if isinstance(v, str):
            return "'" + v.replace('\\', '\\\\').replace("'", "\\'") + "'"
        if isinstance(v, list):
            return '[' + ', '.join(literal(x) for x in v) + ']'
        return str(v)

    for b in berries:
        lines.append('  { ' + ', '.join('%s: %s' % (k, literal(v)) for k, v in b.items()) + ' },')
    lines.append('];')
    open(os.path.join(CAMPAIGN, 'berry-data.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


# ---- The Berry Farm ----

# Route 123's columns, left to right: the outer fence, the garden's left fence, its soil-and-grass columns (2 of soil,
# then 7 times a column of grass and 2 of soil: 8 pairs of plots a row, where Route 123 has 3), its right fence, and the
# path, the Berry Master's house and the outer fence on the right.
GARDEN_COLUMNS = [10] + [11, 12] + [13, 14, 15] * 7 + [19]
COLUMNS = [9] + GARDEN_COLUMNS + list(range(20, 27))
# Its rows, top to bottom: the trees, the grass and the top fence; in the garden its 2 rows of soil (a plot's top and the
# soil below it, rows 3 and 4) made 3; then the bottom fence, the lawn and the outer fence. Outside the garden the
# house's rows as they are, then 2 rows of lawn (row 8) for the garden's extra row of soil.
GARDEN_ROWS = [0, 1, 2, 3, 4, 3, 4, 5, 6, 7, 8, 9, 10, 11]
OTHER_ROWS = [0, 1, 2, 3, 4, 5, 6, 8, 8, 7, 8, 9, 10, 11]
BOTTOM_FENCE = GARDEN_ROWS.index(7)
# A plot's soil (Route 123's metatiles 0x273 and 0x275, the left and right of a pair).
SOIL = 0x273


def farm(repo):
    m, W, H, blocks, tiles, palettes, meta, attrs = emerald_map.load(repo, 'Route123')
    width, height = len(COLUMNS), len(GARDEN_ROWS)
    garden = range(1, 1 + len(GARDEN_COLUMNS))
    grid = []
    for y in range(height):
        for x, sx in enumerate(COLUMNS):
            sy = (GARDEN_ROWS if x in garden else OTHER_ROWS)[y]
            grid.append(blocks[sy * W + sx])
    # The bottom fence: whole (the repeated columns would repeat its gap) but for a gap of 4 in the middle, as Route 123's.
    inside = list(garden)[1:-1]
    gap = inside[len(inside) // 2 - 2: len(inside) // 2 + 2]
    fence, opening = blocks[7 * W + 11], blocks[7 * W + 13]
    for x in inside:
        grid[BOTTOM_FENCE * width + x] = opening if x in gap else fence
    original = emerald_map.load
    emerald_map.load = lambda repo_, name: ({}, width, height, grid, tiles, palettes, meta, attrs)
    try:
        im, info = emerald_map.render(repo, 'farm')
    finally:
        emerald_map.load = original
    os.makedirs(PUBLIC, exist_ok=True)
    im.save(os.path.join(PUBLIC, 'farm.png'))
    plots = [{'x': x, 'y': y} for y in range(height) for x in range(width) if grid[y * width + x] & 0x3FF in (SOIL, SOIL + 2)]
    # The player comes in up the path at the bottom (Route 123's 21,11).
    entrance = {'x': COLUMNS.index(21), 'y': height - 1}
    assert info['rows'][entrance['y']][entrance['x']] == '.', 'the entrance must be walkable'
    for p in plots:
        assert info['rows'][p['y'] + 1][p['x']] == '.', ('every plot is picked from below', p)
    return {'width': width, 'height': height, 'walkable': info['rows'], 'plots': plots, 'entrance': entrance}


def write_farm(f):
    lines = [
        '// Generated by tools/extras/emerald_extras.py from the pret/pokeemerald decompilation (Route 123\'s Berry Master\'s',
        '// garden, made bigger from its own metatiles): don\'t edit by hand.',
        '',
        '/** The Berry Farm\'s map (apps/web/public/extras/farm.png): its size in 16px tiles, which tiles can be walked on (\'.\'), where the player comes in, and its soil plots, left to right and top to bottom (each picked standing on the tile below it). */',
        'export const BERRY_FARM_MAP = {',
        "  image: '/extras/farm.png',",
        '  width: %d,' % f['width'],
        '  height: %d,' % f['height'],
        '  entrance: { x: %d, y: %d },' % (f['entrance']['x'], f['entrance']['y']),
        '  plots: [%s],' % ', '.join('{ x: %d, y: %d }' % (p['x'], p['y']) for p in f['plots']),
        '  walkable: [',
        *["    '%s'," % r for r in f['walkable']],
        '  ],',
        '};',
    ]
    open(os.path.join(CAMPAIGN, 'berry-farm-map.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


# ---- The Berry Blender ----

def blender(repo):
    src = os.path.join(repo, 'graphics', 'berry_blender')
    out = os.path.join(PUBLIC, 'blender')
    os.makedirs(out, exist_ok=True)
    misc = read_pal(os.path.join(src, 'misc.pal'))

    # The frame: a 32x32 text BG, its tiles in outer.png's colours (its map's entries all use that palette, slot 8).
    outer = Image.open(os.path.join(src, 'outer.png'))
    outer_pal = png_pal(outer)
    tiles = tiles_of(outer)
    entries = struct.unpack('<1024H', open(os.path.join(src, 'outer_map.bin'), 'rb').read())

    def draw_tile(px, ox, oy, tile, hflip=0, vflip=0, solid=True):
        for y in range(8):
            row = tiles[tile][7 - y if vflip else y]
            for x in range(8):
                v = row[7 - x if hflip else x]
                if v or solid:
                    px[ox + x, oy + y] = outer_pal[v] + (255,) if v else (0, 0, 0, 0)

    frame = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    px = frame.load()
    for i, e in enumerate(entries):
        draw_tile(px, (i % 32) * 8, (i // 32) * 8, e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1)
    frame.save(os.path.join(out, 'outer.png'))

    # The tiles the game writes over the frame: the RPM digits 0-9, and the progress bar's 9 top and 9 bottom tiles
    # (empty, 1-7 eighths, full).
    digits = Image.new('RGBA', (80, 8), (0, 0, 0, 0))
    for d in range(10):
        draw_tile(digits.load(), d * 8, 0, 0x72 + d)
    digits.save(os.path.join(out, 'digits.png'))
    bar = Image.new('RGBA', (72, 16), (0, 0, 0, 0))
    for i in range(9):
        draw_tile(bar.load(), i * 8, 0, 0xE1 + i)
        draw_tile(bar.load(), i * 8, 8, 0xF1 + i)
    bar.save(os.path.join(out, 'bar.png'))

    # The centre: an affine BG, 32x32 tiles of 8bpp (one byte each in its map), colour 0 see-through.
    center = Image.open(os.path.join(src, 'center.png'))
    center_pal = png_pal(center)
    ctiles = tiles_of(center)
    cmap = open(os.path.join(src, 'center_map.bin'), 'rb').read()
    disc = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    px = disc.load()
    for i, t in enumerate(cmap):
        for y in range(8):
            for x in range(8):
                v = ctiles[t][y][x] if t < len(ctiles) else 0
                if v:
                    px[(i % 32) * 8 + x, (i // 32) * 8 + y] = center_pal[v] + (255,)
    disc.save(os.path.join(out, 'center.png'))

    arrow = Image.open(os.path.join(src, 'arrow.png'))
    strip(sprite_frames(arrow, 32, 32), png_pal(arrow), 32, 32).save(os.path.join(out, 'arrow.png'))
    for name, w, h in (('score_symbols', 16, 16), ('particles', 8, 8), ('countdown_numbers', 32, 32), ('start', 64, 32)):
        strip(sprite_frames(Image.open(os.path.join(src, name + '.png')), w, h), misc, w, h).save(os.path.join(out, name.split('_')[0] + '.png'))


# The Berry Blender's sounds (berry_blender.c's PlaySE and PlayFanfare calls).
BLENDER_SOUNDS = ['se_ball_tray_exit', 'se_fall', 'se_truck_door', 'se_ball_bounce_1', 'se_pin', 'se_berry_blender', 'se_ice_stairs', 'se_success', 'se_failure', 'se_select', 'mus_level_up']


def sounds(repo):
    out = os.path.join(PUBLIC, 'blender', 'sounds')
    for song in BLENDER_SOUNDS:
        m4a_render.write_wav(os.path.join(out, song + '.wav'), m4a_render.render(repo, song, loop=song == 'se_berry_blender'), 0.8)


def pokeblocks(repo):
    """The Pokéblock's sprite in each colour's palette (graphics/pokeblock/<colour>.pal): apps/web/public/extras/pokeblocks/<colour>.png."""
    src = os.path.join(repo, 'graphics', 'pokeblock')
    out = os.path.join(PUBLIC, 'pokeblocks')
    os.makedirs(out, exist_ok=True)
    im = Image.open(os.path.join(src, 'pokeblock.png'))
    for name in ('red', 'blue', 'pink', 'green', 'yellow', 'purple', 'indigo', 'brown', 'liteblue', 'olive', 'gray', 'black', 'white', 'gold'):
        colour(im, read_pal(os.path.join(src, name + '.pal'))).save(os.path.join(out, name + '.png'))


def main():
    repo = sys.argv[1]
    pokeblocks(repo)
    sounds(repo)
    berries = berry_data(repo)
    assert len(berries) == 42, len(berries)
    berry_icons(repo, berries)
    berry_pics(repo, berries)
    berry_trees(repo, berries)
    write_berry_data(berries)
    f = farm(repo)
    write_farm(f)
    blender(repo)
    print('berries', len(berries), 'farm', f['width'], 'x', f['height'], 'plots', len(f['plots']))


if __name__ == '__main__':
    main()
