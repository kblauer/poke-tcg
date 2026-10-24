import { describe, expect, it } from 'vitest';
import { decodeDeck, encodeDeck, plainCards, plainVersion, withOwnHolos, type DeckList } from './deck-codes.js';

const deck: DeckList = { name: 'Haymaker', cards: [{ cardId: 'base1-20', quantity: 4 }, { cardId: 'base1-98', quantity: 20 }] };
/** Jungle's holo Clefable and its plain twin, Base Set's holo Alakazam (holo only: no twin). */
const twins = new Map([['base2-1', 'base2-17']]);

describe('deck share codes', () => {
  it('round-trip a deck, and ignore spaces and line breaks pasted into the code', () => {
    const code = encodeDeck(deck);
    expect(code.startsWith('PTCG1.')).toBe(true);
    expect(decodeDeck(code)).toEqual(deck);
    expect(decodeDeck(`${code.slice(0, 10)} \n${code.slice(10)}`)).toEqual(deck);
  });

  it('reject anything that isn’t a code: the wrong prefix, garbage, or a payload of the wrong shape', () => {
    expect(decodeDeck('PTCG2.abc')).toBeNull();
    expect(decodeDeck('PTCG1.!!!not base64')).toBeNull();
    expect(decodeDeck('hello')).toBeNull();
    // Valid base64 of valid JSON, but not a deck.
    expect(decodeDeck(`PTCG1.${Buffer.from('{"x":1}').toString('base64url')}`)).toBeNull();
  });

  it('cut a long name to the deck name length and trim it', () => {
    const long = encodeDeck({ name: `  ${'x'.repeat(180)}  `, cards: [] });
    const name = decodeDeck(long)!.name;
    expect(name.length).toBeLessThan(180);
    expect(name).toBe(name.trim());
    // Past the payload's own limit, it isn't a code at all.
    expect(decodeDeck(encodeDeck({ name: 'x'.repeat(201), cards: [] }))).toBeNull();
  });
});

describe('holos in codes and imports', () => {
  it("a card's plain version: a special holo's twin, a holo Energy's basic Energy, or itself", () => {
    expect(plainVersion('base2-1', twins)).toBe('base2-17');
    expect(plainVersion('base1-98-holo-cosmos', twins)).toBe('base1-98');
    expect(plainVersion('base1-4', twins)).toBe('base1-4');
  });

  it('plainCards merges holos into their plain version’s entry', () => {
    expect(plainCards([{ cardId: 'base2-1', quantity: 2 }, { cardId: 'base2-17', quantity: 1 }, { cardId: 'base1-98-holo-cosmos', quantity: 3 }, { cardId: 'base1-98', quantity: 1 }], twins)).toEqual([
      { cardId: 'base2-17', quantity: 3 },
      { cardId: 'base1-98', quantity: 4 },
    ]);
  });

  it("withOwnHolos puts back as many of the importer's holos as they have, the most pulled first, the rest plain", () => {
    const unlocked = new Map([['base2-1', 1], ['base1-98-holo-cosmos', 2], ['base1-98-holo-galaxy', 5]]);
    expect(withOwnHolos([{ cardId: 'base2-17', quantity: 3 }, { cardId: 'base1-98', quantity: 4 }], unlocked, twins)).toEqual([
      { cardId: 'base2-1', quantity: 1 },
      { cardId: 'base2-17', quantity: 2 },
      { cardId: 'base1-98-holo-galaxy', quantity: 4 },
    ]);
    // Nothing unlocked: all plain.
    expect(withOwnHolos([{ cardId: 'base2-1', quantity: 2 }], new Map(), twins)).toEqual([{ cardId: 'base2-17', quantity: 2 }]);
  });
});
