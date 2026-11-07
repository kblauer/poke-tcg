"""Draws the battle table's FireRed/LeafGreen type mats (the gen 1 set) into apps/web/public/mats/frlg/.

The mats (--layout arena, the default) are laid out as the DP set's: one arena for all three, a rounded rectangle of
ground in the middle (ARENA: 20 x 32 metatiles, its corners cut in steps), inside a desktop's middle 600 px, its
middle clear for the cards, with its surround on every side (`ARENAS`):
- fire: Mt. Chimney's rocky ground raised a level above a sea of lava (`raised`: Magma Hideout's lava pool rim along
  its top, turned inside out (`rim`), Mt. Chimney's crater walls down its sides and its cliff face along the bottom),
  its rock mounds, Jagged Pass's small round rocks and FireRed's Mt. Ember rock piles and pointed rocks (drawn over
  it: `ember_overlay`) on the floor near the edges, raised outcrops out in the lava with a mound or a rock on them
  (Emerald's Lavaridge tiles: FireRed has no lava);
- water: FireRed's sand island in the sea (Route 21's and Treasure Beach's sand, shore and sea), its outline uneven,
  Route 109's umbrellas, deck chairs, float and sign on it near its edges (Emerald's tiles drawn over FireRed's sand:
  `beach_overlay`), two sandbars and rocks offshore;
- grass: a field of Route 1's grass, its open middle where General's flowers (FireRed's only flowers) thin out:
  drifts and clumps of them, single flowers and pairs loose between, tall grass mixed in, Route 1's trees along the
  top and bottom.
They're laid out by hand (no collapse); their tile animations play (the lava's bubbles, the sea's and shore's, the
flowers').

The earlier made-up scenes are --layout scene: water (Emerald's Route 105: a large sandy island in the sea with the
route's island cave on its top left and its trees, rocks offshore, the open sea deeper), grass (a meadow as Route 1's:
open grass in the middle, tall grass and flowers, trees all round) and fire (FireRed has no lava, so Emerald's Mt.
Chimney: flat rocky ground in the middle, the crater's lava below and to either side of it, the volcano's stepped
walls down to it and its ridges above). Each is 48 x 28 metatiles (768 x 448 px); what matters is in the middle
third, all a phone shows. (tools/mats/frlg_places.py draws the real-place versions.)

How: each scene has sample maps of its game's tileset pair (General and its secondary; in other General layouts only
the primary tileset's metatiles count), a `classify` that puts each metatile in a class (sand, water, rock, tree, tall
grass, flower, lava...) or leaves it out (buildings, signs, ledges, machines, anything that isn't terrain), and a
`sketch`: a class, or a choice of classes, per cell, drawn at random from the seed. Wave function collapse then lays
tiles over the sketch (`plan`, the overlapping model): a cell's state is a 3x3 window of classes seen in the samples
with a tile seen at its middle; neighbours' windows must agree where they overlap and their tiles must have been seen
side by side that way (corners too), so every seam is one the game's own maps have. Cells want the states most like
the sketch round them, and keep to the sketch's class away from its edges. Of a few collapses, the one nearest its
sketch is kept.

The games: FireRed's (pret/pokefirered: 640 tiles and metatiles in a primary tileset, 7 palettes, 32-bit metatile
attributes) and Emerald's (pret/pokeemerald: 512, 6, 16-bit attributes with the behaviour in the low byte, behaviours an
enum), `Game`.

Animation: src/tileset_anims.c's TilesetAnim_<tileset> (FireRed's General: the sea's tiles every 16 game frames over 8
frames, the sand-water edge's every 8 over 8, the flowers' every 16 over 5; the Sevii and Pallet tilesets have none.
Emerald's General: its sea's and shores' every 16 over 8 or 4; Dewford has none it uses. Emerald's Lavaridge: the lava's bubbles, Cave's lava frames, every 16 over 4, and its steam every 16 over 4, a second
copy 2 frames on). Only the animations whose tiles the scene uses count; the scene is drawn once per step (the
greatest common divisor of their intervals, in 60 Hz game frames) over the least common multiple of their periods, so
the loop is seamless (the 1- and 2-frame offsets between them are left out): water 8 frames of 16 game frames (267
ms), grass 5 of 16, fire 4 of 16. Writes apps/web/public/mats/frlg/<type>.png, the frames stacked top to bottom in one
indexed PNG, and <type>.json: {"width": 768, "height": 448, "frames": [{"y": the frame's top in the sheet, "ms": how
long it shows}, ...]}, the frames in order, looping (a still scene would be one frame). With --preview DIR, each
scene's first frame, a strip of its first 8 frames (the 96 px square that changes most) and what a desktop table and
an upright phone show of it (the middle 600 px, the middle 260 px), at 2x, go into DIR too.

The fire scene comes in three versions (--fire): dressed, the app's (fire), and plain and arena (fire_plain,
fire_arena) beside it:
- dressed: the collapsed scene with set dressing where the game puts it, each piece kept only if its seams are ones
  Mt. Chimney's, Jagged Pass's, Fiery Path's, Route 112's or Magma Hideout's maps have (`dress`): the pit of darker
  cave floor the collapse left filled with ground, cave mouths (Route 112's to Fiery Path) cut into cliff faces with
  ground in front, steam vents (Fiery Path's floor; TilesetAnim_Lavaridge's steam), and Mt. Chimney's ash-covered
  trees in clumps on the high ground (any ground but the arena floor in the middle). Its lava pools are made up:
  Magma Hideout's pool rim (it stands on dark cave floor in the game) with Mt. Chimney's ground under it
  (`on_ground`).
- plain: the collapsed scene as it is.
- arena: laid out by hand, not collapsed (`arena`): rocky ground in the middle with notches and bumps along its edge,
  lava on every side, outcrops and small rocks out in the lava, rocks and steam vents on the floor. Its edge is Magma
  Hideout's pool rim turned inside out (the pool's bottom edge the arena's top and so on, its corners the arena's
  inner corners), on Mt. Chimney's ground; of the outer corners the game has one (798), the other three are its rim
  piece flipped (metatiles of our own, `Tilesets.custom`), as the game's own edges flip theirs.

Downloads what it needs from pret/pokefirered and pret/pokeemerald on GitHub once, into --cache and --emerald-cache
(default: pokefirered and pokeemerald in the system's temp folder); --out writes the sheets elsewhere. Needs numpy
and Pillow.
Usage: python tools/mats/frlg_mats.py [--seed N] [--cache DIR] [--emerald-cache DIR] [--layout arena|scene] [--fire dressed|plain|arena]
[--out DIR] [--preview DIR] [type ...]"""
import argparse, functools, io, json, os, re, struct, tempfile, urllib.request
from collections import Counter
from math import gcd, lcm
import numpy as np
from PIL import Image



class Game:
    """A pret decompilation the scenes come from: where it's downloaded from and cached, its primary tilesets' size in
    tiles and metatiles (the secondary's start there) and palettes, and its metatile attributes' size in bytes and
    behaviour bits."""

    def __init__(self, repo, primary, pals, attr_bytes, behaviour):
        self.repo, self.primary, self.pals, self.attr_bytes, self.behaviour = repo, primary, pals, attr_bytes, behaviour
        self.base = f'https://raw.githubusercontent.com/pret/{repo}/master/'
        self.cache = os.path.join(tempfile.gettempdir(), repo)


FRLG = Game('pokefirered', 640, 7, 4, 0x1FF)  # 32-bit attributes: the behaviour in bits 0-8, the layer type in 29-30
EMERALD = Game('pokeemerald', 512, 6, 2, 0xFF)  # 16-bit attributes: the behaviour in the low byte
W, H = 48, 28  # the scene, in metatiles
MAX_FRAMES = 16


def get(path, game=FRLG):
    """A file of the game's decompilation, downloaded once into its cache."""
    local = os.path.join(game.cache, *path.split('/'))
    if not os.path.exists(local):
        os.makedirs(os.path.dirname(local), exist_ok=True)
        with urllib.request.urlopen(game.base + path) as r:
            data = r.read()
        open(local, 'wb').write(data)
    return open(local, 'rb').read()


def snake(tileset):
    """gTileset_SeviiIslands123 -> sevii_islands_123 (the tileset's folder under data/tilesets/), as fetch_map.py."""
    words = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', tileset.replace('gTileset_', ''))
    return re.sub(r'([a-z])([0-9])', r'\1_\2', words.lower())


def u16s(data):
    return list(struct.unpack('<%dH' % (len(data) // 2), data))


def u32s(data):
    return list(struct.unpack('<%dI' % (len(data) // 4), data))


def read_pal(data):
    v = data.decode().split()
    return [tuple(int(x) for x in v[3 + i * 3: 6 + i * 3]) for i in range(int(v[2]))]


def read_tiles(data):
    """A tile sheet's 8x8 tiles as an (n, 8, 8) array of colour indices."""
    im = Image.open(io.BytesIO(data))
    a = np.array(im.convert('P') if im.mode not in ('P', 'L') else im) & 15
    h, w = a.shape
    return a.reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)


class Tilesets:
    """A primary and secondary tileset pair of a game: tiles, palettes (the primary's first, the secondary's after them),
    metatiles (8 tile entries each, the bottom layer's 4 then the top's: tile index 10 bits, h-flip bit 10, v-flip bit
    11, palette bits 12-15) and behaviours."""

    def __init__(self, primary, secondary, game=FRLG):
        self.primary, self.secondary, self.game = primary, secondary, game
        self.custom = {}  # metatiles of our own (ids from CUSTOM on): 8 entries each, as the game's
        n = game.primary
        get_ = lambda p: get(p, game)
        folders = [f'data/tilesets/primary/{snake(primary)}', f'data/tilesets/secondary/{snake(secondary)}']
        pals = [read_pal(get_(f'{folders[0]}/palettes/%02d.pal' % i)) for i in range(game.pals)]
        pals += [read_pal(get_(f'{folders[1]}/palettes/%02d.pal' % i)) for i in range(game.pals, 16)]
        self.pals = np.array(pals, dtype=np.uint8)  # (16, 16, 3)
        tp = read_tiles(get_(f'{folders[0]}/tiles.png'))[:n]
        tp = np.concatenate([tp, np.zeros((n - len(tp), 8, 8), tp.dtype)])
        self.tiles = np.concatenate([tp, read_tiles(get_(f'{folders[1]}/tiles.png'))])
        self.meta = u16s(get_(f'{folders[0]}/metatiles.bin')), u16s(get_(f'{folders[1]}/metatiles.bin'))
        attrs = u32s if game.attr_bytes == 4 else u16s
        self.attr = attrs(get_(f'{folders[0]}/metatile_attributes.bin')), attrs(get_(f'{folders[1]}/metatile_attributes.bin'))
        text = get_('include/constants/metatile_behaviors.h').decode()
        self.names = {int(v, 0): n for n, v in re.findall(r'#define\s+(MB_\w+)\s+(0x[0-9A-Fa-f]+|\d+)', text)}
        if not self.names:  # Emerald's: an enum, MB_NORMAL, MB_SECRET_BASE_WALL, ... in order (its comments left out)
            body = re.sub(r'//[^\n]*|/\*.*?\*/', '', text[text.index('{'):text.index('}')], flags=re.S)
            self.names = {i: name for i, name in enumerate(re.findall(r'\b(MB_\w+)', body))}

    def entries(self, mid):
        if mid in self.custom:
            return self.custom[mid]
        n = self.game.primary
        m, i = (self.meta[0], mid) if mid < n else (self.meta[1], mid - n)
        return m[i * 8: i * 8 + 8]

    def behavior(self, mid):
        if mid in self.custom:
            return 'MB_NORMAL'
        n = self.game.primary
        a, i = (self.attr[0], mid) if mid < n else (self.attr[1], mid - n)
        return self.names.get((a[i] if i < len(a) else 0) & self.game.behaviour, 'MB_NORMAL')

    def draw(self, mid, tiles=None):
        """A metatile as a 16x16 RGB array: the bottom layer, then the top layer over it (index 0 see-through), as the
        scenes have no people the layer types don't matter."""
        tiles = self.tiles if tiles is None else tiles
        out = np.zeros((16, 16, 3), np.uint8)
        out[:] = self.pals[0][0]
        for q, e in enumerate(self.entries(mid)):
            t = tiles[e & 0x3FF] if (e & 0x3FF) < len(tiles) else np.zeros((8, 8), np.uint8)
            if e >> 10 & 1:
                t = t[:, ::-1]
            if e >> 11 & 1:
                t = t[::-1]
            y, x = (q % 4 // 2) * 8, (q % 2) * 8
            sub = out[y:y + 8, x:x + 8]
            sub[t != 0] = self.pals[e >> 12][t[t != 0]]
        return out

    def render(self, grid, tiles=None):
        """A grid of metatile ids as an RGB array, drawn with `tiles` (the tilesets' own, or an animation step's)."""
        grid = np.asarray(grid)
        cache = {}
        h, w = grid.shape
        out = np.zeros((h * 16, w * 16, 3), np.uint8)
        for y in range(h):
            for x in range(w):
                mid = int(grid[y, x])
                if mid not in cache:
                    cache[mid] = self.draw(mid, tiles)
                out[y * 16:y * 16 + 16, x * 16:x * 16 + 16] = cache[mid]
        return out


def anims(tileset, game=FRLG):
    """A tileset's tile animations from src/tileset_anims.c: [(interval, phase, start tile, [frames as (n, 8, 8) tiles],
    shift)], TilesetAnim_<Name> queueing frame (timer / interval + shift) % len(frames) at the start tile whenever
    timer % interval == phase. One QueueAnimTiles_ may copy its frames to several places, a few frames apart (Emerald's
    Lavaridge steam: `i = (timer + 2) % ...`)."""
    src = get('src/tileset_anims.c', game).decode()
    body = re.search(r'static void TilesetAnim_%s\(u16 timer\)\s*\{(.*?)\n\}' % tileset.replace('gTileset_', ''), src, re.S)
    if not body:
        return []
    out = []
    # The frames' graphics: FireRed's INCBIN_U16("....4bpp"), Emerald's INCGFX_U16("....png", ".4bpp").
    paths = dict(re.findall(r'(\w+)\[\] = INCBIN_U16\("(.*?)\.4bpp"\)', src) + re.findall(r'(\w+)\[\] = INCGFX_U16\("(.*?)\.png"', src))
    for interval, phase, queue in re.findall(r'timer % (\d+) == (\d+)\)\s*(QueueAnimTiles_\w+)\(timer / \d+\)', body.group(1)):
        fn = re.search(r'static void %s\(u\d+ timer\)\s*\{(.*?)\n\}' % queue, src, re.S).group(1)
        shift = 0
        for line in fn.split(';'):
            k = re.search(r'\bi = \(?timer(?: \+ (\d+))?\)? %', line)
            if k:
                shift = int(k.group(1) or 0)
            a = re.search(r'AppendTilesetAnimToBuffer\((\w+)\[.*?TILE_OFFSET_4BPP\(([^)]*)\)', line, re.S)
            if a:
                table, start = a.groups()
                names = re.findall(r'\w+', re.search(r'%s\[\] = \{(.*?)\}' % table, src, re.S).group(1))
                start = sum(game.primary if t.strip() == 'NUM_TILES_IN_PRIMARY' else int(t) for t in start.split('+'))
                out.append((int(interval), int(phase), start, [read_tiles(get(paths[n] + '.png', game)) for n in names], shift))
    return out


@functools.cache
def layouts(game=FRLG):
    return [l for l in json.loads(get('data/layouts/layouts.json', game))['layouts'] if 'primary_tileset' in l]


def layout(name, game=FRLG):
    return next(l for l in layouts(game) if l['name'] == name + '_Layout')


def blocks(layout, game=FRLG):
    """A layout's metatile ids as an (h, w) array."""
    return (np.array(u16s(get(layout['blockdata_filepath'], game)), np.int32) & 0x3FF).reshape(layout['height'], layout['width'])


# Neighbour directions (dx, dy): the four sides, then the four corners (corners catch seams two sides alone miss).
DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
NEAR = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]  # a 3x3 window, row by row
FEATURES = ('water', 'deep', 'sand', 'grass', 'leaf', 'rock')
# Behaviours never drawn: what a person uses or a map's own objects stand on, and ledges (a one-way ledge in a
# made-up scene would only be a line across it).
BANNED = re.compile(r'JUMP|SIGN|DOOR|WARP|STAIRS|LADDER|ARROW|PC|TELEVISION|BOOKSHELF|COUNTER|FAST_WATER|CURRENT|WATERFALL')


def features(rgb):
    """What a metatile is made of: the share of its pixels that look like each of FEATURES (by colour)."""
    p = rgb.reshape(-1, 3).astype(int)
    r, g, b = p[:, 0], p[:, 1], p[:, 2]
    water = (b > r + 40) & (b > g)
    sand = ~water & (r > 190) & (g > 165) & (b * 100 < r * 68)  # yellow; the cliffs' pinks and greys have more blue
    green = ~water & ~sand & (g > r + 12) & (g + 8 >= b)
    leaf = green & (g < 190)  # tree tops and tall grass: the darker greens
    grass = green & ~leaf
    rock = ~water & ~sand & ~green
    deep = water & (b < 200)  # the open sea's darker blue
    return {k: float(v.mean()) for k, v in zip(FEATURES, (water, deep, sand, grass, leaf, rock))}


def share(rgb, colour):
    """The share of a metatile's pixels of one colour."""
    return float((rgb.reshape(-1, 3) == colour).all(axis=1).mean())


class Wfc:
    """Wave function collapse over n states: compat[d][t] is the bitmask of states allowed at DIRS[d] of state t,
    weights an (h, w, n) array of how much each cell wants each state, pins an (h, w) array of bitmasks a cell keeps
    to. Pins that can't all hold are eased to `loose` round the trouble. It grows from the middle, one front (`front`
    weighs that against picking the narrowest cell); a contradiction clears the cells round it (wider each time it
    comes back) and goes on, rather than starting again."""

    def __init__(self, compat, weights, pins, rng, front=1000, loose=None):
        self.compat, self.weights, self.pins, self.rng, self.front, self.loose = compat, weights, pins.copy(), rng, front, loose
        self.h, self.w, self.n = weights.shape
        # support(d, mask) is the OR of compat[d] over mask's bits: looked up a byte of the mask at a time.
        self.bytes = (self.n + 7) // 8
        self.memo = [{} for _ in compat]
        self.table = []
        for c in compat:
            t = []
            for k in range(self.bytes):
                row = [0] * 256
                for v in range(1, 256):
                    low = v & -v
                    i = k * 8 + low.bit_length() - 1
                    row[v] = row[v ^ low] | (c[i] if i < self.n else 0)
                t.append(row)
            self.table.append(t)

    def support(self, d, mask):
        s = self.memo[d].get(mask)
        if s is None:
            s, t = 0, self.table[d]
            b = mask.to_bytes(self.bytes, 'little')
            for k in np.frombuffer(b, np.uint8).nonzero()[0].tolist():
                s |= t[k][b[k]]
            if len(self.memo[d]) < 200000:
                self.memo[d][mask] = s
        return s

    def propagate(self, stack):
        """Narrows the cells round those in stack to what their neighbours allow; the first cell left with nothing, or None."""
        dom = self.dom
        while stack:
            y, x = stack.pop()
            for d, (dx, dy) in enumerate(DIRS):
                ny, nx = y + dy, x + dx
                if 0 <= ny < self.h and 0 <= nx < self.w:
                    nd = dom[ny][nx] & self.support(d, dom[y][x])
                    if nd != dom[ny][nx]:
                        if not nd:
                            return ny, nx
                        dom[ny][nx] = nd
                        self.count[ny, nx] = nd.bit_count()
                        stack.append((ny, nx))
        return None

    def rebuild(self, chosen):
        self.dom = [[int(self.pins[y, x]) if chosen[y][x] is None else 1 << chosen[y][x] for x in range(self.w)] for y in range(self.h)]
        self.count = np.array([[m.bit_count() for m in row] for row in self.dom])
        return self.propagate([(y, x) for y in range(self.h) for x in range(self.w)])

    def run(self, max_repairs=150):
        chosen = [[None] * self.w for _ in range(self.h)]
        bad, eased = self.rebuild(chosen), 0
        while bad:
            if self.loose is None or eased > 200:
                raise RuntimeError('the pins contradict each other at %s' % (bad,))
            eased += 1
            r = 1 + eased // 20
            box = slice(max(0, bad[0] - r), bad[0] + r + 1), slice(max(0, bad[1] - r), bad[1] + r + 1)
            self.pins[box] = self.loose[box]
            bad = self.rebuild(chosen)
        noise = self.rng.random((self.h, self.w)) * 0.5
        repairs, hits = 0, {}
        decided = np.zeros((self.h, self.w), bool)
        while True:
            open_ = self.count > 1
            if not open_.any():
                return np.array([[self.dom[y][x].bit_length() - 1 for x in range(self.w)] for y in range(self.h)])
            # Grow from what's decided (one front, as a person would draw it: fronts meeting is where it goes wrong),
            # the narrowest cell first.
            near = np.zeros_like(open_)
            near[1:] |= decided[:-1]; near[:-1] |= decided[1:]; near[:, 1:] |= decided[:, :-1]; near[:, :-1] |= decided[:, 1:]
            if not decided.any():
                near[self.h // 2, self.w // 2] = True
            score = np.where(open_, self.count + noise - self.front * near, np.inf)
            y, x = np.unravel_index(np.argmin(score), score.shape)
            m = self.dom[y][x]
            ids = [i for i in range(self.n) if m >> i & 1]
            w = self.weights[y, x, ids]
            t = ids[self.rng.choice(len(ids), p=w / w.sum())]
            chosen[y][x] = t
            decided[y, x] = True
            self.dom[y][x] = 1 << t
            self.count[y, x] = 1
            bad = self.propagate([(y, x)])
            while bad:
                repairs += 1
                if repairs > max_repairs:
                    raise RuntimeError('too many contradictions')
                key = (bad[0] // 3, bad[1] // 3)
                hits[key] = hits.get(key, 0) + 1
                r = 1 + hits[key]
                y0, y1, x0, x1 = max(0, bad[0] - r), min(self.h, bad[0] + r + 1), max(0, bad[1] - r), min(self.w, bad[1] + r + 1)
                for yy in range(y0, y1):
                    for xx in range(x0, x1):
                        chosen[yy][xx] = None
                        decided[yy, xx] = False
                        self.dom[yy][xx] = int(self.pins[yy, xx])
                        self.count[yy, xx] = self.dom[yy][xx].bit_count()
                # The cells round the cleared box (left as they were, if anything narrower than they need be) narrow it again.
                bad = self.propagate([(yy, xx) for yy in range(max(0, y0 - 1), min(self.h, y1 + 1)) for xx in range(max(0, x0 - 1), min(self.w, x1 + 1))])


class Model:
    """What the sample maps teach about a scene's metatiles: each one's class (`cls`: the scene's `classify`, None for
    one never drawn), `compat[d][i]` (the bitmask of tiles seen at DIRS[d] of tile i) and `states`: (3x3 window of
    classes, index of a tile seen at its middle, how often). Learnt from the samples' rectangles (the whole map without
    one; with `everywhere`, every other General layout too); in a sample of another secondary tileset only the primary
    tileset's metatiles count (the sea, sand, grass and trees every General map shares). A window seen fewer than
    `least` times in those others is left out, as a slip in some map's layout rather than a rule."""

    def __init__(self, ts, samples, classify, least=2, everywhere=False):
        self.cls = {}
        tiles, pairs, windows = set(), [set() for _ in DIRS], Counter()

        game = ts.game

        def cls(m, own):
            if not own and m >= game.primary:
                return None
            if m not in self.cls:
                self.cls[m] = None if BANNED.search(ts.behavior(m)) and m not in getattr(classify, 'keep', ()) else classify(ts, m)
            return self.cls[m]
        if everywhere:
            samples = samples + [(l['name'][:-7], None) for l in layouts(game) if l['primary_tileset'] == 'gTileset_General' and l['name'][:-7] not in dict(samples)]
        for name, rect in samples:
            own = layout(name, game)['secondary_tileset'] == ts.secondary
            try:
                b = blocks(layout(name, game), game)
            except ValueError:
                continue  # (a layout whose blocks don't fill it: a few of Emerald's unused ones)
            x0, y0, x1, y1 = rect or (0, 0, b.shape[1], b.shape[0])
            b = b[y0:y1, x0:x1]
            c = [[cls(int(m), own) for m in row] for row in b]
            h, w = b.shape
            for y in range(h):
                for x in range(w):
                    if c[y][x] is None:
                        continue
                    t = int(b[y, x])
                    tiles.add(t)
                    for d, (dx, dy) in enumerate(DIRS):
                        if 0 <= y + dy < h and 0 <= x + dx < w and c[y + dy][x + dx] is not None:
                            pairs[d].add((t, int(b[y + dy, x + dx])))
                    if 0 < y < h - 1 and 0 < x < w - 1:
                        win = tuple(c[y + dy][x + dx] for dy, dx in NEAR)
                        if None not in win:
                            windows[win, t] += least if own else 1  # (a window of the scene's own maps always counts)
        self.tiles = sorted(tiles)
        index = {t: i for i, t in enumerate(self.tiles)}
        self.compat = [[0] * len(self.tiles) for _ in DIRS]
        for d, p in enumerate(pairs):
            o = DIRS.index((-DIRS[d][0], -DIRS[d][1]))
            for a, b in p:
                self.compat[d][index[a]] |= 1 << index[b]
                self.compat[o][index[b]] |= 1 << index[a]
        self.states = sorted((win, index[t], n) for (win, t), n in windows.items() if n >= least)
        self.classes = sorted({k for win, _, _ in self.states for k in win})


def plan(model, sketch, rng, beta=40.0, margin=2, fixed=None):
    """The scene's tiles, near the sketch (an (h, w) array of class names, or tuples of them where any will do): wave
    function collapse over states, each a 3x3 window of classes the sample maps have with a tile seen in its middle (the
    overlapping model, carrying its tile). Two neighbouring cells' states must agree where their windows overlap, and
    their tiles must have been seen side by side that way; a cell wants the states whose window is most like the sketch
    round it, and one whose sketch is the same for `margin` cells round it keeps to states of that class (the edges
    between classes are left free). Returns the tiles, and the share of cells whose class is the sketch's."""
    h, w = sketch.shape
    states = model.states
    pats = np.array([[model.classes.index(k) for k in win] for win, _, _ in states]).reshape(-1, 3, 3)
    if not hasattr(model, 'state_compat'):
        tile = np.array([t for _, t, _ in states])
        n = len(model.tiles)
        compat = []
        for d, (dx, dy) in enumerate(DIRS):
            a = pats[:, max(0, dy):3 + min(0, dy), max(0, dx):3 + min(0, dx)]
            b = pats[:, max(0, -dy):3 + min(0, -dy), max(0, -dx):3 + min(0, -dx)]
            ok = (a[:, None] == b[None]).all(axis=(2, 3))
            pair = np.array([[model.compat[d][i] >> j & 1 for j in range(n)] for i in range(n)], bool)
            ok &= pair[tile][:, tile]
            compat.append([sum(1 << int(j) for j in np.nonzero(row)[0]) for row in ok])
        model.state_compat = compat
    names = sorted({k if isinstance(k, str) else tuple(k) for row in sketch for k in row}, key=str)
    sk = np.array([[names.index(k if isinstance(k, str) else tuple(k)) for k in row] for row in sketch])
    ok = np.array([[c in ((n,) if isinstance(n, str) else n) for c in model.classes] for n in names])  # (names, classes)
    pad = np.pad(sk, 1, mode='edge')
    like = 2.0 * ok[sk][:, :, pats[:, 1, 1]]  # the middle counts most
    for dy in range(3):
        for dx in range(3):
            like += ok[pad[dy:dy + h, dx:dx + w]][:, :, pats[:, dy, dx]]
    weights = np.array([c for _, _, c in states], float) ** 0.5 * np.exp(beta * (like / 11 - 1))
    full = (1 << len(states)) - 1
    middle = [sum(1 << i for i in range(len(states)) if ok[n, pats[i, 1, 1]]) for n in range(len(names))]
    same, wide = np.ones((h, w), bool), np.pad(sk, margin, mode='edge')
    for dy in range(2 * margin + 1):
        for dx in range(2 * margin + 1):
            same &= wide[dy:dy + h, dx:dx + w] == sk
    pins, loose = np.empty((h, w), object), np.empty((h, w), object)
    loose[:] = full
    for y in range(h):
        for x in range(w):
            pins[y, x] = middle[sk[y, x]] if same[y, x] else full
    for (y, x), t in (fixed or {}).items():  # cells that must be one metatile (a stamp of a map's: Route 105's cave)
        pins[y, x] = sum(1 << i for i, (_, k, _) in enumerate(states) if model.tiles[k] == t)
        loose[y, x] = pins[y, x]
    cells = Wfc(model.state_compat, weights, pins, rng, loose=loose).run()
    return np.array([[model.tiles[states[c][1]] for c in row] for row in cells]), ok[sk, pats[cells, 1, 1]].mean()


def smooth_noise(rng, h, w, scale):
    """Value noise in [0, 1): a coarse random grid, smoothly scaled up to (h, w)."""
    g = rng.random((h // scale + 2, w // scale + 2))
    ys, xs = np.arange(h) / scale, np.arange(w) / scale
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a, b, c, d = g[y0][:, x0], g[y0][:, x0 + 1], g[y0 + 1][:, x0], g[y0 + 1][:, x0 + 1]
    return a * (1 - fy) * (1 - fx) + b * (1 - fy) * fx + c * fy * (1 - fx) + d * fy * fx


def grow(mask, n):
    """A mask grown by n cells every way (corners too)."""
    for _ in range(n):
        m = mask.copy()
        m[1:] |= mask[:-1]; m[:-1] |= mask[1:]
        m[:, 1:] |= m[:, :-1].copy(); m[:, :-1] |= m[:, 1:].copy()
        mask = m
    return mask


def shrink(mask, n):
    return ~grow(~mask, n)


def oval(rng, h, w, ry, rx, wobble=0.3):
    """A wobbly ellipse's distance field, centred on the scene: under 1 inside."""
    y, x = np.mgrid[0:h, 0:w]
    d = np.hypot((x + 0.5 - w / 2) / rx, (y + 0.5 - h / 2) / ry)
    return d * (1 + wobble * (smooth_noise(rng, h, w, 6) - 0.5))


def scatter(rng, mask, n, size):
    """Up to n size x size squares dropped at random where they fit wholly inside mask, none touching another."""
    out = np.zeros_like(mask)
    ys, xs = np.nonzero(shrink(mask, size))
    for i in rng.permutation(len(ys)):
        y, x = ys[i], xs[i]
        if out.sum() >= n * size * size:
            break
        if not grow(out, 2)[y:y + size, x:x + size].any():
            out[y:y + size, x:x + size] = True
    return out


def paint(out, mask, value):
    """out[mask] = value, for a value that's a tuple of classes too."""
    for y, x in zip(*np.nonzero(mask)):
        out[y, x] = value


ISLAND_CAVE = [[None, 370, 379, 372, None], [370, 833, 113, 834, 372], [136, 123, 100, 125, 138], [144, 121, 167, 145, 146]]
ISLAND_TREES = (537, 569, 570, 579)  # Route 105's island trees: a top (569; 537 over the sea), 579s, a trunk (570)


def isle_class(ts, m):
    """Emerald's Routes 105-107 (General and Dewford): its sea (and deep sea), sand, rocks, brown boulders, island cave
    and trees; its brown cliffs left out."""
    if any(m in row for row in ISLAND_CAVE):
        return 'cave'
    if m in ISLAND_TREES:
        return 'tree'
    if m in (373, 374, 381, 382):
        return 'boulder'  # a brown rock in the sea, 2x2
    rgb = ts.draw(m)
    f = features(rgb)
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    if ((r - g > 30) & (b >= g - 10)).mean() > 0.01:
        return None  # the brown cliffs (the sand's browns have less blue)
    if f['water'] >= 0.5:
        if f['rock'] > 0.1:
            return 'rock'
        return 'deep' if f['deep'] > f['water'] / 2 else 'water'
    if f['rock'] > 0.25 or f['grass'] + f['leaf'] > 0.05:
        return None
    return 'sand'


isle_class.keep = {167}  # the cave's mouth (a door)


def isle_sketch(rng, h, w):
    """A large sandy island in the sea, nearly filling the frame; rocks offshore, the open sea deeper (Route 105's
    island cave and trees go on after: `isle_dress`)."""
    out = np.full((h, w), 'deep', object)
    island = oval(rng, h, w, 10.5, 16.5, 0.2) < 1
    paint(out, grow(island, 6), ('water', 'deep', 'rock', 'boulder'))
    out[grow(island, 2)] = 'water'
    out[island] = 'sand'
    return out


def isle_dress(ts, grid, rng, model):
    """Route 105's island cave at the island's top left, its mouth on the sand: the top band of the scene collapsed
    again with the cave pinned two rows down (its last row kept as it was, so the band's seams with the rest are the
    ones they were), the island's edge bending round it as the maps let it. Then its trees in two groups near the
    island's left and right edges, each stamped where its seams are the maps'."""
    seen, canon = seams(ts, ['Route105', 'Route106', 'Route107'])
    grid = grid.copy()
    h, w = grid.shape
    for band in range(9, 14):
        for cx in (10, 12, 8, 14):
            sketch = np.array([[model.cls.get(int(grid[y, x])) or 'water' for x in range(w)] for y in range(band)], object)
            pins = {(band - 1, x): int(grid[band - 1, x]) for x in range(w)}
            pins.update({(2 + j, cx + i): t for j, row in enumerate(ISLAND_CAVE) for i, t in enumerate(row) if t is not None})
            try:
                tiles, _ = plan(model, sketch, rng, margin=2, fixed=pins)
            except RuntimeError:
                continue
            grid[:band] = tiles
            break
        else:
            continue
        break
    sand = lambda: np.isin(grid, (292,))
    trees = np.zeros((h, w), bool)
    for gx in (9, 37):  # trees: columns (569, 579s, 570) side by side, on sand with sand round them
        gy = int(rng.integers(10, 15))
        for x in sorted(range(gx - 4, gx + 5), key=lambda x: abs(x - gx)):
            if trees[:, gx - 4:gx + 5].sum() >= 9:
                break
            n = int(rng.integers(3, 5))
            for y in sorted(range(gy - 3, gy + 4), key=lambda y: abs(y - gy)):
                if sand()[y - 1:y + n + 1, x].all():  # (side by side with others is fine: Route 105's stand so)
                    if stamp(grid, y, x, [[569]] + [[579]] * (n - 2) + [[570]], seen, canon):
                        trees[y:y + n, x] = True
                        break
    return grid


def grass_class(ts, m):
    rgb = ts.draw(m)
    f, b = features(rgb), ts.behavior(m)
    if m in (5, 317, 318, 319, 333, 690, 698) or share(rgb, (164, 230, 197)) > 0.2:
        return None  # bushes, hedges and the paler lawn
    if 'TALL_GRASS' in b:
        return 'tall'
    if any(508 <= e & 0x3FF < 512 for e in ts.entries(m)):
        return 'flower'  # General's animated flowers
    if f['water'] > 0.1 or f['rock'] > 0.2 or f['sand'] > 0.2:
        return None  # ponds, fences, signs and paths: not in this meadow
    if f['leaf'] > 0.25:
        return 'tree'
    return None if f['rock'] > 0.05 else 'grass'  # (a ledge's end)


def grass_sketch(rng, h, w):
    """A meadow, as Route 1's and Five Island's: open grass in the middle, tall grass round it, flowers in the grass,
    trees all round the edges."""
    out = np.full((h, w), 'tree', object)
    d = oval(rng, h, w, 10, 18)
    meadow = d < 1
    paint(out, meadow, ('grass', 'flower'))
    out[grow(shrink(meadow & (d > 0.5) & (smooth_noise(rng, h, w, 5) > 0.55), 1), 1)] = 'tall'  # (no strips one tile wide)
    out[d < 0.45] = 'grass'
    free = meadow & (d > 0.5) & (out != 'tall')
    out[scatter(rng, free, 4, 2)] = 'flower'
    out[scatter(rng, free & (out != 'flower'), 10, 1)] = 'flower'
    return out


def fire_class(ts, m):
    rgb = ts.draw(m)
    r, g, b = rgb.reshape(-1, 3).astype(int).T
    if (g > r).mean() > 0.05 or ((b > r) | ((abs(r - g) < 24) & (abs(g - b) < 24))).mean() > 0.6:
        return None  # grass and trees, and the greys and blues of Team Magma's machines, signs, fences and steam
    if share(rgb, (98, 65, 82)) > 0.1 or share(rgb, (238, 189, 172)) > 0.05 or share(rgb, (255, 255, 255)) > 0:
        return None  # the ash-covered trees, and the pale specks strewn on the ground (too many, in a scene this size)
    if ((r > 180) & (g < 100) & (b < 40)).mean() >= 0.5:
        return 'lava'
    dark = share(rgb, (131, 49, 32)) + share(rgb, (98, 16, 0))
    # The volcano's rock: its cliff faces in shadow, the edges of its steps, or its flat ashy ground.
    return 'face' if dark > 0.45 else 'rim' if dark > 0.1 else 'flat'


def fire_sketch(rng, h, w):
    """Mt. Chimney's summit: flat rocky ground in the middle, the crater's lava round it, below and to either side (its
    walls stepping down to it, as the crater's do), the volcano's ridges above."""
    out = np.empty((h, w), object)
    paint(out, np.ones((h, w), bool), ('flat', 'rim', 'face'))
    y, x = np.mgrid[0:h, 0:w]
    side = 4 + 3 * smooth_noise(rng, h, w, 7)
    out[(x < side) | (x >= w - side) | (y >= h - 3 - 2 * smooth_noise(rng, h, w, 7))] = 'lava'
    out[oval(rng, h, w, 6.5, 13, 0.3) < 1] = 'flat'
    return out


# Each scene: its secondary tileset (General is the primary), how its metatiles are classed, its sketch, and its
# sample maps (layout names, as in data/layouts/, with an optional rectangle (x0, y0, x1, y1) of the map to learn from).
SCENES = {
    'water': dict(game=EMERALD, secondary='gTileset_Dewford', classify=isle_class, sketch=isle_sketch, everywhere=True,
                  samples=[('Route105', None), ('Route106', None), ('Route107', None)]),
    'grass': dict(secondary='gTileset_PalletTown', classify=grass_class, sketch=grass_sketch, everywhere=True,
                  samples=[('Route1', None), ('Route21_North', (0, 0, 24, 15)), ('PalletTown', None)]),
    'fire': dict(game=EMERALD, secondary='gTileset_Lavaridge', classify=fire_class, sketch=fire_sketch,
                 samples=[('MtChimney', None), ('JaggedPass', None), ('FieryPath', None)] + [('MagmaHideout_' + f, None) for f in ('1F', '2F_1R', '2F_2R', '2F_3R', '3F_1R', '3F_2R', '3F_3R', '4F')]),
}


# The fire scene's other versions (--fire): `dressed`, the collapsed scene with Mt. Chimney's set dressing added where
# the game puts it, and `arena`, a hand-laid arena of rocky ground in a sea of lava. Both use Emerald's Lavaridge
# tileset's metatiles; FIRE_MAPS are the maps whose seams (two metatiles side by side) they must keep to.
FIRE_MAPS = ['MtChimney', 'JaggedPass', 'FieryPath', 'Route112'] + ['MagmaHideout_' + f for f in ('1F', '2F_1R', '2F_2R', '2F_3R', '3F_1R', '3F_2R', '3F_3R', '4F')]
FLOOR = 625  # Mt. Chimney's flat ground (930, Magma Hideout's, is the same tiles)
LAVA, BUBBLES = 701, (540, 819)  # plain lava, and lava with the bubbles TilesetAnim_Lavaridge animates
# Magma Hideout 3F's lava pool on the floor: its rim's corners, edges and inside.
POOL = dict(tl=810, t=811, tr=812, l=818, r=820, bl=826, b=827, br=828, mid=819)
CAVE_MOUTH = (598, 606)  # a cave's mouth in a cliff face, top and bottom (Route 112's to Fiery Path, Jagged Pass's)
STEAM = (786, 787)  # Fiery Path's floor with a steam vent (its puffs: TilesetAnim_Lavaridge's steam)
FACES = {626, 628, 632, 634, 635, 636}  # cliff faces a cave's mouth is cut into


def entry(tile, h=0, v=0, pal=10):
    """A metatile's tile entry: tile index, h-flip, v-flip, palette."""
    return tile | h << 10 | v << 11 | pal << 12


def seams(ts, names):
    """The seams of the maps: (a, d, b) for metatile b seen at DIRS[d] (the four sides) of metatile a, each id as the
    first one drawn with the same tiles (Mt. Chimney's ground and Magma Hideout's are one)."""
    same, out = {}, set()
    canon = lambda m: same.setdefault(tuple(ts.entries(m)), m)
    for name in names:
        b = blocks(layout(name, ts.game), ts.game)
        h, w = b.shape
        for y in range(h):
            for x in range(w):
                for d, (dx, dy) in enumerate(DIRS[:4]):
                    if 0 <= y + dy < h and 0 <= x + dx < w:
                        out.add((canon(int(b[y, x])), d, canon(int(b[y + dy, x + dx]))))
    return out, canon


def fits(grid, cells, seen, canon):
    """Whether every seam of the given cells with their neighbours is one the maps have."""
    h, w = grid.shape
    for y, x in cells:
        for d, (dx, dy) in enumerate(DIRS[:4]):
            if 0 <= y + dy < h and 0 <= x + dx < w and (canon(int(grid[y, x])), d, canon(int(grid[y + dy, x + dx]))) not in seen:
                return False
    return True


def stamp(grid, y, x, block, seen, canon):
    """Puts block (a 2D list of metatile ids, None for leave) at (y, x) if it fits the scene and its seams are the
    maps'; whether it did."""
    h, w = grid.shape
    bh, bw = len(block), len(block[0])
    if y < 0 or x < 0 or y + bh > h or x + bw > w:
        return False
    old = grid[y:y + bh, x:x + bw].copy()
    cells = [(y + j, x + i) for j in range(bh) for i in range(bw) if block[j][i] is not None]
    for j in range(bh):
        for i in range(bw):
            if block[j][i] is not None:
                grid[y + j, x + i] = block[j][i]
    if fits(grid, cells, seen, canon):
        return True
    grid[y:y + bh, x:x + bw] = old
    return False


def sprite(name):
    """An object's picture from Emerald's graphics/object_events/pics/misc/ (its first 16x16 frame) as RGBA: Rock
    Smash's breakable rock, Strength's boulder. Colour 0 is see-through."""
    im = Image.open(io.BytesIO(get(f'graphics/object_events/pics/misc/{name}.png', EMERALD)))
    a = np.array(im)[:16, :16]
    pal = np.array(im.getpalette()[:48], np.uint8).reshape(16, 3)
    return np.dstack([pal[a], np.where(a == 0, 0, 255).astype(np.uint8)])


def on_ground(ts, mid):
    """A metatile of Magma Hideout's lava rim with the dark cave floor its rim stands on (tile 559) swapped for Mt.
    Chimney's ground, quadrant for quadrant (FLOOR's tiles), so it sits on that ground without a dark ring (made up:
    the game puts its pools only on cave floor)."""
    floor = ts.entries(FLOOR)
    new = [floor[q] if e & 0x3FF == 559 else e for q, e in enumerate(ts.entries(mid)[:4])] + list(ts.entries(mid)[4:])
    key = 3000 + mid
    ts.custom[key] = new
    return key


def pool(w, h, ts, rng):
    """A lava pool on the ground, w x h metatiles, rim and all (3x3 at least), bubbling here and there."""
    P = {k: on_ground(ts, v) for k, v in POOL.items() if k != 'mid'}
    mid = lambda: [int(t) for t in rng.choice((LAVA, POOL['mid']), w - 2, p=(0.6, 0.4))]
    return [[P['tl']] + [P['t']] * (w - 2) + [P['tr']]] + [[P['l']] + mid() + [P['r']] for _ in range(h - 2)] + [[P['bl']] + [P['b']] * (w - 2) + [P['br']]]


def dress(ts, grid, rng):
    """The collapsed Mt. Chimney scene with set dressing where the game puts it, each kept only if its seams are the
    maps' (but the pools': see `on_ground`): the pit of darker cave floor filled with the ground round it, cave mouths
    cut into cliff faces with ground in front, small lava pools on open ground, steam vents, and ash-covered trees on
    the high ground. Returns the grid and its objects (none)."""
    seen, canon = seams(ts, FIRE_MAPS)
    grid = grid.copy()
    h, w = grid.shape
    dark = np.isin(grid, (776, 777))
    while dark.any():  # each patch of it at once, its seams with the cliffs round it the maps'
        patch = np.zeros_like(dark)
        patch[tuple(np.argwhere(dark)[0])] = True
        while True:
            more = grow(patch, 1) & dark
            if (more == patch).all():
                break
            patch = more
        ys, xs = np.nonzero(patch)
        y0, x0 = ys.min(), xs.min()
        block = [[FLOOR if patch[y, x] else None for x in range(x0, xs.max() + 1)] for y in range(y0, ys.max() + 1)]
        stamp(grid, y0, x0, block, seen, canon)
        dark &= ~patch
    flat = lambda: np.isin(grid, (FLOOR, 930))
    view = lambda x: 7 <= x < w - 7  # inside what a desktop shows
    # Cave mouths: in a face with face above and beside, the ground in front.
    mouths, fronts = 0, []
    for i in rng.permutation(h * w):
        y, x = divmod(int(i), w)
        if mouths == 2 or not (1 <= y < h - 1 and view(x)) or not flat()[y + 1, x]:
            continue
        if all(int(grid[y + dy, x + dx]) in FACES for dy in (-1, 0) for dx in (-1, 0, 1)) and stamp(grid, y - 1, x, [[CAVE_MOUTH[0]], [CAVE_MOUTH[1]]], seen, canon):
            mouths += 1
            fronts.append((y, x))
    # Lava pools on open ground, a cell of ground all round them, not in the very middle (the cards' place).
    pools = 0
    for i in rng.permutation(h * w):
        y, x = divmod(int(i), w)
        pw, ph = int(rng.integers(3, 6)), 3
        if pools == 3 or not view(x) or not (1 <= y and y + ph < h and x + pw < w) or abs(x + pw / 2 - w / 2) < 4:
            continue
        if flat()[y - 1:y + ph + 1, x - 1:x + pw + 1].all():
            grid[y:y + ph, x:x + pw] = pool(pw, ph, ts, rng)
            pools += 1
    # Steam vents on the ground.
    vents = 0
    for i in rng.permutation(h * w):
        y, x = divmod(int(i), w)
        if vents == 4 or not view(x) or not flat()[max(0, y - 1):y + 2, max(0, x - 1):x + 2].all():
            continue
        if stamp(grid, y, x, [[STEAM[vents % 2]]], seen, canon):
            vents += 1
    # Ash-covered trees (Mt. Chimney's: a top, 708, over a trunk, 716; one stood in front of another, 717 between) on
    # the high ground: ground away from the arena floor in the middle (the cards' place), in clumps as the map has them.
    arena_floor = np.zeros((h, w), bool)
    arena_floor[h // 2, w // 2] = True
    while True:
        more = grow(arena_floor, 1) & flat()
        if (more == arena_floor).all():
            break
        arena_floor = more
    high = flat() & ~grow(arena_floor, 3)
    for y, x in fronts:  # each cave mouth's approach kept clear: the ground in front of it and the way out from there
        clear = np.zeros((h, w), bool)
        clear[y + 1, x] = True
        for _ in range(5):
            clear |= grow(clear, 1) & (flat() | clear)
        high &= ~grow(clear, 1)
    # Groves: a few centres on the high ground, each with every column of high ground round it filled top to bottom
    # with trees stood one in front of another (2 to 4 rows: 708, then 717s, then 716), side by side.
    trees = np.zeros((h, w), bool)
    for _ in range(8):
        ys, xs = np.nonzero(high & ~grow(trees, 3))
        if not len(ys):
            break
        i = rng.integers(len(ys))
        cy, cx = int(ys[i]), int(xs[i])
        for x in range(cx - 4, cx + 5):
            y = max(0, cy - 3)
            while y < cy + 4:
                n = 0
                while 0 <= x < w and y + n < h and y + n < cy + 4 and n < 4 and high[y + n, x]:
                    n += 1
                if n >= 2 and stamp(grid, y, x, [[708]] + [[717]] * (n - 2) + [[716]], seen, canon):
                    trees[y:y + n, x] = True
                    high[y:y + n, x] = False
                y += max(n, 1)
    return grid, []


def arena(ts, rng):
    """A hand-laid arena (not collapsed): rocky ground in the middle, lava on every side, a few outcrops of ground and
    boulders out in the lava, rocks and steam vents on the floor. The ground's edge is Magma Hideout's lava pool rim
    turned inside out: the pool's bottom edge is the arena's top, its top the arena's bottom, its sides the other sides,
    its corners the arena's inner corners. The arena's outer corners are made up (the game has one, 798, the others
    are its rim piece flipped, as the game's own edges flip theirs). Returns the grid and the objects."""
    h, w = H, W
    land = np.zeros((h, w), bool)
    land[4:24, 8:40] = True
    for top in (True, False):  # notches 2 rows deep and bumps 3 out along the top and bottom, as DP's arena has
        x = 10
        while x < 37:
            run, kind = int(rng.integers(3, 7)), rng.choice(['none', 'none', 'notch', 'bump'])
            run = min(run, 38 - x)
            if kind == 'notch':
                land[(slice(4, 6) if top else slice(22, 24)), x:x + run] = False
            elif kind == 'bump':
                land[(slice(1, 4) if top else slice(24, 27)), x:x + run] = True
            x += run + 2
    for left in (True, False):  # and a bump on each side
        y0 = int(rng.integers(7, 16))
        land[y0:y0 + int(rng.integers(3, 6)), 5:8 if left else 40:43] = True
    main = land.copy()
    # Outcrops out in the lava, and 3x3 rocks (the rim round one tile of ground: a boulder), 2 cells of lava at least
    # from the arena and each other.
    for oy, ox, oh, ow in ((0, 0, 3, 4), (19, 44, 4, 4), (25, 2, 3, 4), (0, 44, 3, 4), (10, 0, 3, 3), (2, 7, 3, 3), (25, 40, 3, 3), (13, 45, 3, 3), (18, 1, 3, 3), (0, 22, 3, 3), (25, 20, 3, 3)):
        out = np.zeros_like(land)
        out[oy:oy + oh, ox:ox + ow] = True
        if not (grow(land, 2) & out).any():
            land |= out
    while True:  # every cell of ground in a 3x3 block of it and of lava in a 2x2 (no strips the rim can't draw)
        before = land.copy()
        for want, k in ((True, 3), (False, 2)):
            m = land == want
            block = np.ones((h - k + 1, w - k + 1), bool)
            for dy in range(k):
                for dx in range(k):
                    block &= m[dy:dy + h - k + 1, dx:dx + w - k + 1]
            keep = np.zeros_like(m)
            for dy in range(k):
                for dx in range(k):
                    keep[dy:dy + h - k + 1, dx:dx + w - k + 1] |= block
            land[m & ~keep] = not want
        if (land == before).all():
            break
    lava = ~land
    grid = np.where(rng.random((h, w)) < 0.08, rng.choice(BUBBLES, (h, w)), LAVA)
    ts.custom[2000] = [entry(608, pal=6)] * 4 + [0, 0, 0, entry(135, v=1)]  # outer corner, ground at bottom right
    ts.custom[2001] = [entry(608, pal=6)] * 4 + [0, 0, entry(135, h=1, v=1), 0]  # ground at bottom left
    ts.custom[2002] = [entry(608, pal=6)] * 4 + [entry(135, h=1), 0, 0, 0]  # ground at top left
    pad = np.pad(land, 1, constant_values=False)
    for y, x in zip(*np.nonzero(land)):
        n = {k: not pad[y + 1 + dy, x + 1 + dx] for k, (dy, dx) in dict(N=(-1, 0), S=(1, 0), W=(0, -1), E=(0, 1), NW=(-1, -1), NE=(-1, 1), SW=(1, -1), SE=(1, 1)).items()}
        if n['N'] and n['W']:
            t = 2000
        elif n['N'] and n['E']:
            t = 2001
        elif n['S'] and n['W']:
            t = 798
        elif n['S'] and n['E']:
            t = 2002
        elif n['N']:
            t = POOL['b']
        elif n['S']:
            t = POOL['t']
        elif n['W']:
            t = POOL['r']
        elif n['E']:
            t = POOL['l']
        elif n['NW']:
            t = POOL['br']
        elif n['NE']:
            t = POOL['bl']
        elif n['SW']:
            t = POOL['tr']
        elif n['SE']:
            t = POOL['tl']
        else:
            t = FLOOR
        grid[y, x] = on_ground(ts, t) if t in POOL.values() and t != POOL['mid'] else t
    inner = shrink(land, 1)
    vents = shrink(land, 2)
    vents[:, :12] = vents[:, 36:] = False
    for k, i in enumerate(rng.permutation(np.flatnonzero(vents))[:3]):
        y, x = divmod(int(i), w)
        grid[y, x] = STEAM[k % 2]
    objects = []
    rock, boulder = sprite('breakable_rock'), sprite('pushable_boulder')
    for y, x in ((7, 12), (9, 35), (20, 14), (19, 33), (12, 10), (6, 26)):
        if inner[y, x]:
            objects.append((rock if (y + x) % 2 else boulder, y, x))
    return grid, objects


# The arena layout (--layout arena, the default): the three mats as DP's are, one shape for all: an arena of ground
# (rocky ground, sand, grass) in the middle, a rounded rectangle, with its surround (lava, sea, flowers) all round.
ARENA = (4, 24, 8, 40)  # rows and columns, end exclusive: 20 x 32 metatiles (DP's size), inside a desktop's middle 600 px
MOUND = [[616, 617, 618], [624, 625, 626], [632, 628, 634]]  # Mt. Chimney's rock mound (as Jagged Pass's), on ground
PEBBLE = 781  # Jagged Pass's small round rock, on ground


def arena_land(extra=()):
    """The arena's cells, a rounded rectangle (its corners cut in steps), and any `extra` (y, x, h, w) rectangles."""
    land = np.zeros((H, W), bool)
    y0, y1, x0, x1 = ARENA
    land[y0:y1, x0:x1] = True
    for j in range(3):
        for i in range(3 - j):
            for y, x in ((y0 + j, x0 + i), (y0 + j, x1 - 1 - i), (y1 - 1 - j, x0 + i), (y1 - 1 - j, x1 - 1 - i)):
                land[y, x] = False
    for y, x, h, w in extra:
        land[y:y + h, x:x + w] = True
    return land


def rim(ts, land, grid):
    """Magma Hideout's lava pool rim round the ground in land, turned inside out (see `arena`), on Mt. Chimney's ground."""
    ts.custom[2000] = [entry(608, pal=6)] * 4 + [0, 0, 0, entry(135, v=1)]
    ts.custom[2001] = [entry(608, pal=6)] * 4 + [0, 0, entry(135, h=1, v=1), 0]
    ts.custom[2002] = [entry(608, pal=6)] * 4 + [entry(135, h=1), 0, 0, 0]
    pad = np.pad(land, 1, constant_values=False)
    order = (('N', 'W', 2000), ('N', 'E', 2001), ('S', 'W', 798), ('S', 'E', 2002), ('N', None, POOL['b']), ('S', None, POOL['t']),
             ('W', None, POOL['r']), ('E', None, POOL['l']), ('NW', None, POOL['br']), ('NE', None, POOL['bl']), ('SW', None, POOL['tr']), ('SE', None, POOL['tl']))
    for y, x in zip(*np.nonzero(land)):
        n = {k: not pad[y + 1 + dy, x + 1 + dx] for k, (dy, dx) in dict(N=(-1, 0), S=(1, 0), W=(0, -1), E=(0, 1), NW=(-1, -1), NE=(-1, 1), SW=(1, -1), SE=(1, 1)).items()}
        t = next((t for a, b, t in order if n[a] and (b is None or n[b])), FLOOR)
        grid[y, x] = on_ground(ts, t) if t in POOL.values() and t != POOL['mid'] else t


def raised(ts, grid, y0, x0, h, w, steps):
    """A raised piece of rocky ground in the lava (h x w metatiles at (y0, x0)), one level above it as DP's arena stands:
    Magma Hideout's lava rim along its top (its top corners cut in `steps`), Mt. Chimney's crater walls down its sides
    (649 with the lava to its left, 796 to its right) and, along its bottom, the two rows of cliff face that drop into
    the lava there (the face, 628, the walls carried down beside it; then its foot, 633, over the lava, the full width,
    ended by 539 and 541 under the walls, as the crater's outcrop ends its foot)."""
    last = y0 + h - 3  # the last row of ground; the two below it are the cliff
    piece = np.zeros((H, W), bool)
    piece[y0:last + 1, x0:x0 + w] = True
    for j in range(steps):
        for i in range(steps - j):
            piece[y0 + j, x0 + i] = piece[y0 + j, x0 + w - 1 - i] = False
    rim(ts, piece, grid)
    for y in range(y0 + (steps + 1 if steps else 1), last + 1):
        grid[y, x0], grid[y, x0 + w - 1] = 649, 796
    grid[last, x0 + 1:x0 + w - 1] = FLOOR
    grid[last + 1, x0:x0 + w] = [649] + [628] * (w - 2) + [796]
    grid[last + 2, x0:x0 + w] = [539] + [633] * (w - 2) + [541]


def fire_arena(rng):
    """Fire: Mt. Chimney's rocky ground (Emerald: FireRed has no lava) raised a level above a sea of lava (`raised`);
    Mt. Chimney's rock mounds and Jagged Pass's small round rocks on the floor near its edges, and raised outcrops out
    in the lava with a mound or a rock on them, as DP's."""
    ts = Tilesets('gTileset_General', 'gTileset_Lavaridge', EMERALD)
    grid = np.where(rng.random((H, W)) < 0.08, rng.choice(BUBBLES, (H, W)), LAVA)
    y0, y1, x0, x1 = ARENA
    raised(ts, grid, y0, x0, y1 - y0, x1 - x0, 3)
    for y, x, h, w in ((1, 1, 6, 5), (20, 42, 6, 5), (11, 1, 4, 4), (10, 43, 4, 4), (24, 0, 4, 4), (0, 43, 4, 4), (19, 1, 4, 4)):
        raised(ts, grid, y, x, h, w, 0)
        if h == 6:  # a mound on the big ones, a rock on the rest
            grid[y + 1:y + 4, x + 1:x + 4] = MOUND
        else:
            grid[y + 1, x + w // 2] = PEBBLE
    for y, x in ((y0 + 2, x0 + 4), (y1 - 7, x1 - 7)):  # mounds on the floor, near its edges
        grid[y:y + 3, x:x + 3] = MOUND
    for y, x in ((y0 + 2, x0 + 10), (y1 - 4, x0 + 14), (y0 + 12, x1 - 3), (y0 + 6, x0 + 2)):
        grid[y, x] = PEBBLE
    return ts, grid


# Mt. Ember's (FireRed's Ruby Path's) rocks, drawn over the arena's ground (`ember_overlay`), scattered as Ruby Path
# scatters them: a pile of round rocks (643) and a single round rock (642), a tile each, and the tall pointed rock
# (671 over 679); singles on their own and small groups of mixed kinds side by side or offset, near the floor's edges.
EMBER = dict(pile=[643], rock=[642], spike=[671, 679])
EMBER_SPOTS = [('pile', 12, 10), ('rock', 12, 11), ('rock', 13, 9),  # a group on the left
               ('rock', 16, 11),  # alone
               ('spike', 18, 10), ('pile', 19, 12),  # a spike with a pile beside it, lower
               ('rock', 5, 16), ('pile', 5, 24), ('rock', 5, 25),  # along the top
               ('spike', 8, 37), ('pile', 9, 36), ('rock', 10, 38),  # a group on the right
               ('pile', 13, 36),  # alone
               ('rock', 20, 37), ('pile', 21, 36), ('rock', 21, 38)]  # and lower right


def ember_overlay(shots, things=EMBER_SPOTS):
    """Mt. Ember's rocks drawn over every frame: the top layer of FireRed's Mt. Ember metatiles only (its palettes),
    so the arena's ground shows round them, not Ruby Path's grey cave floor."""
    ts = Tilesets('gTileset_General', 'gTileset_MtEmber')
    out = []
    for rgb, ms in shots:
        rgb = rgb.copy()
        for name, y0, x0 in things:
            for j, m in enumerate(EMBER[name]):
                for q, e in enumerate(ts.entries(m)[4:]):
                    t = ts.tiles[e & 0x3FF]
                    if e >> 10 & 1:
                        t = t[:, ::-1]
                    if e >> 11 & 1:
                        t = t[::-1]
                    yy, xx = (y0 + j) * 16 + (q // 2) * 8, x0 * 16 + (q % 2) * 8
                    sub = rgb[yy:yy + 8, xx:xx + 8]
                    sub[t != 0] = ts.pals[e >> 12][t[t != 0]]
        out.append((rgb, ms))
    return out


# FireRed's sand island in the sea (Route 21's and Treasure Beach's): the sand's edges by where the sea is round it.
SHORE = dict(N=269, S=285, W=276, E=278, NW=268, NE=270, SW=284, SE=286, nw=293, ne=294, sw=301, se=302, mid=277)
SEA, SEA_ROCK = 299, [[459, 460], [467, 468]]


def opened(land, k=2):
    """land with every cell of land, and of sea, in a k x k block of its own kind (no strip one tile wide the shore
    can't draw)."""
    land = land.copy()
    h, w = land.shape
    while True:
        before = land.copy()
        for want in (True, False):
            m = land == want
            block = np.ones((h - k + 1, w - k + 1), bool)
            for dy in range(k):
                for dx in range(k):
                    block &= m[dy:dy + h - k + 1, dx:dx + w - k + 1]
            keep = np.zeros_like(m)
            for dy in range(k):
                for dx in range(k):
                    keep[dy:dy + h - k + 1, dx:dx + w - k + 1] |= block
            land[m & ~keep] = not want
        if (land == before).all():
            return land


def isle_land(rng):
    """The water arena's island, not quite round, as DP's fire arena: the arena's rectangle with a few notches and bumps
    2 to 3 tiles along its sides (none on the top and bottom in a phone's middle column, but a bump at the bottom
    middle: sand there, sea above and below), each corner cut its own way; and two uneven sandbars out at sea."""
    y0, y1, x0, x1 = ARENA
    land = np.zeros((H, W), bool)
    land[y0 + 1:y1 - 1, x0:x1] = True  # rows 5-22, columns 8-39
    for rows, cols, on in (((3, 5), (12, 15), True), ((5, 7), (31, 34), False), ((4, 5), (35, 38), True),  # the top
                           ((21, 23), (14, 17), False), ((23, 25), (20, 26), True), ((23, 24), (32, 35), True),  # the bottom
                           ((10, 13), (6, 8), True),  # the left side
                           ((9, 12), (40, 42), True), ((16, 19), (38, 40), False)):  # the right side
        land[rows[0]:rows[1], cols[0]:cols[1]] = on
    for (cy, cx, dy, dx), size in zip(((5, 8, 1, 1), (5, 39, 1, -1), (22, 8, -1, 1), (22, 39, -1, -1)), (3, 2, 2, 3)):  # corners
        for j in range(size):
            for i in range(size - j):
                land[cy + dy * j, cx + dx * i] = False
    land[21:23, 8:10] = False  # (the bottom-left corner cut square, the others stepped)
    for y, x, shape in ((2, 1, ['.###.', '#####', '####.', '.##..']), (19, 43, ['.##..', '####.', '#####', '.####', '..##.'])):
        for j, row in enumerate(shape):
            for i, c in enumerate(row):
                if c == '#':
                    land[y + j, x + i] = True
    return opened(land)


def water_arena(rng):
    """Water: FireRed's sand island (Route 21's and One Island's Treasure Beach's sand, shore and sea), its outline
    uneven (`isle_land`), two sandbars and rocks offshore, as DP's."""
    ts = Tilesets('gTileset_General', 'gTileset_SeviiIslands123')
    land = isle_land(rng)
    grid = np.full((H, W), SEA)
    pad = np.pad(land, 1, constant_values=False)
    for y, x in zip(*np.nonzero(land)):
        sea = {k: not pad[y + 1 + dy, x + 1 + dx] for k, (dy, dx) in dict(N=(-1, 0), S=(1, 0), W=(0, -1), E=(0, 1), nw=(-1, -1), ne=(-1, 1), sw=(1, -1), se=(1, 1)).items()}
        side = ''.join(k for k in 'NS' if sea[k]) + ''.join(k for k in 'WE' if sea[k])
        if len(side) == 2 and side[0] in 'NS' and side[1] in 'WE':
            grid[y, x] = SHORE[side]
        elif len(side) == 1:
            grid[y, x] = SHORE[side]
        else:
            grid[y, x] = next((SHORE[k] for k in ('nw', 'ne', 'sw', 'se') if sea[k]), SHORE['mid'])
    # Rocks offshore, round the arena and along the frame's edges, as DP's.
    for y, x in ((0, 10), (0, 30), (1, 40), (2, 15), (3, 26), (5, 1), (8, 4), (13, 5), (17, 1), (21, 4), (24, 0), (25, 9),
                 (26, 18), (24, 23), (26, 28), (25, 37), (23, 44), (13, 45), (8, 42), (4, 45), (0, 46)):
        if not grow(land, 1)[y:y + 2, x:x + 2].any() and (grid[y:y + 2, x:x + 2] == SEA).all():
            grid[y:y + 2, x:x + 2] = SEA_ROCK
    return ts, grid


# Route 109's beach things (Emerald's General and Slateport tiles): its umbrellas (red, blue, green: 2x3 with their
# shadow), deck chairs and floats (1x3), its sign. Each wanted near a spot on the island, out of the cards' middle.
BEACH = dict(red=[[740, 741], [748, 749], [756, 757]], blue=[[738, 739], [746, 747], [754, 755]], green=[[742, 743], [750, 751], [758, 759]],
             chair=[[737], [745], [753]], raft=[[736], [744], [752]], sign=[[660]])
BEACH_SPOTS = [('red', 7, 9), ('raft', 8, 12), ('chair', 15, 9), ('chair', 15, 10), ('blue', 6, 36), ('chair', 7, 38), ('green', 16, 34), ('sign', 20, 11)]


def beach_things(grid):
    """Where Route 109's things go: each at the free spot nearest its own, every cell of it on plain sand (277), none
    in a desktop's middle (the cards', about 360 x 250 px) nor touching another. Returns [(name, y, x)]."""
    free = grid == SHORE['mid']
    taken = np.zeros_like(free)
    out = []
    for name, wy, wx in BEACH_SPOTS:
        h, w = len(BEACH[name]), len(BEACH[name][0])
        spots = [(abs(y - wy) + abs(x - wx), y, x) for y in range(H - h) for x in range(W - w)
                 if free[y:y + h, x:x + w].all() and not taken[max(0, y - 1):y + h + 1, max(0, x - 1):x + w + 1].any()
                 and not (x + w > 13 and x < 35 and y + h > 6 and y < 22)]
        if spots:
            _, y, x = min(spots)
            taken[y:y + h, x:x + w] = True
            out.append((name, y, x))
    return out


def beach_overlay(shots, things):
    """Route 109's things drawn over the FireRed sand of every frame: their tiles as Emerald draws them (its General and
    Slateport tilesets and palettes), but for its sand (tiles 264 and 280, and the sand-coloured pixels of the
    umbrellas' shadow tiles), so FireRed's sand shows round them."""
    ts = Tilesets('gTileset_General', 'gTileset_Slateport', EMERALD)
    sand = {tuple(c) for t in (264, 280) for c in ts.pals[5][np.unique(ts.tiles[t])]}
    out = []
    for rgb, ms in shots:
        rgb = rgb.copy()
        for name, y0, x0 in things:
            for j, row in enumerate(BEACH[name]):
                for i, m in enumerate(row):
                    for q, e in enumerate(ts.entries(m)):
                        tile, pal = e & 0x3FF, e >> 12
                        if tile in (0, 264, 280):
                            continue
                        t = ts.tiles[tile]
                        if e >> 10 & 1:
                            t = t[:, ::-1]
                        if e >> 11 & 1:
                            t = t[::-1]
                        yy, xx = (y0 + j) * 16 + (q % 4 // 2) * 8, (x0 + i) * 16 + (q % 2) * 8
                        colours = ts.pals[pal][t]
                        keep = (t != 0) & ~np.array([[tuple(c) in sand for c in row_] for row_ in colours])
                        rgb[yy:yy + 8, xx:xx + 8][keep] = colours[keep]
        out.append((rgb, ms))
    return out


FLOWER, GRASS = 4, [[8, 9], [16, 17]]  # General's animated flower, and Route 1's grass in its 2x2 tiling
TREES_TOP = [[28, 29], [36, 37]]  # Route 1's trees, the row of them above the grass (and its foot)
TREES_BOTTOM = [[14, 15], [30, 31], [20, 21]]  # and below it


TALL = 13  # tall grass


def grass_arena(rng):
    """Grass: a field of Route 1's grass whose open middle comes from General's flowers (FireRed's only flowers)
    thinning out towards it: drifts and clumps of them, uneven, denser in places, with single flowers and pairs loose
    between, and tall grass mixed in the same way, nothing in rows; Route 1's trees along the frame's top and bottom."""
    ts = Tilesets('gTileset_General', 'gTileset_PalletTown')
    grid = np.array([[GRASS[y % 2][x % 2] for x in range(W)] for y in range(H)])
    y0, y1, x0, x1 = ARENA
    d = oval(rng, H, W, (y1 - y0) / 2 - 1, (x1 - x0) / 2 - 2, 0.35)  # under 1 the field, more the further out
    out = np.clip((d - 0.95) / 0.35, 0, 1)  # 0 in the field, 1 well out of it
    drift = 0.6 * smooth_noise(rng, H, W, 4) + 0.4 * smooth_noise(rng, H, W, 2)
    flowers = drift > 0.85 - 0.45 * out  # drifts, denser further out
    loose = rng.random((H, W)) < 0.12 * out  # single flowers and pairs between them
    loose |= np.roll(loose, 1, 1) & (rng.random((H, W)) < 0.4)
    tall = (0.5 * smooth_noise(rng, H, W, 3) + 0.5 * smooth_noise(rng, H, W, 2) > 0.78 - 0.2 * out) & (out > 0.2)
    grid[tall & ~flowers] = TALL
    near_trees = np.zeros((H, W), bool)
    near_trees[2] = near_trees[H - 4] = True  # (thinned beside the trees, so the drifts don't start in a straight row)
    flowers &= ~(near_trees & (rng.random((H, W)) < 0.55))
    grid[(flowers | loose) & (out > 0)] = FLOWER
    for j, row in enumerate(TREES_TOP):
        grid[j] = [row[x % 2] for x in range(W)]
    for j, row in enumerate(TREES_BOTTOM):
        grid[H - 3 + j] = [row[x % 2] for x in range(W)]
    return ts, grid


ARENAS = dict(fire=fire_arena, water=water_arena, grass=grass_arena)


def overlay(shots, objects):
    """The objects drawn over every frame (each a 16x16 RGBA picture at a metatile)."""
    out = []
    for rgb, ms in shots:
        rgb = rgb.copy()
        for pic, y, x in objects:
            sub = rgb[y * 16:y * 16 + 16, x * 16:x * 16 + 16]
            sub[pic[..., 3] > 0] = pic[..., :3][pic[..., 3] > 0]
        out.append((rgb, ms))
    return out


MODELS = {}  # each scene's Model, once built


def build(kind, seed, tries=4):
    """The scene's tilesets and metatile grid: of `tries` sketches collapsed, the one that keeps closest to its sketch."""
    cfg = SCENES[kind]
    ts = Tilesets('gTileset_General', cfg['secondary'], cfg.get('game', FRLG))
    model = MODELS[kind] = Model(ts, cfg['samples'], cfg['classify'], everywhere=cfg.get('everywhere', False))
    rng = np.random.default_rng(seed)
    best = None
    for attempt in range(tries):
        try:
            sketch = cfg['sketch'](rng, H, W)
            sketch, fixed = sketch if isinstance(sketch, tuple) else (sketch, None)
            grid, score = plan(model, sketch, rng, fixed=fixed)
        except RuntimeError:
            continue
        if best is None or score > best[1]:
            best = grid, score
    if best is None:
        raise RuntimeError('no scene came out for ' + kind)
    return ts, best[0]


def frames(ts, grid):
    """The scene once per animation step: [(rgb, ms)]. Only the animations whose tiles the scene uses count; the step is
    the greatest common divisor of their intervals and the loop the least common multiple of their periods (a scene
    needing more than MAX_FRAMES stops: none does). A still scene is one frame of a second."""
    used = {e & 0x3FF for m in np.unique(grid) for e in ts.entries(int(m))}
    live = [a for a in anims(ts.primary, ts.game) + anims(ts.secondary, ts.game) if used & set(range(a[2], a[2] + len(a[3][0])))]
    if not live:
        return [(ts.render(grid), 1000)]
    step, loop = 0, 1
    for interval, _, _, fr, _ in live:
        step, loop = gcd(step, interval), lcm(loop, interval * len(fr))
    assert loop // step <= MAX_FRAMES, (loop, step)
    out = []
    for k in range(loop // step):
        tiles = ts.tiles.copy()
        for interval, _, start, fr, shift in live:
            f = fr[(k * step // interval + shift) % len(fr)]
            tiles[start:start + len(f)] = f
        out.append((ts.render(grid, tiles), step * 1000 / 60))
    return out


def save(kind, shots, out_dir):
    """The frames stacked into one indexed PNG, and <kind>.json: {width, height, frames: [{y, ms}]}."""
    sheet = np.concatenate([s for s, _ in shots])
    colours, inverse = np.unique(sheet.reshape(-1, 3), axis=0, return_inverse=True)
    assert len(colours) <= 256, len(colours)
    im = Image.fromarray(inverse.reshape(sheet.shape[:2]).astype(np.uint8), 'P')
    im.putpalette(colours.astype(np.uint8).ravel().tolist())
    os.makedirs(out_dir, exist_ok=True)
    im.save(os.path.join(out_dir, kind + '.png'), optimize=True)
    h, w = shots[0][0].shape[:2]
    json.dump({'width': w, 'height': h, 'frames': [{'y': i * h, 'ms': round(ms)} for i, (_, ms) in enumerate(shots)]}, open(os.path.join(out_dir, kind + '.json'), 'w'))


def preview(kind, shots, out_dir):
    """The first frame; a strip of the first 8 frames of the 96 px square that changes most between them, at 2x; and
    what a desktop table shows (the middle 600 x 448) and a phone held upright (the middle 260 px column), at 2x."""
    os.makedirs(out_dir, exist_ok=True)
    first = shots[0][0]
    Image.fromarray(first).save(os.path.join(out_dir, kind + '.png'))
    moving = sum((a != b).any(axis=2) for (a, _), (b, _) in zip(shots, shots[1:] + shots[:1]))
    y, x = max(((y, x) for y in range(0, H * 16 - 95, 16) for x in range(0, W * 16 - 95, 16)), key=lambda p: np.sum(moving[p[0]:p[0] + 96, p[1]:p[1] + 96]))
    strip = np.concatenate([s[y:y + 96, x:x + 96] for s, _ in shots[:8]], axis=1)
    Image.fromarray(strip).resize((strip.shape[1] * 2, 192), Image.NEAREST).save(os.path.join(out_dir, kind + '-anim.png'))
    for name, width in (('desktop', 600), ('phone', 260)):
        x = (W * 16 - width) // 2
        Image.fromarray(first[:, x:x + width]).resize((width * 2, H * 32), Image.NEAREST).save(os.path.join(out_dir, kind + '-' + name + '.png'))


def main():
    ap = argparse.ArgumentParser(description="Draws the battle table's FireRed/LeafGreen type mats.")
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--cache', default=FRLG.cache, help="where pokefirered's files are kept")
    ap.add_argument('--emerald-cache', default=EMERALD.cache, help="where pokeemerald's files are kept")
    ap.add_argument('--fire', choices=('plain', 'dressed', 'arena'), default='dressed', help="which fire scene: the collapsed one with set dressing (the app's fire.png), without it (fire_plain.png) or the hand-laid arena (fire_arena.png)")
    ap.add_argument('--layout', choices=('arena', 'scene'), default='arena', help="arena: the three as DP's are, an arena in its surround (the app's); scene: the earlier made-up scenes (the --fire versions, Route 105's island, the meadow)")
    ap.add_argument('--out', help='where the sheets go (apps/web/public/mats/frlg/ without it)')
    ap.add_argument('--preview')
    ap.add_argument('types', nargs='*', help=', '.join(SCENES) + ' (all without one)')
    args = ap.parse_args()
    FRLG.cache, EMERALD.cache = args.cache, args.emerald_cache
    out_dir = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'web', 'public', 'mats', 'frlg')
    for kind in args.types or list(SCENES):
        name, objects = kind, []
        if args.layout == 'arena':
            ts, grid = ARENAS[kind](np.random.default_rng(args.seed))
            if kind == 'water':
                things = beach_things(grid)
        elif kind == 'fire' and args.fire == 'arena':
            ts = Tilesets('gTileset_General', SCENES['fire']['secondary'], EMERALD)
            grid, objects = arena(ts, np.random.default_rng(args.seed))
        else:
            ts, grid = build(kind, args.seed)
            if kind == 'water':
                grid = isle_dress(ts, grid, np.random.default_rng(args.seed), MODELS[kind])
            if kind == 'fire' and args.fire == 'dressed':
                grid, objects = dress(ts, grid, np.random.default_rng(args.seed))
        if args.layout == 'scene' and kind == 'fire' and args.fire != 'dressed':
            name = 'fire_' + args.fire
        shots = overlay(frames(ts, grid), objects)
        if args.layout == 'arena' and kind == 'water':
            shots = beach_overlay(shots, things)
        if args.layout == 'arena' and kind == 'fire':
            shots = ember_overlay(shots)
        save(name, shots, out_dir)
        if args.preview:
            preview(name, shots, args.preview)
        print(name, len(shots), 'frames of', round(shots[0][1]), 'ms')


if __name__ == '__main__':
    main()
