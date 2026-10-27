"""Makes the Idle Adventure's battle healthboxes (README: Idle Adventure, battles) from a checkout of the pret/pokefirered
decompilation, as FireRed draws them (src/battle_interface.c): apps/web/public/idle/gen1/battle/

  healthbox_player.png, healthbox_opponent.png
                      a single battle's healthbox (healthbox_singles_*.png: two sprites side by side, their tiles 1D
                      mapped, in healthbox.pal), with the windows the game prints the name, level and (the player's) HP
                      into already cleared to their fill (TextIntoHealthboxObject: a window's colour 2 over the bottom
                      three rows of its top tiles and its whole bottom tiles), so the page prints over them
  hp_text.png         the HP bar's "HP" (healthbox_elements.png's 2 tiles at 1, healthbar.pal)
  hp_bar.png          the HP bar's tiles: a row each for green, yellow and red (elements 3, 47, 56), 9 tiles each for 0 to
                      8 pixels filled
  hp_left_border.png  the bar's left end in place of "HP" while the opponent has a status (element 65)
  exp_bar.png         the EXP. bar's 9 tiles, 0 to 8 pixels filled (element 12, healthbox.pal)
  ball_caught.png     the opponent's caught-before Poké Ball (element 70, healthbar.pal)
  status/<kind>_<side>.png
                      the status icons (3 tiles each: the player's battler 0's, the opponent's battler 1's), their
                      colour (the palette's 12 + battler) set to sStatusIconColors' (UpdateStatusIconInHealthbox)
  font_small.png, font_small_male.png, font_small_female.png
                      the small font (graphics/fonts/latin_small.png, 8x16 cells, 32 a row) in the healthbox's text
                      colours (AddTextPrinterAndCreateWindowOnHealthbox: 1 on shadow 3), and with the ♂/♀ colours
                      (TEXT_DYNAMIC_COLOR_2: the palette's 11, TEXT_DYNAMIC_COLOR_1: its 10)
  balls/<item>.png    each ball's sheet (graphics/interface/ball/: 16x16 frames closed, half open, open), its open frame
                      ball_open.png for all but the Dive, Luxury and Premier Balls (LoadBallGfx), in its own palette
  particles.png       the balls' opening particles (graphics/battle_anims/sprites/particles.png, eight 8x8 frames), in
                      circle_impact's palette
  red_back.png, leaf_back.png (the whole sheet: five 64x64 frames, the throw's; firered_data.py cuts only the first)
                      as <who>_back_sheet.png in public/idle/gen1/trainers/

and apps/web/src/components/idle/fontSmall.ts: the small font's glyph widths (src/text.c's sFontSmallLatinGlyphWidths)
and the characters the page prints, by glyph (charmap.txt).

Usage: python tools/idle/battle_interface.py <pokefirered checkout>. Needs Pillow."""
import os
import re
import sys

from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen1', 'battle')
OUT_TS = os.path.join(ROOT, 'apps', 'web', 'src', 'components', 'idle', 'fontSmall.ts')
G = os.path.join(SRC, 'graphics', 'battle_interface')


def read(path):
    return open(os.path.join(SRC, path), encoding='utf8').read()


def jasc(path):
    lines = read(path).split('\n')
    return [tuple(int(v) for v in l.split()) for l in lines[3:3 + int(lines[2])]]


BOX = jasc('graphics/battle_interface/healthbox.pal')
BAR = jasc('graphics/battle_interface/healthbar.pal')


def tile_at(im, n):
    """An indexed sheet's tile n (8x8, the sheet read in rows of tiles): its colour indexes."""
    px = im.load()
    tw = im.width // 8
    sx, sy = (n % tw) * 8, (n // tw) * 8
    return [[px[sx + x, sy + y] & 15 for x in range(8)] for y in range(8)]


def put(out, tile, dx, dy, pal):
    op = out.load()
    for y in range(8):
        for x in range(8):
            c = tile[y][x]
            if c:
                op[dx + x, dy + y] = pal[c] + (255,)


def healthbox(name, w, h, other, windows):
    """Two w x h tile sprites side by side (the second from tile `other`), then each window cleared to colour 2."""
    im = Image.open(os.path.join(G, name))
    out = Image.new('RGBA', (w * 16, h * 8))
    for s, base in ((0, 0), (1, other)):
        for t in range(w * h):
            put(out, tile_at(im, base + t), s * w * 8 + (t % w) * 8, (t // w) * 8, BOX)
    op = out.load()
    for x0, x1, y0, y1 in windows:
        for y in range(y0, y1):
            for x in range(x0, x1):
                op[x, y] = BOX[2] + (255,)
    return out


def strip(tiles, pal):
    out = Image.new('RGBA', (8 * len(tiles), 8))
    for i, t in enumerate(tiles):
        put(out, t, i * 8, 0, pal)
    return out


def font(fg, shadow, path):
    im = Image.open(os.path.join(SRC, 'graphics', 'fonts', 'latin_small.png'))
    src = im.load()
    out = Image.new('RGBA', im.size)
    op = out.load()
    for y in range(im.height):
        for x in range(im.width):
            c = src[x, y]
            if c == 1:
                op[x, y] = fg + (255,)
            elif c == 2:
                op[x, y] = shadow + (255,)
    out.save(path)


def indexed(path, pal, out, replace=None):
    """An indexed picture in a palette, colour 0 see-through; `replace` a picture (and where) pasted in first."""
    im = Image.open(os.path.join(SRC, path)).copy()
    if replace:
        im.paste(Image.open(os.path.join(SRC, replace[0])), replace[1])
    src = im.load()
    res = Image.new('RGBA', im.size)
    rp = res.load()
    for y in range(im.height):
        for x in range(im.width):
            c = src[x, y] & 15
            if c:
                rp[x, y] = pal[c] + (255,)
    res.save(out)


def own(path):
    flat = Image.open(os.path.join(SRC, path)).getpalette()
    return [tuple(flat[i * 3:i * 3 + 3]) for i in range(16)]


def main():
    os.makedirs(os.path.join(OUT, 'status'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'balls'), exist_ok=True)
    for item, f in (('poke-ball', 'poke'), ('great-ball', 'great'), ('ultra-ball', 'ultra'), ('master-ball', 'master'), ('safari-ball', 'safari')):
        path = f'graphics/interface/ball/{f}.png'
        indexed(path, own(path), os.path.join(OUT, 'balls', item + '.png'), ('graphics/interface/ball_open.png', (0, 32)))
    indexed('graphics/battle_anims/sprites/particles.png', own('graphics/battle_anims/sprites/circle_impact.png'), os.path.join(OUT, 'particles.png'))
    for who in ('red', 'leaf'):
        indexed(f'graphics/trainers/back_pics/{who}_back_pic.png', jasc(f'graphics/trainers/palettes/{who}_back_pic.pal'),
                os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen1', 'trainers', who + '_back_sheet.png'))
    # The windows (UpdateNickInHealthbox, UpdateLvlInHealthbox, UpdateHpTextInHealthbox): their tiles in the sprites,
    # the top tiles' rows 5-7 and the bottom tiles whole.
    healthbox('healthbox_singles_player.png', 8, 8, 64, [(16, 72, 5, 16), (72, 96, 5, 16), (56, 96, 21, 32)]).save(os.path.join(OUT, 'healthbox_player.png'))
    healthbox('healthbox_singles_opponent.png', 8, 4, 32, [(8, 64, 5, 16), (64, 88, 5, 16)]).save(os.path.join(OUT, 'healthbox_opponent.png'))
    el = Image.open(os.path.join(G, 'healthbox_elements.png'))
    strip([tile_at(el, 1), tile_at(el, 2)], BAR).save(os.path.join(OUT, 'hp_text.png'))
    bars = Image.new('RGBA', (72, 24))
    for row, first in enumerate((3, 47, 56)):
        bars.paste(strip([tile_at(el, first + i) for i in range(9)], BAR), (0, row * 8))
    bars.save(os.path.join(OUT, 'hp_bar.png'))
    strip([tile_at(el, 65)], BAR).save(os.path.join(OUT, 'hp_left_border.png'))
    strip([tile_at(el, 12 + i) for i in range(9)], BOX).save(os.path.join(OUT, 'exp_bar.png'))
    strip([tile_at(el, 70)], BAR).save(os.path.join(OUT, 'ball_caught.png'))
    # sStatusIconColors: RGB(r, g, b) in 5 bits a channel.
    colors = {k: tuple(round(v * 255 / 31) for v in rgb) for k, rgb in
              {'psn': (24, 12, 24), 'par': (23, 23, 3), 'slp': (20, 20, 17), 'frz': (17, 22, 28), 'brn': (28, 14, 10)}.items()}
    first = {0: {'psn': 21, 'par': 24, 'slp': 27, 'frz': 30, 'brn': 33}, 1: {'psn': 71, 'par': 74, 'slp': 77, 'frz': 80, 'brn': 83}}
    for side, ids in first.items():
        for kind, n in ids.items():
            pal = list(BOX)
            pal[12 + side] = colors[kind]
            strip([tile_at(el, n + i) for i in range(3)], pal).save(os.path.join(OUT, 'status', f'{kind}_{side}.png'))
    font(BOX[1], BOX[3], os.path.join(OUT, 'font_small.png'))
    font(BOX[11], BOX[3], os.path.join(OUT, 'font_small_male.png'))
    font(BOX[10], BOX[3], os.path.join(OUT, 'font_small_female.png'))
    # The glyph widths and the characters by glyph.
    widths = [int(v) for v in re.findall(r'\d+', re.search(r'sFontSmallLatinGlyphWidths\[\]\s*=\s*\{(.*?)\};', read('src/text.c'), re.S).group(1))]
    chars = {}
    for c, code in re.findall(r"^'(.)'\s*=\s*([0-9A-F]{2})\s*$", read('charmap.txt'), re.M):
        chars.setdefault(c, int(code, 16))
    head = "// Generated by tools/idle/battle_interface.py from the pret/pokefirered decompilation. Don't edit by hand.\n\n"
    body = ('/** The small font\'s glyph widths, by glyph (src/text.c\'s sFontSmallLatinGlyphWidths: 0x100 on are the extra symbols, {LV_2} 0x105). */\n'
            'export const SMALL_WIDTHS: number[] = [' + ', '.join(map(str, widths)) + '];\n\n'
            '/** The glyph each character is (charmap.txt). */\n'
            'export const SMALL_GLYPHS: Record<string, number> = {\n' + ''.join(f"  {c!r}: 0x{code:02X},\n".replace("'\\\\'", "'\\\\\\\\'") for c, code in sorted(chars.items())) + '};\n')
    open(OUT_TS, 'w', encoding='utf8', newline='\n').write(head + body)
    print(len(widths), 'widths,', len(chars), 'characters')


main()
