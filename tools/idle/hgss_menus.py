"""Makes the Idle Adventure's Johto Poké Mart buy screen and party screen pictures (README: Idle Adventure, the store and
the party overlay) from a checkout of the pret/pokeheartgold decompilation, as HeartGold draws them, with nitro.py (the
DS graphics decoder in tools/extras). Each DS screen is 256x192; every picture is at the game's size, see-through where
the game shows what's behind it (colour 0 of a BG tile or a sprite).

apps/web/public/idle/gen2/shop/ (src/overlay_03/shop_menu.c, the top screen; overlay 31, asm/overlay_31.s, the touch
screen; graphic/shop_gra.narc):

  top.png             the top screen's frame over the field (BG1: shop_gra 2 over shop_gra 0's tiles in shop_gra 1's
                      palette 0, ov03_022571AC): the description band along the bottom and the item icon's box
  bottom.png          the touch screen's list background (sub BG2: shop_gra 17 over shop_gra 16 in shop_gra 15's
                      palettes, ov31_0225D9D4's mode 0): the top bar, the six empty item places, the bottom bar
  bottom_quantity.png the quantity screen's background (shop_gra 19, mode 1: the item's box, IN BAG's, the quantity box)
  bottom_confirm.png  the confirm screen's background (shop_gra 20, mode 2: the quantity box gone)
  panels_<n>.png      the item panels for a page of n items, 1 to 6 (sub BG1: shop_gra 18, cut down as ov31_0225E060
                      does with its table ov31_0225EF48 for n): see-through elsewhere
  cursor.png          the item cursor (shop_gra 24's cell 0, in palette override 7: shop_gra 22's palette 1)
  cursor_arrow.png, cursor_exit.png, cursor_quantity.png, cursor_box.png
                      the cursors for the page arrows (cell 4), the exit button (cell 7), the quantity arrows (cell 16)
                      and the 96x32 box (cell 10), in the same palette
  arrow_left.png, arrow_right.png, exit.png, button_buy.png, button_cancel.png, quantity_up.png, quantity_down.png
                      the touch screen's buttons (cells 2, 3, 6, 20, 22, 12, 14) in their own palette (OBJ palette 6:
                      shop_gra 22's palette 0), and each <name>_pressed.png in palette 7 (shop_gra 22's palette 1), as
                      ov03_022586E0 flashes a button pressed (the quantity arrows' own flash cells 13 and 15)
  window_std.png      the standard window frame (a/0/3/8 member 0 in palette member 25: LoadUserFrameGfx1), 3 by 3 tiles
  window_msg.png      the message box frame, frame style 1 (a/0/3/8 member 2 in palette member 26: LoadUserFrameGfx2;
                      DrawFrameAndWindow2's 6 by 3 tiles: 2 left, 3 right, the inside white, colour 15)
  items/<item>.png    each item a Johto Poké Mart sells (packages/idle's MARTS, by hgss_data.py) and every TM and HM: its
                      icon (itemtool/itemdata/item_icon, sItemNarcIds in src/item.c), 32x32, centred on the sprite's
                      point as the game draws it

apps/web/public/idle/gen2/party/ (src/party_menu.c, party_menu_sprites.c, party_context_menu.c; graphic/plist_gra.narc):

  bg.png              the touch screen's background (main BG3: plist_gra 17 over plist_gra 15 in plist_gra 16's
                      palettes, colour 0 black: sub_02079A14)
  top.png             the top screen (sub BG1 plist_gra 14 over 12, sub BG0 plist_gra 25 over 24, plist_gra 13's
                      palettes)
  slot_lead_<state>.png, slot_<state>.png
                      a party slot's panel, 128x48 (plist_gra 22's rows 0-5 for the lead, 6-11 for the others,
                      sub_0207CAAC), in the palette sub_0207A7F4 gives it (plist_gra 16's palette 3 + its slot: normal
                      0, selected 4, fainted 2, fainted_selected 6, switch 7 (both slots while two are swapped)), and
                      the same _nohp.png with its HP bar blanked (tile 0x4B over 9 tiles from 6,3: an Egg's,
                      sub_0207A174)
  slot_empty.png      an empty slot's panel (rows 12-17, palette 1: sub_0207A780)
  cursor_lead.png, cursor.png
                      the selection cursor round the lead's and the others' panels (plist_gra 6's cells 1 and 0 in
                      plist_gra 8's palette 0); cursor_lead_white.png, cursor_white.png in palette 1 (the cursor while
                      choosing where to move or give, sub_0207F240); switch_lead.png, switch.png the second cursor
                      (cells 3 and 2) while swapping
  pokeball.png        the Poké Ball a slot's Pokémon sits on (plist_gra 1's cells 0 and 1, closed and open: 32x64)
  cancel.png, cancel_selected.png
                      the CANCEL button (plist_gra 10's cells 0 and 1, 56x32), its text drawn over it
  held_item.png, held_mail.png, held_capsule.png
                      the held item, mail and Ball Capsule markers (plist_gra 19's cells 0-2 in plist_gra 21, 8x8)
  status/<status>.png the status icons (a/0/3/9 members 64/63/65, cells 0-6: pokerus, par, frz, slp, psn, brn, fnt;
                      24x8)
  digits.png          the party screen's number font (graphic/font member 5: 0-9, '/', 'Lv.' as 8x8 cells, the 'Lv.'
                      16 wide), in the party text's colours (MessagePrinter_New(15, 14, 0): white on plist_gra 16's
                      colour 14)

and prints the colours the screens' text and HP bars use.

Usage: python tools/idle/hgss_menus.py <pokeheartgold checkout>. Needs Pillow."""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'extras'))
import nitro  # noqa: E402
from PIL import Image  # noqa: E402

SRC = os.path.abspath(sys.argv[1])
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUBLIC = os.path.join(ROOT, 'apps', 'web', 'public', 'idle', 'gen2')
SHOP = os.path.join(PUBLIC, 'shop')
PARTY = os.path.join(PUBLIC, 'party')
SCREEN = (256, 192)


def raw(path):
    return open(os.path.join(SRC, path), 'rb').read()


def shop(n):
    """A shop_gra.narc member (files/graphic/shop_gra/shop_gra_<n>.*)."""
    folder = os.path.join(SRC, 'files', 'graphic', 'shop_gra')
    return raw(os.path.join(folder, next(f for f in os.listdir(folder) if f.startswith('shop_gra_%05d.' % n))))


def plist(n):
    """A plist_gra.narc member (files/graphic/plist_gra/plist_gra_<n>.*)."""
    folder = os.path.join(SRC, 'files', 'graphic', 'plist_gra')
    return raw(os.path.join(folder, next(f for f in os.listdir(folder) if f.startswith('plist_gra_%08d.' % n))))


A038 = [nitro.unpack(m) for m in nitro.narc(raw('files/a/0/3/8'))]
A039 = [nitro.unpack(m) for m in nitro.narc(raw('files/a/0/3/9'))]


def save(img, folder, name):
    path = os.path.join(folder, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def screen(scr, tiles, colours, opaque):
    """A BG screen cut to the DS screen: opaque (the backdrop, colour 0 of palette 0, behind it) or see-through."""
    w, h, entries = scr
    return nitro.draw_screen((w, h, entries), tiles, colours, size=SCREEN, clear0=not opaque)


def cell(cells, tiles, colours, index, explicit=None):
    """A sprite cell alone, cropped to its OAMs (its origin, the sprite's point, at -its box's left/top)."""
    return nitro.draw_cell(cells, index, tiles, colours, explicit=explicit)[0]


def hexc(c):
    return '#%02x%02x%02x' % c[:3]


# ---- The buy screen ----
os.makedirs(SHOP, exist_ok=True)
top_pal = nitro.nclr(shop(1))[:16]
save(screen(nitro.nscr(shop(2)), nitro.ncgr(shop(0)), top_pal, False), SHOP, 'top.png')

sub_pal = nitro.nclr(shop(15))
sub_tiles = nitro.ncgr(shop(16))
for n, name in ((17, 'bottom'), (19, 'bottom_quantity'), (20, 'bottom_confirm')):
    save(screen(nitro.nscr(shop(n)), sub_tiles, sub_pal, True), SHOP, name + '.png')

# ov31_0225EF48: for each count of items on the page (0-5; 6 leaves the screen as it is), four steps: (1) copy the
# tilemap's own rect at srcX,srcY to dstX,dstY (a panel's bottom edge, row 19, over the joint row below it), or (2)
# clear dstX,dstY's rect (the panels not shown).
PANEL_STEPS = [
    [(0,) * 7, (2, 0, 0, 0, 4, 32, 16), (0,) * 7, (0, 0, 0, 16, 4, 16, 16)],
    [(1, 0, 19, 0, 9, 16, 1), (2, 0, 0, 0, 10, 16, 10), (0,) * 7, (2, 0, 0, 16, 4, 16, 16)],
    [(1, 0, 19, 0, 9, 16, 1), (0,) * 7, (1, 16, 19, 16, 9, 16, 1), (2, 0, 0, 0, 10, 32, 10)],
    [(1, 0, 19, 0, 14, 16, 1), (2, 0, 0, 0, 15, 16, 5), (1, 16, 19, 16, 9, 16, 1), (2, 0, 0, 16, 10, 16, 10)],
    [(1, 0, 19, 0, 14, 16, 1), (0,) * 7, (1, 16, 19, 16, 14, 16, 1), (2, 0, 0, 0, 15, 32, 5)],
    [(0,) * 7, (0,) * 7, (1, 16, 19, 16, 14, 16, 1), (2, 0, 0, 16, 15, 16, 5)],
]
w, h, panel_map = nitro.nscr(shop(18))
for count in range(1, 7):
    m = list(panel_map)
    for kind, sx, sy, dx, dy, rw, rh in (PANEL_STEPS[count] if count < 6 else []):
        for y in range(rh):
            for x in range(rw):
                if kind == 1:
                    m[(dy + y) * 32 + dx + x] = m[(sy + y) * 32 + sx + x]
                elif kind == 2:
                    m[(dy + y) * 32 + dx + x] = (0, 0, 0, 0)
    save(screen((w, h, m), sub_tiles, sub_pal, False), SHOP, f'panels_{count}.png')

# The touch screen's sprites (shop_gra 23/24/25 in shop_gra 22: OBJ palettes 6 and 7, after the six item icons').
obj_tiles, obj_cells, obj_pal = nitro.ncgr(shop(23)), nitro.ncer(shop(24)), nitro.nclr(shop(22))
for name, index in (('cursor', 0), ('cursor_arrow', 4), ('cursor_exit', 7), ('cursor_quantity', 16), ('cursor_box', 10)):
    save(cell(obj_cells, obj_tiles, obj_pal, index, explicit=1), SHOP, name + '.png')
for name, index, pressed in (('arrow_left', 2, None), ('arrow_right', 3, None), ('exit', 6, None), ('button_buy', 20, None), ('button_cancel', 22, None), ('quantity_up', 12, 13), ('quantity_down', 14, 15)):
    save(cell(obj_cells, obj_tiles, obj_pal, index), SHOP, name + '.png')
    save(cell(obj_cells, obj_tiles, obj_pal, pressed) if pressed else cell(obj_cells, obj_tiles, obj_pal, index, explicit=1), SHOP, name + '_pressed.png')


def frame(tiles_member, palette_member, layout, cols, rows):
    """A window frame's tiles laid out (`layout`: tile numbers row by row, None the inside: colour 15)."""
    tiles = nitro.ncgr(A038[tiles_member])
    colours = nitro.nclr(A038[palette_member])[:16]
    img = Image.new('RGBA', (cols * 8, rows * 8), (0, 0, 0, 0))
    for i, t in enumerate(layout):
        x, y = (i % cols) * 8, (i // cols) * 8
        if t is None:
            img.paste(colours[15], (x, y, x + 8, y + 8))
        else:
            nitro.draw_tile(img, tiles.tiles[t], x, y, colours)
    return img


# DrawFrameAndWindow1 (sub_0200E448): tiles 0-8 round the window, 4 its inside. DrawFrameAndWindow2 (sub_0200E6B4): the
# row above 0-5, each row of the window 6, 7, the window, 9, 10, 11, the row below 12-17.
save(frame(0, 25, list(range(9)), 3, 3), SHOP, 'window_std.png')
save(frame(2, 26, [0, 1, 2, 3, 4, 5, 6, 7, None, 9, 10, 11, 12, 13, 14, 15, 16, 17], 6, 3), SHOP, 'window_msg.png')

# The items: every Johto mart's (MARTS) and every TM and HM, by packages/idle's keys (items.ts: the item's name).
data = os.path.join(ROOT, 'packages', 'idle', 'src', 'data', 'gen2')
marts = open(os.path.join(data, 'marts.ts'), encoding='utf8').read()
items_ts = open(os.path.join(data, 'items.ts'), encoding='utf8').read()
key_names = {k: n.replace("\\'", "'") for k, n in re.findall(r"^  '([\w-]+)': \{ name: '((?:[^'\\]|\\.)*)'", items_ts, re.M)}
wanted = {k for k in re.findall(r"'([\w-]+)'", marts.split('= {', 1)[1]) if k in key_names} | {k for k in key_names if re.fullmatch(r'(tm|hm)\d\d', k)}
names = [m.get('en_US') if isinstance(m, dict) else m for m in json.load(open(os.path.join(SRC, 'files/msgdata/msg/msg_0222.json'), encoding='utf8'))['messages']]
icons = {c: (int(g), int(p)) for c, g, p in re.findall(r'\[(ITEM_\w+)\] = \{ \w+, NARC_item_icon_item_icon_(\d+)_NCGR, NARC_item_icon_item_icon_(\d+)_NCLR', raw('src/item.c').decode('utf8'))}
icon_dir = os.path.join(SRC, 'files', 'itemtool', 'itemdata', 'item_icon')
icon_cells = nitro.ncer(raw(os.path.join(icon_dir, 'item_icon_001.NCER')))
# Each item number's constant (the first #define of it that sItemNarcIds has: items.h has aliases).
consts = {}
for c, v in re.findall(r'#define (ITEM_\w+)\s+(\d+)', raw('include/constants/items.h').decode('utf8')):
    if c in icons:
        consts.setdefault(int(v), c)
by_name = {}
for n, name in enumerate(names):
    if n and isinstance(name, str) and n in consts:
        by_name.setdefault(name, consts[n])
done = 0
for k in sorted(wanted):
    const = by_name[key_names[k]]
    g, p = icons[const]
    img = cell(icon_cells, nitro.ncgr(raw(os.path.join(icon_dir, 'item_icon_%03d.NCGR' % g))), nitro.nclr(raw(os.path.join(icon_dir, 'item_icon_%03d.NCLR' % p))), 0)
    save(img, SHOP, os.path.join('items', k + '.png'))
    done += 1

# ---- The party screen ----
os.makedirs(PARTY, exist_ok=True)
main_pal = nitro.nclr(plist(16))
main_pal[0] = (0, 0, 0, 255)  # sub_02079A14: plttBuf[0] = RGB_BLACK
main_tiles = nitro.ncgr(plist(15))
save(screen(nitro.nscr(plist(17)), main_tiles, main_pal, True), PARTY, 'bg.png')
sub_pal = nitro.nclr(plist(13))
top = screen(nitro.nscr(plist(14)), nitro.ncgr(plist(12)), sub_pal, True)
top.alpha_composite(screen(nitro.nscr(plist(25)), nitro.ncgr(plist(24)), sub_pal, False))
save(top, PARTY, 'top.png')

w, h, slots = nitro.nscr(plist(22))


def panel(rows, palette, nohp=False):
    """A slot's 16 by 6 tiles from plist_gra 22 (its first row `rows`), all in one palette (BgTilemapRectChangePalette)."""
    entries = [(slots[(rows + y) * 32 + x][0], slots[(rows + y) * 32 + x][1], slots[(rows + y) * 32 + x][2], palette) for y in range(6) for x in range(16)]
    if nohp:
        for x in range(6, 15):
            entries[3 * 16 + x] = (0x4B, 0, 0, palette)
    return nitro.draw_screen((128, 48, entries), main_tiles, main_pal, clear0=True)


STATES = {'normal': 0, 'selected': 4, 'fainted': 2, 'fainted_selected': 6, 'switch': 7}
for state, slot_pal in STATES.items():
    for rows, prefix in ((0, 'slot_lead_'), (6, 'slot_')):
        save(panel(rows, 3 + slot_pal), PARTY, prefix + state + '.png')
        save(panel(rows, 3 + slot_pal, True), PARTY, prefix + state + '_nohp.png')
save(panel(12, 1), PARTY, 'slot_empty.png')

obj_pal = nitro.nclr(plist(8))
cursor_tiles, cursor_cells = nitro.ncgr(plist(7)), nitro.ncer(plist(6))
for name, index, pal in (('cursor_lead', 1, 0), ('cursor', 0, 0), ('cursor_lead_white', 1, 1), ('cursor_white', 0, 1), ('switch_lead', 3, 0), ('switch', 2, 0)):
    save(cell(cursor_cells, cursor_tiles, obj_pal, index, explicit=pal), PARTY, name + '.png')
ball_tiles, ball_cells = nitro.ncgr(plist(2)), nitro.ncer(plist(1))
ball = Image.new('RGBA', (32, 64), (0, 0, 0, 0))
for i in range(2):
    ball.alpha_composite(cell(ball_cells, ball_tiles, obj_pal, i), (0, i * 32))
save(ball, PARTY, 'pokeball.png')
button_tiles, button_cells = nitro.ncgr(plist(11)), nitro.ncer(plist(10))
save(cell(button_cells, button_tiles, obj_pal, 0), PARTY, 'cancel.png')
save(cell(button_cells, button_tiles, obj_pal, 1), PARTY, 'cancel_selected.png')
held_tiles, held_cells, held_pal = nitro.ncgr(plist(20)), nitro.ncer(plist(19)), nitro.nclr(plist(21))
for i, name in enumerate(('held_item', 'held_mail', 'held_capsule')):
    save(cell(held_cells, held_tiles, held_pal, i), PARTY, name + '.png')
status_tiles, status_cells, status_pal = nitro.ncgr(A039[64]), nitro.ncer(A039[63]), nitro.nclr(A039[65])
for i, name in enumerate(('pokerus', 'par', 'frz', 'slp', 'psn', 'brn', 'fnt')):
    save(cell(status_cells, status_tiles, status_pal, i), PARTY, os.path.join('status', name + '.png'))

# The number font (MessagePrinter_New: colour 1 its letters, 2 their shadow): 0-9, '/', 'Lv.' (glyph 1: two tiles).
font = nitro.ncgr(raw('files/graphic/font/font_00000005.bin'))
digits = Image.new('RGBA', (13 * 8, 8), (0, 0, 0, 0))
ink = [(0, 0, 0, 0), main_pal[15], main_pal[14]] + [(0, 0, 0, 0)] * 13
for i in range(13):
    nitro.draw_tile(digits, font.tiles[i], i * 8, 0, ink)
save(digits, PARTY, 'digits.png')

# The colours PartyOverlay.tsx and the buy screen's text use.
font0 = nitro.nclr(raw('files/graphic/font/font_00000007.bin'))[:16]
font1 = nitro.nclr(raw('files/graphic/font/font_00000008.bin'))[:16]
print('party text', hexc(main_pal[15]), 'shadow', hexc(main_pal[14]))
print('male', hexc(main_pal[3]), hexc(main_pal[4]), 'female', hexc(main_pal[5]), hexc(main_pal[6]))
print('hp green', hexc(main_pal[3 * 16 + 9]), hexc(main_pal[3 * 16 + 10]), 'yellow', hexc(main_pal[4 * 16 + 9]), hexc(main_pal[4 * 16 + 10]), 'red', hexc(main_pal[5 * 16 + 9]), hexc(main_pal[5 * 16 + 10]))
print('font palette 0', [hexc(c) for c in font0])
print('font palette 1', [hexc(c) for c in font1])
print(done, 'items; wrote', SHOP, 'and', PARTY)
