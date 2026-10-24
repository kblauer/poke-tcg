// Hoenn's bosses for Gen 3 runs: the eight gym leaders, the Elite Four and Champion Wallace of Pokémon Emerald. No Game Boy
// TCG plays the EX sets, so their decks are our own, as Johto's are (johto-bosses.ts): built around each character's
// team in Emerald, from Gen 3's sets only (EX_SETS: EX Ruby & Sapphire to EX Power Keepers), with Gen 3's basic Energy
// (EX Ruby & Sapphire prints) and Trainers, each with one Pokémon-ex at most as its star (2 Prize cards). Their Gym
// Trainers are the trainers in their gym in Emerald (pret's gym maps, every room of the gym; tools/routes/emerald/
// hoenn_maps.py prints them).
// A Hoenn boss is the same as a Kanto one (Boss, bosses.ts; a type-only import, so no cycle), with no Game Boy counterpart:
// `favorites` for a gym whose type has no basic Energy (Norman's Normal, Winona's Flying).
import type { Boss } from './bosses.js';
import type { DeckList } from './decks.js';
import { GEN3_BASIC_ENERGY } from './pool.js';

// Gen 3's basic Energy (EX Ruby & Sapphire, pool.ts) and special Energy.
const GRASS = GEN3_BASIC_ENERGY.grass!;
const FIGHTING = GEN3_BASIC_ENERGY.fighting!;
const WATER = GEN3_BASIC_ENERGY.water!;
const PSYCHIC = GEN3_BASIC_ENERGY.psychic!;
const FIRE = GEN3_BASIC_ENERGY.fire!;
const LIGHTNING = GEN3_BASIC_ENERGY.lightning!;
const DARKNESS = 'ex1-93'; // Darkness Energy (special)
const DARK_METAL = 'ex7-94'; // Dark Metal Energy (special)
const MULTI = 'ex2-93'; // Multi Energy (special)
const DOUBLE_RAINBOW = 'ex4-88'; // Double Rainbow Energy (special)

// The Trainers most decks share.
const BIRCH = 'ex1-89'; // Professor Birch
const STEVENS_ADVICE = 'ex5-92'; // Steven's Advice
const RARE_CANDY = 'ex2-88'; // Rare Candy
const GREAT_BALL = 'ex6-92'; // Great Ball
const POTION = 'ex1-91'; // Potion
const SWITCH = 'ex1-92'; // Switch
const ENERGY_SEARCH = 'ex1-90'; // Energy Search
const REVERSAL = 'ex1-87'; // Pokémon Reversal
const ENERGY_REMOVAL = 'ex1-80'; // Energy Removal 2
const STRENGTH_CHARM = 'ex4-74'; // Strength Charm
const ORAN_BERRY = 'ex1-85'; // Oran Berry

/** Roxanne (Rustboro City, Rock): Golem, Nosepass, and the fossil Armaldo. */
const ROXANNE_DECK: DeckList = [
  ['ex3-55', 4], // Geodude
  ['ex3-30', 3], // Graveler
  ['ex3-5', 2], // Golem
  ['ex3-91', 1], // Golem ex
  ['ex13-25', 3], // Nosepass
  ['ex2-90', 3], // Claw Fossil
  ['ex2-27', 3], // Anorith
  ['ex2-1', 2], // Armaldo
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 2],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 1],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [STRENGTH_CHARM, 1],
  [FIGHTING, 25],
];

/** Brawly (Dewford Town, Fighting): Machamp, Hariyama and Medicham. */
const BRAWLY_DECK: DeckList = [
  ['ex16-53', 4], // Machop
  ['ex16-33', 3], // Machoke
  ['ex16-11', 2], // Machamp
  ['ex1-57', 4], // Makuhita
  ['ex1-8', 3], // Hariyama
  ['ex8-100', 1], // Hariyama ex
  ['ex9-55', 3], // Meditite
  ['ex16-34', 2], // Medicham
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 2],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 1],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [STRENGTH_CHARM, 1],
  [FIGHTING, 24],
];

/** Wattson (Mauville City, Electric): Magneton, Electrode and Manectric, with Plusle and Minun. */
const WATTSON_DECK: DeckList = [
  ['ex16-54', 4], // Magnemite
  ['ex11-48', 3], // Magneton
  ['ex12-68', 3], // Voltorb
  ['ex12-32', 2], // Electrode
  ['ex1-30', 4], // Electrike
  ['ex1-9', 3], // Manectric
  ['ex8-101', 1], // Manectric ex
  ['ex9-39', 1], // Plusle
  ['ex9-37', 1], // Minun
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [LIGHTNING, 26],
];

/** Flannery (Lavaridge Town, Fire): Camerupt, Magcargo and Torkoal. */
const FLANNERY_DECK: DeckList = [
  ['ex1-61', 4], // Numel
  ['ex1-4', 3], // Camerupt
  ['ex9-92', 1], // Camerupt ex
  ['ex8-75', 4], // Slugma
  ['ex8-37', 3], // Magcargo
  ['ex3-95', 1], // Magcargo ex
  ['ex13-33', 3], // Torkoal
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 2],
  [REVERSAL, 1],
  [ENERGY_REMOVAL, 1],
  [ORAN_BERRY, 2],
  [FIRE, 25],
];

/** Norman (Petalburg City, Normal): Slaking, Linoone and Spinda. All Colorless attacks, so any Energy pays. */
const NORMAN_DECK: DeckList = [
  ['ex1-45', 4], // Slakoth
  ['ex8-50', 3], // Vigoroth
  ['ex1-12', 2], // Slaking
  ['ex2-85', 4], // Zigzagoon
  ['ex1-38', 3], // Linoone
  ['ex12-26', 2], // Spinda
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 2],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [STRENGTH_CHARM, 1],
  [DOUBLE_RAINBOW, 2],
  [LIGHTNING, 25],
];

/** Winona (Fortree City, Flying): Altaria, Swellow and Pelipper. Their Water and Lightning attacks set the Energy. */
const WINONA_DECK: DeckList = [
  ['ex9-67', 4], // Swablu
  ['ex16-2', 3], // Altaria
  ['ex9-90', 1], // Altaria ex
  ['ex1-72', 4], // Taillow
  ['ex1-46', 3], // Swellow
  ['ex8-81', 3], // Wingull
  ['ex8-21', 2], // Pelipper
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [ORAN_BERRY, 1],
  [WATER, 14],
  [LIGHTNING, 13],
];

/** Tate and Liza (Mossdeep City, Psychic): Lunatone and Solrock, with Claydol and Xatu. */
const TATE_LIZA_DECK: DeckList = [
  ['ex2-8', 3], // Lunatone
  ['ex2-13', 3], // Solrock
  ['ex5-52', 4], // Baltoy
  ['ex5-2', 3], // Claydol
  ['ex16-93', 1], // Claydol ex
  ['ex8-66', 3], // Natu
  ['ex8-29', 2], // Xatu
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [ENERGY_REMOVAL, 1],
  [PSYCHIC, 15],
  [FIGHTING, 13],
];

/** Juan (Sootopolis City, Water): Whiscash, Walrein and Kingdra, with Luvdisc. */
const JUAN_DECK: DeckList = [
  ['ex9-53', 2], // Luvdisc
  ['ex3-51', 4], // Barboach
  ['ex3-48', 3], // Whiscash
  ['ex16-65', 4], // Spheal
  ['ex5-47', 3], // Sealeo
  ['ex5-15', 1], // Walrein
  ['ex3-58', 3], // Horsea
  ['ex3-40', 2], // Seadra
  ['ex7-12', 1], // Kingdra
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 2],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 1],
  [ENERGY_SEARCH, 1],
  [WATER, 25],
];

/** Sidney (Elite Four, Dark): Mightyena, Shiftry, Cacturne and Absol. Darkness Energy is special, so Dark Metal and Multi Energy add to it. */
const SIDNEY_DECK: DeckList = [
  ['ex1-64', 4], // Poochyena
  ['ex1-10', 3], // Mightyena
  ['ex13-101', 1], // Mightyena ex
  ['ex2-76', 4], // Seedot
  ['ex12-41', 3], // Nuzleaf
  ['ex12-12', 2], // Shiftry
  ['ex2-58', 3], // Cacnea
  ['ex2-2', 2], // Cacturne
  ['ex3-1', 1], // Absol
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 2],
  [GREAT_BALL, 2],
  [POTION, 1],
  [SWITCH, 1],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  ['ex16-82', 1], // Sidney's Stadium
  [DARKNESS, 4],
  [DARK_METAL, 4],
  [MULTI, 2],
  [GRASS, 14],
];

/** Phoebe (Elite Four, Ghost): Dusclops, Banette and Sableye. */
const PHOEBE_DECK: DeckList = [
  ['ex16-50', 4], // Duskull
  ['ex16-14', 3], // Dusclops
  ['ex9-94', 1], // Dusclops ex
  ['ex12-63', 4], // Shuppet
  ['ex16-4', 3], // Banette
  ['ex16-22', 2], // Sableye
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [ENERGY_REMOVAL, 1],
  ['ex16-79', 2], // Phoebe's Stadium
  [PSYCHIC, 28],
];

/** Glacia (Elite Four, Ice): Glalie and Walrein. */
const GLACIA_DECK: DeckList = [
  ['ex5-73', 4], // Snorunt
  ['ex5-34', 2], // Glalie
  ['ex9-13', 1], // Glalie
  ['ex5-74', 4], // Spheal
  ['ex16-37', 3], // Sealeo
  ['ex5-15', 1], // Walrein
  ['ex16-99', 1], // Walrein ex
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 1],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [ENERGY_REMOVAL, 1],
  ['ex16-76', 2], // Glacia's Stadium
  [WATER, 28],
];

/** Drake (Elite Four, Dragon): Salamence, Altaria and Flygon, their attacks needing Fire, Water, Lightning and Grass. */
const DRAKE_DECK: DeckList = [
  ['ex16-43', 4], // Bagon
  ['ex16-39', 3], // Shelgon
  ['ex3-10', 1], // Salamence
  ['ex16-96', 1], // Salamence ex
  ['ex8-79', 3], // Swablu
  ['ex3-2', 2], // Altaria
  ['ex16-68', 3], // Trapinch
  ['ex16-40', 2], // Vibrava
  ['ex3-4', 1], // Flygon
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 2],
  [GREAT_BALL, 2],
  [POTION, 1],
  [SWITCH, 1],
  [ENERGY_SEARCH, 1],
  ['ex16-72', 1], // Drake's Stadium
  [FIRE, 8],
  [WATER, 9],
  [LIGHTNING, 6],
  [GRASS, 3],
  [MULTI, 2],
];

/** Wallace (Champion, Water): Milotic, Wailord, Ludicolo and Tentacruel. */
const WALLACE_DECK: DeckList = [
  ['ex1-48', 3], // Wailmer
  ['ex1-14', 2], // Wailord
  ['ex2-100', 1], // Wailord ex
  ['ex12-66', 3], // Tentacool
  ['ex12-45', 2], // Tentacruel
  ['ex2-66', 3], // Lotad
  ['ex2-45', 2], // Lombre
  ['ex2-7', 2], // Ludicolo
  ['ex9-49', 3], // Feebas
  ['ex5-12', 2], // Milotic
  ['ex9-96', 1], // Milotic ex
  [BIRCH, 3],
  [STEVENS_ADVICE, 1],
  [RARE_CANDY, 2],
  [GREAT_BALL, 2],
  [POTION, 2],
  [SWITCH, 1],
  [ENERGY_SEARCH, 1],
  [WATER, 24],
];

export const HOENN_BOSSES = {
  roxanne: { name: 'Roxanne', title: 'Rustboro Gym Leader', kind: 'gymLeader', deckName: 'Rock Fossils', deck: ROXANNE_DECK, gym: { city: 'Rustboro', type: 'fighting', badge: 'stone-badge', trainers: ['Youngster Josh', 'Youngster Tommy', 'Hiker Marc'] } },
  brawly: { name: 'Brawly', title: 'Dewford Gym Leader', kind: 'gymLeader', deckName: 'Big Wave', deck: BRAWLY_DECK, gym: { city: 'Dewford', type: 'fighting', badge: 'knuckle-badge', trainers: ['Black Belt Takao', 'Battle Girl Jocelyn', 'Battle Girl Laura', 'Black Belt Cristian', 'Battle Girl Lilith', 'Sailor Brenden'] } },
  wattson: { name: 'Wattson', title: 'Mauville Gym Leader', kind: 'gymLeader', deckName: 'Dynamo', deck: WATTSON_DECK, gym: { city: 'Mauville', type: 'lightning', badge: 'dynamo-badge', trainers: ['Guitarist Shawn', 'Battle Girl Vivian', 'Youngster Ben', 'Guitarist Kirk', 'Bug Maniac Angelo'] } },
  flannery: { name: 'Flannery', title: 'Lavaridge Gym Leader', kind: 'gymLeader', deckName: 'Eruption', deck: FLANNERY_DECK, gym: { city: 'Lavaridge', type: 'fire', badge: 'heat-badge', trainers: ['Kindler Cole', 'Cooltrainer Gerald', 'Kindler Axle', 'Battle Girl Danielle', 'Kindler Jace', 'Kindler Keegan', 'Kindler Jeff', 'Hiker Eli'] } },
  norman: {
    name: 'Norman',
    title: 'Petalburg Gym Leader',
    kind: 'gymLeader',
    deckName: 'Slack Off',
    deck: NORMAN_DECK,
    gym: { city: 'Petalburg', type: 'colorless', badge: 'balance-badge', trainers: ['Cooltrainer Mary', 'Cooltrainer Randall', 'Cooltrainer Parker', 'Cooltrainer Alexia', 'Cooltrainer George', 'Cooltrainer Jody', 'Cooltrainer Berke'], favorites: ['Slakoth', 'Vigoroth', 'Slaking', 'Zigzagoon', 'Linoone', 'Spinda', 'Kecleon', 'Skitty', 'Delcatty', 'Swablu', 'Taillow', 'Swellow'] },
    types: ['colorless'],
  },
  winona: {
    name: 'Winona',
    title: 'Fortree Gym Leader',
    kind: 'gymLeader',
    deckName: 'Sky Dance',
    deck: WINONA_DECK,
    gym: { city: 'Fortree', type: 'colorless', badge: 'feather-badge', trainers: ['Bird Keeper Jared', 'Camper Flint', 'Picnicker Ashley', 'Bird Keeper Edwardo', 'Bird Keeper Humberto', 'Bird Keeper Darius'], favorites: ['Swablu', 'Altaria', 'Taillow', 'Swellow', 'Wingull', 'Pelipper', 'Skarmory', 'Tropius', 'Pidgey', 'Pidgeotto', 'Pidgeot', 'Doduo', 'Dodrio'] },
    types: ['colorless'],
  },
  'tate-liza': { name: 'Tate & Liza', title: 'Mossdeep Gym Leaders', kind: 'gymLeader', deckName: 'Twin Eclipse', deck: TATE_LIZA_DECK, gym: { city: 'Mossdeep', type: 'psychic', badge: 'mind-badge', trainers: ['Psychic Preston', 'Psychic Blake', 'Psychic Maura', 'Psychic Samantha', 'Psychic Virgil', 'Psychic Hannah', 'Gentleman Nate', 'Hex Maniac Sylvia', 'Gentleman Clifford', 'Psychic Macey', 'Hex Maniac Kathleen', 'Psychic Nicholas'] }, types: ['psychic', 'fighting'] },
  juan: { name: 'Juan', title: 'Sootopolis Gym Leader', kind: 'gymLeader', deckName: 'Water Pulse', deck: JUAN_DECK, gym: { city: 'Sootopolis', type: 'water', badge: 'rain-badge', trainers: ['Lass Andrea', 'Beauty Connie', 'Lady Brianna', 'Beauty Bridget', 'Beauty Tiffany', 'Pokéfan Bethany', 'Lass Crissy', 'Beauty Olivia', 'Lady Daphne', 'Pokéfan Annika'] } },
  sidney: { name: 'Sidney', title: 'Elite Four', kind: 'eliteFour', deckName: 'Dark Intimidation', deck: SIDNEY_DECK, types: ['darkness', 'grass'] },
  phoebe: { name: 'Phoebe', title: 'Elite Four', kind: 'eliteFour', deckName: 'Spirit Bond', deck: PHOEBE_DECK },
  glacia: { name: 'Glacia', title: 'Elite Four', kind: 'eliteFour', deckName: 'Frozen Pride', deck: GLACIA_DECK },
  drake: { name: 'Drake', title: 'Elite Four', kind: 'eliteFour', deckName: 'Dragon Rush', deck: DRAKE_DECK, types: ['colorless'] },
  wallace: { name: 'Wallace', title: 'Champion', kind: 'champion', deckName: 'Elegant Tide', deck: WALLACE_DECK, prize: 'hoenn-champion-ribbon' },
} satisfies Record<string, Boss>;
