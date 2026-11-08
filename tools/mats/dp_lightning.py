"""Makes up the Diamond/Pearl Lightning mat (the battle table's background for Lightning: apps/web/src/utils/typeMats.ts),
laid out as the FireRed/LeafGreen one (frlg_mats.py's `lightning_arena` and `storm`, the user's: "similar to the FRLG mats
but with DPP assets") and built as dp_mats.py builds the other DP mats, from Diamond's own textures and pieces drawn
tilted by the HGSS maps' renderer at the Sinnoh run maps' tilt:
- the mountain: FireRed's terraced mountain in a lake (frlg_mats.py's `lightning_land`, the same seed, so its outline,
  top and coves are FireRed's), its levels a tile above one another as Route 210's terraces are (LEVELS: the top 4
  above the land, against FireRed's 6 tiers, so the steep cliff along the bottom still leaves the lake in sight), its
  faces Route 209's and 210's cliff (criffp, rounded round the outside corners: dp_mats.py's `face_side`/`face_corner`),
  its ledges their rock (criff), its top and the coves at its foot their grass (ngrass). Where the top comes down to the
  lake with no room for its tiers (along the bottom) they stand one in front of another as a steep cliff. The top is
  on the tile grid (the cards' place, as FireRed's); the land below it is laid LIFT rows further up than FireRed's (the
  tilt draws it lower), so on the picture the slopes and the lake are about where FireRed's are.
  Route 209's pond (texture set 10's sea, the same set's lake as Routes 209-211's) under it all, the land 8 units above
  the water with Route 210 North's rim round its foot (seaside3, laid as its chunk lays it: `rim`).
- trees: Route 210's (tree2_01, dp_mats.py's `tree`: the same four layers as Floaroma's) packed 2 tiles apart in a wood
  across the top, its edge wandering a row or two from column to column (as FireRed's `forest`), and a few in the coves.
- grass: Route 210's tall grass (nectgr) in fields round the open oval middle, by FireRed's own noise and rules (its
  flowers left out: Route 210's showed as specks at night).
- lighthouses: Sunyshore City's Vista Lighthouse (building model 223, with Sunyshore's texture set 13): its tower alone,
  cut out of its base (`TOWER`) and drawn at LIGHTHOUSE_SCALE (the real one is 6 tiles across), at FireRed's six spots
  on the top's rim (frlg_mats.BEACON_SPOTS); their lamps' glow is the app's, from the sheet's json `lights` (as FireRed's,
  `beacon_lights`' format), centred on the lamp's glass.
- night: Diamond's own time-of-day light (files/data/area00light.txt, the outdoor areas': its midnight light colour,
  the map materials' diffuse, ambient and emission, lighting the ground as the DS does: `night_light`).
- the storm: Diamond's thunderstorm (pret/pokeplatinum's src/overlay005/ov5_021D5EB8.c, its OVERWORLD_WEATHER_THUNDERSTORM
  task, and Diamond's files/data/weather_sys): its heavy rain's sprites (weather_sys 12, 11, 13 and 7: three streaks of
  a length and a splash, `rain_cells`), falling as ov5_021DA0A8 and ov5_021DA1A8 move them (each streak a random length,
  moving 48 px a game frame down and left for each step of its length, for one or two frames, then splashing half the
  time) slowed to FireRed's rain's speed (RAIN_PACE of a game frame each mat frame, the streaks moving smoothly between the
  game's steps; the same number of streaks a second); and its lightning (ov5_021DA748): weather_sys 29-31's
  flash layer, a warm white, blended over the scene by its brightness (EVA, out of 16), rising for two game frames and
  falling 200 (a short flash) or 36 (a long one) a frame, in hundredths. The strikes are FireRed's (the user's,
  2026-11-07): a short flash, a moment's dark, then a longer one held a quarter second and fading, 8-18 s apart; the
  rises and fades are the game's, dimmer than its range as FireRed's are (SHORT_FLASH, HELD_FLASH). The scene's own
  textures stand still, as FireRed's do.

Usage: python tools/mats/dp_lightning.py [--apicula <exe>] [--cache <dir>] [--seed N] [--preview <png>]
Writes apps/web/public/mats/dp/lightning.png and lightning.json through frlg_mats.py's `save` (dp_mats.py's `write`
has no frame order or lights): the frames in columns when the sheet would be over frlg_mats.SHEET_HEIGHT px, each
frame's {x, y, ms} in the json's order, and `lights`. Needs numpy, Pillow and apicula, as dp_mats.py."""
import os, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, '..', 'extras')]
import numpy as np
from PIL import Image
import dp_mats as dm
import frlg_mats as fm
import nitro
from dp_mats import T, W, H, TILT, dd, glb_prims, Scene, REPEAT

# Route 209's middle chunk (MAP_ROUTE_209, land data 74) and its texture set (10, Routes 209-211's and 215's): its
# grass, tall grass, rock, cliff faces, trees, pond and the pond's rim.
ROUTE_209 = (74, 10)
SUNYSHORE = 13  # Sunyshore City's texture set, its buildings' too
LIGHTHOUSE = 223  # Sunyshore's Vista Lighthouse (build_model 223, in Sunyshore's land data 99)
TOWER = (0, 3, 25)  # its tower's middle (x, z, model units) and reach: the triangles within it, the base left out
LIGHTHOUSE_SCALE = 0.4
FOOT_SHADOW = 12, 7, 2, 2, 0.75  # a lighthouse's shadow on the ground (the user's, as FireRed's lighthouses' shading): its half width and depth, its shift right and down (model units) and its darkness at the middle
LAMP = 'lambert3'  # the lighthouse's glass, where its lamp is
LEVELS = 5  # the top's height in levels (the lake 0)
LAND_Y = 8  # the lowest land a half tile above the water, as Route 209's pond is
LIFT = 2  # rows the land's outline is drawn up FireRed's mask, so the tilt puts it where FireRed's is
PAD = 4  # rows above the picture: the land below the top shows lower down, so its far side starts above it
TOP_Y = LAND_Y + (LEVELS - 1) * T
# weather_sys's heavy rain (the thunderstorm's sprites: their cells, tiles and palette; their animation, 11, only steps
# through the cells as ov5_021DA0A8 and ov5_021DA1A8 set them) and its flash layer.
RAIN = 12, 13, 7
FLASH = 30, 29, 31  # palette, tiles, screen
RAIN_STEP = 48  # px a game frame down and left, for each step of a streak's length (ov5_021DA1A8: 2 x 24)
RAIN_PER_SCREEN = 10  # streaks started a game frame on the DS's 256 x 192 screen (the thunderstorm's steady count)
SPLASH = 6  # game frames a splash shows (its state 1's countdown from 4, and the frame it's set)
RAIN_LOOP = 32  # mat frames of rain before it comes round again
RAIN_PACE = 1 / 6  # game frames of the rain's a mat frame (the user's, 2026-11-08: slowed to FireRed's rain's speed, about 13 px a mat frame against 48-144 at a game frame each)
STEP_MS = 1000 / 30  # a mat frame: a game frame of the rain's each (half the DS's 60), as FireRed's
# The strikes (the user's, after FireRed's: frlg_mats.py's SHORT_FLASH, HELD_FLASH, STRIKE_GAP, BOLT_PHASES,
# STORM_CYCLES): EVA a mat frame, by the game's rises and falls two game frames at a time but dimmer than its range (its
# peaks 400-1358, EVA 4-13, wash the scene out far past FireRed's flashes, which are dimmer than Emerald's too, the
# user's). A short flash (the game's dimmest: rising 200 a game frame to 400, falling 200), then after a moment's dark a
# long one (300, held a quarter second, the user's, then falling 36 a game frame).
SHORT_FLASH = 4, 2
HELD_FLASH = (3,) * 8 + (2, 1, 1)
STRIKE_GAP = fm.STRIKE_GAP
BOLT_PHASES = 3  # the rain frames a flash may start on (fewer than FireRed's 4: the DP frames are bigger)
STORM_CYCLES = fm.STORM_CYCLES


class Lit(dm.Mat):
    """A made-up scene with props too (a building's triangles as apicula converts them, their own vertex colours and
    textures), rendered as floats (0-1) for the night and the flashes to be laid over."""

    def __init__(self, tex, anim=None):
        super().__init__(tex, anim)
        self.props = []

    def render_float(self):
        scene = Scene(W * 16, H * 16, tilt=TILT, ground=TOP_Y)
        for pos, uv, key in self.parts:
            scene.mesh(pos, uv, np.ones((len(pos), 3)), self.tex[key], (REPEAT, REPEAT))
        for p in self.props:
            scene.mesh(*p)
        scene.draw()
        return np.clip(scene.img, 0, 1)


def building(a, model, tex_set):
    """A Diamond building model's triangles (glb_prims'), drawn with a map texture set as the game draws them."""
    path = os.path.join(a.work, f'bm{model}.nsbmd')
    open(path, 'wb').write(dd.read(a.cache, dd.BUILDING, model))
    tex = os.path.join(a.work, f'tex{tex_set}.nsbtx')
    open(tex, 'wb').write(dd.read(a.cache, dd.MAP_TEXTURES, tex_set))
    out = a._convert([path, tex], os.path.join(a.work, f'bm{model}'))
    return glb_prims(next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb')))


def foot_shadow(dark, size=32):
    """A soft round shadow (a texture: black, see-through towards its edge, `dark` at its middle), for a lighthouse's foot."""
    yy, xx = (np.mgrid[0:size, 0:size] + 0.5) / size * 2 - 1
    tex = np.zeros((size, size, 4))
    tex[..., 3] = dark * np.clip(1.3 - 1.3 * np.hypot(xx, yy), 0, 1) ** 0.7
    return tex


def lighthouse(a):
    """The Vista Lighthouse's tower: the triangles within TOWER of its middle (the base round it and its shadow left
    out), its foot at 0 and scaled; and its lamp's height above its foot."""
    cx, cz, r = TOWER
    out, lamp = [], []
    for p in building(a, LIGHTHOUSE, SUNYSHORE):
        tris = p['pos'].reshape(-1, 3, 3)
        keep = (np.abs(tris[..., 0] - cx).max(1) <= r) & (np.abs(tris[..., 2] - cz).max(1) <= r)
        if keep.any():
            idx = np.repeat(keep, 3)
            out.append(dict(p, pos=p['pos'][idx], uv=p['uv'][idx], col=p['col'][idx]))
            if p['material'] == LAMP:
                lamp.append(p['pos'][idx][:, 1])
    foot = min(p['pos'][:, 1].min() for p in out)
    for p in out:
        p['pos'] = (p['pos'] - [cx, foot, cz]) * LIGHTHOUSE_SCALE
    return out, (np.concatenate(lamp).mean() - foot) * LIGHTHOUSE_SCALE


def night_light(a):
    """Diamond's outdoor light at midnight (area00light.txt's first entry: its light 0's colour and direction, and the
    map materials' diffuse, ambient and emission, 5-bit), as the DS lights flat ground with it: the colour each texture
    is multiplied by (0-1, per channel)."""
    text = open(dd.fetch(a.cache, 'files/data/area00light.txt')).read()
    rows = [[int(v) for v in r.strip().strip(',').split(',')] for r in text.strip().split('\n\n')[0].split('\n')[1:]]
    _, r, g, b, *d = rows[0]
    light, (diffuse, ambient, _specular, emission) = np.array([r, g, b]) / 31, (np.array(v) / 31 for v in rows[4:8])
    facing = max(0.0, -d[1] / np.linalg.norm(d))  # the ground's normal is straight up
    return np.clip(emission + ambient * light + diffuse * light * facing, 0, 1)


# --- The scene ---

def heights(rng):
    """FireRed's mountain (frlg_mats.py's `lightning_land`, its masks in the picture's rows) as levels in the model's
    rows (PAD more above the picture): the top at LEVELS, the land below it lifted LIFT rows up the mask (the tilt draws
    it lower), each tile's level its distance in from the lake against its distance out from the top (round, as
    FireRed's tiers run along both), the coves at its foot 1, the lake 0. Returns the levels, the top and the coves (the
    model's rows)."""
    water, top, cove, _ = fm.lightning_land(rng)
    pad = lambda m, up: np.pad(m, ((PAD, 0), (0, 0)), mode='edge')[np.clip(np.arange(H + PAD) + up, 0, H + PAD - 1)]
    top_m, land_m, cove_m = pad(top, 0), pad(~water, LIFT), pad(cove, LIFT)
    land_m |= top_m
    from_water, from_top = fm.euclid(~land_m), fm.euclid(top_m)
    level = np.clip(np.minimum(from_water, LEVELS - from_top), 1, LEVELS - 1)
    level[cove_m & ~top_m] = 1
    level[top_m], level[~land_m] = LEVELS, 0
    # Each level's outline above the first rounded (the user's: no hard corners; the land's own is FireRed's), and within
    # the one below.
    out = np.zeros_like(level)
    below = land_m
    for k in range(1, LEVELS + 1):
        m = (fm.rounded(level >= k, 2) if k > 1 else level >= k) & below
        out[m] = k
        below = m
    return out, top_m, cove_m & (out == 1)


def level_y(k):
    return LAND_Y + (k - 1) * T


def terraces(m, level, flat):
    """Each level's tiles flat at its height (`flat`: their texture by tile), and a cliff face (dp_mats.py's PROFILE,
    criffp) down a level from each edge of each level's outline, rounded round its outside corners, so steps of a tile
    each make terraces and a level's edge with no room before the next makes a steep cliff of faces one before another
    (where it meets the lake the faces end a half tile above it, at the rim: `rim`)."""
    hh, ww = level.shape
    segs = dm.segments(1)
    for k in range(1, LEVELS + 1):
        mask = level >= k
        inside = lambda x, r: 0 <= r < hh and 0 <= x < ww and mask[r, x]
        y = level_y(k)
        for r, x in zip(*np.nonzero(mask)):
            z = r - PAD
            if level[r, x] == k:
                m.flat(x, z, y, flat(r, x))
            if k == 1:
                continue
            xs, zs = (x * T, (x + 1) * T), (z * T, (z + 1) * T)
            for a, b, (ox, oz) in dm.SIDES:
                if not inside(x + ox, r + oz):
                    dm.face_side(m, (xs[a[0]], zs[a[1]]), (xs[b[0]], zs[b[1]]), (ox, oz), y, segs, ['criffp'])
            for c, sx, sz in dm.CORNERS:
                if not inside(x + sx, r) and not inside(x, r + sz):
                    dm.face_corner(m, (xs[c[0]], zs[c[1]]), sx, sz, y, segs, ['criffp'])


# Route 210 North's rim where land meets water (seaside3), as its chunk lays it: from the land's edge outwards (units),
# how far up from the land, and the texture's v there; u along the edge, a repeat a tile.
RIM = [(0, 0, 0.5), (2, 2, 0.25), (6, 1, 0.0)]


def rim(m, level):
    """The rim round the land's foot: along each edge of a level's tile where the lake is beyond it, at the foot of
    what stands there (the land's own edge for a level-1 tile, a tile out for a cliff's faces: they end there)."""
    hh, ww = level.shape
    for r, x in zip(*np.nonzero(level >= 1)):
        z = r - PAD
        xs, zs = (x * T, (x + 1) * T), (z * T, (z + 1) * T)
        for a, b, (ox, oz) in dm.SIDES:
            rr, xx = r + oz, x + ox
            if not (0 <= rr < hh and 0 <= xx < ww) or level[rr, xx] != 0:
                continue
            base = 0 if level[r, x] == 1 else T
            (ax, az), (bx, bz) = (xs[a[0]], zs[a[1]]), (xs[b[0]], zs[b[1]])
            ua, ub = (ax if oz else az) / T, (bx if oz else bz) / T
            for (o0, d0, v0), (o1, d1, v1) in zip(RIM, RIM[1:]):
                o0, o1 = base + o0, base + o1
                m.quad([(ax + ox * o0, LAND_Y + d0, az + oz * o0), (bx + ox * o0, LAND_Y + d0, bz + oz * o0), (bx + ox * o1, LAND_Y + d1, bz + oz * o1), (ax + ox * o1, LAND_Y + d1, az + oz * o1)],
                       [(ua, v0), (ub, v0), (ub, v1), (ua, v1)], 'seaside3')


def wood(rng, free):
    """Route 210's trees (2 tiles square, on a 2-tile grid as its woods are) filling the top of `free` as a wood going
    on past the picture's top, each 2-tile column down to its foot 0 to 2 tiles above the lowest it can go (in `free`),
    wandering a tile from the column before's, so the wood's edge is uneven (frlg_mats.py's `forest`); their tiles
    (x, model row)."""
    hh, ww = free.shape
    trees, k = [], int(rng.integers(0, 3))
    for x in range(int(np.nonzero(free[PAD])[0][0]), ww - 1, 2):
        deepest = next((r for r in range(PAD, hh // 2 + PAD) if not free[r:r + 2, x:x + 2].all()), hh // 2 + PAD) - 1
        if deepest < PAD - 1:
            continue
        k = int(np.clip(k + rng.choice((-1, 0, 1)), 0, 2))
        foot = deepest - k
        trees += [(x, r) for r in range(foot, -1, -2)]
    return trees


def grove(rng, free, n):
    """Up to n trees where their 2x2 tiles fit in `free`, a tile apart (frlg_mats.py's `grove`, one tree each)."""
    trees, taken = [], np.zeros_like(free)
    ys, xs = np.nonzero(free)
    for i in rng.permutation(len(ys)):
        r, x = int(ys[i]), int(xs[i])
        if len(trees) == n:
            break
        if free[r:r + 2, x:x + 2].all() and free[r:r + 2, x:x + 2].shape == (2, 2) and not fm.grow(taken, 1)[r:r + 2, x:x + 2].any():
            trees.append((x, r))
            taken[r:r + 2, x:x + 2] = True
    return trees


def lightning_scene(a, rng):
    """The scene (a `Lit`) and its lighthouses' lamps (px in the frame, for `lights`)."""
    tex = a.textures(*ROUTE_209)
    m = Lit(tex)
    level, top, cove = heights(rng)
    hh = H + PAD
    # The lake under everything, past each edge.
    x0, z0, x1, z1 = -T, -(PAD + 2) * T, (W + 1) * T, (H + 3) * T
    m.quad([(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], [(x0 / 16, z0 / 16), (x1 / 16, z0 / 16), (x1 / 16, z1 / 16), (x0 / 16, z1 / 16)], 'sea')
    # What grows: a wood along the top, a few trees in the coves and fields of tall grass round the open middle
    # (thinning towards it), as FireRed's (frlg_mats.py's `lightning_arena`, its noise and thresholds; its flowers, unseen
    # at night, left out: Route 210's, nhana, showed as specks over the middle).
    green = (top | cove)
    cards = np.zeros((hh, W), bool)
    cards[PAD + 5:PAD + 24, 10:38] = True
    edge = fm.grow(~green, 1)
    trees = wood(rng, green & top & ~cards & ~edge) + grove(rng, cove & ~edge, 4)
    shade = np.zeros((hh, W), bool)
    for x, r in trees:
        shade[r:r + 2, x:x + 2] = True
    drift = 0.6 * fm.smooth_noise(rng, hh, W, 3) + 0.4 * fm.smooth_noise(rng, hh, W, 2)
    lush = np.where(cove, 0.15, 0)
    rr, xx = np.mgrid[0:hh, 0:W]
    mid = np.hypot((rr - PAD - 14.5) / 7, (xx - 23.5) / 10)
    near_trees = fm.grow(shade, 1)
    tall = green & (mid > 0.75) & ~edge & ~near_trees & (drift > 0.45 - lush + 0.5 * np.clip(1.4 - mid, 0, None))
    spots = [(r + PAD, x) for r, x in fm.BEACON_SPOTS]
    for r, x in spots:  # (bare grass under the lighthouses)
        tall[r - 1:r + 1, x] = False
    terraces(m, level, lambda r, x: 'nectgr' if tall[r, x] else 'ngrass' if green[r, x] else 'criff')
    rim(m, level)
    for x, r in sorted(trees, key=lambda t: t[1]):
        dm.tree(m, x, r - PAD, level_y(level[min(hh - 1, r + 1), x]), 'tree2_01')
    # The lighthouses, each foot on its tile's middle.
    tower, lamp = lighthouse(a)
    lights = []
    for r, x in spots:
        at = np.array([(x + 0.5) * T, level_y(level[r, x]), (r - PAD + 0.5) * T])
        hw, hd, dx, dz, dark = FOOT_SHADOW
        cx, cz, y = at[0] + dx, at[2] + dz, at[1] + 0.3
        quad = np.array([(cx - hw, y, cz - hd), (cx + hw, y, cz - hd), (cx + hw, y, cz + hd), (cx - hw, y, cz - hd), (cx + hw, y, cz + hd), (cx - hw, y, cz + hd)])
        uv = np.array([(0, 0), (1, 0), (1, 1), (0, 0), (1, 1), (0, 1)], float)
        m.props.append((quad, uv, np.ones((6, 3)), foot_shadow(dark), (0, 0), 0.98, True))
        for p in tower:
            m.props.append((p['pos'] + at, p['uv'], p['col'], p['tex'], p['wrap'], p['alpha'], p['blend']))
        lights.append({'x': round(at[0]), 'y': round(at[2] - (at[1] + lamp - TOP_Y) * TILT), 'r': 32, 'rgb': list(fm.BEACON_GLOW)})
    return m, lights


# --- The storm ---

def weather_file(a, n, ext):
    return open(dd.fetch(a.cache, f'files/data/weather_sys/narc_{n:04d}.{ext}'), 'rb').read()


def rain_cells(a):
    """The heavy rain's four cells (three streaks, short to long, and the splash), each an RGBA array and the offset
    of its top left corner from the sprite's position."""
    cells, tiles, colours = nitro.ncer(weather_file(a, RAIN[0], 'NCER')), nitro.ncgr(weather_file(a, RAIN[1], 'NCGR')), nitro.nclr(weather_file(a, RAIN[2], 'NCLR'))
    out = []
    for i in range(len(cells.cells)):
        im, (ox, oy) = nitro.draw_cell(cells, i, tiles, colours)
        out.append((np.asarray(im), -ox, -oy))
    return out


def flash_colour(a):
    """The lightning's flash layer's colour (its screen is one tile of one colour), 0-1."""
    tiles, colours = nitro.ncgr(weather_file(a, FLASH[1], 'NCGR')), nitro.nclr(weather_file(a, FLASH[0], 'NCLR'))
    return np.array(colours[max(set(tiles.tiles[0]), key=tiles.tiles[0].count)][:3]) / 255


def rain_frames(a, rng, h, w):
    """RAIN_LOOP frames of the heavy rain over an (h, w) px scene, a game frame each: each frame a list of (y, x, picture).
    Each game frame starts as many streaks as the DS's screen gets for the scene's size, each at a random spot, a random
    length k (its cell, and its speed, k + 1 steps a frame), moving one or two frames (ov5_021DA1A8's v2[1] < 2 or not),
    then splashing where it ends half the time (SPLASH frames) or gone; frames wrap round the loop, so it's seamless."""
    pics = rain_cells(a)
    n = RAIN_PER_SCREEN * h * w / (256 * 192) * RAIN_PACE  # (streaks a mat frame: as many a second as the game's)
    frames = [[] for _ in range(RAIN_LOOP)]
    for start in range(RAIN_LOOP):
        for _ in range(int(n) + (rng.random() < n % 1)):
            x, y = rng.integers(0, w), rng.integers(0, h)
            k, moves, splash = int(rng.integers(0, 3)), 1 + int(rng.integers(0, 4) >= 2), rng.random() < 0.5
            # Its steps, RAIN_PACE of one a mat frame, from the first (at 1) to the last before it splashes or goes.
            steps = np.arange(1, moves + (0 if splash else 1), RAIN_PACE)
            shown = [(k, i) for i in steps] + [(3, moves)] * (SPLASH if splash else 0)
            for t, (cell, i) in enumerate(shown):
                pic, ox, oy = pics[cell]
                frames[(start + t) % RAIN_LOOP].append((int(round(y + RAIN_STEP * (k + 1) * i + oy)), int(round(x - RAIN_STEP * (k + 1) * i + ox)), pic))
    return frames


def draw_rain(rgb, drops):
    """The drops drawn over a frame (0-255), wrapping round its edges."""
    h, w = rgb.shape[:2]
    for y0, x0, pic in drops:
        ph, pw = pic.shape[:2]
        y0, x0 = y0 % h, x0 % w
        for y in (y0 - h, y0):
            for x in (x0 - w, x0):
                ys, xs = slice(max(0, y), min(h, y + ph)), slice(max(0, x), min(w, x + pw))
                if ys.start < ys.stop and xs.start < xs.stop:
                    p = pic[ys.start - y:ys.stop - y, xs.start - x:xs.stop - x]
                    rgb[ys, xs][p[..., 3] > 0] = p[..., :3][p[..., 3] > 0]
    return rgb


def storm(a, m, rng):
    """The scene at Diamond's midnight in its thunderstorm: the rain's loop over and over, a frame lit where a strike
    falls (the flash layer added by its EVA, under the rain: the sprites aren't blended), each lit frame drawn once
    whichever strike it's in, STORM_CYCLES waits of 8-18 s and round again (frlg_mats.py's `storm`). Returns the sheet's
    frames [(rgb, ms)] and the order they show in."""
    night = m.render_float() * night_light(a)
    h, w = night.shape[:2]
    flash = flash_colour(a)
    rain = rain_frames(a, rng, h, w)
    lit = lambda f, k: draw_rain((np.clip(night + flash * k / 16, 0, 1) * 255).astype(np.uint8), rain[f])
    sheet, seen, order, f = [lit(i, 0) for i in range(RAIN_LOOP)], {}, [], 0
    phases = rng.choice(RAIN_LOOP, BOLT_PHASES, replace=False)
    for _ in range(STORM_CYCLES):
        wait = int(rng.integers(8000, 18001) / STEP_MS)
        for strike in (SHORT_FLASH, HELD_FLASH):
            wait += int(min((p - f - wait) % RAIN_LOOP for p in phases))
            order += [(f + i) % RAIN_LOOP for i in range(wait)]
            f += wait
            for k in strike:
                if (f % RAIN_LOOP, k) not in seen:
                    seen[f % RAIN_LOOP, k] = len(sheet)
                    sheet.append(lit(f % RAIN_LOOP, k))
                order.append(seen[f % RAIN_LOOP, k])
                f += 1
            wait = STRIKE_GAP
    return [(s, STEP_MS) for s in sheet], order


def lightning_frames(a, rng):
    """The mat's frames, their order and the lighthouses' lights."""
    m, lights = lightning_scene(a, rng)
    shots, order = storm(a, m, rng)
    return shots, order, lights


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    seed = int(opt('--seed', '1'))
    preview = opt('--preview', None)
    a = dm.Assets(apicula, cache, os.path.join(tempfile.gettempdir(), 'pokeplatinum'))
    shots, order, lights = lightning_frames(a, np.random.default_rng(seed))
    fm.save('lightning', shots, dm.OUT, order, lights)
    if preview:
        Image.fromarray(shots[0][0]).save(preview)
    print('lightning', len(shots), 'frames,', len(order), 'shown,', os.path.getsize(os.path.join(dm.OUT, 'lightning.png')), 'bytes')


if __name__ == '__main__':
    main()
