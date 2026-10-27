"""Makes the Extras page's Super Contest pictures from the pret/pokeplatinum and pret/pokediamond decompilations, as
Pokémon Platinum has them, with nitro.py (the DS graphics decoder beside this file):

- the 100 accessories (imageclip members 1-100: 4bpp bitmap characters drawn as software sprites, ov22_02255ACC; their
  palette is member 0, the 16 colours of slot member235[id], ov22_02257F50's unk_0C[]; colour 0 clear, as
  ov22_02255420's touch test treats it): accessories/<id>.png, at the game's size, placed by their top-left corner;
- the 18 backdrops (members 134 + 4b: characters, palette, screen, second screen; ov22_02257C88 draws the screen at
  136,16 on the dressing room's BG2 in palette 13, and ov22_0225AF44 swaps it with the second screen every 17 frames):
  backdrops/<b>.png and backdrops/<b>-2.png (112x128), and their 32x32 thumbnails (members 206-223 in the backdrop's
  palette, ov22_02255B50): backdrops/thumbs/<b>.png;
- the dressing room (overlay022: ov22_02255094's BG templates, ov22_02256948, ov22_02258354, ov22_0225A6E0,
  ov22_0225A218, ov22_0225A914, ov22_0225AB54): its touch screen (main) and top screen (sub), each layer and composed;
  its sprites (the bottom buttons, the top screen's accessory counter and timer digits);
- the Acting Competition (ov17_0223B140, ov17_022413D8, ov17_0223F7E4, ov17_02241270), the Dance Competition
  (ov17_0223DAD0, ov17_0224A0FC, ov17_022492DC), the Visual Competition's stage (ov17_0223CB1C) and the results
  (ov17_0224F4D4, ov17_02250744) from Platinum's prebuilt contest_bg.narc and contest_obj.narc: each screen's layers
  and composition, and every sprite set the code loads, each cell drawn from its OAMs onto a sheet with its origin, and
  the animations;
- gfx.json: every file with its size, source members and, where the code says, where and on which screen and BG layer
  the game draws it.

Usage: python tools/extras/platinum_contest_gfx.py <pokeplatinum checkout> <pokediamond checkout>
Needs Pillow."""
import glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nitro  # noqa: E402
from PIL import Image  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'extras', 'contest')
CONTEST_TYPES = ['cool', 'beauty', 'cute', 'smart', 'tough']
MAGENTA = (255, 0, 255, 255)


class Archive:
    """A NARC's members by index, unpacked."""

    def __init__(self, name, members):
        self.name, self.m = name, [nitro.unpack(x) for x in members]

    def __getitem__(self, i):
        return self.m[i]


def diamond_folder(folder):
    files = sorted(glob.glob(os.path.join(folder, 'narc_*')))
    return [open(f, 'rb').read() for f in files]


def text(repo, bank):
    return [m.get('en_US') for m in json.load(open(os.path.join(repo, 'res', 'text', bank + '.json'), encoding='utf-8'))['messages']]


def save(img, rel):
    path = os.path.join(PUBLIC, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return rel.replace('\\', '/')


def palette_ram(ops):
    """BG or OBJ palette RAM (256 colours) built from (archive, member, first colour, count, destination colour) loads,
    in order, as PaletteData_LoadBuffer* does; unset colours magenta."""
    ram = [MAGENTA] * 256
    for arc, member, src, count, dest in ops:
        cols = nitro.nclr(arc[member]) if not isinstance(member, list) else member
        for i in range(count):
            if src + i < len(cols) and dest + i < 256:
                ram[dest + i] = cols[src + i]
    return ram


def layer_image(arc, chars, screen, ram, clear0=True, palette=None, tiles=None):
    """A BG layer: the screen drawn with its characters; `palette` forces every entry's palette (Bg_ChangeTilemapRectPalette)."""
    scr = nitro.nscr(arc[screen])
    if palette is not None:
        scr = (scr[0], scr[1], [(t, h, v, palette) for t, h, v, _ in scr[2]])
    return nitro.draw_screen(scr, tiles or nitro.ncgr(arc[chars]), ram, clear0=clear0)


def compose(layers, backdrop, size=(256, 192)):
    """Layers (image, x, y, priority, bg) drawn back to front: higher priority numbers behind, and at equal priority the
    higher BG number behind (BG0 in front), as the DS does; the backdrop colour under everything."""
    out = Image.new('RGBA', size, backdrop)
    for img, x, y, pri, bg in sorted(layers, key=lambda l: (-l[3], -l[4])):
        out.alpha_composite(img.crop((max(0, -x), max(0, -y), img.width, img.height)), (max(0, x), max(0, y)))
    return out


def visible(img, sx=0, sy=0, size=(256, 192)):
    """The 256x192 a BG shows at scroll (sx, sy), wrapping round its map."""
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    for y in range(-(sy % img.height), size[1], img.height):
        for x in range(-(sx % img.width), size[0], img.width):
            out.alpha_composite(img.crop((max(0, -x), max(0, -y), img.width, img.height)), (max(0, x), max(0, y)))
    return out


def sprite_sheet(arc_cells, cells_m, arc_chars, chars_m, ram, base, arc_anims=None, anims_m=None, explicit=False):
    """Every cell of an NCER drawn from its OAMs, side by side with a 2-px gap: (sheet image, [{x, y, w, h, originX,
    originY}], animations). The palette is `base` plus each OAM's own (a SpriteList_Add sprite), or `base` alone with
    `explicit` (SpriteSystem_NewSprite's, which sets the explicit palette to the resource's slot + plttIdx, overriding the
    OAMs')."""
    cells = nitro.ncer(arc_cells[cells_m])
    tiles = nitro.ncgr(arc_chars[chars_m])
    imgs = [nitro.draw_cell(cells, i, tiles, ram, pal_offset=0 if explicit else base, explicit=base if explicit else None) for i in range(len(cells.cells))]
    w = sum(im.width for im, _ in imgs) + 2 * (len(imgs) - 1)
    h = max(im.height for im, _ in imgs)
    sheet = Image.new('RGBA', (max(1, w), max(1, h)), (0, 0, 0, 0))
    rects, x = [], 0
    for im, (ox, oy) in imgs:
        sheet.alpha_composite(im, (x, 0))
        rects.append({'x': x, 'y': 0, 'w': im.width, 'h': im.height, 'originX': ox, 'originY': oy})
        x += im.width + 2
    anims = [a.json() for a in nitro.nanr(arc_anims[anims_m])] if arc_anims is not None else []
    return sheet, rects, anims


def obj_ram(arc, member, count, at=0):
    """OBJ palette RAM with `count` palettes of `member` loaded from slot `at` (SpriteSystem_LoadPalette*)."""
    return palette_ram([(arc, member, 0, 16 * count, 16 * at)])


class Out:
    def __init__(self):
        self.files = {}

    def add(self, key, img, rel, **info):
        if 'screen' in info:
            # The dressing room shows the main engine on the touch screen (ov22_02255094: whichScreenIs3D = SUB, then
            # GXLayers_SwapDisplay); the competitions keep the default, main on top.
            info['lcd'] = ('bottom' if info['screen'] == 'main' else 'top') if key.startswith('dressup') else ('top' if info['screen'] == 'main' else 'bottom')
        self.files[key] = dict(file=save(img, rel), width=img.width, height=img.height, **info)


def sprites(out, BG, OBJ):
    """Every contest_obj sprite set ov17 loads: (key, folder, chars, cells, anims, palette member, palettes loaded,
    plttIdx, what/where the code puts it)."""
    sets = [
        # Shared.
        ('typeIcon-%s' % t, 'shared', c, 49, 50, 4, 3, 1,
         "Contest type icon (%s): ov17_0224F0BC loads char %d (Unk_ov17_02254A90 by contest type), cell 49, anim 50; ov17_0224F154 uses plttIdx 1 (Unk_ov17_02254A88) of the acting touch screen's OBJ palette (contest_obj 4, 3 palettes, sub OBJ). Acting move buttons: Unk_ov17_02253298 (39,48), (167,48), (39,144), (167,144) on the touch screen." % (t, c))
        for t, c in zip(CONTEST_TYPES, [48, 52, 51, 53, 54])
    ] + [
        ('decorations', 'shared', 73, 74, 75, 7, 3, 0,
         'Six spinning ornaments along the bottom (ov17_0223F560/ov17_0223F630, Visual Competition and results): Unk_ov17_022531CC positions (13,172) anim 1, (37,164) 1, (64,176) 0, (192,176) 0, (219,164) 1, (243,172) 1, each rotated by -0x180, 0x300, -0x80, 0x80, -0x300, 0x180 (of 0x10000) a frame; palette contest_obj 7.'),
        # Acting Competition, main screen (OBJ palette: contest_obj 0, 6 palettes).
        ('judge-0', 'acting', 31, 32, 30, 1, 1, 0, 'Judge at position 0 (ov17_02241720 case 0: char 31, palette contest_obj 1, cell 32, anim 30) at (96, 40). The sprite goes by seat, not by which judge sits there.'),
        ('judge-1', 'acting', 37, 38, 36, 3, 1, 0, 'Judge at position 1 (case 1: char 37, palette contest_obj 3, cell 38, anim 36) at (128, 40).'),
        ('judge-2', 'acting', 34, 35, 33, 2, 1, 0, 'Judge at position 2 (default case: char 34, palette contest_obj 2, cell 35, anim 33) at (160, 40).'),
        ('judgeMarker-0', 'acting', 39, 40, 41, 0, 6, 2, 'Marker over judge 0 (ov17_022418A4: plttIdx 2) at (96, 32).'),
        ('judgeMarker-1', 'acting', 39, 40, 41, 0, 6, 4, 'Marker over judge 1 (plttIdx 4) at (128, 32).'),
        ('judgeMarker-2', 'acting', 39, 40, 41, 0, 6, 5, 'Marker over judge 2 (plttIdx 5) at (160, 32).'),
        ('judgeCursor', 'acting', 20, 19, 18, 0, 6, 0, 'Cursor under the judge the player picked (ov17_02241D94, Unk_ov17_02253854) at (96 + 32 x judge, 56).'),
        ('hearts', 'acting', 17, 16, 15, 0, 6, 3, "Appeal hearts in each contestant's row (ov17_02241F34, Unk_ov17_02253888): heart k (0-5) of row n at (5 + 8k, 43 + 48n) (Unk_ov17_0225370C); anim = which lap of 6 (k / 6), each popping in at 0.1 to 1.5 to 1.0 scale."),
        ('voltage', 'acting', 26, 25, 24, 0, 6, 2, "Voltage points by each judge (ov17_02242260, Unk_ov17_022537EC): point k (0-4) of judge j at (88 + 32j + 5k, 12) (Unk_ov17_022536D8)."),
        ('voltageFly', 'acting', 29, 28, 27, 0, 6, 0, 'The voltage point that flies from the judge (ov17_0224228C, Unk_ov17_0225371C): starts at Unk_ov17_022536E4 (96 + 32j, 20), moves 32 right and 72 down over 10 frames, waits, then flies to its voltage slot over 6 frames.'),
        ('rowIcon', 'acting', 23, 22, 21, 0, 6, 0, "Icon in each contestant's row (ov17_022430AC, Unk_ov17_02253750) at (64, 42 + 48n); anim chosen by the caller."),
        ('judgeReaction', 'acting', 14, 13, 12, 0, 6, 0, 'Reaction over a judge (ov17_02241A24 / ov17_02241A8C, Unk_ov17_022537B8) at Unk_ov17_022536E4 (96 + 32j, 20); anim chosen by the caller.'),
        # Acting Competition, touch screen (sub OBJ palette: contest_obj 4, 3 palettes).
        ('moveHearts-plus', 'acting', 45, 46, 47, 4, 3, 0, "Appeal hearts on a move button (ov17_0224136C, Unk_ov17_02253618, plttIdx 0 for a positive appeal): heart k of button i at Unk_ov17_02253334 (63,52), (191,52), (63,148), (191,148) + 8k; |appeal| / 10 hearts."),
        ('moveHearts-minus', 'acting', 45, 46, 47, 4, 3, 1, 'The same hearts for a negative appeal (Unk_ov17_02253680, plttIdx 1).'),
        ('judgeSelect', 'acting', 42, 43, 44, 4, 3, 0, 'The judge-select highlight on the touch screen (ov17_022412C0, Unk_ov17_0225364C) at (40 + 88 x judge, 96).'),
        # Dance Competition, main screen (OBJ palette: contest_obj 6, 8 palettes).
        ('step-2', 'dance', 58, 62, 63, 6, 8, 2, "A step on the beat bar (ov17_0224A46C, Unk_ov17_02254760; step type 2 = char 58, plttIdx 2): x = (256 - barWidth) / 2 + 256 / (beats x 2) x half-beat, y = Unk_ov17_022549BC[dancer] (176 main, 168/176/184 backups); anim = 0/1 (own/copy) or 2."),
        ('step-3', 'dance', 59, 62, 63, 6, 8, 2, 'Step type 3 (char 59, plttIdx 2).'),
        ('step-1', 'dance', 60, 62, 63, 6, 8, 7, 'Step type 1 (char 60, plttIdx 7).'),
        ('step-4', 'dance', 61, 62, 63, 6, 8, 6, 'Step type 4 (char 61, plttIdx 6).'),
        ('judgement', 'dance', 55, 56, 57, 6, 8, 3, 'The Excellent / Good / Miss bubble (ov17_0224A7E0, Unk_ov17_02254794): anim 0/1/2 with the word printed over it as text; at Unk_ov17_022546CC (128,88) for the main dancer, (48,32), (128,32), (208,32) for the backups.'),
        ('playerMarker', 'dance', 64, 65, 66, 6, 8, 1, "Marker above the player's Pokémon (ov17_0224A9F8 / ov17_0224AA68, Unk_ov17_022547C8): at the Pokémon's position, 40 px up."),
        ('shadow', 'dance', 90, 89, 88, 6, 8, 1, "Each dancer's shadow (ov17_0224AB08, Unk_ov17_02254830), scaled with the dancer's depth."),
        ('notes', 'dance', 96, 95, 94, 6, 8, 3, 'Notes thrown up from a dancer (ov17_0224AD70, Unk_ov17_02254864): anim chosen by the caller, flying off with gravity.'),
        ('beatBall', 'dance', 76, 77, 78, 6, 8, 5, 'The ball bouncing along the beat bar (ov17_0224C384 / ov17_0224C49C, Unk_ov17_022547FC): x = (256 - barWidth) / 2 + progress x barWidth, y = 144 - sin(phase) x 10.'),
        ('beatCursor', 'dance', 99, 98, 97, 6, 8, 2, 'The playhead on the beat bar (ov17_0224B01C / ov17_0224C434, Unk_ov17_0225472C): x = progress x barWidth - 1 + (256 - barWidth) / 2, y = 176. (Platinum only: not in Diamond.)'),
        ('unused93', 'dance', 93, 92, 91, 6, 8, 0, 'Loaded by ov17_0224AC80 but never made into a sprite (ov17_0224ACF4 is empty); drawn here in palette 0.'),
        # Results, main screen (OBJ palette: contest_obj 10, 4 palettes; bars contest_obj 11).
        ('placing', 'results', 84, 83, 82, 10, 4, 3, "Placing badge on each row (ov17_0225122C, Unk_ov17_02254C90) at Unk_ov17_02254BE4 (232, 13 + 32n); anim = the placing."),
        ('bar', 'results', 87, 86, 85, 11, 1, 0, "Score bar pieces (ov17_022513F4, Unk_ov17_02254CC4, palette contest_obj 11): 16-px pieces at x = 48 + offset + 16k, y = 32 + 32 x row; anim = base + length - 1 (base 1 for the Visual Competition's part, 17 the Dance's, 33 the Acting's; length 1-16)."),
        ('sparkles', 'results', 102, 101, 100, 10, 4, 2, 'Sparkles (Unk_ov17_02254C28): anim random 0-8. (Platinum only.)'),
    ]
    out_sprites = {}
    for key, folder, chars, cells, anims, palm, count, idx, note in sets:
        ram = obj_ram(OBJ, palm, count)
        sheet, rects, anim = sprite_sheet(OBJ, cells, OBJ, chars, ram, idx, OBJ, anims, explicit=True)
        rel = '%s/sprites/%s.png' % (folder, key)
        out_sprites[key] = dict(file=save(sheet, rel), width=sheet.width, height=sheet.height, cells=rects, animations=anim,
                                source={'archive': 'contest_obj', 'chars': chars, 'cells': cells, 'anims': anims, 'palette': palm, 'palettesLoaded': count, 'plttIdx': idx},
                                note=note)
    return out_sprites


def acting(out, BG, OBJ):
    # Main screen (ov17_0223B728's BG templates, ov17_0223BBA8, ov17_0223BB14): BG3 chars 1 + screen 2 (512x256, priority
    # 3); BG1 chars 3 + screen 4 (priority 1 once BG2 is up); BG2 chars 3 (at its own char base) + screen 5 (priority 0);
    # BG0 the 3D Pokémon (priority 2); palette contest_bg 30.
    ram = palette_ram([(BG, 30, 0, 256, 0)])
    aud = layer_image(BG, 1, 2, ram)
    aud2 = layer_image(BG, 1, 0, ram)
    bar = layer_image(BG, 3, 4, ram)
    # ov17_02241428 colours each contestant's panel (10x6 tiles at row 6n) with palette Unk_ov17_022536B4 = 6, 7, 10, 11
    # (the player's swapped into 6 by ov17_0223BBA8).
    scr = nitro.nscr(BG[5])
    ents = list(scr[2])
    for n, p in enumerate([6, 7, 10, 11]):
        for y in range(6):
            for x in range(10):
                i = (6 * n + y) * 32 + x
                t, h, v, _ = ents[i]
                ents[i] = (t, h, v, p)
    panels = nitro.draw_screen((scr[0], scr[1], ents), nitro.ncgr(BG[3]), ram)
    out.add('acting.audience', aud, 'acting/bg-audience.png', screen='main', bg=3, priority=3, source='contest_bg chars 1, screen 2, palette 30',
            note='512x256 map (blocks of 256x256); the left 256x192 shows at scroll 0. ov17_022431E8 swaps screens 2 and 0 every 3 frames while the audience cheers.')
    out.add('acting.audience2', aud2, 'acting/bg-audience-cheer.png', screen='main', bg=3, priority=3, source='contest_bg chars 1, screen 0, palette 30', note='The cheering frame (screen 0).')
    out.add('acting.bar', bar, 'acting/bg-bar.png', screen='main', bg=1, priority=1, source='contest_bg chars 3, screen 4, palette 30', note='The bottom bar and message box frame (text printed in it).')
    out.add('acting.panels', panels, 'acting/bg-panels.png', screen='main', bg=2, priority=0, source='contest_bg chars 3, screen 5, palette 30',
            note="The 4 contestants' panels down the left (10x6 tiles each, row 6n), coloured with palettes 6, 7, 10, 11; names printed at y 12 + 48n and 28 + 48n.")
    comp = compose([(visible(aud), 0, 0, 3, 3), (bar, 0, 0, 1, 1), (panels, 0, 0, 0, 2)], ram[0])
    out.add('acting.main', comp, 'acting/main.png', screen='main', note='The stage composed (BG3 audience, BG1 bar, BG2 panels; the 3D Pokémon on BG0 and the sprites not drawn).')

    # Touch screen (ov17_0223F7E4: Unk_ov17_02253558's modes; screens Unk_ov17_02253250 = 8, 7, 6, 10, 29; palettes
    # Unk_ov17_02253238 = 31, 40; sub BG0-3 share char base 0).
    title_ram = palette_ram([(BG, 31, 0, 256, 0)])
    out_types = {}
    for ti, t in enumerate(CONTEST_TYPES):
        # ov17_0223FBD4 loads contest_bg 38's palette for the contest type into slot 2.
        ram_t = list(title_ram)
        ram_t[32:48] = nitro.nclr(BG[38])[16 * ti:16 * ti + 16]
        t9 = nitro.ncgr(BG[9])
        img = compose([(layer_image(BG, 9, 8, ram_t, tiles=t9), 0, 0, 3, 2), (layer_image(BG, 9, 7, ram_t, tiles=t9), 0, 0, 2, 0)], ram_t[0])
        out.add('acting.touch.title.%s' % t, img, 'acting/touch-title-%s.png' % t, screen='sub',
                source='contest_bg chars 9; BG2 screen 8 (priority 3), BG0 screen 7 (priority 2); palette 31 with contest_bg 38 palette %d in slot 2' % ti,
                note='The touch screen between turns (mode 0); the rank and contest name are printed as sprites at (128, 127) and (128, 159). The Dance Competition uses the same screen.')
    ram40 = palette_ram([(BG, 40, 0, 256, 0)])
    t11 = nitro.ncgr(BG[11])
    hearts_bg = layer_image(BG, 11, 29, ram40, tiles=t11)
    out.add('acting.touch.wait', compose([(hearts_bg, 0, 0, 3, 2)], ram40[0]), 'acting/touch-wait.png', screen='sub', source='contest_bg chars 11, screen 29, palette 40', note='Mode 1: the hearts background alone.')
    # Mode 2: move buttons, slots 4-7 the move's contest type colours (Unk_ov17_022534B8 rows: cool 3, beauty 4, cute 1, smart 2, tough 0).
    rows = [3, 4, 1, 2, 0]
    pal_words = TYPE_BUTTON_PALETTES
    for ti, t in enumerate(CONTEST_TYPES):
        ram_t = list(ram40)
        cols = [nitro.rgb555(w) for w in pal_words[16 * rows[ti]:16 * rows[ti] + 16]]
        for s in range(4):
            ram_t[16 * (4 + s):16 * (5 + s)] = cols
        img = compose([(hearts_bg, 0, 0, 3, 2), (layer_image(BG, 11, 6, ram_t, tiles=t11), 0, 0, 2, 0)], ram_t[0])
        out.add('acting.touch.moves.%s' % t, img, 'acting/touch-moves-%s.png' % t, screen='sub', source='contest_bg chars 11; BG2 screen 29, BG0 screen 6; palette 40, slots 4-7 Unk_ov17_022534B8 row %d' % rows[ti],
                note='Mode 2, the move choice: all four buttons in %s colours (each button i takes palette 4 + i in its own move type: ov17_02240424). Buttons (touch rects): (8-120, 8-96), (136-248, 8-96), (8-120, 104-192), (136-248, 104-192). A move that cannot be used (ov17_02243A98) takes palette 40 row 8 instead. Move names printed at Unk_ov17_02253278 (19,32), (147,32), (19,128), (147,128); effect lines at Unk_ov17_02253314.' % t)
    ram_g = list(ram40)
    for s in range(4):
        ram_g[16 * (4 + s):16 * (5 + s)] = ram40[16 * 8:16 * 9]
    out.add('acting.touch.moves.unusable', compose([(hearts_bg, 0, 0, 3, 2), (layer_image(BG, 11, 6, ram_g, tiles=t11), 0, 0, 2, 0)], ram_g[0]), 'acting/touch-moves-unusable.png', screen='sub',
            source='contest_bg chars 11, screen 6, palette 40 with row 8 in slots 4-7', note='The move buttons greyed (palette 40 row 8: a move that cannot be used, or an empty slot).')
    out.add('acting.touch.judges', compose([(hearts_bg, 0, 0, 3, 2), (layer_image(BG, 11, 10, ram40, tiles=t11), 0, 0, 2, 0)], ram40[0]), 'acting/touch-judges.png', screen='sub',
            source='contest_bg chars 11; BG2 screen 29, BG0 screen 10; palette 40', note='Mode 3, the judge choice: three judge buttons and the bottom bar; judge names printed on them.')
    out.files['acting.touch.typePalettes'] = {'note': 'Unk_ov17_022534B8: the move buttons\' 16-colour palettes by contest type (RGB hex), loaded into sub BG slots 4-7.',
                                              'palettes': {t: ['#%02x%02x%02x' % nitro.rgb555(w)[:3] for w in pal_words[16 * rows[i]:16 * rows[i] + 16]] for i, t in enumerate(CONTEST_TYPES)}}


TYPE_BUTTON_PALETTES = [
    0x75CD, 0x7fff, 0x67ff, 0x4bff, 0x2fff, 0x13ff, 0x039f, 0x33E, 0x154D, 0x4fff, 0x2108, 0x7C2B, 0x318C, 0x4631, 0x5AD6, 0x0,
    0x75CD, 0x7fff, 0x7f9f, 0x7f3f, 0x7adf, 0x729f, 0x6a5f, 0x659f, 0x1CED, 0x7f5f, 0x2108, 0x7C2B, 0x318C, 0x4631, 0x5AD6, 0x0,
    0x75CD, 0x7fff, 0x63fc, 0x37f7, 0x2f73, 0x2730, 0x1f0c, 0x16C8, 0x1146, 0x5bf8, 0x2108, 0x7C2B, 0x318C, 0x4631, 0x5AD6, 0x0,
    0x75CD, 0x7fff, 0x4f1f, 0x4adf, 0x467f, 0x3e1f, 0x39bf, 0x00bf, 0x1CED, 0x5b5f, 0x2108, 0x7C2B, 0x318C, 0x4631, 0x5AD6, 0x0,
    0x75CD, 0x7fff, 0x7ff9, 0x7f93, 0x7f0e, 0x7faa, 0x7768, 0x7EC5, 0x2904, 0x7fb7, 0x2108, 0x7C2B, 0x318C, 0x4631, 0x5AD6, 0x0,
]


def dance(out, BG, OBJ):
    # Main screen (ov17_0223E250's templates, ov17_0223E67C): BG3 chars 13 + screen 14 or 15 (ov17_0223F0BC: layout 0 =
    # screen 14, 16 beats, bar 32 tiles wide; layout 1 = screen 15, 12 beats, bar 30 tiles; Unk_ov17_0225312C gives
    # layout 1 to Ultra and Master Rank Cool and Beauty), palette 32, contest_bg 36 in slot 13; BG1 the message box.
    ram = palette_ram([(BG, 32, 0, 256, 0), (BG, 36, 0, 16, 16 * 13)])
    for layout, screen, beats, width in [(0, 14, 16, 256), (1, 15, 12, 240)]:
        img = layer_image(BG, 13, screen, ram)
        out.add('dance.stage%d' % layout, compose([(img, 0, 0, 3, 3)], ram[0]), 'dance/stage-%d.png' % layout, screen='main', bg=3, priority=3,
                source='contest_bg chars 13, screen %d, palette 32 (+36 in slot 13)' % screen,
                note='Layout %d: %d beats, the beat bar %d px wide centred ((256 - %d) / 2). Dancers (3D, BG0 priority 2) at Unk_ov17_022546F4: main (128, 96), backups (48, 40), (128, 40), (208, 40).' % (layout, beats, width, width))
    # Touch screen (ov17_022492DC, Unk_ov17_02254578): mode 0 the title (as acting's: chars 9, screens 7/8, palette 31 +
    # contest_bg 38); mode 1 the four buttons: chars 18, BG0 screen 17 (priority 2), BG2 screen 28 (priority 3), palette 33.
    ram33 = palette_ram([(BG, 33, 0, 256, 0)])
    t18 = nitro.ncgr(BG[18])
    back = layer_image(BG, 18, 28, ram33, tiles=t18)
    out.add('dance.touch', compose([(back, 0, 0, 3, 2), (layer_image(BG, 18, 17, ram33, tiles=t18), 0, 0, 2, 0)], ram33[0]), 'dance/touch.png', screen='sub',
            source='contest_bg chars 18; BG2 screen 28, BG0 screen 17; palette 33',
            note="The dance buttons (touch rects Unk_ov17_02254564): 0 Up/Jump (88-168, 0-80), 1 Front (88-168, 96-176), 2 Left (8-88, 40-120), 3 Right (168-248, 40-120); labels printed at (128,24), (128,120), (48,64), (208,64). Keys: X/Up, B/Down, Y/Left, A/Right.")
    # A press copies 6x12-tile frames of contest_bg 16 (18x12 tiles: three frames) over the button's tiles (ov17_02249B54,
    # Unk_ov17_02254630): button 0 tile column 0, 1 column 18, 2 column 6, 3 column 12; frames from source columns 12, 6, 0.
    press = nitro.ncgr(BG[16])
    for button, dest in enumerate([0, 18, 6, 12]):
        for frame, src in enumerate([12, 6, 0]):
            tiles = list(t18.tiles)
            for row in range(12):
                for col in range(6):
                    tiles[row * 32 + dest + col] = press.tiles[row * 18 + src + col]
            t = nitro.Tiles(t18.depth, tiles, t18.width, t18.height, t18.bitmap, t18.mapping)
            img = compose([(back, 0, 0, 3, 2), (layer_image(BG, 18, 17, ram33, tiles=t), 0, 0, 2, 0)], ram33[0])
            out.add('dance.touch.press.%d.%d' % (button, frame), img, 'dance/touch-press-%d-%d.png' % (button, frame), screen='sub',
                    source='contest_bg 16 columns %d-%d over chars 18 columns %d-%d' % (src, src + 5, dest, dest + 5),
                    note='Button %d pressed, frame %d of 3 (ov17_02249A0C: the frames are Unk_ov17_02254630[0..2], 2 frames each).' % (button, frame))


def results(out, BG, OBJ):
    # Results (ov17_0224F4D4's templates: BG3 priority 3, BG2 priority 1 sharing BG3's char base, BG1 the message box).
    ram = palette_ram([(BG, 35, 0, 256, 0), (BG, 36, 0, 16, 16 * 13)])
    stage = layer_image(BG, 23, 22, ram)
    out.add('results.stage', compose([(stage, 0, 0, 3, 3)], ram[0]), 'results/stage.png', screen='main', bg=3, priority=3,
            source='contest_bg chars 23, screen 22, palette 35 (+36 in slot 13)', note='ov17_022509AC: the stage the winner is announced on (the Visual Competition\'s stage too).')
    ram39 = palette_ram([(BG, 39, 0, 256, 0), (BG, 36, 0, 16, 16 * 13)])
    t27 = nitro.ncgr(BG[27])
    b3 = layer_image(BG, 27, 25, ram39, tiles=t27)
    b2 = layer_image(BG, 27, 26, ram39, tiles=t27)
    out.add('results.board.bg3', b3, 'results/board-bg3.png', screen='main', bg=3, priority=3, source='contest_bg chars 27, screen 25, palette 39')
    out.add('results.board.bg2', b2, 'results/board-bg2.png', screen='main', bg=2, priority=1, source='contest_bg chars 27, screen 26, palette 39')
    out.add('results.board', compose([(b3, 0, 0, 3, 3)], ram39[0]), 'results/board.png', screen='main',
            source='ov17_02250B00: BG3 screen 25 on chars 27, palette 39 (+36 in slot 13)',
            note='The score board as it first shows: BG2 (screen 26, board-bg2.png, priority 1: a dark stage with a spotlight) is drawn only inside windows 0 and 1, which ov17_02250B00 opens empty (G2_SetWndOutsidePlane leaves BG2 out), so it is not composed here.  Pokémon icons at (28, 20 + 32n), bars from x 48 at y 32 + 32n, placings at (232, 13 + 32n); names printed by the code.')
    ram34 = palette_ram([(BG, 34, 0, 256, 0)])
    out.add('results.touch', compose([(layer_image(BG, 19, 20, ram34), 0, 0, 3, 0)], ram34[0]), 'results/touch.png', screen='sub', bg=0,
            source='contest_bg chars 19, screen 20, palette 34', note='The other screen during the results and the Visual Competition (ov17_0224F4D4, ov17_0223CB1C).')
    # The Visual Competition's stage (ov17_0223CB1C): BG3 chars 23 + screen 22, BG2 chars 24 + screen 21, palettes 35,
    # 36 (slot 13), 37 (slot 12).
    ramv = palette_ram([(BG, 35, 0, 256, 0), (BG, 36, 0, 16, 16 * 13), (BG, 37, 0, 16, 16 * 12)])
    v3, v2 = layer_image(BG, 23, 22, ramv), layer_image(BG, 24, 21, ramv)
    out.add('visual.bg2', v2, 'visual/bg2.png', screen='main', bg=2, priority=2, source='contest_bg chars 24, screen 21, palette 35/37')
    out.add('visual.stage', compose([(v3, 0, 0, 3, 3)], ramv[0]), 'visual/stage.png', screen='main', source='ov17_0223CB1C: BG3 22/23',
            note='The Visual Competition: the dressed Pokémon (backdrop, Pokémon and accessories by overlay022) drawn over it. BG2 (bg2.png, screen 21 on chars 24: the dark stage with a spotlight) shows only inside windows 0/1 (ov17_0223CB1C sets their rectangles each frame, ov17_02247A48 turns them on), so it is not composed here.')


def dressing(out, IC, repo):
    f = lambda n: IC[n]
    # Accessories.
    pal0 = nitro.nclr(f(0))
    slots = f(235)
    names = text(repo, 'contest_accessory_names')
    acc = []
    for i in range(100):
        t = nitro.ncgr(f(i + 1))
        cols = [(0, 0, 0, 0)] + nitro.pal16(pal0, slots[i])[1:]
        img = Image.new('RGBA', (t.width * 8, t.height * 8), (0, 0, 0, 0))
        for k, tile in enumerate(t.tiles):
            nitro.draw_tile(img, tile, (k % t.width) * 8, (k // t.width) * 8, cols)
        acc.append({'id': i, 'name': names[i], 'file': save(img, 'accessories/%d.png' % i), 'width': img.width, 'height': img.height, 'palette': slots[i], 'member': i + 1})
    out.files['accessories'] = {'note': "imageclip members 1-100 (bitmap characters), palette member 0's slot member235[id]. A software sprite placed by its top-left corner (the saved x, y): in the dressing room the stage is the 112x128 window at (136, 16) on the touch screen, the Pokémon centred on (192, 56) at first.", 'items': acc}

    # Backdrops: chars 134+4b, palette 135+4b (slot 13), screens 136+4b and 137+4b.
    bnames = text(repo, 'contest_backdrop_names')
    bds = []
    for b in range(18):
        cols = nitro.nclr(f(135 + 4 * b))
        ram = [MAGENTA] * 256
        ram[16 * 13:16 * 14] = cols[:16]
        frames = []
        for k, scr in enumerate([136 + 4 * b, 137 + 4 * b]):
            img = layer_image(IC, 134 + 4 * b, scr, ram, palette=13)
            bgimg = Image.new('RGBA', img.size, ram[16 * 13]); bgimg.alpha_composite(img)
            frames.append(save(bgimg, 'backdrops/%d%s.png' % (b, '' if k == 0 else '-2')))
        thumb = nitro.ncgr(f(206 + b))
        timg = Image.new('RGBA', (thumb.width * 8, thumb.height * 8), (0, 0, 0, 0))
        tcols = [(0, 0, 0, 0)] + cols[1:16]
        for k, tile in enumerate(thumb.tiles):
            nitro.draw_tile(timg, tile, (k % thumb.width) * 8, (k // thumb.width) * 8, tcols)
        bds.append({'id': b, 'name': bnames[b], 'frames': frames, 'thumb': save(timg, 'backdrops/thumbs/%d.png' % b), 'width': 112, 'height': 128,
                    'members': {'chars': 134 + 4 * b, 'palette': 135 + 4 * b, 'screens': [136 + 4 * b, 137 + 4 * b], 'thumb': 206 + b}})
    out.files['backdrops'] = {'note': 'Each backdrop is a 112x128 BG screen (not a full 256x192 screen): ov17/ov22 draw it at (136, 16) on BG2 (priority 2) of the touch screen, in palette slot 13, alternating its two screens every 17 frames (ov22_02259838 with a period of 16). Colour 0 of the palette fills the rest (drawn as its backdrop colour here). Thumbnails: 32x32 software sprites in the backdrop palette\'s first 16 colours.', 'items': bds}

    # The dressing room's touch screen (main): BG1 the frame (121/122, or 123/124 while the backdrop is picked: ov22_02256948
    # with 1), palette 133 in slot 2, priority 0; BG2 the backdrop (above); BG3 the case's box (129/130 accessories,
    # 131/132 backdrops: ov22_02258354) at (8, 129) in a 256x256 map scrolled to y -(16 + 129), then -16 (ov22_022568DC),
    # so it shows at (8, 16) once ov22_022583A0 has slid it 129 px up; priority 3; BG0 the 3D sprites (priority 1).
    ram = [MAGENTA] * 256
    ram[32:48] = nitro.nclr(f(133))[:16]
    names_ = {121: 'frame', 123: 'frame-backdrops', 129: 'case-accessories', 131: 'case-backdrops'}
    pieces = {}
    for ch in (121, 123, 129, 131):
        img = layer_image(IC, ch, ch + 1, ram, palette=2)
        pieces[ch] = img
        out.add('dressup.%s' % names_[ch], img, 'dressup/%s.png' % names_[ch], screen='main', bg=1 if ch < 129 else 3, priority=0 if ch < 129 else 3,
                source='imageclip chars %d, screen %d, palette 133 (slot 2)' % (ch, ch + 1),
                x=0 if ch < 129 else 8, y=0 if ch < 129 else 16,
                note={121: 'The frame while dressing: the left window (8-120, 16-144) shows the case (BG3), the right (136-248, 16-144) the stage (BG2 backdrop and the 3D Pokémon and accessories).',
                      123: 'The frame while choosing a backdrop (ov22_02256948 with 1).',
                      129: "The accessory case's box (112x128), behind the accessories (scattered at random in it by ov22_0225804C).",
                      131: "The backdrop case's box, behind the backdrop thumbnails."}[ch])
    bd0 = nitro.nclr(f(135))
    ram2 = list(ram)
    ram2[16 * 13:16 * 14] = bd0[:16]
    backdrop = layer_image(IC, 134, 136, ram2, palette=13)
    comp = compose([(pieces[121], 0, 0, 0, 1), (backdrop, 136, 16, 2, 2), (pieces[129], 8, 16, 3, 3)], ram[32])
    out.add('dressup.main', comp, 'dressup/main.png', screen='main', note='The touch screen composed with backdrop 0 (Dress Up) and the accessory box (backdrop colour: not set by the code; palette 133 colour 0 used here).')
    # The top screen (sub): BG0 chars 224 + screen 226, palette 225 slot 0 (ov22_0225A6E0); BG1 the message box.
    ram_s = [MAGENTA] * 256
    ram_s[0:16] = nitro.nclr(f(225))[:16]
    top = layer_image(IC, 224, 226, ram_s, palette=0)
    out.add('dressup.top', compose([(top, 0, 0, 1, 0)], ram_s[0]), 'dressup/top.png', screen='sub', bg=0, priority=1, source='imageclip chars 224, screen 226, palette 225',
            note='The top screen while dressing; the message box (BG1, 27x4 tiles at tile 2,19) and the counter and timer sprites over it.')

    # Sprites: the touch screen's buttons (ov22_0225A218: chars 107 + 3s, cells 106 + 3s, anims 105 + 3s; palette 104,
    # 3 palettes) at the positions ov22_02259C58 gives; the top screen's accessory counter (ov22_0225A914: chars 103,
    # cells 102, anims 101, palette 225) and timer digits (ov22_0225AB54: chars 229, cells 228, anims 227, palette 230).
    spr = {}
    places = ['(48, 144) 40x32', '(8, 144) 40x32', '(96, 144) 40x42', '(136, 144) 40x42', '(184, 144) 72x42, its label printed over it (text bank 385, message 0)']
    for s in range(5):
        ram_o = obj_ram(IC, 104, 3)
        sheet, rects, anims = sprite_sheet(IC, 106 + 3 * s, IC, 107 + 3 * s, ram_o, 0, IC, 105 + 3 * s)
        spr['button-%d' % s] = dict(file=save(sheet, 'dressup/sprites/button-%d.png' % s), width=sheet.width, height=sheet.height, cells=rects, animations=anims,
                                    source={'archive': 'imageclip', 'chars': 107 + 3 * s, 'cells': 106 + 3 * s, 'anims': 105 + 3 * s, 'palette': 104},
                                    note='Touch-screen button %d at %s (affine sprite; anim set by its state: ov22_0225A2D0).' % (s, places[s]))
    ram_o = obj_ram(IC, 225, 2)
    for key, chars, cells, anims, palm, base, note in [
        ('counter', 103, 102, 101, 225, 0, 'Accessory slots on the top screen: 2 rows of 10 at (38 + 18i, 104 + 18j); anim 0 used, 1 free (ov22_0225A914 / ov22_0225A9C8).'),
        ('timer', 229, 228, 227, 230, 0, 'Timer digits on the top screen at (103, 58) and (127, 58); anim = digit; palette 1 (the second palette) once 10 seconds or fewer are left, popping in scaled (ov22_0225ACE4, ov22_0225ADC0).'),
        ('timer-low', 229, 228, 227, 230, 1, 'The timer digits in the low-time palette (Sprite_SetExplicitPaletteWithOffset 1).'),
    ]:
        sheet, rects, anim = sprite_sheet(IC, cells, IC, chars, obj_ram(IC, palm, 2), base, IC, anims, explicit=key == 'timer-low')
        spr[key] = dict(file=save(sheet, 'dressup/sprites/%s.png' % key), width=sheet.width, height=sheet.height, cells=rects, animations=anim,
                        source={'archive': 'imageclip', 'chars': chars, 'cells': cells, 'anims': anims, 'palette': palm, 'plttIdx': base}, note=note)
    out.files['dressup.sprites'] = spr


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    repo, diamond = sys.argv[1], sys.argv[2]
    prebuilt = os.path.join(repo, 'res', 'prebuilt', 'contest', 'graphic')
    BG = Archive('contest_bg', nitro.narc(open(os.path.join(prebuilt, 'contest_bg.narc'), 'rb').read()))
    OBJ = Archive('contest_obj', nitro.narc(open(os.path.join(prebuilt, 'contest_obj.narc'), 'rb').read()))
    IC = Archive('imageclip', diamond_folder(os.path.join(diamond, 'files', 'graphic', 'imageclip')))
    out = Out()
    dressing(out, IC, repo)
    acting(out, BG, OBJ)
    dance(out, BG, OBJ)
    results(out, BG, OBJ)
    out.files['sprites'] = sprites(out, BG, OBJ)
    manifest = {
        'source': 'Generated by tools/extras/platinum_contest_gfx.py from pret/pokeplatinum (res/prebuilt/contest/graphic/contest_bg.narc, contest_obj.narc) and pret/pokediamond (files/graphic/imageclip, which Platinum shares).',
        'screens': 'Every screen is 256x192. "screen" is the DS graphics engine (main or sub) and "lcd" where it shows: the competitions keep main on the top screen and sub on the touch screen; the dressing room swaps them (main on the touch screen, ov22_02255094).',
        'layers': 'BG priority 0 is in front, 3 behind; at equal priority BG0 is in front of BG3; sprites draw in front of BG layers of the same or lower priority number.',
        'sprites': 'Each sprite sheet holds a set\'s cells side by side; a cell\'s origin (originX, originY inside its rect) is the point the game positions. Animations: frames of {cell, duration in 1/60 s}, loopStart, playMode (1 forward once, 2 forward loop, 3 ping-pong once, 4 ping-pong loop).',
        'files': out.files,
    }
    with open(os.path.join(PUBLIC, 'gfx.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=1, ensure_ascii=False)
    print('wrote', PUBLIC)


if __name__ == '__main__':
    main()
