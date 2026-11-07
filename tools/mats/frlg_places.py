"""Mock-ups of the FRLG set's mats as real places (the user's ideas, 2026-11-07), not collapsed scenes: each a 768 x 448
(48 x 28 metatile) scene cut from the games' own maps, padded or extended with their own tiles, drawn as the game draws
them, its tile animations played as in frlg_mats.py (same sheet and JSON format):
- fire: Emerald's Mt. Chimney, its top 28 rows (the crater at the top middle, the summit's floor below it, its stepped
  cliffs at the sides; the cable car station below left out), 4 columns of the layout's border either side to fill
  the width, as the game draws beyond a map's edge. Lavaridge's lava bubbles.
- water: FireRed's Vermilion City harbour: the city's last 11 rows (the wooden pier and its lighthouses) over the
  S.S. Anne's dock map (SSAnne_Exterior) from its top, placed so its pier carries on from the city's (the city is 48
  wide, the frame's width; the dock map shifted 9 columns), with the S.S. Anne drawn as the dock map's object
  (OBJ_EVENT_GFX_SS_ANNE: its 128x64 picture and palette, placed as the game places an object on its tile). General's
  sea animation.
- grass: FireRed's Viridian Forest at its south end, the gatehouse's roof at the bottom middle (`grass`).
- shop (the earlier grass, kept): Emerald's Pretty Petal Flower Shop exactly as its map lays it out (15 x 9: 240 x 144 px), without its
  people, scaled up 3 times (720 x 432) and centred on black, as the game shows outside an interior.
  Nothing in the shop animates: one frame.
Each is a mat of its own in the Cosmetics shop (the user's, 2026-11-07: the places listed one by one, the same scene
whatever the type), in apps/web/public/mats/places/ under its place's name (PLACES).
Usage: python tools/mats/frlg_places.py --app (writes every place to the app's folder), or
python tools/mats/frlg_places.py <out dir> [fire water grass shop ...] (without one: fire, water, grass) (writes <type>.png
and .json, and <type>-frame.png, -desktop.png (the middle 600 x 448 at 2x) and -phone.png (the middle 260 px column at 2x))."""
import io, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import frlg_mats as F

W, H = F.W, F.H


def border(name, game):
    """A layout's border block (2x2 metatiles), as the game draws it beyond the map's edges."""
    l = F.layout(name, game)
    return (np.array(F.u16s(F.get(l['border_filepath'], game)), np.int32) & 0x3FF).reshape(2, 2)


def fire():
    ts = F.Tilesets('gTileset_General', 'gTileset_Lavaridge', F.EMERALD)
    b = F.blocks(F.layout('MtChimney', F.EMERALD), F.EMERALD)
    edge = border('MtChimney', F.EMERALD)
    grid = np.array([[edge[y % 2, x % 2] for x in range(W)] for y in range(H)])  # (aligned to the map's own tiles)
    grid[:, 4:4 + b.shape[1]] = b[:H]
    return ts, grid, []


def water():
    ts = F.Tilesets('gTileset_General', 'gTileset_VermilionCity')
    city = F.blocks(F.layout('VermilionCity'))
    dock = F.blocks(F.layout('SSAnne_Exterior'))
    top = 11  # the city's last rows
    grid = np.concatenate([city[-top:], dock[:H - top, 9:9 + W]])
    # The S.S. Anne: an object at (30, 16) on the dock map, 128x64, its centre 8 px right of the tile's left and its
    # bottom on the tile's bottom (as the game sets an object's sprite on its map coordinates).
    pic = np.array(Image.open(io.BytesIO(F.get('graphics/object_events/pics/misc/ss_anne.png'))))
    pal = np.array([F.read_pal(F.get('graphics/object_events/palettes/ss_anne.pal'))], np.uint8)[0]
    rgba = np.dstack([pal[pic & 15], np.where(pic & 15 == 0, 0, 255).astype(np.uint8)])
    x, y = (30 - 9) * 16 + 8 - 64, (16 + top) * 16 + 16 - 64
    return ts, grid, [(rgba, x, y)]


SCALE = 3  # the shop (240 x 144 px) scaled up a whole number of times to fill the frame: 720 x 432


def shop():
    """The Pretty Petal Flower Shop exactly as Emerald lays it out, without its people (the user's, 2026-11-07), scaled up
    SCALE times and centred on black, as the game shows what's outside an interior's walls. Returns the frame itself
    (nothing in the shop animates)."""
    ts = F.Tilesets('gTileset_Building', 'gTileset_PrettyPetalFlowerShop', F.EMERALD)
    room = ts.render(F.blocks(F.layout('Route104_PrettyPetalFlowerShop', F.EMERALD), F.EMERALD))
    big = room.repeat(SCALE, 0).repeat(SCALE, 1)
    frame = np.zeros((H * 16, W * 16, 3), np.uint8)
    y, x = (H * 16 - big.shape[0]) // 2, (W * 16 - big.shape[1]) // 2
    frame[y:y + big.shape[0], x:x + big.shape[1]] = big
    return frame


def grass():
    """FireRed's Viridian Forest at its south end: the map's columns 6-53 and rows 38-65, the gatehouse's roof (the
    forest map's own tiles) at the bottom middle with the yellow mat at its door, the path winding up between the tall
    grass and the trees, the sandy patch, the signs (tiles). The map is 54 wide, so no padding; no people."""
    l = F.layout('ViridianForest')
    ts = F.Tilesets(l['primary_tileset'], l['secondary_tileset'])
    return ts, F.blocks(l)[38:38 + H, 6:6 + W], []


def overlay(shots, objects):
    out = []
    for rgb, ms in shots:
        rgb = rgb.copy()
        for pic, x, y in objects:
            h, w = pic.shape[:2]
            y0, x0, y1, x1 = max(0, y), max(0, x), min(rgb.shape[0], y + h), min(rgb.shape[1], x + w)
            sub, p = rgb[y0:y1, x0:x1], pic[y0 - y:y1 - y, x0 - x:x1 - x]
            sub[p[..., 3] > 0] = p[..., :3][p[..., 3] > 0]
        out.append((rgb, ms))
    return out


# Each scene's file name in the app (apps/web/public/mats/places/<name>.png, the cosmetics' `mat-<name>`).
PLACES = {'fire': 'mt-chimney', 'water': 'vermilion-city', 'grass': 'viridian-forest', 'shop': 'pretty-petal-flower-shop'}
APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'web', 'public', 'mats', 'places')


def shots_of(kind):
    """A place's frames, each (image, ms)."""
    if kind == 'shop':
        return [(shop(), 1000)]
    ts, grid, objects = globals()[kind]()
    return overlay(F.frames(ts, grid), objects)


def main():
    if sys.argv[1:] == ['--app']:
        os.makedirs(APP, exist_ok=True)
        for kind, name in PLACES.items():
            F.save(name, shots_of(kind), APP)
            print(name)
        return
    out = sys.argv[1]
    for kind in sys.argv[2:] or ('fire', 'water', 'grass'):
        shots = shots_of(kind)
        F.save(kind, shots, out)
        first = shots[0][0]
        Image.fromarray(first).save(os.path.join(out, kind + '-frame.png'))
        for name, width in (('desktop', 600), ('phone', 260)):
            x = (W * 16 - width) // 2
            Image.fromarray(first[:, x:x + width]).resize((width * 2, H * 32), Image.NEAREST).save(os.path.join(out, kind + '-' + name + '.png'))
        print(kind, len(shots), 'frames of', round(shots[0][1]), 'ms')


if __name__ == '__main__':
    main()
