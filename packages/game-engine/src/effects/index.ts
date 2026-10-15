import type { AttackEffect } from '../attacks.js';
import { BASE1 } from './base1.js';

/** Effects by card id, then attack name. */
const EFFECTS: Record<string, Record<string, AttackEffect>> = { ...BASE1 };

/** The card-specific behaviour of an attack, if it has any (plain-damage attacks don't). */
export const attackEffect = (defId: string, attackName: string): AttackEffect | undefined => EFFECTS[defId]?.[attackName];
