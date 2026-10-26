// The Idle Adventure's runs (README: Idle Adventure; agreed with the user, issue #133): the player character walks
// Kanto's main road by himself (areas.ts), fighting every wild Pokémon and trainer he meets in battles that play
// themselves (battle.ts), and waits in each town for the player's choice: the gym, the store, or on. IdleState is plain
// JSON like a run's (RunState), changed only by applyIdleAction (the player's choices) and simulateSegment (the next
// stretch of walking and its battle, from the seeded RNG). Every decision in between is a setting, so a segment never
// waits on the player, online or caught up offline (catchUp).
import { int, rngFrom, type Rng } from '@poke-tcg/campaign';
import { AREAS, areaById, areaIndex, isTown, mapView, TERRAIN_LETTERS, type IdleArea, type TownArea, type WalkArea } from './areas.js';
import { opponentMon, simulateBattle, type BattleEvent, type BattleResult, MEDICINE, type Terrain } from './battle.js';
import { BALLS } from './catch.js';
import { itemData, species } from './data.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { MARTS } from './data/gen1/marts.js';
import { TRAINERS } from './data/gen1/trainers.js';
import { evolve, levelEvolution, stoneEvolution, usableStones } from './evolution.js';
import { abilityOf, autoSlots, basicFor, createMon, movesUpTo } from './mon.js';
import { MAX_LEVEL } from './stats.js';
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
/** White-out: ₱1000 lost, or half the run's money if it has less (agreed). */
export const WHITE_OUT_LOSS = 1000;

/**
 * How long things take (one pace, watched or offline: no speed setting, agreed with the user): a step (16 frames), a
 * turn (the user's: 6 s, 3 s before), a battle's start and end, a fade.
 */
export const STEP_MS = 267;
export const TICK_MS = 6000;
export const BATTLE_MS = 4000;
export const FADE_MS = 800;
/** How long a town waits for the player's choice before taking it itself (the user's: no prompt waits on the player): the gym, or on once it's beaten. */
export const TOWN_WAIT_MS = 5000;
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

export const DEFAULT_IDLE_SETTINGS: IdleSettings = { autoHeal: true, revives: ['last'], autoCatch: 'new', stopWhenFull: false, replaceLowest: false, autoEvolve: true, autoGrind: false, autoBalls: 0 };

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
  /** In a town: open its store (auto-evolve buys and uses stones there). */
  | { type: 'VISIT_STORE' }
  /** In a gym's town: grind to the gym's highest level (then into the gym); STOP_GRIND back to the town. */
  | { type: 'GRIND' }
  | { type: 'STOP_GRIND' }
  | { type: 'BUY'; item: string; count: number }
  /** The party's order (the lead fights first). */
  | { type: 'SET_ORDER'; uids: string[] }
  /** A Pokémon's 3 slots, highest priority first; `auto` gives them back to the automatic pick. */
  | { type: 'SET_SLOTS'; uid: string; slots: string[]; auto?: boolean }
  /** Uses an evolution stone from the bag on a Pokémon. */
  | { type: 'USE_STONE'; uid: string; item: string }
  | { type: 'GIVE_UP' };

export type IdleResult = { ok: true; state: IdleState } | { ok: false; error: string };

/** What the browser plays back of a segment, in order. Step indexes are along the leg's track (AREAS). */
export type SegmentEvent =
  | { t: 'area'; area: number; leg: number; step: number }
  | { t: 'walk'; from: number; to: number }
  /** Onto a town's grind loop (a fade), at its step `at`; then `steps` steps round it from `from`. */
  | { t: 'grind'; town: number; at: number }
  | { t: 'circle'; from: number; steps: number }
  | { t: 'spotted'; trainer: string }
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
    }
  | { t: 'money'; amount: number; total: number; why: string }
  | { t: 'bought'; item: string; count: number; cost: number }
  | { t: 'evolve'; uid: string; from: number; into: number }
  | { t: 'caught'; species: number; kept: boolean; replaced?: number; shiny?: true }
  | { t: 'badge'; badge: string }
  | { t: 'whiteout'; lost: number }
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
export const playing = (s: Pick<IdleState, 'phase'>) => s.phase === 'walking' || s.phase === 'grinding';

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
/** The items a town's store sells: its marts' lists without Escape Ropes and Repels (agreed), only those with a use here (balls, medicine, evolution stones). */
export function storeStock(town: TownArea): string[] {
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

/** Enters an area: a town waits for the player; any other starts at its first leg's first step. */
function enterArea(state: IdleState, index: number, events: SegmentEvent[]) {
  state.area = index;
  state.leg = 0;
  state.step = 0;
  state.beaten = [];
  state.encounter = { steps: 0, buff: 0, prev: '' };
  delete state.grind;
  const a = AREAS[index]!;
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
  const stock = storeStock(town);
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
    state.party[i] = evolve(mon, into).mon;
    events.push({ t: 'evolve', uid: mon.uid, from: mon.species, into });
    state.log.push(`Bought a ${itemData(stone).name}: ${species(mon.species).name} evolved into ${species(into).name}!`);
  }
}

/** Applies the player's choice to a run. Pure: returns a new state, or an error. */
export function applyIdleAction(prev: IdleState, action: IdleAction): IdleResult {
  const state = structuredClone(prev);
  const fail = (error: string): IdleResult => ({ ok: false, error });
  const ok = (): IdleResult => {
    state.version += 1;
    return { ok: true, state };
  };
  if (state.phase === 'won' || state.phase === 'given-up') return fail('This run is over');
  const area = AREAS[state.area]!;
  const inTown = state.phase === 'town' && isTown(area);
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
    case 'STOP_GRIND': {
      if (state.phase !== 'grinding') return fail('Not grinding');
      state.phase = 'town';
      delete state.grind;
      state.log.push(`Stopped training and went back to ${area.name}.`);
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
      return ok();
    }
    case 'BUY': {
      if (!inTown) return fail('Not in a town');
      if (!storeStock(area).includes(action.item)) return fail('Not sold here');
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
        mon.slots = autoSlots(mon);
        return ok();
      }
      if (action.slots.length > 3 || new Set(action.slots).size !== action.slots.length) return fail('Up to 3 different moves');
      if (action.slots.some((m) => !mon.moves.includes(m) || m === basicFor(mon))) return fail('Only moves it knows, not its basic move');
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
      state.party[i] = evolve(state.party[i]!, into).mon;
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
  if (settings.autoEvolve && state.phase === 'town' && isTown(area)) autoStones(state, storeStock(area), events);
  return { state, events };
}

// ---- Walking and battles ----
/** The land slots' odds (ENCOUNTER_CHANCE_LAND_MONS: 20/20/10/10/10/10/5/5/4/4/1/1) and the water slots' (60/30/5/4/1). */
const LAND_ODDS = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1];
const WATER_ODDS = [60, 30, 5, 4, 1];

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
 * badge, a caught Pokémon kept or released, or a white-out (back to the area's start, its trainers to fight again, ₱1000
 * or half the money lost).
 */
function battle(state: IdleState, rng: Rng, settings: IdleSettings, caught: Set<number>, o: { kind: 'wild' | 'trainer'; foes: Mon[]; trainer?: string; tile: string; scene: string }, out: Segment) {
  const tryCatch = o.kind === 'wild' && shouldCatch(state, settings, caught, o.foes[0]!.species);
  const before = state.party.map((m) => m.level);
  const t = o.trainer ? TRAINERS[o.trainer] : null;
  const result = simulateBattle(
    { kind: o.kind, party: state.party, foes: o.foes, foeItems: t?.items ?? [], bag: state.bag, settings: { autoHeal: settings.autoHeal, revives: settings.revives, tryCatch }, boss: !!o.trainer && /^(leader|elite-four|champion)/.test(o.trainer), badges: state.badges.length, terrain: terrainOf(o.tile) },
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
  });
  out.durationMs += BATTLE_MS + result.ticks * TICK_MS;
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
    return evolve(m, into).mon;
  });
  out.dex.push(...partyNotes(state.party));
  if (result.payDay) {
    state.money += result.payDay;
    out.events.push({ t: 'money', amount: result.payDay, total: state.money, why: 'Pay Day' });
  }
  if (result.result === 'caught' && result.caught) {
    const mon: Mon = { ...result.caught, slots: autoSlots(result.caught), autoSlots: true, moves: movesUpTo(result.caught.species, result.caught.level) };
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
    const prize = t.money * o.foes.at(-1)!.level;
    state.money += prize;
    out.events.push({ t: 'money', amount: prize, total: state.money, why: `${t.class} ${t.name}` });
  }
  if (result.result === 'lost') return false;
  return true;
}

/** A white-out: back to the area's start (a gym or League room, or grinding: its town), its trainers to fight again, money lost. */
function whiteOut(state: IdleState, out: Segment) {
  const lost = state.money >= WHITE_OUT_LOSS ? WHITE_OUT_LOSS : Math.floor(state.money / 2);
  state.money -= lost;
  state.totals.whiteOuts += 1;
  out.events.push({ t: 'whiteout', lost });
  if (state.phase === 'grinding') {
    state.log.push(`Whited out training in ${areaById((AREAS[state.area] as TownArea).grind!.area).name}: lost ₱${lost}.`);
    enterArea(state, state.area, out.events);
    return;
  }
  const a = AREAS[state.area] as WalkArea;
  state.log.push(`Whited out in ${a.name}: lost ₱${lost}.`);
  const back = a.kind === 'gym' ? areaIndex(a.town!) : a.kind === 'league' ? areaIndex('indigo-plateau') : state.area;
  enterArea(state, back, out.events);
}

/** A step's wild encounter, if one appears (its tile's table, wildCheck): the battle played; whether it was won, or null for none. */
function wildStep(state: IdleState, rng: Rng, settings: IdleSettings, caught: Set<number>, tile: string, map: ReturnType<typeof mapView>, out: Segment): boolean | null {
  const kind = tile[0] === 'l' ? 'land' : tile[0] === 'w' ? 'water' : null;
  const table = kind && ENCOUNTERS[map.encounters]?.[kind];
  if (!table || !wildCheck(rng, state.encounter, table, tile, state.party[0]!)) return null;
  const [min, max, id] = table.mons[pickSlot(rng, kind === 'land' ? LAND_ODDS : WATER_ODDS)]!;
  const level = min + (int(rng, 65536) % (max - min + 1));
  const wild = opponentMon(createMon(rng, { species: id, level, ...(int(rng, SHINY_ODDS) === 0 && { shiny: true }) }));
  return battle(state, rng, settings, caught, { kind: 'wild', foes: [wild], tile, scene: map.scene }, out);
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
function grindSegment(state: IdleState, rng: Rng, settings: IdleSettings, caught: Set<number>, out: Segment): boolean {
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
  enterArea(state, state.area + 1, out.events);
}

/**
 * The next segment of a run walking (agreed with the user): steps along the track until a trainer sees the player or
 * a wild Pokémon appears, then that whole battle; or to the area's end (a town, where it waits). `caught` is the
 * account's caught species (auto-catch's "new"), updated with this segment's catches. Returns the new state and the
 * segment (in a town, its wait: townWait), or null when the run is over.
 */
export function simulateSegment(prev: IdleState, settings: IdleSettings, caught: Set<number>): { state: IdleState; segment: Segment } | null {
  if (prev.phase === 'town') return townWait(prev);
  if (!playing(prev)) return null;
  const state = structuredClone(prev);
  const rng = rngOf(state);
  const out: Segment = { events: [], durationMs: 0, dex: [] };
  let whitedOut = false;
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
    // The first step of an area (or after a white-out) can be in a trainer's sight already (a League room's boss).
    const seen = state.step === 0 && trainerHere(0);
    if (!seen) {
      if (state.step >= leg.track.length - 1) {
        if (state.leg < a.legs.length - 1) {
          state.leg += 1;
          state.step = 0;
          state.encounter.prev = '';
          out.events.push({ t: 'area', area: state.area, leg: state.leg, step: 0 });
          out.durationMs += FADE_MS;
          continue;
        }
        finishArea(state, out);
        out.durationMs += FADE_MS;
        break;
      }
      const from = state.step;
      state.step += 1;
      state.totals.steps += 1;
      out.events.push({ t: 'walk', from, to: state.step });
      out.durationMs += STEP_MS * (leg.track[state.step]![3] & 2 ? 2 : 1) + (leg.track[state.step]![3] & 1 ? FADE_MS : 0);
    }
    const [m, , , , tile] = leg.track[state.step]!;
    const map = mapView(leg.maps[m]!);
    const trainer = trainerHere(state.step);
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
        state.log.push(`Beat ${TRAINERS[key]!.class} ${TRAINERS[key]!.name}.`);
        if ((a.kind === 'gym' || a.kind === 'league') && trainer.key === a.leader) finishArea(state, out);
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
  if (state.phase === 'town' && settings.autoGrind) autoGrind(state, out, whitedOut);
  state.rngState = rng.state;
  state.version += 1;
  if (state.log.length > 50) state.log = state.log.slice(-50);
  return { state, segment: out };
}

/**
 * A town's wait (the user's: no prompt waits on the player): TOWN_WAIT_MS for the player's choice, then the run takes it
 * itself, into the gym (or the League) while it's unbeaten, otherwise on to the next area. The browser counts the wait
 * down and takes the choice with the player's own action; this is the same for a run played offline (catchUp).
 */
function townWait(prev: IdleState): { state: IdleState; segment: Segment } {
  const state = structuredClone(prev);
  const out: Segment = { events: [{ t: 'town', area: state.area }], durationMs: TOWN_WAIT_MS + FADE_MS, dex: [] };
  const town = AREAS[state.area] as TownArea;
  if (!townDone(state, town)) enterGym(state, out.events);
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
      summary.stopped = 'won';
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

/** What the player sees of a run: everything but the RNG, with the area it's in. */
export function idleView(state: IdleState) {
  const { rngState: _, ...rest } = state;
  const area: IdleArea = AREAS[state.area]!;
  // Grinding: the area the loop is in (the run's `area` stays the town), and the level it trains to.
  const grindArea = state.phase === 'grinding' && isTown(area) && area.grind ? areaById(area.grind.area) : null;
  return { ...rest, areaId: area.id, areaName: grindArea?.name ?? area.name, store: isTown(area) ? storeStock(area) : [], grindTarget: state.grind?.level ?? grindTarget(state.area, state.rivalStarter) };
}

export type IdleView = ReturnType<typeof idleView>;

/** The Pokédex's starters for a new run: the three starters always, and any species with a caught record (from the second run). */
export const starterOptions = (caughtSpecies: number[]) => [...new Set([...STARTERS, ...caughtSpecies])].sort((a, b) => a - b);
