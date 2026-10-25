// DP Black Star Promos (dpp) Trainer cards, by card id. Ultimate Zone is a Stadium, usable any number of times.
// From the text: Ultimate Zone moves basic Energy cards (one at a time) from the Benched Pokémon to the Active Arceus.
import { namesMatch } from '../cards.js';
import { afflictBetweenTurns } from '../engine.js';
import { inPlayDef, pokemonName } from '../status.js';
import type { TrainerEffect } from '../trainers.js';

/** Tropical Wind: heads, 2 damage counters off each Active Pokémon; tails, each Active Pokémon Asleep. */
const tropicalWind: TrainerEffect = {
  play(ctx) {
    const heads = ctx.flip();
    for (const side of [ctx.me, ctx.opp]) {
      const p = side.active;
      if (!p) continue;
      if (!heads) {
        afflictBetweenTurns(ctx.state, side.id, p, 'asleep');
        continue;
      }
      const healed = Math.min(20, p.damage);
      p.damage -= healed;
      if (healed) ctx.log(`Removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
    }
  },
};

export const DPP_TRAINERS: Record<string, TrainerEffect> = {
  'dpp-DP05': tropicalWind,
  'dpp-DP25': tropicalWind,
  'dpp-DP48': tropicalWind,
  // Beginning Door: an Arceus from the deck, shown.
  'dpp-DP54': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Beginning Door', filter: 'named', name: 'Arceus', reveal: true, optional: true }),
  },
  // Ultimate Zone: any number of times a turn, basic Energy cards moved from the player's Benched Pokémon to their Active Arceus.
  'dpp-DP55': {
    stadium: true,
    stadiumAnyTimes: true,
    stadiumBlocked: (me, cards) => (me.active && namesMatch(inPlayDef(cards, me.active).name, 'Arceus') ? null : 'Your Active Pokémon is not Arceus'),
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Ultimate Zone', kind: 'moveAttached', target: 'active' };
    },
  },
};
