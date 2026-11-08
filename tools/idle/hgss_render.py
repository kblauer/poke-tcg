"""Draws the HeartGold maps the Idle Adventure's Johto areas walk (README: Idle Adventure, Johto's maps; issue #170, step
4c) from a checkout of the pret/pokeheartgold decompilation: every map in packages/idle/src/data/gen2/maps.ts (written by
johto_areas.py), as the card runs draw HGSS's maps (tools/routes/hgss/hgss_map.py's `render`: its terrain chunks and
buildings converted with apicula and drawn tilted), on the same tile grid as the map's tiles (hgss_maps.py's cells, its
picture's top left their top left, PX a tile: 32, twice the card runs' and the DS's 16, so the 3D maps' textures keep
their detail at the game screen's scale, the user's; maps.ts's sizes stay in tiles, the page drawing a picture 16 game
pixels a tile), to apps/web/public/idle/gen2/maps/<map>.png, and a map's overhead
(its `bridges`' tiles alone: Goldenrod Gym's, drawn over the player under them) to <map>_overhead.png. The people, item balls,
Cut trees and Strength boulders are events, not in the land data, so they aren't drawn (the boulders left out, the user's).
A building's inside (MAP_TYPE_INTERIOR) draws with bm_room's buildings. Pictures already there are kept (--force draws
them again).

Every run also writes packages/idle/src/data/gen2/heights.ts (README: Idle Adventure, Johto's heights): the pictures
draw the ground at the height `ground` on the tile grid and anything higher or lower (its height less ground) x TILT
pixels further up or down at 16 a tile, so the page raises the sprites by the height the game stands them at, as HGSS
does: each map's `ground` (the one its picture is drawn with: hgss_map.py's ground_of, the same first cell's terrain
converted again) and each tile's walking height above it (its land chunks' BDHC: hgss_data.py's bdhc_heights), only for
the maps that aren't flat.

Usage: python tools/idle/hgss_render.py <pokeheartgold checkout> [--apicula <apicula.exe>] [--force] [MAP_CONST ...]"""
import json, os, re, shutil, sys, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hgss_maps as hm  # noqa: E402  (also puts tools/routes/hgss on the path)
import hgss_data as hd  # noqa: E402
import hgss_map  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen2', 'maps')
MAPS_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2', 'maps.ts')
HEIGHTS_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2', 'heights.ts')
# Pixels a tile in the pictures.
PX = 32
# The pictures' tilt (hgss_map.py's render's, render_hgss.py's Scene): a model unit higher is drawn TILT pixels further up
# at 16 pixels a tile (the page's game pixels).
TILT = 0.6
# heights.ts's tiles: a letter each, its height's index in the map's `levels`, a run of them the letter and how many
# ('a12b3': 12 tiles at the first, 3 at the second; one alone no number).
LEVEL_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
# Treetops drawn over the player (the user's: Johto's treetops masking him, as the Sinnoh maps' do: sinnoh_routes.py's
# `overhead`, its treetops, here at PX a tile): in each walkable tile within TREETOP_ROWS above an unwalkable one, or
# beside one, the leaves (green pixels) of what stands more than TREETOP_HIGH model units (a tile is 16) above the ground
# round it (the highest median height of the walkable tiles within 3, not themselves under treetops, that's no higher
# than the tile's own lower pixels); fewer than TREETOP_MIN of them in a tile, or pieces no wider than TREETOP_THIN, aren't
# a treetop (grass blades, a stem's tip). Only the green ones (the Sinnoh maps' USER_TREETOP_GREEN): roofs, fences, rocks
# and cliffs stand as high.
TREETOP_ROWS = 2
TREETOP_HIGH = 8
TREETOP_MIN = 24 * (PX // 16) ** 2
TREETOP_THIN = 4 * PX // 16


def thin(mask):
    """The pixels of `mask`'s pieces (8-connected) no more than TREETOP_THIN wide (sinnoh_routes.py's)."""
    out, seen = np.zeros_like(mask), np.zeros_like(mask)
    h, w = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        piece, todo = [], [(y0, x0)]
        seen[y0, x0] = True
        while todo:
            y, x = todo.pop()
            piece.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        todo.append((ny, nx))
        xs = [x for _, x in piece]
        if max(xs) - min(xs) + 1 <= TREETOP_THIN:
            for y, x in piece:
                out[y, x] = True
    return out


def treetops(img, rows, heights):
    """The map's treetops over the player (see-through elsewhere), or None."""
    src = np.asarray(img.convert('RGBA'))
    h, w = len(rows), len(rows[0])
    tile = lambda x, y: heights[y * PX:(y + 1) * PX, x * PX:(x + 1) * PX]
    tops = {(x, y - k) for y in range(1, h) for x in range(w) for k in range(1, TREETOP_ROWS + 1) if y - k >= 0 and rows[y - k][x] == '.' and rows[y][x] == '#'}
    sides = {(x + d, y) for y in range(h) for x in range(w) for d in (-1, 1) if 0 <= x + d < w and rows[y][x] == '#' and rows[y][x + d] == '.'}
    top = np.zeros(src.shape[:2], bool)
    for x, y in tops | sides:
        near = [np.nanmedian(tile(xx, yy)) for yy in range(max(0, y - 3), y + 1) for xx in range(max(0, x - 3), min(w, x + 4)) if rows[yy][xx] == '.' and (xx, yy) not in tops and not np.isnan(tile(xx, yy)).all()]
        if not near or np.isnan(tile(x, y)).all():
            continue
        own = np.nanpercentile(tile(x, y), 25)
        ground = max((g for g in near if g <= own + 2), default=min(near))
        r, g, b = (src[y * PX:(y + 1) * PX, x * PX:(x + 1) * PX, c].astype(int) for c in range(3))
        high = (tile(x, y) > ground + TREETOP_HIGH) & (g >= np.maximum(r, b) + 16) & (b < 100)
        if high.sum() >= TREETOP_MIN:
            top[y * PX:(y + 1) * PX, x * PX:(x + 1) * PX] |= high
    top &= ~thin(top)
    if not top.any():
        return None
    dst = np.zeros_like(src)
    dst[top] = src[top]
    return Image.fromarray(dst)


def ground(j, src, const, apicula):
    """The ground a map's picture is drawn with (hgss_map.py's render's: ground_of its first cell's terrain, converted
    with the map's textures as render converts it)."""
    first = j.cells(const)[0]
    work = tempfile.mkdtemp(prefix='hgss_ground_')
    try:
        model, tex = os.path.join(work, 'land.nsbmd'), os.path.join(work, 'tex.nsbtx')
        open(model, 'wb').write(hd.land_chunk(j.land()[first['land']])['model'])
        open(tex, 'wb').write(hd.narc(hd.fetch(src, hd.MAP_TEXTURES))[hd.area(src, hd.map_header(src, const)['area'])['textures']])
        return hgss_map.ground_of(hgss_map.convert(apicula, [model, tex], os.path.join(work, 'land')))
    finally:
        shutil.rmtree(work, ignore_errors=True)


def walking_heights(j, const, rows):
    """Each tile's walking height (model units), and the others of a tile with several (a bridge's and the path's under
    it): the BDHC heights at its centre (hgss_data.bdhc_heights); of several, the one nearest its neighbours' of its kind
    (land or water: the game takes the nearest to the person's own, coming from them; even, the higher, a bridge's); a
    tile with none, its nearest tile's (the game keeps a person's height there)."""
    cells = j.cells(const)
    x0, y0 = min(c['x'] for c in cells), min(c['y'] for c in cells)
    found = {}
    for c in cells:
        for (tx, ty), hs in hd.bdhc_heights(hd.land_chunk(j.land()[c['land']])['bdhc']).items():
            found[((c['x'] - x0) * hm.CHUNK + tx, (c['y'] - y0) * hm.CHUNK + ty)] = sorted({round(v, 1) for v in hs})
    h, w = len(rows), len(rows[0])
    kind = lambda x, y: 'w' if rows[y][x] == '~' else '#' if rows[y][x] == '#' else 'l'
    near = lambda x, y: [(x + dx, y + dy) for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)) if 0 <= x + dx < w and 0 <= y + dy < h]
    value = {t: hs[0] for t, hs in found.items() if max(hs) - min(hs) < 1}
    several = [t for t in found if t not in value]
    changed = True
    while changed:
        changed = False
        for x, y in several:
            if (x, y) in value or kind(x, y) == '#':
                continue
            by = [value[n] for n in near(x, y) if n in value and kind(*n) == kind(x, y)]
            if by:
                mean = sum(by) / len(by)
                value[(x, y)] = min(found[(x, y)], key=lambda v: (abs(v - mean), -v))
                changed = True
    for t in several:
        value.setdefault(t, max(found[t]))
    also = {t: [v for v in found[t] if abs(v - value[t]) >= 1] for t in several if kind(*t) != '#'}
    # The tiles no plate holds: their nearest's (a breadth-first fill from every tile with one).
    todo = list(value)
    while todo:
        nxt = []
        for x, y in todo:
            for n in near(x, y):
                if n not in value:
                    value[n] = value[(x, y)]
                    nxt.append(n)
        todo = nxt
    return value, also


def heights_entry(j, src, const, rows, apicula):
    """A map's heights.ts entry (MapHeights: `ground`, the heights above it as `levels`, `rows` of their indices in runs
    (LEVEL_CHARS), `also` a tile's others), or None for a flat one (every tile at its ground)."""
    value, also = walking_heights(j, const, rows)
    if not value:
        return None
    g = ground(j, src, const, apicula)
    h, w = len(rows), len(rows[0])
    # A tile whose ground is drawn off the picture (its foot, the tile's centre, raised off its top or lowered past its
    # bottom: Violet Gym's entrance, 480 units under the walkways its picture is drawn at) stays on its tile, as before.
    on = lambda y, r: 0 <= y + 0.5 - r * TILT / 16 <= h
    rise = {(x, y): round(v - g) if on(y, round(v - g)) else 0 for (x, y), v in value.items()}
    extra = sorted([x, y, round(v - g)] for (x, y), vs in also.items() for v in vs if round(v - g) != rise[(x, y)] and on(y, round(v - g)))
    if not extra and all(r == 0 for r in rise.values()):
        return None
    levels = sorted(set(rise.values()))
    assert len(levels) <= len(LEVEL_CHARS), (const, len(levels))
    index = {v: LEVEL_CHARS[i] for i, v in enumerate(levels)}
    runs = lambda row: ''.join(c + (str(len(run)) if len(run) > 1 else '') for run, c in re.findall(r'((.)\2*)', row))
    return {'ground': g, 'levels': levels, 'rows': [runs(''.join(index[rise[(x, y)]] for x in range(w))) for y in range(h)], **({'also': extra} if extra else {})}


def js(v):
    """A value as TypeScript (johto_areas.py's, for what heights.ts holds)."""
    if isinstance(v, str):
        return "'" + v + "'"
    if isinstance(v, (list, tuple)):
        return '[' + ', '.join(js(x) for x in v) + ']'
    if isinstance(v, dict):
        return '{ ' + ', '.join(k + ': ' + js(x) for k, x in v.items()) + ' }'
    return repr(v)


def write_heights(j, src, apicula, text):
    """heights.ts: every map of maps.ts that isn't flat, by its name."""
    out = {}
    for key, name in re.findall(r"^  (\w+): \{ name: '\w+', image: '/idle/gen2/maps/(\w+)\.png'", text, re.M):
        const = 'MAP_' + name.upper()
        e = heights_entry(j, src, const, j.tiles(const)['rows'], apicula)
        if e:
            out[key] = e
            print(const, 'ground', e['ground'], 'heights', e['levels'][0], 'to', e['levels'][-1])
    head = "// Generated by tools/idle/hgss_render.py from the pret/pokeheartgold decompilation. Don't edit by hand.\n"
    open(HEIGHTS_TS, 'w', encoding='utf8', newline='\n').write(
        head + "import type { MapHeights } from '../../areas.js';\n\n/** The walking heights of the HeartGold maps the Johto areas walk that aren't flat (maps.ts's, by name): the `ground` each map's picture is drawn with and its tiles' heights above it (MapHeights), the sprites raised by them as the pictures draw the ground (mapLift). */\nexport const JOHTO_HEIGHTS: Record<string, MapHeights> = {\n"
        + ''.join(f'  {k}: {js(v)},\n' for k, v in out.items()) + '};\n')
    print(len(out), 'maps with heights')


def main():
    args = sys.argv[1:]
    apicula = 'apicula'
    if '--apicula' in args:
        i = args.index('--apicula')
        apicula = args[i + 1]
        del args[i:i + 2]
    force = '--force' in args
    args = [a for a in args if a != '--force']
    src, only = os.path.abspath(args[0]), set(args[1:])
    j = hm.Johto(src)
    text = open(MAPS_TS, encoding='utf8').read()
    # Each map's picture and size, as maps.ts has them (its image's name is its MAP_ constant's, lower case).
    maps = [(m.group(1), int(m.group(2)), int(m.group(3))) for m in re.finditer(r"image: '/idle/gen2/maps/(\w+)\.png', width: (\d+), height: (\d+)", text)]
    os.makedirs(OUT, exist_ok=True)
    for name, w, h in maps:
        const = 'MAP_' + name.upper()
        out = os.path.join(OUT, name)
        if (only and const not in only) or (not force and os.path.exists(out + '.png')):
            continue
        cells = j.cells(const)
        room = j.header(const)['type'] == 'MAP_TYPE_INTERIOR'
        heights = os.path.join(tempfile.gettempdir(), name + '_height.npy')
        rows, _, _, cw, ch, _, _ = hgss_map.render(out, cells, hd.map_header(src, const), room, apicula, src, px=PX, heights=heights)
        assert (cw * hm.CHUNK, ch * hm.CHUNK) == (w, h), (const, cw, ch, w, h)
        # Its treetops over the player (<map>_top.png, maps.ts's `top`: johto_areas.py's, run again after this), outdoors.
        top = None if room else treetops(Image.open(out + '.png'), [''.join(r) for r in rows], np.load(heights))
        if top:
            top.save(out + '_top.png')
        elif os.path.exists(out + '_top.png'):
            os.remove(out + '_top.png')
        print(const, w, 'x', h)
    # The overheads (maps.ts's `bridges`, Goldenrod Gym's): those tiles of the picture alone, see-through elsewhere, drawn
    # over the player while he's under them (as the card runs' johto_gyms.py cuts them).
    for m in re.finditer(r"image: '/idle/gen2/maps/(\w+)\.png'[^\n]*?overhead: '[^']+', bridges: (\[[^\n]*?\]\])", text):
        name = m.group(1)
        if only and 'MAP_' + name.upper() not in only:
            continue
        im = Image.open(os.path.join(OUT, name + '.png')).convert('RGBA')
        top = Image.new('RGBA', im.size, (0, 0, 0, 0))
        for l, t, r, b in json.loads(m.group(2)):
            box = (l * PX, t * PX, (r + 1) * PX, (b + 1) * PX)
            top.paste(im.crop(box), box[:2])
        top.save(os.path.join(OUT, name + '_overhead.png'))
        print('MAP_' + name.upper(), 'overhead')
    # The heights the sprites stand at on the pictures (heights.ts), every map's.
    write_heights(j, src, apicula, text)


if __name__ == '__main__':
    main()
