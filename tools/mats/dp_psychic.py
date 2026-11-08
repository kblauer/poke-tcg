"""Makes up the Diamond/Pearl Psychic mat, as dp_mats.py makes the others (a scene of 48 by 28 tiles built from Diamond's
own textures and pieces, drawn tilted by the HGSS maps' renderer), laid out as the FireRed/LeafGreen one (frlg_mats.py's
`psychic_arena`, Mt. Pyre's summit) but from Sinnoh's mountain town of shrines, Celestic Town (the user's: as like the
FRLG mats as can be, with DPP's pieces):
- the ground: Celestic Town's grass (its land data chunk's ngrass, texture set 10, Route 210's and the town's), its tall
  grass (Route 210 North's nectgr, the same set) in uneven patches where FireRed's are, on the floor and the high ground;
- the cliffs: built as Celestic Town's own (the town's middle is a floor two tiers below the ground round it, criffp
  faces a tile down and out a tier, its stairs two tiers): the shrine's floor in the middle where Mt. Pyre's ring of
  cliffs is, the ground round it two tiers up (`heights`), so each wall is the high ground's edge, one face looking down
  onto the floor (not a ridge faced both sides); three tiers behind the shrine (FireRed's raised back) and one along the
  bottom (`HIGHER`), each tile at most a tier above its neighbours, so the tiers stack into one taller face by the floor
  and step back further off, a ledge of grass between; the outline laid out tile by tile in straight runs stepping in
  and out, its corners cut in steps (`INNER_TOP`, `INNER_BOTTOM`, `INNER_LEFT`, `INNER_RIGHT`; the cards' middle, rows 5-23
  and columns 10-37, clear of faces but a corner's rounding); its faces as `cliffs` builds them, tier by tier (`ground`);
  the gaps where FireRed's are: Celestic Town's grass stairs (newstep, two tiers at 45 degrees, a tier the texture's
  height, as the town's are) up at the back's right to a landing and up each side (`STAIRS`, the faces they take left
  out), and the way in at the bottom the floor running out of the frame between two faces; knobs of the ridges' rock
  (its criff top a tier up) on the high ground where FireRed's are (`KNOBS`);
- the light: Celestic Town's chunk has no vertex colours (Diamond's outdoor chunks are unlit; its caves' are lit, as
  dp_fighting.py's), so the faces are lit as dp_fighting.py lights Victory Road's (`lighting`: by a profile down the face,
  FACE_LIGHT, softened by SHADE), down each cliff's whole height, so a stacked face darkens from its top to its foot, and
  by the way it looks (LIGHT_FROM, the light from the front left: faces looking right darker, those looking away up the
  picture darkest); the grass at each cliff's foot as dark as the face's foot (FOOT), lightening over half a tile
  (FOOT_FALL; the tiles there cut in quarters so it can);
- the shrine: Celestic Town's shrine (build model 203, its roof and shadow), centred on the frame's middle between the
  Active Spots as FireRed's orb shrine is, its pale path (Celestic Town's sand, nsand, edged by nsandp as the town's
  sand patches are) down from it to the way in;
- the graves: the Lost Tower's gravestone (Route 209's: build model 492, tomb01, texture set 41; Sinnoh has no graves
  outdoors) in rows on the high ground where FireRed's are (`frlg_mats.PYRE_ROWS`, at its height; any under a face, on the
  stairs or a knob left out, those on the top row raised out of the frame; Diamond has one kind, FireRed two);
- the fog: Route 210's fog is a plain white BG blended over the field (weather_sys 0x2F/0x2D/0x33, pokeplatinum's
  ov5_021D5EB8.c) with the 3D hardware fog; neither drifts. So the drifting fog is the game's battle fog's texture
  instead (Platinum's weather.spa, the particle resource the Fog weather's battle animation loads: its third texture,
  128 by 64 A5I3 clouds, white), mirrored across as the DS's flip repeat lays a texture (its ends don't meet) and
  scrolled left over the still scene (`fog_frames`), blended in 16ths as the DS's 2D blend does, in 5-bit colour
  (FOG_WEIGHT: lighter than the field's 9 of 16, as frlg_mats.py's FOG_BLEND is lighter than Emerald's), a little more
  towards the top (FOG_DEPTH: the depth fog, further off up the tilted view). One loop is the mirrored texture's width:
  FOG_FRAMES frames of FOG_STEP px.

Usage: python tools/mats/dp_psychic.py [--apicula <exe>] [--cache <dir>] [--pt-cache <dir>] [--preview <png>]
Writes apps/web/public/mats/dp/psychic.png and psychic.json through frlg_mats.py's `save` (a sheet of the frames, in
columns if it's taller than SHEET_HEIGHT; {width, height, frames: [{y, ms}]}), or with --preview only the first frame,
to that file. The decompilations' files are cached as dp_mats.py's are."""
import os, re, struct, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
import dp_mats as dm
import frlg_mats as fm
from dp_mats import T, W, H, Mat, SIDES, CORNERS, face_side, face_corner, segments
from render_hgss import Scene, REPEAT
from hgss_data import texture_matrices
import dp_data as dd
import pt_data as pd

CELESTIC = (62, 10)  # MAP_CELESTIC's one chunk (its grass, rock, sand) and texture set 10 (the area's, Route 210's too)
ROUTE_210 = (65, 10)  # MAP_ROUTE_210_NORTH's east chunk: its tall grass (nectgr)
SHRINE = 203  # Celestic Town's shrine (build model, drawn with texture set 10)
GRAVE, GRAVE_SET = 492, 41  # the Lost Tower's gravestone and its area's texture set
FOG_SPA = 'res/graphics/battle/particles/weather.spa'  # Platinum's battle weather particles (resource 29)
FOG_TEXTURE = 2  # its 128 x 64 clouds
# The ground's height in tiers above the shrine's floor, laid out tile by tile (`heights`) on a grid a few tiles past the
# frame's every edge (rows Z0..Z1, columns X0..X1, end exclusive): raised ground is drawn further up, so the bottom edge
# shows rows below the frame's.
Z0, Z1, X0, X1 = -4, H + 3, -3, W + 3
# The shrine's floor: inside these edges (runs of columns' first and last rows, x0, x1, row; runs of rows' first and last
# columns, z0, z1, column; inclusive), in straight runs stepping a tile in or out, its corners cut in steps; no bound on a
# row or column not listed (the way in at the bottom runs out of the frame). The rest is higher ground, the cliffs' faces
# going down a tile onto the floor from its edge, so they keep out of the cards' middle (rows 5-23, columns 10-37).
INNER_TOP = [(8, 8, 8), (9, 9, 5), (10, 17, 3), (18, 28, 4), (29, 35, 3), (36, 37, 4), (38, 38, 5), (39, 39, 8)]
INNER_BOTTOM = [(8, 8, 20), (9, 9, 23), (10, 19, 24), (20, 27, 99), (28, 30, 25), (31, 37, 24), (38, 38, 23), (39, 39, 20)]
INNER_LEFT = [(8, 15, 8), (16, 23, 9)]
INNER_RIGHT = [(8, 11, 39), (12, 16, 38), (17, 20, 39), (21, 24, 38)]
# The ground outside the floor two tiers up, but where HIGHER says (x0, z0, x1, z1 inclusive, tiers): three behind the
# shrine (FireRed's raised back), one along the bottom and on two stretches of the sides, the high ground stepping back
# behind a ledge there. Every tile is at most a tier above its neighbours (`heights`), so near the floor the tiers stack
# into one face and further off they step back.
HIGHER = [(17, -9, 28, 1, 3), (12, 24, 36, 36, 1)]
# The gaps' ways up (Celestic Town's grass stairs, newstep, two tiers as the town's are, set into the faces): the tiles
# across them (a0..a1, columns or rows), the line they go down from (a row's or column's edge), the way down and how
# many tiers: the back's right (to a landing), the left side's and the right side's. The way in at the bottom is open floor.
STAIRS = [(30, 33, 2, (0, 1), 2), (12, 14, 7, (1, 0), 2), (9, 10, 41, (-1, 0), 2)]
KNOBS = [(1, 1), (2, 7), (1, 18), (46, 10), (46, 21), (1, 24)]  # rock knobs on the high ground (a tier up, their tops rock)
# The light (vertex colours, as Diamond's cave chunks light their faces; its outdoor chunks, Celestic's included, have
# none): down a cliff, by how far down its whole height (FACE_LIGHT: its top lit, darkening to its foot), softened by
# SHADE; the faces by the way they look (LIGHT_FROM: the light from the front left, so faces looking right are darker
# and those looking away up the picture darkest, by up to SIDE_SHADE); the grass at a cliff's foot as dark as the face's
# foot, lightening over a tile (its foot's shadow).
FACE_LIGHT = [(0.0, 1.0), (0.12, 0.88), (0.81, 0.55), (1.0, 0.45)]
SHADE = 0.85
LIGHT_FROM, SIDE_SHADE = (-0.45, 0.89), 0.32
FOOT, FOOT_FALL = 1 - (1 - FACE_LIGHT[-1][1]) * SHADE, 8
FACES = ('criffp', 'newstep')
GROUND_KEYS = ('ngrass', 'nectgr', 'nsand', 'nsandp', 'criff')
SHRINE_AT = 384, 224  # px: the shrine's middle as drawn, the frame's (between the Active Spots), as FireRed's
PATH = 22.5, 25.5, 16.5, 26  # the pale path: tiles x0..x1 (exclusive), z0..z1, half a tile off as FireRed's (its nudge)
FOG_WEIGHT, FOG_DEPTH = 7, 2  # the fog's weight at its thickest, in 16ths, and how much more at the top
FOG_STEP, FOG_FRAMES, FOG_MS = 8, 32, 500  # px it moves left a frame, frames a loop (256 / FOG_STEP), ms a frame (16 px a second, about FireRed's fog's 15: the user's, 2026-11-08)


class PropMat(Mat):
    """A scene with Diamond's build models (props) in it, each drawn whole from its GLB, and its triangles lit (vertex
    colours, `lighting`: by its faces' and ground's keys, once the ground's heights are known)."""

    def __init__(self, tex, anim=None):
        super().__init__(tex, anim)
        self.props, self.lighting = [], None

    def tris(self, pos, uv, key):
        pos, uv = np.asarray(pos, float), np.asarray(uv, float)
        col = self.lighting(pos, key) if self.lighting else np.ones((len(pos), 3))
        if self.parts and self.parts[-1][3] == key:
            p, u, c, _ = self.parts[-1]
            self.parts[-1] = (np.vstack([p, pos]), np.vstack([u, uv]), np.vstack([c, col]), key)
        else:
            self.parts.append((pos, uv, col, key))

    def render(self, step=0, ground=16):
        scene = Scene(W * 16, H * 16, tilt=dm.TILT, ground=ground)
        for pos, uv, col, key in self.parts:
            scene.mesh(pos, uv, col, self.tex[key], (REPEAT, REPEAT))
        for glb, origin, texmtx in self.props:
            scene.glb(glb, origin, texmtx)
        scene.draw()
        return (np.clip(scene.img, 0, 1) * 255).astype(np.uint8)


def prop(a, model, tex_set):
    """A Diamond build model converted with its texture set: its GLB and texture matrices."""
    bm = os.path.join(a.work, f'bm{model}.nsbmd'); open(bm, 'wb').write(dd.read(a.cache, dd.BUILDING, model))
    tex = os.path.join(a.work, f'tex{tex_set}.nsbtx'); open(tex, 'wb').write(dd.read(a.cache, dd.MAP_TEXTURES, tex_set))
    out = a._convert([bm, tex], os.path.join(a.work, f'bm{model}'))
    return next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb')), texture_matrices(dd.read(a.cache, dd.BUILDING, model))


def runs(table, n, lo, default):
    """A run table's values over the grid's n rows or columns (from lo), `default` where it has none."""
    out = np.full(n, default)
    for a0, a1, v in table:
        out[a0 - lo:a1 - lo + 1] = v
    return out


def heights():
    """The ground's height in tiers over the extended grid (indexed [z - Z0, x - X0]) and the knobs' rock tops: the floor
    (0) inside the INNER_ edges, the rest a tier up or HIGHER's, each tile brought down to at most a tier above its every
    neighbour (corners too, so the faces step out a tile a tier); the KNOBS a tier above that."""
    zz, xx = np.mgrid[Z0:Z1, X0:X1]
    top, bottom = runs(INNER_TOP, X1 - X0, X0, 999), runs(INNER_BOTTOM, X1 - X0, X0, -999)
    left, right = runs(INNER_LEFT, Z1 - Z0, Z0, -999), runs(INNER_RIGHT, Z1 - Z0, Z0, 999)
    floor = (zz >= top[xx - X0]) & (zz <= bottom[xx - X0]) & (xx >= left[zz - Z0]) & (xx <= right[zz - Z0])
    h = np.where(floor, 0, 2)
    for x0, z0, x1, z1, tiers in HIGHER:
        h = np.where(~floor & (xx >= x0) & (xx <= x1) & (zz >= z0) & (zz <= z1), tiers, h)
    while True:
        lower = np.minimum(h, near(h, np.min) + 1)
        if (lower == h).all():
            break
        h = lower
    rock = np.zeros(h.shape, bool)
    for kx, kz in KNOBS:
        h[kz - Z0, kx - X0] += 1
        rock[kz - Z0, kx - X0] = True
    return h, rock


def near(h, f):
    """f (np.min or np.max) of each tile's height and its eight neighbours' (the grid's edge's past it)."""
    p = np.pad(h, 1, mode='edge')
    return f([p[dz:dz + h.shape[0], dx:dx + h.shape[1]] for dz in range(3) for dx in range(3)], axis=0)


def level(h, x, z):
    """Tile x, z's height in tiers (the grid's edge's past it)."""
    return h[min(max(z - Z0, 0), h.shape[0] - 1), min(max(x - X0, 0), h.shape[1] - 1)]


def lighting(h):
    """The scene's vertex colours (`PropMat.lighting`) for these heights: a face's (FACES) by how far down its cliff it
    is (from the tile it's over, walked back up and on down the way it looks while the ground keeps stepping a tier) and
    the way it looks (LIGHT_FROM); the ground's (GROUND_KEYS) its foot shadows', FOOT where a face comes down onto its
    tier, lightening over FOOT_FALL units (`ground` cuts the tiles there finer, so it can); anything else white."""
    feet = near(h, np.max) > h  # the tiles faces come down over
    lx, lz = LIGHT_FROM

    def face(tri):
        n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        nx, nz = (-n if n[1] < 0 else n)[[0, 2]]
        size = np.hypot(nx, nz) or 1.0
        qx, qz = (int(np.sign(nx)) if abs(nx) > 0.38 * size else 0), (int(np.sign(nz)) if abs(nz) > 0.38 * size else 0)
        c = tri.mean(0)
        tx, tz = int(c[0] // T), int(c[2] // T)
        hi = int(np.ceil((c[1] - 16) / T - 1e-6))  # the tier it comes down from, over a tile a tier below
        lo, bx, bz, fx, fz = hi - 1, tx - qx, tz - qz, tx, tz
        while (qx or qz) and level(h, bx - qx, bz - qz) == hi + 1:
            hi, bx, bz = hi + 1, bx - qx, bz - qz
        while (qx or qz) and level(h, fx + qx, fz + qz) == lo - 1:
            lo, fx, fz = lo - 1, fx + qx, fz + qz
        down = np.clip((16 + hi * T - tri[:, 1]) / ((hi - lo) * T), 0, 1)
        return (1 - (1 - np.interp(down, *zip(*FACE_LIGHT))) * SHADE) * (1 - SIDE_SHADE * (1 - (nx * lx + nz * lz) / size) / 2)

    def floor(p):
        k, x, z = int(round((p[1] - 16) / T)), p[0] / T, p[2] / T
        d = FOOT_FALL
        for tz in range(int(np.floor(z)) - 1, int(np.floor(z)) + 2):
            for tx in range(int(np.floor(x)) - 1, int(np.floor(x)) + 2):
                if Z0 <= tz < Z1 and X0 <= tx < X1 and feet[tz - Z0, tx - X0] and h[tz - Z0, tx - X0] == k:
                    d = min(d, np.hypot(max(tx - x, 0, x - tx - 1), max(tz - z, 0, z - tz - 1)) * T)
        return FOOT + (1 - FOOT) * d / FOOT_FALL

    def light(pos, key):
        if key in FACES:
            col = np.concatenate([face(pos[i:i + 3]) for i in range(0, len(pos) - 2, 3)])
        elif key in GROUND_KEYS:
            col = np.array([floor(p) for p in pos])
        else:
            col = np.ones(len(pos))
        return np.repeat(col[:, None], 3, 1)
    return light


def stairs(m, h, a0, a1, edge, out, tiers):
    """Celestic Town's grass stairs (newstep) down from the line `edge` the way `out`, across tiles a0..a1, `tiers` tiers
    down at 45 degrees as the town's are (a tier the texture's height, its treads across), their sides its edges (the
    texture's half on each end tile, its middle between). Returns the faces they take the place of, as (tier, x, z, way)."""
    ox, oz = out
    behind = edge - 1 if ox + oz > 0 else edge  # the row or column the stairs come down from
    tile = (lambda a: (behind, a)) if ox else (lambda a: (a, behind))
    top = level(h, *tile(a0))
    y, e, width = 16 + top * T, edge * T, (a1 - a0 + 1) * T
    pieces = [(0, T, 0, 0.5)] + [(s, s + T, 0.25, 0.75) for s in range(T, width - T, T)] + [(width - T, width, 0.5, 1.0)]
    point = (lambda c, s: (e + ox * s, y - s, a0 * T + c)) if ox else (lambda c, s: (a0 * T + c, y - s, e + oz * s))
    for j in range(tiers):
        s0, s1 = j * T, (j + 1) * T
        for c0, c1, u0, u1 in pieces:
            m.quad([point(c0, s0), point(c1, s0), point(c1, s1), point(c0, s1)], [(u0, 0), (u1, 0), (u1, 1), (u0, 1)], 'newstep')
    return {(top - j, x + ox * j, z + oz * j, out) for a in range(a0, a1 + 1) for x, z in [tile(a)] for j in range(tiers)}


def ground(m, h, rock, tall, skip):
    """Each tile flat at its height (grass; the knobs' rock, criff; tall grass over the grass where `tall` says), in
    quarters beside a cliff's foot (its shadow, `lighting`), and the cliffs' faces (criffp, a tile down and out from each
    tier's edge as `cliffs` builds them, rounded round its outside corners, meeting at its inside ones), but those the
    stairs take (`skip`)."""
    lvl = lambda x, z: level(h, x, z)
    feet = near(h, np.max) > h
    beside = (near(np.where(feet, h, -9), np.max) == h) & ~feet  # a tile a face comes down beside, on its tier

    def flat(x, z, key):
        y, n = 16 + lvl(x, z) * T, 2 if beside[z - Z0, x - X0] else 1
        for i in range(n):
            for j in range(n):
                X0_, Z0_, X1_, Z1_ = (x + i / n) * T, (z + j / n) * T, (x + (i + 1) / n) * T, (z + (j + 1) / n) * T
                m.quad([(X0_, y, Z0_), (X1_, y, Z0_), (X1_, y, Z1_), (X0_, y, Z1_)], [(X0_ / 16, Z0_ / 16), (X1_ / 16, Z0_ / 16), (X1_ / 16, Z1_ / 16), (X0_ / 16, Z1_ / 16)], key)
    for z in range(Z0, Z1):
        for x in range(X0, X1):
            flat(x, z, 'criff' if rock[z - Z0, x - X0] else 'ngrass')
    for z, x in zip(*np.nonzero(tall)):
        flat(x + X0, z + Z0, 'nectgr')
    segs = segments(1)
    for k in range(1, int(h.max()) + 1):
        y = 16 + k * T
        for z in range(Z0, Z1):
            for x in range(X0, X1):
                if lvl(x, z) < k:
                    continue
                xs, zs = (x * T, (x + 1) * T), (z * T, (z + 1) * T)
                for a, b, (ox, oz) in SIDES:
                    if lvl(x + ox, z + oz) < k and (k, x, z, (ox, oz)) not in skip:
                        face_side(m, (xs[a[0]], zs[a[1]]), (xs[b[0]], zs[b[1]]), (ox, oz), y, segs, ['criffp'])
                for c, sx, sz in CORNERS:
                    if lvl(x + sx, z) < k and lvl(x, z + sz) < k:
                        face_corner(m, (xs[c[0]], zs[c[1]]), sx, sz, y, segs, ['criffp'])


def sand_path(m, x0, x1, z0, z1):
    """The pale path: Celestic Town's sand (nsand) over tiles x0..x1, z0..z1 (exclusive; may be half a tile off), its
    edges nsandp's as the town's sand patches have them (its top left quarter the outside corner, grass along its top
    and left; its bottom left quarter the straight edge, grass along its bottom), turned to each side; its top open
    (under the shrine)."""
    tl, tr, br, bl = (0, 0), (0.5, 0), (0.5, 0.5), (0, 0.5)  # the corner piece's corners
    el, er, ebr, ebl = (0, 0.5), (0.5, 0.5), (0.5, 1), (0, 1)  # the edge piece's
    # Each piece's corners at the tile's top left, top right, bottom right and bottom left.
    pieces = {(1, 0, 0): (ebl, el, er, ebr), (0, 1, 0): (er, ebr, ebl, el), (0, 0, 1): (el, er, ebr, ebl),
              (1, 0, 1): (tr, br, bl, tl), (0, 1, 1): (br, bl, tl, tr)}
    for z in np.arange(z0, z1):
        for x in np.arange(x0, x1):
            X, Z = x * T, z * T
            corners = [(X, 16, Z), (X + T, 16, Z), (X + T, 16, Z + T), (X, 16, Z + T)]
            piece = pieces.get((int(x == x0), int(x == x1 - 1), int(z == z1 - 1)))
            if piece:
                m.quad(corners, piece, 'nsandp')
            else:
                m.quad(corners, [(c[0] / 16, c[2] / 16) for c in corners], 'nsand')


def psychic_scene(a, seed='psychic'):
    """The still scene (`PropMat`): the ground at its heights (`heights`) with its cliffs, stairs and knobs, the tall
    grass, the path, the shrine and the graves, lit (`lighting`)."""
    import random
    rng = random.Random(seed)
    tex = a.textures(*CELESTIC)
    tex['nectgr'] = a.textures(*ROUTE_210)['nectgr']
    m = PropMat(tex)
    h, rock = heights()
    m.lighting = lighting(h)
    frame = (slice(-Z0, -Z0 + H), slice(-X0, -X0 + W))
    under = (near(h, np.max) > h)[frame]  # under a face
    steps = np.zeros((H, W), bool)
    for a0, a1, edge, (ox, oz), tiers in STAIRS:
        for k in range(tiers):
            if ox:
                steps[a0:a1 + 1, edge + (k if ox > 0 else -1 - k)] = True
            else:
                steps[edge + (k if oz > 0 else -1 - k), a0:a1 + 1] = True
    # What the tall grass and graves keep clear of: the shrine, its path and the way in, the faces, the stairs, the knobs.
    keep = np.zeros((H, W), bool)
    keep[12:H, 21:26] = True
    keep |= under | steps | rock[frame]
    graves = [(x + 2 * i, y) for kind, y, x, n in fm.PYRE_ROWS for i in range(n)]
    # The tall grass: FireRed's patches, their corners nibbled at random, off the graves.
    tall = np.zeros((H, W), bool)
    for y, x, ph, pw in fm.PYRE_TALL_PATCHES + fm.PYRE_INNER_PATCHES:
        tall[y:y + ph, x:x + pw] = True
        for cy, cx in ((y, x), (y, x + pw - 1), (y + ph - 1, x), (y + ph - 1, x + pw - 1)):
            if rng.random() < 0.6:
                tall[cy, cx] = False
    for x, z in graves:
        tall[z, x] = False
    tall &= ~keep
    big = np.zeros(h.shape, bool)
    big[frame] = tall
    skip = set()
    for a0, a1, edge, out, tiers in STAIRS:
        skip |= stairs(m, h, a0, a1, edge, out, tiers)
    ground(m, h, rock, big, skip)
    sand_path(m, *PATH)
    # The shrine, its middle as drawn on SHRINE_AT (`shrine_origin`), and the graves on their tiles at their heights.
    glb, texmtx = prop(a, SHRINE, CELESTIC[1])
    m.props.append((glb, shrine_origin(glb, texmtx), texmtx))
    glb, texmtx = prop(a, GRAVE, GRAVE_SET)
    clear = under | steps | rock[frame]
    for x, z in graves:
        if 0 <= z < H and not clear[z, x]:
            m.props.append((glb, ((x + 0.5) * T, 16 + level(h, x, z) * T, (z + 0.5) * T), texmtx))
    return m


def shrine_origin(glb, texmtx):
    """Where the shrine's origin goes for its picture's middle to be SHRINE_AT: drawn alone once, then moved by the
    difference (to the nearest px)."""
    probe = (W * T / 2, 16, H * T / 2)
    scene = Scene(W * 16, H * 16, tilt=dm.TILT, ground=16)
    scene.glb(glb, probe, texmtx)
    scene.draw()
    ys, xs = np.nonzero(np.isfinite(scene.height))
    mx, my = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2
    return probe[0] + SHRINE_AT[0] - mx, 16, probe[2] + SHRINE_AT[1] - my


def fog_texture(pt_cache):
    """The battle fog's clouds (Platinum's weather.spa, texture FOG_TEXTURE: A5I3, white): their alpha, 0-31, mirrored
    across (the DS's flip repeat) so its two ends meet: 256 x 64."""
    d = open(pd.fetch(pt_cache, FOG_SPA), 'rb').read()
    offsets = [m.start() for m in re.finditer(b' TPS', d)]  # each texture: its 32-byte header ('SPT ' reversed), then its texels
    o = offsets[FOG_TEXTURE]
    param, size = struct.unpack_from('<2I', d, o + 4)
    fmt, s, t = param & 0xF, 8 << (param >> 4 & 0xF), 8 << (param >> 8 & 0xF)
    assert fmt == 6 and s * t == size  # A5I3: a byte a texel, its top 5 bits the alpha
    alpha = (np.frombuffer(d, np.uint8, size, o + 32).astype(int) >> 3).reshape(t, s)
    return np.concatenate([alpha, alpha[:, ::-1]], axis=1)


def fog_frames(still, alpha):
    """The fog over the still scene, a frame for each FOG_STEP px it drifts left: the clouds' alpha tiled over the
    frame, as a weight in 16ths (0 where it's thinnest, FOG_WEIGHT where it's thickest, FOG_DEPTH more at the top),
    the fog's white blended in 5-bit colour as the DS's 2D blend does."""
    h, w = still.shape[:2]
    lo, hi = alpha.min(), alpha.max()
    depth = np.linspace(FOG_DEPTH, 0, h)[:, None]
    rgb5 = still.astype(int) // 8
    out = []
    for k in range(FOG_FRAMES):
        a = np.tile(np.roll(alpha, -k * FOG_STEP, axis=1), (h // alpha.shape[0] + 1, w // alpha.shape[1] + 1))[:h, :w]
        weight = np.rint((a - lo) / (hi - lo) * FOG_WEIGHT + depth).astype(int)[..., None]
        mix = np.minimum(31, (31 * weight + rgb5 * (16 - weight)) // 16) * 255 // 31
        out.append((mix.astype(np.uint8), FOG_MS))
    return out


def psychic_frames(a):
    """The mat's frames ((rgb, ms) each, in order): the scene drawn once, the fog drifting over it."""
    still = psychic_scene(a).render()
    return fog_frames(still, fog_texture(a.pt_cache))


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    pt_cache = opt('--pt-cache', os.path.join(tempfile.gettempdir(), 'pokeplatinum'))
    preview = opt('--preview', None)
    a = dm.Assets(apicula, cache, pt_cache)
    if preview:
        rgb, _ = fog_frames(psychic_scene(a).render(), fog_texture(pt_cache))[0]
        Image.fromarray(rgb).save(preview)
        return
    shots = psychic_frames(a)
    fm.save('psychic', shots, dm.OUT)
    print('psychic', len(shots), 'frames')


if __name__ == '__main__':
    main()
