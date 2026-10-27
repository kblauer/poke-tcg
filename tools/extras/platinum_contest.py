"""Makes the Extras page's Super Contest data and assets from a checkout of the pret/pokeplatinum decompilation, as Pokémon
Platinum has them:

- every move's contest type and effect (res/moves/<move>/data.json's "contest"), keyed as the Idle Adventure keys moves
  (lower case, hyphens), with its name;
- each contest effect's appeal (Unk_020F568C in src/unk_02094EDC.c: its base points, in tenths of a heart) and its
  descriptions (res/text/contest_effects.json: the two-line short one and the three-line long one);
- the contest data archive (res/prebuilt/contest/data/contest_data.narc): member 0, the 96 CPU entrants (0x30 bytes each:
  overworld sprite, moves, species, nickname and trainer from contest_opponent_names.json, the six conditions, a bitfield
  of rank, categories, flags, gender and AI level, the dress set per theme, fame); member 2, the 96 dress sets (0x54 bytes:
  20 accessories, each its id, x, y and priority, then the count, the Pokémon's priority and the backdrop); members 3-14,
  each theme's points for the 100 accessories;
- the CPU's acting table (Unk_ov17_02253C30 in src/overlay017/ov17_02246ECC.c: position, condition, target, judge mode and
  a weight per AI level), the 12 themes' names (res/text/unk_0385.json), the 100 accessories' and 18 backdrops' names:
  packages/campaign/src/contest-data.ts;
- Platinum's front sprite (res/pokemon/<species>/male_front.png's, or female_front.png's for a species only ever female, first 80x80 frame in normal.pal, colour 0 clear) of
  Kanto's 151 and every entrant's species: apps/web/public/extras/contest/pokemon/<National Dex number>.png;
- the Sinnoh contest ribbons (res/graphics/pokemon_summary_screen/ribbons/sinnoh_contest*.png, one a rank, in
  ribbons.pal's palette of each category, src/ribbon.c's paletteNum): apps/web/public/extras/contest/ribbons/<category>-<rank>.png;
- the contest's songs, rendered by nds_render.py (the 7 dance songs of Unk_ov17_02253084, the dressing room's, the
  results' and the winner's fanfare), whole: apps/web/public/extras/contest/sounds/<SEQ>.mp3.

Usage: python tools/extras/platinum_contest.py <pokeplatinum checkout>
Needs Pillow and lameenc."""
import json, os, re, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'extras', 'contest')
OUT_TS = os.path.join(REPO, 'packages', 'campaign', 'src', 'contest-data.ts')
CATEGORIES = ['cool', 'beauty', 'cute', 'smart', 'tough']
RANKS = ['normal', 'great', 'ultra', 'master']
EFFECTS = ['NONE', 'FIRST_NEXT_TURN', 'LAST_NEXT_TURN', 'DOUBLED_JUDGE', '2_HEARTS_WHEN_VOLTAGE_UP', 'BASIC', 'UNIQUE_JUDGE', 'CONSECUTIVE_USE', 'VOLTAGE', 'ALL_SAME_JUDGE',
           'LOWERS_VOLTAGE', 'DOUBLE_NEXT_TURN', 'STEAL_VOLTAGE', 'SUPPRESS_VOLTAGE', 'RANDOM_ORDER', 'DOUBLE_FINAL_ACT', 'LOW_VOLTAGE_ADVANTAGE', 'FIRST_PERFORMANCE_ADVANTAGE',
           'FINAL_PERFORMANCE_ADVANTAGE', 'NO_VOLTAGE_DOWN', 'TWO_VOLTAGE_IN_A_ROW_ADVANTAGE', 'HIGH_SCORE_LATER_TURN', 'MAX_VOLTAGE_ADVANTAGE', 'PITY_POINTS']
# Unk_ov17_02253084's songs (its first field, the sequence), in its rows' order; then the dressing room's, the results' and the fanfare.
DANCE_SONGS = ['SEQ_CO_KASHI', 'SEQ_CO_TAKUMA', 'SEQ_PL_MTKAKKO', 'SEQ_PL_MTUTSUK', 'SEQ_PL_MTKAWA', 'SEQ_PL_MTKASHI', 'SEQ_PL_MTTAKMA']
OTHER_SONGS = ['SEQ_CO_DRESS', 'SEQ_CO_KEKKA', 'SEQ_CO_FANFA']


def text(repo, bank):
    out = []
    for m in json.load(open(os.path.join(repo, 'res', 'text', bank + '.json'), encoding='utf-8'))['messages']:
        v = m.get('en_US') or ''
        out.append(''.join(v) if isinstance(v, list) else v)
    return out


def lines(repo, name):
    return [l.strip() for l in open(os.path.join(repo, 'generated', name)) if l.strip()]


def key_of(constant, prefix):
    return constant[len(prefix):].lower().replace('_', '-')


def narc(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'NARC'
    off = struct.unpack_from('<H', d, 0xC)[0]
    assert d[off:off + 4] == b'BTAF'
    size, count = struct.unpack_from('<IH', d, off + 4)
    fat = [struct.unpack_from('<II', d, off + 12 + 8 * i) for i in range(count)]
    o = off + size
    o += struct.unpack_from('<I', d, o + 4)[0]
    assert d[o:o + 4] == b'GMIF'
    return [d[o + 8 + s:o + 8 + e] for s, e in fat]


def ts(v):
    if isinstance(v, str):
        return "'" + v.replace('\\', '\\\\').replace("'", "\\'") + "'"
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (list, tuple)):
        return '[' + ', '.join(ts(x) for x in v) + ']'
    if isinstance(v, dict):
        return '{ ' + ', '.join('%s: %s' % (k, ts(x)) for k, x in v.items()) + ' }'
    return str(v)


def moves(repo):
    """Every move's name, contest category (0-4) and effect (0-23), by key."""
    out = {}
    for constant in lines(repo, 'moves.txt')[1:]:
        folder = os.path.join(repo, 'res', 'moves', constant[len('MOVE_'):].lower())
        if not os.path.exists(os.path.join(folder, 'data.json')):
            continue
        d = json.load(open(os.path.join(folder, 'data.json'), encoding='utf-8'))
        c = d['contest']
        out[key_of(constant, 'MOVE_')] = (d['name'], CATEGORIES.index(c['type'][len('CONTEST_TYPE_'):].lower()), EFFECTS.index(c['effect'][len('CONTEST_EFFECT_'):]))
    return out


def effect_points(repo):
    """Unk_020F568C's third field (the effect's base appeal), by effect."""
    src = open(os.path.join(repo, 'src', 'unk_02094EDC.c'), encoding='utf-8').read()
    src = src[src.index('Unk_020F568C[CONTEST_EFFECT_MAX] = {') + 40:]
    out = {}
    for name, body in re.findall(r'\[CONTEST_EFFECT_(\w+)\] = \{([^}]*)\}', src):
        fields = [f.strip() for f in body.split(',') if f.strip()]
        out[name] = int(fields[2], 0)
    return [out[e] for e in EFFECTS]


def ai_table(repo):
    src = open(os.path.join(repo, 'src', 'overlay017', 'ov17_02246ECC.c'), encoding='utf-8').read()
    body = src[src.index('Unk_ov17_02253C30[] = {'):]
    body = body[:body.index('};')]
    rows = []
    for a, b, c, d, w in re.findall(r'\{\s*(0x[0-9a-fA-F]+|\d+),\s*(0x[0-9a-fA-F]+|\d+),\s*(0x[0-9a-fA-F]+|\d+),\s*(0x[0-9a-fA-F]+|\d+),\s*\{([^}]*)\}', body):
        rows.append([int(a, 0), int(b, 0), int(c, 0), int(d, 0)] + [int(x.strip(), 0) for x in w.split(',')])
    assert len(rows) == 165, len(rows)
    return rows


def entrants(repo, species, move_keys):
    mem = narc(os.path.join(repo, 'res', 'prebuilt', 'contest', 'data', 'contest_data.narc'))
    names = text(repo, 'contest_opponent_names')
    out = []
    m0, m2 = mem[0], mem[2]
    for i in range(len(m0) // 0x30):
        r = m0[i * 0x30:(i + 1) * 0x30]
        mv = struct.unpack_from('<4H', r, 0xC)
        spc, nick, trainer = struct.unpack_from('<3H', r, 0x14)
        bf = struct.unpack_from('<H', r, 0x20)[0]
        dress = r[0x22]
        s = m2[dress * 0x54:(dress + 1) * 0x54]
        outfit = [[s[4 * k], s[4 * k + 1], s[4 * k + 2], struct.unpack('b', s[4 * k + 3:4 * k + 4])[0]] for k in range(s[0x50])]
        out.append({
            'rank': bf & 7,
            'categories': bf >> 3 & 31,
            'official': bf >> 8 & 1,
            'practice': bf >> 9 & 1,
            'postgame': bf >> 10 & 3,
            'gender': bf >> 12 & 3,
            'ai': bf >> 14 & 3,
            'species': spc,
            'speciesName': species[spc],
            'nickname': names[nick],
            'trainer': names[trainer],
            'moves': [move_keys[x] for x in mv],
            'condition': list(r[0x1A:0x20]),
            'fame': r[0x2E],
            'outfit': outfit,
            'backdrop': struct.unpack('b', s[0x52:0x53])[0],
        })
    themes = [list(m) for m in mem[3:15]]
    assert all(len(t) == 100 for t in themes)
    return out, themes


def english(d):
    """The English Pokédex block (`en`) somewhere in a species' data.json."""
    if isinstance(d, dict):
        if isinstance(d.get('en'), dict) and 'name' in d['en']:
            return d['en']
        for v in d.values():
            found = english(v)
            if found:
                return found
    return None


def species_names(repo):
    """Each species' name by National Dex number (its data.json's English name, the game's capitals made title case)."""
    out = {}
    for n, constant in enumerate(lines(repo, 'species.txt')):
        p = os.path.join(repo, 'res', 'pokemon', constant[len('SPECIES_'):].lower(), 'data.json')
        if n == 0 or not os.path.exists(p):
            continue
        name = english(json.load(open(p, encoding='utf-8')))['name']
        out[n] = ' '.join(w[:1] + w[1:].lower() for w in name.split(' '))
    return out


def jasc(path):
    rows = open(path).read().split('\n')[3:]
    return [tuple(int(x) for x in r.split()) for r in rows if r.strip()]


def indexed(png, colours, box=None):
    from PIL import Image
    im = Image.open(png)
    if box:
        im = im.crop(box)
    out = Image.new('RGBA', im.size)
    px, data = out.load(), im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            i = data[x, y]
            px[x, y] = (0, 0, 0, 0) if i % 16 == 0 else colours[i % 16] + (255,)
    return out


def sprites(repo, wanted):
    folder = os.path.join(PUBLIC, 'pokemon')
    os.makedirs(folder, exist_ok=True)
    constants = lines(repo, 'species.txt')
    for n in sorted(wanted):
        src = os.path.join(repo, 'res', 'pokemon', constants[n][len('SPECIES_'):].lower())
        front = os.path.join(src, 'male_front.png')
        indexed(front if os.path.exists(front) else os.path.join(src, 'female_front.png'), jasc(os.path.join(src, 'normal.pal')), (0, 0, 80, 80)).save(os.path.join(folder, '%d.png' % n))


def ribbons(repo):
    folder = os.path.join(PUBLIC, 'ribbons')
    os.makedirs(folder, exist_ok=True)
    src = os.path.join(repo, 'res', 'graphics', 'pokemon_summary_screen', 'ribbons')
    pal = jasc(os.path.join(src, 'ribbons.pal'))
    for r, name in enumerate(['sinnoh_contest', 'sinnoh_contest_great', 'sinnoh_contest_ultra', 'sinnoh_contest_master']):
        for c, category in enumerate(CATEGORIES):
            indexed(os.path.join(src, name + '.png'), pal[c * 16:(c + 1) * 16]).save(os.path.join(folder, '%s-%s.png' % (category, RANKS[r])))


def songs(repo):
    """Each song whole (up to 5 minutes), as a 64 kbps mono MP3 (lameenc): the dance songs run 1-2 minutes."""
    import lameenc
    sys.path.insert(0, HERE)
    import nds_render
    folder = os.path.join(PUBLIC, 'sounds')
    os.makedirs(folder, exist_ok=True)
    for seq in DANCE_SONGS + OTHER_SONGS:
        samples = nds_render.render(repo, seq, 300)
        enc = lameenc.Encoder()
        enc.set_bit_rate(64)
        enc.set_in_sample_rate(nds_render.RATE)
        enc.set_channels(1)
        enc.set_quality(2)
        pcm = b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 32767)))) for v in samples)
        open(os.path.join(folder, seq + '.mp3'), 'wb').write(enc.encode(pcm) + enc.flush())


def main(repo):
    mv = moves(repo)
    move_keys = ['none'] + [key_of(c, 'MOVE_') for c in lines(repo, 'moves.txt')[1:]]
    names = species_names(repo)
    npcs, themes = entrants(repo, names, move_keys)
    short = text(repo, 'contest_effects')
    # Unk_020F568C's short texts are messages 0-45, two per effect from FIRST_NEXT_TURN on (9 unused: BASIC has one line);
    # the long ones are 46 + effect - 1.
    effect_text = [['', '']] + [[short[2 * (e - 1)], short[2 * (e - 1) + 1]] for e in range(1, len(EFFECTS))]
    long_text = [''] + [short[46 + e - 1].replace('\n', ' ') for e in range(1, len(EFFECTS))]
    theme_names = [t[len('The '):] for t in text(repo, 'unk_0385')[7:19]]
    lines_out = [
        '// Generated by tools/extras/platinum_contest.py from the pret/pokeplatinum decompilation (res/moves/*/data.json, src/unk_02094EDC.c,',
        '// res/prebuilt/contest/data/contest_data.narc, src/overlay017/ov17_02246ECC.c, res/text/contest_*.json): Super Contest data as',
        "// Platinum has it. Don't edit by hand.",
        '',
        '/** Every move\'s name, contest category (CONTEST_CATEGORIES\' index) and contest effect (CONTEST_EFFECTS\' index), by key. */',
        'export const CONTEST_MOVES: Record<string, readonly [name: string, category: number, effect: number]> = {',
    ]
    for k, (n, c, e) in sorted(mv.items()):
        lines_out.append('  %s: [%s, %d, %d],' % (ts(k), ts(n), c, e))
    lines_out += ['};', '', '/** Each contest effect (CONTEST_EFFECT_*, in order): its name, its base appeal (tenths of a heart: 10 a heart) and its descriptions. */',
                  'export const CONTEST_EFFECTS: readonly { id: string; points: number; short: readonly [string, string]; text: string }[] = [']
    for i, (e, p) in enumerate(zip(EFFECTS, effect_points(repo))):
        lines_out.append('  { id: %s, points: %d, short: %s, text: %s },' % (ts(e), p, ts(effect_text[i]), ts(long_text[i])))
    lines_out += ['];', '', '/** The 12 Visual Competition themes ("The Shapely"…), by id. */', 'export const CONTEST_THEMES = %s as const;' % ts(theme_names), '',
                  '/** The 100 accessories\' names, by id (0-60 a Fashion Case holds up to 9 of, 61-99 one). */', 'export const ACCESSORIES = %s as const;' % ts(text(repo, 'contest_accessory_names')), '',
                  '/** The 18 backdrops\' names, by id. */', 'export const BACKDROPS = %s as const;' % ts(text(repo, 'contest_backdrop_names')), '',
                  '/** Each theme\'s points for every accessory (contest_data.narc members 3-14), by theme then accessory id. */', 'export const THEME_POINTS: readonly (readonly number[])[] = [']
    for t in themes:
        lines_out.append('  %s,' % ts(t))
    lines_out += ['];', '',
                  '/**',
                  ' * The CPU entrants (contest_data.narc member 0, with their dress set from member 2), in the archive\'s order: rank (0-3),',
                  ' * categories (a bit each, CONTEST_CATEGORIES\' order), the official and practice flags, the post-game gate (2 post-game only,',
                  ' * 3 a post-game special), gender, AI level (0-3), species (National Dex number), names, moves, conditions (Cool, Beauty,',
                  ' * Cute, Smart, Tough, Sheen), fame, outfit ([accessory, x, y, priority]) and backdrop.',
                  ' */',
                  'export const CONTEST_ENTRANTS: readonly ContestEntrantData[] = [']
    for n in npcs:
        lines_out.append('  %s,' % ts(n))
    lines_out += ['];', '', 'export interface ContestEntrantData {', '  rank: number;', '  categories: number;', '  official: number;', '  practice: number;', '  postgame: number;', '  gender: number;', '  ai: number;',
                  '  species: number;', '  speciesName: string;', '  nickname: string;', '  trainer: string;', '  moves: readonly string[];', '  condition: readonly number[];', '  fame: number;',
                  '  outfit: readonly (readonly [number, number, number, number])[];', '  backdrop: number;', '}', '',
                  '/** The CPU\'s acting table (Unk_ov17_02253C30): [position (1-4), condition, target (240 the contest\'s category, 241 a big move, else an effect), judge mode, weight at AI level 0, 1, 2, 3]. */',
                  'export const ACTING_AI: readonly (readonly number[])[] = [']
    for r in ai_table(repo):
        lines_out.append('  %s,' % ts(r))
    lines_out += ['];', '', '/** The species an entrant can be (CONTEST_ENTRANTS\'), with their names. */', 'export const ENTRANT_SPECIES: Record<number, string> = %s;' % ('{ ' + ', '.join('%d: %s' % (s, ts(names[s])) for s in sorted({n['species'] for n in npcs})) + ' }'), '']
    open(OUT_TS, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines_out))
    sprites(repo, set(range(1, 152)) | {n['species'] for n in npcs})
    ribbons(repo)
    songs(repo)


if __name__ == '__main__':
    main(sys.argv[1])
