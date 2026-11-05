"""Makes the Idle Adventure's Johto Town Map (README: Idle Adventure, Town Map; issue #170, step 5) from a checkout of the
pret/pokeheartgold decompilation: the Pokégear's map app (src/application/pokegear/map/) as HeartGold draws it.

- The picture: the map is the 8bpp BG MAIN_3 (a 256-colour affine BG), pgmap_gra 11.NSCR over 10.png's tiles in the
  BG palette 20.NCLR (PokegearMap_LoadPalettes, frame 0: the default skin), laid out by ov101_021EAF40: the screen's
  47x20 tiles at (0, 0), then, at map unlock level 1 (sMapXScrollLimits' "Indigo Plateau": the run reaches it), its
  columns 54-56 over columns 29-31 (the edge that hides Route 22 and Kanto). The map's tile (x, y) is the Pokégear's grid
  cell (x, y) (8px, the player's matrix chunk; y already the matrix's + 2). The Pokégear's window shows 24x17 cells
  from (1, 1), scrolling right to column 29 at that level (ov101_021E9530, minXscroll 1, maxXscroll 29, maxYscroll 17):
  apps/web/public/idle/gen2/town-map/johto.png is cut to that, BG pixels (8, 8)-(240, 152), so the grid's cell (0, 0)
  is at (-8, -8) in it. All towns drawn as visited (no flypoint's grey patch), the Safari Zone's corner as shown once
  Goldenrod can be flown to, Sinjoh and the S.S. Aqua left off (shown only while the player is there).
- The player's icons: pgmap_gra's sprite set 1 (resdat 33/34/35: 2.NCER, 1.png, 0.NCLR), animation 1, its frame the
  player's gender (Sprite_SetAnimationFrame(PGMAP_SPRITE_PLAYER, playerGender)): cell 2 Ethan, cell 3 Lyra, 16x16 in
  the OAM's palette 15, centred on the cell's centre: ethan.png and lyra.png.
- packages/idle/src/data/gen2/town-map.ts: the places, each a map section (the header's MAPSEC_, as maps.ts has it) with
  the name the Pokégear shows (MapID_GetLandmarkName: msg_0279's line of that section), its cells (sLocationSpecs: each
  spec's x, y, width and height, a rectangle of cells, every spec of a map in that section; the game looks a cell up in
  the list's order, so a cell is the first spec's: the specs before the towns (MAP_PALLET), its caves and special
  places (Ice Path, Union Cave, National Park, Tohjo Falls, Victory Road…), are the 'dungeon' layer over the towns' and
  routes' 'map' layer) and the run's areas there (JOHTO_AREAS' ids, from each area's maps' sections in JOHTO_MAPS): a
  town's are every town area on it (Olivine City's two); a route's or dungeon's the first walk area with a map there
  (Route 31's is Route 30's; New Bark Town, with no town area, Route 29's: its first leg walks it); an area off the main
  road on a section a main-road area has is that place's too, and so is an area first on none of its sections (Routes 41
  and 40 walked back to Olivine City: its first section's). Gyms and the League's rooms are in their towns: no place.
  Only Johto's side: HGSS puts Routes 26 and 27, Victory Road and the Indigo Plateau at columns 22-28, east of New Bark
  Town (the Kanto side, Pokegear_RegionFromCoords' "Indigo" region), all inside the crop.

Usage: python tools/idle/johto_town_map.py <pokeheartgold checkout>. Needs Pillow; run after johto_areas.py."""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'extras'))
import nitro  # noqa: E402
from PIL import Image  # noqa: E402

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2', 'town-map.ts')
OUT_PNG = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen2', 'town-map')
GFX = os.path.join(SRC, 'files', 'application', 'pokegear', 'map', 'pgmap_gra')
FRAME = 0
# The window's cells at unlock level 1: columns 1-29, rows 1-18 (the frame's inside, 8px each).
CROP = (8, 8, 240, 152)
GRID_W, GRID_H = 30, 19


def gfx(n, ext):
    return os.path.join(GFX, f'pgmap_gra_{n:08d}.{ext}')


def png_tiles(n):
    """A sheet's 8x8 tiles in reading order, each 64 colour indices (the decompilation keeps NCGRs as indexed PNGs)."""
    im = Image.open(gfx(n, 'png'))
    w, h = im.size
    px = im.load()
    return [[px[tx * 8 + x, ty * 8 + y] for y in range(8) for x in range(8)] for ty in range(h // 8) for tx in range(w // 8)]


def draw_map():
    """BG MAIN_3 as ov101_021EAF40 lays it at unlock level 1, on the 512x512 affine BG (64 entries a row, no 256x256 blocks)."""
    tiles = png_tiles(10)
    pal = nitro.nclr(open(gfx(20 + FRAME, 'NCLR'), 'rb').read())
    pal += [(0, 0, 0, 255)] * (256 - len(pal))
    w, _, entries = nitro.nscr(open(gfx(11, 'NSCR'), 'rb').read())
    cols = w // 8
    bg = {}

    def copy(dx, dy, cw, ch, sx, sy):
        for j in range(ch):
            for i in range(cw):
                bg[dx + i, dy + j] = entries[(sy + j) * cols + sx + i]

    copy(0, 0, 47, 20, 0, 0)
    copy(29, 0, 3, 20, 54, 0)
    im = Image.new('RGBA', (47 * 8, 20 * 8), pal[0])
    for (x, y), (t, hf, vf, _) in bg.items():
        nitro.draw_tile(im, tiles[t], x * 8, y * 8, pal, hf, vf, False)
    return im


def icons():
    """The player's icons: animation 1's frames (Ethan's, Lyra's), each cell drawn in its OAM's own palette."""
    tiles = nitro.Tiles(4, png_tiles(1), 1, 0, 0, 0)
    cells = nitro.ncer(open(gfx(2, 'NCER'), 'rb').read())
    anims = nitro.nanr(open(gfx(3, 'NANR'), 'rb').read())
    pal = nitro.nclr(open(gfx(0, 'NCLR'), 'rb').read())
    return [nitro.draw_cell(cells, f['cell'], tiles, pal)[0] for f in anims[1].frames]


def quote(text):
    return "'" + text.replace('\\', '\\\\').replace("'", "\\'") + "'"


def section_key(const):
    """MAPSEC_NEW_BARK_TOWN -> 'new-bark-town', as hgss_maps.py keys maps.ts's sections."""
    return const[len('MAPSEC_'):].lower().replace('_', '-')


def read(*p):
    return open(os.path.join(SRC, *p), encoding='utf8').read()


def location_specs():
    """sLocationSpecs in its order: (map, x, y, width, height)."""
    body = read('src', 'application', 'pokegear', 'map', 'pokegear_map.c').split('sLocationSpecs[PGMAP_NUM_LOCATIONS] = {')[1]
    out = []
    for m in re.finditer(r'\{([^{}]*)\}', body):
        d = dict(re.findall(r'\.(\w+)\s*=\s*(\w+)', m.group(1)))
        if 'mapId' not in d:
            break
        out.append((d['mapId'], int(d['x']), int(d['y']), int(d['width']), int(d['height'])))
    return out


def areas():
    """JOHTO_AREAS as the idle package has them: id, kind, opens and the sections of the maps each walks or stands on."""
    script = ("import {JOHTO_AREAS} from './src/data/gen2/areas.ts'; import {JOHTO_MAPS} from './src/data/gen2/maps.ts'; "
              "console.log(JSON.stringify(JOHTO_AREAS.map((a) => ({id: a.id, kind: a.kind, opens: 'opens' in a ? a.opens : null, "
              "sections: ('legs' in a ? [...new Set(a.legs.flatMap((l) => l.maps))] : [a.map]).map((m) => JOHTO_MAPS[m].section)}))))")
    return json.loads(subprocess.run(['npx', 'tsx', '-e', script], cwd=os.path.join(ROOT, 'packages', 'idle'), capture_output=True, text=True, shell=os.name == 'nt', check=True).stdout.strip().splitlines()[-1])


def main():
    os.makedirs(OUT_PNG, exist_ok=True)
    draw_map().crop(CROP).save(os.path.join(OUT_PNG, 'johto.png'))
    ethan, lyra = icons()
    ethan.save(os.path.join(OUT_PNG, 'ethan.png'))
    lyra.save(os.path.join(OUT_PNG, 'lyra.png'))

    numbers = {c: int(n) for c, n in re.findall(r'#define\s+(MAPSEC_\w+)\s+(\d+)', read('include', 'constants', 'map_sections.h'))}
    names = [m['en_US'] for m in json.loads(read('files', 'msgdata', 'msg', 'msg_0279.json'))['messages']]
    mapsec = {}
    for m in re.finditer(r'\[(MAP_\w+)\]\s*=\s*\{(.*?)\n\s*\},', read('src', 'data', 'map_headers.h'), re.S):
        sec = re.search(r'\.mapsec\s*=\s*(MAPSEC_\w+)', m.group(2))
        if sec:
            mapsec[m.group(1)] = sec.group(1)

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
            # A town's section is never a route's; New Bark Town, with no town area of its own, is Route 29's.
            if sec in town_sections:
                continue
            if sec not in places:
                places[sec] = [a['id']]
            elif a['opens'] and a['id'] not in places[sec]:
                places[sec].append(a['id'])
        # An area first on none of its sections (Routes 41 and 40 walked back to Olivine: both Route 40's outward area's)
        # is its first section's too, so the run there has its place.
        if not any(a['id'] in places.get(sec, []) for sec in a['sections']):
            sec = next(s for s in a['sections'] if s not in town_sections)
            places[sec].append(a['id'])

    # Each cell is the first spec's that covers it, the specs before the towns on the dungeons' layer.
    specs = location_specs()
    first_town = next(i for i, s in enumerate(specs) if s[0] == 'MAP_PALLET')
    owner = {}
    for i, (m, x0, y0, w, h) in enumerate(specs):
        layer = 'dungeon' if i < first_town else 'map'
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                owner.setdefault((x, y, layer), mapsec[m])
    cells = {}
    for (x, y, layer), const in sorted(owner.items(), key=lambda c: (c[0][2] != 'map', c[0][1], c[0][0])):
        cells.setdefault(section_key(const), []).append((x, y, layer))
    missing = [s for s in places if s not in cells]
    if missing:
        sys.exit(f'Sections not on the map: {missing}')
    outside = [(s, c) for s in places for c in cells[s] if not (CROP[0] <= c[0] * 8 and c[0] * 8 + 8 <= CROP[2] and CROP[1] <= c[1] * 8 and c[1] * 8 + 8 <= CROP[3])]
    if outside:
        sys.exit(f'Cells outside the picture: {outside}')
    const_of = {section_key(c): c for c in numbers}

    lines = [
        "// Generated by tools/idle/johto_town_map.py from the pret/pokeheartgold decompilation. Don't edit by hand.",
        '',
        "import type { TownMapPlace } from '../../town-map.js';",
        '',
        '/** The Pokégear map\'s places: each section\'s cells from sLocationSpecs (8px cells, the player\'s matrix chunk), the caves and special places on the dungeons\' layer. */',
        'export const JOHTO_TOWN_MAP_PLACES: TownMapPlace[] = [',
    ]
    for sec, ids in places.items():
        cs = ', '.join(f"[{x}, {y}, '{layer}']" for x, y, layer in cells[sec])
        lines.append(f"  {{ section: '{sec}', name: {quote(names[numbers[const_of[sec]]])}, areas: [{', '.join(quote(i) for i in ids)}], cells: [{cs}] }},")
    lines.append('];')
    lines.append('')
    lines.append(f"/** public/idle/gen2/town-map/johto.png: the Pokégear's map (BG MAIN_3) at unlock level 1, cut to its window's reach, BG pixels ({CROP[0]}, {CROP[1]})-({CROP[2]}, {CROP[3]}): the grid's cell (0, 0) at ({-CROP[0]}, {-CROP[1]}) in it, 8px cells. */")
    lines.append(f"export const JOHTO_TOWN_MAP_GRID = {{ image: '/idle/gen2/town-map/johto.png', imageWidth: {CROP[2] - CROP[0]}, imageHeight: {CROP[3] - CROP[1]}, x: {-CROP[0]}, y: {-CROP[1]}, cell: 8, width: {GRID_W}, height: {GRID_H} }};")
    open(OUT_TS, 'w', encoding='utf8', newline='\n').write('\n'.join(lines) + '\n')
    print(f'{len(places)} places')


main()
