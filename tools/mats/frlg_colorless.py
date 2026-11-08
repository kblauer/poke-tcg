"""Draws the Colorless type mat (the gen 1 set's, beside tools/mats/frlg_mats.py's) into apps/web/public/mats/frlg/colorless.png.

A department store's lobby, from FireRed's Celadon Department Store (the Building and DepartmentStore tilesets: its 1F,
and the floors above it for the furnishings the lobby lacks), laid out by hand as frlg_mats.py's interiors are:
- the back wall along the top: the 1F's hall (its elevator with the 1F sign, a directory board either side of it and the
  stairs up on the left and the right, from the 3F's and 5F's maps) on its lilac carpet, widened, the wall running on to
  both edges with the lower white partition under it and the boards and pay phones set in it;
- the open orange floor, rows 5-23 and the columns the cards need clear (10-37), bare;
- the furnishings round it, each copied with the shading the game draws under it from the store's own maps: clothes racks
  and display cases (2F, 4F, 5F), the 3F's reception counter with its computers and stools, the 1F's reception counter
  (its yellow rug round it, shortened by a few columns), sofas and potted plants against the edges;
- the doormats (the 1F's red ones) at the bottom, whose lower half is cut from the exit's tiles over the floor
  (`Tilesets.custom`), and three potted plants as the 1F has them in its bottom right corner;
- a few shoppers (FireRed's people sprites) about the edges, now and then one turning to look another way or strolling
  a few tiles and back (the user's, 2026-11-07; `strolling`): a loop of `ROUTINE` turns and strolls at random, a pause
  between each, every shopper home and facing down again by the loop's end. A stroll keeps to the plain floor, off
  the cards' area and other shoppers' spots, a tile every 32 game frames, half the game's pace (drawn every 8, `STEP_MS`; the user's, 2026-11-07),
  the walking frames alternating tile by tile. Frames that look alike are drawn once and shown again (the sheet's
  `order`); a pause is a frame shown PAUSE_MS at a time.

Usage: python tools/mats/frlg_colorless.py [--seed N] [--out DIR] [--preview FILE]; needs frlg_mats.py beside it. In
frlg_mats.py: `strolling(ts, grid, rng)` on colorless_arena's lobby (its `own_file`)."""
import argparse, io, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import frlg_mats as fm
from frlg_mats import H, W, Tilesets, blocks, get, layout, place

FLOOR, FLOOR_L = 704, 705  # the orange floor, and the floor with the left wall's shade (the frame's left edge)
PLANT_L, PLANT_R = [[702], [710]], [[703], [711]]  # a potted plant (2 tall), the shade at its left or its right
SOFA_L, SOFA_R = [[790], [798], [806]], [[786], [794], [802]]  # a sofa against the left or the right edge
PHONES = [[751, 751], [759, 759]]  # a pair of pay phones set in the lower partition
BOARD = [[647], [655], [650]]  # a directory board on the back wall: its top, its face, the wall's foot
WALL = [643, 651, 650]  # the back wall's top, its face and its foot; the lower partition's top, face and base:
PARTITION = [680, 686, 694]
MAT = [[682, 683, 684], [3000, 3001, 3002]]  # the doormat: its top, and its lower half over the floor (custom metatiles)


def region(name, y0, y1, x0, x1):
    """A rectangle of a Celadon Department Store map's metatiles (rows y0-y1, columns x0-x1, ends exclusive)."""
    return blocks(layout('CeladonCity_DepartmentStore_' + name))[y0:y1, x0:x1].copy()


def with_shade(rows, w):
    """A piece of furniture's rows, with the floor's shade under it (709, the right-hand corner 708)."""
    return np.vstack([np.asarray(rows), [709] * (w - 1) + [708]])


def hall():
    """The back wall's hall, rows 0-5 and 16 columns: the 3F's (stairs, the elevator, the board) with three plain
    columns each side of the elevator, the 1F's sign on the elevator and the partitions' ends capped as the 4F's."""
    src = region('3F', 0, 6, 0, 13)
    src[2, 6] = 661  # the 1F sign
    src[4, 2], src[5, 2] = 687, 695  # the left partition's end
    src[4, 10], src[5, 10] = 685, 693  # the right partition's start
    src[4, 11], src[5, 11] = PARTITION[1], PARTITION[2]
    plain = [WALL[0], WALL[1], WALL[2], 641, 649, FLOOR]
    left_board = [BOARD[0][0], BOARD[1][0], BOARD[2][0], 641, 649, FLOOR]
    # The 3F's stairs up (its columns 1-3, rows 0-3) left out: here they climbed into the back wall (the user's,
    # 2026-11-08); plain wall and carpet there, the partition under them kept. The stairwell down on the right stays.
    no_stairs = [np.concatenate([plain[:4], src[4:, c]]) for c in (1, 2, 3)]
    cols = [*no_stairs, plain, plain, left_board, src[:, 5], src[:, 6], src[:, 7], src[:, 8],
            plain, plain, plain, src[:, 9], src[:, 10], src[:, 11]]
    return np.stack(cols, axis=1)


def colorless_arena(rng):
    """(the tilesets, the metatile grid) of the lobby; `rng` is unused (the lobby is laid out by hand)."""
    ts = Tilesets('gTileset_Building', 'gTileset_DepartmentStore')
    for k in range(3):  # the doormat's lower half (690-692: its top layer over a black bottom layer) over the floor
        ts.custom[3000 + k] = list(ts.entries(FLOOR)[:4]) + list(ts.entries(690 + k)[4:])
    grid = np.full((H, W), FLOOR)
    grid[:, 0] = FLOOR_L
    for y, tile in enumerate(WALL + PARTITION):  # the wall and the partition under it run the whole width
        grid[y] = tile
    top = hall()
    x0 = (W - top.shape[1]) // 2
    grid[:6, x0:x0 + top.shape[1]] = top
    free = np.zeros((H, W), bool)  # (nothing is taken: the pieces keep clear of each other by their places)
    for x in (4, 11, 36, 43):  # directory boards along the wall's face
        place(grid, free, 0, x, BOARD)
    for x in (7, 40):
        place(grid, free, 4, x, PHONES)
    rack = with_shade(region('2F', 7, 11, 7, 10), 3)  # a clothes rack (2 wide, 4 tall)
    vitrine = with_shade(region('5F', 7, 10, 7, 10), 3)  # a glass display (2 wide, 3 tall)
    cases = np.vstack([region('4F', 6, 10, 5, 9), [709, 709, 709, 708]])  # two glass counters stacked (3 wide, 4 tall)
    counter = region('3F', 7, 10, 0, 8)  # the reception counter with its computers and stools (8 wide, 3 tall)
    counter[2, 0] = 709
    desk = region('1F', 7, 13, 2, 11)  # the 1F's counter in its yellow rug, 9 wide and 6 tall...
    desk = np.delete(desk, [4, 5, 6], axis=1)  # ...shortened to 6 wide
    pieces = [  # (row, column, block)
        (6, 0, PLANT_L), (9, 0, SOFA_L), (13, 0, PLANT_L),
        (7, 2, rack), (7, 6, vitrine), (12, 2, rack), (12, 6, cases),
        (18, 1, counter), (23, 3, PLANT_L), (23, 6, PLANT_R),
        (7, 40, desk), (15, 39, vitrine), (15, 43, vitrine), (14, 47, SOFA_R), (18, 47, PLANT_R),
        (19, 39, counter), (23, 39, PLANT_L), (23, 42, PLANT_L), (23, 45, PLANT_R),
        (24, 0, PLANT_L), (24, 47, PLANT_R),
    ]
    for y, x, block in pieces:
        place(grid, free, y, x, block)
    for x in (19, 26):  # the doormats, at the bottom edge
        place(grid, free, H - 2, x, MAT)
    return ts, grid


SHOPPERS = [('lass', 5, 11), ('gentleman', 8, 17), ('little_girl', 3, 17), ('woman_1', 38, 13), ('man', 42, 14), ('boy', 44, 24),
            ('cooltrainer_f', 46, 13), ('beauty', 16, 26), ('youngster', 31, 26)]  # (the sprite, the column, the row of the metatile it stands on)


ROUTINE = 14  # the turns and strolls in a loop
STROLL = 0.45  # how often one is a stroll (else a turn)
PAUSE_MS, STEP_MS = 250, 133  # a pause's frame (shown as many times as the pause takes), and a walking frame (8 game frames: half the game's pace, the user's)
PAUSES = (1.5, 4.0)  # seconds between one and the next (the user's, 2026-11-07: a little longer)
DIRS = dict(down=(0, 1), up=(0, -1), left=(-1, 0), right=(1, 0))
# The sprites' frames (sAnimTable_Standard's): facing down, up and left, then each one's two walking frames (right: left flipped).
POSE = dict(down=(0, 3, 4), up=(1, 5, 6), left=(2, 7, 8), right=(2, 7, 8))
CARDS = 5, 24, 10, 38  # the cards' rows and columns (ends exclusive): no stroll crosses them


def person(name):
    """A people sprite's frames (16 wide each) as RGBA pictures: colour 0 is see-through."""
    im = Image.open(io.BytesIO(get(f'graphics/object_events/pics/people/{name}.png')))
    a = np.array(im)
    pal = np.array(im.getpalette()[:48], np.uint8).reshape(16, 3)
    rgba = np.dstack([pal[a], np.where(a == 0, 0, 255).astype(np.uint8)])
    return [rgba[:, i:i + 16] for i in range(0, a.shape[1], 16)]


def draw(rgb, people, pics):
    """The shoppers drawn over a frame, the lower ones over the higher: each (name, x px, y px of the tile its feet are on, facing, frame)."""
    for name, x, y, facing, frame in sorted(people, key=lambda p: p[2]):
        pic = pics[name][POSE[facing][frame]]
        pic = pic[:, ::-1] if facing == 'right' else pic
        top = y + 16 - pic.shape[0]
        ys = slice(max(0, top), y + 16)
        sub = rgb[ys, x:x + 16]
        p = pic[ys.start - top:]
        sub[p[..., 3] > 0] = p[..., :3][p[..., 3] > 0]


def routine(rng, grid, people=SHOPPERS):
    """The loop's moves: ROUTINE of them, each after a pause (s), a shopper turning to face another way or strolling 1-3
    tiles out along the plain floor and back; then each one not facing down turns back. [(pause, who, move)], a move
    ('turn', facing) or ('stroll', facing, tiles)."""
    homes = {(x, y) for _, x, y in people}
    def clear(x, y):
        inside = CARDS[0] <= y < CARDS[1] and CARDS[2] <= x < CARDS[3]
        return 0 <= y < H and 0 <= x < W and grid[y, x] in (FLOOR, FLOOR_L) and (x, y) not in homes and not inside
    facing, moves = ['down'] * len(people), []
    for _ in range(ROUTINE):
        pause, who = float(rng.uniform(*PAUSES)), int(rng.integers(len(people)))
        _, x, y = people[who]
        if rng.random() < STROLL:
            ways = []
            for d, (dx, dy) in DIRS.items():
                n = 0
                while n < 3 and clear(x + dx * (n + 1), y + dy * (n + 1)):
                    n += 1
                if n:
                    ways.append((d, n))
            if ways:
                d, n = ways[int(rng.integers(len(ways)))]
                moves.append((pause, who, ('stroll', d, int(rng.integers(1, n + 1)))))
                continue
        facing[who] = str(rng.choice([d for d in DIRS if d != facing[who]]))
        moves.append((pause, who, ('turn', facing[who])))
    moves += [(float(rng.uniform(*PAUSES)), who, ('turn', 'down')) for who, f in enumerate(facing) if f != 'down']
    return moves


def strolling(ts, grid, rng, people=SHOPPERS):
    """The lobby with its shoppers going about `routine`: (shots, order) for frlg_mats.save, the frames alike drawn once."""
    still = fm.frames(ts, grid)[0][0]
    pics = {name: person(name) for name, _, _ in people}
    state = [[name, x * 16, y * 16, 'down', 0] for name, x, y in people]
    shots, order, seen = [], [], {}

    def show(ms, times=1):
        key = (tuple(map(tuple, state)), ms)
        if key not in seen:
            rgb = still.copy()
            draw(rgb, state, pics)
            seen[key] = len(shots)
            shots.append((rgb, ms))
        order.extend([seen[key]] * times)

    stepped = [0] * len(people)  # (each one's walking frame alternates tile by tile)
    for pause, who, move in routine(rng, grid, people):
        show(PAUSE_MS, max(1, round(pause * 1000 / PAUSE_MS)))
        me = state[who]
        if move[0] == 'turn':
            me[3] = move[1]
            continue
        _, d, n = move
        before = me[3]
        for way, pause_back in ((d, True), ({'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'}[d], False)):
            me[3] = way
            dx, dy = DIRS[way]
            for _ in range(n):
                stepped[who] ^= 1
                for k in range(1, 5):  # (4 px every 4 game frames: the first half on a walking frame, the second standing)
                    me[1] += dx * 4
                    me[2] += dy * 4
                    me[4] = (1 + stepped[who]) if k <= 2 else 0
                    if k < 4:
                        show(STEP_MS)
            me[4] = 0
            if pause_back:
                show(PAUSE_MS, max(1, round(float(rng.uniform(0.5, 1.2)) * 1000 / PAUSE_MS)))
        me[3] = before
    show(PAUSE_MS, max(1, round(float(rng.uniform(*PAUSES)) * 1000 / PAUSE_MS)))
    return shots, order


def main():
    ap = argparse.ArgumentParser(description="Draws the Colorless type mat, a department store's lobby.")
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', help='where the sheet goes (apps/web/public/mats/frlg/ without it)')
    ap.add_argument('--preview', help='also write the frame here, as a PNG')
    args = ap.parse_args()
    out_dir = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'web', 'public', 'mats', 'frlg')
    ts, grid = colorless_arena(np.random.default_rng(args.seed))
    shots, order = strolling(ts, grid, np.random.default_rng(args.seed))
    fm.save('colorless', shots, out_dir, order)
    if args.preview:
        Image.fromarray(shots[0][0]).save(args.preview)
    print('colorless', len(shots), 'frames of', round(shots[0][1]), 'ms')


if __name__ == '__main__':
    main()
