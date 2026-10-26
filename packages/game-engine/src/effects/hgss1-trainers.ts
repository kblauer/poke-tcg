// HeartGold & SoulSilver (hgss1) Trainer cards and Special Energy, by card id. Most reprint earlier cards and play as those.
// From the text: Fisherman takes 4 basic Energy cards (all there are when fewer); Moomoo Milk's Pokémon is picked before the
// flips; Pokégear 3.0 takes a Supporter card among the top 7, the rest shuffled back; Pokémon Communication trades as Pokémon
// Trader does (the Pokémon from the hand goes into the deck as one is taken); Pokémon Reversal is a coin, then Gust of Wind;
// Alph Lithograph shows the opponent's hand.
import { isBasicEnergy, lookupCard } from '../cards.js';
import { pokemonName } from '../status.js';
import { targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { DP1_TRAINERS } from './dp1-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { EX1_TRAINERS } from './ex1-trainers.js';
import { EX12_ENERGY } from './ex12-trainers.js';

const at = (side: Pick<TrainerSituation['me'], 'active' | 'bench'>, t: 'active' | number) => (t === 'active' ? side.active : side.bench[t])!;
const gust = BASE1_TRAINERS['base1-93']!;

export const HGSS1_TRAINERS: Record<string, TrainerEffect> = {
  // Bill (Supporter): 2 cards drawn.
  'hgss1-89': { ...BASE1_TRAINERS['base1-91']!, supporter: true },
  // Copycat: as Expedition's.
  'hgss1-90': ECARD1_TRAINERS['ecard1-138']!,
  // Energy Switch: as Aquapolis's.
  'hgss1-91': ECARD2_TRAINERS['ecard2-120']!,
  // Fisherman (Supporter): 4 basic Energy cards from the discard pile into the hand, shown.
  'hgss1-92': {
    supporter: true,
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'You have no basic Energy cards in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToHand', source: 'Fisherman', count: 4, filter: 'basicEnergy', reveal: true, exact: true }),
  },
  // Full Heal: as Expedition's.
  'hgss1-93': ECARD1_TRAINERS['ecard1-154']!,
  // Moomoo Milk: 2 coins, 3 damage counters off one of the player's Pokémon for each heads.
  'hgss1-94': {
    blocked: (s) => (targetsOf(s.me).some((t) => at(s.me, t).damage) ? null : 'None of your Pokémon have damage counters'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => at(s.me, t).damage > 0), prompt: 'Moomoo Milk: choose one of your Pokémon' }],
    play(ctx) {
      const p = ctx.choices.target === undefined ? null : at(ctx.me, ctx.choices.target);
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (!p || !heads) return;
      const healed = Math.min(30 * heads, p.damage);
      p.damage -= healed;
      ctx.log(`Removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Poké Ball: as Diamond & Pearl's.
  'hgss1-95': DP1_TRAINERS['dp1-110']!,
  // Pokégear 3.0: a Supporter card among the top 7 into the hand, shown; the rest shuffled back.
  'hgss1-96': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'Pokégear 3.0', looked: ctx.me.deck.slice(0, 7).map((c) => c.uid), take: 1, supporter: true }),
  },
  // Pokémon Collector (Supporter): up to 3 Basic Pokémon from the deck, shown.
  'hgss1-97': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Pokémon Collector', filter: 'basic', reveal: true, optional: true, count: 3 }),
  },
  // Pokémon Communication: as Base Set's Pokémon Trader.
  'hgss1-98': BASE1_TRAINERS['base1-77']!,
  // Pokémon Reversal: heads, Gust of Wind.
  'hgss1-99': {
    ...gust,
    play(ctx) {
      if (ctx.flip()) gust.play!(ctx);
      else ctx.log('Pokémon Reversal did nothing.');
    },
  },
  // Professor Elm's Training Method: as Expedition's.
  'hgss1-100': ECARD1_TRAINERS['ecard1-148']!,
  // Professor Oak's New Theory (Supporter): the hand shuffled into the deck, then 6 cards drawn.
  'hgss1-101': {
    supporter: true,
    play(ctx) {
      const hand = ctx.me.hand.filter((c) => c.uid !== ctx.card.uid);
      ctx.me.hand = ctx.me.hand.filter((c) => c.uid === ctx.card.uid);
      ctx.shuffleIntoDeck(ctx.me, hand);
      ctx.draw(ctx.me, 6);
    },
  },
  // Switch: as EX Ruby & Sapphire's.
  'hgss1-102': EX1_TRAINERS['ex1-92']!,
  // Alph Lithograph: the opponent's hand shown.
  'hgss1-ONE': { play: (ctx) => ctx.pend({ kind: 'lookOppHand', source: 'Alph Lithograph' }) },
};

export const HGSS1_ENERGY: Record<string, EnergyEffect> = {
  // Rainbow Energy: as EX Legend Maker's.
  'hgss1-104': EX12_ENERGY['ex12-81']!,
};
