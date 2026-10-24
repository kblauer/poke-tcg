"""Renders a few of Pokémon Emerald's sound effects (and fanfares) to WAV files, from a checkout of the pret/pokeemerald
decompilation, as the game's sound engine (Nintendo's "m4a"/MP2K, src/m4a.c) plays them: the song's MIDI file
(sound/songs/midi/<song>.mid) with mid2agb's settings from midi.cfg (its voice group, master volume and reverb), each
note played by its program's voice in that voice group (sound/voicegroups/<group>.inc):

- DirectSound: an 8-bit sample (sound/direct_sound_samples/<name>.wav, its rate the pitch of key 60, its 'smpl' loop),
  resampled to the note, with the engine's envelope (attack added, decay and release multiplied, once a frame);
- the Game Boy's square channels (1 with its frequency sweep) and noise channel, their frequencies from the engine's
  tables (gCgbScaleTable/gCgbFreqTable, gNoiseTable), their 4-bit envelopes stepped once a frame.

The sequencer runs once a frame (60 a second) as the engine's does: its tempo (beats a minute) added to a counter, a
tick each 150. Volume (CC 7, × the master volume / 127), pan (ignored: the effects are mono), bend range (CC 20), pitch
bend, modulation (CC 1, a vibrato) and the loop markers ('[' ']', meta text) are played; the echo commands (CC 29/30) and
the reverb are left out. It's a close rendering, not a bit-exact one.

Used by emerald_extras.py (the Berry Blender's sounds); `python m4a_render.py <pokeemerald checkout> <song> <out.wav>`
renders one. Pure Python."""
import math, os, re, struct, sys, wave

RATE = 22050
FRAME = 1 / 60
# The square channels' and noise's loudness beside a DirectSound sample's at full volume (the GBA mixes the Game Boy's
# channels in at about a quarter of its DirectSound's range).
PSG_GAIN = 0.3

NOISE_TABLE = [
    0xD7, 0xD6, 0xD5, 0xD4, 0xC7, 0xC6, 0xC5, 0xC4, 0xB7, 0xB6, 0xB5, 0xB4, 0xA7, 0xA6, 0xA5, 0xA4, 0x97, 0x96, 0x95, 0x94,
    0x87, 0x86, 0x85, 0x84, 0x77, 0x76, 0x75, 0x74, 0x67, 0x66, 0x65, 0x64, 0x57, 0x56, 0x55, 0x54, 0x47, 0x46, 0x45, 0x44,
    0x37, 0x36, 0x35, 0x34, 0x27, 0x26, 0x25, 0x24, 0x17, 0x16, 0x15, 0x14, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x00,
]
CGB_FREQ = [-2004, -1891, -1785, -1685, -1591, -1501, -1417, -1337, -1262, -1192, -1125, -1062]
DUTY = [0.125, 0.25, 0.5, 0.75]


def vlq(d, i):
    v = 0
    while True:
        b = d[i]
        i += 1
        v = (v << 7) | (b & 0x7F)
        if not b & 0x80:
            return v, i


def read_midi(path):
    """Every event, (tick, track, kind, a, b), in time order: notes ('on'/'off'), 'cc', 'prog', 'bend', 'tempo' (bpm) and 'mark' ('[' or ']')."""
    d = open(path, 'rb').read()
    ntracks = struct.unpack('>H', d[10:12])[0]
    i, events = 14, []
    for track in range(ntracks):
        n = struct.unpack('>I', d[i + 4:i + 8])[0]
        j, end, t, run = i + 8, i + 8 + n, 0, 0
        while j < end:
            dt, j = vlq(d, j)
            t += dt
            b = d[j]
            if b == 0xFF:
                typ = d[j + 1]
                ln, k = vlq(d, j + 2)
                body = d[k:k + ln]
                if typ == 0x51:
                    events.append((t, track, 'tempo', 60_000_000 / int.from_bytes(body, 'big'), 0))
                elif typ == 0x06 and body in (b'[', b']'):
                    events.append((t, track, 'mark', body.decode(), 0))
                j = k + ln
                continue
            if b in (0xF0, 0xF7):
                ln, k = vlq(d, j + 1)
                j = k + ln
                continue
            if b & 0x80:
                run = b
                j += 1
            st = run >> 4
            if st in (0xC, 0xD):
                if st == 0xC:
                    events.append((t, track, 'prog', d[j], 0))
                j += 1
                continue
            a, v = d[j], d[j + 1]
            j += 2
            if st == 0x9 and v:
                events.append((t, track, 'on', a, v))
            elif st in (0x8, 0x9):
                events.append((t, track, 'off', a, 0))
            elif st == 0xB:
                events.append((t, track, 'cc', a, v))
            elif st == 0xE:
                events.append((t, track, 'bend', v - 64, 0))
        i = end
    order = {'tempo': 0, 'mark': 1, 'off': 2, 'prog': 3, 'cc': 4, 'bend': 5, 'on': 6}
    return sorted(events, key=lambda e: (e[0], order[e[2]]))


def read_voices(repo, group):
    """A voice group's voices, by program: (type, args)."""
    return _group_voices(os.path.join(repo, 'sound', 'voicegroups', group + '.inc'))[0]


def _group_voices(path):
    """A voice group file's voices and its first key (a drumset's or keysplit's group starts at one: `voice_group name, 36`)."""
    lines = open(path).read().splitlines()
    head = re.match(r'\s*voice_group\s+\w+\s*(?:,\s*(\d+))?', lines[0])
    voices = []
    for line in lines[1:]:
        m = re.match(r'\s*(voice_\w+)\s+(.*)', line)
        voices.append((m.group(1), [a.strip() for a in m.group(2).split(',')]) if m else ('none', []))
    return voices, int(head.group(1)) if head and head.group(1) else 0


_groups = {}


def find_group(repo, name):
    """A voice group by its label (voicegroup_<name>), looked for in sound/voicegroups and its drumsets and keysplits."""
    if name not in _groups:
        base = os.path.join(repo, 'sound', 'voicegroups')
        for folder in ('', 'drumsets', 'keysplits'):
            d = os.path.join(base, folder)
            for f in os.listdir(d):
                if f.endswith('.inc') and re.match(r'\s*voice_group\s+' + re.escape(name) + r'\b', open(os.path.join(d, f)).readline()):
                    _groups[name] = _group_voices(os.path.join(d, f))
        if name not in _groups:
            raise KeyError(name)
    return _groups[name]


_keysplits = {}


def keysplit(repo, name):
    """A key split table (sound/keysplit_tables.inc): each key's voice in its group (the `split index, ending_note` runs)."""
    if not _keysplits:
        table, last = None, 0
        for line in open(os.path.join(repo, 'sound', 'keysplit_tables.inc')).read().splitlines():
            m = re.match(r'\s*keysplit\s+(\w+)\s*(?:,\s*(\d+))?', line)
            if m:
                table = _keysplits.setdefault('keysplit_' + m.group(1), {})
                last = int(m.group(2) or 0)
                continue
            m = re.match(r'\s*split\s+(\d+)\s*,\s*(\d+)', line)
            if m and table is not None:
                for k in range(last, int(m.group(2))):
                    table[k] = int(m.group(1))
                last = int(m.group(2))
    return _keysplits[name]


def resolve_voice(repo, voice, key):
    """The voice a note plays and the key it plays at (ply_note): a key split's by its table; a drumset's (keysplit_all)
    the group's voice for that key, played at that voice's own key."""
    kind, args = voice
    if kind == 'voice_keysplit':
        voices, _ = find_group(repo, args[0].replace('voicegroup_', '', 1))
        return voices[keysplit(repo, args[1]).get(key, 0)], key, False
    if kind == 'voice_keysplit_all':
        voices, first = find_group(repo, args[0].replace('voicegroup_', '', 1))
        sub = voices[key - first] if 0 <= key - first < len(voices) else ('none', [])
        return sub, int(sub[1][0]) if sub[1] else key, True
    return voice, key, False


_waves = {}


def read_wave(repo, symbol):
    """A programmable wave (the Game Boy's channel 3): its 32 4-bit samples (sound/programmable_wave_samples/<n>.pcm)."""
    if symbol not in _waves:
        inc = open(os.path.join(repo, 'sound', 'programmable_wave_data.inc')).read()
        path = re.search(re.escape(symbol) + r'::\s*\.incbin\s+"([^"]+)"', inc).group(1)
        data = open(os.path.join(repo, path), 'rb').read()[:16]
        _waves[symbol] = [n for b in data for n in (b >> 4, b & 15)]
    return _waves[symbol]


_samples = {}


def read_sample(repo, symbol):
    """A DirectSound sample by its symbol: its data (-1..1), its rate (the pitch of key 60) and its loop start (or None)."""
    if symbol in _samples:
        return _samples[symbol]
    inc = open(os.path.join(repo, 'sound', 'direct_sound_data.inc')).read()
    path = re.search(re.escape(symbol) + r'::\s*\.incbin\s+"([^"]+)\.bin"', inc).group(1) + '.wav'
    d = open(os.path.join(repo, path), 'rb').read()
    i, rate, loop, data = 12, 0, None, b''
    while i < len(d) - 8:
        cid, ln = d[i:i + 4], struct.unpack('<I', d[i + 4:i + 8])[0]
        body = d[i + 8:i + 8 + ln]
        if cid == b'fmt ':
            rate = struct.unpack('<I', body[4:8])[0]
        elif cid == b'smpl' and struct.unpack('<I', body[28:32])[0]:
            loop = struct.unpack('<I', body[44:48])[0]
        elif cid == b'data':
            data = body
        i += 8 + ln + (ln & 1)
    _samples[symbol] = ([(b - 128) / 128 for b in data], rate, loop)
    return _samples[symbol]


def cgb_freq(key, fine=0.0):
    """A square channel's Game Boy frequency register for a key (MidiKeyToCgbFreq), fine tuning between keys included."""
    def at(k):
        k = max(0, min(130, k - 36))
        v = k // 12 * 16 + k % 12
        return CGB_FREQ[v & 0xF] >> (v >> 4)
    k = int(math.floor(key))
    frac = key - k + fine
    if k <= 35:
        return 2048 + at(36)
    return 2048 + at(k) + frac * (at(k + 1) - at(k))


class Note:
    """A note sounding: its voice, key, velocity and envelope, and its oscillator's state."""

    def __init__(self, voice, key, velocity, repo):
        self.kind, self.args = voice
        self.key, self.velocity = key, velocity
        self.held, self.done = True, False
        self.phase = 0.0
        a = self.args
        self.midi = key
        if self.kind == 'none' or self.kind.startswith('voice_keysplit'):
            # No voice there (a drumset's gap): silent.
            self.kind, self.done, self.attack, self.decay, self.sustain, self.release = 'voice_square_2', True, 0, 0, 0, 0
            self.level, self.counter, self.stage, self.sweep, self.duty, self.sweep_clock, self.reg, self.gain = 0, 0, 'release', 0, 0.5, 0.0, None, 0
            return
        if self.kind.startswith('voice_directsound'):
            self.base_key = int(a[0])
            self.sample, self.rate, self.loop = read_sample(repo, a[2])
            self.attack, self.decay, self.sustain, self.release = (int(x) for x in a[3:7])
            self.env, self.stage = 0.0, 'attack'
        else:
            if self.kind.startswith('voice_square_1'):
                self.sweep, self.duty = int(a[2]), DUTY[int(a[3]) & 3]
                adsr = a[4:8]
            elif self.kind.startswith('voice_square_2'):
                self.sweep, self.duty = 0, DUTY[int(a[2]) & 3]
                adsr = a[3:7]
            elif self.kind.startswith('voice_programmable_wave'):
                # Channel 3: its 32 4-bit samples played round, as a square's register sets their speed.
                self.sweep, self.duty = 0, 0.5
                self.wave = read_wave(repo, a[2])
                adsr = a[3:7]
            else:  # noise
                self.width7 = int(a[2]) & 1
                adsr = a[3:7]
            self.attack, self.decay, self.sustain, self.release = (int(x) for x in adsr)
            self.level, self.counter, self.stage = 0, 0, 'attack'
            self.sweep_clock = 0.0
            self.reg = None
            self.lfsr = 0x7FFF

    def frame(self, volume):
        """The envelope's step this frame (the engine's, once a frame)."""
        if self.kind.startswith('voice_directsound'):
            if not self.held and self.stage != 'release':
                self.stage = 'release'
            if self.stage == 'attack':
                self.env = min(255, self.env + self.attack)
                if self.env >= 255:
                    self.stage = 'decay'
            elif self.stage == 'decay':
                self.env = self.env * self.decay / 256
                if self.env <= self.sustain:
                    self.env, self.stage = self.sustain, 'sustain'
            elif self.stage == 'release':
                self.env = self.env * self.release / 256
                if self.env < 1:
                    self.done = True
            self.gain = self.env / 255 * volume * self.velocity / 127
            return
        # The Game Boy's 4-bit envelopes, a step every `rate` frames (0: at once).
        peak = max(1, min(15, round(15 * volume * self.velocity / 127)))
        if not self.held and self.stage != 'release':
            self.stage, self.counter = 'release', self.release
        if self.stage == 'attack':
            if self.attack == 0:
                self.level, self.stage, self.counter = peak, 'decay', self.decay
            else:
                self.counter -= 1
                if self.counter <= 0:
                    self.level += 1
                    self.counter = self.attack
                    if self.level >= peak:
                        self.level, self.stage, self.counter = peak, 'decay', self.decay
        elif self.stage == 'decay':
            goal = peak * self.sustain // 15
            if self.decay == 0:
                self.level, self.stage = goal, 'sustain'
            else:
                self.counter -= 1
                if self.counter <= 0:
                    self.level -= 1
                    self.counter = self.decay
                    if self.level <= goal:
                        self.level, self.stage = goal, 'sustain'
        elif self.stage == 'release':
            if self.release == 0:
                self.level = 0
            else:
                self.counter -= 1
                if self.counter <= 0:
                    self.level -= 1
                    self.counter = self.release
            if self.level <= 0:
                self.done = True
        if self.stage == 'sustain' and self.level <= 0:
            self.done = True
        self.gain = self.level / 15 * PSG_GAIN

    def render(self, n, pitch):
        """`n` samples at the note's key, bent by `pitch` semitones."""
        out = [0.0] * n
        if self.done or self.gain <= 0:
            if self.kind.startswith('voice_directsound'):
                # Still advance the sample, as the engine does.
                pass
            return out
        key = self.key + pitch
        if self.kind.startswith('voice_directsound'):
            step = self.rate * 2 ** ((key - self.base_key) / 12) / RATE
            s, size = self.sample, len(self.sample)
            for i in range(n):
                p = int(self.phase)
                if p >= size:
                    if self.loop is None:
                        self.done = True
                        break
                    self.phase = self.loop + (self.phase - size)
                    p = int(self.phase)
                out[i] = s[p] * self.gain
                self.phase += step
            return out
        if self.kind.startswith('voice_noise'):
            k = max(0, min(59, int(key) - 21))
            v = NOISE_TABLE[k]
            r, sh = v & 7, v >> 4
            hz = 524288 / (r or 0.5) / 2 ** (sh + 1)
            step = hz / RATE
            for i in range(n):
                self.phase += step
                while self.phase >= 1:
                    self.phase -= 1
                    bit = (self.lfsr ^ (self.lfsr >> 1)) & 1
                    self.lfsr = (self.lfsr >> 1) | (bit << 14)
                    if self.width7:
                        self.lfsr = (self.lfsr & ~0x40) | (bit << 6)
                out[i] = (1 if not self.lfsr & 1 else -1) * self.gain
            return out
        # A square: its frequency register from the key, swept (channel 1) every `time`/128 of a second.
        if self.reg is None or pitch != getattr(self, 'last_pitch', None):
            self.reg = cgb_freq(key)
            self.last_pitch = pitch
        sweep_time, sweep_down, sweep_shift = (self.sweep >> 4) & 7, (self.sweep >> 3) & 1, self.sweep & 7
        for i in range(n):
            if sweep_time and sweep_shift:
                self.sweep_clock += 128 / RATE
                if self.sweep_clock >= sweep_time:
                    self.sweep_clock -= sweep_time
                    delta = int(self.reg) >> sweep_shift
                    self.reg = self.reg - delta if sweep_down else self.reg + delta
                    if self.reg > 2047:
                        self.done = True
                        break
            hz = 131072 / max(1, 2048 - self.reg)
            if hasattr(self, 'wave'):
                # Channel 3 steps through its 32 samples at twice that (the waves hold 2 of their cycles).
                self.phase = (self.phase + hz / 2 / RATE) % 1
                out[i] = (self.wave[int(self.phase * 32)] - 7.5) / 7.5 * self.gain
                continue
            self.phase = (self.phase + hz / RATE) % 1
            out[i] = (1 if self.phase < self.duty else -1) * self.gain
        return out


def render(repo, song, loop=False):
    """A song's samples (-1..1). `loop`: only its loop ('[' to ']'), once, to be played over and over."""
    cfg = dict(re.findall(r'^(\S+)\.mid:\s+(.*)$', open(os.path.join(repo, 'sound', 'songs', 'midi', 'midi.cfg')).read(), re.M))[song]
    group = re.search(r'-G_?(\w+)', cfg).group(1)
    master = int(re.search(r'-V(\d+)', cfg).group(1)) if '-V' in cfg else 127
    voices = read_voices(repo, group)
    events = read_midi(os.path.join(repo, 'sound', 'songs', 'midi', song + '.mid'))
    marks = {e[3]: e[0] for e in events if e[2] == 'mark'}
    end_tick = marks.get(']') if loop else max(e[0] for e in events)
    start_tick = marks.get('[', 0) if loop else 0
    tracks = {}
    state = lambda t: tracks.setdefault(t, {'prog': 0, 'vol': 100, 'bend': 0, 'range': 2, 'mod': 0, 'lfo': 0.0, 'notes': []})
    bpm, counter, tick, ev, out = 150.0, 0, 0, 0, []
    # Play to the end tick, then until every note has died away (but a loop stops at its end).
    while True:
        counter += bpm
        while counter >= 150:
            counter -= 150
            while ev < len(events) and events[ev][0] <= tick:
                t, track, kind, a, b = events[ev]
                ev += 1
                s = state(track)
                if kind == 'tempo':
                    bpm = a
                elif kind == 'prog':
                    s['prog'] = a
                elif kind == 'cc':
                    if a == 7:
                        s['vol'] = b * master // 127
                    elif a == 20:
                        s['range'] = b
                    elif a == 1:
                        s['mod'] = b
                elif kind == 'bend':
                    s['bend'] = a
                elif kind == 'on':
                    voice, key, rhythm = resolve_voice(repo, voices[s['prog']], a)
                    note = Note(voice, key, b, repo)
                    note.midi = a
                    if rhythm and hasattr(note, 'base_key'):
                        # A drum plays at its voice's key, a sample's pitch reckoned from key 60 as any other's.
                        note.base_key = 60
                    s['notes'].append(note)
                elif kind == 'off':
                    for note in s['notes']:
                        if note.midi == a and note.held:
                            note.held = False
                            break
            tick += 1
        frame_samples = []
        sounding = False
        for s in tracks.values():
            s['lfo'] = (s['lfo'] + 22 / 256) % 1
            vibrato = s['mod'] / 127 * 0.5 * math.sin(2 * math.pi * s['lfo'])
            pitch = s['bend'] * s['range'] / 64 + vibrato
            for note in s['notes']:
                note.frame(s['vol'] / 127)
                frame_samples.append(note.render(round(RATE * FRAME), pitch))
            s['notes'] = [n for n in s['notes'] if not n.done]
            sounding |= bool(s['notes'])
        mixed = [sum(col) for col in zip(*frame_samples)] if frame_samples else [0.0] * round(RATE * FRAME)
        if tick > start_tick:
            out.extend(mixed)
        if loop and tick >= end_tick:
            break
        if not loop and tick > end_tick and not sounding:
            break
        if len(out) > RATE * 20:
            break
    return out


def write_wav(path, samples, gain=1.0):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * gain * 32767)))) for v in samples))


if __name__ == '__main__':
    repo, song, out = sys.argv[1:4]
    write_wav(out, render(repo, song))
