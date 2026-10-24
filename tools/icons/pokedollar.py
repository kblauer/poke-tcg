"""The run money's icon (apps/web/public/nav/pokedollar.png): the Pokédollar sign, a P with two strokes across its stem, as
a 32x32 pixel-art sprite in pokesprite's style (the other figures' icons): gold, lit from the top left, a dark outline.

    python tools/icons/pokedollar.py
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'apps/web/public/nav/pokedollar.png'

# The glyph, # filled (1 sprite pixel each), drawn in the middle of the canvas.
GLYPH = [
    '...##########...',
    '...###########..',
    '...###.....####.',
    '...###......###.',
    '...###......###.',
    '...###......###.',
    '...###.....####.',
    '...###########..',
    '...##########...',
    '...###..........',
    '#############...',
    '...###..........',
    '...###..........',
    '#############...',
    '...###..........',
    '...###..........',
    '...###..........',
]

OUTLINE = (56, 40, 8, 255)
LIGHT = (255, 240, 160, 255)
GOLD = (248, 200, 48, 255)
SHADE = (200, 136, 16, 255)


def main() -> None:
    size = 32
    h, w = len(GLYPH), len(GLYPH[0])
    ox, oy = (size - w) // 2, (size - h) // 2
    filled = {(ox + x, oy + y) for y, row in enumerate(GLYPH) for x, c in enumerate(row) if c == '#'}
    img = Image.new('RGBA', (size, size))
    # The outline: every empty pixel touching the glyph, corners too.
    for x, y in filled:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if (x + dx, y + dy) not in filled:
                    img.putpixel((x + dx, y + dy), OUTLINE)
    # The fill: lit where the glyph's edge faces up or left, shaded where it faces down or right.
    for x, y in filled:
        lit = (x, y - 1) not in filled or (x - 1, y) not in filled
        dark = (x, y + 1) not in filled or (x + 1, y) not in filled
        img.putpixel((x, y), SHADE if dark and not lit else LIGHT if lit and not dark else GOLD)
    img.save(OUT)


if __name__ == '__main__':
    main()
