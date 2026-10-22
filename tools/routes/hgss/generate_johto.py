"""Makes up the three Johto route maps that aren't HeartGold/SoulSilver's own (agreed with the user), drawn with HGSS's
textures and models by render_hgss.py, as the real routes are:

- Route 40: a surf route from the top down. Olivine's beach (the real Route 40's top chunk, to its shore), then a sea lane
  between two columns of rocks as near the edges as they go (nudged in and out at random), with sandbars of random sizes
  and shapes at random places across it, some against the rocks (built as the real one is: sand, and a wave band round
  it), and a beach across the south end, light sand along the water giving way to dry sand behind it at random.
- Route 42: a cave from left to right (Mt. Mortar's textures, its walls built as HGSS's are: `cave`): three chambers joined by passages, the middle one with a
  small waterfall (HGSS's `dsm_fal1`) falling from a pool up on the north wall into a pool whose stream the path
  crosses by a bridge, Mt. Mortar's shore round the water, and Mt. Moon's rocks (against the walls) and ground patches.
- Route 44: an ice cave from the bottom up (the Ice Path's textures) in two areas, the lower one's ladder climbing to the
  upper one (a fading link).

Usage: python generate_johto.py <out dir> [--apicula <apicula.exe>] [--cache <dir>]
Writes <out dir>/route40.png, route42.png and route44.png, each with a .json: its size in tiles, `rows` ('.' walkable, '#'
not, '~' water: walkable on Route 40, surfed), `spots`, `entrance` and `links`. Needs numpy and Pillow."""
import json, os, subprocess, sys, tempfile
from collections import deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import hgss_data as hd
from render_hgss import Scene, glb_prims, UNIT, REPEAT

T = UNIT  # model units per tile


class Assets:
    """The decompilation's files the maps are made from, converted with apicula as needed."""

    def __init__(self, apicula, cache):
        self.apicula, self.cache = apicula, cache
        self.work = tempfile.mkdtemp(prefix='hgss_gen_')
        self.land = hd.narc(hd.fetch(cache, hd.LAND_DATA))
        self.sets = hd.narc(hd.fetch(cache, hd.MAP_TEXTURES))
        self.buildings = hd.narc(hd.fetch(cache, hd.BUILDINGS['field']))

    def _convert(self, files, out, glb=True):
        args = [self.apicula, 'convert', *files, '-o', out, '--overwrite'] + (['-f', 'glb'] if glb else ['--more-textures'])
        subprocess.run(args, check=True, capture_output=True)
        return out

    def textures(self, set_id):
        """A map texture set's textures, by name (RGBA, 0-1)."""
        src = os.path.join(self.work, f'tex{set_id}.nsbtx'); open(src, 'wb').write(self.sets[set_id])
        out = self._convert([src], os.path.join(self.work, f'tex{set_id}'), glb=False)
        return {f[:-4]: np.asarray(Image.open(os.path.join(out, f)).convert('RGBA')).astype(float) / 255 for f in os.listdir(out) if f.endswith('.png')}

    def chunk(self, land_id, set_id):
        """A terrain chunk's triangles (its model origin at its centre), its buildings' (placed) and its tile rows
        ('.', '#', '~')."""
        ch = hd.land_chunk(self.land[land_id])
        model = os.path.join(self.work, f'land{land_id}.nsbmd'); open(model, 'wb').write(ch['model'])
        tex = os.path.join(self.work, f'tex{set_id}.nsbtx'); open(tex, 'wb').write(self.sets[set_id])
        out = self._convert([model, tex], os.path.join(self.work, f'land{land_id}'))
        glb = next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb'))
        from hgss_map import tile_char
        rows = [''.join(tile_char(ch['perm'][(y * 32 + x) * 2], ch['perm'][(y * 32 + x) * 2 + 1]) for x in range(32)) for y in range(32)]
        prims = glb_prims(glb, hd.texture_matrices(ch['model']))
        for b in ch['buildings']:
            prims += place(self.building(b['model'], tex), b['pos'][0], b['pos'][2], dy=b['pos'][1])
        return prims, rows

    def building(self, model_id, tex=None):
        """A building's triangles (its own textures, or the map's set's: `tex`, an NSBTX file)."""
        model = os.path.join(self.work, f'bm{model_id}.nsbmd'); open(model, 'wb').write(self.buildings[model_id])
        out = self._convert([model] + ([tex] if tex else []), os.path.join(self.work, f'bm{model_id}'))
        return glb_prims(next(os.path.join(out, f) for f in os.listdir(out) if f.endswith('.glb')))


def place(prims, dx=0.0, dz=0.0, mirror=None, dy=0.0):
    """Triangles moved by dx, dy, dz (model units), first mirrored left to right about x = `mirror` if given."""
    out = []
    for p in prims:
        pos = p['pos'].copy()
        if mirror is not None:
            pos[:, 0] = 2 * mirror - pos[:, 0]
        pos[:, 0] += dx; pos[:, 1] += dy; pos[:, 2] += dz
        out.append({**p, 'pos': pos})
    return out


def clip(prims, x0, x1, z0, z1):
    """The parts of the triangles inside x0..x1, z0..z1 (cut exactly, their attributes interpolated)."""
    out = []
    for p in prims:
        verts = np.hstack([p['pos'], p['uv'], p['col']])  # x y z u v r g b
        tris = []
        for k in range(0, len(verts) - 2, 3):
            poly = [verts[k], verts[k + 1], verts[k + 2]]
            for axis, lim, keep_above in ((0, x0, True), (0, x1, False), (2, z0, True), (2, z1, False)):
                if not poly:
                    break
                res = []
                for i in range(len(poly)):
                    a, b = poly[i], poly[(i + 1) % len(poly)]
                    ina = a[axis] >= lim if keep_above else a[axis] <= lim
                    inb = b[axis] >= lim if keep_above else b[axis] <= lim
                    if ina:
                        res.append(a)
                    if ina != inb:
                        t = (lim - a[axis]) / (b[axis] - a[axis])
                        res.append(a + (b - a) * t)
                poly = res
            for i in range(1, len(poly) - 1):
                tris += [poly[0], poly[i], poly[i + 1]]
        if tris:
            v = np.array(tris)
            out.append({**p, 'pos': v[:, :3], 'uv': v[:, 3:5], 'col': v[:, 5:8]})
    return out


def add(scene, prims, origin=(0, 0, 0)):
    for p in prims:
        scene.mesh(p['pos'] + np.array(origin), p['uv'], p['col'], p['tex'], p['wrap'], p['alpha'], p['blend'])


def quad(scene, corners, uvs, tex=None, col=(1, 1, 1), alpha=1.0, blend=False):
    """A quad (4 corners in order, model units) as two triangles."""
    c, u = np.array(corners, float), np.array(uvs, float)
    idx = [0, 1, 2, 0, 2, 3]
    scene.mesh(c[idx], u[idx], np.tile(col, (6, 1)), tex, (REPEAT, REPEAT), alpha, blend)


# --- Picking spots: along the walk from the entrance to the far end, as for the real routes. ---

def walkable(c, surf):
    return c == '.' or (surf and c == '~')


def bfs(rows, start, links, surf):
    h, w = len(rows), len(rows[0])
    jumps = {}
    for a, b in links:
        jumps.setdefault(a, []).append(b); jumps.setdefault(b, []).append(a)
    prev = {start: None}; q = deque([start])
    while q:
        x, y = q.popleft()
        for n in [(x + dx, y + dy) for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0))] + jumps.get((x, y), []):
            if 0 <= n[1] < h and 0 <= n[0] < w and walkable(rows[n[1]][n[0]], surf) and n not in prev:
                prev[n] = (x, y); q.append(n)
    return prev


def check(rows, stops, links, surf):
    for a, b in zip(stops, stops[1:]):
        assert b in bfs(rows, a, links, surf), ('no walk', a, b)
    for x, y in stops:
        assert walkable(rows[y][x], surf), ('not walkable', x, y)


def write(out, name, scene, rows, spots, entrance, links=(), exit=None):
    scene.render(os.path.join(out, name + '.png'))
    json.dump({'width': len(rows[0]), 'height': len(rows), 'rows': rows, 'spots': spots, 'entrance': entrance, 'links': list(links), 'exit': exit}, open(os.path.join(out, name + '.json'), 'w'))
    print(name, len(rows[0]), 'x', len(rows), 'spots', spots, 'entrance', entrance, 'links', list(links))


# --- Route 40 ---

def sand(scene, tx, mask, x_off=0, dark=None):
    """Sand at the real Route 40's height, from a mask of tiles (True: sand), as the real sandbar is built: a flat top
    (beach01) and, round each edge that meets the sea, a band sloping a tile down into the water (swave_un, and over it the
    wave foam swave_p, shifted by its texture matrix as the game has it), with corner pieces at the outside corners.
    `dark`: the tiles of dry sand further from the sea (road01), with the real beach's rim between them and the light sand
    (beach01_r2: a strip along each edge; a corner piece where they meet only across a corner, and where the dry sand is
    on two sides, the texture's inside corner, dry sand round a curve of light)."""
    h, w = len(mask), len(mask[0])
    is_sand = lambda x, y: 0 <= y < h and 0 <= x < w and mask[y][x]
    is_dark = lambda x, y: dark is not None and 0 <= y < h and 0 <= x < w and dark[y][x]
    rim = tx.get('beach01_r2')
    # The rim's corner piece, by where the dark sand is (its texture's other half, turned to that corner).
    corner_uv = [(0.99, 0.01), (0.51, 0.01), (0.51, 0.49), (0.99, 0.49)]
    corner_turn = {(-1, 1): 0, (1, 1): 1, (1, -1): 2, (-1, -1): 3}
    # The inside corner (the texture's last quarter), by the two sides the dry sand is on.
    inside_uv = [(0.99, 0.51), (0.51, 0.51), (0.51, 0.99), (0.99, 0.99)]
    inside_turn = {frozenset({(0, 1), (-1, 0)}): 0, frozenset({(0, 1), (1, 0)}): 1, frozenset({(0, -1), (1, 0)}): 2, frozenset({(0, -1), (-1, 0)}): 3}
    beach, wave, under = tx['beach01'], tx['swave_p'], tx['swave_un']
    def band(top_a, top_b, low_a, low_b, along):
        # One tile of band: its top edge along the sand, its low edge a tile out in the water.
        for t, y_top, y_low, v0, v1, du in ((under, 16, 7, 0.03, 0.98, 1.0), (wave, 17, 8, 0.6, 1.16, 0.5)):
            u0 = along * du
            quad(scene, [(top_a[0], y_top, top_a[1]), (top_b[0], y_top, top_b[1]), (low_b[0], y_low, low_b[1]), (low_a[0], y_low, low_a[1])],
                 [(u0, v0), (u0 + du, v0), (u0 + du, v1), (u0, v1)], t)
    def corner(c, a, d, b):
        for t, y_top, y_low, v0, v1 in ((under, 16, 7, 0.03, 0.98), (wave, 17, 8, 0.6, 1.16)):
            pts = [(c[0], y_top, c[1]), (a[0], y_low, a[1]), (d[0], y_low, d[1]), (b[0], y_low, b[1])]
            quad(scene, pts, [(0, v0), (0, v1), (0.5, v1), (0.5, v1)], t)
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            X, Z = (x + x_off) * T, y * T
            top = [(X, 16, Z), (X + T, 16, Z), (X + T, 16, Z + T), (X, 16, Z + T)]
            if is_dark(x, y):
                # Dry sand: its texture a tile across, as the real beach's.
                quad(scene, top, [(X / 16, Z / 16), ((X + T) / 16, Z / 16), ((X + T) / 16, (Z + T) / 16), (X / 16, (Z + T) / 16)], tx['road01'])
                continue
            quad(scene, top, [(X / 32, Z / 32), ((X + T) / 32, Z / 32), ((X + T) / 32, (Z + T) / 32), (X / 32, (Z + T) / 32)], beach)
            if dark is not None:
                # The rim on light sand next to dry sand: a strip per side it's on (its texture's u running from the dry
                # side to the light), or a corner piece if the dry sand is only across a corner.
                over = [(X, 16.2, Z), (X + T, 16.2, Z), (X + T, 16.2, Z + T), (X, 16.2, Z + T)]
                a0, a1 = x * 0.5, (x + 1) * 0.5
                b0, b1 = y * 0.5, (y + 1) * 0.5
                sides = {(0, -1): [(0.01, a0), (0.01, a1), (0.49, a1), (0.49, a0)], (0, 1): [(0.49, a0), (0.49, a1), (0.01, a1), (0.01, a0)],
                         (-1, 0): [(0.01, b0), (0.49, b0), (0.49, b1), (0.01, b1)], (1, 0): [(0.49, b0), (0.01, b0), (0.01, b1), (0.49, b1)]}
                touching = [d for d in sides if is_dark(x + d[0], y + d[1])]
                k = inside_turn.get(frozenset(touching))
                if k is not None:
                    quad(scene, over, inside_uv[k:] + inside_uv[:k], rim)
                    continue
                for d in touching:
                    quad(scene, over, sides[d], rim)
                if not touching:
                    for (dx, dy), k in corner_turn.items():
                        if is_dark(x + dx, y + dy):
                            quad(scene, over, corner_uv[k:] + corner_uv[:k], rim)
            if not is_sand(x, y + 1) and y + 1 < h:
                band((X, Z + T), (X + T, Z + T), (X, Z + 2 * T), (X + T, Z + 2 * T), x)
            if not is_sand(x, y - 1) and y > 0:
                band((X + T, Z), (X, Z), (X + T, Z - T), (X, Z - T), x)
            if not is_sand(x - 1, y):
                band((X, Z), (X, Z + T), (X - T, Z), (X - T, Z + T), y)
            if not is_sand(x + 1, y):
                band((X + T, Z + T), (X + T, Z), (X + 2 * T, Z + T), (X + 2 * T, Z), y)
            # Outside corners: where both sides are sea, and the tile across the corner too.
            for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
                if not is_sand(x + dx, y) and not is_sand(x, y + dy) and not is_sand(x + dx, y + dy) and 0 <= y + dy < h:
                    cx, cz = X + (T if dx > 0 else 0), Z + (T if dy > 0 else 0)
                    corner((cx, cz), (cx + dx * T, cz), (cx + dx * T, cz + dy * T), (cx, cz + dy * T))


def route40(a, out, seed=40):
    """Surfed from the top down: the real Route 40's beach (its top chunk, down to its shore), then a sea lane of `lane`
    rows between two columns of rocks as near the edges as they go (each rock nudged a tile in or out at random), with
    sandbars of random sizes and shapes on either side in turn, and a beach across the south end."""
    import random
    rng = random.Random(seed)
    tex = 7  # Route 40's texture set
    top, top_rows = a.chunk(62, tex)
    # Each material's texture as the real lane chunk draws it (some materials share a texture under another name).
    tx = {p['material']: p['tex'] for p in a.chunk(63, tex)[0] + top if p['tex'] is not None}
    shore_row, lane, south = 26, 96, 8
    w, h = 32, 26 + lane + south
    scene = Scene(w * 16, h * 16, tilt=0.6, ground=16)
    # The beach: the real top chunk down to its shore (its rocks below left out).
    add(scene, clip(top, -256, 256, -256, (shore_row - 16) * T), (256, 0, 256))
    rows = [list(r) for r in top_rows[:shore_row]] + [['~'] * w for _ in range(h - shore_row)]
    # The sea under everything, its textures where the real ones are (2 tiles each), so it meets the beach's seamlessly.
    for t, y in ((tx['sea_un'], 7), (tx['sea_on'], 8)):
        z0 = (shore_row - 2) * T
        quad(scene, [(0, y, z0), (w * T, y, z0), (w * T, y, h * T), (0, y, h * T)], [(0, z0 / 32), (w * T / 32, z0 / 32), (w * T / 32, h * T / 32), (0, h * T / 32)], t)
    # The south beach: across the map, its shore stepping in and out a tile or two every few tiles.
    end = shore_row + lane
    mask = [[False] * w for _ in range(h)]
    dry = [[False] * w for _ in range(h)]
    x = 0
    while x < w:
        step = rng.randint(3, 6)
        top_y = end + rng.randint(0, 3)
        for xx in range(x, min(w, x + step)):
            for y in range(top_y, h):
                mask[y][xx] = True
        x += step
    # Behind its light sand, dry sand, as at the top of the route: from 2 or 3 tiles in from the shore, stepping at random.
    x = 0
    while x < w:
        step = rng.randint(2, 5)
        for xx in range(x, min(w, x + step)):
            shore_y = next(y for y in range(h) if mask[y][xx])
            for y in range(shore_y + rng.choice((2, 2, 3)) if xx == x else first, h):
                dry[y][xx] = True
            if xx == x:
                first = next(y for y in range(h) if dry[y][xx])
        x += step
    # Light sand all round the dry: none within 2 tiles of the sea (an inlet reaching in beside it, say).
    near_sea = lambda x, y: any(not mask[yy][xx] for yy in range(max(0, y - 2), min(h, y + 3)) for xx in range(max(0, x - 2), min(w, x + 3)))
    dry = [[dry[y][x] and not near_sea(x, y) for x in range(w)] for y in range(h)]
    # The rock columns, a rock (2 tiles square) every 2 rows down each side, from the beach's shore to the south beach.
    rock = tx['sea_rock']
    lx, rx = 0, w - 2
    for r in range(shore_row, end - 1, 2):
        lx = max(0, min(2, lx + rng.choice((-1, 0, 0, 1))))
        rx = max(w - 4, min(w - 2, rx + rng.choice((-1, 0, 0, 1))))
        for cx in (lx, rx):
            X, Zb = cx * T, (r + 1.71) * T
            quad(scene, [(X, 31.31, Zb - 1.42 * T), (X + 2 * T, 31.31, Zb - 1.42 * T), (X + 2 * T, 8.69, Zb), (X, 8.69, Zb)], [(0, 0), (1, 0), (1, 1), (0, 1)], rock)
            for yy in (r, r + 1):
                for xx in (cx, cx + 1):
                    rows[yy][xx] = '#'
    # Sandbars, left and right in turn down the lane: a block of random size (2-6 across, 2-6 down), sometimes with a
    # smaller block on it, against the rocks' inside.
    bars, bar_blocks = [], []
    y = shore_row + 6
    side = rng.choice((0, 1))
    while True:
        bw, bh = rng.randint(2, 6), rng.randint(2, 6)
        if y + bh + 4 > end:
            break
        # Some against the rocks on their side, the others anywhere across the lane.
        if rng.random() < 0.35:
            x0 = rng.randint(3, 4) if side == 0 else w - 3 - rng.randint(0, 1) - bw
        else:
            x0 = rng.randint(3, w - 3 - bw)
        blocks = [(x0, y, bw, bh)]
        if rng.random() < 0.5 and bw >= 3:
            ew, eh = rng.randint(1, bw - 1), rng.randint(1, 3)
            ex = x0 + rng.randint(0, bw - ew)
            blocks.append((ex, y + bh, ew, eh) if rng.random() < 0.5 else (ex, y - eh, ew, eh))
        bars.append((x0, y, bw, bh, 0 if x0 + bw / 2 < w / 2 else 1))
        bar_blocks.append(blocks)
        y += bh + rng.randint(5, 9)
        side = 1 - side
    # The southmost sandbar wide rather than tall, off to the right of the middle (agreed with the user).
    x0, by, bw, bh, _ = bars[-1]
    bw, bh = min(8, max(bw, bh) + 2), min(3, bw, bh)
    x0 = min(w // 2 + 3, w - 3 - bw)
    bars[-1] = (x0, by, bw, bh, 1)
    bar_blocks[-1] = [(x0, by, bw, bh)]
    for blocks in bar_blocks:
        for bx, bby, bbw, bbh in blocks:
            for yy in range(bby, bby + bbh):
                for xx in range(bx, bx + bbw):
                    mask[yy][xx] = True
    sand(scene, tx, mask, dark=dry)
    # Two of the real beach's rocks (rock01, 2 tiles square, as at its 8,24) on the dry sand, away from its edge: the
    # outermost of a few placed at random (the user had the ones between taken out).
    boulder = tx['rock01']
    spots_dry = [(x, y) for y in range(end, h - 2) for x in range(1, w - 3) if all(dry[yy][xx] for yy in (y, y + 1) for xx in (x, x + 1))]
    placed = []
    for _ in range(rng.randint(3, 5)):
        free = [t for t in spots_dry if all(abs(t[0] - p[0]) > 3 or abs(t[1] - p[1]) > 2 for p in placed)]
        if not free:
            break
        placed.append(rng.choice(free))
    placed.sort()
    for bx, by in placed[:1] + placed[-1:] if len(placed) > 1 else placed:
        X, Zb = bx * T, (by + 1.71) * T
        quad(scene, [(X, 39.31, Zb - 1.42 * T), (X + 2 * T, 39.31, Zb - 1.42 * T), (X + 2 * T, 16.69, Zb), (X, 16.69, Zb)], [(0, 0), (1, 0), (1, 1), (0, 1)], boulder)
        for yy in (by, by + 1):
            for xx in (bx, bx + 1):
                mask[yy][xx] = False
                rows[yy][xx] = '#'
    # A few dry sand tiles with the pebbles of the beach's 12,15 on them (road01_sub, a tile's mark just above the sand).
    pebbles = tx['road01_sub']
    plain = [(x, y) for y in range(end, h) for x in range(w) if dry[y][x] and rows[y][x] != '#']
    for x, y in rng.sample(plain, min(len(plain), rng.randint(4, 6))):
        X, Z = x * T, y * T
        quad(scene, [(X, 17, Z), (X + T, 17, Z), (X + T, 17, Z + T), (X, 17, Z + T)], [(0, 0), (1, 0), (1, 1), (0, 1)], pebbles)
    for y in range(h):
        for x in range(w):
            if mask[y][x] and rows[y][x] != '#':
                rows[y][x] = '.'
    rows = [''.join(r) for r in rows]
    surf = True
    # Spots: in turn out at sea (only battles there) and beside a sandbar (only non-battle encounters, who stand on it),
    # the last by the south beach.
    def nearest(target, ok):
        return min(((x, y) for y in range(h) for x in range(w) if ok(x, y)), key=lambda t: abs(t[0] - target[0]) + abs(t[1] - target[1]))
    def land_near(x, y, r):
        return any(rows[y + dy][x + dx] == '.' for dy in range(-r, r + 1) for dx in range(-r, r + 1) if 0 <= y + dy < h and 0 <= x + dx < w and abs(dx) + abs(dy) <= r)
    sea = lambda x, y: rows[y][x] == '~' and not land_near(x, y, 4) and 6 <= x < w - 6
    shore = lambda x, y: rows[y][x] == '~' and land_near(x, y, 2) and 4 <= x < w - 4
    # Four of the sandbars, spread from the top of the lane to the bottom, each with a spot out at sea after it.
    chosen = [bars[round(i * (len(bars) - 1) / 3)] for i in range(4)]
    plan = [nearest((16, shore_row + 4), sea)]
    for i, (x0, by, bw, bh, side) in enumerate(chosen):
        plan.append(nearest((x0 + bw + 1 if side == 0 else x0 - 2, by + bh // 2), shore))
        next_y = chosen[i + 1][1] if i + 1 < len(chosen) else end
        plan.append(nearest((16, (by + bh + next_y) // 2), sea))
    plan.append(nearest((16, end - 1), shore))
    spots = sorted(plan, key=lambda t: t[1])
    # On the beach (its top corner is fenced off), walking down into the sea.
    entrance = nearest((16, 11), lambda x, y: rows[y][x] == '.' and y >= 10)
    check(rows, [entrance] + spots, [], surf)
    write(out, 'route40', scene, rows, spots, entrance)


# --- The caves ---

def carve(rows, x0, y0, x1, y1, c='.'):
    for y in range(y0, y1):
        for x in range(x0, x1):
            rows[y][x] = c


# A wall tier's profile across its tile, as HGSS's cave walls are built (Mt. Mortar's dwall_* pieces): from the floor
# side (s 0) to the far side (s 1), a short toe, a shaded slope and a flat lip, each tier a tile high. Each point: s, its
# height (tiles), the texture's v and the vertex colour.
PROFILE = [(0.0, 0.0, 0.98, 0.67), (0.21, 0.1, 0.81, 0.46), (0.67, 1.0, 0.25, 0.67), (1.0, 1.0, 0.02, 0.67)]
# Where a wall tile is cut up: every point the profile bends at, measured from either side, and the middle (where a
# ridge between two floors peaks), so every piece is flat.
CUTS = [0.0, 0.21, 0.33, 0.5, 0.67, 0.79, 1.0]
SIDES = {(0, -1): 'n', (0, 1): 's', (-1, 0): 'w', (1, 0): 'e'}


def profile(s):
    for (s0, h0, v0, c0), (s1, h1, v1, c1) in zip(PROFILE, PROFILE[1:]):
        if s <= s1 + 1e-9:
            t = max(0.0, (s - s0) / (s1 - s0))
            return h0 + t * (h1 - h0), v0 + t * (v1 - v0), c0 + t * (c1 - c0)
    return PROFILE[-1][1:]


# The shore round water, as Mt. Mortar's is built: a band (dpond_line) from just inside the bank down to the water, and
# a see-through wash under it (sea_line02). Each point: how far out from the bank's edge (tiles), its height above the
# bank (tiles) and the texture's v. The water lies half a tile below its bank (sea_un, and sea_on over it).
SHORE = [(-0.22, 0.13, 0.02), (-0.02, 0.11, 0.21), (0.11, -0.04, 0.35), (0.16, -0.39, 0.76), (0.29, -0.48, 0.98)]
WASH = [(0.16, -0.09, 1.25), (0.22, -0.39, 1.49), (0.55, -0.6, 2.0)]
WATER_DROP = (0.56, 0.5)  # sea_un's and sea_on's depth below the bank (tiles)


def bfs_dist(rows, sources, blocked=''):
    """Each tile's distance (8 ways round) from the nearest tile that's one of `sources`, going round `blocked` tiles
    (left at 99)."""
    h, w = len(rows), len(rows[0])
    dist = np.full((h, w), 99)
    q = deque()
    for y in range(h):
        for x in range(w):
            if rows[y][x] in sources:
                dist[y, x] = 0; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                n = (x + dx, y + dy)
                if 0 <= n[0] < w and 0 <= n[1] < h and rows[n[1]][n[0]] not in blocked and dist[n[1], n[0]] > dist[y, x] + 1:
                    dist[n[1], n[0]] = dist[y, x] + 1; q.append(n)
    return dist


def shore(scene, rows, tx, wet, bank_at, bare=lambda x, y, d: False):
    """The shore round every water tile (`wet`: whether a tile is water), its bank at `bank_at(x, y)` (model units): a
    band along each edge it shares with land, mitred where two meet in a corner, and swept round a corner of land that
    juts into the water. `bare(x, y, side)`: an edge left without one, the rock going straight into the water."""
    h, w = len(rows), len(rows[0])
    is_wet = lambda x, y: not (0 <= x < w and 0 <= y < h) or wet(x, y)
    band, wash = tx['dpond_line_lm1'], tx['sea_line02']
    col = (0.67, 0.67, 0.67)
    for y in range(h):
        for x in range(w):
            if not wet(x, y):
                continue
            bank = bank_at(x, y)
            for d in SIDES:
                if is_wet(x + d[0], y + d[1]) or bare(x, y, d):
                    continue
                # Along the edge (t 0-1, west to east or north to south) and out into the water (o).
                horiz = d[1] != 0
                p0, p1 = ((-1, 0), (1, 0)) if horiz else ((0, -1), (0, 1))
                c0 = not is_wet(x + p0[0], y + p0[1]) and not bare(x, y, p0)
                c1 = not is_wet(x + p1[0], y + p1[1]) and not bare(x, y, p1)
                def at(t, o, hh):
                    if d == (0, -1): px, pz = x + t, y + o
                    elif d == (0, 1): px, pz = x + t, y + 1 - o
                    elif d == (-1, 0): px, pz = x + o, y + t
                    else: px, pz = x + 1 - o, y + t
                    return (px * T, bank + hh * T, pz * T)
                for prof, tex, alpha, blend in ((SHORE, band, 1.0, False), (WASH, wash, 0.4, True)):
                    for (o0, h0, v0), (o1, h1, v1) in zip(prof, prof[1:]):
                        ta0, tb0 = (o0 if c0 else 0), (1 - o0 if c1 else 1)
                        ta1, tb1 = (o1 if c0 else 0), (1 - o1 if c1 else 1)
                        base = x if horiz else y
                        quad(scene, [at(ta0, o0, h0), at(tb0, o0, h0), at(tb1, o1, h1), at(ta1, o1, h1)],
                             [(-(base + ta0), v0), (-(base + tb0), v0), (-(base + tb1), v1), (-(base + ta1), v1)], tex, col, alpha, blend)
            for dx in (-1, 1):
                for dy in (-1, 1):
                    if is_wet(x + dx, y + dy) or not is_wet(x + dx, y) or not is_wet(x, y + dy):
                        continue
                    # Land only across this corner: the shore swept round it, a quarter turn in 4 steps.
                    cx, cz = x + (1 if dx > 0 else 0), y + (1 if dy > 0 else 0)
                    steps = [i * np.pi / 8 for i in range(5)]
                    def arc(o, hh, a):
                        r = max(o, 0.0)
                        return ((cx - dx * r * np.sin(a)) * T, bank + hh * T, (cz - dy * r * np.cos(a)) * T)
                    for prof, tex, alpha, blend in ((SHORE, band, 1.0, False), (WASH, wash, 0.4, True)):
                        for (o0, h0, v0), (o1, h1, v1) in zip(prof, prof[1:]):
                            for a0, a1 in zip(steps, steps[1:]):
                                quad(scene, [arc(o0, h0, a0), arc(o0, h0, a1), arc(o1, h1, a1), arc(o1, h1, a0)],
                                     [(a0 / 3, v0), (a1 / 3, v0), (a1 / 3, v1), (a0 / 3, v1)], tex, col, alpha, blend)


def cave(scene, rows, tx, floor, ice=None, ice_cells=(), tiers=4, bridge=(), raised=3):
    """Builds a cave from its tile rows as HGSS builds its caves: floor ('.'), water ('~', half a tile below the floor,
    with Mt. Mortar's shore round it; `bridge` tiles are water too, under a bridge) and rock ('#') rising away from the
    floor in tiers a tile high (up to `tiers`), each a sloped wall all round (dwall_n/s/e/w, by the side of the floor it's
    on, mitred where they turn a corner), the floor's rim along the walls (droad01_r, its inside corner where two walls
    meet, swept round a corner of rock that's only across a corner) and the rock past the last tier fading to black, as HGSS's
    caves' surroundings do. 'u' and 'U' are floor and water up a level, on the `raised` tier (a pool for a waterfall to
    fall from, in its own floor): the walls are one field of tiers, each rock tile a tier above the lower of the floor's
    and the raised floor's nearest, so the walls rising from the floor run on into the raised floor and those behind it
    are joined to the rest."""
    h, w = len(rows), len(rows[0])
    dist = bfs_dist(rows, '.~', blocked='uU')
    up = bfs_dist(rows, 'uU', blocked='.~')
    # Each tile's level (tiers): the floor 0, the raised floor `raised`, rock one above the nearer of them.
    level = np.where(np.isin(np.array([list(r) for r in rows]), ['u', 'U']), raised, np.minimum(dist, raised + up))
    is_wall = lambda x, y: 0 <= x < w and 0 <= y < h and rows[y][x] == '#'
    height = np.minimum(level, tiers) * T
    walls = {k: tx['dwall_' + k] for k in 'nsew'}
    tris = {k: ([], [], []) for k in 'nsew'}
    edge = lambda d, px, pz: {(0, -1): pz, (0, 1): 1 - pz, (-1, 0): px, (1, 0): 1 - px}[d]

    def wall_tile(x, y, base, dist):
        d_at = lambda x, y: dist[y, x] if 0 <= x < w and 0 <= y < h else 99
        # Which way the floor is: the tier below on a side, or only across a corner (a mitred outside corner).
        lower = [d for d in SIDES if d_at(x + d[0], y + d[1]) < dist[y, x]]
        corners = [(dx, dy) for dx in (-1, 1) for dy in (-1, 1) if d_at(x + dx, y + dy) < dist[y, x] and (dx, 0) not in lower and (0, dy) not in lower]
        def active(px, pz):
            # The side of the floor nearest (px, pz) and how far in from it the point is.
            best = min(((edge(d, px, pz), d) for d in lower), default=(9, None))
            for dx, dy in corners:
                c = max((edge((dx, 0), px, pz), (dx, 0)), (edge((0, dy), px, pz), (0, dy)))
                best = min(best, c)
            return best
        for i in range(len(CUTS) - 1):
            for j in range(len(CUTS) - 1):
                a0, a1, b0, b1 = CUTS[i], CUTS[i + 1], CUTS[j], CUTS[j + 1]
                pts = [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]
                s = [active(*p_)[0] for p_ in pts]
                mid = active((a0 + a1) / 2, (b0 + b1) / 2)[0]
                halves = [(0, 1, 2), (0, 2, 3)] if abs(mid - (s[0] + s[2]) / 2) < 1e-6 else [(0, 1, 3), (1, 2, 3)]
                for tri in halves:
                    cx = sum(pts[k][0] for k in tri) / 3; cz = sum(pts[k][1] for k in tri) / 3
                    d = active(cx, cz)[1]
                    side = SIDES[(-d[0], -d[1])]  # the wall on the floor's north side is the floor's dwall_n, etc.
                    pos, uv, col = tris[side]
                    for k in tri:
                        px, pz = pts[k]
                        hh, v, c = profile(edge(d, px, pz))
                        wx, wz = x + px, y + pz
                        u = {'n': 0.5 * wx, 's': -0.5 * wx, 'e': 0.5 * wz, 'w': -0.5 * wz}[side]
                        pos.append((wx * T, base + hh * T, wz * T)); uv.append((u, v)); col.append((c, c, c))
        return lambda px, pz: base + profile(active(px, pz)[0])[0] * T

    def fade(x, y, top, lit):
        # Past the last tier: flat rock fading to black away from it.
        X, Z = x * T, y * T
        cs = [0.67 if any(lit(cx + ox, cy + oy) for ox in (-1, 0) for oy in (-1, 0)) else 0.0 for cx, cy in ((x, y), (x + 1, y), (x + 1, y + 1), (x, y + 1))]
        idx = [0, 1, 2, 0, 2, 3]
        corners_ = [(X, top, Z), (X + T, top, Z), (X + T, top, Z + T), (X, top, Z + T)]
        uvs = [(x / 2, y / 2), ((x + 1) / 2, y / 2), ((x + 1) / 2, (y + 1) / 2), (x / 2, (y + 1) / 2)]
        scene.mesh([corners_[k] for k in idx], [uvs[k] for k in idx], [(cs[k],) * 3 for k in idx], tx['dcliff01'])

    inside = lambda x, y: 0 <= x < w and 0 <= y < h
    floor_c = (0.67, 0.67, 0.67)
    rim = tx['droad01_r']
    wet = lambda x, y: rows[y][x] in '~U' or (x, y) in bridge
    bank_at = lambda x, y: raised * T if rows[y][x] == 'U' else 0
    for y in range(h):
        for x in range(w):
            X, Z = x * T, y * T
            c = rows[y][x]
            if wet(x, y):
                bank = bank_at(x, y)
                for t_, drop in zip((tx['sea_un'], tx['sea_on']), WATER_DROP):
                    yy = bank - drop * T
                    quad(scene, [(X, yy, Z), (X + T, yy, Z), (X + T, yy, Z + T), (X, yy, Z + T)], [(x / 2, y / 2), ((x + 1) / 2, y / 2), ((x + 1) / 2, (y + 1) / 2), (x / 2, (y + 1) / 2)], t_)
            elif c in '.u':
                t = ice if (x, y) in ice_cells and ice is not None else floor
                size = t.shape[1] / 16  # tiles a texture covers
                fy = raised * T if c == 'u' else 0
                top = [(X, fy, Z), (X + T, fy, Z), (X + T, fy, Z + T), (X, fy, Z + T)]
                near = [d for d in SIDES if is_wall(x + d[0], y + d[1])]
                if (x, y) in ice_cells and ice is not None:
                    near = []
                if len(near) == 1:
                    # Along a wall: the rim, its u from the wall's edge (0.01) to the floor (0.49), v along the wall.
                    d = near[0]
                    across = lambda px, pz: 0.01 + 0.48 * edge(d, px, pz)
                    along = lambda px, pz: 0.5 * ((x + px) if d[1] else (y + pz))
                    loc = [(0, 0), (1, 0), (1, 1), (0, 1)]
                    quad(scene, top, [(across(*l), along(*l)) for l in loc], rim, floor_c)
                    continue
                if len(near) == 2 and near[0][0] != -near[1][0] and near[0][1] != -near[1][1]:
                    # In a corner between two walls: the rim's inside corner (its u from the north or south wall, v from
                    # the west or east one, 0.99 against each).
                    ns = next(d for d in near if d[1]); ew = next(d for d in near if d[0])
                    loc = [(0, 0), (1, 0), (1, 1), (0, 1)]
                    quad(scene, top, [(0.99 - 0.48 * edge(ns, *l), 0.99 - 0.48 * edge(ew, *l)) for l in loc], rim, floor_c)
                    continue
                quad(scene, top, [(x / size, y / size), ((x + 1) / size, y / size), ((x + 1) / size, (y + 1) / size), (x / size, (y + 1) / size)], t, floor_c)
                if not near and t is floor:
                    for dx in (-1, 1):
                        for dy in (-1, 1):
                            if not is_wall(x + dx, y + dy):
                                continue
                            # Rock only across this corner: the rim swept round it in a quarter circle (its u by the
                            # distance from the corner), joining the rims of the tiles either side.
                            cx, cz = x + (1 if dx > 0 else 0), y + (1 if dy > 0 else 0)
                            at = lambda r, a: ((cx - dx * r * np.sin(a)) * T, fy + 0.05, (cz - dy * r * np.cos(a)) * T)
                            angles = [i * np.pi / 16 for i in range(9)]
                            radii = [0, 0.25, 0.5, 0.75, 1.0]
                            for r0, r1 in zip(radii, radii[1:]):
                                for a0, a1 in zip(angles, angles[1:]):
                                    quad(scene, [at(r0, a0), at(r0, a1), at(r1, a1), at(r1, a0)],
                                         [(0.01 + 0.48 * r0, a0 / 3), (0.01 + 0.48 * r0, a1 / 3), (0.01 + 0.48 * r1, a1 / 3), (0.01 + 0.48 * r1, a0 / 3)], rim, floor_c)
            elif level[y, x] <= tiers:
                wall_tile(x, y, (level[y, x] - 1) * T, level)
            elif level[y, x] == tiers + 1:
                fade(x, y, tiers * T, lambda cx, cy: inside(cx, cy) and level[cy, cx] <= tiers)
    for side, (pos, uv, col) in tris.items():
        if pos:
            scene.mesh(pos, uv, col, walls[side])
    if any(c in '~U' for r in rows for c in r) or bridge:
        # The pool up top runs down between bare rock to the waterfall's edge, as Mt. Mortar's does.
        shore(scene, rows, tx, wet, bank_at, lambda x, y, d: rows[y][x] == 'U' and is_wall(x + d[0], y + d[1]))
    return height


def moon_floor(scene, rows, tx, keep, rng, clumps=7, patches=(8, 3)):
    """Mt. Moon's floor dressing: clumps of its crystal rocks (drock01s, tall and small, each a tile; they block the
    tile) only against the walls, never by water, by a spot (`keep`: the entrance, spots and exit, which must all still
    be walkable in turn) or in the way; and its patches of other ground (droad01_sub a tile, droad01_sub2 two tiles across,
    on half tiles) on open floor. Returns the rows with the rocks' tiles blocked."""
    h, w = len(rows), len(rows[0])
    rows = [list(r) for r in rows]
    cell = lambda x, y: rows[y][x] if 0 <= x < w and 0 <= y < h else '#'
    near_keep = lambda x, y: any(max(abs(x - kx), abs(y - ky)) <= 2 for kx, ky in keep)
    def by_wall(x, y):
        return (cell(x, y) == '.' and any(cell(x + dx, y + dy) == '#' for dx, dy in SIDES)
                and not any(cell(x + dx, y + dy) in '~U' for dx in (-2, -1, 0, 1, 2) for dy in (-2, -1, 0, 1, 2)) and not near_keep(x, y))
    def still_walkable():
        joined = [''.join(r) for r in rows]
        try:
            check(joined, keep, [], False)
            return True
        except AssertionError:
            return False
    rock = tx['drock01s']
    candidates = [(x, y) for y in range(h) for x in range(w) if by_wall(x, y)]
    rng.shuffle(candidates)
    placed = []
    for x0, y0 in candidates:
        if len(placed) >= clumps:
            break
        if not by_wall(x0, y0) or any(max(abs(x0 - px), abs(y0 - py)) < 6 for px, py in placed):
            continue
        # A clump of 1-3 along the wall it's against.
        d = next(d for d in SIDES if cell(x0 + d[0], y0 + d[1]) == '#')
        step = (1, 0) if d[1] else (0, 1)
        clump = [(x0 + step[0] * k, y0 + step[1] * k) for k in range(rng.randint(1, 3))]
        clump = [t for t in clump if by_wall(*t)]
        for t in clump:
            rows[t[1]][t[0]] = '#'
        if not clump or not still_walkable():
            for t in clump:
                rows[t[1]][t[0]] = '.'
            continue
        placed.append((x0, y0))
        for x, y in clump:
            # As Mt. Moon's: a tall one (its texture's left half) or a small one (its lower right quarter), leaning back.
            X, Z = x * T, y * T
            if rng.random() < 0.6:
                quad(scene, [(X, 0.16 * T, Z + 1.11 * T), (X + T, 0.16 * T, Z + 1.11 * T), (X + T, 1.47 * T, Z - 0.3 * T), (X, 1.47 * T, Z - 0.3 * T)], [(0.02, 0.98), (0.48, 0.98), (0.48, 0.02), (0.02, 0.02)], rock, (0.67, 0.67, 0.67))
            else:
                quad(scene, [(X, 0.15 * T, Z + 0.85 * T), (X + T, 0.15 * T, Z + 0.85 * T), (X + T, 0.99 * T, Z + 0.3 * T), (X, 0.99 * T, Z + 0.3 * T)], [(0.52, 0.98), (0.98, 0.98), (0.98, 0.52), (0.52, 0.52)], rock, (0.67, 0.67, 0.67))
    # The other ground, on open floor only (not along the walls' rim or by water).
    open_ = lambda x, y: cell(x, y) == '.' and not any(cell(x + dx, y + dy) != '.' for dx in (-1, 0, 1) for dy in (-1, 0, 1))
    spots_ = [(x, y) for y in range(h) for x in range(w) if open_(x, y)]
    rng.shuffle(spots_)
    used = set()
    for (x, y) in spots_[:patches[0]]:
        used.add((x, y))
        X, Z = x * T, y * T
        quad(scene, [(X, 0.06 * T, Z), (X + T, 0.06 * T, Z), (X + T, 0.06 * T, Z + T), (X, 0.06 * T, Z + T)], [(0, 0), (1, 0), (1, 1), (0, 1)], tx['droad01_sub'], (0.67, 0.67, 0.67))
    n = 0
    for (x, y) in spots_[patches[0]:]:
        if n >= patches[1]:
            break
        if not all(open_(x + dx, y + dy) and (x + dx, y + dy) not in used for dx in (0, 1, 2) for dy in (0, 1, 2)):
            continue
        used |= {(x + dx, y + dy) for dx in (0, 1, 2) for dy in (0, 1, 2)}
        X, Z = (x + 0.5) * T, (y + 0.5) * T
        quad(scene, [(X, 0.06 * T, Z), (X + 2 * T, 0.06 * T, Z), (X + 2 * T, 0.06 * T, Z + 2 * T), (X, 0.06 * T, Z + 2 * T)], [(0, 0), (1, 0), (1, 1), (0, 1)], tx['droad01_sub2'], (0.67, 0.67, 0.67))
        n += 1
    return [''.join(r) for r in rows]


def route42(a, out, seed=42):
    import random
    rng = random.Random(seed)
    tx = a.textures(79)  # Mt. Mortar's
    # Its water and shore (in the land model's own textures), from the real Mt. Mortar's waterfall chunk.
    tx.update({p['material']: p['tex'] for p in a.chunk(517, 79)[0] if p['tex'] is not None and p['material'] in ('sea_un', 'sea_on', 'sea_line02', 'dpond_line_lm1')})
    # Mt. Moon's rocks and other ground (its land model's own textures).
    tx.update({p['material']: p['tex'] for p in a.chunk(389, 70)[0] if p['material'] in ('drock01s', 'droad01_sub', 'droad01_sub2')})
    w, h = 72, 33
    rows = [['#'] * w for _ in range(h)]
    # The entrance chamber, a passage, the waterfall chamber, a passage, the last chamber (to the right edge).
    carve(rows, 1, 14, 16, 24)
    carve(rows, 16, 17, 25, 21)
    carve(rows, 25, 12, 47, 29)
    carve(rows, 47, 16, 54, 20)
    carve(rows, 54, 10, 71, 26)
    carve(rows, 0, 18, 1, 20)       # in from the left edge
    carve(rows, 71, 16, 72, 19)     # out at the right edge
    # Up a level behind the waterfall chamber's north wall (on its third tier): a small floor with the pool the waterfall
    # falls from, running down to the edge between bare rock; the pool under it, against the wall, and its stream running
    # south out of the chamber, crossed by a bridge.
    carve(rows, 28, 5, 44, 9, 'u')
    carve(rows, 31, 6, 41, 12, 'U')
    carve(rows, 31, 12, 41, 19, '~')
    carve(rows, 34, 19, 38, 33, '~')
    bridge = {(x, y) for x in range(34, 38) for y in (24, 25)}
    for x, y in bridge:
        rows[y][x] = '.'
    rows = [''.join(r) for r in rows]
    scene = Scene(w * 16, h * 16, tilt=0.6, ground=0)
    cave(scene, rows, tx, tx['droad01'], bridge=bridge)
    # The bridge's planks over the stream, level with the floor, and their edge down towards the water.
    planks = tx['droad02']
    for y in (24, 25):
        quad(scene, [(34 * T, 0.5, y * T), (38 * T, 0.5, y * T), (38 * T, 0.5, (y + 1) * T), (34 * T, 0.5, (y + 1) * T)], [(0, 0), (2, 0), (2, 0.5), (0, 0.5)], planks)
    quad(scene, [(34 * T, 0.5, 26 * T), (38 * T, 0.5, 26 * T), (38 * T, -3, 26 * T), (34 * T, -3, 26 * T)], [(0, 0.8), (2, 0.8), (2, 1), (0, 1)], planks, (0.46, 0.46, 0.46))
    # The waterfall: HGSS's small cave waterfall (10 tiles wide), from the pool above down to the one below, lit and
    # textured as Mt. Mortar's own (full colour; the model on its own comes out dark). It falls 4 tiles, water to water;
    # the pools are 3 apart, so it's squashed to fit, its foot where it was.
    real = {p['material']: p['tex'] for p in a.chunk(517, 79)[0] if 'fall' in p['material'] and p['tex'] is not None}
    squash = np.array([1, 0.75, 1])
    fall = [dict(p, tex=real.get(p['material'], p['tex']), col=np.ones_like(p['col']), pos=(p['pos'] + [0, 0.5 * T, 0]) * squash - [0, 0.5 * T, 0]) for p in a.building(319)]
    add(scene, fall, (36 * T, 0, 11 * T))
    spots = [(5, 16), (11, 21), (20, 19), (28, 15), (29, 25), (43, 22), (50, 18), (57, 12), (63, 22), (68, 15)]
    entrance = (1, 18)
    exit = (70, 17)
    rows = moon_floor(scene, rows, tx, [entrance] + spots + [exit], rng)
    rows = [r.replace('U', '#').replace('u', '#') for r in rows]
    check(rows, [entrance] + spots + [exit], [], False)
    write(out, 'route42', scene, rows, spots, entrance, exit=exit)


def route44(a, out):
    tx = a.textures(76)  # the Ice Path's
    w, h = 40, 62
    rows = [['#'] * w for _ in range(h)]
    # The lower area (in from the bottom edge), winding up to the ladder on its north wall.
    carve(rows, 17, 58, 21, 62)
    carve(rows, 8, 50, 30, 58)
    carve(rows, 22, 41, 34, 50)
    carve(rows, 6, 36, 26, 43)
    # The upper area, from the ladder's hole to the top.
    carve(rows, 8, 20, 30, 29)
    carve(rows, 4, 12, 16, 20)
    carve(rows, 16, 4, 36, 14)
    carve(rows, 20, 0, 24, 4)        # out at the top edge
    hole = (12, 22)                   # the ladder down from the upper area (not walkable)
    rows[hole[1]][hole[0]] = '#'
    rows = [''.join(r) for r in rows]
    # Sheets of ice in each area.
    ice_cells = {(x, y) for y in range(h) for x in range(w) if rows[y][x] == '.' and ((10 <= x < 22 and 51 <= y < 57) or (16 <= x < 36 and 4 <= y < 14))}
    scene = Scene(w * 16, h * 16, tilt=0.6, ground=0)
    cave(scene, rows, tx, tx['droad01'], ice=tx['ice_fe01'], ice_cells=ice_cells)
    # The ladder up the lower area's north wall (above 12,36), and the hole it comes out of in the upper area.
    # The ladder texture, cropped to the ladder itself.
    full = tx['dun_stairdw']
    ys, xs = np.nonzero(full[..., 3] > 0.5)
    ladder = full[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    lx, ly = 12, 36
    quad(scene, [(lx * T, 3 * T, ly * T + 0.5), ((lx + 1) * T, 3 * T, ly * T + 0.5), ((lx + 1) * T, 0, ly * T + 0.5), (lx * T, 0, ly * T + 0.5)], [(0, 0), (1, 0), (1, 1), (0, 1)], ladder)
    hx, hy = hole
    quad(scene, [(hx * T, 0.5, hy * T), ((hx + 1) * T, 0.5, hy * T), ((hx + 1) * T, 0.5, (hy + 1) * T), (hx * T, 0.5, (hy + 1) * T)], [(0, 0), (1, 0), (1, 1), (0, 1)], tx['d_stairhole'])
    quad(scene, [(hx * T + 2, 1, hy * T), ((hx + 1) * T - 2, 1, hy * T), ((hx + 1) * T - 2, 1, (hy + 1) * T), (hx * T + 2, 1, (hy + 1) * T)], [(0, 0), (1, 0), (1, 0.6), (0, 0.6)], ladder)
    links = [((lx, ly), (hx, hy + 1))]
    spots = [(19, 56), (12, 52), (26, 52), (28, 45), (16, 39), (20, 25), (9, 17), (14, 13), (25, 10), (31, 6)]
    entrance = (19, 60)
    exit = (22, 1)
    check(rows, [entrance] + spots + [exit], links, False)
    write(out, 'route44', scene, rows, spots, entrance, links=[[list(p) for p in l] for l in links], exit=exit)


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokeheartgold'))
    out = args[0]
    os.makedirs(out, exist_ok=True)
    a = Assets(apicula, cache)
    for make in (route40, route42, route44):
        make(a, out)


if __name__ == '__main__':
    main()
