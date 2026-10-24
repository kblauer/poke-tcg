// The Berry Farm (the Extras page): a tree of every berry growing on the farm's map (berry-farm-map.ts) in real time,
// through the game's stages (planted, sprouted, taller, flowering, berries) in GROW_HOURS, then picked for its berries,
// which plants it again. The account keeps when each tree was planted (`User.berryFarm`) and its berries (`User.berries`).
import { BERRIES } from './berries.js';
import { BERRY_FARM_MAP } from './berry-farm-map.js';
import { between, type Rng } from './random.js';

/** How long a tree takes from planted to ripe (a placeholder, to be settled with the user: "every 4 hours (TBD)"). */
export const GROW_HOURS = 4;
const HOUR_MS = 60 * 60 * 1000;
export const GROW_MS = GROW_HOURS * HOUR_MS;

/** A tree's stages, as the game names them (BERRY_STAGE_PLANTED … BERRY_STAGE_BERRIES), each a quarter of GROW_MS but the last, which lasts until it's picked. */
export const STAGES = ['planted', 'sprouted', 'taller', 'flowering', 'berries'] as const;
export type Stage = (typeof STAGES)[number];
export const RIPE = STAGES.length - 1;

/** Which berry grows on each of the map's plots: the berries in order, left to right and top to bottom; the plots after them are empty soil. */
export const FARM_TREES = BERRIES.map((berry, i) => ({ berry: berry.id, plot: BERRY_FARM_MAP.plots[i]! }));

/** The farm as the account keeps it: when each berry's tree was planted (ms since the epoch). */
export interface BerryFarm {
  planted: Record<string, number>;
}

/**
 * The account's farm (its saved one, if any, as JSON), with a tree of every berry: a tree it doesn't have yet is planted
 * now, set back by 0, ¼, ½, ¾ or all of GROW_MS in turn, so a new farm has a fifth of its trees ripe and the others
 * ripening over the hours after.
 */
export function farmOf(saved: unknown, now: number): BerryFarm {
  const planted = { ...((saved as Partial<BerryFarm> | null)?.planted ?? {}) };
  BERRIES.forEach((b, i) => {
    if (typeof planted[b.id] !== 'number') planted[b.id] = now - (((i * 3) % 5) / 4) * GROW_MS;
  });
  return { planted };
}

/** A tree's stage (an index into STAGES) at `now`. */
export const stageAt = (plantedAt: number, now: number) => Math.max(0, Math.min(RIPE, Math.floor((now - plantedAt) / (GROW_MS / RIPE))));

/** When a tree planted at `plantedAt` has its berries. */
export const ripeAt = (plantedAt: number) => plantedAt + GROW_MS;

/** Each tree's berry, plot, stage and when it's ripe, for the farm's map. */
export function farmView(farm: BerryFarm, now: number) {
  return FARM_TREES.map(({ berry, plot }) => {
    const plantedAt = farm.planted[berry] ?? now;
    return { berry, plot, stage: stageAt(plantedAt, now), ripeAt: ripeAt(plantedAt) };
  });
}

/**
 * Picks a ripe tree: its berries (between the berry's least and most a tree gives, at random) and the farm with the
 * tree planted again now. Throws if the berry isn't on the farm or its tree isn't ripe.
 */
export function harvest(farm: BerryFarm, berry: string, now: number, rng: Rng): { farm: BerryFarm; count: number } {
  const info = BERRIES.find((b) => b.id === berry);
  const plantedAt = farm.planted[berry];
  if (!info || plantedAt === undefined) throw new Error(`No ${berry} tree on the farm`);
  if (stageAt(plantedAt, now) < RIPE) throw new Error(`The ${info.name} tree isn't ripe yet`);
  return { farm: { planted: { ...farm.planted, [berry]: now } }, count: between(rng, info.minYield, info.maxYield) };
}

/** An account's berries (its saved ones, as JSON): a count per berry id, only the ones it has. */
export function berriesOf(saved: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries((saved as Record<string, unknown> | null) ?? {})) {
    if (typeof n === 'number' && n > 0 && BERRIES.some((b) => b.id === id)) out[id] = Math.floor(n);
  }
  return out;
}
