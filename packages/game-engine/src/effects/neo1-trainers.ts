// Neo Genesis (neo1) Trainer cards, by card id. Super Energy Retrieval stands in for the Japanese Fan Book
// promo of the same card, which TCGdex doesn't have (agreed).
import { isBasicEnergy } from '../cards.js';
import { def, otherHandCards, type TrainerEffect } from '../trainers.js';

export const NEO1_TRAINERS: Record<string, TrainerEffect> = {
  // Super Energy Retrieval: trade 2 other cards from your hand for 4 basic Energy cards from your discard pile (all of them, if fewer).
  'neo1-89': {
    discardToHand: true,
    blocked(s) {
      if (otherHandCards(s).length < 2) return 'You need 2 other cards in your hand';
      return s.me.discard.some((c) => isBasicEnergy(def(s, c))) ? null : 'No basic Energy cards in your discard pile';
    },
    choices(s) {
      const energy = s.me.discard.filter((c) => isBasicEnergy(def(s, c)));
      const count = Math.min(4, energy.length);
      return [
        { kind: 'cards', field: 'handUids', min: 2, max: 2, options: otherHandCards(s), prompt: 'Choose 2 other cards to discard' },
        { kind: 'cards', field: 'discardUids', min: count, max: count, options: energy, prompt: `Choose ${count} basic Energy card${count === 1 ? '' : 's'} from your discard pile` },
      ];
    },
    play(ctx) {
      const taken = ctx.me.discard.filter((c) => ctx.choices.discardUids!.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
      ctx.me.discard.push(...ctx.fromHand(ctx.me, ctx.choices.handUids!));
      ctx.me.hand.push(...taken);
      ctx.log(`Took ${taken.length} Energy from the discard pile.`);
    },
  },
};
