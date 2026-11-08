"""Makes up the Diamond/Pearl Darkness mat, laid out as the FireRed/LeafGreen one (frlg_darkness.py: a wall of ruins, all
wall with no floor, a message in Unown on it, lit round the cards and falling off into the dark) but from Sinnoh's Unown
ruins, the Solaceon Ruins (pret/pokediamond: MAP_SOLACEON_RUINS_*, area data 46, map texture set 45), drawn flat, not
tilted (the ruins' walls seen from the front, as Crystal's word rooms are), each texel 2x2 px on the sheet as
frlg_darkness.py's are (`SCALE`: frames 1536 x 896), the user's: as like the FRLG mats as can be, with DPP's pieces:
- the wall: the bricks of the ruins' carved tablet (build model 479, d20_o03, standing in the main rooms against the
  back wall: its sides' and back's texture, t5_o01_c, 64 x 32), tiled over the whole frame, its colours darkened (TONE; the
  rooms' own walls are low ledges seen from above, dun_wall_*, with no face to tile);
- the frieze along the top: the ruins' wall top (dun_wall_c: its capstone and the block under it), a row of them;
- the skirting along the bottom, at frlg_darkness.py's place (`SKIRTING_Y`): a ledge of the ruins' lighter wall tops'
  capstones (dun_wall_s) over a band of the tablet's own carvings (d20_o03: ten small raised signs, cut out one by one,
  `carvings`) in a random order on the bricks' mortar colour;
- the pilasters, three up each side where frlg_darkness.py's are (its `PILASTERS`, `PILASTER_W`): the Solaceon Ruins
  have no columns standing in a wall, so they're built of the ruins' stairs' side posts (dun_level's left 8 texels: a
  post of raised panels), each panel stretched to the pilaster's width and to PANEL_H (`sliced`: its edges kept, its
  middle repeated), under a capital of the ruins' lighter wall top (dun_wall_s) and on a base of dun_wall_c, both
  stretched a little wider; their edges towards the light pale and their outer edges dark, a shadow on the bricks on
  their outer side, as frlg_darkness.py's;
- cracks and chips in the bricks: none of the ruins' textures has any, so they're frlg_darkness.py's own (`cracked`:
  the same places from the same seed), in the bricks' darkest and lightest colours;
- the message: frlg_darkness.py's `MESSAGE` in its `BLOCKS` (the top two raised: `TOP_RAISE`), wrapped and spaced as it is (`wrapped`, `ADVANCE`,
  `SPACE`, `LEADING`, `LETTER`), each letter Diamond's Unown font (the Unown messages' font, font 3: its glyphs taken
  from pokeplatinum's res/fonts/font_unown.png, the same font, which pokediamond keeps only packed), its strokes doubled
  as Crystal's carvings are there, cut dark into the wall with a pale lip below and to the right;
- the light: frlg_darkness.py's (`light`, its oval, falloff, dither, cool tint and breath: BREATH frames shown there
  and back, BREATH_MS each), over the whole picture as there.

Every colour on the wall is the textures' own, darkened by TONE (they're brighter than frlg_darkness.py's dark stone,
and this is the dark mat), but the letters' dark (`CUT`) and lip (`LIP`); the pilasters' shadows are snapped to the
nearest of them, so the lit sheet keeps to an indexed palette (163 colours).

Usage: python tools/mats/dp_darkness.py [--apicula <exe>] [--cache <dir>] [--pt-cache <dir>] [--seed N] [--preview <png>]
Writes apps/web/public/mats/dp/darkness.png and darkness.json through frlg_mats.py's `save` (a sheet of the frames, in
columns if it's taller than SHEET_HEIGHT; {width, height, frames: [{y, ms}]}), or with --preview only the brightest
frame, to that file. The decompilations' files are cached as dp_mats.py's are. Needs numpy, Pillow and apicula."""
import os, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE]
import numpy as np
from PIL import Image
import dp_mats as dm
import frlg_mats as fm
import frlg_darkness as fd
import dp_data as dd
import pt_data as pd

FW, FH = fm.W * 16, fm.H * 16  # the frame, before it's doubled (768 x 448)
SCALE = fd.SCALE
SET, TABLET = 45, 479  # the Solaceon Ruins' map texture set (area data 46's) and its carved tablet's build model
FONT = 'res/fonts/font_unown.png'  # the Unown font (pokeplatinum's; Diamond's font 3), 16 x 16 cells, 16 a row
FONT_A = 0xAB  # its A's cell; B-Z follow
FRIEZE_H = 16  # the frieze's height (a dun_wall_c), px at the frame's size
SKIRTING_Y, LEDGE_H, CARVED_H = fd.SKIRTING_ROW * 8, 7, 9  # the skirting's top, its ledge's height (the capstone's top) and its band's
CARVING_GAP = 4  # px between the skirting's carvings
PANEL_H = 52  # a pilaster's panel's height (8 of them up its shaft)
CAP_OUT, SHADOW = 2, 5  # how far a pilaster's capital and base stand out each side, and its shadow's width
SHADE = 0.55  # the shadow's darkening (frlg_darkness.py's)
TONE = 0.75  # the wall's colours darkened (keeping their hue), as frlg_darkness.py's SHADES darken Crystal's: lit, as dim as its wall
# frlg_darkness.py's BLOCKS with the top two raised TOP_RAISE px (the user's, 2026-11-08: the sayings spaced out more on the wall).
TOP_RAISE = 28
BLOCKS = [(cx, cy - TOP_RAISE if cy < 224 else cy, w) for cx, cy, w in fd.BLOCKS]
CUT, LIP = '#2a1e0c', '#ad9c63'  # the letters' strokes (darker than the bricks' mortar, so they stand out) and their lip (the carvings' light)


def rgb(c):
    return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], np.uint8)


def textures(a):
    """The ruins' textures (RGBA uint8 arrays), converted with apicula: the map texture set's dun_* by name, and the
    tablet's t5_o01_c (bricks) and d20_o03 (carvings)."""
    tex = os.path.join(a.work, f'tex{SET}.nsbtx')
    open(tex, 'wb').write(dd.read(a.cache, dd.MAP_TEXTURES, SET))
    bm = os.path.join(a.work, f'bm{TABLET}.nsbmd')
    open(bm, 'wb').write(dd.read(a.cache, dd.BUILDING, TABLET))
    out = {}
    for src in (tex, bm):
        d = a._convert([src], os.path.splitext(src)[0], glb=False)
        for f in os.listdir(d):
            if f.endswith('.png'):
                out[f[:-4]] = np.asarray(Image.open(os.path.join(d, f)).convert('RGBA'))
    return out


def sliced(img, w, h, edge=(2, 2)):
    """`img` stretched to w x h by repeating its middle (its `edge` columns and rows at each side kept as they are)."""
    def index(n, size, e):
        mid = size - 2 * e
        return np.r_[np.arange(e), e + np.arange(n - 2 * e) * mid // (n - 2 * e), np.arange(size - e, size)]
    return img[index(h, img.shape[0], edge[1])][:, index(w, img.shape[1], edge[0])]


def carvings(t):
    """The tablet's ten carvings (d20_o03's first two rows: its third is its first again), each cut to its own columns."""
    alpha = t['d20_o03'][..., 3] > 0
    out = []
    for y0, y1 in ((3, 11), (13, 20)):
        cols = alpha[y0:y1].any(0)
        x = 0
        while x < len(cols):
            if cols[x]:
                x1 = x
                while x1 < len(cols) and cols[x1]:
                    x1 += 1
                out.append(t['d20_o03'][y0:y1, x:x1])
                x = x1
            else:
                x += 1
    return out


def over(dst, src, x, y):
    """RGBA `src` drawn over RGB `dst` at (x, y), its see-through texels left out."""
    h, w = src.shape[:2]
    m = src[..., 3] > 0
    dst[y:y + h, x:x + w][m] = src[..., :3][m]


def wall(t, rng):
    """The wall at the frame's size: bricks, the frieze, the skirting and the cracks (the pilasters go on later)."""
    bricks = t['t5_o01_c'][..., :3]
    out = np.tile(bricks, (FH // bricks.shape[0] + 1, FW // bricks.shape[1] + 1, 1))[:FH, :FW].copy()
    out[:FRIEZE_H] = np.tile(t['dun_wall_c'][..., :3], (1, FW // 16, 1))
    # The skirting: the capstones' tops as a ledge, then the carvings on the slab colour between two dark lines.
    y = SKIRTING_Y
    out[y:y + LEDGE_H] = np.tile(t['dun_wall_s'][:LEDGE_H, :, :3], (1, FW // 16, 1))
    band = out[y + LEDGE_H:y + LEDGE_H + CARVED_H]
    band[:] = bricks[6, 0]
    band[-1] = bricks[15, 9]
    signs = carvings(t)
    x = CARVING_GAP // 2
    while True:
        s = signs[int(rng.integers(len(signs)))]
        if x + s.shape[1] > FW:
            break
        over(band, s[:CARVED_H - 1], x, 1)
        x += s.shape[1] + CARVING_GAP
    return out


def cracks(seed, out, bricks):
    """frlg_darkness.py's cracks and chips (its `cracked`, in the same places from the same seed: its rng first taken
    through the frieze's and skirting's picks as its `darkness_arena` takes it), recoloured: drawn on a blank of its own
    and each of its colours swapped for the bricks' (its dark line ours `CUT`, its mid shade the mortar, its lip the slab)."""
    rng = np.random.default_rng(seed)
    for c in range(0, fd.TW, 4):
        if 0 < c < fd.TW - 4:
            rng.choice(fd.FRIEZE['mid'])
        rng.choice(fd.SKIRTING)
    blank = np.full_like(out, 255)
    kept, fd.UNCRACKED = fd.UNCRACKED, [(cx - w // 2 - 6, cy - 44, cx + w // 2 + 6, cy + 44) for cx, cy, w in BLOCKS]  # (clear of our blocks)
    try:
        fd.cracked(rng, blank)
    finally:
        fd.UNCRACKED = kept
    swaps = {tuple(rgb(fd.SHADES['TEXT'][3])): rgb(CUT), tuple(rgb(fd.SHADES['BROWN'][2])): bricks[15, 9], tuple(rgb(fd.SHADES['BROWN'][0])): bricks[1, 1]}
    for c, ours in swaps.items():
        out[(blank == c).all(2)] = ours


def pilasters(t, out):
    """fd.PILASTERS on each side (the right side's mirrored): the stairs' post's panels stretched up the shaft, a capital
    and a base, the outer edge dark and the edge towards the light pale, and a shadow on the bricks outside."""
    post = t['dun_level'][16:32, :8, :3]  # (one panel of the post, its lightest)
    cap, foot = (sliced(t[k][..., :3], fd.PILASTER_W + 2 * CAP_OUT, 16) for k in ('dun_wall_s', 'dun_wall_c'))
    pw = fd.PILASTER_W
    top, bottom = FRIEZE_H + 16, FH - 16
    shaft = np.concatenate([sliced(post, pw, PANEL_H)] * -(-(bottom - top) // PANEL_H))[:bottom - top]
    col = np.zeros((FH - FRIEZE_H, pw + 2 * CAP_OUT, 3), np.uint8)
    seen = np.zeros(col.shape[:2], bool)
    col[16:-16, CAP_OUT:-CAP_OUT], seen[16:-16, CAP_OUT:-CAP_OUT] = shaft, True
    col[:16], col[-16:], seen[:16], seen[-16:] = cap, foot, True, True
    col[16:-16, CAP_OUT], col[16:-16, -CAP_OUT - 1] = bricks_dark(t), t['dun_level'][17, 1, :3]  # (outer edge dark, inner pale)
    palette = np.unique(out.reshape(-1, 3), axis=0).astype(int)
    for left in fd.PILASTERS:
        for mirror in (False, True):
            c, s = (col[:, ::-1], seen[:, ::-1]) if mirror else (col, seen)
            x = FW - left - pw - CAP_OUT if mirror else left - CAP_OUT
            sx = slice(x + pw + 2 * CAP_OUT, x + pw + 2 * CAP_OUT + SHADOW) if mirror else slice(max(0, x - SHADOW), max(0, x))
            dim = out[FRIEZE_H:, sx].astype(int) * SHADE
            out[FRIEZE_H:, sx] = palette[np.abs(dim[..., None, :] - palette).sum(-1).argmin(-1)]  # (the nearest of the wall's colours)
            xs = slice(max(0, x), min(FW, x + c.shape[1]))
            part, mask = c[:, xs.start - x:xs.stop - x], s[:, xs.start - x:xs.stop - x]
            out[FRIEZE_H:, xs][mask] = part[mask]


def bricks_dark(t):
    return t['t5_o01_c'][6, 8, :3]  # (the bricks' mortar, their darkest)


def unown(pt_cache):
    """The Unown font's letters A-Z: each a 16 x 16 mask of its strokes (the font's darkest colour)."""
    im = Image.open(pd.fetch(pt_cache, FONT))
    idx = np.asarray(im)
    pal = np.array(im.getpalette()[:3 * 4]).reshape(-1, 3)
    used = [i for i in np.unique(idx) if i]
    dark = min(used, key=lambda i: pal[i].sum())
    out = {}
    for k in range(26):
        n = FONT_A + k
        out[chr(65 + k)] = idx[n // 16 * 16:n // 16 * 16 + 16, n % 16 * 16:n % 16 * 16 + 16] == dark
    return out


def carve(font, sheet):
    """frlg_darkness.py's `carve` with Diamond's letters: MESSAGE wrapped into BLOCKS, each line centred, each letter's
    strokes doubled (LETTER), cut dark with a pale lip below and to the right."""
    dark, lip = rgb(CUT), rgb(LIP)
    L, size = fd.LETTER, 16 * fd.LETTER
    for saying, (cx, cy, width) in zip(fd.MESSAGE, BLOCKS):
        lines = fd.wrapped(saying.upper(), width * SCALE)
        y = cy * SCALE - (len(lines) * fd.LEADING - (fd.LEADING - size)) // 2
        for line in lines:
            x = cx * SCALE - sum(fd.SPACE if ch == ' ' else fd.ADVANCE for ch in line) // 2
            for ch in line:
                if ch == ' ':
                    x += fd.SPACE
                    continue
                m = font[ch]
                cols = np.nonzero(m.any(0))[0]
                x0 = x + (fd.ADVANCE - (cols[-1] + 1 - cols[0]) * L) // 2 - int(cols[0]) * L  # (the stroke centred in its advance)
                m = np.kron(m, np.ones((L, L), bool))
                shade = np.zeros((size + L, size + L), bool)
                shade[L:, L:] = m
                shade[:size, :size] &= ~m
                sheet[y:y + size + L, x0:x0 + size + L][shade] = lip
                sheet[y:y + size, x0:x0 + size][m] = dark
                x += fd.ADVANCE
            y += fd.LEADING


def darkness_wall(a, seed):
    """The wall at the sheet's size (before the light): RGB uint8."""
    t = textures(a)
    out = wall(t, np.random.default_rng(seed))
    cracks(seed, out, t['t5_o01_c'][..., :3])
    pilasters(t, out)
    out = (out * TONE).round().astype(np.uint8)
    sheet = out.repeat(SCALE, 0).repeat(SCALE, 1)
    carve(unown(a.pt_cache), sheet)
    return sheet


def darkness_frames(a, seed=1):
    """The wall under frlg_darkness.py's breathing light: BREATH frames, the oval growing and brightening from the first
    to the last, and the order they show in, there and back. Returns ([(rgb, ms)], order) for `frlg_mats.save`."""
    base = darkness_wall(a, seed).astype(float)
    h, w = base.shape[:2]
    shots = []
    for k in range(fd.BREATH):
        lit = fd.light(h, w, fd.SWELL * (1 - np.cos(np.pi * k / (fd.BREATH - 1))) / 2)[..., None] / fd.LEVELS
        tint = lit + (1 - lit) * np.array(fd.COOL)
        shots.append(((base * lit * tint).clip(0, 255).round().astype(np.uint8), fd.BREATH_MS))
    return shots, list(range(fd.BREATH)) + list(range(fd.BREATH - 2, 0, -1))


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    pt_cache = opt('--pt-cache', os.path.join(tempfile.gettempdir(), 'pokeplatinum'))
    seed = int(opt('--seed', 1))
    preview = opt('--preview', None)
    a = dm.Assets(apicula, cache, pt_cache)
    shots, order = darkness_frames(a, seed)
    if preview:
        Image.fromarray(shots[-1][0]).save(preview)
        return
    fm.save('darkness', shots, dm.OUT, order)
    print('darkness', len(shots), 'frames of', fd.BREATH_MS, 'ms')


if __name__ == '__main__':
    main()
