"""Makes the Sinnoh route maps' overworld sprites from Diamond/Pearl's (the pret/pokediamond decompilation's data/mmodel
NSBTX files, converted to PNGs with apicula), as hgss_sprites.py makes HeartGold/SoulSilver's: Diamond's sheets are laid
out as HGSS's (16 frames, 32x32: up, down, left and right, each stand, step, stand, other step), so each becomes a strip
of 12 frames for public/overworld/dp/ (hgss_sprites.py's WALK order), or for a boss their standing frame facing down,
cropped, for public/trainers/. Sprites are named by their texture (Diamond's own names: `fighter`, `leader1`…), found by
converting every mmodel file once.

Usage: python dp_sprites.py [--apicula <apicula.exe>] [--cache <dir>]
Writes SPRITES to apps/web/public/overworld/dp/<name>.png and BOSSES to apps/web/public/trainers/<boss id>.png."""
import os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'hgss'))
import dp_data as dd
from PIL import Image
from hgss_sprites import FRAME, WALK

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OVERWORLD = os.path.join(REPO, 'apps', 'web', 'public', 'overworld', 'dp')
TRAINERS = os.path.join(REPO, 'apps', 'web', 'public', 'trainers')
MMODEL = 'files/data/mmodel/mmodel'

# The map sprites (overworld.ts's names: Diamond's texture names), each a 12-frame walking strip; `one`: a single frame
# (the item ball), padded to 32x32 at the bottom and repeated.
SPRITES = {
    # The players, Lucas and Dawn.
    'hero': 'walk', 'heroine': 'walk',
    'monstarball': 'one',
    # The trainer classes (Diamond's own sprite for each, from its trainers' map events) and the encounters' people.
    'boy1': 'walk', 'boy2': 'walk', 'boy3': 'walk', 'girl1': 'walk', 'girl2': 'walk', 'girl3': 'walk', 'man1': 'walk', 'man2': 'walk',
    'man3': 'walk', 'man5': 'walk', 'woman1': 'walk', 'woman2': 'walk', 'woman3': 'walk', 'woman5': 'walk', 'middleman1': 'walk',
    'middlewoman1': 'walk', 'oldman1': 'walk', 'bigman': 'walk', 'mount': 'walk', 'shopm1': 'walk', 'pcwoman1': 'walk',
    'assistantm': 'walk', 'badman': 'walk', 'skierm': 'walk', 'skierw': 'walk', 'gentleman': 'walk', 'cyclem': 'walk', 'cyclew': 'walk',
    'workman': 'walk', 'clown': 'walk', 'swimmerm': 'walk', 'swimmerw': 'walk', 'beachgirl': 'walk', 'beachboy': 'walk', 'explore': 'walk',
    'fighter': 'walk', 'campboy': 'walk', 'picnicgirl': 'walk', 'fishing': 'walk', 'seaman': 'walk', 'gorggeousm': 'walk',
    'gorggeousw': 'walk', 'mystery': 'walk', 'pikachu': 'walk', 'gingam': 'walk', 'gingaw': 'walk', 'sunglasses': 'walk',
}
# Each boss's standing frame (their own overworld sprite in Diamond: leader1 to leader8 in the order of the gyms' map
# events, bigfour1 to bigfour4 and champion).
BOSSES = {
    'roark': 'leader1', 'gardenia': 'leader2', 'crasher-wake': 'leader3', 'maylene': 'leader4', 'fantina': 'leader5',
    'candice': 'leader6', 'byron': 'leader7', 'volkner': 'leader8',
    'aaron': 'bigfour1', 'bertha': 'bigfour2', 'flint': 'bigfour3', 'lucian': 'bigfour4', 'cynthia': 'champion',
}


def textures(apicula, cache, work):
    """Every mmodel file's converted frames, by texture name: [frame images, in order]."""
    out = {}
    for n in range(500):
        try:
            path = dd.fetch(cache, dd.entry(cache, MMODEL, n))
        except KeyError:
            break
        d = os.path.join(work, str(n))
        subprocess.run([apicula, 'convert', path, '-o', d, '--more-textures', '--overwrite'], capture_output=True)
        pngs = [f for f in os.listdir(d) if f.endswith('.png')] if os.path.isdir(d) else []
        names = {re.sub(r'_\d+$', '', f[:-4]) for f in pngs}
        if len(names) != 1:
            continue
        name = names.pop()
        if name in out:
            continue
        key = lambda f: int(re.search(r'_(\d+)\.png$', f).group(1)) if re.search(r'_(\d+)\.png$', f) else 0
        out[name] = [Image.open(os.path.join(d, f)).convert('RGBA') for f in sorted(pngs, key=key)]
    return out


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokediamond'))
    os.makedirs(OVERWORLD, exist_ok=True)
    tex = textures(apicula, cache, tempfile.mkdtemp(prefix='dp_sprites_'))
    for name, layout in SPRITES.items():
        fr = tex[name]
        strip = Image.new('RGBA', (FRAME * 12, FRAME), (0, 0, 0, 0))
        if layout == 'one':
            f = fr[0].crop(fr[0].getbbox())
            cell = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0)); cell.paste(f, ((FRAME - f.width) // 2, FRAME - f.height))
            for k in range(12):
                strip.paste(cell, (k * FRAME, 0))
        else:
            for k, i in enumerate(WALK):
                strip.paste(fr[i], (k * FRAME, 0), fr[i])
        strip.save(os.path.join(OVERWORLD, name + '.png'))
    for boss, name in BOSSES.items():
        f = tex[name][WALK[0]]
        f.crop(f.getbbox()).save(os.path.join(TRAINERS, boss + '.png'))
    print('wrote', len(SPRITES), 'sprites to', OVERWORLD, 'and', len(BOSSES), 'bosses to', TRAINERS)


if __name__ == '__main__':
    main()
