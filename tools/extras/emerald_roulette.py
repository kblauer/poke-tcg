"""Makes the Game Corner roulette's assets (the Extras page's RouletteScreen) from a checkout of the pret/pokeemerald
decompilation, as src/roulette.c loads them:

- the wheel (BG 2, an affine 8bpp BG: graphics/roulette/wheel.png's tiles laid out by wheel.bin, 256x256), as a map of
  palette indexes (a greyscale PNG, each pixel its colour's index, 0 see-through): apps/web/public/extras/roulette/wheel-map.png;
- every 4bpp tile the screen draws, one after another in a greyscale PNG 32 tiles wide (each pixel its colour's index in
  its palette, 0-15): the grid's and the selection's (window.png, gRouletteMenu_Gfx, the tiles of BG 1 and BG 0), then the
  sprite sheets as the game loads them (1D mapping: a sprite's tiles in order, left to right then top to bottom), the wheel
  icons (wynaut, azurill, skitty, makuhita) and Shroomish and Taillow (roulette_tilt) each put together as the Makefile does:
  apps/web/public/extras/roulette/tiles.png;
- roulette.json: the palettes (BG palettes 0-13, sWheel_Pal, and the 12 sprite palettes in the slots LoadSpritePalettes gives
  them, in BGR555 as the GBA keeps them), the grid's tilemap (grid.bin: the board, then the highlights and the selection
  boxes the game copies from it) and where each sheet starts in tiles.png;
- the hub's picture of the wheel (the left table's, its centre and Pokémon on it): apps/web/public/extras/roulette/wheel.png;
- the sounds roulette.c plays (its PlaySE and m4aSongNumStart calls, and its 2 fanfares), rendered by m4a_render.py, and the
  cries of Shroomish and Taillow (PlayCry_Normal: their samples as they are): apps/web/public/extras/roulette/sounds/<song>.wav.

Usage: python tools/extras/emerald_roulette.py <pokeemerald checkout>
Needs Pillow."""
import json, math, os, struct, sys, wave
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import m4a_render  # noqa: E402
from emerald_extras import PUBLIC, png_pal, tiles_of  # noqa: E402

OUT = os.path.join(PUBLIC, 'roulette')

# The sprite sheets (roulette.c's sSpriteSheet_*, gRoulette*_Gfx), each its PNGs in the order they're put together.
SHEETS = {
    'ball': ['ball'],
    'ballCounter': ['ball_counter'],
    'center': ['center'],
    'credit': ['credit'],
    'cursor': ['cursor'],
    'gridIcons': ['grid_icons'],
    'headers': ['headers'],
    'multiplier': ['multiplier'],
    'numbers': ['numbers'],
    'shadow': ['shadow'],
    'tilt': ['shroomish', 'tailow'],
    'wheelIcons': ['wynaut', 'azurill', 'skitty', 'makuhita'],
}
# The sprite palettes (sSpritePalettes), in the slots they're loaded into: shadow, ball, ball counter, cursor, the
# interface (credit), Shroomish, Taillow, the grid icons, then the 4 Pokémon on the wheel.
SPRITE_PALETTES = ['shadow', 'ball', 'ball_counter', 'cursor', 'credit', 'shroomish', 'tailow', 'grid_icons', 'wynaut', 'azurill', 'skitty', 'makuhita']

# The sounds roulette.c plays, and its fanfares (PlayFanfare).
SOUNDS = ['se_shop', 'se_boo', 'se_roulette_ball', 'se_roulette_ball2', 'se_ball_throw', 'se_ball_bounce_1', 'se_pin', 'se_failure', 'se_select', 'se_m_strength', 'se_fall', 'se_taillow_wing_flap', 'se_bridge_walk', 'mus_slots_win', 'mus_slots_jackpot']
LOOPED = ['se_taillow_wing_flap']
CRIES = ['taillow', 'shroomish']
# The wheel's rim, from its centre (BG 2's 116,84), in pixels.
WHEEL_RADIUS = 76


def bgr555(rgb):
    r, g, b = rgb
    return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10)


def gray(values, w, h, scale=1):
    im = Image.new('L', (w, h))
    im.putdata([v * scale for v in values])
    return im


def wheel_map(src):
    """BG 2: each 8x8 tile of wheel.png (8bpp) where wheel.bin puts it, 32x32 tiles."""
    tiles = tiles_of(Image.open(os.path.join(src, 'wheel.png')))
    entries = open(os.path.join(src, 'wheel.bin'), 'rb').read()
    px = [0] * (256 * 256)
    for i, t in enumerate(entries):
        for y in range(8):
            for x in range(8):
                px[((i // 32) * 8 + y) * 256 + (i % 32) * 8 + x] = tiles[t][y][x]
    return px


def main():
    repo = sys.argv[1]
    src = os.path.join(repo, 'graphics', 'roulette')
    os.makedirs(OUT, exist_ok=True)

    # The tiles: window.png's, then each sheet's.
    tiles = tiles_of(Image.open(os.path.join(src, 'window.png')))
    starts = {'window': 0}
    for name, pngs in SHEETS.items():
        starts[name] = len(tiles)
        for p in pngs:
            tiles += tiles_of(Image.open(os.path.join(src, p + '.png')))
    rows = (len(tiles) + 31) // 32
    px = [0] * (256 * rows * 8)
    for i, t in enumerate(tiles):
        for y in range(8):
            for x in range(8):
                px[((i // 32) * 8 + y) * 256 + (i % 32) * 8 + x] = t[y][x]
    # Each index ×17 (0-255), so the browser's decoding can't blur one into another.
    gray(px, 256, rows * 8, 17).save(os.path.join(OUT, 'tiles.png'), optimize=True)

    wheel = wheel_map(src)
    gray(wheel, 256, 256).save(os.path.join(OUT, 'wheel-map.png'), optimize=True)

    bg = [bgr555(c) for c in png_pal(Image.open(os.path.join(src, 'wheel.png')))[:14 * 16]]
    obj = [[bgr555(c) for c in png_pal(Image.open(os.path.join(src, p + '.png')))[:16]] for p in SPRITE_PALETTES]
    grid = list(struct.unpack('<384H', open(os.path.join(src, 'grid.bin'), 'rb').read()))
    data = {'bgPalette': bg, 'objPalettes': obj, 'grid': grid, 'sheets': starts}
    open(os.path.join(OUT, 'roulette.json'), 'w', newline='\n').write(json.dumps(data, separators=(',', ':')) + '\n')

    hub_picture(src, wheel, bg, obj, tiles, starts)

    out = os.path.join(OUT, 'sounds')
    frames = {}
    for song in SOUNDS:
        # Taillow's wing flaps loop until it flies off (m4aSongNumStop): its loop, once.
        samples = m4a_render.render(repo, song, loop=song in LOOPED)
        m4a_render.write_wav(os.path.join(out, song + '.wav'), samples, 0.8)
        frames[song] = math.ceil(len(samples) / m4a_render.RATE * 60)
    for cry in CRIES:
        samples, rate, _ = m4a_render.read_sample(repo, 'Cry_' + cry.capitalize())
        with wave.open(os.path.join(out, 'cry_' + cry + '.wav'), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 0.8 * 32767)))) for v in samples))
    print('tiles', len(tiles), 'sheets', starts)
    print('sound frames', frames)


def hub_picture(src, wheel, bg, obj, tiles, starts):
    """The wheel as the left table shows it at rest: BG 2 (its backdrop red, sRoulette's bgColors), the centre and the 12 icons."""
    def rgb(c):
        r, g, b = c & 31, (c >> 5) & 31, (c >> 10) & 31
        return ((r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2), 255)
    pal = list(bg)
    pal[0x51] = 24 | (4 << 5) | (10 << 10)
    im = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    p = im.load()
    for i, v in enumerate(wheel):
        if v:
            p[i % 256, i // 256] = rgb(pal[v])

    def sprite(sheet, tile, w, h, slot):
        s = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        sp = s.load()
        for y in range(h):
            for x in range(w):
                v = tiles[starts[sheet] + tile + (y // 8) * (w // 8) + x // 8][y % 8][x % 8]
                if v:
                    sp[x, y] = rgb(obj[slot][v])
        return s

    # The wheel's centre is at BG 2's 116,84 (UpdateWheelPosition's 0x7400, 0x5400).
    c = sprite('center', 0, 64, 64, 1)
    im.alpha_composite(c, (116 - 32, 84 - 32))
    # The icons (sAnim_WheelIcons' frames), 40 from the centre, from 15° every 30°, turned with the wheel.
    frames = [0, 32, 64, 72, 8, 40, 48, 80, 16, 24, 56, 88]
    for i, f in enumerate(frames):
        angle = 15 + 30 * i
        icon = sprite('wheelIcons', f, 16, 32, 8 + i % 4).rotate(-angle, resample=Image.NEAREST, expand=True)
        x = 116 + round(math.sin(math.radians(angle)) * 40) - icon.size[0] // 2
        y = 84 - round(math.cos(math.radians(angle)) * 40) - icon.size[1] // 2
        im.alpha_composite(icon, (x, y))
    # Only the wheel, round, without the table's felt round it: its rim is WHEEL_RADIUS from the centre.
    cx, cy, r = 116, 84, WHEEL_RADIUS
    out = Image.new('RGBA', (2 * r, 2 * r), (0, 0, 0, 0))
    src_px, out_px = im.load(), out.load()
    for y in range(2 * r):
        for x in range(2 * r):
            if (x - r + 0.5) ** 2 + (y - r + 0.5) ** 2 <= r * r:
                out_px[x, y] = src_px[cx - r + x, cy - r + y]
    out.save(os.path.join(OUT, 'wheel.png'), optimize=True)


if __name__ == '__main__':
    main()
