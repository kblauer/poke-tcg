// Safari Draft (issue #239, section 10): the balance harness. Many seeded battles of random boards, a tier at a time,
// reporting each unit's win rate, and what each keyword, Pokémon Power, type synergy and Trainer is worth: the same
// boards played with it and without it. tools/safari/balance.ts runs it and writes the report.
//
// The boards are a stand-in until the draft exists (step 2): 6 different units of one tier in a random order, against 6
// of the same tier. A drafted board mixes tiers and leans into its synergies, so these rates say which effects are out of
// line with the others, not how a run will go.
import { int, rngFrom, sample, type Rng } from '@poke-tcg/campaign';
import { BOARD_SIZE, simulateBattle, type Board, type SideId } from './battle.js';
import type { SynergyType, TrainerName } from './effects.js';
import { TOP_TIER, type Unit } from './units.js';

/** Battles played and won from one side: a draw is half a win. */
export interface Tally {
  games: number;
  wins: number;
}
export const winRate = (t: Tally) => (t.games ? t.wins / t.games : 0);
const add = (t: Tally, winner: SideId | 'draw', side: SideId) => {
  t.games++;
  t.wins += winner === 'draw' ? 0.5 : winner === side ? 1 : 0;
};
const tally = (): Tally => ({ games: 0, wins: 0 });

/** The same boards with something and without it: its worth is the difference of the two win rates. */
export interface Lift {
  with: Tally;
  without: Tally;
}
export const lift = (l: Lift) => winRate(l.with) - winRate(l.without);

const tiers = (units: readonly Unit[]) => Array.from({ length: TOP_TIER }, (_, t) => units.filter((u) => u.tier === t + 1));
const seedOf = (rng: Rng) => int(rng, 2 ** 31);

/** A board of a tier's units in a random order, `must` among them. */
function board(rng: Rng, pool: readonly Unit[], must: readonly Unit[] = []): Unit[] {
  const rest = sample(rng, pool.filter((u) => !must.includes(u)), BOARD_SIZE - must.length);
  return sample(rng, [...must, ...rest], BOARD_SIZE);
}

export interface TierReport {
  tier: number;
  battles: number;
  draws: number;
  /** Decided battles the side that attacked first won. */
  firstWins: number;
  rounds: number;
  /** Battles that reached rising damage. */
  rising: number;
  capped: number;
}

/** Every unit's win rate on random boards of its own tier, and how those battles went. */
export function unitRates(units: readonly Unit[], battles: number, seed: number, risingFrom: number): { units: Map<string, Tally>; tiers: TierReport[] } {
  const rng = rngFrom(seed);
  const rates = new Map<string, Tally>(units.map((u) => [u.id, tally()]));
  const reports = tiers(units).map((pool, t) => {
    const report: TierReport = { tier: t + 1, battles, draws: 0, firstWins: 0, rounds: 0, rising: 0, capped: 0 };
    for (let i = 0; i < battles; i++) {
      const boards = [board(rng, pool), board(rng, pool)] as const;
      const result = simulateBattle({ units: boards[0] }, { units: boards[1] }, seedOf(rng), { events: false });
      boards.forEach((b, side) => b.forEach((u) => add(rates.get(u.id)!, result.winner, side as SideId)));
      if (result.winner === 'draw') report.draws++;
      else if (result.winner === result.first) report.firstWins++;
      report.rounds += result.rounds;
      if (result.rounds >= risingFrom) report.rising++;
      if (result.capped) report.capped++;
    }
    return report;
  });
  return { units: rates, tiers: reports };
}

/** How often a random board of each tier beats one of the tier below: whether the tiers are a ladder. */
export function tierLadder(units: readonly Unit[], battles: number, seed: number): Tally[] {
  const rng = rngFrom(seed);
  const pools = tiers(units);
  return pools.slice(1).map((pool, t) => {
    const out = tally();
    for (let i = 0; i < battles; i++) add(out, simulateBattle({ units: board(rng, pool) }, { units: board(rng, pools[t]!) }, seedOf(rng), { events: false }).winner, 0);
    return out;
  });
}

/**
 * What an effect is worth to the units that have it: each battle, one of `carriers` on a board of its tier against a
 * random board of that tier, played as it is and again `stripped` of the effect, from the same seed.
 */
export function effectLift(units: readonly Unit[], carriers: readonly Unit[], stripped: (u: Unit) => Unit, battles: number, seed: number): Lift {
  const rng = rngFrom(seed);
  const pools = tiers(units);
  const out: Lift = { with: tally(), without: tally() };
  for (let i = 0; i < battles && carriers.length; i++) {
    const carrier = carriers[int(rng, carriers.length)]!;
    const pool = pools[carrier.tier - 1]!;
    const mine = board(rng, pool, [carrier]);
    const theirs = board(rng, pool.filter((u) => u !== carrier));
    const battleSeed = seedOf(rng);
    add(out.with, simulateBattle({ units: mine }, { units: theirs }, battleSeed, { events: false }).winner, 0);
    add(out.without, simulateBattle({ units: mine.map((u) => (u === carrier ? stripped(u) : u)) }, { units: theirs }, battleSeed, { events: false }).winner, 0);
  }
  return out;
}

/** What a type's synergy is worth with `count` of the type on a board: the same battles with it and with it switched off. */
export function synergyLift(units: readonly Unit[], type: SynergyType, count: number, battles: number, seed: number): Lift {
  const rng = rngFrom(seed);
  const pools = tiers(units).filter((pool) => pool.filter((u) => u.type === type).length >= count);
  const out: Lift = { with: tally(), without: tally() };
  for (let i = 0; i < battles && pools.length; i++) {
    const pool = pools[int(rng, pools.length)]!;
    const mine = board(rng, pool.filter((u) => u.type !== type), sample(rng, pool.filter((u) => u.type === type), count));
    const theirs = board(rng, pool);
    const battleSeed = seedOf(rng);
    add(out.with, simulateBattle({ units: mine }, { units: theirs }, battleSeed, { events: false }).winner, 0);
    add(out.without, simulateBattle({ units: mine }, { units: theirs }, battleSeed, { events: false, mute: [[type]] }).winner, 0);
  }
  return out;
}

/** What a Trainer is worth on random boards of `tier`, against a side that plays none. */
export function trainerLift(units: readonly Unit[], trainer: TrainerName, tier: number, battles: number, seed: number): Lift {
  const rng = rngFrom(seed);
  const pool = tiers(units)[tier - 1]!;
  const out: Lift = { with: tally(), without: tally() };
  for (let i = 0; i < battles; i++) {
    const mine: Board = { units: board(rng, pool) };
    const theirs: Board = { units: board(rng, pool) };
    const battleSeed = seedOf(rng);
    add(out.with, simulateBattle({ ...mine, trainer }, theirs, battleSeed, { events: false }).winner, 0);
    add(out.without, simulateBattle(mine, theirs, battleSeed, { events: false }).winner, 0);
  }
  return out;
}
