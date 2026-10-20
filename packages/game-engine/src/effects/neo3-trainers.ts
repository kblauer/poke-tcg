// Neo Revelation (neo3) Trainer cards, by card id. Balloon Berry is a Pokémon Tool (its rule lives in engine.ts: retreatCost
// is 0 with it, and RETREAT discards it). Healing Field and Rocket's Hideout are Stadiums (Rocket's Hideout's 20 HP:
// refreshHideout and inPlayDef).
// Rulings (from the text): Healing Field can be used once during each player's turn while their Active Pokémon has damage
// counters. Rocket's Hideout counts "Dark" as a word in the name (Dark Gyarados, not Darkrai-like names), and a Pokémon
// whose damage then reaches its HP once the Stadium leaves is Knocked Out. Old Rod's card can't be the Old Rod being played.
import { addLog, pokemonName } from '../status.js';
import { def, type TrainerEffect } from '../trainers.js';
import { isPokemonCard, isTrainerCard } from '../cards.js';
import { tool } from './neo1-trainers.js';

export const NEO3_TRAINERS: Record<string, TrainerEffect> = {
  // Balloon Berry: a Pokémon Tool; when its Pokémon retreats, it's discarded instead of Energy cards (engine.ts).
  'neo3-60': tool('Balloon Berry'),

  // Healing Field: a Stadium; once during each player's turn, they may flip a coin; heads removes 2 damage counters from their Active Pokémon (1 if it has only 1).
  'neo3-61': {
    stadium: true,
    stadiumBlocked: (me) => (me.active && me.active.damage >= 10 ? null : 'Your Active Pokémon has no damage counters'),
    useStadium({ state, me, flip }) {
      if (!flip()) return addLog(state, 'Healing Field: nothing removed.', me.id);
      const active = me.active!;
      const healed = Math.min(20, active.damage);
      active.damage -= healed;
      addLog(state, `Healing Field: ${pokemonName(state, active)} healed ${healed} damage.`, me.id);
    },
  },

  // Rocket's Hideout: a Stadium; each Pokémon with Dark in its name has 20 more HP (refreshHideout).
  'neo3-63': { stadium: true },

  // Old Rod: 2 flips; both heads, a Pokémon card (Baby, Basic or Evolution) from the discard pile into the hand; both tails, a Trainer card.
  'neo3-64': {
    discardToHand: true,
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (heads === 1) return ctx.log('Old Rod did nothing.');
      const trainer = heads === 0;
      const fits = (c: { uid: string; defId: string }) => c.uid !== ctx.card.uid && (trainer ? isTrainerCard(def(ctx.state, c)) : isPokemonCard(def(ctx.state, c)));
      if (!ctx.me.discard.some(fits)) return ctx.log(`No ${trainer ? 'Trainer' : 'Pokémon'} cards in the discard pile.`);
      ctx.pend({ kind: 'discardToHand', source: 'Old Rod', count: 1, ...(trainer && { filter: 'trainer' as const }), excludeUid: ctx.card.uid });
    },
  },
};
