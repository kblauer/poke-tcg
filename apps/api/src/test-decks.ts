// Fixed decks for the test game until deck building and runs exist.
// Each has two Basic → Stage 1 → Stage 2 lines (4-3-2) plus 4 basic Energy per type.
// Card text is not implemented yet: attacks only deal their base damage.

/** [card id, copies] */
type DeckList = [string, number][];

export const PLAYER_TEST_DECK: DeckList = [
  // Fighting: Machop → Machoke → Machamp
  ['base1-52', 4],
  ['ecard1-85', 3],
  ['base1-8', 2],
  // Grass: Hoppip → Skiploom → Jumpluff
  ['neo2-55', 4],
  ['neo3-52', 3],
  ['neo3-9', 2],
  ['base1-97', 4], // Fighting Energy
  ['base1-99', 4], // Grass Energy
];

export const CPU_TEST_DECK: DeckList = [
  // Fire: Cyndaquil → Quilava → Typhlosion
  ['ecard1-105', 4],
  ['ecard1-91', 3],
  ['ecard1-64', 2],
  // Water: Totodile → Croconaw → Feraligatr
  ['ecard1-134', 4],
  ['ecard1-74', 3],
  ['ecard1-46', 2],
  ['base1-98', 4], // Fire Energy
  ['base1-102', 4], // Water Energy
];

/** Expands a deck list into one card id per card. */
export const expandDeck = (list: DeckList) => list.flatMap(([id, copies]) => Array<string>(copies).fill(id));
