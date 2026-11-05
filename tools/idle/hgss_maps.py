"""Reads HeartGold/SoulSilver's maps for the Idle Adventure's Johto areas (README: Idle Adventure, Johto's maps; issue
#170, step 4a) from a checkout of the pret/pokeheartgold decompilation: for each map (a MAP_ constant), its header
(src/data/map_headers.h: wild table, matrix, music by day and night, map section, battle background, type), its tiles
from the land data's permissions (tools/routes/hgss/hgss_map.py's reading: walkable, water, ledges; tall grass, ice), its
place in its matrix (the outdoor maps share one, so a map's neighbours are the maps beside it there), and its events
(files/fielddata/eventdata/zone_event/*.json): trainers (object type 1, sight `param0`, the std_trainer script's
TRAINER_ constant, facing, whether their movement turns them; and the people whose own script battles them, as the Gym
Leaders and the League are, with no sight), the Cut trees, the Strength boulders (left out of the run:
the user's), item balls, warps (to which map) and the other people. Shared by johto_areas.py.

Usage (a look at one map): python tools/idle/hgss_maps.py <pokeheartgold checkout> --dump MAP_ROUTE_30"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'routes', 'hgss'))
import hgss_data as hd  # noqa: E402  (its fetch reads a checkout as its cache)

CHUNK = 32
# Tile behaviours (include/constants/metatile_behavior.h), as hgss_map.py reads them.
WATER = {16, 17, 19, 21}
LEDGES = {56: '>', 57: '<', 58: '^', 59: 'v'}
BLOCKED = set(range(60, 64)) | set(range(94, 112))
GRASS = {2, 3}
ICE = {32}
# Movement types that keep a person facing one way (14 up, 15 down, 16 left, 17 right, as Route 30's trainers show);
# the others turn them about (they look around: every way, as kanto_areas.py takes FireRed's).
FIXED_FACING = {14: 'up', 15: 'down', 16: 'left', 17: 'right'}
FACING = ['up', 'down', 'left', 'right']
BOULDER_SPRITES = {'SPRITE_ROCK', 'SPRITE_STRENGTH_ROCK', 'SPRITE_BOULDER'}
# People that are things in the way, never the story's (Mahogany Gym's ice blocks: no script).
OBSTACLE_SPRITES = {'SPRITE_ICE'}


def key(const, prefix):
    return const[len(prefix):].lower().replace('_', '-')


def trainer_key(const):
    """TRAINER_YOUNGSTER_JOEY -> 'youngster-joey'; a name the constant repeats once (TRAINER_LEADER_FALKNER_FALKNER) once
    only: 'leader-falkner', as hgss_data.py keys the trainers."""
    words = [w for w in key(const, 'TRAINER_').split('-') if w]
    tail = [words.pop()] if words[-1].isdigit() else []
    for n in range(len(words) // 2, 0, -1):
        if words[-n:] == words[-2 * n:-n]:
            words = words[:-n]
            break
    return '-'.join(words + tail)


class Johto:
    """The decompilation's maps, read once: their constants, codes, headers, matrices and events."""

    def __init__(self, src):
        self.src = os.path.abspath(src)
        text = self.read('include/constants/maps.h')
        self.ids = {}
        self.codes = {}
        for c, n, code in re.findall(r'#define\s+(MAP_\w+)\s+(\d+)\s*//\s*MAP_(\w+)', text):
            self.ids[c] = int(n)
            self.codes[c] = code
        self.by_id = {n: c for c, n in self.ids.items()}
        self.headers = {}
        for m in re.finditer(r'\[(MAP_\w+)\]\s*=\s*\{(.*?)\n\s*\},', self.read('src/data/map_headers.h'), re.S):
            fields = dict(re.findall(r'\.(\w+)\s*=\s*([^,\n]+),', m.group(2)))
            self.headers[m.group(1)] = fields
        self._matrices = {}
        self._land = None
        self._events = {}
        self._labels = {}

    def read(self, path):
        return open(os.path.join(self.src, path), encoding='utf8').read()

    def header(self, const):
        """A map's header: its wild table's code (ENCDATA_R29: 'R29'; none: None), matrix file, music by day and night, map section, battle background and type."""
        f = self.headers[const]
        enc = f.get('wildEncounterBank', 'ENCDATA_NONE')
        matrix = re.search(r'NARC_map_matrix_(\w+)_bin', f['matrixId']).group(1) + '.bin'
        return {
            'encounters': None if enc in ('ENCDATA_NONE', 'ENCDATA_NA', '0') else enc[len('ENCDATA_'):],
            'matrix': matrix,
            'dayMusic': f.get('dayMusicId', ''),
            'nightMusic': f.get('nightMusicId', ''),
            'mapsec': key(f.get('mapsec', 'MAPSEC_NONE'), 'MAPSEC_'),
            'battleBg': key(f.get('battleBg', 'BATTLE_BG_GENERAL'), 'BATTLE_BG_'),
            'type': f.get('mapType', ''),
            'events': re.search(r'NARC_zone_event_(\w+)_bin', f['eventsBank']).group(1),
        }

    def matrix(self, name):
        if name not in self._matrices:
            self._matrices[name] = hd.matrix(self.src, name)
        return self._matrices[name]

    def land(self):
        if self._land is None:
            self._land = hd.narc(os.path.join(self.src, hd.LAND_DATA))
        return self._land

    def cells(self, const):
        """The matrix cells a map covers (32x32 tiles each): a map with its own matrix covers all of it."""
        h = self.header(const)
        w, _, cells = self.matrix(h['matrix'])
        mine = [c for c in cells if c['header'] == self.ids[const]]
        if not mine:
            mine = [c for c in cells if c['header'] is None and c['land'] != 0xFFFF]
        return mine

    def tiles(self, const):
        """A map's tiles: its origin (the matrix tile of its top-left corner), size, and rows of walkable ('.'), blocked
        ('#'), water ('~') and ledge ('<>^v') tiles, with its tall grass ('g') and ice ('i') apart, and each tile's behaviour (`lo`)."""
        cells = self.cells(const)
        x0, y0 = min(c['x'] for c in cells), min(c['y'] for c in cells)
        cw, ch = max(c['x'] for c in cells) - x0 + 1, max(c['y'] for c in cells) - y0 + 1
        rows = [['#'] * (cw * CHUNK) for _ in range(ch * CHUNK)]
        grass = [['.'] * (cw * CHUNK) for _ in range(ch * CHUNK)]
        ice = [['.'] * (cw * CHUNK) for _ in range(ch * CHUNK)]
        lo_rows = [[0] * (cw * CHUNK) for _ in range(ch * CHUNK)]
        land = self.land()
        for c in cells:
            perm = hd.land_chunk(land[c['land']])['perm']
            ox, oz = (c['x'] - x0) * CHUNK, (c['y'] - y0) * CHUNK
            for ty in range(CHUNK):
                for tx in range(CHUNK):
                    lo, hi = perm[(ty * CHUNK + tx) * 2], perm[(ty * CHUNK + tx) * 2 + 1]
                    lo_rows[oz + ty][ox + tx] = lo
                    rows[oz + ty][ox + tx] = LEDGES.get(lo) or ('#' if lo in BLOCKED else '~' if lo in WATER else '#' if hi & 0x80 else '.')
                    if lo in GRASS:
                        grass[oz + ty][ox + tx] = 'g'
                    if lo in ICE:
                        ice[oz + ty][ox + tx] = 'i'
        return {'origin': (x0 * CHUNK, y0 * CHUNK), 'width': cw * CHUNK, 'height': ch * CHUNK, 'rows': [''.join(r) for r in rows], 'grass': [''.join(r) for r in grass], 'ice': [''.join(r) for r in ice], 'lo': lo_rows}

    def events(self, const):
        """A map's events, in its own tiles: trainers, Cut trees, Strength boulders, item balls, other people, warps."""
        name = self.header(const)['events']
        if name not in self._events:
            self._events[name] = json.loads(self.read(f'files/fielddata/eventdata/zone_event/{name}.json'))
        e = self._events[name]
        ox, oy = self.tiles_origin(const)
        out = {'trainers': [], 'trees': [], 'boulders': [], 'items': [], 'people': [], 'warps': []}
        for o in e.get('objects', []):
            x, y = o['x'] - ox, o['z'] - oy
            script = str(o['scriptId'])
            t = re.match(r'std_trainer\((TRAINER_\w+)\)', script)
            if o['type'] == 1 and t:
                face = FIXED_FACING.get(o['movement'], FACING[o['facingDirection'] % 4])
                time = self.time_flags(name.split('_', 1)[1]).get(o['eventFlag'])
                out['trainers'].append({'trainer': t.group(1), 'x': x, 'y': y, 'face': face, 'turns': o['movement'] not in FIXED_FACING, 'sight': o['param0'], 'sprite': o['spriteId'], 'flag': o['eventFlag'], **({'time': time} if time else {})})
            elif script == 'std_field_cut' or o['spriteId'] == 'SPRITE_TREE':
                out['trees'].append({'x': x, 'y': y})
            elif o['spriteId'] in BOULDER_SPRITES or 'strength' in script.lower():
                out['boulders'].append({'x': x, 'y': y, 'sprite': o['spriteId']})
            elif script.startswith('std_itemball') or o['spriteId'] == 'SPRITE_MONSTARBALL':
                out['items'].append({'x': x, 'y': y, 'script': script})
            else:
                # A person whose own script battles them (a Gym Leader, the League's): their trainer.
                label = self.label_of(script)
                # They see nobody (sight 0): the player walks up to them.
                battle = label and self.battles(name.split('_', 1)[1]).get(label)
                if battle:
                    face = FIXED_FACING.get(o['movement'], FACING[o['facingDirection'] % 4])
                    out['trainers'].append({'trainer': battle, 'x': x, 'y': y, 'face': face, 'turns': o['movement'] not in FIXED_FACING, 'sight': 0, 'sprite': o['spriteId'], 'flag': o['eventFlag'], 'talk': True})
                else:
                    # A story person (shown only for a scene, a flag hiding them; or one with no script) is `story`.
                    story = (str(o['eventFlag']).startswith('FLAG_HIDE_') or script == '0') and o['spriteId'] not in OBSTACLE_SPRITES
                    out['people'].append({'x': x, 'y': y, 'sprite': o['spriteId'], 'script': script, 'movement': o['movement'], 'face': FACING[o['facingDirection'] % 4], **({'story': True} if story else {})})
        for w in e.get('warps', []):
            out['warps'].append({'x': w['x'] - ox, 'y': w['z'] - oy, 'to': w['header'], 'anchor': w['anchor']})
        return out

    def labels(self, code):
        """Each script's text in a map's script file (scr_seq_<n>_<code>.s; a script runs on through its local labels to
        the next scr_seq_ one): {script label: its lines}."""
        if code not in self._labels:
            folder = os.path.join(self.src, 'files', 'fielddata', 'script', 'scr_seq')
            out = {}
            f = next((f for f in os.listdir(folder) if re.match(r'scr_seq_\d+_' + code + r'\.s$', f)), None)
            label = None
            for line in (open(os.path.join(folder, f), encoding='utf8').read().splitlines() if f else []):
                m = re.match(r'^(scr_seq_\w+):', line)
                if m:
                    label = m.group(1)
                elif label:
                    out.setdefault(label, []).append(line)
            self._labels[code] = out
        return self._labels[code]

    def battles(self, code):
        """Each script's TrainerBattle (labels): {script label: TRAINER_}, the first battle not a rematch (no _2 after it:
        the Elite Four's rematch teams) where there are several."""
        out = {}
        for k, lines in self.labels(code).items():
            found = [m.group(1) for m in (re.search(r'TrainerBattle\s+(TRAINER_\w+)', l) for l in lines) if m]
            if found:
                out[k] = next((t for t in found if not re.search(r'_\d+$', t)), found[0])
        return out

    def time_flags(self, code):
        """The people a map's scripts show only at night or only by day (the user's: Policemen Keith and Dirk only at
        night): after a time-of-day check (ScrCmd_379, Field_GetTimeOfDay) jumping on 3 or 4 (RTC_TIMEOFDAY_NITE, _LATE),
        a flag cleared where it jumps to is shown at night, one cleared where it goes on by day: {flag: 'night' or 'day'}."""
        folder = os.path.join(self.src, 'files', 'fielddata', 'script', 'scr_seq')
        f = next((f for f in os.listdir(folder) if re.match(r'scr_seq_\d+_' + code + r'\.s$', f)), None)
        lines = open(os.path.join(folder, f), encoding='utf8').read().splitlines() if f else []
        out = {}
        for i, line in enumerate(lines):
            m = re.match(r'\s*ScrCmd_379\s+(\w+)', line)
            if not m:
                continue
            var, j, night = m.group(1), i + 1, set()
            while j + 1 < len(lines) and re.match(r'\s*Compare\s+' + var + r',\s*[34]\s*$', lines[j]):
                g = re.match(r'\s*GoToIfEq\s+(\w+)', lines[j + 1])
                if not g:
                    break
                night.add(g.group(1))
                j += 2
            if not night:
                continue

            def cleared(k, when):
                while k < len(lines) and not re.match(r'\s*(End|GoTo|Return)\b', lines[k]):
                    c = re.match(r'\s*ClearFlag\s+(\w+)', lines[k])
                    if c:
                        out.setdefault(c.group(1), when)
                    k += 1
            cleared(j, 'day')
            for label in night:
                at = next((k for k, l in enumerate(lines) if l.startswith(label + ':')), None)
                if at is not None:
                    cleared(at + 1, 'night')
        return out

    @staticmethod
    def label_of(script):
        """A person's script's label ('_EV_scr_seq_T21FS0101_000 + 1': 'scr_seq_T21FS0101_000'), or None."""
        m = re.match(r'_EV_(scr_seq_\w+?_\d+)', script)
        return m and m.group(1)

    def tiles_origin(self, const):
        cells = self.cells(const)
        return min(c['x'] for c in cells) * CHUNK, min(c['y'] for c in cells) * CHUNK

    def neighbours(self, const):
        """The maps beside a map in its matrix (the outdoor maps' connections): {neighbour: the side it's on}."""
        h = self.header(const)
        w, hh, cells = self.matrix(h['matrix'])
        mine = {(c['x'], c['y']) for c in self.cells(const)}
        at = {(c['x'], c['y']): c['header'] for c in cells}
        out = {}
        for (x, y) in mine:
            for side, (dx, dy) in {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}.items():
                other = at.get((x + dx, y + dy))
                if other is not None and other != self.ids[const] and other in self.by_id and self.by_id[other] != 'MAP_EVERYWHERE':
                    out.setdefault(self.by_id[other], side)
        return out


def main():
    args = sys.argv[1:]
    j = Johto(args[0])
    if '--dump' in args:
        const = args[args.index('--dump') + 1]
        t = j.tiles(const)
        e = j.events(const)
        print(const, j.codes[const], j.header(const))
        print('size', t['width'], 'x', t['height'], 'origin', t['origin'], 'neighbours', j.neighbours(const))
        for k, v in e.items():
            print(k, len(v), v[:6])
        for y, row in enumerate(t['rows']):
            marks = list(row)
            for x, g in enumerate(t['grass'][y]):
                if g == 'g' and marks[x] == '.':
                    marks[x] = ','
            for tr in e['trainers']:
                if tr['y'] == y and 0 <= tr['x'] < len(marks):
                    marks[tr['x']] = 'T'
            print(''.join(marks))


if __name__ == '__main__':
    main()
