// Catching (battle_script_commands.c's Cmd_handleballthrow, Gen 3 exactly; Gen 4's BattleSystem_CalculateBallShakes is the
// same formula): the odds from the catch rate, the ball, the HP left and the status, then four shake checks.
import { int, type Rng } from '@poke-tcg/campaign';
import type { TypeName } from './types.js';

/**
 * The balls auto-catch throws, best first when nothing else decides (bestBall), and their plain multipliers in tenths
 * (Ultra 2x, Great 1.5x, Poké 1x); the special ones (Net, Dive, Nest, Repeat, Timer, Gen 4's Dusk and Quick) by
 * ballTenths, Heal, Luxury and Premier 1x. Safari Balls aren't in this mode, nor the Apricorn Balls (Kurt's).
 */
export const BALLS: [string, number][] = [
  ['master-ball', 0],
  ['ultra-ball', 20],
  ['great-ball', 15],
  ['poke-ball', 10],
  ['quick-ball', 10],
  ['dusk-ball', 10],
  ['net-ball', 10],
  ['nest-ball', 10],
  ['dive-ball', 10],
  ['repeat-ball', 10],
  ['timer-ball', 10],
  ['heal-ball', 10],
  ['luxury-ball', 10],
  ['premier-ball', 10],
];

/** What a special ball looks at: the wild Pokémon's types and level, the battle's turn (from 0), the time and place, whether the species is caught already. */
export interface BallSituation {
  types: readonly TypeName[];
  level: number;
  turn: number;
  night?: boolean;
  cave?: boolean;
  water?: boolean;
  caught?: boolean;
  gen4?: boolean;
}

/** A ball's multiplier in tenths here (Gen 3's and Gen 4's: Net 3x on Water and Bug, Dive 3.5x on water, Nest up to 4x below level 40, Repeat 3x on a caught species, Timer up by a tenth a turn to 4x; Gen 4's Dusk 3.5x at night or in a cave, Quick 4x on the first turn). */
export function ballTenths(ball: string, s: BallSituation): number {
  switch (ball) {
    case 'net-ball':
      return s.types.includes('water') || s.types.includes('bug') ? 30 : 10;
    case 'dive-ball':
      return s.water ? 35 : 10;
    case 'nest-ball':
      return s.level < 40 ? Math.max(10, 40 - s.level) : 10;
    case 'repeat-ball':
      return s.caught ? 30 : 10;
    case 'timer-ball':
      return Math.min(40, s.turn + 10);
    case 'dusk-ball':
      return s.gen4 && (s.night || s.cave) ? 35 : 10;
    case 'quick-ball':
      return s.gen4 && s.turn < 1 ? 40 : 10;
    default:
      return BALLS.find(([b]) => b === ball)?.[1] ?? 10;
  }
}

/**
 * The best of the balls in a bag here: the Master Ball (unless `noMaster`: auto-catch and the ball button never throw it,
 * the user's, 2026-11-04: it has its own button), else the highest multiplier, ties in BALLS' order.
 */
export function bestBall(bag: Record<string, number>, s: BallSituation, noMaster = false): string | null {
  const owned = BALLS.map(([b]) => b).filter((b) => (bag[b] ?? 0) > 0 && !(noMaster && b === 'master-ball'));
  if (owned.includes('master-ball')) return 'master-ball';
  let best: string | null = null;
  for (const b of owned) if (!best || ballTenths(b, s) > ballTenths(best, s)) best = b;
  return best;
}

export interface CatchInput {
  catchRate: number;
  maxHp: number;
  hp: number;
  status: string | null;
  ball: string;
  /** The ball's multiplier in tenths here (ballTenths); its plain one when not given. */
  tenths?: number;
}

/** The game's catch value `a` (odds): above 254 always caught. */
export function catchOdds(i: CatchInput): number {
  const mult = i.tenths ?? BALLS.find(([b]) => b === i.ball)?.[1] ?? 10;
  let odds = Math.floor((Math.floor((i.catchRate * mult) / 10) * (i.maxHp * 3 - i.hp * 2)) / (3 * i.maxHp));
  if (i.status === 'sleep' || i.status === 'freeze') odds *= 2;
  else if (i.status) odds = Math.floor((odds * 15) / 10);
  return odds;
}

/** The shake threshold `b` for odds `a` (Sqrt(Sqrt(16711680 / a)), 1048560 / that), each shake passing when Random() < b. */
export function shakeThreshold(odds: number): number {
  if (odds <= 0) return 0;
  return Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / odds))))));
}

/** A ball the player asked for (the battle's ball buttons): from a tick on, the best ball (a number, as older runs keep them) or the Master Ball. */
export type ThrowAsk = number | { tick: number; ball: 'master-ball' };
export const throwTick = (a: ThrowAsk) => (typeof a === 'number' ? a : a.tick);

/** A throw: caught or not, and the shakes before it broke free (0–3; 4 when caught). */
export function attemptCatch(rng: Rng, i: CatchInput): { caught: boolean; shakes: number } {
  if (i.ball === 'master-ball') return { caught: true, shakes: 4 };
  const odds = catchOdds(i);
  if (odds > 254) return { caught: true, shakes: 4 };
  const b = shakeThreshold(odds);
  let shakes = 0;
  while (shakes < 4 && int(rng, 65536) < b) shakes++;
  return { caught: shakes === 4, shakes: shakes === 4 ? 4 : shakes };
}

/** The chance a throw catches (for tests and the screen): (b / 65536)^4, or 1 above 254. */
export function catchChance(i: CatchInput): number {
  if (i.ball === 'master-ball') return 1;
  const odds = catchOdds(i);
  if (odds > 254) return 1;
  return Math.min(1, (shakeThreshold(odds) / 65536) ** 4);
}
