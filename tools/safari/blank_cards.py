"""Safari Draft's blank cards: Base Set Pokémon cards of each type with their printed words painted out.

The Safari Draft's cards (apps/web's UnitCard) are drawn on these blanks, our own name, HP, artwork, attack and keyword laid
over them, so a card looks like its type's printed card but never shows the TCG text that doesn't apply (the user's,
2026-11-18). Gen 1's style first (the WOTC Base Set frame), in two frames a type: a Basic Pokémon's (`<type>.webp`) and an
evolved one's (`<type>-evolved.webp`: the Stage badge in the top left corner, with its window for the Pokémon it evolves
from, which the screen fills from the unit's own printed card). Later generations' styles get blanks of their own.

How: each card (CARDS) is fetched from TCGdex at 600 x 825. Inside the regions that hold words (REGIONS, measured on Base
Set's frames), only what stands out from the card's background is painted out: the words, the Energy symbols, the
Weakness and Resistance symbols, the stamp (pixels far from a wide median of the card, the print's own background), filled
by inpainting from round them. The background's own colour and texture stay as printed (the user's: no blur over the
text's space), as do the yellow border, the type's symbol, the artwork's frame, the strip under it, the flavour text's box
and the Stage badge.

Needs numpy, Pillow and opencv-python-headless (a venv: see the README's Python tools note).
Run from the repo's root: python tools/safari/blank_cards.py [types…]   (writes apps/web/public/safari/cards/)
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

# A Base Set card a type and frame (TCGdex's image, base1/<number>): the frames are the same on each. Darkness and Metal
# (issue #254: Gen 1-3's nine types) have no Base Set card: theirs are the Neo sets', the same frame (<series>/<set>/<number>).
CARDS = {
    # Bulbasaur, Charmander, Squirtle, Pikachu, Abra, Machop, Pidgey; Murkrow, Skarmory
    'basic': {'grass': 44, 'fire': 46, 'water': 63, 'lightning': 58, 'psychic': 43, 'fighting': 52, 'colorless': 57, 'darkness': 'neo/neo1/24', 'metal': 'neo/neo1/13'},
    # Ivysaur, Charmeleon, Wartortle, Raichu, Kadabra, Machoke, Pidgeotto; Umbreon, Steelix
    'evolved': {'grass': 30, 'fire': 24, 'water': 42, 'lightning': 14, 'psychic': 32, 'fighting': 34, 'colorless': 22, 'darkness': 'neo/neo2/13', 'metal': 'neo/neo1/15'},
}
SUFFIX = {'basic': '', 'evolved': '-evolved'}

W, H = 600, 825
# Regions (x0, y0, x1, y1 at 600 x 825) where whatever stands out from the background is painted out: words, symbols.
REGIONS = {
    'basic': [
        (36, 24, 380, 86),  # "Basic Pokémon" and the name
        (370, 44, 500, 86),  # the HP
        (24, 436, 58, 482),  # the 1st Edition stamp's part off the strip
        (24, 476, 576, 737),  # the attacks (and a Pokémon Power), weakness, resistance and retreat with their line
    ],
    'evolved': [
        (120, 22, 580, 44),  # "Evolves from …" and "Put … on the Basic Pokémon"
        (140, 46, 380, 86),  # the name
        (370, 44, 500, 86),  # the HP
        (24, 436, 58, 482),  # the 1st Edition stamp's part off the strip
        (24, 476, 576, 737),  # the attacks (and a Pokémon Power), weakness, resistance and retreat with their line
    ],
}
# Regions on something kept (the artwork's frame, the strip, the flavour text's box, the badge, the border's edge) where
# only the dark ink is painted out.
INK = {
    'basic': [(40, 84, 380, 98)],  # the name's descenders, over the artwork frame's top
    'evolved': [(140, 84, 380, 98), (50, 36, 114, 56)],  # the descenders; "STAGE 1" on the badge
}
LOWER_INK = [
    (52, 440, 520, 474),  # the strip's species, length and weight, and the stamp's part on it
    (52, 740, 550, 784),  # the flavour text in its box
    (22, 786, 580, 806),  # the illustrator, copyright, number and rarity
]
DARK = 110
# How far a pixel's colour must be from the background's to be painted out, and the background's median window (at a
# quarter of the size: 25 there is 100 here, wider than any word or symbol).
THRESHOLD = 34
WINDOW = 25


def fetch(number: int | str) -> np.ndarray:
    url = f'https://assets.tcgdex.net/en/{number if isinstance(number, str) else f"base/base1/{number}"}/high.png'
    with urllib.request.urlopen(url) as r:
        im = Image.open(io.BytesIO(r.read())).convert('RGB')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)


def blank(card: np.ndarray, frame: str) -> np.ndarray:
    # The print's background: a wide median, at a quarter of the size.
    small = cv2.resize(card, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    background = cv2.resize(cv2.medianBlur(small, WINDOW), (W, H), interpolation=cv2.INTER_LINEAR)
    differs = (np.abs(card.astype(np.int16) - background.astype(np.int16)).max(axis=2) > THRESHOLD).astype(np.uint8) * 255
    dark = (cv2.cvtColor(card, cv2.COLOR_BGR2GRAY) < DARK).astype(np.uint8) * 255
    mask = np.zeros((H, W), np.uint8)
    for x0, y0, x1, y1 in REGIONS[frame]:
        mask[y0:y1, x0:x1] = differs[y0:y1, x0:x1]
    for x0, y0, x1, y1 in INK[frame] + LOWER_INK:
        mask[y0:y1, x0:x1] |= dark[y0:y1, x0:x1]
    # Grown for the words' antialiasing and the symbols' outlines.
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    return cv2.inpaint(card, mask, 5, cv2.INPAINT_TELEA)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for frame, cards in CARDS.items():
        for type_, number in cards.items():
            if only and type_ not in only:
                continue
            out = blank(fetch(number), frame)
            path = OUT / f'{type_}{SUFFIX[frame]}.webp'
            Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).save(path, quality=90)
            print(f'{type_} ({frame}): {number} -> {path}')


if __name__ == '__main__':
    main()
