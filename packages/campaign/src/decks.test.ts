import { canPayCost, isBasicPokemon, isPokemonCard, type PokemonCardDef } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { deckErrors, expandDeck, FLOWER_POWER_DECK, generateDeck, STARTER_DECK } from './decks.js';
import { rngFrom } from './random.js';
import { TEST_POOL, testDef } from './test-pool.js';

describe('fixed decks', () => {
  it('the starter deck and the Flower Power deck are legal 60-card decks of implemented cards', () => {
    for (const list of [STARTER_DECK, FLOWER_POWER_DECK]) expect(deckErrors(expandDeck(list), testDef)).toEqual([]);
  });
});

describe('generateDeck', () => {
  const decks = Array.from({ length: 200 }, (_, seed) => generateDeck(TEST_POOL, rngFrom(seed)));

  it('builds legal 60-card decks with at least 8 Basic Pokémon', () => {
    for (const deck of decks) {
      expect(deckErrors(deck, testDef)).toEqual([]);
      expect(deck.filter((id) => isBasicPokemon(testDef(id))).length).toBeGreaterThanOrEqual(8);
    }
  });

  it('has 16–24 Pokémon, 12–16 Trainers and 20–28 Energy', () => {
    for (const deck of decks) {
      const defs = deck.map(testDef);
      const pokemon = defs.filter(isPokemonCard).length;
      const energy = defs.filter((d) => d.kind === 'energy').length;
      expect(pokemon).toBeGreaterThanOrEqual(16);
      expect(pokemon).toBeLessThanOrEqual(24);
      expect(60 - pokemon - energy).toBeGreaterThanOrEqual(12);
      expect(60 - pokemon - energy).toBeLessThanOrEqual(16);
      expect(energy).toBeGreaterThanOrEqual(20);
      expect(energy).toBeLessThanOrEqual(28);
    }
  });

  it("every Pokémon's attacks can be paid for with the deck's Energy", () => {
    for (const deck of decks) {
      const energy = deck.filter((id) => testDef(id).kind === 'energy').map((id, n) => ({ uid: `e${n}`, defId: id }));
      const cards = Object.fromEntries(deck.map((id) => [id, testDef(id)]));
      for (const d of new Set(deck.map(testDef).filter(isPokemonCard))) {
        const p = { card: { uid: 'p', defId: d.id }, evolvedFrom: [], damage: 0, energy, playedTurn: 0 };
        for (const a of (d as PokemonCardDef).attacks) expect(canPayCost(p, a, cards), `${d.name}: ${a.name}`).toBe(true);
      }
    }
  });

  it('is the same deck for the same seed', () => {
    expect(generateDeck(TEST_POOL, rngFrom(42))).toEqual(generateDeck(TEST_POOL, rngFrom(42)));
  });
});
