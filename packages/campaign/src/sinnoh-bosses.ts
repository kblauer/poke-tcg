// Sinnoh's bosses for Gen 4 runs: the eight gym leaders, the Elite Four and Champion Cynthia of Pokémon Diamond and Pearl.
// No Game Boy TCG plays the Diamond & Pearl era, so their decks are our own, as Johto's and Hoenn's are: built around each
// character's team in Diamond and Pearl, from Gen 4's sets only (GEN4_SETS), with Gen 4's basic Energy (Diamond & Pearl
// prints) and Trainers. Rising Rivals and Supreme Victors print these characters' own Pokémon (Pokémon SP: "GL" for a
// gym leader's, "E4" for the Elite Four's, "C" for the Champion's), so each deck holds its owner's, a Pokémon LV.X at
// most as its star, and the Elite Four's and Cynthia's their own Supporters. The E4 cards are their Platinum teams'
// Pokémon, so those decks mix the two games' teams. Their Gym Trainers are the trainers in their gym in Diamond (pret's
// pokediamond, every room of the gym: the gym's map events and Eterna's gym script).
// A Sinnoh boss is the same as a Kanto one (Boss, bosses.ts; a type-only import, so no cycle), with no Game Boy counterpart.
import type { Boss } from './bosses.js';
import type { DeckList } from './decks.js';
import { GEN4_BASIC_ENERGY, GEN4_DOUBLE_COLORLESS } from './pool.js';

// Gen 4's basic Energy (Diamond & Pearl, pool.ts) and Double Colorless.
const GRASS = GEN4_BASIC_ENERGY.grass!;
const FIRE = GEN4_BASIC_ENERGY.fire!;
const WATER = GEN4_BASIC_ENERGY.water!;
const LIGHTNING = GEN4_BASIC_ENERGY.lightning!;
const PSYCHIC = GEN4_BASIC_ENERGY.psychic!;
const FIGHTING = GEN4_BASIC_ENERGY.fighting!;
const METAL = GEN4_BASIC_ENERGY.metal!;
const DOUBLE_COLORLESS = GEN4_DOUBLE_COLORLESS;

// The Trainers most decks share.
const OAKS_NEW_THEORY = 'hgss1-101'; // Professor Oak's New Theory
const COLLECTOR = 'hgss1-97'; // Pokémon Collector
const BEBES_SEARCH = 'dp2-109'; // Bebe's Search
const RARE_CANDY = 'dp4-102'; // Rare Candy
const QUICK_BALL = 'dp2-114'; // Quick Ball
const POTION = 'dp1-118'; // Potion
const SWITCH = 'dp1-119'; // Switch
const ENERGY_SEARCH = 'dp1-117'; // Energy Search
const REVERSAL = 'hgss1-99'; // Pokémon Reversal
const PLUSPOWER = 'dp1-109'; // PlusPower
const NIGHT_MAINTENANCE = 'dp2-113'; // Night Maintenance
const FOSSIL_EXCAVATOR = 'dp2-111'; // Fossil Excavator

/** Roark (Oreburgh City, Rock): Geodude, Onix and Cranidos, the Rampardos line from the Skull Fossil. */
const ROARK_DECK: DeckList = [
  ['pl3-105', 4], // Geodude
  ['dp2-51', 3], // Graveler
  ['pl4-19', 1], // Golem
  ['dp7-69', 2], // Onix
  ['pl1-120', 3], // Skull Fossil
  ['pl1-46', 3], // Cranidos
  ['pl1-13', 2], // Rampardos
  ['pl2-11', 1], // Rampardos GL
  [OAKS_NEW_THEORY, 3],
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [FOSSIL_EXCAVATOR, 1],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [FIGHTING, 24],
];

/** Gardenia (Eterna City, Grass): Cherubi, Turtwig and Roserade. */
const GARDENIA_DECK: DeckList = [
  ['dp1-75', 3], // Cherubi
  ['dp7-14', 2], // Cherrim
  ['dp5-77', 3], // Turtwig
  ['pl1-49', 2], // Grotle
  ['dp5-30', 2], // Torterra
  ['pl2-85', 1], // Turtwig GL
  ['dp3-62', 3], // Roselia
  ['dp1-13', 2], // Roserade
  ['pl2-12', 1], // Roserade GL
  [OAKS_NEW_THEORY, 3],
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [GRASS, 25],
];

/** Maylene (Veilstone City, Fighting): Meditite, Machoke and Lucario. */
const MAYLENE_DECK: DeckList = [
  ['dp1-89', 3], // Meditite
  ['dp1-32', 2], // Medicham
  ['hgss4-67', 3], // Machop
  ['hgss4-40', 2], // Machoke
  ['hgss4-26', 1], // Machamp
  ['dp6-117', 4], // Riolu
  ['dp1-6', 2], // Lucario
  ['dp2-122', 1], // Lucario LV.X
  ['pl2-8', 1], // Lucario GL
  [OAKS_NEW_THEORY, 3],
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [FIGHTING, 25],
];

/** Crasher Wake (Pastoria City, Water): Gyarados, Quagsire and Floatzel. */
const CRASHER_WAKE_DECK: DeckList = [
  ['dp2-89', 4], // Magikarp
  ['hgss1-4', 2], // Gyarados
  ['dp3-118', 3], // Wooper
  ['hgss1-9', 2], // Quagsire
  ['pl2-76', 1], // Quagsire GL
  ['dp4-61', 4], // Buizel
  ['dp1-26', 2], // Floatzel
  ['pl2-4', 1], // Floatzel GL
  ['pl2-104', 1], // Floatzel GL LV.X
  [OAKS_NEW_THEORY, 3],
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [PLUSPOWER, 1],
  [NIGHT_MAINTENANCE, 1],
  [WATER, 24],
];

/** Fantina (Hearthome City, Ghost): Drifblim, Gengar and Mismagius. */
const FANTINA_DECK: DeckList = [
  ['dp6-92', 3], // Drifloon
  ['dp6-53', 2], // Drifblim
  ['pl4-64', 3], // Gastly
  ['pl4-42', 2], // Haunter
  ['pl4-17', 2], // Gengar
  ['pl2-40', 1], // Gengar GL
  ['dp1-91', 3], // Misdreavus
  ['pl1-55', 2], // Mismagius
  ['pl2-10', 1], // Mismagius GL
  ['pl2-110', 1], // Mismagius GL LV.X
  [OAKS_NEW_THEORY, 3],
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [PSYCHIC, 24],
];

/** Byron (Canalave City, Steel): Bronzor, Steelix and Bastiodon from the Armor Fossil. */
const BYRON_DECK: DeckList = [
  ['hgss4-58', 3], // Bronzor
  ['pl4-14', 2], // Bronzong
  ['dp7-69', 3], // Onix
  ['dp1-38', 2], // Steelix
  ['pl2-51', 1], // Steelix GL
  ['pl1-119', 3], // Armor Fossil
  ['dp2-63', 3], // Shieldon
  ['pl1-20', 2], // Bastiodon
  ['pl2-2', 1], // Bastiodon GL
  [OAKS_NEW_THEORY, 3],
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [FOSSIL_EXCAVATOR, 1],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [METAL, 23],
];

/** Candice (Snowpoint City, Ice): Snover, Piloswine and Abomasnow, with Froslass. */
const CANDICE_DECK: DeckList = [
  ['dp7-74', 3], // Snover
  ['dp7-12', 2], // Abomasnow
  ['hgss4-79', 4], // Swinub
  ['hgss4-48', 2], // Piloswine
  ['hgss4-5', 2], // Mamoswine
  ['pl2-27', 1], // Mamoswine GL
  ['pl4-75', 3], // Snorunt
  ['pl4-2', 2], // Froslass
  [OAKS_NEW_THEORY, 3],
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [NIGHT_MAINTENANCE, 1],
  [WATER, 24],
];

/** Volkner (Sunyshore City, Electric): Raichu, Ambipom and Luxray. */
const VOLKNER_DECK: DeckList = [
  ['dp5-70', 3], // Pikachu
  ['hgss1-10', 2], // Raichu
  ['pl2-31', 1], // Raichu GL
  ['hgss4-55', 2], // Aipom
  ['hgss4-13', 2], // Ambipom
  ['pl3-126', 4], // Shinx
  ['dp6-62', 3], // Luxio
  ['dp6-8', 2], // Luxray
  ['pl2-9', 1], // Luxray GL
  ['pl2-109', 1], // Luxray GL LV.X
  [OAKS_NEW_THEORY, 3],
  ['pl2-98', 2], // Volkner's Philosophy
  [COLLECTOR, 1],
  [BEBES_SEARCH, 1],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [LIGHTNING, 23],
];

/** Aaron (Elite Four, Bug): Dustox, Beautifly, Vespiquen and Heracross, with his Platinum Yanmega. */
const AARON_DECK: DeckList = [
  ['dp1-104', 4], // Wurmple
  ['dp1-44', 2], // Cascoon
  ['dp1-25', 1], // Dustox
  ['dp1-63', 2], // Silcoon
  ['dp1-19', 1], // Beautifly
  ['pl1-71', 3], // Combee
  ['dp7-31', 2], // Vespiquen
  ['pl2-35', 1], // Vespiquen E4
  ['dp1-28', 1], // Heracross
  ['pl2-24', 1], // Heracross E4
  ['pl2-37', 1], // Yanmega E4
  [OAKS_NEW_THEORY, 3],
  ['pl2-88', 2], // Aaron's Collection
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [GRASS, 23],
];

/** Bertha (Elite Four, Ground): Quagsire, Sudowoodo, Whiscash and Hippowdon, with her Platinum Golem, Gliscor and Rhyperior. */
const BERTHA_DECK: DeckList = [
  ['pl2-64', 3], // Hippopotas
  ['pl2-25', 2], // Hippowdon
  ['pl2-107', 1], // Hippowdon LV.X
  ['pl2-42', 1], // Hippowdon E4
  ['pl2-23', 1], // Golem E4
  ['pl2-62', 1], // Gliscor E4
  ['pl2-32', 1], // Rhyperior E4
  ['dp2-72', 2], // Barboach
  ['dp2-40', 1], // Whiscash
  ['pl2-54', 1], // Whiscash E4
  ['dp5-48', 2], // Sudowoodo
  ['dp3-118', 2], // Wooper
  ['hgss1-9', 1], // Quagsire
  [OAKS_NEW_THEORY, 3],
  ['pl2-90', 2], // Bertha's Warmth
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [FIGHTING, 25],
];

/** Flint (Elite Four, Fire): Infernape, Rapidash and Lopunny, with his Platinum Flareon and Houndoom. */
const FLINT_DECK: DeckList = [
  ['dp1-76', 3], // Chimchar
  ['dp1-56', 2], // Monferno
  ['dp1-5', 2], // Infernape
  ['dp1-121', 1], // Infernape LV.X
  ['pl2-43', 1], // Infernape E4
  ['dp1-94', 3], // Ponyta
  ['hgss4-8', 2], // Rapidash
  ['pl2-47', 1], // Rapidash E4
  ['pl2-60', 1], // Flareon E4
  ['pl2-65', 1], // Houndoom E4
  ['pl3-94', 2], // Buneary
  ['pl3-63', 1], // Lopunny
  [OAKS_NEW_THEORY, 3],
  ['pl2-91', 2], // Flint's Willpower
  [COLLECTOR, 2],
  [BEBES_SEARCH, 1],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 1],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [FIRE, 24],
];

/** Lucian (Elite Four, Psychic): Mr. Mime, Medicham, Alakazam and Bronzong, with his Platinum Espeon and Gallade. */
const LUCIAN_DECK: DeckList = [
  ['pl2-38', 2], // Alakazam E4
  ['pl2-103', 1], // Alakazam E4 LV.X
  ['pl2-28', 1], // Mr. Mime E4
  ['pl3-37', 1], // Mr. Mime
  ['pl2-18', 1], // Espeon E4
  ['pl2-20', 1], // Gallade E4
  ['pl2-106', 1], // Gallade E4 LV.X
  ['dp7-55', 3], // Bronzor
  ['dp7-13', 2], // Bronzong
  ['pl2-16', 1], // Bronzong E4
  ['pl3-113', 3], // Meditite
  ['pl3-34', 2], // Medicham
  [OAKS_NEW_THEORY, 3],
  ['pl2-92', 2], // Lucian's Assignment
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [PSYCHIC, 25],
];

/** Cynthia (Champion): Garchomp, Spiritomb, Roserade, Gastrodon, Lucario and Milotic, Supreme Victors' own. */
const CYNTHIA_DECK: DeckList = [
  ['pl3-106', 4], // Gible
  ['pl3-59', 3], // Gabite
  ['pl3-5', 2], // Garchomp
  ['pl3-60', 1], // Garchomp C
  ['pl3-145', 1], // Garchomp C LV.X
  ['pl3-84', 1], // Spiritomb C
  ['pl3-40', 1], // Roserade C
  ['pl3-31', 1], // Lucario C
  ['pl3-35', 1], // Milotic C
  ['pl2-79', 2], // Shellos East Sea
  ['pl2-21', 2], // Gastrodon East Sea
  ['dp6-16', 1], // Spiritomb
  [OAKS_NEW_THEORY, 3],
  ['pl3-136', 2], // Cynthia's Guidance
  ['dp6-131', 1], // Cynthia's Feelings
  [COLLECTOR, 2],
  [BEBES_SEARCH, 2],
  [RARE_CANDY, 2],
  [QUICK_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [REVERSAL, 1],
  [DOUBLE_COLORLESS, 4],
  [WATER, 8],
  [PSYCHIC, 5],
  [FIGHTING, 4],
];

export const SINNOH_BOSSES = {
  roark: { name: 'Roark', title: 'Oreburgh Gym Leader', kind: 'gymLeader', deckName: 'Rock Smash', deck: ROARK_DECK, gym: { city: 'Oreburgh', type: 'fighting', badge: 'coal-badge', trainers: ['Youngster Jonathon', 'Youngster Darius'] } },
  gardenia: { name: 'Gardenia', title: 'Eterna Gym Leader', kind: 'gymLeader', deckName: 'Forest Bloom', deck: GARDENIA_DECK, gym: { city: 'Eterna', type: 'grass', badge: 'forest-badge', trainers: ['Aroma Lady Jenna', 'Aroma Lady Angela', 'Lass Caroline'] } },
  maylene: { name: 'Maylene', title: 'Veilstone Gym Leader', kind: 'gymLeader', deckName: 'Aura Sphere', deck: MAYLENE_DECK, gym: { city: 'Veilstone', type: 'fighting', badge: 'cobble-badge', trainers: ['Black Belt Colby', 'Black Belt Darren', 'Black Belt Rafael', 'Black Belt Jeffery'] } },
  'crasher-wake': {
    name: 'Crasher Wake',
    title: 'Pastoria Gym Leader',
    kind: 'gymLeader',
    deckName: 'Tidal Crash',
    deck: CRASHER_WAKE_DECK,
    gym: { city: 'Pastoria', type: 'water', badge: 'fen-badge', trainers: ['Tuber Jacky', 'Sailor Damian', 'Tuber Caitlyn', 'Sailor Samson', 'Fisherman Erick', 'Fisherman Walter'] },
  },
  fantina: {
    name: 'Fantina',
    title: 'Hearthome Gym Leader',
    kind: 'gymLeader',
    deckName: 'Phantom Waltz',
    deck: FANTINA_DECK,
    gym: { city: 'Hearthome', type: 'psychic', badge: 'relic-badge', trainers: ['Youngster Donny', 'Lass Molly', 'Camper Drew', 'Picnicker Cheyenne', 'School Kid Chance', 'School Kid Mackenzie', 'Ace Trainer Allen', 'Ace Trainer Catherine'] },
  },
  byron: {
    name: 'Byron',
    title: 'Canalave Gym Leader',
    kind: 'gymLeader',
    deckName: 'Iron Wall',
    deck: BYRON_DECK,
    gym: { city: 'Canalave', type: 'metal', badge: 'mine-badge', trainers: ['Black Belt David', 'Worker Jackson', 'Worker Gary', 'Black Belt Ricky', 'Ace Trainer Cesar', 'Worker Gerardo', 'Ace Trainer Breanna'] },
  },
  candice: {
    name: 'Candice',
    title: 'Snowpoint Gym Leader',
    kind: 'gymLeader',
    deckName: 'Diamond Dust',
    deck: CANDICE_DECK,
    gym: { city: 'Snowpoint', type: 'water', badge: 'icicle-badge', trainers: ['Ace Trainer Anton', 'Ace Trainer Savannah', 'Ace Trainer Alicia', 'Ace Trainer Isaiah', 'Ace Trainer Brenna', 'Ace Trainer Sergio'] },
  },
  volkner: {
    name: 'Volkner',
    title: 'Sunyshore Gym Leader',
    kind: 'gymLeader',
    deckName: 'Beacon Spark',
    deck: VOLKNER_DECK,
    gym: { city: 'Sunyshore', type: 'lightning', badge: 'beacon-badge', trainers: ['School Kid Tiera', 'School Kid Forrest', 'Guitarist Jerry', 'Poké Kid Meghan', 'Ace Trainer Destiny', 'Guitarist Preston', 'Guitarist Lonnie', 'Ace Trainer Zachery'] },
  },
  aaron: { name: 'Aaron', title: 'Elite Four', kind: 'eliteFour', deckName: 'Bug Swarm', deck: AARON_DECK },
  bertha: { name: 'Bertha', title: 'Elite Four', kind: 'eliteFour', deckName: 'Earth Shaker', deck: BERTHA_DECK },
  flint: { name: 'Flint', title: 'Elite Four', kind: 'eliteFour', deckName: 'Burning Spirit', deck: FLINT_DECK },
  lucian: { name: 'Lucian', title: 'Elite Four', kind: 'eliteFour', deckName: 'Mind Reader', deck: LUCIAN_DECK },
  cynthia: { name: 'Cynthia', title: 'Champion', kind: 'champion', deckName: 'Champion Garchomp', deck: CYNTHIA_DECK, prize: 'sinnoh-champion-ribbon', types: ['colorless', 'water'] },
} satisfies Record<string, Boss>;
