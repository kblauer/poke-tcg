"""Makes the Johto route map's overworld sprites from HeartGold/SoulSilver's (the pret/pokeheartgold decompilation's
data/mmodel NSBTX files, converted to PNGs with apicula): a strip of 12 frames, 32x32 each, for public/overworld/hgss/:
standing facing down, up, left and right, then two walking frames each for down, up, left and right (HGSS draws facing
right itself, so nothing is mirrored).

Usage: python hgss_sprites.py <out dir> <name>=<mmodel id>[:<layout>] ... [--apicula <apicula.exe>] [--cache <dir>]
Layouts: `walk` (the default: 16 frames, up, down, left and right, each stand, step, stand, other step; the player's 32
add running, unused), `still` (4 frames, up, down, left, right, no walking; `surf`: the surfing player, sitting on
HGSS's surf Pokémon, the field model `sea_ride`, drawn with render_hgss.py facing each way, bobbing as they go, the
surf effect's foam (`sibuki`) under it while moving, and 4 more frames after the 12, standing a pixel lower without
the foam, for bobbing on the spot), `one` (a single frame, the item ball, padded to 32x32 at the bottom),
`boss` (a boss's standing frame facing down, cropped to the figure, as public/trainers/ holds them: not a strip)."""
import os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hgss_data as hd
import numpy as np
from PIL import Image
from render_hgss import Scene, glb_prims

FRAME = 32
# Each layout's 12 frames, as frame indexes of the converted sheet (from 0).
WALK = [4, 0, 8, 12, 5, 7, 1, 3, 9, 11, 13, 15]
STILL = [1, 0, 2, 3, 1, 1, 0, 0, 2, 2, 3, 3]
# The Pokémon the player surfs on: the `sea_ride` model (archive a/1/0/3, file 86), facing down (its head south).
SURF_ARCHIVE, SURF_MODEL = 'files/a/1/0/3', 86
# The surf effect's foam (archive a/1/3/4, file 11: its "sibuki" texture), under the surf Pokémon while moving.
FOAM_ARCHIVE, FOAM_MODEL = 'files/a/1/3/4', 11
# Each facing (the strip's stand frames: down, up, left, right) as a turn of the model about its upright axis, in degrees.
SURF_TURN = [0, 180, -90, 90]


def surf_mount(prims, turn):
    """The surf Pokémon (or the surf effect's wave) facing a way, drawn into a 32x32 frame as the maps are (tilted),
    centred low in it."""
    a = np.radians(turn)
    scene = Scene(FRAME, FRAME, ground=-7, background=(0, 0, 0))
    for p in prims:
        pos = p['pos'].copy()
        x, z = pos[:, 0].copy(), pos[:, 2].copy()
        pos[:, 0] = x * np.cos(a) + z * np.sin(a) + FRAME / 2
        pos[:, 2] = -x * np.sin(a) + z * np.cos(a) + FRAME / 2 + 4
        scene.mesh(pos, p['uv'], p['col'], p['tex'], p['wrap'], p['alpha'], p['blend'])
    # Rendered over transparent black: whatever wasn't drawn is see-through.
    scene.render(os.path.join(tempfile.gettempdir(), 'surf_mount.png'))
    img = np.asarray(Image.open(os.path.join(tempfile.gettempdir(), 'surf_mount.png')).convert('RGBA')).copy()
    drawn = scene.depth > -1e17
    img[..., 3] = np.where(drawn, 255, 0)
    return Image.fromarray(img)


def frames(apicula, nsbtx_bytes, work, tag):
    src = os.path.join(work, tag + '.nsbtx'); open(src, 'wb').write(nsbtx_bytes)
    out = os.path.join(work, tag)
    subprocess.run([apicula, 'convert', src, '-o', out, '--more-textures', '--overwrite'], check=True, capture_output=True)
    pngs = sorted((f for f in os.listdir(out) if f.endswith('.png')), key=lambda f: int(re.search(r'_(\d+)\.png$', f).group(1)) if re.search(r'_(\d+)\.png$', f) else 0)
    return [Image.open(os.path.join(out, f)).convert('RGBA') for f in pngs]


def main():
    args = sys.argv[1:]
    def opt(name, default):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    apicula = opt('--apicula', 'apicula')
    cache = opt('--cache', os.path.join(tempfile.gettempdir(), 'pokeheartgold'))
    out = args[0]
    os.makedirs(out, exist_ok=True)
    work = tempfile.mkdtemp(prefix='hgss_sprites_')
    mounts = None
    for spec in args[1:]:
        name, rest = spec.split('=')
        mid, layout = (rest.split(':') + ['walk'])[:2]
        data = open(hd.fetch(cache, f'files/data/mmodel/mmodel/mmodel_{int(mid):08d}.NSBTX'), 'rb').read()
        fr = frames(apicula, data, work, name)
        if layout == 'boss':
            f = fr[WALK[0]]
            f.crop(f.getbbox()).save(os.path.join(out, name + '.png'))
            print(name, mid, layout)
            continue
        strip = Image.new('RGBA', (FRAME * 12, FRAME), (0, 0, 0, 0))
        if layout == 'one':
            f = fr[0]
            cell = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0)); cell.paste(f, ((FRAME - f.width) // 2, FRAME - f.height))
            for k in range(12):
                strip.paste(cell, (k * FRAME, 0))
        else:
            order = WALK if layout == 'walk' else STILL
            if layout == 'surf' and mounts is None:
                model = hd.narc(hd.fetch(cache, SURF_ARCHIVE))[SURF_MODEL]
                path = os.path.join(work, 'sea_ride.nsbmd'); open(path, 'wb').write(model)
                subprocess.run([apicula, 'convert', path, '-o', os.path.join(work, 'sea_ride'), '-f', 'glb', '--overwrite'], check=True, capture_output=True)
                prims = glb_prims(next(os.path.join(work, 'sea_ride', f) for f in os.listdir(os.path.join(work, 'sea_ride')) if f.endswith('.glb')))
                mounts = [surf_mount(prims, t) for t in SURF_TURN]
                # Both fit the frame with a pixel to spare for the bob: the Pokémon as low as it goes, the player's head
                # at the top (sitting on its back, overlapping it).
                drop = FRAME - 1 - max(m.getbbox()[3] for m in mounts)
                lift = -min(f.getbbox()[1] for f in fr)
                foam_model = hd.narc(hd.fetch(cache, FOAM_ARCHIVE))[FOAM_MODEL]
                path = os.path.join(work, 'foam.nsbmd'); open(path, 'wb').write(foam_model)
                subprocess.run([apicula, 'convert', path, '-o', os.path.join(work, 'foam'), '--overwrite'], check=True, capture_output=True)
                foam = Image.open(os.path.join(work, 'foam', 'sibuki_1.png')).convert('RGBA')
                foam = foam.crop(foam.getbbox())
            for k, i in enumerate(order):
                f = fr[i]
                if layout == 'surf':
                    # The Pokémon, with the player on its back (facing the same way), and while moving (the walking
                    # frames, which the map cycles without the standing ones: bobs in overworld.ts) the foam under it,
                    # at the frame's bottom; the walking frames bob a pixel (the foam doesn't).
                    facing = k if k < 4 else (k - 4) // 2
                    cell = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))
                    bob = 1 if k >= 4 and k % 2 == 1 else 0
                    if k >= 4:
                        cell.alpha_composite(foam, ((FRAME - foam.width) // 2, FRAME - foam.height))
                    cell.alpha_composite(mounts[facing], (0, drop + bob))
                    cell.alpha_composite(f, (0, lift + bob))
                    f = cell
                strip.paste(f, (k * FRAME, 0), f)
            if layout == 'surf':
                # Standing still, bobbing: the stand frames a pixel lower.
                wide = Image.new('RGBA', (FRAME * 16, FRAME), (0, 0, 0, 0))
                wide.paste(strip, (0, 0))
                for facing in range(4):
                    cell = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))
                    cell.alpha_composite(mounts[facing], (0, drop + 1))
                    cell.alpha_composite(fr[order[facing]], (0, lift + 1))
                    wide.paste(cell, ((12 + facing) * FRAME, 0), cell)
                strip = wide
        strip.save(os.path.join(out, name + '.png'))
        print(name, mid, layout, len(fr), 'frames')


if __name__ == '__main__':
    main()
