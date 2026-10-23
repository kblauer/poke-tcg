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


def write(out, name, scene, rows, spots, entrance, links=(), exit=None, trim=False, band=None, rendered=None, ice=()):
    """Renders the map and saves its tiles; `trim`: cropped to the rows drawn on (whole tiles), its tiles renumbered;
    `band`: cropped to these rows (first, after last), renumbered alike; `rendered`: the scene's image, already rendered
    (one cave cut into maps), instead of rendering it again; `ice`: its walkable ice tiles, slid across (saved as rows,
    'i' on ice)."""
    ice_rows = [''.join('i' if (x, y) in ice and c == '.' else '.' for x, c in enumerate(r)) for y, r in enumerate(rows)] if ice else None
    if rendered:
        Image.open(rendered).save(os.path.join(out, name + '.png'))
    else:
        scene.render(os.path.join(out, name + '.png'))
    if trim or band:
        im = Image.open(os.path.join(out, name + '.png'))
        if band:
            y0, y1 = band
        else:
            drawn = np.nonzero(np.asarray(im.convert('L')).max(1) > 8)[0]
            y0, y1 = int(drawn.min() // T), int(-(-(drawn.max() + 1) // T))
        im.crop((0, y0 * T, im.width, y1 * T)).save(os.path.join(out, name + '.png'))
        up = lambda t: t and (t[0], t[1] - y0)
        rows, spots, entrance, exit = rows[y0:y1], [up(s) for s in spots], up(entrance), up(exit)
        ice_rows = ice_rows and ice_rows[y0:y1]
        links = [[up(p) for p in l] for l in links]
        print(name, 'trimmed to rows', y0, '-', y1 - 1, 'of the whole cave')
    json.dump({'width': len(rows[0]), 'height': len(rows), 'rows': rows, 'spots': spots, 'entrance': entrance, 'links': list(links), 'exit': exit, 'ice': ice_rows}, open(os.path.join(out, name + '.json'), 'w'))
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
    # The band sloping into the sea round the sand (its left, right and lower edges: the upper one is hidden by the tilt)
    # is drawn as sand, so it's land too (the user's); added once the spots are picked, so they stay where they were (none
    # is on these tiles).
    band = {(x + dx, y + dy) for y in range(shore_row, h) for x in range(w) if mask[y][x] and rows[y][x] == '.'
            for dx, dy in ((-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))}
    rows = [''.join('.' if (x, y) in band and c == '~' else c for x, c in enumerate(r)) for y, r in enumerate(rows)]
    # Tilted, the sand is drawn half a tile up: the row above it is half sand (a third at the corners), land too (the user's).
    above = {(x, y - 1) for y in range(shore_row + 1, h) for x in range(w) if rows[y][x] == '.' and rows[y - 1][x] == '~'}
    rows = [''.join('.' if (x, y) in above else c for x, c in enumerate(r)) for y, r in enumerate(rows)]
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


def shore(scene, rows, tx, wet, bank_at, bare=lambda x, y, d: False, depth=1.0):
    """The shore round every water tile (`wet`: whether a tile is water), its bank at `bank_at(x, y)` (model units): a
    band along each edge it shares with land, mitred where two meet in a corner, and swept round a corner of land that
    juts into the water. `bare(x, y, side)`: an edge left without one, the rock going straight into the water.
    `depth`: how many times deeper than Mt. Mortar's the water lies (its profile below the bank stretched down)."""
    deeper = lambda prof: [(o, hh * depth if hh < 0 else hh, v) for o, hh, v in prof]
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
                for prof, tex, alpha, blend in ((deeper(SHORE), band, 1.0, False), (deeper(WASH), wash, 0.4, True)):
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
                    for prof, tex, alpha, blend in ((deeper(SHORE), band, 1.0, False), (deeper(WASH), wash, 0.4, True)):
                        for (o0, h0, v0), (o1, h1, v1) in zip(prof, prof[1:]):
                            for a0, a1 in zip(steps, steps[1:]):
                                quad(scene, [arc(o0, h0, a0), arc(o0, h0, a1), arc(o1, h1, a1), arc(o1, h1, a0)],
                                     [(a0 / 3, v0), (a1 / 3, v0), (a1 / 3, v1), (a0 / 3, v1)], tex, col, alpha, blend)


def cave(scene, rows, tx, floor, ice=None, ice_cells=(), tiers=4, bridge=(), raised=3, holes=(), ice_path=False, cut=None, depth=1.0):
    """Builds a cave from its tile rows as HGSS builds its caves: floor ('.'), water ('~', half a tile below the floor,
    with Mt. Mortar's shore round it; `bridge` tiles are water too, under a bridge) and rock ('#') rising away from the
    floor in tiers a tile high (up to `tiers`), each a sloped wall all round (dwall_n/s/e/w, by the side of the floor it's
    on, mitred where they turn a corner), the floor's rim along the walls (droad01_r, its inside corner where two walls
    meet, swept round a corner of rock that's only across a corner) and the rock past the last tier fading to black, as HGSS's
    caves' surroundings do. 'u' and 'U' are floor and water up a level, on the `raised` tier (a pool for a waterfall to
    fall from, in its own floor): the walls are one field of tiers, each rock tile a tier above the lower of the floor's
    and the raised floor's nearest, so the walls rising from the floor run on into the raised floor and those behind it
    are joined to the rest. `holes`: floor tiles left open for a ladder down's model (dun_stairdw) to show its pit.
    `ice_path`: the ice drawn as Ice Path B2F's (the user's): see-through over its deep blue (ice_fe01b), its scalloped
    edge (ice_fe01r) along every side it meets the floor, the edge's corner piece where it turns. `cut`: (tiles, inside)
    floor cut away round a ladder's pit wider than its tile, as the real caves' floor is: those tiles' floor drawn in
    small pieces, leaving out those whose middle `inside` (x, z, model units) says is in the pit. `depth`: the water
    that many times deeper than Mt. Mortar's, its shore stretched down to it."""
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

    def floor_quad(x, y, corners, uvs, tex, col):
        if cut is None or (x, y) not in cut[0]:
            quad(scene, corners, uvs, tex, col)
            return
        c, u, n = np.array(corners, float), np.array(uvs, float), 8
        at = lambda a, p, q: (a[0] * (1 - p) + a[1] * p) * (1 - q) + (a[3] * (1 - p) + a[2] * p) * q
        for i in range(n):
            for j in range(n):
                ps = [(i / n, j / n), ((i + 1) / n, j / n), ((i + 1) / n, (j + 1) / n), (i / n, (j + 1) / n)]
                mid = at(c, (i + 0.5) / n, (j + 0.5) / n)
                if not cut[1](mid[0], mid[2]):
                    quad(scene, [at(c, *pq) for pq in ps], [at(u, *pq) for pq in ps], tex, col)
    if ice_path:
        icy = ice * 0.71 + tx['ice_fe01b'].mean((0, 1)) * 0.29
        icy[..., 3] = 1

    def ice_tile(x, y, top, size):
        # As Ice Path B2F: its deep blue under the striped ice (71% opaque), then the floor's scalloped edge on the ice
        # along each side that meets the floor (plain floor on its side, the user's), by quarter tiles:
        # ice_fe01r's left strip (the floor at u 0; a rounded segment a tile long) for a side, its bottom right quarter
        # (the floor at u 1 and v 1) where two sides meet.
        # (The two layers are mixed in the texture, drawn solid: see-through tiles side by side leave seams.)
        X, Z = x * T, y * T
        loc = [(0, 0), (1, 0), (1, 1), (0, 1)]
        quad(scene, top, [((x + px) / size, (y + pz) / size) for px, pz in loc], icy, floor_c)
        floor_at = lambda x, y: inside(x, y) and rows[y][x] in '.u' and (x, y) not in ice_cells
        for sx in (-1, 1):
            for sz in (-1, 1):
                hs, vs = floor_at(x + sx, y), floor_at(x, y + sz)
                if not (hs or vs):
                    continue
                qx, qz = (0.5 if sx > 0 else 0), (0.5 if sz > 0 else 0)
                pts = [(qx + px * 0.5, qz + pz * 0.5) for px, pz in loc]
                # How far in from the tile's side towards sx (sz): 0 at the side, 0.5 at the middle.
                eh = lambda px: (1 - px) if sx > 0 else px
                ev = lambda pz: (1 - pz) if sz > 0 else pz
                if hs and vs:
                    uv = [(1 - eh(px) * 0.5, 1 - ev(pz) * 0.5) for px, pz in pts]
                elif hs:
                    uv = [(eh(px) * 0.5, pz * 0.5) for px, pz in pts]
                else:
                    uv = [(ev(pz) * 0.5, px * 0.5) for px, pz in pts]
                quad(scene, [(X + px * T, 0.3, Z + pz * T) for px, pz in pts], uv, tx['ice_fe01r'], floor_c)

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
                    yy = bank - drop * depth * T
                    quad(scene, [(X, yy, Z), (X + T, yy, Z), (X + T, yy, Z + T), (X, yy, Z + T)], [(x / 2, y / 2), ((x + 1) / 2, y / 2), ((x + 1) / 2, (y + 1) / 2), (x / 2, (y + 1) / 2)], t_)
            elif (x, y) in holes:
                continue
            elif c in '.u':
                t = ice if (x, y) in ice_cells and ice is not None else floor
                size = t.shape[1] / 16  # tiles a texture covers
                fy = raised * T if c == 'u' else 0
                top = [(X, fy, Z), (X + T, fy, Z), (X + T, fy, Z + T), (X, fy, Z + T)]
                near = [d for d in SIDES if is_wall(x + d[0], y + d[1])]
                if (x, y) in ice_cells and ice is not None:
                    near = []
                    if ice_path:
                        ice_tile(x, y, top, size)
                        continue
                if len(near) == 1:
                    # Along a wall: the rim, its u from the wall's edge (0.01) to the floor (0.49), v along the wall.
                    d = near[0]
                    across = lambda px, pz: 0.01 + 0.48 * edge(d, px, pz)
                    along = lambda px, pz: 0.5 * ((x + px) if d[1] else (y + pz))
                    loc = [(0, 0), (1, 0), (1, 1), (0, 1)]
                    floor_quad(x, y, top, [(across(*l), along(*l)) for l in loc], rim, floor_c)
                    continue
                if len(near) == 2 and near[0][0] != -near[1][0] and near[0][1] != -near[1][1]:
                    # In a corner between two walls: the rim's inside corner (its u from the north or south wall, v from
                    # the west or east one, 0.99 against each).
                    ns = next(d for d in near if d[1]); ew = next(d for d in near if d[0])
                    loc = [(0, 0), (1, 0), (1, 1), (0, 1)]
                    floor_quad(x, y, top, [(0.99 - 0.48 * edge(ns, *l), 0.99 - 0.48 * edge(ew, *l)) for l in loc], rim, floor_c)
                    continue
                floor_quad(x, y, top, [(x / size, y / size), ((x + 1) / size, y / size), ((x + 1) / size, (y + 1) / size), (x / size, (y + 1) / size)], t, floor_c)
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
                                    floor_quad(x, y, [at(r0, a0), at(r0, a1), at(r1, a1), at(r1, a0)],
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
        shore(scene, rows, tx, wet, bank_at, lambda x, y, d: rows[y][x] == 'U' and is_wall(x + d[0], y + d[1]), depth)
    return height


def moon_floor(scene, rows, tx, keep, rng, clumps=7, patches=(8, 3), links=()):
    """Mt. Moon's floor dressing: clumps of its crystal rocks (drock01s, tall and small, each a tile; they block the
    tile) only against the walls, never by water, by a spot (`keep`: the entrance, spots and exit, which must all still
    be walkable in turn, through `links`) or in the way; and its patches of other ground (droad01_sub a tile, droad01_sub2
    two tiles across, on half tiles) on open floor. Returns the rows with the rocks' tiles blocked."""
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
            check(joined, keep, links, False)
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
                # Its top is drawn over the tile above: that one blocked too (the user's).
                if cell(x, y - 1) == '.':
                    rows[y - 1][x] = '#'
            else:
                quad(scene, [(X, 0.15 * T, Z + 0.85 * T), (X + T, 0.15 * T, Z + 0.85 * T), (X + T, 0.99 * T, Z + 0.3 * T), (X, 0.99 * T, Z + 0.3 * T)], [(0.52, 0.98), (0.98, 0.98), (0.98, 0.52), (0.52, 0.52)], rock, (0.67, 0.67, 0.67))
    # The other ground, on open floor only (not along the walls' rim or by water).
    other_ground(scene, tx, w, h, lambda x, y: cell(x, y) == '.' and not any(cell(x + dx, y + dy) != '.' for dx in (-1, 0, 1) for dy in (-1, 0, 1)), rng, patches)
    return [''.join(r) for r in rows]


def other_ground(scene, tx, w, h, open_, rng, patches, base=lambda x, y: 0.0):
    """A cave's patches of other ground (droad01_sub a tile, droad01_sub2 two tiles across, on half tiles), `patches`
    of each, on the tiles `open_` allows, at the floor's height there (`base`)."""
    spots_ = [(x, y) for y in range(h) for x in range(w) if open_(x, y)]
    rng.shuffle(spots_)
    used = set()
    for (x, y) in spots_[:patches[0]]:
        used.add((x, y))
        X, Z, Y = x * T, y * T, base(x, y) + 0.06 * T
        quad(scene, [(X, Y, Z), (X + T, Y, Z), (X + T, Y, Z + T), (X, Y, Z + T)], [(0, 0), (1, 0), (1, 1), (0, 1)], tx['droad01_sub'], (0.67, 0.67, 0.67))
    n = 0
    for (x, y) in spots_[patches[0]:]:
        if n >= patches[1]:
            break
        if not all(open_(x + dx, y + dy) and (x + dx, y + dy) not in used for dx in (0, 1, 2) for dy in (0, 1, 2)):
            continue
        used |= {(x + dx, y + dy) for dx in (0, 1, 2) for dy in (0, 1, 2)}
        X, Z, Y = (x + 0.5) * T, (y + 0.5) * T, base(x, y) + 0.06 * T
        quad(scene, [(X, Y, Z), (X + 2 * T, Y, Z), (X + 2 * T, Y, Z + 2 * T), (X, Y, Z + 2 * T)], [(0, 0), (1, 0), (1, 1), (0, 1)], tx['droad01_sub2'], (0.67, 0.67, 0.67))
        n += 1


def route42(a, out, seed=42):
    import random
    rng = random.Random(seed)
    tx = a.textures(79)  # Mt. Mortar's
    # Its water and shore (in the land model's own textures), from the real Mt. Mortar's waterfall chunk.
    tx.update({p['material']: p['tex'] for p in a.chunk(517, 79)[0] if p['tex'] is not None and p['material'] in ('sea_un', 'sea_on', 'sea_line02', 'dpond_line_lm1')})
    # Mt. Moon's rocks and other ground (its land model's own textures).
    tx.update({p['material']: p['tex'] for p in a.chunk(389, 70)[0] if p['material'] in ('drock01s', 'droad01_sub', 'droad01_sub2')})
    # The fourth chamber, up the third one's ladder, is drawn above it, apart (black rock between their walls, as between
    # the others; the user's): the first three lower by `top` rows.
    top = 24
    w, h = 72, 33 + top
    rows = [['#'] * w for _ in range(h)]
    # The entrance chamber, a passage, the waterfall chamber, a passage, the third chamber (closed at the right edge).
    carve(rows, 1, top + 14, 16, top + 24)
    carve(rows, 16, top + 17, 25, top + 21)
    carve(rows, 25, top + 12, 47, top + 29)
    carve(rows, 47, top + 16, 54, top + 20)
    carve(rows, 54, top + 10, 71, top + 26)
    carve(rows, 0, top + 18, 1, top + 20)       # in from the left edge
    # The fourth chamber (the user's), as big as the third, with a pool in its top half, and out at the right edge.
    carve(rows, 54, 5, 71, 21)
    carve(rows, 60, 7, 66, 10, '~')
    carve(rows, 61, 10, 65, 12, '~')
    carve(rows, 71, 11, 72, 14)
    # Up a level behind the waterfall chamber's north wall (on its third tier): a small floor with the pool the waterfall
    # falls from, running down to the edge between bare rock; the pool under it, against the wall, and its stream running
    # south out of the chamber, crossed by a bridge.
    carve(rows, 28, top + 5, 44, top + 9, 'u')
    carve(rows, 31, top + 6, 41, top + 12, 'U')
    carve(rows, 31, top + 12, 41, top + 19, '~')
    carve(rows, 33, top + 19, 39, h, '~')  # a tile wider each side than the pool's foot (the user's)
    bridge = {(x, y) for x in range(33, 39) for y in (top + 24, top + 25)}  # 48-49, 24-25 on its map (the user's)
    for x, y in bridge:
        rows[y][x] = '.'
    rows = [''.join(r) for r in rows]
    scene = Scene(w * 16, h * 16, tilt=0.6, ground=0)
    hx, hy = 57, 18  # the ladder down's hole in the fourth chamber
    # Its pit and the light over it, from a real one (Mt. Moon's at -168,-184 of chunk 390, its floor 16 up); the floor
    # round it cut away inside its rim, as the real one's is, so its shadowed sides show (the user's).
    pit = clip([p for p in a.chunk(390, 70)[0] if p['material'] in ('d_stairhole', 'd_light')], -192, -144, -208, -160)
    pit = place(pit, hx * T + T / 2 + 168, hy * T + T / 2 + 184, dy=-16)
    # Its water a tile below the floor, twice Mt. Mortar's depth, the shore dropping that far (the user's): more room
    # under the bridge.
    depth = 2.0
    cave(scene, rows, tx, tx['droad01'], bridge=bridge, holes={(hx, hy)}, cut=pit_cut([p for p in pit if p['material'] == 'd_stairhole'], (hx, hy)), depth=depth)
    # The bridge over the stream: Route 48's (the user's), its planks and their shadow on the water.
    route48 = a.textures(19)
    plank_bridge(scene, route48['bridge_a'], route48['f_kage'], 33, 39, top + 24, top + 26, -WATER_DROP[1] * depth * T)
    # The ladder up in the third chamber, standing near its south wall (67,47, the user's) and the hole it comes
    # out of in the fourth chamber, near its lower left corner (the user's): Red fades from one to the other. Both are
    # HGSS's own cave ladder models, centred on their tiles as the real caves place them: the ladder up leaning back over
    # the wall (dun_stairup, as in Mt. Moon) and the ladder down in its lit hole (dun_stairdw, as in Mt. Mortar).
    lx, ly = 67, top + 23
    add(scene, place(a.building(69), lx * T + T / 2, ly * T + T / 2))
    add(scene, place(a.building(70), hx * T + T / 2, hy * T + T / 2))
    add(scene, pit)
    links = [((lx, ly), (hx, hy))]
    # The waterfall: HGSS's small cave waterfall (10 tiles wide), from the pool above down to the one below, lit and
    # textured as Mt. Mortar's own (full colour; the model on its own comes out dark). It falls 4 tiles, water to water;
    # the pools are 3 apart, so it's squashed to fit, its foot where it was (both lower with the deeper water).
    real = {p['material']: p['tex'] for p in a.chunk(517, 79)[0] if 'fall' in p['material'] and p['tex'] is not None}
    squash = np.array([1, 0.75, 1])
    fall = [dict(p, tex=real.get(p['material'], p['tex']), col=np.ones_like(p['col']), pos=(p['pos'] + [0, 0.5 * T, 0]) * squash - [0, 0.5 * T, 0]) for p in a.building(319)]
    add(scene, fall, (36 * T, -WATER_DROP[1] * (depth - 1) * T, (top + 11) * T))
    entrance = (1, top + 18)
    exit = (71, 12)
    # The user's spots: 1-8 in the first three chambers, before the ladder; 9 and 10 in the fourth.
    spots = [(5, 41), (12, 44), (28, 40), (28, 49), (43, 48), (46, 42), (59, 37), (66, 40), (57, 10), (66, 12)]
    stops = [entrance] + spots[:8] + [(lx, ly), (hx, hy)] + spots[8:] + [exit]
    # (Its rocks and other ground placed as when the stream was 4 wide, 34-37, so widening it moved none of them: the
    # tiles it gained were too near the water for any.)
    wider = {(x, y) for x in (33, 38) for y in range(top + 19, h)} - bridge
    narrow = [''.join('.' if (x, y) in wider else c for x, c in enumerate(r)) for y, r in enumerate(rows)]
    rows = moon_floor(scene, narrow, tx, stops, rng, clumps=9, patches=(10, 4), links=links)
    rows = [''.join('~' if (x, y) in wider else c for x, c in enumerate(r)) for y, r in enumerate(rows)]
    rows = [r.replace('U', '#').replace('u', '#') for r in rows]
    for x, y in ((66, 44), (67, 44), (66, 45), (66, 46), (58, 38)):  # not walkable (the user's; 58,38 is 58,14 on its map)
        rows[y] = rows[y][:x] + '#' + rows[y][x + 1:]
    check(rows, stops, links, False)
    # In two maps (the user's): the first three chambers up to the ladder, its exit, faded from to the fourth chamber's
    # map (route42_upper), in at the hole; the one render cut between them (black rock, rows 0-23 and 24 on).
    full = os.path.join(out, 'route42_whole.png')
    scene.render(full)
    write(out, 'route42', scene, rows, spots[:8], entrance, exit=(lx, ly), band=(top, h), rendered=full)
    write(out, 'route42_upper', scene, rows, spots[8:], (hx, hy), exit=exit, band=(0, top), rendered=full)


def lift(scene, weight, height, start=0):
    """Draws what stands on a raised area (its floor, its cliffs and the walls rising from it; scene.prims from `start`)
    on its own tiles: each vertex moved down the map by what the tilt lifts it, up to `height` (so the raised floor
    lies on its tiles and each cliff fills its row, not 0.6 of a tile higher, where a figure on it would stand halfway
    down its cliff), times `weight` (a 0-1 array by tile: 1 on the raised area, eased off over the rock round it so
    the walls bend rather than break: each tile corner takes the mean of the tiles round it, or all of it by the raised
    area itself, and a vertex the blend of its tile's corners, so whatever meets along an edge moves alike and nothing
    comes apart). Above `height` the walls move with it."""
    hh, ww = weight.shape
    pad = np.pad(weight, 1, mode='edge')
    quads = [pad[dy:dy + hh + 1, dx:dx + ww + 1] for dy in (0, 1) for dx in (0, 1)]
    corner = np.where(np.max(quads, axis=0) >= 1, 1.0, np.mean(quads, axis=0))
    for i in range(start, len(scene.prims)):
        pos, *rest = scene.prims[i]
        pos = pos.copy()
        u, v = np.clip(pos[:, 0] / T, 0, ww - 1e-6), np.clip(pos[:, 2] / T, 0, hh - 1e-6)
        i0, j0 = np.floor(u).astype(int), np.floor(v).astype(int)
        fu, fv = u - i0, v - j0
        f = ((corner[j0, i0] * (1 - fu) + corner[j0, i0 + 1] * fu) * (1 - fv)
             + (corner[j0 + 1, i0] * (1 - fu) + corner[j0 + 1, i0 + 1] * fu) * fv)
        pos[:, 2] += scene.tilt * np.clip(pos[:, 1] - scene.ground, 0, height) * f
        scene.prims[i] = (pos, *rest)


def convex_hull(pts):
    """The convex hull of 2-D points, anticlockwise (Andrew's monotone chain)."""
    pts = sorted(set(map(tuple, np.round(pts, 3))))
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def half(ps):
        out = []
        for p in ps:
            while len(out) >= 2 and cross(out[-2], out[-1], p) <= 0:
                out.pop()
            out.append(p)
        return out[:-1]
    return half(pts) + half(pts[::-1])


def pit_cut(pit, hole):
    """cave()'s `cut` for a ladder's pit (placed, its floor at 0) wider than its tile: the tiles round the hole, and
    inside the pit's rim (its stones' inner edge, where they meet its sloping sides), as the real caves' floor is cut."""
    rim = np.array([v[[0, 2]] for p in pit for k in range(0, len(p['pos']), 3) for v in p['pos'][k:k + 3]
                    if v[1] > 1 and any(o[1] < -10 for o in p['pos'][k:k + 3])])
    hx, hy = hole
    return {(hx + dx, hy + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)}, in_hull(convex_hull(rim))


def in_hull(hull):
    """Whether a point (x, z) is inside a convex hull (anticlockwise)."""
    edges = list(zip(hull, hull[1:] + hull[:1]))
    return lambda x, z: all((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) > 0 for a, b in edges)


def plank_bridge(scene, tex, shadow, x0, x1, z0, z1, water):
    """A bridge running left to right, as Route 48's (its land model's bridge_a: the deck 2 up, a strip 8 wide along
    each side and the planks between, its faces 8 deep, the boards repeating every 32 along it) over tiles x0-x1 by
    z0-z1 (tiles, the far ones not included), and its shadow (f_kage) on the water at `water` under it, darker than
    Route 48's (60% opaque, the user's). Lit as the cave's floor is."""
    X0, X1, Z0, Z1, top, bot, s = x0 * T, x1 * T, z0 * T, z1 * T, 2.0, -6.0, 8.0
    c = (0.67, 0.67, 0.67)
    v0, v1 = X0 / 32, X1 / 32
    # The deck: the far strip, the planks, the near strip (u across it, v along).
    for za, zb, ua, ub in ((Z0, Z0 + s, 0.5, 0.25), (Z0 + s, Z1 - s, 0.25, 0.031), (Z1 - s, Z1, 0.25, 0.5)):
        quad(scene, [(X0, top, za), (X1, top, za), (X1, top, zb), (X0, top, zb)], [(ua, v0), (ua, v1), (ub, v1), (ub, v0)], tex, c)
    # Its faces down towards the water, near and far, and at each end.
    for z in (Z0, Z1):
        quad(scene, [(X0, top, z), (X1, top, z), (X1, bot, z), (X0, bot, z)], [(0.5, v0), (0.5, v1), (0.73, v1), (0.73, v0)], tex, c)
    for x in (X0, X1):
        for za, zb, va, vb in ((Z0, Z0 + s, 4.016, 4.25), (Z0 + s, Z1 - s, 3.316, 3.428), (Z1 - s, Z1, 4.25, 4.016)):
            quad(scene, [(x, top, za), (x, top, zb), (x, bot, zb), (x, bot, za)], [(0.766, va), (0.766, vb), (0.969, vb), (0.969, va)], tex, c)
    quad(scene, [(X0, water + 0.1, Z0), (X1, water + 0.1, Z0), (X1, water + 0.1, Z1), (X0, water + 0.1, Z1)], [(0, 0), (1, 0), (1, 1), (0, 1)], shadow, alpha=0.6, blend=True)


def big_rock(scene, tx, x, y, base=0.0):
    """A big icy rock as Ice Path 1F's (drock01, its whole texture): its left tile x, y, two wide, leaning back over the
    row above; `base`: the floor's height."""
    X, Z = x * T, y * T
    quad(scene, [(X, base + 0.69, Z + 11.31), (X + 2 * T, base + 0.69, Z + 11.31), (X + 2 * T, base + 23.31, Z - 11.31), (X, base + 23.31, Z - 11.31)], [(0.018, 0.982), (0.982, 0.982), (0.982, 0.012), (0.018, 0.012)], tx['d_rock01'], (0.67, 0.67, 0.67))


def small_rock(scene, tx, x, y, base=0.0):
    """A small icy rock as Ice Path B2F's (d_rock01s's lower right quarter), a tile, leaning back."""
    X, Z = x * T, y * T
    quad(scene, [(X, base + 0.15 * T, Z + 0.85 * T), (X + T, base + 0.15 * T, Z + 0.85 * T), (X + T, base + 0.99 * T, Z + 0.3 * T), (X, base + 0.99 * T, Z + 0.3 * T)], [(0.52, 0.98), (0.98, 0.98), (0.98, 0.52), (0.52, 0.52)], tx['d_rock01s'], (0.67, 0.67, 0.67))


def route44(a, out):
    """Route 44 as an ice cave in two maps (the user's): the lower area (route44) and, up its ladder, the upper area
    (route44_upper), each drawn on its own (the other area rock) and cropped to it."""
    for part in ('lower', 'upper'):
        route44_part(a, out, part)


def route44_part(a, out, part):
    lower = part == 'lower'
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
    hole = (21, 21)                   # the ladder down in the upper area, where the player comes in (the user's)
    # A raised area two tiers up in each, as Ice Path's (the user's); its edge over the ground a cliff two tiles deep
    # (its own edge, a tier, and the ground in front of it, the lower tier: the face over the ground, the user's), but
    # for its stairs down to the south, each 2 wide and 2 long, as Ice Path B2F's (dslope, one a tier).
    raised = 2
    if lower:
        # Across the top of the lower area (12-25,36-40), along to its right (18-33,41-42, and 22-24,43) and down the
        # right side (25-33,43-48), encounters 4 and 5 on it; its stairs at 27-28,48-49 up from the ground by encounter
        # 3 and at 15-16,40-41 down to the ground by the ladder.
        plateau = ({(x, y) for y in range(36, 41) for x in range(12, 26)} | {(x, y) for y in (41, 42) for x in range(18, 34)}
                   | {(x, 43) for x in range(22, 25)} | {(x, y) for y in range(43, 49) for x in range(25, 34)})
        stairs = [(27, 48), (15, 40)]
    else:
        # 16-29,20-23 in the upper area, the ladder's hole on it (21,21), its stairs down at its right end (28-29,23-24).
        plateau = {(x, y) for y in range(20, 24) for x in range(16, 30)}
        stairs = [(28, 23)]
    stair_tiles = {(x + i, y + j) for x, y in stairs for i in (0, 1) for j in (0, 1)}
    on_ground = lambda x, y: 0 <= x < w and 0 <= y < h and rows[y][x] == '.' and (x, y) not in plateau
    around = lambda x, y: [(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
    # (Ground only across a corner too: the cliff's curved corner where it turns, the user's.)
    cliff = {(x, y) for x, y in plateau if any(on_ground(*t) for t in around(x, y))} - stair_tiles
    foot = {t for x, y in cliff for t in around(x, y) if on_ground(*t)} - stair_tiles
    for x, y in plateau - stair_tiles:
        rows[y][x] = '#' if (x, y) in cliff else 'u'
    for x, y in foot:
        rows[y][x] = '#'
    # (The lower area's rocks:) the ground beside its raised area's right side (22-23,45-49, inside the cliff's foot) full of icy rocks, big and small (the
    # user's): (x, y) the big ones' left tile, two wide.
    big = [(22, 47), (22, 49)]
    small = [(22, 45), (23, 45)]
    boulders = {(x, y) for y in range(45, 50) for x in range(22, 24)}
    # More in corners (the user's): big ones at 24-25,36-37 (on the raised area) and 28-29,56-57, small ones at 32,47,
    # 33,47 and 33,46 (on the raised area).
    big += [(28, 57)]
    big_up, small_up = [(24, 37)], [(32, 47), (33, 47), (33, 46)]
    boulders |= {(x + i, y - j) for x, y in big[-1:] + big_up for i in (0, 1) for j in (0, 1)} | set(small_up)
    # And behind the ladder, 6-10,36-37 (the user's): big ones either side, a small one behind it.
    big += [(6, 37), (9, 37)]
    small += [(8, 36)]
    boulders |= {(x, y) for y in (36, 37) for x in range(6, 11)}
    rocks = [(11, 51), (11, 55), (19, 50), (16, 52), (8, 51), (8, 54), (8, 56)]  # icy rocks (the user's; the last 3 along the left wall)
    if not lower:
        # The upper area's (the user's): big ones at 32-33,7-8, 26-27,12-13 and 4-5,12-13, small ones on the ice, on the
        # raised area and in the corner at 8,28.
        big, small, big_up = [(32, 8), (26, 13), (4, 13)], [], []
        rocks = [(18, 4), (19, 4), (19, 5), (25, 6), (26, 6), (32, 10), (19, 9), (34, 13), (35, 12), (35, 13), (8, 28), (9, 28), (8, 27)]
        small_up = [(18, 20), (17, 20), (29, 20)]
        boulders = {(x + i, y - j) for x, y in big for i in (0, 1) for j in (0, 1)} | set(small_up)
    # Each map has only its own area: the other one's rock (the areas meet at row 30).
    for y in (range(30) if lower else range(30, h)):
        rows[y] = ['#'] * w
    rows = [''.join(r) for r in rows]
    # Sheets of ice in each area.
    ice_cells = {(x, y) for y in range(h) for x in range(w) if rows[y][x] == '.' and ((10 <= x < 22 and 51 <= y < 57) or (16 <= x < 36 and 4 <= y < 14))}
    ice_cells -= {(12, 52), (12, 53)}  # ground (the user's: 12,27-28 on its map); the rocks sit on the ice
    ice_cells -= {(x, y) for y in (5, 6) for x in range(29, 34)} | {(x, y) for y in (9, 10) for x in range(23, 28)}  # ground in the upper area's (the user's)
    scene = Scene(w * 16, h * 16, tilt=0.6, ground=0)
    hx, hy = hole
    ice_cells = {(x, y) for x, y in ice_cells if rows[y][x] == '.'}
    # The ladder's pit (Ice Path B2F's, round its ladder down at 40,-168 of chunk 548) is wider than its tile: the floor
    # round it cut away inside its rim (where its stones meet its sloping sides), as B2F's is, so its shadowed sides show.
    hx, hy = hole
    pit = clip([p for p in a.chunk(548, 76)[0] if p['material'] == 'd_stairhole'], 8, 72, -200, -136)
    cut = pit_cut(place(pit, hx * T + T / 2 - 40, hy * T + T / 2 + 168), hole) if not lower else None
    around_hole = cut[0] if cut else set()
    cave(scene, rows, tx, tx['droad01'], ice=tx['ice_fe01'], ice_cells=ice_cells, holes={hole} | stair_tiles, ice_path=True, raised=raised, tiers=6, cut=cut)
    stair = clip([p for p in a.chunk(548, 76)[0] if p['material'] == 'dslope'], 16, 48, 16, 32)  # B2F's at 16-48,16-32
    for x, y in stairs:
        add(scene, place(stair, x * T - 16, y * T - 16, dy=T))
        add(scene, place(stair, x * T - 16, (y + 1) * T - 16))
    # Ice Path's patches of other ground (its droad01_sub and droad01_sub2) on the open ground, not the ice, nor where
    # rocks stand (the user's); up on the raised area there, lifted with it.
    import random
    taken = boulders | set(rocks) | stair_tiles | around_hole
    floor_at = lambda x, y: 0 <= x < w and 0 <= y < h and rows[y][x] in '.u' and (x, y) not in ice_cells and (x, y) not in taken
    open_ = lambda x, y: floor_at(x, y) and all(floor_at(x + dx, y + dy) and rows[y + dy][x + dx] == rows[y][x] for dx in (-1, 0, 1) for dy in (-1, 0, 1))
    other_ground(scene, tx, w, h, open_, random.Random(44 if lower else 45), (10, 4) if lower else (8, 3), lambda x, y: raised * T if rows[y][x] == 'u' else 0.0)
    # (The raised area's rocks on it, lifted with it.)
    for x, y in big_up:
        big_rock(scene, tx, x, y, raised * T)
    for x, y in small_up:
        small_rock(scene, tx, x, y, raised * T)
    # The raised area drawn on its own tiles, and the rock rising from it (by how much nearer it than the ground, less
    # farther from it, so the walls behind it stretch rather than slide; smoothed with its neighbours).
    dist, up = bfs_dist(rows, '.~', blocked='uU'), bfs_dist(rows, 'uU', blocked='.~')
    weight = np.where(np.array([list(r) for r in rows]) == '#', np.clip(dist - up - 0.5, 0, 1) * np.clip(1 - (up - 1) / 3, 0, 1), 0.0)
    weight = np.minimum(sum(np.roll(np.roll(np.pad(weight, 1, mode='edge'), dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))[1:-1, 1:-1] / 9, 0.99)
    # The raised area, and rock beside it as high as it (its top level with it) with no ground beside it, all the way.
    level1 = {(x, y) for y in range(h) for x in range(w) if rows[y][x] == '#' and min(dist[y, x], raised + up[y, x]) <= raised
              and not any(on_ground(x + dx, y + dy) for dx, dy in SIDES)}
    for x, y in plateau | foot | stair_tiles | {(x, y) for x, y in level1 if any(t in plateau for t in around(x, y))}:
        weight[y, x] = 1
    lift(scene, weight, raised * T)
    rows = [r.replace('u', '.') for r in rows]
    for x, y in big:
        big_rock(scene, tx, x, y)
    for x, y in small:
        small_rock(scene, tx, x, y)
    for x, y in boulders:
        rows[y] = rows[y][:x] + '#' + rows[y][x + 1:]
    # Icy rocks, as Ice Path B2F's small ones (d_rock01s's lower right quarter, leaning back), on the ice or the ground
    # (the user's); each blocks its tile.
    for x, y in rocks:
        small_rock(scene, tx, x, y)
        rows[y] = rows[y][:x] + '#' + rows[y][x + 1:]
    if not lower:
        upper_area(a, out, tx, scene, rows, hole, raised, ice_cells)
        return
    # The ladder up (8,38, the user's), HGSS's own (dun_stairup, leaning back over the wall), as on Route 42: the map's
    # exit, faded from to the upper area's map.
    lx, ly = 8, 38
    add(scene, place(a.building(69), lx * T + T / 2, ly * T + T / 2))
    # Not walkable (the user's; 29,19 and 9-10,16 on the lower map).
    for x, y in [(29, 44), (10, 41), (9, 41)]:
        rows[y] = rows[y][:x] + '#' + rows[y][x + 1:]
    spots = [(19, 57), (12, 52), (27, 54), (30, 43), (19, 38)]
    entrance = (19, 61)  # 19,36 on its map (the user's)
    check(rows, [entrance] + spots + [(lx, ly)], [], False)
    write(out, 'route44', scene, rows, spots, entrance, exit=(lx, ly), trim=True, ice=ice_cells)


def upper_area(a, out, tx, scene, rows, hole, raised, ice_cells):
    """Route 44's upper area: in at the ladder's hole on its raised area (the ladder down, HGSS's own, dun_stairdw,
    with Ice Path B2F's own pit, the ring round it in the Ice Path's colours: the user's; its ladder down at 40,-168 of
    chunk 548; up on the raised area and moved as `lift` moves it), down its stairs and up to the top edge."""
    hx, hy = hole
    up, down = raised * T, scene.tilt * raised * T
    add(scene, place(a.building(70), hx * T + T / 2, hy * T + T / 2 + down, dy=up))
    pit = clip([p for p in a.chunk(548, 76)[0] if p['material'] == 'd_stairhole'], 8, 72, -200, -136)
    add(scene, place(pit, hx * T + T / 2 - 40, hy * T + T / 2 + 168 + down, dy=up))  # (its floor cut in route44_part)
    for x, y in [(11, 17)]:  # not walkable (the user's)
        rows[y] = rows[y][:x] + '#' + rows[y][x + 1:]
    spots = [(23, 26), (11, 22), (10, 16), (25, 10), (31, 6)]  # the first three the user's
    entrance, exit = (hx, hy), (22, 0)  # in at the hole, out at the top edge (the user's)
    check(rows, [entrance] + spots + [exit], [], False)
    write(out, 'route44_upper', scene, rows, spots, entrance, exit=exit, trim=True, ice=ice_cells)


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
