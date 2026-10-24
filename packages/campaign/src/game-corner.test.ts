import { describe, expect, it } from 'vitest';
import { GAME_CORNER_MAP } from './game-corner-map.js';
import { routePath, type Route } from './routes.js';
import { afterRound, buyCoinsError, COIN_OFFERS, coinRoundError, MAX_COINS, SLOT_MACHINES, slotMachineId } from './game-corner.js';

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
    expect(coinRoundError('slots', 0, 15)).toBeNull();
    expect(coinRoundError('slots', 4, 0)).not.toBeNull();
    expect(coinRoundError('slots', 3, 1501)).not.toBeNull();
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
