// Fixed decks for the test game until deck building and runs exist.
// Base Set only: each has two Basic → Stage 1 → Stage 2 lines (4-3-2) plus 6 basic Energy per type.
// Card text is not implemented yet: attacks only deal their base damage.

/** [card id, copies] */
type DeckList = [string, number][];

export const PLAYER_TEST_DECK: DeckList = [
  // Fire: Charmander → Charmeleon → Charizard
  ['base1-46', 4],
  ['base1-24', 3],
  ['base1-4', 2],
  // Water: Squirtle → Wartortle → Blastoise
  ['base1-63', 4],
  ['base1-42', 3],
  ['base1-2', 2],
  ['base1-98', 6], // Fire Energy
  ['base1-102', 6], // Water Energy
];

export const CPU_TEST_DECK: DeckList = [
  // Fighting: Machop → Machoke → Machamp
  ['base1-52', 4],
  ['base1-34', 3],
  ['base1-8', 2],
  // Grass: Bulbasaur → Ivysaur → Venusaur
  ['base1-44', 4],
  ['base1-30', 3],
  ['base1-15', 2],
  ['base1-97', 6], // Fighting Energy
  ['base1-99', 6], // Grass Energy
];

/** Expands a deck list into one card id per card. */
export const expandDeck = (list: DeckList) => list.flatMap(([id, copies]) => Array<string>(copies).fill(id));
