"""The run's HP and EXP bars' pieces (apps/web/public/bars/), cut from The Spriters Resource's "Pokémon Black 2 and White 2 -
HP Bars" sheet (ripped by GameMaster12, no credit needed), which the site won't serve to scripts, so it's saved by hand:

    python tools/bars/bw_bars.py <sheet.png>

The tag is Black 2's white "HP" (the opponent's box), its outline and letters only, the box behind it left transparent. The fills are tiles of the strips under the boxes: an HP strip's 3 rows (dark, light, dark)
in green, yellow, red and empty (the EXP bar's fill is drawn in the theme's accent instead, StatusBox.tsx); the web app repeats them along a bar of
any width, inside the strips' 1-pixel #101010 border (HpBar.tsx) or the box's bars. The box is Black 2's player box (HP
and EXP), its bars emptied and its HP numbers' slash taken out (StatusBox.tsx).
"""
import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'apps/web/public/bars'


def tag(sheet: Image.Image, box: tuple[int, int, int, int], keep: set[tuple[int, int, int]]) -> Image.Image:
    """`box` of the sheet with every colour but `keep` (outline and letters) made transparent."""
    out = sheet.crop(box).convert('RGBA')
    out.putdata([p if p[:3] in keep else (0, 0, 0, 0) for p in out.getdata()])
    return out


def main(path: str) -> None:
    sheet = Image.open(path).convert('RGB')
    OUT.mkdir(parents=True, exist_ok=True)
    white, grey, black = (243, 243, 243), (154, 146, 154), (16, 16, 16)
    tag(sheet, (165, 47, 182, 54), {white, grey, black}).save(OUT / 'hp-tag.png')
    # The HP strips (50x5 with a border): a column of their inside, 1 wide and 3 tall.
    for name, x, y in [('empty', 12, 111), ('red', 63, 111), ('yellow', 12, 117), ('green', 63, 117)]:
        sheet.crop((x + 1, y + 1, x + 2, y + 4)).save(OUT / f'hp-{name}.png')
    # Black 2's player box (without the Lv. tag above it), its HP and EXP bars emptied (the web app draws the fills over
    # them, StatusBox.tsx): the HP bar's inside is 48x3 at (50, 2), the EXP bar's 80x2 at (26, 15).
    box = sheet.crop((12, 47, 124, 65)).convert('RGBA')
    bg = (124, 112, 57)
    box.putdata([(0, 0, 0, 0) if p[:3] == bg else p for p in box.getdata()])
    for y, colour in enumerate([grey, white, grey]):
        for x in range(50, 98):
            box.putpixel((x, 2 + y), colour + (255,))
    for y in (15, 16):
        for x in range(26, 106):
            box.putpixel((x, y), (grey if x % 2 == 0 else white) + (255,))
    # No HP numbers (the user's): the slash between them and its dark outline (within x 72 to 84, y 6 to 11) are the
    # box's checks again, #181818 where x + y is even and #303030 where it's odd.
    for y in range(6, 12):
        for x in range(72, 85):
            box.putpixel((x, y), (24, 24, 24, 255) if (x + y) % 2 == 0 else (48, 48, 48, 255))
    box.save(OUT / 'b2-box.png')
    # The "EXP" tag's letters as two masks, its dark blue and its light blue pixels, so the web app can colour them in the
    # theme's accent (StatusBox.tsx). Already 2x, as the box is drawn, since a browser smooths a mask it scales.
    for name, colour in [('dark', (0, 121, 154)), ('light', (0, 186, 243))]:
        mask = Image.new('RGBA', box.size)
        mask.putdata([(0, 0, 0, 255) if p[:3] == colour and p[3] else (0, 0, 0, 0) for p in box.getdata()])
        mask.resize((box.width * 2, box.height * 2), Image.NEAREST).save(OUT / f'b2-exp-{name}.png')


if __name__ == '__main__':
    main(sys.argv[1])
