// Undaunted (hgss3) Trainer cards and Special Energy, by card id. Ruins of Alph is the engine's own rule (no Resistance).
// From the text: Burned Tower's coin is flipped only with a basic Energy card in the discard pile; Energy Exchanger needs an
// Energy card in the hand; Flower Shop Lady takes up to 3 Pokémon, then up to 3 basic Energy cards, one at a time; Legend Box
// benches the first Pokémon LEGEND whose two halves it finds, with room on the Bench; Sage's Training takes 2 cards (all there
// are when fewer); Alph Lithograph returns the Stadium to its owner's hand.
import { isBasicEnergy, isLegend, isPokemonCard, lookupCard } from '../cards.js';
import { newInPlay, type CardInstance } from '../engine.js';
import { shuffle } from '../rng.js';
import { addLog, openBenchSlot } from '../status.js';
import { otherHandCards, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { DP2_ENERGY } from './dp2-trainers.js';

export const HGSS3_TRAINERS: Record<string, TrainerEffect> = {
  // Burned Tower: once during each player's turn, heads, a basic Energy card from the discard pile into the hand, shown.
  'hgss3-71': {
    stadium: true,
    stadiumBlocked: (me, cards) => (me.discard.some((c) => isBasicEnergy(lookupCard(cards, c.defId))) ? null : 'Burned Tower: you have no basic Energy cards in your discard pile'),
    useStadium({ state, me, flip }) {
      if (!flip()) return addLog(state, 'Burned Tower found nothing.', me.id);
      state.pendingChoice = { player: me.id, source: 'Burned Tower', kind: 'discardToHand', count: 1, filter: 'basicEnergy', reveal: true, exact: true };
    },
  },
  // Defender: as the Base Set's.
  'hgss3-72': BASE1_TRAINERS['base1-80']!,
  // Energy Exchanger: an Energy card from the hand on top of the deck, then an Energy card from the deck into the hand, shown.
  'hgss3-73': {
    blocked: (s) => (otherHandCards(s).some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'You have no Energy card in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => lookupCard(s.cards, c.defId).kind === 'energy'), prompt: 'Energy Exchanger: choose an Energy card to put on top of your deck' }],
    play(ctx) {
      const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids ?? []);
      if (!card) return;
      ctx.me.deck.unshift(card);
      ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} on top of the deck.`);
      ctx.pend({ kind: 'pickFromDeck', source: 'Energy Exchanger', filter: 'energy', reveal: true });
    },
  },
  // Flower Shop Lady (Supporter): up to 3 Pokémon and up to 3 basic Energy cards from the discard pile shuffled into the deck, shown.
  'hgss3-74': {
    supporter: true,
    blocked: (s) => (s.me.discard.some((c) => isPokemonCard(lookupCard(s.cards, c.defId)) || isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'You have no Pokémon or basic Energy cards in your discard pile'),
    play(ctx) {
      const energy = { kind: 'discardToDeck' as const, source: 'Flower Shop Lady', count: 3, of: 3, filter: 'basicEnergy' as const };
      const hasEnergy = ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)));
      if (!ctx.me.discard.some((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)))) return ctx.pend(energy);
      ctx.pend({ kind: 'discardToDeck', source: 'Flower Shop Lady', count: 3, of: 3 });
      if (hasEnergy) (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, ...energy });
    },
  },
  // Legend Box: the top 10 cards shown; both halves of a Pokémon LEGEND among them go onto the Bench with every Energy card shown.
  'hgss3-75': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const top = ctx.me.deck.slice(0, 10);
      const name = (c: CardInstance) => lookupCard(ctx.state.cards, c.defId).name;
      ctx.log(`Legend Box shows ${top.map(name).join(', ')}.`);
      const slot = openBenchSlot(ctx.me, ctx.state.cards, ctx.state.stadium?.card);
      const legend = slot < 0 ? undefined : top.find((c) => isLegend(lookupCard(ctx.state.cards, c.defId)) && top.some((d) => d.defId !== c.defId && name(d) === name(c)));
      const half = legend && top.find((d) => d.defId !== legend.defId && name(d) === name(legend));
      if (legend && half) {
        const energy = top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        ctx.me.deck = ctx.me.deck.filter((c) => c !== legend && c !== half && !energy.includes(c));
        ctx.me.bench[slot] = { ...newInPlay(legend, ctx.state.turn), energy, attached: [{ card: half, until: Number.MAX_SAFE_INTEGER, legendHalf: true }] };
        ctx.log(`Put ${name(legend)} onto the Bench${energy.length ? ` with ${energy.map(name).join(', ')} attached` : ''}.`);
      } else ctx.log('Legend Box found no Pokémon LEGEND.');
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
    },
  },
  // Ruins of Alph: no Pokémon in play has Resistance (attacks.ts).
  'hgss3-76': { stadium: true, play: () => {} },
  // Sage's Training (Supporter): 2 of the top 5 cards into the hand, the rest discarded.
  'hgss3-77': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: "Sage's Training", looked: ctx.me.deck.slice(0, 5).map((c) => c.uid), take: Math.min(2, ctx.me.deck.length) }),
  },
  // Team Rocket's Trickery (Supporter): 2 cards drawn, then the opponent discards a card from their hand.
  'hgss3-78': {
    supporter: true,
    play(ctx) {
      ctx.draw(ctx.me, 2);
      if (ctx.opp.hand.length) ctx.state.pendingChoice = { player: ctx.opp.id, source: "Team Rocket's Trickery", kind: 'discardFromHand', count: 1 };
    },
  },
  // Alph Lithograph: the Stadium in play back into its owner's hand.
  'hgss3-THREE': {
    blocked: (s) => (s.stadium ? null : 'There is no Stadium card in play'),
    play(ctx) {
      const stadium = ctx.state.stadium;
      if (!stadium) return;
      ctx.state.players[stadium.owner]!.hand.push(stadium.card);
      ctx.state.stadium = null;
      ctx.log(`${lookupCard(ctx.state.cards, stadium.card.defId).name} went back into its owner's hand.`);
    },
  },
};

export const HGSS3_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as Mysterious Treasures'.
  'hgss3-79': DP2_ENERGY['dp2-119']!,
  'hgss3-80': DP2_ENERGY['dp2-120']!,
};
