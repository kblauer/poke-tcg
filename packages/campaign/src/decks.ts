// Deck lists: the starter deck, gym leaders' decks, and random medium-strength decks for the other trainers.
import { isBasicPokemon, isPokemonCard, type CardDef, type EnergyType, type PokemonCardDef } from '@poke-tcg/game-engine';
import { BASIC_ENERGY, byId, DOUBLE_COLORLESS, GEN2_BASIC_ENERGY, GEN3_BASIC_ENERGY, nameKey, type PoolCard } from './pool.js';
import { between, chance, pick, sample, type Rng } from './random.js';

/** [card id, copies] */
export type DeckList = [string, number][];

export const DECK_SIZE = 60;

/** Expands a deck list into one card id per card. */
export const expandDeck = (list: DeckList) => list.flatMap(([id, copies]) => Array<string>(copies).fill(id));

/** The starter decks' Trainers, the same 17 in each: draw, heal, switch and disrupt. */
const STARTER_TRAINERS: DeckList = [
  ['base1-91', 3], // Bill
  ['base1-88', 1], // Professor Oak
  ['base2-64', 1], // Poké Ball
  ['base1-76', 1], // Pokémon Breeder
  ['base1-94', 2], // Potion
  ['base1-90', 1], // Super Potion
  ['base1-85', 1], // Pokémon Center
  ['base1-95', 2], // Switch
  ['base1-84', 2], // PlusPower
  ['base1-80', 1], // Defender
  ['base1-92', 1], // Energy Removal
  ['base1-93', 1], // Gust of Wind
];

/**
 * The deck every account started with before there was a choice, and the first of the three: medium strength, Water and
 * Lightning. Two evolution lines (Poliwag 4-3-2, Pikachu 4-2), two Basics that attack on their own, the 17 Trainers and
 * 24 Energy.
 */
export const STARTER_DECK: DeckList = [
  ['base1-59', 4], // Poliwag
  ['base1-38', 3], // Poliwhirl
  ['base1-13', 2], // Poliwrath
  ['base3-25', 2], // Lapras (the non-holo print: the holo one is a special holo, only from pulls)
  ['base1-58', 4], // Pikachu
  ['base1-14', 2], // Raichu
  ['base1-20', 2], // Electabuzz
  ...STARTER_TRAINERS,
  ['base1-102', 13], // Water Energy
  ['base1-100', 10], // Lightning Energy
  ['base1-96', 1], // Double Colorless Energy
];

export const STARTER_IDS = ['water-lightning', 'fire-fighting', 'grass-psychic'] as const;
export type StarterId = (typeof STARTER_IDS)[number];

/**
 * The starter decks a new account picks between for its first run (the user's: three, the old starter deck one of them,
 * no Blastoise in any). Each built as the first: a Stage 2 line 4-3-2, a Stage 1 line 4-2, two Basics, the 17 Trainers,
 * 13 + 10 Energy of its two types and a Double Colorless; `cover` is its tile's card. All Base Set and Jungle cards
 * (Jungle's non-holo Scyther: the holo is a special holo, only from pulls).
 */
export const STARTER_DECKS: Record<StarterId, { name: string; text: string; cover: string; list: DeckList }> = {
  'water-lightning': { name: 'Water & Lightning', text: 'Poliwrath and Raichu, with Lapras and Electabuzz.', cover: 'base1-13', list: STARTER_DECK },
  'fire-fighting': {
    name: 'Fire & Fighting',
    text: 'Charizard and Machoke, with Hitmonchan and Magmar.',
    cover: 'base1-4',
    list: [
      ['base1-46', 4], // Charmander
      ['base1-24', 3], // Charmeleon
      ['base1-4', 2], // Charizard
      ['base1-52', 4], // Machop
      ['base1-34', 2], // Machoke
      ['base1-7', 2], // Hitmonchan
      ['base1-36', 2], // Magmar
      ...STARTER_TRAINERS,
      ['base1-98', 13], // Fire Energy
      ['base1-97', 10], // Fighting Energy
      ['base1-96', 1], // Double Colorless Energy
    ],
  },
  'grass-psychic': {
    name: 'Grass & Psychic',
    text: 'Venusaur and Haunter, with Scyther and Jynx.',
    cover: 'base1-15',
    list: [
      ['base1-44', 4], // Bulbasaur
      ['base1-30', 3], // Ivysaur
      ['base1-15', 2], // Venusaur
      ['base1-50', 4], // Gastly
      ['base1-29', 2], // Haunter
      ['base2-26', 2], // Scyther (the non-holo print)
      ['base1-31', 2], // Jynx
      ...STARTER_TRAINERS,
      ['base1-99', 13], // Grass Energy
      ['base1-101', 10], // Psychic Energy
      ['base1-96', 1], // Double Colorless Energy
    ],
  },
};

/** An evolution line: the cards for each stage (one print of each), its type and how strong it is. */
interface Line {
  stages: PokemonCardDef[];
  type: EnergyType;
  /** Energy types (not Colorless) its attacks need. */
  needs: Set<EnergyType>;
  score: number;
}

/** Copies of each stage, by the length of the line. */
const LINE_COPIES: Record<number, number[]> = { 1: [3], 2: [4, 3], 3: [4, 3, 2] };

/** The best attack's base damage plus a quarter of its HP: a rough strength for the line's top card. */
const strength = (d: PokemonCardDef) => Math.max(0, ...d.attacks.map((a) => a.damage)) + d.hp / 4;

/** Every evolution line in the pool (Basics alone, Basic → Stage 1, Basic → Stage 1 → Stage 2), one random print per stage. */
function evolutionLines(pool: readonly PoolCard[], rng: Rng): Line[] {
  const pokemon = pool.map((c) => c.def).filter(isPokemonCard);
  // Indexed once by stage and name, and by stage and what they evolve from (in pool order, as filtering the pool would give).
  const byName = new Map<string, PokemonCardDef[]>();
  const byFrom = new Map<string, PokemonCardDef[]>();
  const index = (map: Map<string, PokemonCardDef[]>, key: string, d: PokemonCardDef) => map.set(key, [...(map.get(key) ?? []), d]);
  for (const d of pokemon) {
    index(byName, `${d.stage}|${d.name}`, d);
    if (d.evolvesFrom) index(byFrom, `${d.stage}|${d.evolvesFrom}`, d);
  }
  const prints = (stage: PokemonCardDef['stage'], name: string, from?: string) =>
    (byName.get(`${stage}|${name}`) ?? []).filter((d) => from === undefined || d.evolvesFrom === from);
  const names = (stage: PokemonCardDef['stage'], from: string) => [...new Set((byFrom.get(`${stage}|${from}`) ?? []).map((d) => d.name))];
  const lines: PokemonCardDef[][] = [];
  for (const basic of new Set(pokemon.filter((d) => isBasicPokemon(d)).map((d) => d.name))) {
    const b = pick(rng, prints('basic', basic));
    lines.push([b]);
    for (const s1 of names('stage1', basic)) {
      const one = pick(rng, prints('stage1', s1, basic));
      lines.push([b, one]);
      for (const s2 of names('stage2', s1)) lines.push([b, one, pick(rng, prints('stage2', s2, s1))]);
    }
  }
  return lines.map((stages) => {
    const top = stages.at(-1)!;
    const needs = new Set(stages.flatMap((d) => d.attacks.flatMap((a) => a.cost)).filter((t) => t !== 'colorless'));
    return { stages, type: top.type, needs, score: strength(top) };
  });
}

/** A line from the middle of the strength ranking (not the best or worst fifth): medium strength. */
function mediumLine(rng: Rng, lines: Line[]): Line | null {
  if (!lines.length) return null;
  const ranked = [...lines].sort((a, b) => a.score - b.score);
  const cut = Math.floor(ranked.length / 5);
  return pick(rng, ranked.length >= 5 ? ranked.slice(cut, ranked.length - cut) : ranked);
}

/** Gen 1 Trainers by name, with copies: some in every deck, the rest picked at random. */
const CORE_TRAINERS: [string, number][] = [
  ['Bill', 3],
  ['Professor Oak', 1],
  ['Potion', 2],
  ['Switch', 2],
];
// The extras in every random deck: only Trainers the Trainer CPU plays too (cpu/trainer.ts), so none are dead cards in its hand.
const EXTRA_TRAINERS: [string, number][] = [
  ['Super Potion', 1],
  ['Full Heal', 1],
  ['Energy Retrieval', 1],
  ['Energy Search', 1],
  ['Poké Ball', 1],
  ['Maintenance', 1],
  ['Revive', 1],
  ['Pokémon Trader', 1],
  // Gym Heroes and Gym Challenge Trainers that work in any deck.
  ['Erika', 1],
  ['Master Ball', 1],
  ['Brock', 1],
  ['Good Manners', 1],
];

/** More extras for the gym leader CPU's random decks (the Ace trainers'): disruption and tricks only it plays. */
const GYM_LEADER_TRAINERS: [string, number][] = [
  ['PlusPower', 2],
  ['Energy Removal', 2],
  ['Gust of Wind', 1],
  ['Defender', 1],
  ['Pokémon Center', 1],
  ['Computer Search', 1],
  ['Super Energy Removal', 1],
  ["Misty's Wrath", 1],
  ['Scoop Up', 1],
  ['Item Finder', 1],
];

/**
 * Gym Trainers for a deck with an owner's Pokémon (4 or more cards with "Brock's" in the name…), added before the random
 * extras. Only ones the gym leader CPU plays.
 */
const OWNER_TRAINERS: Record<string, [string, number][]> = {
  Brock: [["Brock's Training Method", 1], ["Brock's Protection", 1], ['Pewter City Gym', 1]],
  Misty: [['Misty', 1], ['Cerulean City Gym', 1]],
  Erika: [["Erika's Maids", 1], ['Celadon City Gym', 1]],
  Giovanni: [['Giovanni', 1], ["Giovanni's Last Resort", 1], ['Viridian City Gym', 1]],
  Koga: [['Koga', 1], ["Koga's Ninja Trick", 1]],
  Blaine: [['Blaine', 1], ['Cinnabar City Gym', 1]],
  'Lt. Surge': [['Vermilion City Gym', 1]],
};

/** Gym Trainers that fetch Energy, for a deck of that type. */
const TYPE_TRAINERS: Partial<Record<EnergyType, [string, number][]>> = { water: [["Misty's Tears", 1]], fire: [['Fervor', 1]] };

/**
 * Gen 2's Trainers for random decks, from Neo Genesis to Skyridge, by what they do (draw, search, healing, switching), as
 * Gen 1's: the core and extras ones the Trainer CPU plays, the gym leader's extras with disruption on top.
 */
const GEN2_CORE_TRAINERS: [string, number][] = [
  ['Professor Elm', 2],
  ["Professor Oak's Research", 1],
  ['Potion', 2],
  ['Switch', 2],
];
const GEN2_EXTRA_TRAINERS: [string, number][] = [
  ['Gold Berry', 2],
  ['Berry', 1],
  ['Miracle Berry', 1],
  ['Moo-Moo Milk', 1],
  ['Hyper Potion', 1],
  ['Full Heal', 1],
  ['Focus Band', 1],
  ['Super Energy Retrieval', 1],
  ['Energy Search', 1],
  ['Energy Ark', 1],
  ['Master Ball', 1],
  ["Bill's Teleporter", 1],
  ['Mary', 1],
  ['Pokémon Fan Club', 1],
  ["Professor Elm's Training Method", 1],
  ['Dual Ball', 1],
  ['Fast Ball', 1],
  ['Energy Switch', 1],
  ['Copycat', 1],
  ['Healing Berry', 1],
];
const GEN2_GYM_LEADER_TRAINERS: [string, number][] = [
  ['Energy Removal 2', 2],
  ['Super Energy Removal 2', 1],
  ['Pokémon Reversal', 1],
  ['Double Gust', 1],
  ['Super Scoop Up', 1],
  ['Pokémon Nurse', 1],
  ['Warp Point', 1],
  ['Strength Charm', 1],
  ['EXP.ALL', 1],
  ['Pokémon Breeder Fields', 1],
  ['Seer', 1],
];

/**
 * Gen 3's Trainers for random decks, from the EX sets, by what they do (draw, search, healing, switching), as Gen 1's and
 * 2's: the core and extras ones the Trainer CPU plays, the gym leader's extras with disruption on top (and Rare Candy, Gen 3's
 * Pokémon Breeder, with a Stage 2 line).
 */
const GEN3_CORE_TRAINERS: [string, number][] = [
  ['Professor Birch', 2],
  ["Steven's Advice", 1],
  ['Potion', 2],
  ['Switch', 2],
];
const GEN3_EXTRA_TRAINERS: [string, number][] = [
  ['Great Ball', 2],
  ['Poké Ball', 1],
  ['Master Ball', 1],
  ['Dual Ball', 1],
  ['Energy Search', 1],
  ['Energy Restore', 1],
  ['Energy Switch', 1],
  ["Lanette's Net Search", 1],
  ['TV Reporter', 1],
  ["Celio's Network", 1],
  ['Oran Berry', 2],
  ['Lum Berry', 1],
  ['Sitrus Berry', 1],
  ['Double Full Heal', 1],
  ['Buffer Piece', 1],
  ['Copycat', 1],
];
const GEN3_GYM_LEADER_TRAINERS: [string, number][] = [
  ['Energy Removal 2', 2],
  ['Pokémon Reversal', 1],
  ['Warp Point', 1],
  ['Super Scoop Up', 1],
  ['Strength Charm', 1],
  ['Scott', 1],
  ['Life Herb', 1],
  ['Protective Orb', 1],
  ['Windstorm', 1],
];

/** Special Energy for random decks: Colorless-heavy decks take the `colorless` ones, two-type decks the `twoTypes` ones. */
type SpecialEnergy = [name: string, copies: number, when: 'colorless' | 'twoTypes'];

/**
 * What a generation's random decks are made of: its basic Energy (the types decks are built around) and Double
 * Colorless if it has one, its Trainers (the core ones in every deck, the extras at random, Pokémon Breeder with a
 * Stage 2 line), and the Gym Trainers for owners' Pokémon and for types (Gen 1's Gym sets).
 */
export interface DeckRules {
  basicEnergy: Partial<Record<EnergyType, string>>;
  doubleColorless?: string;
  core: [string, number][];
  extra: [string, number][];
  /** Extras only the gym leader CPU's random decks draw from (it plays every card; the Trainer CPU doesn't). */
  gymLeaderExtra: [string, number][];
  /** Special Energy (at most one kind a deck), by the deck's Energy; `gymLeaderSpecial` too for the gym leader's. */
  special: SpecialEnergy[];
  gymLeaderSpecial: SpecialEnergy[];
  breeder?: string;
  owners: Record<string, [string, number][]>;
  types: Partial<Record<EnergyType, [string, number][]>>;
}

/**
 * The Pokémon each kind of trainer favours, by the class in their name ("Swimmer" in "Swimmer Luis"), after
 * the Generation I, II and III games (each list's Kanto Pokémon, then its Johto ones, then its Hoenn ones): their decks are built from these lines
 * first (generateDeck's `favorites`), as far as the generation's pool has them.
 */
const TRAINER_FAVORITES: Record<string, string[]> = {
  Youngster: ['Rattata', 'Raticate', 'Ekans', 'Arbok', 'Spearow', 'Fearow', 'Sandshrew', 'Sandslash', 'Nidoran♂', 'Nidorino', 'Sentret', 'Furret', 'Hoothoot', 'Wooper', 'Quagsire', 'Zigzagoon', 'Linoone', 'Poochyena', 'Mightyena', 'Taillow', 'Shroomish', 'Whismur', 'Electrike', 'Seedot'],
  Lass: ['Nidoran♀', 'Nidorina', 'Jigglypuff', 'Wigglytuff', 'Clefairy', 'Clefable', 'Oddish', 'Gloom', 'Pidgey', 'Meowth', 'Snubbull', 'Marill', 'Hoppip', 'Togepi', 'Cleffa', 'Igglybuff', 'Skitty', 'Delcatty', 'Azurill', 'Roselia', 'Shroomish', 'Plusle', 'Minun', 'Lotad'],
  'Bug Catcher': ['Caterpie', 'Metapod', 'Butterfree', 'Weedle', 'Kakuna', 'Beedrill', 'Venonat', 'Venomoth', 'Paras', 'Parasect', 'Scyther', 'Pinsir', 'Ledyba', 'Ledian', 'Spinarak', 'Ariados', 'Yanma', 'Pineco', 'Forretress', 'Shuckle', 'Heracross', 'Wurmple', 'Silcoon', 'Beautifly', 'Cascoon', 'Dustox', 'Nincada', 'Ninjask', 'Shedinja', 'Surskit', 'Masquerain', 'Volbeat', 'Illumise'],
  Hiker: ['Geodude', 'Graveler', 'Golem', 'Onix', 'Machop', 'Machoke', 'Machamp', 'Rhyhorn', 'Rhydon', 'Diglett', 'Dugtrio', 'Cubone', 'Marowak', 'Sudowoodo', 'Phanpy', 'Donphan', 'Larvitar', 'Pupitar', 'Teddiursa', 'Ursaring', 'Swinub', 'Piloswine', 'Nosepass', 'Aron', 'Lairon', 'Aggron', 'Numel', 'Camerupt', 'Makuhita', 'Hariyama', 'Baltoy', 'Claydol', 'Trapinch', 'Torkoal', 'Relicanth'],
  Picnicker: ['Pidgey', 'Pidgeotto', 'Oddish', 'Gloom', 'Bellsprout', 'Weepinbell', 'Pikachu', 'Raichu', 'Meowth', 'Persian', 'Hoppip', 'Skiploom', 'Jumpluff', 'Marill', 'Azumarill', 'Sentret', 'Furret', 'Skitty', 'Delcatty', 'Zigzagoon', 'Linoone', 'Swablu', 'Altaria', 'Lotad', 'Lombre', 'Roselia'],
  Camper: ['Sandshrew', 'Sandslash', 'Mankey', 'Primeape', 'Ekans', 'Arbok', 'Nidoran♂', 'Nidorino', 'Charmander', 'Charmeleon', 'Squirtle', 'Wartortle', 'Phanpy', 'Donphan', 'Cyndaquil', 'Quilava', 'Totodile', 'Croconaw', 'Chikorita', 'Bayleef', 'Zigzagoon', 'Linoone', 'Torchic', 'Combusken', 'Treecko', 'Grovyle', 'Mudkip', 'Marshtomp', 'Spinda', 'Taillow', 'Swellow'],
  'Super Nerd': ['Magnemite', 'Magneton', 'Voltorb', 'Electrode', 'Grimer', 'Muk', 'Koffing', 'Weezing', 'Vulpix', 'Ninetales', 'Porygon', 'Mareep', 'Flaaffy', 'Ampharos', 'Porygon2', 'Slugma', 'Magcargo', 'Unown', 'Electrike', 'Manectric', 'Plusle', 'Minun', 'Baltoy', 'Claydol', 'Beldum', 'Metang'],
  Swimmer: ['Tentacool', 'Tentacruel', 'Psyduck', 'Golduck', 'Horsea', 'Seadra', 'Staryu', 'Starmie', 'Goldeen', 'Seaking', 'Shellder', 'Cloyster', 'Seel', 'Dewgong', 'Chinchou', 'Lanturn', 'Marill', 'Azumarill', 'Qwilfish', 'Mantine', 'Corsola', 'Remoraid', 'Octillery', 'Wingull', 'Pelipper', 'Carvanha', 'Sharpedo', 'Wailmer', 'Wailord', 'Corphish', 'Crawdaunt', 'Spheal', 'Sealeo', 'Luvdisc', 'Clamperl'],
  Fisherman: ['Magikarp', 'Gyarados', 'Goldeen', 'Seaking', 'Poliwag', 'Poliwhirl', 'Poliwrath', 'Krabby', 'Kingler', 'Shellder', 'Cloyster', 'Chinchou', 'Lanturn', 'Qwilfish', 'Remoraid', 'Octillery', 'Wooper', 'Quagsire', 'Tentacool', 'Tentacruel', 'Wailmer', 'Barboach', 'Whiscash', 'Corphish', 'Carvanha', 'Feebas', 'Luvdisc'],
  Beauty: ['Oddish', 'Gloom', 'Vileplume', 'Bellsprout', 'Weepinbell', 'Victreebel', 'Exeggcute', 'Exeggutor', 'Clefairy', 'Clefable', 'Jigglypuff', 'Wigglytuff', 'Snubbull', 'Granbull', 'Bellossom', 'Sunkern', 'Sunflora', 'Togepi', 'Togetic', 'Roselia', 'Skitty', 'Delcatty', 'Wingull', 'Milotic', 'Luvdisc'],
  Gentleman: ['Growlithe', 'Arcanine', 'Ponyta', 'Rapidash', 'Meowth', 'Persian', 'Pikachu', 'Raichu', 'Houndour', 'Houndoom', 'Snubbull', 'Granbull', 'Stantler', 'Zigzagoon', 'Linoone', 'Mightyena', 'Absol', 'Spinda', 'Kecleon'],
  Biker: ['Koffing', 'Weezing', 'Grimer', 'Muk', 'Voltorb', 'Electrode', 'Ponyta', 'Rapidash', 'Slugma', 'Magcargo', 'Houndour', 'Houndoom', 'Carvanha', 'Sharpedo', 'Gulpin', 'Swalot'],
  Juggler: ['Abra', 'Kadabra', 'Alakazam', 'Drowzee', 'Hypno', 'Mr. Mime', 'Voltorb', 'Electrode', 'Natu', 'Xatu', 'Girafarig', 'Wobbuffet', 'Spoink', 'Grumpig', 'Chimecho', 'Ralts', 'Kirlia', 'Gardevoir'],
  Rocker: ['Voltorb', 'Electrode', 'Magnemite', 'Magneton', 'Pikachu', 'Raichu', 'Electabuzz', 'Jolteon', 'Mareep', 'Flaaffy', 'Ampharos', 'Elekid', 'Electrike', 'Manectric', 'Whismur', 'Loudred', 'Exploud', 'Plusle', 'Minun'],
  Gambler: ['Meowth', 'Persian', 'Growlithe', 'Arcanine', 'Poliwag', 'Poliwhirl', 'Horsea', 'Seadra', 'Aipom', 'Murkrow', 'Sneasel', 'Spinda', 'Kecleon', 'Sableye', 'Mawile', 'Zangoose', 'Seviper'],
  Sailor: ['Machop', 'Machoke', 'Machamp', 'Tentacool', 'Tentacruel', 'Shellder', 'Cloyster', 'Horsea', 'Seadra', 'Staryu', 'Starmie', 'Chinchou', 'Lanturn', 'Mantine', 'Tyrogue', 'Hitmontop', 'Wingull', 'Pelipper', 'Makuhita', 'Hariyama', 'Wailmer'],
  Psychic: ['Abra', 'Kadabra', 'Alakazam', 'Slowpoke', 'Slowbro', 'Drowzee', 'Hypno', 'Mr. Mime', 'Jynx', 'Exeggcute', 'Exeggutor', 'Natu', 'Xatu', 'Espeon', 'Girafarig', 'Smoochum', 'Wobbuffet', 'Misdreavus', 'Ralts', 'Kirlia', 'Gardevoir', 'Spoink', 'Grumpig', 'Lunatone', 'Solrock', 'Baltoy', 'Claydol', 'Chimecho', 'Wynaut', 'Meditite', 'Medicham'],
  'Black Belt': ['Machop', 'Machoke', 'Machamp', 'Mankey', 'Primeape', 'Hitmonlee', 'Hitmonchan', 'Geodude', 'Graveler', 'Onix', 'Tyrogue', 'Hitmontop', 'Heracross', 'Teddiursa', 'Ursaring', 'Makuhita', 'Hariyama', 'Meditite', 'Medicham'],
  // Team Rocket's grunts (the Power Plant): their usual Pokémon, of many types, so each grunt's deck is a different mix.
  'Rocket Grunt': ['Rattata', 'Raticate', 'Zubat', 'Golbat', 'Ekans', 'Arbok', 'Koffing', 'Weezing', 'Grimer', 'Muk', 'Drowzee', 'Hypno', 'Machop', 'Machoke', 'Sandshrew', 'Sandslash', 'Cubone', 'Marowak', 'Meowth', 'Persian', 'Houndour', 'Murkrow', 'Poochyena', 'Mightyena', 'Carvanha', 'Sharpedo', 'Numel', 'Camerupt'],
  'Bird Keeper': ['Pidgey', 'Pidgeotto', 'Pidgeot', 'Spearow', 'Fearow', 'Doduo', 'Dodrio', "Farfetch'd", 'Zubat', 'Golbat', 'Hoothoot', 'Noctowl', 'Natu', 'Xatu', 'Murkrow', 'Skarmory', 'Delibird', 'Taillow', 'Swellow', 'Wingull', 'Pelipper', 'Swablu', 'Altaria', 'Tropius'],
  // The Seaside Cycling Road's Triathletes (Route 110, the Mauville City run): riding Pokémon, birds and Electric ones.
  Triathlete: ['Doduo', 'Dodrio', 'Ponyta', 'Rapidash', 'Wingull', 'Pelipper', 'Taillow', 'Swellow', 'Electrike', 'Manectric', 'Magnemite', 'Magneton', 'Zigzagoon', 'Linoone'],
};

export const GEN1_DECK_RULES: DeckRules = {
  basicEnergy: BASIC_ENERGY,
  doubleColorless: DOUBLE_COLORLESS,
  core: CORE_TRAINERS,
  extra: EXTRA_TRAINERS,
  gymLeaderExtra: GYM_LEADER_TRAINERS,
  special: [['Potion Energy', 1, 'colorless'], ['Full Heal Energy', 1, 'colorless']],
  gymLeaderSpecial: [['Rainbow Energy', 1, 'twoTypes']],
  breeder: 'Pokémon Breeder',
  owners: OWNER_TRAINERS,
  types: TYPE_TRAINERS,
};

export const GEN2_DECK_RULES: DeckRules = {
  basicEnergy: GEN2_BASIC_ENERGY,
  core: GEN2_CORE_TRAINERS,
  extra: GEN2_EXTRA_TRAINERS,
  gymLeaderExtra: GEN2_GYM_LEADER_TRAINERS,
  special: [['Recycle Energy', 2, 'colorless'], ['Rainbow Energy', 1, 'twoTypes']],
  gymLeaderSpecial: [['Boost Energy', 1, 'colorless'], ['Warp Energy', 1, 'colorless']],
  owners: {},
  types: {},
};

export const GEN3_DECK_RULES: DeckRules = {
  basicEnergy: GEN3_BASIC_ENERGY,
  core: GEN3_CORE_TRAINERS,
  extra: GEN3_EXTRA_TRAINERS,
  gymLeaderExtra: GEN3_GYM_LEADER_TRAINERS,
  special: [['Multi Energy', 1, 'twoTypes'], ['Heal Energy', 1, 'colorless']],
  gymLeaderSpecial: [['Boost Energy', 1, 'colorless'], ['Double Rainbow Energy', 1, 'twoTypes']],
  breeder: 'Rare Candy',
  owners: {},
  types: {},
};

/** The Pokémon a trainer favours, from the class in their name ("Swimmer Luis": a Swimmer's), if they have any. */
export const trainerFavorites = (trainer: string): string[] | undefined => TRAINER_FAVORITES[trainer.split(' ').slice(0, -1).join(' ')];

/**
 * A random 60-card deck of medium strength for a trainer, following the usual rules of deck building:
 * one or two Energy types, 2–4 evolution lines of middling strength (about 18–20 Pokémon, at least 8
 * of them Basic), 14–16 Trainers (draw, healing, switching, a little disruption) and the rest Energy,
 * split by what the attacks need. No more than 4 of any card but basic Energy. `type` makes a deck of just that
 * type (and Colorless). `favorites` (Pokémon names, from trainerFavorites) are chosen first wherever they fit,
 * and set the deck's types: a Swimmer's deck has Tentacruel and Golduck rather than any Water Pokémon. `rules` are the
 * generation's Energy and Trainers (Gen 1's by default); the pool should be the same generation's. `difficulty` is the CPU
 * that plays it: a Trainer CPU's deck holds only cards it plays, a gym leader's (the default) its extras, Pokémon Breeder
 * and owners' Trainers too.
 */
export function generateDeck(
  pool: readonly PoolCard[],
  rng: Rng,
  { type, favorites, rules = GEN1_DECK_RULES, difficulty = 'gymLeader' }: { type?: EnergyType; favorites?: string[]; rules?: DeckRules; difficulty?: 'trainer' | 'gymLeader' } = {},
): string[] {
  const gymLeader = difficulty === 'gymLeader';
  const DECK_TYPES = Object.keys(rules.basicEnergy) as EnergyType[];
  // A deck may hold only 1 of each Shining Pokémon: they stay out of random decks, which use 3 or 4 copies of a line.
  const all = evolutionLines(pool, rng).filter((l) => !l.stages.some((d) => d.name.startsWith('Shining ')));
  const liked = new Set(favorites ?? []);
  // A favourite line ends with a favourite (Nidoran♀ → Nidorina, not on to Nidoqueen unless that's one too).
  const favored = (l: Line) => liked.has(l.stages.at(-1)!.name);
  const mainTypes = DECK_TYPES.filter((t) => all.some((l) => l.type === t && l.stages.length > 1));
  // The types of the favourite lines that their own Energy plays (not Colorless, which any Energy pays for),
  // once per line, so a type with more favourites comes up more often.
  const likedTypes = all.filter((l) => favored(l) && DECK_TYPES.includes(l.type) && [...l.needs].every((t) => t === l.type)).map((l) => l.type);
  // `type` (a Gym Trainer's gym) is the main type when the pool has evolution lines of it; otherwise a favourite type.
  const main = type && mainTypes.includes(type) ? type : likedTypes.length ? pick(rng, likedTypes) : pick(rng, mainTypes);
  // A Gym Trainer's deck sticks to its gym's type (Colorless Pokémon aside); others add a second type 60% of the
  // time: a themed deck only another favourite type, if it has one.
  const others = [...new Set(likedTypes)].filter((t) => t !== main);
  const secondTypes = liked.size ? others : DECK_TYPES.filter((t) => t !== main);
  const second = !type && secondTypes.length && chance(rng, 0.6) ? pick(rng, secondTypes) : null;
  const types = new Set<EnergyType>([main, ...(second ? [second] : [])]);
  // A line fits if all its attacks can be paid with the deck's Energy.
  const fits = (l: Line, type: EnergyType) => l.type === type || (l.type === 'colorless' && [...l.needs].every((t) => types.has(t)));
  const usable = all.filter((l) => [...l.needs].every((t) => types.has(t)));

  const chosen: Line[] = [];
  const taken = new Set<string>();
  // One Unown at most (its 3 copies): a deck may hold only 4 Basic Pokémon with Unown in their names.
  const unown = (l: Line) => l.stages[0]!.name.includes('Unown');
  const add = (line: Line | null) => {
    if (!line || taken.has(line.stages[0]!.name) || (unown(line) && chosen.some(unown))) return;
    chosen.push(line);
    taken.add(line.stages[0]!.name);
  };
  const count = () => chosen.reduce((n, l) => n + LINE_COPIES[l.stages.length]!.reduce((a, b) => a + b, 0), 0);
  // A themed deck (`favorites`): its favourite lines that fit, first a main-type line that evolves as the main
  // attacker, then evolving ones, until there are enough Pokémon. Only if they run out do other lines join.
  if (liked.size) {
    const mine = () => usable.filter((l) => favored(l) && !taken.has(l.stages[0]!.name) && [...types].some((t) => fits(l, t)));
    add(mediumLine(rng, mine().filter((l) => l.type === main && l.stages.length > 1)) ?? mediumLine(rng, mine().filter((l) => l.type === main)));
    for (let tries = 0; count() < 18 && tries < 20; tries++) {
      const left = mine();
      if (!left.length) break;
      const evolving = left.filter((l) => l.stages.length > 1);
      add(mediumLine(rng, count() <= 14 && evolving.length ? evolving : left));
    }
  }
  const candidates = (type: EnergyType, length: number) => usable.filter((l) => fits(l, type) && l.stages.length === length && !taken.has(l.stages[0]!.name));
  if (!chosen.length) {
    // The main attacker, of the main type: a Stage 2 line half the time, otherwise a Stage 1 line.
    const ofMain = (length: number) => candidates(main, length).filter((l) => l.type === main);
    add(mediumLine(rng, ofMain(chance(rng, 0.5) ? 3 : 2)) ?? mediumLine(rng, ofMain(2)) ?? mediumLine(rng, candidates(main, 2)));
    add(mediumLine(rng, candidates(second ?? main, 2)) ?? mediumLine(rng, candidates(second ?? main, 1)));
  }
  for (let tries = 0; count() < 18 && tries < 20; tries++) {
    const type = pick(rng, [...types]);
    add(mediumLine(rng, candidates(type, count() <= 14 ? 2 : 1)) ?? mediumLine(rng, candidates(type, 1)));
  }

  const deck: string[] = [];
  for (const line of chosen) line.stages.forEach((d, i) => deck.push(...Array<string>(LINE_COPIES[line.stages.length]![i]!).fill(d.id)));

  // Trainers: the core ones, Pokémon Breeder with a Stage 2 line, then random extras up to 14–16. The pool's Trainers (and
  // Energy) by nameKey, the first print of each as the pool has them, and every card by id, looked up without a search each.
  const cards = byId(pool);
  const trainerIds = new Map<string, string>();
  for (const c of pool) if (c.def.kind !== 'pokemon' || c.def.trainerText) trainerIds.set(nameKey(c.def.name), trainerIds.get(nameKey(c.def.name)) ?? c.def.id);
  const trainer = (name: string) => trainerIds.get(nameKey(name));
  const trainerTarget = between(rng, 14, 16);
  const plan: [string, number][] = [...rules.core];
  if (gymLeader && rules.breeder && chosen.some((l) => l.stages.length === 3)) plan.push([rules.breeder, 1]);
  const owned = (owner: string) => deck.filter((id) => cards.get(id)?.def.name.startsWith(`${owner}'s `)).length;
  if (gymLeader) for (const [owner, cards] of Object.entries(rules.owners)) if (owned(owner) >= 4) plan.push(...cards);
  for (const t of types) plan.push(...(rules.types[t] ?? []));
  const extra = gymLeader ? [...rules.extra, ...rules.gymLeaderExtra] : rules.extra;
  for (const [name, copies] of sample(rng, extra, extra.length)) {
    if (plan.reduce((n, [, c]) => n + c, 0) >= trainerTarget) break;
    plan.push([name, copies]);
  }
  let trainers = 0;
  for (const [name, copies] of plan) {
    const id = trainer(name);
    const n = Math.min(copies, trainerTarget - trainers);
    if (!id || n <= 0) continue;
    deck.push(...Array<string>(n).fill(id));
    trainers += n;
  }

  // Energy: the rest, split by the Energy symbols in the attacks (weighted by copies), at least 4 of each
  // type used; Double Colorless when Colorless symbols are common.
  const symbols = new Map<EnergyType, number>();
  let colorless = 0;
  for (const id of deck) {
    const d = cards.get(id)!.def;
    if (d.kind !== 'pokemon') continue;
    for (const t of d.attacks.flatMap((a) => a.cost)) {
      if (t === 'colorless') colorless++;
      else symbols.set(t, (symbols.get(t) ?? 0) + 1);
    }
  }
  if (!symbols.size) symbols.set(main, 1);
  let energy = DECK_SIZE - deck.length;
  const total = [...symbols.values()].reduce((a, b) => a + b, 0);
  if (rules.doubleColorless && colorless / (colorless + total) > 0.3 && energy > 10) {
    const dce = between(rng, 1, 2);
    deck.push(...Array<string>(dce).fill(rules.doubleColorless));
    energy -= dce;
  }
  // Special Energy half the time it suits the deck: one kind, Colorless-heavy or two-type decks.
  const fitting = [...rules.special, ...(gymLeader ? rules.gymLeaderSpecial : [])].filter(([name, , when]) => trainer(name) && (when === 'twoTypes' ? types.size === 2 : colorless / (colorless + total) > 0.2));
  if (fitting.length && energy > 10 && chance(rng, 0.5)) {
    const [name, copies] = pick(rng, fitting);
    deck.push(...Array<string>(copies).fill(trainer(name)!));
    energy -= copies;
  }
  const split = [...symbols.entries()].map(([t, n]) => [t, Math.max(4, Math.round((energy * n) / total))] as const);
  // Rounding can over- or undershoot: the main type takes up the difference.
  const sum = split.reduce((a, [, n]) => a + n, 0);
  for (const [i, [t, n]] of split.entries()) {
    const fix = i === 0 ? energy - sum : 0;
    deck.push(...Array<string>(Math.max(0, n + fix)).fill(rules.basicEnergy[t]!));
  }
  while (deck.length < DECK_SIZE) deck.push(rules.basicEnergy[split[0]![0]]!);
  return deck.slice(0, DECK_SIZE);
}

/**
 * Checks the deck-building rules this game uses: 60 cards, at most 4 of a card but basic Energy, at most 4 Basic Pokémon
 * with Unown in their names, and a Basic Pokémon.
 */
export function deckErrors(deck: readonly string[], defs: (id: string) => CardDef): string[] {
  const errors: string[] = [];
  if (deck.length !== DECK_SIZE) errors.push(`The deck has ${deck.length} cards, not ${DECK_SIZE}`);
  const counts = new Map<string, number>();
  for (const id of deck) {
    const d = defs(id);
    if (d.kind === 'energy' && d.basic !== false) continue;
    counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
  }
  // At most 4 of a name; 1 for a Shining Pokémon or Miracle Energy.
  for (const [name, n] of counts) if (n > (name.startsWith('Shining ') || name === 'Miracle Energy' ? 1 : 4)) errors.push(`${n} copies of ${name}`);
  const unown = deck.filter((id) => isBasicPokemon(defs(id)) && defs(id).name.includes('Unown')).length;
  if (unown > 4) errors.push(`${unown} Unown`);
  if (!deck.some((id) => isBasicPokemon(defs(id)))) errors.push('No Basic Pokémon');
  return errors;
}
