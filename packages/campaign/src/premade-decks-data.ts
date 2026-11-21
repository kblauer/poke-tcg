// Premade decks' lists (premade-decks.ts; the user's, 2026-11-20): up to 10 a generation from jklaczpokemon.com's deck pages,
// each card mapped to a catalog id by name (the original print where the page names none). Researched and checked against
// the catalog (60 cards, the deck rules, every card implemented and from the deck's generation or earlier: premade-decks.test.ts).
import type { PremadeDeck } from './premade-decks.js';


export const PREMADE_GEN1: PremadeDeck[] = [
  {
    id: 'g1-alakazam-mr-mime-chansey',
    gen: 1,
    name: 'Alakazam / Mr. Mime / Chansey',
    text: 'Alakazam keeps healing Mr. Mime behind Invisible Wall while Chansey and Kangaskhan soak damage.',
    cover: 'base1-1',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#alakazam-mr-mime-chansey',
    list: [
      ['base1-43', 4], // Abra
      ['base1-32', 3], // Kadabra
      ['base1-1', 3], // Alakazam
      ['base2-5', 3], // Kangaskhan
      ['base1-3', 2], // Chansey
      ['base2-6', 2], // Mr. Mime
      ['base2-10', 2], // Scyther
      ['base3-53', 2], // Psyduck
      ['base1-81', 4], // Energy Retrieval
      ['base1-74', 3], // Item Finder
      ['base1-88', 3], // Professor Oak
      ['base1-95', 3], // Switch
      ['base1-71', 2], // Computer Search
      ['base1-85', 2], // Pokémon Center
      ['base1-77', 2], // Pokémon Trader
      ['base1-93', 1], // Gust of Wind
      ['base3-60', 1], // Gambler
      ['base1-76', 1], // Pokémon Breeder
      ['base1-101', 9], // Psychic Energy
      ['base1-99', 4], // Grass Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g1-arcanine-electrode',
    gen: 1,
    name: 'Arcanine / Electrode',
    text: 'Psyduck stops opposing searches while Electrode energises Arcanine; Lass strips Energy Removal.',
    cover: 'base1-23',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#arcanine-electrode',
    list: [
      ['base3-53', 4], // Psyduck
      ['base1-67', 4], // Voltorb
      ['base1-21', 4], // Electrode
      ['base1-28', 3], // Growlithe
      ['base1-23', 3], // Arcanine
      ['base1-50', 1], // Gastly
      ['base1-88', 4], // Professor Oak
      ['base1-91', 4], // Bill
      ['base1-71', 4], // Computer Search
      ['base1-74', 4], // Item Finder
      ['base1-75', 3], // Lass
      ['base1-95', 2], // Switch
      ['base1-77', 2], // Pokémon Trader
      ['base1-83', 2], // Maintenance
      ['base1-80', 2], // Defender
      ['base1-92', 2], // Energy Removal
      ['base1-84', 1], // PlusPower
      ['base1-93', 1], // Gust of Wind
      ['base1-101', 6], // Psychic Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g1-clefable-hitmonchan-dodrio',
    gen: 1,
    name: 'Clefable / Hitmonchan / Dodrio',
    text: 'One-Energy attackers shrug off Energy Removal while Dodrio provides free retreats.',
    cover: 'base2-1',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#clefable-hitmonchan-dodrio',
    list: [
      ['base1-48', 4], // Doduo
      ['base2-34', 3], // Dodrio
      ['base1-5', 3], // Clefairy
      ['base2-1', 3], // Clefable
      ['base1-7', 3], // Hitmonchan
      ['base1-20', 2], // Electabuzz
      ['base1-88', 4], // Professor Oak
      ['base1-91', 4], // Bill
      ['base1-92', 4], // Energy Removal
      ['base1-79', 3], // Super Energy Removal
      ['base1-93', 2], // Gust of Wind
      ['base1-84', 2], // PlusPower
      ['base1-85', 2], // Pokémon Center
      ['base1-77', 2], // Pokémon Trader
      ['base1-74', 2], // Item Finder
      ['base1-81', 1], // Energy Retrieval
      ['base1-75', 1], // Lass
      ['base1-97', 11], // Fighting Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g1-dragonite-dodrio-hitmonchan',
    gen: 1,
    name: 'Dragonite / Dodrio / Hitmonchan',
    text: 'Kangaskhan fetches the Dragonite line; Step In cures status and Dodrio retreats for free.',
    cover: 'base3-4',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#dragonite-dodrio-hitmonchan',
    list: [
      ['base1-26', 4], // Dratini
      ['base1-18', 3], // Dragonair
      ['base3-4', 3], // Dragonite
      ['base2-5', 4], // Kangaskhan
      ['base1-7', 3], // Hitmonchan
      ['base1-48', 2], // Doduo
      ['base2-34', 2], // Dodrio
      ['base2-38', 1], // Lickitung
      ['base2-6', 1], // Mr. Mime
      ['base1-91', 4], // Bill
      ['base1-81', 4], // Energy Retrieval
      ['base1-75', 3], // Lass
      ['base1-88', 2], // Professor Oak
      ['base1-77', 2], // Pokémon Trader
      ['base1-74', 2], // Item Finder
      ['base1-84', 1], // PlusPower
      ['base1-93', 1], // Gust of Wind
      ['base1-79', 1], // Super Energy Removal
      ['base1-97', 9], // Fighting Energy
      ['base1-101', 4], // Psychic Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g1-haymaker',
    gen: 1,
    name: 'Haymaker',
    text: 'Cheap one-Energy attackers with Energy removal and Scoop Up apply fast pressure.',
    cover: 'base1-7',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#haymaker',
    list: [
      ['base1-20', 3], // Electabuzz
      ['base1-7', 3], // Hitmonchan
      ['base2-10', 3], // Scyther
      ['base3-3', 2], // Ditto
      ['base1-88', 4], // Professor Oak
      ['base1-91', 4], // Bill
      ['base1-92', 4], // Energy Removal
      ['base1-79', 3], // Super Energy Removal
      ['base1-81', 3], // Energy Retrieval
      ['base1-74', 3], // Item Finder
      ['base1-78', 3], // Scoop Up
      ['base1-84', 2], // PlusPower
      ['base1-93', 2], // Gust of Wind
      ['base1-75', 2], // Lass
      ['base1-71', 1], // Computer Search
      ['base1-95', 1], // Switch
      ['base1-97', 7], // Fighting Energy
      ['base1-100', 6], // Lightning Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g1-lickitung-scyther-mr-mime',
    gen: 1,
    name: 'Lickitung / Scyther / Mr. Mime',
    text: 'Lickitung paralyses with Tongue Wrap, backed by Scoop Up and Super Energy Removal.',
    cover: 'base2-38',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#lickitung-scyther-mr-mime',
    list: [
      ['base2-38', 4], // Lickitung
      ['base2-10', 3], // Scyther
      ['base1-3', 2], // Chansey
      ['base2-6', 2], // Mr. Mime
      ['base1-10', 1], // Mewtwo
      ['base1-50', 1], // Gastly
      ['base3-3', 1], // Ditto
      ['base3-53', 1], // Psyduck
      ['base1-88', 4], // Professor Oak
      ['base1-81', 4], // Energy Retrieval
      ['base1-78', 4], // Scoop Up
      ['base1-74', 4], // Item Finder
      ['base1-79', 4], // Super Energy Removal
      ['base1-92', 3], // Energy Removal
      ['base1-84', 1], // PlusPower
      ['base1-93', 1], // Gust of Wind
      ['base1-85', 1], // Pokémon Center
      ['base3-58', 1], // Mr. Fuji
      ['base1-101', 13], // Psychic Energy
      ['base1-99', 1], // Grass Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g1-rain-dance',
    gen: 1,
    name: 'Rain Dance',
    text: 'Blastoise\'s Rain Dance powers up Water Energy while Articuno\'s Freeze Dry sets up two-hit KOs.',
    cover: 'base1-2',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#rain-dance',
    list: [
      ['base1-63', 4], // Squirtle
      ['base1-42', 1], // Wartortle
      ['base1-2', 3], // Blastoise
      ['base3-2', 4], // Articuno
      ['base1-88', 4], // Professor Oak
      ['base1-91', 4], // Bill
      ['base1-71', 4], // Computer Search
      ['base1-76', 4], // Pokémon Breeder
      ['base1-81', 4], // Energy Retrieval
      ['base1-74', 3], // Item Finder
      ['base1-95', 2], // Switch
      ['base1-79', 2], // Super Energy Removal
      ['base1-83', 2], // Maintenance
      ['base1-90', 2], // Super Potion
      ['base1-84', 1], // PlusPower
      ['base1-93', 1], // Gust of Wind
      ['base1-75', 1], // Lass
      ['base1-102', 14], // Water Energy
    ],
  },
  {
    id: 'g1-venusaur-dodrio',
    gen: 1,
    name: 'Venusaur / Dodrio',
    text: 'Kangaskhan fetches Bulbasaur and Doduo while Grass piles up for Venusaur\'s Solarbeam.',
    cover: 'base1-15',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#venusaur-dodrio',
    list: [
      ['base1-44', 4], // Bulbasaur
      ['base1-30', 3], // Ivysaur
      ['base1-15', 3], // Venusaur
      ['base2-5', 4], // Kangaskhan
      ['base1-48', 3], // Doduo
      ['base2-34', 3], // Dodrio
      ['base1-3', 1], // Chansey
      ['base1-81', 4], // Energy Retrieval
      ['base1-91', 4], // Bill
      ['base1-85', 2], // Pokémon Center
      ['base1-88', 2], // Professor Oak
      ['base1-77', 2], // Pokémon Trader
      ['base1-74', 2], // Item Finder
      ['base1-79', 1], // Super Energy Removal
      ['base1-93', 1], // Gust of Wind
      ['base1-84', 1], // PlusPower
      ['base1-75', 1], // Lass
      ['base3-58', 1], // Mr. Fuji
      ['base1-99', 17], // Grass Energy
      ['base1-96', 1], // Double Colorless Energy
    ],
  },
  {
    id: 'g1-wigglytuff-magmar-dodrio',
    gen: 1,
    name: 'Wigglytuff / Magmar / Dodrio',
    text: 'Magmar\'s Smokescreen buys time to set up Wigglytuff, with Dodrio for escaping Super Energy Removal.',
    cover: 'base2-16',
    source: 'https://jklaczpokemon.com/1999-base-fossil/#wigglytuff-magmar-dodrio',
    list: [
      ['base2-54', 4], // Jigglypuff
      ['base2-16', 3], // Wigglytuff
      ['base1-48', 4], // Doduo
      ['base2-34', 3], // Dodrio
      ['base1-36', 4], // Magmar
      ['base1-88', 4], // Professor Oak
      ['base1-91', 4], // Bill
      ['base1-81', 4], // Energy Retrieval
      ['base1-92', 3], // Energy Removal
      ['base1-79', 2], // Super Energy Removal
      ['base1-84', 2], // PlusPower
      ['base1-74', 2], // Item Finder
      ['base1-93', 2], // Gust of Wind
      ['base1-75', 1], // Lass
      ['base1-77', 1], // Pokémon Trader
      ['base1-98', 13], // Fire Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
];

export const PREMADE_GEN2: PremadeDeck[] = [
  {
    id: 'g2-rain-dance',
    gen: 2,
    name: 'Rain Dance',
    text: 'Turn-two Blastoise via Pokemon Breeder, with Rain Dance powering up the attacks.',
    cover: 'base1-2',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#rain-dance',
    list: [
      ['neo1-20', 4], // Cleffa
      ['base1-63', 4], // Squirtle
      ['base1-42', 1], // Wartortle
      ['base1-2', 3], // Blastoise
      ['neo2-40', 1], // Igglybuff
      ['neo4-99', 4], // Energy Stadium
      ['base1-76', 4], // Pokémon Breeder
      ['neo1-93', 3], // Gold Berry
      ['base1-75', 3], // Lass
      ['base1-71', 3], // Computer Search
      ['base1-74', 3], // Item Finder
      ['base1-88', 2], // Professor Oak
      ['neo1-96', 2], // Professor Elm
      ['base1-79', 2], // Super Energy Removal
      ['base1-93', 2], // Gust of Wind
      ['gym2-126', 1], // Warp Point
      ['base1-90', 1], // Super Potion
      ['neo1-100', 1], // Double Gust
      ['neo1-89', 1], // Super Energy Retrieval
      ['base5-77', 1], // Nightly Garbage Run
      ['base1-102', 14], // Water Energy
    ],
  },
  {
    id: 'g2-venusaur',
    gen: 2,
    name: 'Venusaur',
    text: 'Classic Venusaur and Pokemon Center combo; Energy Stadium counters Super Energy Removal.',
    cover: 'base1-15',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#venusaur',
    list: [
      ['neo1-20', 4], // Cleffa
      ['base1-44', 3], // Bulbasaur
      ['base1-30', 3], // Ivysaur
      ['base1-15', 3], // Venusaur
      ['base1-48', 2], // Doduo
      ['base2-34', 2], // Dodrio
      ['neo2-40', 1], // Igglybuff
      ['neo4-99', 3], // Energy Stadium
      ['neo1-86', 3], // Focus Band
      ['base1-75', 4], // Lass
      ['base1-71', 3], // Computer Search
      ['base1-88', 2], // Professor Oak
      ['neo1-96', 2], // Professor Elm
      ['base1-79', 2], // Super Energy Removal
      ['neo1-100', 2], // Double Gust
      ['base1-85', 2], // Pokémon Center
      ['base1-74', 2], // Item Finder
      ['base1-93', 1], // Gust of Wind
      ['base1-76', 1], // Pokémon Breeder
      ['base1-77', 1], // Pokémon Trader
      ['gym1-111', 1], // Good Manners
      ['base5-77', 1], // Nightly Garbage Run
      ['base1-99', 12], // Grass Energy
    ],
  },
  {
    id: 'g2-kingdra',
    gen: 2,
    name: 'Kingdra',
    text: 'Seadra\'s Genetic Memory repeats Mud Splash while Pokemon Center and Focus Band keep Kingdra healthy.',
    cover: 'neo1-8',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#kingdra',
    list: [
      ['neo1-20', 4], // Cleffa
      ['neo1-62', 4], // Horsea
      ['neo1-48', 4], // Seadra
      ['neo1-8', 4], // Kingdra
      ['neo1-12', 2], // Pichu
      ['neo1-23', 1], // Magby
      ['neo4-99', 2], // Energy Stadium
      ['gym1-124', 1], // Narrow Gym
      ['neo1-86', 4], // Focus Band
      ['base1-71', 3], // Computer Search
      ['base1-79', 3], // Super Energy Removal
      ['base1-92', 3], // Energy Removal
      ['base1-85', 3], // Pokémon Center
      ['base1-74', 3], // Item Finder
      ['base1-88', 2], // Professor Oak
      ['neo1-96', 2], // Professor Elm
      ['neo1-100', 2], // Double Gust
      ['base1-75', 1], // Lass
      ['base5-77', 1], // Nightly Garbage Run
      ['base1-102', 7], // Water Energy
      ['neo1-105', 4], // Recycle Energy
    ],
  },
  {
    id: 'g2-typhlosion',
    gen: 2,
    name: 'Typhlosion',
    text: 'Heat Tackle attacker that drains the opponent\'s Energy with Pokemon Tower and Energy Removal lines.',
    cover: 'neo1-17',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#typhlosion',
    list: [
      ['neo1-20', 4], // Cleffa
      ['neo1-56', 4], // Cyndaquil
      ['neo1-46', 3], // Quilava
      ['neo1-17', 4], // Typhlosion
      ['gym1-61', 2], // Blaine's Charmander
      ['neo2-40', 1], // Igglybuff
      ['base3-12', 1], // Moltres
      ['basep-42', 4], // Pokémon Tower
      ['neo1-93', 1], // Gold Berry
      ['base1-75', 3], // Lass
      ['base1-71', 3], // Computer Search
      ['base1-88', 2], // Professor Oak
      ['neo1-96', 2], // Professor Elm
      ['base1-79', 4], // Super Energy Removal
      ['base1-92', 4], // Energy Removal
      ['base5-77', 2], // Nightly Garbage Run
      ['base1-93', 1], // Gust of Wind
      ['gym2-126', 1], // Warp Point
      ['base1-85', 1], // Pokémon Center
      ['base1-90', 1], // Super Potion
      ['base1-98', 11], // Fire Energy
      ['neo1-19', 1], // Metal Energy
    ],
  },
  {
    id: 'g2-metal-mewtwo',
    gen: 2,
    name: 'Metal Mewtwo',
    text: 'Stacks Metal Energy on Mewtwo, grinds the opponent\'s Energy away with removal and Pokemon Tower, then decks them.',
    cover: 'base1-10',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#metal-mewtwo',
    list: [
      ['neo1-20', 4], // Cleffa
      ['base1-10', 3], // Mewtwo
      ['neo1-26', 3], // Aipom
      ['base3-48', 2], // Grimer
      ['base3-13', 2], // Muk
      ['base1-3', 1], // Chansey
      ['basep-42', 4], // Pokémon Tower
      ['base1-71', 4], // Computer Search
      ['base1-92', 4], // Energy Removal
      ['base1-79', 4], // Super Energy Removal
      ['neo1-93', 4], // Gold Berry
      ['base1-88', 3], // Professor Oak
      ['neo1-86', 2], // Focus Band
      ['base1-78', 2], // Scoop Up
      ['base5-77', 2], // Nightly Garbage Run
      ['neo1-100', 1], // Double Gust
      ['base3-58', 1], // Mr. Fuji
      ['base1-101', 6], // Psychic Energy
      ['neo1-19', 4], // Metal Energy
      ['base1-96', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g2-rocket-s-zapdos-muk',
    gen: 2,
    name: 'Rocket\'s Zapdos/Muk',
    text: 'Electroburn with Metal Energy self-damage trick plus Pokemon Tower and 4-4 Energy Removal.',
    cover: 'gym2-15',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#rockets-zapdos',
    list: [
      ['neo1-20', 4], // Cleffa
      ['neo2-66', 3], // Tyrogue
      ['gym2-15', 3], // Rocket's Zapdos
      ['base3-48', 2], // Grimer
      ['base3-13', 2], // Muk
      ['basep-42', 4], // Pokémon Tower
      ['neo1-93', 2], // Gold Berry
      ['neo3-60', 2], // Balloon Berry
      ['base1-75', 4], // Lass
      ['base1-71', 4], // Computer Search
      ['base1-92', 4], // Energy Removal
      ['base1-79', 4], // Super Energy Removal
      ['base1-88', 3], // Professor Oak
      ['base1-93', 2], // Gust of Wind
      ['neo1-96', 1], // Professor Elm
      ['base5-77', 1], // Nightly Garbage Run
      ['gym2-126', 1], // Warp Point
      ['base1-100', 9], // Lightning Energy
      ['neo1-19', 4], // Metal Energy
      ['base1-96', 1], // Double Colorless Energy
    ],
  },
  {
    id: 'g2-snichu',
    gen: 2,
    name: 'Snichu',
    text: 'Free-retreat Pokemon pivot to Cleffa for a turn 1 Eeeeeeek, supported by Double Gust, Chaos Gym and Energy Charge.',
    cover: 'neo1-25',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#snichu',
    list: [
      ['neo1-20', 4], // Cleffa
      ['neo1-25', 4], // Sneasel
      ['neo1-12', 2], // Pichu
      ['neo2-66', 1], // Tyrogue
      ['neo1-23', 1], // Magby
      ['neo1-26', 1], // Aipom
      ['gym2-102', 3], // Chaos Gym
      ['neo1-84', 2], // Ecogym
      ['neo1-86', 3], // Focus Band
      ['neo1-93', 2], // Gold Berry
      ['neo1-100', 4], // Double Gust
      ['base1-75', 4], // Lass
      ['base1-88', 3], // Professor Oak
      ['neo1-96', 3], // Professor Elm
      ['gym1-111', 3], // Good Manners
      ['neo1-85', 3], // Energy Charge
      ['base1-79', 2], // Super Energy Removal
      ['base1-74', 2], // Item Finder
      ['base5-77', 1], // Nightly Garbage Run
      ['neo1-104', 4], // Darkness Energy
      ['base5-80', 4], // Rainbow Energy
      ['neo1-105', 4], // Recycle Energy
    ],
  },
  {
    id: 'g2-sneasel-noctowl',
    gen: 2,
    name: 'Sneasel/Noctowl',
    text: 'Noctowl\'s Glaring Gaze shields Sneasel from Energy removal while Chaos Gym adds Mean Look attacks.',
    cover: 'neo1-42',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#sneasel-noctowl',
    list: [
      ['neo1-20', 4], // Cleffa
      ['neo1-25', 4], // Sneasel
      ['neo1-60', 4], // Hoothoot
      ['neo1-42', 4], // Noctowl
      ['neo1-84', 3], // Ecogym
      ['gym2-102', 1], // Chaos Gym
      ['neo1-86', 3], // Focus Band
      ['neo1-93', 1], // Gold Berry
      ['base5-72', 3], // Rocket's Sneak Attack
      ['neo1-85', 3], // Energy Charge
      ['base1-88', 2], // Professor Oak
      ['neo1-96', 2], // Professor Elm
      ['base1-71', 2], // Computer Search
      ['neo1-100', 2], // Double Gust
      ['base1-79', 2], // Super Energy Removal
      ['gym1-111', 2], // Good Manners
      ['base1-74', 2], // Item Finder
      ['base1-93', 1], // Gust of Wind
      ['base5-77', 1], // Nightly Garbage Run
      ['base1-75', 1], // Lass
      ['gym2-103', 1], // Erika's Kindness
      ['neo1-104', 4], // Darkness Energy
      ['base5-80', 4], // Rainbow Energy
      ['neo1-105', 4], // Recycle Energy
    ],
  },
  {
    id: 'g2-light-golduck',
    gen: 2,
    name: 'Light Golduck',
    text: 'Core Blast punishes Special Energy use; No Removal Gym and Noctowl\'s Glaring Gaze protect Golduck.',
    cover: 'neo4-47',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#light-golduck',
    list: [
      ['neo1-20', 4], // Cleffa
      ['neo1-60', 4], // Hoothoot
      ['neo1-42', 4], // Noctowl
      ['neo4-79', 3], // Psyduck
      ['neo4-47', 3], // Light Golduck
      ['gym1-103', 3], // No Removal Gym
      ['gym2-102', 1], // Chaos Gym
      ['neo1-93', 3], // Gold Berry
      ['neo1-86', 2], // Focus Band
      ['neo1-96', 3], // Professor Elm
      ['base5-72', 3], // Rocket's Sneak Attack
      ['neo1-100', 3], // Double Gust
      ['base1-74', 3], // Item Finder
      ['base1-88', 2], // Professor Oak
      ['gym1-111', 2], // Good Manners
      ['base1-79', 2], // Super Energy Removal
      ['base1-75', 1], // Lass
      ['base5-77', 1], // Nightly Garbage Run
      ['base1-101', 5], // Psychic Energy
      ['base1-96', 4], // Double Colorless Energy
      ['neo1-105', 3], // Recycle Energy
      ['neo1-19', 1], // Metal Energy
    ],
  },
  {
    id: 'g2-wigglytuff-muk',
    gen: 2,
    name: 'Wigglytuff/Muk',
    text: 'Fills the Bench with Baby Pokemon to boost Do the Wave; Recycle Energy blunts Super Energy Removal.',
    cover: 'base2-16',
    source: 'https://jklaczpokemon.com/base-to-neo-decks/#wigglytuff',
    list: [
      ['neo1-20', 4], // Cleffa
      ['base2-54', 3], // Jigglypuff
      ['base2-16', 3], // Wigglytuff
      ['base3-48', 2], // Grimer
      ['base3-13', 2], // Muk
      ['neo2-66', 1], // Tyrogue
      ['neo1-26', 1], // Aipom
      ['gym1-103', 3], // No Removal Gym
      ['neo1-86', 2], // Focus Band
      ['neo3-60', 2], // Balloon Berry
      ['base1-75', 4], // Lass
      ['base1-93', 3], // Gust of Wind
      ['neo1-85', 3], // Energy Charge
      ['base1-74', 3], // Item Finder
      ['base1-79', 2], // Super Energy Removal
      ['base1-88', 2], // Professor Oak
      ['neo1-96', 2], // Professor Elm
      ['base1-71', 2], // Computer Search
      ['gym1-111', 2], // Good Manners
      ['gym2-126', 1], // Warp Point
      ['base5-77', 1], // Nightly Garbage Run
      ['base1-99', 2], // Grass Energy
      ['base1-96', 4], // Double Colorless Energy
      ['neo1-105', 4], // Recycle Energy
      ['neo1-19', 1], // Metal Energy
      ['base5-82', 1], // Potion Energy
    ],
  },
];

export const PREMADE_GEN3: PremadeDeck[] = [
  {
    id: 'g3-mewtric',
    gen: 3,
    name: 'Mewtric',
    text: 'Manectric ex disconnects the opponent on turn 2, Lunatone and Solrock stop Quick Search, and Mew ex copies attacks.',
    cover: 'ex8-101',
    source: 'https://jklaczpokemon.com/ex-decks/#mewtric',
    notes: 'Print choices (set numbers) are mine; the page gives card names only.',
    list: [
      ['ex1-30', 4], // Electrike
      ['ex8-101', 4], // Manectric ex
      ['ex12-20', 2], // Lunatone
      ['ex12-25', 1], // Solrock
      ['ex13-100', 1], // Mew ex
      ['ex12-16', 1], // Girafarig
      ['ex12-8', 1], // Lapras
      ['ex15-23', 1], // Tropius δ
      ['ex11-22', 1], // Holon's Magneton
      ['ex12-72', 2], // Cursed Stone
      ['ex14-75', 2], // Crystal Beach
      ['ex7-86', 4], // Rocket's Admin.
      ['ex10-89', 4], // Professor Elm's Training Method
      ['ex7-83', 2], // Copycat
      ['ex9-84', 2], // Scott
      ['ex16-83', 1], // Steven's Advice
      ['ex3-88', 1], // TV Reporter
      ['ex11-89', 4], // Dual Ball
      ['ex7-92', 3], // Swoop! Teleporter
      ['ex1-92', 2], // Switch
      ['ex7-85', 1], // Pow! Hand Extension
      ['ex7-84', 1], // Pokémon Retriever
      ['ex1-109', 11], // Lightning Energy
      ['ex2-93', 4], // Multi Energy
    ],
  },
  {
    id: 'g3-rai-eggs',
    gen: 3,
    name: 'Rai-Eggs',
    text: 'Raichu spreads damage with Zzzap, then Metallic Thunder and Exeggutor δ finish knockouts.',
    cover: 'ex13-15',
    source: 'https://jklaczpokemon.com/ex-decks/#rai-eggs',
    notes: 'Page lists 19 Pokemon / 30 Trainers but the names add to 20 / 29; used the names.',
    list: [
      ['ex13-79', 4], // Pikachu δ
      ['ex13-15', 3], // Raichu δ
      ['ex13-65', 3], // Exeggcute δ
      ['ex13-41', 3], // Exeggutor δ
      ['ex13-44', 4], // Holon's Castform
      ['ex11-70', 3], // Holon's Magnemite
      ['ex12-72', 4], // Cursed Stone
      ['ex7-86', 4], // Rocket's Admin.
      ['ex11-93', 3], // Holon Mentor
      ['ex11-95', 2], // Holon Researcher
      ['ex13-85', 1], // Holon Adventurer
      ['ex11-97', 1], // Holon Scientist
      ['ex16-83', 2], // Steven's Advice
      ['ex14-74', 4], // Cessation Crystal
      ['ex11-98', 4], // Holon Transceiver
      ['ex7-92', 2], // Swoop! Teleporter
      ['ex7-84', 2], // Pokémon Retriever
      ['ex1-94', 4], // Metal Energy
      ['ex8-95', 4], // Scramble Energy
      ['ex4-88', 3], // Double Rainbow Energy
    ],
  },
  {
    id: 'g3-shiftry-ex',
    gen: 3,
    name: 'Shiftry ex',
    text: 'Pidgeot Quick Search evolves several Shiftry ex, whose Dark Eyes deals heavy damage.',
    cover: 'ex14-97',
    source: 'https://jklaczpokemon.com/ex-decks/#shiftry-ex',
    list: [
      ['ex2-76', 4], // Seedot
      ['ex2-48', 2], // Nuzleaf
      ['ex14-97', 4], // Shiftry ex
      ['ex15-19', 3], // Lickitung δ
      ['ex6-73', 2], // Pidgey
      ['ex6-45', 1], // Pidgeotto
      ['ex6-10', 2], // Pidgeot
      ['ex16-92', 1], // Absol ex
      ['ex11-70', 1], // Holon's Magnemite
      ['ex11-22', 1], // Holon's Magneton
      ['ex14-75', 3], // Crystal Beach
      ['ex7-86', 4], // Rocket's Admin.
      ['ex10-89', 4], // Professor Elm's Training Method
      ['ex11-93', 2], // Holon Mentor
      ['ex13-85', 1], // Holon Adventurer
      ['ex11-97', 1], // Holon Scientist
      ['ex2-88', 4], // Rare Candy
      ['ex11-98', 4], // Holon Transceiver
      ['ex7-85', 2], // Pow! Hand Extension
      ['ex14-85', 1], // Windstorm
      ['ex1-107', 5], // Psychic Energy
      ['ex1-93', 4], // Darkness Energy
      ['ex2-93', 4], // Multi Energy
    ],
  },
  {
    id: 'g3-salamence',
    gen: 3,
    name: 'Salamence',
    text: 'Altaria ex δ powers repeated Bright Flame attacks from Salamence ex.',
    cover: 'ex8-103',
    source: 'https://jklaczpokemon.com/ex-decks/#salamence',
    list: [
      ['ex13-44', 4], // Holon's Castform
      ['ex11-57', 4], // Bagon δ
      ['ex11-53', 1], // Shelgon δ
      ['ex8-103', 2], // Salamence ex
      ['ex16-96', 1], // Salamence ex
      ['ex3-10', 1], // Salamence
      ['ex13-77', 2], // Pidgey δ
      ['ex13-49', 1], // Pidgeotto δ
      ['ex6-10', 2], // Pidgeot
      ['ex15-65', 2], // Swablu δ
      ['ex15-90', 2], // Altaria ex δ
      ['ex13-37', 1], // Chimecho δ
      ['ex6-16', 1], // Tauros
      ['ex11-70', 1], // Holon's Magnemite
      ['ex7-86', 4], // Rocket's Admin.
      ['ex10-89', 3], // Professor Elm's Training Method
      ['ex11-93', 3], // Holon Mentor
      ['ex13-85', 1], // Holon Adventurer
      ['ex11-97', 1], // Holon Scientist
      ['ex11-98', 4], // Holon Transceiver
      ['ex2-88', 4], // Rare Candy
      ['ex14-85', 3], // Windstorm
      ['ex10-93', 2], // Warp Point
      ['ex7-92', 1], // Swoop! Teleporter
      ['ex7-84', 1], // Pokémon Retriever
      ['ex1-108', 6], // Fire Energy
      ['ex1-106', 2], // Water Energy
    ],
  },
  {
    id: 'g3-medicham-ex',
    gen: 3,
    name: 'Medicham ex',
    text: 'Jirachi and Swoop! Teleporter get Medicham ex out fast, and Pure Power builds damage on the Bench.',
    cover: 'ex9-95',
    source: 'https://jklaczpokemon.com/ex-decks/#medicham-ex',
    list: [
      ['ex8-9', 4], // Jirachi
      ['ex3-37', 4], // Meditite
      ['ex9-95', 4], // Medicham ex
      ['ex2-26', 1], // Wobbuffet
      ['ex11-22', 1], // Holon's Magneton
      ['ex5-89', 3], // Island Cave
      ['ex4-78', 1], // Team Aqua Hideout
      ['ex7-86', 4], // Rocket's Admin.
      ['ex10-89', 4], // Professor Elm's Training Method
      ['ex10-86', 3], // Mary's Request
      ['ex16-83', 2], // Steven's Advice
      ['ex9-84', 2], // Scott
      ['ex7-85', 4], // Pow! Hand Extension
      ['ex7-92', 4], // Swoop! Teleporter
      ['ex1-80', 4], // Energy Removal 2
      ['ex1-105', 6], // Fighting Energy
      ['ex1-107', 5], // Psychic Energy
      ['ex1-94', 4], // Metal Energy
    ],
  },
  {
    id: 'g3-queendom',
    gen: 3,
    name: 'Queendom',
    text: 'Nidoqueen\'s Power Lariat finishes games, backed by many Basics that evolve.',
    cover: 'ex6-9',
    source: 'https://jklaczpokemon.com/ex-decks/#queendom',
    list: [
      ['ex6-70', 4], // Nidoran♀
      ['ex6-40', 2], // Nidorina
      ['ex6-9', 4], // Nidoqueen
      ['ex6-73', 3], // Pidgey
      ['ex6-45', 1], // Pidgeotto
      ['ex6-10', 3], // Pidgeot
      ['ex5-61', 1], // Feebas
      ['ex5-12', 1], // Milotic
      ['ex11-22', 1], // Holon's Magneton
      ['ex5-88', 4], // Desert Ruins
      ['ex6-88', 4], // Celio's Network
      ['ex7-86', 3], // Rocket's Admin.
      ['ex16-83', 3], // Steven's Advice
      ['ex7-83', 2], // Copycat
      ['ex3-87', 1], // Mr. Briney's Compassion
      ['ex2-88', 4], // Rare Candy
      ['ex6-92', 3], // Great Ball
      ['ex14-85', 1], // Windstorm
      ['ex6-100', 1], // VS Seeker
      ['ex1-104', 6], // Grass Energy
      ['ex1-105', 1], // Fighting Energy
      ['ex4-88', 4], // Double Rainbow Energy
      ['ex8-94', 2], // Heal Energy
      ['ex8-95', 1], // Scramble Energy
    ],
  },
  {
    id: 'g3-exploud-ex',
    gen: 3,
    name: 'Exploud ex',
    text: 'Extra Noise piles damage on opposing Pokemon-ex and Hyper Tail finishes them.',
    cover: 'ex14-92',
    source: 'https://jklaczpokemon.com/ex-decks/#exploud-ex',
    list: [
      ['ex5-82', 4], // Whismur
      ['ex5-39', 1], // Loudred
      ['ex14-92', 3], // Exploud ex
      ['ex5-6', 1], // Exploud
      ['ex5-8', 3], // Jirachi
      ['ex6-73', 2], // Pidgey
      ['ex6-45', 1], // Pidgeotto
      ['ex6-10', 2], // Pidgeot
      ['ex6-16', 1], // Tauros
      ['ex11-70', 1], // Holon's Magnemite
      ['ex16-72', 1], // Drake's Stadium
      ['ex7-86', 4], // Rocket's Admin.
      ['ex10-89', 3], // Professor Elm's Training Method
      ['ex11-93', 2], // Holon Mentor
      ['ex13-85', 1], // Holon Adventurer
      ['ex11-97', 1], // Holon Scientist
      ['ex11-98', 4], // Holon Transceiver
      ['ex2-88', 4], // Rare Candy
      ['ex14-85', 3], // Windstorm
      ['ex8-86', 2], // Energy Charge
      ['ex7-92', 1], // Swoop! Teleporter
      ['ex7-84', 1], // Pokémon Retriever
      ['ex1-94', 4], // Metal Energy
      ['ex8-93', 4], // Boost Energy
      ['ex16-91', 4], // Warp Energy
      ['ex16-90', 2], // Cyclone Energy
    ],
  },
  {
    id: 'g3-dragonite-ex',
    gen: 3,
    name: 'Dragonite ex δ',
    text: 'Several Dragonite ex δ use Deafen to build damage on the opponent, then finish with Dragon Roar.',
    cover: 'ex15-91',
    source: 'https://jklaczpokemon.com/ex-decks/#dragonite-ex',
    list: [
      ['ex11-65', 4], // Dratini δ
      ['ex11-41', 1], // Dragonair δ
      ['ex15-91', 4], // Dragonite ex δ
      ['ex13-44', 4], // Holon's Castform
      ['ex11-71', 2], // Holon's Voltorb
      ['ex12-20', 2], // Lunatone
      ['ex12-25', 1], // Solrock
      ['ex12-16', 1], // Girafarig
      ['ex15-96', 1], // Latios ex δ
      ['ex13-11', 1], // Latias δ
      ['ex14-75', 2], // Crystal Beach
      ['ex12-72', 2], // Cursed Stone
      ['ex7-86', 4], // Rocket's Admin.
      ['ex9-84', 2], // Scott
      ['ex11-95', 2], // Holon Researcher
      ['ex11-93', 2], // Holon Mentor
      ['ex13-85', 1], // Holon Adventurer
      ['ex11-97', 1], // Holon Scientist
      ['ex11-91', 1], // Holon Farmer
      ['ex11-98', 4], // Holon Transceiver
      ['ex2-88', 4], // Rare Candy
      ['ex7-92', 4], // Swoop! Teleporter
      ['ex1-104', 2], // Grass Energy
      ['ex4-88', 4], // Double Rainbow Energy
      ['ex16-91', 4], // Warp Energy
    ],
  },
  {
    id: 'g3-flariados',
    gen: 3,
    name: 'Flariados',
    text: 'Flareon ex\'s Evolutionary Flame feeds Ariados\'s Reactive Poison, with Super Scoop Up reusing the attack.',
    cover: 'ex11-108',
    source: 'https://jklaczpokemon.com/ex-decks/#flariados',
    list: [
      ['ex10-55', 4], // Eevee
      ['ex11-108', 4], // Flareon ex
      ['ex10-102', 1], // Espeon ex
      ['ex10-75', 4], // Spinarak
      ['ex10-2', 4], // Ariados
      ['ex6-4', 1], // Ditto
      ['ex12-16', 1], // Girafarig
      ['ex11-22', 1], // Holon's Magneton
      ['ex9-75', 4], // Battle Frontier
      ['ex10-89', 4], // Professor Elm's Training Method
      ['ex7-86', 4], // Rocket's Admin.
      ['ex10-86', 4], // Mary's Request
      ['ex16-83', 3], // Steven's Advice
      ['ex6-99', 4], // Super Scoop Up
      ['ex6-92', 3], // Great Ball
      ['ex14-85', 2], // Windstorm
      ['ex1-104', 6], // Grass Energy
      ['ex1-108', 2], // Fire Energy
      ['ex2-93', 4], // Multi Energy
    ],
  },
];

export const PREMADE_GEN4: PremadeDeck[] = [
  {
    id: 'g4-luxchomp',
    gen: 4,
    name: 'Luxchomp',
    text: 'SP toolbox: Luxray GL and Garchomp C hit for big damage with SP Energy and Galactic tools, Uxie and Azelf for support.',
    cover: 'pl3-145',
    source: 'https://jklaczpokemon.com/dpp-decks/#luxchomp',
    list: [
      ['pl2-9', 2], // Luxray GL
      ['pl2-109', 2], // Luxray GL LV.X
      ['pl3-60', 2], // Garchomp C
      ['pl3-145', 2], // Garchomp C LV.X
      ['dp6-43', 2], // Uxie
      ['dp6-146', 1], // Uxie
      ['pl1-41', 1], // Bronzong G
      ['pl1-40', 1], // Toxicroak G
      ['pl2-8', 1], // Lucario GL
      ['pl2-56', 1], // Ambipom G
      ['dp6-19', 1], // Azelf
      ['dp4-57', 1], // Unown G
      ['dp5-49', 1], // Unown Q
      ['pl1-105', 4], // Cyrus's Conspiracy
      ['dp3-125', 4], // Roseanne's Research
      ['dp6-131', 2], // Cynthia's Feelings
      ['dp3-119', 1], // Bebe's Search
      ['pl2-88', 1], // Aaron's Collection
      ['pl1-116', 4], // Team Galactic's Invention G-101 Energy Gain
      ['pl1-118', 4], // Team Galactic's Invention G-105 Poké Turn
      ['pl1-117', 4], // Team Galactic's Invention G-103 Power Spray
      ['pl2-96', 3], // Team Galactic's Invention G-109 SP Radar
      ['pl3-140', 1], // VS Seeker
      ['dp7-86', 1], // Luxury Ball
      ['dp1-126', 4], // Lightning Energy
      ['dp1-127', 2], // Psychic Energy
      ['dp5-92', 4], // Call Energy
      ['pl2-101', 3], // SP Energy
    ],
  },
  {
    id: 'g4-dusknoir',
    gen: 4,
    name: 'Dusknoir',
    text: 'Psychic ghost deck: Spiritomb and Dusknoir damage-counter spread, Claydol draw, Mewtwo LV.X as a closer.',
    cover: 'dp7-96',
    source: 'https://jklaczpokemon.com/dpp-decks/#dusknoir',
    notes: 'Dusknoir 3 copies of dp7-1 (list has 2+1 of two prints).',
    list: [
      ['dp6-16', 4], // Spiritomb
      ['dp1-80', 4], // Duskull
      ['dp1-47', 4], // Dusclops
      ['dp7-1', 3], // Dusknoir
      ['dp7-96', 1], // Dusknoir
      ['dp4-60', 2], // Baltoy
      ['dp4-15', 2], // Claydol
      ['dp2-83', 1], // Finneon
      ['dp2-11', 1], // Lumineon
      ['dp6-11', 1], // Mewtwo
      ['dp6-144', 1], // Mewtwo
      ['dp4-57', 1], // Unown G
      ['dp5-49', 1], // Unown Q
      ['dp6-19', 1], // Azelf
      ['dp3-125', 4], // Roseanne's Research
      ['dp3-119', 4], // Bebe's Search
      ['pl3-137', 4], // Cyrus's Initiative
      ['dp6-131', 2], // Cynthia's Feelings
      ['pl1-109', 1], // Looker's Investigation
      ['dp1-116', 2], // Warp Point
      ['dp2-113', 1], // Night Maintenance
      ['dp7-86', 1], // Luxury Ball
      ['dp1-127', 10], // Psychic Energy
      ['dp5-92', 4], // Call Energy
    ],
  },
  {
    id: 'g4-kingdra',
    gen: 4,
    name: 'Kingdra',
    text: 'Water mono: Horsea line to Kingdra, Claydol for draw, Broken Time-Space to evolve quickly.',
    cover: 'dp6-7',
    source: 'https://jklaczpokemon.com/dpp-decks/#kingdra',
    list: [
      ['dp6-102', 4], // Horsea
      ['dp6-70', 4], // Seadra
      ['dp6-7', 4], // Kingdra
      ['dp4-60', 3], // Baltoy
      ['dp4-15', 3], // Claydol
      ['dp6-43', 2], // Uxie
      ['dp6-146', 1], // Uxie
      ['dp6-36', 1], // Regice
      ['dp5-49', 1], // Unown Q
      ['pl1-104', 4], // Broken Time-Space
      ['dp3-125', 4], // Roseanne's Research
      ['dp3-119', 4], // Bebe's Search
      ['dp6-131', 3], // Cynthia's Feelings
      ['dp7-86', 3], // Luxury Ball
      ['dp1-115', 3], // Super Scoop Up
      ['dp1-109', 3], // PlusPower
      ['pl4-87', 2], // Expert Belt
      ['dp2-113', 2], // Night Maintenance
      ['dp1-125', 9], // Water Energy
    ],
  },
  {
    id: 'g4-gardevoir-gallade',
    gen: 4,
    name: 'Gardevoir/Gallade',
    text: 'Psychic evolution deck: Gardevoir and Gallade backed by Spiritomb, Claydol and Upper Energy.',
    cover: 'dp3-7',
    source: 'https://jklaczpokemon.com/dpp-decks/#gardevoir-gallade',
    list: [
      ['dp6-16', 4], // Spiritomb
      ['dp3-102', 4], // Ralts
      ['dp3-53', 4], // Kirlia
      ['dp3-7', 3], // Gardevoir
      ['dp3-6', 2], // Gallade
      ['dp4-60', 2], // Baltoy
      ['dp4-15', 2], // Claydol
      ['dp1-80', 1], // Duskull
      ['dp1-47', 1], // Dusclops
      ['dp7-1', 1], // Dusknoir
      ['dp4-51', 1], // Relicanth
      ['pl1-47', 1], // Crobat G
      ['dp5-49', 1], // Unown Q
      ['pl1-104', 2], // Broken Time-Space
      ['dp3-125', 4], // Roseanne's Research
      ['dp3-119', 4], // Bebe's Search
      ['dp2-115', 3], // Team Galactic's Wager
      ['pl2-92', 1], // Lucian's Assignment
      ['dp1-119', 1], // Switch
      ['dp2-113', 1], // Night Maintenance
      ['dp7-86', 1], // Luxury Ball
      ['pl1-118', 1], // Team Galactic's Invention G-105 Poké Turn
      ['dp1-127', 5], // Psychic Energy
      ['dp1-128', 1], // Fighting Energy
      ['dp5-92', 4], // Call Energy
      ['pl2-102', 4], // Upper Energy
      ['pl1-121', 1], // Rainbow Energy
    ],
  },
  {
    id: 'g4-flygon',
    gen: 4,
    name: 'Flygon',
    text: 'Fighting/Water: Flygon with Machamp and Palkia LV.X, Claydol draw support.',
    cover: 'pl2-5',
    source: 'https://jklaczpokemon.com/dpp-decks/#flygon',
    list: [
      ['dp6-16', 4], // Spiritomb
      ['dp3-115', 3], // Trapinch
      ['dp3-74', 3], // Vibrava
      ['pl2-5', 3], // Flygon
      ['pl2-105', 1], // Flygon LV.X
      ['dp1-86', 2], // Machop
      ['dp1-53', 2], // Machoke
      ['dp1-31', 2], // Machamp
      ['dp4-60', 2], // Baltoy
      ['dp4-15', 2], // Claydol
      ['dp4-26', 2], // Palkia
      ['dp4-106', 2], // Palkia
      ['dp5-49', 1], // Unown Q
      ['dp6-19', 1], // Azelf
      ['dp3-125', 4], // Roseanne's Research
      ['dp3-119', 4], // Bebe's Search
      ['dp6-131', 3], // Cynthia's Feelings
      ['pl1-110', 2], // Memory Berry
      ['dp7-86', 1], // Luxury Ball
      ['dp4-101', 1], // Premier Ball
      ['dp2-113', 1], // Night Maintenance
      ['dp1-128', 6], // Fighting Energy
      ['dp1-125', 3], // Water Energy
      ['dp1-129', 1], // Darkness Energy
      ['dp5-92', 4], // Call Energy
    ],
  },
  {
    id: 'g4-gengar-prime',
    gen: 4,
    name: 'Gengar Prime',
    text: 'Psychic Gengar Prime with Lost World, Collector and Rare Candy to power up fast and take extra Prizes.',
    cover: 'hgss4-94',
    source: 'https://jklaczpokemon.com/hs/',
    list: [
      ['hgss4-63', 4], // Gastly
      ['hgss4-35', 2], // Haunter
      ['hgss4-94', 4], // Gengar
      ['hgss4-10', 2], // Spiritomb
      ['hgss3-60', 1], // Oddish
      ['hgss3-24', 1], // Vileplume
      ['col1-47', 1], // Mime Jr.
      ['col1-29', 1], // Mr. Mime
      ['hgss3-8', 1], // Smeargle
      ['hgss1-17', 1], // Cleffa
      ['hgss2-1', 1], // Jirachi
      ['hgss2-8', 1], // Shaymin
      ['col1-81', 2], // Lost World
      ['hgss1-97', 4], // Pokémon Collector
      ['hgss4-89', 4], // Twins
      ['hgss1-101', 4], // Professor Oak's New Theory
      ['hgss4-88', 4], // Seeker
      ['hgss1-98', 4], // Pokémon Communication
      ['hgss2-82', 4], // Rare Candy
      ['hgss1-119', 12], // Psychic Energy
      ['hgss4-90', 2], // Rescue Energy
    ],
  },
  {
    id: 'g4-lanturn-feraligatr',
    gen: 4,
    name: 'Lanturn/Feraligatr',
    text: 'Water deck: Lanturn Prime and Feraligatr Prime with Lightning for coverage.',
    cover: 'hgss1-108',
    source: 'https://jklaczpokemon.com/hs/',
    list: [
      ['hgss2-48', 4], // Chinchou
      ['hgss2-86', 4], // Lanturn
      ['hgss1-86', 3], // Totodile
      ['hgss1-38', 1], // Croconaw
      ['hgss1-108', 3], // Feraligatr
      ['hgss1-17', 2], // Cleffa
      ['hgss3-8', 1], // Smeargle
      ['hgss3-71', 1], // Burned Tower
      ['hgss1-97', 4], // Pokémon Collector
      ['hgss1-101', 4], // Professor Oak's New Theory
      ['hgss1-100', 3], // Professor Elm's Training Method
      ['hgss1-92', 2], // Fisherman
      ['hgss2-77', 2], // Interviewer's Questions
      ['hgss1-98', 4], // Pokémon Communication
      ['hgss2-82', 3], // Rare Candy
      ['hgss1-99', 2], // Pokémon Reversal
      ['hgss1-117', 11], // Water Energy
      ['hgss1-118', 4], // Lightning Energy
      ['hgss1-103', 2], // Double Colorless Energy
    ],
  },
  {
    id: 'g4-magmortar-typhlosion',
    gen: 4,
    name: 'Magmortar/Typhlosion',
    text: 'Fire mono: Typhlosion Prime and Magmortar with Ninetales, Burned Tower and Sage\'s Training.',
    cover: 'hgss1-110',
    source: 'https://jklaczpokemon.com/hs/',
    list: [
      ['hgss1-61', 4], // Cyndaquil
      ['hgss1-49', 2], // Quilava
      ['hgss1-110', 4], // Typhlosion
      ['hgss4-42', 4], // Magmar
      ['hgss4-27', 4], // Magmortar
      ['hgss1-87', 2], // Vulpix
      ['hgss1-7', 2], // Ninetales
      ['hgss1-28', 1], // Pichu
      ['hgss1-17', 1], // Cleffa
      ['hgss3-71', 2], // Burned Tower
      ['hgss1-97', 4], // Pokémon Collector
      ['hgss4-89', 4], // Twins
      ['hgss3-77', 3], // Sage's Training
      ['hgss3-74', 2], // Flower Shop Lady
      ['hgss1-98', 4], // Pokémon Communication
      ['hgss2-82', 3], // Rare Candy
      ['hgss1-116', 14], // Fire Energy
    ],
  },
  {
    id: 'g4-magnezone-pachirisu',
    gen: 4,
    name: 'Magnezone/Pachirisu',
    text: 'Lightning mono: Magnezone Prime and Pachirisu with 23 Lightning Energy.',
    cover: 'hgss4-96',
    source: 'https://jklaczpokemon.com/hs/',
    list: [
      ['hgss4-68', 4], // Magnemite
      ['hgss4-43', 1], // Magneton
      ['hgss4-96', 4], // Magnezone
      ['dp1-35', 4], // Pachirisu
      ['hgss4-83', 2], // Voltorb
      ['hgss4-93', 2], // Electrode
      ['hgss1-17', 1], // Cleffa
      ['hgss1-97', 4], // Pokémon Collector
      ['hgss2-78', 4], // Judge
      ['hgss4-89', 3], // Twins
      ['hgss2-82', 4], // Rare Candy
      ['hgss1-98', 4], // Pokémon Communication
      ['hgss1-118', 23], // Lightning Energy
    ],
  },
  {
    id: 'g4-machamp-donphan',
    gen: 4,
    name: 'Machamp/Donphan',
    text: 'Fighting deck: Machamp Prime and Donphan Prime with Double Colorless and Rainbow Energy.',
    cover: 'hgss4-95',
    source: 'https://jklaczpokemon.com/hs/',
    list: [
      ['hgss4-67', 4], // Machop
      ['hgss4-40', 4], // Machoke
      ['hgss4-95', 4], // Machamp
      ['hgss1-77', 4], // Phanpy
      ['hgss1-107', 2], // Donphan
      ['hgss1-97', 4], // Pokémon Collector
      ['hgss1-101', 4], // Professor Oak's New Theory
      ['hgss1-100', 4], // Professor Elm's Training Method
      ['hgss1-90', 3], // Copycat
      ['hgss1-98', 4], // Pokémon Communication
      ['hgss1-99', 4], // Pokémon Reversal
      ['hgss1-96', 3], // Pokégear 3.0
      ['hgss1-120', 9], // Fighting Energy
      ['hgss1-103', 4], // Double Colorless Energy
      ['hgss1-104', 3], // Rainbow Energy
    ],
  },
];

export const PREMADE_GEN5: PremadeDeck[] = [
  {
    id: 'g5-darkrai-ex',
    gen: 5,
    name: 'Darkrai-EX',
    text: 'Discard Darkness Energy to power up Darkrai-EX with Dark Patch, then spread Night Spear damage across the Bench.',
    cover: 'bw5-63',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#darkrai-ex',
    list: [
      ['bw5-63', 4], // Darkrai-EX
      ['bw5-62', 3], // Sableye
      ['bw7-49', 1], // Keldeo-EX
      ['bw10-60', 1], // Jirachi-EX
      ['bw9-47', 1], // Mr. Mime
      ['bw7-137', 1], // Computer Search
      ['bw8-126', 3], // Virbank City Gym
      ['bw1-101', 4], // Professor Juniper
      ['bw3-92', 4], // N
      ['bw5-102', 4], // Ultra Ball
      ['bw5-93', 4], // Dark Patch
      ['bw8-123', 4], // Hypnotoxic Laser
      ['bw2-95', 4], // Pokémon Catcher
      ['bw1-94', 3], // Energy Switch
      ['bw5-92', 2], // Dark Claw
      ['bw5-99', 2], // Random Receiver
      ['bw5-94', 2], // Enhanced Hammer
      ['bw8-117', 1], // Bicycle
      ['bw6-116', 1], // Tool Scrapper
      ['bw1-93', 1], // Energy Search
      ['bw1-111', 10], // Darkness Energy
    ],
  },
  {
    id: 'g5-empoleon',
    gen: 5,
    name: 'Empoleon',
    text: 'Exeggcute\'s Propagation recycles Empoleon so Diving Draw keeps the hand full while the board grows.',
    cover: 'bw5-29',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#empoleon',
    notes: 'Tropical Beach (BW promo, not in catalog) x3 replaced by Cheren (draw Supporter).',
    list: [
      ['bw5-27', 4], // Piplup
      ['bw5-28', 2], // Prinplup
      ['bw5-29', 4], // Empoleon
      ['bw7-61', 2], // Duskull
      ['bw7-63', 1], // Dusknoir
      ['bw1-62', 1], // Sawk
      ['bw9-47', 1], // Mr. Mime
      ['bw9-4', 1], // Exeggcute
      ['bw7-49', 1], // Keldeo-EX
      ['bw10-60', 1], // Jirachi-EX
      ['bw8-128', 1], // Dowsing Machine
      ['bw2-91', 3], // Cheren
      ['bw7-134', 4], // Skyla
      ['bw3-92', 4], // N
      ['bw8-118', 2], // Colress
      ['bw5-100', 4], // Rare Candy
      ['bw5-102', 4], // Ultra Ball
      ['bw4-89', 2], // Level Ball
      ['bw9-99', 2], // Float Stone
      ['bw2-95', 1], // Pokémon Catcher
      ['bw2-96', 1], // Recycle
      ['bw2-94', 1], // Max Potion
      ['bw10-88', 1], // Silver Bangle
      ['bw10-89', 1], // Silver Mirror
      ['bw8-123', 1], // Hypnotoxic Laser
      ['bw6-116', 1], // Tool Scrapper
      ['bw7-136', 1], // Town Map
      ['bw3-95', 1], // Super Rod
      ['bw1-107', 7], // Water Energy
    ],
  },
  {
    id: 'g5-flygon',
    gen: 5,
    name: 'Flygon',
    text: 'Accelgor\'s Deck & Cover and Flygon\'s Sand Slammer spread damage, finished by Dusknoir\'s Sinister Hand.',
    cover: 'bw7-83',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#flygon',
    notes: 'Tropical Beach (BW promo, not in catalog) x4 replaced by Cheren (draw Supporter).',
    list: [
      ['bw7-83', 4], // Trapinch
      ['bw7-98', 1], // Vibrava
      ['bw7-99', 4], // Flygon
      ['bw3-11', 3], // Shelmet
      ['bw3-12', 2], // Accelgor
      ['bw6-46', 2], // Mew-EX
      ['bw7-61', 1], // Duskull
      ['bw7-63', 1], // Dusknoir
      ['bw1-48', 1], // Munna
      ['bw1-49', 1], // Musharna
      ['bw7-49', 1], // Keldeo-EX
      ['bw7-137', 1], // Computer Search
      ['bw2-91', 4], // Cheren
      ['bw3-92', 4], // N
      ['bw7-134', 4], // Skyla
      ['bw1-101', 2], // Professor Juniper
      ['bw8-118', 2], // Colress
      ['bw5-100', 4], // Rare Candy
      ['bw5-102', 3], // Ultra Ball
      ['bw4-89', 3], // Level Ball
      ['bw9-99', 3], // Float Stone
      ['bw2-95', 2], // Pokémon Catcher
      ['bw1-99', 1], // Pokémon Communication
      ['bw10-88', 1], // Silver Bangle
      ['bw6-116', 1], // Tool Scrapper
      ['bw4-92', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g5-garchomp',
    gen: 5,
    name: 'Garchomp',
    text: 'Fast Gible and Swablu evolutions, Altaria\'s Dragon Call powers Garchomp\'s Dragonblade against big Pokémon-EX.',
    cover: 'bw6-86',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#garchomp',
    notes: 'Tropical Beach (BW promo, not in catalog) x2 replaced by Cheren (draw Supporter).',
    list: [
      ['bw6-86', 4], // Gible
      ['bw6-88', 3], // Gabite
      ['bw6-90', 4], // Garchomp
      ['bw6-104', 4], // Swablu
      ['bw6-84', 4], // Altaria
      ['bw10-95', 1], // Scoop Up Cyclone
      ['bw2-91', 2], // Cheren
      ['bw3-92', 4], // N
      ['bw7-134', 3], // Skyla
      ['bw8-118', 3], // Colress
      ['bw1-101', 2], // Professor Juniper
      ['bw4-89', 4], // Level Ball
      ['bw2-95', 2], // Pokémon Catcher
      ['bw3-95', 2], // Super Rod
      ['bw10-88', 2], // Silver Bangle
      ['bw5-100', 2], // Rare Candy
      ['bw1-104', 1], // Switch
      ['bw6-116', 1], // Tool Scrapper
      ['bw1-110', 7], // Fighting Energy
      ['bw1-107', 2], // Water Energy
      ['bw6-118', 3], // Blend Energy Water Lightning Fighting Metal
    ],
  },
  {
    id: 'g5-klinklang',
    gen: 5,
    name: 'Klinklang',
    text: 'Plasma Steel shields Metal Pokémon from Pokémon-EX while Klinklang and the EX Metal attackers hit hard.',
    cover: 'bw1-76',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#klinklang',
    notes: 'Tropical Beach (BW promo, not in catalog) x3 replaced by Cheren (draw Supporter).',
    list: [
      ['bw1-74', 4], // Klink
      ['bw1-75', 2], // Klang
      ['bw1-76', 2], // Klinklang
      ['bw8-90', 2], // Klinklang
      ['bw5-63', 2], // Darkrai-EX
      ['bw8-93', 1], // Cobalion-EX
      ['bw6-81', 1], // Registeel-EX
      ['bw10-60', 1], // Jirachi-EX
      ['bw7-49', 1], // Keldeo-EX
      ['bw5-62', 1], // Sableye
      ['bw7-137', 1], // Computer Search
      ['bw2-91', 3], // Cheren
      ['bw7-134', 4], // Skyla
      ['bw3-92', 4], // N
      ['bw1-101', 2], // Professor Juniper
      ['bw8-118', 2], // Colress
      ['bw5-102', 4], // Ultra Ball
      ['bw5-100', 3], // Rare Candy
      ['bw2-95', 2], // Pokémon Catcher
      ['bw4-88', 2], // Heavy Ball
      ['bw2-94', 2], // Max Potion
      ['bw6-116', 1], // Tool Scrapper
      ['bw3-95', 1], // Super Rod
      ['bw1-112', 8], // Metal Energy
      ['bw4-93', 4], // Prism Energy
    ],
  },
  {
    id: 'g5-landorus-ex-mewtwo-ex',
    gen: 5,
    name: 'Landorus-EX/Mewtwo-EX',
    text: 'Early Hammerhead pressure, then Land\'s Judgment and X-Ball with Catcher and Hypnotoxic Laser for fast Knock Outs.',
    cover: 'bw7-89',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#landorus-ex',
    list: [
      ['bw7-89', 4], // Landorus-EX
      ['bw4-54', 2], // Mewtwo-EX
      ['bw1-90', 1], // Bouffalant
      ['bw3-48', 2], // Trubbish
      ['bw3-49', 2], // Garbodor
      ['bw10-60', 1], // Jirachi-EX
      ['bw7-140', 1], // Gold Potion
      ['bw8-126', 3], // Virbank City Gym
      ['bw1-101', 4], // Professor Juniper
      ['bw3-92', 4], // N
      ['bw7-134', 4], // Skyla
      ['bw8-123', 4], // Hypnotoxic Laser
      ['bw2-95', 4], // Pokémon Catcher
      ['bw5-102', 4], // Ultra Ball
      ['bw9-99', 3], // Float Stone
      ['bw6-114', 2], // Giant Cape
      ['bw6-116', 1], // Tool Scrapper
      ['bw1-96', 1], // PlusPower
      ['bw2-94', 1], // Max Potion
      ['bw1-110', 8], // Fighting Energy
      ['bw4-92', 4], // Double Colorless Energy
    ],
  },
  {
    id: 'g5-lugia-ex',
    gen: 5,
    name: 'Lugia-EX',
    text: 'A turbo Plasma deck powering Lugia-EX\'s Plasma Gale with Colress Machine and Frozen City.',
    cover: 'bw9-53',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#lugia-ex',
    list: [
      ['bw9-53', 4], // Deoxys-EX
      ['bw9-38', 3], // Thundurus-EX
      ['bw8-108', 2], // Lugia-EX
      ['bw9-67', 1], // Absol
      ['bw7-137', 1], // Computer Search
      ['bw9-100', 2], // Frozen City
      ['bw1-101', 4], // Professor Juniper
      ['bw2-90', 3], // Bianca
      ['bw8-118', 2], // Colress
      ['bw10-81', 1], // Iris
      ['bw9-102', 1], // Shadow Triad
      ['bw5-102', 4], // Ultra Ball
      ['bw8-119', 4], // Colress Machine
      ['bw2-95', 4], // Pokémon Catcher
      ['bw1-104', 3], // Switch
      ['bw9-105', 2], // Team Plasma Ball
      ['bw10-86', 2], // Reversal Trigger
      ['bw8-117', 2], // Bicycle
      ['bw8-120', 1], // Escape Rope
      ['bw6-116', 1], // Tool Scrapper
      ['bw1-96', 1], // PlusPower
      ['bw1-108', 1], // Lightning Energy
      ['bw4-93', 4], // Prism Energy
      ['bw8-127', 4], // Plasma Energy
      ['bw4-92', 3], // Double Colorless Energy
    ],
  },
  {
    id: 'g5-rayquaza-ex-eelektrik',
    gen: 5,
    name: 'Rayquaza-EX/Eelektrik',
    text: 'Eelektrik\'s Dynamotor charges Rayquaza-EX for Dragon Burst, with Keldeo-EX\'s Rush In to recharge.',
    cover: 'bw3-38',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#rayquaza-ex-eelektrik',
    notes: 'Tropical Beach (BW promo, not in catalog) x3 replaced by Cheren (draw Supporter).',
    list: [
      ['bw3-38', 4], // Tynamo
      ['bw3-40', 4], // Eelektrik
      ['bw6-85', 3], // Rayquaza-EX
      ['bw7-49', 2], // Keldeo-EX
      ['bw5-38', 1], // Raikou-EX
      ['bw6-128', 1], // Rayquaza
      ['bw8-128', 1], // Dowsing Machine
      ['bw2-91', 3], // Cheren
      ['bw3-92', 4], // N
      ['bw1-101', 3], // Professor Juniper
      ['bw7-134', 2], // Skyla
      ['bw8-118', 2], // Colress
      ['bw5-102', 4], // Ultra Ball
      ['bw4-89', 3], // Level Ball
      ['bw9-99', 3], // Float Stone
      ['bw2-95', 3], // Pokémon Catcher
      ['bw6-116', 1], // Tool Scrapper
      ['bw2-94', 1], // Max Potion
      ['bw3-95', 1], // Super Rod
      ['bw1-108', 10], // Lightning Energy
      ['bw1-106', 4], // Fire Energy
    ],
  },
  {
    id: 'g5-blastoise',
    gen: 5,
    name: 'Blastoise',
    text: 'Blastoise\'s Deluge fuels Keldeo-EX\'s Secret Sword while Black Kyurem-EX\'s Black Ballista takes down big targets.',
    cover: 'bw7-29',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#blastoise',
    notes: 'Tropical Beach (BW promo, not in catalog) x4 replaced by Cheren (draw Supporter).',
    list: [
      ['bw7-29', 3], // Squirtle
      ['bw7-31', 3], // Blastoise
      ['bw7-49', 3], // Keldeo-EX
      ['bw7-101', 2], // Black Kyurem-EX
      ['bw7-100', 1], // Black Kyurem
      ['bw9-4', 1], // Exeggcute
      ['bw10-60', 1], // Jirachi-EX
      ['bw7-137', 1], // Computer Search
      ['bw2-91', 4], // Cheren
      ['bw7-134', 3], // Skyla
      ['bw3-92', 3], // N
      ['bw1-101', 2], // Professor Juniper
      ['bw8-118', 1], // Colress
      ['bw5-100', 4], // Rare Candy
      ['bw9-103', 4], // Superior Energy Retrieval
      ['bw5-102', 3], // Ultra Ball
      ['bw4-89', 2], // Level Ball
      ['bw2-95', 2], // Pokémon Catcher
      ['bw6-116', 2], // Tool Scrapper
      ['bw4-88', 1], // Heavy Ball
      ['bw1-93', 1], // Energy Search
      ['bw1-107', 10], // Water Energy
      ['bw1-108', 3], // Lightning Energy
    ],
  },
  {
    id: 'g5-virizion-ex-genesect-ex',
    gen: 5,
    name: 'Virizion-EX/Genesect-EX',
    text: 'A Turn-2 Emerald Slash, spare Energy moved onto Genesect-EX, then G Booster to one-hit Pokémon-EX.',
    cover: 'bw10-9',
    source: 'https://jklaczpokemon.com/black-and-white-decks/#virizion-ex-genesect-ex',
    list: [
      ['bw10-9', 4], // Virizion-EX
      ['bw10-11', 3], // Genesect-EX
      ['bw6-49', 1], // Drifloon
      ['bw6-51', 1], // Drifblim
      ['bw10-60', 1], // Jirachi-EX
      ['bw10-92', 1], // G Booster
      ['bw4-91', 3], // Skyarrow Bridge
      ['bw1-101', 4], // Professor Juniper
      ['bw3-92', 4], // N
      ['bw7-134', 3], // Skyla
      ['bw9-102', 2], // Shadow Triad
      ['bw8-118', 1], // Colress
      ['bw5-102', 4], // Ultra Ball
      ['bw1-94', 3], // Energy Switch
      ['bw5-94', 2], // Enhanced Hammer
      ['bw6-116', 2], // Tool Scrapper
      ['bw2-95', 2], // Pokémon Catcher
      ['bw9-105', 1], // Team Plasma Ball
      ['bw7-136', 1], // Town Map
      ['bw3-95', 1], // Super Rod
      ['bw8-119', 1], // Colress Machine
      ['bw8-123', 1], // Hypnotoxic Laser
      ['bw1-105', 10], // Grass Energy
      ['bw8-127', 4], // Plasma Energy
    ],
  },
];
