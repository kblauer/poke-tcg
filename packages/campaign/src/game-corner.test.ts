import { describe, expect, it } from 'vitest';
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
});
