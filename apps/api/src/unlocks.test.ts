import { describe, expect, it } from 'vitest';
import { lockedNames, lockedProblem } from './unlocks.js';

const pokemon = (name: string) => ({ name, kind: 'POKEMON' as const, data: {} });
const energy = { name: 'Fire Energy', kind: 'ENERGY' as const, data: { energyType: 'Normal' } };
const holoEnergy = { name: 'Fire Energy', kind: 'ENERGY' as const, data: { energyType: 'Normal', holoEnergy: { rarity: 'rare holo cosmos', label: 'Cosmos' } } };

describe('locked cards in a deck', () => {
  it('lockedNames: cards not unlocked, by name once; basic Energy never, holo Energy yes', () => {
    const cards = [
      { cardId: 'base1-4', card: pokemon('Charizard') },
      { cardId: 'base1-4', card: pokemon('Charizard') },
      { cardId: 'base1-46', card: pokemon('Charmander') },
      { cardId: 'base1-98', card: energy },
      { cardId: 'base1-98-holo-cosmos', card: holoEnergy },
    ];
    expect(lockedNames(cards, new Map([['base1-46', 1]]))).toEqual(['Charizard', 'Fire Energy (Cosmos holo)']);
    expect(lockedNames(cards, new Map([['base1-4', 1], ['base1-46', 1], ['base1-98-holo-cosmos', 1]]))).toEqual([]);
  });

  it('lockedProblem names the first three locked cards and counts the rest', () => {
    const cards = ['Charizard', 'Blastoise', 'Venusaur', 'Alakazam', 'Chansey'].map((name, i) => ({ cardId: `c${i}`, quantity: 1, card: pokemon(name) }));
    expect(lockedProblem(cards, new Map(), { has: () => false })).toBe('Not unlocked yet: Charizard, Blastoise, Venusaur and 2 more. Win cards in runs to unlock them.');
    expect(lockedProblem(cards.slice(0, 1), new Map(), { has: () => false })).toBe('Not unlocked yet: Charizard. Win cards in runs to unlock them.');
  });

  it("lockedProblem: more copies of a special holo or a holo Energy than were pulled; none otherwise", () => {
    const unlocked = new Map([['base2-1', 1], ['base1-98-holo-cosmos', 2], ['base1-4', 1]]);
    const twins = { has: (id: string) => id === 'base2-1' };
    expect(lockedProblem([{ cardId: 'base2-1', quantity: 2, card: pokemon('Clefable') }], unlocked, twins)).toBe("Clefable (holo): 2 in the deck, but you've pulled 1");
    expect(lockedProblem([{ cardId: 'base1-98-holo-cosmos', quantity: 3, card: holoEnergy }], unlocked, twins)).toBe("Fire Energy (Cosmos holo): 3 in the deck, but you've pulled 2");
    expect(lockedProblem([{ cardId: 'base2-1', quantity: 1, card: pokemon('Clefable') }, { cardId: 'base1-98-holo-cosmos', quantity: 2, card: holoEnergy }, { cardId: 'base1-4', quantity: 4, card: pokemon('Charizard') }], unlocked, twins)).toBeNull();
    // An ordinary unlock has no copy limit.
    expect(lockedProblem([{ cardId: 'base1-4', quantity: 4, card: pokemon('Charizard') }], unlocked, twins)).toBeNull();
  });
});
