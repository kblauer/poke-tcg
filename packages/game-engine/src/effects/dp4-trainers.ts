// Great Encounters (dp4) Trainer cards, by card id. Felicity's Drawing is a Supporter; Amulet Coin and Leftovers are Pokémon
// Tools (their end-of-turn effects in betweenTurns); Moonlight Stadium is a Stadium (retreatModifier).
// From the text: Premier Ball asks which pile first; Felicity's Drawing discards 1 or 2 cards, picked.
import { hasType } from '../cards.js';
import { discardsLocked } from '../powers.js';
import { otherHandCards, type TrainerEffect } from '../trainers.js';
import { EX2_TRAINERS } from './ex2-trainers.js';
import { tool } from './neo1-trainers.js';

export const DP4_TRAINERS: Record<string, TrainerEffect> = {
  // Amulet Coin, Leftovers: Pokémon Tools (betweenTurns).
  'dp4-97': tool('Amulet Coin'),
  'dp4-99': tool('Leftovers'),
  // Felicity's Drawing (Supporter): 1 card discarded draws 3, 2 draw 4.
  'dp4-98': {
    supporter: true,
    blocked: (s) => (otherHandCards(s).length ? null : "You can't play Felicity's Drawing when it's the only card in your hand"),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 2, options: otherHandCards(s), prompt: "Felicity's Drawing: choose 1 or 2 cards to discard (1 draws 3, 2 draw 4)" }],
    play(ctx) {
      const gone = ctx.me.hand.filter((c) => ctx.choices.handUids?.includes(c.uid));
      if (!gone.length) return;
      ctx.me.hand = ctx.me.hand.filter((c) => !gone.includes(c));
      ctx.me.discard.push(...gone);
      ctx.log(`Discarded ${gone.length} card${gone.length === 1 ? '' : 's'}.`);
      ctx.draw(ctx.me, gone.length + 2);
    },
  },
  // Moonlight Stadium: Psychic and Darkness Pokémon retreat for free.
  'dp4-100': { stadium: true, retreatModifier: (p) => (hasType(p, 'psychic') || hasType(p, 'darkness') ? -99 : 0) },
  // Premier Ball: a Pokémon LV.X from the deck or the discard pile, shown.
  'dp4-101': {
    choices: () => [{ kind: 'pick', field: 'pick', options: [0, 1], labels: ['Search your deck', 'Search your discard pile'], prompt: 'Premier Ball: where do you search?' }],
    play(ctx) {
      if (ctx.choices.pick === 1) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        return ctx.pend({ kind: 'discardToHand', source: 'Premier Ball', count: 1, filter: 'levelUp', reveal: true });
      }
      ctx.pend({ kind: 'pickFromDeck', source: 'Premier Ball', filter: 'levelUp', reveal: true, optional: true });
    },
  },
  // Rare Candy: as EX Sandstorm's.
  'dp4-102': EX2_TRAINERS['ex2-88']!,
};
