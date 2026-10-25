"""Makes the Game Corner's slot machines' assets (the Extras page) from a checkout of the pret/pokeemerald decompilation, as
src/slot_machine.c draws them, for the web app's own drawing of the GBA's screen (SlotMachineScreen.tsx: its BGs from
tiles and tilemaps, its sprites in their palettes, so the game's palette effects can be played):

- the BG tiles, each pixel its colour's index in its palette (a grey of index * 17, as the browser can't read a PNG's own
  palette): the machine's (graphics/slot_machine/menu.png, BGs 1-3), the message box's (graphics/text_window/message_box.png)
  and the YES/NO window's frame (graphics/text_window/1.png, the default frame), apps/web/public/extras/slots/tiles.png,
  msgbox.png and frame.png;
- every sprite's frames, made up of their subsprites as the game puts them together (sSubspriteTables_*), each pixel its
  index too, in one sheet: apps/web/public/extras/slots/sprites.png;
- slots.json beside them: the palettes (BG and sprite, 15-bit colours as the game has them: the machine's 5, the flashing
  lights' 3, the Poké Ball's shine's 3…), the tilemaps (menu.bin, info_box.bin, reel_time_window.bin) and each sprite
  frame's place in the sheet and its corner from the sprite's position;
- the sounds and fanfares slot_machine.c plays, and Reel Time's song (MUS_ROULETTE, its loop once), rendered by
  m4a_render.py: apps/web/public/extras/slots/sounds/<song>.wav.

Usage: python tools/extras/emerald_slots.py <pokeemerald checkout>
Needs Pillow."""
import json, os, struct, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import m4a_render  # noqa: E402
from emerald_extras import colour, PUBLIC, read_pal, png_pal, tiles_of  # noqa: E402

OUT = os.path.join(PUBLIC, 'slots')


def gba(rgb):
    """An 8-bit colour as the game's 15-bit one."""
    r, g, b = rgb
    return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10)


def gba_pal(colours, n=16):
    return [gba(c) for c in colours[:n]] + [0] * max(0, n - len(colours))


def index_image(w, h):
    return Image.new('L', (w, h), 0)


def put_tile(px, tile, ox, oy, hflip=False, vflip=False):
    for y in range(8):
        row = tile[7 - y if vflip else y]
        for x in range(8):
            px[ox + x, oy + y] = (row[7 - x if hflip else x] & 15) * 17


def tile_sheet(path):
    """An image's tiles as an index image, 16 tiles a row (the tile number n at (n % 16, n // 16))."""
    tiles = tiles_of(Image.open(path))
    out = index_image(128, (len(tiles) + 15) // 16 * 8)
    px = out.load()
    for n, t in enumerate(tiles):
        put_tile(px, t, (n % 16) * 8, (n // 16) * 8)
    return out, tiles


# Each sprite's subsprites (sSubsprites_* in slot_machine.c): x, y, width, height, tile offset. A sprite without a table
# is one of its OAM size, centred on its position.
SUB = {
    'reel_time_antennae': [(-32, -12, 32, 8, 0), (0, -12, 32, 8, 4), (-32, -4, 32, 8, 8), (0, -4, 32, 8, 12), (-32, 4, 32, 8, 16), (0, 4, 32, 8, 20)],
    'reel_time_machine': [(-32, -20, 64, 32, 0), (-32, 12, 32, 8, 32), (0, 12, 32, 8, 36)],
    'broken_machine': [(-32, -24, 64, 32, 0), (-32, 8, 32, 8, 32), (0, 8, 32, 8, 36), (-32, 16, 32, 8, 40), (0, 16, 32, 8, 44)],
    'shadow': [(-32, -8, 32, 8, 0), (0, -8, 32, 8, 4), (-32, 0, 32, 8, 8), (0, 0, 32, 8, 12)],
    'number_gap': [(-8, -12, 16, 8, 0), (-8, -4, 16, 8, 0), (-8, 4, 16, 8, 0)],
    'dd_reel': [(-32, -24, 64, 32, 0), (-32, 8, 32, 8, 32), (0, 8, 32, 8, 36), (-32, 16, 32, 8, 40), (0, 16, 32, 8, 44)],
    'dd_time': [(-32, -8, 32, 8, 0), (0, -8, 32, 8, 4), (-32, 0, 32, 8, 8), (0, 0, 32, 8, 12)],
    'dd_insert': [(-32, -8, 32, 8, 0), (0, -8, 32, 8, 4), (-32, 0, 32, 8, 8), (0, 0, 32, 8, 12)],
    'dd_win': [(-32, -12, 32, 8, 0), (0, -12, 32, 8, 4), (-32, -4, 32, 8, 8), (0, -4, 32, 8, 12), (-32, 4, 32, 8, 16), (0, 4, 32, 8, 20)],
    'dd_smoke_big': [(-16, -16, 32, 32, 0)],
    'dd_smoke_small': [(-8, -8, 16, 16, 16)],
    'dd_pokeball': [(-24, -24, 32, 8, 0), (8, -24, 16, 8, 4), (-24, -16, 32, 8, 6), (8, -16, 16, 8, 10), (-24, -8, 32, 8, 12), (8, -8, 16, 8, 16),
                    (-24, 0, 32, 8, 18), (8, 0, 16, 8, 22), (-24, 8, 32, 8, 24), (8, 8, 16, 8, 28), (-24, 16, 32, 8, 30), (8, 16, 16, 8, 34)],
    'dd_dpad': [(-16, -12, 32, 16, 0), (-16, 4, 16, 8, 8), (0, 4, 16, 8, 10)],
    'dd_stop_s': [(-8, -8, 16, 8, 0), (-8, 0, 16, 8, 8)],
    'dd_stop_t': [(-8, -8, 16, 8, 2), (-8, 0, 16, 8, 10)],
    'dd_stop_o': [(-8, -8, 16, 8, 4), (-8, 0, 16, 8, 12)],
    'dd_stop_p': [(-8, -8, 16, 8, 6), (-8, 0, 16, 8, 14)],
    'dd_bonus_b': [(-8, -8, 16, 8, 0), (-8, 0, 16, 8, 8)],
    'dd_bonus_o': [(-4, -8, 8, 8, 2), (-4, 0, 8, 8, 10)],
    'dd_bonus_n': [(-8, -8, 16, 8, 3), (-8, 0, 16, 8, 11)],
    'dd_bonus_u': [(-4, -8, 8, 8, 5), (-4, 0, 8, 8, 13)],
    'dd_bonus_s': [(-8, -8, 16, 8, 6), (-8, 0, 16, 8, 14)],
    'dd_big_b': [(-12, -12, 16, 8, 0), (4, -12, 8, 8, 2), (-12, -4, 16, 8, 8), (4, -4, 8, 8, 10), (-12, 4, 16, 8, 16), (4, 4, 8, 8, 18)],
    'dd_big_i': [(-8, -12, 16, 8, 3), (-8, -4, 16, 8, 11), (-8, 4, 16, 8, 19)],
    'dd_big_g': [(-12, -12, 16, 8, 5), (4, -12, 8, 8, 7), (-12, -4, 16, 8, 13), (4, -4, 8, 8, 15), (-12, 4, 16, 8, 21), (4, 4, 8, 8, 23)],
}
SUB['dd_reg_r'] = SUB['dd_big_b']
SUB['dd_reg_e'] = SUB['dd_big_i']
SUB['dd_reg_g'] = SUB['dd_big_g']


def compose(tiles, start, layout):
    """A sprite frame from its tiles (from `start`, as the game's 1D mapping reads them): an index image and its top left
    corner from the sprite's position. `layout`: a subsprite table, or (width, height) for a sprite of one OAM size."""
    if isinstance(layout, tuple):
        w, h = layout
        layout = [(-w // 2, -h // 2, w, h, 0)]
    x0 = min(s[0] for s in layout)
    y0 = min(s[1] for s in layout)
    w = max(s[0] + s[2] for s in layout) - x0
    h = max(s[1] + s[3] for s in layout) - y0
    im = index_image(w, h)
    px = im.load()
    for sx, sy, sw, sh, offset in layout:
        for i in range((sw // 8) * (sh // 8)):
            put_tile(px, tiles[start + offset + i], sx - x0 + (i % (sw // 8)) * 8, sy - y0 + (i // (sw // 8)) * 8)
    return im, x0, y0


class Sheet:
    """The sprites' frames packed in rows, each with its place and corner."""

    def __init__(self):
        self.items = []
        self.frames = {}

    def add(self, name, im, x0, y0):
        self.frames.setdefault(name, []).append(len(self.items))
        self.items.append((im, x0, y0))

    def save(self, path, width=256):
        x = y = row = 0
        places = []
        for im, x0, y0 in self.items:
            w, h = im.size
            if x + w > width:
                x, y, row = 0, y + row, 0
            places.append((x, y, w, h, x0, y0))
            x += w
            row = max(row, h)
        out = index_image(width, y + row)
        for (im, _, _), (px, py, *_rest) in zip(self.items, places):
            out.paste(im, (px, py))
        out.save(path, optimize=True)
        return {name: [list(places[i]) for i in idx] for name, idx in self.frames.items()}


def sprites(repo):
    g = os.path.join(repo, 'graphics', 'slot_machine')
    sheet = Sheet()
    t = lambda name: tiles_of(Image.open(os.path.join(g, name)))
    plain = lambda name, size: compose(t(name), 0, size)
    for i in range(1, 8):
        sheet.add('symbol', *plain('reel_symbols/%d.png' % i, (32, 32)))
    for i in range(10):
        sheet.add('digit', *plain('numbers/%d.png' % i, (8, 16)))
    # The digital display: one sheet, each sprite's frames at their offsets in it (AllocDigitalDisplayGfx).
    dd = t('digital_display.png')
    at = lambda offset: offset // 32
    for name, offset in (('dd_reel', 0), ('dd_time', 0x600), ('dd_insert', 0x800), ('dd_win', 0xC00)):
        sheet.add(name, *compose(dd, at(offset), SUB[name]))
    for name in ('dd_stop_s', 'dd_stop_t', 'dd_stop_o', 'dd_stop_p'):
        sheet.add(name, *compose(dd, at(0xA00), SUB[name]))
    sheet.add('dd_lose', *compose(dd, at(0x1000), (64, 32)))
    for name in ('dd_bonus_b', 'dd_bonus_o', 'dd_bonus_n', 'dd_bonus_u', 'dd_bonus_s'):
        sheet.add(name, *compose(dd, at(0x1400), SUB[name]))
    for name in ('dd_big_b', 'dd_big_i', 'dd_big_g'):
        sheet.add(name, *compose(dd, at(0x1600), SUB[name]))
    for name in ('dd_reg_r', 'dd_reg_e', 'dd_reg_g'):
        sheet.add(name, *compose(dd, at(0x1900), SUB[name]))
    for offset in (0x1C00, 0x1E00):
        sheet.add('dd_a_button', *compose(dd, at(offset), (32, 32)))
    # The smoke's two subsprite tables, big and small (its frames 0 and 1: subspriteTableNum).
    sheet.add('dd_smoke', *compose(dd, at(0x2000), SUB['dd_smoke_big']))
    sheet.add('dd_smoke', *compose(dd, at(0x2000), SUB['dd_smoke_small']))
    for i in range(5):
        sheet.add('dd_number', *compose(dd, at(0x2280 + i * 0x80), (16, 16)))
    for offset in (0x2600, 10880):
        sheet.add('dd_pokeball', *compose(dd, at(offset), SUB['dd_pokeball']))
    for offset in (0x2F00, 0x3080):
        sheet.add('dd_d_pad', *compose(dd, at(offset), SUB['dd_dpad']))
    # Reel Time: reel_time_gfx.4bpp is reel_time_pikachu.png's tiles then reel_time_machine.png's.
    rt = t('reel_time_pikachu.png') + t('reel_time_machine.png')
    for i in range(5):
        sheet.add('rt_pikachu', *compose(rt, i * 64, (64, 64)))
    sheet.add('rt_antennae', *compose(rt, at(0x2800), SUB['reel_time_antennae']))
    sheet.add('rt_machine', *compose(rt, at(0x2B00), SUB['reel_time_machine']))
    sheet.add('rt_broken', *compose(rt, at(0x3000), SUB['broken_machine']))
    for i in range(6):
        sheet.add('rt_number', *plain('reel_time_numbers/%d.png' % i, (16, 16)))
    sheet.add('rt_shadow', *compose(t('shadow.png'), 0, SUB['shadow']))
    sheet.add('rt_gap', *compose(t('reel_time_number_gap.png'), 0, SUB['number_gap']))
    for i in range(2):
        sheet.add('rt_bolt', *plain('large_bolt/%d.png' % i, (16, 32)))
    sheet.add('rt_aura', *plain('pika_aura.png', (32, 64)))
    for i in range(2):
        sheet.add('rt_explosion', *plain('reel_time_explosion/%d.png' % i, (32, 32)))
    sheet.add('rt_duck', *plain('duck.png', (8, 8)))
    sheet.add('rt_smoke', *plain('smoke.png', (16, 16)))
    sheet.add('power_bolt', *plain('bolt.png', (8, 8)))
    # The reels' white background (LoadReelBackground: every pixel colour 3), 4 subsprites of 64x64 round its position.
    bg = index_image(128, 128)
    bg.paste(3 * 17, (0, 0, 128, 128))
    sheet.add('reel_bg', bg, -64, -64)
    return sheet.save(os.path.join(OUT, 'sprites.png'))


def palettes(repo):
    g = os.path.join(repo, 'graphics')
    s = os.path.join(g, 'slot_machine')
    pal = lambda path: gba_pal(png_pal(Image.open(os.path.join(s, path))))
    menu = png_pal(Image.open(os.path.join(s, 'menu.png')))
    bg = {str(i): gba_pal(menu[i * 16:]) for i in range(5)}
    # sUnkPalette (the info box's text, palette 13): 1 white, 3 a dark grey.
    bg['13'] = [0, 0x7FFF, 0, 8 | 8 << 5 | 8 << 10] + [0] * 12
    bg['14'] = gba_pal(png_pal(Image.open(os.path.join(g, 'text_window', '1.png'))))
    bg['15'] = gba_pal(png_pal(Image.open(os.path.join(g, 'text_window', 'message_box.png'))))
    return {
        'bg': bg,
        'lights': [gba_pal(read_pal(os.path.join(s, 'flashing_lights_%s.pal' % n))) for n in ('inside', 'middle', 'outside')],
        'obj': {
            'reel': pal('reel_symbols/1.png'),
            'pikachu': pal('reel_time_pikachu.png'),
            'rtMisc': pal('shadow.png'),
            'machine': pal('reel_time_machine.png'),
            'misc': pal('smoke.png'),
            'explosion': pal('reel_time_explosion/0.png'),
            'display': pal('digital_display.png'),
        },
        'shining': [gba_pal(read_pal(os.path.join(s, 'pokeball_shining_%d.pal' % i))) for i in range(3)],
    }


def tilemaps(repo):
    s = os.path.join(repo, 'graphics', 'slot_machine')
    read = lambda name: list(struct.unpack('<%dH' % (os.path.getsize(os.path.join(s, name)) // 2), open(os.path.join(s, name), 'rb').read()))
    return {'menu': read('menu.bin'), 'info': read('info_box.bin'), 'reelTimeWindow': read('reel_time_window.bin')}


# The sounds slot_machine.c plays (PlaySE, PlayFanfare, PlayNewMapMusic), and the YES/NO menu's (SE_SELECT).
SOUNDS = ['se_shop', 'se_contest_place', 'se_pin', 'se_m_explosion', 'se_select', 'mus_slots_win', 'mus_slots_jackpot', 'mus_too_bad', 'mus_roulette']

def sounds(repo):
    out = os.path.join(OUT, 'sounds')
    for song in SOUNDS:
        m4a_render.write_wav(os.path.join(out, song + '.wav'), m4a_render.render(repo, song, loop=song == 'mus_roulette'), 0.8)


def picture(repo):
    """The Game Corner's tiles' picture (the Extras page's): the red 7 reel symbol in its own colours, 32x32."""
    im = Image.open(os.path.join(repo, 'graphics', 'slot_machine', 'reel_symbols', '1.png'))
    colour(im, png_pal(im)).save(os.path.join(OUT, 'seven.png'), optimize=True)


def main():
    repo = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    g = os.path.join(repo, 'graphics')
    tiles, menu_tiles = tile_sheet(os.path.join(g, 'slot_machine', 'menu.png'))
    assert not any(any(row) for row in menu_tiles[0]), 'tile 0 must be blank (the empty BG entries)'
    tiles.save(os.path.join(OUT, 'tiles.png'), optimize=True)
    tile_sheet(os.path.join(g, 'text_window', 'message_box.png'))[0].save(os.path.join(OUT, 'msgbox.png'), optimize=True)
    tile_sheet(os.path.join(g, 'text_window', '1.png'))[0].save(os.path.join(OUT, 'frame.png'), optimize=True)
    data = {'palettes': palettes(repo), 'tilemaps': tilemaps(repo), 'frames': sprites(repo)}
    with open(os.path.join(OUT, 'slots.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, separators=(',', ':'))
    picture(repo)
    sounds(repo)
    print('frames', sum(len(v) for v in data['frames'].values()), 'sounds', len(SOUNDS))


if __name__ == '__main__':
    main()
