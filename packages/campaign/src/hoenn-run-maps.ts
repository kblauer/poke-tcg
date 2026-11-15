// The Hoenn run types' maps (RunMaps, run-type-info.ts): each gym run's map and gym, from Emerald (hoenn-routes.ts,
// hoenn-gyms.ts), and the Gym Challenge's and Champion run's rooms. A file of its own so the site loads it only for a
// Hoenn run (loadRunMaps).
import { DEWFORD_GYM, FORTREE_GYM, HOENN_BOSS_ROOMS, HOENN_POKEMON_CENTER, LAVARIDGE_GYM, MAUVILLE_GYM, MOSSDEEP_GYM, PETALBURG_GYM, RUSTBORO_GYM, SOOTOPOLIS_GYM } from './hoenn-gyms.js';
import { JAGGED_PASS, PETALBURG_WOODS, ROUTE_102, ROUTE_106, ROUTE_110, ROUTE_119, ROUTE_124, SOOTOPOLIS_CITY } from './hoenn-routes.js';
import { bossMaps, RUN_TYPE_INFO, type RunMaps } from './run-type-info.js';

export const HOENN_RUN_MAPS = {
  rustboro: { routes: [PETALBURG_WOODS], gym: RUSTBORO_GYM },
  dewford: { routes: [ROUTE_106], gym: DEWFORD_GYM },
  mauville: { routes: [ROUTE_110], gym: MAUVILLE_GYM },
  lavaridge: { routes: [JAGGED_PASS], gym: LAVARIDGE_GYM },
  petalburg: { routes: [ROUTE_102], gym: PETALBURG_GYM },
  fortree: { routes: [ROUTE_119], gym: FORTREE_GYM },
  mossdeep: { routes: [ROUTE_124], gym: MOSSDEEP_GYM },
  sootopolis: { routes: [SOOTOPOLIS_CITY], gym: SOOTOPOLIS_GYM },
  hoennGyms: bossMaps(RUN_TYPE_INFO.hoennGyms.segments, HOENN_BOSS_ROOMS, HOENN_POKEMON_CENTER),
  hoennChampion: bossMaps(RUN_TYPE_INFO.hoennChampion.segments, HOENN_BOSS_ROOMS, HOENN_POKEMON_CENTER),
} satisfies Record<string, RunMaps>;
