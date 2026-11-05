"""Draws what FireRed draws over the people on its Kanto maps (its top background layer: a tree's top, a counter's near
edge, a sign's post) from a checkout of the pret/pokefirered decompilation, for the run maps' Kanto routes and the Idle
Adventure's Kanto maps alike (the user's: the treetops masking the player, as the Hoenn maps' overheads do): each map's
top layer (the second layer of each metatile whose layer type, attribute bits 29-30, is NORMAL or SPLIT, not COVERED:
render_route.py's `--overhead`), see-through elsewhere, as <picture>_overhead.png beside the map's picture, for

- every map in packages/idle/src/data/gen1/maps.ts (its `image`: public/routes/'s where the run maps draw it, else
  public/idle/gen1/maps/'s); kanto_areas.py gives a map with one its `top` (run it after this);
- every Kanto route of the run maps (packages/campaign/src/routes.ts's and kanto-routes.ts's Routes whose picture is a
  FireRed map's, Pewter Gym's pewter_gym.png PewterCity_Gym's), whose `overhead` line this writes (the Routes' other
  fields, and the user's fixes to them, left as they are, as kanto_grass.py writes their grass).

A map whose top layer is empty gets none (and loses one it had); a picture whose size isn't its map's is left out and
listed.

Usage: python tools/routes/kanto_overheads.py <pokefirered checkout>. Needs Pillow."""
import json, os, re, struct, sys
from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
PUB = os.path.join(ROOT, 'apps', 'web', 'public')
CAMPAIGN = os.path.join(ROOT, 'packages', 'campaign', 'src')
IDLE_MAPS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen1', 'maps.ts')
# Tilesets drawn with another's tiles and palettes (render_route.py's, kanto_areas.py's).
SHARED_GRAPHICS = {'silph_co': 'condominiums'}
# Run map pictures named otherwise than their map.
ALIASES = {'pewter_gym': 'PewterCity_Gym'}


def read(path):
    return open(os.path.join(SRC, path), encoding='utf8').read()


def snake(tileset):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', tileset.replace('gTileset_', '')).lower()


LAYOUTS = {l['id']: l for l in json.loads(read('data/layouts/layouts.json'))['layouts'] if 'id' in l}
MAP_NAMES = {d.lower(): d for d in os.listdir(os.path.join(SRC, 'data', 'maps')) if os.path.exists(os.path.join(SRC, 'data', 'maps', d, 'map.json'))}


def u16s(path):
    d = open(os.path.join(SRC, path), 'rb').read()
    return struct.unpack('<%dH' % (len(d) // 2), d)


def u32s(path):
    d = open(os.path.join(SRC, path), 'rb').read()
    return struct.unpack('<%dI' % (len(d) // 4), d)


def top_layer(name):
    """A map's top layer, RGBA (see-through where nothing's over the people), or None when it's empty."""
    layout = LAYOUTS[json.loads(read(f'data/maps/{name}/map.json'))['layout']]
    w, h = layout['width'], layout['height']
    blocks = u16s(layout['blockdata_filepath'])
    sets = []
    for kind, ts in (('primary', layout['primary_tileset']), ('secondary', layout['secondary_tileset'])):
        sets.append((f'data/tilesets/{kind}/{snake(ts)}', f'data/tilesets/{kind}/{SHARED_GRAPHICS.get(snake(ts), snake(ts))}'))

    def pal(p):
        lines = read(p).split()
        return [tuple(int(v) for v in lines[3 + i * 3: 6 + i * 3]) for i in range(int(lines[2]))]
    pals = [pal(f'{sets[0][1]}/palettes/%02d.pal' % i) for i in range(7)] + [pal(f'{sets[1][1]}/palettes/%02d.pal' % i) for i in range(7, 16)]

    def tiles(p):
        im = Image.open(os.path.join(SRC, p))
        px = im.load()
        return [[[px[tx * 8 + x, ty * 8 + y] & 15 for x in range(8)] for y in range(8)] for ty in range(im.size[1] // 8) for tx in range(im.size[0] // 8)]
    t = tiles(sets[0][1] + '/tiles.png')[:640] + tiles(sets[1][1] + '/tiles.png')
    meta_p, meta_s = u16s(sets[0][0] + '/metatiles.bin'), u16s(sets[1][0] + '/metatiles.bin')
    attr_p, attr_s = u32s(sets[0][0] + '/metatile_attributes.bin'), u32s(sets[1][0] + '/metatile_attributes.bin')
    img = Image.new('RGBA', (w * 16, h * 16), (0, 0, 0, 0))
    px = img.load()
    drawn = False
    for by in range(h):
        for bx in range(w):
            mid = blocks[by * w + bx] & 0x3FF
            attr = attr_p[mid] if mid < 640 else attr_s[mid - 640]
            # Over the people: the top layer of a NORMAL (0) or SPLIT (2) metatile (COVERED's two layers are both under them).
            if (attr >> 29) & 3 not in (0, 2):
                continue
            entries = meta_p[mid * 8: mid * 8 + 8] if mid < 640 else meta_s[(mid - 640) * 8: (mid - 640) * 8 + 8]
            for q in range(4):
                e = entries[4 + q]
                tile, hf, vf, p = e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1, (e >> 12) & 0xF
                tt = t[tile] if tile < len(t) else [[0] * 8] * 8
                ox, oy = bx * 16 + (q % 2) * 8, by * 16 + (q // 2) * 8
                for y in range(8):
                    row = tt[7 - y if vf else y]
                    for x in range(8):
                        v = row[7 - x if hf else x]
                        if v:
                            px[ox + x, oy + y] = (*pals[p][v], 255)
                            drawn = True
    return img if drawn else None


def write_overhead(name, picture, report):
    """The map's top layer beside its picture (public path), or none; its public path, or None."""
    path = os.path.join(PUB, picture.lstrip('/'))
    over = path[:-len('.png')] + '_overhead.png'
    top = top_layer(name)
    if top is not None and Image.open(path).size != top.size:
        report.append(f'{picture}: {Image.open(path).size} is not {name}\'s {top.size}')
        top = None
    if top is None:
        if os.path.exists(over):
            os.remove(over)
        return None
    top.save(over, optimize=True)
    return picture[:-len('.png')] + '_overhead.png'


def main():
    report = []
    done = {}
    # The Idle Adventure's Kanto maps (their pictures as maps.ts has them).
    for name, picture in re.findall(r"  (\w+): \{ name: '\w+', image: '([^']+)'", open(IDLE_MAPS, encoding='utf8').read()):
        if picture not in done:
            done[picture] = write_overhead(name, picture, report)
            print(name, picture, 'overhead' if done[picture] else '-')
    # The run maps' Kanto routes: each Route's picture, its `overhead` line after its `image` line.
    for file in ('routes.ts', 'kanto-routes.ts'):
        p = os.path.join(CAMPAIGN, file)
        text = open(p, encoding='utf8', newline='').read()
        nl = '\r\n' if '\r\n' in text else '\n'
        lines = text.split(nl)
        out = []
        for i, line in enumerate(lines):
            m = re.match(r"^  image: '(/routes/(\w+)\.png)',$", line)
            before = re.match(r"^  image: '/routes/(\w+)\.png',$", lines[i - 1]) if i else None
            if line.startswith("  overhead: ") and before and (before.group(1) in ALIASES or before.group(1) in MAP_NAMES):
                continue  # a Kanto route's old overhead line: written again with its image line
            out.append(line)
            if not m:
                continue
            stem = m.group(2)
            name = ALIASES.get(stem) or MAP_NAMES.get(stem)
            if not name:
                continue
            picture = m.group(1)
            if picture not in done:
                done[picture] = write_overhead(name, picture, report)
                print(name, picture, 'overhead' if done[picture] else '-')
            if done[picture]:
                out.append(f"  overhead: '{done[picture]}',")
        open(p, 'w', encoding='utf8', newline='').write(nl.join(out))
    print(sum(1 for v in done.values() if v), 'overheads of', len(done), 'maps')
    for r in report:
        print('  !', r)


if __name__ == '__main__':
    main()
