"""Makes the Unova route maps' overworld sprites from Pokémon Black's (its overworld sprite archive, `a/0/4/9`: one NSBTX a
person, drawn by nsbtx.py with its own palette), as dp_sprites.py makes Diamond's, and writes
apps/web/src/utils/bwSprites.ts, which overworld.ts reads for the 'bw' sprite set.

Black's sheets: 12 frames of 32x32 (some 64x64), up, down, left and right, each stand, step, other step; a person who only
stands has the step frames as placeholders (an X), and their strip repeats the standing ones. Each becomes a strip of 12
frames as HGSS's (standing down, up, left, right, then two steps each: hgss_sprites.py's layout; overworld.ts's HGSS_WALK),
for public/overworld/bw/<name>.png. The players are Hilbert (6) and Hilda (9); a boss's picture (public/trainers/<boss>.png)
is their standing frame facing down, cropped.

Which sprite a person is: their zone event's sprite id is not the archive's number (the game maps them through a table in
its code), but for every id under 150 the archive's is the id plus 5 (checked: the gym leaders' 85-91 are Cilan to Brycen
at 90-96, the Elite Four's 93-96 Shauntal to Caitlin at 98-101, Alder's 97 at 102, the Gym Trainers' classes look as they
should). So each trainer class's sprite comes from Black's own trainers (every zone's events): its most common sprite, a
men's and a women's where its trainers are both (a class marked ♀, or listed twice, the later the women's). Sprites over 150 (Workers' 155, Drayden's
162) are named here by hand (BY_HAND), from the archive's pictures.

Usage: python bw_sprites.py [--cache <dir>]
Writes the strips to apps/web/public/overworld/bw/, the bosses to apps/web/public/trainers/, and bwSprites.ts."""
import collections, os, re, sys, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bw_data
import nsbtx
from PIL import Image, ImageChops

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OVERWORLD = os.path.join(REPO, 'apps', 'web', 'public', 'overworld', 'bw')
TRAINERS = os.path.join(REPO, 'apps', 'web', 'public', 'trainers')
OUT_TS = os.path.join(REPO, 'apps', 'web', 'src', 'utils', 'bwSprites.ts')
FRAME = 32
# The archive's number for an event's sprite id under OFFSET_BELOW.
OFFSET, OFFSET_BELOW = 5, 150
# Archive sheets named by hand: the players, Nurse Joy and the Poké Mart clerk (Nimbasa's Pokémon Center's people), the
# item ball, and the classes whose sprites are over 150 (Workers: the hard hat, Black's 64).
BY_HAND = {'hero': 6, 'heroine': 9, 'nurse': 83, 'clerk': 82, 'item_ball': 114, 'worker': 64}
# Each boss's sheet (event id + 5, but Drayden's: his event sprite is 162, the archive's white-bearded leader 160; Chili
# and Cress, Striaton's 179 and 178, the archive's 159 and 158).
BOSSES = {'cilan': 90, 'chili': 159, 'cress': 158, 'lenora': 91, 'burgh': 92, 'elesa': 93, 'clay': 94, 'skyla': 95, 'brycen': 96,
          'drayden': 160, 'shauntal': 98, 'grimsley': 99, 'marshal': 100, 'caitlin': 101, 'alder': 102}
# Black's sheets' frames (up, down, left, right; stand, step, other step) for HGSS's strip: standing down, up, left, right,
# then steps down, up, left, right.
STRIP = [3, 0, 6, 9, 4, 5, 1, 2, 7, 8, 10, 11]
# The gyms' zones (bw_data.py's `gyms`): their trainers' own sprites go in BW_TRAINER_SPRITES.
GYM_ZONES = [7, 18, 29, 63, 97, 108, 114, 121]


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def strip(frames):
    """A sheet's frames as a 12-frame strip; standing-only sheets (their step frames all the same placeholder) repeat
    their standing frames; a 9-frame sheet (Cilan's: up 2, down 2, left 3) faces right as its left, mirrored."""
    same = lambda a, b: ImageChops.difference(a, b).getbbox() is None
    if len(frames) >= 12:
        stands = [3, 0, 6, 9]
        steps = STRIP[4:] if not same(frames[1], frames[2]) or same(frames[0], frames[1]) else [3, 3, 0, 0, 6, 6, 9, 9]
        order = stands + steps
        pick = [frames[i] for i in order]
    elif len(frames) == 9:
        mirror = lambda i: frames[i].transpose(Image.FLIP_LEFT_RIGHT)
        pick = [frames[2], frames[0], frames[4], mirror(4), frames[3], frames[3], frames[1], frames[1], frames[5], frames[6], mirror(5), mirror(6)]
    else:
        pick = [frames[0]] * 12
    out = Image.new('RGBA', (FRAME * 12, FRAME), (0, 0, 0, 0))
    for k, f in enumerate(pick):
        if f.width > FRAME:  # a 64x64 sheet: its middle, feet on the bottom
            f = f.crop(((f.width - FRAME) // 2, f.height - FRAME, (f.width + FRAME) // 2, f.height))
        out.paste(f, (k * FRAME, FRAME - f.height), f)
    return out


def one(frames):
    """A single-frame sprite (the item ball), at the bottom of a 32x32 cell, repeated."""
    f = frames[0].crop(frames[0].getbbox())
    cell = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0)); cell.paste(f, ((FRAME - f.width) // 2, FRAME - f.height))
    out = Image.new('RGBA', (FRAME * 12, FRAME), (0, 0, 0, 0))
    for k in range(12):
        out.paste(cell, (k * FRAME, 0))
    return out


def trainer_sprites(g):
    """Black's trainers' sprites (archive numbers): by class and gender ({class: {'m': n, 'f': n}}) and by label."""
    by_class = collections.defaultdict(collections.Counter)
    by_label = {}
    classes = g.text('trainer_classes')
    for z in g.zones():
        for o in g.events(z['events'])['objects']:
            if 'trainer' not in o or o['sprite'] >= OFFSET_BELOW:
                continue
            cls_id = g.member('trainers', o['trainer'])[1]
            raw = classes[cls_id]
            # Women's classes: marked ♀ (the font's ⑮), or a class name listed twice, the later the women's (School Kid,
            # Ace Trainer, Pokémon Breeder…, men's first).
            gender = 'f' if '⑮' in raw or raw in classes[:cls_id] else 'm'
            t = g.trainer(o['trainer'])
            by_class[(t['class'], gender)][o['sprite'] + OFFSET] += 1
            by_label.setdefault(t['label'], o['sprite'] + OFFSET)
    out = collections.defaultdict(dict)
    for (cls, gender), counts in by_class.items():
        out[cls][gender] = counts.most_common(1)[0][0]
    return out, by_label


def main():
    args = sys.argv[1:]
    cache = args[args.index('--cache') + 1] if '--cache' in args else None
    g = bw_data.Game(cache)
    os.makedirs(OVERWORLD, exist_ok=True)
    classes, labels = trainer_sprites(g)
    # Every sheet to write, by name: by hand, then each class's (named for it, `_f` for its women's when they differ).
    names = dict(BY_HAND)
    class_names = {}
    for cls in sorted(classes):
        for gender, n in sorted(classes[cls].items()):
            name = slug(cls) + ('_f' if gender == 'f' and classes[cls].get('m') not in (None, n) else '')
            names.setdefault(name, n)
            class_names.setdefault(cls, {})[gender] = name
    by_number = {n: name for name, n in reversed(list(names.items()))}
    # The gyms' trainers' own sprites (a sheet no class gave a name is named for its trainer).
    gym_labels = {t['label'] for z in GYM_ZONES for t in g.zone_trainers(z)}
    label_names = {}
    for label, n in sorted(labels.items()):
        if label not in gym_labels:
            continue
        if n not in by_number:
            by_number[n] = slug(label)
            names[slug(label)] = n
        label_names[label] = by_number[n]
    for name, n in names.items():
        frames = nsbtx.frames(g.member('sprites', n))
        (one if name == 'item_ball' else strip)(frames).save(os.path.join(OVERWORLD, name + '.png'))
    for boss, n in BOSSES.items():
        frames = nsbtx.frames(g.member('sprites', n))
        f = frames[3 if len(frames) >= 12 else 2]
        f.crop(f.getbbox()).save(os.path.join(TRAINERS, boss + '.png'))
    ts = ['// Pokémon Black\'s overworld sprites for the Unova maps (the \'bw\' set, public/overworld/bw/<name>.png), by trainer class',
          '// and gender as Black\'s own trainers have them (their zone events), and the Unova Gym Trainers\' own. Written by',
          '// tools/routes/bw/bw_sprites.py: do not edit by hand.', '',
          '/** Each trainer class\'s sprite: its men\'s (`m`) and women\'s (`f`) where Black has both. */',
          'export const BW_CLASS_SPRITES: Record<string, { m?: string; f?: string }> = {']
    for cls in sorted(class_names):
        parts = ', '.join(f"{k}: '{v}'" for k, v in sorted(class_names[cls].items()))
        ts.append(f"  '{cls}': {{ {parts} }},")
    ts += ['};', '', '/** Black\'s trainers\' own sprites, by their label ("Waitress Tia"): the Unova Gym Trainers\' among them. */',
           'export const BW_TRAINER_SPRITES: Record<string, string> = {']
    ts += [f"  '{label}': '{name}'," for label, name in sorted(label_names.items()) if "'" not in label]
    ts += ['};', '']
    open(OUT_TS, 'w', encoding='utf-8', newline='\n').write('\n'.join(ts))
    print('wrote', len(names), 'sprites to', OVERWORLD, len(BOSSES), 'bosses to', TRAINERS, 'and', OUT_TS)


if __name__ == '__main__':
    main()
