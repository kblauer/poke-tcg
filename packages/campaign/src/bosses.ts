// The boss fights: Kanto's gym leaders, the Elite Four and the Champion, each with the deck its Pokémon
// Trading Card Game (Game Boy Color, "TCG 1") counterpart plays, named for the Generation I character:
// https://bulbapedia.bulbagarden.net/wiki/Club_Master and https://bulbapedia.bulbagarden.net/wiki/Grand_Master.
// Cards that only exist in the Game Boy game (its promos and Japanese-only prints) are replaced by the
// closest card of the same type in the catalog; each substitution is commented.
import type { EnergyType } from '@poke-tcg/game-engine';
import type { DeckList } from './decks.js';

export type BossKind = 'gymLeader' | 'eliteFour' | 'champion';

export interface Boss {
  name: string;
  title: string;
  kind: BossKind;
  /** The TCG 1 deck it plays, and that game's character who plays it. */
  deckName: string;
  counterpart: string;
  deck: DeckList;
  /** Gym leaders: their gym's type, for the Gym Trainer's deck before them; and the badge for beating them (a key item). */
  gym?: { city: string; type: EnergyType; badge: string };
  /** The key item for beating them, other than a badge (the Champion's). */
  prize?: string;
}

/** Brock: Gene's Rock Crusher Deck (Rock Club). */
const ROCK_CRUSHER_DECK: DeckList = [
  ['base1-47', 4], // Diglett
  ['base1-19', 2], // Dugtrio
  ['base3-47', 4], // Geodude
  ['base3-37', 3], // Graveler
  ['base3-36', 2], // Golem
  ['base1-56', 3], // Onix
  ['base2-61', 3], // Rhyhorn
  ['base1-88', 2], // Professor Oak
  ['base1-76', 1], // Pokémon Breeder
  ['base1-92', 2], // Energy Removal
  ['base1-95', 2], // Switch
  ['base1-71', 1], // Computer Search
  ['base1-80', 2], // Defender
  ['base1-90', 1], // Super Potion
  ['base1-94', 2], // Potion
  ['base1-96', 2], // Double Colorless Energy
  ['base1-97', 24], // Fighting Energy
];

/** Misty: Amy's Rain Dancer Deck (Water Club). Bulbapedia lists 24 Water Energy (61 cards); 23 make it 60. */
const RAIN_DANCER_DECK: DeckList = [
  ['base1-63', 4], // Squirtle
  ['base1-42', 3], // Wartortle
  ['base1-2', 2], // Blastoise
  ['base2-53', 4], // Goldeen
  ['base2-46', 3], // Seaking
  ['base3-49', 3], // Horsea
  ['base3-42', 2], // Seadra
  ['base3-10', 2], // Lapras
  ['base1-88', 2], // Professor Oak
  ['base1-76', 1], // Pokémon Breeder
  ['base1-81', 2], // Energy Retrieval
  ['neo1-89', 1], // Super Energy Retrieval (Neo Genesis, for the Japanese Fan Book promo)
  ['base1-92', 2], // Energy Removal
  ['base1-79', 1], // Super Energy Removal
  ['base1-95', 2], // Switch
  ['base1-94', 2], // Potion
  ['base3-60', 1], // Gambler
  ['base1-102', 23], // Water Energy
];

/** Lt. Surge: Isaac's Zapping Selfdestruct Deck (Lightning Club). */
const ZAPPING_SELFDESTRUCT_DECK: DeckList = [
  ['base1-53', 4], // Magnemite
  ['base1-9', 3], // Magneton
  ['base1-67', 4], // Voltorb
  ['base1-21', 2], // Electrode (Base Set, for the Japanese-only Pokémon Web Electrode)
  ['base1-20', 4], // Electabuzz
  ['base2-5', 2], // Kangaskhan
  ['base2-47', 1], // Tauros
  ['base1-88', 1], // Professor Oak
  ['base1-91', 2], // Bill
  ['base1-95', 2], // Switch
  ['base1-80', 4], // Defender
  ['base1-93', 1], // Gust of Wind
  ['base1-94', 4], // Potion
  ['base1-96', 2], // Double Colorless Energy
  ['base1-100', 24], // Lightning Energy
];

/** Erika: Nikki's Flower Power Deck (Grass Club). */
export const FLOWER_POWER_DECK: DeckList = [
  ['base1-44', 4], // Bulbasaur
  ['base1-30', 3], // Ivysaur
  ['base1-15', 2], // Venusaur
  ['base2-58', 4], // Oddish
  ['base2-37', 3], // Gloom
  ['base2-15', 2], // Vileplume
  ['base2-52', 4], // Exeggcute
  ['base2-35', 3], // Exeggutor
  ['base1-88', 2], // Professor Oak
  ['base1-91', 3], // Bill
  ['base1-76', 2], // Pokémon Breeder
  ['base1-81', 2], // Energy Retrieval
  ['base1-95', 2], // Switch
  ['base1-94', 2], // Potion
  ['base1-99', 18], // Grass Energy
  ['base1-101', 4], // Psychic Energy
];

/** Koga: Rick's Wonders of Science Deck (Science Club; poison). */
const WONDERS_OF_SCIENCE_DECK: DeckList = [
  ['base3-48', 4], // Grimer
  ['base3-13', 3], // Muk
  ['base1-51', 4], // Koffing
  ['base3-45', 3], // Weezing
  ['base1-10', 2], // Mewtwo
  ['basep-3', 2], // Mewtwo (Wizards Promo 3)
  ['base1-39', 2], // Porygon
  ['base1-73', 1], // Impostor Professor Oak
  ['base1-88', 2], // Professor Oak
  ['base1-91', 2], // Bill
  ['base3-59', 2], // Energy Search
  ['base1-95', 2], // Switch
  ['base1-71', 2], // Computer Search
  ['base1-87', 2], // Pokédex
  ['base1-83', 2], // Maintenance
  ['base1-82', 2], // Full Heal
  ['base1-99', 15], // Grass Energy
  ['base1-101', 8], // Psychic Energy
];

/** Sabrina: Murray's Strange Psyshock Deck (Psychic Club). */
const STRANGE_PSYSHOCK_DECK: DeckList = [
  ['base1-43', 4], // Abra
  ['base1-32', 3], // Kadabra
  ['base1-1', 2], // Alakazam
  ['base2-6', 2], // Mr. Mime
  ['base1-3', 3], // Chansey
  ['base2-5', 3], // Kangaskhan
  ['base2-11', 2], // Snorlax
  ['base1-88', 2], // Professor Oak
  ['base1-85', 2], // Pokémon Center
  ['base1-92', 3], // Energy Removal
  ['base1-93', 3], // Gust of Wind
  ['base1-78', 4], // Scoop Up
  ['base1-95', 4], // Switch
  ['base3-60', 1], // Gambler
  ['base1-101', 22], // Psychic Energy
];

/** Blaine: Ken's Fire Charge Deck (Fire Club). */
const FIRE_CHARGE_DECK: DeckList = [
  ['base1-28', 4], // Growlithe
  ['base1-23', 3], // Arcanine
  ['base1-36', 2], // Magmar
  ['basep-7', 3], // Jigglypuff (Wizards Promo 7)
  ['base2-54', 1], // Jigglypuff
  ['base2-16', 1], // Wigglytuff
  ['base1-3', 2], // Chansey
  ['base2-47', 2], // Tauros
  ['base1-88', 1], // Professor Oak
  ['base1-91', 2], // Bill
  ['base1-81', 2], // Energy Retrieval
  ['base2-64', 1], // Poké Ball
  ['base1-71', 1], // Computer Search
  ['base1-80', 2], // Defender
  ['base1-94', 3], // Potion
  ['base1-82', 1], // Full Heal
  ['base3-61', 3], // Recycle
  ['base3-60', 1], // Gambler
  ['base1-96', 4], // Double Colorless Energy
  ['base1-98', 21], // Fire Energy
];

/** Giovanni: Mitch's First-Strike Deck (Fighting Club). Bulbapedia lists 25 Fighting Energy (61 cards); 24 make it 60. */
const FIRST_STRIKE_DECK: DeckList = [
  ['base1-52', 4], // Machop
  ['base1-34', 3], // Machoke
  ['base1-8', 2], // Machamp
  ['base1-7', 4], // Hitmonchan
  ['base3-7', 3], // Hitmonlee
  ['base2-55', 4], // Mankey
  ['base2-43', 1], // Primeape
  ['base1-95', 2], // Switch
  ['base1-91', 4], // Bill
  ['base1-93', 3], // Gust of Wind
  ['base1-80', 2], // Defender
  ['base1-84', 2], // PlusPower
  ['base1-94', 2], // Potion
  ['base1-97', 24], // Fighting Energy
];

/** Lorelei: Grand Master Jack's Legendary Articuno Deck. */
const LEGENDARY_ARTICUNO_DECK: DeckList = [
  ['base1-41', 4], // Seel
  ['base1-25', 3], // Dewgong
  ['base3-10', 4], // Lapras
  ['base3-2', 4], // Articuno (Fossil; 2 of them stand in for the Game Boy promo Articuno)
  ['base1-3', 3], // Chansey
  ['base3-3', 2], // Ditto (Fossil, for the Game Boy "Laboratory" Ditto)
  ['base1-88', 2], // Professor Oak
  ['base1-77', 2], // Pokémon Trader
  ['base1-81', 3], // Energy Retrieval
  ['base1-95', 3], // Switch
  ['base1-78', 4], // Scoop Up
  ['base3-60', 1], // Gambler
  ['base1-102', 25], // Water Energy
];

/** Bruno: Grand Master Steve's Legendary Zapdos Deck. */
const LEGENDARY_ZAPDOS_DECK: DeckList = [
  ['base1-67', 4], // Voltorb
  ['base1-21', 3], // Electrode (Base Set, for the Japanese-only Pokémon Web Electrode)
  ['base1-20', 4], // Electabuzz
  ['base2-4', 2], // Jolteon
  ['base3-15', 1], // Zapdos (Fossil)
  ['base1-16', 3], // Zapdos (Base Set; 2 of them stand in for the Game Boy promo Zapdos)
  ['base2-51', 3], // Eevee
  ['base1-91', 4], // Bill
  ['base1-81', 2], // Energy Retrieval
  ['base1-95', 2], // Switch
  ['base1-84', 3], // PlusPower
  ['base1-94', 3], // Potion
  ['base3-60', 1], // Gambler
  ['base1-100', 25], // Lightning Energy
];

/** Agatha: Grand Master Courtney's Legendary Moltres Deck. */
const LEGENDARY_MOLTRES_DECK: DeckList = [
  ['base1-68', 4], // Vulpix
  ['base1-12', 3], // Ninetales (Base Set, for the Game Boy "Laboratory" Ninetales)
  ['base1-28', 4], // Growlithe
  ['base1-23', 2], // Arcanine
  ['base1-36', 2], // Magmar (Base Set)
  ['base3-39', 2], // Magmar (Fossil)
  ['base3-12', 4], // Moltres (Fossil; 2 of them stand in for the Game Boy promo Moltres)
  ['base1-91', 3], // Bill
  ['base1-75', 2], // Lass
  ['base1-77', 1], // Pokémon Trader
  ['base1-81', 1], // Energy Retrieval
  ['neo1-89', 1], // Super Energy Retrieval (Neo Genesis, for the Japanese Fan Book promo)
  ['base1-92', 2], // Energy Removal
  ['base1-95', 2], // Switch
  ['base1-94', 1], // Potion
  ['base1-90', 1], // Super Potion
  ['base1-98', 25], // Fire Energy
];

/** Lance: Grand Master Rod's Legendary Dragonite Deck. */
const LEGENDARY_DRAGONITE_DECK: DeckList = [
  ['base1-46', 3], // Charmander
  ['base1-24', 2], // Charmeleon
  ['base1-4', 2], // Charizard
  ['base1-35', 3], // Magikarp
  ['base1-6', 2], // Gyarados
  ['base3-10', 2], // Lapras
  ['base2-5', 2], // Kangaskhan
  ['base1-26', 4], // Dratini
  ['base1-18', 3], // Dragonair
  ['base3-4', 2], // Dragonite (Fossil, for the Game Boy promo Dragonite)
  ['base1-88', 2], // Professor Oak
  ['base1-77', 2], // Pokémon Trader
  ['base1-76', 2], // Pokémon Breeder
  ['base1-81', 1], // Energy Retrieval
  ['neo1-89', 1], // Super Energy Retrieval (Neo Genesis, for the Japanese Fan Book promo)
  ['base1-95', 2], // Switch
  ['base3-60', 1], // Gambler
  ['base1-96', 4], // Double Colorless Energy
  ['base1-102', 20], // Water Energy
];

/**
 * Blue: Ronald's Legendary Ronald Deck (https://bulbapedia.bulbagarden.net/wiki/Legendary_Ronald_Deck_(TCG)).
 * Its Game Boy-only cards are replaced by the closest catalog card of the same type, except the promo Articuno
 * and Zapdos: no Water or Lightning one can attack with this deck's Energy, so they're Moltres instead.
 */
const LEGENDARY_RONALD_DECK: DeckList = [
  ['base2-19', 1], // Flareon (Jungle, for the Game Boy "Mystery" Flareon)
  // Moltres (Fossil): 2 for the Game Boy promo Moltres, and 1 each for the promo Articuno and Zapdos, which
  // couldn't attack with this deck's Fire and Double Colorless Energy.
  ['base3-12', 4],
  ['base2-28', 1], // Vaporeon (Jungle, for the Game Boy "Mystery" Vaporeon)
  ['base2-20', 1], // Jolteon (Jungle, for the Game Boy "Mystery" Jolteon)
  ['base2-5', 2], // Kangaskhan
  ['base2-51', 4], // Eevee
  ['base1-26', 4], // Dratini
  ['base1-18', 3], // Dragonair
  ['base3-4', 2], // Dragonite (Fossil, for the Game Boy promo Dragonite)
  ['base1-88', 1], // Professor Oak
  ['base1-91', 3], // Bill
  ['base1-77', 1], // Pokémon Trader
  ['base1-76', 2], // Pokémon Breeder
  ['base1-92', 3], // Energy Removal
  ['base1-78', 3], // Scoop Up
  ['base3-60', 1], // Gambler
  ['base1-98', 20], // Fire Energy
  ['base1-96', 4], // Double Colorless Energy
];

export const BOSSES = {
  brock: { name: 'Brock', title: 'Pewter Gym Leader', kind: 'gymLeader', deckName: 'Rock Crusher', counterpart: 'Gene', deck: ROCK_CRUSHER_DECK, gym: { city: 'Pewter', type: 'fighting', badge: 'boulder-badge' } },
  misty: { name: 'Misty', title: 'Cerulean Gym Leader', kind: 'gymLeader', deckName: 'Rain Dancer', counterpart: 'Amy', deck: RAIN_DANCER_DECK, gym: { city: 'Cerulean', type: 'water', badge: 'cascade-badge' } },
  surge: { name: 'Lt. Surge', title: 'Vermilion Gym Leader', kind: 'gymLeader', deckName: 'Zapping Selfdestruct', counterpart: 'Isaac', deck: ZAPPING_SELFDESTRUCT_DECK, gym: { city: 'Vermilion', type: 'lightning', badge: 'thunder-badge' } },
  erika: { name: 'Erika', title: 'Celadon Gym Leader', kind: 'gymLeader', deckName: 'Flower Power', counterpart: 'Nikki', deck: FLOWER_POWER_DECK, gym: { city: 'Celadon', type: 'grass', badge: 'rainbow-badge' } },
  koga: { name: 'Koga', title: 'Fuchsia Gym Leader', kind: 'gymLeader', deckName: 'Wonders of Science', counterpart: 'Rick', deck: WONDERS_OF_SCIENCE_DECK, gym: { city: 'Fuchsia', type: 'grass', badge: 'soul-badge' } },
  sabrina: { name: 'Sabrina', title: 'Saffron Gym Leader', kind: 'gymLeader', deckName: 'Strange Psyshock', counterpart: 'Murray', deck: STRANGE_PSYSHOCK_DECK, gym: { city: 'Saffron', type: 'psychic', badge: 'marsh-badge' } },
  blaine: { name: 'Blaine', title: 'Cinnabar Gym Leader', kind: 'gymLeader', deckName: 'Fire Charge', counterpart: 'Ken', deck: FIRE_CHARGE_DECK, gym: { city: 'Cinnabar', type: 'fire', badge: 'volcano-badge' } },
  giovanni: { name: 'Giovanni', title: 'Viridian Gym Leader', kind: 'gymLeader', deckName: 'First-Strike', counterpart: 'Mitch', deck: FIRST_STRIKE_DECK, gym: { city: 'Viridian', type: 'fighting', badge: 'earth-badge' } },
  lorelei: { name: 'Lorelei', title: 'Elite Four', kind: 'eliteFour', deckName: 'Legendary Articuno', counterpart: 'Jack', deck: LEGENDARY_ARTICUNO_DECK },
  bruno: { name: 'Bruno', title: 'Elite Four', kind: 'eliteFour', deckName: 'Legendary Zapdos', counterpart: 'Steve', deck: LEGENDARY_ZAPDOS_DECK },
  agatha: { name: 'Agatha', title: 'Elite Four', kind: 'eliteFour', deckName: 'Legendary Moltres', counterpart: 'Courtney', deck: LEGENDARY_MOLTRES_DECK },
  lance: { name: 'Lance', title: 'Elite Four', kind: 'eliteFour', deckName: 'Legendary Dragonite', counterpart: 'Rod', deck: LEGENDARY_DRAGONITE_DECK },
  blue: { name: 'Blue', title: 'Champion', kind: 'champion', deckName: 'Legendary Ronald', counterpart: 'Ronald', deck: LEGENDARY_RONALD_DECK, prize: 'champion-ribbon' },
} satisfies Record<string, Boss>;

export type BossId = keyof typeof BOSSES;

/** Kanto's gyms in the order the games visit them. */
export const KANTO_GYMS: BossId[] = ['brock', 'misty', 'surge', 'erika', 'koga', 'sabrina', 'blaine', 'giovanni'];
export const ELITE_FOUR: BossId[] = ['lorelei', 'bruno', 'agatha', 'lance'];

export const boss = (id: string): Boss => {
  const b = (BOSSES as Record<string, Boss>)[id];
  if (!b) throw new Error(`Unknown boss: ${id}`);
  return b;
};

/** "Gym Leader Brock", "Elite Four Lorelei", "Champion Blue". */
export const bossLabel = (b: Boss) => `${b.kind === 'gymLeader' ? 'Gym Leader' : b.title} ${b.name}`;
