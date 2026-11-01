"""Draws a Sinnoh run's maps for review, as the run screen's debug overlay shows them (RouteSprites' TileOverlay): every
tile's coordinates, red where it can't be walked on, green on tall grass, amber on a ledge (an arrow the way it's jumped),
the entrance (IN, green) and exit (OUT, blue) dashed, what's drawn over the people (the overhead) over them, its tiles
outlined in cyan, links (two tiles joined by a fade) in violet, each spot ringed in red
and numbered, and every encounter's figure on its spot (a trainer on the route's; the Gym Trainer and the leader at the
gym's stands, the Gym Guide and other people where they stand). The maps are the campaign's own (run-types.ts), dumped
with tsx, so the images show what the run screen uses.

Usage: python review_map.py <run type id> <out dir> [--scale 2]
Writes <out dir>/<run type id>-<n>-<map name>.png for each of the run's maps and its gym."""
import json, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PUBLIC = os.path.join(REPO, 'apps', 'web', 'public')
TILE = 16
# The figure drawn on a route's spots (a stand-in for whoever the encounter is: the Youngster), and its standing frame
# facing down (dp_sprites.py's strips: frame 0).
SPOT_SPRITE = 'boy2'
LEDGES = {'v': '↓', '^': '↑', '<': '←', '>': '→'}


def dump(run):
    """The run type's maps (its routes, then its gym) as JSON, from the campaign package."""
    code = f"import {{ runType }} from './src/index.ts'; const t = runType('{run}'); console.log(JSON.stringify([...(t.routes ?? []), ...(t.gym ? [t.gym] : [])]));"
    out = subprocess.run(['npx', 'tsx', '-e', code], cwd=os.path.join(REPO, 'packages', 'campaign'), capture_output=True, text=True, shell=os.name == 'nt', check=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def frame(name):
    """A dp sprite's standing frame facing down (its strip's first 32x32 frame), or a boss's own picture."""
    path = os.path.join(PUBLIC, 'overworld', 'dp', name + '.png')
    if os.path.exists(path):
        return Image.open(path).convert('RGBA').crop((0, 0, 32, 32))
    return Image.open(os.path.join(PUBLIC, 'trainers', name + '.png')).convert('RGBA')


def font(size):
    for f in ('arialbd.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw(route, out, scale, people):
    """One map with its overlay (people: [(sprite, tile)] standing on it)."""
    img = Image.open(os.path.join(PUBLIC, route['image'].lstrip('/'))).convert('RGBA')
    img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    s = TILE * scale
    over = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    rows, grass = route['walkable'], route.get('grass') or []
    small = font(max(7, 4 * scale))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            box = [x * s, y * s, (x + 1) * s - 1, (y + 1) * s - 1]
            fill = (245, 158, 11, 150) if c in LEDGES else (220, 38, 38, 100) if c not in '.~' else (34, 197, 94, 100) if y < len(grass) and grass[y][x] == 'g' else None
            if fill:
                d.rectangle(box, fill=fill)
            d.rectangle(box, outline=(15, 23, 42, 90))
            d.text((x * s + 1, y * s + 1), LEDGES[c] if c in LEDGES else f'{x},{y}', fill=(15, 23, 42, 255), font=small)
    for a, b in route.get('links') or []:
        for t in (a, b):
            d.rectangle([t['x'] * s, t['y'] * s, (t['x'] + 1) * s - 1, (t['y'] + 1) * s - 1], outline=(139, 92, 246, 255), width=2)
        d.line([(a['x'] + 0.5) * s, (a['y'] + 0.5) * s, (b['x'] + 0.5) * s, (b['y'] + 0.5) * s], fill=(139, 92, 246, 255), width=2)
    img = Image.alpha_composite(img, over)
    # The people, then the markers over them.
    for sprite, t in people:
        f = frame(sprite)
        f = f.resize((f.width * scale, f.height * scale), Image.NEAREST)
        img.alpha_composite(f, (round((t['x'] + 0.5) * s - f.width / 2), round((t['y'] + 1) * s - f.height)))
    d = ImageDraw.Draw(img)
    if route.get('overhead'):
        # What's drawn over the people (treetops, cave mouths), with its tiles outlined in cyan.
        over = Image.open(os.path.join(PUBLIC, route['overhead'].lstrip('/'))).convert('RGBA')
        img.alpha_composite(over.resize(img.size, Image.NEAREST))
        a = over.getchannel('A')
        for y in range(over.height // TILE):
            for x in range(over.width // TILE):
                if a.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE)).getbbox():
                    d.rectangle([x * s, y * s, (x + 1) * s - 1, (y + 1) * s - 1], outline=(34, 211, 238, 255), width=1)
    big = font(max(9, 6 * scale))
    for i, t in enumerate(route['spots']):
        d.rectangle([t['x'] * s, t['y'] * s, (t['x'] + 1) * s - 1, (t['y'] + 1) * s - 1], outline=(220, 38, 38, 255), width=2)
        d.text((t['x'] * s + 2, t['y'] * s + 1), str(i + 1), fill=(255, 255, 255, 255), font=big, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    for key, label, colour in (('entrance', 'IN', (34, 197, 94, 255)), ('exit', 'OUT', (59, 130, 246, 255))):
        t = route.get(key)
        if t:
            d.rectangle([t['x'] * s, t['y'] * s, (t['x'] + 1) * s - 1, (t['y'] + 1) * s - 1], outline=colour, width=3)
            d.text((t['x'] * s + 2, (t['y'] + 1) * s - 2 - big.size), label, fill=(255, 255, 255, 255), font=big, stroke_width=2, stroke_fill=colour)
    img.convert('RGB').save(out)


def main():
    args = sys.argv[1:]
    scale = 2
    if '--scale' in args:
        i = args.index('--scale'); scale = int(args[i + 1]); del args[i:i + 2]
    run, outdir = args
    os.makedirs(outdir, exist_ok=True)
    maps = dump(run)
    for n, route in enumerate(maps, 1):
        if route.get('stands'):
            # A gym: the Gym Trainer and the leader at their stands (the leader's own picture), the guide and others.
            boss = subprocess.run(['npx', 'tsx', '-e', f"import {{ runType }} from './src/index.ts'; console.log(runType('{run}').segments.at(-1)!.bosses.at(-1))"],
                                  cwd=os.path.join(REPO, 'packages', 'campaign'), capture_output=True, text=True, shell=os.name == 'nt', check=True).stdout.strip().splitlines()[-1]
            people = [(SPOT_SPRITE, route['stands'][0]), (boss, route['stands'][-1])] + [(p['sprite'].split('/')[-1], p['tile']) for p in route.get('npcs') or []]
        else:
            # Each spot's figure, with the player on the entrance and exit to show what's drawn over him there.
            people = [(SPOT_SPRITE, t) for t in route['spots']] + [('hero', route[k]) for k in ('entrance', 'exit') if route.get(k)]
        out = os.path.join(outdir, f"{run}-{n}-{re.sub(r'[^a-z0-9]+', '_', route['name'].lower()).strip('_')}.png")
        draw(route, out, scale, people)
        print(out)


if __name__ == '__main__':
    main()
