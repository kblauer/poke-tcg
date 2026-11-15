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
import { JOHTO_AREAS } from './data/gen2/areas.js';
import { ENCOUNTERS as JOHTO_ENCOUNTERS } from './data/gen2/encounters.js';
import { ITEMS as JOHTO_ITEMS } from './data/gen2/items.js';
import { JOHTO_HEIGHTS } from './data/gen2/heights.js';
import { JOHTO_MAPS } from './data/gen2/maps.js';
import { JOHTO_TOWN_MAP_GRID, JOHTO_TOWN_MAP_PLACES } from './data/gen2/town-map.js';
import { MARTS as JOHTO_MARTS } from './data/gen2/marts.js';
import { MOVES as JOHTO_MOVES } from './data/gen2/moves.js';
import { SPECIES as JOHTO_SPECIES } from './data/gen2/species.js';
import { TM_LEARNERS as JOHTO_TM_LEARNERS, TM_MOVES as JOHTO_TM_MOVES } from './data/gen2/tms.js';
import { TRAINERS as JOHTO_TRAINERS } from './data/gen2/trainers.js';
import { TYPE_CHART as JOHTO_TYPE_CHART } from './data/gen2/types.js';
import { ABILITY_NAMES as HOENN_ABILITY_NAMES } from './data/gen3/abilities.js';
import { ENCOUNTERS as HOENN_ENCOUNTERS } from './data/gen3/encounters.js';
import { ITEMS as HOENN_ITEMS } from './data/gen3/items.js';
import { MARTS as HOENN_MARTS } from './data/gen3/marts.js';
import { MOVES as HOENN_MOVES } from './data/gen3/moves.js';
import { SPECIES as HOENN_SPECIES } from './data/gen3/species.js';
import { TM_LEARNERS as HOENN_TM_LEARNERS, TM_MOVES as HOENN_TM_MOVES } from './data/gen3/tms.js';
import { TRAINERS as HOENN_TRAINERS } from './data/gen3/trainers.js';
import { TYPE_CHART as HOENN_TYPE_CHART } from './data/gen3/types.js';

/**
 * The generations a run can be: Kanto's 1, Johto's 2 (issue #170: HGSS's tables and areas, Gen 4's battles; open once a
 * Kanto run has beaten the Champion) and Hoenn's 3 (issue #226: Emerald's, Gen 3's battles; open once a Johto run has;
 * its areas to come, so no run starts there yet: `regionReady`).
 */
export const IDLE_GENERATIONS = [1, 2, 3] as const;
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
  /** The town a run sets off from (its log's first line): Pallet Town, New Bark Town. */
  home: string;
  /** The starter scene's map (StarterScene, with no run under way): the professor's lab. */
  lab: string;
  /**
   * Which game the region's screens are drawn as (the page's components: the battle screen, the party menu, the mart,
   * the Town Map, the player's sprites, the battle's timing): FireRed's GBA screens or HeartGold's DS ones.
   */
  look: 'frlg' | 'hgss';
  /** Whose battle rules its battles play by (battle.ts): FireRed's (3) or HeartGold's (4: the physical/special split, Gen 4's damage, effects, abilities and items; and its wild encounters, encounters4.ts). */
  battleRules: 3 | 4;
  /** The town from which every store sells TMs and HMs (Buy TMs, the user's: Kanto's Celadon City, Johto's Goldenrod City, their department stores'). */
  tmShop: string;
  /** The Champion's room (its area's id): beating its boss wins the run. */
  champion: string;
  /**
   * The town before the League's rooms (its area's id, and its name in a sentence): where every store sells every item
   * once reached (storeStock, the user's), where a League battle's end puts the run, and where the Town Map shows the rooms.
   */
  league: { town: string; name: string };
  /** The rods (the user's): each got once the run reaches its area, fishing with one of those it has at random each cast. */
  rods: readonly { name: string; town: string }[];
  /**
   * The run's play clock (the user's, 2026-11-04: IdleState.clock, the segments played, not the computer's clock): a
   * day's length in play and the hour a run starts at (placeholders), for HGSS's times of day. None: no time of day.
   */
  day?: { ms: number; startHour: number };
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
  home: 'Pallet Town',
  lab: 'PalletTown_ProfessorOaksLab',
  look: 'frlg',
  battleRules: 3,
  tmShop: 'celadon-city',
  champion: 'champion',
  league: { town: 'indigo-plateau', name: 'the Indigo Plateau' },
  // The user's (2026-10-27): the Old Rod in Vermilion City, the Good Rod Fuchsia City, the Super Rod Cinnabar Island.
  rods: [
    { name: 'Old Rod', town: 'vermilion-city' },
    { name: 'Good Rod', town: 'fuchsia-city' },
    { name: 'Super Rod', town: 'cinnabar-island' },
  ],
};

/** Johto (HeartGold/SoulSilver, issue #170): its tables (data/gen2/, tools/idle/hgss_data.py), its areas and maps (tools/idle/johto_areas.py); its Town Map to come (step 5). */
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
  areas: JOHTO_AREAS,
  // Each with its walking heights where it isn't flat (heights.ts, tools/idle/hgss_render.py: the sprites raised by them).
  maps: Object.fromEntries(Object.entries(JOHTO_MAPS).map(([k, m]) => [k, JOHTO_HEIGHTS[k] ? { ...m, heights: JOHTO_HEIGHTS[k] } : m])),
  townMapPlaces: JOHTO_TOWN_MAP_PLACES,
  // A placeholder until Johto's Pokégear map (step 5).
  // public/idle/gen2/town-map/johto.png: the Pokégear's map, cells 1–29 across and 1–18 down of its 8px grid (tools/idle/johto_town_map.py).
  townMapGrid: JOHTO_TOWN_MAP_GRID,
  starters: [152, 155, 158],
  home: 'New Bark Town',
  lab: 'NewBarkElmsLab1f',
  look: 'hgss',
  battleRules: 4,
  tmShop: 'goldenrod-city',
  champion: 'lance',
  league: { town: 'indigo-plateau', name: 'the Indigo Plateau' },
  // HGSS's Old Rod on Route 32 (its Pokémon Center), the Good Rod in Olivine City; the Super Rod, Route 12's in Kanto, at
  // the Indigo Plateau (the user's, 2026-11-04).
  rods: [
    { name: 'Old Rod', town: 'route-32' },
    { name: 'Good Rod', town: 'olivine-city' },
    { name: 'Super Rod', town: 'indigo-plateau' },
  ],
  // Placeholders (the user's, 2026-11-04: a 2-hour day, from 10:00).
  day: { ms: 2 * 60 * 60 * 1000, startHour: 10 },
};

/**
 * Hoenn (Emerald, issue #226): its tables (data/gen3/, tools/idle/emerald_data.py). Its areas, maps and Town Map are to
 * come (steps 4 and 5): until then no Hoenn run starts (`regionReady`), and the Town Map's grid is Kanto's, a placeholder.
 * Its places (the areas' ids to be) are the user's and mine, in the issue: Ever Grande City before the League, Lilycove's
 * Department Store for the TMs, the rods where Emerald gives them. Emerald has no time of day, so no `day`.
 */
const HOENN: Generation = {
  gen: 3,
  region: 'Hoenn',
  species: HOENN_SPECIES,
  moves: HOENN_MOVES,
  items: HOENN_ITEMS,
  abilityNames: HOENN_ABILITY_NAMES,
  typeChart: HOENN_TYPE_CHART,
  encounters: HOENN_ENCOUNTERS,
  marts: HOENN_MARTS,
  trainers: HOENN_TRAINERS,
  tmMoves: HOENN_TM_MOVES,
  tmLearners: HOENN_TM_LEARNERS,
  areas: [],
  maps: {},
  townMapPlaces: [],
  townMapGrid: KANTO.townMapGrid,
  starters: [252, 255, 258],
  home: 'Littleroot Town',
  lab: 'LittlerootTown_ProfessorBirchsLab',
  // Emerald's screens are to come (step 5); FireRed's are the same console's until then.
  look: 'frlg',
  battleRules: 3,
  tmShop: 'lilycove-city',
  champion: 'wallace',
  league: { town: 'ever-grande-city', name: 'Ever Grande City' },
  rods: [
    { name: 'Old Rod', town: 'dewford-town' },
    { name: 'Good Rod', town: 'route-118' },
    { name: 'Super Rod', town: 'mossdeep-city' },
  ],
};

const GENERATIONS: Record<IdleGen, Generation> = { 1: KANTO, 2: JOHTO, 3: HOENN };

/** Whether a run can start in a region: its areas exist (Hoenn's are to come, issue #226). */
export const regionReady = (gen: IdleGen) => GENERATIONS[gen].areas.length > 0;

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

/**
 * The browser's (one run on screen): makes `gen`'s tables the active ones outside any `inGeneration`, for the Idle
 * page's components while its run is shown (Kanto's again when it closes). Never on the server: requests share it.
 */
export function showGeneration(gen: IdleGen | undefined) {
  active = GENERATIONS[gen ?? 1];
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
