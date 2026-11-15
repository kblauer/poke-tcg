// The Sinnoh run types' maps (RunMaps, run-type-info.ts): each gym run's maps and gym, from Diamond and Pearl
// (sinnoh-routes.ts, sinnoh-gyms.ts), and the Gym Challenge's and Champion run's rooms. A file of its own so the site
// loads it only for a Sinnoh run (loadRunMaps).
import { CANALAVE_GYM, ETERNA_GYM, HEARTHOME_GYM, OREBURGH_GYM, PASTORIA_GYM, SINNOH_BOSS_ROOMS, SINNOH_POKEMON_CENTER, SNOWPOINT_GYM, SUNYSHORE_GYM, VEILSTONE_GYM } from './sinnoh-gyms.js';
import { ACUITY_LAKEFRONT, ETERNA_FOREST, HOTEL_GRAND_LAKE, IRON_ISLAND_B1F, IRON_ISLAND_B2F, IRON_ISLAND_B3F, OREBURGH_GATE, ROUTE_203, ROUTE_205, ROUTE_212, ROUTE_213, ROUTE_215, ROUTE_217, ROUTE_222, VALOR_LAKEFRONT } from './sinnoh-routes.js';
import { bossMaps, RUN_TYPE_INFO, type RunMaps } from './run-type-info.js';

export const SINNOH_RUN_MAPS = {
  oreburgh: { routes: [ROUTE_203, OREBURGH_GATE], gym: OREBURGH_GYM },
  eterna: { routes: [ETERNA_FOREST, ROUTE_205], gym: ETERNA_GYM },
  veilstone: { routes: [ROUTE_215], gym: VEILSTONE_GYM },
  pastoria: { routes: [VALOR_LAKEFRONT, ROUTE_213], gym: PASTORIA_GYM },
  hearthome: { routes: [ROUTE_212], gym: HEARTHOME_GYM },
  canalave: { routes: [IRON_ISLAND_B1F, IRON_ISLAND_B2F, IRON_ISLAND_B3F], gym: CANALAVE_GYM },
  snowpoint: { routes: [ROUTE_217, ACUITY_LAKEFRONT], gym: SNOWPOINT_GYM },
  sunyshore: { routes: [HOTEL_GRAND_LAKE, ROUTE_222], gym: SUNYSHORE_GYM },
  sinnohGyms: bossMaps(RUN_TYPE_INFO.sinnohGyms.segments, SINNOH_BOSS_ROOMS, SINNOH_POKEMON_CENTER),
  sinnohChampion: bossMaps(RUN_TYPE_INFO.sinnohChampion.segments, SINNOH_BOSS_ROOMS, SINNOH_POKEMON_CENTER),
} satisfies Record<string, RunMaps>;
