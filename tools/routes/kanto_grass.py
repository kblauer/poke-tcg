"""Adds each Kanto route's tall grass (`grass` on its Route) to packages/campaign/src/kanto-routes.ts and routes.ts, from
FireRed's tile behaviours (MB_TALL_GRASS, as render_route.py finds them), so the route map can draw the people standing
in it half hidden, as the games do. Only the `grass` rows are written: the routes' other fields (and the user's fixes to
them) are left as they are. Each map is fetched and rendered (fetch_map.py, render_route.py) into <work>/; its size must be
the committed route's.

Usage: python kanto_grass.py [--work <dir>]   (needs pypng, as render_route.py does)"""
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, '..', '..', 'packages', 'campaign', 'src'))
# The routes with tall grass: their constant, FireRed map and file.
MAPS = {
    'ROUTE_2': ('Route2', 'routes.ts'),
    'ROUTE_4': ('Route4', 'kanto-routes.ts'),
    'ROUTE_5': ('Route5', 'kanto-routes.ts'),
    'ROUTE_6': ('Route6', 'kanto-routes.ts'),
    'ROUTE_8': ('Route8', 'kanto-routes.ts'),
    'ROUTE_17': ('Route17', 'kanto-routes.ts'),
    'ROUTE_20': ('Route20', 'kanto-routes.ts'),
}


def grass_rows(work, name):
    out = os.path.join(work, name)
    size = subprocess.run([sys.executable, os.path.join(HERE, 'fetch_map.py'), name, out], check=True, capture_output=True, text=True).stdout.split()[-2:]
    subprocess.run([sys.executable, os.path.join(HERE, 'render_route.py'), out, out + '.png', out + '.json', *size], check=True, capture_output=True)
    j = json.load(open(out + '.json'))
    return j['width'], j['height'], [''.join('g' if c else '.' for c in r) for r in j['grass']]


def set_grass(text, const, rows, width, height):
    """`text` with the route's `grass` (after its `walkable`) set to `rows`; none when it has no grass."""
    nl = '\r\n' if '\r\n' in text else '\n'
    start = text.index(f'export const {const}: Route = {{')
    end = text.index(f'{nl}}};', start)
    body = text[start:end]
    assert f'width: {width * 16},' in body and f'height: {height * 16},' in body, (const, 'size differs from FireRed map')
    body = re.sub(r'\r?\n  grass: \[\r?\n(?:    \'[^\']*\',\r?\n)*  \],', '', body)
    if any('g' in r for r in rows):
        walk_end = body.index(f'{nl}  ],', body.index('  walkable: [')) + len(f'{nl}  ],')
        block = f'{nl}  grass: [' + ''.join(f"{nl}    '{r}'," for r in rows) + f'{nl}  ],'
        body = body[:walk_end] + block + body[walk_end:]
    return text[:start] + body + text[end:]


def main():
    args = sys.argv[1:]
    work = args[args.index('--work') + 1] if '--work' in args else tempfile.mkdtemp(prefix='kanto_grass_')
    os.makedirs(work, exist_ok=True)
    for const, (name, file) in MAPS.items():
        path = os.path.join(SRC, file)
        w, h, rows = grass_rows(work, name)
        text = open(path, encoding='utf-8', newline='').read()
        open(path, 'w', encoding='utf-8', newline='').write(set_grass(text, const, rows, w, h))
        print(const, name, sum(r.count('g') for r in rows), 'grass tiles')


if __name__ == '__main__':
    main()
