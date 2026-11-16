"""Reading Pokémon Black's data for the Unova route maps (issue #231), from a decompilation that keeps every ROM archive
packed (squiddonaut/pokeblack: `files/a/x/y/z`, NARCs; almost no C, so no constants): downloads (and caches in
<cache>/, by default <temp>/pokeblack) the archives the map, sprite and route tools need, and reads them:

- text (`a/0/0/2`): Gen 5's text files, each string encrypted on its own (decrypted from its end, the 0xFFFF terminator
  giving the key) and trainer names packed 9 bits a character (`{F100}`); place names, trainer names and classes, species;
- zones (`a/0/1/2`, one file of 48-byte headers): map type, outdoor building pack, area, matrix, a song per season, the
  events file, the outdoor zone an interior belongs to, the place name;
- matrices (`a/0/0/9`): a grid of land chunks (and, for the overworld, matrix 0, the zone of each cell);
- areas (`a/0/1/3`, one file of 10-byte entries): an area's map texture set (`a/0/1/4`); an outdoor area is four entries
  in a row, one a season (the zone's is spring's), marked by a 1 in byte 6 (caves and interiors: one entry, a 0 there);
- land chunks (`a/0/0/8`, 32x32 tiles a chunk, its model's origin its centre, 16 units a tile): `WB` model, permissions,
  buildings; `GC` model, two permission layers, buildings; `NG` model and buildings, no tile grid (the rail maps: Castelia
  City's streets, Skyarrow Bridge…); `RD` model, rails, buildings;
- building packs (`a/2/2/9` outdoors, `a/2/3/0` indoors; `AB`: each building's id and animation header, then its NSBMD),
  and their textures (`a/1/7/6`, `a/1/7/7`);
- zone events (`a/1/2/5`): furniture, people (a trainer's script is 3000 more than its trainer id), warps, triggers;
- trainers (`a/0/9/2`) and their parties (`a/0/9/3`).

Checked against the files (`python bw_data.py check`): place names, Striaton City (zone 6) and its gym (zone 7) with its
Waiter Maxwell and Waitress Tia, their parties, the seasons' areas, Striaton's buildings in outdoor pack 1. Still to confirm
while drawing the maps (step 4): which indoor pack an interior uses (the zone's pack byte is 16 for every interior, and the
area's first field is a candidate), building ids of 256 and over (packs list them; a building's word holds the id in its
high byte, `word` kept whole), the yaw's direction, warps' and people's units (warps look like sixteenths of a tile), the
permissions' height table, the behaviour values and `GC`'s second layer.

Archive numbers and text files are in one table per game (GAMES): Black's; Black 2's (nds197/pokeblack2) later, its
numbers moved. No dependencies but tools/extras/nitro.py (NARC, LZ10/LZ11)."""
import os, struct, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'extras'))
import nitro  # noqa: E402

GAMES = {
    'black': {
        'base': 'https://raw.githubusercontent.com/squiddonaut/pokeblack/HEAD/',
        'archives': {
            'text': 'files/a/0/0/2',
            'land': 'files/a/0/0/8',
            'matrix': 'files/a/0/0/9',
            'zones': 'files/a/0/1/2',
            'areas': 'files/a/0/1/3',
            'map_textures': 'files/a/0/1/4',
            'sprites': 'files/a/0/4/9',
            'trainers': 'files/a/0/9/2',
            'parties': 'files/a/0/9/3',
            'events': 'files/a/1/2/5',
            'outdoor_buildings': 'files/a/2/2/9',
            'outdoor_building_textures': 'files/a/1/7/6',
            'indoor_buildings': 'files/a/2/3/0',
            'indoor_building_textures': 'files/a/1/7/7',
            'sound': 'files/wb_sound_data.sdat',
        },
        # Text files (members of the text archive).
        'texts': {'species': 70, 'places': 89, 'trainer_names': 190, 'trainer_classes': 191},
    },
}

SEASONS = ('spring', 'summer', 'autumn', 'winter')
# A zone's map types seen: 0 a town or route on the overworld (matrix 0), others its own matrix.
OVERWORLD = 0
TILE = 16  # model units a tile
# Characters the text files use for "PKMN" (shown as one word in the games).
PKMN = '⒆⒇'


def default_cache(game='black'):
    return os.path.join(tempfile.gettempdir(), 'poke' + game)


def decode_text(data):
    """A Gen 5 text file's strings (its first section): `{F100}` strings unpacked from 9 bits a character, `\\n` for a
    line break, `{XXXX}` for a control character, a variable (0xF000, its command and arguments) as `{VAR XXXX}`, and
    the games' PKMN characters as "Pokémon"."""
    _sections, entries = struct.unpack_from('<HH', data, 0)
    section = struct.unpack_from('<I', data, 12)[0]
    out = []
    for i in range(entries):
        off, length, _ = struct.unpack_from('<IHH', data, section + 4 + 8 * i)
        chars = list(struct.unpack_from(f'<{length}H', data, section + off))
        key = chars[-1] ^ 0xFFFF
        for j in range(length - 1, -1, -1):
            chars[j] ^= key
            key = ((key >> 3) | (key << 13)) & 0xFFFF
        if chars and chars[0] == 0xF100:
            # Packed: 9 bits a character, low bits first, up to a 0x1FF (or the zero padding before the 0xFFFF).
            packed, chars, acc, bits, done = chars[1:-1], [], 0, 0, False
            for c in packed:
                acc |= c << bits
                bits += 16
                while bits >= 9 and not done:
                    ch, acc, bits = acc & 0x1FF, acc >> 9, bits - 9
                    done = ch in (0, 0x1FF)
                    if not done:
                        chars.append(ch)
            chars.append(0xFFFF)
        s, k = '', 0
        while k < len(chars) and chars[k] != 0xFFFF:
            c = chars[k]
            if c == 0xF000 and k + 2 < len(chars):
                s += '{VAR %04X}' % chars[k + 1]
                k += 3 + chars[k + 2]
                continue
            s += '\n' if c == 0xFFFE else ('{%04X}' % c if c >= 0xF000 else chr(c))
            k += 1
        out.append(s.replace(PKMN, 'Pokémon'))
    return out


class Game:
    """One game's archives, fetched once into `cache` and unpacked as they're asked for."""

    def __init__(self, cache=None, game='black'):
        self.game = GAMES[game]
        self.cache = cache or default_cache(game)
        self._narcs = {}
        self._texts = {}

    def fetch(self, path):
        """A file of the repository, downloaded once into the cache: its bytes."""
        local = os.path.join(self.cache, path.replace('/', os.sep))
        if not os.path.exists(local):
            os.makedirs(os.path.dirname(local), exist_ok=True)
            with urllib.request.urlopen(self.game['base'] + path) as r:
                data = r.read()
            open(local + '.part', 'wb').write(data)
            os.replace(local + '.part', local)
        return open(local, 'rb').read()

    def archive(self, name):
        """An archive's members (GAMES' `archives`), unpacked from their NARC (each member as it's stored)."""
        if name not in self._narcs:
            self._narcs[name] = nitro.narc(self.fetch(self.game['archives'][name]))
        return self._narcs[name]

    def member(self, name, n):
        """Archive member `n`, LZ-unpacked when it's packed."""
        return nitro.unpack(self.archive(name)[n])

    # Text.

    def text(self, which):
        """A text file's strings, by its name in GAMES' `texts` or its number."""
        n = self.game['texts'].get(which, which)
        if n not in self._texts:
            self._texts[n] = decode_text(self.member('text', n))
        return self._texts[n]

    # Zones, matrices, areas.

    def zones(self):
        """Every zone's header: id, map type, outdoor building `pack`, `area`, `matrix`, `music` (a song id a season,
        SEASONS' order), `events` (its events file), `parent` (the outdoor zone an interior belongs to; a town's own id for
        itself), `place` (its place name's index) and `name`."""
        data = self.member('zones', 0)
        places = self.text('places')
        out = []
        for z in range(len(data) // 48):
            e = data[48 * z:48 * z + 48]
            kind, pack, area, matrix = struct.unpack_from('<BBHH', e, 0)
            events, parent = struct.unpack_from('<HH', e, 22)
            out.append({'id': z, 'kind': kind, 'pack': pack, 'area': area, 'matrix': matrix, 'music': list(struct.unpack_from('<4H', e, 12)), 'events': events, 'parent': parent, 'place': e[26], 'name': places[e[26]]})
        return out

    def find_zones(self, name):
        """The zones of a place ("Striaton City": the town and every room in it), by its name."""
        return [z for z in self.zones() if z['name'] == name]

    def matrix(self, n):
        """A matrix: its width and height in chunks and its cells, row by row: each cell's land chunk (None: no chunk) and,
        for a matrix with zones (the overworld), its zone (None outside any)."""
        d = self.member('matrix', n)
        has_zones, w, h = struct.unpack_from('<IHH', d, 0)
        land = struct.unpack_from(f'<{w * h}I', d, 8)
        zones = struct.unpack_from(f'<{w * h}I', d, 8 + 4 * w * h) if has_zones else [0xFFFFFFFF] * (w * h)
        none = lambda v: None if v == 0xFFFFFFFF else v  # noqa: E731
        return w, h, [{'x': i % w, 'y': i // w, 'land': none(land[i]), 'zone': none(zones[i])} for i in range(w * h)]

    def zone_cells(self, zone):
        """The matrix cells a zone covers: the overworld's cells of its zone, or every cell of its own matrix."""
        z = self.zones()[zone]
        _w, _h, cells = self.matrix(z['matrix'])
        return [c for c in cells if c['land'] is not None and (z['matrix'] != 0 or c['zone'] == zone)]

    def area(self, n, season='spring'):
        """An area (a zone's `area`) in a season: its map texture set (`textures`), whether it has seasons (`outdoor`:
        byte 6 is 1, and its entries are spring's to winter's in a row, `n` spring's, byte 7's low two bits the season; caves
        and interiors have one entry and a 0 there), and its first field (`buildings`: a candidate for its building pack)."""
        table = self.fetch(self.game['archives']['areas'])
        seasonal = table[10 * n + 6] == 1
        if seasonal and season != 'spring':
            n += SEASONS.index(season)
        first, textures = struct.unpack_from('<HH', table, 10 * n)
        return {'id': n, 'textures': textures, 'outdoor': seasonal, 'buildings': first, 'season': season if seasonal else None}

    def map_textures(self, n):
        """A map texture set (NSBTX), by an area's `textures`."""
        return self.member('map_textures', n)

    # Land chunks and buildings.

    def land(self, n):
        """Land chunk `n`: its `kind` (WB, GC, NG, RD), terrain `model` (NSBMD), permission `layers` (each 32x32 tiles:
        permissions()), `rails` (RD's, raw) and `buildings` (buildings())."""
        d = self.member('land', n)
        kind = d[:2].decode()
        count = struct.unpack_from('<H', d, 2)[0]
        offsets = struct.unpack_from(f'<{count + 1}I', d, 4)
        sections = [d[offsets[i]:offsets[i + 1]] for i in range(count)]
        out = {'id': n, 'kind': kind, 'model': sections[0], 'layers': [], 'rails': None, 'buildings': buildings(sections[-1])}
        if kind == 'WB':
            out['layers'] = [permissions(sections[1])]
        elif kind == 'GC':
            out['layers'] = [permissions(sections[1]), permissions(sections[2])]
        elif kind == 'RD':
            out['rails'] = sections[1]
        return out

    def building_pack(self, n, outdoor=True):
        """A building pack: {building id: its model (NSBMD)} and each one's raw header (`headers`: animation info)."""
        d = self.member('outdoor_buildings' if outdoor else 'indoor_buildings', n)
        assert d[:2] == b'AB', d[:2]
        count = struct.unpack_from('<H', d, 2)[0]
        n_buildings = count // 2
        offsets = list(struct.unpack_from(f'<{count}I', d, 4)) + [len(d)]
        models, headers = {}, {}
        for k in range(n_buildings):
            bid = struct.unpack_from('<H', d, offsets[k])[0]
            headers[bid] = d[offsets[k]:offsets[k + 1]]
            models[bid] = d[offsets[n_buildings + k]:offsets[n_buildings + k + 1]]
        return {'models': models, 'headers': headers}

    def building_textures(self, n, outdoor=True):
        """A building pack's textures (NSBTX)."""
        return self.member('outdoor_building_textures' if outdoor else 'indoor_building_textures', n)

    # Events and trainers.

    def events(self, n):
        """A zone's events file (its header's `events`): `objects` (people: id, sprite, movement, type (1 a trainer), flag,
        script, facing, sight, x, z and, for a trainer, its `trainer` id), `warps` (target zone and warp, x, y, z, width,
        height; units to confirm) and the counts of furniture and triggers."""
        d = self.member('events', n)
        if len(d) < 8:  # a zone with no events (its file a stub)
            return {'objects': [], 'warps': [], 'furniture': 0, 'triggers': 0}
        _size, n_furniture, n_people, n_warps, n_triggers = struct.unpack_from('<I4B', d, 0)
        o = 8 + 20 * n_furniture
        objects = []
        trainers = len(self.archive('trainers'))
        for _ in range(n_people):
            f = struct.unpack_from('<18H', d, o)
            o += 36
            obj = {'id': f[0], 'sprite': f[1], 'movement': f[2], 'type': f[3], 'flag': f[4], 'script': f[5], 'face': f[6], 'sight': f[7], 'x': f[14], 'z': f[15]}
            # A trainer's script is 3000 more than its id (scripts of 7000 and 10000 up are others').
            if 3000 <= f[5] < 3000 + trainers:
                obj['trainer'] = f[5] - 3000
            objects.append(obj)
        warps = []
        for _ in range(n_warps):
            zone, warp, contact, coords, x, y, z, w, h = struct.unpack_from('<9H', d, o)
            o += 20
            warps.append({'zone': zone, 'warp': warp, 'contact': contact, 'coords': coords, 'x': x, 'y': y, 'z': z, 'width': w, 'height': h})
        return {'objects': objects, 'warps': warps, 'furniture': n_furniture, 'triggers': n_triggers}

    def trainer(self, n):
        """Trainer `n`: its name, class, label ("Waitress Tia"), battle type (0 single, 1 double, 2 triple, 3 rotation),
        prize multiplier and party (each Pokémon's species, level and, as its format has them, held item and moves)."""
        t = self.member('trainers', n)
        fmt, cls, battle, count = t[0], t[1], t[2], t[3]
        # The classes' ♂/♀ signs (the font's ⑭ and ⑮: "Clerk ⑮") left out of the label.
        name, cls_name = self.text('trainer_names')[n], ' '.join(self.text('trainer_classes')[cls].replace('⑭', '').replace('⑮', '').split())
        species = self.text('species')
        p = self.member('parties', n)
        size = 8 + (2 if fmt & 2 else 0) + (8 if fmt & 1 else 0)
        party = []
        for k in range(count):
            o = size * k
            _difficulty, _abilities, level, kind, _form = struct.unpack_from('<BBHHH', p, o)
            mon = {'species': species[kind], 'level': level}
            o += 8
            if fmt & 2:
                mon['item'] = struct.unpack_from('<H', p, o)[0]
                o += 2
            if fmt & 1:
                mon['moves'] = [m for m in struct.unpack_from('<4H', p, o) if m]
            party.append(mon)
        return {'id': n, 'name': name, 'class': cls_name, 'label': f'{cls_name} {name}', 'battle': battle, 'prize': t[17], 'party': party}

    def zone_trainers(self, zone):
        """The trainers of a zone's people (by their scripts), in the order its events list them."""
        ev = self.events(self.zones()[zone]['events'])
        return [dict(self.trainer(o['trainer']), x=o['x'], z=o['z']) for o in ev['objects'] if 'trainer' in o]


def permissions(data):
    """A permission layer: its width and height (32x32) and each tile's four fields, row by row: `a` and `b` (indices
    into the height table that follows the grid, to decode), `behaviour` (tall grass, water…) and `flags` (bit 0: blocked);
    `table` is the rest of the layer, raw."""
    w, h = struct.unpack_from('<HH', data, 0)
    tiles = [dict(zip(('a', 'b', 'behaviour', 'flags'), struct.unpack_from('<4H', data, 4 + 8 * i))) for i in range(w * h)]
    return {'width': w, 'height': h, 'tiles': tiles, 'table': data[4 + 8 * w * h:]}


def blocked(tile):
    return bool(tile['flags'] & 1)


def buildings(data):
    """A chunk's buildings: each one's position (x, y, z in model units from the chunk's centre, 16 a tile), yaw (degrees,
    its direction to confirm), id (the high byte of its `word`) and `word` whole."""
    count = struct.unpack_from('<I', data, 0)[0] if len(data) >= 4 else 0
    out = []
    for k in range(count):
        x, y, z, yaw, word = struct.unpack_from('<3iHH', data, 4 + 16 * k)
        out.append({'pos': (x / 4096, y / 4096, z / 4096), 'yaw': yaw * 360 / 65536, 'id': word >> 8, 'word': word})
    return out


def check(g):
    """What the reader was checked against: fails loudly if a format is misread."""
    places = g.text('places')
    assert places[6:14] == ['Striaton City', 'Nacrene City', 'Castelia City', 'Nimbasa City', 'Driftveil City', 'Mistralton City', 'Icirrus City', 'Opelucid City'], places[6:14]
    zones = g.zones()
    striaton = zones[6]
    assert (striaton['name'], striaton['matrix'], striaton['events']) == ('Striaton City', 0, 6), striaton
    gym = zones[7]
    assert (gym['name'], gym['parent'], gym['music'][0]) == ('Striaton City', 6, 1062), gym
    labels = [t['label'] for t in g.zone_trainers(7)]
    assert labels == ['Waiter Maxwell', 'Waitress Tia'], labels
    assert g.trainer(9)['party'] == [{'species': 'Lillipup', 'level': 11}], g.trainer(9)
    assert g.trainer(10)['party'] == [{'species': 'Patrat', 'level': 10}, {'species': 'Purrloin', 'level': 10}], g.trainer(10)
    chili = g.trainer(11)
    assert (chili['label'], [m['species'] for m in chili['party']]) == ('Leader Chili', ['Lillipup', 'Pansear']), chili
    # Driftveil Gym (zone 97, its own song): a Clerk's ♀ sign left out of her label; a zone with no events has none.
    assert 'Clerk Katie' in [t['label'] for t in g.zone_trainers(97)]
    seasons = [g.area(striaton['area'], s) for s in SEASONS]
    assert [a['textures'] for a in seasons] == [6, 7, 8, 9] and all(a['outdoor'] for a in seasons), seasons
    assert not g.area(gym['area'])['outdoor']
    # Cold Storage's (an interior with no 0xFFFF at +4): one entry, never another area's summer.
    assert g.area(220, 'summer') == {'id': 220, 'textures': 220, 'outdoor': False, 'buildings': 6, 'season': None}
    cells = g.zone_cells(6)
    assert sorted(c['land'] for c in cells) == [9, 10, 11], cells
    pack = g.building_pack(striaton['pack'])
    ids = {b['id'] for c in cells for b in g.land(c['land'])['buildings']}
    assert ids <= set(pack['models']), sorted(ids - set(pack['models']))
    chunk = g.land(cells[0]['land'])
    assert chunk['kind'] == 'WB' and chunk['model'][:4] == b'BMD0' and len(chunk['layers'][0]['tiles']) == 32 * 32
    print('bw_data: ok')


def main():
    """bw_data.py [--cache DIR] check | zones [NAME] | gyms | trainers ZONE | chunk LAND"""
    args = sys.argv[1:]
    cache = None
    if args[:1] == ['--cache']:
        cache, args = args[1], args[2:]
    g = Game(cache)
    cmd = args[0] if args else 'check'
    if cmd == 'check':
        check(g)
    elif cmd == 'zones':
        for z in g.zones():
            if len(args) < 2 or args[1].lower() in z['name'].lower():
                print(z['id'], z['name'], f"kind {z['kind']} matrix {z['matrix']} area {z['area']} pack {z['pack']} parent {z['parent']} music {z['music']}")
    elif cmd == 'gyms':
        # Each gym's trainers (unova-bosses.ts' `trainers`): the gyms play song 1062, but Driftveil's (zone 97).
        for z in g.zones():
            if z['music'][0] == 1062 or z['id'] == 97:
                print(z['id'], z['name'], [t['label'] for t in g.zone_trainers(z['id'])])
    elif cmd == 'trainers':
        for t in g.zone_trainers(int(args[1])):
            print(t['id'], t['label'], (t['x'], t['z']), ', '.join(f"{m['species']} {m['level']}" for m in t['party']))
    elif cmd == 'chunk':
        c = g.land(int(args[1]))
        print(c['kind'], 'buildings', [(b['id'], b['pos'], b['yaw']) for b in c['buildings']])
        for layer in c['layers']:
            tiles = layer['tiles']
            for y in range(layer['height']):
                print(' '.join('##' if blocked(t) else '%02x' % (t['behaviour'] & 0xFF) for t in tiles[y * layer['width']:(y + 1) * layer['width']]))
    else:
        sys.exit(main.__doc__)


if __name__ == '__main__':
    main()
