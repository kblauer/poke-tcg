// Unova's bosses for Gen 5 runs (issue #231): the gym leaders, the Elite Four and Champion Alder of Pokémon Black and
// White. Striaton City's gym has three leaders, Cilan, Chili and Cress: a run meets one of them at random (the user's,
// 2026-11-15), each with his own deck (UNOVA_GYMS' first slot, bosses.ts). Opelucid City's is Drayden, Black's leader (the
// archives the maps come from are Black's). No Game Boy TCG plays the Black & White era, so their decks are our own, as
// Johto's, Hoenn's and Sinnoh's are: built around each character's team in Black and White, from Gen 5's sets only
// (GEN5_SETS), with Gen 5's basic Energy (Black & White prints) and Trainers, and the Supporters that print a character
// (Cilan, Elesa, Skyla, Caitlin) in their own decks. No ACE SPEC. Their Gym Trainers are the trainers in their gym in Black
// (tools/routes/bw/bw_data.py's `gyms`: each gym zone's people whose scripts are trainers'; Nacrene Gym has only one).
// `favorites` for a gym whose type has no basic Energy (Lenora's Normal, Skyla's Flying, Drayden's Dragon: the Colorless
// prints of his lines).
// A Unova boss is the same as a Kanto one (Boss, bosses.ts; a type-only import, so no cycle), with no Game Boy counterpart.
import type { Boss } from './bosses.js';
import type { DeckList } from './decks.js';
import { GEN5_BASIC_ENERGY, GEN5_DOUBLE_COLORLESS } from './pool.js';

// Gen 5's basic Energy (Black & White, pool.ts) and Double Colorless.
const GRASS = GEN5_BASIC_ENERGY.grass!;
const FIRE = GEN5_BASIC_ENERGY.fire!;
const WATER = GEN5_BASIC_ENERGY.water!;
const LIGHTNING = GEN5_BASIC_ENERGY.lightning!;
const PSYCHIC = GEN5_BASIC_ENERGY.psychic!;
const FIGHTING = GEN5_BASIC_ENERGY.fighting!;
const DARKNESS = GEN5_BASIC_ENERGY.darkness!;
const METAL = GEN5_BASIC_ENERGY.metal!;
const DOUBLE_COLORLESS = GEN5_DOUBLE_COLORLESS;

// The Trainers every deck shares (16 cards): draw, search, heal, switch and a Pokémon Catcher.
const JUNIPER = 'bw1-101'; // Professor Juniper
const CHEREN = 'bw2-91'; // Cheren
const N = 'bw3-101'; // N
const COMMUNICATION = 'bw1-99'; // Pokémon Communication
const LEVEL_BALL = 'bw4-89'; // Level Ball
const ULTRA_BALL = 'bw5-102'; // Ultra Ball
const POTION = 'bw1-100'; // Potion
const SWITCH = 'bw1-104'; // Switch
const ENERGY_SEARCH = 'bw1-93'; // Energy Search
const CATCHER = 'bw2-95'; // Pokémon Catcher
const SHARED: DeckList = [
  [JUNIPER, 3],
  [CHEREN, 2],
  [N, 1],
  [COMMUNICATION, 2],
  [LEVEL_BALL, 1],
  [ULTRA_BALL, 1],
  [POTION, 2],
  [SWITCH, 2],
  [ENERGY_SEARCH, 1],
  [CATCHER, 1],
];
const RARE_CANDY = 'bw5-100'; // Rare Candy
const PLUSPOWER = 'bw1-96'; // PlusPower
const MAX_POTION = 'bw2-94'; // Max Potion

/** The three Striaton leaders' Lillipup line (each one's team in Black and White: Lillipup and his elemental monkey). */
const LILLIPUP_LINE: DeckList = [
  ['bw1-81', 3], // Lillipup
  ['bw1-82', 2], // Herdier
  ['bw7-122', 1], // Stoutland
];

/** Cilan (Striaton City, Grass): Lillipup and Pansage, with Whimsicott. */
const CILAN_DECK: DeckList = [
  ...LILLIPUP_LINE,
  ['bw2-1', 2], // Pansage
  ['bw4-6', 2], // Pansage
  ['bw1-8', 2], // Simisage
  ['bw2-2', 1], // Simisage
  ['bw2-10', 2], // Cottonee
  ['bw2-12', 2], // Whimsicott
  ...SHARED,
  ['bw4-86', 2], // Cilan
  [RARE_CANDY, 1],
  [GRASS, 24],
];

/** Chili (Striaton City, Fire): Lillipup and Pansear, with Darmanitan. */
const CHILI_DECK: DeckList = [
  ...LILLIPUP_LINE,
  ['bw4-15', 2], // Pansear
  ['bw2-18', 2], // Pansear
  ['bw3-17', 2], // Simisear
  ['bw2-19', 1], // Simisear
  ['bw1-23', 2], // Darumaka
  ['bw1-25', 2], // Darmanitan
  ...SHARED,
  [RARE_CANDY, 1],
  [PLUSPOWER, 1],
  [FIRE, 25],
];

/** Cress (Striaton City, Water): Lillipup and Panpour, with Basculin. */
const CRESS_DECK: DeckList = [
  ...LILLIPUP_LINE,
  ['bw4-28', 2], // Panpour
  ['bw2-22', 2], // Panpour
  ['bw2-23', 2], // Simipour
  ['bw1-34', 1], // Simipour
  ['bw4-30', 2], // Basculin
  ['bw2-24', 1], // Basculin
  ...SHARED,
  [RARE_CANDY, 1],
  [MAX_POTION, 1],
  [WATER, 26],
];

/** Lenora (Nacrene City, Normal): Watchog and Stoutland, with Cinccino and Audino. Any Energy pays for them. */
const LENORA_DECK: DeckList = [
  ['bw1-78', 4], // Patrat
  ['bw1-79', 2], // Watchog
  ['bw8-113', 1], // Watchog
  ['bw1-81', 3], // Lillipup
  ['bw1-82', 2], // Herdier
  ['bw7-122', 2], // Stoutland
  ['bw4-84', 2], // Minccino
  ['bw4-85', 2], // Cinccino
  ['bw2-83', 1], // Audino
  ...SHARED,
  [RARE_CANDY, 2],
  [PLUSPOWER, 1],
  [DOUBLE_COLORLESS, 4],
  [LIGHTNING, 18],
];

/** Burgh (Castelia City, Bug): Leavanny, Crustle and Whirlipede. */
const BURGH_DECK: DeckList = [
  ['bw2-4', 4], // Sewaddle
  ['bw2-5', 3], // Swadloon
  ['bw8-10', 2], // Leavanny
  ['bw5-7', 3], // Dwebble
  ['bw5-8', 2], // Crustle
  ['bw7-72', 2], // Venipede
  ['bw7-73', 2], // Whirlipede
  ...SHARED,
  [RARE_CANDY, 2],
  [GRASS, 18],
  [PSYCHIC, 6],
];

/** Elesa (Nimbasa City, Electric): Emolga and Zebstrika, with Galvantula. */
const ELESA_DECK: DeckList = [
  ['bw6-45', 3], // Emolga
  ['bw4-49', 1], // Emolga
  ['bw4-47', 4], // Blitzle
  ['bw3-36', 2], // Zebstrika
  ['bw1-42', 1], // Zebstrika
  ['bw5-42', 3], // Joltik
  ['bw5-43', 2], // Galvantula
  ...SHARED,
  ['bw11-RC20', 2], // Elesa
  [LIGHTNING, 26],
];

/** Clay (Driftveil City, Ground): Krookodile, Excadrill and Palpitoad. */
const CLAY_DECK: DeckList = [
  ['bw1-63', 4], // Sandile
  ['bw2-61', 3], // Krokorok
  ['bw2-62', 2], // Krookodile
  ['bw2-54', 2], // Drilbur
  ['bw5-55', 2], // Drilbur
  ['bw2-57', 2], // Excadrill
  ['bw5-56', 1], // Excadrill
  ['bw3-22', 2], // Tympole
  ['bw3-23', 1], // Palpitoad
  ...SHARED,
  [RARE_CANDY, 1],
  [FIGHTING, 20],
  [WATER, 4],
];

/** Skyla (Mistralton City, Flying): Swoobat, Unfezant and Swanna. */
const SKYLA_DECK: DeckList = [
  ['bw7-123', 4], // Pidove
  ['bw7-124', 3], // Tranquill
  ['bw7-125', 2], // Unfezant
  ['bw2-36', 3], // Woobat
  ['bw2-37', 2], // Swoobat
  ['bw7-42', 3], // Ducklett
  ['bw2-27', 2], // Swanna
  ...SHARED,
  ['bw7-134', 2], // Skyla
  [RARE_CANDY, 1],
  [DOUBLE_COLORLESS, 4],
  [WATER, 10],
  [PSYCHIC, 8],
];

/** Brycen (Icirrus City, Ice): Vanillish, Cryogonal and Beartic. */
const BRYCEN_DECK: DeckList = [
  ['bw4-31', 4], // Vanillite
  ['bw4-32', 3], // Vanillish
  ['bw4-33', 2], // Vanilluxe
  ['bw3-32', 2], // Cryogonal
  ['bw7-46', 1], // Cryogonal
  ['bw2-29', 3], // Cubchoo
  ['bw2-30', 2], // Beartic
  ['bw8-41', 1], // Beartic
  ...SHARED,
  [RARE_CANDY, 2],
  [WATER, 24],
];

/** Drayden (Opelucid City, Dragon): Fraxure, Druddigon and Haxorus. Their Dragon prints attack with Fighting and Metal Energy. */
const DRAYDEN_DECK: DeckList = [
  ['bw10-67', 3], // Axew
  ['dv1-13', 1], // Axew
  ['bw10-68', 2], // Fraxure
  ['dv1-14', 1], // Fraxure
  ['dv1-15', 1], // Fraxure
  ['dv1-16', 2], // Haxorus
  ['bw10-69', 1], // Haxorus
  ['bw3-89', 3], // Druddigon
  ...SHARED,
  [RARE_CANDY, 3],
  [PLUSPOWER, 1],
  [MAX_POTION, 1],
  [DOUBLE_COLORLESS, 4],
  [FIGHTING, 11],
  [METAL, 10],
];

/** Shauntal (Elite Four, Ghost): Cofagrigus, Golurk, Chandelure and Jellicent. */
const SHAUNTAL_DECK: DeckList = [
  ['bw3-45', 3], // Yamask
  ['bw3-47', 2], // Cofagrigus
  ['bw3-57', 3], // Litwick
  ['bw3-59', 2], // Lampent
  ['bw3-60', 2], // Chandelure
  ['bw6-58', 3], // Golett
  ['bw6-59', 2], // Golurk
  ['bw4-34', 2], // Frillish
  ['bw4-35', 1], // Jellicent
  ...SHARED,
  [RARE_CANDY, 1],
  [PSYCHIC, 19],
  [WATER, 4],
];

/** Grimsley (Elite Four, Dark): Liepard, Scrafty, Krookodile and Bisharp. */
const GRIMSLEY_DECK: DeckList = [
  ['bw2-64', 3], // Purrloin
  ['bw2-65', 2], // Liepard
  ['bw4-73', 3], // Scraggy
  ['bw4-74', 2], // Scrafty
  ['bw5-64', 3], // Sandile
  ['bw5-65', 2], // Krokorok
  ['bw5-66', 2], // Krookodile
  ['bw9-71', 2], // Pawniard
  ['bw9-73', 2], // Bisharp
  ...SHARED,
  [RARE_CANDY, 1],
  [DARKNESS, 22],
];

/** Caitlin (Elite Four, Psychic): Musharna, Sigilyph, Reuniclus and Gothitelle. */
const CAITLIN_DECK: DeckList = [
  ['bw1-48', 3], // Munna
  ['bw1-49', 2], // Musharna
  ['bw2-41', 1], // Sigilyph
  ['bw6-52', 1], // Sigilyph
  ['bw1-55', 4], // Solosis
  ['bw1-56', 2], // Duosion
  ['bw3-53', 2], // Reuniclus
  ['bw2-44', 3], // Gothita
  ['bw2-46', 2], // Gothorita
  ['bw2-48', 1], // Gothitelle
  ...SHARED,
  ['bw10-78', 2], // Caitlin
  [RARE_CANDY, 1],
  [PSYCHIC, 20],
];

/** Marshal (Elite Four, Fighting): Throh, Sawk, Conkeldurr and Mienshao. */
const MARSHAL_DECK: DeckList = [
  ['bw1-61', 2], // Throh
  ['bw10-51', 1], // Throh
  ['bw1-62', 2], // Sawk
  ['bw6-69', 1], // Sawk
  ['bw8-79', 4], // Timburr
  ['bw8-80', 3], // Gurdurr
  ['bw3-65', 2], // Conkeldurr
  ['bw3-69', 3], // Mienfoo
  ['bw3-70', 2], // Mienshao
  ...SHARED,
  [RARE_CANDY, 1],
  [PLUSPOWER, 1],
  [FIGHTING, 22],
];

/**
 * Alder (Champion): Volcarona, Accelgor, Escavalier, Bouffalant and Druddigon (his Vanilluxe left out: a fourth type's
 * Energy would leave the deck too thin in each).
 */
const ALDER_DECK: DeckList = [
  ['bw5-20', 3], // Larvesta
  ['bw5-22', 2], // Volcarona
  ['bw3-21', 1], // Volcarona
  ['bw3-11', 2], // Shelmet
  ['bw3-12', 2], // Accelgor
  ['bw10-6', 2], // Karrablast
  ['bw10-61', 2], // Escavalier
  ['bw1-91', 2], // Bouffalant
  ['bw3-89', 2], // Druddigon
  ...SHARED,
  [MAX_POTION, 1],
  [DOUBLE_COLORLESS, 4],
  [FIRE, 11],
  [GRASS, 6],
  [METAL, 4],
];

/** Each Striaton leader's gym: the same gym, city and badge; his own type (his Gym Trainer's deck is of the leader the run meets). */
const striaton = (type: 'grass' | 'fire' | 'water') => ({ city: 'Striaton', type, badge: 'trio-badge', trainers: ['Waiter Maxwell', 'Waitress Tia'] });

export const UNOVA_BOSSES = {
  cilan: { name: 'Cilan', title: 'Striaton Gym Leader', kind: 'gymLeader', deckName: 'Leaf Course', deck: CILAN_DECK, gym: striaton('grass') },
  chili: { name: 'Chili', title: 'Striaton Gym Leader', kind: 'gymLeader', deckName: 'Flame Course', deck: CHILI_DECK, gym: striaton('fire') },
  cress: { name: 'Cress', title: 'Striaton Gym Leader', kind: 'gymLeader', deckName: 'Aqua Course', deck: CRESS_DECK, gym: striaton('water') },
  lenora: {
    name: 'Lenora',
    title: 'Nacrene Gym Leader',
    kind: 'gymLeader',
    deckName: 'Head Curator',
    deck: LENORA_DECK,
    gym: { city: 'Nacrene', type: 'colorless', badge: 'basic-badge', trainers: ['School Kid Carter'], favorites: ['Patrat', 'Watchog', 'Lillipup', 'Herdier', 'Stoutland', 'Minccino', 'Cinccino', 'Audino', 'Bouffalant', 'Deerling', 'Sawsbuck'] },
    types: ['colorless'],
  },
  burgh: { name: 'Burgh', title: 'Castelia Gym Leader', kind: 'gymLeader', deckName: 'Bug Gallery', deck: BURGH_DECK, gym: { city: 'Castelia', type: 'grass', badge: 'insect-badge', trainers: ['Harlequin Louis', 'Harlequin Jack'] } },
  elesa: { name: 'Elesa', title: 'Nimbasa Gym Leader', kind: 'gymLeader', deckName: 'Electric Runway', deck: ELESA_DECK, gym: { city: 'Nimbasa', type: 'lightning', badge: 'bolt-badge', trainers: ['Lady Magnolia', 'Rich Boy Cody'] } },
  clay: {
    name: 'Clay',
    title: 'Driftveil Gym Leader',
    kind: 'gymLeader',
    deckName: 'Gold Rush',
    deck: CLAY_DECK,
    gym: { city: 'Driftveil', type: 'fighting', badge: 'quake-badge', trainers: ['Worker Sterling', 'Clerk Katie', 'Clerk Isaac', 'Worker Don', 'Worker Felix'] },
  },
  skyla: {
    name: 'Skyla',
    title: 'Mistralton Gym Leader',
    kind: 'gymLeader',
    deckName: 'Sky Cargo',
    deck: SKYLA_DECK,
    gym: { city: 'Mistralton', type: 'colorless', badge: 'jet-badge', trainers: ['Pilot Ted', 'Pilot Chase', 'Worker Cliff', 'Worker Brady', 'Worker Arnold'], favorites: ['Pidove', 'Tranquill', 'Unfezant', 'Woobat', 'Swoobat', 'Ducklett', 'Swanna', 'Rufflet', 'Braviary', 'Emolga', 'Sigilyph'] },
    types: ['colorless', 'water', 'psychic'],
  },
  brycen: {
    name: 'Brycen',
    title: 'Icirrus Gym Leader',
    kind: 'gymLeader',
    deckName: 'Frozen Stage',
    deck: BRYCEN_DECK,
    gym: { city: 'Icirrus', type: 'water', badge: 'freeze-badge', trainers: ['Black Belt Grant', 'Battle Girl Miriam', 'Black Belt Kendrew', 'Battle Girl Mikiko', 'Battle Girl Chandra', 'Black Belt Thomas'] },
  },
  drayden: {
    name: 'Drayden',
    title: 'Opelucid Gym Leader',
    kind: 'gymLeader',
    deckName: 'Dragon Legend',
    deck: DRAYDEN_DECK,
    // His own lines and Deino's (his gym's Ace Trainers' Pokémon in Black): the Gym Trainer's random deck can only use their
    // Colorless and Darkness prints (a line takes one print a stage at random, generateDeck), so it holds some of them, not all.
    gym: {
      city: 'Opelucid',
      type: 'dragon',
      badge: 'legend-badge',
      trainers: ['Ace Trainer Tom', 'Ace Trainer Jose', 'Ace Trainer Olwen', 'Ace Trainer Webster', 'Ace Trainer Clara', 'Veteran Kim', 'Ace Trainer Dara'],
      favorites: ['Axew', 'Fraxure', 'Haxorus', 'Druddigon', 'Deino', 'Zweilous', 'Hydreigon'],
    },
    types: ['dragon'],
  },
  shauntal: { name: 'Shauntal', title: 'Elite Four', kind: 'eliteFour', deckName: 'Ghost Story', deck: SHAUNTAL_DECK },
  grimsley: { name: 'Grimsley', title: 'Elite Four', kind: 'eliteFour', deckName: 'Dark Gamble', deck: GRIMSLEY_DECK },
  caitlin: { name: 'Caitlin', title: 'Elite Four', kind: 'eliteFour', deckName: 'Dream Psyche', deck: CAITLIN_DECK },
  marshal: { name: 'Marshal', title: 'Elite Four', kind: 'eliteFour', deckName: 'Iron Fist', deck: MARSHAL_DECK },
  alder: { name: 'Alder', title: 'Champion', kind: 'champion', deckName: 'Unova Champion', deck: ALDER_DECK, prize: 'unova-champion-ribbon' },
} satisfies Record<string, Boss>;
