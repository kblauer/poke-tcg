"""Reading Platinum data from the pret/pokeplatinum decompilation, as dp_data.py reads Diamond's, for the one Platinum map
the Sinnoh runs use (Hearthome Gym, the user's: Platinum's layout). The same functions as dp_data.py (dp_map.py renders
with either, `--game platinum`), over pokeplatinum's files: map headers in include/data/map_headers.h, matrices, area
data and events as JSON, land data (Diamond's format) and texture sets by number, props by their name's place in
map_prop_models.order, each prop drawn with its area's prop texture set."""
import json, os, re, urllib.request
from dp_data import land_chunk  # noqa: F401 (the same land data format)

BASE = 'https://raw.githubusercontent.com/pret/pokeplatinum/main/'
LAND_DATA = 'res/field/maps/data/map_data_{:03d}.bin'
MAP_TEXTURES = 'res/field/maps/texture_sets/map_texture_set_{:03d}.nsbtx'
PROP_TEXTURES = 'res/field/props/texture_sets/prop_texture_set_{:03d}.nsbtx'
BUILDING = 'res/field/props/models/{}'


def fetch(cache, path):
    """A file of the decompilation, downloaded once into the cache."""
    local = os.path.join(cache, path.replace('/', os.sep))
    if not os.path.exists(local):
        os.makedirs(os.path.dirname(local), exist_ok=True)
        with urllib.request.urlopen(BASE + path) as r:
            open(local, 'wb').write(r.read())
    return local


def read(cache, folder, n):
    """Entry `n` of one of the folders above (BUILDING: the nth of map_prop_models.order)."""
    if folder == BUILDING:
        order = [l.strip() for l in open(fetch(cache, 'res/field/props/models/map_prop_models.order'), encoding='utf-8') if l.strip()]
        return open(fetch(cache, BUILDING.format(order[n])), 'rb').read()
    return open(fetch(cache, folder.format(n)), 'rb').read()


def map_headers(cache):
    """MAP_* constant (MAP_HEADER_ without HEADER_) -> its header: id (its index), area data, matrix and events names."""
    text = open(fetch(cache, 'include/data/map_headers.h'), encoding='utf-8').read()
    out = {}
    for i, m in enumerate(re.finditer(r'\[MAP_HEADER_(\w+)\] = \{(.*?)\n    \}', text, re.S)):
        body = m.group(2)
        field = lambda f: re.search(rf'\.{f} = (\w+)', body).group(1)
        out['MAP_' + m.group(1)] = {'id': i, 'area': int(field('areaDataArchiveID').split('_')[-1]), 'matrix': int(field('mapMatrixID').split('_')[-1]),
                                    'events': field('eventsArchiveID')}
    return out


def matrix(cache, n):
    """A map matrix (JSON): its size, and for each cell its map header (or None), altitude and land data id."""
    d = json.load(open(fetch(cache, f'res/field/matrices/map_matrix_{n:03d}.json'), encoding='utf-8'))
    maps = d['maps']
    h, w = len(maps), len(maps[0])
    cell = lambda grid, x, y, default: grid[y][x] if grid else default
    land = lambda v: 0xFFFF if v in (None, '', 'MAP_NONE') else int(str(v).split('_')[-1])
    return w, h, [{'x': x, 'y': y, 'header': cell(d['headers'], x, y, None), 'alt': cell(d['altitudes'], x, y, 0), 'land': land(maps[y][x])}
                  for y in range(h) for x in range(w)]


def area_textures(cache, n):
    """An area's map texture set."""
    d = json.load(open(fetch(cache, f'res/field/area_data/area_data_{n:03d}.json'), encoding='utf-8'))
    return int(d['mapTextureSet'].split('_')[-1])


def prop_textures(cache, area):
    """An area's prop texture set (its own number's)."""
    return read(cache, PROP_TEXTURES, area)


def events(cache, name):
    """A map's events (JSON): its people (`objects`: graphics, trainer, facing and tile) and warps (tile, where to:
    a MAP_* constant and the warp there)."""
    d = json.load(open(fetch(cache, f'res/field/events/{name}.json'), encoding='utf-8'))
    objects = [{'gfx': o['graphics_id'], 'trainer': o['script'] if o['trainer_type'] != 'TRAINER_TYPE_NONE' else None,
                'face': o['initial_dir'], 'x': o['x'], 'z': o['z']} for o in d['object_events']]
    warps = [{'x': w['x'], 'z': w['z'], 'to': w['dest_header_id'].replace('MAP_HEADER_', 'MAP_'), 'warp': w['dest_warp_id']} for w in d['warp_events']]
    return {'objects': objects, 'warps': warps}
