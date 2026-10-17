// Fixed decks for practice battles: the player's test deck, and the CPU's deck (Brock's Rock Crusher deck).
// The player's test deck is Base Set only: two Basic → Stage 1 → Stage 2 lines (4-3-2) plus basic
// Energy, and one each of a spread of Trainers and a Double Colorless Energy to try them out.

import { BOSSES, type DeckList } from '@poke-tcg/campaign';

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

/** The CPU's deck in practice battles: Brock's, the Rock Crusher theme deck from the Game Boy Color game (60 cards, all Fighting). */
export const CPU_DECK: DeckList = BOSSES.brock.deck;

/** Expands a deck list into one card id per card. */
export const expandDeck = (list: DeckList) => list.flatMap(([id, copies]) => Array<string>(copies).fill(id));
