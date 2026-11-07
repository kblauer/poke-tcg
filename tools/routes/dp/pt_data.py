"""Reading Platinum data from the pret/pokeplatinum decompilation, as dp_data.py reads Diamond's, for the one Platinum map
the Sinnoh runs use (Hearthome Gym, the user's: Platinum's layout). The same functions as dp_data.py (dp_map.py renders
with either, `--game platinum`), over pokeplatinum's files (its layout since 2026: a folder a map), map headers in
generated/map_headers.txt (their order, the ids) and each map's res/field/maps/<map>/header.json and events.json, the
matrices in res/field/maps/groups.json (their order, the ids), area data as JSON, land data (Diamond's format) and
texture sets by number under res/field/mapmodels/, props by their name's place in map_prop_models.order, each prop drawn
with its area's prop texture set."""
import functools, json, os, urllib.request
from collections.abc import Mapping
from dp_data import land_chunk  # noqa: F401 (the same land data format)

BASE = 'https://raw.githubusercontent.com/pret/pokeplatinum/main/'
LAND_DATA = 'res/field/mapmodels/data/map_data_{:03d}.bin'
MAP_TEXTURES = 'res/field/mapmodels/texture_sets/map_texture_set_{:03d}.nsbtx'
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


class _Headers(Mapping):
    """The map headers by MAP_* constant, each read (its header.json, a download) only when it's asked for."""

    def __init__(self, cache):
        self.cache = cache
        names = [l.strip() for l in open(fetch(cache, 'generated/map_headers.txt'), encoding='utf-8') if l.strip()]
        self.ids = {'MAP_' + n.removeprefix('MAP_HEADER_'): i for i, n in enumerate(names)}
        self.read = {}

    def __getitem__(self, const):
        if const not in self.read:
            folder = const.removeprefix('MAP_').lower()
            h = json.load(open(fetch(self.cache, f'res/field/maps/{folder}/header.json'), encoding='utf-8'))
            self.read[const] = {'id': self.ids[const], 'area': int(h['areaData'].split('_')[-1]), 'matrix': _groups(self.cache)[h['mapGroup']], 'events': folder}
        return self.read[const]

    def __iter__(self):
        return iter(self.ids)

    def __len__(self):
        return len(self.ids)


def map_headers(cache):
    """MAP_* constant (MAP_HEADER_ without HEADER_) -> its header: id (its index), area data, matrix and events (its map's
    folder), each read when first asked for."""
    return _Headers(cache)


@functools.cache
def _groups(cache):
    """The matrices' ids by their group's id (groups.json's order)."""
    return {g['id']: i for i, g in enumerate(json.load(open(fetch(cache, 'res/field/maps/groups.json'), encoding='utf-8')))}


def matrix(cache, n):
    """A map matrix (groups.json's nth): its size, and for each cell its map header (or None), altitude and land data id."""
    d = json.load(open(fetch(cache, 'res/field/maps/groups.json'), encoding='utf-8'))[n]
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


# The facings as numbers, as Diamond's events have them (pokeplatinum's JSON names them).
DIRS = {'DIR_NORTH': 0, 'DIR_SOUTH': 1, 'DIR_WEST': 2, 'DIR_EAST': 3}


def events(cache, name):
    """A map's events (its folder's events.json): its people (`objects`: graphics, trainer, facing, 0-3 as Diamond's, and
    tile) and warps (tile, where to: a MAP_* constant and the warp there, by its name)."""
    d = json.load(open(fetch(cache, f'res/field/maps/{name}/events.json'), encoding='utf-8'))
    objects = [{'gfx': o['graphics_id'], 'trainer': o['trainer']['id'] if o['trainer_type'] != 'TRAINER_TYPE_NONE' else None,
                'face': DIRS.get(o['initial_dir'], o['initial_dir']), 'x': o['x'], 'z': o['z']} for o in d['object_events']]
    warps = [{'x': w['x'], 'z': w['z'], 'to': w['dest_header_id'].replace('MAP_HEADER_', 'MAP_'), 'warp': w['dest_warp_id']} for w in d['warp_events']]
    return {'objects': objects, 'warps': warps}
