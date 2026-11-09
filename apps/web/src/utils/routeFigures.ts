import { flowAt, isBattleKind, isBossKind, onPath, onWater, type BossId, type EncounterKind, type MapEncounter, type Route, type RouteSpot } from '@poke-tcg/campaign';
import type { RunViewData } from '../hooks/useRun';
import { encounterSprite, isItemBall, swims, trainerSprite, type Facing, type SpriteSet } from './overworld';

/**
 * Who stands where on a run's route map (RouteView): the figures a step's options and the encounter under way put near
 * each spot, and the walkable tiles they're placed on.
 */

/**
 * Someone (or something) to show near a spot, for one of its step's options or the encounter under way: a boss's own
 * sprite (`public/trainers/`), or an overworld sprite (a trainer's class, trainerSprite; a shop's clerk, encounterSprite…).
 * `title` names them on hover; `bubble`, for a non-battle encounter, is its kind, shown in a speech bubble above them.
 */
export interface RouteFigure {
  title: string;
  sprite?: string;
  boss?: BossId;
  bubble?: EncounterKind;
  /** The step option it stands for (the current step's), to find a spotted trainer by. */
  option?: number;
}

/** The sprites a map uses: HGSS's on the Johto maps (`sprites: 'hgss'`), Emerald's on the Hoenn ones (`'rse'`), Diamond and Pearl's on the Sinnoh ones (`'dp'`), FireRed's on the others. */
export const setOf = (route: Route): SpriteSet => route.sprites ?? 'frlg';

/** An option's figure: its trainer (a boss's own sprite), or the non-battle encounter's (null if it has none). */
function optionFigure(o: MapEncounter, set: SpriteSet): RouteFigure | null {
  if (isBattleKind(o.kind)) return o.trainer ? { title: o.trainer, ...(isBossKind(o.kind) && o.boss ? { boss: o.boss } : { sprite: trainerSprite(o.trainer, set) }) } : null;
  const sprite = encounterSprite(o.kind, o.event?.id, set);
  return sprite ? { title: o.label, sprite, bubble: o.kind } : null;
}

/** The figure of the encounter under way: its trainer, or whoever runs it (the shop's clerk, the event's character…). */
export function encounterFigure(view: RunViewData, set: SpriteSet): RouteFigure | null {
  const e = view.encounter;
  if (!e || e.kind === 'reward') return null;
  if ('trainer' in e && isBattleKind(e.kind)) return { title: e.trainer, ...(isBossKind(e.kind) && 'boss' in e && e.boss ? { boss: e.boss } : { sprite: trainerSprite(e.trainer, set) }) };
  const sprite = encounterSprite(e.kind, e.kind === 'event' ? e.event.id : undefined, set);
  return sprite ? { title: view.event?.title ?? e.kind, sprite, bubble: e.kind } : null;
}

/** A tile as a string, for sets of taken tiles. */
export const key = (t: RouteSpot) => `${t.x},${t.y}`;

/** Which way someone at `from` faces to look at `to`. */
export function facing(from: RouteSpot, to: RouteSpot): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

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

/**
 * Who stands near each of a map's spots (the map's spots are the run's steps from `first` on): upcoming spots their step's
 * options, the current spot its options while choosing (or the encounter under way), passed spots the encounter taken
 * (faded). With `stands` (a gym), each spot's figure stands on its own tile, and a beaten trainer stays (not faded). The
 * map holds the steps up to `upto`: those after its last spot stand at the last spot while they're current.
 * The current spot is placed first, so its figures get the best tiles; each figure gets its own tile (nearbyTiles).
 */
export function placeFigures(route: Route, view: RunViewData, first: number, upto: number, moved: ReadonlyMap<number, RouteSpot> = new Map()) {
  const spots = route.spots;
  const taken = new Set(spots.map(key));
  const placed: { figure: RouteFigure; tile: RouteSpot; spot: RouteSpot; faded: boolean }[] = [];
  /**
   * `among`: the step's option figures while it was chosen, and which of them `figures` (the one taken) was, so it keeps the
   * tile it stood on rather than the best one (the user's: a second option's trainer jumped onto the first's tile).
   */
  const place = (figures: RouteFigure[], index: number, faded: boolean, among?: { figures: RouteFigure[]; at: number }) => {
    const spot = spots[index]!;
    const stand = route.stands?.[index];
    const wet = (fs: RouteFigure[]) => fs.map((f) => !!f.sprite && swims(f.sprite));
    let tiles = stand ? [stand] : among ? nearbyTiles(route, index, wet(among.figures), taken).slice(among.at, among.at + 1) : nearbyTiles(route, index, wet(figures), taken);
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
  /** A step's options' figures, as they stand while it's chosen (each with its option). */
  const optionFigures = (i: number) => (view.steps[i]?.options ?? []).flatMap((o, option) => { const f = optionFigure(o, setOf(route)); return f ? [{ ...f, option }] : []; });
  /** Where the step's chosen option stood among its figures while it was chosen (`among`, for place), if it had one. */
  const chosenAmong = (i: number) => {
    const chosen = view.steps[i]?.chosen;
    const figures = optionFigures(i);
    const at = figures.findIndex((f) => f.option === chosen);
    return at < 0 ? undefined : { figures, at };
  };
  const stepFigures = (i: number): { figures: RouteFigure[]; faded: boolean; among?: { figures: RouteFigure[]; at: number } } => {
    const step = view.steps[i];
    if (!step) return { figures: [], faded: false };
    if (i < view.position) {
      const chosen = step.chosen !== undefined ? step.options[step.chosen] : undefined;
      const figure = chosen && optionFigure(chosen, setOf(route));
      return { figures: figure ? [figure] : [], faded: true, among: chosenAmong(i) };
    }
    if (i === view.position && view.phase === 'encounter') {
      // Choosing a battle's reward, its trainer stays (at full opacity) until the player walks on.
      const chosen = view.encounter?.kind === 'reward' && step.chosen !== undefined ? step.options[step.chosen] : undefined;
      const figure = chosen ? optionFigure(chosen, setOf(route)) : encounterFigure(view, setOf(route));
      return { figures: figure ? [figure] : [], faded: false, among: chosenAmong(i) };
    }
    return { figures: optionFigures(i), faded: false };
  };
  const local = view.position - first;
  const onMap = local >= 0 && view.position < upto;
  if (onMap) {
    const current = stepFigures(view.position);
    place(current.figures, Math.min(local, spots.length - 1), current.faded, current.among);
  }
  spots.forEach((_, i) => {
    if ((onMap && i === local) || first + i >= upto) return;
    const { figures, faded, among } = stepFigures(first + i);
    place(figures, i, faded, among);
  });
  return placed;
}

/** A figure as placeFigures places it: on its tile, near its spot, faded once its step is passed. */
export type PlacedFigure = ReturnType<typeof placeFigures>[number];

/** A step's encounter card to place on the map (RouteView's `optionCard`): its figure's tile from the player's, how far the figure is drawn below its tile (`dropAt`, map pixels) and the card's height (a debug Skip battle under it makes it taller). */
export interface CardFigure {
  option: number;
  dx: number;
  dy: number;
  drop: number;
  h: number;
}

/** Where a step's cards go (layOutCards): the zoom, how far down the view the player's centre rests, and each card's top left corner, in the page's pixels from the player's centre. */
export interface CardLayout {
  zoom: number;
  restY: number;
  cards: { option: number; x: number; y: number }[];
  /** The options with no figure, stacked above the player: their column's top left corner. */
  others: { x: number; y: number } | null;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Above the player (pushed up when there's no room beside), or below (pushed down). */
  up: boolean;
  fixed: boolean;
}

const overlapX = (a: Box, b: Box, gap: number) => Math.min(a.x + a.w, b.x + b.w) + gap - Math.max(a.x, b.x);
const overlapY = (a: Box, b: Box, gap: number) => Math.min(a.y + a.h, b.y + b.h) + gap - Math.max(a.y, b.y);

/**
 * The step's encounter cards laid out on the map (the user's: never over each other, nor under the view's corners): each
 * above its figure if it stands above the player, otherwise below it, centred on it; cards that would overlap pushed apart
 * sideways (inside the view), or up or down, away from the player, when there's no room. The player rests in the view's
 * middle, or higher to keep the cards below clear of the bottom corners (`bottom`: their height), as far as the cards
 * above allow; and the zoom (`zoom`, at most) eases out in quarter steps (down to `minZoom`) until they all fit the view's
 * height. `others` cards (no figure) stand stacked above the player, as one card that never moves.
 */
export function layOutCards(
  figures: CardFigure[],
  others: number[],
  o: { zoom: number; minZoom: number; card: { w: number; h: number }; view: { w: number; h: number }; top: number; bottom: number; gap: number; redDrop: number },
): CardLayout {
  const { card, view, gap } = o;
  const at = (z: number) => {
    const boxes: (Box & { option?: number })[] = figures.map((f) => {
      const up = f.dy < 0;
      const x = f.dx * 16 * z - card.w / 2;
      return { option: f.option, x, y: up ? (f.dy * 16 - 22 + f.drop) * z - f.h : (f.dy * 16 + 10 + f.drop) * z, w: card.w, h: f.h, up, fixed: false };
    });
    const othersH = others.length * card.h + Math.max(0, others.length - 1) * 4;
    const stack: Box | null = others.length ? { x: -card.w / 2, y: (-22 + o.redDrop) * z - othersH, w: card.w, h: othersH, up: true, fixed: true } : null;
    const all = stack ? [...boxes, stack] : boxes;
    const minX = 8 - view.w / 2;
    const maxX = view.w / 2 - 8 - card.w;
    for (let round = 0; round < 50; round++) {
      let moved = false;
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i]!;
          const b = all[j]!;
          if (overlapX(a, b, gap) <= 0 || overlapY(a, b, gap) <= 0 || (a.fixed && b.fixed)) continue;
          moved = true;
          // Sideways first: the left one (the first, if they're level) left, the other right; a fixed one stays.
          const [l, r] = a.x + a.w / 2 <= b.x + b.w / 2 ? [a, b] : [b, a];
          const push = overlapX(l, r, gap);
          const lx = l.fixed ? l.x : r.fixed ? l.x - push : l.x - push / 2;
          const rx = r.fixed ? r.x : l.fixed ? r.x + push : r.x + push / 2;
          if (!l.fixed) l.x = Math.min(maxX, Math.max(minX, lx));
          if (!r.fixed) r.x = Math.min(maxX, Math.max(minX, rx));
          if (overlapX(l, r, gap) <= 0) continue;
          // No room beside: the one further from the player (the one that can move) up or down, away from him.
          const far = a.fixed ? b : b.fixed ? a : Math.abs(a.y + a.h / 2) >= Math.abs(b.y + b.h / 2) ? a : b;
          const near = far === a ? b : a;
          far.y = far.up ? near.y - gap - far.h : near.y + near.h + gap;
        }
      }
      if (!moved) break;
    }
    const top = Math.min(0, ...all.map((b) => b.y));
    const bottom = Math.max(0, ...all.map((b) => b.y + b.h));
    const below = all.some((b) => !b.up);
    return { boxes, stack, top, bottom, reserve: below ? o.bottom : 8 };
  };
  let z = o.zoom;
  let laid = at(z);
  while (z - 0.25 >= o.minZoom && laid.bottom - laid.top > view.h - o.top - laid.reserve) laid = at((z -= 0.25));
  const lowest = o.top - laid.top;
  const highest = view.h - laid.reserve - laid.bottom;
  return {
    zoom: z,
    restY: figures.length || others.length ? Math.max(lowest, Math.min(view.h / 2, highest)) : view.h / 2,
    cards: laid.boxes.map((b) => ({ option: b.option!, x: b.x, y: b.y })),
    others: laid.stack && { x: laid.stack.x, y: laid.stack.y },
  };
}
