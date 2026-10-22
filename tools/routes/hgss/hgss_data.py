"""Reading HeartGold/SoulSilver data from the pret/pokeheartgold decompilation, for the Johto route maps: downloads
(and caches in <cache>/) the files the map and sprite tools need, unpacks NARC archives, and reads the map headers,
map matrices and area data. Shared by hgss_map.py and hgss_sprites.py."""
import os, re, struct, urllib.request

BASE = 'https://raw.githubusercontent.com/pret/pokeheartgold/master/'
# The NARCs the tools read: the maps' terrain chunks (land data), their texture sets, the area data (which texture set a
# map uses) and the buildings placed on outdoor and indoor maps.
LAND_DATA = 'files/a/0/6/5'
MAP_TEXTURES = 'files/a/0/4/4'
AREA_DATA = 'files/a/0/4/2'
BUILDINGS = {'field': 'files/fielddata/build_model/bm_field.narc', 'room': 'files/fielddata/build_model/bm_room.narc'}


def fetch(cache, path):
    """A file of the decompilation, downloaded once into the cache."""
    local = os.path.join(cache, path.replace('/', os.sep))
    if not os.path.exists(local):
        os.makedirs(os.path.dirname(local), exist_ok=True)
        with urllib.request.urlopen(BASE + path) as r:
            open(local, 'wb').write(r.read())
    return local


def narc(path):
    """The files in a Nintendo NARC archive, in order."""
    d = open(path, 'rb').read()
    o = struct.unpack_from('<H', d, 12)[0]
    assert d[o:o + 4] == b'BTAF', path
    size, n = struct.unpack_from('<IH', d, o + 4)
    fat = [struct.unpack_from('<II', d, o + 12 + 8 * i) for i in range(n)]
    o += size
    assert d[o:o + 4] == b'BTNF', path
    o += struct.unpack_from('<I', d, o + 4)[0]
    assert d[o:o + 4] == b'GMIF', path
    return [d[o + 8 + s:o + 8 + e] for s, e in fat]


def map_ids(cache):
    """MAP_* constant -> map id (include/constants/maps.h)."""
    text = open(fetch(cache, 'include/constants/maps.h'), encoding='utf-8').read()
    return {m.group(1): int(m.group(2)) for m in re.finditer(r'#define\s+(MAP_\w+)\s+(\d+)', text)}


def map_header(cache, const):
    """A map's header fields we need (src/data/map_headers.h): its area data bank and its matrix's file name."""
    text = open(fetch(cache, 'src/data/map_headers.h'), encoding='utf-8').read()
    m = re.search(r'\[' + const + r'\]\s*=\s*\{(.*?)\n\s*\},', text, re.S)
    assert m, const
    body = m.group(1)
    area = int(re.search(r'\.areaDataBank\s*=\s*(\d+)', body).group(1))
    matrix = re.search(r'\.matrixId\s*=\s*NARC_map_matrix_(\w+)_bin', body).group(1)
    return {'area': area, 'matrix': matrix + '.bin'}


def matrix(cache, name):
    """A map matrix: its size, and for each cell its map header (or None: one map only), altitude and land data id."""
    d = open(fetch(cache, 'files/fielddata/mapmatrix/map_matrix/' + name), 'rb').read()
    w, h, has_headers, has_alts, name_len = d[0], d[1], d[2], d[3], d[4]
    o = 5 + name_len
    headers = struct.unpack_from(f'<{w * h}H', d, o) if has_headers else [None] * (w * h)
    o += 2 * w * h if has_headers else 0
    alts = list(d[o:o + w * h]) if has_alts else [0] * (w * h)
    o += w * h if has_alts else 0
    land = struct.unpack_from(f'<{w * h}H', d, o)
    return w, h, [{'x': i % w, 'y': i // w, 'header': headers[i], 'alt': alts[i], 'land': land[i]} for i in range(w * h)]


def area(cache, bank, room=False):
    """An area's map texture set, and its buildings' archive: bm_field for routes and caves (Mt. Mortar's waterfall is
    there too), bm_room for the inside of buildings (`room`)."""
    e = narc(fetch(cache, AREA_DATA))[bank]
    textures = struct.unpack_from('<H', e, 2)[0]
    return {'buildings': 'room' if room else 'field', 'textures': textures}


def land_chunk(data):
    """A land data chunk: its 32x32 tile permissions (2 bytes each), its buildings and its terrain model (NSBMD)."""
    perm, objs, model, _bdhc = struct.unpack_from('<4I', data, 0)
    # Then 0x1234 and the size of an extra block (map prop animations) before the permissions.
    o = 20 + struct.unpack_from('<H', data, 18)[0]
    p = data[o:o + perm]; o += perm
    b = data[o:o + objs]; o += objs
    buildings = []
    for k in range(0, len(b), 48):
        mid = struct.unpack_from('<I', b, k)[0]
        x, y, z = (v / 4096 for v in struct.unpack_from('<3i', b, k + 4))
        buildings.append({'model': mid, 'pos': (x, y, z)})
    return {'perm': p, 'buildings': buildings, 'model': data[o:o + model]}


def _dict(d, o):
    """An NNS resource dictionary at `o`: [(name, offset of its entry's data)]."""
    _rev, n, _size, _, ofs_entry = struct.unpack_from('<BBHHH', d, o)
    unit = struct.unpack_from('<H', d, o + ofs_entry)[0]
    data = o + ofs_entry + 4
    names = data + unit * n
    return [(d[names + 16 * i:names + 16 * i + 16].split(b'\0')[0].decode(), data + unit * i) for i in range(n)]


def texture_matrices(nsbmd):
    """The texture matrices of a model's materials (NSBMD), by material name: scale, rotation (sin, cos) and translation of
    their texture coordinates (as fractions of the texture). apicula leaves them out ("texture matrix is unimplemented"),
    and the shorelines' wave band (swave_p) needs its translation."""
    mdl = struct.unpack_from('<I', nsbmd, 16)[0]
    out = {}
    for _name, e in _dict(nsbmd, mdl + 8):
        model = mdl + struct.unpack_from('<I', nsbmd, e)[0]
        mat = model + struct.unpack_from('<I', nsbmd, model + 8)[0]
        for mname, me in _dict(nsbmd, mat + 4):
            m = mat + struct.unpack_from('<I', nsbmd, me)[0]
            flag = struct.unpack_from('<H', nsbmd, m + 0x1E)[0]
            if not flag & 1:  # no texture matrix
                continue
            o = m + 0x2C
            scale, rot, trans = (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)
            if not flag & 2:
                scale = tuple(v / 4096 for v in struct.unpack_from('<ii', nsbmd, o)); o += 8
            if not flag & 4:
                rot = tuple(v / 4096 for v in struct.unpack_from('<hh', nsbmd, o)); o += 4
            if not flag & 8:
                trans = tuple(v / 4096 for v in struct.unpack_from('<ii', nsbmd, o)); o += 8
            if (scale, rot, trans) != ((1.0, 1.0), (0.0, 1.0), (0.0, 0.0)):
                out[mname] = {'scale': scale, 'rot': rot, 'trans': trans}
    return out
