// Fossil (base3) Trainer cards, by card id. Rulings (agreed): Recycle needs a card in the discard pile
// and the card is chosen after heads (never Recycle itself); Mysterious Fossil follows Clefairy Doll's
// rules (not a starting Active or opening-hand Basic, no prize when Knocked Out), and Omanyte, Kabuto
// and Aerodactyl evolve from it, Pokémon Breeder included.
import type { CardInstance } from '../engine.js';
import { pokemonName } from '../status.js';
import { targetsOf, type TrainerEffect } from '../trainers.js';

/** A card leaving play: an Electrode attached as Energy (Buzzap) is a Pokémon card again. */
const asCard = ({ provides: _, ...card }: CardInstance): CardInstance => card;

export const FOSSIL_TRAINERS: Record<string, TrainerEffect> = {
  // Mr. Fuji: shuffle a benched Pokémon and all cards attached to it into your deck.
  'base3-58': {
    blocked: (s) => (s.me.bench.some(Boolean) ? null : 'You have no benched Pokémon'),
    choices: (s) => [
      { kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => t !== 'active'), prompt: 'Choose a benched Pokémon to shuffle into your deck' },
    ],
    play(ctx) {
      const slot = ctx.choices.target as number;
      const p = ctx.me.bench[slot]!;
      ctx.me.bench[slot] = null;
      ctx.shuffleIntoDeck(ctx.me, [...p.evolvedFrom, p.card, ...p.energy.map(asCard), ...(p.attached ?? []).map((a) => a.card)]);
      ctx.log(`Shuffled ${pokemonName(ctx.state, p)} and its cards into the deck.`);
    },
  },

  // Energy Search: take a basic Energy card from your deck.
  'base3-59': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Energy Search', filter: 'basicEnergy' }),
  },

  // Gambler: shuffle your hand into your deck, then draw 8 cards on heads or 1 on tails.
  'base3-60': {
    play(ctx) {
      const hand = ctx.me.hand.splice(0);
      ctx.shuffleIntoDeck(ctx.me, hand);
      ctx.log(`Shuffled ${hand.length} card${hand.length === 1 ? '' : 's'} into the deck.`);
      ctx.draw(ctx.me, ctx.flip() ? 8 : 1);
    },
  },

  // Recycle: on heads, put a card from your discard pile on top of your deck.
  'base3-61': {
    blocked: (s) => (s.me.discard.length ? null : 'Your discard pile is empty'),
    play(ctx) {
      if (ctx.flip()) ctx.pend({ kind: 'pickFromDiscard', source: 'Recycle', excludeUid: ctx.card.uid });
      else ctx.log('Recycle did nothing.');
    },
  },

  // Mysterious Fossil: played onto the Bench as a 10 HP Pokémon, like Clefairy Doll.
  'base3-62': { asPokemon: { hp: 10 } },
};
