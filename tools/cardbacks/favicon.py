"""Makes the site's favicon: the Poké Ball from the middle of the classic card back (apps/web/public/cardbacks/classic.jpg),
cut out round with a soft edge. The ball's circle was fitted to the back (through the top of its red cap and the cap's
widest row: centre 338, 446.4, radius 146.4) and is cut 2px inside it, so none of the swirl behind it shows.

Usage: python favicon.py. Writes apps/web/public/favicon.ico (16, 32 and 48px), favicon-192.png and apple-touch-icon.png
(180px, on the app's slate-950, as iOS fills transparency with black). Needs Pillow."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(HERE, '..', '..', 'apps', 'web', 'public'))

CX, CY, R = 338.0, 446.4, 144.4


def main():
    src = Image.open(os.path.join(PUBLIC, 'cardbacks', 'classic.jpg')).convert('RGBA')
    ball = src.crop((round(CX - R), round(CY - R), round(CX + R), round(CY + R)))
    size = ball.size[0]
    # An antialiased round mask, drawn 4x and scaled down.
    big = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    ball.putalpha(big.resize(ball.size, Image.LANCZOS))

    ball.save(os.path.join(PUBLIC, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    ball.resize((192, 192), Image.LANCZOS).save(os.path.join(PUBLIC, 'favicon-192.png'), optimize=True)
    touch = Image.new('RGBA', (180, 180), (2, 6, 23, 255))
    touch.alpha_composite(ball.resize((150, 150), Image.LANCZOS), (15, 15))
    touch.convert('RGB').save(os.path.join(PUBLIC, 'apple-touch-icon.png'), optimize=True)


if __name__ == '__main__':
    main()
