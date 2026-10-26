"""Who's That Pokémon?'s name entry: Pokémon Emerald's naming screen (src/naming_screen.c), its pictures from pret/pokeemerald.

Renders the screen's layers at the GBA's 240×160, as the game puts them on its backgrounds, and its sprites with their
palettes, to apps/web/public/whos-that/naming/ (the web app's NamingScreen draws them with the game's text over them):
  background.png     BG3: graphics/naming_screen/background.bin with menu.png's tiles (the banner's band, the
                     stripes, the name box), the name box's two text windows filled white as the game fills them
  keyboard-upper.png, keyboard-lower.png, keyboard-symbols.png
                     BG1/BG2: each keyboard page's panel (keyboard_*.bin), its text window filled with the page's colour
  back.png, ok.png, page-frame.png, page-button-<page>.png, page-<page>.png, cursor.png, underscore.png, arrow.png,
  keypad-a.png, keypad-b.png, keypad-dpad.png
                     the sprites (and the banner's keypad icons), each with its palette
  colors.json        the text's colours: the keyboard pages' (white on a dark grey shadow), the name's and the
                     title's (dark grey on light grey), the banner's (white on dark grey on its fill)
Usage: python tools/whos-that/naming_screen.py [--emerald <pokeemerald checkout>]
Without a checkout, the few files it needs are downloaded from GitHub. Needs Pillow.
"""
import argparse
import json
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/public/whos-that/naming'
RAW = 'https://raw.githubusercontent.com/pret/pokeemerald/master/'
NS = 'graphics/naming_screen/'
FILES = [NS + f for f in (
    'background.bin keyboard_upper.bin keyboard_lower.bin keyboard_symbols.bin menu.png menu.pal page_swap_upper.pal '
    'page_swap_lower.pal page_swap_others.pal buttons.pal cursor.pal keyboard.pal back_button.png ok_button.png '
    'page_swap_frame.png page_swap_button.png page_swap_upper.png page_swap_lower.png page_swap_others.png cursor.png '
    'underscore.png input_arrow.png'
).split()] + ['graphics/fonts/keypad_icons.png', 'graphics/text_window/text_pal2.pal']

W, H = 240, 160
# The text windows (sWindowTemplates, in tiles): the keyboard pages', the name's and the title's.
KEYBOARD_WINDOW = (3, 10, 19, 8)
NAME_WINDOWS = [(8, 6, 17, 2), (8, 4, 17, 2)]
# Each page's fill (sFillValues: keyboard.pal's colour 13, 14 or 15).
PAGES = {'upper': ('keyboard_upper.bin', 13), 'lower': ('keyboard_lower.bin', 14), 'symbols': ('keyboard_symbols.bin', 15)}
# The keypad icons' cells (text.c's sKeypadIcons: tile offset, 8×12).
KEYPAD = {'a': 0x00, 'b': 0x01, 'dpad': 0x22}


def fetch(emerald):
    """The files, from a checkout or downloaded to a temporary folder."""
    if emerald:
        return Path(emerald)
    folder = Path(tempfile.mkdtemp(prefix='pokeemerald-'))
    for f in FILES:
        (folder / f).parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(RAW + f, folder / f)
    return folder


def palette(path):
    """A JASC palette's 16 colours."""
    lines = path.read_text().split()
    count = int(lines[2])
    return [tuple(int(v) for v in lines[3 + i * 3:6 + i * 3]) + (255,) for i in range(count)]


def tiles(path):
    """A 4bpp sheet's 8×8 tiles, row by row, each 64 colour indexes."""
    im = Image.open(path)
    px = im.load()
    return [[px[tx * 8 + x, ty * 8 + y] for y in range(8) for x in range(8)] for ty in range(im.height // 8) for tx in range(im.width // 8)]


def tilemap(path, sheet, palettes, backdrop=None):
    """A 32-wide tilemap drawn at 240×160: each entry's tile (flipped as it says) in its palette; colour 0 is clear."""
    data = path.read_bytes()
    out = Image.new('RGBA', (W, H), backdrop or (0, 0, 0, 0))
    px = out.load()
    for i in range(len(data) // 2):
        entry = int.from_bytes(data[i * 2:i * 2 + 2], 'little')
        tx, ty = i % 32, i // 32
        if tx * 8 >= W or ty * 8 >= H:
            continue
        tile, hflip, vflip, pal = entry & 0x3FF, entry >> 10 & 1, entry >> 11 & 1, entry >> 12
        if tile >= len(sheet):
            continue
        for y in range(8):
            for x in range(8):
                index = sheet[tile][(7 - y if vflip else y) * 8 + (7 - x if hflip else x)]
                if index:
                    px[tx * 8 + x, ty * 8 + y] = palettes[pal][index]
    return out


def fill(im, window, colour):
    left, top, width, height = window
    im.paste(colour, (left * 8, top * 8, (left + width) * 8, (top + height) * 8))


def sprite(path, pal, box=None):
    """A sprite sheet in its palette, colour 0 clear (cropped to `box`)."""
    im = Image.open(path)
    if box:
        im = im.crop(box)
    out = Image.new('RGBA', im.size)
    out.putdata([pal[i] if i else (0, 0, 0, 0) for i in im.get_flattened_data()])
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--emerald', help='a pokeemerald checkout (default: download the files)')
    src = fetch(parser.parse_args().emerald)
    ns = src / NS
    # gNamingScreenMenu_Pal: BG palettes 0-5; the keyboard's 10 (sKeyboard_Pal); the banner's 11 (GetTextWindowPalette(2)).
    menu = [palette(ns / f) for f in ('menu.pal', 'page_swap_upper.pal', 'page_swap_lower.pal', 'page_swap_others.pal', 'buttons.pal', 'cursor.pal')]
    keyboard = palette(ns / 'keyboard.pal')
    banner = palette(src / 'graphics/text_window/text_pal2.pal')
    palettes = menu + [menu[0]] * 4 + [keyboard, banner] + [menu[0]] * 4
    sheet = tiles(ns / 'menu.png')
    OUT.mkdir(parents=True, exist_ok=True)

    background = tilemap(ns / 'background.bin', sheet, palettes, backdrop=menu[0][0])
    for window in NAME_WINDOWS:
        fill(background, window, keyboard[1])
    background.save(OUT / 'background.png')
    for name, (bin_, colour) in PAGES.items():
        page = tilemap(ns / bin_, sheet, palettes)
        fill(page, KEYBOARD_WINDOW, keyboard[colour])
        page.save(OUT / f'keyboard-{name}.png')

    # The page swap button shows the next page: its label (in the buttons' palette) and its colour (that page's palette).
    for out, name, pal in [
        ('back', 'back_button', menu[4]), ('ok', 'ok_button', menu[4]), ('page-frame', 'page_swap_frame', menu[4]),
        ('page-button-upper', 'page_swap_button', menu[1]), ('page-button-lower', 'page_swap_button', menu[2]),
        ('page-button-others', 'page_swap_button', menu[3]), ('page-upper', 'page_swap_upper', menu[4]),
        ('page-lower', 'page_swap_lower', menu[4]), ('page-others', 'page_swap_others', menu[4]),
        ('cursor', 'cursor', menu[5]), ('underscore', 'underscore', menu[3]), ('arrow', 'input_arrow', menu[3]),
    ]:
        sprite(ns / f'{name}.png', pal).save(OUT / f'{out}.png')
    for name, offset in KEYPAD.items():
        x, y = offset % 16 * 8, offset // 16 * 8
        sprite(src / 'graphics/fonts/keypad_icons.png', banner, (x, y, x + 8, y + 12)).save(OUT / f'keypad-{name}.png')

    css = lambda c: f'rgb({c[0]}, {c[1]}, {c[2]})'
    (OUT / 'colors.json').write_text(json.dumps({
        'keyboard': {'text': css(keyboard[1]), 'shadow': css(keyboard[2])},
        'name': {'text': css(keyboard[2]), 'shadow': css(keyboard[3])},
        'banner': {'fill': css(banner[15]), 'text': css(banner[1]), 'shadow': css(banner[2])},
    }, indent=2) + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
