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
  party_balls.png     the party summary's balls (CreatePartyStatusSummarySprites: elements 66-69, healthbar.pal), 8x8
                      each side by side: a Pokémon able to battle (66), one with a status (the same ball, its top and
                      bottom turned to the palette's yellows: the user's, 2026-11-06, in place of the game's dark 68),
                      fainted (69) and an empty slot (67)
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

With --game emerald, from a checkout of pret/pokeemerald, Emerald's (Hoenn's, issue #226, step 5) into
apps/web/public/idle/gen3/battle/ by the same names and layout, as Emerald draws them (its battle_interface.c places
and clears them as FireRed's does, but for the HP numbers' window: HpTextIntoHealthboxObject copies only its bottom
tiles, so only those are cleared): the healthboxes (healthbox_singles_*.png, laid out as the two sprites already:
-mwidth 8), its elements (gHealthboxElementsGfxTable: hpbar, expbar, status, misc, hpbar_anim, misc_frameend,
ball_display, ball_caught_indicator, status2-4 one after another, so the same element numbers as FireRed's), in the
healthbox's palette (ball_status_bar.png's, TAG_HEALTHBOX_PAL) and the bar's (ball_display.png's, TAG_HEALTHBAR_PAL);
the small font (its latin_small.png's 16x16 cells, 16 a row, every glyph at most 8 wide, so put in FireRed's 8x16 cells)
and its widths (src/fonts.c's gFontSmallLatinGlyphWidths) -> apps/web/src/components/idle/fontSmallRse.ts; the balls
(graphics/balls/), the particles; and:
  textbox.png         the battle's text box (textbox.png by textbox_map.bin in textbox_0/1.pal, gBattleTextboxTilemap):
                      the bottom 48 rows of the screen, colour 0 see-through
  brendan_back.png, may_back.png (the whole sheet: four 64x64 frames, the throw's; emerald_data.py cuts only the
                      first) as <who>_back_sheet.png in public/idle/gen3/trainers/, in the trainers' palettes
                      (gTrainerBackPicPaletteTable: gTrainerPalette_Brendan, _May)

Usage: python tools/idle/battle_interface.py <pokefirered checkout>, or <pokeemerald checkout> --game emerald.
Needs Pillow."""
import os
import re
import struct
import sys

from PIL import Image

SRC = os.path.abspath(sys.argv[1])
EMERALD = '--game' in sys.argv and sys.argv[sys.argv.index('--game') + 1] == 'emerald'
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen3' if EMERALD else 'gen1', 'battle')
OUT_TS = os.path.join(ROOT, 'apps', 'web', 'src', 'components', 'idle', 'fontSmallRse.ts' if EMERALD else 'fontSmall.ts')
G = os.path.join(SRC, 'graphics', 'battle_interface')


def read(path):
    return open(os.path.join(SRC, path), encoding='utf8').read()


def jasc(path):
    lines = read(path).split('\n')
    return [tuple(int(v) for v in l.split()) for l in lines[3:3 + int(lines[2])]]


def own(path):
    flat = Image.open(os.path.join(SRC, path)).getpalette()
    return [tuple(flat[i * 3:i * 3 + 3]) for i in range(16)]


if EMERALD:
    BOX = own('graphics/battle_interface/ball_status_bar.png')
    BAR = own('graphics/battle_interface/ball_display.png')
else:
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


def font(fg, shadow, path, im=None):
    im = Image.open(os.path.join(SRC, 'graphics', 'fonts', 'latin_small.png')) if im is None else im
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


def emerald_elements():
    """Emerald's healthbox elements as one sheet of tiles in a row (gHealthboxElementsGfxTable's files in order)."""
    names = ['hpbar', 'expbar', 'status', 'misc', 'hpbar_anim', 'misc_frameend', 'ball_display', 'ball_caught_indicator',
             'status2', 'status3', 'status4', 'healthbox_doubles_frameend', 'healthbox_doubles_frameend_bar']
    tiles = []
    for n in names:
        im = Image.open(os.path.join(G, n + '.png'))
        tiles += [tile_at(im, i) for i in range((im.width // 8) * (im.height // 8))]
    sheet = Image.new('P', (8 * len(tiles), 8))
    sp = sheet.load()
    for i, t in enumerate(tiles):
        for y in range(8):
            for x in range(8):
                sp[i * 8 + x, y] = t[y][x]
    return sheet


def emerald_font():
    """Emerald's small font in FireRed's layout: each glyph's 16x16 cell (16 a row) cut to its left 8 columns, 32 a row."""
    im = Image.open(os.path.join(SRC, 'graphics', 'fonts', 'latin_small.png'))
    count = (im.width // 16) * (im.height // 16)
    out = Image.new('P', (256, (count // 32) * 16))
    out.putpalette(im.getpalette())
    for g in range(count):
        out.paste(im.crop(((g % 16) * 16, (g // 16) * 16, (g % 16) * 16 + 8, (g // 16) * 16 + 16)), ((g % 32) * 8, (g // 32) * 16))
    return out


def emerald_textbox(out):
    """The battle text box: gBattleTextboxTilemap's rows 14-19 (the screen's bottom 48), each entry's tile, flips and palette."""
    im = Image.open(os.path.join(G, 'textbox.png'))
    pals = jasc('graphics/battle_interface/textbox_0.pal') + jasc('graphics/battle_interface/textbox_1.pal')
    data = open(os.path.join(G, 'textbox_map.bin'), 'rb').read()
    res = Image.new('RGBA', (240, 48))
    rp = res.load()
    tw = im.width // 8
    for row in range(14, 20):
        for col in range(30):
            e = struct.unpack_from('<H', data, (row * 32 + col) * 2)[0]
            t, hf, vf, pn = e & 0x3FF, e >> 10 & 1, e >> 11 & 1, e >> 12
            tile = tile_at(im, t) if t < tw * (im.height // 8) else [[0] * 8] * 8
            for y in range(8):
                for x in range(8):
                    c = tile[7 - y if vf else y][7 - x if hf else x]
                    if c:
                        rp[col * 8 + x, (row - 14) * 8 + y] = pals[pn * 16 + c] + (255,)
    res.save(out)


def main_emerald():
    tr = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen3', 'trainers')
    os.makedirs(os.path.join(OUT, 'status'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'balls'), exist_ok=True)
    for item, f in (('poke-ball', 'poke'), ('great-ball', 'great'), ('ultra-ball', 'ultra'), ('master-ball', 'master'), ('safari-ball', 'safari')):
        path = f'graphics/balls/{f}.png'
        indexed(path, own(path), os.path.join(OUT, 'balls', item + '.png'), ('graphics/balls/open.png', (0, 32)))
    indexed('graphics/battle_anims/sprites/particles.png', own('graphics/battle_anims/sprites/circle_impact.png'), os.path.join(OUT, 'particles.png'))
    for who in ('brendan', 'may'):
        indexed(f'graphics/trainers/back_pics/{who}.png', jasc(f'graphics/trainers/palettes/{who}.pal'), os.path.join(tr, who + '_back_sheet.png'))
    emerald_textbox(os.path.join(OUT, 'textbox.png'))
    # The healthboxes: their pictures the two sprites side by side already; the windows as FireRed's (the same offsets in
    # UpdateNickInHealthbox, UpdateLvlInHealthbox), but the HP numbers' bottom tiles only (HpTextIntoHealthboxObject).
    def box(name, h, windows):
        im = Image.open(os.path.join(G, name))
        out = Image.new('RGBA', (128, h * 8))
        for t in range(16 * h):
            put(out, tile_at(im, t), (t % 16) * 8, (t // 16) * 8, BOX)
        op = out.load()
        for x0, x1, y0, y1 in windows:
            for y in range(y0, y1):
                for x in range(x0, x1):
                    op[x, y] = BOX[2] + (255,)
        return out
    box('healthbox_singles_player.png', 8, [(16, 72, 5, 16), (72, 96, 5, 16), (56, 96, 24, 32)]).save(os.path.join(OUT, 'healthbox_player.png'))
    box('healthbox_singles_opponent.png', 4, [(8, 64, 5, 16), (64, 88, 5, 16)]).save(os.path.join(OUT, 'healthbox_opponent.png'))
    el = emerald_elements()
    strip([tile_at(el, 1), tile_at(el, 2)], BAR).save(os.path.join(OUT, 'hp_text.png'))
    bars = Image.new('RGBA', (72, 24))
    for row, first in enumerate((3, 47, 56)):
        bars.paste(strip([tile_at(el, first + i) for i in range(9)], BAR), (0, row * 8))
    bars.save(os.path.join(OUT, 'hp_bar.png'))
    strip([tile_at(el, 65)], BAR).save(os.path.join(OUT, 'hp_left_border.png'))
    strip([tile_at(el, 12 + i) for i in range(9)], BOX).save(os.path.join(OUT, 'exp_bar.png'))
    strip([tile_at(el, 70)], BAR).save(os.path.join(OUT, 'ball_caught.png'))
    # The status ball yellowed as FireRed's (the user's, 2026-11-06): its red top to the palette's dark yellow (13), its
    # white and grey to its yellow (12; Emerald's 7, FireRed's light yellow, is a peach).
    yellowed = [[{8: 13, 9: 13, 2: 12, 3: 12}.get(c, c) for c in row] for row in tile_at(el, 66)]
    strip([tile_at(el, 66), yellowed, tile_at(el, 69), tile_at(el, 67)], BAR).save(os.path.join(OUT, 'party_balls.png'))
    colors = {k: tuple(round(v * 255 / 31) for v in rgb) for k, rgb in
              {'psn': (24, 12, 24), 'par': (23, 23, 3), 'slp': (20, 20, 17), 'frz': (17, 22, 28), 'brn': (28, 14, 10)}.items()}
    first = {0: {'psn': 21, 'par': 24, 'slp': 27, 'frz': 30, 'brn': 33}, 1: {'psn': 71, 'par': 74, 'slp': 77, 'frz': 80, 'brn': 83}}
    for side, ids in first.items():
        for kind, n in ids.items():
            pal = list(BOX)
            pal[12 + side] = colors[kind]
            strip([tile_at(el, n + i) for i in range(3)], pal).save(os.path.join(OUT, 'status', f'{kind}_{side}.png'))
    packed = emerald_font()
    for name, fg in (('font_small', BOX[1]), ('font_small_male', BOX[11]), ('font_small_female', BOX[10])):
        font(fg, BOX[3], os.path.join(OUT, name + '.png'), packed)
    # The glyph widths (its characters by glyph are FireRed's: the two charmap.txt files agree).
    widths = [int(v) for v in re.findall(r'\d+', re.search(r'gFontSmallLatinGlyphWidths\[\]\s*=\s*\{(.*?)\};', read('src/fonts.c'), re.S).group(1))]
    head = "// Generated by tools/idle/battle_interface.py --game emerald from the pret/pokeemerald decompilation. Don't edit by hand.\n\n"
    body = ('/** Emerald\'s small font\'s glyph widths, by glyph (src/fonts.c\'s gFontSmallLatinGlyphWidths: 0x100 on are the extra symbols, {LV_2} 0x105); its glyphs are fontSmall.ts\'s SMALL_GLYPHS. */\n'
            'export const SMALL_WIDTHS_RSE: number[] = [' + ', '.join(map(str, widths)) + '];\n')
    open(OUT_TS, 'w', encoding='utf8', newline='\n').write(head + body)
    print(len(widths), 'widths')


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
    yellowed = [[{8: 13, 9: 13, 2: 12, 3: 7}.get(c, c) for c in row] for row in tile_at(el, 66)]
    strip([tile_at(el, 66), yellowed, tile_at(el, 69), tile_at(el, 67)], BAR).save(os.path.join(OUT, 'party_balls.png'))
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


main_emerald() if EMERALD else main()
