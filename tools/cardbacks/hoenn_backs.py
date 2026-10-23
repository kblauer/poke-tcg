"""Makes the Hoenn runs' foil card backs (as Cosmos and Ancient for Kanto's, Glitter and Illusion for Johto's): the classic
back (apps/web/public/cardbacks/classic.jpg, the back the EX cards have too) with a holo texture from apps/web/public/img
laid over it, its lines lightening the card ("screen") so the logo stays clear:

- Maze (the Hoenn Gym Challenge): the labyrinth lines of geometric.png;
- Tidal (Hoenn Champion): the waves of trainerbg.png, in light sea blue.

Usage: python hoenn_backs.py. Writes apps/web/public/cardbacks/maze.jpg and tidal.jpg (660x921). Needs Pillow."""
import os
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(HERE, '..', '..', 'apps', 'web', 'public'))


def tiled(tex, size, scale):
    tex = tex.resize((round(tex.width * scale), round(tex.height * scale)), Image.LANCZOS)
    out = Image.new('L', size)
    for y in range(0, size[1], tex.height):
        for x in range(0, size[0], tex.width):
            out.paste(tex, (x, y))
    return out


def foil(back, lines, colour, strength):
    """`lines` (L, 255 where the texture's lines are) screened over `back` in `colour`, at `strength`."""
    layer = Image.new('RGB', back.size, colour)
    mask = lines.point(lambda v: round(v * strength))
    lit = ImageChops.screen(back, Image.composite(layer, Image.new('RGB', back.size, (0, 0, 0)), mask))
    return lit


def main():
    back = Image.open(os.path.join(PUBLIC, 'cardbacks', 'classic.jpg')).convert('RGB')
    # Maze: geometric.png is white lines on black.
    maze = tiled(Image.open(os.path.join(PUBLIC, 'img', 'geometric.png')).convert('L'), back.size, 0.9)
    foil(back, maze, (205, 225, 255), 0.42).save(os.path.join(PUBLIC, 'cardbacks', 'maze.jpg'), quality=92)
    # Tidal: trainerbg.png is blue waves on white: the waves are its dark pixels.
    waves = tiled(Image.open(os.path.join(PUBLIC, 'img', 'trainerbg.png')).convert('L').point(lambda v: min(255, 2 * (255 - v))), back.size, 0.8)
    foil(back, waves, (170, 235, 255), 0.85).save(os.path.join(PUBLIC, 'cardbacks', 'tidal.jpg'), quality=92)
    print('wrote maze.jpg and tidal.jpg')


if __name__ == '__main__':
    main()
