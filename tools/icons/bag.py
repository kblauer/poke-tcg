"""
The run map's Bag button's picture (MapBag, apps/web/src/components/run/RunDeckPanel.tsx): FireRed's bag as Leaf carries
it, open on its Key Items pocket (the user's pick: the sheet's fourth 64x64 frame, its flap up), cut from
pret/pokefirered's graphics/interface/bag_female.png in the game's palette (bag.pal; colour 0 clear), trimmed to the
bag, to apps/web/public/nav/bag.png.

    python tools/icons/bag.py

Needs Pillow; downloads the two files it needs.
"""

import os
import urllib.request

from PIL import Image

BASE = 'https://raw.githubusercontent.com/pret/pokefirered/master/graphics/interface/'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'web', 'public', 'nav', 'bag.png')
# The Key Items frame, the fourth of the sheet's 64x64 frames.
FRAME = 3


def fetch(name: str) -> bytes:
    with urllib.request.urlopen(BASE + name) as r:
        return r.read()


def main():
    import io

    sheet = Image.open(io.BytesIO(fetch('bag_female.png')))
    lines = fetch('bag.pal').decode().split('\n')
    palette = [int(v) for line in lines[3:19] for v in line.split()]
    sheet.putpalette(palette + [0] * (768 - len(palette)))
    frame = sheet.crop((0, FRAME * 64, 64, FRAME * 64 + 64))
    rgba = frame.convert('RGBA')
    src, px = frame.load(), rgba.load()
    for y in range(64):
        for x in range(64):
            if src[x, y] == 0:
                px[x, y] = (0, 0, 0, 0)
    rgba = rgba.crop(rgba.getbbox())
    rgba.save(os.path.normpath(OUT))
    print(f'{os.path.normpath(OUT)}: {rgba.size[0]}x{rgba.size[1]}')


if __name__ == '__main__':
    main()
