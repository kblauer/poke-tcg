"""Black's tall grass rustle for the Unova maps: its field effect textures (archive `a/0/7/5`, as Diamond's `kusaeff`:
a 32x32 billboard in front of the tile) as strips for public/overworld/bw/, one for each version a map uses.

The archive holds each kind in several versions, by season and look: members 0-5 `kusaeff` (ordinary tall grass: 4
frames, autumn's yellow, winter's snowy), 6-10 `kusaeff` again (the darker very tall grass), 11-18 `lgrass_ani1` (long
grass: 2 frames). Which version a map's grass is isn't in its data that's read, so each kind of a map's grass (bw_map.py's
grass letters, KINDS) takes the version whose colours are nearest its tiles' in the map's own picture (`choose`). Strips
are 4 frames of 32x32 stacked downwards, as public/overworld/dp/grass.png; long grass's 2 frames make 4 (sway, back,
sway, back), resting on its second.

Used by unova_routes.py (each route's `rustle`); `python bw_grass.py <out dir>` draws every version side by side."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', '..', 'extras'))
import numpy as np
import bw_data
import nitro
import nsbtx
from PIL import Image

ARCHIVE = 'files/a/0/7/5'
# Each grass letter's versions (the archive's members).
KINDS = {'g': range(0, 6), 'h': range(6, 11), 'k': range(11, 19)}
FRAME = 32


def versions(g):
    """Each version's frames, by member."""
    members = nitro.narc(g.fetch(ARCHIVE))
    return {n: nsbtx.frames(nitro.unpack(members[n])) for r in KINDS.values() for n in r}


def mean_colour(img):
    a = np.asarray(img.convert('RGBA'), float)
    opaque = a[..., 3] > 0
    return a[..., :3][opaque].mean(axis=0) if opaque.any() else np.zeros(3)


def choose(picture, grass, frames):
    """{letter: member}: for each kind of grass on the map, the version whose first frame's colours are nearest the
    mean colour of that kind's tiles in `picture` (the map's render, 16 px a tile)."""
    px = np.asarray(picture.convert('RGB'), float)
    out = {}
    for letter, members in KINDS.items():
        tiles = [(x, y) for y, row in enumerate(grass) for x, c in enumerate(row) if c == letter]
        if not tiles:
            continue
        colour = np.mean([px[y * 16 + 4:y * 16 + 12, x * 16 + 4:x * 16 + 12].reshape(-1, 3).mean(axis=0) for x, y in tiles], axis=0)
        out[letter] = min(members, key=lambda n: np.linalg.norm(mean_colour(frames[n][0]) - colour))
    return out


def strip(frames):
    """4 frames stacked: the rustle's own, or long grass's 2 as sway, back, sway, back."""
    pick = frames[:4] if len(frames) >= 4 else [frames[0], frames[1 % len(frames)]] * 2
    out = Image.new('RGBA', (FRAME, FRAME * 4), (0, 0, 0, 0))
    for k, f in enumerate(pick):
        out.paste(f, ((FRAME - f.width) // 2, k * FRAME + FRAME - f.height), f)
    return out


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    frames = versions(bw_data.Game())
    sheet = Image.new('RGBA', (FRAME * len(frames), FRAME * 4), (60, 60, 60, 255))
    for k, n in enumerate(sorted(frames)):
        s = strip(frames[n])
        sheet.paste(s, (k * FRAME, 0), s)
    sheet.save(os.path.join(out, 'bw_grass_versions.png'))


if __name__ == '__main__':
    main()
