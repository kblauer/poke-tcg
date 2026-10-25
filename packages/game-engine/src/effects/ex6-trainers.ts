// EX FireRed & LeafGreen (ex6) Trainer cards and special Energy, by card id. Bill's Maintenance, Celio's Network and Prof.
// Oak's Research are Supporters; Mt. Moon is a Stadium; EXP. ALL is a Pokémon Tool.
// Agreed with the user: with more than one EXP. ALL in play, their owner picks which one takes the Energy card, asked before
// the Knock Out discards it (attacks.ts, as Energy Grounding).
// From the text: EXP. ALL goes on a Pokémon that isn't a Pokémon-ex and has no owner in its name, and works when the opponent's
// attack Knocks Out its owner's Active Pokémon; Mt. Moon stops the Poké-Powers (older Pokémon Powers too, as Lazy) of Pokémon
// with less than 70 HP (powerError); PokéDex HANDY909 shuffles the deck first, then the top 6 go back in any order.
import { hasOwner } from '../cards.js';
import { trainerEffect } from './index.js';
import { type Target } from '../engine.js';
import { openBenchSlot, pokemonName } from '../status.js';
import { def, own, targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { EX2_ENERGY } from './ex2-trainers.js';
import { EX5_TRAINERS } from './ex5-trainers.js';
import { JUNGLE_TRAINERS } from './jungle-trainers.js';
import { NEO1_TRAINERS } from './neo1-trainers.js';

/** The player's Pokémon EXP. ALL can go on: not a Pokémon-ex, no owner in its name, no Pokémon Tool. */
const expAllTargets = (s: TrainerSituation): Target[] =>
  targetsOf(s.me).filter((t) => {
    const p = own(s, t)!;
    const d = def(s, p.card);
    return d.kind === 'pokemon' && !d.ex && !hasOwner(d.name) && !p.attached?.some((a) => a.tool);
  });

export const EX6_TRAINERS: Record<string, TrainerEffect> = {
  // Bill's Maintenance (Supporter), Energy Removal 2, Pokémon Reversal: as Expedition's.
  'ex6-87': ECARD1_TRAINERS['ecard1-137']!,
  'ex6-89': ECARD1_TRAINERS['ecard1-140']!,
  'ex6-97': ECARD1_TRAINERS['ecard1-146']!,

  // Celio's Network (Supporter): a Basic Pokémon or Evolution card (not a Pokémon-ex) from the deck, shown.
  'ex6-88': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: "Celio's Network", filter: 'pokemonNotEx', reveal: true, optional: true }),
  },

  // Energy Switch: as Aquapolis's.
  'ex6-90': ECARD2_TRAINERS['ecard2-120']!,

  // EXP. ALL: a Pokémon Tool (its rule in attacks.ts, expAllEx).
  'ex6-91': {
    tool: true,
    toolFor: (d) => !d.ex && !hasOwner(d.name),
    blocked: (s) => (expAllTargets(s).length ? null : 'None of your Pokémon can take EXP. ALL (not Pokémon-ex, Pokémon with an owner in their names, or ones with a Pokémon Tool)'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: expAllTargets(s), prompt: 'Choose one of your Pokémon to attach EXP. ALL to' }],
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      ctx.attachTo(p, Number.MAX_SAFE_INTEGER, { tool: true });
      ctx.log(`Attached EXP. ALL to ${pokemonName(ctx.state, p)}.`);
    },
  },

  // Great Ball: a Basic Pokémon (not a Pokémon-ex) from the deck onto the Bench.
  'ex6-92': {
    blocked: (s) => (!s.deckCount ? 'Your deck is empty' : openBenchSlot(s.me, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Great Ball', filter: 'basicNotEx', toBench: true, optional: true }),
  },

  // Life Herb: as Hidden Legends'.
  'ex6-93': EX5_TRAINERS['ex5-90']!,

  // Mt. Moon: Pokémon with less than 70 HP can't use Poké-Powers (powerError).
  'ex6-94': { stadium: true },

  // Poké Ball: as Jungle's.
  'ex6-95': JUNGLE_TRAINERS['base2-64']!,

  // PokéDex HANDY909: the deck shuffled, then its top 6 cards put back in any order.
  'ex6-96': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      ctx.shuffleIntoDeck(ctx.me, []);
      ctx.pend({ kind: 'arrangeTop', source: 'PokéDex HANDY909', count: Math.min(6, ctx.me.deck.length) });
    },
  },

  // Prof. Oak's Research (Supporter): the hand shuffled into the deck, then 5 cards drawn.
  'ex6-98': {
    supporter: true,
    play(ctx) {
      ctx.shuffleIntoDeck(ctx.me, ctx.me.hand.filter((c) => c.uid !== ctx.card.uid));
      ctx.me.hand = ctx.me.hand.filter((c) => c.uid === ctx.card.uid);
      ctx.log('Shuffled the hand into the deck.');
      ctx.draw(ctx.me, 5);
    },
  },

  // Super Scoop Up, Potion, Switch: as the earlier cards.
  'ex6-99': NEO1_TRAINERS['neo1-98']!,
  'ex6-101': BASE1_TRAINERS['base1-94']!,
  'ex6-102': BASE1_TRAINERS['base1-95']!,

  // VS Seeker: a Supporter card from the discard pile into the hand, shown.
  'ex6-100': {
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => !!trainerEffect(c.defId)?.supporter) ? null : 'No Supporter cards in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToHand', source: 'VS Seeker', count: 1, filter: 'supporter', reveal: true }),
  },
};

export const EX6_ENERGY: Record<string, EnergyEffect> = {
  // Multi Energy: as EX Sandstorm's.
  'ex6-103': EX2_ENERGY['ex2-93']!,
};
