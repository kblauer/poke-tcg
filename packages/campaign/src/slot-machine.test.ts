import { describe, expect, it } from 'vitest';
import type { Random16 } from './berry-blender.js';
import { afterRound, MAX_COINS, SLOT_MAX_PAYOUT, type SlotMachineId } from './game-corner.js';
import {
  newSlotMachine,
  SLOT_KEYS,
  SLOT_MATCH,
  SLOT_PAYOUTS,
  SLOT_SYMBOL,
  slotAwaitingBet,
  slotAwaitingStop,
  slotFrame,
  slotMatch,
  slotSymbolAtRest,
  type SlotEvent,
  type SlotMachine,
} from './slot-machine.js';

/** A seeded Random() (0-65535): mulberry32's top 16 bits. */
const random16 = (seed: number): Random16 => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 16) & 0xffff;
  };
};

interface Round {
  bet: number;
  payout: number;
  /** The coins before the spin's bet was taken, and when the machine next waits for a bet. */
  before: number;
  after: number;
  /** The payout the stopped reels' lines add up to, by the game's rules. */
  lines: number;
}

/** What the lines on screen pay for a bet: the middle row; the top and bottom (a cherry 4); the diagonals (no cherries). */
function linesPayout(m: SlotMachine, bet: number) {
  const sym = (reel: number, row: number) => slotSymbolAtRest(m, reel, row);
  const pay = (rows: number[], kind: 'middle' | 'row' | 'diagonal') => {
    const match = slotMatch(sym(0, rows[0]!), sym(1, rows[1]!), sym(2, rows[2]!));
    if (match === SLOT_MATCH.none) return 0;
    if (match === SLOT_MATCH.cherry) return kind === 'middle' ? 2 : kind === 'row' ? 4 : 0;
    return SLOT_PAYOUTS[match]!;
  };
  let total = pay([2, 2, 2], 'middle');
  if (bet > 1) total += pay([1, 1, 1], 'row') + pay([3, 3, 3], 'row');
  if (bet > 2) total += pay([1, 2, 3], 'diagonal') + pay([3, 2, 1], 'diagonal');
  return total;
}

/** Plays frames until the machine waits for a bet (A dismisses any message), at most `limit`. */
function untilBet(m: SlotMachine, random: Random16, limit = 20000) {
  for (let i = 0; i < limit && !m.exited; i++) {
    if (slotAwaitingBet(m)) return true;
    slotFrame(m, { pressed: m.message ? SLOT_KEYS.a : 0, held: 0 }, random);
  }
  return slotAwaitingBet(m);
}

/** One spin as a player plays it: Down `bet` times (A if fewer than 3), A for each reel a few frames apart, till the next bet. */
function spin(m: SlotMachine, random: Random16, bet: number): Round[] {
  const rounds: Round[] = [];
  const press = (keys: number) => slotFrame(m, { pressed: keys, held: keys }, random);
  const collect = (events: SlotEvent[]) => {
    for (const e of events) if ('round' in e) rounds.push({ ...e.round, before: m.coins + e.round.bet, after: -1, lines: linesPayout(m, m.bet) });
  };
  if (!untilBet(m, random)) return rounds;
  const before = m.coins;
  for (let i = 0; i < bet; i++) {
    collect(press(SLOT_KEYS.down));
    collect(press(0));
  }
  if (bet < 3) collect(press(SLOT_KEYS.a));
  let frames = 0;
  while (!slotAwaitingBet(m) && !m.exited) {
    if (++frames > 20000) throw new Error('a spin never ended');
    collect(press((slotAwaitingStop(m) || m.message) && frames % 7 === 0 ? SLOT_KEYS.a : 0));
  }
  if (rounds.length) {
    rounds[0]!.before = before;
    for (const r of rounds) r.after = m.coins;
  }
  return rounds;
}

describe('the slot machines', () => {
  it('match a line of 3, red-red-blue or blue-blue-red 7s (Reg Bonus), or a cherry on the left reel alone', () => {
    const { red7, blue7, lotad, azurill, cherry, power, replay } = SLOT_SYMBOL;
    expect(slotMatch(red7, red7, red7)).toBe(SLOT_MATCH.red7);
    expect(slotMatch(blue7, blue7, blue7)).toBe(SLOT_MATCH.blue7);
    expect(slotMatch(red7, red7, blue7)).toBe(SLOT_MATCH.mixed7);
    expect(slotMatch(blue7, blue7, red7)).toBe(SLOT_MATCH.mixed7);
    expect(slotMatch(red7, blue7, red7)).toBe(SLOT_MATCH.none);
    expect(slotMatch(lotad, lotad, lotad)).toBe(SLOT_MATCH.lotad);
    expect(slotMatch(azurill, azurill, azurill)).toBe(SLOT_MATCH.azurill);
    expect(slotMatch(power, power, power)).toBe(SLOT_MATCH.power);
    expect(slotMatch(replay, replay, replay)).toBe(SLOT_MATCH.replay);
    expect(slotMatch(cherry, lotad, power)).toBe(SLOT_MATCH.cherry);
    expect(slotMatch(lotad, cherry, cherry)).toBe(SLOT_MATCH.none);
  });

  it("pays the game's amounts: cherries 2 (4 on the top or bottom row), Lotad 6, Azurill 12, Power 3, Reg Bonus 90, 7s 300, a Replay a free spin", () => {
    expect(SLOT_PAYOUTS).toEqual([2, 4, 0, 6, 12, 3, 90, 300, 300]);
    // No spin can pay more than the Game Corner's check allows: all 5 lines 7s.
    expect(5 * Math.max(...SLOT_PAYOUTS)).toBe(SLOT_MAX_PAYOUT);
  });

  it("pays each spin what its bet's lines on the stopped reels add up to, and the coins follow the API's sums", () => {
    for (const machine of [0, 3, 5] as SlotMachineId[]) {
      const random = random16(1000 + machine);
      const m = newSlotMachine(machine, 2000, random);
      let rounds = 0;
      for (let i = 0; i < 150; i++) {
        for (const round of spin(m, random, (i % 3) + 1)) {
          rounds++;
          expect(round.payout).toBe(round.lines);
          expect(round.bet).toBeGreaterThanOrEqual(0);
          expect(round.bet).toBeLessThanOrEqual(3);
          expect(round.payout).toBeLessThanOrEqual(SLOT_MAX_PAYOUT);
        }
      }
      expect(rounds).toBeGreaterThanOrEqual(150);
    }
  });

  it("keeps its own coin count as the API settles it: the bet taken, the payout added (a Replay's spin free), at most 9999", () => {
    const random = random16(77);
    const m = newSlotMachine(5, MAX_COINS - 20, random);
    let coins = m.coins;
    for (let i = 0; i < 200; i++) {
      for (const round of spin(m, random, 3)) coins = afterRound(coins, round.bet, round.payout);
      expect(m.coins).toBe(coins);
      expect(m.coins).toBeGreaterThanOrEqual(0);
      expect(m.coins).toBeLessThanOrEqual(MAX_COINS);
    }
  });

  it('plays the same with the same Random()', () => {
    const play = () => {
      const random = random16(4242);
      const m = newSlotMachine(4, 500, random);
      return Array.from({ length: 60 }, () => spin(m, random, 3)).flat().map((r) => [r.bet, r.payout]);
    };
    expect(play()).toEqual(play());
  });

  it('ends the game when the coins run out, and quits on B and YES with the bet given back', () => {
    const random = random16(9);
    const m = newSlotMachine(0, 2, random);
    for (let i = 0; i < 400 && !m.exited; i++) spin(m, random, 1);
    expect(m.coins).toBe(0);
    expect(m.exited).toBe(true);

    const q = newSlotMachine(0, 10, random);
    untilBet(q, random);
    slotFrame(q, { pressed: SLOT_KEYS.down, held: 0 }, random);
    expect(q.coins).toBe(9);
    slotFrame(q, { pressed: SLOT_KEYS.b, held: 0 }, random);
    slotFrame(q, { pressed: 0, held: 0 }, random);
    expect(q.message).toBe('quit');
    slotFrame(q, { pressed: SLOT_KEYS.a, held: 0 }, random);
    expect(q.coins).toBe(10);
    let events: SlotEvent[] = [];
    for (let i = 0; i < 60 && !q.exited; i++) events = slotFrame(q, { pressed: 0, held: 0 }, random);
    expect(events).toContainEqual({ exit: true });
  });

  it('pays back more on the luckier machines, over many spins', () => {
    const returnOf = (machine: SlotMachineId) => {
      let bet = 0;
      let paid = 0;
      for (let seed = 0; seed < 4; seed++) {
        const random = random16(seed * 31 + 7);
        const m = newSlotMachine(machine, 5000, random);
        for (let i = 0; i < 400; i++) {
          for (const round of spin(m, random, 3)) {
            bet += round.bet;
            paid += round.payout;
          }
        }
      }
      return paid / bet;
    };
    expect(returnOf(5)).toBeGreaterThan(returnOf(0));
  });
});
