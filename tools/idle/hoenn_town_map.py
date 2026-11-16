"""Makes the Idle Adventure's Hoenn Town Map (README: Idle Adventure, Town Map; issue #226, step 5) from a checkout of the
pret/pokeemerald decompilation: Emerald's region map as its Fly map draws it (src/region_map.c, CB2_OpenFlyMap), the
same map the PokéNav shows, here on the GBA's whole 240x160 screen as the game's other region maps are.

- The picture: BG2 (an 8bpp affine BG, 64x64 entries a byte each) is graphics/pokenav/region_map/map.bin over map.png's
  tiles, its colours map.pal loaded at BG palette 7 (LoadRegionMapGfx: LoadPalette(sRegionMapBg_Pal, BG_PLTT_ID(7))), so
  a pixel's index is map.pal's colour less 112; unzoomed it's scrolled to (0, 0). Over it BG1, the Fly map's frame
  (frame.bin over frame.png, in frame.png's palette). The screen, (0, 0)-(240, 160), is
  apps/web/public/idle/gen3/town-map/hoenn.png; the "FLY to where?" window and the fly destinations' icons are left off.
- The grid: region_map.c's MAP_WIDTH x MAP_HEIGHT cells (28x15) of 8px, the cursor's (x, y) from (MAPCURSOR_X_MIN,
  MAPCURSOR_Y_MIN) = (1, 2), so the grid's cell (0, 0) is at (8, 16) on the screen.
- The player's icons: graphics/pokenav/region_map/brendan_icon.png and may_icon.png (16x16, each in its own palette,
  colour 0 clear), centred on the cell's centre (CreateRegionMapPlayerIcon: x * 8 + 4): brendan.png and may.png.
- packages/idle/src/data/gen3/town-map.ts: the places, each a map section (the maps' MAPSEC_, as maps.ts has it) with
  Emerald's name for it (region_map_sections.json), its cells and the run's areas there (HOENN_AREAS' ids, from each
  area's maps' sections in HOENN_MAPS). The cells: a section on sRegionMap_MapSectionLayout (region_map_layout.h, the
  cursor's: the towns and routes) is on the map's layer, its every cell there; one the layout hasn't (the caves and
  woods: Petalburg Woods, Rusturf Tunnel, Fiery Path, Jagged Pass, Victory Road) on the dungeons' layer, at its
  region_map_sections.json entry's x, y, width and height (gRegionMapEntries, where the game puts the player's icon in
  it), or its second entry's when an earlier cave has that cell (Jagged Pass's JAGGED_PASS2, (7, 2), Fiery Path having
  (6, 3)), so each can be picked. A town's areas are every town area on it (Petalburg City's two); a route's or dungeon's the first walk area with
  a map there (Littleroot Town, with no town area, Route 101's: its first leg walks it); an area first on none of its
  sections (Route 104 walked back north to Rustboro) is its first section's too, so the run there has its place. Gyms
  and the League's rooms are in their towns: no place.

Usage: python tools/idle/hoenn_town_map.py <pokeemerald checkout>. Needs Pillow; run after hoenn_areas.py."""
import json, os, re, subprocess, sys
from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen3', 'town-map.ts')
OUT_PNG = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen3', 'town-map')
GFX = os.path.join(SRC, 'graphics', 'pokenav', 'region_map')
# region_map.c's MAP_WIDTH, MAP_HEIGHT, MAPCURSOR_X_MIN and MAPCURSOR_Y_MIN.
GRID_W, GRID_H = 28, 15
GRID_X, GRID_Y = 1, 2
SCREEN = (240, 160)
# BG_PLTT_ID(7): the map's colours start at palette entry 112.
MAP_PAL = 7 * 16


def jasc(path):
    lines = open(path, encoding='utf8').read().split('\n')
    return [tuple(int(v) for v in l.split()) for l in lines[3:] if l.strip()]


def tiles(png):
    """A sheet's 8x8 tiles in reading order, each 64 colour indices (the decompilation keeps them as indexed PNGs)."""
    im = Image.open(png)
    w, h = im.size
    px = im.load()
    return [[px[tx * 8 + x, ty * 8 + y] for y in range(8) for x in range(8)] for ty in range(h // 8) for tx in range(w // 8)]


def draw_map():
    """BG2 (map.bin, 64x64 one-byte entries: the affine BG's) at scroll (0, 0), then BG1 (the Fly map's frame) over it."""
    sheet = tiles(os.path.join(GFX, 'map.png'))
    pal = jasc(os.path.join(GFX, 'map.pal'))
    data = open(os.path.join(GFX, 'map.bin'), 'rb').read()
    im = Image.new('RGB', SCREEN, pal[0][:3])
    out = im.load()
    for i in range(64 * 64):
        tx, ty = i % 64, i // 64
        if tx * 8 >= SCREEN[0] or ty * 8 >= SCREEN[1] or data[i] >= len(sheet):
            continue
        for y in range(8):
            for x in range(8):
                c = sheet[data[i]][y * 8 + x]
                if c >= MAP_PAL:
                    out[tx * 8 + x, ty * 8 + y] = pal[c - MAP_PAL][:3]
    frame = Image.open(os.path.join(GFX, 'frame.png'))
    fpal = frame.getpalette()
    ftiles = tiles(os.path.join(GFX, 'frame.png'))
    fdata = open(os.path.join(GFX, 'frame.bin'), 'rb').read()
    for i in range(len(fdata) // 2):
        e = fdata[i * 2] | fdata[i * 2 + 1] << 8
        t, hf, vf = e & 0x3FF, e >> 10 & 1, e >> 11 & 1
        tx, ty = i % 32, i // 32
        if tx * 8 >= SCREEN[0] or ty * 8 >= SCREEN[1] or t >= len(ftiles):
            continue
        for y in range(8):
            for x in range(8):
                c = ftiles[t][(7 - y if vf else y) * 8 + (7 - x if hf else x)]
                if c:
                    out[tx * 8 + x, ty * 8 + y] = tuple(fpal[c * 3:c * 3 + 3])
    return im


def icon(name):
    """A player icon in its own palette, colour 0 clear."""
    im = Image.open(os.path.join(GFX, f'{name}_icon.png'))
    pal = im.getpalette()
    rgba = Image.new('RGBA', im.size)
    src, out = im.load(), rgba.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            c = src[x, y]
            out[x, y] = (*pal[c * 3:c * 3 + 3], 255) if c else (0, 0, 0, 0)
    return rgba


def quote(text):
    return "'" + text.replace('\\', '\\\\').replace("'", "\\'") + "'"


def layout():
    """sRegionMap_MapSectionLayout: the grid's sections by row, MAPSEC_ constants."""
    text = open(os.path.join(SRC, 'src', 'data', 'region_map', 'region_map_layout.h'), encoding='utf8').read()
    rows = re.findall(r'\{(MAPSEC_[^}]*)\}', text)[:GRID_H]
    return [[c.strip() for c in r.split(',')] for r in rows]


def areas():
    """HOENN_AREAS as the idle package has them: id, kind and the sections of the maps each walks or stands on."""
    script = ("import {HOENN_AREAS} from './src/data/gen3/areas.ts'; import {HOENN_MAPS} from './src/data/gen3/maps.ts'; "
              "console.log(JSON.stringify(HOENN_AREAS.map((a) => ({id: a.id, kind: a.kind, opens: 'opens' in a ? a.opens : null, "
              "sections: ('legs' in a ? [...new Set(a.legs.flatMap((l) => l.maps))] : [a.map]).map((m) => HOENN_MAPS[m].section)}))))")
    return json.loads(subprocess.run(['npx', 'tsx', '-e', script], cwd=os.path.join(ROOT, 'packages', 'idle'), capture_output=True, text=True, shell=os.name == 'nt', check=True).stdout.strip().splitlines()[-1])


def main():
    os.makedirs(OUT_PNG, exist_ok=True)
    draw_map().save(os.path.join(OUT_PNG, 'hoenn.png'))
    icon('brendan').save(os.path.join(OUT_PNG, 'brendan.png'))
    icon('may').save(os.path.join(OUT_PNG, 'may.png'))

    entries = {s['id'][len('MAPSEC_'):].lower(): s for s in json.load(open(os.path.join(SRC, 'src', 'data', 'region_map', 'region_map_sections.json'), encoding='utf8'))['map_sections']}
    town_sections = set()
    places = {}
    for a in areas():
        if a['kind'] == 'town':
            for sec in a['sections']:
                town_sections.add(sec)
                ids = places.setdefault(sec, [])
                if a['id'] not in ids:
                    ids.append(a['id'])
    for a in areas():
        if a['kind'] not in ('route', 'dungeon'):
            continue
        for sec in a['sections']:
            # A town's section is never a route's; Littleroot Town, with no town area of its own, is Route 101's.
            if sec in town_sections:
                continue
            if sec not in places:
                places[sec] = [a['id']]
            elif a['opens'] and a['id'] not in places[sec]:
                places[sec].append(a['id'])
        # An area first on none of its sections (Route 104 walked back north to Rustboro City) is its first section's
        # too, so the run there has its place.
        if not any(a['id'] in places.get(sec, []) for sec in a['sections']):
            sec = next(s for s in a['sections'] if s not in town_sections)
            places[sec].append(a['id'])

    # The layout's sections on the map's layer; the rest (the caves and woods) on the dungeons' at their entry's rectangle.
    cells = {}
    for y, row in enumerate(layout()):
        for x, const in enumerate(row):
            sec = const[len('MAPSEC_'):].lower()
            if sec in places:
                cells.setdefault(sec, []).append((x, y, 'map'))
    taken = set()
    for sec in places:
        if sec in cells:
            continue
        # A cave on a cell an earlier one has (Jagged Pass on Fiery Path's): its second entry's (MAPSEC_JAGGED_PASS2,
        # its upper end), so each has a cell of its own to be picked by.
        for e in (entries[sec], entries.get(sec + '2')):
            rect = e and 'x' in e and [(x, y, 'dungeon') for y in range(e['y'], e['y'] + e['height']) for x in range(e['x'], e['x'] + e['width'])]
            if rect and not taken.issuperset(rect):
                cells[sec] = rect
                taken.update(rect)
                break
    missing = [s for s in places if s not in cells]
    if missing:
        sys.exit(f'Sections not on the map: {missing}')

    lines = [
        "// Generated by tools/idle/hoenn_town_map.py from the pret/pokeemerald decompilation. Don't edit by hand.",
        '',
        "import type { TownMapPlace } from '../../town-map.js';",
        '',
        "/** Emerald's region map's places: the towns' and routes' cells from sRegionMap_MapSectionLayout, the caves' and woods' (on the dungeons' layer) from their gRegionMapEntries. */",
        'export const HOENN_TOWN_MAP_PLACES: TownMapPlace[] = [',
    ]
    for sec, ids in places.items():
        cs = ', '.join(f"[{x}, {y}, '{layer}']" for x, y, layer in cells[sec])
        lines.append(f"  {{ section: '{sec}', name: {quote(entries[sec]['name'])}, areas: [{', '.join(quote(i) for i in ids)}], cells: [{cs}] }},")
    lines.append('];')
    lines.append('')
    lines.append(f"/** public/idle/gen3/town-map/hoenn.png: the Fly map's screen ({SCREEN[0]}x{SCREEN[1]}: the map and its frame), its grid as region_map.c has it: {GRID_W}x{GRID_H} cells of 8px from ({GRID_X * 8}, {GRID_Y * 8}). */")
    lines.append(f"export const HOENN_TOWN_MAP_GRID = {{ image: '/idle/gen3/town-map/hoenn.png', imageWidth: {SCREEN[0]}, imageHeight: {SCREEN[1]}, x: {GRID_X * 8}, y: {GRID_Y * 8}, cell: 8, width: {GRID_W}, height: {GRID_H} }};")
    open(OUT_TS, 'w', encoding='utf8', newline='\n').write('\n'.join(lines) + '\n')
    print(f'{len(places)} places')


main()
