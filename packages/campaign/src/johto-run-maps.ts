// The Johto run types' maps (RunMaps, run-type-info.ts): each gym run's route and gym, from HeartGold/SoulSilver
// (johto-routes.ts, johto-gyms.ts), and the Gym Challenge's and Champion run's rooms. A file of its own so the site loads
// it only for a Johto run (loadRunMaps).
import { AZALEA_GYM, BLACKTHORN_GYM, CIANWOOD_GYM, ECRUTEAK_GYM, GOLDENROD_GYM, JOHTO_BOSS_ROOMS, JOHTO_POKEMON_CENTER, MAHOGANY_GYM, OLIVINE_GYM, VIOLET_GYM } from './johto-gyms.js';
import { ROUTE_30, ROUTE_32, ROUTE_34, ROUTE_35, ROUTE_40, ROUTE_42, ROUTE_42_UPPER, ROUTE_44, ROUTE_44_UPPER, ROUTE_45 } from './johto-routes.js';
import { bossMaps, RUN_TYPE_INFO, type RunMaps } from './run-type-info.js';

export const JOHTO_RUN_MAPS = {
  violet: { routes: [ROUTE_30], gym: VIOLET_GYM },
  azalea: { routes: [ROUTE_32], gym: AZALEA_GYM },
  goldenrod: { routes: [ROUTE_34], gym: GOLDENROD_GYM },
  ecruteak: { routes: [ROUTE_35], gym: ECRUTEAK_GYM },
  cianwood: { routes: [ROUTE_40], gym: CIANWOOD_GYM },
  olivine: { routes: [ROUTE_42, ROUTE_42_UPPER], gym: OLIVINE_GYM },
  mahogany: { routes: [ROUTE_44, ROUTE_44_UPPER], gym: MAHOGANY_GYM },
  blackthorn: { routes: [ROUTE_45], gym: BLACKTHORN_GYM },
  johtoGyms: bossMaps(RUN_TYPE_INFO.johtoGyms.segments, JOHTO_BOSS_ROOMS, JOHTO_POKEMON_CENTER),
  johtoChampion: bossMaps(RUN_TYPE_INFO.johtoChampion.segments, JOHTO_BOSS_ROOMS, JOHTO_POKEMON_CENTER),
} satisfies Record<string, RunMaps>;
