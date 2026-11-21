// Premade decks (the user's, 2026-11-20; README: Community Decks): well-known decks of each era, listed on the Community
// Decks tab apart from the decks players publish, to look through and import like theirs. Up to 10 a generation, from
// jklaczpokemon.com's deck pages (Base/Fossil; Base to Neo; EX; DPP and HGSS; Black & White), their cards mapped to the
// catalog (a card it hasn't swapped for the closest one it has: `notes`).
import type { DeckList } from './decks.js';
import { PREMADE_GEN1, PREMADE_GEN2, PREMADE_GEN3, PREMADE_GEN4, PREMADE_GEN5 } from './premade-decks-data.js';

/** A premade deck: the generation of its cards, its name, a line on how it plays, its tile's card, its page and its list. */
export interface PremadeDeck {
  id: string;
  gen: number;
  name: string;
  text: string;
  cover: string;
  /** The deck list's page. */
  source: string;
  /** Cards swapped for the closest ones the catalog has, if any. */
  notes?: string;
  list: DeckList;
}

/** Every premade deck, by generation, then as listed. */
export const PREMADE_DECKS: readonly PremadeDeck[] = [...PREMADE_GEN1, ...PREMADE_GEN2, ...PREMADE_GEN3, ...PREMADE_GEN4, ...PREMADE_GEN5];

/** A premade deck by its id, or undefined. */
export const premadeDeck = (id: string): PremadeDeck | undefined => PREMADE_DECKS.find((d) => d.id === id);
