"""Who's That Pokémon?: a holo's Pokémon as a silhouette on the anime's screen, for a later Mystery event and Extras mode.

A holo mask (apps/web/public/holo-masks, made by tools/holo-masks) is opaque everywhere on the card but the Pokémon, so
the Pokémon's shape is the mask's transparent part inside the art window. It is painted the anime's dark blue with a
darker shadow below and right, and scaled into the burst on the left of template.png (the blank screen, 1920×1080).
Masks with no cut-out (the close-ups make_masks.py leaves foil all over) are skipped. Prints the card's id and name.

Run with a Python that has Pillow and numpy, from the repo root:
    python tools/whos-that/whos_that.py [--card ID] [--seed N] [--out FILE]
"""
import argparse
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MASKS = ROOT / 'apps/web/public/holo-masks'
SNAPSHOT = ROOT / 'packages/db/prisma/data/tcgdex-wotc.json'
TEMPLATE = Path(__file__).resolve().parent / 'template.png'

# The art windows of TCGdex's 600×825 scans, as make_masks.py's ART.
ART = {'wotc': (63, 97, 541, 428), 'ecard': (57, 103, 580, 400), 'ex': (46, 79, 554, 390)}
FILL = (36, 104, 164)
SHADOW = (20, 66, 112)


def era(card_id):
    return 'ecard' if card_id.startswith('ecard') else 'ex' if card_id.startswith('ex') else 'wotc'


def shape(path):
    """The Pokémon (the mask's transparent part) in the art window, as an L image, or None if there's no cut-out."""
    alpha = Image.open(path).convert('RGBA').getchannel('A').crop(ART[era(path.stem)])
    pokemon = 255 - np.asarray(alpha, dtype=np.uint8)
    if not 0.05 < (pokemon > 128).mean() < 0.75:
        return None
    return Image.fromarray(pokemon)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--card', help='a holo card id (default: one at random)')
    parser.add_argument('--seed', type=int, help='seed for the random pick')
    parser.add_argument('--out', default='whos-that-pokemon.png')
    args = parser.parse_args()

    paths = [MASKS / f'{args.card}.png'] if args.card else sorted(MASKS.glob('*.png'))
    random.Random(args.seed).shuffle(paths)
    path, sil = next(((p, s) for p in paths if (s := shape(p)) is not None), (None, None))
    if sil is None:
        raise SystemExit(f'No cut-out in {args.card}\'s mask' if args.card else 'No mask with a cut-out')
    names = {c['id']: c['name'] for c in json.load(open(SNAPSHOT, encoding='utf8'))['cards']}
    print(path.stem, names.get(path.stem, '?'))

    # Trim to the Pokémon, smooth the edge, scale into the burst.
    sil = sil.crop(sil.point(lambda v: 255 if v > 128 else 0).getbbox())
    sil = sil.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 255 if v > 128 else 0)
    bg = Image.open(TEMPLATE).convert('RGB')
    W, H = bg.size
    box_w, box_h, cx, cy = W * 0.40, H * 0.70, W * 0.29, H * 0.50
    scale = min(box_w / sil.width, box_h / sil.height)
    size = (round(sil.width * scale), round(sil.height * scale))
    sil = sil.resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1))
    x, y = round(cx - size[0] / 2), round(cy - size[1] / 2)

    off = round(H * 0.012)
    bg.paste(Image.new('RGB', size, SHADOW), (x + off, y + off), sil)
    bg.paste(Image.new('RGB', size, FILL), (x, y), sil)
    bg.save(args.out)
    print('saved', args.out)


if __name__ == '__main__':
    main()
