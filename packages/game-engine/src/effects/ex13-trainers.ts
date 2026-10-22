// EX Holon Phantoms (ex13) Trainer cards and special Energy, by card id. Holon Adventurer, Mr. Stone's Project and Professor
// Cozmo's Discovery are Supporters (Holon Adventurer played by discarding another card first); Holon Lake is a Stadium.
// From the text: Holon Fossil's Pokémon is treated as a Basic Pokémon (`asBasic`); Holon Lake's Delta Call is an attack any
// δ Pokémon (either player's) can use instead of its own (usableAttacks; its effect in ex13.ts); δ Rainbow Energy provides
// every type, 1 at a time, on a δ Pokémon, Colorless otherwise (energyPool); Holon Adventurer draws 4 when the card
// discarded is a δ Pokémon.
import { lookupCard, type Attack } from '../cards.js';
import { isDelta, isDeltaCard, openBenchSlot } from '../status.js';
import { handToBenchFits, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { EX1_ENERGY } from './ex1-trainers.js';
import { EX2_TRAINERS } from './ex2-trainers.js';
import { EX6_ENERGY } from './ex6-trainers.js';
import { EX7_ENERGY } from './ex7-trainers.js';
import { EX9_TRAINERS } from './ex9-trainers.js';
import { holon } from './ex11-trainers.js';
import { EX12_TRAINERS, FOSSIL_POKEMON } from './ex12-trainers.js';

/** Holon Lake's attack (TCGdex leaves it out; from the printed card). */
const DELTA_CALL: Attack = {
  name: 'Delta Call',
  cost: ['colorless'],
  damage: 0,
  text: 'Search your deck for a Pokémon that has δ on its card, show it to your opponent, and put it into your hand. Shuffle your deck afterward.',
};

export const EX13_TRAINERS: Record<string, TrainerEffect> = {
  // Holon Adventurer: 3 cards drawn, 4 if the card discarded is a δ Pokémon.
  'ex13-85': holon(
    (ctx) => {
      const gone = ctx.me.discard.at(-1);
      const delta = !!gone && isDeltaCard(lookupCard(ctx.state.cards, gone.defId), ctx.me.holonVeil);
      ctx.draw(ctx.me, delta ? 4 : 3);
    },
    (s) => (s.deckCount ? null : 'Your deck is empty'),
  ),
  // Holon Fossil: heads, a Fossil Pokémon from the deck onto the Bench; tails, one from the hand; as a Basic Pokémon either way.
  'ex13-86': {
    blocked: (s) => (openBenchSlot(s.me.bench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
    play(ctx) {
      if (ctx.flip()) {
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Holon Fossil', filter: 'named', name: FOSSIL_POKEMON, toBench: true, asBasic: true, optional: true });
      } else if (ctx.me.hand.some((c) => handToBenchFits(ctx.state.cards, FOSSIL_POKEMON, c))) ctx.pend({ kind: 'handToBench', source: 'Holon Fossil', names: FOSSIL_POKEMON });
      else ctx.log('No Fossil Pokémon in the hand.');
    },
  },
  // Holon Lake (Stadium): δ Pokémon can use Delta Call.
  'ex13-87': { stadium: true, stadiumAttack: { attack: DELTA_CALL, for: (_name, pokemon, cards) => isDelta(cards, pokemon) } },
  // Mr. Stone's Project: as EX Emerald's.
  'ex13-88': EX9_TRAINERS['ex9-79']!,
  // Professor Cozmo's Discovery (Supporter): heads, the bottom 3 cards of the deck drawn; tails, the top 2.
  'ex13-89': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      if (ctx.flip()) {
        const bottom = ctx.me.deck.splice(-3);
        ctx.me.hand.push(...bottom);
        ctx.log(`Drew the bottom ${bottom.length} card${bottom.length === 1 ? '' : 's'} of the deck.`);
      } else ctx.draw(ctx.me, 2);
    },
  },
  // Rare Candy: as EX Sandstorm's.
  'ex13-90': EX2_TRAINERS['ex2-88']!,
  // Claw Fossil, Mysterious Fossil, Root Fossil: as EX Legend Maker's.
  'ex13-91': EX12_TRAINERS['ex12-78']!,
  'ex13-92': EX12_TRAINERS['ex12-79']!,
  'ex13-93': EX12_TRAINERS['ex12-80']!,
};

export const EX13_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as EX Ruby & Sapphire's. Multi Energy: as EX FireRed & LeafGreen's. Dark Metal Energy: as EX Team Rocket Returns'.
  'ex13-94': EX1_ENERGY['ex1-93']!,
  'ex13-95': EX1_ENERGY['ex1-94']!,
  'ex13-96': EX6_ENERGY['ex6-103']!,
  'ex13-97': EX7_ENERGY['ex7-94']!,
  // δ Rainbow Energy (energyPool).
  'ex13-98': { onAttach: () => {} },
};
