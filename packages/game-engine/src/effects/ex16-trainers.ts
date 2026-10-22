// EX Power Keepers (ex16) Trainer cards and special Energy, by card id. Professor Birch, Scott and Steven's Advice are
// Supporters; Battle Frontier, Drake's Stadium, Glacia's Stadium, Phoebe's Stadium and Sidney's Stadium are Stadiums; the
// Fossils play as Basic Pokémon. Most reprint earlier sets' cards and play as those.
// From the text: Drake's Stadium takes 10 off the damage to Colorless Active Pokémon after Weakness and Resistance, and
// Glacia's Stadium takes the Weakness off Water Pokémon that aren't Pokémon-ex (attacks.ts); Sidney's Stadium keeps
// Darkness Pokémon from being Asleep, Confused or Paralyzed (refreshHideout, conditionBarred); Phoebe's Stadium's Psychic
// Pokémon retreat for 2 less; Steven's Advice can't be played with 7 or more cards in the hand, itself included.
import { hasType } from '../cards.js';
import { type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_ENERGY } from './ecard2-trainers.js';
import { ECARD3_ENERGY } from './ecard3-trainers.js';
import { EX1_ENERGY, EX1_TRAINERS } from './ex1-trainers.js';
import { EX3_TRAINERS } from './ex3-trainers.js';
import { EX5_TRAINERS } from './ex5-trainers.js';
import { EX6_ENERGY, EX6_TRAINERS } from './ex6-trainers.js';
import { EX9_TRAINERS } from './ex9-trainers.js';
import { EX12_TRAINERS } from './ex12-trainers.js';

export const EX16_TRAINERS: Record<string, TrainerEffect> = {
  // Battle Frontier, Scott: as EX Emerald's.
  'ex16-71': EX9_TRAINERS['ex9-75']!,
  'ex16-81': EX9_TRAINERS['ex9-84']!,
  // Drake's Stadium, Glacia's Stadium, Sidney's Stadium: Stadiums (attacks.ts, refreshHideout).
  'ex16-72': { stadium: true },
  'ex16-76': { stadium: true },
  'ex16-82': { stadium: true },
  // Phoebe's Stadium: Psychic Pokémon retreat for 2 less.
  'ex16-79': { stadium: true, retreatModifier: (pokemon) => (hasType(pokemon, 'psychic') ? -2 : 0) },
  // Energy Recycle System: as EX Dragon's.
  'ex16-73': EX3_TRAINERS['ex3-84']!,
  // Energy Removal 2, Energy Switch, Great Ball: as EX FireRed & LeafGreen's.
  'ex16-74': EX6_TRAINERS['ex6-89']!,
  'ex16-75': EX6_TRAINERS['ex6-90']!,
  'ex16-77': EX6_TRAINERS['ex6-92']!,
  // Master Ball: as Expedition's. Professor Birch: as EX Ruby & Sapphire's.
  'ex16-78': ECARD1_TRAINERS['ecard1-143']!,
  'ex16-80': EX1_TRAINERS['ex1-89']!,
  // Steven's Advice (Supporter): as EX Hidden Legends', but not with 7 or more cards in the hand.
  'ex16-83': {
    ...EX5_TRAINERS['ex5-92']!,
    blocked: (s) => (s.me.hand.length >= 7 ? "You can't play Steven's Advice with 7 or more cards in your hand" : s.deckCount ? null : 'Your deck is empty'),
  },
  // Claw Fossil, Mysterious Fossil, Root Fossil: as EX Legend Maker's.
  'ex16-84': EX12_TRAINERS['ex12-78']!,
  'ex16-85': EX12_TRAINERS['ex12-79']!,
  'ex16-86': EX12_TRAINERS['ex12-80']!,
};

export const EX16_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as EX Ruby & Sapphire's. Multi Energy: as EX FireRed & LeafGreen's.
  // Cyclone Energy: as Skyridge's. Warp Energy: as Aquapolis's.
  'ex16-87': EX1_ENERGY['ex1-93']!,
  'ex16-88': EX1_ENERGY['ex1-94']!,
  'ex16-89': EX6_ENERGY['ex6-103']!,
  'ex16-90': ECARD3_ENERGY['ecard3-143']!,
  'ex16-91': ECARD2_ENERGY['ecard2-147']!,
};
