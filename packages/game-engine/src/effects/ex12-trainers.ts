// EX Legend Maker (ex12) Trainer cards and special Energy, by card id. Fieldworker is a Supporter; Cursed Stone, Full Flame,
// Giant Stump, Power Tree and Strange Cave are Stadiums; Claw Fossil, Mysterious Fossil and Root Fossil are played as Basic
// Pokémon (Trainer cards in play as well, agreed: Psyloop counts them).
// From the text: Cursed Stone's damage counters go on the Pokémon with a printed Poké-Power (agreed: working or not; the older
// Pokémon Powers too) between turns (betweenTurns); Full Flame makes Burned 4 damage counters and keeps it through evolving
// and devolving (betweenTurns, refreshHideout); Giant Stump allows 3 Benched Pokémon (benchRoom), and when it's played each
// player with more discards down to 3, its player first; Power Tree works only with no Special Energy cards in its player's
// discard pile; Strange Cave's Pokémon is treated as a Basic Pokémon (`asBasic`); Fieldworker's opponent may draw a card.
import { isBasicEnergy, lookupCard, type CardLibrary } from '../cards.js';
import { openBenchSlot } from '../status.js';
import { handToBenchFits, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { EX1_ENERGY } from './ex1-trainers.js';
import { JAGGED_STONE, SPONGY_STONE } from './ex2-trainers.js';

/** The Fossil Pokémon Strange Cave, Holon Fossil and Influence put onto the Bench as Basic Pokémon. */
export const FOSSIL_POKEMON = ['Omanyte', 'Kabuto', 'Aerodactyl', 'Aerodactyl ex', 'Lileep', 'Anorith'];

/** Power Tree: no Special Energy cards in the discard pile, and a basic Energy card. */
const treeBlocked = (discard: { defId: string }[], cards: CardLibrary) => {
  if (discard.some((c) => {
    const d = lookupCard(cards, c.defId);
    return d.kind === 'energy' && d.basic === false;
  })) return 'Power Tree: you have Special Energy cards in your discard pile';
  return discard.some((c) => isBasicEnergy(lookupCard(cards, c.defId))) ? null : 'Power Tree: no basic Energy cards in your discard pile';
};

export const EX12_TRAINERS: Record<string, TrainerEffect> = {
  // Cursed Stone, Full Flame: Stadiums (engine.ts).
  'ex12-72': { stadium: true },
  'ex12-74': { stadium: true },
  // Fieldworker (Supporter): 3 cards drawn; the opponent may draw a card.
  'ex12-73': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      ctx.draw(ctx.me, 3);
      if (ctx.opp.deck.length) ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Fieldworker', kind: 'drawCount', max: 1 };
    },
  },
  // Giant Stump (Stadium): played, each player with more than 3 Benched Pokémon discards down to 3, its player first.
  'ex12-75': {
    stadium: true,
    play(ctx) {
      const crowded = [ctx.me, ctx.opp].filter((p) => p.bench.filter(Boolean).length > 3);
      const [first, ...rest] = crowded.map((p) => ({ player: p.id, source: 'Giant Stump', kind: 'narrowGym' as const, limit: 3, discard: true }));
      if (!first) return;
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },
  // Power Tree (Stadium): once during each player's turn, with no Special Energy cards in their discard pile, a basic Energy card from it into their hand, shown.
  'ex12-76': {
    stadium: true,
    stadiumBlocked: (me, cards) => treeBlocked(me.discard, cards),
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Power Tree', kind: 'discardToHand', count: 1, filter: 'basicEnergy', reveal: true };
    },
  },
  // Strange Cave (Stadium): once during each player's turn, a Fossil Pokémon from the hand onto the Bench, as a Basic Pokémon.
  'ex12-77': {
    stadium: true,
    stadiumBlocked(me, cards) {
      if (openBenchSlot(me.bench, cards) < 0) return 'Strange Cave: your Bench is full';
      return me.hand.some((c) => handToBenchFits(cards, FOSSIL_POKEMON, c)) ? null : `Strange Cave: no ${FOSSIL_POKEMON.join(', ')} in your hand`;
    },
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Strange Cave', kind: 'handToBench', names: FOSSIL_POKEMON, optional: true };
    },
  },
  // Claw Fossil, Mysterious Fossil, Root Fossil: played as Basic Pokémon (as EX Sandstorm's), and Trainer cards in play too.
  'ex12-78': { asPokemon: { hp: 40, power: JAGGED_STONE, alsoTrainer: true } },
  'ex12-79': { asPokemon: { hp: 50, alsoTrainer: true } },
  'ex12-80': { asPokemon: { hp: 40, power: SPONGY_STONE, alsoTrainer: true } },
};

export const EX12_ENERGY: Record<string, EnergyEffect> = {
  // Rainbow Energy: as EX Ruby & Sapphire's.
  'ex12-81': EX1_ENERGY['ex1-95']!,
  // React Energy: Colorless Energy; the cards that read it check its name.
  'ex12-82': { onAttach: () => {} },
};
