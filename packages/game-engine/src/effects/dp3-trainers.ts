// Secret Wonders (dp3) Trainer cards and Special Energy, by card id. Professor Oak's Visit, Roseanne's Research and Team
// Galactic's Mars are Supporters; the reprints play as their earlier prints.
// From the text: Professor Oak's Visit draws first, then asks which card goes on the bottom; Team Galactic's Mars draws first,
// then puts a random card of the opponent's hand on the bottom of their deck.
import { nextRandom } from '../rng.js';
import type { EnergyEffect, TrainerEffect } from '../trainers.js';
import { DP1_TRAINERS } from './dp1-trainers.js';
import { DP2_TRAINERS } from './dp2-trainers.js';
import { EX1_ENERGY, EX1_TRAINERS } from './ex1-trainers.js';

export const DP3_TRAINERS: Record<string, TrainerEffect> = {
  // Bebe's Search, Night Maintenance: as Mysterious Treasures'. PlusPower, Professor Rowan, Rival: as Diamond & Pearl's.
  // Potion, Switch: as EX Ruby & Sapphire's.
  'dp3-119': DP2_TRAINERS['dp2-109']!,
  'dp3-120': DP2_TRAINERS['dp2-113']!,
  'dp3-121': DP1_TRAINERS['dp1-109']!,
  'dp3-123': DP1_TRAINERS['dp1-112']!,
  'dp3-124': DP1_TRAINERS['dp1-113']!,
  'dp3-127': EX1_TRAINERS['ex1-91']!,
  'dp3-128': EX1_TRAINERS['ex1-92']!,
  // Professor Oak's Visit (Supporter): 3 cards drawn, then a card from the hand on the bottom of the deck.
  'dp3-122': {
    supporter: true,
    play(ctx) {
      ctx.draw(ctx.me, 3);
      if (ctx.me.hand.some((c) => c.uid !== ctx.card.uid)) ctx.pend({ kind: 'handToDeck', source: "Professor Oak's Visit", bottom: true });
    },
  },
  // Roseanne's Research (Supporter): up to 2 Basic Pokémon and basic Energy cards from the deck, shown.
  'dp3-125': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: "Roseanne's Research", filter: 'basicOrBasicEnergy', count: 2, reveal: true, optional: true }),
  },
  // Team Galactic's Mars (Supporter): 2 cards drawn, then one of the opponent's hand at random on the bottom of their deck.
  'dp3-126': {
    supporter: true,
    play(ctx) {
      ctx.draw(ctx.me, 2);
      if (!ctx.opp.hand.length) return ctx.log("Your opponent's hand is empty.");
      const [r, next] = nextRandom(ctx.state.rngState);
      ctx.state.rngState = next;
      const [card] = ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1);
      if (card) ctx.opp.deck.push(card);
      ctx.log("Put a card from your opponent's hand on the bottom of their deck.");
    },
  },
};

export const DP3_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as EX Ruby & Sapphire's.
  'dp3-129': EX1_ENERGY['ex1-93']!,
  'dp3-130': EX1_ENERGY['ex1-94']!,
};
