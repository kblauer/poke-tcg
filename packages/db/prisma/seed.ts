// Loads the TCGdex card snapshot (prisma/data/tcgdex-wotc.json: the WOTC era and Generation 3's EX sets), then the hand-made cards TCGdex doesn't
// have (prisma/data/custom-cards.json), into the database, with the holo Energy made from the packs' basic Energy
// (holo-energy.ts).
// Idempotent: re-running updates existing rows. Refresh the snapshot with `pnpm cards:fetch`.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma, type Prisma } from '../src/index.js';
import { HOLO_ENERGY_SETS, holoEnergyCards, reverseHoloCard } from './holo-energy.js';
import { CUSTOM_PATH, SNAPSHOT_PATH, type CardSnapshot, type TcgdexCard } from './tcgdex.js';

const KIND = { Pokemon: 'POKEMON', Trainer: 'TRAINER', Energy: 'ENERGY' } as const;
/** Upserts in flight at once. No transaction: the seed is idempotent, so a partial run is safe to re-run. */
const CONCURRENCY = 20;

const load = async (file: string) => JSON.parse(await readFile(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8')) as CardSnapshot;
const [tcgdex, custom] = await Promise.all([load(SNAPSHOT_PATH), load(CUSTOM_PATH)]);
const cards = [...tcgdex.cards, ...custom.cards];
const holoEnergy = cards.filter((c) => c.category === 'Energy' && c.energyType === 'Normal' && HOLO_ENERGY_SETS.includes(c.set.id)).flatMap(holoEnergyCards);
// Reverse-holo prints of the EX cards (holo-energy.ts).
const official = new Map(tcgdex.sets.map((s) => [s.id, s.cardCount.official]));
const reverseHolos = cards.flatMap((c) => reverseHoloCard(c, official.get(c.set.id) ?? Infinity) ?? []);
const snapshot = { sets: [...tcgdex.sets, ...custom.sets], cards: [...cards, ...holoEnergy, ...reverseHolos] };

/** Where TCGdex's data differs from the printed card (checked against the card image), by card id. */
/** EX Team Magma vs Team Aqua's evolutions: TCGdex has no "Evolves from" for any of them (read from the printed cards). */
const EX4_EVOLVES_FROM: Record<string, Partial<TcgdexCard>> = Object.fromEntries(
  Object.entries({
    1: "Team Aqua's Cacnea",
    2: "Team Aqua's Corphish",
    4: "Team Aqua's Electrike",
    5: "Team Aqua's Carvanha",
    6: "Team Aqua's Sealeo",
    7: "Team Magma's Lairon",
    8: "Team Magma's Baltoy",
    10: "Team Magma's Houndour",
    11: "Team Magma's Rhyhorn",
    13: 'Pikachu',
    14: "Team Aqua's Corphish",
    15: "Team Aqua's Poochyena",
    16: "Team Aqua's Spheal",
    18: "Team Aqua's Carvanha",
    19: "Team Magma's Numel",
    20: "Team Magma's Aron",
    21: "Team Magma's Poochyena",
    22: "Team Magma's Rhyhorn",
    28: "Team Aqua's Chinchou",
    29: "Team Aqua's Electrike",
    30: "Team Aqua's Poochyena",
    31: "Team Aqua's Spheal",
    33: "Team Magma's Baltoy",
    34: "Team Magma's Houndour",
    36: "Team Magma's Aron",
    37: "Team Magma's Poochyena",
    89: 'Combusken',
    90: 'Lileep',
    93: 'Grovyle',
  }).map(([n, from]) => [`ex4-${n}`, { evolveFrom: from }]),
);

const TCGDEX_FIXES: Record<string, Partial<TcgdexCard>> = {
  // Wizards Promo 7 Jigglypuff: 50 HP as printed (TCGdex has 70).
  'basep-7': { hp: 50 },
  // Southern Islands Marill: TCGdex has none of its attacks.
  'si1-11': {
    attacks: [
      { name: 'Squirt', cost: ['Water'], damage: null, effect: "Choose 1 of your opponent's Pokémon. This attack does 10 damage to that Pokémon. Don't apply Weakness and Resistance." },
      { name: 'Rolling Tackle', cost: ['Colorless', 'Colorless'], damage: '20', effect: null },
    ],
  },
  // Neo Destiny Shining Tyranitar: TCGdex has its attacks' costs and damage only.
  'neo4-113': {
    attacks: [
      { name: 'Mountain Crush', cost: ['Darkness', 'Fighting', 'Fighting'], damage: '30', effect: 'Flip a coin until you get tails. For each heads, your opponent discards the top card from his or her deck.' },
      {
        name: 'Destructive Fire',
        cost: ['Darkness', 'Fire', 'Fire', 'Fire'],
        damage: '50',
        effect:
          'Flip a coin for each Fire Energy card attached to Shining Tyranitar. For each heads, discard a Fire Energy card attached to Shining Tyranitar or this attack does nothing. Then, for each heads, choose an Energy card attached to the Defending Pokémon and discard it. If it has fewer Energy cards than that, remove all of them.',
      },
    ],
  },
  // Legendary Collection Jolteon: TCGdex spells Pin Missile "Pin Missle".
  'lc-14': {
    attacks: [
      { name: 'Quick Attack', cost: ['Colorless', 'Colorless'], damage: '10+', effect: 'Flip a coin. If heads, this attack does 10 damage plus 20 more damage; if tails, this attack does 10 damage.' },
      { name: 'Pin Missile', cost: ['Lightning', 'Lightning', 'Colorless'], damage: '20×', effect: 'Flip 4 coins. This attack does 20 damage times the number of heads.' },
    ],
  },
  // Legendary Collection Grimer: TCGdex calls Minimize "Minimized".
  'lc-78': {
    attacks: [
      { name: 'Nasty Goo', cost: ['Colorless'], damage: '10', effect: 'Flip a coin. If heads, the Defending Pokémon is now Paralyzed.' },
      { name: 'Minimize', cost: ['Grass'], damage: null, effect: "All damage done by attacks to Grimer during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance)." },
    ],
  },
  // Expedition: Weakness and Resistance TCGdex gives cards printed without them (the Babies have neither), two missing
  // "Evolves from", Ninetales' Ethereal Flame damage, Caterpie's misspelt attack and Hoppip's garbled attacks.
  ...Object.fromEntries(['ecard1-5', 'ecard1-7', 'ecard1-15', 'ecard1-24', 'ecard1-39', 'ecard1-40', 'ecard1-41', 'ecard1-46', 'ecard1-60', 'ecard1-72', 'ecard1-73', 'ecard1-83', 'ecard1-87', 'ecard1-110'].map((id) => [id, { resistances: null }])),
  ...Object.fromEntries(['ecard1-17', 'ecard1-22', 'ecard1-52'].map((id) => [id, { weaknesses: null, resistances: null }])),
  ...Object.fromEntries(['ecard1-43', 'ecard1-58', 'ecard1-75', 'ecard1-107'].map((id) => [id, { weaknesses: null }])),
  'ecard1-35': { resistances: null, evolveFrom: 'Ekans' },
  'ecard1-37': { evolveFrom: 'Wartortle' },
  'hgss2-16': { evolveFrom: 'Buizel' },
  'ecard1-57': {
    attacks: [
      { name: 'Mislead', cost: ['Fire', 'Colorless'], damage: null, effect: 'Flip 2 coins. If either of them is heads, the Defending Pokémon is now Confused.' },
      { name: 'Ethereal Flame', cost: ['Colorless', 'Colorless', 'Colorless'], damage: '30+', effect: 'Discard all Fire Energy cards attached to Ninetales. This attack does 30 damage plus 20 more damage for each card discarded this way.' },
    ],
  },
  'ecard1-96': {
    attacks: [
      { name: 'Headbutt', cost: ['Colorless'], damage: '10', effect: null },
      { name: 'Entangling Thread', cost: ['Colorless', 'Colorless'], damage: '10', effect: 'Flip a coin. If heads, the Defending Pokémon is now Paralyzed.' },
    ],
  },
  'ecard1-112': { attacks: [{ name: 'Sleep Powder', cost: ['Grass'], damage: '10', effect: 'The Defending Pokémon is now Asleep.' }] },
  // Expedition Multi Technical Machine 01: TCGdex leaves out its attack.
  'ecard1-144': {
    effect:
      "Attach this card to 1 of your Pokémon in play. That Pokémon may use this card's attack instead of its own. At the end of your turn, discard Multi Technical Machine 01. Attack: Paralyzing Gaze (Colorless): The Defending Pokémon is now Paralyzed.",
  },
  // Aquapolis Smeargle: TCGdex spells Doubleslap "Doublslap".
  'ecard2-109': {
    attacks: [
      { name: 'Paint Trick', cost: ['Colorless'], damage: null, effect: 'Flip a coin. If heads, the Defending Pokémon is now Confused. Then, choose 1 of your Benched Pokémon and switch Smeargle with it.' },
      { name: 'Doubleslap', cost: ['Colorless', 'Colorless'], damage: '20×', effect: 'Flip 2 coins. This attack does 20 damage times the number of heads.' },
    ],
  },
  // Aquapolis's Cubes (Technical Machines): TCGdex leaves out their attacks.
  ...Object.fromEntries(
    (
      [
        ['ecard2-119', 'Darkness', 'Plunder (Darkness) 10: Before doing damage, discard any Trainer cards attached to the Defending Pokémon.'],
        ['ecard2-121', 'Fighting', 'Violent Rage (Fighting) 10×: Flip a number of coins equal to the number of damage counters on this Pokémon. This attack does 10 damage times the number of heads.'],
        ['ecard2-122', 'Fire', 'Singe (Fire): The Defending Pokémon is now Burned.'],
        ['ecard2-124', 'Grass', 'Sleep Poison (Grass): The Defending Pokémon is now Asleep and Poisoned.'],
        ['ecard2-127', 'Lightning', 'Discharge (Lightning) 40×: Discard all Lightning Energy cards attached to this Pokémon. Then, flip a number of coins equal to the number of Energy cards discarded that way. This attack does 40 damage times the number of heads.'],
        ['ecard2-129', 'Metal', "Metal Reversal (Metal) 10: Before doing damage, you may choose 1 of your opponent's Benched Pokémon and switch it with the Defending Pokémon."],
        ['ecard2-132', 'Psychic', 'Psy Confuse (Psychic): The Defending Pokémon is now Confused.'],
        ['ecard2-140', 'Water', "Splatter (Water): Choose 1 of your opponent's Pokémon. This attack does 20 damage to that Pokémon. Don't apply Weakness or Resistance."],
      ] as const
    ).map(([id, type, attack]) => {
      const cube = `${type} Cube 01`;
      return [id, { effect: `Attach this card to 1 of your ${type} Pokémon in play. That Pokémon may use this card's attack instead of its own. At the end of your turn, discard ${cube}. Attack: ${attack}` }];
    }),
  ),
  // Skyridge Omanyte: printed without Resistance.
  'ecard3-41': { resistances: null },
  // Skyridge's Miracle Spheres: α's text names itself (TCGdex: "Miracle Plate α"); γ's Thunder Force costs Lightning.
  'ecard3-129': {
    effect: 'Attach this card to 1 of your Evolved Fire, Lightning, or Fighting Pokémon in play. That Pokémon may use this card\'s attack instead of its own. At the end of your turn, discard Miracle Sphere α.',
    attacks: [
      {
        name: 'Fire Force',
        cost: ['Fire', 'Colorless', 'Colorless'],
        damage: '30+',
        effect:
          'If the Pokémon using this attack has Fire and Lightning basic Energy cards attached to it, the Defending Pokémon is now Confused. If the Pokémon using this attack has Fire and Fighting basic Energy cards attached to it, this attack does 30 damage plus 10 more damage and removes 3 damage counters from the Pokémon that Miracle Sphere α is attached to.',
      },
    ],
  },
  'ecard3-131': {
    attacks: [
      {
        name: 'Thunder Force',
        cost: ['Lightning', 'Colorless', 'Colorless'],
        damage: '30+',
        effect:
          "If the Pokémon using this attack has Grass and Lightning basic Energy cards attached to it, the Defending Pokémon is now Asleep and Poisoned. If the Pokémon using this attack has Water and Lightning basic Energy cards attached to it, this attack does 30 damage plus 10 more damage and lets you put 1 damage counter on each of your opponent's Benched Pokémon.",
      },
    ],
  },
  // Southern Islands Tentacruel: TCGdex lists both attacks twice; the printed card Paralyzes with Poison Sting.
  'si1-10': {
    attacks: [
      { name: 'Tentacle Grip', cost: ['Water'], damage: null, effect: 'Flip a number of coins equal to the number of Water Energy cards attached to Tentacruel. For each heads, draw 2 cards.' },
      { name: 'Poison Sting', cost: ['Water', 'Water'], damage: '20', effect: 'Flip a coin. If heads, the Defending Pokémon is now Paralyzed.' },
    ],
  },
  // EX Sandstorm Espeon, Lombre and Vigoroth, and EX Dragon Graveler: TCGdex's typos, and Big Explosion's damage (none printed).
  'ex2-16': {
    attacks: [
      { name: 'Confuse Ray', cost: ['Psychic'], damage: '20', effect: 'Flip a coin. If heads, the Defending Pokémon is now Confused.' },
      { name: 'Energy Crush', cost: ['Colorless', 'Colorless', 'Colorless'], damage: '20+', effect: "Does 20 damage plus 10 more damage for each Energy attached to all of your opponent's Pokémon." },
    ],
  },
  'ex2-46': {
    attacks: [
      { name: 'Surprise', cost: ['Colorless'], damage: '10', effect: "Choose 1 card from your opponent's hand without looking. Look at the card you chose, then have your opponent shuffle that card into his or her deck." },
      { name: 'Fury Swipes', cost: ['Colorless', 'Colorless'], damage: '20×', effect: 'Flip 3 coins. This attack does 20 damage times the number of heads.' },
    ],
  },
  'ex2-52': {
    attacks: [
      { name: 'Focus Energy', cost: ['Colorless'], damage: null, effect: "During your next turn, the base damage of Vigoroth's Slash attack is 90 instead of 40." },
      { name: 'Slash', cost: ['Colorless', 'Colorless', 'Colorless'], damage: '40', effect: null },
    ],
  },
  'ex3-29': {
    attacks: [
      { name: 'Grind', cost: ['Colorless'], damage: '10×', effect: 'Does 10 damage times the amount of Energy attached to Graveler.' },
      { name: 'Big Explosion', cost: ['Fighting', 'Fighting', 'Colorless', 'Colorless'], damage: null, effect: "Does 80 damage to each Active Pokémon (both yours and your opponent's)." },
    ],
  },
  ...EX4_EVOLVES_FROM,
  // EX Team Magma vs Team Aqua Swampert ex: Crushing Wave prints no damage (TCGdex has "20+"); its text does 40 to the chosen Pokémon.
  'ex4-95': {
    evolveFrom: 'Marshtomp',
    attacks: [
      { name: 'Hyper Pump', cost: ['Colorless'], damage: '20+', effect: "Does 20 damage plus 20 more damage for each basic Energy attached to Swampert ex but not used to pay for this attack's Energy cost. You can't add more than 80 damage in this way." },
      { name: 'Crushing Wave', cost: ['Water', 'Colorless', 'Colorless'], damage: null, effect: "Choose 1 of your opponent's Pokémon. This attack does 40 damage to that Pokémon. After doing damage, flip a coin. If heads, your opponent discards an Energy card, if any, attached to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" },
    ],
  },
  // EX FireRed & LeafGreen (from the printed cards): Marowak's Linear Attack costs [F][C] and prints no damage; Electrode ex's
  // attack is Crush and Burn; Articuno ex, Moltres ex and Zapdos ex have Legendary Ascent, which TCGdex leaves empty.
  'ex6-7': {
    attacks: [
      { name: 'Linear Attack', cost: ['Fighting', 'Colorless'], damage: null, effect: "Choose 1 of your opponent's Pokémon. This attack does 30 damage to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" },
      { name: 'Vengeance', cost: ['Fighting', 'Colorless', 'Colorless'], damage: '30+', effect: "Does 30 damage plus 10 more damage for each Basic Pokémon and each Evolution card in your discard pile. You can't add more than 60 damage in this way." },
    ],
  },
  'ex6-107': {
    attacks: [
      { name: 'Crush and Burn', cost: ['Lightning', 'Colorless'], damage: '30+', effect: 'You may discard as many Energy as you like attached to your Pokémon in play. If you do, this attack does 30 damage plus 20 more damage for each Energy you discarded.' },
    ],
  },
  ...Object.fromEntries(
    (
      [
        ['ex6-114', 'Articuno ex', 'Water'],
        ['ex6-115', 'Moltres ex', 'Fire'],
        ['ex6-116', 'Zapdos ex', 'Lightning'],
      ] as const
    ).map(([id, name, type]) => [
      id,
      {
        abilities: [
          {
            name: 'Legendary Ascent',
            type: 'Poke-POWER',
            effect: `Once during your turn, when you put ${name} from your hand onto your Bench, you may switch 1 of your Active Pokémon with ${name}. If you do, you may also move any number of basic ${type} Energy cards attached to your Pokémon to ${name}.`,
          },
        ],
      },
    ]),
  ),
  // EX Team Rocket Returns (from the printed cards): Dark Houndoom is Fire and Darkness, Dark Dragonair Darkness only (resisting
  // Grass and Fighting), each with one Weakness; Dark Gyarados's Dark Scale, Magby's Detour, Houndour's Dark Lift (Darkness
  // Energy), Dark Slowking's Litter and Rocket's Tricky Gym have their printed text; Treecko ☆'s Spring Back does 20+.
  'ex7-5': { types: ['Fire', 'Darkness'], weaknesses: [{ type: 'Fighting', value: '×2' }], resistances: [{ type: 'Psychic', value: '-30' }] },
  'ex7-9': {
    attacks: [
      { name: 'Litter', cost: ['Psychic', 'Colorless'], damage: '20+', effect: "You may discard a combination of up to 2 Pokémon Tool cards and Rocket's Secret Machine cards from your hand. If you do, this attack does 20 damage plus 30 more damage for each card you discarded." },
    ],
  },
  'ex7-24': {
    attacks: [{ name: 'Detour', cost: ['Colorless'], damage: null, effect: 'If you have a Supporter card in play, use the effect on that card as the effect of this attack.' }],
  },
  'ex7-32': {
    types: ['Darkness'],
    weaknesses: [{ type: 'Colorless', value: '×2' }],
    resistances: [
      { type: 'Grass', value: '-30' },
      { type: 'Fighting', value: '-30' },
    ],
  },
  'ex7-36': {
    abilities: [{ name: 'Dark Scale', type: 'Poke-BODY', effect: "If Dark Gyarados is your Active Pokémon and is Knocked Out by an opponent's attack, put 3 damage counters on the Attacking Pokémon." }],
  },
  'ex7-60': {
    abilities: [{ name: 'Dark Lift', type: 'Poke-BODY', effect: 'If Houndour has any Darkness Energy attached to it, the Retreat Cost for Houndour is 0.' }],
  },
  'ex7-90': {
    effect:
      "This card stays in play when you play it. Discard this card if another Stadium card comes into play. Each Pokémon with Dark or Rocket's in its name (both yours and your opponent's) can use attacks on this card instead of its own. [C] Feint Attack: Does 20 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on that Pokémon.",
  },
  // EX Deoxys (from the printed cards): Gyarados's Pulverize is 50+, Deoxys's Barrier Attack does 20, and Rocket's Raikou
  // ex's Lightning Burst (a Darkness Energy card) is missing. EX Emerald: Mr. Stone's Project finds basic Energy cards.
  'ex8-8': {
    attacks: [
      { name: 'Dragon Spark', cost: ['Water'], damage: null, effect: "This attack does 10 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" },
      { name: 'Full Retaliation', cost: ['Colorless', 'Colorless'], damage: '20×', effect: 'Does 20 damage times the number of damage counters on all of your Magikarp.' },
      { name: 'Pulverize', cost: ['Water', 'Water', 'Colorless', 'Colorless'], damage: '50+', effect: 'If the Defending Pokémon already has at least 2 damage counters on it, this attack does 50 damage plus 50 more damage.' },
    ],
  },
  'ex8-18': {
    attacks: [{ name: 'Barrier Attack', cost: ['Psychic', 'Colorless'], damage: '20', effect: 'During your opponent\'s next turn, any damage done to Deoxys by attacks is reduced by 30 (after applying Weakness and Resistance).' }],
  },
  'ex8-108': {
    abilities: [
      {
        name: 'Lightning Burst',
        type: 'Poke-POWER',
        effect:
          "Whenever you attach a Darkness Energy card from your hand to Rocket's Raikou ex, you may choose 1 of the Defending Pokémon and switch it with 1 of your opponent's Benched Pokémon. Your opponent chooses the Benched Pokémon to switch. This power can't be used if Rocket's Raikou ex is affected by a Special Condition.",
      },
    ],
  },
  'ex9-79': {
    effect:
      'You can play only one Supporter card each turn. When you play this card, put it next to your Active Pokémon. When your turn ends, discard this card. Search your deck for up to 2 basic Energy cards, show them to your opponent, and put them into your hand. Shuffle your deck afterward. Or, search your discard pile for up to 2 basic Energy cards, show them to your opponent, and put them into your hand.',
  },
  // EX Unseen Forces Blissey ex evolves from Chansey or Chansey ex (the API adds Chansey ex: ALSO_EVOLVES_FROM); EX Delta
  // Species Magnemite's Magnetic Blast is [L] for 10.
  'ex10-101': { evolveFrom: 'Chansey' },
  'ex11-74': {
    attacks: [
      { name: 'Collect', cost: ['Colorless'], damage: null, effect: 'Draw a card.' },
      { name: 'Magnetic Blast', cost: ['Lightning'], damage: '10', effect: null },
    ],
  },
  // EX Crystal Guardians Igglybuff and EX Dragon Frontiers Snorlax δ have a Poké-Power after their Poké-Body (from the printed cards).
  'ex14-21': {
    abilities: [
      { name: 'Hover Lift', type: 'Poke-BODY', effect: 'You pay Colorless less to retreat your Jigglypuff, Wigglytuff, Wigglytuff ex, and Igglybuff.' },
      { name: 'Baby Evolution', type: 'Poke-POWER', effect: 'Once during your turn (before your attack), you may put Jigglypuff from your hand onto Igglybuff (this counts as evolving Igglybuff) and remove all damage counters from Igglybuff.' },
    ],
  },
  'ex15-10': {
    abilities: [
      { name: 'Bedhead', type: 'Poke-BODY', effect: 'As long as Snorlax remains Asleep between turns, put 2 damage counters on 1 of the Defending Pokémon.' },
      { name: 'Dozing', type: 'Poke-POWER', effect: "Once during your turn (before your attack), if Snorlax is your Active Pokémon, you may remove 2 damage counters from Snorlax and Snorlax is now Asleep. This power can't be used if Snorlax is affected by a Special Condition." },
    ],
  },
  // DP Black Star Promo Darkrai (DP24): TCGdex leaves out its held item, Enigma Berry (from the printed card), kept as a Poké-Body.
  'dpp-DP24': { abilities: [{ name: 'Enigma Berry', type: 'Poke-BODY', effect: "If Darkrai is damaged by an attack from your opponent's Fighting Pokémon, remove 4 damage counters at the end of that turn." }] },
  // EX Dragon Frontiers Vibrava δ and Xatu δ, EX Power Keepers Aggron: TCGdex has their Poké-Body and Poké-Power the wrong way round.
  'ex15-24': { abilities: [{ name: 'Psychic Wing', type: 'Poke-BODY', effect: 'If Vibrava has any Psychic Energy attached to it, the Retreat Cost for Vibrava is 0.' }] },
  'ex15-25': { abilities: [{ name: 'Extra Feather', type: 'Poke-BODY', effect: 'Each of your Stage 2 Pokémon-ex does 10 more damage to the Defending Pokémon (before applying Weakness and Resistance).' }] },
  'ex16-1': { abilities: [{ name: 'Terraforming', type: 'Poke-POWER', effect: "Once during your turn (before your attack), you may look at the top 5 cards from your deck and put them back on top of your deck in any order. This power can't be used if Aggron is affected by a Special Condition." }] },
  // EX Legend Maker Flygon ex: its second attack is Dragon Claw, and it resists Fighting too.
  'ex12-87': {
    resistances: [
      { type: 'Lightning', value: '-30' },
      { type: 'Fighting', value: '-30' },
    ],
    attacks: [
      { name: 'Reactive Blast', cost: ['Lightning', 'Colorless'], damage: '40+', effect: 'You may discard any number of React Energy cards attached to Flygon ex. If you do, this attack does 40 damage plus 30 more damage for each React Energy card you discarded.' },
      { name: 'Dragon Claw', cost: ['Grass', 'Lightning', 'Colorless', 'Colorless', 'Colorless'], damage: '100', effect: null },
    ],
  },
  'ex7-109': {
    attacks: [
      { name: 'Tackle', cost: ['Colorless'], damage: '10', effect: null },
      { name: 'Spring Back', cost: ['Grass', 'Grass'], damage: '20+', effect: 'If your opponent has only 1 Prize card left, this attack does 20 damage plus 50 more damage and the Defending Pokémon is now Poisoned.' },
    ],
  },
};

/** TCGdex's EX text often ends in a stray quote mark, and mangles some "é"s: tidied in every text. */
const tidy = (text: string | null | undefined) => (text === 'n/a' ? null : (text?.replace(/"$/, '').replace(/Pok�+mon/g, 'Pokémon') ?? null));
const tidyCard = (card: TcgdexCard): TcgdexCard => ({
  ...card,
  effect: tidy(card.effect),
  attacks: card.attacks?.map((a) => ({ ...a, effect: tidy(a.effect) })) ?? card.attacks,
  abilities: card.abilities?.map((a) => ({ ...a, effect: tidy(a.effect) ?? a.effect })) ?? card.abilities,
});

/** The fixes for a card, also for its reverse-holo print ("<id>-reverse"). */
const fixesFor = (id: string) => TCGDEX_FIXES[id] ?? TCGDEX_FIXES[id.replace(/-reverse$/, '')];

/**
 * The printed name, the same in every set: Legendary Collection and the e-Card sets spell Nidoran "Nidoran ♀" (with a
 * space), unlike the earlier sets and the Nidorina and Nidorino that evolve from them. Owners' (Giovanni's Nidoran ♀)
 * keep theirs.
 */
const printedName = (name: string) => name.replace(/^Nidoran ([♀♂])$/, 'Nidoran$1');

/**
 * TCGdex has no stage for many Pokémon-ex (EX FireRed & LeafGreen on, e.g. Blastoise ex): no "Evolves from" makes it a
 * Basic Pokémon, otherwise it's a stage above the Pokémon it evolves from (Charizard ex from Charmeleon: Stage 2). In the EX
 * sets it calls some evolving Pokémon-ex Basic (EX Dragon's Ampharos ex, from Flaaffy): they get their stage the same way.
 * (A Basic Pokémon with "Evolves from" is right in the earlier sets: one that evolves from a Baby Pokémon.)
 */
function stageOf(card: TcgdexCard): string | null {
  const exEvolving = card.stage === 'Basic' && !!card.evolveFrom && /^ex[0-9]+$/.test(card.set.id);
  if (card.category !== 'Pokemon' || (card.stage && !exEvolving)) return card.stage;
  if (!card.evolveFrom) return 'Basic';
  return printedStages().get(printedName(card.evolveFrom)) === 'Stage1' ? 'Stage2' : 'Stage1';
}

/** The printed stage of each Pokémon name (its first card's with a stage, as TCGdex gives it), built once for stageOf. */
let stages: Map<string, string> | undefined;
function printedStages(): Map<string, string> {
  if (!stages) {
    stages = new Map();
    for (const c of cards) if (c.category === 'Pokemon' && c.stage && !stages.has(printedName(c.name))) stages.set(printedName(c.name), c.stage);
  }
  return stages;
}

/**
 * Basic Energy is never holo in its base form: TCGdex says EX Emerald's, Holon Phantoms' and Power Keepers' are, but the
 * holo versions are the holo Energy (holo-energy.ts; agreed with the user). The holo Energy and reverse holos keep theirs.
 */
const notHolo = (card: TcgdexCard): TcgdexCard =>
  card.category === 'Energy' && card.energyType === 'Normal' && !card.holoEnergy && !card.reverseHolo && card.variants?.holo
    ? { ...card, variants: { ...card.variants, holo: false, normal: true } }
    : card;

function toCardRow(tcgdex: TcgdexCard) {
  const card = tidyCard(notHolo({ ...tcgdex, ...fixesFor(tcgdex.id) }));
  const { id, set, localId, name, category, image, rarity, hp, types, stage, evolveFrom, ...data } = card;
  return {
    setId: set.id,
    localId,
    name: printedName(name),
    kind: KIND[category],
    imageUrl: image,
    rarity,
    hp,
    types: types ?? [],
    // TCGdex also tags basic Energy as "Basic"; stage only matters for Pokémon.
    stage: category === 'Pokemon' ? stageOf(card) : null,
    evolveFrom,
    data: data as unknown as Prisma.InputJsonObject,
  };
}

for (const s of snapshot.sets) {
  const row = {
    name: s.name,
    series: s.series,
    releaseDate: s.releaseDate ? new Date(s.releaseDate) : null,
    cardCount: s.cardCount.total,
    logoUrl: s.logo,
    symbolUrl: s.symbol,
  };
  await prisma.cardSet.upsert({ where: { id: s.id }, create: { id: s.id, ...row }, update: row });
}
console.log(`Seeded ${snapshot.sets.length} sets`);

for (let i = 0; i < snapshot.cards.length; i += CONCURRENCY) {
  const batch = snapshot.cards.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map((card) => {
      const row = toCardRow(card);
      return prisma.card.upsert({ where: { id: card.id }, create: { id: card.id, ...row }, update: row });
    }),
  );
  process.stdout.write(`\rSeeded ${Math.min(i + CONCURRENCY, snapshot.cards.length)}/${snapshot.cards.length} cards`);
}
process.stdout.write('\n');

await prisma.$disconnect();
