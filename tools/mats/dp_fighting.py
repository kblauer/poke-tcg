"""Makes up the Diamond/Pearl set's fighting mat (apps/web/public/mats/dp/fighting.png, fighting.json), as dp_mats.py
makes the others: a scene of 48 by 28 tiles built from Diamond's own pieces (pret/pokediamond), drawn tilted by the HGSS
maps' renderer at the Sinnoh run maps' tilt.

Fighting: Diamond's Victory Road, laid out as the FireRed/LeafGreen set's fighting mat (frlg_mats.py's `fighting_arena`:
Emerald's Victory Road B2F, its plateau made taller), so both sets match. Every texture is Victory Road's (area data 43's
texture set, 42, which Wayward Cave shares; its land data chunks 384 and 394, 1F's and B1F's top left):
- a raised plateau under the cards, two tiers above the cave's floor (`TIERS`): its top uneven (dp_mats.py's `rough`,
  about FireRed's plateau's footprint), the tier under it a tile round it and wider in places along the bottom, so its
  faces step down as the 1F's terraces and FireRed's cliffs below its plateau do (`terraces`);
- the cave's cliff faces as Victory Road builds them (`cave_cliffs`): a tile down from each top's edge (dp_mats.py's
  PROFILE), each side its own texture as the pits' walls are (dun_wall_n facing south, dun_wall_s north, dun_wall_e
  west, dun_wall_w east: `FACES`), dun_wall_c round the outside corners (dp_mats.py's `corner`), the floors dun_floor;
- the cave's water along the top, as FireRed's is, deeper at the sides (`water_line`), half a tile below the floor
  (dun_sea, moving as the game's: fld_anime9, 8 steps), its bank B1F's (dun_sside, its lip and drop: BANK);
- 1F's wooden bridges (dun_hashi, 40 units wide, at the plateau's height) out to either side where FireRed's are, each
  from a rock pillar of the plateau's height at the picture's edge (`BRIDGES`), ending flush with both tops on a tile's
  edge as 1F's do (chunk 384's: the top's edge straight across the bridge's rows, its faces going on down under the
  bridge), the plateau's edge made straight there and a row past either side (`flush`), its shadow on whatever is
  under it, the floors and down the faces alike (dun_shadow, see-through as the game's: `shadow`, `surface`);
- Victory Road's boulders and small rocks (dun_imped's, dp_mats.py's `boulder` and `stone`) on the lower floor, in the
  water and near the plateau's edges, clear of the cards (`ROCKS`);
- its floor dressing, lifted whole from its chunks (`DRESSING`, `lift`): 1F's round rock knobs (chunk 386, a dome of
  dun_wall_c) on the lower floor clear of the faces, the bridges and the rocks (`DRESS`, `dress`). (2F's ledges, its
  dun_jump and dun_allpeak pieces, were tried and taken out: the user's, 2026-11-08, ledges there made no sense.)
Lit as the cave's chunks are (their vertex colours: `light`, FACE_LIGHT), but lighter, as the other DP mats are, its
faces' shadows a little softer (SHADE), so the scene reads at the mat's size. Drawn with the plateau's top on the tile grid (`GROUND`), as dp_mats.py's
arena floors are.

Usage: python tools/mats/dp_fighting.py [--apicula <exe>] [--cache <dir>] [--out <dir>] [--preview <png>]
Writes <out>/fighting.png (apps/web/public/mats/dp/ by default), a vertical sheet of the scene's frames (768 by 448
each, one a step of the water's animation), and fighting.json ({width, height, frames: [{y, ms}]}), through dp_mats.py's
`write`; --preview: the first frame as a PNG too. The decompilation's files are cached in <cache> (the system's temp
folder's pokediamond/ by default). Needs numpy, Pillow and apicula (the Nintendo DS model converter) on the PATH or given."""
import os, random, re, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import dp_mats as dm
from dp_mats import T, W, H, Mat, SIDES, CORNERS, face_side, face_corner, segments, boulder, stone, rough
from render_hgss import Scene, REPEAT

VICTORY_ROAD = 42  # the area's texture set (area data 43's)
VR_CHUNKS = (384, 394)  # 1F's top left chunk (the bridges) and B1F's (the water and its bank)
DUN_SEA = 9  # fld_anime9: the caves' water
FLOOR = 16  # the cave's floor; each tier a tile above it, the water half a tile below
TIERS = 2
WATER = 8
GROUND = FLOOR + TIERS * T  # drawn with the plateau's top on the grid
# The cave's lighting, as its chunks' vertex colours have it, over the floors' (0.62, here 1: the scene drawn that much
# lighter than the game's, as the other DP mats are): a face's from its top's edge down (its texture's v: the top's
# edge as the floor, darkening to 0.13 near its foot, the floor's again at it), softened by SHADE so the faces read at
# the mat's size; the bank's foot tinted the water's colour (B1F's 0, 1, 1).
FACE_LIGHT = [(0.0, 1.0), (0.12, 0.33 / 0.62), (0.81, 0.13 / 0.62), (1.0, 1.0)]
SHADE = 0.8
WATER_LIGHT = 0.85  # the water a little darker than the floors, as the game's reads beside them
STEP_LIGHT = [(0.5, 1.0), (0.625, 1.0), (0.875, 0.125 / 0.62), (1.0, 1.0)]  # the stairs' (their treads' edges dark)
BANK_FOOT = (0.0, 1.0 / 0.62, 1.0 / 0.62)
# The faces by the way they look (out x, out z), as Victory Road's pits name them by the wall they are.
FACES = {(0, 1): 'dun_wall_n', (1, 0): 'dun_wall_w', (0, -1): 'dun_wall_s', (-1, 0): 'dun_wall_e'}
# B1F's bank from a floor's edge down to its water (out, down, v): a lip a little up, then down to just above the water
# (the real one starts its lip 4 units in; here a unit out, so its outside corners round as the faces' do).
BANK = [((0, 0, 0.0), (1, -2, 0.25), 0), ((1, -2, 0.25), (2, 0, 0.5), 0), ((2, 0, 0.5), (4, 7, 1.0), 0)]
# How far down the ground is that far out from a top's edge (out, down: a face's, PROFILE's) or a floor's (its bank's).
FACE_DROP = [(o, d) for o, d, _ in dm.PROFILE]
BANK_DROP = [a[:2] for a, _, _ in BANK] + [BANK[-1][1][:2]]
# The extended grid the scene is laid out on: tiles a few past every edge, so the lower floor and the water fill the
# picture's edges once it's drawn with the plateau on the grid.
Z0, Z1, X0, X1 = -4, H + 3, -3, W + 3
# The bridges (FireRed's, beside the plateau): their middle (model units down the scene) and the pillar's columns at the
# edge they come from (its top's x0..x1 and z0..z1 tiles, inclusive).
BRIDGES = [(11.5 * T, (-3, 0, 8, 14)), (14 * T, (W - 1, W + 2, 11, 17))]
STAIR_COLUMNS = range(33, 20, -1)  # where the stairs may go (their left column), the first that fits
# Victory Road's rocks (boulders, 2 tiles; stones, a tile), where FireRed's rocks and rubble are: on the lower floor
# (FLOOR), in the water (WATER) and near the plateau's top edges (its height); placed by hand round this layout.
ROCKS = [(boulder, 1, 21, 'floor'), (boulder, 44, 23, 'floor'), (boulder, 4, 25, 'floor'), (boulder, 40, 25, 'floor'), (boulder, 14, 0, 'water'),
         (boulder, 43, 1, 'water'), (stone, 6, 18, 'floor'), (stone, 3, 2, 'water'), (stone, 46, 20, 'floor'), (stone, 2, 17, 'floor'),
         (stone, 13, 26, 'floor'), (stone, 28, 26, 'floor'), (stone, 42, 9, 'floor'), (stone, 5, 9, 'floor'), (stone, 30, -1, 'water'),
         (boulder, 10, 6, 'top'), (stone, 36, 21, 'top'), (stone, 37, 7, 'top'), (stone, 10, 20, 'top')]
# Victory Road's own floor dressing, lifted whole from its chunks (the triangles of one texture in a box, with their
# texture coordinates and vertex colours): (land data chunk, texture, the box's corner (x, its floor's y, z, model
# units), its size in tiles across and down). 1F's round rock knob (a dome of the faces' corner texture, 2 tiles).
DRESSING = {'knob': (386, 'dun_wall_c', (0, -48, 96), (2, 2))}
# Where they go (their top left tile): on the lower floor clear of the faces, the bridges and the rocks; placed by hand
# round this layout (`dress` checks).
DRESS = [('knob', 4, 15, 'floor'), ('knob', 43, 18, 'floor')]


class CaveMat(Mat):
    """dp_mats.py's Mat, drawn with the plateau's top on the grid, and some keys see-through (the bridges' shadow)."""

    def __init__(self, tex, anim=None, alpha=None):
        super().__init__(tex, anim)
        self.alpha, self.lit = alpha or {}, []

    def piece(self, pos, uv, col, key):
        """Triangles lit by their own vertex colours (a piece lifted from a chunk, `lift`)."""
        self.lit.append((pos, uv, col, key))

    def render(self, step=0, ground=GROUND):
        scene = Scene(W * 16, H * 16, tilt=dm.TILT, ground=ground)
        for pos, uv, key in self.parts:
            frames = self.anim.get(key)
            tex = frames[step % len(frames)] if frames else self.tex[key]
            scene.mesh(pos, uv, light(key, uv), tex, (REPEAT, REPEAT), self.alpha.get(key, 1.0), key in self.alpha)
        for pos, uv, col, key in self.lit:
            scene.mesh(pos, uv, col, self.tex[key], (REPEAT, REPEAT))
        scene.draw()
        return (np.clip(scene.img, 0, 1) * 255).astype(np.uint8)


def light(key, uv):
    """Each vertex's colour (FACE_LIGHT, BANK_FOOT), by its texture's v on a face or the bank; 1 elsewhere."""
    v = uv[:, 1]
    if key.startswith('dun_wall'):
        k = 1 - (1 - np.interp(v, *zip(*FACE_LIGHT))) * SHADE
        return np.repeat(k[:, None], 3, 1)
    if key == 'dun_sea':
        return np.full((len(uv), 3), WATER_LIGHT)
    if key == 'dun_step':
        k = 1 - (1 - np.interp(v, *zip(*STEP_LIGHT))) * SHADE
        return np.repeat(k[:, None], 3, 1)
    if key == 'dun_sside':
        t = np.clip((v - 0.5) / 0.5, 0, 1)[:, None]
        return (1 - t) + t * np.array(BANK_FOOT)
    return np.ones((len(uv), 3))


def lift(a, name):
    """A DRESSING piece: its triangles (positions from its box's corner), texture coordinates and colours (the chunk's
    vertex colours over its floors' 0.62, softened by SHADE as the faces are), and its texture."""
    land, key, (cx, cy, cz), (w, h) = DRESSING[name]
    pos, uv, col = [], [], []
    for p in a.chunk(land, VICTORY_ROAD):
        if re.sub(r'_lm\d+$', '', p['material']) != key:
            continue
        for i in range(0, len(p['pos']), 3):
            c = p['pos'][i:i + 3].mean(0)
            if cx <= c[0] <= cx + w * T and cz <= c[2] <= cz + h * T:
                pos.append(p['pos'][i:i + 3]); uv.append(p['uv'][i:i + 3]); col.append(p['col'][i:i + 3])
    pos, col = np.vstack(pos) - (cx, cy, cz), 1 - (1 - np.vstack(col) / 0.62) * SHADE
    return pos, np.vstack(uv), col, key


def dress(m, a, ground):
    """The DRESS pieces, each on its tiles (`ground`: by where, the tiles it may stand on and their height)."""
    for name, x, z, where in sorted(DRESS, key=lambda d: d[2]):
        pos, uv, col, key = lift(a, name)
        ok, y = ground[where]
        w, h = DRESSING[name][3]
        if not all(at(ok, x + dx, z + dz) for dx in range(w) for dz in range(h)):
            raise RuntimeError(f'{name} at {x}, {z} is off its {where}')
        m.piece(pos + (x * T, y, z * T), uv, col, key)


def grid(fill=False):
    """A mask over the extended grid, indexed [z - Z0][x - X0]."""
    return np.full((Z1 - Z0, X1 - X0), fill)


def at(mask, x, z):
    return Z0 <= z < Z1 and X0 <= x < X1 and bool(mask[z - Z0, x - X0])


def grow(mask, r=1):
    """The mask with every tile within r tiles of it (a square round each; nothing wraps round the grid's edges)."""
    p, (h, w), out = np.pad(mask, r), mask.shape, mask.copy()
    for dz in range(2 * r + 1):
        for dx in range(2 * r + 1):
            out |= p[dz:dz + h, dx:dx + w]
    return out


def fill_gaps(mask):
    """Tiles with land on three or four sides, or on two opposite ones, made land (no notch or channel a tile wide,
    which the faces can't be built round)."""
    while True:
        p = np.pad(mask, 1)
        n, s, w, e = p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]
        add = ~mask & (((n.astype(int) + s + w + e) >= 3) | (n & s) | (w & e))
        if not add.any():
            return mask
        mask = mask | add


def edged(m, mask, y, segs, faces, keyed=False, skip=()):
    """Faces (`segs`, dp_mats.py's `segments`' kind) down from each edge of the mask's tiles at height y that borders
    open ground, rounded round its outside corners, as dp_mats.py's `cliffs` does; `faces` a key, or by the way out;
    `skip`: tiles whose south edge has none (the stairs take it)."""
    for z in range(Z0, Z1):
        for x in range(X0, X1):
            if not at(mask, x, z):
                continue
            xs, zs = (x * T, (x + 1) * T), (z * T, (z + 1) * T)
            for a, b, (ox, oz) in SIDES:
                if not at(mask, x + ox, z + oz) and not ((ox, oz) == (0, 1) and (x, z) in skip):
                    face_side(m, (xs[a[0]], zs[a[1]]), (xs[b[0]], zs[b[1]]), (ox, oz), y, segs, [FACES[ox, oz] if keyed else faces])
            for c, sx, sz in CORNERS:
                if not at(mask, x + sx, z) and not at(mask, x, z + sz):
                    face_corner(m, (xs[c[0]], zs[c[1]]), sx, sz, y, segs, ['dun_wall_c' if keyed else faces])


def flats(m, mask, y, key='dun_floor'):
    for z in range(Z0, Z1):
        for x in range(X0, X1):
            if at(mask, x, z):
                m.flat(x, z, y, key)


def water_line(rng, plateau):
    """The water along the top: the rows above the lower floor's, per column. Over the plateau, up to its lowest tier's
    foot (or a tile short of it), so its faces rise from the water's bank, as FireRed's plateau rises from its water; at
    the sides, as FireRed's, deeper (to rows 5-8); in runs of a few columns, its edge stepping rather than jagged."""
    line, x = {}, X0
    while x < X1:
        # In runs of 3 to 6 columns, so its edge steps rather than jags.
        run, deeper = rng.randint(3, 6), rng.random() < 0.35
        side = (6 if x < 8 else 7) + rng.choice((-1, 0, 1))
        for xx in range(x, x + run):
            tops = [z for x2 in range(xx - 2, xx + 3) for z in range(Z0, Z1) if at(plateau, x2, z)]
            line[xx] = min(tops) - 1 - deeper if tops and 8 <= xx <= 40 else side
        x += run
    # The sides' edge meets the plateau's with a step at most two tiles at a time.
    for xs in (range(8, X0 - 1, -1), range(40, X1)):
        prev = None
        for x in xs:
            if prev is not None and abs(line[x] - prev) > 2:
                line[x] = prev + (2 if line[x] > prev else -2)
            prev = line[x]
    return {x: z for x, z in line.items() if X0 <= x < X1}


# 1F's stairs down a face (dun_step, 32 units across, a tier half its texture's height): across them, the points from
# one edge (x along them) and whether each is on an edge (the faces' profile there, PROFILE's) or the treads' slope; down
# a tier, how far out (z) each row is, how far down at the edges and in the middle, and its v.
STEP_X = [(0, True), (4, False), (28, False), (32, True)]
STEP_ROWS = [(0, 0, 0, 0.5), (4, 2, 4, 0.625), (12, 14, 12, 0.875), (16, 16, 16, 1.0)]


def stairs(m, x, z, y, tiers=2):
    """1F's stairs down from the south edge of tile x, z (2 tiles wide: x and x + 1) at height y, `tiers` tiers down a
    face, as the real map sets them into its faces."""
    X, Z = x * T, (z + 1) * T
    for k in range(tiers):
        for (o0, de0, dm0, v0), (o1, de1, dm1, v1) in zip(STEP_ROWS, STEP_ROWS[1:]):
            for (a, ea), (b, eb) in zip(STEP_X, STEP_X[1:]):
                pt = lambda xo, edge, o, de, dmid: (X + xo, y - k * T - (de if edge else dmid), Z + k * T + o)
                m.quad([pt(a, ea, o0, de0, dm0), pt(b, eb, o0, de0, dm0), pt(b, eb, o1, de1, dm1), pt(a, ea, o1, de1, dm1)],
                       [(1 - a / 32, v0), (1 - b / 32, v0), (1 - b / 32, v1), (1 - a / 32, v1)], 'dun_step')


def bridge(m, x0, x1, zc, y):
    """1F's wooden bridge from x0 to x1 (model units) along x, 40 units wide about zc, at height y (dun_hashi's right
    half, mirrored across it, a repeat every 64 units along it), and its shadow on what's under it (dun_shadow)."""
    for za, zb, ua, ub in ((zc - 20, zc, 0.5, 0.8125), (zc, zc + 20, 0.8125, 0.5)):
        m.quad([(x0, y, za), (x1, y, za), (x1, y, zb), (x0, y, zb)], [(ua, x0 / 64), (ua, x1 / 64), (ub, x1 / 64), (ub, x0 / 64)], 'dun_hashi')


def bridge_rows(zc, margin=0):
    """The rows a bridge 40 units wide about zc covers (any part of), and `margin` more on either side."""
    return range(int((zc - 20) // T) - margin, int(-(-(zc + 20) // T)) + margin)


def flush(top, zc, left):
    """Where a bridge about zc meets the plateau's top, coming from the left (`left`) or the right: the top's edge
    column (its first column from the left, its last from the right), the one reaching furthest across the rows the
    bridge covers, and the tiles to add so every one of those rows reaches it (the edge straight under the bridge's
    end, as 1F's are where their bridges come in), and a row past it either side, so the faces' corners are clear of it."""
    rows = bridge_rows(zc, 1)
    first = {z: (min if left else max)(x for x in range(8, 40) if at(top, x, z)) for z in rows}
    edge = (min if left else max)(first.values())
    return edge, [(x, z) for z in rows for x in (range(edge, first[z]) if left else range(first[z] + 1, edge + 1))]


def surface(levels, x, z):
    """The height of the ground at point x, z (model units): on a level's tiles its height, within a tile of them its
    faces' (or its bank's) drop that far out, the nearest tile's (rounded round outside corners, as the faces are), the
    highest of them all; the water's elsewhere. `levels`: (mask, height, [(out, down)]) each."""
    h = WATER
    for mask, y, drop in levels:
        d = min((np.hypot(max(tx * T - x, 0, x - (tx + 1) * T), max(tz * T - z, 0, z - (tz + 1) * T))
                 for tx in range(int(x // T) - 2, int(x // T) + 3) for tz in range(int(z // T) - 2, int(z // T) + 3) if at(mask, tx, tz)), default=None)
        if d is not None and d <= drop[-1][0]:
            h = max(h, y - np.interp(d, *zip(*drop)))
    return h


def shadow(m, x0, x1, zc, height, step=4):
    """A bridge's shadow on what's under it (dun_shadow, as 1F's: on the floors and down the faces alike), in pieces
    `step` units square, each corner at the ground's height there (`height`)."""
    xs, zs = np.arange(x0, x1 + 0.01, step), np.arange(zc - 20, zc + 20.01, step)
    hs = [[height(x, z) + 0.1 for x in xs] for z in zs]
    for j in range(len(zs) - 1):
        for i in range(len(xs) - 1):
            (a, b), (c, d) = (xs[i], xs[i + 1]), (zs[j], zs[j + 1])
            m.quad([(a, hs[j][i], c), (b, hs[j][i + 1], c), (b, hs[j + 1][i + 1], d), (a, hs[j + 1][i], d)], [(0, 0), (1, 0), (1, 1), (0, 1)], 'dun_shadow')


def fighting_scene(a, rng):
    """Victory Road: its plateau two tiers above the cave's floor under the cards, its faces stepping down round it, the
    cave's water along the top, bridges out to pillars at the sides, boulders and rocks. The scene and its steps."""
    tex = {}
    for land in VR_CHUNKS + tuple({d[0] for d in DRESSING.values()}):
        tex.update(a.textures(land, VICTORY_ROAD))
    frames, steps = a.anim(DUN_SEA)
    m = CaveMat(tex, {'dun_sea': frames}, {'dun_shadow': 0.387})
    y0, y1, x0, x1 = dm.ARENA
    # The plateau's top (rough's island, about FireRed's plateau's footprint), on the extended grid.
    top = grid()
    top[-Z0:-Z0 + H, -X0:-X0 + W] = rough(rng, y0 + 1, y1, x0 + 1, x1 - 1)
    top = fill_gaps(top)
    # Where a bridge comes in, its edge straight across every row the bridge covers (out to the row that reaches
    # furthest), so the bridge ends on it, as 1F's do (`flush`).
    for zc, (px0, px1, pz0, pz1) in BRIDGES:
        for x, z in flush(top, zc, px0 < 0)[1]:
            top[z - Z0, x - X0] = True
    top = fill_gaps(top)
    # The tier under it: a tile round it, two or three in stretches along its bottom (FireRed's cliffs step down there).
    mid = grow(top)
    x = x0
    while x < x1:
        w = rng.randint(3, 7)
        if rng.random() < 0.6:
            for xx in range(x, x + w):
                bottom = max((z for z in range(Z0, Z1) if at(mid, xx, z)), default=None)
                if bottom is not None:
                    for k in range(1, rng.choice((1, 2, 2)) + 1):
                        mid[bottom + k - Z0, xx - X0] = True
        x += w + rng.randint(1, 4)
    mid = fill_gaps(mid)
    # The bridges' pillars at the picture's edges, each a top of the plateau's height and its tier round it.
    for _, (px0, px1, pz0, pz1) in BRIDGES:
        top[pz0 - Z0:pz1 + 1 - Z0, px0 - X0:px1 + 1 - X0] = True
    mid = fill_gaps(mid | grow(top))
    # The stairs down the plateau's front (where FireRed's ladder is): two columns whose top ends on one row, the tier
    # under them a tile deep there, so they go down both tiers at once.
    bottom = lambda mask, x: max(z for z in range(Z0, Z1) if at(mask, x, z))
    for sx in STAIR_COLUMNS:
        if len({bottom(top, x) for x in range(sx - 1, sx + 3)}) == 1:
            break
    else:
        raise RuntimeError("no straight stretch of the plateau's front for the stairs")
    sz = bottom(top, sx)
    for x in range(sx - 1, sx + 3):
        mid[sz + 2 - Z0:, x - X0] = False
    mid = fill_gaps(mid)
    # The lower floor: everything but the water along the top.
    line = water_line(rng, mid)
    floor = grid(True)
    for xx, z in line.items():
        floor[:max(0, z - Z0), xx - X0] = False
    floor = fill_gaps(floor)
    # The water under everything (dp_mats.py's `sea`, the extended grid's size), then the floors and faces from the bottom up.
    sx0, sz0, sx1, sz1 = X0 * T, Z0 * T, X1 * T, Z1 * T
    m.quad([(sx0, WATER, sz0), (sx1, WATER, sz0), (sx1, WATER, sz1), (sx0, WATER, sz1)], [(sx0 / 16, sz0 / 16), (sx1 / 16, sz0 / 16), (sx1 / 16, sz1 / 16), (sx0 / 16, sz1 / 16)], 'dun_sea')
    water_rocks = [(put, x, z) for put, x, z, where in ROCKS if where == 'water']
    for put, x, z in sorted(water_rocks, key=lambda r: r[2]):
        put(m, x, z, y=WATER, key='dun_imped')
    flats(m, floor & ~mid, FLOOR)
    edged(m, floor, FLOOR, BANK, 'dun_sside')
    floor_rocks = [(put, x, z) for put, x, z, where in ROCKS if where == 'floor']
    for put, x, z in sorted(floor_rocks, key=lambda r: r[2]):
        put(m, x, z, y=FLOOR, key='dun_imped')
    flats(m, mid & ~top, FLOOR + T)
    edged(m, mid, FLOOR + T, segments(1), None, keyed=True, skip={(sx, sz + 1), (sx + 1, sz + 1)})
    flats(m, top, GROUND)
    edged(m, top, GROUND, segments(1), None, keyed=True, skip={(sx, sz), (sx + 1, sz)})
    stairs(m, sx, sz, GROUND)
    top_rocks = [(put, x, z) for put, x, z, where in ROCKS if where == 'top']
    for put, x, z in sorted(top_rocks, key=lambda r: r[2]):
        put(m, x, z, y=GROUND, key='dun_imped')
    # The floor's dressing: on the lower floor clear of the tier's faces, or on the plateau's top.
    dress(m, a, {'floor': (floor & ~grow(mid), FLOOR), 'top': (top, GROUND)})
    # The bridges, from each pillar's inner edge to the plateau's, ending flush with both tops (as 1F's: the faces go on
    # under them), and their shadows on whatever is under them.
    levels = [(top, GROUND, FACE_DROP), (mid, FLOOR + T, FACE_DROP), (floor, FLOOR, BANK_DROP)]
    for zc, (px0, px1, pz0, pz1) in BRIDGES:
        edge = flush(top, zc, px0 < 0)[0]
        start, end = ((px1 + 1) * T, edge * T) if px0 < 0 else ((edge + 1) * T, px0 * T)
        shadow(m, start, end, zc, lambda x, z: surface(levels, x, z))
        bridge(m, start, end, zc, GROUND)
    return m, steps


def fighting_frames(a, rng):
    """The scene drawn once a step of its water's animation: [(rgb, ms)]."""
    m, steps = fighting_scene(a, rng)
    return [(m.render(frame), ticks * dm.TICK_MS) for frame, ticks in steps]


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    dm.OUT = opt('--out', dm.OUT)
    preview = opt('--preview', None)
    a = dm.Assets(apicula, cache, os.path.join(tempfile.gettempdir(), 'pokeplatinum'))
    m, steps = fighting_scene(a, random.Random('fighting'))
    if preview:
        Image.fromarray(m.render(steps[0][0])).save(preview)
    dm.write('fighting', m, steps)


if __name__ == '__main__':
    main()
