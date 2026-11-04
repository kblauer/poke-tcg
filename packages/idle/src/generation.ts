// The Idle Adventure's generations (README: Idle Adventure, Generations; issue #170): each region's generated tables
// (data/gen<n>/) and what else differs by region (its starters, its Town Map's picture), one `Generation` each. A run's
// `gen` (IdleState.gen, Kanto's 1 when missing, so older runs stay Kanto's) picks them: every lookup over the tables
// (data.ts, areas.ts, town-map.ts, tms.ts, idle.ts) reads the active generation, set by `inGeneration` around a run's
// entry points (createIdleRun, applyIdleAction, simulateSegment, catchUp, cutSegment, visitStore, idleView) and by the
// API and the page around anything else they read of a run. Outside any, it's Kanto's.
import type { IdleArea, IdleMap } from './areas.js';
import type { TownMapPlace } from './town-map.js';
import type { EncounterTable, ItemData, MoveData, SpeciesData, TrainerData, TypeName } from './types.js';
import { ABILITY_NAMES } from './data/gen1/abilities.js';
import { KANTO_AREAS } from './data/gen1/areas.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { ITEMS } from './data/gen1/items.js';
import { KANTO_MAPS } from './data/gen1/maps.js';
import { MARTS } from './data/gen1/marts.js';
import { MOVES } from './data/gen1/moves.js';
import { SPECIES } from './data/gen1/species.js';
import { TM_LEARNERS, TM_MOVES } from './data/gen1/tms.js';
import { KANTO_TOWN_MAP_PLACES } from './data/gen1/town-map.js';
import { TRAINERS } from './data/gen1/trainers.js';
import { TYPE_CHART } from './data/gen1/types.js';
import { ABILITY_NAMES as JOHTO_ABILITY_NAMES } from './data/gen2/abilities.js';
import { ENCOUNTERS as JOHTO_ENCOUNTERS } from './data/gen2/encounters.js';
import { ITEMS as JOHTO_ITEMS } from './data/gen2/items.js';
import { MARTS as JOHTO_MARTS } from './data/gen2/marts.js';
import { MOVES as JOHTO_MOVES } from './data/gen2/moves.js';
import { SPECIES as JOHTO_SPECIES } from './data/gen2/species.js';
import { TM_LEARNERS as JOHTO_TM_LEARNERS, TM_MOVES as JOHTO_TM_MOVES } from './data/gen2/tms.js';
import { TRAINERS as JOHTO_TRAINERS } from './data/gen2/trainers.js';
import { TYPE_CHART as JOHTO_TYPE_CHART } from './data/gen2/types.js';

/** The generations a run can be: Kanto's 1 and Johto's 2 (issue #170: its tables and Gen 4's battles so far; no areas yet, so no Johto run starts). */
export const IDLE_GENERATIONS = [1, 2] as const;
export type IdleGen = (typeof IDLE_GENERATIONS)[number];

/** A Town Map's picture (in apps/web/public) and its grid of cells on it. */
export interface TownMapGrid {
  image: string;
  imageWidth: number;
  imageHeight: number;
  x: number;
  y: number;
  cell: number;
  width: number;
  height: number;
}

export interface Generation {
  gen: IdleGen;
  region: string;
  species: readonly SpeciesData[];
  moves: Readonly<Record<string, MoveData>>;
  items: Readonly<Record<string, ItemData>>;
  abilityNames: Readonly<Record<string, string>>;
  typeChart: readonly [TypeName, TypeName, number, number][];
  encounters: Readonly<Record<string, EncounterTable>>;
  marts: Readonly<Record<string, string[]>>;
  trainers: Readonly<Record<string, TrainerData>>;
  /** Each TM's and HM's move, in Buy TM/HM's order, and the species that can learn each. */
  tmMoves: Readonly<Record<string, string>>;
  tmLearners: Readonly<Record<number, string[]>>;
  areas: readonly IdleArea[];
  maps: Readonly<Record<string, IdleMap>>;
  townMapPlaces: readonly TownMapPlace[];
  townMapGrid: TownMapGrid;
  /** The first run's starters. */
  starters: readonly number[];
  /** Whose battle rules its battles play by (battle.ts): FireRed's (3) or HeartGold's (4: the physical/special split, Gen 4's damage, effects, abilities and items). */
  battleRules: 3 | 4;
}

const KANTO: Generation = {
  gen: 1,
  region: 'Kanto',
  species: SPECIES,
  moves: MOVES,
  items: ITEMS,
  abilityNames: ABILITY_NAMES,
  typeChart: TYPE_CHART,
  encounters: ENCOUNTERS,
  marts: MARTS,
  trainers: TRAINERS,
  tmMoves: TM_MOVES,
  tmLearners: TM_LEARNERS,
  areas: KANTO_AREAS,
  maps: KANTO_MAPS,
  townMapPlaces: KANTO_TOWN_MAP_PLACES,
  // public/idle/gen1/town-map/kanto.png: FireRed's screen cut to the map, 208x144 from (16, 16), and its grid as
  // region_map.c has it: 22x15 cells of 8px, from (32, 32) on the screen, (16, 16) in the picture.
  townMapGrid: { image: '/idle/gen1/town-map/kanto.png', imageWidth: 208, imageHeight: 144, x: 16, y: 16, cell: 8, width: 22, height: 15 },
  starters: [1, 4, 7],
  battleRules: 3,
};

/** Johto (HeartGold/SoulSilver, issue #170): its tables (data/gen2/, tools/idle/hgss_data.py); its areas, maps and Town Map to come (steps 4 and 5). */
const JOHTO: Generation = {
  gen: 2,
  region: 'Johto',
  species: JOHTO_SPECIES,
  moves: JOHTO_MOVES,
  items: JOHTO_ITEMS,
  abilityNames: JOHTO_ABILITY_NAMES,
  typeChart: JOHTO_TYPE_CHART,
  encounters: JOHTO_ENCOUNTERS,
  marts: JOHTO_MARTS,
  trainers: JOHTO_TRAINERS,
  tmMoves: JOHTO_TM_MOVES,
  tmLearners: JOHTO_TM_LEARNERS,
  areas: [],
  maps: {},
  townMapPlaces: [],
  // A placeholder until Johto's Pokégear map (step 5).
  townMapGrid: { image: '', imageWidth: 0, imageHeight: 0, x: 0, y: 0, cell: 8, width: 0, height: 0 },
  starters: [152, 155, 158],
  battleRules: 4,
};

const GENERATIONS: Record<IdleGen, Generation> = { 1: KANTO, 2: JOHTO };

let active: Generation = KANTO;

/** The active generation's tables. */
export const generation = () => active;

/** A run's generation (Kanto's for a run from before generations). */
export const generationOf = (state: { gen?: IdleGen }): IdleGen => state.gen ?? 1;

/** Runs `run` with `gen`'s tables active (nested calls restore the outer one). Everything inside must be synchronous. */
export function inGeneration<T>(gen: IdleGen | undefined, run: () => T): T {
  const outer = active;
  active = GENERATIONS[gen ?? 1];
  try {
    return run();
  } finally {
    active = outer;
  }
}

/** A value worked out once per generation (a cache or a list derived from its tables), the active one's. */
export function perGeneration<V>(make: (g: Generation) => V): () => V {
  const made = new Map<IdleGen, V>();
  return () => {
    if (!made.has(active.gen)) made.set(active.gen, make(active));
    return made.get(active.gen)!;
  };
}

/**
 * The account Pokédex's size: every species any generation has (Johto's tables go to Arceus). A number, not worked out
 * from the tables, so the shared schemas that read it never pull the tables in; a test checks it.
 */
export const DEX_SIZE = 493;

/** Every generation's tables (the test checking DEX_SIZE). */
export const allGenerations = (): readonly Generation[] => Object.values(GENERATIONS);
