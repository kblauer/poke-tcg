"""Picks N encounter spots on a rendered route's walkable tiles, evenly spaced from the edge the run starts at (`--from`:
bottom, the default, top, left or right) to the opposite one, alternating between the route's two halves across where
both are walkable, each where its 5x5 surroundings are most open (the middle of a path, not against trees). Writes a
preview with numbered markers.
Usage: python pick_spots.py <route.json> <route.png> <preview.png> [N]. Prints the spots as JSON (for a Route in
packages/campaign/src/routes.ts); check the preview before using them."""
import json, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
import png

info = json.load(open(sys.argv[1]))
grid, W, H = info['grid'], info['width'], info['height']
args = [a for a in sys.argv[4:] if not a.startswith('--')]
N = int(args[0]) if args else 10
start = sys.argv[sys.argv.index('--from') + 1] if '--from' in sys.argv else 'bottom'
vertical = start in ('bottom', 'top')
LONG, ACROSS = (H, W) if vertical else (W, H)


def at(i):
    """The tile coordinate along the route for spot i (from the start edge)."""
    pos = round(2 + i * (LONG - 5) / (N - 1))
    return LONG - 1 - pos if start in ('bottom', 'right') else pos


def openness(x, y, r=2):
    return sum(grid[yy][xx] for yy in range(max(0, y - r), min(H, y + r + 1)) for xx in range(max(0, x - r), min(W, x + r + 1)))


spots = []
for i in range(N):
    target = at(i)
    side_pref = i % 2  # 0: the first half across first (left, or top), 1: the other
    best = None
    for d in range(0, 6):
        for along in sorted({target - d, target + d}):
            if not 0 <= along < LONG:
                continue
            for across in range(ACROSS):
                x, y = (across, along) if vertical else (along, across)
                if not grid[y][x] or any(abs(x - sx) + abs(y - sy) < 6 for sx, sy in spots):
                    continue
                side = 0 if across < ACROSS // 2 else 1
                score = openness(x, y) * 10 - d * 6 + (15 if side == side_pref else 0)
                if best is None or score > best[0]:
                    best = (score, x, y)
        if best and best[0] >= 200:
            break
    spots.append((best[1], best[2]))

print(json.dumps([{'x': x, 'y': y} for x, y in spots]))

# Preview: the route at 2x with a red ring and number at each spot.
w, h, rows, _ = png.Reader(filename=sys.argv[2]).asRGB8()
rows = [list(r) for r in rows]
S = 2
out = [[0] * (w * S * 3) for _ in range(h * S)]
for y in range(h):
    for x in range(w):
        for dy in range(S):
            for dx in range(S):
                out[y * S + dy][(x * S + dx) * 3:(x * S + dx) * 3 + 3] = rows[y][x * 3:x * 3 + 3]
DIGITS = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'],
}


def put(px, py, c):
    if 0 <= px < w * S and 0 <= py < h * S:
        out[py][px * 3:px * 3 + 3] = c


for n, (tx, ty) in enumerate(spots, 1):
    cx, cy = (tx * 16 + 8) * S, (ty * 16 + 8) * S
    for a in range(360):
        import math
        for r in (13, 14, 15):
            put(int(cx + r * math.cos(math.radians(a))), int(cy + r * math.sin(math.radians(a))), [230, 20, 20])
    label = str(n)
    for i, ch in enumerate(label):
        for ry, line in enumerate(DIGITS[ch]):
            for rx, bit in enumerate(line):
                if bit == '1':
                    for k in range(3):
                        for l in range(3):
                            put(cx + 18 + i * 12 + rx * 3 + l, cy - 7 + ry * 3 + k, [255, 255, 255])
png.Writer(w * S, h * S, greyscale=False).write(open(sys.argv[3], 'wb'), out)
