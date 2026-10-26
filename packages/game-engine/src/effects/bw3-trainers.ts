// Noble Victories (bw3) Trainer cards, by card id. So far the Fossil Items, done with the Black & White series' shared rules
// (README: Generation 5): Cover Fossil and Plume Fossil, the only way their Restored Pokémon (Tirtouga, Archen) come into play.
import type { TrainerEffect } from '../trainers.js';

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
  // Plume Fossil: Archen from the bottom 7 cards onto the Bench.
  'bw3-93': fossilItem('Plume Fossil', 'Archen'),
};
