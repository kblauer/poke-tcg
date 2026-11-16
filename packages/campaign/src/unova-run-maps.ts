// The Unova run types' maps (RunMaps, run-type-info.ts): each gym run's maps and gym, from Pokémon Black (unova-routes.ts,
// unova-gyms.ts; the maps proposed in issue #231, agreed with the user 2026-11-16), and the Gym Challenge's and Champion
// run's rooms. A file of its own so the site loads it only for a Unova run (loadRunMaps).
import { CASTELIA_GYM, DRIFTVEIL_GYM, ICIRRUS_GYM, MISTRALTON_GYM, NACRENE_GYM, NIMBASA_GYM, OPELUCID_GYM, STRIATON_GYM, UNOVA_BOSS_ROOMS, UNOVA_POKEMON_CENTER } from './unova-gyms.js';
import {
  CHARGESTONE_CAVE,
  COLD_STORAGE,
  PINWHEEL_FOREST,
  TWIST_MOUNTAIN,
  UNOVA_ROUTE_1,
  UNOVA_ROUTE_2,
  UNOVA_ROUTE_3,
  UNOVA_ROUTE_4,
  UNOVA_ROUTE_5,
  UNOVA_ROUTE_6,
  UNOVA_ROUTE_7,
  UNOVA_ROUTE_8,
  UNOVA_ROUTE_9,
  WELLSPRING_CAVE,
} from './unova-routes.js';
import { bossMaps, RUN_TYPE_INFO, type RunMaps } from './run-type-info.js';

export const UNOVA_RUN_MAPS = {
  striaton: { routes: [UNOVA_ROUTE_1, UNOVA_ROUTE_2], gym: STRIATON_GYM },
  nacrene: { routes: [UNOVA_ROUTE_3, WELLSPRING_CAVE], gym: NACRENE_GYM },
  castelia: { routes: [PINWHEEL_FOREST], gym: CASTELIA_GYM },
  nimbasa: { routes: [UNOVA_ROUTE_4], gym: NIMBASA_GYM },
  driftveil: { routes: [UNOVA_ROUTE_5, COLD_STORAGE], gym: DRIFTVEIL_GYM },
  mistralton: { routes: [UNOVA_ROUTE_6, CHARGESTONE_CAVE], gym: MISTRALTON_GYM },
  icirrus: { routes: [UNOVA_ROUTE_7, TWIST_MOUNTAIN], gym: ICIRRUS_GYM },
  opelucid: { routes: [UNOVA_ROUTE_8, UNOVA_ROUTE_9], gym: OPELUCID_GYM },
  unovaGyms: bossMaps(RUN_TYPE_INFO.unovaGyms.segments, UNOVA_BOSS_ROOMS, UNOVA_POKEMON_CENTER),
  unovaChampion: bossMaps(RUN_TYPE_INFO.unovaChampion.segments, UNOVA_BOSS_ROOMS, UNOVA_POKEMON_CENTER),
} satisfies Record<string, RunMaps>;
