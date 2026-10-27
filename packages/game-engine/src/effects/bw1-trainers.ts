// Black & White (bw1) Trainer cards, by card id. Professor Juniper is a Supporter; the rest are Items. Energy Search, Energy
// Switch, Poké Ball, Pokédex, Super Scoop Up and Switch reprint earlier cards and play the same, as do Full Heal and Pokémon
// Communication (HeartGold & SoulSilver's). From the text: Energy Retrieval takes 2 basic Energy cards (or the 1 there is)
// with nothing to discard; Potion heals 30; Revive puts no damage counters on the Pokémon; PlusPower's 10 more is for every
// attack of the player's that turn to the Active Pokémon, before Weakness and Resistance (`plusPowers`, unlike Base Set's
// attached PlusPower, after them).
import { isBasicEnergy, isBasicPokemon } from '../cards.js';
import { newInPlay } from '../engine.js';
import { pokemonAt } from '../powers.js';
import { inPlayDef, openBenchSlot } from '../status.js';
import { def, own, targetsOf, type TrainerEffect } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { EX1_TRAINERS } from './ex1-trainers.js';
import { HGSS1_TRAINERS } from './hgss1-trainers.js';
import { JUNGLE_TRAINERS } from './jungle-trainers.js';
import { NEO1_TRAINERS } from './neo1-trainers.js';

export const BW1_TRAINERS: Record<string, TrainerEffect> = {
  // Energy Retrieval: 2 basic Energy cards from the discard pile into the hand.
  'bw1-92': {
    blocked: (s) => (s.me.discard.some((c) => isBasicEnergy(def(s, c))) ? null : 'No basic Energy in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToHand', source: 'Energy Retrieval', count: 2, filter: 'basicEnergy' }),
  },
  // Energy Search: as Expedition's. Energy Switch: as Aquapolis's. Full Heal: as HeartGold & SoulSilver's.
  'bw1-93': ECARD1_TRAINERS['ecard1-153']!,
  'bw1-94': ECARD2_TRAINERS['ecard2-120']!,
  'bw1-95': HGSS1_TRAINERS['hgss1-93']!,
  // PlusPower: 10 more for the player's attacks this turn, to the Active Pokémon, before Weakness and Resistance.
  'bw1-96': {
    play(ctx) {
      const count = ctx.me.plusPowers?.turn === ctx.turn ? ctx.me.plusPowers.count + 1 : 1;
      ctx.me.plusPowers = { turn: ctx.turn, count };
      ctx.log(`PlusPower: your attacks do ${10 * count} more damage to the Active Pokémon this turn.`);
    },
  },
  // Poké Ball: as Jungle's. Pokédex: as Base Set's. Pokémon Communication: as HeartGold & SoulSilver's.
  'bw1-97': JUNGLE_TRAINERS['base2-64']!,
  'bw1-98': BASE1_TRAINERS['base1-87']!,
  'bw1-99': HGSS1_TRAINERS['hgss1-98']!,
  // Potion: 30 damage off 1 of the player's Pokémon.
  'bw1-100': {
    blocked: (s) => (targetsOf(s.me).some((t) => own(s, t)!.damage > 0) ? null : 'None of your Pokémon have damage counters'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => own(s, t)!.damage > 0), prompt: 'Choose a Pokémon to heal' }],
    play(ctx) {
      const p = pokemonAt(ctx.me, ctx.choices.target!)!;
      const healed = Math.min(30, p.damage);
      p.damage -= healed;
      ctx.log(`Healed ${healed} damage from ${inPlayDef(ctx.state.cards, p).name}.`);
    },
  },
  // Professor Juniper (Supporter): the hand discarded, then 7 cards drawn.
  'bw1-101': {
    supporter: true,
    play(ctx) {
      ctx.me.discard.push(...ctx.me.hand.splice(0));
      ctx.log('Discarded their hand.');
      ctx.draw(ctx.me, 7);
    },
  },
  // Revive: a Basic Pokémon from the discard pile onto the Bench.
  'bw1-102': {
    blocked(s) {
      if (openBenchSlot(s.me, s.cards, s.stadium) < 0) return 'Your Bench is full';
      return s.me.discard.some((c) => isBasicPokemon(def(s, c))) ? null : 'No Basic Pokémon in your discard pile';
    },
    choices: (s) => [{ kind: 'cards', field: 'discardUids', min: 1, max: 1, options: s.me.discard.filter((c) => isBasicPokemon(def(s, c))), prompt: 'Choose a Basic Pokémon from your discard pile' }],
    play(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids![0])!;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.bench[openBenchSlot(ctx.me, ctx.state.cards, ctx.state.stadium?.card)] = newInPlay(card, ctx.turn);
      ctx.log(`Put ${def(ctx.state, card).name} from the discard pile onto the Bench.`);
    },
  },
  // Super Scoop Up: as Neo Genesis's. Switch: as EX Ruby & Sapphire's.
  'bw1-103': NEO1_TRAINERS['neo1-98']!,
  'bw1-104': EX1_TRAINERS['ex1-92']!,
};
