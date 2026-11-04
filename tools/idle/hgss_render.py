"""Draws the HeartGold maps the Idle Adventure's Johto areas walk (README: Idle Adventure, Johto's maps; issue #170, step
4c) from a checkout of the pret/pokeheartgold decompilation: every map in packages/idle/src/data/gen2/maps.ts (written by
johto_areas.py), as the card runs draw HGSS's maps (tools/routes/hgss/hgss_map.py's `render`: its terrain chunks and
buildings converted with apicula and drawn tilted), on the same tile grid as the map's tiles (hgss_maps.py's cells, its
picture's top left their top left, 16 px a tile), to apps/web/public/idle/gen2/maps/<map>.png. The people, item balls,
Cut trees and Strength boulders are events, not in the land data, so they aren't drawn (the boulders left out, the user's).
A building's inside (MAP_TYPE_INTERIOR) draws with bm_room's buildings. Pictures already there are kept (--force draws
them again).

Usage: python tools/idle/hgss_render.py <pokeheartgold checkout> [--apicula <apicula.exe>] [--force] [MAP_CONST ...]"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hgss_maps as hm  # noqa: E402  (also puts tools/routes/hgss on the path)
import hgss_data as hd  # noqa: E402
import hgss_map  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen2', 'maps')
MAPS_TS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2', 'maps.ts')


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
        _, _, _, cw, ch, _, _ = hgss_map.render(out, cells, hd.map_header(src, const), room, apicula, src)
        assert (cw * hm.CHUNK, ch * hm.CHUNK) == (w, h), (const, cw, ch, w, h)
        print(const, w, 'x', h)


if __name__ == '__main__':
    main()
