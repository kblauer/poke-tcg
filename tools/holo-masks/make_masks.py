"""Holo masks: keep the foil off the Pokémon in a holo's art window, so the Pokémon stands in front of it.

For each card, the art window of the TCGdex scan is cut out and run through a background-removal model (rembg); the
mask is opaque (foil) everywhere on the card but the Pokémon, which is transparent. The holo styles' art-window clip
still applies, so only the art window's background shines. Masks go to apps/web/public/holo-masks/<card id>.png, and
`--preview` also writes each scan with the foil area tinted, to check by eye.

Run with a Python that has rembg and Pillow (pip install "rembg[cpu]" pillow), from the repo root:
    python tools/holo-masks/make_masks.py base1-1 base1-2 ... [--preview DIR] [--model birefnet-massive]
"""
import argparse
import io
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageFilter
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/public/holo-masks'
SNAPSHOT = ROOT / 'packages/db/prisma/data/tcgdex-wotc.json'

# TCGdex scans are 600×825. The classic WOTC art window (wotc.css): x 63–541, y 97–428.
SIZE = (600, 825)
ART = (63, 97, 541, 428)


def scan(image_url: str) -> Image.Image:
    with urllib.request.urlopen(f'{image_url}/high.png') as r:
        return Image.open(io.BytesIO(r.read())).convert('RGB').resize(SIZE, Image.LANCZOS)


def pokemon_alpha(art: Image.Image, session) -> Image.Image:
    """The Pokémon in the art window: white where it is, black elsewhere, grown by a pixel so no foil fringes it."""
    alpha = remove(art, session=session, only_mask=True, post_process_mask=True).convert('L')
    return alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('ids', nargs='+')
    parser.add_argument('--preview')
    # Of rembg's models, BiRefNet massive cut the Base Set holos best (isnet-general-use and birefnet-general missed limbs
    # or kept shadows and backgrounds).
    parser.add_argument('--model', default='birefnet-massive')
    args = parser.parse_args()
    cards = {c['id']: c for c in json.loads(SNAPSHOT.read_text(encoding='utf-8'))['cards']}
    sessions = {}
    OUT.mkdir(parents=True, exist_ok=True)
    for arg in args.ids:
        # "<card id>:<model>" picks another model for that card (the default misjudges a few paintings).
        card_id, _, model = arg.partition(':')
        model = model or args.model
        sessions.setdefault(model, new_session(model))
        card = scan(cards[card_id]['image'])
        alpha = pokemon_alpha(card.crop(ART), sessions[model])
        foil = Image.new('L', SIZE, 255)
        foil.paste(alpha.point(lambda v: 255 - v), ART[:2])
        mask = Image.new('LA', SIZE, 255)
        mask.putalpha(foil)
        mask.save(OUT / f'{card_id}.png', optimize=True)
        if args.preview:
            tint = Image.new('RGB', SIZE, (255, 0, 255))
            window = Image.new('L', SIZE, 0)
            window.paste(255, ART)
            shown = Image.composite(Image.blend(card, tint, 0.55), card, Image.composite(foil, window, window))
            Path(args.preview).mkdir(parents=True, exist_ok=True)
            shown.save(Path(args.preview) / f'{card_id}.png')
        print(card_id, cards[card_id]['name'], model)


if __name__ == '__main__':
    main()
