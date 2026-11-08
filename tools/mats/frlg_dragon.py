"""Draws the FireRed/LeafGreen Dragon type mat into apps/web/public/mats/frlg/ (dragon.png, dragon.json), as
frlg_mats.py draws the others (its `save`), from Emerald's tiles: FireRed has no Sky Pillar.

The scene (`dragon_arena`): the Sky Pillar's summit (Emerald's SkyPillar_Top: General and Pacifidlog tiles) floating in
the sky, its outline uneven (each side's edge jogging in and out a cell or so, the corners rounded off), the cards'
middle on its plain cracked stone. Its north edge is the map's own (612, the dark rim with the sky above it; 685 with
a boulder on it); the map has no east or west edge, so the summit's sides are drawn in the rim's colours (the dark line
and its pale highlight, turned on their side: `outline`); along its south edge the map's pale lip (603) with the
pillar's brown face (674) below it, going down past the frame's bottom. Away from the cards, near the edges: the
summit's rubble (527, 543, 535) and its broken floor, cracks (566) round holes looking into the tower (567), as the
map has them before Rayquaza wakes (the clean map, after, has neither); in the cards' middle only a few cracks.
Rayquaza (the map's sleeping OBJ_EVENT_GFX_RAYQUAZA, 64 x 64) is left out: at the summit's middle it would be under
the cards.

The sky is the map's (705). Clouds drift past it (`cloud_frames`): Emerald's cloud sprite (graphics/weather/cloud.png,
WEATHER_SUNNY_CLOUDS', Route 120's: field_weather_effect.c's CreateCloudSprites), cut into its puffs, flipped at random,
alpha-blended with what's under them as the game blends them (12 and 8 sixteenths, in 5-bit colour), moving left as
the game's do. They're in bands across the frame (`CLOUD_BANDS`): the summit stands above them (they pass behind its
floor and lip, so a band across its middle shows only beside it), while the low ones drift in front of the pillar's
face below it. Each band is a strip of a few puffs repeating every `period` px, moved `period / CLOUD_FRAMES` px a
frame, so every band comes round in the same CLOUD_FRAMES frames and the loop is seamless; bands with different
periods (and speeds: the lower, nearer ones faster) overlap, so the repeats don't line up. Nothing on the summit
animates (Pacifidlog's tile animations are its sea's), so the clouds are the only movement.

Writes dragon.png (the frames stacked top to bottom) and dragon.json ({width, height, frames: [{y, ms}]}), via
frlg_mats.save. To wire it into frlg_mats.py: ARENAS['dragon'] = dragon_arena, and in main, for 'dragon',
shots = cloud_frames(ts, grid, rng) in place of overlay(frames(ts, grid), objects).
Usage: python tools/mats/frlg_dragon.py [--seed N] [--out DIR] [--preview DIR]"""
import argparse, io, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import frlg_mats
from frlg_mats import EMERALD, H, W, Tilesets, get, jog, rounded, opened, grow, smooth_noise, chebyshev

SKY = 705  # the summit map's sky above its north edge
FLOOR = 564  # the summit's plain stone
EDGE = 612, 685  # its north edge (the dark rim, the sky above): plain, a boulder on it
CRACK, HOLE = 566, 567  # cracked floor, and floor broken through (MB_CRACKED_FLOOR, MB_CRACKED_FLOOR_HOLE)
RUBBLE = 527, 543, 535  # a boulder, a heap of stones, stones on the darker floor
LIP, FACE = 603, 674  # the summit's south edge (its pale lip over the wall's top) and the pillar's brown face below it
CARDS = 5, 24, 10, 38  # rows and columns, end exclusive: the cards' place, kept clear but for a few cracks


def summit(rng):
    """The summit's floor: a box round the cards, each side's edge jogging a cell or two in and out (`jog`), its corners
    rounded off (`rounded`) and no strip of it, or notch, a cell wide (`opened`)."""
    y, x = np.mgrid[0:H, 0:W]
    left, right = jog(rng, H, 5, 8, 4), jog(rng, H, 40, 43, 4)
    top, bottom = jog(rng, W, 2, 4, 4), jog(rng, W, 22, 24, 4)
    floor = (x >= left[:, None]) & (x < right[:, None]) & (y >= top[None, :]) & (y <= bottom[None, :])
    y0, y1, x0, x1 = CARDS
    floor[y0:y1, x0:x1] = True
    return opened(rounded(floor, 3))


def dragon_arena(rng):
    """Dragon: the Sky Pillar's summit in the sky (Emerald's SkyPillar_Top tiles: FireRed has none), its outline uneven
    (`summit`), its north edge the map's rim, its south edge the lip and the pillar's face going down out of the frame;
    rubble and broken floor near its edges, away from the cards. The sides' rim and the clouds go over it after
    (`cloud_frames`)."""
    ts = Tilesets('gTileset_General', 'gTileset_Pacifidlog', EMERALD)
    floor = summit(rng)
    grid = np.full((H, W), SKY)
    grid[floor] = FLOOR
    for x in range(W):  # the lip under each column's lowest floor, the face below it to the frame's bottom
        rows = np.nonzero(floor[:, x])[0]
        if len(rows) and rows[-1] + 1 < H:
            grid[rows[-1] + 1, x] = LIP
            grid[rows[-1] + 2:, x] = FACE
    north = floor & ~np.roll(floor, 1, axis=0)
    grid[north] = np.where(rng.random((H, W)) < 0.2, EDGE[1], EDGE[0])[north]
    y0, y1, x0, x1 = CARDS
    cards = np.zeros((H, W), bool)
    cards[y0:y1, x0:x1] = True
    inner = floor & ~north & ~grow(~floor, 1)  # (not on a cell along the edge: the rim is drawn over those)
    deep = chebyshev(~floor)  # each cell's distance in from the edge
    out = inner & ~cards
    # Broken floor in a few patches near the edge: holes where the noise is highest, cracks round them.
    broken = smooth_noise(rng, H, W, 3)
    holes = out & (broken > 0.78)
    grid[holes] = HOLE
    grid[out & ~holes & grow(holes, 1) & (rng.random((H, W)) < 0.7)] = CRACK
    # Rubble thickest at the edge, thinning inwards; a few cracks loose in the cards' middle.
    pile = smooth_noise(rng, H, W, 2) + 0.15 * (3 - np.minimum(deep, 3))
    heap = out & (grid == FLOOR) & (pile > 0.65) & (rng.random((H, W)) < 0.6)
    grid[heap] = rng.choice(RUBBLE, size=(H, W), p=(0.45, 0.4, 0.15))[heap]
    grid[inner & cards & (rng.random((H, W)) < 0.025)] = CRACK
    grid[out & (grid == FLOOR) & (rng.random((H, W)) < 0.06)] = CRACK
    return ts, grid


def outline(ts, grid, rgb):
    """The summit's sides drawn in the north rim's colours (612's dark line and the pale highlight inside it), on their
    side: the floor's along every side but its north (the map's own) where the next cell isn't floor; the lip's and
    face's where the next cell is sky, or a face further back (north); and the floor's outer corners' single dark pixel
    where only a corner touches the sky."""
    rim = ts.draw(EDGE[0])
    dark, light = rim[0, 0], rim[1, 0]
    rgb = rgb.copy()
    floor = np.isin(grid, (FLOOR, CRACK, HOLE) + EDGE + RUBBLE)
    lip_row = np.array([np.nonzero(grid[:, x] == LIP)[0][0] if (grid[:, x] == LIP).any() else -1 for x in range(W)])
    for y in range(H):
        for x in range(W):
            py, px = y * 16, x * 16
            if floor[y, x]:
                for dx, c0, c1 in ((-1, 0, 1), (1, 15, 14)):
                    if not (0 <= x + dx < W and floor[y, x + dx]):
                        rgb[py:py + 16, px + c0] = dark
                        rgb[py + (2 if grid[y, x] in EDGE else 0):py + 16, px + c1] = light
                for dy, dx in ((-1, -1), (-1, 1)):  # (an inner corner of the rim: sky only up and across)
                    if floor[y, x + dx] and floor[y + dy, x] and not floor[y + dy, x + dx]:
                        rgb[py, px + (0 if dx < 0 else 15)] = dark
            elif grid[y, x] in (LIP, FACE):
                for dx, c in ((-1, 0), (1, 15)):
                    n = x + dx
                    if not (0 <= n < W) or grid[y, n] == SKY or (grid[y, n] in (LIP, FACE) and lip_row[n] < lip_row[x]):
                        rgb[py:py + 16, px + c] = dark
    return rgb


CLOUD_FRAMES = 64  # the loop: every band comes round in it
CLOUD_STEP = 12  # game frames a frame (200 ms): a band of period 384 moves 6 px a frame, the game's 1 every 2 game frames
CLOUD_BLEND = 12, 8  # the clouds' weight and the scene's, in 16ths (Clouds_Main's Weather_SetTargetBlendCoeffs(12, 8))
# The bands (their middle row in px, the period in px, how many puffs a period, how far up or down a puff may be off the
# middle, and whether only the big puff): high ones across the top, behind the summit; bands across its middle, seen
# only beside it; low ones, of big puffs, thick in front of the pillar's face.
CLOUD_BANDS = [(10, 256, 2, 6, False), (30, 384, 2, 6, False), (80, 192, 1, 10, False), (150, 256, 2, 12, False),
               (225, 192, 1, 12, False), (300, 256, 2, 12, False), (365, 384, 3, 10, False), (420, 384, 5, 8, True),
               (442, 256, 3, 6, True)]
PUFF_ODDS = 0.4, 0.45, 0.15  # how often a band picks the big puff, the middling one and the little one


def cloud_pieces():
    """Emerald's cloud sprite (64 x 64, index 0 see-through) cut into its three puffs, biggest first, each its smallest
    box of the sprite (only its own pixels), and its palette as 0-255 RGB."""
    im = Image.open(io.BytesIO(get('graphics/weather/cloud.png', EMERALD)))
    idx, pal = np.array(im), np.array(im.getpalette()[:48], int).reshape(16, 3)
    label, n = np.zeros(idx.shape, int), 0
    for y0, x0 in zip(*np.nonzero(idx)):  # (flood fill: each puff's pixels, corners joining)
        if label[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        label[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    v, u = y + dy, x + dx
                    if 0 <= v < 64 and 0 <= u < 64 and idx[v, u] and not label[v, u]:
                        label[v, u] = n
                        stack.append((v, u))
    pieces = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(label == k)
        if len(ys) >= 40:  # (no stray pixel on its own)
            box = np.where(label == k, idx, 0)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            pieces.append(box)
    return sorted(pieces, key=lambda p: -p.size), pal


def cloud_layer(rng, h, w):
    """Each band's puffs laid along a strip one period long, as [(band's period, strip of sprite indices, its top row)]."""
    pieces, _ = cloud_pieces()
    big = max(p.shape[0] for p in pieces)
    out = []
    for mid, period, n, jitter, only_big in CLOUD_BANDS:
        strip = np.zeros((big + 2 * jitter, period), np.uint8)
        for i in range(n):
            p = pieces[0 if only_big else int(rng.choice(len(PUFF_ODDS), p=PUFF_ODDS))]
            p = p[:, ::-1] if rng.random() < 0.5 else p
            y = int(rng.integers(0, 2 * jitter + 1)) + (big - p.shape[0]) // 2
            x = int(period * i / n + rng.integers(0, max(1, period // n - p.shape[1] // 2)))
            cols = np.arange(x, x + p.shape[1]) % period  # (wrapping round the strip's end)
            sub = strip[y:y + p.shape[0]][:, cols]
            sub[p > 0] = p[p > 0]
            strip[y:y + p.shape[0], cols] = sub
        out.append((period, strip, mid - strip.shape[0] // 2))
    return out


def cloud_frames(ts, grid, rng):
    """The scene (its sides' rim drawn on: `outline`) once a frame with the clouds over it: each band's strip tiled
    across the frame and moved left period / CLOUD_FRAMES px a frame, blended as the game blends its clouds, and kept
    off the summit's floor and lip (the clouds are below it), over the sky and the pillar's face. [(rgb, ms)]."""
    base = outline(ts, grid, ts.render(grid))
    h, w = base.shape[:2]
    _, pal = cloud_pieces()
    behind = np.repeat(np.repeat(np.isin(grid, (SKY, FACE)), 16, 0), 16, 1)  # (where clouds show)
    eva, evb = CLOUD_BLEND
    layer = cloud_layer(rng, h, w)
    out = []
    for k in range(CLOUD_FRAMES):
        idx = np.zeros((h, w), np.uint8)
        for period, strip, top in layer:
            shift = k * period // CLOUD_FRAMES
            cols = (np.arange(w) + shift) % period
            rows = np.arange(strip.shape[0]) + top
            ok = (rows >= 0) & (rows < h)
            band = strip[ok][:, cols]
            sub = idx[rows[ok]]
            sub[band > 0] = band[band > 0]
            idx[rows[ok]] = sub
        mix = np.minimum(31, (pal[idx] // 8 * eva + base.astype(int) // 8 * evb) // 16) * 255 // 31
        show = (idx > 0) & behind
        out.append((np.where(show[..., None], mix, base).astype(np.uint8), CLOUD_STEP * 1000 / 60))
    return out


def main():
    ap = argparse.ArgumentParser(description="Draws the battle table's FireRed/LeafGreen Dragon type mat.")
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', help='where the sheet goes (apps/web/public/mats/frlg/ without it)')
    ap.add_argument('--preview', help="a folder for the first frame's picture")
    args = ap.parse_args()
    out_dir = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'web', 'public', 'mats', 'frlg')
    rng = np.random.default_rng(args.seed)
    ts, grid = dragon_arena(rng)
    shots = cloud_frames(ts, grid, rng)
    frlg_mats.save('dragon', shots, out_dir)
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        Image.fromarray(shots[0][0]).save(os.path.join(args.preview, 'dragon.png'))
    print('dragon', len(shots), 'frames of', round(shots[0][1]), 'ms')


if __name__ == '__main__':
    main()
