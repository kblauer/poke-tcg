"""Makes the Idle Adventure's Town Map (README: Idle Adventure, Town Map) from a checkout of the pret/pokefirered
decompilation: FireRed's Kanto map as region_map.c draws it (graphics/region_map/kanto.bin over region_map.png, a 240x160
screen, cut to the map's 208x144 from (16, 16): apps/web/public/idle/gen1/town-map/kanto.png), the player's icons (Red's and Leaf's, red.png and leaf.png) and
packages/idle/src/data/gen1/town-map.ts: the map's places, each a map section (region_map_sections.json's name) with its
cells on the 22x15 grid of 8px cells at (32, 32) (region_map_layout_kanto.h, both layers: the map's and the dungeons')
and the run's areas there (AREAS' ids, from each area's maps' `region_map_section`). A town's are every town area on it
(Viridian City's two); a route's or dungeon's the first walk area with a map there (Route 4's is Route 3's; Pallet Town,
with no town area, Route 1's: its first leg walks it); an area off the main road on a section a main-road area has
(Route 21's tall grass) is that place's too. Gyms and the League's rooms are in their towns: no place.

Usage: python tools/idle/town_map.py <pokefirered checkout>. Needs Pillow; run after kanto_areas.py."""
import json, os, re, subprocess, sys
from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen1', 'town-map.ts')
OUT_PNG = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen1', 'town-map')
GRID_W, GRID_H = 22, 15
CROP = (16, 16, 224, 160)


def path(*p):
    return os.path.join(SRC, *p)


def jasc(name):
    lines = open(path('graphics', 'region_map', name), encoding='utf8').read().split('\n')
    return [tuple(int(v) for v in l.split()) for l in lines[3:] if l.strip()]


def tiles(png):
    """A 4bpp sheet's 8x8 tiles, each a list of 64 colour indices."""
    im = Image.open(png)
    w, h = im.size
    px = im.load()
    return [[px[tx * 8 + x, ty * 8 + y] for y in range(8) for x in range(8)] for ty in range(h // 8) for tx in range(w // 8)]


def draw_map():
    """kanto.bin (30x20 entries: tile, flips, palette) over region_map.png's tiles in region_map.pal's palettes."""
    sheet = tiles(path('graphics', 'region_map', 'region_map.png'))
    pal = jasc('region_map.pal')
    data = open(path('graphics', 'region_map', 'kanto.bin'), 'rb').read()
    im = Image.new('RGB', (240, 160), pal[0])
    out = im.load()
    for i in range(30 * 20):
        e = data[i * 2] | data[i * 2 + 1] << 8
        t, hf, vf, p = e & 0x3FF, e >> 10 & 1, e >> 11 & 1, e >> 12
        if t >= len(sheet):
            continue
        for y in range(8):
            for x in range(8):
                c = sheet[t][(7 - y if vf else y) * 8 + (7 - x if hf else x)] % 16
                if c:
                    out[(i % 30) * 8 + x, (i // 30) * 8 + y] = pal[p * 16 + c][:3]
    return im


def icon(name):
    """A player icon in its own palette, colour 0 clear."""
    im = Image.open(path('graphics', 'region_map', f'{name}.png'))
    pal = jasc(f'{name}.pal')
    rgba = Image.new('RGBA', im.size)
    src, out = im.load(), rgba.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            c = src[x, y]
            out[x, y] = (*pal[c][:3], 255) if c else (0, 0, 0, 0)
    return rgba


def quote(text):
    """A TypeScript string in single quotes (Diglett's Cave's apostrophe escaped)."""
    return "'" + text.replace('\\', '\\\\').replace("'", "\\'") + "'"


def layout():
    """The grid's sections, per layer: {'map': [[MAPSEC_…]], 'dungeon': …}."""
    text = open(path('src', 'data', 'region_map', 'region_map_layout_kanto.h'), encoding='utf8').read()
    out = {}
    for layer in ('map', 'dungeon'):
        body = text.split(f'[LAYER_{layer.upper()}] =')[1]
        rows = re.findall(r'\{(MAPSEC_[^}]*)\}', body)[:GRID_H]
        out[layer] = [[c.strip() for c in r.split(',')] for r in rows]
    return out


def areas():
    """AREAS as the idle package has them: id, kind and the maps each walks or stands on."""
    script = "import {AREAS} from './src/areas.ts'; console.log(JSON.stringify(AREAS.map((a) => ({id: a.id, kind: a.kind, opens: 'opens' in a ? a.opens : null, maps: 'legs' in a ? [...new Set(a.legs.flatMap((l) => l.maps))] : [a.map]}))))"
    return json.loads(subprocess.run(['npx', 'tsx', '-e', script], cwd=os.path.join(ROOT, 'packages', 'idle'), capture_output=True, text=True, shell=os.name == 'nt', check=True).stdout.strip().splitlines()[-1])


def main():
    os.makedirs(OUT_PNG, exist_ok=True)
    # Cut to the map (the rest of the screen is the menu's frame and bars): the grid's origin is (16, 16) in it.
    draw_map().crop(CROP).save(os.path.join(OUT_PNG, 'kanto.png'))
    icon('player_icon_red').save(os.path.join(OUT_PNG, 'red.png'))
    icon('player_icon_leaf').save(os.path.join(OUT_PNG, 'leaf.png'))

    names = {s['id']: s.get('name', '') for s in json.load(open(path('src', 'data', 'region_map', 'region_map_sections.json'), encoding='utf8'))['map_sections']}
    section = lambda m: json.load(open(path('data', 'maps', m, 'map.json'), encoding='utf8'))['region_map_section']
    town_sections = set()
    places = {}
    for a in areas():
        if a['kind'] in ('gym', 'league'):
            continue
        for m in a['maps']:
            sec = section(m)
            if a['kind'] == 'town':
                town_sections.add(sec)
                ids = places.setdefault(sec, [])
                if a['id'] not in ids:
                    ids.append(a['id'])
    for a in areas():
        if a['kind'] not in ('route', 'dungeon'):
            continue
        for m in a['maps']:
            sec = section(m)
            # A town's section is never a route's; Pallet Town, with no town area of its own, is Route 1's (walked on its
            # first leg: fished in from its shore, the user's).
            if sec in town_sections:
                continue
            if sec not in places:
                places[sec] = [a['id']]
            # An area off the main road on a main-road place's section (Route 21's tall grass): offered there too.
            elif a['opens'] and a['id'] not in places[sec]:
                places[sec].append(a['id'])

    grid = layout()
    cells = {}
    for layer, rows in grid.items():
        for y, row in enumerate(rows):
            for x, sec in enumerate(row):
                if sec in places:
                    cells.setdefault(sec, []).append((x, y, layer))
    missing = [s for s in places if s not in cells]
    if missing:
        sys.exit(f'Sections not on the map: {missing}')

    lines = [
        "// Generated by tools/idle/town_map.py from the pret/pokefirered decompilation. Don't edit by hand.",
        '',
        "import type { TownMapPlace } from '../../town-map.js';",
        '',
        'export const KANTO_TOWN_MAP_PLACES: TownMapPlace[] = [',
    ]
    for sec, ids in places.items():
        cs = ', '.join(f"[{x}, {y}, '{layer}']" for x, y, layer in cells[sec])
        lines.append(f"  {{ section: '{sec[len('MAPSEC_'):].lower()}', name: {quote(names[sec])}, areas: [{', '.join(quote(i) for i in ids)}], cells: [{cs}] }},")
    lines.append('];')
    open(OUT_TS, 'w', encoding='utf8', newline='\n').write('\n'.join(lines) + '\n')
    print(f'{len(places)} places')


main()
