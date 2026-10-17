// Wizards Black Star Promos (basep) Trainer cards, by card id. Lucky Stadium and Pokémon Tower are Stadiums:
// one Stadium is in play at a time for both players (GameState.stadium), and a new one sends the old one to
// its owner's discard pile; one with the same name can't be played over it.
// Rulings (agreed): Computer Error: the player who plays it chooses to draw 0–5, then the opponent does (the
// CPU always draws 5), and the turn ends. Pokémon Tower stops Trainers that would put discarded cards into the
// hand from being played, and attacks that would do so leave the cards where they are.
import { addLog } from '../status.js';
import type { TrainerEffect } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';

export const PROMO_TRAINERS: Record<string, TrainerEffect> = {
  // Computer Error: you may draw up to 5 cards, then your opponent may draw up to 5. Your turn is over (no attack).
  'basep-16': {
    play: (ctx) => ctx.pend({ kind: 'drawCount', source: 'Computer Error', max: 5, afterAttack: true }),
  },

  // Pokémon Center: the same card as Base Set's.
  'basep-40': BASE1_TRAINERS['base1-85']!,

  // Lucky Stadium: once during each player's turn, they may flip a coin; heads draws a card.
  'basep-41': {
    stadium: true,
    useStadium({ state, me, flip }) {
      if (!flip()) return addLog(state, 'Lucky Stadium: no card.', me.id);
      const drawn = me.deck.shift();
      if (drawn) me.hand.push(drawn);
      addLog(state, drawn ? 'Drew a card.' : 'No cards left to draw.', me.id);
    },
  },

  // Pokémon Tower: effects that would put a card from a discard pile into its owner's hand leave it there.
  'basep-42': { stadium: true },
};
