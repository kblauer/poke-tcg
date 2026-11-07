"""Makes the Idle Adventure's Johto battle screen pictures (README: Idle Adventure, battles; issue #170, step 5) from a
checkout of the pret/pokeheartgold decompilation, as HeartGold draws its top screen, with nitro.py (the DS graphics
decoder in tools/extras): apps/web/public/idle/gen2/battle/

  bg/<background>_<time>.png, bg/<background>.png
                      the battle backgrounds (a/0/0/7: characters 3 + BattleBg, the shared 512x256 screen 2, palette
                      176 + 3 BattleBg + time; ov12_022387AC draws them on BG3, 8bpp), the whole 512x256 screen: the
                      top screen shows x 0-255 (BG3 scrolled from -132 to 0 while the player's trainer slides in,
                      Task_SetTrainerEncounter), y 0-191 under the message box. <background> is BattleBg's name
                      (MapHeader_GetBattleBg: general, ocean, city, forest, mountain, snow, building_1-3, cave_1-3,
                      will, koga, bruno, karen, lance); the first six have a palette per time (ov12_0223B52C:
                      RTC_TIMEOFDAY_MORN and _DAY day, _EVE evening, _NITE and _LATE night): <background>_day,
                      _evening, _night; the others one
  platform/<terrain>_<side>_<time>.png, platform/<terrain>_<side>.png
                      the two platforms (a/0/0/8: ov12_02265E28's ov12_0226E0D0 (player) and ov12_0226E0A0 (enemy)
                      characters by Terrain, cells 128/131, palettes ov12_0226E168[3 Terrain + time]), each cell's OAMs
                      drawn at their place: the player's 256x32 (its centre 128,16), the enemy's 128x64 (64,32).
                      <terrain> is Terrain's name (plain, sand, grass, puddle, mountain, cave, snow, water, ice,
                      building, will, koga, bruno, karen, lance); <side> player or enemy; the time palette is picked by
                      the background (ov12_0223B52C), so plain to building have _day, _evening and _night, the Elite
                      Four's one
  healthbox_player.png, healthbox_enemy.png
                      the single battle healthboxes (a/0/0/8 191 and 188, cells 190 and 187, palette 71), 128x64 each,
                      their sprite's centre at 64,32 (player) and 64,28 (enemy), as the game shows them before a name,
                      level or HP is printed into them
  hp_bar.png          the HP bar's cells (battle_hp_bar_data.h's gBattleHpBar_RawGraphicComponents 2, 11 and 20, as
                      ov12_02265878 picks them): a row each for green, yellow and red, 9 tiles of 0 to 8 pixels filled
  exp_bar.png         the EXP bar's cells (components 29-37), 0 to 8 pixels filled
  status.png          the status icons (components 38-55, 3 tiles each): a row each for none (the healthbox's own
                      background), PAR, FRZ, SLP, PSN, BRN
  ball_caught.png     the enemy's caught-before Poké Ball (component 59)
  party_balls.png     the trainer's party gauge's balls (a/0/0/8 340-342, palette 110: pokeplatinum's party_gauge.c,
                      PARTY_GAUGE_NCGR_BIN and the rest, at the same members in HeartGold), 16x16 each side by side:
                      a Pokémon able to battle (cell 0, its spin's first frame), one with a status (the same ball, its
                      red and white turned yellow: the user's, 2026-11-06, in place of the game's pink cell 8), fainted (cell
                      16) and an empty slot (cell 24)
  lv_<gender>.png     the "Lv" with its gender symbol (components 60-65 top halves, 72-77 bottom halves), 16x16:
                      lv_female, lv_male, lv_none
  digits.png          the healthbox's level and HP digits (graphic/font.narc 5, MessagePrinter_New(14, 2, 15) in
                      ov12_02237F18: colour 1 to 14, 2 to 2, 0 to 15 of palette 71), 8x8 tiles 0-9
  font_message.png, font_healthbox.png
                      the system font (graphic/font.narc 0, FONT_SYSTEM; FONT_MESSAGE is the same file), 16x16 glyph
                      cells 32 a row, glyph n in cell n - 1 (TryLoadGlyph), in the message box's colours (graphic/font
                      8's 1 on shadow 2) and the healthbox name's (MAKE_TEXT_COLOR(14, 2, 15) in palette 71); the
                      glyphs' background colour (2bpp value 3) is left clear, as the windows are filled with it first
  shadow.png          the enemy Pokémon's shadow (poketool/pokegra/otherpoke/shadow.png, NARC_otherpoke_259/260 in
                      PokepicManager_Create): 64x48, the small, medium and large shadows a 64x16 row each
                      (sPokepicShadowUVParams)
  balls/<item>.png    each ball's battle sprite (a/0/0/8: ov07_022375BC's characters, palette, cells and animations, by
                      ov07_0223251C's index, BALL_* - 1): its ten cells as 32x32 frames side by side, each cell's
                      origin at the frame's centre (16,16): 0-7 the spin (sequence 0: 2, 2, 6, 2, 2, 2, 6, 2 frames,
                      looped), 8 squashed, 9 open (sequence 1: 0 for 10, 8 for 10, 9 for 50 frames)
  textbox/frame_<n>.png
                      the message box (ov12_022387AC: window 2,19 27x4 tiles on BG1, sub_0200EB80 and
                      DrawFrameAndWindow2's tiles from a/0/3/8 member 2 + frame in palette 26 + frame, colour 0 turned
                      to 10), 256x48 (the screen's rows 144-191), its inside filled with graphic/font 8's colour 15, for
                      each of the 20 option frames (frame_0 the default)

The ball-opening sparkles and the capture stars are 3D particles (SPL, ov07_02236690 and the ball capsule effect), not 2D
pictures, so they aren't made here.

Usage: python tools/idle/hgss_battle.py <pokeheartgold checkout>. Needs Pillow."""
import os
import re
import struct
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'extras'))
import nitro  # noqa: E402

SRC = os.path.abspath(sys.argv[1])
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen2', 'battle')

BACKGROUNDS = ['general', 'ocean', 'city', 'forest', 'mountain', 'snow', 'building_1', 'building_2', 'building_3', 'cave_1', 'cave_2', 'cave_3', 'will', 'koga', 'bruno', 'karen', 'lance']
TIMES = ['day', 'evening', 'night']
# Terrain (constants/battle.h), with great_marsh and unknown (unused) left out.
TERRAINS = ['plain', 'sand', 'grass', 'puddle', 'mountain', 'cave', 'snow', 'water', 'ice', 'building', 'great_marsh', 'unknown', 'will', 'koga', 'bruno', 'karen', 'lance']
SKIP_TERRAINS = {'great_marsh', 'unknown'}
# ov12_0226E0D0 (player) and ov12_0226E0A0 (enemy): each terrain's platform characters; ov12_0226E168: its palettes by time.
PLATFORM_CHARS = {'player': [0x87, 0x91, 0x7F, 0x97, 0x8B, 0x95, 0x8D, 0x85, 0x89, 0x8F, 0x93, 0x97, 0x99, 0x9B, 0x9D, 0x9F, 0xA1],
                  'enemy': [0x88, 0x92, 0x82, 0x98, 0x8C, 0x96, 0x8E, 0x86, 0x8A, 0x90, 0x94, 0x94, 0x9A, 0x9C, 0x9E, 0xA0, 0xA2]}
PLATFORM_CELLS = {'player': 0x80, 'enemy': 0x83}
PLATFORM_PALETTES = [7, 8, 9, 22, 23, 24, 1, 2, 3, 31, 32, 33, 13, 14, 15, 28, 29, 30, 16, 17, 18, 4, 5, 6, 10, 11, 12, 19, 20, 21, 25, 26, 27, 25, 26, 27, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]
# ov07_022375BC's order (BALL_* - 1), as the items' names.
BALLS = ['master-ball', 'ultra-ball', 'great-ball', 'poke-ball', 'safari-ball', 'net-ball', 'dive-ball', 'nest-ball', 'repeat-ball', 'timer-ball', 'luxury-ball', 'premier-ball', 'dusk-ball', 'heal-ball',
         'quick-ball', 'cherish-ball', 'fast-ball', 'level-ball', 'lure-ball', 'heavy-ball', 'love-ball', 'friend-ball', 'moon-ball', 'sport-ball', 'park-ball']


def narc(path):
    """A NARC's members as stored (nitro's readers unpack LZ themselves; the font files would pass for LZ data)."""
    return nitro.narc(open(os.path.join(SRC, path), 'rb').read())


def save(im, *path):
    out = os.path.join(OUT, *path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out)


def tile_strip(tiles, pal, clear0=True):
    """8x8 tiles (64 colour indexes each) side by side."""
    im = Image.new('RGBA', (8 * len(tiles), 8))
    for i, t in enumerate(tiles):
        nitro.draw_tile(im, t, i * 8, 0, pal, clear0=clear0)
    return im


def raw_tiles(data):
    """4bpp tile data (32 bytes a tile) as colour indexes."""
    return [[v for b in data[o:o + 32] for v in (b & 15, b >> 4)] for o in range(0, len(data), 32)]


def font_glyphs(d):
    """A font file's (graphic/font.narc, font_data.c's FontHeader) glyph widths and 16x16 glyphs, 2bpp: each byte four
    pixels, its top bits first, the bytes of each 16-bit half-row the high one first (DecompressGlyphTile)."""
    head, wstart, n, _, _, gw, gh = struct.unpack_from('<IIIBBBB', d, 0)
    size = 16 * gw * gh
    widths = list(d[wstart:wstart + n])
    glyphs = []
    for g in range(n):
        o = head + g * size
        px = [[0] * (8 * gw) for _ in range(8 * gh)]
        for t in range(gw * gh):
            tx, ty = (t % gw) * 8, (t // gw) * 8
            for row in range(8):
                for half, b in enumerate((d[o + t * 16 + row * 2 + 1], d[o + t * 16 + row * 2])):
                    for p in range(4):
                        px[ty + row][tx + half * 4 + p] = b >> (6 - 2 * p) & 3
        glyphs.append(px)
    return widths, glyphs


def font_sheet(glyphs, fg, shadow):
    im = Image.new('RGBA', (32 * 16, (len(glyphs) + 31) // 32 * 16))
    px = im.load()
    for i, g in enumerate(glyphs):
        for y in range(16):
            for x in range(16):
                if g[y][x] in (1, 2):
                    px[(i % 32) * 16 + x, (i // 32) * 16 + y] = fg if g[y][x] == 1 else shadow
    return im


def main():
    bg = narc('files/a/0/0/7')
    obj = narc('files/a/0/0/8')
    font = narc('files/graphic/font.narc')
    winframe = narc('files/a/0/3/8')

    # The backgrounds, on the shared screen.
    screen = nitro.nscr(bg[2])
    for i, name in enumerate(BACKGROUNDS):
        tiles = nitro.ncgr(bg[3 + i])
        for t, time in enumerate(TIMES if i < 6 else [None]):
            im = nitro.draw_screen(screen, tiles, nitro.nclr(bg[176 + 3 * i + t]), clear0=False)
            save(im, 'bg', f'{name}_{time}.png' if time else f'{name}.png')

    # The platforms: each cell drawn whole, its centre where the sprite's position is.
    for side in ('player', 'enemy'):
        cells = nitro.ncer(obj[PLATFORM_CELLS[side]])
        for i, terrain in enumerate(TERRAINS):
            if terrain in SKIP_TERRAINS:
                continue
            tiles = nitro.ncgr(obj[PLATFORM_CHARS[side][i]])
            for t, time in enumerate(TIMES if i <= 10 else [None]):
                im, _ = nitro.draw_cell(cells, 0, tiles, nitro.nclr(obj[PLATFORM_PALETTES[3 * i + t]]))
                save(im, 'platform', f'{terrain}_{side}_{time}.png' if time else f'{terrain}_{side}.png')

    # The healthboxes and their parts.
    box = nitro.nclr(obj[71])
    for name, char, cell in (('player', 191, 190), ('enemy', 188, 187)):
        im, origin = nitro.draw_cell(nitro.ncer(obj[cell]), 0, nitro.ncgr(obj[char]), box)
        print('healthbox', name, im.size, 'centre', origin)
        save(im, f'healthbox_{name}.png')
    text = open(os.path.join(SRC, 'src', 'battle', 'battle_hp_bar_data.h'), encoding='utf8').read()
    body = re.sub(r'//.*', '', text[text.index('{') + 1:text.rindex('}')])
    parts = raw_tiles(bytes(int(v, 16) for v in re.findall(r'0x([0-9A-Fa-f]{2})\b', body)))
    assert len(parts) == 78, len(parts)
    bars = Image.new('RGBA', (72, 24))
    for row, first in enumerate((2, 11, 20)):
        bars.paste(tile_strip(parts[first:first + 9], box, False), (0, row * 8))
    save(bars, 'hp_bar.png')
    save(tile_strip(parts[29:38], box, False), 'exp_bar.png')
    status = Image.new('RGBA', (24, 48))
    for row in range(6):
        status.paste(tile_strip(parts[38 + 3 * row:41 + 3 * row], box, False), (0, row * 8))
    save(status, 'status.png')
    save(tile_strip([parts[59]], box, False), 'ball_caught.png')
    # The party gauge's balls (PokeballsAnimationFrame's: PGANM_POKEBALL_*_THEIRS), the statused one yellow (the user's).
    gauge, gauge_tiles, gauge_pal = nitro.ncer(obj[341]), nitro.ncgr(obj[340]), nitro.nclr(obj[110])
    yellow = list(gauge_pal)
    yellow[11], yellow[12], yellow[2], yellow[3] = (232, 200, 24, 255), (192, 144, 0, 255), (240, 216, 96, 255), (255, 240, 152, 255)
    balls = Image.new('RGBA', (64, 16))
    for k, (cell, pal) in enumerate(((0, gauge_pal), (0, yellow), (16, gauge_pal), (24, gauge_pal))):
        im, _ = nitro.draw_cell(gauge, cell, gauge_tiles, pal)
        balls.paste(im, (k * 16, 0), im)
    save(balls, 'party_balls.png')
    for k, gender in enumerate(('female', 'male', 'none')):
        lv = Image.new('RGBA', (16, 16))
        lv.paste(tile_strip(parts[60 + 2 * k:62 + 2 * k], box, False), (0, 0))
        lv.paste(tile_strip(parts[72 + 2 * k:74 + 2 * k], box, False), (0, 8))
        save(lv, f'lv_{gender}.png')
    # MessagePrinter_New's remap is by byte: 0x00 to bg/bg, 0x01 to bg/fg... (only bytes of 0, 1 and 2 nibbles).
    remap = {0: 15, 1: 14, 2: 2}
    digits = nitro.ncgr(font[5])
    save(tile_strip([[remap.get(v, v) for v in t] for t in digits.tiles[:10]], box, False), 'digits.png')

    # The font.
    widths, glyphs = font_glyphs(font[0])
    msg = nitro.pal16(nitro.nclr(font[8]), 0)
    save(font_sheet(glyphs, msg[1], msg[2]), 'font_message.png')
    save(font_sheet(glyphs, box[14], box[2]), 'font_healthbox.png')
    print(len(glyphs), 'glyphs; widths 0x120-0x12A (digits):', widths[0x120:0x12A])

    # The shadow: shadow.png's first 64x48 (its palette, colour 0 clear).
    sh = Image.open(os.path.join(SRC, 'files', 'poketool', 'pokegra', 'otherpoke', 'shadow.png'))
    flat = sh.getpalette()
    sp = sh.load()
    shadow = Image.new('RGBA', (64, 48))
    for y in range(48):
        for x in range(64):
            c = sp[x, y]
            if c:
                shadow.putpixel((x, y), tuple(flat[3 * c:3 * c + 3]) + (255,))
    save(shadow, 'shadow.png')

    # The balls: char 261 + 3k, palette 83 + k, cell 260 + 3k (ov07_022375BC).
    for k, item in enumerate(BALLS):
        tiles, cells, pal = nitro.ncgr(obj[261 + 3 * k]), nitro.ncer(obj[260 + 3 * k]), nitro.nclr(obj[83 + k])
        sheet = Image.new('RGBA', (32 * len(cells.cells), 32))
        for i in range(len(cells.cells)):
            im, (ox, oy) = nitro.draw_cell(cells, i, tiles, pal)
            sheet.paste(im, (32 * i + 16 - ox, 16 - oy), im)
        save(sheet, 'balls', item + '.png')

    # The message box: DrawFrameAndWindow2's 18 tiles round the window (2 left, 3 right, 1 above and below).
    inside = nitro.pal16(nitro.nclr(font[8]), 0)[15]
    X, Y, W, H = 2, 1, 27, 4
    places = [(0, X - 2, Y - 1, 1, 1), (1, X - 1, Y - 1, 1, 1), (2, X, Y - 1, W, 1), (3, X + W, Y - 1, 1, 1), (4, X + W + 1, Y - 1, 1, 1), (5, X + W + 2, Y - 1, 1, 1),
              (6, X - 2, Y, 1, H), (7, X - 1, Y, 1, H), (9, X + W, Y, 1, H), (10, X + W + 1, Y, 1, H), (11, X + W + 2, Y, 1, H),
              (12, X - 2, Y + H, 1, 1), (13, X - 1, Y + H, 1, 1), (14, X, Y + H, W, 1), (15, X + W, Y + H, 1, 1), (16, X + W + 1, Y + H, 1, 1), (17, X + W + 2, Y + H, 1, 1)]
    for frame in range(20):
        tiles = [[10 if v == 0 else v for v in t] for t in nitro.ncgr(winframe[2 + frame]).tiles[:18]]
        pal = nitro.pal16(nitro.nclr(winframe[26 + frame]), 0)
        im = Image.new('RGBA', (256, 48), inside)
        for n, x, y, w, h in places:
            for yy in range(h):
                for xx in range(w):
                    nitro.draw_tile(im, tiles[n], (x + xx) * 8, (y + yy) * 8, pal, clear0=False)
        save(im, 'textbox', f'frame_{frame}.png')
    print('message text', msg[1][:3], 'shadow', msg[2][:3], 'on', inside[:3])


main()
