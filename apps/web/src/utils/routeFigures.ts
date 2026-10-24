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

/** The sprites a map uses: HGSS's on the Johto maps (`sprites: 'hgss'`), Emerald's on the Hoenn ones (`'rse'`), FireRed's on the others. */
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

/** A figure as placeFigures places it: on its tile, near its spot, faded once its step is passed. */
export type PlacedFigure = ReturnType<typeof placeFigures>[number];
