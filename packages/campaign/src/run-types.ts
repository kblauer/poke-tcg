// The kinds of run a player can pick, for each generation: one per gym, all eight gyms in a row, and the whole League.
// A run is made of segments: some encounters to choose from (or a Pokémon Center), then (before a gym leader, unless the
// segment leaves them out) a Gym Trainer that must be fought, then the segment's bosses one after another. The run is
// beaten with its last boss. A run type can have a route (routes.ts): the map its run screen shows, a spot per step.
// Each belongs to a generation, whose booster packs its runs unlock (GENERATIONS); the Gym Challenge needs the
// generation's badges and the Champion run a beaten Gym Challenge (runTypeLock).
import type { EnergyType } from '@poke-tcg/game-engine';
import { BOSSES, boss, ELITE_FOUR, HOENN_ELITE_FOUR, HOENN_GYMS, JOHTO_ELITE_FOUR, JOHTO_GYMS, KANTO_GYMS, type Boss, type BossId } from './bosses.js';
import { GEN1_DECK_RULES, GEN2_DECK_RULES, GEN3_DECK_RULES, type DeckRules } from './decks.js';
import { basicEnergyType, GEN2_DONE_SETS, GEN2_SETS, GEN3_DONE_SETS, GEN3_SETS, POOL_SETS } from './pool.js';
import { DEWFORD_GYM, FORTREE_GYM, HOENN_BOSS_ROOMS, HOENN_POKEMON_CENTER, LAVARIDGE_GYM, MAUVILLE_GYM, MOSSDEEP_GYM, PETALBURG_GYM, RUSTBORO_GYM, SOOTOPOLIS_GYM } from './hoenn-gyms.js';
import { JAGGED_PASS, PETALBURG_WOODS, ROUTE_102, ROUTE_106, ROUTE_110, ROUTE_119, ROUTE_124, SOOTOPOLIS_CITY } from './hoenn-routes.js';
import { CELADON_GYM, CERULEAN_GYM, CINNABAR_GYM, FUCHSIA_GYM, KANTO_BOSS_ROOMS, POKEMON_CENTER, POKEMON_TOWER_1F, POKEMON_TOWER_2F, POKEMON_TOWER_3F, POKEMON_TOWER_4F, POKEMON_TOWER_5F, POWER_PLANT, ROUTE_17, ROUTE_20, ROUTE_8, ROUTE_4, ROUTE_5_VERMILION, ROUTE_6, SAFFRON_GYM, VERMILION_GYM, VIRIDIAN_GYM } from './kanto-routes.js';
import { AZALEA_GYM, BLACKTHORN_GYM, CIANWOOD_GYM, ECRUTEAK_GYM, GOLDENROD_GYM, JOHTO_BOSS_ROOMS, JOHTO_POKEMON_CENTER, MAHOGANY_GYM, OLIVINE_GYM, VIOLET_GYM } from './johto-gyms.js';
import { ROUTE_30, ROUTE_32, ROUTE_34, ROUTE_35, ROUTE_40, ROUTE_42, ROUTE_44, ROUTE_45 } from './johto-routes.js';
import { PEWTER_GYM, ROUTE_2, type Route } from './routes.js';

export interface RunSegment {
  /** Steps with 2–3 encounters to choose from. */
  steps: number;
  /** A Pokémon Center step (its only option) after the encounters, before the bosses. */
  center?: boolean;
  /** Fought in order, after the steps. A gym leader has a Gym Trainer before them, unless `gymTrainers` is false. */
  bosses: BossId[];
  gymTrainers?: boolean;
}

export interface RunType {
  id: string;
  name: string;
  description: string;
  segments: RunSegment[];
  /** The generation it belongs to (a key of GENERATIONS). */
  generation: number;
  /** What unlocks it, if it isn't open from the start: every gym badge of its generation, or a beaten Gym Challenge. */
  requires?: 'badges' | 'gymChallenge';
  /**
   * The routes its run screen shows, one after another, a spot for each encounter step (routes.ts); runs without them show
   * the icon map. Going from one to the next, the player fades out (at the route's `exit`, if it has one) and back in at
   * the next one's `entrance`.
   */
  routes?: Route[];
  /** The gym's interior, for the steps after the route's spots (the Gym Trainer and the gym leader). */
  gym?: Route;
}

/**
 * One gym: 24 encounters, the Gym Trainer, then the gym leader (the 26th fight). `place`: "City" or "Town". With `maps` (its
 * routes and gym interior, routes.ts), one encounter per route spot instead (agreed with the user: 10), then the gym
 * (FireRed's in Kanto, kanto-routes.ts; HeartGold/SoulSilver's in Johto, johto-gyms.ts; Emerald's in Hoenn, hoenn-gyms.ts).
 */
const gymRun = (id: BossId, city: string, generation: number, place = 'City', maps?: { routes: Route[]; gym?: Route; along?: string }) => {
  const b = boss(id);
  const leader = `${b.title} ${b.name} with the ${b.deckName} deck`;
  const encounters = maps ? maps.routes.reduce((n, r) => n + r.spots.length, 0) : 24;
  // Where the encounters are: the maps' names, or `along` for several of one place (the Pokémon Tower's floors).
  const along = maps?.along ?? maps?.routes.map((r) => r.name).join(' and ');
  return {
    id: city.toLowerCase(),
    name: `${city} ${place}`,
    description: maps
      ? `Along ${along}: ${encounters} encounters, then ${maps.gym?.name ?? 'the gym'}: a Gym Trainer, and ${leader}.`
      : `Trainers and encounters around ${city} ${place}, then the gym: a Gym Trainer, and ${leader}.`,
    segments: [{ steps: encounters, bosses: [id] }],
    generation,
    ...(maps && { routes: maps.routes, ...(maps.gym && { gym: maps.gym }) }),
  };
};

/**
 * The maps of a run of bosses back to back (the Gym Challenge and Champion runs; agreed with the user), one per step in
 * order: each boss's room (`rooms`: KANTO_BOSS_ROOMS, JOHTO_BOSS_ROOMS or HOENN_BOSS_ROOMS), and the Pokémon Center's (`center`) for a
 * segment's `center`.
 */
const bossMaps = (segments: RunSegment[], rooms: Record<string, Route> = KANTO_BOSS_ROOMS, center: Route = POKEMON_CENTER): Route[] =>
  segments.flatMap((s) => [...(s.center ? [center] : []), ...s.bosses.map((id) => rooms[id]!)]);

/** A Gym Challenge (agreed with the user): the eight gym leaders back to back, no Gym Trainers, a Pokémon Center after the fourth. */
const gymChallenge = (gyms: BossId[]): RunSegment[] => [
  { steps: 0, bosses: gyms.slice(0, 4), gymTrainers: false },
  { steps: 0, center: true, bosses: gyms.slice(4), gymTrainers: false },
];

export const RUN_TYPES = {
  // Each Kanto gym's route and interior (agreed with the user): 10 encounters, one at each route spot, then the gym.
  pewter: gymRun('brock', 'Pewter', 1, 'City', { routes: [ROUTE_2], gym: PEWTER_GYM }),
  cerulean: gymRun('misty', 'Cerulean', 1, 'City', { routes: [ROUTE_4], gym: CERULEAN_GYM }),
  // Route 5 to Saffron's north gatehouse, then Route 6 from its south gate (agreed with the user): 3 encounters, then 7.
  vermilion: gymRun('surge', 'Vermilion', 1, 'City', { routes: [ROUTE_5_VERMILION, ROUTE_6], gym: VERMILION_GYM }),
  celadon: gymRun('erika', 'Celadon', 1, 'City', { routes: [ROUTE_8], gym: CELADON_GYM }),
  // Saffron before Fuchsia (agreed with the user): Pokémon Tower 1F to 5F, 2 encounters a floor, then the gym.
  saffron: gymRun('sabrina', 'Saffron', 1, 'City', { routes: [POKEMON_TOWER_1F, POKEMON_TOWER_2F, POKEMON_TOWER_3F, POKEMON_TOWER_4F, POKEMON_TOWER_5F], gym: SAFFRON_GYM, along: 'the Pokémon Tower, 1F to 5F' }),
  // The Cycling Road on a bike, most trainers Bikers (agreed with the user).
  fuchsia: gymRun('koga', 'Fuchsia', 1, 'City', { routes: [ROUTE_17], gym: FUCHSIA_GYM }),
  // Surfing Route 20, Swimmers in the water and one trainer on land by the Seafoam Islands (agreed with the user).
  cinnabar: gymRun('blaine', 'Cinnabar', 1, 'City', { routes: [ROUTE_20], gym: CINNABAR_GYM }),
  // The Power Plant, most trainers Team Rocket Grunts (agreed with the user).
  viridian: gymRun('giovanni', 'Viridian', 1, 'City', { routes: [POWER_PLANT], gym: VIRIDIAN_GYM }),
  kantoGyms: {
    id: 'kantoGyms',
    name: 'Kanto Gym Challenge',
    description: 'All eight Kanto gym leaders back to back, Brock to Giovanni, with a Pokémon Center after the fourth.',
    segments: gymChallenge(KANTO_GYMS),
    generation: 1,
    requires: 'badges',
    routes: bossMaps(gymChallenge(KANTO_GYMS)),
  },
  kantoChampion: {
    id: 'kantoChampion',
    name: 'Kanto Champion',
    description: 'All eight Kanto gym leaders, the Elite Four and Champion Blue, back to back.',
    segments: [{ steps: 0, bosses: [...KANTO_GYMS, ...ELITE_FOUR, 'blue'], gymTrainers: false }],
    generation: 1,
    requires: 'gymChallenge',
    routes: bossMaps([{ steps: 0, bosses: [...KANTO_GYMS, ...ELITE_FOUR, 'blue'], gymTrainers: false }]),
  },
  // Each Johto gym's route and interior, from HeartGold/SoulSilver (johto-routes.ts, johto-gyms.ts; agreed with the user): 10 encounters, then the gym.
  violet: gymRun('falkner', 'Violet', 2, 'City', { routes: [ROUTE_30], gym: VIOLET_GYM }),
  azalea: gymRun('bugsy', 'Azalea', 2, 'Town', { routes: [ROUTE_32], gym: AZALEA_GYM }),
  goldenrod: gymRun('whitney', 'Goldenrod', 2, 'City', { routes: [ROUTE_34], gym: GOLDENROD_GYM }),
  ecruteak: gymRun('morty', 'Ecruteak', 2, 'City', { routes: [ROUTE_35], gym: ECRUTEAK_GYM }),
  // Made up: a surf route, a cave with a waterfall, an ice cave in two areas (generate_johto.py).
  cianwood: gymRun('chuck', 'Cianwood', 2, 'City', { routes: [ROUTE_40], gym: CIANWOOD_GYM }),
  olivine: gymRun('jasmine', 'Olivine', 2, 'City', { routes: [ROUTE_42], gym: OLIVINE_GYM }),
  mahogany: gymRun('pryce', 'Mahogany', 2, 'Town', { routes: [ROUTE_44], gym: MAHOGANY_GYM }),
  blackthorn: gymRun('clair', 'Blackthorn', 2, 'City', { routes: [ROUTE_45], gym: BLACKTHORN_GYM }),
  johtoGyms: {
    id: 'johtoGyms',
    name: 'Johto Gym Challenge',
    description: 'All eight Johto gym leaders back to back, Falkner to Clair, with a Pokémon Center after the fourth.',
    segments: gymChallenge(JOHTO_GYMS),
    routes: bossMaps(gymChallenge(JOHTO_GYMS), JOHTO_BOSS_ROOMS, JOHTO_POKEMON_CENTER),
    generation: 2,
    requires: 'badges',
  },
  johtoChampion: {
    id: 'johtoChampion',
    name: 'Johto Champion',
    description: 'All eight Johto gym leaders, the Elite Four and Champion Lance, back to back.',
    segments: [{ steps: 0, bosses: [...JOHTO_GYMS, ...JOHTO_ELITE_FOUR, 'johto-lance'], gymTrainers: false }],
    routes: bossMaps([{ steps: 0, bosses: [...JOHTO_GYMS, ...JOHTO_ELITE_FOUR, 'johto-lance'], gymTrainers: false }], JOHTO_BOSS_ROOMS, JOHTO_POKEMON_CENTER),
    generation: 2,
    requires: 'gymChallenge',
  },
  // Each Hoenn gym's map and interior, from Emerald (hoenn-routes.ts, hoenn-gyms.ts): 10 encounters, then the gym, in the
  // order Emerald visits them. Dewford's and Mossdeep's routes and Sootopolis are surfed, Route 110 ridden on a bike.
  rustboro: gymRun('roxanne', 'Rustboro', 3, 'City', { routes: [PETALBURG_WOODS], gym: RUSTBORO_GYM }),
  dewford: gymRun('brawly', 'Dewford', 3, 'Town', { routes: [ROUTE_106], gym: DEWFORD_GYM }),
  mauville: gymRun('wattson', 'Mauville', 3, 'City', { routes: [ROUTE_110], gym: MAUVILLE_GYM }),
  lavaridge: gymRun('flannery', 'Lavaridge', 3, 'Town', { routes: [JAGGED_PASS], gym: LAVARIDGE_GYM }),
  petalburg: gymRun('norman', 'Petalburg', 3, 'City', { routes: [ROUTE_102], gym: PETALBURG_GYM }),
  fortree: gymRun('winona', 'Fortree', 3, 'City', { routes: [ROUTE_119], gym: FORTREE_GYM }),
  mossdeep: gymRun('tate-liza', 'Mossdeep', 3, 'City', { routes: [ROUTE_124], gym: MOSSDEEP_GYM }),
  sootopolis: gymRun('juan', 'Sootopolis', 3, 'City', { routes: [SOOTOPOLIS_CITY], gym: SOOTOPOLIS_GYM }),
  hoennGyms: {
    id: 'hoennGyms',
    name: 'Hoenn Gym Challenge',
    description: 'All eight Hoenn gym leaders back to back, Roxanne to Juan, with a Pokémon Center after the fourth.',
    segments: gymChallenge(HOENN_GYMS),
    routes: bossMaps(gymChallenge(HOENN_GYMS), HOENN_BOSS_ROOMS, HOENN_POKEMON_CENTER),
    generation: 3,
    requires: 'badges',
  },
  hoennChampion: {
    id: 'hoennChampion',
    name: 'Hoenn Champion',
    description: 'All eight Hoenn gym leaders, the Elite Four and Champion Wallace, back to back.',
    segments: [{ steps: 0, bosses: [...HOENN_GYMS, ...HOENN_ELITE_FOUR, 'wallace'], gymTrainers: false }],
    routes: bossMaps([{ steps: 0, bosses: [...HOENN_GYMS, ...HOENN_ELITE_FOUR, 'wallace'], gymTrainers: false }], HOENN_BOSS_ROOMS, HOENN_POKEMON_CENTER),
    generation: 3,
    requires: 'gymChallenge',
  },
} satisfies Record<string, RunType>;

export type RunTypeId = keyof typeof RUN_TYPES;
export const RUN_TYPE_IDS = Object.keys(RUN_TYPES) as RunTypeId[];

/** The run a new account starts in. */
export const FIRST_RUN: RunTypeId = 'celadon';

export const runType = (id: string): RunType => {
  const type = (RUN_TYPES as Record<string, RunType>)[id];
  if (!type) throw new Error(`Unknown run type: ${id}`);
  return type;
};

/** The run's bosses in order; the last one beats the run. */
export const runBosses = (type: RunType): Boss[] => type.segments.flatMap((s) => s.bosses.map(boss));

/** The boss that ends the run. */
export const finalBoss = (type: RunType): Boss => runBosses(type).at(-1)!;

/** For the picker: who the run's bosses are, e.g. "Gym Leader Brock" or "8 gym leaders, the Elite Four and Champion Blue". */
export function bossSummary(type: RunType): string {
  const bosses = runBosses(type);
  if (bosses.length === 1) return `${bosses[0]!.title} ${bosses[0]!.name}`;
  const gyms = bosses.filter((b) => b.kind === 'gymLeader').length;
  const champion = bosses.find((b) => b.kind === 'champion');
  return `${gyms} gym leaders${champion ? `, the Elite Four and Champion ${champion.name}` : ''}`;
}

/**
 * A generation of runs (agreed with the user): its region, its gyms (whose badges unlock its Gym Challenge), its Gym
 * Challenge run (beating it unlocks its Champion run), and its sets' booster packs in release order. An account starts
 * with no packs: the first battle finished without conceding in a run unlocks the generation's next pack, and beating
 * a run of the generation unlocks them all. Gen 2 (Neo Genesis onwards) and Gen 3 (the EX sets) come with their runs.
 */
export interface Generation {
  region: string;
  gyms: BossId[];
  gymChallenge: RunTypeId;
  packs: string[];
  /**
   * The sets its runs' cards come from (offered, sold, and in trainers' decks), only the cards the engine plays fully from
   * `implementedSets` (those whose effects are done: every set of all three generations, so far), and how its random decks are made.
   */
  poolSets: string[];
  implementedSets: string[];
  deckRules: DeckRules;
}

export const GENERATIONS: Record<number, Generation> = {
  1: {
    region: 'Kanto',
    gyms: KANTO_GYMS,
    gymChallenge: 'kantoGyms',
    packs: ['base1', 'base2', 'basep', 'base3', 'base4', 'base5', 'gym1', 'gym2', 'lc'],
    poolSets: POOL_SETS,
    implementedSets: POOL_SETS,
    deckRules: GEN1_DECK_RULES,
  },
  2: { region: 'Johto', gyms: JOHTO_GYMS, gymChallenge: 'johtoGyms', packs: GEN2_SETS, poolSets: GEN2_SETS, implementedSets: GEN2_DONE_SETS, deckRules: GEN2_DECK_RULES },
  3: { region: 'Hoenn', gyms: HOENN_GYMS, gymChallenge: 'hoennGyms', packs: GEN3_SETS, poolSets: GEN3_SETS, implementedSets: GEN3_DONE_SETS, deckRules: GEN3_DECK_RULES },
};

/** Every generation's booster packs, by generation (GENERATIONS'), for the Packs tab. */
export const PACK_GENERATIONS: Record<number, { region: string; packs: string[] }> = Object.fromEntries(
  Object.entries(GENERATIONS).map(([id, g]) => [id, { region: g.region, packs: g.packs }]),
);

/** The generation a run type belongs to. */
export const runGeneration = (typeId: string): Generation => generation(runType(typeId).generation);

export const generation = (id: number): Generation => {
  const g = GENERATIONS[id];
  if (!g) throw new Error(`Unknown generation: ${id}`);
  return g;
};

/** The badges (key item ids) of a generation's gyms. */
export const generationBadges = (g: Generation) => g.gyms.map((id) => boss(id).gym!.badge);

/** The next pack a run of the generation unlocks: its first set not unlocked yet, or null when all are. */
export const nextPack = (g: Generation, unlocked: ReadonlySet<string>) => g.packs.find((id) => !unlocked.has(id)) ?? null;

/**
 * Why a run type can't be started yet, or null if it can: the Gym Challenge needs every badge of its generation (key
 * items the account has, `badges`), and the Champion run its generation's Gym Challenge beaten (`beaten`: run types won).
 */
export function runTypeLock(type: RunType, account: { badges: ReadonlySet<string>; beaten: ReadonlySet<string> }): string | null {
  const g = generation(type.generation);
  if (type.requires === 'badges') {
    const missing = generationBadges(g).filter((b) => !account.badges.has(b)).length;
    return missing ? `Earn all ${g.gyms.length} ${g.region} badges first (${missing} to go)` : null;
  }
  if (type.requires === 'gymChallenge' && !account.beaten.has(g.gymChallenge)) return `Beat the ${runType(g.gymChallenge).name} first`;
  return null;
}

/** The types a boss's deck is built around: the ones it names (`types`), or its basic Energy's, the most first. */
export function bossTypes(b: Boss): EnergyType[] {
  if (b.types) return b.types;
  return b.deck
    .filter(([id]) => basicEnergyType(id))
    .sort((x, y) => y[1] - x[1])
    .map(([id]) => basicEnergyType(id)!);
}

/** Every boss id, for checks. */
export const BOSS_IDS = Object.keys(BOSSES) as BossId[];
