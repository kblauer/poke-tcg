import type { AttackEffect } from '../attacks.js';
import type { PowerEffect } from '../powers.js';
import type { TrainerEffect } from '../trainers.js';
import { BASE1_POWERS } from './base1-powers.js';
import { BASE1 } from './base1.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { FOSSIL } from './fossil.js';

/** Effects by card id, then attack name. */
const EFFECTS: Record<string, Record<string, AttackEffect>> = { ...BASE1, ...FOSSIL };

/** The card-specific behaviour of an attack, if it has any (plain-damage attacks don't). */
export const attackEffect = (defId: string, attackName: string): AttackEffect | undefined => EFFECTS[defId]?.[attackName];

/** Pokémon Power effects by card id (Base Set cards have at most one power). */
const POWERS: Record<string, PowerEffect> = { ...BASE1_POWERS };

/** The behaviour of the card's Pokémon Power, if it's implemented. */
export const powerEffect = (defId: string): PowerEffect | undefined => POWERS[defId];

/** Trainer card effects by card id. */
const TRAINERS: Record<string, TrainerEffect> = { ...BASE1_TRAINERS };

/** The behaviour of a Trainer card, if it's implemented. */
export const trainerEffect = (defId: string): TrainerEffect | undefined => TRAINERS[defId];
