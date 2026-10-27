"""Cuts the status condition tags out of the user's screenshot, with transparent backgrounds, and letters the blank (pink,
spiral) one CONFUSED from the other tags' letters (C made from the O). Writes PNGs into the output folder."""
import colorsys
import sys
from collections import deque
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
cells = {
    'poisoned': (262, 0, 511, 75), 'sleep': (0, 80, 255, 155), 'burned': (262, 80, 511, 155),
    'paralyzed': (262, 158, 511, 232), 'blank': (0, 234, 262, 318), 'fainted': (0, 0, 255, 75),
}


def sat_val(p):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return h, s, v


def is_bg(p):
    h, s, v = sat_val(p)
    green = p[1] > p[0] + 40 and p[1] > p[2] + 30
    return (s < 0.09 and v > 0.7) or green


def cut(box):
    """The tag with its background (white, or the blank's grey and green specks) flooded from the edges to transparent."""
    t = im.crop(box)
    w, h = t.size
    px = t.load()
    seen = set()
    q = deque((x, y) for x in range(w) for y in (0, h - 1)) + deque((x, y) for x in (0, w - 1) for y in range(h))
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # Green specks not touching the edge, and a dark line along the bottom of the blank's cell.
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] and (p[1] > p[0] + 40 and p[1] > p[2] + 30 or max(p[:3]) < 60):
                px[x, y] = (0, 0, 0, 0)
    return t.crop(t.getbbox())


tags = {name: cut(box) for name, box in cells.items()}


def cream(p):
    return p[3] > 0 and p[0] > 215 and p[1] > 205 and p[2] > 160 and p[0] - p[2] < 70


def letters(tag, start, band):
    """Column runs of cream pixels right of `start` (the icon's edge) within the text's rows: each a letter, as (x0, x1, y0, y1)."""
    w, h = tag.size
    px = tag.load()
    rows = range(*band)
    cols = [x for x in range(start, int(w * 0.92)) if any(cream(px[x, y]) for y in rows)]
    runs, run = [], []
    for x in cols:
        if run and x != run[-1] + 1:
            runs.append(run)
            run = []
        run.append(x)
    if run:
        runs.append(run)
    out = []
    for r in runs:
        ys = [y for y in rows for x in r if cream(px[x, y])]
        out.append((r[0], r[-1] + 1, min(ys), max(ys) + 1))
    return out


CREAM = (248, 242, 214)


def body_colour(tag):
    """The tag's own colour: the commonest opaque, saturated colour."""
    counts = {}
    for p in tag.getdata():
        if p[3] == 255 and colorsys.rgb_to_hsv(*(c / 255 for c in p[:3]))[1] > 0.25:
            key = tuple(c // 8 * 8 for c in p[:3])
            counts[key] = counts.get(key, 0) + 1
    return max(counts, key=counts.get)


def glyph(tag, run):
    """A letter as a soft mask (L): how far each pixel is from the tag's colour towards cream (its edges blended)."""
    x0, x1, y0, y1 = run
    x0, y0, x1, y1 = x0 - 1, y0 - 1, x1 + 1, y1 + 1
    bg = body_colour(tag)
    full = sum((c - b) ** 2 for c, b in zip(CREAM, bg)) ** 0.5
    px = tag.load()
    g = Image.new('L', (x1 - x0, y1 - y0), 0)
    gp = g.load()
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = px[x, y]
            if not p[3]:
                continue
            d = sum((c - b) ** 2 for c, b in zip(p[:3], bg)) ** 0.5
            # Towards cream, not towards some other colour (the arrow's edge, the icon).
            towards = sum((c - b) * (k - b) for c, b, k in zip(p[:3], bg, CREAM)) / full
            gp[x - x0, y - y0] = max(0, min(255, round(255 * towards / full))) if d > 18 else 0
    return g


# The letters start right of each tag's icon (about 30% across).
def word_glyphs(name, word, band):
    tag = tags[name]
    runs = [r for r in letters(tag, int(tag.size[0] * 0.2), band) if r[1] - r[0] > 5]
    assert len(runs) == len(word), (name, len(runs), word)
    return {ch: (glyph(tag, r), r) for ch, r in zip(word, runs)}


tags['frozen'] = cut((262, 234, 511, 318))
p = word_glyphs('poisoned', 'POISONED', (23, 36))
f = word_glyphs('frozen', 'FROZEN', (25, 39))
b = word_glyphs('burned', 'BURNED', (22, 36))
src_glyphs = {'O': p['O'], 'N': p['N'], 'S': p['S'], 'E': p['E'], 'D': p['D'], 'F': f['F'], 'U': b['U']}
# C: the O with its right stroke opened between the top and bottom bars.
o, orun = p['O']
c = o.copy()
cw, ch = c.size
cp = c.load()
bar = round(ch * 0.3)
for x in range(int(cw * 0.6), cw):
    for y in range(bar, ch - bar):
        cp[x, y] = 0
src_glyphs['C'] = (c, orun)

# Letter CONFUSED onto the blank tag: POISONED's letters (F and U scaled to their height), POISONED's spacing, after the spiral.
# The body is lengthened first (a plain column repeated before the arrow) so the word fits with the others' margins.
blank = tags['blank']
# Only the tag itself: the largest blob (the screenshot's specks round the splat go).
bp = blank.load()
bw, bh = blank.size
seen, best = set(), []
for sx in range(bw):
    for sy in range(bh):
        if (sx, sy) in seen or not bp[sx, sy][3]:
            continue
        comp, q = [], deque([(sx, sy)])
        while q:
            x, y = q.popleft()
            if (x, y) in seen or not (0 <= x < bw and 0 <= y < bh) or not bp[x, y][3]:
                continue
            seen.add((x, y))
            comp.append((x, y))
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
        if len(comp) > len(best):
            best = comp
keep = set(best)
for x in range(bw):
    for y in range(bh):
        if (x, y) not in keep:
            bp[x, y] = (0, 0, 0, 0)
blank = blank.crop(blank.getbbox())
bw, bh = blank.size
def body_rows(tag, at):
    tp = tag.load()
    x = int(tag.size[0] * at)
    rows = [y for y in range(tag.size[1]) if tp[x, y][3] > 128]
    return rows[-1] - rows[0] + 1
# The word as big against the Confused tag's body as POISONED is against its own.
height = round(p['P'][0].size[1] * body_rows(blank, 0.7) / body_rows(tags['poisoned'], 0.6))
def sized(g):
    return g.resize((round(g.size[0] * height / g.size[1]), height), Image.LANCZOS)
glyphs = {ch: sized(g) for ch, (g, _) in src_glyphs.items()}
runs = [r for _, r in p.values()]
gap = round(sum(runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)) / (len(runs) - 1) * height / p['P'][0].size[1]) - 2
word = 'CONFUSED'
total = sum(glyphs[ch].size[0] for ch in word) + gap * (len(word) - 1)
icon_right = 86  # the spiral's right edge
text_left = icon_right + 10
arrow_start = int(bw * 0.88)  # where the body starts narrowing into the arrow
extra = max(0, text_left + total + 12 - arrow_start)
col = int(bw * 0.7)
grown = Image.new('RGBA', (bw + extra, bh), (0, 0, 0, 0))
grown.paste(blank.crop((0, 0, col, bh)), (0, 0))
strip = blank.crop((col, 0, col + 1, bh))
for i in range(extra):
    grown.paste(strip, (col + i, 0))
grown.paste(blank.crop((col, 0, bw, bh)), (col + extra, 0))
blank = grown
# Centred on the body's rows: the pink's top and bottom in the column repeated.
sp = strip.load()
body = [y for y in range(bh) if sp[0, y][3]]
top = (body[0] + body[-1] + 1 - height) // 2
x = text_left
creamc = (248, 242, 214, 255)
for ch in word:
    g = glyphs[ch]
    blank.paste(Image.new('RGBA', g.size, creamc), (x, top), g)
    x += g.size[0] + gap
tags['confused'] = blank

for name in ('poisoned', 'sleep', 'burned', 'paralyzed', 'confused'):
    tags[name].save(f'{out}/{name}.png')
    tags[name].resize((tags[name].size[0] * 3, tags[name].size[1] * 3), Image.NEAREST).save(f'{out}/{name}-check.png')
    print(name, tags[name].size)
