"""Makes the Idle Adventure's party screen pictures (README: Idle Adventure, the party overlay) from a checkout of the
pret/pokefirered decompilation, as FireRed draws its party menu (src/party_menu.c): apps/web/public/idle/gen1/party/

  bg.png              the screen's background (graphics/party_menu/bg.bin over bg.png's tiles, its 11 palettes), its own
                      CANCEL button covered (the overlay draws one)
  slot.png, slot_selected.png, slot_fainted.png, slot_fainted_selected.png
                      a party slot without its HP bar (slot_wide_no_hp.bin: the user's), narrowed to SLOT_TILES tiles
                      (its first column, its middle repeated, its last), in the colours LoadPartyBoxPalette gives it: its
                      window's palette (4) with colours 1, 4-8 taken from the palette buffer (sPartyBoxEmptySlotPalIds1/2,
                      sPartyBoxCurrSelectionPalIds1/2, sPartyBoxFaintedPalIds1/2, sPartyBoxCurrSelectionFaintedPalIds)
  cancel.png          the CANCEL button's frame (cancel_button.bin, 7 by 2 tiles, palette 1: CopyToBgTilemapBufferRect's 17)
  pokeball.png        the Poké Ball a slot's Pokémon sits on (pokeball.png, two 32x32 frames: closed, open)
  types/<type>.png    a type's label (graphics/interface/menu_info.png), for the Pokémon's panel

and prints the colours the screen's text and HP bars use (the palette buffer's), for PartyOverlay.tsx.

Usage: python tools/idle/party_menu.py <pokefirered checkout>. Needs Pillow."""
import os
import struct
import sys

from PIL import Image

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen1', 'party')
GFX = os.path.join(SRC, 'graphics', 'party_menu')

bg = Image.open(os.path.join(GFX, 'bg.png'))
# The 11 palettes (176 colours) the game loads with the background (gPartyMenuBg_Pal) and copies to its palette buffer.
flat = bg.getpalette()[:176 * 3]
PAL = [tuple(flat[i * 3:i * 3 + 3]) for i in range(176)]
TILES_W = bg.width // 8
px = bg.load()


def tile(n):
    """A tile of bg.png's tileset: its 64 colour indexes within a palette (0-15)."""
    tx, ty = n % TILES_W, n // TILES_W
    return [[px[tx * 8 + x, ty * 8 + y] & 15 for x in range(8)] for y in range(8)]


def draw(entries, w, h, palette_of, transparent=True):
    """A picture from tilemap entries (tile, flips, palette), each tile's colours from `palette_of(entry palette)`."""
    img = Image.new('RGBA', (w * 8, h * 8), (0, 0, 0, 0))
    out = img.load()
    for i, (t, hf, vf, p) in enumerate(entries):
        cx, cy = (i % w) * 8, (i // w) * 8
        pal = palette_of(p)
        rows = tile(t)
        for y in range(8):
            for x in range(8):
                c = rows[7 - y if vf else y][7 - x if hf else x]
                if c == 0 and transparent:
                    continue
                out[cx + x, cy + y] = pal[c] + (255,)
    return img


def u16s(name):
    data = open(os.path.join(GFX, name), 'rb').read()
    return list(struct.unpack('<%dH' % (len(data) // 2), data))


def entry(e):
    return (e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1, e >> 12)


os.makedirs(OUT, exist_ok=True)

# The background: the screen's 30 by 20 tiles of its 32-wide map.
bgmap = u16s('bg.bin')
screen = draw([entry(bgmap[y * 32 + x]) for y in range(20) for x in range(30)], 30, 20, lambda p: PAL[p * 16:p * 16 + 16], transparent=False)
# The background's own CANCEL button (bg1 tiles 23-29 by 17-18, cancel_button.bin's place) is covered with the two rows of
# tiles above it: the overlay draws its CANCEL (cancel.png) where it puts it, so the background's mustn't show behind it.
screen.paste(screen.crop((23 * 8, 15 * 8, 30 * 8, 17 * 8)), (23 * 8, 17 * 8))
screen.save(os.path.join(OUT, 'bg.png'))

# A wide slot: its tiles (u8 numbers into the tileset) in its window's palette with the box colours swapped in.
WINDOW_PAL = 4
# Without its HP bar (the user's), its every middle column the same tile: narrowed to SLOT_TILES (the overlay's).
SLOT_TILES = 11
WIDE = list(open(os.path.join(GFX, 'slot_wide_no_hp.bin'), 'rb').read())
SLOT = [WIDE[r * 18 + c] for r in range(3) for c in [0] + [1] * (SLOT_TILES - 2) + [17]]
OFFSETS1, OFFSETS2 = (4, 5, 6), (1, 7, 8)
STATES = {
    'slot': ((52, 53, 54), (49, 55, 56)),
    'slot_selected': ((116, 117, 118), (97, 103, 104)),
    'slot_fainted': ((84, 85, 86), (81, 87, 88)),
    'slot_fainted_selected': ((148, 149, 150), (97, 103, 104)),
}
for name, (ids1, ids2) in STATES.items():
    pal = list(PAL[WINDOW_PAL * 16:WINDOW_PAL * 16 + 16])
    for o, i in zip(OFFSETS1 + OFFSETS2, ids1 + ids2):
        pal[o] = PAL[i]
    draw([(t, 0, 0, 0) for t in SLOT], SLOT_TILES, 3, lambda p, pal=pal: pal).save(os.path.join(OUT, name + '.png'))

# The CANCEL button's frame (its text is drawn over it).
draw([(e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1, 1) for e in u16s('cancel_button.bin')], 7, 2, lambda p: PAL[p * 16:p * 16 + 16]).save(os.path.join(OUT, 'cancel.png'))

# The slot's Poké Ball sprite (its own palette).
ball = Image.open(os.path.join(GFX, 'pokeball.png'))
bpal = ball.getpalette()
bpx = ball.load()
sprite = Image.new('RGBA', ball.size, (0, 0, 0, 0))
spx = sprite.load()
for y in range(ball.height):
    for x in range(ball.width):
        c = bpx[x, y] & 15
        if c:
            spx[x, y] = tuple(bpal[c * 3:c * 3 + 3]) + (255,)
sprite.save(os.path.join(OUT, 'pokeball.png'))

# The types' labels (graphics/interface/menu_info.png: 32x12 each, four to a row under its two balls), as the summary
# screen shows them, by our type names.
TYPES = [['normal', 'fire', 'water', 'grass'], ['electric', 'rock', 'ground', 'ice'], ['flying', 'fighting', 'ghost', 'bug'], ['poison', 'psychic', 'steel', 'dark'], ['dragon', 'mystery']]
info = Image.open(os.path.join(SRC, 'graphics', 'interface', 'menu_info.png')).convert('RGBA')
os.makedirs(os.path.join(OUT, 'types'), exist_ok=True)
for row, names in enumerate(TYPES):
    for col, name in enumerate(names):
        info.crop((col * 32, 16 + row * 16, col * 32 + 32, 16 + row * 16 + 12)).save(os.path.join(OUT, 'types', name + '.png'))

# The colours PartyOverlay.tsx uses: the HP bar's (green, yellow, red: their two shades) and the genders'.
def hexc(i):
    return '#%02x%02x%02x' % PAL[i]


print('hp green', hexc(57), hexc(58), 'yellow', hexc(73), hexc(74), 'red', hexc(89), hexc(90))
print('male', hexc(59), hexc(60), 'female', hexc(75), hexc(76))
print('window palette', [hexc(WINDOW_PAL * 16 + i) for i in range(16)])
print('wrote', OUT)
