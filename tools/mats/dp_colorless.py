"""Makes up the Diamond/Pearl Colorless mat, laid out as the FireRed/LeafGreen one (frlg_colorless.py's lobby, Celadon
Department Store's 1F) but from Sinnoh's department store, Veilstone's (the user's: as like the FRLG mats as can be, with
DPP's pieces). Its rooms (pret/pokediamond's MAP_VEILSTONE_DEPARTMENT_STORE_1F to _5F, each one land data chunk, texture
set 21, and their build models) are cut up and put together again in 3D, then drawn tilted by the HGSS maps' renderer
(../routes/hgss/render_hgss.py) at the Sinnoh run maps' tilt:
- the floor: the 1F's orange floor (d001, its 32 px pattern two tiles across, a texel a unit) over the whole frame, and
  its shading as the game has it (the floor's vertex colours: Diamond bakes the shadows of the walls and the furniture
  into them), one orange shade (the 1F's own) wherever the pieces' rooms have theirs (`floor_shade`): along the back wall and
  the frame's left edge as the 1F has them, and round each piece cut from a room, as its own room shades it;
- the back wall: the 1F's (d002, the same all along: its bands by height) across the whole width, a tile up from the
  1F's so its top meets the frame's, its foot a little darker as the 1F's is; the elevator (its opening, ele001, and its
  doors, build model 75) in the middle with the 1F's floor sign beside it, cut from the 1F's wall;
- no escalators (Veilstone's go up beside a pillar in the middle of each floor, where the cards are here; turned to go
  up into the back wall they led nowhere: taken out, the user's, 2026-11-08);
- the furnishings round the edges, each cut from the floor it's on with what stands on it (`PIECES`): the 1F's two
  U-shaped glass counters, the 2F's corner of blue counters and glass cases with its register and wall display, the
  4F's left side (its two wall displays, its long blue counter with a plant at its head, its glass case), the 3F's blue
  counter, the 5F's café tables and chairs and its fridges (419), the bookshelves (121) and potted plants (85) as the 1F
  stands them, and two of the 1F's door mats (78) at the bottom where FireRed's are (the 1F has one); the shading the
  pieces bring is cut below their rooms' own wall band (the lobby's is laid once);
- a few shoppers (Diamond's people sprites, public/overworld/dp/, dp_sprites.py's strips: standing, then two walking
  frames a way) about the edges, going about frlg_colorless.py's routine (its `routine`, `ROUTINE`, `PAUSES` and pace,
  the user's): now and then one turning to look another way or strolling 1-3 tiles out along the open floor and back,
  every shopper home and facing down again by the loop's end; a tile every 32 game frames, half the game's pace (a frame
  every 8, `STEP_MS`), the walking frames alternating tile by tile. Frames that look alike are drawn once and shown again
  (the sheet's `order`); a pause is a frame shown PAUSE_MS at a time. They're drawn over the rendered room, 32 px wide
  and centred on their tile, their feet at its foot, as the Sinnoh maps draw them (the strips dp_sprites.py writes); a
  stroll keeps to the floor no piece stands on (`floor_open`), off the cards' area (rows 5-23, columns 10-37) and the
  others' spots.

Usage: python tools/mats/dp_colorless.py [--apicula <exe>] [--cache <dir>] [--seed N] [--out DIR] [--preview <png>]
Writes apps/web/public/mats/dp/colorless.png and colorless.json through frlg_mats.py's `save` (a sheet of the frames,
indexed; {width, height, frames: [{y, ms}]}), and with --preview the first frame to that file too. The decompilation's
files are cached as dp_mats.py's are. Needs numpy, Pillow and apicula."""
import argparse, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
import dp_mats as dm
import frlg_mats as fm
import frlg_colorless as fc
from dp_mats import T, W, H, TILT, dd, glb_prims, Scene, REPEAT
from render_hgss import turned
from hgss_data import texture_matrices

REPO = os.path.join(HERE, '..', '..')
SPRITES = os.path.join(REPO, 'apps', 'web', 'public', 'overworld', 'dp')
FLOORS = {n: f'MAP_VEILSTONE_DEPARTMENT_STORE_{n}F' for n in range(1, 6)}
TEX_SET = 21  # the store's map texture set (area data 22's)
FLOOR_MAT, WALL_MAT = 'd001', 'd002'  # the 1F's orange floor and its wall
WALL_TOP, WALL_FOOT = 46, -2  # the wall's height (model units; its foot a little under the floor, 0.86 dark)
WALL_V = (-0.02084, 0.95848)  # its texture's v by height (v = a y + b), as the 1F lays it
WALL_Z = 1.625  # the wall's face (tiles: the 1F's, 2.625, a tile up)
UP = 1  # rows everything along the back wall is moved up from where its floor has it

# The pieces: (floor, the box cut from it: x0, z0, x1, z1 in tiles, inclusive of what lies on its edges, and where its top
# left goes: x, z). A piece is its room's terrain in the box but the floor, the build models standing in it, and its
# floor's shading in the box.
PIECES = [
    # the back: the elevator and the floor sign beside it, from the 1F's wall (the elevator's middle at the frame's)
    (1, (12.9, 2.0, 16.75, 2.8), (20.9 + 0.5, 2.0 - UP)),
    # the bookshelves and plants against the wall, as the 1F has them (its top left corner)
    (1, (1.0, 2.8, 7.0, 4.6), (0.0, 2.8 - UP)),
    (1, (3.0, 2.8, 7.0, 4.6), (41.0, 2.8 - UP)),
    (1, (20.0, 2.8, 21.0, 4.6), (47.0, 2.8 - UP)),
    # the left: the 1F's left glass counter, the 4F's left side (its wall displays, its long blue counter with a plant at its
    # head and its glass case), the 3F's blue counter with its register
    (1, (2.0, 5.5, 8.5, 11.5), (1.0, 6.0)),
    (4, (1.0, 2.75, 6.0, 10.6), (0.0, 12.75)),
    (3, (1.0, 5.01, 6.5, 7.1), (0.0, 21.01)),  # (from z 5.01: its tall glass case stands behind it, to z 5)
    # the right: the 1F's right glass counter (its price tag), the 2F's corner of counters and glass cases
    (1, (14.5, 5.5, 21.0, 11.5), (39.5, 6.0)),
    (2, (16.5, 4.6, 21.0, 11.0), (43.5, 12.6)),
    # the 5F's café tables with their chairs, bottom right
    (5, (15.5, 9.5, 18.5, 13.5), (38.5, 19.5)),
    (5, (15.5, 9.5, 18.5, 13.5), (42.5, 19.5)),
]
# Build models put down by themselves: (model, x, z in tiles, a turn about the upright axis in degrees, or 0).
PROPS = [
    (85, 0.5, 24.5, 0), (85, 3.5, 24.5, 0), (85, 6.5, 24.5, 0),  # potted plants along the bottom, as FireRed's
    (85, 47.5, 21.5, 0), (85, 47.5, 24.5, 0),
    (85, 47.5, 11.5, 0),
    (419, 36.5, 2.625 + 0.25, 0), (419, 37.75, 2.625 + 0.25, 0),  # the 5F's fridges against the wall
    (78, 20.5, 27.5, 0), (78, 27.5, 27.5, 0),  # the door mats (the 1F's, at its exit), where FireRed's are
]
# The shoppers: (Diamond's sprite, the column, the row of the tile they stand on), as frlg_colorless.py's SHOPPERS.
SHOPPERS = [('girl2', 7, 13), ('gentleman', 8, 18), ('girl1', 2, 26), ('middleman1', 24, 3), ('woman1', 38, 13), ('man1', 41, 16),
            ('boy1', 44, 25), ('woman3', 38, 22), ('gorggeousw', 16, 26), ('boy2', 31, 26)]
STAND = dict(down=0, up=1, left=2, right=3)  # the strips' standing frames; each way's two walking frames: 4 + 2 * its index, and one more


class Store:
    """The store's rooms and models, converted with apicula as needed: each floor's terrain (its triangles, glb_prims',
    placed in tiles: x and z 16 units a tile from the room's top left) and build models, and its floor's shading."""

    def __init__(self, apicula, cache):
        self.apicula, self.cache = apicula, cache
        self.work = tempfile.mkdtemp(prefix='dp_colorless_')
        self.tex = os.path.join(self.work, 'tex.nsbtx')
        open(self.tex, 'wb').write(dd.read(cache, dd.MAP_TEXTURES, TEX_SET))
        self.headers = dd.map_headers(cache)
        self._floors, self._models, self._floor_mat = {}, {}, {}

    def _convert(self, model_bytes, name):
        path = os.path.join(self.work, name + '.nsbmd'); open(path, 'wb').write(model_bytes)
        out = os.path.join(self.work, name)
        subprocess.run([self.apicula, 'convert', path, self.tex, '-o', out, '-f', 'glb', '--overwrite'], check=True, capture_output=True)
        return glb_prims(next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb')), texture_matrices(model_bytes))

    def floor(self, n):
        """Floor n's (terrain prims, [(model, x, y, z)]: its build models, in model units as the terrain is)."""
        if n not in self._floors:
            _, _, cells = dd.matrix(self.cache, self.headers[FLOORS[n]]['matrix'])
            ch = dd.land_chunk(dd.read(self.cache, dd.LAND_DATA, cells[0]['land']))
            centre = np.array([16 * T, 0, 16 * T])  # (the chunk's model origin is its middle)
            prims = self._convert(ch['model'], f'land{n}')
            # Its floor: the material lying flat over the most ground (its name differs floor to floor), raised to 0 (the
            # 4F's and 5F's lie 2 units down, under their models).
            def flat_area(p):
                t = p['pos'].reshape(-1, 3, 3)
                flat = np.ptp(t[:, :, 1], axis=1) < 0.01
                return (np.abs(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])[:, 1]) / 2)[flat].sum()
            floor = max(prims, key=flat_area)
            self._floor_mat[n] = floor['material']
            centre = centre - [0, np.median(floor['pos'][:, 1]), 0]
            for p in prims:
                p['pos'] = p['pos'] + centre
            self._floors[n] = prims, [(b['model'], *(np.array(b['pos']) + centre * [1, 0, 1])) for b in ch['buildings']]
        return self._floors[n]

    def floor_mat(self, n):
        self.floor(n)
        return self._floor_mat[n]

    def model(self, mid):
        if mid not in self._models:
            self._models[mid] = self._convert(dd.read(self.cache, dd.BUILDING, mid), f'bm{mid}')
        return self._models[mid]

    def shade_mask(self, n):
        """Where floor n's floor is shaded (its vertex colours under white: 1 shaded, 0 not), a pixel a texel, 32 tiles square."""
        prims, _ = self.floor(n)
        scene = Scene(32 * 16, 32 * 16, tilt=TILT, ground=0)
        for p in prims:
            if p['material'] == self.floor_mat(n):
                scene.mesh(p['pos'], p['uv'], p['col'])
        scene.draw()
        lum = scene.img.mean(axis=2)
        return ((lum > 0.05) & (lum < 0.97)).astype(float)

    def shade_colour(self):
        """The 1F's floor shade (the vertex colour of its shadows: the commonest one under white)."""
        prims, _ = self.floor(1)
        cols = np.vstack([p['col'] for p in prims if p['material'] == FLOOR_MAT])
        dark = cols[cols.mean(axis=1) < 0.97]
        values, counts = np.unique(dark.round(3), axis=0, return_counts=True)
        return values[counts.argmax()]


def clip(prim, x0, z0, x1, z1):
    """A prim's triangles cut to the box (in model units: x0 <= x <= x1, z0 <= z <= z1), their texture coordinates and
    colours carried along (Sutherland-Hodgman, each triangle's cut polygon a fan again)."""
    pos, uv, col = prim['pos'].reshape(-1, 3, 3), prim['uv'].reshape(-1, 3, 2), prim['col'].reshape(-1, 3, 3)
    out_pos, out_uv, out_col = [], [], []
    planes = [(0, x0, 1), (0, x1, -1), (2, z0, 1), (2, z1, -1)]
    for P, U, C in zip(pos, uv, col):
        poly = [np.concatenate([P[k], U[k], C[k]]) for k in range(3)]
        if all(x0 <= v[0] <= x1 and z0 <= v[2] <= z1 for v in poly):
            pass
        else:
            for axis, at, sign in planes:
                if not poly:
                    break
                cut = []
                for a, b in zip(poly, poly[1:] + poly[:1]):
                    da, db = sign * (a[axis] - at), sign * (b[axis] - at)
                    if da >= -1e-6:
                        cut.append(a)
                    if (da >= -1e-6) != (db >= -1e-6):
                        cut.append(a + (b - a) * (da / (da - db)))
                poly = cut
            if len(poly) < 3:
                continue
        for k in range(1, len(poly) - 1):
            for v in (poly[0], poly[k], poly[k + 1]):
                out_pos.append(v[:3]); out_uv.append(v[3:5]); out_col.append(v[5:8])
    if not out_pos:
        return None
    return {**prim, 'pos': np.array(out_pos), 'uv': np.array(out_uv), 'col': np.array(out_col)}


def cut(store, n, box, to):
    """A piece (PIECES'): floor n's terrain in `box` but its floor, its build models standing in it, moved to `to`; the
    prims, and the move (tiles)."""
    x0, z0, x1, z1 = box
    move = np.array([to[0] - x0, 0, to[1] - z0]) * T
    prims, models = store.floor(n)
    out = []
    for p in prims:
        if p['material'] == store.floor_mat(n):
            continue
        c = clip(p, x0 * T, z0 * T, x1 * T, z1 * T)
        if c is not None:
            out.append({**c, 'pos': c['pos'] + move})
    for mid, x, y, z in models:
        if x0 * T <= x <= x1 * T and z0 * T <= z <= z1 * T:
            for p in store.model(mid):
                out.append({**p, 'pos': p['pos'] + np.array([x, y, z]) + move})
    return out


def wall():
    """The back wall across the frame (WALL_MAT's texture, its bands by height), its foot below the floor 0.86 dark."""
    x0, x1, z = 0, W * T, WALL_Z * T
    quads = []
    for y0, y1, c in ((WALL_FOOT, 0, 0.86), (0, WALL_TOP, 1.0)):
        pos = np.array([(x0, y0, z), (x0, y1, z), (x1, y1, z), (x0, y0, z), (x1, y1, z), (x1, y0, z)], float)
        uv = np.c_[pos[:, 0] / 32, WALL_V[0] * pos[:, 1] + WALL_V[1]]
        quads.append((pos, uv, np.full((6, 3), c)))
    return quads


def floor_shade(store):
    """The lobby's floor shading: a mask (1 shaded) a pixel a texel, the 1F's band along the back wall and its column
    down the left edge, and each piece's room's shading in its box, where the piece goes."""
    mask = np.zeros((H * 16, W * 16))
    one = store.shade_mask(1)
    # The band under the back wall (the 1F's rows 2.75 to 4, at a plain column) and the left edge's column (its x 1-2).
    band = one[int(2.625 * 16):4 * 16, 10 * 16]
    top = int((WALL_Z) * 16)
    mask[top:top + len(band), :] = np.maximum(mask[top:top + len(band), :], band[:, None])
    col = one[11 * 16, 16:3 * 16]
    mask[top:, :len(col)] = np.maximum(mask[top:, :len(col)], col[None, :])
    for n, (x0, z0, x1, z1), (tx, tz) in PIECES:
        src = store.shade_mask(n).copy()
        src[:int(3.75 * 16)] = 0  # (the band under its room's back wall: the lobby's own is laid already)
        sy, sx = int(round(z0 * 16)), int(round(x0 * 16))
        hh, ww = int(round((z1 - z0) * 16)), int(round((x1 - x0) * 16))
        if n == 1 and z1 <= 4.6:  # (the pieces along the back wall bring no shade but the band's, laid already)
            continue
        dy, dx = int(round(tz * 16)), int(round(tx * 16))
        part = src[sy:sy + hh, sx:sx + ww]
        hh, ww = min(hh, H * 16 - dy), min(ww, W * 16 - dx)
        mask[dy:dy + hh, dx:dx + ww] = np.maximum(mask[dy:dy + hh, dx:dx + ww], part[:hh, :ww])
    return mask


def lobby(store):
    """The lobby drawn once (RGB): the floor, shaded, then the wall, the pieces and the props over it."""
    scene = Scene(W * 16, H * 16, tilt=TILT, ground=0)
    floor_tex = next(p['tex'] for p in store.floor(1)[0] if p['material'] == FLOOR_MAT)
    wall_tex = next(p['tex'] for p in store.floor(1)[0] if p['material'] == WALL_MAT)
    X, Z = W * T, H * T
    pos = np.array([(0, 0, 0), (X, 0, 0), (X, 0, Z), (0, 0, 0), (X, 0, Z), (0, 0, Z)], float)
    scene.mesh(pos, np.c_[pos[:, 0] / 32, pos[:, 2] / 32], np.ones((6, 3)), floor_tex, (REPEAT, REPEAT))
    scene.draw()
    mask = floor_shade(store)[..., None]
    scene.img = scene.img * (1 - mask) + scene.img * store.shade_colour() * mask
    for pos, uv, col in wall():
        scene.mesh(pos, uv, col, wall_tex, (REPEAT, REPEAT))
    for n, box, to in PIECES:
        for p in cut(store, n, box, to):
            scene.mesh(p['pos'], p['uv'], p['col'], p['tex'], p['wrap'], p['alpha'], p['blend'])
    for mid, x, z, turn in PROPS:
        for p in store.model(mid):
            scene.mesh(turned(p['pos'], ('y', turn) if turn else None) + np.array([x * T, 0, z * T]), p['uv'], p['col'], p['tex'], p['wrap'], p['alpha'], p['blend'])
    scene.draw()
    return (np.clip(scene.img, 0, 1) * 255).astype(np.uint8)


def floor_open():
    """The tiles a stroll may cross (True): the open floor, off the pieces' boxes (with a tile round them) and the props'
    tiles and off the back wall's rows."""
    ok = np.ones((H, W), bool)
    ok[:5] = False
    for _, (x0, z0, x1, z1), (tx, tz) in PIECES:
        ok[max(0, int(np.floor(tz)) - 1):int(np.ceil(tz + z1 - z0)) + 1, max(0, int(np.floor(tx))):int(np.ceil(tx + x1 - x0))] = False
    for _, x, z, _ in PROPS:
        ok[max(0, int(z) - 1):int(z) + 1, max(0, int(x) - 1):int(x) + 1] = False
    return ok


def person(name):
    """A strip's frames (32x32 RGBA arrays)."""
    a = np.asarray(Image.open(os.path.join(SPRITES, name + '.png')).convert('RGBA'))
    return [a[:, i:i + 32] for i in range(0, a.shape[1], 32)]


def draw(rgb, people, pics):
    """The shoppers drawn over a frame, the lower ones over the higher: each (name, x px, y px of the tile its feet are on,
    facing, frame: 0 standing, 1 or 2 a walking frame), 32 px wide centred on the tile, its feet at the tile's foot."""
    for name, x, y, facing, frame in sorted(people, key=lambda p: p[2]):
        k = STAND[facing] if frame == 0 else 4 + 2 * STAND[facing] + frame - 1
        pic = pics[name][k]
        top, left = y + 16 - 32, x - 8
        ys = slice(max(0, top), min(rgb.shape[0], top + 32))
        xs = slice(max(0, left), min(rgb.shape[1], left + 32))
        p = pic[ys.start - top:ys.stop - top, xs.start - left:xs.stop - left]
        sub = rgb[ys, xs]
        sub[p[..., 3] > 127] = p[..., :3][p[..., 3] > 127]


def strolling(still, rng, people=SHOPPERS):
    """The lobby with its shoppers going about frlg_colorless.py's `routine`: (shots, order) for frlg_mats.save, the frames
    alike drawn once. `routine` keeps a stroll to its grid's FLOOR tiles off the cards and the others' spots."""
    grid = np.where(floor_open(), fc.FLOOR, -1)
    pics = {name: person(name) for name, _, _ in people}
    state = [[name, x * 16, y * 16, 'down', 0] for name, x, y in people]
    shots, order, seen = [], [], {}

    def show(ms, times=1):
        key = (tuple(map(tuple, state)), ms)
        if key not in seen:
            rgb = still.copy()
            draw(rgb, state, pics)
            seen[key] = len(shots)
            shots.append((rgb, ms))
        order.extend([seen[key]] * times)

    pause_frames = lambda s: max(1, round(s * 1000 / fc.PAUSE_MS))
    stepped = [0] * len(people)  # (each one's walking frame alternates tile by tile)
    for pause, who, move in fc.routine(rng, grid, people):
        show(fc.PAUSE_MS, pause_frames(pause))
        me = state[who]
        if move[0] == 'turn':
            me[3] = move[1]
            continue
        _, d, n = move
        before = me[3]
        for way, pause_back in ((d, True), ({'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'}[d], False)):
            me[3] = way
            dx, dy = fc.DIRS[way]
            for _ in range(n):
                stepped[who] ^= 1
                for k in range(1, 5):  # (4 px every 4 game frames: the first half on a walking frame, the second standing)
                    me[1] += dx * 4
                    me[2] += dy * 4
                    me[4] = (1 + stepped[who]) if k <= 2 else 0
                    if k < 4:
                        show(fc.STEP_MS)
            me[4] = 0
            if pause_back:
                show(fc.PAUSE_MS, pause_frames(float(rng.uniform(0.5, 1.2))))
        me[3] = before
    show(fc.PAUSE_MS, pause_frames(float(rng.uniform(*fc.PAUSES))))
    return shots, order


def main():
    ap = argparse.ArgumentParser(description="Draws the Diamond/Pearl Colorless type mat, Veilstone Department Store's lobby.")
    ap.add_argument('--apicula', default='apicula')
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'pokediamond'))
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', help='where the sheet goes (apps/web/public/mats/dp/ without it)')
    ap.add_argument('--preview', help='also write the first frame here, as a PNG')
    args = ap.parse_args()
    still = lobby(Store(args.apicula, args.cache))
    shots, order = strolling(still, np.random.default_rng(args.seed))
    fm.save('colorless', shots, args.out or dm.OUT, order)
    if args.preview:
        Image.fromarray(shots[order[0]][0]).save(args.preview)
    print('colorless', len(shots), 'frames,', len(order), 'shown,', round(sum(shots[i][1] for i in order) / 1000, 1), 's')


if __name__ == '__main__':
    main()
