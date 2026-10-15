// Fixed decks for the test game until deck building and runs exist.
// Base Set only: each has two Basic → Stage 1 → Stage 2 lines (4-3-2) plus basic Energy. The
// player's deck also has one each of a spread of Trainers and a Double Colorless Energy to try them out.

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
  ['base1-98', 5], // Fire Energy
  ['base1-102', 5], // Water Energy
  ['base1-96', 1], // Double Colorless Energy
  // Trainers
  ['base1-91', 1], // Bill
  ['base1-88', 1], // Professor Oak
  ['base1-71', 1], // Computer Search
  ['base1-87', 1], // Pokédex
  ['base1-77', 1], // Pokémon Trader
  ['base1-76', 1], // Pokémon Breeder
  ['base1-84', 1], // PlusPower
  ['base1-80', 1], // Defender
  ['base1-94', 1], // Potion
  ['base1-90', 1], // Super Potion
  ['base1-95', 1], // Switch
  ['base1-93', 1], // Gust of Wind
  ['base1-92', 1], // Energy Removal
  ['base1-70', 1], // Clefairy Doll
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
