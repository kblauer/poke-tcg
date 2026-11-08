"""Makes up the Diamond/Pearl Metal mat (apps/web/public/mats/dp/metal.png, metal.json), as dp_mats.py makes the others
(a scene of 48 by 28 tiles built from Diamond's own textures and pieces, drawn tilted by the HGSS maps' renderer), laid
out as the FireRed/LeafGreen one (frlg_metal.py: Emerald's Seaside Cycling Road looping round the cards over the sea,
two Bikers riding round it) but with Sinnoh's Cycling Road, Route 206's (the user's: as like the FRLG mats as can be,
with DPP's pieces):
- the bridge: Route 206's elevated road (its land data chunk 29, texture set 7, the area's), built as its chunk builds
  it, a cross-section swept round the loop: its deck (r206_cy2, the darker r206_cy2b just inside a rail where the rail's
  shadow falls, west and north, as the real one's west strip), the dashed line down its middle (r206_cy6), its walls
  (r206_cy4b's grey and orange stripe, r206_cy5b's blue band over it, r206_cy5c's pale top, 2 tiles high as the real
  ones), and its blue pillars (r206_pol1 and pol2, lifted whole from the chunk: `pillar`) beside it along the straight
  runs. Diamond's road is 10 tiles wide and only runs north and south, with no turns: here it's 5 (a lane each side of
  the dashes; HALF), and turns square, the deck and walls laid as cells round the centre line (`cells`: a cell is deck
  or wall by how far it is from the line, square round the corners, as Route 110's turns are). The real road has no
  underside (its walls stand on the deck, the ground far below): a wall looking down the picture has a girder of the
  walls' blue under the deck (GIRDER), and the sea shows under the rest.
- the loop: FireRed's skewed Z (frlg_metal.py's `LOOP`): the top run along row 3 and the bottom along row 24, the left
  side stepping out 6 columns at row 15 and the right one in 6 at row 13, the outer walls of the right upper side and the
  left lower one off the frame's sides, its corners square. The cards' middle (rows 5-23, columns 10-37) is clear of it
  but for the top run's inner wall and the bottom run's (half a row each), as FireRed's faces are. Its length is set by
  the riders' (below): the centre line 132 tiles round, so the lane (half a tile in from it) is 128.
- the ways off: the road goes on north at column 27 and south at column 14 (FireRed's, `NORTH`, `SOUTH`), out of the
  frame, its walls open where they meet the loop.
- under it: the sea, as FireRed's (Route 206's bridge stands on grass and over a river; the sea reads as the FRLG mat's
  and keeps the cards' middle calm): Route 222's (dp_mats.py's `sea`, ROUTE_222), moving as the game's (fld_anime0: 8
  steps), here a step every 8 field frames (the game's 9: so it loops in the sheet, as FireRed's sea every 16 game
  frames), three and a half tiles below the deck (SEA_Y, DECK: high enough for the pillars to show), shaded under the road and below and right of it (SHADOW: as
  FireRed's), Route 222's sea rocks where FireRed's are (frlg_metal.py's `ROCKS`, `SHADED_ROCKS`; any under the road
  left out).
- the riders: Diamond's Cyclist (its overworld sprite `cyclem`, apps/web/public/overworld/dp/cyclem.png, made by
  ../routes/dp/dp_sprites.py: facing down, up and left (right is left flipped), each with two pedalling frames), two of them across the
  loop from each other riding clockwise as FireRed's Bikers (frlg_metal.py's STEP, SPEED, FRAMES, PEDAL: a frame every
  8 game frames, 4 px a frame, 256 frames, each rider going half the way round, so each ends where the other began and
  the sheet loops), in the lane half a tile in from the dashes (`lane`), each drawn in the scene (`ride`): a wall in
  front of a rider hides its wheels, as the game's would. Both the same sprite (a second would swap at the loop).

Usage: python tools/mats/dp_metal.py [--apicula <exe>] [--cache <dir>] [--pt-cache <dir>] [--out <dir>] [--preview <png>]
Writes <out>/metal.png (apps/web/public/mats/dp/ by default) and metal.json through frlg_mats.py's `save` (a sheet of the
frames, in columns as it's taller than SHEET_HEIGHT, each row's frames at the same step of the sea: `packed`; {width, height, frames: [{x, y, ms}]}); --preview: the first frame
as a PNG too. The decompilations' files are cached as dp_mats.py's are. Needs numpy, Pillow and apicula."""
import argparse, os, re, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
import dp_mats as dm
import frlg_mats as fm
import frlg_metal
from dp_mats import T, W, H, Mat, sea_rock
from render_hgss import Scene, REPEAT, turned

ROUTE_206 = (29, 7)  # MAP_ROUTE_206's Cycling Road chunk (its straight run, the pillars) and texture set 7 (the area's)
SEA_Y = 8  # the sea (dp_mats.py's `sea`)
DECK = SEA_Y + 56  # the road's deck, three and a half tiles above it (drawn on the tile grid)
WALL, BAND = 32, 24  # the walls' height over the deck (the real ones') and their striped face's (r206_cy4b), the blue band above it
GIRDER = 8  # the blue girder under a wall looking down the picture
HALF = 40  # model units from the centre line to the road's outer edge: 5 tiles across, a wall 8 units thick each side
CELL = 8  # the deck and walls are laid in cells of 8 units (half a tile: the walls' thickness)
DASH = 48  # the dashes stop this far short of a run's ends (clear of the turns)
# The centre line, clockwise from the top left (tiles: x, z; on half tiles, so the road's edges are on the grid):
# FireRed's skewed Z (frlg_metal.py's LOOP), its jogs 6 tiles, the right side's at row 13, the left's at row 15.
LOOP = [(7.5, 3), (46.5, 3), (46.5, 13), (40.5, 13), (40.5, 24), (1.5, 24), (1.5, 15), (7.5, 15)]
NORTH, SOUTH = 27.5, 14.5  # the ways off (centre lines), FireRed's columns 27 and 14
LANE_IN = 0.5  # tiles in from the centre line the riders ride (the loop's lane 128 tiles round: two riders, SPEED * FRAMES each)
SHADOW = (2, 3)  # cells right and down the bridge's shadow falls on the sea
SHADE = 0.3  # how dark it is (Route 206's pillar shadow, h_kage, is 0.29)
DROP = round((DECK - SEA_Y) * 0.6 / T)  # tiles lower the sea's drawn than the deck's grid (TILT's): the rocks moved up by it, so they show where FireRed's are
PILLAR_EVERY = 8  # tiles between pillars along a run (the real road's are 16 apart: it's 10 tiles wide)
PILLAR_UP = 16  # how far the pillars below a run stand in under it (a tile, the user's)
CALM = (5, 24, 10, 38)  # the cards' middle: rows and columns, end exclusive
STEP, SPEED, FRAMES, PEDAL = frlg_metal.STEP, frlg_metal.SPEED, frlg_metal.FRAMES, frlg_metal.PEDAL
SEA_EVERY = 2  # sheet frames a step of the sea (8 field frames, 16 game frames)
RIDER_START = 12 * 16  # px along the lane the first rider starts (on the top run; the other half the way round)
CYCLIST = os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'overworld', 'dp', 'cyclem.png')
# The strip's frames (dp_sprites.py's: standing down, up, left, right, then each way's two pedalling frames). Its right
# frames face left as well (Diamond's sheet: the game flips them), so right is left flipped, as frlg_metal.py's is.
FACING = dict(down=(0, 4, 5), up=(1, 6, 7), left=(2, 8, 9), right=(2, 8, 9))


class BridgeMat(Mat):
    """dp_mats.py's Mat drawn with the deck on the grid, some keys see-through (the shadow), and its depths kept."""

    def __init__(self, tex, anim=None, alpha=None):
        super().__init__(tex, anim)
        self.alpha = alpha or {}

    def render(self, step=0, ground=DECK):
        scene = Scene(W * 16, H * 16, tilt=dm.TILT, ground=ground)
        for pos, uv, key in self.parts:
            frames = self.anim.get(key)
            tex = frames[step % len(frames)] if frames else self.tex[key]
            scene.mesh(pos, uv, np.ones((len(pos), 3)), tex, (REPEAT, REPEAT), self.alpha.get(key, 1.0), key in self.alpha)
        scene.draw()
        return (np.clip(scene.img, 0, 1) * 255).astype(np.uint8), scene.depth.copy()


def centre_lines():
    """The road's centre line as axis-aligned runs (model units): the loop's, then the ways off."""
    pts = LOOP + LOOP[:1]
    runs = list(zip(pts, pts[1:])) + [((NORTH, LOOP[0][1]), (NORTH, -4)), ((SOUTH, LOOP[4][1]), (SOUTH, H + 4))]
    return [((ax * T, az * T), (bx * T, bz * T)) for (ax, az), (bx, bz) in runs]


def cells(runs):
    """Each cell's kind (2 deck, 1 wall, 0 neither) and whether its nearest run goes across the picture, on a grid of
    CELL units from (X0, Z0): by its middle's distance from the nearest run, square (the larger of across and along past
    its end), so the turns and the ways off join square and a wall opens where another run's deck meets it."""
    xs = np.arange(X0, X1, CELL) + CELL / 2
    zs = np.arange(Z0, Z1, CELL) + CELL / 2
    px, pz = np.meshgrid(xs, zs)
    best, across = np.full(px.shape, np.inf), np.zeros(px.shape, bool)
    for (ax, az), (bx, bz) in runs:
        x0, x1, z0, z1 = min(ax, bx), max(ax, bx), min(az, bz), max(az, bz)
        d = np.maximum(np.maximum(np.maximum(x0 - px, px - x1), 0), np.maximum(np.maximum(z0 - pz, pz - z1), 0))
        nearer = d < best
        best, across = np.where(nearer, d, best), np.where(nearer, az == bz, across)
    kind = np.where(best < HALF - CELL, 2, np.where(best < HALF, 1, 0))
    return kind, across


X0, X1, Z0, Z1 = -4 * T, (W + 4) * T, -4 * T, (H + 4) * T  # the cells' grid: a few tiles past every edge


def pillar(a):
    """Route 206's pillar (its pol2 column and pol1 cap, the chunk's west one at z 48-80), its triangles and texture
    coordinates by texture, its top's middle at 0 and the road on its +x side."""
    out = {}
    for p in a.chunk(*ROUTE_206):
        key = re.sub(r'_lm\d+$', '', p['material'])
        if key not in ('r206_pol1', 'r206_pol2'):
            continue
        tri, uv = p['pos'].reshape(-1, 3, 3), p['uv'].reshape(-1, 3, 2)
        c = tri.mean(1)
        keep = (c[:, 0] < -96) & (c[:, 2] > 48) & (c[:, 2] < 80)
        out[key] = (tri[keep], uv[keep])
    top = max(t[..., 1].max() for t, _ in out.values())
    return {key: (tri - np.array([-104, top, 64]), uv) for key, (tri, uv) in out.items()}


def clip_below(tri, uv, y):
    """Triangles cut off below height y (their texture coordinates carried along)."""
    pos, tex = [], []
    for t, u in zip(tri, uv):
        poly = []
        for i in range(3):
            (p, q), (pu, qu) = (t[i], t[(i + 1) % 3]), (u[i], u[(i + 1) % 3])
            if p[1] >= y:
                poly.append((p, pu))
            if (p[1] >= y) != (q[1] >= y):
                k = (y - p[1]) / (q[1] - p[1])
                poly.append((p + k * (q - p), pu + k * (qu - pu)))
        for i in range(1, len(poly) - 1):
            pos += [poly[0][0], poly[i][0], poly[i + 1][0]]; tex += [poly[0][1], poly[i][1], poly[i + 1][1]]
    return np.array(pos).reshape(-1, 3), np.array(tex).reshape(-1, 2)


def calm(x0, z0, x1, z1):
    """Whether a box (model units) touches the cards' middle."""
    r0, r1, c0, c1 = (v * T for v in CALM)
    return x0 < c1 and x1 > c0 and z0 < r1 and z1 > r0


def pillar_spots(runs, kind):
    """Where the pillars stand: beside every run, both sides, every PILLAR_EVERY tiles (on the world's grid, so the
    runs agree), clear of the turns, the road, the cards' middle and the frame's outside. (x, z, the way out)."""
    spots = []
    for (ax, az), (bx, bz) in runs:
        horizontal = az == bz
        lo, hi = sorted((ax, bx) if horizontal else (az, bz))
        for t in np.arange(np.ceil((lo / T - 4) / PILLAR_EVERY) * PILLAR_EVERY + 4, hi / T, PILLAR_EVERY) * T:
            if t - lo < 3 * T or hi - t < 3 * T:
                continue
            for side in (-1, 1):
                x, z = (t, az + side * (HALF + CELL)) if horizontal else (ax + side * (HALF + CELL), t)
                out = (0, side) if horizontal else (side, 0)
                w, d = (2 * T, CELL) if horizontal else (CELL, 2 * T)
                box = (x - w / 2, z - d / 2, x + w / 2, z + d / 2)
                if (calm(*box) and out != (0, 1)) or box[2] < 0 or box[0] > W * T or box[3] < 0 or box[1] > H * T:
                    continue
                i0, i1 = int((box[1] - Z0) // CELL), int((box[3] - Z0 - 1) // CELL)
                j0, j1 = int((box[0] - X0) // CELL), int((box[2] - X0 - 1) // CELL)
                if kind[i0:i1 + 1, j0:j1 + 1].any():
                    continue
                spots.append((x, z, out))
    return spots


def metal_scene(a):
    """The scene: Route 222's sea, Route 206's road round the loop over it (`cells`: deck, walls, their faces looking down
    the picture, the dashes), its pillars, its shadow on the sea and the rocks. (mat, the sea's steps)."""
    tex = dict(a.textures(*dm.ROUTE_222))
    tex.update(a.textures(*ROUTE_206))
    sea_frames, _ = a.anim(dm.SEA)
    tex['shadow'] = np.zeros((1, 1, 4)) + [0, 0, 0, 1]
    m = BridgeMat(tex, {'sea': sea_frames}, {'shadow': SHADE})
    runs = centre_lines()
    kind, across = cells(runs)
    # The sea under everything (dp_mats.py's `sea`, reaching further up: drawn lower than the deck, it must still fill the top).
    x0, z0, x1, z1 = -T, -6 * T, (W + 1) * T, (H + 2) * T
    m.quad([(x0, SEA_Y, z0), (x1, SEA_Y, z0), (x1, SEA_Y, z1), (x0, SEA_Y, z1)], [(x0 / 16, z0 / 16), (x1 / 16, z0 / 16), (x1 / 16, z1 / 16), (x0 / 16, z1 / 16)], 'sea')
    nz, nx = kind.shape
    at = lambda i, j: kind[i, j] if 0 <= i < nz and 0 <= j < nx else 0
    rect = lambda x0, z0, x1, z1, y: [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
    # The shadow on the sea: the road's cells moved SHADOW, where there's no road over it.
    road = kind > 0
    si, sj = SHADOW[1], SHADOW[0]
    shade = np.zeros_like(road); shade[si:, sj:] = road[:-si, :-sj]
    for i, j in zip(*np.nonzero(shade | road)):
        x, z = X0 + j * CELL, Z0 + i * CELL
        m.quad(rect(x, z, x + CELL, z + CELL, SEA_Y + 0.2), [(0, 0)] * 4, 'shadow')
    # The rocks, FireRed's spots (row, column, where they show), any under the road (on the picture) or in its shadow
    # (on the sea) left out but the shaded one.
    for (r, c), shaded in [(s, False) for s in frlg_metal.ROCKS] + [(s, True) for s in frlg_metal.SHADED_ROCKS]:
        i, j, k = int((r * T - Z0) // CELL), int((c * T - X0) // CELL), int(((r - DROP) * T - Z0) // CELL)
        if road[max(0, i - 1):i + 5, max(0, j - 1):j + 5].any() or (shade[k:k + 4, j:j + 4].any() and not shaded):
            continue
        sea_rock(m, c, r - DROP, y=SEA_Y)
    for i, j in zip(*np.nonzero(kind)):
        x0, z0 = X0 + j * CELL, Z0 + i * CELL
        x1, z1 = x0 + CELL, z0 + CELL
        uv = (lambda x, z: (z / 16, x / 16)) if across[i, j] else (lambda x, z: (x / 16, z / 16))
        corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
        if kind[i, j] == 2:
            # The deck: darker (r206_cy2b) just inside a wall to its west or north, where the wall's shadow falls.
            key = 'r206_cy2b' if at(i, j - 1) == 1 or at(i - 1, j) == 1 else 'r206_cy2'
            m.quad(rect(x0, z0, x1, z1, DECK), [uv(x, z) for x, z in corners], key)
            if at(i + 1, j) == 0:
                m.quad([(x0, DECK - GIRDER, z1), (x1, DECK - GIRDER, z1), (x1, DECK, z1), (x0, DECK, z1)], [(0, 0)] * 4, 'r206_cy5b')
            continue
        # A wall: its pale top, and its face looking down the picture where there's no wall in front of it (its stripe,
        # its blue band, and a girder under the deck where it looks out over the sea).
        m.quad(rect(x0, z0, x1, z1, DECK + WALL), [(x / 16, z / 16) for x, z in corners], 'r206_cy5c')
        below = at(i + 1, j)
        if below == 1:
            continue
        m.quad([(x0, DECK, z1), (x1, DECK, z1), (x1, DECK + BAND, z1), (x0, DECK + BAND, z1)], [(x0 / 16, 1), (x1 / 16, 1), (x1 / 16, 0), (x0 / 16, 0)], 'r206_cy4b')
        m.quad([(x0, DECK + BAND, z1), (x1, DECK + BAND, z1), (x1, DECK + WALL, z1), (x0, DECK + WALL, z1)], [(0, 0)] * 4, 'r206_cy5b')
        if below == 0:
            m.quad([(x0, DECK - GIRDER, z1), (x1, DECK - GIRDER, z1), (x1, DECK, z1), (x0, DECK, z1)], [(0, 0)] * 4, 'r206_cy5b')
    # The dashes down the middle of each run, short of its ends.
    for (ax, az), (bx, bz) in runs:
        if az == bz:
            lo, hi = sorted((ax, bx))
            lo, hi = lo + DASH, hi - DASH
            m.quad([(lo, DECK + 0.5, az - 16), (hi, DECK + 0.5, az - 16), (hi, DECK + 0.5, az + 16), (lo, DECK + 0.5, az + 16)], [(0, lo / 32), (0, hi / 32), (1, hi / 32), (1, lo / 32)], 'r206_cy6')
        else:
            lo, hi = sorted((az, bz))
            lo, hi = lo + DASH, hi - DASH
            m.quad([(ax - 16, DECK + 0.5, lo), (ax + 16, DECK + 0.5, lo), (ax + 16, DECK + 0.5, hi), (ax - 16, DECK + 0.5, hi)], [(0, lo / 32), (1, lo / 32), (1, hi / 32), (0, hi / 32)], 'r206_cy6')
    # The pillars, turned so the road is on their inner side, their caps just under the deck, cut off at the sea.
    piece = pillar(a)
    turns = {(-1, 0): 0, (0, -1): -90, (1, 0): 180, (0, 1): 90}
    for x, z, out in pillar_spots(runs, kind):
        if out != (0, 1):
            continue  # (only under the runs across: beside the runs down the picture, seen side on, they looked wrong: the user's, 2026-11-08)
        if out == (0, 1):
            z -= PILLAR_UP  # (a tile up under the road, the user's, 2026-11-08: the deck in front of them, never over it)
        for key, (tri, uv) in piece.items():
            pos = turned(tri.reshape(-1, 3), ('y', turns[out])) + np.array([x, DECK - 5, z])
            pos, tex_uv = clip_below(pos.reshape(-1, 3, 3), uv, SEA_Y)
            m.tris(pos, tex_uv, key)
    return m, len(sea_frames)


def lane():
    """The riders' way round, clockwise (tiles): the loop's centre line LANE_IN in from it (each run moved towards the
    loop's inside, the corners where the moved runs meet)."""
    pts = LOOP + LOOP[:1]
    lines = []
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        dx, dz = np.sign(bx - ax), np.sign(bz - az)
        lines.append((ax - dz * LANE_IN, az + dx * LANE_IN, dz == 0))  # (the inside is a run's right: -dz, dx)
    out = []
    for prev, cur in zip(lines[-1:] + lines[:-1], lines):
        out.append((prev[0], cur[1]) if cur[2] else (cur[0], prev[1]))
    return out


def along(path, s):
    """Where a rider s px along the lane is (px) and which way it faces."""
    pts = path + path[:1]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        n = (abs(x1 - x0) + abs(z1 - z0)) * 16
        if s < n:
            dx, dz = np.sign(x1 - x0), np.sign(z1 - z0)
            return x0 * 16 + dx * s, z0 * 16 + dz * s, 'right' if dx > 0 else 'left' if dx < 0 else 'down' if dz > 0 else 'up'
        s -= n
    raise ValueError(s)


def cyclist():
    """The Cyclist's 12 frames (dp_sprites.py's strip) as 32x32 RGBA arrays."""
    a = np.asarray(Image.open(CYCLIST).convert('RGBA'))
    return [a[:, i:i + 32] for i in range(0, a.shape[1], 32)]


def ride(m, sea_steps):
    """The frames: the scene at each of its sea's steps, the two riders drawn into it (feet on the lane, each pixel of
    the sprite standing upright over them, hidden where the scene is nearer: a wall in front), as frlg_metal.py's
    `ride` (shots, order: the sheet's frames in order)."""
    base = [m.render(k) for k in range(sea_steps)]
    path = lane()
    length = sum((abs(x1 - x0) + abs(z1 - z0)) * 16 for (x0, z0), (x1, z1) in zip(path, path[1:] + path[:1]))
    group = SPEED * FRAMES
    assert length == 2 * group and FRAMES % (sea_steps * SEA_EVERY) == 0 and FRAMES % (4 * PEDAL) == 0, length
    pics = cyclist()
    tilt = dm.TILT
    shots = []
    for f in range(FRAMES):
        rgb, depth = base[f // SEA_EVERY % sea_steps]
        rgb = rgb.copy()
        for k in range(2):
            x, z, facing = along(path, (RIDER_START + k * group + f * SPEED) % length)
            still, a, b = FACING[facing]
            pic = pics[(a, still, b, still)[(f // PEDAL) % 4]]
            pic = pic[:, ::-1] if facing == 'right' else pic
            feet = int(z) + 6  # (the sprite's feet, its bottom row, a little below the lane's line, as the game stands them)
            top, left = feet - 31, int(x) - 16
            ys, xs = np.mgrid[top:top + 32, left:left + 32]
            ok = (ys >= 0) & (ys < H * 16) & (xs >= 0) & (xs < W * 16) & (pic[..., 3] > 0)
            # Each pixel's depth as the renderer's: upright over the feet, its height from how far up the picture it is.
            d = DECK + (feet - ys) / tilt + feet * tilt * 0.5
            ok[ok] &= d[ok] >= depth[ys[ok], xs[ok]] - 1
            rgb[ys[ok], xs[ok]] = pic[..., :3][ok]
        shots.append((rgb, STEP * 1000 / 60))
    return packed(shots, sea_steps)


def packed(shots, sea_steps):
    """The frames laid out for frlg_mats.py's `save` so that each row of its sheet's columns holds frames at the same
    step of the sea, side by side (they differ only by the riders, so the PNG's rows repeat and the sheet is a third the
    size), and the order to show them in: (shots, order). The rows left over hold copies of the first frame."""
    per = fm.SHEET_HEIGHT // (H * 16)
    cols = -(-len(shots) // per)
    run = len(shots) // sea_steps  # frames at each step of the sea
    assert run % cols == 0 and len(shots) // cols <= per, (run, cols, per)
    by_step = [[f for f in range(len(shots)) if f // SEA_EVERY % sea_steps == k] for k in range(sea_steps)]
    slots = [0] * (cols * per)
    for row in range(len(shots) // cols):
        group = by_step[row // (run // cols)]
        for c in range(cols):
            slots[c * per + row] = group[row % (run // cols) * cols + c]
    where = {f: s for s, f in enumerate(slots) if s % per < len(shots) // cols}
    return [shots[f] for f in slots], [where[f] for f in range(len(shots))]


def main():
    ap = argparse.ArgumentParser(description="Draws the battle table's Diamond/Pearl Metal mat.")
    ap.add_argument('--apicula', default='apicula')
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'pokediamond'))
    ap.add_argument('--pt-cache', default=os.path.join(tempfile.gettempdir(), 'pokeplatinum'))
    ap.add_argument('--out', default=dm.OUT, help='where the sheet goes (apps/web/public/mats/dp/ without it)')
    ap.add_argument('--preview', help="the first frame's picture")
    args = ap.parse_args()
    a = dm.Assets(args.apicula, args.cache, args.pt_cache)
    shots, order = ride(*metal_scene(a))
    fm.save('metal', shots, args.out, order)
    if args.preview:
        os.makedirs(os.path.dirname(os.path.abspath(args.preview)), exist_ok=True)
        Image.fromarray(shots[order[0]][0]).save(args.preview)
    print('metal', len(order), 'frames of', round(shots[0][1]), 'ms,', os.path.getsize(os.path.join(args.out, 'metal.png')), 'bytes')


if __name__ == '__main__':
    main()
