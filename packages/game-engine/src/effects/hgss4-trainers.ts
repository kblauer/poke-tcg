// Triumphant (hgss4) Trainer cards and Special Energy, by card id. Black Belt's damage, Indigo Plateau's HP and Rescue Energy
// are the engine's own rules.
// From the text: Junk Arm's 2 cards are picked as it's played, and it's played only with a Trainer card (not Junk Arm) in the discard pile to take (agreed 2026-10-25); Seeker can be
// played while either player has a Benched Pokémon, a player with none returning nothing; Alph Lithograph shows the player
// every one of their Prize cards.
import { lookupCard } from '../cards.js';
import { otherHandCards, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';

/** More Prize cards left than the opponent (Black Belt, Twins). */
const behind = (s: TrainerSituation) => (!s.prizes || s.prizes.me > s.prizes.opp ? null : 'You can play this card only with more Prize cards left than your opponent');

export const HGSS4_TRAINERS: Record<string, TrainerEffect> = {
  // Black Belt (Supporter): with more Prize cards left, the Active Pokémon's attacks do 40 more to the opponent's Active Pokémon this turn.
  'hgss4-85': {
    supporter: true,
    blocked: behind,
    play(ctx) {
      ctx.me.blackBeltTurn = ctx.state.turn;
      ctx.log("This turn, your Active Pokémon's attacks do 40 more damage to your opponent's Active Pokémon.");
    },
  },
  // Indigo Plateau: each Pokémon LEGEND in play gets 30 more HP (refreshHideout).
  'hgss4-86': { stadium: true, play: () => {} },
  // Junk Arm: 2 cards discarded from the hand, then a Trainer card (not Junk Arm) from the discard pile into the hand, shown.
  'hgss4-87': {
    blocked: (s) =>
      otherHandCards(s).length < 2
        ? 'You need 2 other cards in your hand to discard'
        : s.me.discard.some((c) => lookupCard(s.cards, c.defId).kind === 'trainer' && lookupCard(s.cards, c.defId).name !== 'Junk Arm')
          ? null
          : 'You have no Trainer card (other than Junk Arm) in your discard pile',
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 2, max: 2, options: otherHandCards(s), prompt: 'Junk Arm: choose 2 cards to discard' }],
    play(ctx) {
      ctx.me.discard.push(...ctx.fromHand(ctx.me, ctx.choices.handUids ?? []));
      const fits = (c: (typeof ctx.me.discard)[number]) => lookupCard(ctx.state.cards, c.defId).kind === 'trainer' && lookupCard(ctx.state.cards, c.defId).name !== 'Junk Arm';
      if (ctx.me.discard.some(fits)) ctx.pend({ kind: 'discardToHand', source: 'Junk Arm', count: 1, filter: 'trainerAny', reveal: true, excludeName: 'Junk Arm', exact: true });
    },
  },
  // Seeker (Supporter): each player returns one of their Benched Pokémon and its cards to their hand, the player first.
  'hgss4-88': {
    supporter: true,
    blocked: (s) => (s.me.bench.some(Boolean) || s.opp.bench.some(Boolean) ? null : 'Neither player has a Benched Pokémon'),
    play(ctx) {
      const steps = [ctx.me, ctx.opp].filter((p) => p.bench.some(Boolean)).map((p) => ({ player: p.id, source: 'Seeker', kind: 'narrowGym' as const, returnOne: true }));
      const [first, ...rest] = steps;
      if (!first) return;
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },
  // Twins (Supporter): with more Prize cards left, any 2 cards from the deck.
  'hgss4-89': {
    supporter: true,
    blocked: (s) => behind(s) ?? (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Twins', filter: 'any', count: 2 }),
  },
  // Alph Lithograph: the player's Prize cards shown to them.
  'hgss4-FOUR': {
    blocked: (s) => (s.prizes?.me === 0 ? 'You have no Prize cards left' : null),
    play: (ctx) => ctx.pend({ kind: 'lookOppDeck', source: 'Alph Lithograph', count: ctx.me.prizes.length, own: true, prizes: true }),
  },
};

export const HGSS4_ENERGY: Record<string, EnergyEffect> = {
  // Rescue Energy: 1 Colorless; Knocked Out by an attack's damage, its Pokémon goes back into the hand (engine.ts).
  'hgss4-90': { onAttach: () => {}, rescue: true },
};
