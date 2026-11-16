"""A small reader for Nintendo DS texture files (NSBTX, `BTX0`: a TEX0 block of textures and palettes), enough for Black's
overworld sprites: each texture's name, size and format, each palette's name and colours, and a texture drawn as an RGBA
Pillow image with a palette (paletted formats 2, 3 and 4: 4, 16 and 256 colours; 1 and 6: A3I5 and A5I3; 7: direct).
apicula pairs a texture with a palette by name and finds no pair for many of Black's sprites (their textures `name.N`,
one palette for them all), so bw_sprites.py draws them here with the file's palette. Needs Pillow."""
import struct
from PIL import Image


def _dict(d, o):
    """An NNS resource dictionary at `o`: [(name, its entry's data offset)] (the same layout as hgss_data._dict)."""
    _rev, n, _size, _, ofs_entry = struct.unpack_from('<BBHHH', d, o)
    unit = struct.unpack_from('<H', d, o + ofs_entry)[0]
    data = o + ofs_entry + 4
    names = data + unit * n
    return [(d[names + 16 * i:names + 16 * i + 16].split(b'\0')[0].decode('latin-1'), data + unit * i) for i in range(n)]


def read(d):
    """A BTX0 file's textures ({name, width, height, format, transparent, data}) and palettes ({name: [RGBA]}), in order."""
    assert d[:4] == b'BTX0', d[:4]
    tex0 = struct.unpack_from('<I', d, 16)[0]
    assert d[tex0:tex0 + 4] == b'TEX0'
    # The TEX0 header: the textures' dictionary (+0x0E) and data (+0x14); the palettes' size (+0x30, in 8 bytes),
    # dictionary (+0x34) and data (+0x38).
    tex_dict = struct.unpack_from('<H', d, tex0 + 0x0E)[0]
    tex_data = struct.unpack_from('<I', d, tex0 + 0x14)[0]
    pal_size = struct.unpack_from('<I', d, tex0 + 0x30)[0] << 3
    pal_dict = struct.unpack_from('<I', d, tex0 + 0x34)[0]
    pal_data = struct.unpack_from('<I', d, tex0 + 0x38)[0]
    textures = []
    for name, e in _dict(d, tex0 + tex_dict):
        params = struct.unpack_from('<I', d, e)[0]
        off = (params & 0xFFFF) << 3
        w, h = 8 << ((params >> 20) & 7), 8 << ((params >> 23) & 7)
        fmt = (params >> 26) & 7
        bpp = {1: 8, 2: 2, 3: 4, 4: 8, 5: 2, 6: 8, 7: 16}[fmt]
        start = tex0 + tex_data + off
        textures.append({'name': name, 'width': w, 'height': h, 'format': fmt, 'transparent': bool(params >> 29 & 1), 'data': d[start:start + w * h * bpp // 8]})
    palettes = {}
    entries = _dict(d, tex0 + pal_dict)
    offsets = sorted((struct.unpack_from('<H', d, e)[0] << 3) for _n, e in entries) + [pal_size]
    for name, e in entries:
        off = struct.unpack_from('<H', d, e)[0] << 3
        end = next(o for o in offsets if o > off)
        raw = d[tex0 + pal_data + off:tex0 + pal_data + end]
        palettes[name] = [_rgb(struct.unpack_from('<H', raw, 2 * i)[0]) for i in range(len(raw) // 2)]
    return textures, palettes


def _rgb(c):
    r, g, b = c & 31, c >> 5 & 31, c >> 10 & 31
    return (r << 3 | r >> 2, g << 3 | g >> 2, b << 3 | b >> 2, 255)


def image(tex, palette):
    """A texture drawn with `palette` (a list of RGBA colours), colour 0 clear when the texture says so."""
    w, h, fmt, data = tex['width'], tex['height'], tex['format'], tex['data']
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    for i in range(w * h):
        if fmt in (2, 3, 4):
            bits = {2: 2, 3: 4, 4: 8}[fmt]
            v = data[i * bits // 8] >> (i * bits % 8) & ((1 << bits) - 1)
            if v == 0 and tex['transparent']:
                continue
            px[i % w, i // w] = palette[v] if v < len(palette) else (255, 0, 255, 255)
        elif fmt in (1, 6):
            v = data[i]
            idx, alpha = (v & 31, (v >> 5) * 255 // 7) if fmt == 1 else (v & 7, (v >> 3) * 255 // 31)
            if alpha:
                r, g, b, _ = palette[idx]
                px[i % w, i // w] = (r, g, b, alpha)
        elif fmt == 7:
            c = struct.unpack_from('<H', data, 2 * i)[0]
            if c & 0x8000:
                px[i % w, i // w] = _rgb(c)
    return img


def frames(d, palette=None):
    """A sprite file's frames in order (its textures sorted by their number: `name_1`, `name.10`…), each drawn with the
    palette of its own name if there is one, else `palette` (a name), else the file's first."""
    import re
    textures, palettes = read(d)
    num = lambda t: int(m.group(1)) if (m := re.search(r'[._](\d+)$', t['name'])) else 0
    first = next(iter(palettes.values()))
    out = []
    for t in sorted(textures, key=num):
        base = re.sub(r'[._]\d+$', '', t['name'])
        pal = palettes.get(t['name'] + '_pl') or palettes.get(base + '_pl') or palettes.get(palette or '') or first
        out.append(image(t, pal))
    return out
