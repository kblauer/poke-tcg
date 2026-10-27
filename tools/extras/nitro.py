"""A small decoder for Nintendo DS (Nitro) graphics files, enough to draw the games' backgrounds and sprites with Pillow:

- `narc(data)`: a NARC archive's members (bytes, in order);
- `lz(data)`: undoes the BIOS LZ77 compression (type 0x10) and its LZ11 variant (0x11) the archives' members are packed
  with; `unpack(data)` does it only when the data is packed (a file starting 0x10/0x11 with no Nitro magic);
- `nclr(data)`: a palette (NCLR's PLTT block): a list of RGBA colours (RGB555 widened to 8 bits a channel), 16 a palette
  for 4bpp files, 256 for 8bpp; `pal16(colours, n)` cuts out 16-colour palette n;
- `ncgr(data)`: tiles (NCGR's CHAR block): bit depth (4 or 8), the tile count, width/height in tiles (0xFFFF when the
  file doesn't say, as 1D sprite tiles often don't), the character/bitmap format and each tile's 64 colour indices;
- `nscr(data)`: a screen (NSCR's SCRN block): width and height in pixels and each 16-bit entry, split into tile index
  (bits 0-9), h-flip (10), v-flip (11) and palette (12-15);
- `ncer(data)`: cells (NCER's CEBK block): each cell's OAM entries (x, y, width, height, tile number, palette, priority,
  flips, 8bpp, affine), its bounding box when the bank has them, and the bank's mapping mode
  (NNSG2dCharacterDataMapingType: 0-3 1D with a tile "boundary" of 32, 64, 128 or 256 bytes, so an OAM's tile number
  is its CharName shifted left by the mode in 32-byte units; 4 2D); a bank's VRAM transfer table (per-cell tile data
  offsets) when it has one;
- `nanr(data)`: animations (NANR's ABNK block): each sequence's frames (cell index, duration in 1/60 s frames and, for
  SRT/T frames, the offset), its loop start and play mode (1 forward, 2 forward loop, 3 ping-pong, 4 ping-pong loop);
- drawing: `draw_screen` draws an NSCR with its tiles and palettes (colour 0 clear, or the backdrop for the first BG
  layer), `draw_cell` a cell from its OAMs (colour 0 always clear, as OBJ is), `cell_box` its pixel bounds.

Nitro files are little-endian; each starts with a 16-byte header (magic reversed: RLCN, RGCN, RCSN, RECN, RNAN), then
blocks of a 4-byte magic and a 4-byte size, offsets inside a block counted from just after those 8 bytes.
No dependencies but Pillow (for drawing)."""
import struct

MAGICS = (b'RLCN', b'RGCN', b'RCSN', b'RECN', b'RNAN', b'NCLR', b'NCGR', b'NSCR', b'NCER', b'NANR', b'NARC')
# OAM sizes in pixels, by shape (square, wide, tall) and size (0-3).
OAM_SIZES = {(0, 0): (8, 8), (0, 1): (16, 16), (0, 2): (32, 32), (0, 3): (64, 64),
             (1, 0): (16, 8), (1, 1): (32, 8), (1, 2): (32, 16), (1, 3): (64, 32),
             (2, 0): (8, 16), (2, 1): (8, 32), (2, 2): (16, 32), (2, 3): (32, 64)}


def narc(d):
    """A NARC archive's members, in order."""
    assert d[:4] == b'NARC', d[:4]
    off = struct.unpack_from('<H', d, 0xC)[0]
    assert d[off:off + 4] == b'BTAF'
    size, count = struct.unpack_from('<IH', d, off + 4)
    fat = [struct.unpack_from('<II', d, off + 12 + 8 * i) for i in range(count)]
    o = off + size
    assert d[o:o + 4] == b'BTNF'
    o += struct.unpack_from('<I', d, o + 4)[0]
    assert d[o:o + 4] == b'GMIF'
    return [d[o + 8 + s:o + 8 + e] for s, e in fat]


def lz(d):
    """The BIOS LZ77 (0x10) or LZ11 (0x11) compressed data `d`, unpacked."""
    kind = d[0]
    size = d[1] | d[2] << 8 | d[3] << 16
    i = 4
    if size == 0:
        size = struct.unpack_from('<I', d, 4)[0]
        i = 8
    out = bytearray()
    while len(out) < size:
        flags = d[i]
        i += 1
        for bit in range(8):
            if len(out) >= size:
                break
            if not flags & 0x80 >> bit:
                out.append(d[i])
                i += 1
                continue
            if kind == 0x10:
                n = (d[i] >> 4) + 3
                disp = ((d[i] & 15) << 8 | d[i + 1]) + 1
                i += 2
            else:
                hi = d[i] >> 4
                if hi == 0:
                    n = ((d[i] & 15) << 4 | d[i + 1] >> 4) + 0x11
                    disp = ((d[i + 1] & 15) << 8 | d[i + 2]) + 1
                    i += 3
                elif hi == 1:
                    n = ((d[i] & 15) << 12 | d[i + 1] << 4 | d[i + 2] >> 4) + 0x111
                    disp = ((d[i + 2] & 15) << 8 | d[i + 3]) + 1
                    i += 4
                else:
                    n = hi + 1
                    disp = ((d[i] & 15) << 8 | d[i + 1]) + 1
                    i += 2
            for _ in range(n):
                out.append(out[-disp])
    return bytes(out)


def unpack(d):
    """`d` unpacked if it's LZ-compressed (no Nitro magic, a 0x10/0x11 type byte), else as it is."""
    if d[:4] in MAGICS or not d or d[0] not in (0x10, 0x11):
        return d
    return lz(d)


def blocks(d):
    """A Nitro file's blocks: {magic: (offset of its data, its data)}."""
    n = struct.unpack_from('<H', d, 0xE)[0]
    o = struct.unpack_from('<H', d, 0xC)[0]
    out = {}
    for _ in range(n):
        if o + 8 > len(d):
            break
        magic, size = d[o:o + 4], struct.unpack_from('<I', d, o + 4)[0]
        out[magic.decode('latin-1')] = d[o + 8:o + size]
        o += size
    return out


def rgb555(c):
    r, g, b = c & 31, c >> 5 & 31, c >> 10 & 31
    return (r << 3 | r >> 2, g << 3 | g >> 2, b << 3 | b >> 2, 255)


def nclr(d):
    """An NCLR's colours (RGBA, 16 a palette for 4bpp files; the whole block, however many palettes it holds)."""
    b = blocks(unpack(d))['TTLP']
    depth, _, size, off = struct.unpack_from('<IIII', b, 0)
    data = b[off:off + size] if off + size <= len(b) else b[off:]
    colours = [rgb555(struct.unpack_from('<H', data, 2 * i)[0]) for i in range(len(data) // 2)]
    return colours


def pal16(colours, n):
    return colours[16 * n:16 * n + 16]


class Tiles:
    def __init__(self, depth, tiles, width, height, bitmap, mapping):
        self.depth, self.tiles, self.width, self.height, self.bitmap, self.mapping = depth, tiles, width, height, bitmap, mapping


def ncgr(d):
    """An NCGR's tiles: each tile 64 colour indices, row by row (a bitmap-format file cut into 8x8 tiles first)."""
    b = blocks(unpack(d))['RAHC']
    height, width, depth, mapping, bitmap, size, off = struct.unpack_from('<HHIIIII', b, 0)
    data = b[off:off + size]
    bpp = 4 if depth == 3 else 8
    if bpp == 4:
        px = [v for byte in data for v in (byte & 15, byte >> 4)]
    else:
        px = list(data)
    if bitmap and width != 0xFFFF:
        # A bitmap: rows of width*8 pixels; cut it into tiles in reading order.
        w = width * 8
        tiles = []
        for ty in range(height):
            for tx in range(width):
                tiles.append([px[(ty * 8 + y) * w + tx * 8 + x] for y in range(8) for x in range(8)])
    else:
        tiles = [px[i:i + 64] for i in range(0, len(px) - 63, 64)]
    return Tiles(bpp, tiles, width, height, bitmap, mapping)


def nscr(d):
    """An NSCR: (width px, height px, [(tile, hflip, vflip, palette)] in reading order)."""
    b = blocks(unpack(d))['NRCS']
    w, h, _, _, size = struct.unpack_from('<HHHHI', b, 0)
    raw = struct.unpack_from('<%dH' % (size // 2), b, 12)
    return w, h, [(e & 0x3FF, e >> 10 & 1, e >> 11 & 1, e >> 12) for e in raw]


def screen_pos(i, w):
    """Where entry i of a screen `w` pixels wide goes: screens wider than 256 px are stored in 256x256 blocks."""
    cols = w // 8
    if w <= 256:
        return (i % cols) * 8, (i // cols) * 8
    block, rest = divmod(i, 1024)
    blocks_wide = w // 256
    bx, by = block % blocks_wide, block // blocks_wide
    return bx * 256 + (rest % 32) * 8, by * 256 + (rest // 32) * 8


def draw_tile(img, tile, x, y, colours, hflip=False, vflip=False, clear0=True):
    px = img.load()
    W, H = img.size
    for ty in range(8):
        for tx in range(8):
            v = tile[ty * 8 + tx]
            if v == 0 and clear0:
                continue
            c = colours[v] if v < len(colours) else (255, 0, 255, 255)
            dx, dy = x + (7 - tx if hflip else tx), y + (7 - ty if vflip else ty)
            if 0 <= dx < W and 0 <= dy < H:
                px[dx, dy] = c


def draw_screen(scr, tiles, colours, size=None, clear0=True, tile_base=0, pal_offset=0):
    """An NSCR drawn with its tiles: `colours` the BG palette RAM (all 16 palettes for 4bpp), colour 0 of each palette
    clear unless `clear0` is False (the first layer, which shows the backdrop). `size` crops (default the screen's own);
    `tile_base` is subtracted from each entry's tile (a char base the screen counts from)."""
    from PIL import Image
    w, h, entries = scr
    img = Image.new('RGBA', size or (w, h), (0, 0, 0, 0))
    for i, (t, hf, vf, p) in enumerate(entries):
        x, y = screen_pos(i, w)
        if x >= img.size[0] or y >= img.size[1]:
            continue
        t -= tile_base
        if t < 0 or t >= len(tiles.tiles):
            continue
        tile = tiles.tiles[t]
        if tiles.depth == 4:
            cols = colours[16 * (p + pal_offset):16 * (p + pal_offset) + 16]
            if len(cols) < 16:
                cols = cols + [(255, 0, 255, 255)] * (16 - len(cols))
        else:
            cols = colours
        if not clear0:
            cols = list(cols)
        draw_tile(img, tile, x, y, cols if clear0 else [colours[0]] + list(cols[1:]), hf, vf, clear0)
    return img


class Oam:
    def __init__(self, a0, a1, a2):
        y = a0 & 0xFF
        self.y = y - 256 if y >= 128 else y
        self.affine = bool(a0 >> 8 & 1)
        self.double = bool(a0 >> 9 & 1) and self.affine
        self.mode = a0 >> 10 & 3
        self.bpp8 = bool(a0 >> 13 & 1)
        shape = a0 >> 14 & 3
        x = a1 & 0x1FF
        self.x = x - 512 if x >= 256 else x
        self.hflip = bool(a1 >> 12 & 1) and not self.affine
        self.vflip = bool(a1 >> 13 & 1) and not self.affine
        size = a1 >> 14 & 3
        self.w, self.h = OAM_SIZES[(shape, size)]
        self.tile = a2 & 0x3FF
        self.priority = a2 >> 10 & 3
        self.palette = a2 >> 12 & 15
        self.raw = (a0, a1, a2)

    def json(self):
        return {'x': self.x, 'y': self.y, 'w': self.w, 'h': self.h, 'tile': self.tile, 'palette': self.palette, 'priority': self.priority,
                'hflip': self.hflip, 'vflip': self.vflip, 'bpp8': self.bpp8, 'affine': self.affine}


class Cells:
    def __init__(self, cells, mapping, boxes, transfer):
        self.cells, self.mapping, self.boxes, self.transfer = cells, mapping, boxes, transfer


def ncer(d):
    """An NCER's cells: Cells(cells=[[Oam]], mapping mode, boxes=[(maxX, maxY, minX, minY)] or None, transfer=[(offset, size)] or None)."""
    b = blocks(unpack(d))['KBEC']
    n, attr, cell_off, mapping, transfer_off, _ = struct.unpack_from('<HHIIII', b, 0)
    step = 16 if attr == 1 else 8
    oam_base = cell_off + n * step
    cells, boxes = [], [] if attr == 1 else None
    for i in range(n):
        o = cell_off + i * step
        count, _, oam_off = struct.unpack_from('<HHI', b, o)
        oams = [Oam(*struct.unpack_from('<3H', b, oam_base + oam_off + 6 * k)) for k in range(count)]
        cells.append(oams)
        if attr == 1:
            boxes.append(struct.unpack_from('<hhhh', b, o + 8))
    transfer = None
    if transfer_off:
        # NNSG2dVramTransferData: max size, then per cell (src offset, size).
        t = transfer_off
        _, arr = struct.unpack_from('<II', b, t)
        transfer = [struct.unpack_from('<II', b, t + arr + 8 * i) for i in range(n)]
    return Cells(cells, mapping, boxes, transfer)


def oam_tile(oam, mapping, depth):
    """The first tile (a 32-byte unit for 4bpp, 64-byte for 8bpp) an OAM's CharName points at in a 1D-mapped bank
    (mapping 0-3: 1D 32K, 64K, 128K, 256K)."""
    shift = mapping
    unit32 = oam.tile << shift
    return unit32 if depth == 4 else unit32 // 2


def cell_box(oams):
    """The pixels a cell's OAMs cover: (left, top, right, bottom), relative to its origin."""
    if not oams:
        return (0, 0, 0, 0)
    return (min(o.x for o in oams), min(o.y for o in oams), max(o.x + o.w * (2 if o.double else 1) for o in oams), max(o.y + o.h * (2 if o.double else 1) for o in oams))


def draw_oam(img, oam, tiles, colours, ox, oy, mapping, pal_offset=0, tile_offset=0, explicit=None):
    """One OAM drawn at (ox + its x, oy + its y). `colours` is the OBJ palette RAM (16 a palette); its palette is the
    OAM's own plus `pal_offset` (NNS_G2D_RND_OVERWRITE_PLTTNO_OFFS), or `explicit` in place of the OAM's when given
    (NNS_G2D_RND_OVERWRITE_PLTTNO); `tile_offset` (in tiles) is where the cell's tiles start (a VRAM transfer cell's,
    or a resource loaded at an offset)."""
    depth = 8 if oam.bpp8 else tiles.depth
    tw, th = oam.w // 8, oam.h // 8
    if depth == 8:
        cols = colours[:256]
    else:
        p = explicit if explicit is not None else oam.palette + pal_offset
        cols = colours[16 * p:16 * p + 16]
        if len(cols) < 16:
            cols = list(cols) + [(255, 0, 255, 255)] * (16 - len(cols))
    x0, y0 = ox + oam.x, oy + oam.y
    if oam.double:
        x0 += oam.w // 2
        y0 += oam.h // 2
    for ty in range(th):
        for tx in range(tw):
            if mapping == 4:
                # 2D: a 32-tile-wide grid (16 for 8bpp, whose tiles take two units each).
                row = (tiles.width if tiles.width not in (0, 0xFFFF) else 32)
                n = oam.tile + ty * row + tx if depth == 4 else oam.tile // 2 + ty * row + tx
            else:
                n = oam_tile(oam, mapping, depth) + ty * tw + tx
            n += tile_offset
            if n >= len(tiles.tiles):
                continue
            sx = (tw - 1 - tx) if oam.hflip else tx
            sy = (th - 1 - ty) if oam.vflip else ty
            draw_tile(img, tiles.tiles[n], x0 + sx * 8, y0 + sy * 8, cols, oam.hflip, oam.vflip)


def draw_cell(cells, index, tiles, colours, pal_offset=0, tile_offset=0, explicit=None):
    """Cell `index` drawn alone: (RGBA image cropped to its OAMs, (origin x, origin y) in that image). OAMs are drawn
    last-first, so the first OAM ends on top, as the hardware puts lower OAM numbers in front. `pal_offset`/`explicit`
    as draw_oam's."""
    from PIL import Image
    oams = cells.cells[index]
    l, t, r, b = cell_box(oams)
    img = Image.new('RGBA', (max(1, r - l), max(1, b - t)), (0, 0, 0, 0))
    toff = tile_offset
    if cells.transfer:
        toff += cells.transfer[index][0] // (32 if tiles.depth == 4 else 64)
    for o in reversed(oams):
        draw_oam(img, o, tiles, colours, -l, -t, cells.mapping, pal_offset, toff, explicit)
    return img, (-l, -t)


class Anim:
    def __init__(self, frames, loop_start, play_mode, kind):
        self.frames, self.loop_start, self.play_mode, self.kind = frames, loop_start, play_mode, kind

    def json(self):
        return {'frames': [dict(f) for f in self.frames], 'loopStart': self.loop_start, 'playMode': self.play_mode}


def nanr(d):
    """An NANR's sequences: [Anim(frames=[{cell, duration, (x, y)}], loop start, play mode, element kind)]."""
    b = blocks(unpack(d))['KNBA']
    nseq, _, seq_off, frame_off, elem_off = struct.unpack_from('<HHIII', b, 0)
    out = []
    for i in range(nseq):
        count, loop, kind, mode, foff = struct.unpack_from('<HHIII', b, seq_off + 16 * i)
        elem = kind & 0xFFFF
        frames = []
        for k in range(count):
            eoff, dur = struct.unpack_from('<IH', b, frame_off + foff + 8 * k)
            e = elem_off + eoff
            f = {'cell': struct.unpack_from('<H', b, e)[0], 'duration': dur}
            if elem == 1:
                _, rot, sx, sy, px, py = struct.unpack_from('<HHiihh', b, e)
                f.update({'rotation': rot, 'scaleX': sx / 4096, 'scaleY': sy / 4096, 'x': px, 'y': py})
            elif elem == 2:
                _, _, px, py = struct.unpack_from('<HHhh', b, e)
                f.update({'x': px, 'y': py})
            frames.append(f)
        out.append(Anim(frames, loop, mode, elem))
    return out


def kind(d):
    """A member's file kind ('NCLR', 'NCGR', 'NSCR', 'NCER', 'NANR' or '?'), unpacking it first if it's compressed."""
    try:
        u = unpack(d)
    except Exception:
        return '?'
    m = u[:4]
    return {b'RLCN': 'NCLR', b'RGCN': 'NCGR', b'RCSN': 'NSCR', b'RECN': 'NCER', b'RNAN': 'NANR'}.get(m, '?')
