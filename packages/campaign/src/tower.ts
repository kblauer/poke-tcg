// The Battle Tower (README: Battle Tower; agreed with the user): as many battles as can be won with one deck, a new
// opponent as soon as one is beaten, one loss ending the challenge. Floors 1–10 are Gen 1's (their opponents' decks and
// rooms), 11–20 Gen 2's, 21+ Gen 3's (staying with the last generation there are cards for); every opponent plays at Gym
// leader difficulty. Every 5th floor beaten is a checkpoint: later challenges can start on the floor after it. Beating
// floor 100 wins the challenge (the user's).
// TowerState is plain JSON, like a run's (RunState); applyTowerAction is its reducer. Between battles the attendant asks
// whether to go on, save and stop (taken up again later with the same deck) or give up the challenge (the user's).
import { typesOf, type BattleRule, type CpuDifficulty, type EnergyType } from '@poke-tcg/game-engine';
import { TOWER_TRAINERS, type TowerTrainer } from './battle-tower-trainers.js';
import { generateDeck, trainerFavorites } from './decks.js';
import type { PoolCard } from './pool.js';
import { pick, rngFrom, seed, type Rng } from './random.js';
import { generation, GENERATIONS } from './run-types.js';

/** Floors a generation's opponents fill (the user's: 1–10 Gen 1, 11–20 Gen 2…). */
export const FLOORS_PER_GENERATION = 10;
/** Every this many floors beaten is a checkpoint (the user's). */
export const CHECKPOINT_EVERY = 5;
/** The last floor: beating it wins the challenge (the user's). */
export const TOP_FLOOR = 100;

/** A generation's sprite set and rooms: FireRed's Trainer Tower, HGSS's and Emerald's Battle Tower (battle-tower-maps.ts). */
export type TowerSprites = 'frlg' | 'hgss' | 'rse';
const GENERATION_SPRITES: Record<number, TowerSprites> = { 1: 'frlg', 2: 'hgss', 3: 'rse' };

/** The newest generation with cards: floors past its band stay with it until there's another (agreed with the user). */
const LAST_GENERATION = Math.max(...Object.keys(GENERATIONS).map(Number));

/** The generation of a floor (counted from 1): its opponents' decks, its rooms and its trainers' sprites. */
export const towerGeneration = (floor: number) => Math.min(Math.max(1, Math.ceil(floor / FLOORS_PER_GENERATION)), LAST_GENERATION);

/** A floor's sprite set (and rooms). */
export const towerSprites = (floor: number): TowerSprites => GENERATION_SPRITES[towerGeneration(floor)] ?? 'rse';

/** Whether beating a floor reaches a checkpoint. */
export const isCheckpoint = (floor: number) => floor % CHECKPOINT_EVERY === 0;

/** The floors a challenge can start on, with `best` the highest floor the account has beaten: 1, and the floor after each checkpoint reached (agreed with the user). */
export function startFloors(best: number): number[] {
  const floors = [1];
  for (let f = CHECKPOINT_EVERY; f <= best && f < TOP_FLOOR; f += CHECKPOINT_EVERY) floors.push(f + 1);
  return floors;
}

/**
 * What beating a floor pays: Battle Points only (BP, the user's: an account currency spent in the lobby's BP Shop, given
 * at once), more on later generations' floors: 1 a win on Gen 1's, 2 on Gen 2's, 3 from floor 21. Placeholder amounts, to balance later.
 */
export function towerReward(floor: number): { bp: number } {
  return { bp: towerGeneration(floor) };
}

/** A floor's opponent: one of the Battle Tower's trainers (with a sprite in the floor's set), and their deck's seed. */
export interface TowerOpponent {
  name: string;
  trainerClass: string;
  female: boolean;
  /** Their overworld sprite in the floor's set (public/overworld/). */
  sprite: string;
  /** Their lines: as the battle starts, on winning it (the player lost) and on losing it. */
  before: string;
  win: string;
  lose: string;
  deckSeed: number;
  /** The battle's game, once started. */
  gameId?: string;
}

/** How the last battle went, for what's said after it: the opponent's line, and on a win the reward and whether it was a checkpoint. */
export interface TowerResult {
  floor: number;
  won: boolean;
  opponent: string;
  /** Their sprite, to show them saying their line. */
  sprite: string;
  line: string;
  bp: number;
  checkpoint: boolean;
}

export interface TowerState {
  /** Bumped by every action; saves check it (optimistic concurrency, like runs). */
  version: number;
  rngState: number;
  /** The challenge's deck, fixed for the whole challenge (the user's). */
  deck: string[];
  /** The name of the account's deck it came from, for the screen. */
  deckName?: string;
  /** The floor it started on (1, or the floor after a checkpoint). */
  startFloor: number;
  /** The floor being fought (or next). */
  floor: number;
  /** Battles won in this challenge. */
  wins: number;
  /** The Battle Points won in this challenge (each win's are given to the account at once). */
  bp: number;
  /**
   * between: before a battle (the opponent not yet in; the challenge can be saved or given up); battle: fighting
   * `opponent`; lost: over, by a loss or given up (`quit`); won: floor TOP_FLOOR beaten.
   */
  phase: 'between' | 'battle' | 'lost' | 'won';
  /** Saved and stopped (between battles): the Play tab is free for other modes until it's taken up again (RESUME). */
  saved: boolean;
  /** Given up with the attendant (QUIT), not lost in a battle. */
  quit: boolean;
  opponent: TowerOpponent | null;
  /** The trainers met in this challenge (name and class), so they aren't met again until every one of a set has been. */
  met: string[];
  last: TowerResult | null;
  /** What happened, oldest first. */
  log: string[];
}

export type TowerAction =
  /** Let the next opponent in (the attendant's "go on"): rolls them and starts the battle. */
  | { type: 'CONTINUE' }
  /** Save and stop, between battles: taken up again later (RESUME) with the same deck. */
  | { type: 'SAVE' }
  /** Take a saved challenge up again (back at the desk). */
  | { type: 'RESUME' }
  /** Give the challenge up, between battles: it ends as a loss would. */
  | { type: 'QUIT' };

/** Actions only the server sends (battles). Never accepted from clients. */
export type TowerSystemAction =
  | { type: 'BATTLE_STARTED'; gameId: string }
  /** As a run's: `conceded`, the player conceded the game (a loss); `skipped`, won by debug's Skip battle (no ₱ or EXP). */
  | { type: 'BATTLE_OVER'; gameId: string; won: boolean; conceded?: boolean; skipped?: boolean };

export type TowerResultOf = { ok: true; state: TowerState } | { ok: false; error: string };

const trainerKey = (t: Pick<TowerTrainer, 'name' | 'trainerClass'>) => `${t.trainerClass} ${t.name}`;

/** The trainers a floor can meet: those with a sprite in its set (the user's: only trainers we have sprites for). */
export const floorTrainers = (floor: number) => TOWER_TRAINERS.filter((t) => t.sprites[towerSprites(floor)]);

/** The floor's opponent: one of its trainers not yet met this challenge (any of them again once all have been). */
function rollOpponent(rng: Rng, state: TowerState): TowerOpponent {
  const set = towerSprites(state.floor);
  const all = floorTrainers(state.floor);
  const fresh = all.filter((t) => !state.met.includes(trainerKey(t)));
  const t = pick(rng, fresh.length ? fresh : all);
  return { name: t.name, trainerClass: t.trainerClass, female: t.female, sprite: t.sprites[set]!, before: t.before, win: t.win, lose: t.lose, deckSeed: seed(rng) };
}

/** A new challenge with the deck (`deckName`: the account deck it came from), from `startFloor` (1 or the floor after a checkpoint). */
export function createTower(deck: string[], towerSeed: number, startFloor = 1, deckName?: string): TowerState {
  return {
    version: 0,
    rngState: rngFrom(towerSeed).state,
    deck: [...deck],
    ...(deckName && { deckName }),
    startFloor,
    floor: startFloor,
    wins: 0,
    bp: 0,
    phase: 'between',
    saved: false,
    quit: false,
    opponent: null,
    met: [],
    last: null,
    log: [`Started a Battle Tower challenge on floor ${startFloor}.`],
  };
}

/** Whether the challenge is waiting for the server to start a battle (it then sends BATTLE_STARTED). */
export const towerNeedsBattle = (state: TowerState) => state.phase === 'battle' && !!state.opponent && !state.opponent.gameId;

/** The current battle's game, if one is under way. */
export const towerGameId = (state: TowerState) => (state.phase === 'battle' ? state.opponent?.gameId ?? null : null);

/**
 * What the server needs to start the battle: the opponent's deck, a random deck of the floor's generation (`pool` should
 * be its pool: towerGeneration), suiting their class where it has favourites (trainerFavorites), at Gym leader difficulty
 * (agreed with the user), and no battle rules.
 */
export function towerBattleSetup(state: TowerState, pool: readonly PoolCard[]): { deck: string[]; difficulty: CpuDifficulty; rules: BattleRule[]; opponent: string } {
  const o = state.opponent;
  if (state.phase !== 'battle' || !o) throw new Error('No battle to start');
  const opponent = trainerKey(o);
  const deck = generateDeck(pool, rngFrom(o.deckSeed), { favorites: trainerFavorites(opponent), rules: generation(towerGeneration(state.floor)).deckRules, difficulty: 'gymLeader' });
  return { deck, difficulty: 'gymLeader', rules: [], opponent };
}

/**
 * Themed names for the tower's opponents' decks, by the deck's main type (the user's: a pool of them, never the trainer's
 * name; shown as "<name> Deck"). Ours, in the spirit of the boss decks' names.
 */
export const TOWER_DECK_NAMES: Record<EnergyType, string[]> = {
  grass: ['Overgrowth', 'Jungle Ambush', 'Spore Storm', 'Leaf Blade', 'Verdant Fury', 'Thorn Garden'],
  fire: ['Inferno', 'Firestorm', 'Blaze Rush', 'Ember Dance', 'Heat Wave', 'Wildfire'],
  water: ['Tidal Wave', 'Undertow', 'Riptide', 'Rain Dance', 'Deep Current', 'Whirlpool'],
  lightning: ['Thunderstruck', 'Static Shock', 'Volt Surge', 'Storm Front', 'Live Wire', 'Chain Lightning'],
  psychic: ['Mind Games', 'Phantom Force', 'Night Shade', 'Hypnotic Haze', 'Third Eye', 'Mirror Coat'],
  fighting: ['Rock Slide', 'Iron Fist', 'Earthquake', 'Dojo Rush', 'Ground Zero', 'Knockout'],
  darkness: ['Night Raid', 'Shadow Play', 'Dark Pulse', 'Moonless Sky', 'Ambush', 'Black Market'],
  metal: ['Steel Wall', 'Iron Defense', 'Metal Storm', 'Bulwark', 'Heavy Armor', 'Cold Steel'],
  colorless: ['Wild Card', 'Swift Strike', 'Normal Force', 'Endless Stamina', 'Jack of All Trades', 'Hyper Beam'],
};

/** A deck's main type: the type the most of its Pokémon cards are (a card of two types counts for both; the first such on a tie). */
export function mainType(deck: readonly string[], pool: readonly PoolCard[]): EnergyType {
  const defs = new Map(pool.map((c) => [c.def.id, c.def]));
  const counts = new Map<EnergyType, number>();
  for (const id of deck) {
    const def = defs.get(id);
    if (def?.kind === 'pokemon') for (const t of typesOf(def)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'colorless';
}

/** The opponent's deck (as their battle's: towerBattleSetup) and its themed name (TOWER_DECK_NAMES, picked by the deck's seed, so it keeps it). */
export function towerOpponentDeck(state: TowerState, pool: readonly PoolCard[]): { deck: string[]; name: string } {
  const { deck } = towerBattleSetup(state, pool);
  const names = TOWER_DECK_NAMES[mainType(deck, pool)];
  return { deck, name: pick(rngFrom(state.opponent!.deckSeed ^ 0x6e616d65), names) };
}

/** Applies a player's or the server's action to a challenge. Pure: returns a new state, or an error. */
export function applyTowerAction(prev: TowerState, action: TowerAction | TowerSystemAction): TowerResultOf {
  const state = structuredClone(prev);
  const fail = (error: string): TowerResultOf => ({ ok: false, error });
  const rng: Rng = { state: state.rngState };
  const ok = (): TowerResultOf => {
    state.rngState = rng.state;
    state.version += 1;
    return { ok: true, state };
  };
  if (state.phase === 'lost' || state.phase === 'won') return fail('This challenge is over');
  if (state.saved && action.type !== 'RESUME' && action.type !== 'QUIT') return fail('Take the challenge up again first');

  switch (action.type) {
    case 'CONTINUE': {
      if (state.phase !== 'between') return fail('A battle is under way');
      state.opponent = rollOpponent(rng, state);
      state.met.push(trainerKey(state.opponent));
      state.phase = 'battle';
      return ok();
    }

    case 'SAVE': {
      if (state.phase !== 'between') return fail('Save between battles');
      state.saved = true;
      state.log.push(`Saved the challenge before floor ${state.floor}.`);
      return ok();
    }

    case 'RESUME': {
      if (!state.saved) return fail('This challenge is under way');
      state.saved = false;
      state.log.push(`Took the challenge up again on floor ${state.floor}.`);
      return ok();
    }

    case 'QUIT': {
      if (state.phase !== 'between') return fail('Give up between battles');
      state.saved = false;
      state.quit = true;
      state.phase = 'lost';
      state.log.push(`Gave up the challenge before floor ${state.floor}: ${state.wins} ${state.wins === 1 ? 'win' : 'wins'}.`);
      return ok();
    }

    case 'BATTLE_STARTED': {
      if (!towerNeedsBattle(state)) return fail('No battle to start');
      state.opponent!.gameId = action.gameId;
      return ok();
    }

    case 'BATTLE_OVER': {
      const o = state.opponent;
      if (state.phase !== 'battle' || !o || o.gameId !== action.gameId) return fail('Not the current battle');
      const opponent = trainerKey(o);
      const floor = state.floor;
      if (action.won) {
        const reward = action.skipped ? { bp: 0 } : towerReward(floor);
        state.wins += 1;
        state.bp += reward.bp;
        state.last = { floor, won: true, opponent, sprite: o.sprite, line: o.lose, ...reward, checkpoint: isCheckpoint(floor) };
        state.log.push(action.skipped ? `Skipped the battle with ${opponent} on floor ${floor} (debug): no BP.` : `Beat ${opponent} on floor ${floor}: +${reward.bp} BP.`);
        if (isCheckpoint(floor)) state.log.push(`Floor ${floor} beaten: a checkpoint. Challenges can now start on floor ${floor + 1}.`);
        state.opponent = null;
        if (floor >= TOP_FLOOR) {
          state.phase = 'won';
          state.log.push(`Floor ${TOP_FLOOR} beaten: the challenge is won!`);
          return ok();
        }
        state.floor += 1;
        state.phase = 'between';
        return ok();
      }
      state.last = { floor, won: false, opponent, sprite: o.sprite, line: o.win, bp: 0, checkpoint: false };
      state.log.push(`Lost to ${opponent} on floor ${floor}${action.conceded ? ' (conceded)' : ''}: the challenge is over, ${state.wins} ${state.wins === 1 ? 'win' : 'wins'}.`);
      state.phase = 'lost';
      return ok();
    }
  }
}

/** The highest floor a challenge has beaten (0 for none), for the account's checkpoints. */
export const floorsBeaten = (state: Pick<TowerState, 'startFloor' | 'wins'>) => (state.wins ? state.startFloor + state.wins - 1 : 0);

/** Whether the challenge's next floor is a new generation's (the clerk leads the player back into the elevator, up to its rooms). */
export const nextIsNewGeneration = (state: Pick<TowerState, 'floor' | 'wins'>) => state.wins > 0 && towerGeneration(state.floor) !== towerGeneration(state.floor - 1);

/** What the player sees of a challenge: everything but the RNG and the opponent's deck seed. */
export function towerView(state: TowerState) {
  const { rngState: _, ...rest } = state;
  const opponent = state.opponent && (({ deckSeed: __, ...visible }) => visible)(state.opponent);
  return { ...rest, opponent, generation: towerGeneration(state.floor), sprites: towerSprites(state.floor) };
}

export type TowerView = ReturnType<typeof towerView>;
