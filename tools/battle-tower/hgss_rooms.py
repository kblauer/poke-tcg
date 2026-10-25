"""HGSS's Battle Tower corridor and battle rooms (for battle-tower-maps.ts: tower_maps.py), from pret/pokeheartgold.

The frontier scenes aren't field maps: overlay 80's scene table (ov80_0223B724, asm/overlay_80_0222ACA0.s,
0x28 bytes a scene) gives each scene's frontier script (NARC a/1/8/2), message bank, music and BG graphics, all
in NARC a/1/8/3 (NARC id 0xB7): BG3 screen/char/palette and an optional BG2 (drawn in front). Scenes with the
first word non-zero are 8bpp with extended palettes (screen palette slot * 256).
Usage: python -I extract_hgss_bt.py <download dir> <output dir>
"""
import os, struct, sys, urllib.request
import numpy as np
from PIL import Image

BASE = 'https://raw.githubusercontent.com/pret/pokeheartgold/master/'

def narc(d):
    o = struct.unpack_from('<H', d, 12)[0]
    size, n = struct.unpack_from('<IH', d, o + 4)
    fat = [struct.unpack_from('<II', d, o + 12 + 8 * i) for i in range(n)]
    o += size
    o += struct.unpack_from('<I', d, o + 4)[0]
    return [d[o + 8 + s:o + 8 + e] for s, e in fat]

def lz10(d):
    if d[0] != 0x10: return d
    n = d[1] | d[2] << 8 | d[3] << 16
    o = bytearray(); i = 4
    while len(o) < n:
        f = d[i]; i += 1
        for b in range(8):
            if len(o) >= n: break
            if f & (0x80 >> b):
                x = d[i] << 8 | d[i+1]; i += 2
                l = (x >> 12) + 3; dist = (x & 0xFFF) + 1
                for _ in range(l): o.append(o[-dist])
            else:
                o.append(d[i]); i += 1
    return bytes(o)

def sect(d, magic):
    o = struct.unpack_from('<H', d, 12)[0]
    while o < len(d):
        m = d[o:o+4]; sz = struct.unpack_from('<I', d, o+4)[0]
        if m == magic: return o
        o += sz
    raise KeyError(magic)

def nclr(d):
    o = sect(d, b'TTLP')
    bpp = struct.unpack_from('<I', d, o+8)[0]
    sz = struct.unpack_from('<I', d, o+16)[0]
    off = struct.unpack_from('<I', d, o+20)[0]
    raw = d[o+8+off:o+8+off+sz]
    c = np.frombuffer(raw[:len(raw)//2*2], '<u2')
    rgb = np.stack([(c & 31), (c >> 5) & 31, (c >> 10) & 31], -1).astype(np.uint8)
    return (rgb << 3) | (rgb >> 2), bpp

def ncgr(d):
    o = sect(d, b'RAHC')
    h, w, bpp = struct.unpack_from('<HHI', d, o+8)
    sz, off = struct.unpack_from('<II', d, o+0x18)
    raw = np.frombuffer(d[o+8+off:o+8+off+sz], np.uint8) if off else np.frombuffer(d[o+0x20:o+0x20+sz], np.uint8)
    if bpp == 3:
        px = np.stack([raw & 15, raw >> 4], -1).reshape(-1, 8, 8)
    else:
        px = raw.reshape(-1, 8, 8)
    return px, bpp, (w, h)

def nscr(d):
    o = sect(d, b'NRCS')
    w, h, fmt, sz = struct.unpack_from('<HHII', d, o+8)
    m = np.frombuffer(d[o+0x14:o+0x14+sz], '<u2')
    return m.reshape(h // 8, w // 8), fmt

def render(tiles, bpp, scr, pal, ext=False):
    """RGBA image of a tilemap; colour 0 transparent."""
    th, tw = scr.shape
    out = np.zeros((th*8, tw*8, 4), np.uint8)
    for y in range(th):
        for x in range(tw):
            e = int(scr[y, x]); t = e & 0x3FF; p = e >> 12
            if t >= len(tiles): continue
            px = tiles[t].astype(np.int32)
            if e & 0x400: px = px[:, ::-1]
            if e & 0x800: px = px[::-1]
            if bpp == 3: idx = p*16 + px
            elif ext: idx = p*256 + px
            else: idx = px
            idx = np.clip(idx, 0, len(pal)-1)
            blk = out[y*8:y*8+8, x*8:x*8+8]
            blk[..., :3] = pal[idx]; blk[..., 3] = np.where(px == 0, 0, 255)
    return out

# scene table rows used: (name, ext palettes, BG3 (scrn, char, pal), BG2 or None)
SCENES = [
    ('corridor', True, (0x36, 0x31, 0xA0), (0x37, 0x31, 0xA0)),        # row 5, script 6, msg 96 (single)
    ('corridor_multi', True, (0x33, 0x31, 0xA0), (0x34, 0x31, 0xA0)),  # row 6, script 7, msg 96 (multi)
    ('battle_room', True, (0x35, 0x31, 0xA0), None),                   # row 7, script 8, msg 97 (single)
    ('battle_room_multi', True, (0x32, 0x31, 0xA0), None),             # row 8, script 9, msg 98 (multi)
    # rows with the tower's music but no HGSS text (leftovers?), and the wireless room
    ('extra_row0_room', False, (0x01, 0x00, 0x94), (0x03, 0x00, 0x94)),
    ('extra_row1_glass_hall', False, (0x02, 0x00, 0x94), None),
    ('extra_row14_wireless_room', True, (0x84, 0x83, 0xBF), None),
]

def layer(fs, s, c, p, ext):
    tiles, bpp, _ = ncgr(fs[c]); scr, _ = nscr(fs[s]); pal, _ = nclr(fs[p])
    return render(tiles, bpp, scr, pal, ext)

def main(dl, out):
    os.makedirs(dl, exist_ok=True); os.makedirs(out, exist_ok=True)
    path = os.path.join(dl, 'a183.narc')
    if not os.path.exists(path):
        urllib.request.urlretrieve(BASE + 'files/a/1/8/3', path)
    fs = [lz10(f) for f in narc(open(path, 'rb').read())]
    for name, ext, bg3, bg2 in SCENES:
        layers = [Image.fromarray(layer(fs, *bg3, ext))]
        if bg2: layers.append(Image.fromarray(layer(fs, *bg2, ext)))
        x1 = max(l.getbbox()[2] for l in layers); y1 = max(l.getbbox()[3] for l in layers)
        x1, y1 = max(256, -(-x1 // 16) * 16), max(192, -(-y1 // 16) * 16)
        img = Image.new('RGBA', layers[0].size, (0, 0, 0, 255))  # backdrop: colour 0, black
        for l in layers: img.alpha_composite(l)
        img.crop((0, 0, x1, y1)).convert('RGB').save(os.path.join(out, name + '.png'))
        if bg2:
            layers[0].crop((0, 0, x1, y1)).save(os.path.join(out, name + '_bg3.png'))
            layers[1].crop((0, 0, x1, y1)).save(os.path.join(out, name + '_bg2_front.png'))
        print(name, x1, y1)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
