// Next Destinies (bw4) Trainer cards and Special Energy, by card id. Cilan is a Supporter; Exp. Share is a Pokémon Tool read
// where it applies (attacks.ts); Pokémon Center and Skyarrow Bridge are Stadiums. Double Colorless Energy plays as every
// set's (by its name, card-fixes.ts); Prism Energy is read where its Energy is (engine.ts's cardEnergy).
// From the text: Cilan, Heavy Ball and Level Ball show what they find, and a search may come up short; Heavy Ball and Level
// Ball read the printed Retreat Cost and HP; Exp. Share's Pokémon may take one basic Energy card from the player's Active
// Pokémon the opponent's attack's damage Knocks Out (each Exp. Share one, the Tool staying); Pokémon Center heals 20 from one
// Benched Pokémon, once during each player's turn; Skyarrow Bridge takes 1 off every Basic Pokémon's Retreat Cost, both
// players'; Prism Energy is every type, 1 at a time, only on a Basic Pokémon (not a Restored Pokémon), Colorless otherwise.
import { isBasicPokemon } from '../cards.js';
import type { EnergyEffect, TrainerEffect } from '../trainers.js';
import { tool } from './neo1-trainers.js';

/** The player's Benched Pokémon with damage counters (Pokémon Center). */
const damagedBench = (me: { bench: ({ damage: number } | null)[] }) => me.bench.some((p) => p && p.damage > 0);

export const BW4_TRAINERS: Record<string, TrainerEffect> = {
  // Cilan (Supporter): up to 3 basic Energy cards from the deck into the hand, shown.
  'bw4-86': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Cilan', filter: 'basicEnergy', reveal: true, optional: true, count: 3 }),
  },
  // Exp. Share: the player's Active Pokémon Knocked Out by the opponent's attack, a basic Energy card from it to this one (attacks.ts).
  'bw4-87': tool('Exp. Share'),
  // Heavy Ball: a Pokémon with a Retreat Cost of 3 or more from the deck into the hand, shown.
  'bw4-88': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Heavy Ball', filter: 'minRetreat', minRetreat: 3, reveal: true, optional: true }),
  },
  // Level Ball: a Pokémon with 90 HP or less from the deck into the hand, shown.
  'bw4-89': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Level Ball', filter: 'pokemonMaxHp', maxHp: 90, reveal: true, optional: true }),
  },
  // Pokémon Center (Stadium): once during each player's turn, 20 damage off one of their Benched Pokémon.
  'bw4-90': {
    stadium: true,
    stadiumBlocked: (me) => (damagedBench(me) ? null : 'Pokémon Center: none of your Benched Pokémon have damage counters'),
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Pokémon Center', kind: 'removeDamage', amount: 20, benchOnly: true };
    },
  },
  // Skyarrow Bridge (Stadium): each Basic Pokémon in play retreats for 1 less.
  'bw4-91': { stadium: true, retreatModifier: (p) => (isBasicPokemon(p) ? -1 : 0) },
};

export const BW4_ENERGY: Record<string, EnergyEffect> = {
  // Prism Energy: Colorless; on a Basic Pokémon, every type, 1 at a time (cardEnergy).
  'bw4-93': {},
};
