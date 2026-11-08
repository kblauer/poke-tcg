"""Draws the FireRed/LeafGreen Metal type mat into apps/web/public/mats/frlg/ (metal.png, metal.json): a steel bridge in
the style of the Cycling Road going round the play area over the sea, Bikers riding round it.

FireRed's Cycling Road (Routes 16-18) is a paved road on land, with no girder deck over the sea, so the bridge is
Emerald's Seaside Cycling Road (Route 110, its General and Mauville tiles), pieces of its map copied as they are
(`TURNS`): its thin bridge (a rail, two rows of deck, a rail, the girders' face, the pillars on the sea below it, its
shadow on the water below and to the right) and its 5-wide vertical bridge, which meet in four ways on the map: the
vertical one below the horizontal one and the horizontal one going on to the right (its end 2 tiles past the turn) or
to the left (a rounded corner), or above it, going on to the right or the left (each end 2 tiles past the turn). Route
110 only turns at right angles, so the loop (`LOOP`) is made less rectangular by jogs (the user's, 2026-11-07): the top
bridge along row 2 and the bottom one along row 22, the left side stepping out 7 columns at row 14 and the right one
stepping in 7 at row 12, a skewed Z with eight turns, each one of the four as its way round asks (a jog is as tight as
the pieces allow: two turns side by side, 8 rows of vertical bridge between a turn below a bridge and one above the
next); the outer sides' outer rails and the overhangs fall off the frame's sides. The top rail and the bottom one
open, each where a way off the bridge leaves it on Route 110, onto ways off the frame north and south (`NORTH`,
`SOUTH`), so the riders aren't stranded (the user's, 2026-11-07). The sea all round, inside the loop too (under the
cards: calm, but for 3 columns of each side's jog), is Emerald's General sea, animated (every 16 game frames over 8), a
few of Route 110's rocks out on it outside the loop (`ROCKS`).

The riders (`ride`): FireRed's Biker (graphics/object_events/pics/people/biker.png, sAnimTable_Standard's frames:
facing down, up, left (right is left flipped), each with two pedalling frames), in the game's pink NPC palette,
riding clockwise round the deck's middle (`LANE`, turning at each of the loop's turns), a frame every 8 game
frames (7.5 a second) and 4 px a frame (a quarter of the bike's speed), pedalling a frame every 16 game frames. The loop is 2048
px round and the sheet 256 frames, so a rider goes 1024 px, half the way round: one rider (`RIDERS`) repeated twice
round the loop, two riders across it from each other (the user's, 2026-11-07), so each one ends where the other began
and the sheet loops seamlessly (both in the Biker's own pink: a second colour would swap at the loop; the sea's
16-frame loop goes into 256 sixteen times). Writes a 256-frame sheet as frlg_mats.save does.

Needs frlg_mats.py beside it (its downloads, Tilesets, frames, save). Usage: python tools/mats/frlg_metal.py [--seed N]
[--out DIR] [--preview DIR]"""
import argparse, io, os
import numpy as np
from PIL import Image
import frlg_mats as fm
from frlg_mats import EMERALD, H, W, Tilesets, blocks, get, layout

SEA, SHADOW = 368, 369  # Emerald's General sea, and the bridge's shadow on it
ROCK = [[336, 337], [344, 345]]  # Route 110's rocks in the sea
ROCKS = [(9, 1), (0, 19), (19, 45), (24, 44), (9, 12), (10, 16), (19, 33)]  # their top left corners, outside the loop and (the user's, 2026-11-07) inside it
SHADED_ROCKS = [(20, 6)]  # and in the bridge's shadow, drawn over it (the game has no rock in shade: its ripples stay lit)
# Route 110's four ways a horizontal bridge (a rail, two rows of deck, a rail, the girders' face, two rows of shadow)
# meets a 5-wide vertical one, as its map has them: (map rows, map columns) and where the piece's top left goes from
# the horizontal bridge's top rail (r) and the vertical one's left rail (c). Every turn of the loop is one of them,
# whichever way round the riders take it.
TURNS = dict(  # (and the last column of the horizontal bridge the piece holds, from c, on the side it goes)
    down_right=((29, 36), (8, 16), 0, -2, 5),  # the vertical one below, the horizontal one going right, its end 2 tiles past the turn
    down_left=((76, 82), (26, 32), 0, 0, 0),  # below, going left: the rounded corner
    up_right=((75, 83), (13, 22), -1, -2, 6),  # above, going right, its end 2 tiles past the turn
    up_left=((26, 36), (24, 33), -3, -1, -1))  # above, going left, its end 2 tiles past the turn on the other side
# The loop, clockwise from the top left (r, c, the turn): the top bridge straight along row 2 and the bottom one along
# row 22 (in from the frame's top and bottom, so the ways off show: the user's, 2026-11-07), each side with a jog
# (the user's, 2026-11-07: less rectangular), the left one stepping out at row 14, the right one in at row 12, so the
# loop is a skewed Z, the top bridge pushed right, the bottom one left. A jog is two turns 7 columns apart (the
# pieces side by side, nothing between) and needs 8 rows clear on the vertical bridge between a turn below a bridge
# and one above the next, so the rows are as close as they go. Only 3 columns of each side cross the cards' area.
LOOP = [(2, 6, 'down_right'), (2, 43, 'down_left'), (12, 43, 'up_left'), (12, 36, 'down_right'),
        (22, 36, 'up_left'), (22, -1, 'up_right'), (14, -1, 'down_right'), (14, 6, 'up_left')]
NORTH = 27  # a way off north: Route 110's bridge from the north coming into the top one (map rows 27-29, columns 25-30)
SOUTH = 14  # and south: the bottom rail opening (map row 88, columns 26-30), the vertical bridge's rows below it (the user's, 2026-11-07)
SPAN = (29, 36), 16  # a horizontal bridge's straight run: a column of it (rail, deck, deck, rail, face, shadow, shadow)
PILLAR = 18  # and its column with a pillar under it
PILLARS = {2: range(13, 43, 6), 22: (8, 22, 29)}  # the straight runs' pillars, by row (the bottom one's clear of the way south)
UPRIGHT = [808, 741, 766, 742, 809, SHADOW]  # the vertical bridge's row: its rail, deck, rail, and its shadow
LEAVING = [796, 741, 766, 742, 809, SHADOW]  # the row below one leaving a bridge (map row 35 under its girders' face; the rounded corner's lacks it)
TOP, BOTTOM = LOOP[0][0], LOOP[4][0]

LANE = [(c + 2, r + 2) for r, c, _ in LOOP]  # the riders' way round, clockwise, in tiles (a rider's feet on the tile): the decks' middles
STEP = 8  # game frames a frame (the riders at a quarter of the bike's speed, the user's, 2026-11-07: half what they were)
SPEED = 4  # px a frame
FRAMES = 256  # the sheet: SPEED * FRAMES is half the way round
PEDAL = 2  # frames each of a pedalling frame shows
RIDERS = [('npc_pink', 0, 0)]  # a group: palette, px along the way, pedalling phase (one, repeated twice round: two riders across the loop from each other, the user's, 2026-11-07)
# sAnimTable_Standard's frames: facing, then pedalling (a frame, the facing one, the other, the facing one again).
FACING = dict(down=(0, 3, 4), up=(1, 5, 6), left=(2, 7, 8), right=(2, 7, 8))


def metal_arena(rng):
    """Metal: Route 110's bridge round the frame (`LOOP`'s turns, straight runs between them) over the sea, a few rocks
    offshore (`ROCKS`). Laid out by hand: rng isn't used (the ARENAS functions' signature)."""
    ts = Tilesets('gTileset_General', 'gTileset_Mauville', EMERALD)
    m = blocks(layout('Route110', EMERALD), EMERALD)
    m = np.where(np.isin(m, (402, 410, 394)), SEA, m)  # (the shore beside the up_left piece: sea here)
    grid = np.full((H, W), SEA)

    def put(y, x, block):
        block = np.asarray(block)
        h, w = block.shape
        ys, xs = slice(max(0, y), min(H, y + h)), slice(max(0, x), min(W, x + w))
        if ys.start < ys.stop and xs.start < xs.stop:
            grid[ys, xs] = block[ys.start - y:ys.stop - y, xs.start - x:xs.stop - x]

    for y, x in ROCKS:
        put(y, x, ROCK)
    (r0, r1), c = SPAN
    for (ra, ca, a), (rb, cb, b) in zip(LOOP, LOOP[1:] + LOOP[:1]):
        if ra == rb:  # a horizontal run: its straight columns between the two pieces
            (x0, t0), (x1, t1) = sorted(((ca, a), (cb, b)))
            for x in range(x0 + TURNS[t0][4] + 1, x1 + TURNS[t1][4]):
                put(ra, x, m[r0:r1, PILLAR if x in PILLARS.get(ra, ()) else c][:, None])
        else:  # a vertical one: the vertical bridge's rows down to the next (the pieces over them)
            y0, y1 = sorted((ra, rb))
            for y in range(y0 + 6, y1):
                put(y, ca, [UPRIGHT])
    for y in range(BOTTOM + 4, H):
        put(y, SOUTH, [UPRIGHT])
    for r, c, turn in LOOP:
        (a0, a1), (b0, b1), dy, dx, _ = TURNS[turn]
        put(r + dy, c + dx, m[a0:a1, b0:b1])
        if turn == 'down_left':
            put(r + 6, c, [LEAVING])
    put(TOP - 2, NORTH, m[27:30, 25:31])
    put(BOTTOM + 3, SOUTH, m[88:89, 26:31])
    for y, x in SHADED_ROCKS:
        put(y, x, ROCK)
    return ts, grid


def biker(pal):
    """The Biker's 10 frames as 32x32 RGBA pictures, in an NPC palette."""
    a = np.array(Image.open(io.BytesIO(get('graphics/object_events/pics/people/biker.png'))))
    colours = np.array(fm.read_pal(get(f'graphics/object_events/palettes/{pal}.pal')), np.uint8)
    rgba = np.dstack([colours[a], np.where(a == 0, 0, 255).astype(np.uint8)])
    return [rgba[:, i:i + 32] for i in range(0, a.shape[1], 32)]


def along(s):
    """Where a rider s px along the lane is (px, its feet's tile corner) and which way it faces."""
    pts = LANE + LANE[:1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = (abs(x1 - x0) + abs(y1 - y0)) * 16
        if s < n:
            dx, dy = np.sign(x1 - x0), np.sign(y1 - y0)
            return x0 * 16 + dx * s, y0 * 16 + dy * s, 'right' if dx > 0 else 'left' if dx < 0 else 'down' if dy > 0 else 'up'
        s -= n
    raise ValueError(s)


def ride(ts, grid, rng):
    """The sea's animation with the Bikers riding round the bridge over it: (shots, order) as frlg_mats.storm's, the
    sheet's frames in order. A frame every STEP game frames, the sea's tiles (every 16 game frames) changing every
    fourth; the riders (RIDERS, the group repeated round the lane) SPEED px a frame, each drawn feet on its spot (the
    32x32 sprite's middle over it), the lower ones over the higher. rng isn't used (storm's signature)."""
    sea = fm.frames(ts, grid)  # (the sea's 8 steps of 16 game frames)
    step = round(sea[0][1] * 60 / 1000) // STEP
    length = sum((abs(x1 - x0) + abs(y1 - y0)) * 16 for (x0, y0), (x1, y1) in zip(LANE, LANE[1:] + LANE[:1]))
    group = SPEED * FRAMES
    assert length % group == 0 and FRAMES % (len(sea) * step) == 0 and FRAMES % (4 * PEDAL) == 0, (length, group)
    pics = {pal: biker(pal) for pal, _, _ in RIDERS}
    shots = []
    for f in range(FRAMES):
        rgb = sea[f // step % len(sea)][0].copy()
        riders = []
        for k in range(length // group):
            for pal, s, phase in RIDERS:
                x, y, facing = along((k * group + s + f * SPEED) % length)
                still, a, b = FACING[facing]
                pic = pics[pal][(a, still, b, still)[(f // PEDAL + phase) % 4]]
                riders.append((y, x, pic[:, ::-1] if facing == 'right' else pic))
        for y, x, pic in sorted(riders, key=lambda r: r[0]):
            top, left = y - 16, x - 8  # (feet on the tile at (x, y): the sprite's bottom its bottom, its middle its middle)
            ys, xs = slice(max(0, top), min(H * 16, top + 32)), slice(max(0, left), min(W * 16, left + 32))
            p = pic[ys.start - top:ys.stop - top, xs.start - left:xs.stop - left]
            rgb[ys, xs][p[..., 3] > 0] = p[..., :3][p[..., 3] > 0]
        shots.append((rgb, STEP * 1000 / 60))
    return shots, list(range(FRAMES))


def main():
    ap = argparse.ArgumentParser(description="Draws the battle table's FireRed/LeafGreen Metal mat.")
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', help='where the sheet goes (apps/web/public/mats/frlg/ without it)')
    ap.add_argument('--preview', help="a folder for the first frame's picture")
    args = ap.parse_args()
    out_dir = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'web', 'public', 'mats', 'frlg')
    ts, grid = metal_arena(np.random.default_rng(args.seed))
    shots, order = ride(ts, grid, np.random.default_rng(args.seed))
    fm.save('metal', shots, out_dir, order)
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        Image.fromarray(shots[0][0]).save(os.path.join(args.preview, 'metal.png'))
    print('metal', len(shots), 'frames of', round(shots[0][1]), 'ms')


if __name__ == '__main__':
    main()
