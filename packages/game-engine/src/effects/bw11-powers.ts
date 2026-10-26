// Legendary Treasures (bw11) Abilities, by card id (its Radiant Collection's too). Every Ability is a kind of its own (agreed:
// ABILITY). From the text: Sealing Scream stops both players' ACE SPEC cards while Spiritomb is in play, wherever it is
// (trainerError); Royal Garden makes Serperior's Retreat Cost nothing while any Energy providing Grass is attached to it.
import { counts, energyPool } from '../engine.js';
import type { PowerEffect } from '../powers.js';
import { ABILITY } from './common.js';

export const BW11_POWERS: Record<string, PowerEffect> = {
  // Spiritomb – Sealing Scream: no ACE SPEC cards from either player's hand (trainerError).
  'bw11-87': { ...ABILITY, sealingScream: true },

  // Serperior – Royal Garden: no Retreat Cost with Grass Energy attached.
  'bw11-RC3': { ...ABILITY, retreatChange: (pokemon, cards) => (energyPool(pokemon, cards).some((e) => counts(e, 'grass')) ? -99 : 0) },
};
