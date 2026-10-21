// EX Ruby & Sapphire (ex1) Trainer cards and special Energy, by card id. Energy Removal 2, Energy Restore, Energy Switch,
// Poké Ball, Energy Search and Potion reprint earlier cards and play the same; Rainbow Energy is Team Rocket's. Lum Berry and
// Oran Berry are Pokémon Tools whose rules live in useBerry (engine.ts). Lady Outing and Professor Birch are Supporters.
// Rulings (from the text): Lady Outing finds up to 3 basic Energy cards, each of a different type, shown to the opponent.
// PokéNav may take nothing if none of the 3 cards is a Basic Pokémon, Evolution or Energy card; the others go back on top in
// the order the player puts them. Professor Birch can be played with 6 or more cards in the hand (it draws none).
// Agreed with the user: "1 of your Active Pokémon" is the one Active Pokémon (Switch, Pokémon Reversal). EX Pokémon
// Reversal's opponent picks the Benched Pokémon that comes in (Expedition's player picks). Darkness and Metal Energy play
// by the EX rules for every set's cards (attacks.ts).
import { activeLocked } from '../engine.js';
import { trainerProof } from '../powers.js';
import { swapActive, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { FOSSIL_TRAINERS } from './fossil-trainers.js';
import { JUNGLE_TRAINERS } from './jungle-trainers.js';
import { tool } from './neo1-trainers.js';
import { ROCKET_ENERGY } from './rocket-trainers.js';

export const EX1_TRAINERS: Record<string, TrainerEffect> = {
  // Energy Removal 2, Energy Restore, Energy Switch: as Expedition's and Aquapolis's.
  'ex1-80': ECARD1_TRAINERS['ecard1-140']!,
  'ex1-81': ECARD1_TRAINERS['ecard1-141']!,
  'ex1-82': ECARD2_TRAINERS['ecard2-120']!,

  // Lady Outing (Supporter): up to 3 basic Energy cards of different types from the deck, shown to the opponent.
  'ex1-83': {
    supporter: true,
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Lady Outing', filter: 'basicEnergy', reveal: true, count: 3, optional: true, distinct: 'type' }),
  },

  // Lum Berry, Oran Berry: Pokémon Tools.
  'ex1-84': tool('Lum Berry'),
  'ex1-85': tool('Oran Berry'),

  // Poké Ball: as Jungle's.
  'ex1-86': JUNGLE_TRAINERS['base2-64']!,

  // Pokémon Reversal: heads, the opponent switches their Active Pokémon with a Benched one of their choice.
  'ex1-87': {
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Pokémon Reversal did nothing.');
      const slots = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      const blocked = trainerProof(ctx.opp, [ctx.me, ctx.opp], ctx.state.cards) ?? activeLocked(ctx.state, ctx.opp.id);
      if (!slots.length || blocked) return ctx.log(blocked ?? 'Your opponent has no Benched Pokémon.');
      if (slots.length === 1) return swapActive(ctx.state, ctx.opp, slots[0]!);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Pokémon Reversal', kind: 'switchIn' };
    },
  },

  // PokéNav: from the top 3 cards, a Basic Pokémon, Evolution or Energy card into the hand; the others back on top in any order.
  'ex1-88': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'PokéNav', looked: ctx.me.deck.slice(0, 3).map((c) => c.uid), take: 1, pokeNav: true }),
  },

  // Professor Birch (Supporter): draw until there are 6 cards in the hand.
  'ex1-89': {
    supporter: true,
    play: (ctx) => ctx.draw(ctx.me, Math.max(0, 6 - ctx.me.hand.length)),
  },

  // Energy Search, Potion, Switch: as Fossil's and Base Set's.
  'ex1-90': FOSSIL_TRAINERS['base3-59']!,
  'ex1-91': BASE1_TRAINERS['base1-94']!,
  'ex1-92': BASE1_TRAINERS['base1-95']!,
};

export const EX1_ENERGY: Record<string, EnergyEffect> = {
  // Darkness and Metal Energy: their rules are in attacks.ts (the EX rules, for every set's).
  'ex1-93': { onAttach: () => {} },
  'ex1-94': { onAttach: () => {} },
  // Rainbow Energy: as Team Rocket's (a damage counter when attached from the hand).
  'ex1-95': ROCKET_ENERGY['base5-17']!,
};
