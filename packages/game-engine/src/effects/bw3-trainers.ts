// Noble Victories (bw3) Trainer cards, by card id. The Fossil Items were done with the Black & White series' shared rules
// (README: Generation 5): Cover Fossil and Plume Fossil, the only way their Restored Pokémon (Tirtouga, Archen) come into play.
// N is a Supporter; Eviolite and Rocky Helmet are Pokémon Tools read where they apply (attacks.ts). From the text: Eviolite
// takes 20 off any attack's damage to a Basic Pokémon (not a Restored Pokémon), its own player's too; Rocky Helmet works only on
// the Active Pokémon, even as it's Knocked Out; N's players draw as many cards as they have Prize cards left, the one playing it
// first; Super Rod shuffles up to 3 Pokémon and basic Energy cards back (as Night Maintenance: the player may stop sooner);
// Xtransceiver's Supporter is shown to the opponent.
import { discardsLocked } from '../powers.js';
import { shuffle } from '../rng.js';
import type { TrainerEffect } from '../trainers.js';
import { tool } from './neo1-trainers.js';

/**
 * A Fossil Item: "Look at the bottom 7 cards of your deck. You may reveal a [Restored Pokémon] you find there and put it
 * onto your Bench. Shuffle the other cards back into your deck." (bottomPick, `restored`). Shared by every set's Fossils.
 */
export const fossilItem = (source: string, restored: string): TrainerEffect => ({
  blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
  play: (ctx) => ctx.pend({ kind: 'bottomPick', source, looked: ctx.me.deck.slice(-7).map((c) => c.uid), take: 1, restored }),
});

export const BW3_TRAINERS: Record<string, TrainerEffect> = {
  // Cover Fossil: Tirtouga from the bottom 7 cards onto the Bench.
  'bw3-90': fossilItem('Cover Fossil', 'Tirtouga'),
  // Eviolite: 20 less damage from attacks to a Basic Pokémon, after Weakness and Resistance (attacks.ts).
  'bw3-91': tool('Eviolite'),
  // N (Supporter): each player's hand shuffled into their deck; each draws a card for each of their Prize cards left.
  'bw3-92': {
    supporter: true,
    play(ctx) {
      for (const p of [ctx.me, ctx.opp]) {
        [p.deck, ctx.state.rngState] = shuffle([...p.deck, ...p.hand.splice(0)], ctx.state.rngState);
        ctx.log('Shuffled the hand into the deck.', p.id);
        ctx.draw(p, p.prizes.length);
      }
    },
  },
  // Plume Fossil: Archen from the bottom 7 cards onto the Bench.
  'bw3-93': fossilItem('Plume Fossil', 'Archen'),
  // Rocky Helmet: its Active Pokémon damaged by the opponent's attack, 2 damage counters on the Attacking Pokémon (attacks.ts).
  'bw3-94': tool('Rocky Helmet'),
  // Super Rod: up to 3 Pokémon and basic Energy cards from the discard pile shuffled into the deck.
  'bw3-95': {
    blocked: (s) => (s.me.discard.length ? null : 'Your discard pile is empty'),
    play(ctx) {
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'discardToDeck', source: 'Super Rod', count: 3, of: 3, filter: 'pokemonOrBasicEnergy' });
    },
  },
  // Xtransceiver: heads, a Supporter card from the deck into the hand, shown.
  'bw3-96': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Xtransceiver did nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Xtransceiver', filter: 'supporter', reveal: true });
    },
  },
};
