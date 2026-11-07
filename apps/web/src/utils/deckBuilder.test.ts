import { describe, expect, it } from 'vitest';
import type { CatalogCard } from './cardList';
import { missingCrafts, rarityUp } from './deckBuilder';

// A plain print, its special holo and its reverse holo, and a card with no other versions.
const card = (id: string, extra: Partial<CatalogCard> = {}) => ({ id, name: 'Pikachu', setId: 'ex1', holo: false, reverseHolo: false, limitedCopies: false, twinOf: null, craftCost: 100, basicEnergy: false, holoEnergy: null, ...extra }) as CatalogCard;
const plain = card('p');
const holo = card('h', { holo: true, limitedCopies: true, twinOf: 'p', craftCost: 500 });
const reverse = card('r', { holo: true, reverseHolo: true, limitedCopies: true, twinOf: 'p', craftCost: 500 });
const other = card('o', { name: 'Raichu' });
const byId = new Map([plain, holo, reverse, other].map((c) => [c.id, c]));
const versions = new Map([['p', ['h', 'r']]]);

describe('Rarity up', () => {
  it('fills the holos gained first, then the reverse holos, then the plain print', () => {
    const pulled = (id: string) => ({ h: 1, r: 2 })[id] ?? 0;
    const out = rarityUp([{ cardId: 'p', quantity: 4 }, { cardId: 'o', quantity: 2 }], byId, versions, () => false, pulled);
    expect(out).toEqual([{ cardId: 'h', quantity: 1 }, { cardId: 'r', quantity: 2 }, { cardId: 'p', quantity: 1 }, { cardId: 'o', quantity: 2 }]);
  });

  it('keeps versions not gained as they were, and changes nothing with none gained', () => {
    const deck = [{ cardId: 'h', quantity: 2 }, { cardId: 'p', quantity: 2 }];
    expect(rarityUp(deck, byId, versions, (c) => c.id === 'p', () => 0)).toEqual(deck);
    expect(rarityUp(deck, byId, versions, () => false, (id) => (id === 'h' ? 3 : 0))).toEqual([{ cardId: 'h', quantity: 3 }, { cardId: 'p', quantity: 1 }]);
  });
});

describe('Craft all', () => {
  it("counts a special holo's missing copies and a locked card once, not the plain print a holo unlocks", () => {
    const deck = [{ cardId: 'h', quantity: 3 }, { cardId: 'p', quantity: 1 }, { cardId: 'o', quantity: 2 }];
    const locked = (c: CatalogCard) => c.id !== 'h';
    expect(missingCrafts(deck, byId, locked, (id) => (id === 'h' ? 1 : 0), () => true)).toEqual({ cards: 3, cost: 1100 });
    expect(missingCrafts(deck, byId, locked, () => 0, (c) => c.id !== 'o')).toEqual({ cards: 3, cost: 1500 });
  });
});
