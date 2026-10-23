"""Makes FireRed's girl player, Leaf, for the Kanto maps (the Inventory's player sprite choice), as Red's are
(public/overworld/red.png, red_bike.png, red_surf.png), from a checkout of the pret/pokefirered decompilation:
leaf.png (walking) and leaf_bike.png (on her bike), each sprite's first 9 frames in its frame table's order, coloured with
the players' palette (tools/routes/emerald/emerald_sprites.py reads the tables); leaf_surf.png, her surfing picture's
32px frames (the surf blob drawn in) in the same 9's order, as red_surf.png has Red's. Checks first that Red's come out
the same as the ones the maps have.

Usage: python frlg_player_sprites.py <pokefirered checkout>. Needs Pillow."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'emerald'))
from PIL import Image, ImageChops
import emerald_sprites as es

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'overworld'))
# The surfing picture's frames (down, down step, up, up step, left, left step) as the strip's 9.
SURF_ORDER = [0, 2, 4, 1, 1, 3, 3, 5, 5]


def surf_strip(repo, pic, pal):
    raw = Image.open(os.path.join(repo, 'graphics', 'object_events', 'pics', 'people', pic))
    frames = [es.colour(raw.crop((i * 32, 0, i * 32 + 32, 32)), pal) for i in range(raw.width // 32)]
    return es.strip([frames[i] for i in SURF_ORDER])


def main():
    repo = sys.argv[1]
    g = es.Graphics(repo)
    pal = g.palette('OBJ_EVENT_PAL_TAG_PLAYER_RED')
    made = {
        'red': es.strip(g.frames('OBJ_EVENT_GFX_RED_NORMAL')),
        'red_bike': es.strip(g.frames('OBJ_EVENT_GFX_RED_BIKE')),
        'red_surf': surf_strip(repo, 'red_surf.png', pal),
        'leaf': es.strip(g.frames('OBJ_EVENT_GFX_GREEN_NORMAL')),
        'leaf_bike': es.strip(g.frames('OBJ_EVENT_GFX_GREEN_BIKE')),
        'leaf_surf': surf_strip(repo, 'green_surf.png', pal),
    }
    for name in ('red', 'red_bike', 'red_surf'):
        have = Image.open(os.path.join(OUT, name + '.png')).convert('RGBA')
        assert have.size == made[name].size and ImageChops.difference(have, made[name]).getbbox() is None, f'{name} differs from the maps\''
    for name in ('leaf', 'leaf_bike', 'leaf_surf'):
        made[name].save(os.path.join(OUT, name + '.png'))
    print('wrote leaf, leaf_bike, leaf_surf to', OUT)


if __name__ == '__main__':
    main()
