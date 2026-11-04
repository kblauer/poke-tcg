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

/** The generations a run can be (Kanto's 1; Johto's 2 to come, issue #170). */
export const IDLE_GENERATIONS = [1] as const;
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
};

const GENERATIONS: Record<IdleGen, Generation> = { 1: KANTO };

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

/** The account Pokédex's size: every species any generation has. */
export const DEX_SIZE = Math.max(...Object.values(GENERATIONS).map((g) => g.species.length));
