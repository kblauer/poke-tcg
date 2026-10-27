"""Renders a few of Pokémon Platinum's sound effects to WAV files, from a checkout of the pret/pokeplatinum decompilation,
as the Nintendo DS's sound engine (the Nitro SDK's sequencer) plays them: the sequence's MIDI file (res/sound/SEQ/<seq>.mid),
its bank (res/sound/BANK/<bank>.txt: each program a single sample, a keysplit, a drum set or a PSG square or noise, with
its base key and attack, decay, sustain and release) and the bank's wave archives (res/sound/WAVARC/<arc>/<n>.wav, IMA
ADPCM or PCM, their 'smpl' loops), the sequence's volume and bank from res/sound/pl_sound_data.json.

The engine works in tenths of a decibel: a note's loudness is its velocity's, its track's volume's, the sequence's
volume's and its envelope's added (each level through the "decibel square" table, 400 · log10(x / 127), at least
−72.2 dB), its envelope stepped once a sound frame (192 a second) with the SDK's attack, decay and release rates.
Pitch is the sample's rate (the pitch of its base key) moved by the key, the pitch bend (CC 20 its range) and the
modulation (CC 1, a vibrato). Pan is left out (the effects are mono). It's a close rendering, not a bit-exact one.

Used by platinum_extras.py (the Poffin cooking sounds); `python nds_render.py <pokeplatinum checkout> <SEQ name> <out.wav>`
renders one (an optional 4th argument: at most that many seconds, 20 by default). Pure Python."""
import json, math, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import m4a_render  # noqa: E402  (its MIDI reader and WAV writer)

RATE = m4a_render.RATE
SOUND_FRAME = 64 * 2728 / 33513982  # the SDK's sound frame, about 5.2 ms
AMPL_MIN = -723 * 128  # the envelope's floor (−72.3 dB, × 128)
# The SDK's attack rates for attacks of 109-127 (SNDi_AttackTable, by 127 − attack); under 109 it's 255 − attack.
ATTACK_HIGH = [0x00, 0x01, 0x05, 0x0E, 0x1A, 0x26, 0x33, 0x3F, 0x49, 0x54, 0x5C, 0x64, 0x6D, 0x74, 0x7B, 0x7F, 0x84, 0x89, 0x8F]
IMA_STEPS = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
             130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
             1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
             7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767]
IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8]


def decibels(level):
    """SNDi_DecibelSquareTable: a level (0-127) in tenths of a decibel."""
    return -32768 if level <= 0 else max(-722, round(400 * math.log10(level / 127)))


def attack_rate(a):
    return ATTACK_HIGH[127 - a] if a >= 109 else 255 - a


def fall_rate(x):
    """The decay or release rate (SND's CnvFall): how much the envelope falls each sound frame."""
    if x == 127:
        return 0xFFFF
    if x == 126:
        return 0x3C00
    if x < 50:
        return x * 2 + 1
    return 0x1E00 // (126 - x)


def read_wave(path):
    """A wave archive's sample: its data (−1..1), its rate and its loop start (or None)."""
    d = open(path, 'rb').read()
    i, fmt, rate, block, data, loop = 12, 1, 0, 0, b'', None
    bits = 16
    while i < len(d) - 8:
        cid, ln = d[i:i + 4], struct.unpack('<I', d[i + 4:i + 8])[0]
        body = d[i + 8:i + 8 + ln]
        if cid == b'fmt ':
            fmt, _, rate, _, block, bits = struct.unpack('<HHIIHH', body[:16])
        elif cid == b'data':
            data = body
        elif cid == b'smpl' and struct.unpack('<I', body[28:32])[0]:
            loop = struct.unpack('<I', body[44:48])[0]
        i += 8 + ln + (ln & 1)
    if fmt == 17:
        samples = []
        for b in range(0, len(data), block or len(data)):
            chunk = data[b:b + (block or len(data))]
            if len(chunk) < 4:
                break
            pred, idx = struct.unpack('<hB', chunk[:3])
            samples.append(pred)
            for byte in chunk[4:]:
                for nib in (byte & 0xF, byte >> 4):
                    step = IMA_STEPS[idx]
                    diff = step >> 3
                    if nib & 1: diff += step >> 2
                    if nib & 2: diff += step >> 1
                    if nib & 4: diff += step
                    pred = max(-32768, min(32767, pred - diff if nib & 8 else pred + diff))
                    idx = max(0, min(88, idx + IMA_INDEX[nib & 7]))
                    samples.append(pred)
        out = [s / 32768 for s in samples]
    elif bits == 8:
        out = [(b - 128) / 128 for b in data]
    else:
        out = [s / 32768 for s in struct.unpack('<%dh' % (len(data) // 2), data[:len(data) // 2 * 2])]
    return out, rate, loop


def read_bank(repo, bank, arcs):
    """A bank's programs: each a list of (top key, region), a region (kind, wave, rate, loop, base key, a, d, s, r)."""
    def region(kind, wave, arc, base, a, d, s, r):
        if kind == 'pcm':
            samples, rate, loop = read_wave(os.path.join(repo, 'res', 'sound', 'WAVARC', arcs[arc], '%03d.wav' % wave))
        else:
            samples, rate, loop = None, 0, None
        return {'kind': kind, 'wave': wave, 'samples': samples, 'rate': rate, 'loop': loop, 'base': base, 'adsr': (a, d, s, r)}
    sub_kind = {1: 'pcm', 2: 'psg', 3: 'noise'}
    programs = {}
    lines = open(os.path.join(repo, 'res', 'sound', 'BANK', bank + '.txt')).read().splitlines()
    i = 0
    while i < len(lines):
        f = [x.strip() for x in lines[i].split(',')]
        i += 1
        if len(f) < 2 or f[1] == 'NULL' or not f[0].isdigit():
            continue
        prog, kind = int(f[0]), f[1]
        if kind in ('Single', 'PSG1', 'PSG2'):
            k = {'Single': 'pcm', 'PSG1': 'psg', 'PSG2': 'noise'}[kind]
            programs[prog] = [(127, region(k, int(f[2]), int(f[3]), int(f[4]), *(int(x) for x in f[5:9])))]
        elif kind in ('Keysplit', 'Drums'):
            if kind == 'Keysplit':
                tops = [int(x) for x in f[2:10] if int(x)]
            else:
                low, high = int(f[2]), int(f[3])
                tops = list(range(low, high + 1))
            regions = []
            for top in tops:
                s = [int(x.strip()) for x in lines[i].split(',')]
                i += 1
                regions.append((top, region(sub_kind.get(s[0], 'pcm'), s[1], s[2], s[3], *s[4:8])))
            programs[prog] = regions
    return programs


class Note:
    def __init__(self, region, key, velocity):
        self.region, self.key, self.velocity = region, key, velocity
        a, d, s, r = region['adsr']
        self.attack, self.decay, self.release = attack_rate(a), fall_rate(d), fall_rate(r)
        self.sustain = 0 if s == 127 else decibels(s) << 7
        self.ampl, self.stage = AMPL_MIN, 'attack'
        self.held, self.done, self.phase = True, False, 0.0
        self.lfsr = 0x7FFF

    def frame(self):
        """The envelope's step this sound frame (the SDK's)."""
        if not self.held and self.stage != 'release':
            self.stage = 'release'
        if self.stage == 'attack':
            self.ampl = -((-self.ampl * self.attack) >> 8)
            if self.ampl == 0:
                self.stage = 'decay'
        elif self.stage == 'decay':
            self.ampl -= self.decay
            if self.ampl <= self.sustain:
                self.ampl, self.stage = self.sustain, 'sustain'
        elif self.stage == 'release':
            self.ampl -= self.release
            if self.ampl <= AMPL_MIN:
                self.done = True

    def render(self, n, pitch, gain_db):
        out = [0.0] * n
        if self.done:
            return out
        amp = 10 ** ((gain_db + (self.ampl >> 7)) / 200)
        reg = self.region
        semis = self.key - reg['base'] + pitch
        if reg['kind'] == 'pcm':
            step = reg['rate'] * 2 ** (semis / 12) / RATE
            s, size, loop = reg['samples'], len(reg['samples']), reg['loop']
            for i in range(n):
                p = int(self.phase)
                if p >= size:
                    if loop is None or loop >= size:
                        self.done = True
                        break
                    self.phase = loop + (self.phase - size) % (size - loop)
                    p = int(self.phase)
                out[i] = s[p] * amp
                self.phase += step
        elif reg['kind'] == 'psg':
            hz = 440 * 2 ** ((reg['base'] + semis - 69) / 12)
            duty = (reg['wave'] + 1) / 8
            for i in range(n):
                self.phase = (self.phase + hz / RATE) % 1
                out[i] = (1 if self.phase < duty else -1) * amp * 0.5
        else:
            hz = 440 * 2 ** ((reg['base'] + semis - 69) / 12) * 8
            for i in range(n):
                self.phase += hz / RATE
                while self.phase >= 1:
                    self.phase -= 1
                    bit = (self.lfsr ^ (self.lfsr >> 1)) & 1
                    self.lfsr = (self.lfsr >> 1) | (bit << 14)
                out[i] = (1 if self.lfsr & 1 else -1) * amp * 0.5
        return out


def render(repo, seq, seconds=20):
    """A sequence's samples (−1..1), until every note has died away (at most `seconds`)."""
    info = next(s for s in json.load(open(os.path.join(repo, 'res', 'sound', 'pl_sound_data.json')))['seqInfo'] if s.get('name') == seq)
    banks = json.load(open(os.path.join(repo, 'res', 'sound', 'pl_sound_data.json')))['bankInfo']
    bank = next(b for b in banks if b['name'] == info['bank'])
    programs = read_bank(repo, bank['name'], bank['waves'])
    path = os.path.join(repo, 'res', 'sound', 'SEQ', seq + '.mid')
    division = struct.unpack('>H', open(path, 'rb').read()[12:14])[0]
    return play(m4a_render.read_midi(path), division, programs, info.get('volume', 127), seconds)


def play(events, division, programs, volume, seconds=20):
    """Plays a sequence's events (read_midi's, or sdat.py's: those add expression, CC 11, and the track's envelope
    overrides, 'adsr') on its bank's programs at its volume: the samples (−1..1), until every note has died away (at most
    `seconds`)."""
    end = max(e[0] for e in events)
    seq_db = decibels(volume)
    tracks = {}
    state = lambda t: tracks.setdefault(t, {'prog': 0, 'vol': 127, 'expr': 127, 'bend': 0, 'range': 2, 'mod': 0, 'lfo': 0, 'adsr': [None] * 4, 'notes': []})
    bpm, tick_time, t, ev, out, carry = 120.0, 0.0, 0.0, 0, [], 0.0
    while True:
        # The events due by this sound frame.
        while ev < len(events) and events[ev][0] * 60 / (bpm * division) <= t + 1e-9:
            tick, track, kind, a, b = events[ev]
            ev += 1
            s = state(track)
            if kind == 'tempo':
                bpm = a
            elif kind == 'prog':
                s['prog'] = a
            elif kind == 'cc':
                if a == 7:
                    s['vol'] = b
                elif a == 11:
                    s['expr'] = b
                elif a == 20:
                    s['range'] = b
                elif a == 1:
                    s['mod'] = b
            elif kind == 'bend':
                s['bend'] = a
            elif kind == 'adsr':
                s['adsr'][a] = b
            elif kind == 'on':
                regions = programs.get(s['prog'])
                if regions:
                    region = next((r for top, r in regions if a <= top), regions[-1][1])
                    if any(v is not None for v in s['adsr']):
                        region = {**region, 'adsr': tuple(r if o is None else o for r, o in zip(region['adsr'], s['adsr']))}
                    s['notes'].append(Note(region, a, b))
            elif kind == 'off':
                for note in s['notes']:
                    if note.key == a and note.held:
                        note.held = False
                        break
        carry += RATE * SOUND_FRAME
        n = int(carry)
        carry -= n
        mixed = [0.0] * n
        sounding = False
        for s in tracks.values():
            s['lfo'] = (s['lfo'] + (16 << 6)) & 0x7FFF
            vibrato = math.sin(2 * math.pi * s['lfo'] / 0x8000) * s['mod'] / 127
            pitch = s['bend'] * s['range'] / 64 + vibrato
            for note in s['notes']:
                note.frame()
                gain = decibels(note.velocity) + decibels(s['vol']) + decibels(s['expr']) + seq_db
                for i, v in enumerate(note.render(n, pitch, gain)):
                    mixed[i] += v
            s['notes'] = [x for x in s['notes'] if not x.done]
            sounding |= bool(s['notes'])
        out.extend(mixed)
        t += SOUND_FRAME
        done_ticks = ev >= len(events) and t * bpm * division / 60 > end
        if (done_ticks and not sounding) or len(out) > RATE * seconds:
            break
    return out


if __name__ == '__main__':
    repo, seq, path = sys.argv[1:4]
    m4a_render.write_wav(path, render(repo, seq, *(float(a) for a in sys.argv[4:5])))
