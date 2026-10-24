// Johto's bosses for Gen 2 runs: the eight gym leaders, the Elite Four and Champion Lance of Pokémon Gold, Silver and
// Crystal. No Game Boy TCG plays the Neo and e-Card sets, so their decks are our own (agreed with the user): built
// around each character's team in the games (as HeartGold and SoulSilver have it), from Gen 2's sets only (GEN2_SETS:
// Neo Genesis to Skyridge, with Southern Islands), with Gen 2's basic Energy (Neo Genesis prints) and Trainers; every
// Gen 2 set's card effects are done (GEN2_DONE_SETS).
// A Johto boss is the same as a Kanto one (Boss, bosses.ts; a type-only import, so no cycle), with no Game Boy counterpart:
// `favorites` are the Pokémon their Gym Trainer's random deck is built from first (for gyms whose type has no basic
// Energy); `trainers` who their Gym Trainer may be (HGSS's in their gym; Olivine's the Lighthouse's).
import type { Boss } from './bosses.js';
import type { DeckList } from './decks.js';
import { GEN2_BASIC_ENERGY } from './pool.js';

// Gen 2's basic Energy (Neo Genesis, pool.ts) and special Energy.
const GRASS = GEN2_BASIC_ENERGY.grass!;
const FIRE = GEN2_BASIC_ENERGY.fire!;
const WATER = GEN2_BASIC_ENERGY.water!;
const LIGHTNING = GEN2_BASIC_ENERGY.lightning!;
const PSYCHIC = GEN2_BASIC_ENERGY.psychic!;
const FIGHTING = GEN2_BASIC_ENERGY.fighting!;
const DARKNESS = 'neo1-104'; // Darkness Energy (special)
const METAL = 'neo1-19'; // Metal Energy (special)

/** Falkner (Violet City, Flying): Pidgeot, Noctowl and Fearow. All Colorless attacks, so any Energy pays. */
const FALKNER_DECK: DeckList = [
  ['ecard1-123', 4], // Pidgey
  ['ecard1-88', 3], // Pidgeotto
  ['ecard1-59', 2], // Pidgeot
  ['neo1-60', 4], // Hoothoot
  ['neo1-42', 3], // Noctowl
  ['ecard1-130', 3], // Spearow
  ['ecard1-45', 2], // Fearow
  ['neo3-43', 1], // Farfetch'd
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard3-124', 2], // Fast Ball
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['neo1-93', 2], // Gold Berry
  ['neo1-100', 1], // Double Gust
  ['neo1-97', 2], // Sprout Tower (Violet City's)
  [PSYCHIC, 21],
];

/** Bugsy (Azalea Town, Bug): Butterfree, Beedrill and Scyther. */
const BUGSY_DECK: DeckList = [
  ['ecard1-96', 4], // Caterpie
  ['ecard1-87', 3], // Metapod
  ['ecard1-38', 2], // Butterfree
  ['neo2-70', 4], // Weedle
  ['neo2-41', 3], // Kakuna
  ['neo2-18', 2], // Beedrill
  ['neo4-55', 3], // Scyther
  ['ecard3-64', 2], // Heracross
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['neo1-98', 1], // Super Scoop Up
  ['neo1-93', 2], // Gold Berry
  ['ecard1-140', 2], // Energy Removal 2
  ['neo1-84', 1], // Ecogym
  [GRASS, 21],
];

/** Whitney (Goldenrod City, Normal): Miltank and Clefable, with Granbull and Ursaring. */
const WHITNEY_DECK: DeckList = [
  ['ecard1-101', 4], // Clefairy
  ['ecard1-41', 2], // Clefable
  ['neo1-20', 1], // Cleffa
  ['neo1-41', 3], // Miltank
  ['ecard2-94', 1], // Miltank
  ['neo1-74', 3], // Snubbull
  ['ecard3-61', 2], // Granbull
  ['ecard3-109', 3], // Teddiursa
  ['ecard3-110', 2], // Ursaring
  ['neo3-41', 2], // Aipom
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-101', 3], // Moo-Moo Milk
  ['neo4-95', 2], // Radio Tower (Goldenrod's)
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['ecard1-146', 1], // Pokémon Reversal
  ['neo1-86', 1], // Focus Band
  [FIGHTING, 22],
];

/** Morty (Ecruteak City, Ghost): Gengar and Misdreavus, with Xatu and Girafarig. */
const MORTY_DECK: DeckList = [
  ['ecard1-109', 4], // Gastly
  ['ecard1-80', 3], // Haunter
  ['ecard1-48', 2], // Gengar
  ['neo3-11', 3], // Misdreavus
  ['ecard3-39', 1], // Misdreavus
  ['ecard3-58', 2], // Girafarig
  ['ecard3-80', 3], // Natu
  ['neo2-52', 2], // Xatu
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['ecard1-140', 2], // Energy Removal 2
  ['neo1-93', 2], // Gold Berry
  ['neo1-100', 1], // Double Gust
  ['neo1-89', 1], // Super Energy Retrieval
  [PSYCHIC, 24],
];

/** Chuck (Cianwood City, Fighting): Poliwrath and Primeape, with Machamp. */
const CHUCK_DECK: DeckList = [
  ['ecard2-92', 4], // Mankey
  ['ecard2-29', 3], // Primeape
  ['ecard1-125', 4], // Poliwag
  ['ecard1-89', 3], // Poliwhirl
  ['neo2-9', 2], // Poliwrath (Fighting)
  ['ecard1-117', 3], // Machop
  ['ecard1-85', 2], // Machoke
  ['ecard1-51', 1], // Machamp
  ['ecard2-81', 1], // Hitmonchan
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['ecard1-140', 2], // Energy Removal 2
  ['ecard1-150', 2], // Strength Charm
  ['ecard1-146', 1], // Pokémon Reversal
  [FIGHTING, 17],
  [WATER, 5],
];

/** Jasmine (Olivine City, Steel): Steelix and Magneton, with Skarmory and Forretress. */
const JASMINE_DECK: DeckList = [
  ['neo2-26', 4], // Magnemite (Metal)
  ['neo3-10', 3], // Magneton (Metal)
  ['si1-3', 4], // Onix
  ['neo1-15', 3], // Steelix
  ['neo1-13', 2], // Skarmory
  ['neo2-61', 3], // Pineco
  ['neo2-21', 2], // Forretress
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['neo1-93', 2], // Gold Berry
  ['neo1-89', 1], // Super Energy Retrieval
  ['ecard1-140', 2], // Energy Removal 2
  ['neo1-86', 1], // Focus Band
  ['neo1-98', 1], // Super Scoop Up
  ['ecard1-153', 1], // Energy Search
  [LIGHTNING, 12],
  [METAL, 4],
  [FIGHTING, 5],
];

/** Pryce (Mahogany Town, Ice): Dewgong and Piloswine, with Cloyster, Jynx and Lapras. */
const PRYCE_DECK: DeckList = [
  ['neo4-81', 4], // Seel
  ['ecard3-7', 3], // Dewgong
  ['neo1-79', 4], // Swinub
  ['neo1-44', 3], // Piloswine (Water)
  ['ecard1-129', 3], // Shellder
  ['ecard1-42', 2], // Cloyster
  ['ecard1-83', 2], // Jynx
  ['ecard3-49', 1], // Delibird
  ['ecard3-71', 1], // Lapras
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['neo1-93', 2], // Gold Berry
  ['ecard1-140', 2], // Energy Removal 2
  ['neo1-86', 1], // Focus Band
  [WATER, 22],
];

/** Clair (Blackthorn City, Dragon): Kingdra and Dragonite, with Gyarados. */
const CLAIR_DECK: DeckList = [
  ['ecard2-85', 4], // Horsea
  ['neo1-48', 3], // Seadra
  ['neo1-8', 2], // Kingdra
  ['ecard1-107', 4], // Dratini
  ['ecard1-75', 3], // Dragonair
  ['ecard1-43', 1], // Dragonite
  ['ecard1-118', 3], // Magikarp
  ['ecard3-11', 2], // Gyarados
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['neo1-93', 2], // Gold Berry
  ['ecard1-140', 1], // Energy Removal 2
  ['neo1-100', 1], // Double Gust
  ['neo1-89', 1], // Super Energy Retrieval
  ['neo1-86', 1], // Focus Band
  [WATER, 15],
  [LIGHTNING, 4],
  [FIGHTING, 3],
];

/** Will (Elite Four, Psychic): Xatu, Exeggutor, Slowking and Jynx. */
const WILL_DECK: DeckList = [
  ['neo1-67', 4], // Natu
  ['neo1-52', 3], // Xatu
  ['ecard2-77', 4], // Exeggcute
  ['ecard2-13', 3], // Exeggutor (Psychic)
  ['neo1-73', 4], // Slowpoke
  ['ecard2-34', 2], // Slowking
  ['ecard2-33', 1], // Slowbro
  ['ecard2-18', 2], // Jynx (Psychic)
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 2], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard3-127', 1], // Hyper Potion
  ['ecard1-156', 1], // Potion
  ['ecard1-157', 2], // Switch
  ['ecard1-140', 2], // Energy Removal 2
  ['ecard1-146', 1], // Pokémon Reversal
  ['neo1-86', 1], // Focus Band
  [PSYCHIC, 18],
  [WATER, 4],
];

/** Koga (Elite Four, Poison): Crobat, Ariados, Venomoth and Muk. */
const JOHTO_KOGA_DECK: DeckList = [
  ['neo2-64', 4], // Spinarak
  ['ecard2-3', 3], // Ariados
  ['ecard3-112', 3], // Venonat
  ['ecard3-111', 2], // Venomoth
  ['ecard3-118', 4], // Zubat
  ['ecard3-60', 3], // Golbat
  ['ecard3-6', 2], // Crobat
  ['ecard2-79', 2], // Grimer
  ['ecard2-23', 1], // Muk
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['neo1-98', 1], // Super Scoop Up
  ['ecard1-140', 2], // Energy Removal 2
  ['ecard1-154', 1], // Full Heal
  ['neo1-100', 1], // Double Gust
  [GRASS, 21],
];

/** Bruno (Elite Four, Fighting): Machamp, Onix and the three Hitmons. */
const JOHTO_BRUNO_DECK: DeckList = [
  ['neo4-73', 4], // Machop
  ['ecard3-38', 3], // Machoke
  ['ecard3-16', 2], // Machamp
  ['neo1-69', 3], // Onix
  ['neo4-69', 2], // Hitmonchan
  ['neo4-42', 2], // Hitmonlee
  ['neo2-3', 2], // Hitmontop
  ['neo2-66', 2], // Tyrogue
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['ecard1-150', 2], // Strength Charm
  ['ecard1-140', 2], // Energy Removal 2
  ['ecard1-146', 1], // Pokémon Reversal
  ['neo1-89', 1], // Super Energy Retrieval
  [FIGHTING, 24],
];

/** Karen (Elite Four, Dark): Umbreon, Houndoom and Murkrow, with Vileplume. */
const KAREN_DECK: DeckList = [
  ['neo2-38', 4], // Eevee
  ['neo2-13', 2], // Umbreon
  ['ecard2-41', 1], // Umbreon
  ['neo3-46', 3], // Murkrow
  ['ecard2-86', 4], // Houndour (Fire)
  ['ecard2-14', 2], // Houndoom (Fire)
  ['neo2-4', 1], // Houndoom (Darkness)
  ['ecard1-122', 2], // Oddish
  ['ecard1-78', 1], // Gloom
  ['ecard1-69', 1], // Vileplume
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 1], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard1-156', 2], // Potion
  ['ecard1-157', 2], // Switch
  ['ecard1-140', 2], // Energy Removal 2
  ['neo1-100', 1], // Double Gust
  ['neo1-93', 1], // Gold Berry
  ['ecard1-146', 1], // Pokémon Reversal
  [DARKNESS, 4],
  [FIRE, 14],
  [GRASS, 6],
];

/** Lance (Champion, Dragon): Dragonite, Gyarados and Charizard. */
const JOHTO_LANCE_DECK: DeckList = [
  ['ecard3-75', 4], // Magikarp
  ['ecard3-11', 3], // Gyarados
  ['ecard1-107', 4], // Dratini
  ['ecard1-75', 3], // Dragonair
  ['ecard1-9', 2], // Dragonite
  ['ecard1-97', 3], // Charmander
  ['ecard1-73', 2], // Charmeleon
  ['ecard1-39', 1], // Charizard
  ['neo1-96', 3], // Professor Elm
  ['ecard1-149', 2], // Professor Oak's Research
  ['neo1-102', 2], // Pokémon March
  ['ecard3-127', 1], // Hyper Potion
  ['ecard1-157', 2], // Switch
  ['neo1-93', 2], // Gold Berry
  ['ecard1-140', 1], // Energy Removal 2
  ['ecard2-134', 1], // Super Energy Removal 2
  ['neo1-100', 1], // Double Gust
  ['neo1-86', 1], // Focus Band
  [WATER, 10],
  [FIRE, 6],
  [LIGHTNING, 4],
  [FIGHTING, 2],
];

export const JOHTO_BOSSES = {
  falkner: {
    name: 'Falkner',
    title: 'Violet Gym Leader',
    kind: 'gymLeader',
    deckName: 'Flying Squad',
    deck: FALKNER_DECK,
    gym: { city: 'Violet', type: 'colorless', badge: 'zephyr-badge', trainers: ['Bird Keeper Abe', 'Bird Keeper Rod'], favorites: ['Pidgey', 'Pidgeotto', 'Pidgeot', 'Hoothoot', 'Noctowl', 'Spearow', 'Fearow', "Farfetch'd", 'Doduo', 'Dodrio'] },
    types: ['colorless'],
  },
  bugsy: { name: 'Bugsy', title: 'Azalea Gym Leader', kind: 'gymLeader', deckName: 'Swarm', deck: BUGSY_DECK, gym: { city: 'Azalea', type: 'grass', badge: 'hive-badge', trainers: ['Bug Catcher Al', 'Bug Catcher Benny', 'Bug Catcher Josh'] } },
  whitney: {
    name: 'Whitney',
    title: 'Goldenrod Gym Leader',
    kind: 'gymLeader',
    deckName: 'Rollout',
    deck: WHITNEY_DECK,
    gym: { city: 'Goldenrod', type: 'colorless', badge: 'plain-badge', trainers: ['Lass Cathy', 'Lass Carrie', 'Beauty Victoria', 'Beauty Samantha'], favorites: ['Clefairy', 'Clefable', 'Miltank', 'Snubbull', 'Granbull', 'Teddiursa', 'Ursaring', 'Aipom', 'Girafarig', 'Stantler'] },
    types: ['colorless'],
  },
  morty: { name: 'Morty', title: 'Ecruteak Gym Leader', kind: 'gymLeader', deckName: 'Shadow Haunt', deck: MORTY_DECK, gym: { city: 'Ecruteak', type: 'psychic', badge: 'fog-badge', trainers: ['Medium Georgina', 'Medium Grace', 'Medium Edith', 'Medium Martha'] } },
  chuck: { name: 'Chuck', title: 'Cianwood Gym Leader', kind: 'gymLeader', deckName: 'Waterfall Fist', deck: CHUCK_DECK, gym: { city: 'Cianwood', type: 'fighting', badge: 'storm-badge', trainers: ['Black Belt Yoshi', 'Black Belt Lao', 'Black Belt Nob', 'Black Belt Lung'] } },
  jasmine: {
    name: 'Jasmine',
    title: 'Olivine Gym Leader',
    kind: 'gymLeader',
    deckName: 'Iron Guard',
    deck: JASMINE_DECK,
    gym: { city: 'Olivine', type: 'metal', badge: 'mineral-badge', trainers: ['Gentleman Alfred', 'Sailor Huey', 'Sailor Kent', 'Bird Keeper Denis', 'Bird Keeper Theo', 'Lass Connie', 'Gentleman Preston', 'Sailor Terrell', 'Sailor Roberto'], favorites: ['Magnemite', 'Magneton', 'Onix', 'Steelix', 'Skarmory', 'Pineco', 'Forretress', 'Scyther', 'Scizor'] },
    types: ['metal', 'lightning'],
  },
  pryce: { name: 'Pryce', title: 'Mahogany Gym Leader', kind: 'gymLeader', deckName: 'Deep Freeze', deck: PRYCE_DECK, gym: { city: 'Mahogany', type: 'water', badge: 'glacier-badge', trainers: ['Skier Jill', 'Skier Diana', 'Boarder Deandre', 'Boarder Gerardo', 'Boarder Patton'] } },
  clair: {
    name: 'Clair',
    title: 'Blackthorn Gym Leader',
    kind: 'gymLeader',
    deckName: "Dragon's Den",
    deck: CLAIR_DECK,
    gym: { city: 'Blackthorn', type: 'water', badge: 'rising-badge', trainers: ['Ace Trainer Paulo', 'Ace Trainer Lola', 'Ace Trainer Cody', 'Ace Trainer Fran', 'Ace Trainer Mike'], favorites: ['Dratini', 'Dragonair', 'Dragonite', 'Horsea', 'Seadra', 'Kingdra', 'Magikarp', 'Gyarados'] },
  },
  will: { name: 'Will', title: 'Elite Four', kind: 'eliteFour', deckName: 'Mind Games', deck: WILL_DECK },
  'johto-koga': { name: 'Koga', title: 'Elite Four', kind: 'eliteFour', deckName: 'Poison Mist', deck: JOHTO_KOGA_DECK },
  'johto-bruno': { name: 'Bruno', title: 'Elite Four', kind: 'eliteFour', deckName: 'Fighting Spirit', deck: JOHTO_BRUNO_DECK },
  karen: { name: 'Karen', title: 'Elite Four', kind: 'eliteFour', deckName: 'Dark Arts', deck: KAREN_DECK, types: ['darkness', 'fire', 'grass'] },
  'johto-lance': { name: 'Lance', title: 'Champion', kind: 'champion', deckName: 'Dragon Master', deck: JOHTO_LANCE_DECK, prize: 'johto-champion-ribbon' },
} satisfies Record<string, Boss>;
