"""Trims each condition icon to its visible shape and puts it, centred, on one square canvas of `size` px (the same
proportion of the canvas each), so every icon shows at one size. Also writes a contact sheet on a dark background."""
import sys
from PIL import Image

src, out, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
names = ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned']
fill = 0.94  # the shape's longer side, as a share of the canvas
made = []
for n in names:
    im = Image.open(f'{src}/{n}.png').convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    print(n, im.size, 'shape', bbox)
    shape = im.crop(bbox)
    side = round(size * fill)
    scale = side / max(shape.size)
    shape = shape.resize((max(1, round(shape.size[0] * scale)), max(1, round(shape.size[1] * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(shape, ((size - shape.size[0]) // 2, (size - shape.size[1]) // 2))
    canvas.save(f'{out}/{n}.png', optimize=True)
    made.append(canvas)
sheet = Image.new('RGBA', (len(made) * (size + 8) + 8, size + 16), (20, 24, 40, 255))
for i, m in enumerate(made):
    sheet.alpha_composite(m, (8 + i * (size + 8), 8))
sheet.resize((sheet.size[0] * 2, sheet.size[1] * 2), Image.NEAREST).save(f'{out}/../sheet.png')
