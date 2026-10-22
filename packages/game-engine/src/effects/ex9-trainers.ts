// EX Emerald (ex9) Trainer cards and special Energy, by card id. Lanette's Net Search, Mr. Stone's Project, Professor
// Birch, Scott and Wally's Training are Supporters; Battle Frontier is a Stadium; Lum Berry and Oran Berry are Pokémon Tools.
// Agreed with the user: Mr. Stone's Project finds basic Energy cards (the printed card says "basic Energy cards"; TCGdex
// says "Basic cards"), in the deck or the discard pile.
// From the text: Battle Frontier turns off the Poké-Powers and Poké-Bodies of Colorless, Darkness and Metal Evolved Pokémon,
// either type of a dual-type one counting (refreshHideout); Scott finds any mix of up to 3 Supporter and Stadium cards.
import { isBasicEnergy } from '../cards.js';
import { def, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { EX1_ENERGY, EX1_TRAINERS } from './ex1-trainers.js';
import { EX2_ENERGY, EX2_TRAINERS } from './ex2-trainers.js';
import { EX4_ENERGY } from './ex4-trainers.js';

export const EX9_TRAINERS: Record<string, TrainerEffect> = {
  // Battle Frontier: a Stadium (refreshHideout).
  'ex9-75': { stadium: true },
  // Double Full Heal, Lanette's Net Search, Rare Candy, Wally's Training: as EX Sandstorm's.
  'ex9-76': EX2_TRAINERS['ex2-86']!,
  'ex9-77': EX2_TRAINERS['ex2-87']!,
  'ex9-83': EX2_TRAINERS['ex2-88']!,
  'ex9-85': EX2_TRAINERS['ex2-89']!,
  // Lum Berry, Oran Berry, PokéNav, Professor Birch: as EX Ruby & Sapphire's.
  'ex9-78': EX1_TRAINERS['ex1-84']!,
  'ex9-80': EX1_TRAINERS['ex1-85']!,
  'ex9-81': EX1_TRAINERS['ex1-88']!,
  'ex9-82': EX1_TRAINERS['ex1-89']!,

  // Mr. Stone's Project (Supporter): up to 2 basic Energy cards from the deck, or from the discard pile, shown.
  'ex9-79': {
    supporter: true,
    discardToHand: true,
    blocked: (s) => (s.deckCount || s.me.discard.some((c) => isBasicEnergy(def(s, c))) ? null : 'Your deck and discard pile have no basic Energy cards'),
    choices: (s) => [
      {
        kind: 'pick',
        field: 'pick',
        options: [...(s.deckCount ? [0] : []), ...(s.me.discard.some((c) => isBasicEnergy(def(s, c))) ? [1] : [])],
        labels: ['From your deck', 'From your discard pile'],
        prompt: "Mr. Stone's Project: take the basic Energy cards from your deck or your discard pile?",
      },
    ],
    play(ctx) {
      if (ctx.choices.pick === 1) ctx.pend({ kind: 'discardToHand', source: "Mr. Stone's Project", count: 2, filter: 'basicEnergy', reveal: true });
      else ctx.pend({ kind: 'pickFromDeck', source: "Mr. Stone's Project", filter: 'basicEnergy', reveal: true, optional: true, count: 2 });
    },
  },

  // Scott (Supporter): up to 3 Supporter and Stadium cards from the deck, shown.
  'ex9-84': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Scott', filter: 'supporterOrStadium', reveal: true, optional: true, count: 3 }),
  },
};

export const EX9_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy, Double Rainbow Energy, Multi Energy: as the earlier EX sets'.
  'ex9-86': EX1_ENERGY['ex1-93']!,
  'ex9-87': EX4_ENERGY['ex4-88']!,
  'ex9-88': EX1_ENERGY['ex1-94']!,
  'ex9-89': EX2_ENERGY['ex2-93']!,
};
