"""Makes up the Diamond/Pearl mats (the battle table's backgrounds, one a type: apps/web/src/utils/typeMats.ts), each a
scene of 48 by 28 tiles that isn't a cut of a real map but is built as Diamond's maps are, from the area's own textures
and pieces (pret/pokediamond, read by ../routes/dp/dp_data.py), and drawn tilted by the HGSS maps' renderer
(../routes/hgss/render_hgss.py) at the Sinnoh run maps' tilt.

The mats (--layout arena) are laid out as the FireRed/LeafGreen set's (frlg_mats.py's arena layout,
beside this), so both sets lay out alike: one arena for all three, frlg_mats.py's rounded rectangle (ARENA: rows 4-23,
columns 8-39, its corners cut in steps), its outline on the picture where theirs is (inside a desktop's middle 600 px; a
phone's middle column all floor), its surround on every side, the dressing where theirs is (`ARENAS`):
- fire: Platinum's Stark Mountain (pret/pokeplatinum: Diamond's Stark Mountain, outside and in, has no lava, nor do
  Platinum's rooms; Platinum's outside has magma pits): its floor (wcliff) raised a tile above its magma (the pits'
  magma, prop 584) on the cliff face the pits go down by (criffp_mag, its foot glowing: `cliffs`), the floor a column
  in at the sides and two rows up at the bottom so the faces end where FireRed's walls and cliff do; boulders where
  FireRed's mounds are and small rocks where its rocks are, near the floor's edges; its grey rock outcrops (`block`,
  their faces criffp_mag) where FireRed's raised outcrops are, a boulder or a rock on each. Every texture is Platinum's
  Stark Mountain outside's (its land data chunk with its texture set, and the prop).
- water: Route 222's beach: a sand island in the sea, its shore the real one's band (hamabe: its straight piece along an
  edge, its corner pieces where the shore turns, the sand a tile above the sea), uneven (the user's: not perfectly
  round, as the fire scene's arena: `rough`, each corner cut its own way, bumps and notches along the top and bottom,
  the sides stepping in and out) about FireRed's island's footprint, two small uneven islets where FireRed's sandbars
  are, sea rocks where its rocks are (but any by the shore); on it Route 213's beach terrain (the user's screenshot of
  it): a few rock ridges, boulders and small rocks, and three uneven patches of grass, mostly tall grass in a broken rim of short, near its top edge and bottom right (`beach_terrain`).
- grass: Floaroma Meadow's grass, its flowers in organic drifts on every side (the user's: no rows, no frame round
  the field): smooth noise, thinning out towards the open middle, patches of colour mixed where they meet, loose
  single flowers between (`flower_beds`); its trees in two staggered rows along the top and bottom.

The app's (--layout app, the default: `APP`) are the arena layout's water and grass and the scene layout's fire
(the user's: its uneven edges). The earlier made-up scenes are --layout scene (`SCENES`): water Route 222's sand in
the sea with bumps along its edge, two small islands and rows of sea rocks; fire the same Stark Mountain pieces round
an arena with bumps and notches, its outcrops 1 or 2 tiers high, its floor dressed with two rock ridges and more
boulders and rocks (`stark_terrain`); grass a clearing with separate flower beds, trees
round every side.

They move as the game's own map textures do: Diamond swaps a texture's picture for the next of its frames (files/data's
fld_anime<n>.bin: an NSBTX of frames, each shown for some of the field's 30 frames a second), so each scene is drawn
once a step of its textures' animation, a looping sequence: the sea and its shore 8 steps, the flowers 4. The magma
isn't swapped but scrolled (its prop's texture SRT animation, prop_animation_082.nsbta: one repeat along both its axes
every 60 field frames), drawn a texel further each step: 16 steps of 125 ms (its prop's other animation, a slight bob
and stretch of its plane, prop_animation_081.nsbca, is left out: the mat's magma is one plane under everything).

Usage: python tools/mats/dp_mats.py [--apicula <exe>] [--cache <dir>] [--pt-cache <dir>] [--layout app|arena|scene]
       [type ...]   (types: water fire grass; all by default)
Writes apps/web/public/mats/dp/<type>.png, a vertical sheet of the scene's frames (768 by 448 each), and <type>.json
({width, height, frames: [{y, ms}]}). The decompilations' files are cached in <cache> and <pt-cache> (the system's temp
folder's pokediamond/ and pokeplatinum/ by default, as the Sinnoh maps'). Needs numpy, Pillow and apicula (the Nintendo
DS model converter) on the PATH or given."""
import json, os, re, struct, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ROUTES = os.path.join(HERE, '..', 'routes')
sys.path[:0] = [os.path.join(ROUTES, 'dp'), os.path.join(ROUTES, 'hgss')]
import numpy as np
from PIL import Image
import dp_data as dd
import pt_data as pd
from render_hgss import Scene, glb_prims, UNIT, REPEAT

T = UNIT  # model units per tile
W, H = 48, 28  # the scene, in tiles
TILT = 0.6  # the Sinnoh run maps'
TICK_MS = 1000 / 30  # a field frame: fld_anime's durations count them
OUT = os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'mats', 'dp')
# The real maps' land data chunks the pieces are taken from (their textures, as each chunk draws them), and texture sets.
ROUTE_222 = (150, 18)  # the beach and the sea (MAP_ROUTE_222's middle chunk)
ROUTE_213 = (143, 18)  # its beach's rock ridges, boulders and short grass (MAP_ROUTE_213's top left chunk, the same textures)
MEADOW = (414, 8)  # MAP_FLOAROMA_MEADOW's top left chunk
# Platinum's Stark Mountain outside (MAP_STARK_MOUNTAIN_OUTSIDE: its one chunk, area data 17's texture set), the magma
# its pits hold (a prop, with its own texture) and the magma's texture scroll, at pokeplatinum's paths (pt_data.py's).
PT_STARK = (pd.LAND_DATA.format(172), pd.MAP_TEXTURES.format(17))
PT_MAGMA = 'res/field/props/models/prop_model_584.nsbmd'
PT_MAGMA_SCROLL = 'res/field/props/animations/prop_animation_082.nsbta'
MAGMA_SIZE = (22.4, 21.33)  # model units a repeat of the magma's texture, as the prop lays it (5 across 112, 6 down 128)
# fld_anime's entries: the sea, the shore and the meadow's red, blue, yellow and pink flowers.
SEA, SHORE, FLOWERS = 0, 3, {'t3_fl_b': 5, 't3_fl_p': 6, 't3_fl_r': 7, 't3_fl_y': 8}


class Assets:
    """The decompilation's files the mats are made from, converted with apicula as needed."""

    def __init__(self, apicula, cache, pt_cache):
        self.apicula, self.cache, self.pt_cache = apicula, cache, pt_cache
        self.work = tempfile.mkdtemp(prefix='dp_mats_')
        self._chunks = {}

    def _convert(self, files, out, glb=True):
        subprocess.run([self.apicula, 'convert', *files, '-o', out, '--overwrite'] + (['-f', 'glb'] if glb else ['--more-textures']), check=True, capture_output=True)
        return out

    def chunk(self, land, set_id):
        """A land data chunk's triangles (glb_prims'), its model origin at its centre."""
        if land not in self._chunks:
            ch = dd.land_chunk(dd.read(self.cache, dd.LAND_DATA, land))
            model = os.path.join(self.work, f'land{land}.nsbmd'); open(model, 'wb').write(ch['model'])
            tex = os.path.join(self.work, f'tex{set_id}.nsbtx'); open(tex, 'wb').write(dd.read(self.cache, dd.MAP_TEXTURES, set_id))
            out = self._convert([model, tex], os.path.join(self.work, f'land{land}'))
            self._chunks[land] = glb_prims(next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb')))
        return self._chunks[land]

    def textures(self, land, set_id):
        """Each material's texture as the chunk draws it, by the material's name less its '_lm<n>' (RGBA, 0-1)."""
        return {re.sub(r'_lm\d+$', '', p['material']): p['tex'] for p in self.chunk(land, set_id) if p['tex'] is not None}

    def pt_textures(self, land_path, tex_path):
        """The same for a Platinum land data chunk (its file and its texture set's, pokeplatinum's paths)."""
        if land_path not in self._chunks:
            ch = dd.land_chunk(open(pd.fetch(self.pt_cache, land_path), 'rb').read())
            name = 'pt_' + os.path.splitext(os.path.basename(land_path))[0]
            model = os.path.join(self.work, name + '.nsbmd'); open(model, 'wb').write(ch['model'])
            out = self._convert([model, pd.fetch(self.pt_cache, tex_path)], os.path.join(self.work, name))
            self._chunks[land_path] = glb_prims(next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb')))
        return {re.sub(r'_lm\d+$', '', p['material']): p['tex'] for p in self._chunks[land_path] if p['tex'] is not None}

    def pt_prop_texture(self, path):
        """A Platinum prop's texture (its first material's; the prop has its own), RGBA 0-1."""
        out = self._convert([pd.fetch(self.pt_cache, path)], os.path.join(self.work, 'pt_' + os.path.splitext(os.path.basename(path))[0]))
        return next(p['tex'] for p in glb_prims(next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb'))) if p['tex'] is not None)

    def pt_scroll(self, path):
        """A Platinum texture SRT animation's (NSBTA) first material's scroll: its length in field frames and how many
        repeats its texture moves along s and t in that time (its translation tracks' last value less their first)."""
        d = open(pd.fetch(self.pt_cache, path), 'rb').read()
        srt = struct.unpack_from('<I', d, 16)[0]
        assert d[srt:srt + 4] == b'SRT0'
        # The block's dictionary (NNS's: entries at its ofsEntry, each a u32 offset from the block) to its first animation.
        top = srt + 8
        anim = srt + struct.unpack_from('<I', d, top + struct.unpack_from('<H', d, top + 6)[0] + 4)[0]
        assert d[anim:anim + 4] == b'M\0AT'
        frames = struct.unpack_from('<H', d, anim + 4)[0]
        # Its materials' dictionary: each entry five tracks (scale s, t, rotation, translation s, t) of 8 bytes: frames,
        # flags (0x2000 a constant, 0x1000 fx16 values) and the constant or its values' offset from the animation.
        mats = anim + 8
        entry = mats + struct.unpack_from('<H', d, mats + 6)[0] + 4
        def track(i):
            _, flags, value = struct.unpack_from('<HHI', d, entry + 8 * i)
            if flags & 0x2000:
                return 0.0
            fmt, size = ('<h', 2) if flags & 0x1000 else ('<i', 4)
            first, last = (struct.unpack_from(fmt, d, anim + value + size * k)[0] / 4096 for k in (0, frames - 1))
            return last - first
        return frames, round(track(3)), round(track(4))

    def anim(self, n):
        """fld_anime<n>.bin: its frames (RGBA, 0-1, in the NSBTX's order) and its steps (frame index, field frames shown)."""
        d = open(dd.fetch(self.cache, f'files/data/fld_anime{n}.bin'), 'rb').read()
        path = d[:32].split(b'\0')[0].decode()
        steps = []
        for o in range(32, len(d) - 3, 4):
            i, ticks = np.frombuffer(d, '<u2', 2, o)
            if i == 0xFFFF:
                break
            steps.append((int(i), int(ticks)))
        src = dd.fetch(self.cache, 'files/' + path)
        out = self._convert([src], os.path.join(self.work, f'anim{n}'), glb=False)
        names = sorted((f for f in os.listdir(out) if f.endswith('.png')), key=lambda f: int(re.search(r'_(\d+)\.png$', f).group(1)))
        return [np.asarray(Image.open(os.path.join(out, f)).convert('RGBA')).astype(float) / 255 for f in names], steps


class Mat:
    """A made-up scene: triangles by texture key (a key in `anim` changes picture with each step)."""

    def __init__(self, tex, anim=None):
        self.tex, self.anim, self.parts = tex, anim or {}, []

    def quad(self, corners, uvs, key):
        c, u = np.array(corners, float), np.array(uvs, float)
        self.tris(c[[0, 1, 2, 0, 2, 3]], u[[0, 1, 2, 0, 2, 3]], key)

    def tris(self, pos, uv, key):
        if self.parts and self.parts[-1][2] == key:
            self.parts[-1] = (np.vstack([self.parts[-1][0], pos]), np.vstack([self.parts[-1][1], uv]), key)
        else:
            self.parts.append((np.asarray(pos, float), np.asarray(uv, float), key))

    def flat(self, x, z, y, key, size=16):
        """Tile x, z flat at height y, its texture laid at a texel a unit (`size`: its width in texels), as the maps' ground is."""
        X, Z = x * T, z * T
        self.quad([(X, y, Z), (X + T, y, Z), (X + T, y, Z + T), (X, y, Z + T)], [(X / size, Z / size), ((X + T) / size, Z / size), ((X + T) / size, (Z + T) / size), (X / size, (Z + T) / size)], key)

    def render(self, step=0, ground=16):
        """The scene at its animation's step `step`, as an RGB array."""
        scene = Scene(W * 16, H * 16, tilt=TILT, ground=ground)
        for pos, uv, key in self.parts:
            frames = self.anim.get(key)
            tex = frames[step % len(frames)] if frames else self.tex[key]
            scene.mesh(pos, uv, np.ones((len(pos), 3)), tex, (REPEAT, REPEAT))
        scene.draw()
        return (np.clip(scene.img, 0, 1) * 255).astype(np.uint8)


# --- The pieces, as the real maps build them ---

def vertex_land(land, vx, vz):
    """Whether grid point vx, vz (a tile's corner) touches a land tile."""
    h, w = len(land), len(land[0])
    return any(0 <= z < h and 0 <= x < w and land[z][x] for x in (vx - 1, vx) for z in (vz - 1, vz))


def tidy(land):
    """The mask with every tile the shore can't be built round made land: a tile touching land at two opposite corners
    only, or on all four (a hole, a channel a tile wide)."""
    land = [list(r) for r in land]
    while True:
        changed = False
        for z in range(len(land)):
            for x in range(len(land[0])):
                if land[z][x]:
                    continue
                up = [vertex_land(land, *v) for v in ((x + 1, z), (x + 1, z + 1), (x, z + 1), (x, z))]
                if sum(up) == 4 or up in ([True, False, True, False], [False, True, False, True]):
                    land[z][x] = changed = True
        if not changed:
            return land


# The shore band's corner pieces (Route 222's hamabe): clockwise from the odd corner, each corner's texture coordinates. A
# tile of sea with one corner on the sand is the sand's outside corner (the texture's top left quarter); one with three,
# an inside corner (its top right quarter). Turned to the corner, as the real map turns them.
CONVEX_UV = [(0.492, 0.492), (0.008, 0.492), (0.008, 0.008), (0.492, 0.008)]
CONCAVE_UV = [(0.508, 0.008), (0.992, 0.008), (0.992, 0.492), (0.508, 0.492)]
# Route 213's sand round its short grass (beachp), as its chunk lays it: the same pieces, the other way round.
BEACHP = dict(kits=(CONCAVE_UV, CONVEX_UV), band_v=(0.992, 0.508))


def shore(m, land, top, band, y_top=16, y_low=8, top_size=16, band_size=32, kits=(CONVEX_UV, CONCAVE_UV), band_v=(0.508, 0.992)):
    """Land (`land`, a mask of tiles: True land) a tile above the water, as Route 222's beach is built: each land tile
    flat (`top`), and each water tile touching it sloping down from the land's edge to the water (`band`, the shore's
    wave band: its lower half along a straight edge, its u along the edge a texel a unit and v across it; its corner
    pieces, CONVEX_UV and CONCAVE_UV, where the shore turns). The water itself is drawn apart (`sea`). `kits` and
    `band_v` (the band's v at the land's edge and away from it) for another band laid the same way: Route 213's beachp,
    sand round its short grass, has its corner pieces the other way round and its v from the grass (BEACHP)."""
    for z in range(len(land)):
        for x in range(len(land[0])):
            if land[z][x]:
                m.flat(x, z, y_top, top, top_size)
                continue
            # Its corners clockwise from its top right: NE, SE, SW, NW.
            pts = [(x + 1, z), (x + 1, z + 1), (x, z + 1), (x, z)]
            up = [vertex_land(land, *v) for v in pts]
            n = sum(up)
            if n == 0:
                continue
            corner = lambda i: (pts[i][0] * T, y_top if up[i] else y_low, pts[i][1] * T)
            if n == 2:
                # A straight edge: u along it (x along a top or bottom edge, z along a side), v from the land down.
                along = 0 if (up[3] and up[0]) or (up[1] and up[2]) else 2
                uvs = [((p[0] if along == 0 else p[1]) * T / band_size, band_v[0] if u else band_v[1]) for p, u in zip(pts, up)]
                m.quad([corner(i) for i in range(4)], uvs, band)
                continue
            odd = up.index(True) if n == 1 else up.index(False)
            kit = kits[0] if n == 1 else kits[1]
            order = [(odd + k) % 4 for k in range(4)]
            c = [corner(i) for i in order]
            # Folded across the two corners beside the odd one, as the real pieces are.
            m.quad([c[1], c[2], c[3], c[0]], [kit[1], kit[2], kit[3], kit[0]], band)


def sea(m, key, y=8, size=16):
    """The water under everything, a tile past each edge (drawn lower, it shows below the picture's top)."""
    x0, z0, x1, z1 = -T, -2 * T, (W + 1) * T, (H + 2) * T
    m.quad([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], [(x0 / size, z0 / size), (x1 / size, z0 / size), (x1 / size, z1 / size), (x0 / size, z1 / size)], key)


def sea_rock(m, x, z, key='searock', y=8):
    """Route 222's sea rock (2 tiles square, a quad leaning back from its foot), on tiles x, z to x + 1, z + 1."""
    X, Zb = x * T, (z + 2) * T - 4.6875
    m.quad([(X, y + 0.6875, Zb), (X + 2 * T, y + 0.6875, Zb), (X + 2 * T, y + 23.3125, Zb - 22.625), (X, y + 23.3125, Zb - 22.625)], [(0, 1), (1, 1), (1, 0), (0, 0)], key)


def boulder(m, x, z, y=16, key='imped'):
    """Route 222's and Stark Mountain's boulder (the imped texture's bottom left quarter, 2 tiles square)."""
    X, Zb = x * T, (z + 2) * T - 4.6875
    m.quad([(X, y + 0.6875, Zb), (X + 2 * T, y + 0.6875, Zb), (X + 2 * T, y + 23.3125, Zb - 22.625), (X, y + 23.3125, Zb - 22.625)], [(0, 1), (0.5, 1), (0.5, 0.5), (0, 0.5)], key)


def stone(m, x, z, y=16, key='imped'):
    """Stark Mountain's small rock (a tile, from the imped texture's bottom right quarter)."""
    X, Zb = x * T, (z + 1) * T - 2.34375
    m.quad([(X, y + 2.34375, Zb), (X + T, y + 2.34375, Zb), (X + T, y + 13.65625, Zb - 11.3125), (X, y + 13.65625, Zb - 11.3125)], [(0.5, 1.0156), (0.75, 1.0156), (0.75, 0.7656), (0.5, 0.7656)], key)


# A cliff's face across its tile, as Stark Mountain's are built (criffp): from the top's edge outwards (units), how far
# down (units) and the texture's v there.
PROFILE = [(0, 0, 0.0), (4, 2, 0.12), (12, 14, 0.81), (16, 16, 1.0)]
# Its rounded outside corner, `r` units out from the top's corner (a tier's step of the profile, and a tier a tile further
# for each tier above it): its points from the face along x to the face along z (out along x, out along z), and the
# texture's u at each, as Stark Mountain's (r 4, 12 and 16; the tiers below go on alike).
def corner(r):
    if r == 0:
        return [(0, 0)], [0.5]
    if r < 10:
        return [(r, 0), (0, r)], [0.38, 0.62]
    # Round, as the real corner 16 out is (14, 8 and 8, 14); 12 out, the real one's.
    mid = [(10, 8), (8, 10)] if r == 12 else [(round(r * 0.868, 2), round(r * 0.496, 2)), (round(r * 0.496, 2), round(r * 0.868, 2))]
    return [(r, 0), *mid, (0, r)], {12: [0.16, 0.44, 0.56, 0.84], 0: [0.12, 0.38, 0.62, 0.88]}.get(r % 16, [0.3, 0.45, 0.55, 0.7])


def segments(tiers):
    """The faces' strips from a top's edge down `tiers` tiers (PROFILE's, a tier a tile further out and down than the
    one above): (out, down, v) at each end, and the tier (0 the top one)."""
    steps = [(0, 0, 0.0)] + [(k * T + o, k * T + d, v) for k in range(tiers) for o, d, v in PROFILE[1:]]
    # A tier's top edge: its face's texture from the top again.
    return [((o0, d0, 0.0 if o0 % T == 0 else v0), b, o0 // T) for (o0, d0, v0), b in zip(steps, steps[1:])]


# A top's sides: their two ends (as a top's corners: 0 its x0/z0 edge, 1 its x1/z1), the way out, and the corners.
SIDES = (((0, 1), (1, 1), (0, 1)), ((1, 1), (1, 0), (1, 0)), ((1, 0), (0, 0), (0, -1)), ((0, 0), (0, 1), (-1, 0)))
CORNERS = (((1, 1), 1, 1), ((1, 0), 1, -1), ((0, 0), -1, -1), ((0, 1), -1, 1))


def face_side(m, a, b, out, y, segs, faces):
    """A side's faces, from its end `a` to `b` (model units) at height y, going out the way `out`."""
    (ax, az), (bx, bz), (ox, oz) = a, b, out
    ua, ub = (ax if oz else az) / 16, (bx if oz else bz) / 16
    for (o0, d0, v0), (o1, d1, v1), k in segs:
        m.quad([(ax + ox * o0, y - d0, az + oz * o0), (bx + ox * o0, y - d0, bz + oz * o0), (bx + ox * o1, y - d1, bz + oz * o1), (ax + ox * o1, y - d1, az + oz * o1)],
               [(ua, v0), (ub, v0), (ub, v1), (ua, v1)], faces[k])


def face_corner(m, c, sx, sz, y, segs, faces):
    """An outside corner's faces, rounded (`corner`), round the top's corner `c` (model units) out the way sx, sz: a fan
    between each strip's two rows of points, walking both from one face to the other."""
    cx, cz = c
    for (o0, d0, v0), (o1, d1, v1), k in segs:
        (p0, u0), (p1, u1) = corner(o0), corner(o1)
        fa = [((cx + sx * px, y - d0, cz + sz * pz), (u, v0)) for (px, pz), u in zip(p0, u0)]
        fb = [((cx + sx * px, y - d1, cz + sz * pz), (u, v1)) for (px, pz), u in zip(p1, u1)]
        i = j = 0
        while i < len(fa) - 1 or j < len(fb) - 1:
            if j < len(fb) - 1 and (i == len(fa) - 1 or (j + 1) / (len(fb) - 1) <= (i + 1) / (len(fa) - 1)):
                tri = [fa[i], fb[j], fb[j + 1]]; j += 1
            else:
                tri = [fa[i], fb[j], fa[i + 1]]; i += 1
            m.tris([t[0] for t in tri], [t[1] for t in tri], faces[k])


def block(m, x0, z0, x1, z1, base, tiers=1, top='criff', face='criffp', foot=None, top_size=16):
    """A rock outcrop as Stark Mountain's: its top flat over tiles x0..x1, z0..z1 (inclusive) `tiers` tiles above `base`,
    each tier a face a tile across (PROFILE, its u along it 2 texels a unit as the real faces') round the one above, along
    the top's edges and rounded round its corners (`corner`), so it stands on `tiers` more tiles each way; `foot`: the
    lowest tier's face, if not `face` (criffp_mag, down into the magma)."""
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            m.flat(x, z, base + tiers * T, top, top_size)
    xs, zs = (x0 * T, (x1 + 1) * T), (z0 * T, (z1 + 1) * T)
    y, segs, faces = base + tiers * T, segments(tiers), [face] * (tiers - 1) + [foot or face]
    for a, b, out in SIDES:
        face_side(m, (xs[a[0]], zs[a[1]]), (xs[b[0]], zs[b[1]]), out, y, segs, faces)
    for c, sx, sz in CORNERS:
        face_corner(m, (xs[c[0]], zs[c[1]]), sx, sz, y, segs, faces)


def cliffs(m, land, base, top, face, top_size=16):
    """Land (`land`, a mask of tiles: True land) a tile above `base` on a cliff, as Platinum's Stark Mountain's magma pits
    are cut: each land tile flat, and a face (PROFILE's, `face`) down a tile from each of its edges along open ground,
    rounded (`corner`) where the edge turns outwards; where it turns inwards the two faces meet, as the pits' do."""
    is_land = lambda x, z: 0 <= z < len(land) and 0 <= x < len(land[0]) and land[z][x]
    y, segs = base + T, segments(1)
    for z in range(len(land)):
        for x in range(len(land[0])):
            if not land[z][x]:
                continue
            m.flat(x, z, y, top, top_size)
            xs, zs = (x * T, (x + 1) * T), (z * T, (z + 1) * T)
            for a, b, (ox, oz) in SIDES:
                if not is_land(x + ox, z + oz):
                    face_side(m, (xs[a[0]], zs[a[1]]), (xs[b[0]], zs[b[1]]), (ox, oz), y, segs, [face])
            for c, sx, sz in CORNERS:
                if not is_land(x + sx, z) and not is_land(x, z + sz):
                    face_corner(m, (xs[c[0]], zs[c[1]]), sx, sz, y, segs, [face])


def tree(m, x, z, y=16, key='tree01'):
    """Floaroma Meadow's tree (2 tiles square: its shadow and three layers of leaves, as the real chunk's), on tiles x, z
    to x + 1, z + 1."""
    X, Z = x * T, z * T
    for (a, b, lo, hi, zb, zt), (u0, u1, v0, v1) in (((5, 27, 29.69, 42.31, 18.02, 0), (0, 0.34375, 1, 0.65625)), ((-0.5, 32.5, 18.39, 35.61, 23.28, -1.28), (0, 0.53125, 0.46875, 0)),
                                                     ((-4, 36, 7.25, 26.75, 25.92, -1.92), (0.34375, 1, 1, 0.4375)), ((0, 32, 0.91, 0.91, 31, 1), (0.53125, 1, 0.4375, 0))):
        m.quad([(X + a, y + lo, Z + zb), (X + b, y + lo, Z + zb), (X + b, y + hi, Z + zt), (X + a, y + hi, Z + zt)], [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], key)


# --- The scenes ---

def rounded(x0, z0, x1, z1, cut):
    """A mask of the scene: True in tiles x0..x1, z0..z1, less a stepped triangle `cut` tiles across at each corner (its
    shore a 45 degree run there, as the real beach's turns)."""
    def inside(x, z):
        if not (x0 <= x <= x1 and z0 <= z <= z1):
            return False
        dx, dz = min(x - x0, x1 - x), min(z - z0, z1 - z)
        return dx + dz >= cut
    return [[inside(x, z) for x in range(W)] for z in range(H)]


def water(a, rng):
    """Route 222's sand in the sea, its shore's band and the sea moving as the game's, sea rocks round it."""
    tex = a.textures(*ROUTE_222)
    sea_frames, steps = a.anim(SEA)
    shore_frames, shore_steps = a.anim(SHORE)
    assert [s[1] for s in steps] == [s[1] for s in shore_steps]
    m = Mat(tex, {'sea': sea_frames, 'hamabe': shore_frames})
    land, isles = arena_mask(rng)
    sea(m, 'sea')
    shore(m, land, 'beach', 'hamabe')
    rocks(m, land, rng, lambda x, z: sea_rock(m, x, z))
    # A boulder on each island, as on Route 222's beach.
    for x, z, w, h in isles:
        boulder(m, x + (w > 2 and rng.random() < 0.5), z)
    return m, steps


def arena_mask(rng, x0=8, z0=5, x1=39, z1=22, cut=3, islands=True):
    """The arena: a rounded rectangle in the middle, its edges stepping in and out a tile here and there, and (`islands`)
    two small islands out in the water to either side. The mask, and the islands (x, z, width, height)."""
    land = rounded(x0, z0, x1, z1, cut)
    for _ in range(6):
        # Bumps along the long edges: a few tiles out or in.
        x = rng.randint(x0 + cut + 2, x1 - cut - 5)
        z = rng.choice((z0, z1))
        out = rng.choice((-1, 1))
        for xx in range(x, x + rng.randint(2, 4)):
            zz = (z0 - 1 if z == z0 else z1 + 1) if out > 0 else z
            land[zz][xx] = out > 0
    isles = [(cx, cz, rng.randint(2, 3), rng.randint(2, 3)) for cx, cz in ((rng.randint(2, 3), rng.randint(7, 17)), (rng.randint(42, 43), rng.randint(7, 17)))] if islands else []
    for cx, cz, w, h in isles:
        for x in range(cx, cx + w):
            for z in range(cz, cz + h):
                land[z][x] = True
    return tidy(land), isles


def rocks(m, land, rng, put, rows=(0, 25), count=10):
    """Rocks (2 tiles square, by `put`) in the water: a broken row along the top and the bottom, and a few more by the
    sides, none within a tile of the land."""
    taken = set()
    def free(x, z):
        return all(not (0 <= zz < H and 0 <= xx < W and land[zz][xx]) and (xx, zz) not in taken for xx in range(x - 1, x + 3) for zz in range(z - 1, z + 3))
    spots = []
    for z in rows:
        x = rng.randint(-1, 1)
        while x < W:
            zz = z + rng.choice((0, 0, 1))
            if rng.random() < 0.85 and free(x, zz):
                spots.append((x, zz))
                taken.update((xx, zz2) for xx in range(x, x + 2) for zz2 in range(zz, zz + 2))
            x += 2 + rng.choice((0, 0, 0, 1, 2))
    for _ in range(count * 20):
        if count == 0:
            break
        x, z = rng.randint(0, W - 2), rng.randint(3, H - 5)
        if free(x, z) and min(x, W - 2 - x) < 8:
            spots.append((x, z)); count -= 1
            taken.update((xx, zz) for xx in range(x, x + 2) for zz in range(z, z + 2))
    # Drawn from the back: nearer rocks over further ones.
    for x, z in sorted(spots, key=lambda s: s[1]):
        put(x, z)


def scrolled(tex, frames, ds, dt):
    """A texture scrolled as an SRT animation moves it (`frames` field frames for `ds`, `dt` repeats along s and t, each
    at most 1): a texel further each step, as many steps as the texture is wide, and the field frames each is shown."""
    n = tex.shape[1]
    assert tex.shape[0] == n and abs(ds) <= 1 and abs(dt) <= 1
    return [np.roll(tex, (-dt * k, -ds * k), axis=(0, 1)) for k in range(n)], [(k, frames / n) for k in range(n)]


def magma(m, key, y=0):
    """The magma under everything, a tile past each edge (lower than the ground, it shows below the picture's top), its
    texture laid as the pits' prop lays it (MAGMA_SIZE)."""
    (su, sv), x0, z0, x1, z1 = MAGMA_SIZE, -T, -2 * T, (W + 1) * T, (H + 2) * T
    m.quad([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], [(x0 / su, z0 / sv), (x1 / su, z0 / sv), (x1 / su, z1 / sv), (x0 / su, z1 / sv)], key)


def fire(a, rng):
    """Platinum's Stark Mountain: its floor a tile above its magma (the magma scrolling as the game's), its rock
    outcrops and boulders in the magma, boulders and small rocks on the floor."""
    tex = a.pt_textures(*PT_STARK)
    frames, steps = scrolled(a.pt_prop_texture(PT_MAGMA), *a.pt_scroll(PT_MAGMA_SCROLL))
    m = Mat(tex, {'magma': frames})
    land, _ = arena_mask(rng, cut=2, islands=False)
    magma(m, 'magma')
    cliffs(m, land, 0, 'wcliff', 'criffp_mag')
    # Stark Mountain's outcrops in the magma, at the ends and along the top and bottom (inner tops, tiles).
    outcrops = [(1, 3, 3, 6, 2), (43, 18, 45, 22, 2), (14, 0, 19, 0, 1), (29, 25, 33, 25, 1), (38, 0, 40, 1, 1), (8, 25, 10, 26, 1)]
    for x0, z0, x1, z1, tiers in sorted(outcrops, key=lambda o: o[3]):
        block(m, x0, z0, x1, z1, 0, tiers, foot='criffp_mag')
    # Clear of the floor's cliff (a tile round it) and the outcrops.
    near = lambda x, z: any(0 <= zz < H and 0 <= xx < W and land[zz][xx] for zz in range(z - 1, z + 2) for xx in range(x - 1, x + 2))
    taken = [[near(x, z) or any(x0 - t - 1 <= x <= x1 + t + 1 and z0 - t - 1 <= z <= z1 + t + 1 for x0, z0, x1, z1, t in outcrops) for x in range(W)] for z in range(H)]
    rocks(m, taken, rng, lambda x, z: boulder(m, x, z, y=0), count=8)
    # Stark Mountain's boulders and small rocks here and there near the floor's edge, clear of the middle.
    edge = [(x, z) for z in range(H) for x in range(W) if land[z][x] and not all(land[zz][xx] for zz in range(z - 2, z + 3) for xx in range(x - 2, x + 3)) and all(land[zz][xx] for zz in range(z - 1, z + 2) for xx in range(x - 1, x + 2))]
    picked = []
    for x, z in rng.sample(edge, len(edge)):
        if len(picked) == 7:
            break
        if all(abs(x - p[0]) > 5 or abs(z - p[1]) > 5 for p in picked) and (len(picked) > 1 or land[z + 1][x + 1]):
            picked.append((x, z))
    for i, (x, z) in sorted(enumerate(picked), key=lambda p: p[1][1]):
        (boulder if i < 2 else stone)(m, x, z)
    stark_terrain(m)
    return m, steps


# More of Stark Mountain on the fire scene's floor, as the water island has Route 213's (the user's): Platinum's chunk
# 172's own pieces, placed by hand on this floor (arena_mask's, seeded 'fire'), clear of its boulders and rocks and,
# as far as there's room, of the middle (a desktop's middle 360 x 250 px): rock ridges a tile high (criff tops, criffp
# faces, as `block` builds its outcrops) and more boulders and small rocks. (Patches of its tall grass, enccliff, and
# of its grey rock ground, criff, were tried and taken out: the user's.)
STARK_RIDGES = [(10, 9, 11, 13), (37, 13, 38, 16)]  # tops (x0, z0, x1, z1, inclusive)
STARK_ROCKS = [(boulder, 37, 19), (stone, 11, 6), (stone, 39, 10), (stone, 30, 5)]


def stark_terrain(m):
    """The fire scene's floor dressed (STARK_*), on the floor (16 units up)."""
    things = [(z0, lambda x0=x0, z0=z0, x1=x1, z1=z1: block(m, x0, z0, x1, z1, 16, 1)) for x0, z0, x1, z1 in STARK_RIDGES]
    things += [(z, lambda put=put, x=x, z=z: put(m, x, z)) for put, x, z in STARK_ROCKS]
    for _, draw in sorted(things, key=lambda t: t[0]):
        draw()


def grass(a, rng):
    """Floaroma Meadow's grass, flower beds (their flowers swaying as the game's) and trees."""
    tex = a.textures(*MEADOW)
    anim = {}
    for key, n in FLOWERS.items():
        anim[key], steps = a.anim(n)
    m = Mat(tex, anim)
    # The meadow's short grass under everything.
    x0, z0, x1, z1 = -T, -2 * T, (W + 1) * T, (H + 2) * T
    m.quad([(x0, 16, z0), (x1, 16, z0), (x1, 16, z1), (x0, 16, z1)], [(x0 / 16, z0 / 16), (x1 / 16, z0 / 16), (x1 / 16, z1 / 16), (x0 / 16, z1 / 16)], 'ngrass')
    # Its flower beds round the clearing in the middle, grass paths a tile or two wide between them, as the meadow's are
    # laid out: big beds of rings of colour at the sides, rows of colour above and below.
    keys = list(FLOWERS)
    beds = [(1, 2, 13, 12), (1, 15, 13, 24), (34, 2, 46, 12), (34, 15, 46, 24), (15, 2, 22, 6), (25, 2, 32, 6), (15, 21, 22, 24), (25, 21, 32, 24)]
    trees = border_trees(rng)
    shaded = {(x + dx, z + dz) for x, z in trees for dx in (0, 1) for dz in (0, 1)}
    for x0, z0, x1, z1 in beds:
        colours = rng.sample(keys, 3)
        for z in range(z0, z1 + 1):
            for x in range(x0, x1 + 1):
                ring = min(x - x0, x1 - x, z - z0, z1 - z)
                # The corners rounded off; a ring of colour every 2 tiles in (a row every tile in a narrow bed).
                if min(x - x0, x1 - x) + min(z - z0, z1 - z) == 0 or (x, z) in shaded:
                    continue
                band = (z - z0) if z1 - z0 < 4 else ring // 2
                # The flowers over their leaves (t3_fl_g), as the meadow draws them.
                m.flat(x, z, 16, 't3_fl_g')
                m.flat(x, z, 16, colours[band % len(colours)])
    for x, z in sorted(trees, key=lambda t: t[1]):
        tree(m, x, z)
    return m, steps


def border_trees(rng):
    """Floaroma Meadow's trees round the edges (each 2 tiles square, their tops): two staggered rows along the top and
    the bottom, a column down each side, a few missing from it."""
    spots = []
    for z, shift in ((-1, 0), (0, 1), (H - 3, 0), (H - 2, 1)):
        for x in range(-1 + shift, W, 2):
            spots.append((x, z))
    for x in (-1, W - 1):
        for z in range(3, H - 3, 2):
            if rng.random() < 0.9:
                spots.append((x, z))
    return spots


SCENES = {'water': water, 'fire': fire, 'grass': grass}


# --- The arena layout (the default): the three laid out as the FireRed/LeafGreen set's (frlg_mats.py's arena layout),
# one arena for all, its outline on the picture where theirs is ---

ARENA = (4, 24, 8, 40)  # rows and columns, end exclusive: frlg_mats.py's ARENA (20 x 32 tiles), in the middle 600 px


def arena_land(y0, y1, x0, x1, cut=3, top_only=False):
    """A rounded rectangle of tiles (rows y0..y1, columns x0..x1, end exclusive), its corners cut in steps `cut` tiles
    across (frlg_mats.py's `arena_land`; `top_only`: only its top corners, as its raised fire arena's)."""
    land = [[y0 <= z < y1 and x0 <= x < x1 for x in range(W)] for z in range(H)]
    for j in range(cut):
        for i in range(cut - j):
            for z, x in ((y0 + j, x0 + i), (y0 + j, x1 - 1 - i)) + (() if top_only else ((y1 - 1 - j, x0 + i), (y1 - 1 - j, x1 - 1 - i))):
                land[z][x] = False
    return land


def near(land, x, z, r=1):
    """Whether any land tile is within r tiles of tile x, z."""
    return any(0 <= zz < H and 0 <= xx < W and land[zz][xx] for zz in range(z - r, z + r + 1) for xx in range(x - r, x + r + 1))


def fire_arena(a, rng):
    """Fire: Platinum's Stark Mountain floor raised a tile above its magma (as frlg_mats.py's fire arena: its cliff faces
    show as the FireRed one's crater walls and cliff face do), its boulders and small rocks on the floor near the edges,
    and raised outcrops of its rock in the magma where FireRed's stand, a boulder or a rock on each."""
    tex = a.pt_textures(*PT_STARK)
    frames, steps = scrolled(a.pt_prop_texture(PT_MAGMA), *a.pt_scroll(PT_MAGMA_SCROLL))
    m = Mat(tex, {'magma': frames})
    y0, y1, x0, x1 = ARENA
    # The floor a column in from the outline at the sides (the walls take it), its last two rows the cliff face's (it
    # drops 1.6 tiles on the picture), its top corners stepped as FireRed's (one step less: the walls round them out).
    land = arena_land(y0, y1 - 2, x0 + 1, x1 - 1, cut=2, top_only=True)
    magma(m, 'magma')
    cliffs(m, land, 0, 'wcliff', 'criffp_mag')
    # FireRed's outcrops (rows, columns, height and width, the cliff's two rows and the walls' columns in them): their
    # tops in from them as the arena's floor is.
    for y, x, h, w in sorted(((1, 1, 6, 5), (20, 42, 6, 5), (11, 1, 4, 4), (10, 43, 4, 4), (24, 0, 4, 4), (0, 43, 4, 4), (19, 1, 4, 4)), key=lambda o: o[0]):
        block(m, x + 1, y, x + w - 2, y + h - 3, 0, 1, foot='criffp_mag')
        if h == 6:
            boulder(m, x + 1, y + 1)
        else:
            stone(m, x + w // 2, y + 1)
    # On the floor near its edges, where FireRed's mounds (boulders) and rocks are, from the back.
    things = [(boulder, x0 + 4, y0 + 2), (boulder, x1 - 7, y1 - 7), (boulder, x0 + 2, y0 + 9)]
    things += [(stone, x, z) for z, x in ((y0 + 2, x0 + 10), (y0 + 3, x1 - 5), (y1 - 5, x0 + 4), (y1 - 4, x0 + 14), (y0 + 2, x0 + 22), (y1 - 4, x1 - 12), (y0 + 12, x1 - 3), (y0 + 6, x0 + 2))]
    for put, x, z in sorted(things, key=lambda t: t[2]):
        put(m, x, z)
    return m, steps


def rough(rng, y0, y1, x0, x1):
    """An uneven island of tiles (rows y0..y1, columns x0..x1, end exclusive), in the spirit of the fire scene's arena:
    each corner cut in steps of its own (2 to 4 tiles), bumps out and notches in, 2 to 4 tiles long and 1 or 2 deep,
    along the top and bottom, and the sides stepping out or in a tile here and there."""
    land = [[y0 <= z < y1 and x0 <= x < x1 for x in range(W)] for z in range(H)]
    for cz, cx, sz, sx in ((y0, x0, 1, 1), (y0, x1 - 1, 1, -1), (y1 - 1, x0, -1, 1), (y1 - 1, x1 - 1, -1, -1)):
        cut = rng.choice((2, 3, 3, 4))
        for j in range(cut):
            for i in range(cut - j):
                land[cz + sz * j][cx + sx * i] = False
    for z, out in ((y0, -1), (y1 - 1, 1)):
        x = x0 + 4 + rng.randint(0, 2)
        while x < x1 - 8:
            w, d = rng.randint(2, 4), rng.choice((1, 1, 2))
            bump = rng.random() < 0.5
            for xx in range(x, x + w):
                for k in range(d):
                    if bump:
                        land[z + out * (k + 1)][xx] = True
                    else:
                        land[z - out * k][xx] = False
            x += w + rng.randint(3, 7)
    for x, out in ((x0, -1), (x1 - 1, 1)):
        z = y0 + 3 + rng.randint(0, 2)
        while z < y1 - 6:
            h = rng.randint(3, 5)
            for zz in range(z, z + h):
                land[zz][x + out if rng.random() < 0.5 else x] = rng.random() < 0.5 or land[zz][x + out]
            z += h + rng.randint(2, 4)
    return land


def water_arena(a, rng):
    """Water: Route 222's sand island in the sea, uneven (`rough`) about FireRed's island's footprint, its shore all
    round (the band a tile out from the sand), two small uneven islets out at sea where FireRed's sandbars are, and sea
    rocks where its rocks are (but any by the shore)."""
    tex = a.textures(*ROUTE_222)
    sea_frames, steps = a.anim(SEA)
    shore_frames, shore_steps = a.anim(SHORE)
    assert [s[1] for s in steps] == [s[1] for s in shore_steps]
    m = Mat(tex, {'sea': sea_frames, 'hamabe': shore_frames})
    y0, y1, x0, x1 = ARENA
    # The sand a tile in from FireRed's outline: the shore's band is the tile outside it.
    land = rough(rng, y0 + 1, y1 - 1, x0 + 1, x1 - 1)
    for cells in (((2, 3), (2, 4), (3, 4)), ((19, 44), (19, 45), (20, 45))):  # the islets, where FireRed's sandbars are
        for z, x in cells:
            land[z][x] = True
    land = tidy(land)
    sea(m, 'sea')
    shore(m, land, 'beach', 'hamabe')
    beach_terrain(m, a)
    spots = [(x, z) for z, x in ((0, 10), (0, 30), (1, 40), (2, 15), (3, 26), (5, 1), (8, 4), (13, 5), (17, 1), (21, 4), (24, 0), (25, 9),
                                 (26, 18), (24, 23), (26, 28), (25, 37), (23, 44), (13, 45), (8, 42), (4, 45), (0, 46))
             if not any(near(land, xx, zz, 2) for xx in (x, x + 1) for zz in (z, z + 1))]
    for x, z in sorted(spots, key=lambda s: s[1]):
        sea_rock(m, x, z)
    return m, steps


# Route 213's beach on the island, as its top left chunk has it (the user's screenshot): rock ridges a tile high (its
# criff tops and criffp faces, as `block` builds them), grass where the sand meets it (ngrass, edged on the sand by
# beachp: Route 213's sand-to-grass band, laid as the shore's; its tall grass, nectgr, a tile of its own in place of
# ngrass, on most of a patch's tiles, a thin broken rim of ngrass left round it: the chunk's rim is a full tile, the
# user's), boulders and small rocks. Placed by hand on this
# island (rough's, seeded 'water'), each clear of the middle (a desktop's middle 360 x 250 px) and on sand all round.
BEACH_RIDGES = [(10, 11, 11, 15), (37, 9, 37, 13), (29, 23, 30, 23)]  # tops (x0, z0, x1, z1, inclusive), a face round each
# Its grass patches: rows of tiles (z, x0, x1, inclusive), uneven: two near the top edge, one at the bottom right.
BEACH_GRASS = [((7, 11, 13), (8, 10, 13), (9, 10, 12)), ((5, 25, 26), (6, 23, 28), (7, 24, 27)), ((19, 32, 34), (20, 31, 34), (21, 31, 33))]
BEACH_ROCKS = [(boulder, 8, 8), (boulder, 36, 19), (stone, 33, 5), (stone, 13, 22), (stone, 39, 17)]


def beach_terrain(m, a):
    """Route 213's beach pieces on the island (BEACH_*), on its sand (16 units up)."""
    m.tex.update({k: v for k, v in a.textures(*ROUTE_213).items() if k in ('criff', 'criffp', 'ngrass', 'nectgr', 'beachp', 'imped')})
    grass = [[False] * W for _ in range(H)]
    for patch in BEACH_GRASS:
        for z, x0, x1 in patch:
            for x in range(x0, x1 + 1):
                grass[z][x] = True
    shore(m, grass, 'ngrass', 'beachp', y_top=16, y_low=16, **BEACHP)
    for z in range(H):
        for x in range(W):
            if not grass[z][x]:
                continue
            sides = sum(grass[z + dz][x + dx] for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            # Inside, and every other edge tile with grass on two sides (the rim's breaks).
            if sides >= 3 or (sides == 2 and (x + z) % 2 == 0):
                m.flat(x, z, 16, 'nectgr')
    things = [(z0, lambda x0=x0, z0=z0, x1=x1, z1=z1: block(m, x0, z0, x1, z1, 16, 1)) for x0, z0, x1, z1 in BEACH_RIDGES]
    things += [(z, lambda put=put, x=x, z=z: put(m, x, z)) for put, x, z in BEACH_ROCKS]
    for _, draw in sorted(things, key=lambda t: t[0]):
        draw()


def smooth_noise(gen, cell):
    """Smooth random values (0-1) over the scene's tiles: random values on a grid `cell` tiles apart, blended between."""
    grid = gen.random((H // cell + 2, W // cell + 2))
    zs, xs = np.arange(H) / cell, np.arange(W) / cell
    z0, x0 = zs.astype(int), xs.astype(int)
    tz, tx = (zs - z0)[:, None], (xs - x0)[None, :]
    tz, tx = tz * tz * (3 - 2 * tz), tx * tx * (3 - 2 * tx)
    g = lambda dz, dx: grid[(z0 + dz)[:, None], (x0 + dx)[None, :]]
    return (g(0, 0) * (1 - tx) + g(0, 1) * tx) * (1 - tz) + (g(1, 0) * (1 - tx) + g(1, 1) * tx) * tz


def flower_beds(rng, shaded):
    """Flowers round the field (tile -> FLOWERS key), organic as the user asked (no rows, no frame round the field):
    drifts where smooth noise (two scales) is high, thinning out towards the middle (a rounded box round the arena's
    centre, clear inside it for the cards), their colours by another noise (patches of a colour, mixed where they meet,
    and a few tiles of another colour in any patch), and single flowers scattered loose between them."""
    gen = np.random.default_rng(rng.randrange(2 ** 32))
    keys, beds = list(FLOWERS), {}
    y0, y1, x0, x1 = ARENA
    cz, cx, az, ax = (y0 + y1 - 1) / 2, (x0 + x1 - 1) / 2, (y1 - y0) / 2, (x1 - x0) / 2
    zz, xx = np.mgrid[0:H, 0:W]
    # How far out from the middle: 1 at the arena's edge (a superellipse, so its corners are rounded).
    r = ((np.abs(xx - cx) / ax) ** 4 + (np.abs(zz - cz) / az) ** 4) ** 0.25
    density = np.clip((r - 0.8) / 0.45, 0, 1)
    drift = 0.6 * smooth_noise(gen, 4) + 0.4 * smooth_noise(gen, 2)
    loose, mix = gen.random((H, W)), gen.random((H, W))
    colour = smooth_noise(gen, 5) * len(keys)
    for z in range(H):
        for x in range(W):
            if (x, z) in shaded or r[z, x] < 0.82:
                continue
            if drift[z, x] + 0.5 * density[z, x] > 0.85 or (density[z, x] > 0 and loose[z, x] < 0.05):
                k = int(colour[z, x]) % len(keys)
                if mix[z, x] < 0.25:
                    k = (k + 1 + int(mix[z, x] * 12) % (len(keys) - 1)) % len(keys)
                beds[x, z] = keys[k]
    return beds


def grass_arena(a, rng):
    """Grass: Floaroma Meadow's grass, its flowers in drifts round the open middle (`flower_beds`), its trees in two
    staggered rows along the top and bottom."""
    tex = a.textures(*MEADOW)
    anim = {}
    for key, n in FLOWERS.items():
        anim[key], steps = a.anim(n)
    m = Mat(tex, anim)
    x0, z0, x1, z1 = -T, -2 * T, (W + 1) * T, (H + 2) * T
    m.quad([(x0, 16, z0), (x1, 16, z0), (x1, 16, z1), (x0, 16, z1)], [(x0 / 16, z0 / 16), (x1 / 16, z0 / 16), (x1 / 16, z1 / 16), (x0 / 16, z1 / 16)], 'ngrass')
    # (The bottom rows a tile lower than the scene layout's: a tree's leaves reach a tile and a half up, and the flowers'
    # row under the field shows as FireRed's does.)
    trees = [(x, z) for z, shift in ((-1, 0), (0, 1), (H - 2, 0), (H - 1, 1)) for x in range(-1 + shift, W, 2)]
    shaded = {(x + dx, z + dz) for x, z in trees for dx in (0, 1) for dz in (0, 1)}
    for (x, z), key in sorted(flower_beds(rng, shaded).items(), key=lambda b: (b[0][1], b[0][0])):
        # The flowers over their leaves (t3_fl_g), as the meadow draws them.
        m.flat(x, z, 16, 't3_fl_g')
        m.flat(x, z, 16, key)
    for x, z in sorted(trees, key=lambda t: t[1]):
        tree(m, x, z)
    return m, steps


ARENAS = {'water': water_arena, 'fire': fire_arena, 'grass': grass_arena}
# The app's (--layout app, the default): the arena layout's water and grass, and the scene layout's fire (the user's:
# its uneven arena, not the arena layout's rounded one).
APP = {'water': water_arena, 'fire': fire, 'grass': grass_arena}


def write(name, m, steps, ms_scale=1.0):
    """Renders each step of the scene and writes its sheet and timing."""
    frames = [m.render(frame) for frame, _ in steps]
    pixels = np.vstack(frames)
    palette, index = np.unique(pixels.reshape(-1, 3), axis=0, return_inverse=True)
    colours = len(palette)
    if colours <= 256:
        # The DS's few colours: a palette of exactly them.
        sheet = Image.fromarray(index.reshape(pixels.shape[:2]).astype(np.uint8), 'P')
        sheet.putpalette(palette.astype(np.uint8).ravel().tolist())
    else:
        sheet = Image.fromarray(pixels).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    os.makedirs(OUT, exist_ok=True)
    sheet.save(os.path.join(OUT, name + '.png'), optimize=True)
    json.dump({'width': W * 16, 'height': H * 16, 'frames': [{'y': i * H * 16, 'ms': round(t * TICK_MS * ms_scale)} for i, (_, t) in enumerate(steps)]}, open(os.path.join(OUT, name + '.json'), 'w'))
    print(name, len(frames), 'frames,', colours, 'colours,', os.path.getsize(os.path.join(OUT, name + '.png')), 'bytes')


def main():
    import random
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    pt_cache = opt('--pt-cache', os.path.join(tempfile.gettempdir(), 'pokeplatinum'))
    layout = opt('--layout', 'app')
    scenes = {'app': APP, 'arena': ARENAS, 'scene': SCENES}[layout]
    a = Assets(apicula, cache, pt_cache)
    for name in args or list(scenes):
        m, steps, *scale = scenes[name](a, random.Random(name))
        write(name, m, steps, *scale)


if __name__ == '__main__':
    main()
