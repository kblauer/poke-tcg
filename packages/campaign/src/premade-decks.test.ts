import { cardImplemented } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { deckErrors, expandDeck } from './decks.js';
import { GEN2_SETS, GEN3_SETS, GEN4_SETS, GEN5_SETS, POOL_SETS } from './pool.js';
import { PREMADE_DECKS, premadeDeck } from './premade-decks.js';
import { catalogDef } from './test-pool.js';

/** Each generation's sets, Gen 1 first. */
const GEN_SETS = [POOL_SETS, GEN2_SETS, GEN3_SETS, GEN4_SETS, GEN5_SETS];
const setOf = (id: string) => id.replace(/-reverse$/, '').replace(/-[^-]+$/, '');

describe('premade decks', () => {
  it('are up to 10 a generation, Gen 1 to 5, each id once', () => {
    for (let gen = 1; gen <= 5; gen++) {
      const n = PREMADE_DECKS.filter((d) => d.gen === gen).length;
      expect(n, `Gen ${gen}`).toBeGreaterThan(0);
      expect(n, `Gen ${gen}`).toBeLessThanOrEqual(10);
    }
    expect(new Set(PREMADE_DECKS.map((d) => d.id)).size).toBe(PREMADE_DECKS.length);
    expect(premadeDeck(PREMADE_DECKS[0]!.id)).toBe(PREMADE_DECKS[0]);
    expect(premadeDeck('nope')).toBeUndefined();
  });

  it('are playable decks: 60 cards by the deck rules, every card implemented and from their generation or earlier', () => {
    for (const d of PREMADE_DECKS) {
      const sets = GEN_SETS.slice(0, d.gen).flat();
      for (const [id] of d.list) {
        expect(sets, `${d.name}: ${id}`).toContain(setOf(id));
        expect(cardImplemented(catalogDef(id)), `${d.name}: ${id}`).toBe(true);
      }
      expect(deckErrors(expandDeck(d.list), catalogDef), d.name).toEqual([]);
      expect(d.list.some(([id]) => id === d.cover), `${d.name}'s cover`).toBe(true);
    }
  });
});
