"""Safari Draft's blank cards: one Base Set Basic Pokémon card of each type with its printed words painted out.

The Safari Draft's cards (apps/web's UnitCard) are drawn on these blanks, our own name, HP, artwork, attack and keyword laid
over them, so a card looks like its type's printed card but never shows the TCG text that doesn't apply (the user's,
2026-11-18). Gen 1's style first (the WOTC Base Set frame); later generations' styles get blanks of their own.

How: each type's card (CARDS) is fetched from TCGdex at 600 x 825; the regions holding words (measured on Base Set's Basic
Pokémon frame) are filled from the card's own background: the big ones row by row from the body's margins (AREA_REGIONS), the
words on something kept (the strip, the flavour text's box) by inpainting only their ink (INK_REGIONS), keeping the yellow border, the type's symbol, the artwork's frame, the strip under it and the
flavour text's box, which the screen fills.

Needs numpy, Pillow and opencv-python-headless (a venv: see the README's Python tools note).
Run from the repo's root: python tools/safari/blank_cards.py   (writes apps/web/public/safari/cards/<type>.webp)
"""
from __future__ import annotations

import io
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps' / 'web' / 'public' / 'safari' / 'cards'

# One Base Set Basic Pokémon card a type (TCGdex's image, base1/<number>): the frame is the same on each.
CARDS = {
    'grass': 44,  # Bulbasaur
    'fire': 46,  # Charmander
    'water': 63,  # Squirtle
    'lightning': 58,  # Pikachu
    'psychic': 43,  # Abra
    'fighting': 52,  # Machop
    'colorless': 57,  # Pidgey
}

W, H = 600, 825
# The body's inner margins, left and right, between the yellow border and anything printed: what each row's fill is made of.
LEFT, RIGHT = (23, 31), (569, 578)
# The regions holding words on Base Set's Basic Pokémon frame at 600 x 825 (x0, y0, x1, y1), filled row by row from the
# margins (the body's colour on either side, blended across, softened and grained like the print).
AREA_REGIONS = [
    (32, 24, 500, 86),  # "Basic Pokémon", the name and the HP
    (24, 436, 58, 482),  # the 1st Edition stamp's part off the strip
    (24, 474, 576, 737),  # the attacks (and a Pokémon Power), weakness, resistance and retreat with their line
]
# Regions where only the ink is painted out (its dark pixels, at full size), keeping what's printed under it.
INK_REGIONS = [
    (40, 82, 380, 96),  # the name's descenders, over the artwork's frame
    (52, 440, 512, 474),  # the strip's species, length and weight, and the stamp's part on it
    (52, 740, 550, 784),  # the flavour text in its box
    (22, 786, 580, 805),  # the illustrator, copyright, number and rarity
]


def fetch(number: int) -> np.ndarray:
    url = f'https://assets.tcgdex.net/en/base/base1/{number}/high.png'
    with urllib.request.urlopen(url) as r:
        im = Image.open(io.BytesIO(r.read())).convert('RGB')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)


def blank(card: np.ndarray) -> np.ndarray:
    out = card.astype(np.float32)
    rng = np.random.default_rng(239)
    for x0, y0, x1, y1 in AREA_REGIONS:
        rows = []
        for y in range(y0, y1):
            left = np.median(out[y, LEFT[0]:LEFT[1]], axis=0)
            right = np.median(out[y, RIGHT[0]:RIGHT[1]], axis=0)
            t = (np.arange(x0, x1) - LEFT[0]) / (RIGHT[1] - LEFT[0])
            rows.append(left[None, :] * (1 - t[:, None]) + right[None, :] * t[:, None])
        fill = np.stack(rows)
        fill = cv2.GaussianBlur(fill, (0, 0), 5)
        fill += rng.normal(0, 2.2, fill.shape)
        # Feathered into what's round it, so the fill has no edge.
        alpha = np.ones((y1 - y0, x1 - x0), np.float32)
        alpha = cv2.copyMakeBorder(alpha, 6, 6, 6, 6, cv2.BORDER_CONSTANT, value=0)
        alpha = cv2.GaussianBlur(alpha, (0, 0), 3)[6:-6, 6:-6][..., None]
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - alpha) + fill * alpha
    out = np.clip(out, 0, 255).astype(np.uint8)
    # The ink: dark pixels (the black words, the stamp, the rarity), grown a little for their antialiasing, filled at full size.
    gray = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    ink = np.zeros((H, W), np.uint8)
    for x0, y0, x1, y1 in INK_REGIONS:
        ink[y0:y1, x0:x1] = (gray[y0:y1, x0:x1] < 120).astype(np.uint8) * 255
    ink = cv2.dilate(ink, np.ones((5, 5), np.uint8))
    return cv2.inpaint(out, ink, 4, cv2.INPAINT_TELEA)


def border_mask(card: np.ndarray) -> np.ndarray:
    """The yellow outer border: the card's edge band, by its colour (bright yellow), joined to the edge."""
    hsv = cv2.cvtColor(card, cv2.COLOR_BGR2HSV)
    yellow = cv2.inRange(hsv, (18, 90, 170), (38, 255, 255))
    band = np.zeros_like(yellow)
    band[:26, :] = band[-18:, :] = 255
    band[:, :24] = band[:, -24:] = 255
    return cv2.bitwise_and(yellow, band)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for type_, number in CARDS.items():
        if only and type_ not in only:
            continue
        out = blank(fetch(number))
        Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).save(OUT / f'{type_}.webp', quality=90)
        print(f'{type_}: base1-{number} -> {OUT / (type_ + ".webp")}')


if __name__ == '__main__':
    main()
