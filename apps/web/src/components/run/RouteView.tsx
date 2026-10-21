import GridOnIcon from '@mui/icons-material/GridOn';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { flowAt, isBattleKind, isBossKind, onPath, onWater, routePath, type BossId, type EncounterKind, type MapEncounter, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { RunViewData } from '../../hooks/useRun';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { bobFrame, bobs, BOB_MS, encounterSprite, isItemBall, mirrored, playerSprite, spriteWidth, standFrame, STEP_MS, stripFrames, swims, trainerSprite, walkFrame, WALK_FRAME_MS, waterSprite, type Facing, type SpriteSet } from '../../utils/overworld';
import { ENCOUNTER_STYLE } from './encounterIcons';

/**
 * The players' sprites (Red's and Ethan's, walking, on a bike, surfing) and the swimmers' in-water ones, fetched as soon as
 * the app loads, so a switch between them (stepping off the water onto land) never shows him blank while one loads. The
 * images are kept so the browser keeps them decoded.
 */
const PRELOADED =
  typeof window === 'undefined'
    ? []
    : ['red', 'red_bike', 'red_surf', 'swimmer_m_water', 'swimmer_f_water', 'hgss/hero', 'hgss/cyclehero', 'hgss/swimhero'].map((name) => Object.assign(new Image(), { src: `/overworld/${name}.png` }));
void PRELOADED;

/** How much the route's pixel map is enlarged in the view (2×: 16px tiles show 32px). */
const ZOOM = 2;

/** localStorage key for the view's height, which its bottom edge can be dragged to change; and its default and least, in px. */
const HEIGHT_KEY = 'poke-tcg.route-map';
const DEFAULT_HEIGHT = 448;
const MIN_HEIGHT = 200;

function loadHeight(): number {
  try {
    const saved = Number(JSON.parse(localStorage.getItem(HEIGHT_KEY) ?? 'null')?.height);
    return saved >= MIN_HEIGHT ? saved : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

function saveHeight(height: number) {
  try {
    localStorage.setItem(HEIGHT_KEY, JSON.stringify({ height }));
  } catch {
    // Not remembered; the view opens at its default height next time.
  }
}

/**
 * Someone (or something) to show near a spot, for one of its step's options or the encounter under way: a boss's own
 * sprite (`public/trainers/`), or an overworld sprite (a trainer's class, trainerSprite; a shop's clerk, encounterSprite…).
 * `title` names them on hover; `bubble`, for a non-battle encounter, is its kind, shown in a speech bubble above them.
 */
interface RouteFigure {
  title: string;
  sprite?: string;
  boss?: BossId;
  bubble?: EncounterKind;
  /** The step option it stands for (the current step's), to find a spotted trainer by. */
  option?: number;
}

/** The sprites a map uses: HGSS's on the Johto maps (`sprites: 'hgss'`), FireRed's on the others. */
const setOf = (route: Route): SpriteSet => route.sprites ?? 'frlg';

/** An option's figure: its trainer (a boss's own sprite), or the non-battle encounter's (null if it has none). */
function optionFigure(o: MapEncounter, set: SpriteSet): RouteFigure | null {
  if (isBattleKind(o.kind)) return o.trainer ? { title: o.trainer, ...(isBossKind(o.kind) && o.boss ? { boss: o.boss } : { sprite: trainerSprite(o.trainer, set) }) } : null;
  const sprite = encounterSprite(o.kind, o.event?.id, set);
  return sprite ? { title: o.label, sprite, bubble: o.kind } : null;
}

/** The figure of the encounter under way: its trainer, or whoever runs it (the shop's clerk, the event's character…). */
function encounterFigure(view: RunViewData, set: SpriteSet): RouteFigure | null {
  const e = view.encounter;
  if (!e || e.kind === 'reward') return null;
  if ('trainer' in e && isBattleKind(e.kind)) return { title: e.trainer, ...(isBossKind(e.kind) && 'boss' in e && e.boss ? { boss: e.boss } : { sprite: trainerSprite(e.trainer, set) }) };
  const sprite = encounterSprite(e.kind, e.kind === 'event' ? e.event.id : undefined, set);
  return sprite ? { title: view.event?.title ?? e.kind, sprite, bubble: e.kind } : null;
}

const key = (t: RouteSpot) => `${t.x},${t.y}`;

/**
 * Walkable tiles near a spot for its figures to stand on: beside it, across the way the route's encounters go (its `flow`:
 * left and right on an up or down map, above and below on a left or right one), wherever they can, then in line ahead of
 * it (the flow's way), in line behind, and only then off the lines; apart from each
 * other, and off the tiles already taken (`taken`: the spots, and other spots' figures). Each way, 2 tiles away is best;
 * where that tile can't be walked on, the one next to the spot, and only once no way has either, 3 tiles away (agreed
 * with the user).
 */
function nearbyTiles(route: Route, index: number, wet: boolean[], taken: Set<string>): RouteSpot[] {
  const spot = route.spots[index]!;
  const tiles: (RouteSpot & { score: number; water: boolean })[] = [];
  const flow = flowAt(route, index);
  const across = flow === 'left' || flow === 'right';
  const ahead = flow === 'down' || flow === 'right' ? 1 : -1;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const distance = Math.abs(dx) + Math.abs(dy);
      const tile = { x: spot.x + dx, y: spot.y + dy };
      if (distance < 1 || !onPath(route, tile) || taken.has(key(tile))) continue;
      // Along the flow and across it (on a left or right map, x is along).
      const along = across ? dx : dy;
      const side = across ? dy : dx;
      // Beside first, then ahead, behind, and off the lines (ahead before behind): each group before the next, 2 tiles away
      // before 1; 3 tiles away after every group's nearer tiles.
      const group = along === 0 ? 0 : side === 0 ? (Math.sign(along) === ahead ? 1 : 2) : Math.sign(along) === ahead ? 3 : 4;
      tiles.push({ ...tile, score: group * 10 + (distance === 2 ? 0 : distance === 1 ? 1 : 100), water: onWater(route, tile) });
    }
  }
  // Each figure in turn: the best tile apart from the others', on water for a swimmer (`wet`) and on land for anyone else
  // where there is one (on a surfed route: Swimmers in the water, everyone else on land).
  const picked: RouteSpot[] = [];
  tiles.sort((a, b) => a.score - b.score);
  for (const swims of wet) {
    const free = tiles.filter((t) => !picked.some((p) => Math.abs(p.x - t.x) + Math.abs(p.y - t.y) < 2));
    const t = free.find((t) => t.water === swims) ?? (swims ? free[0] : undefined);
    if (t) picked.push({ x: t.x, y: t.y });
    // Anyone who can't swim (no swimming sprite: every non-battle encounter's NPC, a trainer on land) always stands on land:
    // with none near, the nearest land tile farther off.
    else if (!swims && route.travel === 'surf') {
      const land = nearestLand(route, spot, (l) => !taken.has(key(l)) && !picked.some((p) => Math.abs(p.x - l.x) + Math.abs(p.y - l.y) < 2));
      if (land) picked.push(land);
    }
  }
  return picked;
}

/** The nearest walkable land tile to a spot (within 12 tiles) that `ok` accepts, for a figure that can't stand in water. */
function nearestLand(route: Route, spot: RouteSpot, ok: (t: RouteSpot) => boolean): RouteSpot | undefined {
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (const dx of [-(r - Math.abs(dy)), r - Math.abs(dy)]) {
        const t = { x: spot.x + dx, y: spot.y + dy };
        if (route.walkable[t.y]?.[t.x] === '.' && ok(t)) return t;
      }
    }
  }
  return undefined;
}

/** localStorage key for the walk speed (the speed button): 1×, 2× or 3×, every walk, fade and glide that much faster. */
const SPEED_KEY = 'poke-tcg.route-speed';
const SPEEDS = [1, 2, 3] as const;

function loadSpeed(): number {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

function saveSpeed(speed: number) {
  try {
    localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // Not remembered; the walks start at 1× next time.
  }
}

/** localStorage key for the phone's map lock (the lock button), on until it's turned off (agreed): while it's on, the map doesn't pan, so a swipe over it scrolls the page. */
const LOCK_KEY = 'poke-tcg.route-lock';

function loadLocked(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveLocked(locked: boolean) {
  try {
    localStorage.setItem(LOCK_KEY, locked ? '1' : '0');
  } catch {
    // Not remembered; the map starts locked next time.
  }
}

/** How much faster than walking the player gets along a map: twice as fast on a bike (Route 17, agreed with the user). */
const pace = (route: Route) => (route.travel === 'bike' ? 2 : 1);

/** The longest walk between spots, in tiles; farther (or with no path), the player fades out and back in instead. */
const MAX_WALK = 40;
/** How long the player takes to fade out, or back in; and the view's glide while he's out (through a gatehouse). */
const FADE_MS = 300;
const THROUGH_MS = 500;

/** The route's walkable areas: each walkable tile's area number (from 1), tiles joined 4 ways; 0 for others. */
function walkableAreas(route: Route): number[][] {
  const areas = route.walkable.map((row) => [...row].map(() => 0));
  let next = 0;
  route.walkable.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (!onPath(route, { x, y }) || areas[y]![x]) return;
      next++;
      const queue: RouteSpot[] = [{ x, y }];
      areas[y]![x] = next;
      while (queue.length) {
        const t = queue.shift()!;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const n = { x: t.x + dx, y: t.y + dy };
          if (!onPath(route, n) || areas[n.y]![n.x]) continue;
          areas[n.y]![n.x] = next;
          queue.push(n);
        }
      }
    }),
  );
  return areas;
}

/**
 * Debug (the Show tiles button, debug builds only; also the entrance, IN, and exit, OUT, dashed): a grid over the map with every tile's x,y (hovering one tells its
 * walkable area: tiles joined 4 ways; a walk can't cross between areas), the tiles that can't be walked on red, and each spot outlined with its number,
 * to tell where walking connections should be.
 */
function TileOverlay({ route }: { route: Route }) {
  const areas = walkableAreas(route);
  return (
    <div className="pointer-events-auto absolute inset-0 select-none" style={{ zIndex: 2000 }}>
      {areas.flatMap((row, y) =>
        row.map((area, x) => (
          <div
            key={`${x},${y}`}
            title={`${x},${y}${area ? ` · walkable area ${area}` : ' · not walkable'}`}
            className="absolute flex items-center justify-center font-mono leading-none"
            style={{
              left: x * 16,
              top: y * 16,
              width: 16,
              height: 16,
              fontSize: 4.5,
              boxShadow: 'inset 0 0 0 0.25px rgba(15,23,42,0.6)',
              background: area ? undefined : 'rgba(220,38,38,0.4)',
              color: '#0f172a',
            }}
          >
            {x},{y}
          </div>
        )),
      )}
      {route.spots.map((s, i) => (
        <div
          key={i}
          className="absolute flex items-start justify-start font-bold leading-none text-white"
          style={{ left: s.x * 16, top: s.y * 16, width: 16, height: 16, boxShadow: 'inset 0 0 0 1px #dc2626', fontSize: 5, textShadow: '0 0 1px #000' }}
        >
          {i + 1}
        </div>
      ))}
      {/* The spots the map's other version uses (a gym's Gym Trainer spot, on its leader-only version): dotted orange, G1… */}
      {route.otherSpots?.map((s, i) => (
        <div
          key={`other${i}`}
          title={`The gym run's encounter ${i + 1} (${s.x},${s.y})`}
          className="absolute flex items-start justify-start font-bold leading-none text-white"
          style={{ left: s.x * 16, top: s.y * 16, width: 16, height: 16, outline: '1px dotted #f97316', outlineOffset: -1, fontSize: 5, textShadow: '0 0 1px #000' }}
        >
          G{i + 1}
        </div>
      ))}
      {/* Where the player comes in (IN) and leaves (OUT): a dashed outline, apart from the spots' solid red one. */}
      {[
        { tile: route.entrance, label: 'IN', colour: '#22c55e' },
        { tile: route.exit, label: 'OUT', colour: '#3b82f6' },
      ].map(({ tile, label, colour }) =>
        tile ? (
          <div
            key={label}
            title={`${label === 'IN' ? 'Entrance' : 'Exit'} ${tile.x},${tile.y}`}
            className="absolute flex items-end justify-center font-bold leading-none text-white"
            style={{ left: tile.x * 16, top: tile.y * 16, width: 16, height: 16, outline: `1px dashed ${colour}`, outlineOffset: -1, background: `${colour}55`, fontSize: 5, textShadow: '0 0 1px #000' }}
          >
            {label}
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * FireRed's "!" balloon over a figure's head (`public/overworld/exclamation.png`, from the decompilation's emoticons): it
 * pops open over three frames, as when a trainer spots you, and stays.
 */
function Exclamation({ tile }: { tile: RouteSpot }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timers = [window.setTimeout(() => setFrame(1), 70), window.setTimeout(() => setFrame(2), 140)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  return (
    <div
      className="pointer-events-none absolute [image-rendering:pixelated]"
      style={{
        left: tile.x * 16,
        // Just over the head (the sprite's top is 16px above its tile), touching it as in the games.
        top: tile.y * 16 - 28,
        width: 16,
        height: 16,
        backgroundImage: 'url(/overworld/exclamation.png)',
        backgroundSize: '48px 16px',
        backgroundPosition: `${-frame * 16}px 0`,
        zIndex: 1500,
      }}
    />
  );
}

/** Which way someone at `from` faces to look at `to`. */
function facing(from: RouteSpot, to: RouteSpot): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * A FireRed overworld sprite standing on a tile (its feet on the tile, its head on the one above), facing a way, in map
 * pixels; lower on the map is in front, as in the game. `frame` shows another frame of its strip (a walking one), `moveMs`
 * slides it to a new tile over that long (a step), and `hidden` fades it out.
 */
function OverworldSprite({
  name,
  tile,
  face,
  title,
  faded,
  walkTick,
  bob = false,
  moveMs = 0,
  fadeMs = FADE_MS,
  hidden = false,
}: {
  name: string;
  tile: RouteSpot;
  face: Facing;
  title?: string;
  faded?: boolean;
  /** While walking: how far into its walk cycle it is (walkFrame). */
  walkTick?: number;
  /** Standing still: in the low half of its bob (a sprite that bobs, bobFrame). */
  bob?: boolean;
  moveMs?: number;
  fadeMs?: number;
  hidden?: boolean;
}) {
  const w = spriteWidth(name);
  const frame = walkTick !== undefined ? walkFrame(name, face, walkTick) : bob && bobs(name) ? bobFrame(name, face) : standFrame(name, face);
  return (
    <div
      title={title}
      className={`absolute [image-rendering:pixelated] ${faded ? 'opacity-50' : ''}`}
      style={{
        transition: `left ${moveMs}ms linear, top ${moveMs}ms linear, opacity ${fadeMs}ms`,
        opacity: hidden ? 0 : undefined,
        left: tile.x * 16 + 8 - w / 2,
        top: tile.y * 16 - 16,
        width: w,
        height: 32,
        backgroundImage: `url(/overworld/${name}.png)`,
        backgroundSize: `${w * stripFrames(name)}px 32px`,
        backgroundPosition: `${-frame * w}px 0`,
        transform: mirrored(name, face) ? 'scaleX(-1)' : undefined,
        zIndex: tile.y,
      }}
    />
  );
}

/**
 * A speech bubble over a figure's head with its encounter's icon (ENCOUNTER_STYLE, as in the encounter panels), in map
 * pixels: a white bubble with a tail, the icon on the encounter's colour. Over every sprite; `low` over a sprite one tile tall (the item ball).
 */
function EncounterBubble({ kind, tile, faded, low, below, moveMs = 0 }: { kind: EncounterKind; tile: RouteSpot; faded?: boolean; low?: boolean; below?: boolean; moveMs?: number }) {
  const { Icon, color, name } = ENCOUNTER_STYLE[kind];
  const bubble = (
    <div className="flex h-[13px] w-[15px] items-center justify-center rounded-[4px] bg-white shadow ring-[0.5px] ring-slate-900">
      <span className={`${color} flex h-[10px] w-[10px] items-center justify-center rounded-full text-white`}>
        <Icon sx={{ fontSize: 7 }} />
      </span>
    </div>
  );
  return (
    <div
      className={`pointer-events-none absolute -translate-x-1/2 ${faded ? 'opacity-50' : ''}`}
      // Above the figure's head; or `below` its feet (a figure standing below the player's spot, whose bubble would cover him).
      style={{ left: tile.x * 16 + 8, top: below ? tile.y * 16 + 16 : tile.y * 16 - (low ? 15 : 31), zIndex: 900 + tile.y, transition: `left ${moveMs}ms linear, top ${moveMs}ms linear` }}
      title={name}
    >
      {below ? (
        <>
          {/* The tail, pointing up at the figure. */}
          <div className="relative mx-auto h-0 w-0 border-x-[3px] border-b-[3.5px] border-x-transparent border-b-slate-900">
            <div className="absolute -left-[2.2px] top-[1.5px] h-0 w-0 border-x-[2.2px] border-b-[2.7px] border-x-transparent border-b-white" />
          </div>
          {bubble}
        </>
      ) : (
        <>
          {bubble}
          {/* The tail, pointing down at the figure: a black triangle with a white one inside, overlapping the bubble's edge so they join. */}
          <div className="relative mx-auto h-0 w-0 border-x-[3px] border-t-[3.5px] border-x-transparent border-t-slate-900">
            <div className="absolute -left-[2.2px] -top-[4.2px] h-0 w-0 border-x-[2.2px] border-t-[2.7px] border-x-transparent border-t-white" />
          </div>
        </>
      )}
    </div>
  );
}

/** A figure on its tile, facing its spot: a boss's own sprite (a single front-facing frame) or an overworld sprite, with its bubble for a non-battle encounter. */
function Figure({
  figure,
  tile,
  spot,
  faded,
  face,
  walkTick,
  moveMs,
  wet,
}: {
  figure: RouteFigure;
  tile: RouteSpot;
  spot: RouteSpot;
  faded?: boolean;
  /** Standing in water: a swimmer shows swimming (waterSprite). */
  wet?: boolean;
  /** While walking (an NPC coming up to the player): the way it's going, its walking frame and its step's time. */
  face?: Facing;
  walkTick?: number;
  moveMs?: number;
}) {
  if (!figure.boss) {
    return (
      <>
        <OverworldSprite name={(wet && figure.sprite && waterSprite(figure.sprite)) || figure.sprite || 'boy'} tile={tile} face={face ?? facing(tile, spot)} title={figure.title} faded={faded} walkTick={walkTick} moveMs={moveMs} />
        {figure.bubble && <EncounterBubble kind={figure.bubble} tile={tile} faded={faded} low={isItemBall(figure.sprite)} below={tile.y > spot.y} moveMs={moveMs} />}
      </>
    );
  }
  return (
    <img
      src={`/trainers/${figure.boss}.png`}
      alt=""
      title={figure.title}
      draggable={false}
      className={`absolute select-none [image-rendering:pixelated] ${faded ? 'opacity-50' : ''}`}
      style={{ left: tile.x * 16 + 8, top: tile.y * 16 + 16, transform: 'translate(-50%, -100%)', zIndex: tile.y }}
    />
  );
}

/**
 * Who stands near each of a map's spots (the map's spots are the run's steps from `first` on): upcoming spots their step's
 * options, the current spot its options while choosing (or the encounter under way), passed spots the encounter taken
 * (faded). With `stands` (a gym), each spot's figure stands on its own tile, and a beaten trainer stays (not faded). The
 * map holds the steps up to `upto`: those after its last spot stand at the last spot while they're current.
 * The current spot is placed first, so its figures get the best tiles; each figure gets its own tile (nearbyTiles).
 */
function placeFigures(route: Route, view: RunViewData, first: number, upto: number, moved: ReadonlyMap<number, RouteSpot> = new Map()) {
  const spots = route.spots;
  const taken = new Set(spots.map(key));
  const placed: { figure: RouteFigure; tile: RouteSpot; spot: RouteSpot; faded: boolean }[] = [];
  const place = (figures: RouteFigure[], index: number, faded: boolean) => {
    const spot = spots[index]!;
    const stand = route.stands?.[index];
    let tiles = stand ? [stand] : nearbyTiles(route, index, figures.map((f) => !!f.sprite && swims(f.sprite)), taken);
    // A passed non-battle encounter's NPC (not an item ball) walked up to the player: it stays (faded) where it went
    // (`moved`), or, not seen walking (a reload), on the free tile beside the spot nearest where it stood.
    const f = figures[0];
    if (faded && !stand && figures.length === 1 && f?.bubble && !isItemBall(f.sprite) && tiles[0]) {
      const from = tiles[0];
      const beside = ([[0, -1], [1, 0], [0, 1], [-1, 0]] as const)
        .map(([dx, dy]) => ({ x: spot.x + dx, y: spot.y + dy }))
        .filter((t) => onPath(route, t) && !onWater(route, t) && !taken.has(key(t)))
        .sort((a, b) => Math.abs(a.x - from.x) + Math.abs(a.y - from.y) - (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)))[0];
      const to = moved.get(first + index) ?? beside;
      if (to) tiles = [to];
    }
    tiles.slice(0, figures.length).forEach((tile, i) => {
      taken.add(key(tile));
      placed.push({ figure: figures[i]!, tile, spot, faded: faded && !stand });
    });
  };
  const stepFigures = (i: number): { figures: RouteFigure[]; faded: boolean } => {
    const step = view.steps[i];
    if (!step) return { figures: [], faded: false };
    if (i < view.position) {
      const chosen = step.chosen !== undefined ? step.options[step.chosen] : undefined;
      const figure = chosen && optionFigure(chosen, setOf(route));
      return { figures: figure ? [figure] : [], faded: true };
    }
    if (i === view.position && view.phase === 'encounter') {
      // Choosing a battle's reward, its trainer stays (at full opacity) until the player walks on.
      const chosen = view.encounter?.kind === 'reward' && step.chosen !== undefined ? step.options[step.chosen] : undefined;
      const figure = chosen ? optionFigure(chosen, setOf(route)) : encounterFigure(view, setOf(route));
      return { figures: figure ? [figure] : [], faded: false };
    }
    return { figures: step.options.flatMap((o, option) => { const f = optionFigure(o, setOf(route)); return f ? [{ ...f, option }] : []; }), faded: false };
  };
  const local = view.position - first;
  const onMap = local >= 0 && view.position < upto;
  if (onMap) {
    const current = stepFigures(view.position);
    place(current.figures, Math.min(local, spots.length - 1), current.faded);
  }
  spots.forEach((_, i) => {
    if ((onMap && i === local) || first + i >= upto) return;
    const { figures, faded } = stepFigures(first + i);
    place(figures, i, faded);
  });
  return placed;
}

/**
 * The run's route map (routes.ts): the route's pixel map with every spot's figures (placeFigures), and Red (the player)
 * on the current spot, facing the encounter, at 2×. It pans by dragging or with the mouse wheel (up and down; sideways
 * with a trackpad or Shift); it opens centred on the player. When the run moves on, Red walks to the next spot tile by
 * tile with FireRed's walk cycle (WALK), the view following him, where the route has a walkable path between them
 * (routePath, up to MAX_WALK tiles, through gatehouses fading out at one door and back in at the other); otherwise he fades
 * out, the view glides there, and he fades back in. The target
 * button centres the view on him again, and the speed button walks everyone (and fades and glides) at 1×, 2× or 3×. On a
 * phone the lock button below them stops the map panning, so a swipe over it scrolls the page (on by default; remembered, `poke-tcg.route-lock`).
 * With more than one route (Vermilion City: Route 5, then Route 6), each route holds its spots' steps: Red walks to the
 * route's `exit` (if it has one), fades out, and comes back in at the next route's `entrance`, the view switching to it.
 * With a `gym` (its interior: Pewter Gym), the steps after the routes' spots are there:
 * Red fades out on the route and back in at the gym's door, the view switching to the gym, and walks on to the Gym
 * Trainer (standing where the game has them), then to the leader, who waits in their place all along. A trainer whose battle was just chosen (`spotted`, useRun) gets FireRed's "!" over
 * them (Exclamation) and Red turns to them, while the battle is set up; a non-battle encounter's NPC walks up beside him
 * once it's chosen (an item ball stays put). The view stays inside the map (centred along any side where the map is smaller
 * than it). Its height is the player's: drag the handle along its bottom edge (from MIN_HEIGHT to the whole map's height,
 * or 85% of the window), remembered in localStorage (`poke-tcg.route-map`); a double-click on the handle resets it.
 */
export function RouteView({ routes, gym, view, spotted }: { routes: Route[]; gym?: Route; view: RunViewData; spotted?: { option: number | null } | null }) {
  const box = useRef<HTMLDivElement>(null);
  // Debug only: the walkable tiles overlay (TileOverlay).
  const debug = useDebugEnabled();
  const [showTiles, setShowTiles] = useState(false);
  const [height, setHeight] = useState(loadHeight);
  // On a phone, the lock button stops dragging (and the wheel) panning the map, so a swipe over it scrolls the page
  // instead; the view still follows Red and Centre on you still works.
  const phone = useIsPhone();
  const [locked, setLocked] = useState(loadLocked);
  const panLocked = phone && locked;
  // The walk speed (the speed button), and every walk timing at it.
  const [speed, setSpeed] = useState(loadSpeed);
  const ms = { step: STEP_MS / speed, frame: WALK_FRAME_MS / speed, fade: FADE_MS / speed, through: THROUGH_MS / speed, glide: 700 / speed };
  const resize = useRef<{ y: number; height: number } | null>(null);
  const maxHeight = () => Math.max(MIN_HEIGHT, Math.min(Math.max(...routes.map((r) => r.height), gym?.height ?? 0) * ZOOM, Math.round(window.innerHeight * 0.85)));
  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { y: e.clientY, height };
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (r) setHeight(Math.min(maxHeight(), Math.max(MIN_HEIGHT, Math.round(r.height + e.clientY - r.y))));
  };
  const onResizeUp = () => {
    if (resize.current) saveHeight(height);
    resize.current = null;
  };
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The size as last measured, for the walk's timers (set up before the first measure, on a walk in from the entrance).
  const sizeRef = useRef(size);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // How the view moves when it moves on its own (following the player, or gliding to his new spot); null while it's panned.
  const [glide, setGlide] = useState<{ ms: number; ease: string } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
      setSize(sizeRef.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const position = view.position;
  const total = view.steps.length;
  // The maps in order (the routes, then the gym), each holding the steps from `first` up to `upto`. The gym's steps are the
  // run's last ones (counted from the end, so a run made before its route had 10 spots still works); the last route holds
  // every step before them.
  const gymStart = gym ? total - gym.spots.length : total;
  const sections: { map: Route; first: number; upto: number }[] = [];
  let counted = 0;
  routes.forEach((map, i) => {
    const first = Math.min(counted, gymStart);
    counted += map.spots.length;
    sections.push({ map, first, upto: i === routes.length - 1 ? gymStart : Math.min(counted, gymStart) });
  });
  if (gym) sections.push({ map: gym, first: gymStart, upto: total });
  /** The section a step is on (the last one for steps past the end). */
  const sectionOf = (p: number) => {
    const i = sections.findIndex((s) => p < s.upto);
    return i < 0 ? sections.length - 1 : i;
  };
  const targetSection = sectionOf(position);
  const target = sections[targetSection]!;
  const targetSpot = target.map.spots[Math.min(position - target.first, target.map.spots.length - 1)]!;

  // The player: the map he's on (its section), where he stands (or is walking through), which way he's going, and whether he's faded out.
  const [walker, setWalker] = useState<{ section: number; tile: RouteSpot; face: Facing; walking: boolean; hidden: boolean }>({
    section: targetSection,
    // At the run's first step he starts at the map's entrance and walks in (the walk effect, on mount).
    tile: position === 0 && target.map.entrance ? target.map.entrance : targetSpot,
    face: flowAt(target.map, Math.min(position - target.first, target.map.spots.length - 1)),
    walking: false,
    hidden: false,
  });
  const walkerRef = useRef(walker);
  walkerRef.current = walker;
  // The map shown is the one the player is on, which changes when he fades into the next route or the gym.
  const current = sections[walker.section] ?? target;
  const shown = current.map;
  const index = Math.min(Math.max(0, position - current.first), shown.spots.length - 1);
  const spot = shown === target.map ? targetSpot : shown.spots[index]!;

  /** An offset kept inside a map (the map centred along any side where it's smaller than the view). */
  const clampOn = useCallback(
    (map: Route, o: { x: number; y: number }) => {
      const fit = (v: number, inView: number, mapSize: number) => (mapSize <= inView ? (inView - mapSize) / 2 : Math.min(0, Math.max(inView - mapSize, v)));
      const { w, h } = sizeRef.current;
      return { x: fit(o.x, w, map.width * ZOOM), y: fit(o.y, h, map.height * ZOOM) };
    },
    [size],
  );
  const clamp = useCallback((o: { x: number; y: number }) => clampOn(shown, o), [clampOn, shown]);
  const centreOnMap = useCallback(
    (map: Route, t: RouteSpot) => clampOn(map, { x: sizeRef.current.w / 2 - (t.x * 16 + 8) * ZOOM, y: sizeRef.current.h / 2 - (t.y * 16 + 8) * ZOOM }),
    [clampOn],
  );
  const centreOn = useCallback((t: RouteSpot) => centreOnMap(shown, t), [centreOnMap, shown]);
  // The figures as last drawn, for the walk to go around them.
  const placedRef = useRef<ReturnType<typeof placeFigures>>([]);
  // A non-battle encounter's NPC walking up to the player once chosen (the step it's for, where it is, which way it's going).
  const [approach, setApproach] = useState<{ position: number; tile: RouteSpot; face: Facing; walking: boolean } | null>(null);
  // The figures as last drawn while choosing, to know where the chosen one stood; and the walk's timers.
  const choosingRef = useRef<ReturnType<typeof placeFigures>>([]);
  const approachTimers = useRef<number[]>([]);
  // Where each NPC that walked up to the player ended up, by step (placeFigures keeps it there once passed).
  const movedRef = useRef(new Map<number, RouteSpot>());
  const [tick, setTick] = useState(0);
  const anyWalking = walker.walking || !!approach?.walking;
  // The player bobbing on the spot while still (Ethan surfing): the low half of the bob every other BOB_MS.
  const [bobbing, setBobbing] = useState(false);
  const playerName = playerSprite(setOf(shown), shown.travel, onWater(shown, walker.tile));
  const stillBob = bobs(playerName) && !walker.walking;
  useEffect(() => {
    if (!stillBob) return;
    const timer = window.setInterval(() => setBobbing((b) => !b), BOB_MS);
    return () => window.clearInterval(timer);
  }, [stillBob]);
  useEffect(() => {
    if (!anyWalking) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), ms.frame / pace(shown));
    return () => window.clearInterval(timer);
  }, [anyWalking, shown]);

  // A non-battle encounter chosen: its NPC (an item ball aside) walks from where it stood to the free tile beside the
  // player it reaches soonest, then faces him; from the moment it's clicked (`spotted`), or once the encounter is under way
  // (a reload, say). Battles have their "!" instead.
  const chosenOption = view.phase === 'map' ? (spotted?.option ?? undefined) : view.phase === 'encounter' ? view.steps[position]?.chosen : undefined;
  useEffect(() => {
    if (chosenOption === undefined || approach?.position === position) return;
    const option = view.steps[position]?.options[chosenOption];
    if (!option || isBattleKind(option.kind)) return;
    const e = view.encounter;
    if (view.phase === 'encounter' && (!e || e.kind === 'reward' || isItemBall(encounterFigure(view, setOf(shown))?.sprite))) return;
    // A Mystery waits until it's revealed (once under way) to show who walks up; a Lucky Find's ₱ stay on the ground.
    if (view.phase === 'map' && option.kind === 'event' && (!option.event || option.event.id === 'luckyFind')) return;
    const from = choosingRef.current.find((p) => p.spot === spot && !p.faded && p.figure.option === chosenOption)?.tile;
    if (!from) return;
    const others = new Set(choosingRef.current.filter((p) => p.tile !== from).map((p) => key(p.tile)));
    const walks = ([[0, -1], [1, 0], [0, 1], [-1, 0]] as const)
      .map(([dx, dy]) => ({ x: spot.x + dx, y: spot.y + dy }))
      .filter((t) => onPath(shown, t) && !onWater(shown, t) && !others.has(key(t)))
      .map((t) => (t.x === from.x && t.y === from.y ? [] : routePath(shown, from, t, others)))
      .filter((w): w is NonNullable<typeof w> => w !== null)
      .sort((a, b) => a.length - b.length);
    const walk = walks[0];
    setApproach({ position, tile: from, face: facing(from, spot), walking: false });
    // No walking through a gatehouse, or into water (the NPC can't swim: it stays on land).
    if (!walk?.length || walk.some((s) => s.fade || onWater(shown, s.tile))) return;
    // Kept until the step changes, not when the encounter comes in mid-walk.
    approachTimers.current = walk.map(({ tile }, i) =>
      window.setTimeout(() => setApproach({ position, tile, face: facing(i ? walk[i - 1]!.tile : from, tile), walking: true }), i * ms.step),
    );
    const last = walk.at(-1)!.tile;
    approachTimers.current.push(window.setTimeout(() => setApproach({ position, tile: last, face: facing(last, spot), walking: false }), walk.length * ms.step));
    // When an option is chosen, or the encounter comes in (or the step changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenOption, view.phase, position]);
  useEffect(
    () => () => {
      approachTimers.current.forEach((t) => window.clearTimeout(t));
      approachTimers.current = [];
    },
    [position],
  );

  // Centred on the player when the view first has a size, or changes size.
  useEffect(() => {
    if (!size.w) return;
    setGlide(null);
    setOffset(centreOn(walkerRef.current.tile));
    // Only when the view's size changes; walking and panning move it otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // When the run moves on: walk to the new spot (the view following; through a gatehouse, fading out at one door and back
  // in at the other), or with no walk there, fade out and back in at it. Onto the next map (route or gym): walk to this
  // one's exit first, if it has one, then fade out and back in at the next one's door.
  useEffect(() => {
    const { section, tile: from } = walkerRef.current;
    const map = target.map;
    const to = targetSpot;
    if (section === targetSection && from.x === to.x && from.y === to.y) return;
    const timers: number[] = [];
    const later = (ms: number, then: () => void) => timers.push(window.setTimeout(then, ms));
    let t = 0;
    let start = from;
    /** Walks a path on a map from `begin`, step by step (through a link, fading out and in), from `t` on. */
    const walk = (on: Route, onSection: number, path: NonNullable<ReturnType<typeof routePath>>, begin: RouteSpot) => {
      path.forEach(({ tile, fade }, i) => {
        const face = facing(i ? path[i - 1]!.tile : begin, tile);
        if (fade) {
          later(t, () => setWalker((w) => ({ ...w, walking: false, hidden: true })));
          later(t + ms.fade, () => {
            setWalker({ section: onSection, tile, face, walking: false, hidden: true });
            setGlide({ ms: ms.through, ease: 'ease-in-out' });
            setOffset(centreOnMap(on, tile));
          });
          later(t + ms.fade + ms.through, () => setWalker((w) => ({ ...w, hidden: false })));
          t += ms.fade * 2 + ms.through;
        } else {
          later(t, () => {
            setWalker({ section: onSection, tile, face, walking: true, hidden: false });
            setGlide({ ms: ms.step / pace(on), ease: 'linear' });
            setOffset(centreOnMap(on, tile));
          });
          t += ms.step / pace(on);
        }
      });
      later(t, () => setWalker((w) => ({ ...w, walking: false })));
    };
    // Into another map: walk to this one's exit (going on to the next), fade out, appear at the next one's door with the
    // view on it, fade in, then walk on from there.
    if (section !== targetSection) {
      const leaving = sections[section]?.map;
      const exit = targetSection > section ? leaving?.exit : undefined;
      if (leaving && exit) {
        const others = new Set(placedRef.current.map((p) => key(p.tile)));
        const out = from.x === exit.x && from.y === exit.y ? [] : (routePath(leaving, from, exit, others) ?? routePath(leaving, from, exit));
        if (out && out.length <= MAX_WALK) walk(leaving, section, out, from);
      }
      const door = map.entrance ?? to;
      later(t, () => setWalker((w) => ({ ...w, walking: false, hidden: true })));
      later(t + ms.fade, () => {
        setWalker({ section: targetSection, tile: door, face: 'down', walking: false, hidden: true });
        setGlide(null);
        setOffset(centreOnMap(map, door));
      });
      later(t + ms.fade + 50, () => setWalker((w) => ({ ...w, hidden: false })));
      t += ms.fade * 2 + 50;
      start = door;
    }
    // Around the people there, unless one stands in a one-tile gap (a cut-tree's, a door): then past them.
    const others = section === targetSection ? new Set(placedRef.current.map((p) => key(p.tile))) : new Set((map.stands ?? []).map(key));
    const path = start.x === to.x && start.y === to.y ? [] : (routePath(map, start, to, others) ?? routePath(map, start, to));
    if (path && path.length <= MAX_WALK) {
      walk(map, targetSection, path, start);
    } else {
      later(t, () => setWalker((w) => ({ ...w, walking: false, hidden: true })));
      later(t + ms.fade, () => {
        setWalker({ section: targetSection, tile: to, face: 'up', walking: false, hidden: true });
        setGlide({ ms: ms.glide, ease: 'ease-in-out' });
        setOffset(centreOnMap(map, to));
      });
      later(t + ms.fade + ms.glide, () => setWalker((w) => ({ ...w, hidden: false })));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  // The wheel pans the map (a native listener, so it can stop the page scrolling): up and down, and sideways with a
  // trackpad's sideways scroll or Shift.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Locked, the wheel scrolls the page.
      if (panLocked) return;
      e.preventDefault();
      // Lines (some mice) are about 16px each.
      const unit = e.deltaMode === 1 ? 16 : 1;
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
      const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
      setGlide(null);
      setOffset((o) => clamp({ x: o.x - dx, y: o.y - dy }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panLocked || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setGlide(null);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  // Where each non-battle encounter's NPC walked up to (the step it's for), so it stays there once passed.
  if (approach) movedRef.current.set(approach.position, approach.tile);
  const placed = placeFigures(shown, view, current.first, current.upto, movedRef.current);
  placedRef.current = placed;
  if (view.phase === 'map') choosingRef.current = placed;
  // The NPC coming up to the player (approach), for the encounter under way: drawn where it's walked to.
  const approaching = approach && approach.position === position && view.phase !== 'won' && view.phase !== 'lost' ? approach : null;
  // While choosing, the chosen option's figure; once the encounter is under way, its figure.
  const isApproaching = (p: (typeof placed)[number]) =>
    !!approaching && p.spot === spot && !p.faded && (view.phase === 'encounter' || p.figure.option === chosenOption);
  // Red faces the way he walks, and once there the encounter if there's just one at his spot; otherwise the way the map's encounters go (its flow).
  const mine = placed.filter((p) => p.spot === spot && !p.faded);
  // The trainer who just spotted the player (the battle chosen, or the Ace Trainer accepted): the step's option while the
  // battle is being set up, then the encounter's figure once it's in.
  const spottedFigure = spotted ? mine.find((p) => !p.figure.bubble && (view.phase === 'encounter' ? true : p.figure.option === spotted.option)) : undefined;
  const redFace: Facing = walker.walking
    ? walker.face
    : spottedFigure
      ? facing(walker.tile, spottedFigure.tile)
      : approaching
        ? facing(walker.tile, approaching.tile)
        : mine.length === 1
        ? facing(walker.tile, mine[0]!.tile)
        : flowAt(shown, index);
  const button = 'flex h-8 w-8 items-center justify-center rounded bg-slate-800/90 text-slate-200 ring-1 ring-slate-600 transition hover:bg-slate-700';
  const atGym = !!gym && target.map === gym;

  return (
    // As wide as the widest of its maps at 2× (at least 48rem), up to the page's width: no wider than the maps can fill.
    <figure className="mx-auto w-full space-y-1" style={{ maxWidth: Math.max(768, ...sections.map((s) => s.map.width * ZOOM)) }}>
      <div
        ref={box}
        className={`relative overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-600 ${panLocked ? 'touch-pan-y' : 'cursor-grab touch-none active:cursor-grabbing'}`}
        style={{ height }}
        aria-label={panLocked ? `${shown.name}. The map is locked.` : `${shown.name}. Drag or scroll to look around.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {size.w > 0 && (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: shown.width,
              height: shown.height,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${ZOOM})`,
              transition: glide ? `transform ${glide.ms}ms ${glide.ease}` : undefined,
            }}
          >
            <img src={shown.image} alt="" draggable={false} className="h-full w-full select-none [image-rendering:pixelated]" />
            {/* The people always there (a gym's guide). */}
            {shown.npcs?.map((n, i) => <OverworldSprite key={`npc${i}`} name={n.sprite} tile={n.tile} face={n.face} />)}
            {placed.map((p, i) =>
              isApproaching(p) ? (
                <Figure
                  key={i}
                  figure={p.figure}
                  tile={approaching!.tile}
                  spot={p.spot}
                  face={approaching!.face}
                  walkTick={approaching!.walking ? tick : undefined}
                  moveMs={approaching!.walking ? ms.step : 0}
                  wet={onWater(shown, approaching!.tile)}
                />
              ) : (
                <Figure key={i} figure={p.figure} tile={p.tile} spot={p.spot} faded={p.faded} wet={onWater(shown, p.tile)} />
              ),
            )}
            <OverworldSprite
              name={playerName}
              bob={stillBob && bobbing}
              tile={walker.tile}
              face={redFace}
              walkTick={walker.walking ? tick : undefined}
              moveMs={walker.walking ? ms.step / pace(shown) : 0}
              fadeMs={ms.fade}
              hidden={walker.hidden}
              title="You"
            />
            {spottedFigure && <Exclamation tile={spottedFigure.tile} />}
            {DEBUG_BUILD && debug && showTiles && <TileOverlay route={shown} />}
          </div>
        )}
        <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-1">
          <button
            className={button}
            onClick={() => {
              setGlide({ ms: 700, ease: 'ease-in-out' });
              setOffset(centreOn(walkerRef.current.tile));
            }}
            aria-label="Centre on you"
            title="Centre on you"
          >
            <MyLocationIcon sx={{ fontSize: 16 }} />
          </button>
          {/* The walk speed: 1×, 2×, 3× in turn, an arrow more for each. */}
          <button
            className={button}
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!;
              setSpeed(next);
              saveSpeed(next);
            }}
            aria-label={`Walk speed ${speed}×`}
            title={`Walk speed ${speed}× (click to change)`}
          >
            <span className="flex items-center">
              {Array.from({ length: speed }, (_, i) => (
                <ChevronRightIcon key={i} sx={{ fontSize: 16, mx: speed > 1 ? '-4.5px' : 0 }} />
              ))}
            </span>
          </button>
          {/* On a phone: the map lock (see `locked`). */}
          {phone && (
            <button
              className={`${button} ${locked ? 'ring-yellow-300' : ''}`}
              onClick={() => {
                setLocked(!locked);
                saveLocked(!locked);
                drag.current = null;
              }}
              aria-pressed={locked}
              aria-label={locked ? 'Unlock the map' : 'Lock the map'}
              title={locked ? 'Map locked: tap to drag it around again' : 'Lock the map, so a swipe over it scrolls the page'}
            >
              {locked ? <LockIcon sx={{ fontSize: 16 }} /> : <LockOpenIcon sx={{ fontSize: 16 }} />}
            </button>
          )}
          {/* DEBUG_BUILD first: a production build drops the button altogether. */}
          {DEBUG_BUILD && debug && (
            <button
              className={`${button} ${showTiles ? 'ring-yellow-300' : ''}`}
              onClick={() => setShowTiles(!showTiles)}
              aria-pressed={showTiles}
              aria-label="Debug: show tiles"
              title="Debug: show the tiles' coordinates and walkable areas"
            >
              <GridOnIcon sx={{ fontSize: 16 }} />
            </button>
          )}
        </div>
      </div>
      {/* The handle for the view's height: drag it up or down; a double-click resets it. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the map"
        title="Drag to resize the map (double-click to reset)"
        className="group flex h-3 cursor-ns-resize touch-none items-center justify-center"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        onDoubleClick={() => {
          setHeight(DEFAULT_HEIGHT);
          saveHeight(DEFAULT_HEIGHT);
        }}
      >
        <span className="h-1 w-12 rounded-full bg-slate-600 transition group-hover:bg-slate-400" />
      </div>
      <figcaption className="text-center text-xs text-slate-400">
        {atGym ? gym.name : target.map.spots.length > 1 ? `${target.map.name} · encounter ${Math.min(position - target.first, target.map.spots.length - 1) + 1} of ${target.map.spots.length}` : target.map.name} · step {Math.min(position + 1, total)} of {total} · {panLocked ? 'map locked' : 'drag or scroll to look around'}
      </figcaption>
    </figure>
  );
}
