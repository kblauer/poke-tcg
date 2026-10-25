// Supreme Victors (pl3) Trainer cards, by card id. Battle Tower (levelling up from the hand, engine.ts) and Champion's Room
// (`retreatModifier`) are Stadiums read where they apply.
// From the text: Cyrus's Initiative's cards are picked one at a time from the opponent's hand, shown, and go on the bottom of
// their deck in the order picked; Night Teleporter's hand goes on top of the deck, then any card is searched for and the deck
// shuffled; Palmer's Contribution's cards are picked one at a time, then shuffled in.
import { isBasicEnergy, isPokemonCard, lookupCard } from '../cards.js';
import { isPokemonSP, type TrainerEffect } from '../trainers.js';
import { EX6_TRAINERS } from './ex6-trainers.js';

export const PL3_TRAINERS: Record<string, TrainerEffect> = {
  // Battle Tower: a Pokémon levelled up from the hand gets 4 damage counters off (engine.ts).
  'pl3-134': { stadium: true },
  // Champion's Room: every Pokémon SP retreats for 1 less.
  'pl3-135': { stadium: true, retreatModifier: (d) => (isPokemonSP(d.name) ? -1 : 0) },
  // Cynthia's Guidance (Supporter): 1 of the top 7 cards into the hand; the deck shuffled.
  'pl3-136': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: "Cynthia's Guidance", looked: ctx.me.deck.slice(0, 7).map((c) => c.uid), take: 1, shuffleRest: true }),
  },
  // Cyrus's Initiative (Supporter): 2 coins; for each heads, a card from the opponent's hand (seen) on the bottom of their deck.
  'pl3-137': {
    supporter: true,
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (!heads || !ctx.opp.hand.length) return ctx.log("Cyrus's Initiative did nothing.");
      ctx.pend({ kind: 'oppHandTrainer', source: "Cyrus's Initiative", any: true, count: Math.min(heads, ctx.opp.hand.length), exact: true, place: 'bottom' });
    },
  },
  // Night Teleporter: heads, the hand on top of the deck, then any card from the deck into the hand; the deck shuffled.
  'pl3-138': {
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Night Teleporter did nothing.');
      const hand = ctx.me.hand.filter((c) => c.uid !== ctx.card.uid);
      ctx.me.hand = ctx.me.hand.filter((c) => c.uid === ctx.card.uid);
      ctx.me.deck.unshift(...hand);
      ctx.log(`Put ${hand.length} card${hand.length === 1 ? '' : 's'} from the hand on top of the deck.`);
      if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Night Teleporter', filter: 'any' });
    },
  },
  // Palmer's Contribution (Supporter): up to 5 Pokémon and basic Energy cards from the discard pile shuffled into the deck.
  'pl3-139': {
    supporter: true,
    blocked: (s) => (s.me.discard.some((c) => isPokemonCard(lookupCard(s.cards, c.defId)) || isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'You have no Pokémon or basic Energy cards in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToDeck', source: "Palmer's Contribution", count: 5, of: 5, filter: 'pokemonOrBasicEnergy' }),
  },
  // VS Seeker: as EX FireRed & LeafGreen's.
  'pl3-140': EX6_TRAINERS['ex6-100']!,
};
