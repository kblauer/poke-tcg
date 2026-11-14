// The Game Corner's rounds as the API plays them (issue #204): the server draws each slot spin and roulette ball, and the
// browser plays back what was drawn. A sitting at a machine or a table is kept with the account (in User.voltorbFlip's JSON,
// under `gameCorner`, beside Voltorb Flip's session: the Coin Case's games share it rather than a column of their own).
//
// The slots: a spin's bet is taken when it starts and its Random() drawn then (a seed: its bias, Reel Time's lottery and
// speed all come from it), and the browser plays it with that Random(). The reels are stopped by the player's presses, as
// in the game; the browser sends each reel's stop (its offset as the stop is decided), and the API plays the spin again
// on the frame port from the sitting's record (playSlotSpin) to pay it, keeping the record and any free spin a Replay
// owes (its seed handed out with the payout). The roulette: the bet and the wheel's angle as the spin starts go to the
// API, which plays the ball's roll on the frame port (playRouletteBall), pays it and hands back the Random() values the
// roll takes, which the browser plays the same roll with. Either way the browser never sends a payout.
import type { Random16 } from './berry-blender.js';
import { MAX_COINS, ROULETTE_MIN_BETS, slotMachineId, type SlotMachineId } from './game-corner.js';
import { random, rngFrom } from './random.js';
import { newRouletteBoard, playRouletteBall, type RouletteBoard } from './roulette.js';
import { playSlotSpin, sitAtSlotMachine, slotRecord, type SlotRecord } from './slot-machine.js';

/** A spin's Random() (0-65535) from its seed, the same on the API and in the browser. */
export function seededRandom16(seed: number): Random16 {
  const rng = rngFrom(seed);
  return () => Math.floor(random(rng) * 0x10000);
}

/** A sitting at a slot machine: which (0-11), its record between spins, and the spin drawn and not yet stopped (a Replay's free one too). */
export interface SlotSitting {
  machine: number;
  record: SlotRecord;
  spin: { seed: number; bet: number; free: boolean } | null;
}

/** A sitting at a roulette table: which, the hour it was sat at (the game reads the clock then), and its board. */
export interface RouletteSitting {
  table: 0 | 1;
  hours: number;
  board: RouletteBoard;
}

export interface GameCornerState {
  slots: SlotSitting | null;
  roulette: RouletteSitting | null;
}

/** The Game Corner's sittings from User.voltorbFlip's JSON (none if there are none or they're malformed). */
export function gameCornerOf(json: unknown): GameCornerState {
  const corner = (json as { gameCorner?: Partial<GameCornerState> } | null)?.gameCorner;
  const slots = corner?.slots && Array.isArray(corner.slots.record?.reelPixelOffsets) ? corner.slots : null;
  const roulette = corner?.roulette && Array.isArray(corner.roulette.board?.hitSquares) ? corner.roulette : null;
  return { slots, roulette };
}

/** User.voltorbFlip's JSON with the Game Corner's sittings set, Voltorb Flip's session kept. */
export const withGameCorner = (json: unknown, corner: GameCornerState) => ({ ...(json && typeof json === 'object' ? json : {}), gameCorner: corner });

/** Voltorb Flip's session to save, the Game Corner's sittings in the same JSON kept. */
export const keepGameCorner = <T extends object>(json: unknown, voltorbFlip: T) => ({ ...voltorbFlip, gameCorner: gameCornerOf(json) });

/** A slot machine sat at on `day` (its luck then, kept for the sitting), the lucky game drawn by the API. */
export function sitAtSlots(machine: number, day: number, luckyGame: boolean): SlotSitting {
  const machineId: SlotMachineId = slotMachineId(machine, day);
  return { machine, record: slotRecord(sitAtSlotMachine(machineId, 0, luckyGame)), spin: null };
}

/**
 * A spin left without its stops (the page shut, a stop lost): played as if each reel were stopped at once, and paid. A
 * free spin it owes is dropped with the sitting.
 */
export function leaveSlotSpin(sitting: SlotSitting, coins: number): { sitting: SlotSitting; coins: number } {
  const spin = sitting.spin;
  if (!spin) return { sitting, coins };
  const played = playSlotSpin(sitting.record, spin.bet, spin.free, seededRandom16(spin.seed), [null, null, null]);
  if ('error' in played) return { sitting: { ...sitting, spin: null }, coins };
  return { sitting: { ...sitting, record: played.record, spin: null }, coins: Math.min(MAX_COINS, coins + played.payout) };
}

/** A spin's bet put in (1-3 coins): taken from the coins, the spin's seed drawn. Refused while a spin is under way (leaveSlotSpin it first) or without the coins. */
export function drawSlotSpin(sitting: SlotSitting, bet: number, coins: number, seed: number): { sitting: SlotSitting; coins: number } | { error: string } {
  if (![1, 2, 3].includes(bet)) return { error: 'A slot machine takes 1 to 3 coins' };
  if (sitting.spin) return { error: 'A spin is under way' };
  if (coins < bet) return { error: "You don't have enough coins" };
  return { sitting: { ...sitting, spin: { seed, bet, free: false } }, coins: coins - bet };
}

/**
 * The spin under way stopped at `stops` (each reel's offset as its stop was decided, the screen's `stop` events): played
 * again from the sitting's record and paid (playSlotSpin), the record kept. A Replay's free spin comes next, drawn with
 * `nextSeed` (its seed is `next`, for the browser to play it with). Refused with no spin under way or stops the reels
 * never reach.
 */
export function settleSlotSpin(sitting: SlotSitting, stops: readonly number[], coins: number, nextSeed: number): { sitting: SlotSitting; coins: number; payout: number; next: number | null } | { error: string } {
  const spin = sitting.spin;
  if (!spin) return { error: 'No spin is under way' };
  const played = playSlotSpin(sitting.record, spin.bet, spin.free, seededRandom16(spin.seed), stops);
  if ('error' in played) return played;
  const next = played.replay ? { seed: nextSeed, bet: spin.bet, free: true } : null;
  return { sitting: { ...sitting, record: played.record, spin: next }, coins: Math.min(MAX_COINS, coins + played.payout), payout: played.payout, next: next?.seed ?? null };
}

/** A roulette table sat at, at the player's hour (0-23): a new board. */
export const sitAtRoulette = (table: 0 | 1, hours: number): RouletteSitting => ({ table, hours, board: newRouletteBoard() });

/**
 * A ball bet on `selection` with the wheel at `wheelAngle` as the spin starts: the table's bet taken, the ball played
 * (playRouletteBall, with `random` the API's Random()) and paid. `draws` are the Random() values the roll took, for the
 * browser to roll it the same. Refused without the coins, or a bet the game wouldn't take.
 */
export function rollRouletteBall(sitting: RouletteSitting, selection: number, wheelAngle: number, coins: number, random: Random16): { sitting: RouletteSitting; coins: number; payout: number; draws: number[] } | { error: string } {
  const bet = ROULETTE_MIN_BETS[sitting.table];
  if (coins < bet) return { error: "You don't have enough coins" };
  const played = playRouletteBall(sitting.table, sitting.hours, sitting.board, selection, wheelAngle, random);
  if ('error' in played) return played;
  return { sitting: { ...sitting, board: played.board }, coins: Math.min(MAX_COINS, coins - played.bet + played.payout), payout: played.payout, draws: played.draws };
}
