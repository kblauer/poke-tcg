"""Makes the Sinnoh runs' foil card backs (as Maze and Tidal for Hoenn's): the classic back
(apps/web/public/cardbacks/classic.jpg) with a foil laid over it, its light lightening the card ("screen") so the logo
stays clear:

- Pearl (the Sinnoh Gym Challenge): a pearlescent sheen, soft bands of pink and blue running diagonally across the card;
- Diamond (Sinnoh Champion): a diamond-cut lattice of pale blue lines, with small four-pointed sparkles where they cross.

Usage: python sinnoh_backs.py. Writes apps/web/public/cardbacks/pearl.jpg and diamond.jpg (the classic back's size).
Needs numpy and Pillow."""
import os
import numpy as np
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(HERE, '..', '..', 'apps', 'web', 'public'))


def screen(back, light):
    """`light` (RGB floats 0-1, the card's size) screened over `back`."""
    return ImageChops.screen(back, Image.fromarray((np.clip(light, 0, 1) * 255).astype(np.uint8)))


def pearl(w, h):
    y, x = np.mgrid[0:h, 0:w].astype(float)
    t = (x * 0.8 + y) / 140
    # Two hues drifting against each other: pink and pale blue, with a little white where they meet.
    pink = (np.sin(t) + 1) / 2
    blue = (np.sin(t * 1.3 + 2) + 1) / 2
    light = np.zeros((h, w, 3))
    light[..., 0] = 0.45 * pink + 0.15 * blue
    light[..., 1] = 0.25 * pink + 0.30 * blue
    light[..., 2] = 0.35 * pink + 0.45 * blue
    return light * 0.75


def diamond(w, h):
    y, x = np.mgrid[0:h, 0:w].astype(float)
    size = 46
    # Distance to the nearest line of two diagonal families: a lattice of diamonds.
    a = np.abs(((x + y) % size) - size / 2)
    b = np.abs(((x - y) % size) - size / 2)
    lines = np.clip(1 - np.minimum(a, b) / 1.6, 0, 1)
    # Sparkles at the crossings: a bright core and four short rays.
    cx = ((x + y) % size - size / 2)
    cy = ((x - y) % size - size / 2)
    core = np.exp(-(cx ** 2 + cy ** 2) / 6)
    rays = np.exp(-np.abs(cx) / 1.2) * np.exp(-np.abs(cy) / 7) + np.exp(-np.abs(cy) / 1.2) * np.exp(-np.abs(cx) / 7)
    glint = np.clip(core + 0.5 * rays, 0, 1)
    v = 0.38 * lines + 0.8 * glint
    light = np.stack([v * 0.75, v * 0.88, v * 1.0], axis=-1)
    return light


def main():
    back = Image.open(os.path.join(PUBLIC, 'cardbacks', 'classic.jpg')).convert('RGB')
    w, h = back.size
    screen(back, pearl(w, h)).save(os.path.join(PUBLIC, 'cardbacks', 'pearl.jpg'), quality=92)
    screen(back, diamond(w, h)).save(os.path.join(PUBLIC, 'cardbacks', 'diamond.jpg'), quality=92)
    print('wrote pearl.jpg and diamond.jpg')


if __name__ == '__main__':
    main()
