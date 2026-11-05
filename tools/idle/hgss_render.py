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

Usage: python tools/idle/hgss_render.py <pokeheartgold checkout> [--apicula <apicula.exe>] [--force] [MAP_CONST ...]"""
import json, os, re, sys, tempfile
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
# Pixels a tile in the pictures.
PX = 32
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


if __name__ == '__main__':
    main()
