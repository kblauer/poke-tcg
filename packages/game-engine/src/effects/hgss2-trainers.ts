// Unleashed (hgss2) Trainer cards, by card id. Most reprint earlier cards and play as those.
// From the text: Cheerleader's Cheer asks the opponent whether to draw; Energy Returner takes 4 basic Energy cards (all there
// are when fewer); Engineer's Adjustments needs an Energy card in the hand to discard; Good Rod's card goes on top of the deck;
// Interviewer's Questions takes any Energy cards among the top 8, one at a time; Judge's players each draw 4; Pokémon
// Circulator's opponent picks the Pokémon switched in; Alph Lithograph shuffles the deck.
import { isBasicEnergy, isPokemonCard, isTrainerCard, lookupCard } from '../cards.js';
import { activeLock } from '../engine.js';
import { trainerProof } from '../powers.js';
import { otherHandCards, type TrainerEffect } from '../trainers.js';
import { DP1_TRAINERS } from './dp1-trainers.js';
import { EX2_TRAINERS } from './ex2-trainers.js';
import { EX4_TRAINERS } from './ex4-trainers.js';
import { NEO1_TRAINERS } from './neo1-trainers.js';
import { PL1_TRAINERS } from './pl1-trainers.js';

export const HGSS2_TRAINERS: Record<string, TrainerEffect> = {
  // Cheerleader's Cheer (Supporter): 3 cards drawn; the opponent may draw a card.
  'hgss2-71': {
    supporter: true,
    play(ctx) {
      ctx.draw(ctx.me, 3);
      if (ctx.opp.deck.length) ctx.state.pendingChoice = { player: ctx.opp.id, source: "Cheerleader's Cheer", kind: 'drawCount', max: 1 };
    },
  },
  // Dual Ball: as EX Team Magma vs Team Aqua's.
  'hgss2-72': EX4_TRAINERS['ex4-72']!,
  // Emcee's Chatter (Supporter): heads, 3 cards drawn; tails, 2.
  'hgss2-73': { supporter: true, play: (ctx) => ctx.draw(ctx.me, ctx.flip() ? 3 : 2) },
  // Energy Returner: 4 basic Energy cards from the discard pile shuffled into the deck, shown.
  'hgss2-74': {
    blocked: (s) => (s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'You have no basic Energy cards in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToDeck', source: 'Energy Returner', count: 4, of: 4, filter: 'basicEnergy' }),
  },
  // Engineer's Adjustments (Supporter): an Energy card discarded from the hand, then 4 cards drawn.
  'hgss2-75': {
    supporter: true,
    blocked: (s) => (otherHandCards(s).some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'You have no Energy card in your hand to discard'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => lookupCard(s.cards, c.defId).kind === 'energy'), prompt: "Engineer's Adjustments: choose an Energy card to discard" }],
    play(ctx) {
      ctx.me.discard.push(...ctx.fromHand(ctx.me, ctx.choices.handUids ?? []));
      ctx.draw(ctx.me, 4);
    },
  },
  // Good Rod: heads, a Pokémon from the discard pile on top of the deck; tails, a Trainer card, shown.
  'hgss2-76': {
    blocked: (s) => (s.me.discard.some((c) => c.uid !== s.card.uid && (isPokemonCard(lookupCard(s.cards, c.defId)) || isTrainerCard(lookupCard(s.cards, c.defId)))) ? null : 'You have no Pokémon or Trainer cards in your discard pile'),
    play(ctx) {
      const heads = ctx.flip();
      const fits = (c: (typeof ctx.me.discard)[number]) => (heads ? isPokemonCard(lookupCard(ctx.state.cards, c.defId)) : isTrainerCard(lookupCard(ctx.state.cards, c.defId)));
      if (ctx.me.discard.some(fits)) ctx.pend({ kind: 'pickFromDiscard', source: 'Good Rod', filter: heads ? 'pokemon' : 'trainer', excludeUid: ctx.card.uid });
      else ctx.log('Good Rod found nothing.');
    },
  },
  // Interviewer's Questions (Supporter): any Energy cards among the top 8 into the hand, shown; the rest shuffled back.
  'hgss2-77': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: "Interviewer's Questions", looked: ctx.me.deck.slice(0, 8).map((c) => c.uid), take: 8, basicEnergy: true, anyEnergy: true }),
  },
  // Judge (Supporter): each player's hand shuffled into their deck, then 4 cards drawn.
  'hgss2-78': {
    supporter: true,
    play(ctx) {
      const own = ctx.me.hand.filter((c) => c.uid !== ctx.card.uid);
      ctx.me.hand = ctx.me.hand.filter((c) => c.uid === ctx.card.uid);
      ctx.shuffleIntoDeck(ctx.me, own);
      const theirs = ctx.opp.hand;
      ctx.opp.hand = [];
      ctx.shuffleIntoDeck(ctx.opp, theirs);
      ctx.draw(ctx.me, 4);
      ctx.draw(ctx.opp, 4);
    },
  },
  // Life Herb: as Platinum's. PlusPower: as Diamond & Pearl's. Super Scoop Up: as Neo Genesis's. Rare Candy: as EX Sandstorm's.
  'hgss2-79': PL1_TRAINERS['pl1-108']!,
  'hgss2-80': DP1_TRAINERS['dp1-109']!,
  'hgss2-82': EX2_TRAINERS['ex2-88']!,
  'hgss2-83': NEO1_TRAINERS['neo1-98']!,
  // Pokémon Circulator: the opponent switches their Active Pokémon with one of their Benched Pokémon.
  'hgss2-81': {
    blocked: (s) => trainerProof(s.opp, [s.me, s.opp], s.cards) ?? (s.opp.bench.some(Boolean) ? activeLock(s.opp, [s.me, s.opp], s.cards) : 'Your opponent has no Benched Pokémon'),
    play(ctx) {
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Pokémon Circulator', kind: 'switchIn' };
    },
  },
  // Alph Lithograph: the deck shuffled.
  'hgss2-TWO': { play: (ctx) => ctx.shuffleIntoDeck(ctx.me, []) },
};
