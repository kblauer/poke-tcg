"""A small software renderer for HeartGold/SoulSilver maps, which are 3D: draws textured triangles (from apicula's GLB
conversions of the maps' terrain and buildings, or made by hand for a generated map) looking down on the map with a slight
tilt (`tilt`: vertical faces show, as in the games), 16 px to a 16-unit tile. The ground (`ground`, in model units) lies
exactly on the tile grid; anything higher is drawn that much further up the image. Needs numpy and Pillow."""
import io, json, os, struct
import numpy as np
from PIL import Image

PX = 16      # pixels per tile
UNIT = 16    # model units per tile
S = PX / UNIT

REPEAT, CLAMP, MIRROR = 10497, 33071, 33648


class Scene:
    def __init__(self, width_px, height_px, tilt=0.6, ground=0.0, background=(0, 0, 0)):
        self.w, self.h, self.tilt, self.ground = width_px, height_px, tilt, ground
        self.img = np.zeros((height_px, width_px, 3)); self.img[:] = np.array(background) / 255
        self.depth = np.full((height_px, width_px), -1e18)
        self.prims = []

    def mesh(self, pos, uv, col, tex=None, wrap=(REPEAT, REPEAT), alpha=1.0, blend=False):
        """Triangles (positions in model units, already placed: x right, y up, z down the map, 0,0 at the image's top
        left), their texture coordinates, vertex colours (0-1), an RGBA texture (0-1) and how it wraps."""
        self.prims.append((np.asarray(pos, float), np.asarray(uv, float), np.asarray(col, float), tex, wrap, alpha, blend))

    def glb(self, path, origin, texmtx=None):
        """A GLB (apicula's), its model origin at `origin` (x, y, z in model units); `texmtx`: its materials' texture
        matrices (hgss_data.texture_matrices)."""
        for p in glb_prims(path, texmtx):
            self.mesh(p['pos'] + np.array(origin), p['uv'], p['col'], p['tex'], p['wrap'], p['alpha'], p['blend'])

    def render(self, out):
        # Opaque first, then see-through surfaces (water), so they blend over what's beneath them.
        for pos, uv, col, tex, wrap, alpha, blend in sorted(self.prims, key=lambda p: p[6]):
            sx = pos[:, 0] * S
            sy = pos[:, 2] * S - (pos[:, 1] - self.ground) * S * self.tilt
            d = pos[:, 1] + pos[:, 2] * self.tilt * 0.5
            for k in range(0, len(pos) - 2, 3):
                self._triangle(sx[k:k + 3], sy[k:k + 3], d[k:k + 3], uv[k:k + 3], col[k:k + 3], tex, wrap, alpha)
        Image.fromarray((np.clip(self.img, 0, 1) * 255).astype(np.uint8)).save(out)

    def _triangle(self, xs3, ys3, ds, uv, col, tex, wrap, alpha):
        (x0, x1, x2), (y0, y1, y2) = xs3, ys3
        minx, maxx = int(max(0, np.floor(min(xs3)))), int(min(self.w - 1, np.ceil(max(xs3))))
        miny, maxy = int(max(0, np.floor(min(ys3)))), int(min(self.h - 1, np.ceil(max(ys3))))
        if minx > maxx or miny > maxy:
            return
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            return
        xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
        w0 = ((x1 - xs) * (y2 - ys) - (x2 - xs) * (y1 - ys)) / area
        w1 = ((x2 - xs) * (y0 - ys) - (x0 - xs) * (y2 - ys)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            return
        d = w0 * ds[0] + w1 * ds[1] + w2 * ds[2]
        sub = self.depth[miny:maxy + 1, minx:maxx + 1]
        vis = inside & (d >= sub - 1e-6)
        if not vis.any():
            return
        c = w0[..., None] * col[0] + w1[..., None] * col[1] + w2[..., None] * col[2]
        a = np.full(w0.shape, alpha)
        if tex is not None:
            u = w0 * uv[0][0] + w1 * uv[1][0] + w2 * uv[2][0]
            v = w0 * uv[0][1] + w1 * uv[1][1] + w2 * uv[2][1]
            th, tw = tex.shape[:2]
            ti = _wrap(np.floor(u * tw).astype(int), tw, wrap[0]); tj = _wrap(np.floor(v * th).astype(int), th, wrap[1])
            texel = tex[tj, ti]
            c = c * texel[..., :3]
            a = a * texel[..., 3]
        vis &= (a > 0.5) if alpha >= 0.99 else (a > 0.05)
        if not vis.any():
            return
        k = np.where(a >= 0.99, 1.0, a)[..., None]
        region = self.img[miny:maxy + 1, minx:maxx + 1]
        region[vis] = (region * (1 - k) + c * k)[vis]
        # Only opaque pixels hide what's behind them.
        solid = vis & (a >= 0.99)
        sub[solid] = d[solid]


def glb_prims(path, texmtx=None):
    """A GLB's triangles (apicula's conversion of a model), by material: positions in model units (its origin at 0),
    texture coordinates (with the material's texture matrix applied, from `texmtx`, which apicula leaves out), vertex
    colours, texture (RGBA, 0-1), how it wraps, alpha, whether it's see-through, and the material's name."""
    gj, bin_ = _load_glb(path)
    out = []
    images = []
    for im in gj.get('images', []):
        if 'bufferView' in im:
            v = gj['bufferViews'][im['bufferView']]; data = bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        else:
            data = open(os.path.join(os.path.dirname(path), im['uri']), 'rb').read()
        images.append(np.asarray(Image.open(io.BytesIO(data)).convert('RGBA')).astype(float) / 255)
    for m, p in _primitives(gj):
        if p.get('mode', 4) != 4:
            continue
        at = p['attributes']
        pos = _accessor(gj, bin_, at['POSITION'])
        pos = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
        uv = _accessor(gj, bin_, at['TEXCOORD_0']) if 'TEXCOORD_0' in at else np.zeros((len(pos), 2))
        col = _accessor(gj, bin_, at['COLOR_0'])[:, :3] if 'COLOR_0' in at else np.ones((len(pos), 3))
        idx = _accessor(gj, bin_, p['indices']).astype(int).ravel() if 'indices' in p else np.arange(len(pos))
        mat = gj['materials'][p['material']] if 'material' in p else {}
        pbr = mat.get('pbrMetallicRoughness', {})
        base = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1]))
        tex, wrap = None, (REPEAT, REPEAT)
        if 'baseColorTexture' in pbr:
            t = gj['textures'][pbr['baseColorTexture']['index']]
            tex = images[t['source']]
            if 'sampler' in t:
                smp = gj['samplers'][t['sampler']]; wrap = (smp.get('wrapS', REPEAT), smp.get('wrapT', REPEAT))
        blend = mat.get('alphaMode') == 'BLEND'
        # See-through surfaces that say they're opaque are shadows (f_kage under bridges, solid black): the game
        # draws them faint.
        alpha = 0.4 if blend and base[3] >= 0.99 else base[3]
        tm = (texmtx or {}).get(mat.get('name', ''))
        if tm:
            (ss, st), (rs, rc), (ts, tt) = tm['scale'], tm['rot'], tm['trans']
            u, v = uv[:, 0] * ss, uv[:, 1] * st
            uv = np.c_[u * rc - v * rs + ts, u * rs + v * rc + tt]
        out.append({'pos': pos[idx], 'uv': uv[idx], 'col': col[idx] * base[:3], 'tex': tex, 'wrap': wrap, 'alpha': alpha, 'blend': blend, 'material': mat.get('name', '')})
    return out


def _wrap(t, n, mode):
    if mode == CLAMP:
        return np.clip(t, 0, n - 1)
    if mode == MIRROR:
        t = np.mod(t, 2 * n)
        return np.where(t >= n, 2 * n - 1 - t, t)
    return np.mod(t, n)


def _load_glb(path):
    d = open(path, 'rb').read()
    n = struct.unpack_from('<I', d, 12)[0]
    gj = json.loads(d[20:20 + n])
    o = 20 + n
    return gj, d[o + 8:o + 8 + struct.unpack_from('<I', d, o)[0]]


def _accessor(gj, bin_, i):
    a = gj['accessors'][i]; v = gj['bufferViews'][a['bufferView']]
    comp = {5126: 'f4', 5123: 'u2', 5125: 'u4', 5121: 'u1', 5122: 'i2', 5120: 'i1'}[a['componentType']]
    nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    size = np.dtype(comp).itemsize * nc
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', 0) or size
    rows = [np.frombuffer(bin_, dtype=comp, count=nc, offset=off + i * stride) for i in range(a['count'])]
    arr = np.array(rows, dtype=float).reshape(a['count'], nc)
    if a.get('normalized'):
        arr = arr / {'u1': 255, 'u2': 65535, 'i1': 127, 'i2': 32767}[comp]
    return arr


def _primitives(gj):
    """Each mesh primitive with its node's world matrix."""
    def matrix(n):
        if 'matrix' in n:
            return np.array(n['matrix']).reshape(4, 4).T
        m = np.eye(4)
        x, y, z, w = n.get('rotation', [0, 0, 0, 1])
        r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        m[:3, :3] = r * np.array(n.get('scale', [1, 1, 1])); m[:3, 3] = n.get('translation', [0, 0, 0])
        return m
    out = []
    def walk(i, parent):
        n = gj['nodes'][i]; m = parent @ matrix(n)
        if 'mesh' in n:
            out.extend((m, p) for p in gj['meshes'][n['mesh']]['primitives'])
        for c in n.get('children', []):
            walk(c, m)
    for i in gj['scenes'][gj.get('scene', 0)]['nodes']:
        walk(i, np.eye(4))
    return out
