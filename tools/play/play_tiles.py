"""Makes the Play menu's tile pictures (public/play/): scenes from the games' maps, with their people pasted on from
public/overworld/ (the maps have none of their own). The Badge Challenge: Cerulean Gym's entrance (FireRed), the Gym Guide
by its statues; the Battle Tower: HGSS's Battle Tower lobby, its receptionist at her desk and Ethan before it; Training:
the Saffron City Dojo (FireRed), its Karate Master and Black Belts where the map has them, Red on the mat (the user's
choices). The gym and the lobby are the run maps' and the tower's own pictures in public/routes/; the dojo isn't used
anywhere else, so it's rendered apart and passed in:

    python tools/routes/fetch_map.py SaffronCity_Dojo <dir>
    python tools/routes/render_route.py <dir> <dir>/dojo.png <dir>/dojo.json 13 16
    python tools/play/play_tiles.py <dir>/dojo.png

The Idle Adventure's tile is Route 1 (tools/idle/kanto_areas.py draws it), Red setting off up the road; run with no
argument, only it is made."""
import os, sys
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(HERE, '..', '..', 'apps', 'web', 'public'))
OUT = os.path.join(PUBLIC, 'play')

# Each overworld strip's standing frames (overworld.ts): FireRed's and Emerald's 16x32, facing right their left one
# mirrored; HGSS's 32x32.
FACING = {'down': 0, 'up': 1, 'left': 2, 'right': 2}


def sprite(name, face):
    im = Image.open(os.path.join(PUBLIC, 'overworld', name + '.png')).convert('RGBA')
    w = 32 if name.startswith('hgss/') else 16
    frame = im.crop((FACING[face] * w, 0, FACING[face] * w + w, 32))
    return ImageOps.mirror(frame) if face == 'right' else frame


def scene(picture, people, box):
    """The map `picture` with `people` ((sprite, tile x, tile y, facing)) standing on their tiles as on the maps (feet on
    the tile, head on the one above), cropped to `box` (left, top, right, bottom, in pixels)."""
    im = Image.open(picture).convert('RGBA')
    for name, x, y, face in sorted(people, key=lambda p: p[2]):
        s = sprite(name, face)
        im.alpha_composite(s, (x * 16 + 8 - s.width // 2, y * 16 - 16))
    return im.crop(box)


def main():
    routes = os.path.join(PUBLIC, 'routes')
    os.makedirs(OUT, exist_ok=True)
    # The Idle Adventure: Route 1 (tools/idle/kanto_areas.py's picture), Red setting off up the road from Pallet Town.
    idle = {'idle': scene(os.path.join(PUBLIC, 'idle', 'gen1', 'maps', 'route1.png'), [('red', 13, 33, 'up')], (48, 368, 336, 608))}
    if len(sys.argv) < 2:
        # Without the dojo's picture, only the tiles that need nothing else.
        for name, im in idle.items():
            im.save(os.path.join(OUT, name + '.png'))
        print('wrote', ', '.join(idle), 'to', OUT)
        return
    dojo = sys.argv[1]
    tiles = {
        **idle,
        'badge': scene(os.path.join(routes, 'ceruleancity_gym.png'), [('gym_guy', 7, 16, 'down')], (16, 144, 256, 304)),
        'tower': scene(os.path.join(routes, 'battle-tower', 'hgss-lobby.png'), [('hgss/tower_staff_f', 11, 5, 'down'), ('hgss/hero', 11, 7, 'up')], (48, 16, 368, 256)),
        # The dojo's people as its map.json places them: the Karate Master at the top, its Black Belts down the sides,
        # the Hitmonlee and Hitmonchan Poké Balls on their stands; Red on the mat, facing the Master.
        'training': scene(
            dojo,
            [
                ('black_belt', 6, 5, 'down'),
                ('black_belt', 1, 8, 'right'),
                ('black_belt', 1, 10, 'right'),
                ('black_belt', 11, 8, 'left'),
                ('black_belt', 11, 10, 'left'),
                ('item_ball', 5, 3, 'down'),
                ('item_ball', 7, 3, 'down'),
                ('red', 6, 10, 'up'),
            ],
            (16, 16, 192, 240),
        ),
    }
    for name, im in tiles.items():
        im.save(os.path.join(OUT, name + '.png'))
    print('wrote', ', '.join(tiles), 'to', OUT)


if __name__ == '__main__':
    main()
