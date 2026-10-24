"""Makes the Battle Tower's FireRed sprites (public/overworld/), as the others there are: the Trainer Tower's receptionist
(FireRed's Union Room receptionist, as its lobby has them) and the man at its 1F counter (the battle room's attendant), each a strip of 9 frames cut from a checkout of the
pret/pokefirered decompilation by emerald_sprites.py's Graphics (which cuts FireRed's the same way: our clerk.png comes
out the same).

Usage: python frlg_sprites.py <pokefirered checkout> (needs graphics/object_events and src/data/object_events)."""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'routes', 'emerald'))
import emerald_sprites as es

OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'overworld'))
SPRITES = {'receptionist': 'OBJ_EVENT_GFX_UNION_ROOM_RECEPTIONIST', 'trainer_tower_man': 'OBJ_EVENT_GFX_TRAINER_TOWER_DUDE'}


def main():
    g = es.Graphics(sys.argv[1])
    for name, gfx in SPRITES.items():
        es.strip(g.frames(gfx)).save(os.path.join(OUT, name + '.png'))
    print('wrote', ', '.join(SPRITES), 'to', OUT)


if __name__ == '__main__':
    main()
