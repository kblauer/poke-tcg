"""Reads a Nintendo DS sound archive (SDAT: HeartGold/SoulSilver's files/data/sound/gs_sound_data.sdat, which the
pret/pokeheartgold decompilation keeps whole, where pokeplatinum's is unpacked) for nds_render.py: a sequence (SSEQ)
played into the events nds_render plays (as m4a_render.read_midi gives them: (tick, track, kind, a, b), 48 ticks a
quarter note), its bank (SBNK) as nds_render's programs, and the bank's waves (SWAR's SWAVs).

The sequence commands are the Nitro SDK sequencer's: notes (each waiting its length while the track is in note-wait
mode, the default), rests, programs, volume, expression, pitch bend and its range, transpose, modulation, tempo, the
envelope's attack, decay, sustain and release, loops, calls, jumps (played through up to MAX_TICKS) and the random
and variable prefixes (a random value is the range's middle; variables start at 0). Pan, priority and portamento are
read and left out.

Used by hgss_voltorb_flip.py; `python sdat.py <sdat> <SEQ name> <out.wav>` renders one. Pure Python."""
import os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nds_render  # noqa: E402

DIVISION = 48
# How far a sequence is played (a jump back would loop it for ever): 60 seconds at 120 bpm.
MAX_TICKS = DIVISION * 2 * 60


class Sdat:
    def __init__(self, path):
        self.d = d = open(path, 'rb').read()
        assert d[:4] == b'SDAT', path
        symb, _, info, _, fat, _ = struct.unpack('<IIIIII', d[16:40])
        self.fat = [struct.unpack('<II', d[fat + 12 + 16 * i:fat + 20 + 16 * i]) for i in range(struct.unpack('<I', d[fat + 8:fat + 12])[0])]

        def records(base, kind):
            off = struct.unpack('<I', d[base + 8 + 4 * kind:base + 12 + 4 * kind])[0]
            n = struct.unpack('<I', d[base + off:base + off + 4])[0]
            return [struct.unpack('<I', d[base + off + 4 + 4 * i:base + off + 8 + 4 * i])[0] for i in range(n)]

        def name(o):
            return d[symb + o:d.index(b'\0', symb + o)].decode() if o else None
        # SYMB's and INFO's records: 0 sequences, 2 banks, 3 wave archives.
        self.seq_names = {name(o): i for i, o in enumerate(records(symb, 0)) if o}
        self.seqs = [struct.unpack('<HHHB', d[info + o:info + o + 7]) if o else None for o in records(info, 0)]
        self.banks = [struct.unpack('<HH4H', d[info + o:info + o + 12]) if o else None for o in records(info, 2)]
        self.wavearcs = [struct.unpack('<H', d[info + o:info + o + 2])[0] if o else None for o in records(info, 3)]
        self._swars = {}

    def file(self, file_id):
        off, size = self.fat[file_id]
        return self.d[off:off + size]

    def swar(self, arc):
        """A wave archive's samples: each (data −1..1, rate, loop start or None)."""
        if arc not in self._swars:
            f = self.file(self.wavearcs[arc])
            assert f[:4] == b'SWAR'
            n = struct.unpack('<I', f[0x38:0x3C])[0]
            offs = struct.unpack('<%dI' % n, f[0x3C:0x3C + 4 * n])
            self._swars[arc] = [swav(f, o) for o in offs]
        return self._swars[arc]

    def programs(self, bank):
        """A bank's programs, as nds_render.read_bank gives them: each a list of (top key, region)."""
        file_id, _, *arcs = self.banks[bank]
        f = self.file(file_id)
        assert f[:4] == b'SBNK'
        n = struct.unpack('<I', f[0x38:0x3C])[0]
        kinds = {1: 'pcm', 2: 'psg', 3: 'noise', 4: 'pcm'}

        def region(kind, o):
            wave, arc, base, a, dc, s, r = struct.unpack('<HHBBBBB', f[o:o + 9])
            k = kinds.get(kind, 'pcm')
            samples, rate, loop = self.swar(arcs[arc])[wave] if k == 'pcm' and arcs[arc] != 0xFFFF else (None, 0, None)
            return {'kind': k, 'wave': wave, 'samples': samples, 'rate': rate, 'loop': loop, 'base': base, 'adsr': (a, dc, s, r)}
        programs = {}
        for i in range(n):
            kind, off = struct.unpack('<BH', f[0x3C + 4 * i:0x3C + 4 * i + 3])
            if kind == 0:
                continue
            if kind < 16:
                programs[i] = [(127, region(kind, off))]
            elif kind == 16:
                low, high = f[off], f[off + 1]
                programs[i] = [(low + k, region(struct.unpack('<H', f[off + 2 + 12 * k:off + 4 + 12 * k])[0], off + 4 + 12 * k)) for k in range(high - low + 1)]
            elif kind == 17:
                tops = [t for t in f[off:off + 8] if t]
                programs[i] = [(top, region(struct.unpack('<H', f[off + 8 + 12 * k:off + 10 + 12 * k])[0], off + 10 + 12 * k)) for k, top in enumerate(tops)]
        return programs

    def sequence(self, name):
        """A sequence's events (nds_render's), its bank and its volume."""
        file_id, _, bank, volume = self.seqs[self.seq_names[name]]
        return play_sseq(self.file(file_id)), bank, volume

    def render(self, name):
        events, bank, volume = self.sequence(name)
        return nds_render.play(events, DIVISION, self.programs(bank), volume)


def swav(f, o):
    kind, loops, rate, _, loop_words, len_words = struct.unpack('<BBHHHI', f[o:o + 12])
    data = f[o + 12:o + 12 + 4 * (loop_words + len_words)]
    if kind == 0:
        samples = [(b - 256 if b > 127 else b) / 128 for b in data]
        loop = loop_words * 4
    elif kind == 1:
        samples = [s / 32768 for s in struct.unpack('<%dh' % (len(data) // 2), data)]
        loop = loop_words * 2
    else:
        pred, idx = struct.unpack('<hB', data[:3])
        out = []
        for byte in data[4:]:
            for nib in (byte & 0xF, byte >> 4):
                step = nds_render.IMA_STEPS[idx]
                diff = step >> 3
                if nib & 1: diff += step >> 2
                if nib & 2: diff += step >> 1
                if nib & 4: diff += step
                pred = max(-32768, min(32767, pred - diff if nib & 8 else pred + diff))
                idx = max(0, min(88, idx + nds_render.IMA_INDEX[nib & 7]))
                out.append(pred)
        samples = [s / 32768 for s in out]
        loop = (loop_words - 1) * 8
    return samples, rate, loop if loops else None


def play_sseq(f):
    """Runs a sequence's tracks as the sequencer does, giving its events in time order."""
    assert f[:4] == b'SSEQ'
    start = struct.unpack('<I', f[0x18:0x1C])[0]
    data = f[start:]
    events = []
    variables = [0] * 32
    tracks = [{'pc': 0, 'tick': 0}]
    t = 0
    while t < len(tracks):
        run_track(data, tracks, t, events, variables)
        t += 1
    order = {'tempo': 0, 'mark': 1, 'off': 2, 'prog': 3, 'cc': 4, 'adsr': 4, 'bend': 5, 'on': 6}
    return sorted(events, key=lambda e: (e[0], order[e[2]]))


def run_track(data, tracks, t, events, variables):
    tr = tracks[t]
    pc, tick = tr['pc'], tr['tick']
    stack, loops = [], []
    wait, transpose, flag = True, 0, True
    steps = 0

    def u8():
        nonlocal pc
        pc += 1
        return data[pc - 1]

    def s8():
        v = u8()
        return v - 256 if v > 127 else v

    def u16():
        nonlocal pc
        pc += 2
        return struct.unpack('<H', data[pc - 2:pc])[0]

    def s16():
        nonlocal pc
        pc += 2
        return struct.unpack('<h', data[pc - 2:pc])[0]

    def u24():
        nonlocal pc
        pc += 3
        return data[pc - 3] | data[pc - 2] << 8 | data[pc - 1] << 16

    def varlen():
        v = 0
        while True:
            b = u8()
            v = (v << 7) | (b & 0x7F)
            if not b & 0x80:
                return v

    def last_arg(cmd, mode):
        """A prefixed command's last argument: a random one's range middle, a variable's value."""
        if mode == 'random':
            lo, hi = s16(), s16()
            return (lo + hi) // 2
        return variables[u8()]

    while tick < MAX_TICKS and steps < 100000 and pc < len(data):
        steps += 1
        cmd = u8()
        prefix = None
        if cmd in (0xA0, 0xA1):
            prefix = 'random' if cmd == 0xA0 else 'var'
            cmd = u8()
        elif cmd == 0xA2:
            run = flag
            cmd = u8()
            if not run:
                # Skip the command with its arguments.
                skip_args(cmd, u8, varlen, u16, u24)
                continue
        arg = (lambda read: last_arg(cmd, prefix) if prefix else read())
        if cmd < 0x80:
            vel = u8()
            length = arg(varlen)
            key = max(0, min(127, cmd + transpose))
            events.append((tick, t, 'on', key, vel))
            events.append((tick + max(1, length), t, 'off', key, 0))
            if wait:
                tick += length
        elif cmd == 0x80:
            tick += arg(varlen)
        elif cmd == 0x81:
            events.append((tick, t, 'prog', arg(varlen) & 0xFFFF, 0))
        elif cmd == 0x93:
            n = u8()
            off = u24()
            tracks.append({'pc': off, 'tick': tick, 'n': n})
        elif cmd == 0x94:
            pc = u24()
        elif cmd == 0x95:
            target = u24()
            stack.append(pc)
            pc = target
        elif 0xB0 <= cmd <= 0xBD:
            v, val = u8(), arg(s16)
            ops = {0xB0: lambda a: val, 0xB1: lambda a: a + val, 0xB2: lambda a: a - val, 0xB3: lambda a: a * val,
                   0xB4: lambda a: int(a / val) if val else a, 0xB5: lambda a: a << val if val >= 0 else a >> -val, 0xB6: lambda a: val // 2}
            if cmd in ops:
                variables[v] = ops[cmd](variables[v])
            else:
                flag = {0xB8: variables[v] == val, 0xB9: variables[v] >= val, 0xBA: variables[v] > val, 0xBB: variables[v] <= val, 0xBC: variables[v] < val, 0xBD: variables[v] != val}[cmd]
        elif cmd == 0xC1:
            events.append((tick, t, 'cc', 7, arg(u8)))
        elif cmd == 0xD5:
            events.append((tick, t, 'cc', 11, arg(u8)))
        elif cmd == 0xC3:
            transpose = arg(s8)
        elif cmd == 0xC4:
            # The bend is −128..127 over the range; nds_render's is MIDI's −64..63.
            events.append((tick, t, 'bend', arg(s8) / 2, 0))
        elif cmd == 0xC5:
            events.append((tick, t, 'cc', 20, arg(u8)))
        elif cmd == 0xC7:
            wait = bool(arg(u8))
        elif cmd == 0xCA:
            events.append((tick, t, 'cc', 1, arg(u8)))
        elif 0xD0 <= cmd <= 0xD3:
            events.append((tick, t, 'adsr', cmd - 0xD0, arg(u8)))
        elif cmd == 0xD4:
            count = u8()
            loops.append([pc, count])
        elif cmd == 0xFC:
            # A loop's end: back to its start, its count's times (0 for ever).
            if loops:
                loop = loops[-1]
                if loop[1] == 0:
                    pc = loop[0]
                else:
                    loop[1] -= 1
                    if loop[1] > 0:
                        pc = loop[0]
                    else:
                        loops.pop()
        elif cmd == 0xFD:
            if not stack:
                break
            pc = stack.pop()
        elif cmd == 0xFE:
            u16()
        elif cmd == 0xFF:
            break
        elif cmd == 0xE1:
            events.append((tick, t, 'tempo', arg(u16), 0))
        elif cmd in (0xE0, 0xE3):
            arg(u16)
        elif 0xC0 <= cmd <= 0xDF:
            arg(u8)
        else:
            raise ValueError('Unknown sequence command %02x' % cmd)


def skip_args(cmd, u8, varlen, u16, u24):
    if cmd < 0x80:
        u8()
        varlen()
    elif cmd in (0x80, 0x81):
        varlen()
    elif cmd == 0x93:
        u8()
        u24()
    elif cmd in (0x94, 0x95):
        u24()
    elif 0xB0 <= cmd <= 0xBD:
        u8()
        u16()
    elif cmd in (0xE0, 0xE1, 0xE3, 0xFE):
        u16()
    elif 0xC0 <= cmd <= 0xDF:
        u8()


if __name__ == '__main__':
    sdat, seq, out = sys.argv[1:4]
    nds_render.m4a_render.write_wav(out, Sdat(sdat).render(seq))
