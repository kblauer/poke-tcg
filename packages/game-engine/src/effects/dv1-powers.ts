// Dragon Vault (dv1) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY).
// From the text: Scornful Storm has the opponent discard down to 4 cards, picking the cards themselves, one at a time (it
// can't be used while they have 4 or fewer); Grit's 40 more is for its attacks to the Defending Pokémon while it has any
// Special Condition, before Weakness and Resistance.
import type { PowerEffect } from '../powers.js';
import { hasSpecialCondition } from '../status.js';
import { ABILITY } from './common.js';

export const DV1_POWERS: Record<string, PowerEffect> = {
  // Salamence – Scornful Storm: once during the player's turn, the opponent discards cards from their hand until they have 4.
  'dv1-8': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.counts.oppHand > 4 ? null : 'Your opponent has 4 or fewer cards in their hand'),
    use(ctx) {
      const n = ctx.opp.hand.length - 4;
      if (n <= 0) return;
      ctx.log(`Your opponent discards ${n} card${n === 1 ? '' : 's'} from their hand.`);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Scornful Storm', kind: 'discardFromHand', count: n };
    },
  },

  // Fraxure – Grit: with a Special Condition, its attacks do 40 more to the Defending Pokémon, before Weakness and Resistance.
  'dv1-14': { ...ABILITY, defendingMore: { more: 40, when: (pokemon) => hasSpecialCondition(pokemon) } },
};
