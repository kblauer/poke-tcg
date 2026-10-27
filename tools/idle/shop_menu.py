"""Makes the Idle Adventure's Poké Mart pictures (README: Idle Adventure, the store) from a checkout of the
pret/pokefirered decompilation, as FireRed draws its buy screen (src/shop.c, src/buy_menu_helpers.c):
apps/web/public/idle/gen1/shop/

  frame.png           the buy screen's frame (graphics/shop_menu/shop_tilemap.bin over shop_menu.png's tiles, in its
                      first palette: BuyMenuDecompressBgGraphics' palette 11), see-through where the map shows (the
                      tilemap's empty entries and colour 0)
  frame_quantity.png  the same with the item description box in its second palette (palette 6), as
                      RecolorItemDescriptionBox draws it while a quantity is chosen
  window_std.png      the standard window frame (graphics/text_window/std.png, 3 by 3 tiles: the money box, IN BAG)
  window_user.png     the player's window frame, FireRed's first (type1.png: the quantity box)
  pokedollar.png      the small font's Pokédollar sign (graphics/fonts/latin_small.png, the charmap's ¥, 0xB7: an 8x16
                      cell, 5 pixels wide), in the list's text colours (the menu window palette's 2 and 3)
  items/<item>.png    each item a Kanto Poké Mart sells (the maps' `pokemart` lists), and the CANCEL arrow (cancel.png):
                      its icon (graphics/items/icons/, src/data/item_icon_table.h) in its own palette, colour 0 see-through

Usage: python tools/idle/shop_menu.py <pokefirered checkout>. Needs Pillow."""
import os
import re
import struct
import sys

from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen1', 'shop')


def read(path):
    return open(os.path.join(SRC, path), encoding='utf8').read()


def jasc(path):
    """A JASC palette file's colours."""
    lines = read(path).split('\n')
    return [tuple(int(v) for v in l.split()) for l in lines[3:3 + int(lines[2])]]


def frame(description_palette):
    """The buy screen's frame: 32 by 20 of the tilemap's 32x32 tiles (the screen), each entry's tile, flips and palette."""
    tiles = Image.open(os.path.join(SRC, 'graphics', 'shop_menu', 'shop_menu.png'))
    flat = tiles.getpalette()
    pals = [[tuple(flat[(p * 16 + i) * 3:(p * 16 + i) * 3 + 3]) for i in range(16)] for p in range(2)]
    tw = tiles.width // 8
    tp = tiles.load()
    data = open(os.path.join(SRC, 'graphics', 'shop_menu', 'shop_tilemap.bin'), 'rb').read()
    out = Image.new('RGBA', (240, 160))
    op = out.load()
    for ty in range(20):
        for tx in range(30):
            e = struct.unpack_from('<H', data, (ty * 32 + tx) * 2)[0]
            if e == 0:
                continue
            n, hf, vf = e & 0x3FF, e & 0x400, e & 0x800
            # The item description box (rows 14-19) recoloured while a quantity is chosen.
            pal = pals[description_palette if ty >= 14 else 0]
            for y in range(8):
                for x in range(8):
                    sx = 7 - x if hf else x
                    sy = 7 - y if vf else y
                    c = tp[(n % tw) * 8 + sx, (n // tw) * 8 + sy] & 15
                    if c:
                        op[tx * 8 + x, ty * 8 + y] = pal[c] + (255,)
    return out


def indexed(path, palette, out):
    """An indexed picture in another palette, colour 0 see-through."""
    im = Image.open(os.path.join(SRC, path))
    src = im.load()
    res = Image.new('RGBA', im.size)
    rp = res.load()
    for y in range(im.height):
        for x in range(im.width):
            c = src[x, y] & 15
            if c:
                rp[x, y] = palette[c] + (255,)
    res.save(out)


def own_palette(path):
    im = Image.open(os.path.join(SRC, path))
    flat = im.getpalette()
    return [tuple(flat[i * 3:i * 3 + 3]) for i in range(16)]


def glyph(code, fg, shadow, out):
    """A glyph of the small font: its 8x16 cell, colour 1 its letter and 2 its shadow, the rest see-through."""
    im = Image.open(os.path.join(SRC, 'graphics', 'fonts', 'latin_small.png'))
    src = im.load()
    res = Image.new('RGBA', (8, 16))
    rp = res.load()
    for y in range(16):
        for x in range(8):
            c = src[(code % 32) * 8 + x, (code // 32) * 16 + y]
            if c in (1, 2):
                rp[x, y] = (fg if c == 1 else shadow) + (255,)
    res.save(out)


def main():
    os.makedirs(os.path.join(OUT, 'items'), exist_ok=True)
    glyph(0xB7, (98, 98, 98), (213, 213, 205), os.path.join(OUT, 'pokedollar.png'))
    frame(0).save(os.path.join(OUT, 'frame.png'))
    frame(1).save(os.path.join(OUT, 'frame_quantity.png'))
    for name, out in (('std', 'window_std'), ('type1', 'window_user')):
        path = f'graphics/text_window/{name}.png'
        indexed(path, own_palette(path), os.path.join(OUT, out + '.png'))
    # Every item a Kanto Poké Mart sells: the maps' mart lists.
    sold = set()
    for d in os.listdir(os.path.join(SRC, 'data', 'maps')):
        p = os.path.join('data', 'maps', d, 'scripts.inc')
        if not os.path.exists(os.path.join(SRC, p)):
            continue
        for block in re.findall(r'\w+_Items::\s*((?:\s*\.2byte ITEM_\w+)+)', read(p)):
            sold.update(c for c in re.findall(r'ITEM_(\w+)', block) if c != 'NONE')
    table = {c: (pic, pal) for c, pic, pal in re.findall(r'\[ITEM_(\w+)\]\s*=\s*\{(gItemIcon_\w+), (gItemIconPalette_\w+)\}', read('src/data/item_icon_table.h'))}
    table['COUNT'] = re.search(r'\[ITEMS_COUNT\]\s*=\s*\{(gItemIcon_\w+), (gItemIconPalette_\w+)\}', read('src/data/item_icon_table.h')).groups()
    files = dict(re.findall(r'const u32 (gItemIcon\w+)\[\] = INCBIN_U32\("(graphics/items/[\w/]+)\.\w+\.lz"\)', read('src/data/graphics/items.h')))
    for const in sorted(sold) + ['COUNT']:
        pic, pal = table[const]
        key = 'cancel' if const == 'COUNT' else const.lower().replace('_', '-')
        indexed(files[pic] + '.png', jasc(files[pal] + '.pal'), os.path.join(OUT, 'items', key + '.png'))
    print(len(sold), 'items')


main()
