"""Makes Pokémon Emerald's overworld sprites for the Hoenn maps from a checkout of the pret/pokeemerald decompilation:
strips of 9 frames, as FireRed's (apps/web/src/utils/overworld.ts): standing facing down, up and left, then two walking
frames each for down, up and left (facing right is left, mirrored), taken in that order from each sprite's frame table
(src/data/object_events/object_event_pic_tables.h, whose first 9 frames are those; a sprite with fewer, a gym leader's,
repeats its standing ones there), coloured with its palette (the graphics info's palette tag), colour 0 see-through.
Brendan (and May, the girl player) surfing sits on the surf blob (graphics/field_effects/pics/surf_blob.png), a little below him, as the game draws them.

Also the run picker's boss sprites (apps/web/public/trainers/<boss>.png, as Kanto's and Johto's): each Hoenn boss's
standing frame facing down, cropped to the sprite.

Usage: python emerald_sprites.py <pokeemerald checkout> [<out dir>, default apps/web/public/overworld/rse]
Needs Pillow."""
import os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
FRAMES = 9

# The sprites the Hoenn maps use, by our name: the player (walking, on the Mach Bike, surfing), the trainer classes and
# the non-battle encounters' people (overworld.ts's RSE_* tables), and the Hoenn gyms' trainers (as each gym draws them).
SPRITES = {
    'brendan': 'OBJ_EVENT_GFX_BRENDAN_NORMAL',
    'brendan_bike': 'OBJ_EVENT_GFX_BRENDAN_MACH_BIKE',
    'brendan_surf': 'OBJ_EVENT_GFX_BRENDAN_SURFING',
    # The girl player (the Inventory's player sprite choice): May, walking, on the Mach Bike, surfing.
    'may': 'OBJ_EVENT_GFX_MAY_NORMAL',
    'may_bike': 'OBJ_EVENT_GFX_MAY_MACH_BIKE',
    'may_surf': 'OBJ_EVENT_GFX_MAY_SURFING',
    'youngster': 'OBJ_EVENT_GFX_YOUNGSTER',
    'lass': 'OBJ_EVENT_GFX_LASS',
    'bug_catcher': 'OBJ_EVENT_GFX_BUG_CATCHER',
    'hiker': 'OBJ_EVENT_GFX_HIKER',
    'picnicker': 'OBJ_EVENT_GFX_PICNICKER',
    'camper': 'OBJ_EVENT_GFX_CAMPER',
    'maniac': 'OBJ_EVENT_GFX_MANIAC',
    'scientist': 'OBJ_EVENT_GFX_SCIENTIST_1',
    'swimmer_m': 'OBJ_EVENT_GFX_SWIMMER_M',
    'swimmer_f': 'OBJ_EVENT_GFX_SWIMMER_F',
    'fisherman': 'OBJ_EVENT_GFX_FISHERMAN',
    'beauty': 'OBJ_EVENT_GFX_BEAUTY',
    'gentleman': 'OBJ_EVENT_GFX_GENTLEMAN',
    'cyclist_m': 'OBJ_EVENT_GFX_CYCLING_TRIATHLETE_M',
    'cyclist_f': 'OBJ_EVENT_GFX_CYCLING_TRIATHLETE_F',
    'runner_m': 'OBJ_EVENT_GFX_RUNNING_TRIATHLETE_M',
    'runner_f': 'OBJ_EVENT_GFX_RUNNING_TRIATHLETE_F',
    'man_1': 'OBJ_EVENT_GFX_MAN_1',
    'man_2': 'OBJ_EVENT_GFX_MAN_2',
    'man_3': 'OBJ_EVENT_GFX_MAN_3',
    'man_4': 'OBJ_EVENT_GFX_MAN_4',
    'man_5': 'OBJ_EVENT_GFX_MAN_5',
    'woman_1': 'OBJ_EVENT_GFX_WOMAN_1',
    'woman_2': 'OBJ_EVENT_GFX_WOMAN_2',
    'woman_3': 'OBJ_EVENT_GFX_WOMAN_3',
    'woman_4': 'OBJ_EVENT_GFX_WOMAN_4',
    'woman_5': 'OBJ_EVENT_GFX_WOMAN_5',
    'old_man': 'OBJ_EVENT_GFX_OLD_MAN',
    'old_woman': 'OBJ_EVENT_GFX_OLD_WOMAN',
    'sailor': 'OBJ_EVENT_GFX_SAILOR',
    'psychic_m': 'OBJ_EVENT_GFX_PSYCHIC_M',
    'hex_maniac': 'OBJ_EVENT_GFX_HEX_MANIAC',
    'black_belt': 'OBJ_EVENT_GFX_BLACK_BELT',
    'expert_m': 'OBJ_EVENT_GFX_EXPERT_M',
    'expert_f': 'OBJ_EVENT_GFX_EXPERT_F',
    'ninja_boy': 'OBJ_EVENT_GFX_NINJA_BOY',
    'boy_1': 'OBJ_EVENT_GFX_BOY_1',
    'boy_2': 'OBJ_EVENT_GFX_BOY_2',
    'boy_3': 'OBJ_EVENT_GFX_BOY_3',
    'girl_3': 'OBJ_EVENT_GFX_GIRL_3',
    'rich_boy': 'OBJ_EVENT_GFX_RICH_BOY',
    'twin': 'OBJ_EVENT_GFX_TWIN',
    'tuber_m': 'OBJ_EVENT_GFX_TUBER_M',
    'tuber_f': 'OBJ_EVENT_GFX_TUBER_F',
    'pokefan_m': 'OBJ_EVENT_GFX_POKEFAN_M',
    'pokefan_f': 'OBJ_EVENT_GFX_POKEFAN_F',
    'fat_man': 'OBJ_EVENT_GFX_FAT_MAN',
    'nurse': 'OBJ_EVENT_GFX_NURSE',
    'clerk': 'OBJ_EVENT_GFX_MART_EMPLOYEE',
    # The Battle Tower's receptionists and attendants (battle-tower-maps.ts): Teala, as Emerald's Battle Tower has them.
    'teala': 'OBJ_EVENT_GFX_TEALA',
    'aqua_grunt_m': 'OBJ_EVENT_GFX_AQUA_MEMBER_M',
    'aqua_grunt_f': 'OBJ_EVENT_GFX_AQUA_MEMBER_F',
    'magma_grunt_m': 'OBJ_EVENT_GFX_MAGMA_MEMBER_M',
    'magma_grunt_f': 'OBJ_EVENT_GFX_MAGMA_MEMBER_F',
    'item_ball': 'OBJ_EVENT_GFX_ITEM_BALL',
    # The Game Corner's people (the Extras page's map, tools/extras/game_corner_map.py) not drawn elsewhere.
    'girl_2': 'OBJ_EVENT_GFX_GIRL_2',
    'cook': 'OBJ_EVENT_GFX_COOK',
}
# The Hoenn bosses' sprites, by boss id (for the gyms' and League's maps, and the run picker).
BOSSES = {
    'roxanne': 'OBJ_EVENT_GFX_ROXANNE', 'brawly': 'OBJ_EVENT_GFX_BRAWLY', 'wattson': 'OBJ_EVENT_GFX_WATTSON',
    'flannery': 'OBJ_EVENT_GFX_FLANNERY', 'norman': 'OBJ_EVENT_GFX_NORMAN', 'winona': 'OBJ_EVENT_GFX_WINONA',
    'tate-liza': ('OBJ_EVENT_GFX_TATE', 'OBJ_EVENT_GFX_LIZA'), 'juan': 'OBJ_EVENT_GFX_JUAN', 'sidney': 'OBJ_EVENT_GFX_SIDNEY',
    'phoebe': 'OBJ_EVENT_GFX_PHOEBE', 'glacia': 'OBJ_EVENT_GFX_GLACIA', 'drake': 'OBJ_EVENT_GFX_DRAKE',
    'wallace': 'OBJ_EVENT_GFX_WALLACE',
}


# Palette tags whose palette is named otherwise (pokefirered's players').
PAL_ALIASES = {'OBJ_EVENT_PAL_TAG_PLAYER_RED': 'gObjectEventPal_Player', 'OBJ_EVENT_PAL_TAG_PLAYER_GREEN': 'gObjectEventPal_Player'}


def read(path):
    return open(path, encoding='utf-8').read()


class Graphics:
    """The decompilation's object event graphics: by OBJ_EVENT_GFX_ constant, its frames' picture and palette."""

    def __init__(self, repo):
        self.repo = repo
        d = os.path.join(repo, 'src', 'data', 'object_events')
        gfx = read(os.path.join(d, 'object_event_graphics.h'))
        # pokefirered names the built files (.4bpp, .gbapal); their sources beside them are the .png and .pal read here.
        self.files = {k: re.sub(r'\.4bpp$', '.png', re.sub(r'\.gbapal$', '.pal', v)) for k, v in re.findall(r'(gObjectEvent(?:Pic|Pal)_\w+)\[\]\s*=\s*INC\w+\("([^"]+)"', gfx)}
        tables = read(os.path.join(d, 'object_event_pic_tables.h'))
        self.tables = {}
        for name, body in re.findall(r'(sPicTable_\w+)\[\]\s*=\s*\{(.*?)\};', tables, re.S):
            # overworld_frame(pic, width in tiles, height, frame), or obj_frame_tiles(pic): the whole picture (its size from the info).
            self.tables[name] = [(m[0], int(m[1]), int(m[2]), int(m[3])) if m[1] else (m[4], 0, 0, 0) for m in re.findall(r'overworld_frame\((\w+),\s*(\d+),\s*(\d+),\s*(\d+)\)|obj_frame_tiles\((\w+)\)', body)]
        info = read(os.path.join(d, 'object_event_graphics_info.h'))
        self.infos = {}
        for name, body in re.findall(r'(gObjectEventGraphicsInfo_\w+)\s*=\s*\{(.*?)\};', info, re.S):
            fields = dict(re.findall(r'\.(\w+)\s*=\s*([^,]+),', body))
            self.infos[name] = fields
        ptrs = read(os.path.join(d, 'object_event_graphics_info_pointers.h'))
        self.ids = dict(re.findall(r'\[(OBJ_EVENT_GFX_\w+)\]\s*=\s*&(gObjectEventGraphicsInfo_\w+)', ptrs))

    def palette(self, tag):
        # OBJ_EVENT_PAL_TAG_NPC_1 -> gObjectEventPal_Npc1 (FireRed's Red and Leaf share one: gObjectEventPal_Player).
        name = PAL_ALIASES.get(tag) or 'gObjectEventPal_' + ''.join(w.capitalize() for w in tag.replace('OBJ_EVENT_PAL_TAG_', '').split('_'))
        lines = read(os.path.join(self.repo, self.files[name])).split()
        n = int(lines[2])
        return [tuple(int(v) for v in lines[3 + i * 3: 6 + i * 3]) for i in range(n)]

    def frames(self, gfx_id):
        """The sprite's frames (RGBA images) in its frame table's order."""
        info = self.infos[self.ids[gfx_id]]
        pal = self.palette(info['paletteTag'].strip())
        out = []
        sheets = {}
        for pic, w, h, f in self.tables[info['images'].strip()]:
            if pic not in sheets:
                sheets[pic] = Image.open(os.path.join(self.repo, self.files[pic]))
            sheet = sheets[pic]
            fw, fh = (w * 8, h * 8) if w else (int(info['width']), int(info['height']))
            per_row = sheet.width // fw
            box = ((f % per_row) * fw, (f // per_row) * fh, (f % per_row) * fw + fw, (f // per_row) * fh + fh)
            out.append(colour(sheet.crop(box), pal))
        return out


def colour(img, pal):
    """An indexed frame in RGBA with `pal`, index 0 see-through."""
    src = img.load()
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    px = out.load()
    for y in range(img.height):
        for x in range(img.width):
            v = src[x, y] & 15
            if v:
                px[x, y] = pal[v] + (255,)
    return out


def strip(frames):
    """9 frames side by side: the first 9 (a table with fewer repeats its standing frames for walking: 0, 1, 2)."""
    if len(frames) < FRAMES:
        frames = [frames[i if i < len(frames) else [0, 1, 2, 0, 0, 1, 1, 2, 2][i] % len(frames)] for i in range(FRAMES)]
    w, h = frames[0].size
    out = Image.new('RGBA', (w * FRAMES, h), (0, 0, 0, 0))
    for i, f in enumerate(frames[:FRAMES]):
        out.alpha_composite(f, (i * w, 0))
    return out


# The surfing strips' height: the rider's 32 and the blob's bottom below them (it's drawn 8 down; the user's: facing
# down and up whole). The site reads it as overworld.ts's spriteHeight.
SURF_HEIGHT = 40


def surf_frames(g, repo, who='BRENDAN'):
    """Brendan (or May) on the surf blob, in their palette: the blob's frame for each facing (down, up, left) under theirs,
    32x40 (SURF_HEIGHT): facing down and up the whole blob, as the game draws it (the user's), sideways its top 24 rows."""
    rider = g.frames(f'OBJ_EVENT_GFX_{who}_SURFING')
    blob_sheet = Image.open(os.path.join(repo, 'graphics', 'field_effects', 'pics', 'surf_blob.png'))
    pal = g.palette(f'OBJ_EVENT_PAL_TAG_{who}')
    blobs = [colour(blob_sheet.crop((i * 32, 0, i * 32 + 32, 32)), pal) for i in range(3)]
    facing = [0, 1, 2, 0, 0, 1, 1, 2, 2]
    out = []
    for i in range(FRAMES):
        f = Image.new('RGBA', (32, SURF_HEIGHT), (0, 0, 0, 0))
        # The blob a little below him, as the game draws it (he sits on its back).
        f.alpha_composite(blobs[facing[i]] if facing[i] in (0, 1) else blobs[facing[i]].crop((0, 0, 32, 24)), (0, 8))
        f.alpha_composite(rider[i], (0, 0))
        out.append(f)
    return out


def main():
    repo = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(REPO, 'apps', 'web', 'public', 'overworld', 'rse')
    os.makedirs(out, exist_ok=True)
    g = Graphics(repo)
    for name, gfx in SPRITES.items():
        frames = surf_frames(g, repo, name.split('_')[0].upper()) if name.endswith('_surf') else g.frames(gfx)
        if name == 'item_ball':
            # One small frame, padded to the others' 16x32 at the bottom, as FireRed's.
            ball = Image.new('RGBA', (16, 32), (0, 0, 0, 0)); ball.alpha_composite(frames[0], (0, 16)); frames = [ball]
        strip(frames).save(os.path.join(out, name + '.png'))
    trainers = os.path.join(REPO, 'apps', 'web', 'public', 'trainers')
    for boss, gfx in BOSSES.items():
        for i, gid in enumerate(gfx if isinstance(gfx, tuple) else (gfx,)):
            strip(g.frames(gid)).save(os.path.join(out, (boss if not isinstance(gfx, tuple) else gid.replace('OBJ_EVENT_GFX_', '').lower()) + '.png'))
        # The run picker's: the standing frame facing down, cropped; Tate and Liza side by side.
        downs = [g.frames(gid)[0] for gid in (gfx if isinstance(gfx, tuple) else (gfx,))]
        crops = [f.crop(f.getbbox()) for f in downs]
        pic = Image.new('RGBA', (sum(c.width for c in crops) + (len(crops) - 1), max(c.height for c in crops)), (0, 0, 0, 0))
        x = 0
        for c in crops:
            pic.alpha_composite(c, (x, pic.height - c.height)); x += c.width + 1
        pic.save(os.path.join(trainers, boss + '.png'))
    print('wrote', len(SPRITES) + len(BOSSES), 'sprites to', out)


if __name__ == '__main__':
    main()
