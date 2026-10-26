"""Holo masks: keep the foil off the Pokémon in a holo's art window, so the Pokémon stands in front of it.

For each card, the art window of the TCGdex scan is cut out and run through a background-removal model (rembg); the
mask is opaque (foil) everywhere on the card but the Pokémon, which is transparent. The holo styles' art-window clip
still applies, so only the art window's background shines. Masks go to apps/web/public/holo-masks/<card id>.png.

Cards: the ids given, and with --sets every holo Pokémon of those sets (TCGdex's holo flag, as the API's isHolo).
Each model's cut-out is cached (--cache), so trying another model on a card costs nothing for the rest.
--compare MODEL also cuts every card with a second model and writes report.csv to the preview folder: the share of the
art window that is Pokémon and how well the two models agree (IoU), with the cards worth a look flagged. --preview
writes each scan with the foil area tinted (and the second model's beside it), to check by eye.

Run with a Python that has rembg and Pillow (pip install "rembg[cpu]" pillow), from the repo root:
    python tools/holo-masks/make_masks.py --sets base1 base2 [ids...] --cache DIR [--preview DIR] [--compare MODEL]
"""
import argparse
import csv
import io
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/public/holo-masks'
SNAPSHOT = ROOT / 'packages/db/prisma/data/tcgdex-wotc.json'

# TCGdex scans are 600×825. The art windows (wotc.css): classic WOTC x 63–541, y 97–428; e-Card x 57–580, y 103–400;
# EX x 46–554, y 79–390.
SIZE = (600, 825)
ART = {'wotc': (63, 97, 541, 428), 'ecard': (57, 103, 580, 400), 'ex': (46, 79, 554, 390)}

# Holos TCGdex lists as normal only (TCGDEX_MISSING_HOLO in apps/api/src/cards.ts).
MISSING_HOLO = {'basep-13', 'basep-15'}

# Of rembg's models, BiRefNet massive cut the Base Set holos best (isnet-general-use and birefnet-general missed limbs
# or kept shadows and backgrounds). The cards another model cut better, picked by eye from the previews of the cards
# --compare birefnet-general flagged; 'none' where no model could cut the Pokémon out (close-ups and full-scene art
# that fill the window): the foil then covers the whole art window, as a classic holo's does.
MODEL = 'birefnet-massive'
GENERAL = [
    'base1-11', 'base1-12', 'base2-11', 'base3-11', 'base3-12', 'base4-13', 'base5-4', 'base5-7', 'base5-9', 'basep-24',
    'gym1-8', 'gym1-12', 'gym1-13', 'gym2-1', 'gym2-3', 'gym2-5', 'gym2-7', 'gym2-12', 'gym2-13',
    'neo1-2', 'neo1-5', 'neo1-9', 'neo2-12', 'neo2-16', 'neo4-2', 'neo4-3', 'neo4-5', 'neo4-6', 'neo4-14', 'neo4-111',
    'ecard1-1', 'ecard1-4', 'ecard1-6', 'ecard1-28', 'ecard1-29', 'ecard1-31', 'ecard3-147', 'ecard3-149',
]
NONE = ['gym2-6', 'gym2-10', 'neo4-1', 'neo4-110', 'ecard1-5', 'ecard1-9', 'ecard1-11', 'ecard1-14', 'ecard1-26', 'ecard2-148', 'ecard2-150']
# The EX sets' full-scene art made --compare flag over half their holos (237 of 425); each was picked by eye the same
# way. birefnet-general often kept limbs and bodies BiRefNet massive dropped, so it takes more of them than of the WOTC
# holos; 'none' for the close-ups and busy scenes neither could cut.
EX_GENERAL = [
    'ex1-1', 'ex1-3', 'ex1-5', 'ex1-8', 'ex1-10', 'ex1-12', 'ex1-13', 'ex1-99', 'ex1-100', 'ex1-102',
    'ex2-5', 'ex2-14', 'ex2-95', 'ex2-96', 'ex2-99', 'ex3-2', 'ex3-8', 'ex3-94', 'ex3-96',
    'ex4-6', 'ex4-7', 'ex4-9', 'ex4-10', 'ex4-12', 'ex4-92', 'ex4-93', 'ex4-94', 'ex4-95',
    'ex5-6', 'ex5-7', 'ex5-9', 'ex5-12', 'ex5-15', 'ex5-94', 'ex5-97',
    'ex6-5', 'ex6-6', 'ex6-7', 'ex6-10', 'ex6-12', 'ex6-14', 'ex6-32', 'ex6-107', 'ex6-109', 'ex6-114', 'ex6-115', 'ex6-116',
    'ex7-1', 'ex7-6', 'ex7-8', 'ex7-11', 'ex7-14', 'ex7-15', 'ex7-20', 'ex7-98', 'ex7-102',
    'ex8-4', 'ex8-6', 'ex8-10', 'ex8-11', 'ex8-12', 'ex8-13', 'ex8-102', 'ex8-104', 'ex8-107',
    'ex9-5', 'ex9-10', 'ex9-11', 'ex9-56', 'ex9-92', 'ex9-94', 'ex9-96', 'ex9-97',
    'ex10-5', 'ex10-6', 'ex10-9', 'ex10-19', 'ex10-103', 'ex10-104', 'ex10-106', 'ex10-110', 'ex10-112',
    'ex11-1', 'ex11-2', 'ex11-9', 'ex11-16', 'ex11-109', 'ex12-6', 'ex12-83', 'ex12-86', 'ex12-91', 'ex13-12', 'ex13-13', 'ex13-14',
    'ex14-6', 'ex14-8', 'ex14-9', 'ex14-13', 'ex14-89', 'ex14-92', 'ex14-97',
    'ex15-2', 'ex15-3', 'ex15-4', 'ex15-7', 'ex15-90', 'ex15-93', 'ex15-94', 'ex15-97', 'ex15-99', 'ex15-101',
    'ex16-1', 'ex16-2', 'ex16-4', 'ex16-5', 'ex16-6', 'ex16-9', 'ex16-11', 'ex16-14', 'ex16-100',
]
EX_NONE = [
    'ex5-11', 'ex5-14', 'ex5-95', 'ex5-98', 'ex8-5', 'ex8-8', 'ex8-9', 'ex8-16', 'ex9-3', 'ex9-91', 'ex9-99',
    'ex10-16', 'ex10-17', 'ex10-117', 'ex11-10', 'ex13-8', 'ex13-16', 'ex13-102', 'ex14-4', 'ex14-28', 'ex15-9', 'ex15-12',
]
OVERRIDES = {
    **{card_id: 'birefnet-general' for card_id in GENERAL + EX_GENERAL},
    **{card_id: 'u2net' for card_id in ['gym2-9', 'gym2-11']},
    **{card_id: 'none' for card_id in NONE + EX_NONE},
}


def art_window(card_id: str):
    return ART['ecard' if card_id.startswith('ecard') else 'ex' if re.match(r'ex\d', card_id) else 'wotc']


def scan(card: dict, cache: Path) -> Image.Image:
    path = cache / 'scans' / f"{card['id']}.png"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        # TCGdex sometimes answers 503 under load: a few tries, a little apart.
        for attempt in range(5):
            try:
                with urllib.request.urlopen(f"{card['image']}/high.png") as r:
                    data = r.read()
                break
            except urllib.error.HTTPError:
                if attempt == 4:
                    raise
                time.sleep(5 * (attempt + 1))
        Image.open(io.BytesIO(data)).convert('RGB').resize(SIZE, Image.LANCZOS).save(path)
    return Image.open(path).convert('RGB')


def pokemon_alpha(card: dict, model: str, sessions: dict, cache: Path) -> Image.Image:
    """The Pokémon in the art window as the model sees it: white where it is, black elsewhere (cached; 'none': nowhere)."""
    if model == 'none':
        box = art_window(card['id'])
        return Image.new('L', (box[2] - box[0], box[3] - box[1]), 0)
    path = cache / model / f"{card['id']}.png"
    if not path.exists():
        sessions.setdefault(model, new_session(model))
        art = scan(card, cache).crop(art_window(card['id']))
        path.parent.mkdir(parents=True, exist_ok=True)
        remove(art, session=sessions[model], only_mask=True, post_process_mask=True).convert('L').save(path)
    return Image.open(path).convert('L')


def foil_mask(card_id: str, alpha: Image.Image) -> Image.Image:
    """Opaque everywhere but the Pokémon, grown by a pixel so no foil fringes it."""
    pokemon = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    foil = Image.new('L', SIZE, 255)
    foil.paste(pokemon.point(lambda v: 255 - v), art_window(card_id)[:2])
    return foil


def preview(card: Image.Image, card_id: str, foil: Image.Image) -> Image.Image:
    """The art window with the foil area tinted."""
    box = art_window(card_id)
    tinted = Image.blend(card, Image.new('RGB', SIZE, (255, 0, 255)), 0.55)
    return Image.composite(tinted, card, foil).crop(box)


def area_and_iou(a: Image.Image, b: Image.Image):
    """The share of the art window that model a calls Pokémon, and how much a and b agree (intersection over union)."""
    a = a.point(lambda v: 255 if v > 127 else 0)
    b = b.point(lambda v: 255 if v > 127 else 0)
    count = lambda im: im.histogram()[255]
    union = count(ImageChops.lighter(a, b))
    return count(a) / (a.width * a.height), (count(ImageChops.darker(a, b)) / union if union else 1.0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('ids', nargs='*')
    parser.add_argument('--sets', nargs='*', default=[])
    parser.add_argument('--cache', required=True)
    parser.add_argument('--preview')
    parser.add_argument('--compare')
    args = parser.parse_args()
    snapshot = json.loads(SNAPSHOT.read_text(encoding='utf-8'))['cards']
    cards = {c['id']: c for c in snapshot}
    holos = [c['id'] for c in snapshot if c['set']['id'] in args.sets and c['category'] == 'Pokemon' and ((c.get('variants') or {}).get('holo') or c['id'] in MISSING_HOLO)]
    ids = holos + [i for i in args.ids if i not in holos]
    cache, sessions, rows = Path(args.cache), {}, []
    OUT.mkdir(parents=True, exist_ok=True)
    for card_id in ids:
        card = cards[card_id]
        model = OVERRIDES.get(card_id, MODEL)
        alpha = pokemon_alpha(card, model, sessions, cache)
        foil = foil_mask(card_id, alpha)
        mask = Image.new('LA', SIZE, 255)
        mask.putalpha(foil)
        mask.save(OUT / f'{card_id}.png', optimize=True)
        row = {'id': card_id, 'name': card['name'], 'model': model}
        shown = [preview(scan(card, cache), card_id, foil)] if args.preview else []
        if args.compare:
            other = pokemon_alpha(card, args.compare, sessions, cache)
            area, iou = area_and_iou(alpha, other)
            row.update(area=round(area, 3), iou=round(iou, 3), flag='yes' if iou < 0.9 or area < 0.08 or area > 0.8 else '')
            if args.preview:
                shown.append(preview(scan(card, cache), card_id, foil_mask(card_id, other)))
        if shown:
            sheet = Image.new('RGB', (sum(im.width for im in shown), shown[0].height), 'white')
            for i, im in enumerate(shown):
                sheet.paste(im, (i * shown[0].width, 0))
            Path(args.preview).mkdir(parents=True, exist_ok=True)
            sheet.save(Path(args.preview) / f'{card_id}.png')
        rows.append(row)
        print(*row.values(), flush=True)
    if args.compare and args.preview:
        with open(Path(args.preview) / 'report.csv', 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)


if __name__ == '__main__':
    main()
