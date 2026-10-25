"""Downloads a FireRed map's data from pret/pokefirered for render_route.py: its layout's map.bin, its map.json, the
metatile behaviour constants, and its primary and secondary tilesets (tiles, metatiles, attributes and palettes), into
<out>/ (p/ and s/ for the tilesets). Prints the layout's width and height, for render_route.py.
Usage: python fetch_map.py <MapName, as in data/maps/, e.g. Route4 or CeruleanCity_Gym> <out>"""
import json, os, re, sys, urllib.request

BASE = 'https://raw.githubusercontent.com/pret/pokefirered/master/'
name, out = sys.argv[1], sys.argv[2]


def get(path):
    with urllib.request.urlopen(BASE + path) as r:
        return r.read()


def save(path, data):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    open(path, 'wb').write(data)


# Tilesets drawn with another's tiles and palettes (src/data/tilesets/graphics.h: "Shared by SilphCo"), their own metatiles.
SHARED_GRAPHICS = {'silph_co': 'condominiums'}


def snake(tileset):
    """gTileset_CeruleanGym -> cerulean_gym (the tileset's folder under data/tilesets/)."""
    words = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', tileset.replace('gTileset_', ''))
    return words.lower()


os.makedirs(out, exist_ok=True)
map_json = get(f'data/maps/{name}/map.json')
save(os.path.join(out, 'map.json'), map_json)
layout_id = json.loads(map_json)['layout']
layout = next(l for l in json.loads(get('data/layouts/layouts.json'))['layouts'] if l.get('id') == layout_id)
save(os.path.join(out, 'map.bin'), get(layout['blockdata_filepath']))
save(os.path.join(out, 'behaviors.h'), get('include/constants/metatile_behaviors.h'))
for sub, kind, tileset in (('p', 'primary', layout['primary_tileset']), ('s', 'secondary', layout['secondary_tileset'])):
    folder = f'data/tilesets/{kind}/{snake(tileset)}'
    graphics = f'data/tilesets/{kind}/{SHARED_GRAPHICS.get(snake(tileset), snake(tileset))}'
    save(os.path.join(out, sub, 'tiles.png'), get(f'{graphics}/tiles.png'))
    for f in ('metatiles.bin', 'metatile_attributes.bin'):
        save(os.path.join(out, sub, f), get(f'{folder}/{f}'))
    for i in range(16):
        save(os.path.join(out, sub, '%02d.pal' % i), get(f'{graphics}/palettes/%02d.pal' % i))
print(layout['width'], layout['height'])
