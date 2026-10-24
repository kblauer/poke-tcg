"""Makes the Extras page's Voltorb Flip assets from the pret/pokeheartgold decompilation, as HeartGold/SoulSilver have
them (downloaded once into <cache>/, as the Johto map tools do: tools/routes/hgss/hgss_data.py):

- the screens (files/application/voltorb_flip/): the board (NSCR 4 on tileset 2, the bottom screen's BG0) and the top
  screen's four (NSCR 6 the coins, 7 the hint, 8 how to play, 9 about memos; NSCR 5 isn't used), each drawn 256x192:
  apps/web/public/extras/voltorb-flip/board.png, top_coins.png, top_hint.png, top_howto.png, top_memo.png;
- the bottom screen's tiles (tileset 2 in its palette: the cards and their flips, the numbers, the memo marks), drawn
  in the game's tile order, 32 a row (tiles.png), and the top screen's big coin digits (tileset 3's rows 5-8, each digit
  2x4 tiles: digits.png);
- the sprites (NCER 12 and NANR 13 on the bottom screen, 16 and 17 on the top): each cell drawn from its OAMs onto a
  sheet with its origin, and the animations, in sprites.json; the board cursor's cells (11, the card's; 14, Open Memo's;
  8, Quit's) again in palette 4, as the game overrides it while the memo is open (cells 40, 41 and 42); and each
  screen's backdrop colour;
- the game's sound effects and fanfares, rendered from the SDAT by sdat.py: sounds/<name>.wav;
- the game's text (msg_0039, English): apps/web/src/components/extras/voltorbFlipText.ts.

Usage: python tools/extras/hgss_voltorb_flip.py <cache>
Needs Pillow."""
import json, os, re, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO, 'tools', 'routes', 'hgss'))
import hgss_data  # noqa: E402
import sdat  # noqa: E402
from platinum_extras import OAM_SIZES, draw_tile, nscr_entries, tiles  # noqa: E402

PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'extras', 'voltorb-flip')
TEXT = os.path.join(REPO, 'apps', 'web', 'src', 'components', 'extras', 'voltorbFlipText.ts')
APP = 'files/application/voltorb_flip/voltorb_flip_%08d.%s'
# The sounds voltorb_flip.c and voltorb_flip_input.c play (PlaySE and PlayFanfare).
SOUNDS = ['SEQ_SE_DP_SELECT', 'SEQ_SE_DP_DECIDE', 'SEQ_SE_DP_BOX01', 'SEQ_SE_DP_BOX03', 'SEQ_SE_DP_CARD2', 'SEQ_SE_DP_BUTTON3', 'SEQ_SE_GS_PANERU_MEKURU',
          'SEQ_SE_GS_COIN_HAZURE', 'SEQ_SE_GS_COIN_PAYOUT_ONE', 'SEQ_SE_GS_COIN_PAYOUT_LAST', 'SEQ_SE_GS_OKOZUKAI', 'SEQ_SE_GS_SLOT01', 'SEQ_SE_GS_SLOT03',
          'SEQ_ME_CARDGAME1', 'SEQ_ME_CARDGAME2', 'SEQ_ME_MUSHITORI3']


def nclr(path):
    """A palette file's colours."""
    d = open(path, 'rb').read()
    size, off = struct.unpack('<II', d[16 + 16:16 + 24])
    raw = d[16 + 8 + off:16 + 8 + off + size]
    out = []
    for k in range(len(raw) // 2):
        c = struct.unpack('<H', raw[2 * k:2 * k + 2])[0]
        out.append(((c & 31) * 255 // 31, ((c >> 5) & 31) * 255 // 31, ((c >> 10) & 31) * 255 // 31))
    return out


def ncer(path):
    """A cell file's cells, each its OAMs (x, y, w, h, first tile, palette, flips)."""
    d = open(path, 'rb').read()
    n, attr, off = struct.unpack('<HHI', d[24:32])
    base, rec = 24 + off, 16 if attr == 1 else 8
    cells = []
    for i in range(n):
        count, _, oam = struct.unpack('<HHI', d[base + i * rec:base + i * rec + 8])
        oams = []
        for k in range(count):
            p = base + n * rec + oam + 6 * k
            a0, a1, a2 = struct.unpack('<HHH', d[p:p + 6])
            w, h = OAM_SIZES[a0 >> 14][a1 >> 14]
            flips = not a0 & 0x100
            oams.append({'x': (a1 & 0x1FF) - (512 if a1 & 0x100 else 0), 'y': (a0 & 0xFF) - (256 if a0 & 0x80 else 0), 'w': w, 'h': h, 'tile': a2 & 0x3FF,
                         'pal': a2 >> 12, 'hflip': flips and bool(a1 & 0x1000), 'vflip': flips and bool(a1 & 0x2000)})
        cells.append(oams)
    return cells


def nanr(path):
    """An animation file's sequences: each its frames [cell, frames] and whether it loops (play mode 2)."""
    d = open(path, 'rb').read()
    n, _, seqs, frames, elems = struct.unpack('<HHIII', d[24:40])
    out = []
    for i in range(n):
        count, _, kind, _, mode, first = struct.unpack('<HHHHII', d[24 + seqs + 16 * i:24 + seqs + 16 * i + 16])
        assert kind == 0, 'only cell-index animations'
        steps = []
        for k in range(count):
            elem, length = struct.unpack('<IH', d[24 + frames + first + 8 * k:24 + frames + first + 8 * k + 6])
            steps.append([struct.unpack('<H', d[24 + elems + elem:24 + elems + elem + 2])[0], length])
        out.append({'frames': steps, 'loop': mode == 2})
    return out


def sheet(png, colours, cells, name, override=None):
    """The cells drawn side by side (each its bounding box, its origin given): <name>.png, and their places. `override`
    adds cells again in another palette ({cell: palette}, after the others)."""
    from PIL import Image
    ts = tiles(Image.open(png))
    jobs = [(c, None) for c in range(len(cells))] + [(c, p) for c, p in (override or {}).items()]
    frames, images = [], []
    for c, pal in jobs:
        oams = cells[c]
        if not oams:
            frames.append(None)
            images.append(None)
            continue
        x0, y0 = min(o['x'] for o in oams), min(o['y'] for o in oams)
        x1, y1 = max(o['x'] + o['w'] for o in oams), max(o['y'] + o['h'] for o in oams)
        out = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
        px = out.load()
        # The first OAM is in front: drawn last.
        for o in reversed(oams):
            p = o['pal'] if pal is None else pal
            cols, rows = o['w'] // 8, o['h'] // 8
            for k in range(cols * rows):
                cx, cy = k % cols, k // cols
                if o['hflip']:
                    cx = cols - 1 - cx
                if o['vflip']:
                    cy = rows - 1 - cy
                draw_tile(px, ts[o['tile'] + k], o['x'] - x0 + cx * 8, o['y'] - y0 + cy * 8, colours[16 * p:16 * p + 16], o['hflip'], o['vflip'])
        frames.append({'ox': -x0, 'oy': -y0, 'w': x1 - x0, 'h': y1 - y0})
        images.append(out)
    x = 0
    for f in frames:
        if f:
            f['x'] = x
            x += f['w']
    out = Image.new('RGBA', (x, max(f['h'] for f in frames if f)), (0, 0, 0, 0))
    for f, im in zip(frames, images):
        if f:
            out.paste(im, (f['x'], 0))
    out.save(os.path.join(PUBLIC, name + '.png'))
    return frames


def screen(png, colours, nscr, name):
    """A screen file drawn 256x192 on its tiles (colour 0 see-through)."""
    from PIL import Image
    ts = tiles(Image.open(png))
    w, _, entries = nscr_entries(nscr)
    out = Image.new('RGBA', (256, 192), (0, 0, 0, 0))
    px = out.load()
    for i, e in enumerate(entries):
        tx, ty = i % w, i // w
        if tx < 32 and ty < 24 and (e & 0x3FF) < len(ts):
            p = e >> 12
            draw_tile(px, ts[e & 0x3FF], tx * 8, ty * 8, colours[16 * p:16 * p + 16], bool(e & 0x400), bool(e & 0x800))
    out.save(os.path.join(PUBLIC, name + '.png'))


def tile_sheet(png, colours, name, rows=None):
    """A tileset drawn in its palette 0, 32 tiles a row as the game numbers them (or only `rows` of them)."""
    from PIL import Image
    ts = tiles(Image.open(png))
    first, last = rows or (0, (len(ts) + 31) // 32)
    out = Image.new('RGBA', (256, 8 * (last - first)), (0, 0, 0, 0))
    px = out.load()
    for t in range(first * 32, min(len(ts), last * 32)):
        draw_tile(px, ts[t], (t % 32) * 8, (t // 32 - first) * 8, colours[:16])
    out.save(os.path.join(PUBLIC, name + '.png'))


def text(cache):
    """msg_0039's English messages, by number: {N} for the message's Nth buffered value, the alignment and control codes kept."""
    msgs = json.load(open(hgss_data.fetch(cache, 'files/msgdata/msg/msg_0039.json'), encoding='utf-8'))['messages']
    lines = [
        '// Generated by tools/extras/hgss_voltorb_flip.py from the pret/pokeheartgold decompilation (files/msgdata/msg/msg_0039.json):',
        "// Voltorb Flip's text, by message number. {N} is the message's Nth value, {ALN_CENTER} centres a line, \\n is a new line,",
        "// \\f waits for a press and scrolls a line, \\r waits and clears the box. Don't edit by hand.",
        '',
        'export const VOLTORB_FLIP_TEXT: string[] = [',
    ]
    for m in msgs:
        t = m.get('en_US', '')
        t = ''.join(t) if isinstance(t, list) else t
        t = re.sub(r'\{STRVAR_1 \d+, (\d+), \d+\}', r'{\1}', t)
        lines.append("  '" + json.dumps(t, ensure_ascii=False)[1:-1].replace('\\"', '"').replace("'", "\\'") + "',")
    lines.append('];')
    open(TEXT, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


def main():
    cache = sys.argv[1]
    os.makedirs(os.path.join(PUBLIC, 'sounds'), exist_ok=True)
    f = lambda n, ext: hgss_data.fetch(cache, APP % (n, ext))
    main_bg, sub_bg = nclr(f(0, 'NCLR')), nclr(f(1, 'NCLR'))
    screen(f(2, 'png'), main_bg, f(4, 'NSCR'), 'board')
    for n, name in ((6, 'top_coins'), (7, 'top_hint'), (8, 'top_howto'), (9, 'top_memo')):
        screen(f(3, 'png'), sub_bg, f(n, 'NSCR'), name)
    tile_sheet(f(2, 'png'), main_bg, 'tiles')
    tile_sheet(f(3, 'png'), sub_bg, 'digits', (5, 9))
    hex_of = lambda c: '#%02x%02x%02x' % c
    meta = {
        # Each screen's backdrop (its BG palette's colour 0), behind every layer.
        'backdrop': {'top': hex_of(sub_bg[0]), 'bottom': hex_of(main_bg[0])},
        'main':{'cells': sheet(f(11, 'png'), nclr(f(10, 'NCLR')), ncer(f(12, 'NCER')), 'sprites', {11: 4, 14: 4, 8: 4}), 'anims': nanr(f(13, 'NANR'))},
        'sub': {'cells': sheet(f(15, 'png'), nclr(f(14, 'NCLR')), ncer(f(16, 'NCER')), 'sprites_sub'), 'anims': nanr(f(17, 'NANR'))},
    }
    json.dump(meta, open(os.path.join(PUBLIC, 'sprites.json'), 'w'), separators=(',', ':'))
    text(cache)
    archive = sdat.Sdat(hgss_data.fetch(cache, 'files/data/sound/gs_sound_data.sdat'))
    for name in SOUNDS:
        sdat.nds_render.m4a_render.write_wav(os.path.join(PUBLIC, 'sounds', name.replace('SEQ_', '').lower() + '.wav'), archive.render(name), 0.7)


if __name__ == '__main__':
    main()
