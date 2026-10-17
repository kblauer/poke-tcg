import { canPayCost, cardImplemented, isBasicPokemon, isPokemonCard, type PokemonCardDef } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { BOSSES } from './bosses.js';
import { deckErrors, expandDeck, generateDeck, STARTER_DECK } from './decks.js';
import { rngFrom } from './random.js';
import { catalogDef, TEST_POOL, testDef } from './test-pool.js';

describe('fixed decks', () => {
  it('the starter deck is a legal 60-card deck of cards from the run pool', () => {
    expect(deckErrors(expandDeck(STARTER_DECK), testDef)).toEqual([]);
  });

  it.each(Object.entries(BOSSES))("%s's deck is a legal 60-card deck of catalog cards the engine fully implements", (_, b) => {
    const deck = expandDeck(b.deck);
    expect(deckErrors(deck, catalogDef)).toEqual([]);
    expect(deck.filter((id) => !cardImplemented(catalogDef(id)))).toEqual([]);
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

  it("with a type (a Gym Trainer's gym), most of the Energy is that type", () => {
    for (const type of ['fighting', 'water', 'lightning', 'grass', 'psychic', 'fire'] as const) {
      for (let seed = 0; seed < 20; seed++) {
        const deck = generateDeck(TEST_POOL, rngFrom(seed), { type }).map(testDef);
        expect(deckErrors(deck.map((d) => d.id), testDef)).toEqual([]);
        const energy = deck.filter((d) => d.kind === 'energy' && d.basic !== false);
        expect(energy.filter((d) => d.kind === 'energy' && d.energyType === type).length, `${type} seed ${seed}`).toBeGreaterThanOrEqual(energy.length / 2);
      }
    }
  });

  it('is the same deck for the same seed', () => {
    expect(generateDeck(TEST_POOL, rngFrom(42))).toEqual(generateDeck(TEST_POOL, rngFrom(42)));
  });
});
