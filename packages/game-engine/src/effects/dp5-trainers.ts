// Majestic Dawn (dp5) Trainer cards and Special Energy, by card id. Fossil Excavator and Mom's Kindness are Supporters; Dawn
// Stadium is a Stadium (attaching Energy, engine.ts); Old Amber, Dome Fossil and Helix Fossil play as Basic Pokémon, as EX
// Legend Maker's Mysterious Fossil does. Call Energy's ability is used from the Active Pokémon (USE_ENERGY).
// From the text: Call Energy ends the turn once its search is done, whatever it found.
import { addLog, clearSpecialConditions, openBenchSlot, pokemonName } from '../status.js';
import type { EnergyEffect, TrainerEffect } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { DP1_TRAINERS } from './dp1-trainers.js';
import { DP2_TRAINERS } from './dp2-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { EX1_ENERGY } from './ex1-trainers.js';
import { EX4_TRAINERS } from './ex4-trainers.js';
import { NEO1_TRAINERS } from './neo1-trainers.js';

export const DP5_TRAINERS: Record<string, TrainerEffect> = {
  // Dawn Stadium: a Stadium (engine.ts, attaching Energy from the hand).
  'dp5-79': { stadium: true },
  // Dusk Ball, Fossil Excavator, Quick Ball, Old Amber, Dome Fossil, Helix Fossil: as Mysterious Treasures'. Poké Ball: as
  // Diamond & Pearl's. Energy Restore, Energy Search: as Expedition's. Mom's Kindness: as Base Set Bill. Super Scoop Up: as Neo
  // Genesis's. Warp Point: as EX Team Magma vs Team Aqua's.
  'dp5-80': DP2_TRAINERS['dp2-110']!,
  'dp5-81': ECARD1_TRAINERS['ecard1-141']!,
  'dp5-82': DP2_TRAINERS['dp2-111']!,
  'dp5-83': { ...BASE1_TRAINERS['base1-91']!, supporter: true },
  'dp5-84': DP2_TRAINERS['dp2-116']!,
  'dp5-85': DP1_TRAINERS['dp1-110']!,
  'dp5-86': DP2_TRAINERS['dp2-114']!,
  'dp5-87': NEO1_TRAINERS['neo1-98']!,
  'dp5-88': EX4_TRAINERS['ex4-85']!,
  'dp5-89': DP2_TRAINERS['dp2-116']!,
  'dp5-90': ECARD1_TRAINERS['ecard1-153']!,
  'dp5-91': DP2_TRAINERS['dp2-116']!,
};

export const DP5_ENERGY: Record<string, EnergyEffect> = {
  // Call Energy: on the Active Pokémon, once a turn, up to 2 Basic Pokémon from the deck onto the Bench; then the turn ends.
  'dp5-92': {
    use: {
      blocked: (state, me) => (!me.deck.length ? 'Your deck is empty' : openBenchSlot(me, state.cards, state.stadium?.card) < 0 ? 'Your Bench is full' : null),
      run(state, me) {
        state.endTurnNow = true;
        state.pendingChoice = { player: me.id, source: 'Call Energy', kind: 'pickFromDeck', filter: 'basic', toBench: true, optional: true, count: 2 };
      },
    },
  },
  // Health Energy: attached from the hand, a damage counter off. Recover Energy: every Special Condition off.
  'dp5-94': {
    onAttach(state, owner, pokemon) {
      if (!pokemon.damage) return;
      pokemon.damage -= 10;
      addLog(state, `Health Energy: removed a damage counter from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  'dp5-96': {
    onAttach(state, owner, pokemon) {
      clearSpecialConditions(pokemon);
      addLog(state, `Recover Energy: ${pokemonName(state, pokemon)} has no Special Conditions.`, owner.id);
    },
  },
  // Darkness Energy, Metal Energy: as EX Ruby & Sapphire's.
  'dp5-93': EX1_ENERGY['ex1-93']!,
  'dp5-95': EX1_ENERGY['ex1-94']!,
};
