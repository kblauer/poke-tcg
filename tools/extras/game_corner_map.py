"""Makes the Game Corner page's map from a checkout of the pret/pokeemerald decompilation: Mauville City's Game Corner
(data/maps/MauvilleCity_GameCorner) as the game draws it (tools/routes/emerald/emerald_map.py, its people drawn apart, as
sprites):

- apps/web/public/extras/game-corner.png, the map;
- packages/campaign/src/game-corner-map.ts: its size, walkable tiles (its people block theirs), where the player comes in
  (the tile inside the door), the 12 slot machines (their tiles from the map's bg events, each played from the seat the
  game faces it from), the 2 roulette tables (their 6 tiles each, played from any walkable tile beside them), and the
  people (their sprites, tiles and facing, and what each says first, from the map's scripts): the coin clerk, the prize
  corner's clerks and the others.

Usage: python tools/extras/game_corner_map.py <pokeemerald checkout>
Needs Pillow; the people's sprites are tools/routes/emerald/emerald_sprites.py's (girl_2 and cook among them)."""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'routes', 'emerald'))
import emerald_map  # noqa: E402

PUBLIC = os.path.join(REPO, 'apps', 'web', 'public', 'extras')
CAMPAIGN = os.path.join(REPO, 'packages', 'campaign', 'src')
MAP = 'MauvilleCity_GameCorner'
PREFIX = 'MauvilleCity_GameCorner_EventScript_'
# A bg event's facing (the way the player faces it) and the step from the machine to where they stand.
SEAT = {'BG_EVENT_PLAYER_FACING_EAST': ('right', -1, 0), 'BG_EVENT_PLAYER_FACING_WEST': ('left', 1, 0)}
FACE = {'MOVEMENT_TYPE_FACE_DOWN': 'down', 'MOVEMENT_TYPE_FACE_UP': 'up', 'MOVEMENT_TYPE_FACE_LEFT': 'left', 'MOVEMENT_TYPE_FACE_RIGHT': 'right'}
# The people with a part to play on the page: the coin clerk sells coins; the prize corner's aren't open.
# The counter's texts: our key, the script's text label.
COUNTER = [('hello', 'ThisIsMauvilleGameCorner'), ('ask', 'WereYouLookingForCoins'), ('thanks', 'ThankYouHereAreYourCoins'), ('noMoney', 'DontHaveEnoughMoney'), ('full', 'CoinCaseIsFull'), ('cancel', 'DontNeedCoinsThen')]
ROLES = {'CoinsClerk': 'coins', 'PrizeCornerDolls': 'prizes', 'PrizeCornerTMs': 'prizes'}


def scripts(repo):
    """The map's scripts (label: its lines) and texts (label: its pages, each its lines; the game's ¥ the site's ₱)."""
    src = open(os.path.join(repo, 'data', 'maps', MAP, 'scripts.inc'), encoding='utf-8').read()
    blocks, label = {}, None
    for line in src.splitlines():
        m = re.match(r'^(\w+):{1,2}\s*$', line)
        if m:
            label = m.group(1)
            blocks[label] = []
        elif label:
            blocks[label].append(line.strip())
    texts = {}
    for name, lines in blocks.items():
        parts = [re.match(r'\.string "(.*)"', l).group(1) for l in lines if l.startswith('.string')]
        if parts:
            text = ''.join(parts).replace('\\l', '\\n').replace('$', '').replace('{PLAYER}', 'you').replace('¥', '₱')
            texts[name] = [page.split('\\n') for page in text.split('\\p')]
    return blocks, texts


def first_words(label, blocks, texts, seen=()):
    """What a script says first: its first msgbox or message, following its gotos, and its branches for a player who has
    a Coin Case (here everyone has) and has had what they're given once (a doll, 20 coins: none are given here)."""
    for line in blocks.get(label, []):
        m = re.match(r'(?:msgbox|message)\s+(\w+)', line)
        if m and m.group(1) in texts:
            return texts[m.group(1)]
        m = re.match(r'goto\s+(\w+)', line) or re.match(r'goto_if_eq\s+VAR_RESULT,\s*TRUE,\s*(\w+)', line) or re.match(r'goto_if_set\s+FLAG_RECEIVED_\w+,\s*(\w+)', line)
        if m and m.group(1) not in seen:
            return first_words(m.group(1), blocks, texts, (*seen, label))
    return None


def main():
    repo = sys.argv[1]
    im, info = emerald_map.render(repo, MAP)
    im.save(os.path.join(PUBLIC, 'game-corner.png'), optimize=True)
    rows, W, H = info['rows'], info['width'], info['height']
    walk = lambda x, y: 0 <= x < W and 0 <= y < H and rows[y][x] == '.'
    events = info['events']
    blocks, texts = scripts(repo)

    machines = []
    for b in events['bg_events']:
        m = re.match(PREFIX + r'SlotMachine(\d+)$', b['script'])
        if m:
            face, dx, dy = SEAT[b['player_facing_dir']]
            seat = (b['x'] + dx, b['y'] + dy)
            assert walk(*seat), ('every machine is played from a walkable seat', b)
            machines.append((int(m.group(1)), (b['x'], b['y']), seat, face))
    machines.sort()
    assert [m[0] for m in machines] == list(range(12))

    tables = []
    for n in (1, 2):
        tiles = sorted((b['x'], b['y']) for b in events['bg_events'] if b['script'] == 'Roulette_EventScript_Table%d' % n)
        stands = sorted({(x + dx, y + dy) for x, y in tiles for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)) if (x + dx, y + dy) not in tiles and walk(x + dx, y + dy)})
        assert len(tiles) == 6 and stands, n
        tables.append((tiles, stands))

    people = []
    for o in events['object_events']:
        script = o['script'].replace(PREFIX, '')
        role = ROLES.get(script, 'talk')
        # Talked to from the first walkable tile below them (across the counter for its clerks), or beside them.
        x, y = o['x'], o['y']
        below = next(((x, yy) for yy in range(y + 1, H) if walk(x, yy)), None)
        stands = [below] if role != 'talk' and below else [(x + dx, y + dy) for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)) if walk(x + dx, y + dy)]
        assert stands, o
        words = first_words(o['script'], blocks, texts)
        people.append({'sprite': o['graphics_id'].replace('OBJ_EVENT_GFX_', '').lower(), 'tile': (x, y), 'face': FACE[o['movement_type']], 'role': role, 'stands': stands, 'text': words})
        print(script, role, words)

    # The player comes in at the door (warps 11,10 and 12,10), on the tile inside it.
    door = min((w['x'], w['y']) for w in events['warp_events'])
    entrance = next((door[0], y) for y in range(door[1], -1, -1) if walk(door[0], y))
    # The door's tiles walkable for the player, who comes in on them.
    rows = [''.join('.' if (x, y) in {(w['x'], w['y']) for w in events['warp_events']} else c for x, c in enumerate(r)) for y, r in enumerate(rows)]

    spot = lambda t: '{ x: %d, y: %d }' % t
    q = lambda s: "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"
    pages = lambda ps: '[%s]' % ', '.join('[%s]' % ', '.join(map(q, page)) for page in ps)
    lines = [
        "// Generated by tools/extras/game_corner_map.py from the pret/pokeemerald decompilation (data/maps/MauvilleCity_GameCorner):",
        "// don't edit by hand.",
        '',
        "/** Which way someone faces on the map. */",
        "type Face = 'down' | 'up' | 'left' | 'right';",
        '',
        '/**',
        " * Mauville's Game Corner (apps/web/public/extras/game-corner.png): its size in 16px tiles, which tiles can be walked on",
        " * ('.'; its people stand on theirs), where the player comes in (the door), the 12 slot machines (each played from its",
        " * seat, facing it), the 2 roulette tables (the left one's bet 1 coin, the right one's 3; each played from any walkable",
        " * tile beside it), and its people: their sprites (public/overworld/rse/), tiles, facing and first words; the coin clerk",
        " * ('coins') sells coins, the prize corner's clerks ('prizes') are closed, the rest talk. Each is talked to from one of",
        " * its `stands` (across the counter for the clerks).",
        ' */',
        'export const GAME_CORNER_MAP = {',
        "  image: '/extras/game-corner.png',",
        '  width: %d,' % W,
        '  height: %d,' % H,
        '  entrance: %s,' % spot(entrance),
        '  door: %s,' % spot(door),
        '  machines: [',
        *["    { tile: %s, seat: %s, face: '%s' as Face }," % (spot(t), spot(s), f) for _, t, s, f in machines],
        '  ],',
        '  tables: [',
        *['    { tiles: [%s], stands: [%s] },' % (', '.join(map(spot, t)), ', '.join(map(spot, s))) for t, s in tables],
        '  ],',
        '  people: [',
        *["    { sprite: '%s', tile: %s, face: '%s' as Face, role: '%s' as 'coins' | 'prizes' | 'talk', stands: [%s], text: %s }," % (p['sprite'], spot(p['tile']), p['face'], p['role'], ', '.join(map(spot, p['stands'])), pages(p['text'])) for p in people],
        '  ],',
        "  /** The coin clerk's words (CoinsClerk's script) and the menu's offers (MULTI_GAME_CORNER_COINS: 50, 500, EXIT). */",
        '  counter: {',
        *['    %s: %s,' % (k, pages(texts['MauvilleCity_GameCorner_Text_' + label])) for k, label in COUNTER],
        "    offers: ['  50 COINS    ₱1,000', '500 COINS  ₱10,000', 'EXIT'],",
        '  },',
        '  walkable: [',
        *["    '%s'," % r for r in rows],
        '  ],',
        '};',
    ]
    open(os.path.join(CAMPAIGN, 'game-corner-map.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print('machines', len(machines), 'tables', len(tables), 'people', len(people), 'entrance', entrance)


if __name__ == '__main__':
    main()
