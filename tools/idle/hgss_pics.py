"""Makes the Idle Adventure's Johto pictures (README: Idle Adventure, Johto; issue #170, step 5) from a checkout of the
pret/pokeheartgold decompilation, as HeartGold draws them: apps/web/public/idle/gen2/ and
packages/idle/src/data/gen2/pics.ts

  pokemon/front/<id>.png, pokemon/back/<id>.png, pokemon/shiny/front/<id>.png, pokemon/shiny/back/<id>.png
                      species 1-493, 80x80 RGBA, colour 0 see-through, from files/poketool/pokegra/pokegra/<NNNN>/
                      <male|female>/<front|back>.png (160x80, indexed: two 80x80 frames, the first used). By
                      tools/scripts/make_pokegra.py the normal palette is the front PNG's and the shiny palette the back
                      PNG's, so the normal front is front.png's pixels in front.png's palette, the normal back is back.png's
                      pixels in front.png's palette, the shiny front front.png's pixels in back.png's palette and the shiny
                      back back.png as it is. The palettes are taken as make_pokegra takes them: the female files' when
                      they aren't empty, else the male files' (they are the same wherever both exist, but the tool prints
                      the count that differ); the pixels are the male files' (a species whose male files are empty, 0
                      bytes, a female-only one, uses the female ones). Where the female files are non-empty and differ
                      from the male ones, <id>f.png is written in each of the four folders too (gender differences).
  pokemon/icon/<id>.png
                      the party icon, two 32x32 frames stacked (32x64): files/poketool/icongra/poke_icon/
                      poke_icon_<species + 7>.png (GetMonIconNaixEx: the NARC member is the species + 7), its 4-bit
                      indices in the palette sPokemonPalNoBySpeciesAndForm (src/pokemon_icon_idx.c) gives, one of
                      poke_icon_00000000.pal's three 16-colour palettes (the NARC's member 0, the party menu's
                      GetMonIconPaletteEx), colour 0 see-through
  trainers/<pic>.png  the front pic of each trainer class packages/idle/src/data/gen2/trainers.ts names in its `pic`s
                      (the class's name, TRAINERCLASS_YOUNGSTER: 'youngster'): the first 80x80 frame of the class's
                      member 5 * class + 4 of a/0/5/8 (the trainer front graphics: sub_02070D3C, file ids 5 a class: NCGR,
                      NCLR, NCER, NANR and a 160x80 bitmap NCBR, the pic), a bitmap unscrambled as UnscanPokepic_DP
                      (src/pokepic.c) does it for this archive, in the class's NCLR (first 16 colours), colour 0
                      see-through. The files are read from the checkout's files/a/0/5/8 (the NARC as the build makes it)
  trainers/hero_back_sheet.png, trainers/heroine_back_sheet.png
                      Ethan's (TRAINER_BACKPIC_ETHAN, 0) and Lyra's (1) battle back pics, every cell of the NCER (a/0/0/6,
                      member 5 * back pic + 2) drawn from its OAMs (each cell 4bpp tiles of its own, VRAM transfer table)
                      in the NCLR (member 5 * back pic + 1, palette 0) and stacked vertically, 8 frames of 96x84: the
                      sprite's origin at (40, 40) of each frame (the cells run from -40 to 56 across and -40 to 44 down). The NANR (member
                      5 * back pic + 3) has two sequences: 0 is cell 0 held, 1 the throw: cells 0 to 7 then 0 for 8, 16, 6, 2,
                      4, 2, 2, 52 and 2 ticks (1/60 s): 0 stands, 1 and 2 wind up, 3 releases (the arm out), 4 to 7 hold the
                      follow-through (the sprite slides a pixel a frame) until the pic goes back to 0
  packages/idle/src/data/gen2/pics.ts
                      JOHTO_PICS: each species' battle pic offsets (files/poketool/pokegra/height.narc, GetMonPicHeight
                      BySpeciesGenderForm in src/pokemon.c: the species' member 4 * species + facing + (male ? 1 : 0), a
                      byte, the male's unless its file is empty)

Usage: python tools/idle/hgss_pics.py <pokeheartgold checkout>. Needs Pillow; reads the Nitro formats with tools/extras/nitro.py."""
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'extras'))
import nitro  # noqa: E402
from PIL import Image  # noqa: E402

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen2')
POKEGRA = os.path.join(SRC, 'files', 'poketool', 'pokegra', 'pokegra')
SPECIES = 493


def read(path):
    return open(os.path.join(SRC, path), encoding='utf8').read()


def save(img, *parts):
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def indexed(path):
    """A 160x80 pokegra PNG: its first frame's palette indices (80x80) and its colours (RGB triples), or None if the file is empty."""
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    im = Image.open(path)
    assert im.mode == 'P' and im.size == (160, 80), (path, im.mode, im.size)
    flat = im.getpalette()
    return im.crop((0, 0, 80, 80)).tobytes(), [tuple(flat[3 * i:3 * i + 3]) for i in range(len(flat) // 3)]


def colour(idx, pal, w, h):
    """Palette indices drawn in `pal` (RGB triples or RGBA), index 0 see-through."""
    img = Image.new('RGBA', (w, h))
    cols = [tuple(c[:3]) + (255,) for c in pal]
    img.putdata([cols[i] if i and i < len(cols) else (0, 0, 0, 0) for i in idx])
    return img


# The Pokémon pictures
height = nitro.narc(open(os.path.join(SRC, 'files', 'poketool', 'pokegra', 'height.narc'), 'rb').read())
pics = {}
female_only, gendered, palette_differs = [], [], 0
for n in range(1, SPECIES + 1):
    d = os.path.join(POKEGRA, '%04d' % n)
    sides = {g: {f: indexed(os.path.join(d, g, f + '.png')) for f in ('front', 'back')} for g in ('male', 'female')}
    base = 'male' if sides['male']['front'] else 'female'
    assert sides[base]['front'] and sides[base]['back'], n
    if base == 'female':
        female_only.append(n)

    def write(g, name):
        front_px, front_pal = sides[g]['front']
        back_px, back_pal = sides[g]['back']
        # make_pokegra.py: the palettes come from the first of female, male whose file isn't empty.
        pg = 'female' if sides['female']['front'] else 'male'
        normal, shiny = sides[pg]['front'][1], sides[pg]['back'][1]
        for folder, px, pal in (('front', front_px, normal), ('back', back_px, normal), ('shiny/front', front_px, shiny), ('shiny/back', back_px, shiny)):
            save(colour(px, pal, 80, 80), 'pokemon', *folder.split('/'), name + '.png')

    write(base, str(n))
    if base == 'male' and sides['female']['front'] and sides['female']['back']:
        if sides['male']['front'][1] != sides['female']['front'][1] or sides['male']['back'][1] != sides['female']['back'][1]:
            palette_differs += 1
        if any(sides['female'][f][0] != sides['male'][f][0] for f in ('front', 'back')):
            write('female', '%df' % n)
            gendered.append(n)
    # height.narc: species * 4 + facing (0 back, 2 front, MON_PIC_FACING_*) + (male ? 1 : 0); an empty member is a gender the species lacks.
    def offset(facing):
        for g in (1, 0):
            m = height[n * 4 + facing + g]
            if m:
                return m[0]
        raise AssertionError(n)
    pics[n] = (offset(2), offset(0))
print('pokemon: %d species, female-only %s, gender differences %d (%s), palettes differing between the genders %d' % (SPECIES, female_only, len(gendered), gendered, palette_differs))

# The party icons
icon_dir = os.path.join(SRC, 'files', 'poketool', 'icongra', 'poke_icon')
pal_lines = open(os.path.join(icon_dir, 'poke_icon_00000000.pal'), encoding='utf8').read().split('\n')
icon_cols = [tuple(int(v) for v in l.split()) for l in pal_lines[3:3 + 48]]
table = re.search(r'sPokemonPalNoBySpeciesAndForm\[\] = \{(.*?)\};', read('src/pokemon_icon_idx.c'), re.S).group(1)
icon_pal = [int(v) for v in re.findall(r'\d+', table)]
for n in range(1, SPECIES + 1):
    im = Image.open(os.path.join(icon_dir, 'poke_icon_%08d.png' % (n + 7)))
    assert im.size == (32, 64), n
    p = icon_pal[n]
    save(colour(im.tobytes(), icon_cols[16 * p:16 * p + 16], 32, 64), 'pokemon', 'icon', '%d.png' % n)
print('icons: %d' % SPECIES)

# The trainer classes' front pics
classes = {}
for name, num in re.findall(r'#define TRAINERCLASS_(\w+)\s+(\d+)', read('include/constants/trainer_class.h')):
    classes[re.sub('-+', '-', name.lower().replace('_', '-'))] = int(num)
wanted = sorted(set(re.findall(r"pic: '([^']*)'", open(os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2', 'trainers.ts'), encoding='utf8').read())))
front_arc = nitro.narc(open(os.path.join(SRC, 'files', 'a', '0', '5', '8'), 'rb').read())


def unscan_dp(raw):
    """UnscanPokepic_DP: the 3200 words XORed from the last with a seed starting at it, advanced by lcrngUpdate."""
    w = list(struct.unpack('<%dH' % (len(raw) // 2), raw))
    seed = w[3199]
    for i in range(3199, -1, -1):
        w[i] ^= seed & 0xFFFF
        seed = (seed * 1103515245 + 24691) & 0xFFFFFFFF
    return struct.pack('<%dH' % len(w), *w)


unmapped = []
for pic in wanted:
    if pic not in classes:
        unmapped.append(pic)
        continue
    c = classes[pic]
    pal = nitro.nclr(front_arc[c * 5 + 1])[:16]
    raw = nitro.blocks(nitro.unpack(front_arc[c * 5 + 4]))['RAHC']
    data = unscan_dp(raw[24:24 + 6400])
    px = [v for x in data for v in (x & 15, x >> 4)]
    frame = [px[y * 160 + x] for y in range(80) for x in range(80)]
    save(colour(frame, pal, 80, 80), 'trainers', pic + '.png')
print('trainers: %d pics, unmapped %s' % (len(wanted) - len(unmapped), unmapped))

# The player's back pics
back_arc = nitro.narc(open(os.path.join(SRC, 'files', 'a', '0', '0', '6'), 'rb').read())
W, H, OX, OY = 96, 84, 40, 40
for who, b in (('hero', 0), ('heroine', 1)):
    cells = nitro.ncer(nitro.unpack(back_arc[b * 5 + 2]))
    tiles = nitro.ncgr(nitro.unpack(back_arc[b * 5]))
    pal = nitro.nclr(back_arc[b * 5 + 1])
    sheet = Image.new('RGBA', (W, H * len(cells.cells)))
    for i in range(len(cells.cells)):
        im, (ox, oy) = nitro.draw_cell(cells, i, tiles, pal)
        assert OX - ox >= 0 and OY - oy >= 0 and OX - ox + im.width <= W and OY - oy + im.height <= H, (who, i)
        sheet.alpha_composite(im, (OX - ox, i * H + OY - oy))
    save(sheet, 'trainers', who + '_back_sheet.png')
    print('%s: %d frames' % (who, len(cells.cells)))

# pics.ts
lines = [
    "// Generated by tools/idle/hgss_pics.py from the pret/pokeheartgold decompilation (files/poketool/pokegra/height.narc). Don't edit by hand.",
    '',
    "/** A species' battle picture offsets, as HeartGold has them (the picture's Y in battle is its slot's base plus this: src/battle/battle_io_command.c's `ov07_02234B5C(battlerType, 1) + GetMonPicHeightBySpeciesGenderForm(...)`, the slot bases being 112 for the player's Pokémon, 50 for the opponent's (ov07_022377F4)).",
    ' *  - `frontY`: height.narc\'s byte for the front picture (facing MON_PIC_FACING_FRONT, 2), in pixels: how far down the opponent\'s picture is drawn from its slot\'s base, so that small Pokémon stand on the ground inside their 80x80 picture.',
    " *  - `backY`: the same for the back picture (MON_PIC_FACING_BACK, 0), the player's Pokémon's.",
    " *  - `elevation`: HeartGold has no equivalent of FireRed's elevation (a flying Pokémon's shadow height: its shadow is a fixed one under every battler); always 0.",
    " * Both bytes are the male's, or the female's for a female-only species (GetMonPicHeightBySpeciesGenderForm reads the member 4 * species + facing + (male ? 1 : 0)); a gender's own difference isn't kept. */",
    'export const JOHTO_PICS: Record<number, { frontY: number; backY: number; elevation: number }> = {',
]
for n in range(1, SPECIES + 1):
    lines.append('  %d: { frontY: %d, backY: %d, elevation: 0 },' % (n, pics[n][0], pics[n][1]))
lines += ['};', '']
with open(os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2', 'pics.ts'), 'w', encoding='utf8', newline='\n') as f:
    f.write('\n'.join(lines))
print('pics.ts: %d species' % SPECIES)
