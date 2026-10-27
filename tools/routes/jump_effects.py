"""The ledge jump's field effects (apps/web/public/overworld/): FireRed's shadow under a jumping sprite (`shadow.png`, the
medium one, 16x8, a player's size) and the dust of its landing (`jump_dust.png`, the ground impact dust's 3 frames of
16x8, stacked), from the pret/pokefirered decompilation, in the game's own colours: the PNGs there are palette indices
(colour 0 see-through), coloured in the game by the player's palette (the shadow's colour 15, black) and the general
field effect palette (general_0.pal, the dust's). Also tall grass's (FLDEFF_TALL_GRASS and FLDEFF_JUMP_TALL_GRASS, in the
general_1.pal colours): `tall_grass.png`, the grass drawn over a sprite standing in it (5 frames of 16x16, stacked: frame 0
the grass at rest, 1-4 its rustle), and `jump_tall_grass.png`, the grass thrown up where a ledge jump lands in it (4 frames
of 16x8, stacked).

    python tools/routes/jump_effects.py
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'apps/web/public/overworld'
RAW = 'https://raw.githubusercontent.com/pret/pokefirered/master/graphics/'


def fetch(path: str) -> bytes:
    with urllib.request.urlopen(RAW + path) as r:
        return r.read()


def palette(path: str) -> list[tuple[int, int, int]]:
    """A JASC palette's colours."""
    lines = fetch(path).decode().split()
    # After its 3 header words (JASC-PAL, 0100, 16).
    return [tuple(int(v) for v in lines[i : i + 3]) for i in range(3, 3 + 16 * 3, 3)]  # type: ignore[misc]


def coloured(path: str, colours: list[tuple[int, int, int]]) -> Image.Image:
    """The indexed PNG at `path` in `colours`, colour 0 see-through."""
    indexed = Image.open(io.BytesIO(fetch(path)))
    out = Image.new('RGBA', indexed.size)
    out.putdata([(0, 0, 0, 0) if i == 0 else (*colours[i], 255) for i in indexed.getdata()])
    return out


def main() -> None:
    coloured('field_effects/pics/shadow_medium.png', palette('object_events/palettes/player.pal')).save(OUT / 'shadow.png')
    coloured('field_effects/pics/ground_impact_dust.png', palette('field_effects/palettes/general_0.pal')).save(OUT / 'jump_dust.png')
    grass = palette('field_effects/palettes/general_1.pal')
    coloured('field_effects/pics/tall_grass.png', grass).save(OUT / 'tall_grass.png')
    coloured('field_effects/pics/jump_tall_grass.png', grass).save(OUT / 'jump_tall_grass.png')


if __name__ == '__main__':
    main()
