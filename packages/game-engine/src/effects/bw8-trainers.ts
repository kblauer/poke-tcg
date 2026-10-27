// Plasma Storm (bw8) Trainer cards and Special Energy, by card id. Colress and Team Plasma Grunt are Supporters, Plasma Frigate
// and Virbank City Gym Stadiums, Victory Piece a Pokémon Tool, the rest Items (Dowsing Machine and Scramble Switch ACE SPEC).
// Plasma Energy is a Special Energy card providing Colorless Energy; effects that name it read it with `isPlasmaEnergy`, and
// Team Plasma cards (their Pokémon, Trainers and Plasma Energy) with `isTeamPlasma` (exported for the later Plasma sets).
// Dowsing Machine plays as Base Set's Item Finder (the same text). From the text: Bicycle draws until the hand has 4 cards (none
// with 4 or more); Colress counts both players' Benched Pokémon; Colress Machine's Plasma Energy goes onto a Team Plasma Pokémon
// clicked; Escape Rope's opponent switches first, each player picking their own Pokémon (a player with no Benched Pokémon doesn't
// switch), and Bright Veil and Legendary Body keep the opponent from switching; Ether shows the top card, which goes back on top
// unless it's a basic Energy card; Hypnotoxic Laser's coin is flipped even if the Poison can't be given; Plasma Frigate takes
// Weakness away from any Pokémon with a Plasma Energy card attached (attacks.ts); Team Plasma Grunt's Team Plasma card is picked
// from the hand; Virbank City Gym's 2 damage counters add to Poison's own (betweenTurns); Scramble Switch moves the old Active
// Pokémon's Energy cards one at a time, as many as the player likes (shiftEnergy); Victory Piece lets Victini-EX attack whatever
// Energy is attached (`freeAttacks`).
import { isBasicEnergy, lookupCard, type CardLibrary } from '../cards.js';
import { activeLocked, afflictBetweenTurns, type CardInstance, type PlayerState } from '../engine.js';
import { itemVeiled, trainerProof } from '../powers.js';
import type { EnergyEffect, PendingChoice, TrainerContext, TrainerEffect } from '../trainers.js';
import { otherHandCards, swapActive, targetsOf } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { tool } from './neo1-trainers.js';

/** A Plasma Energy card (by name, as the cards print it), not a Pokémon attached as Energy. */
export const isPlasmaEnergy = (cards: CardLibrary, e: CardInstance) => !e.provides && lookupCard(cards, e.defId).name === 'Plasma Energy';

/** A Team Plasma card: a Team Plasma Pokémon, Trainer or Plasma Energy (`teamPlasma`, from card-fixes.ts). */
export const isTeamPlasma = (cards: CardLibrary, c: CardInstance) => !!(lookupCard(cards, c.defId) as { teamPlasma?: boolean }).teamPlasma;

/** Escape Rope: whether `side` switches, and how (at once with 1 Benched Pokémon, or asked). Logs why not. */
function escape(ctx: TrainerContext, side: PlayerState, sides: PlayerState[]): PendingChoice | null {
  const slots = side.bench.flatMap((p, i) => (p ? [i] : []));
  if (!slots.length || !side.active) return null;
  if (side === ctx.opp) {
    const proof = itemVeiled(side, sides, ctx.state.cards) ?? trainerProof(side, sides, ctx.state.cards);
    if (proof) return ctx.log(proof, side.id), null;
  }
  const locked = activeLocked(ctx.state, side.id);
  if (locked) return ctx.log(`${locked}.`, side.id), null;
  if (slots.length === 1) return swapActive(ctx.state, side, slots[0]!), null;
  return { player: side.id, source: 'Escape Rope', kind: 'switchIn' };
}

export const BW8_TRAINERS: Record<string, TrainerEffect> = {
  // Bicycle: cards drawn until the hand has 4.
  'bw8-117': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.draw(ctx.me, Math.max(0, 4 - ctx.me.hand.length)),
  },
  // Colress (Supporter): the hand shuffled into the deck, then a card drawn for each Benched Pokémon, both players'.
  'bw8-118': {
    supporter: true,
    play(ctx) {
      ctx.shuffleIntoDeck(ctx.me, ctx.me.hand.splice(0));
      ctx.log('Shuffled the hand into the deck.');
      ctx.draw(ctx.me, [...ctx.me.bench, ...ctx.opp.bench].filter(Boolean).length);
    },
  },
  // Colress Machine: a Plasma Energy card from the deck attached to one of the player's Team Plasma Pokémon.
  'bw8-119': {
    blocked(s) {
      if (!s.deckCount) return 'Your deck is empty';
      return targetsOf(s.me).some((t) => isTeamPlasma(s.cards, (t === 'active' ? s.me.active : s.me.bench[t])!.card)) ? null : 'You have no Team Plasma Pokémon in play';
    },
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Colress Machine', filter: 'energyNamed', name: 'Plasma Energy', attach: true, attachOnly: { plasma: true } }),
  },
  // Escape Rope: each player switches their Active Pokémon with one of their Benched Pokémon, the opponent first.
  'bw8-120': {
    blocked: (s) => ([s.me, s.opp].some((side) => side.active && side.bench.some(Boolean)) ? null : 'Neither player has a Benched Pokémon'),
    play(ctx) {
      const sides = [ctx.me, ctx.opp];
      const asked = [escape(ctx, ctx.opp, sides), escape(ctx, ctx.me, sides)].filter((c): c is PendingChoice => !!c);
      const [first, ...rest] = asked;
      if (!first) return;
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },
  // Ether: the top card shown; a basic Energy card is attached to one of the player's Pokémon, anything else stays on top.
  'bw8-121': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const top = ctx.me.deck[0]!;
      const d = lookupCard(ctx.state.cards, top.defId);
      ctx.log(`Ether: the top card is ${d.name}.`);
      if (!isBasicEnergy(d)) return ctx.log(`${d.name} goes back on top of the deck.`);
      ctx.me.deck.shift();
      ctx.pend({ kind: 'attachCard', source: 'Ether', card: top });
    },
  },
  // Hypnotoxic Laser: the opponent's Active Pokémon is Poisoned; heads, Asleep too.
  'bw8-123': {
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    play(ctx) {
      const sides = [ctx.me, ctx.opp];
      const target = ctx.opp.active!;
      const proof = itemVeiled(ctx.opp, sides, ctx.state.cards) ?? trainerProof(ctx.opp, sides, ctx.state.cards);
      if (proof) ctx.log(proof, ctx.opp.id);
      else afflictBetweenTurns(ctx.state, ctx.opp.id, target, 'poisoned');
      if (ctx.flip() && !proof && ctx.opp.active === target) afflictBetweenTurns(ctx.state, ctx.opp.id, target, 'asleep');
    },
  },
  // Plasma Frigate (Stadium): no Weakness for any Pokémon with a Plasma Energy card attached (attacks.ts).
  'bw8-124': { stadium: true },
  // Team Plasma Grunt (Supporter): a Team Plasma card from the hand discarded, then 4 cards drawn.
  'bw8-125': {
    supporter: true,
    blocked: (s) => (otherHandCards(s).some((c) => isTeamPlasma(s.cards, c)) ? null : 'You have no Team Plasma card in your hand to discard'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => isTeamPlasma(s.cards, c)), prompt: 'Choose a Team Plasma card to discard' }],
    play(ctx) {
      const gone = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.me.discard.push(...gone);
      ctx.log(`Discarded ${gone.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
      ctx.draw(ctx.me, 4);
    },
  },
  // Virbank City Gym (Stadium): 2 more damage counters on each Poisoned Pokémon between turns (betweenTurns).
  'bw8-126': { stadium: true },
  // Dowsing Machine (ACE SPEC): as Base Set's Item Finder.
  'bw8-128': BASE1_TRAINERS['base1-74']!,
  // Scramble Switch (ACE SPEC): the Active Pokémon switched with a Benched one; then any of the old Active Pokémon's Energy moved to the new one.
  'bw8-129': {
    blocked: (s) => trainerProof(s.me, [s.me, s.opp], s.cards) ?? (s.me.active && s.me.bench.some(Boolean) ? null : 'You have no Benched Pokémon'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: s.me.bench.flatMap((p, i) => (p ? [i] : [])), prompt: 'Choose a Benched Pokémon to switch in' }],
    play(ctx) {
      const slot = ctx.choices.target as number;
      const was = ctx.me.active;
      swapActive(ctx.state, ctx.me, slot);
      if (ctx.me.active === was || !was?.energy.some((e) => !e.provides)) return;
      ctx.pend({ kind: 'shiftEnergy', source: 'Scramble Switch', from: slot, to: 'active', any: true });
    },
  },
  // Victory Piece (Tool): Victini-EX attacks whatever Energy is attached (attackError).
  'bw8-130': { ...tool('Victory Piece'), freeAttacks: (p) => p.name === 'Victini-EX' },
};

/** Plasma Energy: Colorless Energy, and a Team Plasma card (it has no other effect of its own). */
export const BW8_ENERGY: Record<string, EnergyEffect> = {
  'bw8-127': {},
};
