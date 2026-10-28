// The Idle Adventure's runs (README: Idle Adventure; agreed with the user, issue #133): the player character walks
// Kanto's main road by himself (areas.ts), fighting every wild Pokémon and trainer he meets in battles that play
// themselves (battle.ts), and waits in each town for the player's choice: the gym, the store, or on. IdleState is plain
// JSON like a run's (RunState), changed only by applyIdleAction (the player's choices) and simulateSegment (the next
// stretch of walking and its battle, from the seeded RNG). Every decision in between is a setting, so a segment never
// waits on the player, online or caught up offline (catchUp).
import { catchTextFrame, FRAME_MS, openingMs } from './battle-timing.js';
import { int, rngFrom, type Rng } from '@poke-tcg/campaign';
import { AREAS, areaById, areaIndex, areaOpen, isOptional, isTown, legendOf, mapView, TERRAIN_LETTERS, type IdleArea, type IdleLeg, type TownArea, type TrackStep, type WalkArea } from './areas.js';
import { opponentMon, simulateBattle, type BattleEvent, type BattleResult, MEDICINE, type Terrain } from './battle.js';
import { BALLS } from './catch.js';
import { itemData, species } from './data.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { MARTS } from './data/gen1/marts.js';
import { TRAINERS } from './data/gen1/trainers.js';
import { evolve, levelEvolution, stoneEvolution, usableStones } from './evolution.js';
import { abilityOf, autoSlots, basicFor, createMon, familyMovesUpTo, isBaseForm } from './mon.js';
import { MAX_LEVEL } from './stats.js';
import { isMachine, machinePrice, slotMoves, TM_SHOP_AREA } from './tms.js';
import type { EncounterSlots, Mon, Stats } from './types.js';

/** The run's starting money (the game's ₱3000: a placeholder, to balance later). */
export const START_MONEY = 3000;
/** The bag a run starts with (the game's five Poké Balls from Professor Oak). */
export const START_BAG: Record<string, number> = { 'poke-ball': 5 };
/** The starters' level. */
export const STARTER_LEVEL = 5;
/** The generation's three starters (Bulbasaur, Charmander, Squirtle). */
export const STARTERS = [1, 4, 7];
/** A party holds 6 Pokémon. */
export const PARTY_SIZE = 6;

/**
 * How long things take (one pace, watched or offline: no speed setting, agreed with the user): a step (16 frames), a
 * turn (the user's: 10 s; 6 s and 3 s before), a battle's start and end, a fade.
 */
export const STEP_MS = 267;
export const TICK_MS = 10000;
/** A battle's own time besides its opening (battle-timing.ts: openingMs) and its ticks: the transition in, the screen held at its end. */
export const BATTLE_MS = 2400;
/** Of BATTLE_MS, the screen held at the battle's end (the rest is the transition in). */
export const BATTLE_HOLD_MS = 1400;
export const FADE_MS = 800;
/**
 * How long a town waits for the player's choice before taking it itself, only while they're away (the user's,
 * 2026-10-27: watched, a town waits for them however long; 10 s, 2026-10-26; 5 s before): the gym, or on once it's
 * beaten, played by the offline catch-up; not at all in the store (IdleState.inStore).
 */
export const TOWN_WAIT_MS = 10000;
/** How often a page watching a town tells the server the player is there (idle.here), well inside TOWN_WAIT_MS. */
export const TOWN_HERE_MS = 4000;
/** Offline catch-up's cap (12 hours of absence, agreed with the user) and how many segments one call simulates (the browser calls again for more). */
export const CATCH_UP_CAP_MS = 12 * 60 * 60 * 1000;
export const CATCH_UP_SEGMENTS = 40;
/** A wild Pokémon's chance of being shiny (Gen 3's 1 in 8192). */
export const SHINY_ODDS = 8192;

/**
 * When auto-heal uses a Revive on a fainted party Pokémon (agreed with the user: any of these; none ticked, never):
 * `last` when the active Pokémon is the last one standing, `any` as soon as one faints, `boss` only against Gym Leaders,
 * the Elite Four and the Champion (with the last one standing), `lead` when the party's lead has fainted (on it).
 */
export type RevivePolicy = 'last' | 'any' | 'boss' | 'lead';
export const REVIVE_POLICIES: RevivePolicy[] = ['last', 'any', 'boss', 'lead'];

/** The player's settings for the mode (User.idleSettings): every in-battle decision is one of these. */
export interface IdleSettings {
  autoHeal: boolean;
  /** When Revives are used (with auto-heal on): none, never. */
  revives: RevivePolicy[];
  /** Auto-catch: off, only species not yet caught (no caught dex record), or every wild Pokémon. */
  autoCatch: 'off' | 'new' | 'all';
  /** Auto-catch's hits (the user's): the basic move, or the first slot's move (the basic move while it cools down, or if it's a status move or could knock the Pokémon out). */
  catchMove: 'basic' | 'slot';
  /** With a full party: skip catching (the dex still marks them seen)… */
  stopWhenFull: boolean;
  /** …or replace the lowest-level party Pokémon (its best stats go to the dex first); with neither, the catch is registered and released. */
  replaceLowest: boolean;
  /** At a store selling evolution stones, buy one for each party Pokémon that can use one and use it at once. */
  autoEvolve: boolean;
  /**
   * Auto-grind (the user's): reaching a gym's town (or the Indigo Plateau), grind until the party's highest level is the
   * gym's highest (grindTarget), then go into the gym; after a white-out back in the town, to REGRIND_LEVELS above the party's highest, then in again.
   */
  autoGrind: boolean;
  /**
   * Auto-buy balls (the user's): reaching a town with fewer balls than this in the bag (every kind counted), buy the
   * cheapest ball its store sells up to it, as many as the money allows; 0, off.
   */
  autoBalls: number;
}

/** The most balls auto-buy keeps. */
export const MAX_AUTO_BALLS = 99;

export const DEFAULT_IDLE_SETTINGS: IdleSettings = { autoHeal: true, revives: ['last'], autoCatch: 'new', catchMove: 'basic', stopWhenFull: false, replaceLowest: false, autoEvolve: true, autoGrind: true, autoBalls: 0 };

/**
 * The settings a segment plays by, with the player's own throws (the ball button, the user's: `throwAt`, the ticks of
 * its wild battle a ball was asked for; the server plays the segment again from its start with them, idle.throwBall).
 */
type PlaySettings = IdleSettings & { throwAt?: number[] };

/** Wild encounter bookkeeping between steps (wild_encounter.c's sWildEncounterData). */
interface EncounterState {
  steps: number;
  buff: number;
  /** The last tile's code (its behaviour, as far as encounters go). */
  prev: string;
}

export interface IdleState {
  version: number;
  rngState: number;
  /** The area (AREAS' index), its leg and the step along it the player stands on. */
  area: number;
  leg: number;
  step: number;
  /** The area's trainers beaten (an area's are fought again after a white-out). */
  beaten: string[];
  /** Gym Trainers beaten in this run (not the leaders): fought once, then walked past on the way back to the leader (the user's, 2026-10-27). */
  gymBeaten?: string[];
  /**
   * The furthest area entered (AREAS' index; older runs' from reachedArea): the Town Map's towns and routes up to it can
   * be picked (TRAVEL, GRIND_AT).
   */
  reached?: number;
  /**
   * The furthest place the run has reached (the user's: Continue run, in a town or on the Town Map, goes straight there):
   * its area, leg and step (a town's 0) and the trainers beaten there, marked as it walks on (never while grinding: a
   * grind's place isn't progress); older runs' from progressOf.
   */
  progress?: Progress;
  party: Mon[];
  bag: Record<string, number>;
  money: number;
  /** Badges won in this run (their names, in order). */
  badges: string[];
  encounter: EncounterState;
  /**
   * walking: on a route, in a dungeon, gym or League room; grinding: round the town's grind loop (`area` stays the
   * town); town: waiting for the player; won: the Champion beaten; given-up.
   */
  phase: 'walking' | 'grinding' | 'town' | 'won' | 'given-up';
  /** While grinding: the step of the town's loop (TownArea.grind) the player stands on, and the level it trains the party's highest to. */
  grind?: { at: number; level: number };
  /**
   * Grinding on a route (the user's, 2026-10-25: Start grinding, until Continue route): `trainers`, its beaten trainers
   * fought again in a loop, from a few steps before the first to the last; `pace`, with none beaten, back and forth over a
   * few wild encounter tiles of the leg's track near where it was, or of the most recent route with wild Pokémon (`from`…`to`,
   * `dir` the way it's going). `resume` is where it was when it started and the trainers it had beaten there (Continue
   * route goes on from there).
   */
  loop?: RouteLoop;
  /** Stopped where it is (the Stop mode, the user's): no segment is played, offline either, until another mode is chosen. */
  stopped?: boolean;
  /**
   * In the town's Poké Mart (the user's): the town doesn't go on by itself, watched or offline, until the player leaves it
   * (LEAVE_STORE); only then are BUYs taken.
   */
  inStore?: boolean;
  /** The legendary Pokémon (dex numbers) beaten or caught in this run (WalkArea.legend): gone from the Town Map. */
  legends?: number[];
  /** The trainers (TRAINERS' keys) whose full prize the run has had: a rematch pays REMATCH_PRIZE of it. */
  paid?: string[];
  /**
   * The server's, not the rules': the last segment's start, to play it again: from the moment the page is opened while it
   * still plays (idle.resume, the user's: no waiting on a segment the page didn't see), and, its wild battle while
   * `throwable`, with a ball the player asked for (the battle's ball button: idle.throwBall). The next segment replaces
   * it; an action that isn't queued keeps it but ends `throwable` (playing it again from before would undo the action).
   */
  replay?: SegmentReplay;
  /**
   * Party changes made while a wild battle's replay is held (the user's: queued until the battle ends, so the ball button
   * still works): applied, in order, when the next segment starts (withPending); the view shows them at once.
   */
  pending?: IdleAction[];
  /** The Champion's team: the starter he'd have picked against the run's (FireRed's TRAINER_CHAMPION_FIRST_<his starter>). */
  rivalStarter: 'bulbasaur' | 'charmander' | 'squirtle';
  /** The run's totals, for the screen and the run's end. */
  totals: { battles: number; wild: number; trainers: number; caught: number; whiteOuts: number; steps: number };
  /** The last few things that happened (the run log). */
  log: string[];
}

export type IdleAction =
  /** In a town: into its gym (or the League's first room). */
  | { type: 'GYM' }
  /** In a town: on to the next area (after its gym is beaten, if it has one). */
  | { type: 'CONTINUE' }
  /** In a town: back to the end of the route (or dungeon) before it, wild grinding there (BACK_ROUTE, previousRoute). */
  | { type: 'BACK_ROUTE' }
  /** In a town: open its store (auto-evolve buys and uses stones there). */
  | { type: 'VISIT_STORE' }
  | { type: 'LEAVE_STORE' }
  /** In a gym's town: grind to the gym's highest level (then into the gym); STOP_GRIND back to the town. */
  | { type: 'GRIND' }
  | { type: 'STOP_GRIND' }
  /** On a route or in a dungeon, out of battle: grind there (RouteLoop), its wild Pokémon or its trainers, until CONTINUE_ROUTE. */
  | { type: 'WILD_GRIND' }
  | { type: 'TRAINER_GRIND' }
  | { type: 'CONTINUE_ROUTE' }
  /** The mode (the Town Map's Continue route and Stop, the user's): Route, Wild grind, Trainer grind, or Stop (stopped where it is). */
  | { type: 'SET_MODE'; mode: IdleMode }
  /** Continue run (the user's: in a town and on the Town Map): to the run's furthest place (progressOf), or on from it when there. */
  | { type: 'CONTINUE_RUN' }
  /** The Town Map (the user's): to a town reached already, its usual choices waiting there. */
  | { type: 'TRAVEL'; area: number }
  /**
   * The Town Map (the user's): Wild or Trainer grind on a route (or in a dungeon) reached already (mapGrindPlan); a wild
   * grind's `spot` (WildSpot.id) is one of its maps' wild tables, for an area with several (a floor, a zone).
   */
  | { type: 'GRIND_AT'; area: number; kind: 'wild' | 'trainers'; spot?: string }
  /** The Town Map (the user's, 2026-10-27): to a legendary Pokémon (WalkArea.legend), walked up to and battled (legendError). */
  | { type: 'LEGEND'; area: number }
  | { type: 'BUY'; item: string; count: number }
  /** The party's order (the lead fights first). */
  | { type: 'SET_ORDER'; uids: string[] }
  /** A Pokémon's 3 slots, highest priority first; `auto` gives them back to the automatic pick. */
  | { type: 'SET_SLOTS'; uid: string; slots: string[]; auto?: boolean }
  /** Uses an evolution stone from the bag on a Pokémon. */
  | { type: 'USE_STONE'; uid: string; item: string }
  | { type: 'GIVE_UP' };

/** A segment's start kept to play it again (IdleState.replay): the state before it, its settings and caught species, when it began (ms), the ticks a ball was asked for. */
export interface SegmentReplay {
  prev: IdleState;
  settings: IdleSettings;
  caught: number[];
  from: number;
  throws: number[];
  /** Its wild battle can still take a ball (and party changes are queued meanwhile); missing (older runs'), it can. */
  throwable?: boolean;
}

/** Whether a run's last segment's wild battle can still take a ball (IdleState.replay). */
export const throwable = (state: Pick<IdleState, 'replay'>) => !!state.replay && state.replay.throwable !== false;

/** Where a route grind loops (IdleState.loop). */
export type RouteLoop = { resume: { area: number; leg: number; step: number; beaten: string[] } } & (
  | { kind: 'trainers'; keys: string[] }
  | { kind: 'pace'; leg: number; from: number; to: number; dir: 1 | -1 }
  /** Fishing (the user's, 2026-10-27): at one of the area's fishing spots (WalkArea.fishing), cast after cast. */
  | { kind: 'fish'; spot: number }
);

export type IdleResult = { ok: true; state: IdleState } | { ok: false; error: string };

/** What the browser plays back of a segment, in order. Step indexes are along the leg's track (AREAS). */
export type SegmentEvent =
  | { t: 'area'; area: number; leg: number; step: number }
  | { t: 'walk'; from: number; to: number }
  /** Onto a town's grind loop (a fade), at its step `at`; then `steps` steps round it from `from`. */
  | { t: 'grind'; town: number; at: number }
  | { t: 'circle'; from: number; steps: number }
  | { t: 'spotted'; trainer: string }
  /**
   * A cast (the user's: fishing on the map; FireRed's Task_Fishing): at the area's fishing spot `spot` (WalkArea.fishing),
   * its rod, the dots before the bite or not, and whether one bit ("A POKéMON's on the hook!", its battle next) or not
   * ("Not even a nibble…").
   */
  | { t: 'fish'; spot: number; rod: number; dots: number; bite: boolean }
  | {
      t: 'battle';
      kind: 'wild' | 'trainer';
      trainer?: string;
      terrain: Terrain;
      scene: string;
      party: Mon[];
      foes: { species: number; level: number }[];
      events: BattleEvent[];
      result: BattleResult;
      ticks: number;
      /** A wild Pokémon whose species the account had caught when the battle began (its healthbox's Poké Ball, FireRed's TryAddPokeballIconToHealthbox). */
      caughtBefore?: true;
    }
  | { t: 'money'; amount: number; total: number; why: string }
  | { t: 'bought'; item: string; count: number; cost: number }
  | { t: 'evolve'; uid: string; from: number; into: number }
  | { t: 'caught'; species: number; kept: boolean; replaced?: number; shiny?: true }
  | { t: 'badge'; badge: string }
  | { t: 'whiteout' }
  | { t: 'town'; area: number }
  | { t: 'won' };

/** A Pokémon as the Pokédex records it: a run's Pokémon seen, caught or in the party (the API keeps each species' best IVs and EVs). */
export interface DexNote {
  species: number;
  seen?: true;
  caught?: true;
  ivs?: Stats;
  evs?: Stats;
  /** One of the account's shiny Pokémon (a shiny caught makes the species a shiny starter: agreed). */
  shiny?: true;
}

export interface Segment {
  events: SegmentEvent[];
  /** How long it takes to play. */
  durationMs: number;
  dex: DexNote[];
}

const rngOf = (s: IdleState): Rng => ({ state: s.rngState });

/** Whether a run plays by itself (walking or grinding), not waiting for the player or over. */
export const playing = (s: Pick<IdleState, 'phase' | 'stopped'>) => !s.stopped && (s.phase === 'walking' || s.phase === 'grinding');

// ---- Starting a run ----
export interface StarterChoice {
  species: number;
  /** A dex record's best IVs and EVs (a run started from the Pokédex); random IVs and no EVs otherwise. */
  ivs?: Stats;
  evs?: Stats;
  /** Shiny (a species the account has caught a shiny of: agreed with the user). */
  shiny?: boolean;
}

/** The Champion's starter: the one strong against the player's (FireRed's rival), by the run's starter's type otherwise (assumption, issue #133's open question), at random for a type without one. */
function rivalStarterFor(rng: Rng, id: number): IdleState['rivalStarter'] {
  const t = species(id).types;
  if (t.includes('grass')) return 'charmander';
  if (t.includes('water')) return 'bulbasaur';
  if (t.includes('fire')) return 'squirtle';
  return (['bulbasaur', 'charmander', 'squirtle'] as const)[int(rng, 3)]!;
}

/** A new run with its starter at level 5 (a dex species keeps its record's IVs and EVs, its nature re-rolled). */
export function createIdleRun(choice: StarterChoice, seed: number): IdleState {
  const rng = rngFrom(seed);
  const mon = createMon(rng, { species: choice.species, level: STARTER_LEVEL, ...(choice.ivs && { ivs: choice.ivs }), ...(choice.evs && { evs: choice.evs }), ...(choice.shiny && { shiny: true }) });
  const state: IdleState = {
    version: 0,
    rngState: rng.state,
    area: 0,
    leg: 0,
    step: 0,
    beaten: [],
    party: [mon],
    bag: { ...START_BAG },
    money: START_MONEY,
    badges: [],
    encounter: { steps: 0, buff: 0, prev: '' },
    phase: 'walking',
    rivalStarter: rivalStarterFor(rng, choice.species),
    totals: { battles: 0, wild: 0, trainers: 0, caught: 0, whiteOuts: 0, steps: 0 },
    log: [`Set off from Pallet Town with ${species(choice.species).name}.`],
  };
  state.rngState = rng.state;
  return state;
}

// ---- Towns, stores ----
/** The area whose reaching stocks every store with every item (the user's): the Indigo Plateau, past Victory Road. */
export const LEAGUE_TOWN = 'indigo-plateau';

/**
 * The items a town's store sells: its marts' lists (martStock); once the run has reached the Indigo Plateau (the user's),
 * every Kanto store's, balls first, then medicine, then stones, each by price.
 */
export function storeStock(town: TownArea, state?: Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges'>): string[] {
  if (!state || reachedArea(state) < areaIndex(LEAGUE_TOWN)) return martStock(town);
  const all = [...new Set(AREAS.filter(isTown).flatMap(martStock))];
  const kind = (item: string) => (BALLS.some(([b]) => b === item) ? 0 : MEDICINE[item] ? 1 : 2);
  return all.sort((a, b) => kind(a) - kind(b) || itemData(a).price - itemData(b).price);
}

/** A town's own marts' lists without Escape Ropes and Repels (agreed), only those with a use here (balls, medicine, evolution stones). */
function martStock(town: TownArea): string[] {
  const out: string[] = [];
  for (const m of town.marts) {
    for (const item of MARTS[m] ?? []) {
      if (out.includes(item) || /repel|escape-rope/.test(item)) continue;
      if (BALLS.some(([b]) => b === item) || MEDICINE[item] || STONES.has(item)) out.push(item);
    }
  }
  return out;
}

const STONES = new Set(['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone']);

/** Whether the run's current town's gym (or the League) is beaten, so it can go on. */
function townDone(state: IdleState, town: TownArea): boolean {
  if (!town.gym) return true;
  const gym = areaById(town.gym);
  return gym.kind === 'gym' ? state.badges.includes((gym as WalkArea).badge!) : false;
}

/** The area after a town (skipping its own gym). */
function afterTown(townIndex: number): number {
  const town = AREAS[townIndex] as TownArea;
  let i = townIndex + 1;
  while (i < AREAS.length && AREAS[i]!.id === town.gym) i++;
  return i;
}

/** The party's highest level. */
export const topLevel = (party: Mon[]) => Math.max(...party.map((m) => m.level));

/**
 * The level a town's grind reaches (the user's: the upcoming gym's highest): its gym leader's highest-level Pokémon, or
 * for the League, the highest of the Elite Four's and the Champion's (his team by the run's rival starter); null for a
 * town with no gym.
 */
export function grindTarget(townIndex: number, rivalStarter: IdleState['rivalStarter']): number | null {
  const town = AREAS[townIndex];
  if (!town || !isTown(town) || !town.gym) return null;
  const gym = areaById(town.gym) as WalkArea;
  const bosses = gym.kind === 'league' ? AREAS.filter((a): a is WalkArea => a.kind === 'league').map((a) => a.leader!) : [gym.leader!];
  return Math.max(...bosses.flatMap((k) => TRAINERS[k === 'champion' ? `champion-first-${rivalStarter}` : k]!.party.map((p) => p.level)));
}

/** Why the run can't grind in its town now, or null when it can: a gym's town with its gym unbeaten, the party below the gym's highest level. */
function grindError(state: IdleState): string | null {
  const town = AREAS[state.area]!;
  if (state.phase !== 'town' || !isTown(town)) return 'Not in a town';
  if (!town.grind || townDone(state, town)) return 'There is no gym ahead to train for';
  const target = grindTarget(state.area, state.rivalStarter)!;
  if (topLevel(state.party) >= target) return `Already at Lv. ${target}`;
  return null;
}

/** Back to the town's grind loop (a fade), at its first step, to train the party's highest to `level` (the gym's highest by default). */
function startGrind(state: IdleState, events: SegmentEvent[], level = grindTarget(state.area, state.rivalStarter)!) {
  const town = AREAS[state.area] as TownArea;
  state.phase = 'grinding';
  state.grind = { at: 0, level };
  state.encounter = { steps: 0, buff: 0, prev: '' };
  events.push({ t: 'grind', town: state.area, at: 0 });
  state.log.push(`Went to ${areaById(town.grind!.area).name} to train up to Lv. ${level}.`);
}

/** Into a town's gym (or the League's first room). */
function enterGym(state: IdleState, events: SegmentEvent[]) {
  enterArea(state, areaIndex((AREAS[state.area] as TownArea).gym!), events);
  state.log.push(`Went into ${AREAS[state.area]!.name}.`);
}

/** The route (or dungeon) walked just before a town (the user's: Back to it from the town), or null. */
export function previousRoute(townIndex: number): number | null {
  for (let i = townIndex - 1; i >= 0; i--) {
    const kind = AREAS[i]!.kind;
    if (kind === 'route' || kind === 'dungeon') return i;
  }
  return null;
}

/**
 * The furthest area the run has entered (IdleState.reached; an older run's from where it is, the grind it's on and the
 * gyms whose badges it has).
 */
export function reachedArea(state: Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges'>): number {
  const gyms = AREAS.flatMap((a, i) => (a.kind === 'gym' && state.badges.includes(a.badge!) ? [i] : []));
  // An area off the main road is never reached this way (its `opens` opens it).
  const road = (i: number) => (isOptional(i) ? 0 : i);
  return Math.max(state.reached ?? 0, road(state.area), road(state.loop?.resume.area ?? 0), ...gyms);
}

/**
 * The rods (the user's, 2026-10-27): the Old Rod once the run reaches Vermilion City, the Good Rod Fuchsia City, the Super
 * Rod Cinnabar Island; fishing needs one, and each cast takes one of those it has at random (fishCast).
 */
export const RODS = [
  { name: 'Old Rod', town: 'vermilion-city' },
  { name: 'Good Rod', town: 'fuchsia-city' },
  { name: 'Super Rod', town: 'cinnabar-island' },
] as const;

/** The rods a run has (RODS' indexes), by the furthest it has reached. */
export const rodsOf = (state: Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges'>) => RODS.flatMap((r, i) => (reachedArea(state) >= areaIndex(r.town) ? [i] : []));

/** Whether every store sells TMs and HMs (Buy TMs): once the run has reached Celadon City (the user's). */
export const tmShopOpen = (state: Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges'>) => reachedArea(state) >= areaIndex(TM_SHOP_AREA);

/** The furthest place a run has reached (IdleState.progress): an area, its leg and step (a town's 0), the trainers beaten there. */
export type Progress = { area: number; leg: number; step: number; beaten: string[] };

type Place = { area: number; leg: number; step: number };

/** An area's place in the run's order: a town whose gym is beaten just past its gym (the run is back there with the badge). */
function rankOf(state: Pick<IdleState, 'badges'>, index: number): number {
  const a = AREAS[index]!;
  if (isTown(a) && a.gym) {
    const gym = areaById(a.gym);
    if (gym.kind === 'gym' && state.badges.includes(gym.badge!)) return areaIndex(a.gym) + 0.5;
  }
  return index;
}

/** Where the run stands: in a town (or grinding from it) the town. */
const placeOfRun = (state: Pick<IdleState, 'phase' | 'area' | 'leg' | 'step'>): Place => (state.phase === 'town' || state.phase === 'grinding' ? { area: state.area, leg: 0, step: 0 } : { area: state.area, leg: state.leg, step: state.step });

/** How two places of a run compare in its order (below 0: `p` comes first). */
const comparePlaces = (state: Pick<IdleState, 'badges'>, p: Place, q: Place) => rankOf(state, p.area) - rankOf(state, q.area) || p.leg - q.leg || p.step - q.step;

type ProgressState = Pick<IdleState, 'progress' | 'reached' | 'area' | 'leg' | 'step' | 'beaten' | 'loop' | 'badges' | 'phase'>;

/**
 * The run's furthest place (IdleState.progress); an older run's where it is (a route grind's where it began), or the
 * start of the furthest area it reached when that's further on.
 */
export function progressOf(state: ProgressState): Progress {
  if (state.progress) return { ...leagueToTown(state.progress), beaten: AREAS[state.progress.area]!.kind === 'league' ? [] : state.progress.beaten };
  const here: Progress = state.loop ? state.loop.resume : { ...placeOfRun(state), beaten: state.phase === 'walking' ? state.beaten : [] };
  const reached = reachedArea(state);
  const start = { area: reached, leg: 0, step: 0 };
  const p = isOptional(here.area) || comparePlaces(state, start, here) > 0 ? { ...start, beaten: [] } : { ...here, beaten: [...here.beaten] };
  return AREAS[p.area]!.kind === 'league' ? { ...leagueToTown(p), beaten: [] } : p;
}

/**
 * The League's rooms are never progress (the user's: the Elite Four and the Champion beaten in a row on every try): a
 * place in them is the Indigo Plateau's, so Continue run never goes back into a room part way, and every try starts
 * with Lorelei (a Stop part way goes on with the same try: further on than the Plateau, the run is at its furthest).
 */
function leagueToTown<P extends Place>(p: P): P {
  return AREAS[p.area]!.kind === 'league' ? { ...p, area: areaIndex(LEAGUE_TOWN), leg: 0, step: 0 } : p;
}

/** Whether the run stands at its furthest place (Continue run goes on from there rather than to it); never while grinding. */
export function atProgress(state: ProgressState): boolean {
  if (state.loop || state.phase === 'grinding' || isOptional(state.area)) return false;
  return comparePlaces(state, placeOfRun(state), progressOf(state)) >= 0;
}

/** Continue run away from the furthest place (CONTINUE_RUN, a town's wait offline): straight there, whatever it was doing ending. */
function goToProgress(state: IdleState, events: SegmentEvent[]) {
  const p = progressOf(state);
  delete state.loop;
  delete state.grind;
  delete state.inStore;
  state.log.push(`Went on with the run in ${AREAS[p.area]!.name}.`);
  if (isTown(AREAS[p.area]!)) return enterArea(state, p.area, events);
  Object.assign(state, { area: p.area, leg: p.leg, step: p.step, beaten: [...p.beaten], phase: 'walking', encounter: { steps: 0, buff: 0, prev: '' } });
  events.push({ t: 'area', area: p.area, leg: p.leg, step: p.step });
}

/** The run's place marked as its furthest when it is (IdleState.progress): walking on, never grinding nor off the main road. */
function markProgress(state: IdleState) {
  if (state.loop || state.phase === 'grinding' || state.phase === 'won' || state.phase === 'given-up' || isOptional(state.area)) return;
  const here = leagueToTown(placeOfRun(state));
  if (comparePlaces(state, here, progressOf(state)) < 0) return;
  state.progress = { ...here, beaten: state.phase === 'walking' && here.area === state.area ? [...state.beaten] : [] };
}

/** Why the Town Map can't take the run to a town (TRAVEL), or null: only towns reached already, not the one it waits in. */
export function travelError(state: Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges' | 'phase'>, index: number): string | null {
  const a = AREAS[index];
  if (!a || !isTown(a)) return 'Not a town';
  if (index > reachedArea(state)) return 'Not reached yet';
  if (state.phase === 'town' && state.area === index) return 'You are here';
  return null;
}

/** A route grind picked on the Town Map is where the run walks already: started from where it is (as the mode was). */
const mapGrindHere = (state: Pick<IdleState, 'phase' | 'area' | 'loop'>, index: number) => state.phase === 'walking' && state.area === index && (!state.loop || state.loop.resume.area === index);

/** Where a route grind picked on the Town Map starts, away from it: the route's end, its trainers passed (as BACK_ROUTE). */
function mapGrindStart(index: number): Pick<IdleState, 'area' | 'leg' | 'step' | 'beaten' | 'encounter'> {
  const w = AREAS[index] as WalkArea;
  const leg = w.legs.length - 1;
  return { area: index, leg, step: w.legs[leg]!.track.length - 1, beaten: w.trainers.map((t) => t.key), encounter: { steps: 0, buff: 0, prev: '' } };
}

/**
 * What Wild or Trainer grind on a route (or in a dungeon) picked on the Town Map does (the user's), or why it can't: one
 * reached already (off the main road, once its `opens` is); where the run walks, from where it is; elsewhere, from its
 * end. A wild grind stays on that route (no wild Pokémon there: an error, never another route's); with a `spot`, on that
 * wild table's tiles (spotPlan).
 */
export function mapGrindPlan(state: Pick<IdleState, 'reached' | 'area' | 'leg' | 'step' | 'beaten' | 'loop' | 'badges' | 'phase'>, index: number, kind: 'wild' | 'trainers', spot?: string): RouteGrindPlan {
  const a = AREAS[index];
  if (!a || (a.kind !== 'route' && a.kind !== 'dungeon')) return { error: 'Only on a route or in a dungeon' };
  if (legendOf(index)) return { error: 'No grinding there' };
  if (!areaOpen(index, reachedArea(state))) return { error: 'Not reached yet' };
  if (kind === 'wild' && spot !== undefined) {
    const plan = spotPlan(index, spot);
    if (!plan) return { error: 'No wild Pokémon there' };
    if (plan.kind === 'fish' && !rodsOf(state).length) return { error: `No rod yet (the ${RODS[0].name}: ${areaById(RODS[0].town).name})` };
    const loop = state.loop;
    if (state.area === index && plan.kind === 'pace' && loop?.kind === 'pace' && loop.leg === plan.leg && loop.from === plan.from && loop.to === plan.to) return { error: 'Already in that mode' };
    if (state.area === index && plan.kind === 'fish' && loop?.kind === 'fish' && loop.spot === plan.spot) return { error: 'Already in that mode' };
    return plan;
  }
  if (mapGrindHere(state, index) && modeOf(state as Pick<IdleState, 'loop'>) === kind) return { error: 'Already in that mode' };
  const from = mapGrindHere(state, index) ? (state.loop ? { ...state, ...state.loop.resume, loop: undefined } : state) : { ...state, ...mapGrindStart(index), phase: 'walking' as const, loop: undefined };
  const plan = routeGrindPlan(from, kind);
  if ('error' in plan || plan.area === index) return plan;
  return { error: `No wild Pokémon in ${a.name}` };
}

/**
 * Why the Town Map can't send the run to an area's legendary Pokémon (LEGEND), or null: one there, the Indigo Plateau
 * reached (its `opens`), not beaten nor caught in this run yet, and not on the way to it already.
 */
export function legendError(state: Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges' | 'legends' | 'phase'>, index: number): string | null {
  const legend = legendOf(index);
  if (!legend) return 'No legendary Pokémon there';
  if (!areaOpen(index, reachedArea(state))) return 'Reach the Indigo Plateau first';
  if (state.legends?.includes(legend.species)) return `${species(legend.species).name} is gone`;
  if (state.phase === 'walking' && state.area === index) return 'On the way there';
  return null;
}

/** After a legendary Pokémon's battle, or a Stop on the way to it (the user's): back to the Indigo Plateau, its choices waiting. */
function leaveLegend(state: IdleState, events: SegmentEvent[]) {
  delete state.loop;
  delete state.stopped;
  enterArea(state, areaIndex(LEAGUE_TOWN), events);
}

/** Enters an area: a town waits for the player; any other starts at its first leg's first step. */
function enterArea(state: IdleState, index: number, events: SegmentEvent[]) {
  const rods = rodsOf(state).length;
  state.reached = Math.max(reachedArea(state), isOptional(index) ? 0 : index);
  // A rod got in its town (the user's), the first time the run reaches it.
  for (const r of rodsOf(state).slice(rods)) state.log.push(`Got the ${RODS[r]!.name}!`);
  // A route grind keeps going through a white-out back to its route's start; any other area ends it.
  if (index !== state.area) delete state.loop;
  delete state.inStore;
  state.area = index;
  state.leg = 0;
  state.step = 0;
  const a = AREAS[index]!;
  // A gym's trainers beaten before stay beaten (gymBeaten); any other area's are fought again.
  state.beaten = a.kind === 'gym' ? (state.gymBeaten ?? []).filter((k) => (a as WalkArea).trainers.some((t) => t.key === k)) : [];
  state.encounter = { steps: 0, buff: 0, prev: '' };
  delete state.grind;
  if (isTown(a)) {
    state.phase = 'town';
    events.push({ t: 'town', area: index });
    state.log.push(`Reached ${a.name}.`);
  } else {
    state.phase = 'walking';
    events.push({ t: 'area', area: index, leg: 0, step: 0 });
  }
}

/** The balls in a bag, every kind. */
export const ballCount = (bag: Record<string, number>) => BALLS.reduce((n, [b]) => n + (bag[b] ?? 0), 0);

/** Auto-buy balls (the user's): in a town, the cheapest ball its store sells, up to the setting's count, while the money lasts. */
function autoBuyBalls(state: IdleState, settings: IdleSettings, events: SegmentEvent[]) {
  const town = AREAS[state.area]!;
  const want = Math.min(settings.autoBalls, MAX_AUTO_BALLS) - ballCount(state.bag);
  if (!isTown(town) || want <= 0) return;
  const stock = storeStock(town, state);
  const ball = BALLS.map(([b]) => b)
    .filter((b) => stock.includes(b))
    .sort((a, b) => itemData(a).price - itemData(b).price)[0];
  if (!ball) return;
  const price = itemData(ball).price;
  const count = Math.min(want, Math.floor(state.money / price));
  if (count <= 0) return;
  state.money -= count * price;
  state.bag[ball] = (state.bag[ball] ?? 0) + count;
  events.push({ t: 'bought', item: ball, count, cost: count * price });
  state.log.push(`Bought ${count} ${itemData(ball).name}${count === 1 ? '' : 's'} for ₱${count * price}.`);
}

/** Buys and uses a stone for each party Pokémon that can use one the store sells (auto-evolve), while the money lasts. */
function autoStones(state: IdleState, stock: string[], events: SegmentEvent[]) {
  for (let i = 0; i < state.party.length; i++) {
    const mon = state.party[i]!;
    const stone = usableStones(mon).find((s) => stock.includes(s));
    if (!stone) continue;
    const price = itemData(stone).price;
    if (state.money < price) continue;
    state.money -= price;
    const into = stoneEvolution(mon, stone)!;
    state.party[i] = evolve(mon, into, state.bag).mon;
    events.push({ t: 'evolve', uid: mon.uid, from: mon.species, into });
    state.log.push(`Bought a ${itemData(stone).name}: ${species(mon.species).name} evolved into ${species(into).name}!`);
  }
}

/** The changes queued while a wild battle's replay is held (IdleState.pending): the party's order, its moves, a stone. */
export const QUEUED_ACTIONS: IdleAction['type'][] = ['SET_ORDER', 'SET_SLOTS', 'USE_STONE', 'SET_MODE'];

/** The run's modes (the Town Map's buttons and its routes' grinds, the user's). */
export const IDLE_MODES = ['route', 'wild', 'trainers', 'stop'] as const;
export type IdleMode = (typeof IDLE_MODES)[number];

/** The mode a run is in: stopped, grinding wild Pokémon or trainers on a route, else going on. */
export const modeOf = (s: Pick<IdleState, 'stopped' | 'loop'>): IdleMode => (s.stopped ? 'stop' : s.loop?.kind === 'pace' || s.loop?.kind === 'fish' ? 'wild' : s.loop?.kind === 'trainers' ? 'trainers' : 'route');

/**
 * Applies the player's choice to a run. Pure: returns a new state, or an error. A party change while the last segment's
 * wild battle can still be played again (IdleState.replay: the ball button) is checked against the run as it will be,
 * then queued (`pending`) instead, keeping the replay (the user's).
 */
export function applyIdleAction(prev: IdleState, action: IdleAction): IdleResult {
  if (throwable(prev) && QUEUED_ACTIONS.includes(action.type)) {
    const check = applyNow(withPending(prev), action);
    if (!check.ok) return check;
    const state = structuredClone(prev);
    state.pending = [...(prev.pending ?? []), action];
    state.version += 1;
    return { ok: true, state };
  }
  return applyNow(withPending(prev), action);
}

/**
 * A run with its queued changes applied (IdleState.pending), in order, its version kept; a party order naming a Pokémon
 * no longer there (or missing a new one: the battle's catch) puts the ones it names first, the rest after; a change that
 * can't be made any more is dropped.
 */
export function withPending(prev: IdleState): IdleState {
  if (!prev.pending?.length) return prev;
  let state = structuredClone(prev);
  delete state.pending;
  for (const action of prev.pending) {
    const uids = state.party.map((m) => m.uid);
    const fitted: IdleAction = action.type === 'SET_ORDER' ? { type: 'SET_ORDER', uids: [...action.uids.filter((u) => uids.includes(u)), ...uids.filter((u) => !action.uids.includes(u))] } : action;
    const r = applyNow(state, fitted);
    if (r.ok) state = r.state;
  }
  state.version = prev.version;
  if (prev.replay) state.replay = prev.replay;
  return state;
}

/** The choice applied at once (applyIdleAction's rules). */
function applyNow(prev: IdleState, action: IdleAction): IdleResult {
  const state = structuredClone(prev);
  // Kept to resume the segment (idle.resume), but no ball any more: playing it again from before would undo this.
  if (state.replay) state.replay.throwable = false;
  const fail = (error: string): IdleResult => ({ ok: false, error });
  const ok = (): IdleResult => {
    markProgress(state);
    state.version += 1;
    return { ok: true, state };
  };
  if (state.phase === 'won' || state.phase === 'given-up') return fail('This run is over');
  // Kept before anything moves the run back (an older run's worked out once).
  state.reached = reachedArea(state);
  state.progress = progressOf(state);
  const area = AREAS[state.area]!;
  const inTown = state.phase === 'town' && isTown(area);
  // Out of the store before going anywhere (the user's: it's left by hand).
  if (state.inStore && (action.type === 'GYM' || action.type === 'GRIND' || action.type === 'CONTINUE' || action.type === 'BACK_ROUTE')) return fail('Leave the store first');
  switch (action.type) {
    case 'GYM': {
      if (!inTown || !area.gym) return fail('There is no gym here');
      if (townDone(state, area)) return fail('Its badge is won already');
      enterGym(state, []);
      return ok();
    }
    case 'GRIND': {
      const error = grindError(state);
      if (error) return fail(error);
      startGrind(state, []);
      return ok();
    }
    case 'WILD_GRIND':
    case 'TRAINER_GRIND': {
      const error = startRouteLoop(state, action.type === 'WILD_GRIND' ? 'wild' : 'trainers');
      if (error) return fail(error);
      return ok();
    }
    case 'SET_MODE': {
      if (action.mode === 'stop') {
        // Nothing to stop in a town (the user's); walking, it stops where it stands (the API cuts the segment playing first: cutSegment).
        if (state.stopped || state.phase === 'town') return ok();
        // On the way to a legendary Pokémon or in its battle (the user's): back to the Indigo Plateau instead.
        const legend = legendOf(state.area);
        if (legend && state.phase === 'walking') {
          state.log.push(`Left ${species(legend.species).name}.`);
          leaveLegend(state, []);
          return ok();
        }
        // Auto-grinding (the user's): the grind ends, the player stopped where they stand on its route.
        if (state.phase === 'grinding') leaveAutoGrind(state);
        state.stopped = true;
        state.log.push('Stopped.');
        return ok();
      }
      const was = state.stopped;
      delete state.stopped;
      if (action.mode === 'route') {
        if (state.loop) endRouteLoop(state);
        else if (was) state.log.push('Went on.');
        return ok();
      }
      // A grind: the one on already, only going on again; otherwise started (switching from the other one).
      if (modeOf(state) === action.mode) return ok();
      const error = startRouteLoop(state, action.mode === 'wild' ? 'wild' : 'trainers');
      if (error) return fail(error);
      return ok();
    }
    case 'TRAVEL': {
      const error = travelError(state, action.area);
      if (error) return fail(error);
      // Whatever it was doing ends (a route grind, a town's auto-grind, the store); the mode (Stop) stays.
      delete state.loop;
      state.log.push(`Went to ${AREAS[action.area]!.name} by the Town Map.`);
      enterArea(state, action.area, []);
      return ok();
    }
    case 'CONTINUE_RUN': {
      const was = state.stopped;
      delete state.stopped;
      if (atProgress(state)) {
        // There already: on from a town whose gym is beaten (the old Continue), else on along the way.
        if (inTown && townDone(state, area)) enterArea(state, afterTown(state.area), []);
        // At the Indigo Plateau (Enter the Pokémon League, the user's): into the League's first room, Lorelei's.
        else if (inTown && area.gym && areaById(area.gym).kind === 'league') enterGym(state, []);
        else if (was) state.log.push('Went on.');
        return ok();
      }
      // Elsewhere (a town or a grind the Town Map took it to, a route grind): straight to the furthest place (the user's).
      goToProgress(state, []);
      return ok();
    }
    case 'GRIND_AT': {
      const plan = mapGrindPlan(state, action.area, action.kind, action.spot);
      if ('error' in plan) return fail(plan.error);
      delete state.stopped;
      if ((plan.kind === 'pace' || plan.kind === 'fish') && action.spot !== undefined) {
        // One wild table's tiles (a floor, a zone): where the run walks there, its grind ends first (back where it began);
        // elsewhere, from the area's end (as below); then pacing on that spot.
        if (mapGrindHere(state, action.area)) {
          if (state.loop) endRouteLoop(state);
        } else {
          delete state.loop;
          delete state.grind;
          delete state.inStore;
          Object.assign(state, mapGrindStart(action.area), { phase: 'walking' });
          state.log.push(`Went to ${AREAS[action.area]!.name} by the Town Map.`);
        }
        const resume = { area: state.area, leg: state.leg, step: state.step, beaten: [...state.beaten] };
        if (plan.kind === 'fish') startFishing(state, plan, resume);
        else startPacing(state, plan, resume);
        return ok();
      }
      if (mapGrindHere(state, action.area)) {
        if (modeOf(state) === action.kind) return ok();
        const error = startRouteLoop(state, action.kind);
        return error ? fail(error) : ok();
      }
      // Elsewhere: at the end of that route, its trainers passed (as BACK_ROUTE); Continue run goes back to the run's
      // furthest place.
      delete state.loop;
      delete state.grind;
      delete state.inStore;
      Object.assign(state, mapGrindStart(action.area), { phase: 'walking' });
      state.log.push(`Went to ${AREAS[action.area]!.name} by the Town Map.`);
      const error = startRouteLoop(state, action.kind);
      return error ? fail(error) : ok();
    }
    case 'LEGEND': {
      const error = legendError(state, action.area);
      if (error) return fail(error);
      // Whatever it was doing ends (a route grind, a town's auto-grind, the store, Stop): walking up to it.
      delete state.loop;
      delete state.grind;
      delete state.inStore;
      delete state.stopped;
      Object.assign(state, { area: action.area, leg: 0, step: 0, beaten: [], phase: 'walking', encounter: { steps: 0, buff: 0, prev: '' } });
      state.log.push(`Went to find ${species(legendOf(action.area)!.species).name} by the Town Map.`);
      return ok();
    }
    case 'CONTINUE_ROUTE': {
      if (!state.loop) return fail('Not grinding');
      endRouteLoop(state);
      return ok();
    }
    case 'STOP_GRIND': {
      if (state.phase !== 'grinding') return fail('Not grinding');
      state.phase = 'town';
      delete state.grind;
      state.log.push(`Stopped training and went back to ${area.name}.`);
      return ok();
    }
    case 'BACK_ROUTE': {
      if (!inTown) return fail('Not in a town');
      const back = previousRoute(state.area);
      if (back === null) return fail('There is no route behind this town');
      // Its end (the user's), its trainers beaten on the way, and a wild grind from there until Route mode walks on to
      // this town again.
      const area = AREAS[back] as WalkArea;
      const leg = area.legs.length - 1;
      const step = area.legs[leg]!.track.length - 1;
      Object.assign(state, { area: back, leg, step, phase: 'walking', beaten: area.trainers.map((t) => t.key), encounter: { steps: 0, buff: 0, prev: '' } });
      delete state.grind;
      delete state.loop;
      state.log.push(`Went back to ${area.name}.`);
      const plan = wildPlan(back, leg, step, -1);
      if (plan) startPacing(state, plan, { area: back, leg, step, beaten: [...state.beaten] });
      return ok();
    }
    case 'CONTINUE': {
      if (!inTown) return fail('Not in a town');
      if (!townDone(state, area)) return fail(area.gym && areaById(area.gym).kind === 'league' ? 'The League is the only way on' : 'Win the gym\'s badge first');
      enterArea(state, afterTown(state.area), []);
      return ok();
    }
    case 'VISIT_STORE': {
      if (!inTown) return fail('Not in a town');
      if (!area.marts.length) return fail('There is no store here');
      if (state.inStore) return fail('In the store already');
      state.inStore = true;
      return ok();
    }
    case 'LEAVE_STORE': {
      if (!state.inStore) return fail('Not in the store');
      delete state.inStore;
      return ok();
    }
    case 'BUY': {
      if (!inTown) return fail('Not in a town');
      if (!state.inStore) return fail('Not in the store');
      // A TM or HM (Buy TMs, every store's from Celadon City on): one of each, kept for good (the user's).
      if (isMachine(action.item)) {
        if (!tmShopOpen(state)) return fail('TMs are sold from Celadon City on');
        if (state.bag[action.item]) return fail('You have it already');
        if (action.count !== 1) return fail('One of each');
        const cost = machinePrice(action.item);
        if (cost > state.money) return fail('Not enough money');
        state.money -= cost;
        state.bag[action.item] = 1;
        // Pokémon on the automatic pick take its move at once if it's among their strongest.
        for (const m of state.party) if (m.autoSlots) m.slots = autoSlots(m, state.bag);
        state.log.push(`Bought ${itemData(action.item).name.toUpperCase()} for ₱${cost}.`);
        return ok();
      }
      if (!storeStock(area, state).includes(action.item)) return fail('Not sold here');
      if (!Number.isInteger(action.count) || action.count < 1 || action.count > 99) return fail('Buy 1 to 99');
      const cost = itemData(action.item).price * action.count;
      if (cost > state.money) return fail('Not enough money');
      state.money -= cost;
      state.bag[action.item] = (state.bag[action.item] ?? 0) + action.count;
      return ok();
    }
    case 'SET_ORDER': {
      const uids = state.party.map((m) => m.uid);
      if (action.uids.length !== uids.length || !uids.every((u) => action.uids.includes(u))) return fail('Every party Pokémon, once each');
      state.party = action.uids.map((u) => state.party.find((m) => m.uid === u)!);
      return ok();
    }
    case 'SET_SLOTS': {
      const mon = state.party.find((m) => m.uid === action.uid);
      if (!mon) return fail('Not in the party');
      if (action.auto) {
        mon.autoSlots = true;
        mon.slots = autoSlots(mon, state.bag);
        return ok();
      }
      if (action.slots.length > 3 || new Set(action.slots).size !== action.slots.length) return fail('Up to 3 different moves');
      // Its own moves and its owned TMs' and HMs' it can learn (the user's).
      const moves = slotMoves(mon, state.bag);
      if (action.slots.some((m) => !moves.includes(m) || m === basicFor(mon))) return fail('Only moves it knows or a TM it can learn, not its basic move');
      mon.slots = [...action.slots];
      mon.autoSlots = false;
      return ok();
    }
    case 'USE_STONE': {
      const i = state.party.findIndex((m) => m.uid === action.uid);
      if (i < 0) return fail('Not in the party');
      if (!state.bag[action.item]) return fail('None in the bag');
      const into = stoneEvolution(state.party[i]!, action.item);
      if (!into) return fail("It won't have any effect");
      state.bag[action.item]! -= 1;
      if (!state.bag[action.item]) delete state.bag[action.item];
      const from = state.party[i]!.species;
      state.party[i] = evolve(state.party[i]!, into, state.bag).mon;
      state.log.push(`${species(from).name} evolved into ${species(into).name}!`);
      return ok();
    }
    case 'GIVE_UP': {
      state.phase = 'given-up';
      state.log.push('Gave up the run.');
      return ok();
    }
  }
}

/** Visiting a store with auto-evolve on: the stones bought and used (the API applies it with VISIT_STORE). */
export function visitStore(prev: IdleState, settings: IdleSettings): { state: IdleState; events: SegmentEvent[] } {
  const state = structuredClone(prev);
  const events: SegmentEvent[] = [];
  const area = AREAS[state.area]!;
  if (settings.autoEvolve && state.phase === 'town' && isTown(area)) autoStones(state, storeStock(area, state), events);
  return { state, events };
}

// ---- Walking and battles ----
/** The land slots' odds (ENCOUNTER_CHANCE_LAND_MONS: 20/20/10/10/10/10/5/5/4/4/1/1) and the water slots' (60/30/5/4/1). */
const LAND_ODDS = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1];
const WATER_ODDS = [60, 30, 5, 4, 1];
/** Each rod's slots of a fishing table, from its first (ENCOUNTER_CHANCE_FISHING_MONS: the Old Rod's 70/30, the Good Rod's 60/20/20, the Super Rod's 40/40/15/4/1). */
const ROD_SLOTS: [first: number, odds: number[]][] = [
  [0, [70, 30]],
  [2, [60, 20, 20]],
  [5, [40, 40, 15, 4, 1]],
];

/** Each of a table's extra slots' share of its encounters (EncounterSlots.extra: a placeholder, to balance later). */
export const EXTRA_PERCENT = 5;

/**
 * A wild Pokémon of a table: [min level, max level, dex number]. One of its extra slots EXTRA_PERCENT of the time each,
 * else a slot by the game's odds, LeafGreen's Pokémon there half the time where its differs (the user's, 2026-10-27).
 */
function pickWild(rng: Rng, table: EncounterSlots, odds: number[], first = 0): [number, number, number] {
  const extra = table.extra ?? [];
  if (extra.length && int(rng, 100) < EXTRA_PERCENT * extra.length) return extra[int(rng, extra.length)]!;
  const slot = first + pickSlot(rng, odds);
  const lg = table.leafGreen?.find((s) => s[0] === slot);
  if (lg && int(rng, 2)) return [lg[1], lg[2], lg[3]];
  return table.mons[slot]!;
}

function pickSlot(rng: Rng, odds: number[]): number {
  let r = int(rng, 100);
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i]!;
    if (r < 0) return i;
  }
  return odds.length - 1;
}

/**
 * Whether a step brings out a wild Pokémon (wild_encounter.c): the cooldown (no encounter for a few steps after one,
 * unless a 5% roll), a 60% roll when the tile's kind changes, then the table's rate × 16 (plus the build-up from steps
 * without one) out of 1600, halved by a lead with Stench, doubled with Illuminate.
 */
function wildCheck(rng: Rng, enc: EncounterState, table: EncounterSlots, tile: string, lead: Mon): boolean {
  const ability = abilityOf(lead);
  const mod = ability === 'stench' ? 1 : ability === 'illuminate' ? 2 : 0;
  const rate = table.rate;
  let minSteps = rate >= 80 ? 0 : rate < 10 ? 8 : 8 - Math.floor(rate / 10);
  minSteps *= 256;
  let encRate = 5 * 256;
  if (mod === 1) {
    minSteps *= 2;
    encRate = Math.floor(encRate / 2);
  } else if (mod === 2) {
    minSteps = Math.floor(minSteps / 2);
    encRate *= 2;
  }
  minSteps = Math.floor(minSteps / 256);
  encRate = Math.floor(encRate / 256);
  const prev = enc.prev;
  enc.prev = tile;
  if (enc.steps < minSteps) {
    enc.steps += 1;
    if (int(rng, 100) >= encRate) return false;
  }
  if (prev !== tile && int(rng, 100) >= 60) return false;
  let r = rate * 16 + Math.floor((enc.buff * 16) / 200);
  if (mod === 1) r = Math.floor(r / 2);
  else if (mod === 2) r *= 2;
  r = Math.min(r, 1600);
  if (int(rng, 65536) % 1600 < r) {
    enc.steps = 0;
    enc.buff = 0;
    return true;
  }
  enc.buff += rate;
  return false;
}

/** The trainer key for an area's trainer (Blue's team by the run's rival starter). */
const trainerKey = (state: IdleState, key: string) => (key === 'champion' ? `champion-first-${state.rivalStarter}` : key);

/** A trainer's Pokémon: its IVs from the party's 0–255 value (iv × 31 / 255), no EVs, its moves or the last 4 learned. */
function trainerParty(rng: Rng, key: string): Mon[] {
  const t = TRAINERS[key];
  if (!t) throw new Error(`Unknown trainer ${key}`);
  return t.party.map((p) => {
    const iv = Math.floor((p.iv * 31) / 255);
    const mon = createMon(rng, { species: p.species, level: p.level, ivs: [iv, iv, iv, iv, iv, iv], ...(p.item && { item: p.item }) });
    return opponentMon(mon, p.moves);
  });
}

/** The terrain of a track step's tile (its second letter). */
const terrainOf = (tile: string): Terrain => {
  const t = TERRAIN_LETTERS[(tile[1] ?? '.') as keyof typeof TERRAIN_LETTERS] ?? 'plain';
  return t as Terrain;
};

/** Whether auto-catch tries this wild Pokémon: by the setting and the dex, and not with a full party when catching stops then. */
function shouldCatch(state: IdleState, settings: IdleSettings, caught: ReadonlySet<number>, id: number): boolean {
  if (settings.autoCatch === 'off') return false;
  if (settings.autoCatch === 'new' && caught.has(id)) return false;
  if (state.party.length >= PARTY_SIZE && settings.stopWhenFull) return false;
  return true;
}

/** Notes for the dex: every party Pokémon's IVs and EVs (they only grow). */
export const partyNotes = (party: Mon[]): DexNote[] => party.map((m) => ({ species: m.species, ivs: m.ivs, evs: m.evs, ...(m.shiny && { shiny: true as const }) }));

/**
 * Plays one battle and settles it: experience and levels kept, evolutions after it (the game's), prize money, a
 * badge, a caught Pokémon kept or released, or a white-out (back to the area's start, its trainers to fight again).
 */
function battle(state: IdleState, rng: Rng, settings: PlaySettings, caught: Set<number>, o: { kind: 'wild' | 'trainer'; foes: Mon[]; trainer?: string; tile: string; scene: string }, out: Segment) {
  const tryCatch = o.kind === 'wild' && shouldCatch(state, settings, caught, o.foes[0]!.species);
  const before = state.party.map((m) => m.level);
  const t = o.trainer ? TRAINERS[o.trainer] : null;
  const result = simulateBattle(
    { kind: o.kind, party: state.party, foes: o.foes, foeItems: t?.items ?? [], bag: state.bag, settings: { autoHeal: settings.autoHeal, revives: settings.revives, tryCatch, catchMove: settings.catchMove }, boss: !!o.trainer && /^(leader|elite-four|champion)/.test(o.trainer), badges: state.badges.length, terrain: terrainOf(o.tile), ...(o.kind === 'wild' && settings.throwAt?.length && { throwAt: settings.throwAt }) },
    rng,
  );
  out.events.push({
    t: 'battle',
    kind: o.kind,
    ...(o.trainer && { trainer: o.trainer }),
    terrain: terrainOf(o.tile),
    scene: o.scene,
    party: structuredClone(state.party),
    foes: o.foes.map((f) => ({ species: f.species, level: f.level })),
    events: result.events,
    result: result.result,
    ticks: result.ticks,
    ...(o.kind === 'wild' && caught.has(o.foes[0]!.species) && { caughtBefore: true as const }),
  });
  // FireRed's intro and send-outs (the user's: their animations' time kept), then a tick a turn.
  out.durationMs += BATTLE_MS + openingMs(result.events, o.kind) + result.ticks * TICK_MS;
  state.totals.battles += 1;
  if (o.kind === 'wild') state.totals.wild += 1;
  else state.totals.trainers += 1;
  for (const f of o.foes) out.dex.push({ species: f.species, seen: true });
  state.bag = result.bag;
  state.party = result.party;
  // Evolutions after the battle, for those that grew a level in it (Kanto's 151 only; trade evolutions at their set levels).
  state.party = state.party.map((m, i) => {
    if (m.level === before[i]) return m;
    const into = levelEvolution(m);
    if (!into) return m;
    out.events.push({ t: 'evolve', uid: m.uid, from: m.species, into });
    state.log.push(`${species(m.species).name} evolved into ${species(into).name}!`);
    return evolve(m, into, state.bag).mon;
  });
  out.dex.push(...partyNotes(state.party));
  if (result.payDay) {
    state.money += result.payDay;
    out.events.push({ t: 'money', amount: result.payDay, total: state.money, why: 'Pay Day' });
  }
  if (result.result === 'caught' && result.caught) {
    // Every move its line learns by its level (the user's: an evolved Pokémon caught knows its pre-evolutions' too), its
    // slots the strongest of them.
    const moves = familyMovesUpTo(result.caught.species, result.caught.level);
    const mon: Mon = { ...result.caught, moves, slots: autoSlots({ species: result.caught.species, moves }, state.bag), autoSlots: true };
    caught.add(mon.species);
    state.totals.caught += 1;
    out.dex.push({ species: mon.species, seen: true, caught: true, ivs: mon.ivs, evs: mon.evs, ...(mon.shiny && { shiny: true as const }) });
    if (state.party.length < PARTY_SIZE) {
      state.party.push(mon);
      out.events.push({ t: 'caught', species: mon.species, kept: true, ...(mon.shiny && { shiny: true as const }) });
    } else if (settings.replaceLowest) {
      let low = 0;
      state.party.forEach((m, i) => m.level < state.party[low]!.level && (low = i));
      const gone = state.party[low]!;
      out.dex.push({ species: gone.species, ivs: gone.ivs, evs: gone.evs });
      state.party[low] = mon;
      out.events.push({ t: 'caught', species: mon.species, kept: true, replaced: gone.species, ...(mon.shiny && { shiny: true as const }) });
    } else {
      out.events.push({ t: 'caught', species: mon.species, kept: false, ...(mon.shiny && { shiny: true as const }) });
    }
    state.log.push(`Caught ${species(mon.species).name}!`);
  }
  if (result.result === 'won' && t && o.trainer) {
    // The full prize the first time a trainer is beaten in a run, a quarter after that (the user's: grinding them).
    const full = t.money * o.foes.at(-1)!.level;
    const rematch = (state.paid ?? []).includes(o.trainer);
    const prize = rematch ? Math.floor(full * REMATCH_PRIZE) : full;
    if (!rematch) (state.paid ??= []).push(o.trainer);
    state.money += prize;
    out.events.push({ t: 'money', amount: prize, total: state.money, why: `${t.class} ${t.name}${rematch ? ', rematch' : ''}` });
  }
  if (result.result === 'lost') return false;
  return true;
}

// ---- Grinding on a route (the user's, 2026-10-25) ----
/** A rematch's share of a trainer's prize (the user's: the full prize only the first time). */
export const REMATCH_PRIZE = 0.25;

/** How many steps before the first trainer a trainers loop starts, to walk up to them. */
export const LOOP_RUN_UP = 4;
/** The most track steps a pacing loop walks back and forth over. */
const PACE_TILES = 3;

/** Where the track first comes into a trainer's sight: where the run meets them (as trainerHere does). */
export function meetStep(a: WalkArea, key: string): { leg: number; step: number } | null {
  const t = a.trainers.find((x) => x.key === key);
  if (!t) return null;
  const track = a.legs[t.leg]!.track;
  const step = track.findIndex(([m, x, y]) => m === t.map && t.sight.some(([sx, sy]) => sx === x && sy === y));
  return step < 0 ? null : { leg: t.leg, step };
}

const before = (p: { leg: number; step: number }, q: { leg: number; step: number }) => p.leg < q.leg || (p.leg === q.leg && p.step < q.step);

/**
 * A pacing loop on a leg near `step`: the nearest run of PACE_TILES (or 2) track steps that are all wild encounter tiles
 * of one kind, on one map, walked onto without a fade or a ledge, behind `step` first. Trainers' sight doesn't matter:
 * a wild grind is wild Pokémon only, no trainer spots it (the user's).
 */
function paceWindow(areaIndex: number, leg: number, step: number, spot?: string): { from: number; to: number } | null {
  const { legs } = AREAS[areaIndex] as WalkArea;
  const track = legs[leg]!.track;
  const fits = (s: number, n: number) => {
    if (s < 0 || s + n > track.length) return false;
    if (spot !== undefined && spotOf(legs[leg]!, track[s]!) !== spot) return false;
    for (let i = s; i < s + n; i++) {
      const [m, , , flags, tile] = track[i]!;
      if ((tile[0] !== 'l' && tile[0] !== 'w') || tile[0] !== track[s]![4][0] || m !== track[s]![0] || (i > s && flags)) return false;
    }
    return true;
  };
  // Behind (or around) the step before ahead of it, then the nearest.
  const cost = (s: number) => (s <= step ? 0 : 10000) + Math.abs(s - step);
  for (const n of [PACE_TILES, 2]) {
    let best: number | null = null;
    for (let s = 0; s + n <= track.length; s++) if (fits(s, n) && (best === null || cost(s) < cost(best))) best = s;
    if (best !== null) return { from: best, to: best + n - 1 };
  }
  return null;
}

/** A wild table a grind can pace on (the Town Map's wild grinds, the user's, 2026-10-27): one map's land or water Pokémon. */
export interface WildSpot {
  /** Its map and kind ('PokemonTower_3F:l'): GRIND_AT's `spot`. */
  id: string;
  /** Its map's short name (3F, East, Viridian Forest) and whether it's surfed. */
  label: string;
  water: boolean;
  /** Fished ('Route12:f', the user's): its map's fishing table, from the area's fishing spot there (WalkArea.fishing). */
  fish?: true;
  /** Its map (its Town Map place's: IdleMap.section). */
  map: string;
}

/** A track step's wild table (WildSpot.id), or null on a tile with no wild Pokémon (a cave's entrance has none: no table). */
function spotOf(leg: IdleLeg, [m, , , , tile]: TrackStep): string | null {
  const kind = tile[0] === 'l' ? 'land' : tile[0] === 'w' ? 'water' : null;
  const map = leg.maps[m]!;
  return kind && ENCOUNTERS[mapView(map).encounters]?.[kind] ? `${map}:${tile[0]}` : null;
}

/** A map's short name: its floor or zone (PokemonTower_3F: 3F, SafariZone_East: East), else its name spaced (Viridian Forest). */
const mapLabel = (map: string) => (map.includes('_') ? map.slice(map.lastIndexOf('_') + 1) : map.replace(/([a-z])([A-Z0-9])/g, '$1 $2'));

/**
 * The wild tables an area's grinds can pace on, in the track's order: each map's land and water Pokémon its track walks
 * enough tiles of for a pacing window (spotPlan). The Town Map offers each when there's more than one.
 */
export function wildSpots(areaIndex: number): WildSpot[] {
  const area = AREAS[areaIndex];
  if (!area || isTown(area)) return [];
  // Worked out once an area (the Town Map asks for every open area's on each click).
  const known = spotsOf.get(areaIndex);
  if (known) return known;
  const out: WildSpot[] = [];
  spotsOf.set(areaIndex, out);
  for (const leg of area.legs) {
    for (const step of leg.track) {
      const id = spotOf(leg, step);
      if (id === null || out.some((s) => s.id === id) || !spotPlan(areaIndex, id)) continue;
      out.push({ id, label: mapLabel(leg.maps[step[0]]!), water: id.endsWith(':w'), map: leg.maps[step[0]]! });
    }
  }
  // Its fishing spots (the user's), one a map with fishing.
  for (const [l, step] of area.fishing ?? []) {
    const map = area.legs[l]!.maps[area.legs[l]!.track[step]![0]]!;
    if (ENCOUNTERS[mapView(map).encounters]?.fishing) out.push({ id: `${map}:f`, label: mapLabel(map), water: true, fish: true, map });
  }
  return out;
}

const spotsOf = new Map<number, WildSpot[]>();

/** An area's fishing spot's map (WalkArea.fishing). */
const fishMap = (area: WalkArea, spot: number) => {
  const [l, step] = area.fishing![spot]!;
  return area.legs[l]!.maps[area.legs[l]!.track[step]![0]]!;
};

/** Where a wild grind on one of an area's wild tables (WildSpot.id) paces: its last pacing window along the track, or null. */
function spotPlan(areaIndex: number, spot: string): Extract<RouteGrindPlan, { kind: 'pace' | 'fish' }> | null {
  const area = AREAS[areaIndex] as WalkArea;
  const { legs } = area;
  if (spot.endsWith(':f')) {
    const i = (area.fishing ?? []).findIndex((_, k) => `${fishMap(area, k)}:f` === spot);
    return i >= 0 && ENCOUNTERS[mapView(fishMap(area, i)).encounters]?.fishing ? { kind: 'fish', area: areaIndex, spot: i } : null;
  }
  for (let l = legs.length - 1; l >= 0; l--) {
    const found = paceWindow(areaIndex, l, legs[l]!.track.length - 1, spot);
    if (found) return { kind: 'pace', area: areaIndex, leg: l, ...found };
  }
  // A table the track only crosses a tile at a time (Route 9's and 14's grass): back and forth between one of its tiles
  // and the step beside it (an encounter only on its own tile).
  for (let l = legs.length - 1; l >= 0; l--) {
    const track = legs[l]!.track;
    for (let s = track.length - 2; s >= 0; s--) {
      const [m, , , flags] = track[s + 1]!;
      if (m !== track[s]![0] || flags) continue;
      if (spotOf(legs[l]!, track[s]!) === spot || spotOf(legs[l]!, track[s + 1]!) === spot) return { kind: 'pace', area: areaIndex, leg: l, from: s, to: s + 1 };
    }
  }
  return null;
}

/**
 * What a route grind does from where the run stands (the user's, 2026-10-25): `trainers` (Trainer grind, TRAINER_GRIND),
 * every trainer of its route in a loop, the first to the last, beaten or not; `wild` (Wild grind, WILD_GRIND), pacing near
 * it on its leg, and with no wild Pokémon there, on the most recent stretch that has them (an earlier leg of its area,
 * else the nearest earlier route or dungeon, near its end), shown on the button beforehand (`area`). An error when it can't.
 */
export type RouteGrindPlan =
  | { kind: 'trainers'; area: number; keys: string[]; first: { leg: number; step: number } }
  | { kind: 'pace'; area: number; leg: number; from: number; to: number }
  | { kind: 'fish'; area: number; spot: number }
  | { error: string };

/**
 * Where Wild or Trainer grind starts from a town (the user's: auto-grinding there, or waiting, either grind can be chosen
 * and holds until Route): the end of the route before it (its grind loop's leg, the area's grind route), that route's
 * trainers passed. Null outside a town, or with no route before it.
 */
function townGrindStart(state: Pick<IdleState, 'phase' | 'area'>): Pick<IdleState, 'area' | 'leg' | 'step' | 'beaten'> | null {
  const town = AREAS[state.area]!;
  if ((state.phase !== 'town' && state.phase !== 'grinding') || !isTown(town)) return null;
  const route = town.grind ? areaIndex(town.grind.area) : previousRoute(state.area);
  if (route === null) return null;
  const w = AREAS[route] as WalkArea;
  const leg = town.grind ? town.grind.leg : w.legs.length - 1;
  return { area: route, leg, step: w.legs[leg]!.track.length - 1, beaten: w.trainers.map((t) => t.key) };
}

export function routeGrindPlan(state: Pick<IdleState, 'phase' | 'area' | 'leg' | 'step' | 'beaten' | 'loop'>, kind: 'wild' | 'trainers'): RouteGrindPlan {
  // From a town (or its auto-grind): planned from the end of the route before it.
  const start = townGrindStart(state);
  if (start) state = { ...state, ...start, phase: 'walking', loop: undefined };
  const a = AREAS[state.area]!;
  if (state.phase !== 'walking' || (a.kind !== 'route' && a.kind !== 'dungeon')) return { error: 'Only on a route or in a dungeon' };
  const area = a as WalkArea;
  if (kind === 'trainers') {
    const keys = area.trainers.map((t) => t.key).filter((k) => meetStep(area, k));
    if (!keys.length) return { error: 'No trainers on this route' };
    return { kind: 'trainers', area: state.area, keys, first: keys.map((k) => meetStep(area, k)!).reduce((x, y) => (before(y, x) ? y : x)) };
  }
  return wildPlan(state.area, state.leg, state.step, -1) ?? { error: 'No wild Pokémon around here' };
}

/**
 * Where wild grinding paces from a place: near `step` on its leg, else (no wild Pokémon there) on the nearest other leg of
 * its area the way `dir` goes (-1: back from it; 1: on from it), else the nearest earlier route or dungeon, near its end.
 */
function wildPlan(areaIndex: number, leg: number, step: number, dir: 1 | -1): Extract<RouteGrindPlan, { kind: 'pace' }> | null {
  const here = paceWindow(areaIndex, leg, step);
  if (here) return { kind: 'pace', area: areaIndex, leg, ...here };
  const legs = (AREAS[areaIndex] as WalkArea).legs;
  for (let l = leg + dir; l >= 0 && l < legs.length; l += dir) {
    const found = paceWindow(areaIndex, l, dir < 0 ? legs[l]!.track.length - 1 : 0);
    if (found) return { kind: 'pace', area: areaIndex, leg: l, ...found };
  }
  // Off the main road, only its own wild Pokémon (the areas before it in AREAS are the League's rooms).
  if (isOptional(areaIndex)) return null;
  for (let i = areaIndex - 1; i >= 0; i--) {
    const w = AREAS[i]!;
    if (w.kind !== 'route' && w.kind !== 'dungeon') continue;
    for (let l = w.legs.length - 1; l >= 0; l--) {
      const found = paceWindow(i, l, w.legs[l]!.track.length - 1);
      if (found) return { kind: 'pace', area: i, leg: l, ...found };
    }
  }
  return null;
}

/** Starts a route grind (WILD_GRIND, TRAINER_GRIND, by routeGrindPlan). Why it can't, or null. */
function startRouteLoop(state: IdleState, kind: 'wild' | 'trainers'): string | null {
  // Switching from the other grind (the mode toggle): it ends first, back where it began.
  if (state.loop?.kind === (kind === 'wild' ? 'pace' : 'trainers')) return 'Already in that mode';
  if (state.loop) endRouteLoop(state);
  const plan = routeGrindPlan(state, kind);
  if ('error' in plan) return plan.error;
  // From a town (or its auto-grind: it ends): out to the end of the route before it, Route coming back from there.
  const start = townGrindStart(state);
  if (start) {
    if (state.inStore) return 'Leave the store first';
    state.log.push(`Left ${AREAS[state.area]!.name} for ${AREAS[start.area]!.name}.`);
    Object.assign(state, start, { phase: 'walking' });
    delete state.grind;
  }
  const resume = { area: state.area, leg: state.leg, step: state.step, beaten: [...state.beaten] };
  state.encounter = { steps: 0, buff: 0, prev: '' };
  if (plan.kind === 'trainers') {
    state.loop = { kind: 'trainers', keys: plan.keys, resume };
    state.beaten = state.beaten.filter((k) => !plan.keys.includes(k));
    state.leg = plan.first.leg;
    state.step = Math.max(0, plan.first.step - LOOP_RUN_UP);
    state.log.push(`Went to fight the trainers of ${AREAS[state.area]!.name}.`);
    return null;
  }
  if (plan.kind === 'fish') startFishing(state, plan, resume);
  else startPacing(state, plan, resume);
  return null;
}

/** Pacing on a wild grind's plan (the run's area changed for an earlier route's, its trainers beaten on the way). */
function startPacing(state: IdleState, plan: Extract<RouteGrindPlan, { kind: 'pace' }>, resume: RouteLoop['resume']) {
  const from = state.area;
  if (plan.area !== state.area) {
    state.area = plan.area;
    state.beaten = (AREAS[plan.area] as WalkArea).trainers.map((t) => t.key);
  }
  const away = plan.area !== from || plan.leg !== state.leg;
  state.loop = { kind: 'pace', leg: plan.leg, from: plan.from, to: plan.to, dir: 1, resume };
  state.leg = plan.leg;
  state.step = plan.from;
  state.encounter = { steps: 0, buff: 0, prev: '' };
  state.log.push(away ? `No wild Pokémon here: went to train in ${AREAS[plan.area]!.name}.` : `Started training in ${AREAS[state.area]!.name}.`);
}

/** Fishing on a plan's spot (the user's): the run's place the track's step nearest it (the player shown on the spot itself). */
function startFishing(state: IdleState, plan: Extract<RouteGrindPlan, { kind: 'fish' }>, resume: RouteLoop['resume']) {
  const [leg, step] = (AREAS[plan.area] as WalkArea).fishing![plan.spot]!;
  state.loop = { kind: 'fish', spot: plan.spot, resume };
  Object.assign(state, { area: plan.area, leg, step, encounter: { steps: 0, buff: 0, prev: '' } });
  state.log.push(`Started fishing in ${AREAS[plan.area]!.name}.`);
}

/**
 * Continue route (CONTINUE_ROUTE): back where it started grinding (or on from where it is, if further along), its beaten
 * trainers as they were and those the grind beat (`resume.beaten`: they count in the real run, the user's).
 */
function endRouteLoop(state: IdleState) {
  const { resume } = state.loop!;
  if (state.area !== resume.area) {
    Object.assign(state, { area: resume.area, leg: resume.leg, step: resume.step, beaten: [...resume.beaten] });
  } else {
    state.beaten = [...new Set([...state.beaten, ...resume.beaten])];
    if (before({ leg: state.leg, step: state.step }, resume)) Object.assign(state, { leg: resume.leg, step: resume.step });
  }
  delete state.loop;
  state.encounter = { steps: 0, buff: 0, prev: '' };
  state.log.push(`Went on along ${AREAS[state.area]!.name}.`);
}

/** A trainers loop's lap done (its last trainer beaten again): back before the first to fight them all again (a fade). */
function restartTrainerLoop(state: IdleState, out: Segment) {
  const loop = state.loop as Extract<RouteLoop, { kind: 'trainers' }>;
  const area = AREAS[state.area] as WalkArea;
  const first = loop.keys.map((k) => meetStep(area, k)!).reduce((x, y) => (before(y, x) ? y : x));
  state.beaten = state.beaten.filter((k) => !loop.keys.includes(k));
  state.leg = first.leg;
  state.step = Math.max(0, first.step - LOOP_RUN_UP);
  state.encounter = { steps: 0, buff: 0, prev: '' };
  out.events.push({ t: 'area', area: state.area, leg: state.leg, step: state.step });
  out.durationMs += FADE_MS;
}

/**
 * A white-out: back to the area's start (a gym or League room, or grinding: its town), its trainers to fight again; no
 * money lost (the user's, 2026-10-25: no penalty; it was ₱1000, or half the money with less). On a route or in a dungeon
 * a wild grind starts near its start (the user's: a trainer grind turns into one, and with none on, one is forced on).
 */
function whiteOut(state: IdleState, out: Segment) {
  state.totals.whiteOuts += 1;
  out.events.push({ t: 'whiteout' });
  if (state.phase === 'grinding') {
    state.log.push(`Whited out training in ${areaById((AREAS[state.area] as TownArea).grind!.area).name}.`);
    enterArea(state, state.area, out.events);
    return;
  }
  const a = AREAS[state.area] as WalkArea;
  state.log.push(`Whited out in ${a.name}.`);
  const back = a.kind === 'gym' ? areaIndex(a.town!) : a.kind === 'league' ? areaIndex('indigo-plateau') : state.area;
  enterArea(state, back, out.events);
  // Whited out in a trainer grind (the user's): a wild grind near the route's start instead, the trainers it beat still beaten.
  const loop = state.loop;
  if (loop?.kind === 'trainers') {
    state.beaten = [...loop.resume.beaten];
    const plan = wildPlan(state.area, 0, 0, 1);
    if (plan) startPacing(state, plan, loop.resume);
    else {
      Object.assign(state, { leg: loop.resume.leg, step: loop.resume.step });
      delete state.loop;
    }
  } else if (!loop && (a.kind === 'route' || a.kind === 'dungeon')) {
    // Whited out on a route with no grind on (the user's, 2026-10-26): a wild grind near its start, until Continue route
    // goes on from its start.
    const plan = wildPlan(state.area, 0, 0, 1);
    if (plan) startPacing(state, plan, { area: state.area, leg: 0, step: 0, beaten: [...state.beaten] });
  }
}

/** A cast's times (FireRed's Task_Fishing, 60 frames a second): the rod out and a second's wait, each dot (20 frames), the line after. */
export const FISH_CAST_MS = 1000;
export const FISH_DOT_MS = 333;
export const FISH_TEXT_MS = 1500;
/** How long a cast plays (its dots, and one more beat before the line, as the game waits). */
export const fishMs = (e: Pick<Extract<SegmentEvent, { t: 'fish' }>, 'dots'>) => FISH_CAST_MS + (e.dots + 1) * FISH_DOT_MS + FISH_TEXT_MS;

/**
 * A cast at the area's fishing spot (the user's: FireRed's Task_Fishing, one of the run's rods at random each cast, RODS):
 * 4 to 10 dots, then half the time "Not even a nibble…" (null), else "A POKéMON's on the hook!" and its
 * battle, a Pokémon from that rod's slots of the map's fishing table; whether it was won.
 */
function fishCast(state: IdleState, rng: Rng, settings: PlaySettings, caught: Set<number>, spot: number, out: Segment): boolean | null {
  const area = AREAS[state.area] as WalkArea;
  const map = mapView(fishMap(area, spot));
  const table = ENCOUNTERS[map.encounters]!.fishing!;
  const rods = rodsOf(state);
  const rod = rods[int(rng, rods.length)]!;
  const dots = Math.min(10, int(rng, 10) + 4);
  const bite = int(rng, 2) === 0;
  out.events.push({ t: 'fish', spot, rod, dots, bite });
  out.durationMs += fishMs({ dots });
  if (!bite) return null;
  const [first, odds] = ROD_SLOTS[rod]!;
  const [min, max, id] = pickWild(rng, table, odds, first);
  const level = min + (int(rng, 65536) % (max - min + 1));
  const wild = opponentMon(createMon(rng, { species: id, level, ...(int(rng, SHINY_ODDS) === 0 && { shiny: true }) }));
  // On the water's terrain (a fished Pokémon's battle is on the water, as the game's).
  return battle(state, rng, settings, caught, { kind: 'wild', foes: [wild], tile: '.w', scene: map.scene }, out);
}

/** A step's wild encounter, if one appears (its tile's table, wildCheck): the battle played; whether it was won, or null for none. */
function wildStep(state: IdleState, rng: Rng, settings: PlaySettings, caught: Set<number>, tile: string, map: ReturnType<typeof mapView>, out: Segment): boolean | null {
  const kind = tile[0] === 'l' ? 'land' : tile[0] === 'w' ? 'water' : null;
  const table = kind && ENCOUNTERS[map.encounters]?.[kind];
  if (!table || !wildCheck(rng, state.encounter, table, tile, state.party[0]!)) return null;
  const [min, max, id] = pickWild(rng, table, kind === 'land' ? LAND_ODDS : WATER_ODDS);
  const level = min + (int(rng, 65536) % (max - min + 1));
  const wild = opponentMon(createMon(rng, { species: id, level, ...(int(rng, SHINY_ODDS) === 0 && { shiny: true }) }));
  return battle(state, rng, settings, caught, { kind: 'wild', foes: [wild], tile, scene: map.scene }, out);
}

/**
 * A legendary Pokémon's battle, the run walked up to it (the user's, 2026-10-27): a wild battle at its level, caught or
 * beaten gone for the run (IdleState.legends); then, however it ends (lost: a white-out; it fled), back to the Indigo Plateau.
 */
function legendBattle(state: IdleState, rng: Rng, settings: PlaySettings, caught: Set<number>, out: Segment) {
  const a = AREAS[state.area] as WalkArea;
  const legend = a.legend!;
  const leg = a.legs[state.leg]!;
  const tile = leg.track[state.step]![4];
  const foe = opponentMon(createMon(rng, { species: legend.species, level: legend.level, ...(int(rng, SHINY_ODDS) === 0 && { shiny: true }) }));
  const won = battle(state, rng, settings, caught, { kind: 'wild', foes: [foe], tile, scene: mapView(leg.maps[legend.map]!).scene }, out);
  const result = (out.events.filter((e) => e.t === 'battle').at(-1) as Extract<SegmentEvent, { t: 'battle' }>).result;
  const name = species(legend.species).name;
  if (result === 'won' || result === 'caught') {
    state.legends = [...(state.legends ?? []), legend.species];
    if (result === 'won') state.log.push(`Defeated ${name}!`);
  } else if (!won) {
    state.totals.whiteOuts += 1;
    out.events.push({ t: 'whiteout' });
    state.log.push(`Whited out against ${name}.`);
  } else state.log.push(`${name} got away.`);
  leaveLegend(state, out.events);
  out.durationMs += FADE_MS;
}

/** The grind's end (the party's highest at the gym's highest level): into the gym. */
function finishGrind(state: IdleState, out: Segment) {
  const best = state.party.reduce((a, b) => (b.level > a.level ? b : a));
  state.log.push(`${species(best.species).name} reached Lv. ${best.level}: done training.`);
  enterGym(state, out.events);
  out.durationMs += FADE_MS;
}

/**
 * A grinding segment (the user's: running in a circle near the exit of the route before the gym, wild Pokémon appearing
 * as usual): round the town's loop until a wild Pokémon appears, then its battle; at the gym's highest level, into the
 * gym. Returns whether the party whited out (back in the town, waiting for the player).
 */
function grindSegment(state: IdleState, rng: Rng, settings: PlaySettings, caught: Set<number>, out: Segment): boolean {
  const spot = (AREAS[state.area] as TownArea).grind!;
  const leg = (areaById(spot.area) as WalkArea).legs[spot.leg]!;
  const grind = state.grind!;
  const target = grind.level;
  out.events.push({ t: 'grind', town: state.area, at: grind.at });
  for (let guard = 0; guard < 5000; guard++) {
    if (topLevel(state.party) >= target) {
      finishGrind(state, out);
      return false;
    }
    const from = grind.at;
    grind.at = (from + 1) % spot.loop.length;
    state.totals.steps += 1;
    const last = out.events.at(-1);
    if (last?.t === 'circle') last.steps += 1;
    else out.events.push({ t: 'circle', from, steps: 1 });
    out.durationMs += STEP_MS;
    const [m, , , , tile] = spot.loop[grind.at]!;
    const won = wildStep(state, rng, settings, caught, tile, mapView(leg.maps[m]!), out);
    if (won === null) continue;
    if (!won) {
      whiteOut(state, out);
      return true;
    }
    if (topLevel(state.party) >= target) finishGrind(state, out);
    return false;
  }
  return false;
}

/**
 * Stop while auto-grinding (the user's: it quits the grind): the player on the grind route's own track where they stand on
 * its loop, walking (that route's trainers passed, as the town was reached past them), no longer grinding; Continue run
 * then goes on from the run's furthest place (its town). Back in the town if the loop's tile isn't on the track.
 */
function leaveAutoGrind(state: IdleState) {
  const spot = (AREAS[state.area] as TownArea).grind!;
  const route = areaIndex(spot.area);
  const w = AREAS[route] as WalkArea;
  const [m, x, y] = spot.loop[state.grind!.at]!;
  const step = w.legs[spot.leg]!.track.findIndex(([tm, tx, ty]) => tm === m && tx === x && ty === y);
  delete state.grind;
  state.log.push(`Stopped training in ${w.name}.`);
  if (step < 0) {
    state.phase = 'town';
    return;
  }
  Object.assign(state, { area: route, leg: spot.leg, step, phase: 'walking', beaten: w.trainers.map((t) => t.key), encounter: { steps: 0, buff: 0, prev: '' } });
}

/** Levels a white-out sends auto-grind back to train (the user's: 2 above the party's highest). */
export const REGRIND_LEVELS = 2;

/**
 * Auto-grind on reaching a gym's town (the user's): to the gym's highest level if the party is below it, then into the
 * gym. Back in the town after a white-out (in the gym, the League or grinding), to REGRIND_LEVELS above the party's
 * highest (the gym's highest at least), then into the gym again; past MAX_LEVEL it waits for the player.
 */
function autoGrind(state: IdleState, out: Segment, whitedOut: boolean) {
  const town = AREAS[state.area]!;
  if (!isTown(town) || !town.grind || townDone(state, town)) return;
  const target = grindTarget(state.area, state.rivalStarter)!;
  const level = whitedOut ? Math.max(target, topLevel(state.party) + REGRIND_LEVELS) : target;
  if (level > MAX_LEVEL) return;
  if (topLevel(state.party) < level) startGrind(state, out.events, level);
  else enterGym(state, out.events);
  out.durationMs += FADE_MS;
}

/** After an area's last trainer or step: a gym's badge (back to its town), the next League room, the title, or the next area. */
function finishArea(state: IdleState, out: Segment) {
  const a = AREAS[state.area] as WalkArea;
  if (a.kind === 'gym') {
    state.badges.push(a.badge!);
    out.events.push({ t: 'badge', badge: a.badge! });
    state.log.push(`Won the ${a.badge} Badge!`);
    enterArea(state, areaIndex(a.town!), out.events);
    return;
  }
  if (a.id === 'champion') {
    state.phase = 'won';
    out.events.push({ t: 'won' });
    state.log.push('Became the Champion!');
    return;
  }
  // Off the main road (walked off its end: Route mode, a white-out with no grind on): back to the run's furthest place.
  if (a.opens) return goToProgress(state, out.events);
  enterArea(state, state.area + 1, out.events);
}

/**
 * The next segment of a run walking (agreed with the user): steps along the track until a trainer sees the player or
 * a wild Pokémon appears, then that whole battle; or to the area's end (a town, where it waits). `caught` is the
 * account's caught species (auto-catch's "new"), updated with this segment's catches. Returns the new state and the
 * segment (in a town, its wait: townWait), or null when the run is over.
 */
export function simulateSegment(from: IdleState, idleSettings: IdleSettings, caught: Set<number>, o: { throwAt?: number[] } = {}): { state: IdleState; segment: Segment } | null {
  const settings: PlaySettings = { ...idleSettings, ...(o.throwAt && { throwAt: o.throwAt }) };
  // The party changes queued during the last battle, first (withPending).
  const prev = withPending(from);
  // Stopped (the Stop mode): nothing played; a stop queued during the last battle is saved (its segment empty).
  if (prev.stopped) {
    if (!from.pending?.length) return null;
    const state = structuredClone(prev);
    delete state.replay;
    state.version += 1;
    return { state, segment: { events: [], durationMs: 0, dex: [] } };
  }
  // In the store: the town waits until the player leaves it.
  if (prev.phase === 'town') return prev.inStore ? null : townWait(prev);
  if (!playing(prev)) return null;
  const state = structuredClone(prev);
  delete state.replay;
  const rng = rngOf(state);
  const out: Segment = { events: [], durationMs: 0, dex: [] };
  let whitedOut = false;
  // A legendary Pokémon's battle sends the run to the Indigo Plateau to wait (the user's): no auto-grind from there.
  let legendMet = false;
  const grinding = state.phase === 'grinding';
  if (grinding) whitedOut = grindSegment(state, rng, settings, caught, out);
  // A run that just came back from a battle or into an area starts its playback where it stands.
  else out.events.push({ t: 'area', area: state.area, leg: state.leg, step: state.step });
  for (let guard = 0; !grinding && guard < 5000; guard++) {
    const a = AREAS[state.area] as WalkArea;
    const leg = a.legs[state.leg]!;
    const trainerHere = (i: number) => {
      const [m, x, y] = leg.track[i]!;
      return a.trainers.find((t) => t.leg === state.leg && t.map === m && !state.beaten.includes(t.key) && t.sight.some(([sx, sy]) => sx === x && sy === y));
    };
    // The first step of an area (or after a white-out) can be in a trainer's sight already (a League room's boss), and so
    // can the step a segment starts on: a segment cut at a trainer's "!" or battle (Stop, Continue run: cutSegment), or
    // Continue run's furthest place. Fought there, never walked past (a gym's track ends at its leader: its end would
    // give the badge with no battle).
    const pace = state.loop?.kind === 'pace' ? state.loop : null;
    const fish = state.loop?.kind === 'fish' ? state.loop : null;
    if (fish) {
      // Fishing (the user's): onto the spot first (after a white-out sent it to the route's start), then cast after cast
      // until one bites and its battle is played.
      const [leg, step] = a.fishing![fish.spot]!;
      if (state.leg !== leg || state.step !== step) {
        Object.assign(state, { leg, step });
        out.events.push({ t: 'area', area: state.area, leg, step });
        out.durationMs += FADE_MS;
        continue;
      }
      const won = fishCast(state, rng, settings, caught, fish.spot, out);
      if (won === null) continue;
      if (!won) {
        whiteOut(state, out);
        whitedOut = true;
      }
      break;
    }
    // A wild grind meets no trainers (the user's: wild Pokémon only).
    const seen = !pace && (state.step === 0 || guard === 0) && trainerHere(state.step);
    if (pace && (state.leg !== pace.leg || state.step < pace.from || state.step > pace.to)) {
      // Back on the pacing loop (after a white-out sent it to the route's start).
      state.leg = pace.leg;
      state.step = pace.from;
      out.events.push({ t: 'area', area: state.area, leg: state.leg, step: state.step });
      out.durationMs += FADE_MS;
      continue;
    }
    if (pace && !seen) {
      // Back and forth over the loop's tiles.
      if (state.step + pace.dir > pace.to || state.step + pace.dir < pace.from) pace.dir = -pace.dir as 1 | -1;
      const from = state.step;
      state.step += pace.dir;
      state.totals.steps += 1;
      out.events.push({ t: 'walk', from, to: state.step });
      out.durationMs += STEP_MS;
    } else if (!seen) {
      if (state.step >= leg.track.length - 1) {
        if (state.leg < a.legs.length - 1) {
          state.leg += 1;
          state.step = 0;
          state.encounter.prev = '';
          out.events.push({ t: 'area', area: state.area, leg: state.leg, step: 0 });
          out.durationMs += FADE_MS;
          continue;
        }
        // A legendary Pokémon at the end: its battle.
        if (a.legend) {
          legendBattle(state, rng, settings, caught, out);
          legendMet = true;
          break;
        }
        finishArea(state, out);
        out.durationMs += FADE_MS;
        break;
      }
      const from = state.step;
      state.step += 1;
      state.totals.steps += 1;
      markProgress(state);
      out.events.push({ t: 'walk', from, to: state.step });
      out.durationMs += STEP_MS * (leg.track[state.step]![3] & 2 ? 2 : 1) + (leg.track[state.step]![3] & 1 ? FADE_MS : 0);
    }
    const [m, , , , tile] = leg.track[state.step]!;
    const map = mapView(leg.maps[m]!);
    const trainer = pace ? undefined : trainerHere(state.step);
    if (trainer) {
      const key = trainerKey(state, trainer.key);
      out.events.push({ t: 'spotted', trainer: trainer.key });
      out.durationMs += 1500;
      const won = battle(state, rng, settings, caught, { kind: 'trainer', foes: trainerParty(rng, key), trainer: key, tile, scene: a.kind === 'gym' && trainer.key === a.leader ? 'leader' : map.scene }, out);
      if (!won) {
        whiteOut(state, out);
        whitedOut = true;
      } else {
        state.beaten.push(trainer.key);
        if (a.kind === 'gym' && trainer.key !== a.leader) state.gymBeaten = [...(state.gymBeaten ?? []), trainer.key];
        state.log.push(`Beat ${TRAINERS[key]!.class} ${TRAINERS[key]!.name}.`);
        if ((a.kind === 'gym' || a.kind === 'league') && trainer.key === a.leader) finishArea(state, out);
        // A trainer beaten while grinding counts in the real run (the user's); a trainers loop's last beaten: round again.
        const loop = state.loop;
        if (loop && !loop.resume.beaten.includes(trainer.key)) loop.resume.beaten.push(trainer.key);
        if (loop?.kind === 'trainers' && loop.keys.every((k) => state.beaten.includes(k))) restartTrainerLoop(state, out);
      }
      break;
    }
    const won = wildStep(state, rng, settings, caught, tile, map, out);
    if (won === null) continue;
    if (!won) {
      whiteOut(state, out);
      whitedOut = true;
    }
    break;
  }
  // Auto-grind (the user's) on reaching a gym's town, after a white-out training REGRIND_LEVELS more first.
  // Auto-buy balls on reaching a town (white-outs too), before auto-grind leaves it.
  if (state.phase === 'town') autoBuyBalls(state, settings, out.events);
  if (state.phase === 'town' && settings.autoGrind && !legendMet) autoGrind(state, out, whitedOut);
  markProgress(state);
  state.rngState = rng.state;
  state.version += 1;
  if (state.log.length > 50) state.log = state.log.slice(-50);
  return { state, segment: out };
}

/**
 * The run as it stands at `now` while a segment plays (the user's: Stop, Continue run and the Town Map act at once): the
 * segment's start (IdleState.replay) moved along its events as far as the player has walked, a trainer's "!" or a battle
 * begun dropped (no rewards: the player where it began, the trainer still to fight), a town reached its town; the changes
 * queued and the slots and the party's order set meanwhile kept. The run unchanged when no segment is playing, or once a
 * catch has shown its "Gotcha!" (the user's: the Pokémon is kept; a catch ends its battle, the rest of it played).
 */
/**
 * When a caught battle's "Gotcha!" shows, from the battle's start (the browser's pacing): the transition in, the opening,
 * the turns before the catching one (TICK_MS each), then the ball's animation, thrown first in its turn (an item goes
 * before a move).
 */
function catchShownMs(b: Extract<SegmentEvent, { t: 'battle' }>): number {
  const i = b.events.findIndex((x) => x.t === 'ball' && x.caught);
  const ball = b.events[i] as Extract<BattleEvent, { t: 'ball' }>;
  const tick = b.events.slice(0, i).reverse().find((x): x is Extract<BattleEvent, { t: 'tick' }> => x.t === 'tick');
  return BATTLE_MS - BATTLE_HOLD_MS + openingMs(b.events, b.kind) + Math.max(0, (tick?.n ?? 1) - 1) * TICK_MS + catchTextFrame(ball.shakes, true) * FRAME_MS;
}

/** The choices that cut the segment playing (cutSegment) before they're applied: Stop, Continue run and the Town Map's moves (a legendary Pokémon's too). */
export const cuts = (action: IdleAction) => action.type === 'CONTINUE_RUN' || action.type === 'TRAVEL' || action.type === 'GRIND_AT' || action.type === 'LEGEND' || (action.type === 'SET_MODE' && action.mode === 'stop');

export function cutSegment(saved: IdleState, now: number): IdleState {
  const r = saved.replay;
  if (!r) return saved;
  const again = simulateSegment(r.prev, r.settings, new Set(r.caught), { throwAt: r.throws });
  const elapsed = now - r.from;
  if (!again || elapsed >= again.segment.durationMs) return saved;
  const state = structuredClone(withPending(r.prev));
  delete state.replay;
  let t = 0;
  let town: number | null = null;
  for (const [i, e] of again.segment.events.entries()) {
    if (e.t === 'area') {
      Object.assign(state, { leg: e.leg, step: e.step });
      if (i > 0) t += FADE_MS;
    } else if (e.t === 'grind' && state.grind) {
      state.grind.at = e.at;
    } else if (e.t === 'circle' && state.grind) {
      // Round the town's grind loop, a step each STEP_MS.
      const steps = Math.min(e.steps, Math.floor((elapsed - t) / STEP_MS));
      state.grind.at = (e.from + steps) % (AREAS[state.area] as TownArea).grind!.loop.length;
      state.totals.steps += steps;
      t += e.steps * STEP_MS;
    } else if (e.t === 'walk') {
      const flags = (AREAS[state.area] as WalkArea).legs[state.leg]!.track[e.to]![3];
      const d = STEP_MS * (flags & 2 ? 2 : 1) + (flags & 1 ? FADE_MS : 0);
      if (elapsed < t + d) break;
      state.step = e.to;
      state.totals.steps += 1;
      t += d;
    } else {
      // A catch already shown: the battle kept whole (its segment ends with it).
      if (e.t === 'battle' && e.result === 'caught' && elapsed >= t + catchShownMs(e)) return saved;
      // The area's end (its town), or what stops the walk: a trainer's "!", a battle.
      if (e.t === 'town') town = e.area;
      break;
    }
    if (elapsed < t) break;
  }
  if (town !== null) enterArea(state, town, []);
  // What the player changed meanwhile.
  if (saved.pending?.length) state.pending = [...saved.pending];
  const order = saved.party.map((m) => m.uid);
  state.party.sort((a, b) => (order.includes(a.uid) ? order.indexOf(a.uid) : 99) - (order.includes(b.uid) ? order.indexOf(b.uid) : 99));
  for (const m of state.party) {
    const set = saved.party.find((x) => x.uid === m.uid);
    if (set) Object.assign(m, { slots: [...set.slots], autoSlots: set.autoSlots });
  }
  if (saved.stopped) state.stopped = true;
  markProgress(state);
  state.version = saved.version;
  return state;
}

/**
 * A town's wait (the user's: no prompt waits on the player): TOWN_WAIT_MS for the player's choice, then the run takes it
 * itself, into the gym (or the League) while it's unbeaten, otherwise on to the next area. The browser counts the wait
 * down and takes the choice with the player's own action; this is the same for a run played offline (catchUp).
 */
function townWait(prev: IdleState): { state: IdleState; segment: Segment } {
  const state = structuredClone(prev);
  delete state.replay;
  const out: Segment = { events: [{ t: 'town', area: state.area }], durationMs: TOWN_WAIT_MS + FADE_MS, dex: [] };
  const town = AREAS[state.area] as TownArea;
  if (!townDone(state, town)) enterGym(state, out.events);
  // Continue run (the user's): from a town behind the run's furthest place, straight there; from the furthest, on.
  else if (!atProgress(state)) goToProgress(state, out.events);
  else enterArea(state, afterTown(state.area), out.events);
  state.version += 1;
  return { state, segment: out };
}

/** What a catch-up did, for its dialog. */
export interface CatchUpSummary {
  segments: number;
  durationMs: number;
  battles: number;
  caught: number[];
  levels: number;
  evolutions: { from: number; into: number }[];
  whiteOuts: number;
  money: number;
  badges: string[];
  /** Won, out of time away, or one call's share played (towns no longer stop it: they wait TOWN_WAIT_MS, then go on). */
  stopped: 'won' | 'time' | 'limit';
}

/**
 * Offline catch-up (agreed): whole segments while they fit in `elapsedMs` (capped at CATCH_UP_CAP_MS), through towns (their wait, the user's),
 * until the run is won, or `maxSegments` (one call's share: the browser calls again). Returns the new state, the time used, the
 * summary and the dex notes; the events themselves are dropped.
 */
export function catchUp(prev: IdleState, settings: IdleSettings, caught: Set<number>, elapsedMs: number, maxSegments = CATCH_UP_SEGMENTS) {
  let state = prev;
  const budget = Math.min(elapsedMs, CATCH_UP_CAP_MS);
  const summary: CatchUpSummary = { segments: 0, durationMs: 0, battles: 0, caught: [], levels: 0, evolutions: [], whiteOuts: 0, money: 0, badges: [], stopped: 'time' };
  const dex: DexNote[] = [];
  const startMoney = state.money;
  const startLevels = state.party.reduce((s, m) => s + m.level, 0);
  while (summary.durationMs < budget) {
    if (summary.segments >= maxSegments) {
      summary.stopped = 'limit';
      break;
    }
    const next = simulateSegment(state, settings, caught);
    if (!next) {
      summary.stopped = state.phase === 'won' ? 'won' : 'time';
      break;
    }
    // Only whole segments that fit in the time away (the user's: a run just started, or a moment away, catches up
    // nothing; the browser plays the segment instead).
    if (summary.durationMs + next.segment.durationMs > budget) break;
    state = next.state;
    summary.segments += 1;
    summary.durationMs += next.segment.durationMs;
    dex.push(...next.segment.dex);
    for (const e of next.segment.events) {
      if (e.t === 'battle') summary.battles += 1;
      if (e.t === 'caught') summary.caught.push(e.species);
      if (e.t === 'evolve') summary.evolutions.push({ from: e.from, into: e.into });
      if (e.t === 'whiteout') summary.whiteOuts += 1;
      if (e.t === 'badge') summary.badges.push(e.badge);
    }
  }
  if (state.phase === 'won') summary.stopped = 'won';
  summary.money = state.money - startMoney;
  summary.levels = state.party.reduce((s, m) => s + m.level, 0) - startLevels;
  return { state, summary, dex };
}

/** The ₱ an ended run puts in the bank (the user's, 2026-10-25): its money once the Champion is beaten, nothing for a run given up. */
export const bankedMoney = (state: Pick<IdleState, 'phase' | 'money'>) => (state.phase === 'won' ? state.money : 0);

/** What the player sees of a run: everything but the RNG, with the area it's in. */
export function idleView(saved: IdleState) {
  // The party changes queued during a battle shown at once (the user's), and how many wait.
  const state = withPending(saved);
  const { rngState: _, replay: __, ...rest } = state;
  const area: IdleArea = AREAS[state.area]!;
  // Grinding: the area the loop is in (the run's `area` stays the town), and the level it trains to.
  const grindArea = state.phase === 'grinding' && isTown(area) && area.grind ? areaById(area.grind.area) : null;
  return { ...rest, areaId: area.id, areaName: grindArea?.name ?? area.name, store: isTown(area) ? storeStock(area, state) : [], grindTarget: state.grind?.level ?? grindTarget(state.area, state.rivalStarter), pendingChanges: saved.pending?.length ?? 0 };
}

export type IdleView = ReturnType<typeof idleView>;

/**
 * The Pokédex's starters for a new run: the three starters always, and any species with a caught record (from the second
 * run) that evolves from none (the user's: a line's first stage, or one that doesn't evolve; never Charmeleon).
 */
export const starterOptions = (caughtSpecies: number[]) => [...new Set([...STARTERS, ...caughtSpecies.filter(isBaseForm)])].sort((a, b) => a - b);
