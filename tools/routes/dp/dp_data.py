"""Reading Diamond/Pearl data from the pret/pokediamond decompilation, for the Sinnoh route maps: downloads (and caches in
<cache>/) the files the map tools need and reads the map headers (arm9/src/map_header.c), map matrices, area data, land
data and map events. pokediamond keeps its archives unpacked, one file per entry (narc_0000.bin…), named in the
headers by number. The same formats as HeartGold/SoulSilver's (hgss_data.py), but for the land data: no block of prop
animations before the permissions."""
import json, os, re, struct, urllib.request

BASE = 'https://raw.githubusercontent.com/pret/pokediamond/master/'
TREE = 'https://api.github.com/repos/pret/pokediamond/git/trees/master?recursive=1'
# The archives' directories: an entry is narc_<4 digits>.<its type's extension> (entry()).
LAND_DATA = 'files/fielddata/land_data/land_data_release'
MATRIX = 'files/fielddata/mapmatrix/map_matrix'
AREA_DATA = 'files/fielddata/areadata/area_data'
MAP_TEXTURES = 'files/fielddata/areadata/area_map_tex/map_tex_set'
BUILDING = 'files/fielddata/build_model/build_model'
EVENTS = 'files/fielddata/eventdata/zone_event_release'
TRAINERS = 'files/poketool/trainer/trdata.json'


def fetch(cache, path):
    """A file of the decompilation, downloaded once into the cache."""
    local = os.path.join(cache, path.replace('/', os.sep))
    if not os.path.exists(local):
        os.makedirs(os.path.dirname(local), exist_ok=True)
        with urllib.request.urlopen(BASE + path) as r:
            open(local, 'wb').write(r.read())
    return local


_files = {}


def entry(cache, folder, n):
    """The path of an archive's entry `n` in the repository (its extension is its file type's)."""
    if not _files:
        local = os.path.join(cache, 'tree.json')
        if not os.path.exists(local):
            os.makedirs(cache, exist_ok=True)
            with urllib.request.urlopen(TREE) as r:
                open(local, 'wb').write(r.read())
        for t in json.load(open(local, encoding='utf-8'))['tree']:
            m = re.match(r'(.*)/narc_(\d{4})\.\w+$', t['path'])
            if m:
                _files[(m.group(1), int(m.group(2)))] = t['path']
    return _files[(folder, n)]


def read(cache, folder, n):
    """Archive entry `n` of `folder`'s bytes."""
    return open(fetch(cache, entry(cache, folder, n)), 'rb').read()


def map_headers(cache):
    """MAP_* constant -> its header: id (its index), area data, matrix and events file numbers, map section."""
    text = open(fetch(cache, 'arm9/src/map_header.c'), encoding='utf-8').read()
    out = {}
    pattern = r'\{ (?:NARC_area_data_narc_(\d+)_bin|(\d+)), [^,]+, NARC_map_matrix_narc_(\d+)_bin, .*?NARC_zone_event_release_narc_(\d+)_bin, (MAPSEC_\w+).*?\}, // (MAP_\w+)'
    for i, m in enumerate(re.finditer(pattern, text)):
        out[m.group(6)] = {'id': i, 'area': int(m.group(1) or m.group(2)), 'matrix': int(m.group(3)), 'events': int(m.group(4)), 'section': m.group(5)}
    return out


def matrix(cache, n):
    """A map matrix: its size, and for each cell its map header (or None: one map only), altitude and land data id."""
    d = read(cache, MATRIX, n)
    w, h, has_headers, has_alts, name_len = d[0], d[1], d[2], d[3], d[4]
    o = 5 + name_len
    headers = struct.unpack_from(f'<{w * h}H', d, o) if has_headers else [None] * (w * h)
    o += 2 * w * h if has_headers else 0
    alts = list(d[o:o + w * h]) if has_alts else [0] * (w * h)
    o += w * h if has_alts else 0
    land = struct.unpack_from(f'<{w * h}H', d, o)
    return w, h, [{'x': i % w, 'y': i // w, 'header': headers[i], 'alt': alts[i], 'land': land[i]} for i in range(w * h)]


def area_textures(cache, n):
    """An area's map texture set (area_map_tex)."""
    return struct.unpack_from('<H', read(cache, AREA_DATA, n), 2)[0]


def land_chunk(data):
    """A land data chunk: its 32x32 tile permissions (2 bytes each), its buildings and its terrain model (NSBMD)."""
    perm, objs, model, _bdhc = struct.unpack_from('<4I', data, 0)
    o = 16
    p = data[o:o + perm]; o += perm
    b = data[o:o + objs]; o += objs
    buildings = []
    for k in range(0, len(b) - 47, 48):
        mid = struct.unpack_from('<I', b, k)[0]
        x, y, z = (v / 4096 for v in struct.unpack_from('<3i', b, k + 4))
        buildings.append({'model': mid, 'pos': (x, y, z)})
    return {'perm': p, 'buildings': buildings, 'model': data[o:o + model]}


def events(cache, n):
    """A map's events: its people (`objects`: id, sprite, script, facing and tile) and warps (tile, where to)."""
    d = read(cache, EVENTS, n)
    o = 0
    nb = struct.unpack_from('<I', d, o)[0]; o += 4 + nb * 20
    no = struct.unpack_from('<I', d, o)[0]; o += 4
    objects = []
    for _ in range(no):
        f = struct.unpack_from('<14H', d, o); o += 32
        objects.append({'id': f[0], 'sprite': f[1], 'movement': f[2], 'type': f[3], 'flag': f[4], 'script': f[5], 'face': f[6], 'sight': f[7], 'x': f[12], 'z': f[13]})
    nw = struct.unpack_from('<I', d, o)[0]; o += 4
    warps = []
    for _ in range(nw):
        x, z, header, anchor = struct.unpack_from('<4H', d, o); o += 12
        warps.append({'x': x, 'z': z, 'header': header, 'anchor': anchor})
    return {'objects': objects, 'warps': warps}


def trainer_of(cache, obj):
    """The trainer an object battles ('Black Belt Colby'), from its script (a trainer's is 3000 more than its id, less
    one: checked against every gym's trainers' Pokémon), or None."""
    if obj['script'] < 3000:
        return None
    data = json.load(open(fetch(cache, TRAINERS), encoding='utf-8'))['trdata']
    i = obj['script'] - 2999
    return data[i] if i < len(data) else None
