"""Draws the FireRed/LeafGreen set's darkness mat into apps/web/public/mats/frlg/ (darkness.png, darkness.json).

Darkness: a wall of the Ruins of Alph's word rooms, faintly lit round the cards and falling off into the dark towards
the edges, a message on it in Unown. FireRed has no Unown writing (Tanoby's chambers are bright sandy mazes with none
on their walls), so the wall is Crystal's (pret/pokecrystal): the word rooms' tileset (gfx/tilesets/*_word_room.png,
their metatiles and the Ruins of Alph's palette map, `tilepal`), drawn 8x8 tile by tile at the GBA's scale (a Game Boy
Color tile is the same 8 px), recoloured in dark stone shades of our own (`SHADES`, one 4-colour ramp per Crystal
palette: its own are bright daylight colours). Laid out as the word rooms are, but the mat's size (96 x 56 tiles):
- the rooms' frieze along the top (their back wall's top, its three patterns at random) and their low wall's band (its
  ledge and its row of small carvings, `SKIRTING`) along the bottom, with brick below it: no floor, the whole mat is
  wall;
- cracks of our own in the bricks (the tileset has none; the user's, 2026-11-07): thin jagged lines through a few bricks,
  some forking, and chipped corners, at random away from the message and the cards (`CRACKS`, `cracked`), drawn at the
  wall's own pixel size in its darkest shade with a pale lip below;
- pilasters of our own up either side (the rooms have none: their side walls are dark openings), a row of them from
  the light's edge out into the dark (`PILASTERS`, `pilasters`): flat columns set in the wall in its own stone shades,
  a fluted shaft, a striped capital as the frieze's ledge and a stepped base, their faces towards the light lit
  and their far edges dark, each throwing a shadow on the bricks on its far side;
- their brick wall between (tiles 2 and 3, a checkerboard);
- the message (`MESSAGE`, the user's), its four sayings in four blocks beside the cards, two above the middle and two
  below, left and right (`BLOCKS`, where the user drew them), each wrapped to its block's width and centred in it, each
  letter the stroke of one of the tileset's 2x2 Unown carvings (`glyph`: cut from the bricks round it) at the
  carvings' own size, a brick wide (`LETTER`), cut in dark with a pale lip below and to the right. The sheet is drawn
  at twice the frame's size (`SCALE`), so the letters can sit at any pixel.
The light (`light`, baked into the frames): an oval round the cards' middle (the user's: about the table's lit middle),
bright in it and dimming gradually to almost black outside it, ordered-dithered (a 4x4 Bayer matrix) into LEVELS steps of brightness so the sheet keeps to
an indexed palette, the dark tinted cool (`COOL`), its edge and brightness breathing slowly in and out (BREATH frames shown there and back, `darkness_shots`).

Its own pipeline (the tiles aren't a FireRed/Emerald tileset pair): `darkness_arena(rng)` returns (ts, grid), ts a
`Crystal` (the tileset, its palette map and `render`) and grid the mat's 8x8 tile ids (56 x 96, not metatiles);
`darkness_frames(ts, grid)` the frames (one per light step) and the order they show in, for `frlg_mats.save`.
Downloads pokecrystal's files once into --cache (default: pokecrystal in the system's temp folder). Needs numpy and
Pillow.
Usage: python tools/mats/frlg_darkness.py [--seed N] [--cache DIR] [--out DIR] [--preview FILE]"""
import argparse, io, os, re
import numpy as np
from PIL import Image
import frlg_mats

CRYSTAL = frlg_mats.Game('pokecrystal', 0, 0, 0, 0)  # (only `get`'s download and cache: its tiles are read here)
TW, TH = frlg_mats.W * 2, frlg_mats.H * 2  # the mat in 8x8 tiles

# The message, one saying a block (the user's, 2026-11-07; letters A-Y and spaces).
MESSAGE = ('A STONE OUTCROP OVER POOLS OF MUD ON A MIGHTY MOUNTAIN', 'THE UNUSUAL STONE STARING OUT ACROSS THE SNOWFIELDS',
           'LOOK TO THE RUINED PILLARS OF CELESTICA', 'WHERE STONES PILE HIGH AMID FOG BOUND RUINS')
# Each saying's block (the user's, drawn on the table, 2026-11-07): its middle (x, y) and width, px on the frame:
# above the middle on the left and right, then below it.
BLOCKS = [(214, 188, 244), (547, 188, 228), (189, 288, 204), (563, 288, 220)]
SCALE = 2  # the sheet is drawn at twice the frame's size (the wall's pixels doubled)
LETTER = 2  # each carving's pixels drawn this many times over at the sheet's size: a letter a brick wide, as the word rooms' are
ADVANCE, SPACE, LEADING = 28, 14, 38  # px a letter and a space take along a line and a line down, at the sheet's size

ROOM = 'aerodactyl_word_room'  # the word rooms' tilesets are all one picture; the metatiles below are Aerodactyl's
BRICK = 2, 3  # the wall: tile 2 where column + row is even, 3 where it's odd
FRIEZE = dict(left=0x14, mid=(0x15, 0x16, 0x18), right=0x19)  # the back wall's top: its corners over the pillars, its patterns
# The cracks: how many lines and chips, a line's length (px, the frame's), where they go (x0, y0, x1, y1: the lit wall
# between the pilasters, above the skirting) and where they don't (round the message's blocks).
CRACKS, CHIPS, CRACK_LEN = 30, 14, (12, 34)
CRACKED = 96, 40, 672, 372
UNCRACKED = [(cx - w // 2 - 6, cy - 44, cx + w // 2 + 6, cy + 44) for cx, cy, w in BLOCKS]
SKIRTING, SKIRTING_ROW = (0x1E, 0x20), 47  # the low wall's band (its ledge and carvings, not the floor under it) along the bottom, at this tile row: inside what the table shows (the user's, 2026-11-07)
# The pilasters (the user's, 2026-11-07: several side by side, fading into the dark): their left edges, px on the frame,
# on the left side (the right side's mirrored), and their width; the shaft's grooves, capital's and base's heights and
# the shadow's width, px at the sheet's size.
PILASTERS, PILASTER_W = (6, 36, 66), 24
FLUTES, CAP, FOOT_H, SHADOW = 3, 28, 24, 10
# Dark stone shades for Crystal's palettes, lightest first (index 0 to 3 of a tile), at full light: the bricks (BROWN)
# an olive grey, as the reference's, their mortar's darkest shade lifted (at 1x its dither was noise); the carvings
# (UNOWN) the same but their strokes near black, so they stand out of the bricks; the frieze's colours dulled.
SHADES = dict(BROWN=['#8a8048', '#6a6038', '#4a4428', '#383220'], YELLOW=['#9a8a48', '#6c5c2c', '#40341c', '#1c140c'],
              RED=['#8c5838', '#643824', '#3c2018', '#1c0c08'], GRAY=['#7c7c6c', '#56564c', '#36362e', '#141410'],
              WATER=['#626a6a', '#444a4a', '#2a2e2e', '#101212'], GREEN=['#6c7a40', '#4c5628', '#2e3418', '#12140a'],
              ROOF=['#626a6a', '#444a4a', '#2a2e2e', '#101212'], TEXT=['#8a8048', '#5c5634', '#3c3824', '#1c1810'],
              UNOWN=['#8a8048', '#6a6038', '#4a4428', '#0e0a06'])  # (the carvings: BROWN's, their strokes cut deep)
LIP = '#a89c5c'  # the carvings' pale lip, below and to the right of their strokes

LEVELS = 10  # the light's steps of brightness (each of SHADES' colours LEVELS + 1 times at most: the colours used under 256 in all)
DIM, BRIGHT, FADED = 0.05, 1.0, 0.8  # the light at the edges and in the middle, at its brightest and faded
COOL = 0.8, 0.88, 1.2  # the dark's tint (per channel, at no light; none at full light)
REACH = 0.5, 1.2  # where it starts to dim and where it's at its dimmest, as a share of the oval's radii (RADII)
RADII = 306, 204  # px, across and down, round the frame's middle (the frame's size, not the sheet's; 20% wider than the user's first circle, theirs)
BREATH, BREATH_MS, SWELL = 12, 250, 0.08  # frames there (shown there and back), ms each, and how much the oval grows
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16


class Crystal:
    """Crystal's word room tileset: its tiles (gfx/tilesets/<ROOM>.png, the first 96 at ids 0x00-0x5F, the second 96,
    VRAM bank 1's, at 0x80-0xDF, as the metatiles number them), each tile's palette (the Ruins of Alph's palette map:
    `tilepal 0` rows for the first, `tilepal 1` rows for the second) and the metatiles (4x4 tile ids each)."""

    def __init__(self):
        im = np.array(Image.open(io.BytesIO(frlg_mats.get(f'gfx/tilesets/{ROOM}.png', CRYSTAL))))
        self.tiles = 3 - im.reshape(im.shape[0] // 8, 8, 16, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8) // 85  # (white is shade 0)
        text = frlg_mats.get('gfx/tilesets/ruins_of_alph_palette_map.asm', CRYSTAL).decode()
        banks = [re.findall(r'[A-Z]+', ' '.join(l.split(',', 1)[1] for l in part.splitlines() if 'tilepal' in l)) for part in text.split('rept 16')]
        self.pal = {i: banks[0][i] for i in range(0x60)} | {0x80 + i: banks[1][i] for i in range(0x60)}
        self.meta = np.frombuffer(frlg_mats.get(f'data/tilesets/{ROOM}_metatiles.bin', CRYSTAL), np.uint8).reshape(-1, 4, 4)
        self.shades = {k: np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in v], np.uint8) for k, v in SHADES.items()}

    def tile(self, t):
        return self.tiles[t if t < 0x60 else t - 0x80 + 0x60]

    def render(self, grid, carved=None):
        """A grid of tile ids as an RGB array, in SHADES' colours at full light; the `carved` cells' in UNOWN's."""
        h, w = grid.shape
        out = np.zeros((h * 8, w * 8, 3), np.uint8)
        for y in range(h):
            for x in range(w):
                t = int(grid[y, x])
                pal = 'UNOWN' if carved is not None and carved[y, x] else self.pal.get(t, 'BROWN')
                out[y * 8:y * 8 + 8, x * 8:x * 8 + 8] = self.shades[pal][self.tile(t)]
        return out


UNOWN_Y = [[0x5B, 0x5C], [0x4D, 0x5D]]  # (Y's carving is squeezed into the tileset's first half: Ho-Oh's room's HARMONY)


def unown(letter):
    """An Unown letter's 2x2 tiles: the tileset's carvings, A-H, I-P and Q-X in rows of 8 from 0x80 (each one's bottom
    half the next tile row's, 0x10 on), and Y apart. The tileset has no Z (no room's message has one)."""
    if letter == 'Y':
        return UNOWN_Y
    if letter == 'Z':
        raise ValueError("Crystal's word rooms have no Unown Z")
    t = 0x80 + (ord(letter) - ord('A')) // 8 * 0x20 + (ord(letter) - ord('A')) % 8 * 2
    return [[t, t + 1], [t + 0x10, t + 0x11]]


def glyph(ts, letter):
    """An Unown letter's stroke, a 16x16 mask: the darkest pixels of its carving's 2x2 tiles that hang together (4 or more
    side by side), leaving the bricks' mortar round it."""
    dark = np.block([[ts.tile(t) for t in row] for row in unown(letter)]) == 3
    dark[[0, 15], :] = False
    dark[:, [0, 15]] = False
    seen, keep = np.zeros_like(dark), np.zeros_like(dark)
    for y0, x0 in zip(*np.nonzero(dark)):
        if seen[y0, x0]:
            continue
        part, todo = [], [(y0, x0)]
        seen[y0, x0] = True
        while todo:
            y, x = todo.pop()
            part.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= y + dy < 16 and 0 <= x + dx < 16 and dark[y + dy, x + dx] and not seen[y + dy, x + dx]:
                    seen[y + dy, x + dx] = True
                    todo.append((y + dy, x + dx))
        if len(part) >= 4:
            keep[tuple(np.array(part).T)] = True
    return keep


def wrapped(saying, width):
    """A saying's words in lines no wider than `width` px (the sheet's), as few as fit."""
    lines = []
    for word in saying.split():
        if lines and len(lines[-1]) * ADVANCE + SPACE + len(word) * ADVANCE <= width + ADVANCE - ADVANCE // 2:
            lines[-1] += ' ' + word
        else:
            lines.append(word)
    return lines


def carve(ts, rgb):
    """MESSAGE cut into the wall (`rgb`, the sheet's size): each saying wrapped into its BLOCKS block and centred in it,
    line by line, the strokes dark, a pale lip below and to the right of them."""
    dark, lip = (np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], np.uint8) for c in (SHADES['UNOWN'][3], LIP))
    size = 16 * LETTER
    for saying, (cx, cy, width) in zip(MESSAGE, BLOCKS):
        lines = wrapped(saying.upper(), width * SCALE)
        y = cy * SCALE - (len(lines) * LEADING - (LEADING - size)) // 2
        for line in lines:
            x = cx * SCALE - sum(SPACE if ch == ' ' else ADVANCE for ch in line) // 2
            for ch in line:
                if ch == ' ':
                    x += SPACE
                    continue
                m = glyph(ts, ch)
                x0 = x - int(np.nonzero(m.any(0))[0][0]) * LETTER  # (the stroke's left edge where the letter starts)
                m = np.kron(m, np.ones((LETTER, LETTER), bool))
                shade = np.zeros((size + LETTER, size + LETTER), bool)
                shade[LETTER:, LETTER:] = m
                shade[:size, :size] &= ~m
                rgb[y:y + size + LETTER, x0:x0 + size + LETTER][shade] = lip
                rgb[y:y + size, x0:x0 + size][m] = dark
                x += ADVANCE
            y += LEADING


def stamp(grid, y, x, block):
    """A metatile's tiles (or part of one) at tile row y, column x."""
    h, w = block.shape
    grid[y:y + h, x:x + w] = block


def darkness_arena(rng):
    """The wall (`Crystal`'s tile ids, TH x TW): bricks and the frieze along the top (its patterns at random). The
    pilasters and MESSAGE are drawn later, at the sheet's size (`pilasters`, `carve`)."""
    ts = Crystal()
    y, x = np.mgrid[0:TH, 0:TW]
    grid = np.where((x + y) % 2 == 0, *BRICK)
    for c in range(0, TW, 4):
        m = FRIEZE['left'] if c == 0 else FRIEZE['right'] if c == TW - 4 else rng.choice(FRIEZE['mid'])
        stamp(grid, 0, c, ts.meta[m][:2])
        stamp(grid, SKIRTING_ROW, c, ts.meta[rng.choice(SKIRTING)][:2])
    ts.rng = rng  # (the cracks', drawn with the wall: `cracked`)
    return ts, grid


def cracked(rng, rgb):
    """CRACKS jagged lines and CHIPS chipped corners drawn on the wall (`rgb`, the frame's size, before it's doubled), each
    where it misses UNCRACKED: a line a pixel wide in the wall's darkest shade, wandering a row up or down now and then,
    sometimes forking, with a pale pixel under each of its pixels; a chip a small dark triangle with a mid-shade edge."""
    dark, deep, pale = (np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], np.uint8) for c in (SHADES['TEXT'][3], SHADES['BROWN'][2], SHADES['BROWN'][0]))
    h, w = rgb.shape[:2]
    free = lambda x, y, pad=0: CRACKED[0] <= x < CRACKED[2] and CRACKED[1] <= y < CRACKED[3] and not any(x0 - pad <= x <= x1 + pad and y0 - pad <= y <= y1 + pad for x0, y0, x1, y1 in UNCRACKED)

    def line(x, y, n, dx):
        path = []
        for _ in range(n):
            if not free(x, y):
                break
            path.append((y, x))
            x += dx
            if rng.random() < 0.4:
                y += rng.choice((-1, 1))
        return path

    pixels = []
    for _ in range(CRACKS):
        for _ in range(100):
            x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
            if free(x, y, 6):
                break
        else:
            continue
        path = line(x, y, int(rng.integers(*CRACK_LEN)), int(rng.choice((-1, 1))))
        if len(path) > 6 and rng.random() < 0.5:  # (a fork from part way along)
            fy, fx = path[len(path) // 2]
            path += line(fx, fy, int(rng.integers(4, 10)), int(rng.choice((-1, 1))))
        pixels += path
    for y, x in pixels:
        if (y + 1, x) not in pixels and y + 1 < h:
            rgb[y + 1, x] = pale
    for y, x in pixels:
        rgb[y, x] = dark
    for _ in range(CHIPS):
        for _ in range(100):
            x, y = int(rng.integers(0, w - 3)), int(rng.integers(0, h - 3))
            if free(x, y, 4):
                break
        else:
            continue
        fx, fy = rng.choice((-1, 1), 2)
        for (dy, dx), c in (((0, 0), dark), ((0, 1), dark), ((1, 0), dark), ((0, 2), deep), ((1, 1), deep), ((2, 0), deep)):
            rgb[y + fy * dy, x + fx * dx] = c


def light(h, w, swell=0.0):
    """The light over the frame, 0 to LEVELS (whole steps): the oval's falloff (`REACH`, `RADII` grown by `swell`),
    dithered between steps by the Bayer matrix."""
    y, x = np.mgrid[0:h, 0:w]
    d = np.hypot((x + 0.5 - w / 2) / (RADII[0] * SCALE * (1 + swell)), (y + 0.5 - h / 2) / (RADII[1] * SCALE * (1 + swell)))
    t = np.clip((d - REACH[0]) / (REACH[1] - REACH[0]), 0, 1)
    top = FADED + (BRIGHT - FADED) * swell / SWELL  # (brightest with the oval at its widest)
    lit = DIM + (top - DIM) * (1 - t * t * (3 - 2 * t))
    return np.floor(lit * LEVELS + np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]).clip(0, LEVELS)


def pilasters(rgb):
    """PILASTERS drawn over the wall (`rgb`, the sheet's size), each side's mirrored: a shaft of the bricks' middle shade
    with FLUTES grooves (dark, a pale edge on the light's side), its edge towards the frame's middle pale and its outer
    edge dark, a capital (CAP high, a little wider, striped as the frieze's ledge) under the frieze and a stepped base
    (FOOT_H) at the bottom, and SHADOW px of shadow on the bricks on its outer side."""
    pale, face, deep, dark = (np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], np.uint8) for c in (LIP, *SHADES['BROWN'][:2], SHADES['BROWN'][3]))  # (a shade lighter than the bricks: they stand out of the wall)
    h, w = rgb.shape[:2]
    top = 2 * 8 * SCALE  # (under the frieze: its 2 tile rows)
    for left in PILASTERS:
        x0, pw = left * SCALE, PILASTER_W * SCALE
        for mirror in (False, True):
            col = np.zeros((h - top, pw + 8, 3), np.uint8)  # (the pilaster drawn left-side up, its capital 4 px wider each side)
            seen = np.zeros(col.shape[:2], bool)
            col[:, 4:-4], seen[:, 4:-4] = face, True
            for i in range(FLUTES):
                fx = 4 + pw * (i + 1) // (FLUTES + 1)
                col[CAP:-FOOT_H, fx - 2:fx + 1], col[CAP:-FOOT_H, fx + 1:fx + 3] = deep, pale
            col[:, 4:6], col[:, -6:-4] = dark, pale  # (outer edge dark, the edge towards the light pale)
            for k, (y0, y1) in enumerate(((0, CAP), (len(col) - FOOT_H, len(col)))):
                col[y0:y1], seen[y0:y1] = face, True
                for y in range(y0, y1, 4):
                    col[y:y + 2] = pale if (y - y0) // 4 % 2 == k else deep
                col[y0:y1, :2], col[y0:y1, -2:] = dark, pale
            if mirror:
                col, seen = col[:, ::-1], seen[:, ::-1]
                x = w - x0 - pw - 4
                rgb[top:, x + pw + 8:x + pw + 8 + SHADOW] = (rgb[top:, x + pw + 8:x + pw + 8 + SHADOW] * 0.55).astype(np.uint8)
            else:
                x = x0 - 4
                rgb[top:, max(0, x - SHADOW):max(0, x)] = (rgb[top:, max(0, x - SHADOW):max(0, x)] * 0.55).astype(np.uint8)
            # (the shadow falls away from the light: on the left side's pilasters' outer (left) side, mirrored on the right)
            xs = slice(max(0, x), min(w, x + pw + 8))
            part, mask = col[:, xs.start - x:xs.stop - x], seen[:, xs.start - x:xs.stop - x]
            rgb[top:, xs][mask] = part[mask]


def darkness_frames(ts, grid):
    """The wall at the sheet's size, MESSAGE cut in, under the breathing light: BREATH frames, the oval growing by SWELL
    and brightening from the first to the last (eased), and the order they show in, there and back. Returns ([(rgb, ms)],
    order) for `frlg_mats.save`."""
    base = ts.render(grid)
    cracked(ts.rng, base)
    base = base.repeat(SCALE, 0).repeat(SCALE, 1)
    pilasters(base)
    carve(ts, base)
    base = base.astype(float)
    h, w = base.shape[:2]
    shots = []
    for k in range(BREATH):
        lit = light(h, w, SWELL * (1 - np.cos(np.pi * k / (BREATH - 1))) / 2)[..., None] / LEVELS
        tint = lit + (1 - lit) * np.array(COOL)
        shots.append(((base * lit * tint).clip(0, 255).round().astype(np.uint8), BREATH_MS))
    return shots, list(range(BREATH)) + list(range(BREATH - 2, 0, -1))


def darkness_shots(rng):
    """The mat's frames and order, from the seed's rng."""
    return darkness_frames(*darkness_arena(rng))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description="Draws the FireRed/LeafGreen set's darkness mat.")
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--cache', default=CRYSTAL.cache, help="where pokecrystal's files are kept")
    ap.add_argument('--out', help='where the sheet goes (apps/web/public/mats/frlg/ without it)')
    ap.add_argument('--preview', help='a PNG of the first frame')
    args = ap.parse_args()
    CRYSTAL.cache = args.cache
    out_dir = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'web', 'public', 'mats', 'frlg')
    shots, order = darkness_shots(np.random.default_rng(args.seed))
    frlg_mats.save('darkness', shots, out_dir, order)
    if args.preview:
        Image.fromarray(shots[0][0]).save(args.preview)
    print('darkness', len(shots), 'frames of', BREATH_MS, 'ms')
