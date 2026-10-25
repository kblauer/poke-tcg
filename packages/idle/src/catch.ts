// Catching (battle_script_commands.c's Cmd_handleballthrow, Gen 3 exactly): the odds from the catch rate, the ball, the
// HP left and the status, then four shake checks.
import { int, type Rng } from '@poke-tcg/campaign';

/** The balls auto-catch throws, best first, and their multipliers in tenths (Ultra 2x, Great 1.5x, Poké 1x). Safari Balls aren't in this mode. */
export const BALLS: [string, number][] = [
  ['master-ball', 0],
  ['ultra-ball', 20],
  ['great-ball', 15],
  ['poke-ball', 10],
];

export interface CatchInput {
  catchRate: number;
  maxHp: number;
  hp: number;
  status: string | null;
  ball: string;
}

/** The game's catch value `a` (odds): above 254 always caught. */
export function catchOdds(i: CatchInput): number {
  const mult = BALLS.find(([b]) => b === i.ball)?.[1] ?? 10;
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
