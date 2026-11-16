"""Makes the Unova runs' foil card backs (as Pearl and Diamond for Sinnoh's, sinnoh_backs.py): the classic back
(apps/web/public/cardbacks/classic.jpg) with a foil over it (issue #231; my picks, to check with the user):

- Truth (the Unova Gym Challenge, after Reshiram's): pale flame plumes rising up the card, white and ice blue, screened
  over it so the logo stays clear;
- Ideals (Unova Champion, after Zekrom's): the back darkened towards black, with branching electric-blue bolts screened over it.

Usage: python unova_backs.py. Writes apps/web/public/cardbacks/truth.jpg and ideals.jpg (the classic back's size).
Needs numpy and Pillow."""
import os
import numpy as np
from PIL import Image
from sinnoh_backs import PUBLIC, screen


def truth(w, h):
    y, x = np.mgrid[0:h, 0:w].astype(float)
    # Plumes: columns of rising waves, their edges licking sideways as they climb.
    flick = np.sin(y / 23 + np.sin(x / 31) * 2.2) * 18
    plume = (np.sin((x + flick) / 26) + 1) / 2
    rise = np.clip(1 - y / h * 0.65, 0, 1)
    v = plume ** 3 * rise
    return np.stack([v * 0.78, v * 0.9, v * 1.0], axis=-1) * 0.8


def bolts(w, h, rng):
    """A few branching bolts (light 0-1): each a jagged path down the card, glowing round its line."""
    light = np.zeros((h, w))
    y, x = np.mgrid[0:h, 0:w].astype(float)

    def bolt(x0, y0, length, steps, width):
        px, py = x0, y0
        for _ in range(steps):
            nx, ny = px + rng.uniform(-length * 0.6, length * 0.6), py + length
            # Distance from each pixel to the segment.
            dx, dy = nx - px, ny - py
            t = np.clip(((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy), 0, 1)
            d = np.hypot(x - (px + t * dx), y - (py + t * dy))
            np.maximum(light, np.exp(-(d / width) ** 2), out=light)
            if rng.random() < 0.3:
                bolt(nx, ny, length * 0.6, 3, width * 0.6)
            px, py = nx, ny
    for k in range(3):
        bolt(w * (0.2 + 0.3 * k) + rng.uniform(-20, 20), -10, h / 9, 10, 3.2)
    return light


def ideals(back, w, h):
    rng = np.random.default_rng(5)
    dark = Image.fromarray((np.asarray(back, float) * 0.45).astype(np.uint8))
    v = bolts(w, h, rng)
    return screen(dark, np.stack([v * 0.45, v * 0.8, v * 1.0], axis=-1))


def main():
    back = Image.open(os.path.join(PUBLIC, 'cardbacks', 'classic.jpg')).convert('RGB')
    w, h = back.size
    screen(back, truth(w, h)).save(os.path.join(PUBLIC, 'cardbacks', 'truth.jpg'), quality=92)
    ideals(back, w, h).save(os.path.join(PUBLIC, 'cardbacks', 'ideals.jpg'), quality=92)
    print('wrote truth.jpg and ideals.jpg')


if __name__ == '__main__':
    main()
