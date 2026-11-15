// The Kanto run types' maps (RunMaps, run-type-info.ts): each gym run's routes and gym (kanto-routes.ts), and the Gym
// Challenge's and Champion run's rooms. A file of its own so the site loads it only for a Kanto run (loadRunMaps).
import { CELADON_GYM, CERULEAN_GYM, CINNABAR_GYM, FUCHSIA_GYM, KANTO_BOSS_ROOMS, PEWTER_GYM, POKEMON_CENTER, POKEMON_TOWER_1F, POKEMON_TOWER_2F, POKEMON_TOWER_3F, POKEMON_TOWER_4F, POKEMON_TOWER_5F, POWER_PLANT, ROUTE_17, ROUTE_2, ROUTE_20, ROUTE_4, ROUTE_5, ROUTE_6, ROUTE_8, SAFFRON_GYM, VERMILION_GYM, VIRIDIAN_GYM } from './kanto-routes.js';
import { bossMaps, RUN_TYPE_INFO, type RunMaps } from './run-type-info.js';

export const KANTO_RUN_MAPS = {
  pewter: { routes: [ROUTE_2], gym: PEWTER_GYM },
  cerulean: { routes: [ROUTE_4], gym: CERULEAN_GYM },
  vermilion: { routes: [ROUTE_5, ROUTE_6], gym: VERMILION_GYM },
  celadon: { routes: [ROUTE_8], gym: CELADON_GYM },
  saffron: { routes: [POKEMON_TOWER_1F, POKEMON_TOWER_2F, POKEMON_TOWER_3F, POKEMON_TOWER_4F, POKEMON_TOWER_5F], gym: SAFFRON_GYM },
  fuchsia: { routes: [ROUTE_17], gym: FUCHSIA_GYM },
  cinnabar: { routes: [ROUTE_20], gym: CINNABAR_GYM },
  viridian: { routes: [POWER_PLANT], gym: VIRIDIAN_GYM },
  kantoGyms: bossMaps(RUN_TYPE_INFO.kantoGyms.segments, KANTO_BOSS_ROOMS, POKEMON_CENTER),
  kantoChampion: bossMaps(RUN_TYPE_INFO.kantoChampion.segments, KANTO_BOSS_ROOMS, POKEMON_CENTER),
} satisfies Record<string, RunMaps>;
