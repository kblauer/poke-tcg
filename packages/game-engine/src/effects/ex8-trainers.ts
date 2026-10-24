// EX Deoxys (ex8) Trainer cards and special Energy, by card id. Lady Outing and Professor Cozmo's Discovery are Supporters;
// Meteor Falls and Space Center are Stadiums; Balloon Berry, Crystal Shard and Strength Charm are Pokémon Tools.
// From the text: Meteor Falls lets an Active Evolved Pokémon (not a Pokémon-ex) use the attacks of the cards it evolved
// from, paying their costs (usableAttacks); Space Center turns off the Poké-Bodies of Basic Pokémon that aren't Pokémon-ex or
// an owner's (refreshHideout); this Strength Charm adds its 10 before Weakness and Resistance and is discarded at the end of
// the turn its Pokémon attacks (attacks.ts); Heal Energy does nothing else on a Pokémon-ex; Scramble Energy provides 3 Energy
// of any types while its owner has more Prize cards left than the opponent, Colorless otherwise, and is discarded off a
// Pokémon that isn't Evolved or is a Pokémon-ex (dropBoostEnergy, energyPool).
import { lookupCard } from '../cards.js';
import { addLog, clearSpecialConditions, pokemonName } from '../status.js';
import { type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_ENERGY } from './ecard2-trainers.js';
import { ECARD3_TRAINERS } from './ecard3-trainers.js';
import { EX1_TRAINERS } from './ex1-trainers.js';
import { EX3_TRAINERS } from './ex3-trainers.js';
import { NEO1_TRAINERS } from './neo1-trainers.js';

export const EX8_TRAINERS: Record<string, TrainerEffect> = {
  // Balloon Berry, Crystal Shard, Energy Charge, Lady Outing, Master Ball: as the earlier cards.
  'ex8-84': EX3_TRAINERS['ex3-82']!,
  'ex8-85': ECARD3_TRAINERS['ecard3-122']!,
  'ex8-86': NEO1_TRAINERS['neo1-85']!,
  'ex8-87': EX1_TRAINERS['ex1-83']!,
  'ex8-88': ECARD1_TRAINERS['ecard1-143']!,

  // Meteor Falls, Space Center: Stadiums (their rules in usableAttacks and refreshHideout).
  'ex8-89': { stadium: true },
  'ex8-91': { stadium: true },

  // Professor Cozmo's Discovery (Supporter): heads, the bottom 3 cards of the deck drawn; tails, the top 2.
  'ex8-90': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const heads = ctx.flip();
      const drawn = heads ? ctx.me.deck.splice(Math.max(0, ctx.me.deck.length - 3)) : ctx.me.deck.splice(0, 2);
      ctx.me.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'} from the ${heads ? 'bottom' : 'top'} of the deck.`);
    },
  },

  // Strength Charm: a Pokémon Tool (attacks.ts).
  'ex8-92': ECARD1_TRAINERS['ecard1-150']!,
};

export const EX8_ENERGY: Record<string, EnergyEffect> = {
  // Boost Energy: as Aquapolis's.
  'ex8-93': ECARD2_ENERGY['ecard2-145']!,
  // Heal Energy: attached from the hand, a damage counter and every Special Condition off the Pokémon (not a Pokémon-ex).
  'ex8-94': {
    onAttach(state, owner, pokemon) {
      const d = lookupCard(state.cards, pokemon.card.defId);
      if (d.kind !== 'pokemon' || d.ex) return;
      clearSpecialConditions(pokemon);
      if (pokemon.damage) pokemon.damage -= 10;
      addLog(state, `Heal Energy: ${pokemonName(state, pokemon)} has no Special Conditions and a damage counter less.`, owner.id);
    },
  },
  // Scramble Energy: only on an Evolved Pokémon that isn't a Pokémon-ex.
  'ex8-95': {
    onAttach: () => {},
    attachError: (pokemon, inPlay) => (inPlay.evolvedFrom.length && !pokemon.ex ? null : 'Scramble Energy can only be attached to an Evolved Pokémon (not a Pokémon-ex)'),
  },
};
