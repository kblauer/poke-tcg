// The kinds of run a player can pick, for each generation, without their maps: one per gym, all eight gyms in a row, and
// the whole League. A run is made of segments: some encounters to choose from (or a Pokémon Center), then (before a gym
// leader, unless the segment leaves them out) a Gym Trainer that must be fought, then the segment's bosses one after
// another. The run is beaten with its last boss. Each belongs to a generation, whose booster packs its runs unlock
// (GENERATIONS); the Gym Challenge needs the generation's badges and the Champion run a beaten Gym Challenge, and every
// run of a generation the Gym Challenge of the one before it (generationLock, runTypeLock).
//
// A run type's maps (its routes and gym interior, routes.ts) are in its region's file (kanto-run-maps.ts,
// johto-run-maps.ts, hoenn-run-maps.ts, sinnoh-run-maps.ts): run-types.ts joins them to these for the server, which
// needs every map at hand (RUN_TYPES, runType), and the site loads only the region it shows (loadRunMaps), so the run
// picker and the other pages that name a run type never load a tile map (apps/web/scripts/check-dist.mjs checks it).
// Nothing here may import a region's maps but loadRunMaps' dynamic imports.
import type { EnergyType } from '@poke-tcg/game-engine';
import { BOSSES, boss, ELITE_FOUR, HOENN_ELITE_FOUR, HOENN_GYMS, JOHTO_ELITE_FOUR, JOHTO_GYMS, KANTO_GYMS, SINNOH_ELITE_FOUR, SINNOH_GYMS, type Boss, type BossId } from './bosses.js';
import { GEN1_DECK_RULES, GEN2_DECK_RULES, GEN3_DECK_RULES, GEN4_DECK_RULES, type DeckRules } from './decks.js';
import { BASIC_ENERGY, GEN2_BASIC_ENERGY, GEN2_DONE_SETS, GEN2_SETS, GEN3_BASIC_ENERGY, GEN3_DONE_SETS, GEN3_SETS, GEN4_BASIC_ENERGY, GEN4_DONE_SETS, GEN4_SETS, GEN5_SETS, POOL_SETS } from './pool.js';
import type { Route } from './routes.js';

/** `Id` narrows the bosses to a region's (KantoBossId…), so a run of bosses back to back can't miss one's room (bossMaps). */
export interface RunSegment<Id extends BossId = BossId> {
  /** Steps with 1–3 encounters to choose from. */
  steps: number;
  /** A Pokémon Center step (its only option) after the encounters, before the bosses. */
  center?: boolean;
  /** Fought in order, after the steps. A gym leader has a Gym Trainer before them, unless `gymTrainers` is false. */
  bosses: Id[];
  gymTrainers?: boolean;
}

/** A run type without its maps (RunType, run-types.ts, has them). */
export interface RunTypeInfo {
  id: string;
  name: string;
  description: string;
  segments: RunSegment[];
  /** The generation it belongs to (a key of GENERATIONS). */
  generation: number;
  /** What unlocks it, if it isn't open from the start: every gym badge of its generation, or a beaten Gym Challenge. */
  requires?: 'badges' | 'gymChallenge';
}

/**
 * A run type's maps: the routes its run screen shows, one after another, a spot for each encounter step (routes.ts).
 * Going from one to the next, the player fades out (at the route's `exit`, if it has one) and back in at the next one's
 * `entrance`. Then the gym's interior, for the steps after the route's spots (the Gym Trainer and the gym leader).
 */
export interface RunMaps {
  routes: Route[];
  gym?: Route;
}

/** A gym run's encounters (agreed with the user: 10), one per spot along its maps (run-types.test.ts checks they agree). */
const GYM_RUN_STEPS = 10;

/**
 * One gym: along its maps (its routes and gym interior: its region's run maps), one encounter per route spot, then the
 * gym (FireRed's in Kanto, HeartGold/SoulSilver's in Johto, Emerald's in Hoenn, Diamond and Pearl's in Sinnoh): the Gym
 * Trainer, then the gym leader. `place`: "City" or "Town". `along`: where the encounters are, the maps' names (a map's
 * two areas once: "Route 42"), or one name for several maps of one place ("Pokémon Tower"); run-types.test.ts checks it
 * against the maps.
 */
const gymRun = (id: BossId, city: string, generation: number, place: string, along: string): RunTypeInfo => {
  const b = boss(id);
  return {
    id: city.toLowerCase(),
    name: `${city} ${place}`,
    // Pared down and the same for every gym (the user's): the maps, the gym, the leader's deck.
    description: `${along}, ${city} Gym. ${b.name}'s "${b.deckName}" Deck.`,
    segments: [{ steps: GYM_RUN_STEPS, bosses: [id] }],
    generation,
  };
};

/**
 * The maps of a run of bosses back to back (the Gym Challenge and Champion runs; agreed with the user), one per step in
 * order: each boss's room (`rooms`: KANTO_BOSS_ROOMS, JOHTO_BOSS_ROOMS, HOENN_BOSS_ROOMS or SINNOH_BOSS_ROOMS, typed by
 * the region's boss ids so a missing room fails to compile), and the Pokémon Center's (`center`) for a segment's `center`.
 */
export const bossMaps = <Id extends BossId>(segments: RunSegment<Id>[], rooms: Record<Id, Route>, center: Route): RunMaps => ({
  routes: segments.flatMap((s) => [...(s.center ? [center] : []), ...s.bosses.map((id) => rooms[id])]),
});

/** A Gym Challenge (agreed with the user): the eight gym leaders back to back, no Gym Trainers, a Pokémon Center after the fourth. */
const gymChallenge = <Id extends BossId>(gyms: Id[]): RunSegment<Id>[] => [
  { steps: 0, bosses: gyms.slice(0, 4), gymTrainers: false },
  { steps: 0, center: true, bosses: gyms.slice(4), gymTrainers: false },
];

export const RUN_TYPE_INFO = {
  // Each Kanto gym's route and interior (agreed with the user): 10 encounters, one at each route spot, then the gym.
  pewter: gymRun('brock', 'Pewter', 1, 'City', 'Route 2'),
  cerulean: gymRun('misty', 'Cerulean', 1, 'City', 'Route 4'),
  // Route 5 to Saffron's north gatehouse, then Route 6 from its south gate (agreed with the user): 3 encounters, then 7.
  vermilion: gymRun('surge', 'Vermilion', 1, 'City', 'Route 5, Route 6'),
  celadon: gymRun('erika', 'Celadon', 1, 'City', 'Route 8'),
  // Saffron before Fuchsia (agreed with the user): Pokémon Tower 1F to 5F, 2 encounters a floor, then the gym.
  saffron: gymRun('sabrina', 'Saffron', 1, 'City', 'Pokémon Tower'),
  // The Cycling Road on a bike, most trainers Bikers (agreed with the user).
  fuchsia: gymRun('koga', 'Fuchsia', 1, 'City', 'Route 17'),
  // Surfing Route 20, Swimmers in the water and one trainer on land by the Seafoam Islands (agreed with the user).
  cinnabar: gymRun('blaine', 'Cinnabar', 1, 'City', 'Route 20'),
  // The Power Plant, most trainers Team Rocket Grunts (agreed with the user).
  viridian: gymRun('giovanni', 'Viridian', 1, 'City', 'Power Plant'),
  kantoGyms: {
    id: 'kantoGyms',
    name: 'Kanto Gym Challenge',
    description: 'All 8 gym leaders in a row!',
    segments: gymChallenge(KANTO_GYMS),
    generation: 1,
    requires: 'badges',
  },
  kantoChampion: {
    id: 'kantoChampion',
    name: 'Kanto Champion',
    description: 'All 8 gym leaders, the Elite Four, and the Champion!',
    segments: [{ steps: 0, bosses: [...KANTO_GYMS, ...ELITE_FOUR, 'blue'], gymTrainers: false }],
    generation: 1,
    requires: 'gymChallenge',
  },
  // Each Johto gym's route and interior, from HeartGold/SoulSilver (johto-routes.ts, johto-gyms.ts; agreed with the user): 10 encounters, then the gym.
  violet: gymRun('falkner', 'Violet', 2, 'City', 'Route 30'),
  azalea: gymRun('bugsy', 'Azalea', 2, 'Town', 'Route 32'),
  goldenrod: gymRun('whitney', 'Goldenrod', 2, 'City', 'Route 34'),
  ecruteak: gymRun('morty', 'Ecruteak', 2, 'City', 'Route 35'),
  // Made up: a surf route, a cave with a waterfall, an ice cave in two areas (generate_johto.py).
  cianwood: gymRun('chuck', 'Cianwood', 2, 'City', 'Route 40'),
  olivine: gymRun('jasmine', 'Olivine', 2, 'City', 'Route 42'),
  mahogany: gymRun('pryce', 'Mahogany', 2, 'Town', 'Route 44'),
  blackthorn: gymRun('clair', 'Blackthorn', 2, 'City', 'Route 45'),
  johtoGyms: {
    id: 'johtoGyms',
    name: 'Johto Gym Challenge',
    description: 'All 8 gym leaders in a row!',
    segments: gymChallenge(JOHTO_GYMS),
    generation: 2,
    requires: 'badges',
  },
  johtoChampion: {
    id: 'johtoChampion',
    name: 'Johto Champion',
    description: 'All 8 gym leaders, the Elite Four, and the Champion!',
    segments: [{ steps: 0, bosses: [...JOHTO_GYMS, ...JOHTO_ELITE_FOUR, 'johto-lance'], gymTrainers: false }],
    generation: 2,
    requires: 'gymChallenge',
  },
  // Each Hoenn gym's map and interior, from Emerald (hoenn-routes.ts, hoenn-gyms.ts): 10 encounters, then the gym, in the
  // order Emerald visits them. Dewford's and Mossdeep's routes and Sootopolis are surfed, Route 110 ridden on a bike.
  rustboro: gymRun('roxanne', 'Rustboro', 3, 'City', 'Petalburg Woods'),
  dewford: gymRun('brawly', 'Dewford', 3, 'Town', 'Route 106'),
  mauville: gymRun('wattson', 'Mauville', 3, 'City', 'Route 110'),
  lavaridge: gymRun('flannery', 'Lavaridge', 3, 'Town', 'Jagged Pass'),
  petalburg: gymRun('norman', 'Petalburg', 3, 'City', 'Route 102'),
  fortree: gymRun('winona', 'Fortree', 3, 'City', 'Route 119'),
  mossdeep: gymRun('tate-liza', 'Mossdeep', 3, 'City', 'Route 124'),
  sootopolis: gymRun('juan', 'Sootopolis', 3, 'City', 'Sootopolis City'),
  hoennGyms: {
    id: 'hoennGyms',
    name: 'Hoenn Gym Challenge',
    description: 'All 8 gym leaders in a row!',
    segments: gymChallenge(HOENN_GYMS),
    generation: 3,
    requires: 'badges',
  },
  hoennChampion: {
    id: 'hoennChampion',
    name: 'Hoenn Champion',
    description: 'All 8 gym leaders, the Elite Four, and the Champion!',
    segments: [{ steps: 0, bosses: [...HOENN_GYMS, ...HOENN_ELITE_FOUR, 'wallace'], gymTrainers: false }],
    generation: 3,
    requires: 'gymChallenge',
  },
  // Each Sinnoh gym's maps and interior, from Diamond and Pearl (sinnoh-routes.ts, sinnoh-gyms.ts; the maps the user's,
  // 2026-10-31): 10 encounters across them, then the gym, in the order Diamond and Pearl visit them.
  oreburgh: gymRun('roark', 'Oreburgh', 4, 'City', 'Route 203, Oreburgh Gate'),
  eterna: gymRun('gardenia', 'Eterna', 4, 'City', 'Eterna Forest, Route 205'),
  veilstone: gymRun('maylene', 'Veilstone', 4, 'City', 'Route 215'),
  pastoria: gymRun('crasher-wake', 'Pastoria', 4, 'City', 'Valor Lakefront, Route 213'),
  hearthome: gymRun('fantina', 'Hearthome', 4, 'City', 'Route 212'),
  canalave: gymRun('byron', 'Canalave', 4, 'City', 'Iron Island'),
  snowpoint: gymRun('candice', 'Snowpoint', 4, 'City', 'Route 217, Acuity Lakefront'),
  sunyshore: gymRun('volkner', 'Sunyshore', 4, 'City', 'Hotel Grand Lake, Route 222'),
  sinnohGyms: {
    id: 'sinnohGyms',
    name: 'Sinnoh Gym Challenge',
    description: 'All 8 gym leaders in a row!',
    segments: gymChallenge(SINNOH_GYMS),
    generation: 4,
    requires: 'badges',
  },
  sinnohChampion: {
    id: 'sinnohChampion',
    name: 'Sinnoh Champion',
    description: 'All 8 gym leaders, the Elite Four, and the Champion!',
    segments: [{ steps: 0, bosses: [...SINNOH_GYMS, ...SINNOH_ELITE_FOUR, 'cynthia'], gymTrainers: false }],
    generation: 4,
    requires: 'gymChallenge',
  },
} satisfies Record<string, RunTypeInfo>;

export type RunTypeId = keyof typeof RUN_TYPE_INFO;
export const RUN_TYPE_IDS = Object.keys(RUN_TYPE_INFO) as RunTypeId[];

/** The run a new account starts in. */
export const FIRST_RUN: RunTypeId = 'celadon';

/** A run type without its maps (runType, run-types.ts, has them). */
export const runTypeInfo = (id: string): RunTypeInfo => {
  const type = (RUN_TYPE_INFO as Record<string, RunTypeInfo>)[id];
  if (!type) throw new Error(`Unknown run type: ${id}`);
  return type;
};

/** Each region's run maps, by generation, loaded when asked for (the site's run screen: only the region it shows). */
const RUN_MAP_LOADERS: Record<number, () => Promise<Partial<Record<RunTypeId, RunMaps>>>> = {
  1: () => import('./kanto-run-maps.js').then((m) => m.KANTO_RUN_MAPS),
  2: () => import('./johto-run-maps.js').then((m) => m.JOHTO_RUN_MAPS),
  3: () => import('./hoenn-run-maps.js').then((m) => m.HOENN_RUN_MAPS),
  4: () => import('./sinnoh-run-maps.js').then((m) => m.SINNOH_RUN_MAPS),
};

/** A run type's maps, loaded with the rest of its region's (the server has them all at hand: runType). */
export async function loadRunMaps(typeId: string): Promise<RunMaps> {
  const { generation: gen } = runTypeInfo(typeId);
  const load = RUN_MAP_LOADERS[gen];
  const maps = load && (await load())[typeId as RunTypeId];
  if (!maps) throw new Error(`No maps for run type: ${typeId}`);
  return maps;
}

/**
 * The route map encounter step `position` of a run type is on (each map's spots in turn), and the step's index among its
 * spots; null past them all (the gym's steps, or a run with no routes).
 */
export function routeAt(type: { routes?: Route[] }, position: number): { route: Route; index: number } | null {
  let first = 0;
  for (const route of type.routes ?? []) {
    if (position < first + route.spots.length) return { route, index: position - first };
    first += route.spots.length;
  }
  return null;
}

/** The run's bosses in order; the last one beats the run. */
export const runBosses = (type: RunTypeInfo): Boss[] => type.segments.flatMap((s) => s.bosses.map(boss));

/** The boss that ends the run. */
export const finalBoss = (type: RunTypeInfo): Boss => runBosses(type).at(-1)!;

/** For the picker: who the run's bosses are, e.g. "Gym Leader Brock", "8 gym leaders", or "Gym leaders, Elite Four & Champion" (short, the user's). */
export function bossSummary(type: RunTypeInfo): string {
  const bosses = runBosses(type);
  if (bosses.length === 1) return `${bosses[0]!.title} ${bosses[0]!.name}`;
  if (bosses.some((b) => b.kind === 'champion')) return 'Gym leaders, Elite Four & Champion';
  return `${bosses.filter((b) => b.kind === 'gymLeader').length} gym leaders`;
}

/**
 * A generation of runs (agreed with the user): its region, its gyms (whose badges unlock its Gym Challenge), its Gym
 * Challenge run (beating it unlocks its Champion run), and its sets' booster packs in release order. An account starts
 * with no packs: the first battle finished without conceding in a run unlocks the generation's next pack, and beating
 * a run of the generation unlocks them all. Gen 2 (Neo Genesis onwards), Gen 3 (the EX sets) and Gen 4 (the Diamond &
 * Pearl to HGSS sets) come with their runs.
 */
export interface Generation {
  region: string;
  gyms: BossId[];
  gymChallenge: RunTypeId;
  packs: string[];
  /**
   * The sets its runs' cards come from (offered, sold, and in trainers' decks), only the cards the engine plays fully from
   * `implementedSets` (those whose effects are done: every set of all four generations, so far), and how its random decks are made.
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
  4: { region: 'Sinnoh', gyms: SINNOH_GYMS, gymChallenge: 'sinnohGyms', packs: GEN4_SETS, poolSets: GEN4_SETS, implementedSets: GEN4_DONE_SETS, deckRules: GEN4_DECK_RULES },
};

/**
 * Every generation's booster packs, by generation (GENERATIONS'), for the Packs tab; and Gen 5's (Unova's: the Black &
 * White series), shown locked until its runs exist (the user's, 2026-10-26).
 */
export const PACK_GENERATIONS: Record<number, { region: string; packs: string[] }> = {
  ...Object.fromEntries(Object.entries(GENERATIONS).map(([id, g]) => [id, { region: g.region, packs: g.packs }])),
  5: { region: 'Unova', packs: GEN5_SETS },
};

/** The generation a run type belongs to. */
export const runGeneration = (typeId: string): Generation => generation(runTypeInfo(typeId).generation);

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
 * Why a generation's runs can't be started yet, or null if they can: each generation after the first needs the Gym
 * Challenge of the one before it beaten (`beaten`: run types won), so beating the Kanto Gym Challenge opens Johto's runs
 * (agreed 2026-10-24).
 */
export function generationLock(id: number, beaten: ReadonlySet<string>): string | null {
  const before = GENERATIONS[id - 1];
  return before && !beaten.has(before.gymChallenge) ? `Beat the ${runTypeInfo(before.gymChallenge).name} first` : null;
}

/**
 * Why a run type can't be started yet, or null if it can: its generation must be open (generationLock), the Gym
 * Challenge needs every badge of its generation (key items the account has, `badges`), and the Champion run its
 * generation's Gym Challenge beaten (`beaten`: run types won).
 */
export function runTypeLock(type: RunTypeInfo, account: { badges: ReadonlySet<string>; beaten: ReadonlySet<string> }): string | null {
  const g = generation(type.generation);
  const closed = generationLock(type.generation, account.beaten);
  if (closed) return closed;
  if (type.requires === 'badges') {
    const missing = generationBadges(g).filter((b) => !account.badges.has(b)).length;
    return missing ? `Earn all ${g.gyms.length} ${g.region} badges first (${missing} to go)` : null;
  }
  if (type.requires === 'gymChallenge' && !account.beaten.has(g.gymChallenge)) return `Beat the ${runTypeInfo(g.gymChallenge).name} first`;
  return null;
}

/** The type of a basic Energy card of any generation's printings (pool.ts), or undefined. */
const basicEnergyType = (id: string): EnergyType | undefined =>
  [BASIC_ENERGY, GEN2_BASIC_ENERGY, GEN3_BASIC_ENERGY, GEN4_BASIC_ENERGY].map((set) => Object.entries(set).find(([, e]) => e === id)).find(Boolean)?.[0] as EnergyType | undefined;

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
