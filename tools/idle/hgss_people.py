"""Makes the overworld sprites of the Idle Adventure's Johto people (README: Idle Adventure; issue #170, step 5) from a
checkout of the pret/pokeheartgold decompilation: every sprite packages/idle/src/data/gen2/areas.ts names (the game's
SPRITE_ constants, lower case, `hgss/` before them) and the starter scene's Professor Elm, as
apps/web/public/overworld/hgss/<name>.png, by tools/routes/hgss/hgss_sprites.py (the card runs' strips: 12 frames,
32x32). Each SPRITE_ constant's model is the MMODEL_ constant of its name (include/constants/mmodel.h); a model with 16
frames or more walks (`walk`), fewer stands still (`still`), one frame is `one`. A Pokémon standing in the overworld
(SPRITE_FOLLOWER_MON_*) isn't among them: johto_areas.py leaves them out. And Ethan's and Lyra's fishing sprites
(MMODEL_FISHINGHERO, MMODEL_FISH_HEROINE: 16 frames, the rod's 4 frames facing up, down, left and right), as
hgss/fish_hero.png and hgss/fish_heroine.png in FireRed's fishing strip's order (AreaScene's FishingSprite: 4 frames each
facing left, up, down, the rod out over them) and the 4 facing right after them (HGSS draws right itself): 16 32x32 frames.

Usage: python tools/idle/hgss_people.py <pokeheartgold checkout> --apicula <apicula.exe>"""
import os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
HGSS_TOOLS = os.path.join(ROOT, 'tools', 'routes', 'hgss')
sys.path.insert(0, HGSS_TOOLS)
import hgss_sprites as hs
from PIL import Image

OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'overworld', 'hgss')
AREAS = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2', 'areas.ts')
# Shown besides the areas' people: Professor Elm in his lab (the starter scene).
EXTRA = ['doctor']
# The fishing player's strips: their models, and each facing's 4 frames in the model (up 0-3, down 4-7, left 8-11, right 12-15) in the strip's order.
FISHING = {'fish_hero': 'fishinghero', 'fish_heroine': 'fish_heroine'}
FISH_ORDER = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15]


def main():
    args = sys.argv[1:]
    apicula = args[args.index('--apicula') + 1] if '--apicula' in args else 'apicula'
    src = os.path.abspath(args[0])
    mmodel = dict((n.lower(), int(v)) for n, v in re.findall(r'#define\s+MMODEL_(\w+)\s+(\d+)', open(os.path.join(src, 'include', 'constants', 'mmodel.h'), encoding='utf8').read()))
    names = sorted(set(re.findall(r"sprite: 'hgss/(\w+)'", open(AREAS, encoding='utf8').read())) | set(EXTRA))
    work = tempfile.mkdtemp(prefix='hgss_people_')
    specs = []
    for name in names:
        if name not in mmodel:
            raise SystemExit(f'{name}: no MMODEL_ constant')
        mid = mmodel[name]
        data = open(os.path.join(src, 'files', 'data', 'mmodel', 'mmodel', f'mmodel_{mid:08d}.NSBTX'), 'rb').read()
        n = len(hs.frames(apicula, data, work, name))
        specs.append(f"{name}={mid}:{'walk' if n >= 16 else 'one' if n == 1 else 'still'}")
    # The decompilation's own files (its checkout as hgss_data's cache).
    subprocess.run([sys.executable, os.path.join(HGSS_TOOLS, 'hgss_sprites.py'), OUT, *specs, '--apicula', apicula, '--cache', src], check=True)
    for out, model in FISHING.items():
        data = open(os.path.join(src, 'files', 'data', 'mmodel', 'mmodel', f'mmodel_{mmodel[model]:08d}.NSBTX'), 'rb').read()
        fr = hs.frames(apicula, data, work, out)
        strip = Image.new('RGBA', (hs.FRAME * len(FISH_ORDER), hs.FRAME), (0, 0, 0, 0))
        for k, i in enumerate(FISH_ORDER):
            strip.paste(fr[i], (k * hs.FRAME, 0), fr[i])
        strip.save(os.path.join(OUT, out + '.png'))
        print(out, mmodel[model], 'fishing')


if __name__ == '__main__':
    main()
