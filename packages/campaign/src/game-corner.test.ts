import { describe, expect, it } from 'vitest';
import { GAME_CORNER_MAP } from './game-corner-map.js';
import { routePath, type Route } from './routes.js';
import { afterRound, buyCoinsError, COIN_OFFERS, coinRoundError, MAX_COINS, SLOT_MACHINES, slotMachineId, slotPayouts } from './game-corner.js';

describe('the Game Corner', () => {
  it('sells coins only while the Coin Case has room and the bank has the ₱', () => {
    const [fifty, fiveHundred] = COIN_OFFERS;
    expect(buyCoinsError(0, 1000, fifty)).toBeNull();
    expect(buyCoinsError(MAX_COINS - 50, 1000, fifty)).toBeNull();
    expect(buyCoinsError(MAX_COINS - 49, 1000, fifty)).toMatch(/full/);
    expect(buyCoinsError(0, 9999, fiveHundred)).toMatch(/money/);
  });

  it('takes the tables’ bets and pays their multiples only', () => {
    expect(coinRoundError('roulette', 1, 0)).toBeNull();
    expect(coinRoundError('roulette', 3, 36)).toBeNull();
    expect(coinRoundError('roulette', 2, 0)).not.toBeNull();
    expect(coinRoundError('roulette', 1, 5)).not.toBeNull();
    expect(coinRoundError('slots', 0, 12)).toBeNull();
    expect(coinRoundError('slots', 4, 0)).not.toBeNull();
    expect(coinRoundError('slots', 3, 1501)).not.toBeNull();
  });

  it("pays a spin only what its lines can at some stop of the reels", () => {
    // One coin lights the middle row: a cherry 2, Power 3, Lotad 6, Azurill 12, mixed 7s 90, three 7s 300, or nothing.
    expect([...slotPayouts(1)].sort((a, b) => a - b)).toEqual([0, 2, 3, 6, 12, 90, 300]);
    for (const bet of [1, 2, 3]) {
      for (const payout of slotPayouts(bet)) expect(coinRoundError('slots', bet, payout)).toBeNull();
      // A free spin (a Replay's) is played on the lines of the spin before it, which the round doesn't say: any bet's.
      for (const payout of slotPayouts(bet)) expect(coinRoundError('slots', 0, payout)).toBeNull();
      expect(coinRoundError('slots', bet, Math.max(...slotPayouts(bet)) + 1)).not.toBeNull();
    }
    expect(Math.max(...slotPayouts(1))).toBeLessThanOrEqual(Math.max(...slotPayouts(2)));
    expect(Math.max(...slotPayouts(2))).toBeLessThanOrEqual(Math.max(...slotPayouts(3)));
    // No stop of the reels shows 7s on every line: the most is far under 5 lines of 300.
    expect(Math.max(...slotPayouts(0))).toBe(Math.max(...slotPayouts(3)));
    expect(Math.max(...slotPayouts(3))).toBeLessThan(2 * 300);
    expect(coinRoundError('slots', 3, 1500)).not.toBeNull();
    expect(coinRoundError('slots', 0, 1500)).not.toBeNull();
    expect(coinRoundError('slots', 1, 4)).not.toBeNull();
    expect(coinRoundError('slots', 1, 301)).not.toBeNull();
  });

  it('keeps the coins within the Coin Case', () => {
    expect(afterRound(10, 3, 0)).toBe(7);
    expect(afterRound(MAX_COINS - 1, 1, 300)).toBe(MAX_COINS);
  });

  it('gives each day its machines the game’s mix of luck', () => {
    for (const day of [0, 1, 20000, 20385]) {
      const ids = Array.from({ length: SLOT_MACHINES }, (_, m) => slotMachineId(m, day)).sort();
      expect(ids).toEqual([0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
    }
  });

  it('lets the player walk from the door to every machine, table and person', () => {
    const corner: Route = { name: 'Game Corner', flow: 'up', image: GAME_CORNER_MAP.image, width: GAME_CORNER_MAP.width * 16, height: GAME_CORNER_MAP.height * 16, spots: [], walkable: GAME_CORNER_MAP.walkable, sprites: 'rse' };
    const from = GAME_CORNER_MAP.entrance;
    const reachable = (to: { x: number; y: number }) => (to.x === from.x && to.y === from.y) || routePath(corner, from, to) !== null;
    expect(GAME_CORNER_MAP.machines).toHaveLength(SLOT_MACHINES);
    for (const m of GAME_CORNER_MAP.machines) expect(reachable(m.seat)).toBe(true);
    expect(GAME_CORNER_MAP.tables).toHaveLength(2);
    for (const t of GAME_CORNER_MAP.tables) expect(t.stands.some(reachable)).toBe(true);
    for (const p of GAME_CORNER_MAP.people) expect(p.stands.some(reachable)).toBe(true);
    expect(GAME_CORNER_MAP.people.filter((p) => p.role === 'coins')).toHaveLength(1);
  });
});
