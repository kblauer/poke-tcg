// The kinds of run a player can pick (run-type-info.ts: their names, generations, segments and bosses) with their maps
// (each region's run maps: kanto-run-maps.ts, johto-run-maps.ts, hoenn-run-maps.ts, sinnoh-run-maps.ts,
// unova-run-maps.ts), for the
// server and the runs' rules, which need every map at hand. The site reads run-type-info.ts's exports (RUN_TYPE_INFO,
// runTypeInfo) and loads a run's maps with loadRunMaps, so its pages never hold every region's tile maps.
import { HOENN_RUN_MAPS } from './hoenn-run-maps.js';
import { JOHTO_RUN_MAPS } from './johto-run-maps.js';
import { KANTO_RUN_MAPS } from './kanto-run-maps.js';
import type { Route } from './routes.js';
import { RUN_TYPE_IDS, RUN_TYPE_INFO, type RunMaps, type RunTypeId, type RunTypeInfo } from './run-type-info.js';
import { SINNOH_RUN_MAPS } from './sinnoh-run-maps.js';
import { UNOVA_RUN_MAPS } from './unova-run-maps.js';

export * from './run-type-info.js';

export interface RunType extends RunTypeInfo {
  /**
   * The routes its run screen shows, one after another, a spot for each encounter step (routes.ts); runs without them show
   * the icon map. Going from one to the next, the player fades out (at the route's `exit`, if it has one) and back in at
   * the next one's `entrance`.
   */
  routes?: Route[];
  /** The gym's interior, for the steps after the route's spots (the Gym Trainer and the gym leader). */
  gym?: Route;
}

/** Every run type's maps: a region's file missing one fails to compile. */
const RUN_MAPS: Record<RunTypeId, RunMaps> = { ...KANTO_RUN_MAPS, ...JOHTO_RUN_MAPS, ...HOENN_RUN_MAPS, ...SINNOH_RUN_MAPS, ...UNOVA_RUN_MAPS };

export const RUN_TYPES = Object.fromEntries(RUN_TYPE_IDS.map((id) => [id, { ...RUN_TYPE_INFO[id], ...RUN_MAPS[id] }])) as Record<RunTypeId, RunType>;

export const runType = (id: string): RunType => {
  const type = (RUN_TYPES as Record<string, RunType>)[id];
  if (!type) throw new Error(`Unknown run type: ${id}`);
  return type;
};
