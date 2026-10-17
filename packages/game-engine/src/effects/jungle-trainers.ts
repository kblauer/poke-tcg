// Jungle (base2) Trainer cards, by card id. Ruling (agreed): Poké Ball must take a card when the deck has one it can.
import type { TrainerEffect } from '../trainers.js';

export const JUNGLE_TRAINERS: Record<string, TrainerEffect> = {
  // Poké Ball: on heads, take a Basic Pokémon or Evolution card from your deck, shown to the opponent.
  'base2-64': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play(ctx) {
      if (ctx.flip()) ctx.pend({ kind: 'pickFromDeck', source: 'Poké Ball', filter: 'pokemon', reveal: true });
      else ctx.log('Poké Ball did nothing.');
    },
  },
};
