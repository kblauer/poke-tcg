import type { CardDef } from '../cards.js';
import type { AttackEffect } from '../attacks.js';
import type { PowerEffect } from '../powers.js';
import type { TrainerEffect } from '../trainers.js';
import { BASE1_POWERS } from './base1-powers.js';
import { BASE1 } from './base1.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { base4Reprints } from './base4.js';
import { FOSSIL } from './fossil.js';
import { JUNGLE } from './jungle.js';
import { JUNGLE_POWERS } from './jungle-powers.js';
import { JUNGLE_TRAINERS } from './jungle-trainers.js';
import { NEO1_TRAINERS } from './neo1-trainers.js';
import { PROMOS } from './promos.js';
import { PROMO_POWERS } from './promos-powers.js';
import { PROMO_TRAINERS } from './promos-trainers.js';
import { FOSSIL_POWERS } from './fossil-powers.js';
import { FOSSIL_TRAINERS } from './fossil-trainers.js';

/** Effects by card id, then attack name. Base Set 2's are its originals' (base4.ts). */
const ORIGINAL_EFFECTS: Record<string, Record<string, AttackEffect>> = { ...BASE1, ...JUNGLE, ...FOSSIL, ...PROMOS };
const EFFECTS: Record<string, Record<string, AttackEffect>> = { ...ORIGINAL_EFFECTS, ...base4Reprints(ORIGINAL_EFFECTS) };

/** The card-specific behaviour of an attack, if it has any (plain-damage attacks don't). */
export const attackEffect = (defId: string, attackName: string): AttackEffect | undefined => EFFECTS[defId]?.[attackName];

/** Pokémon Power effects by card id (WOTC cards have at most one power). Base Set 2's are its originals'. */
const ORIGINAL_POWERS: Record<string, PowerEffect> = { ...BASE1_POWERS, ...JUNGLE_POWERS, ...FOSSIL_POWERS, ...PROMO_POWERS };
const POWERS: Record<string, PowerEffect> = { ...ORIGINAL_POWERS, ...base4Reprints(ORIGINAL_POWERS) };

/** The behaviour of the card's Pokémon Power, if it's implemented. */
export const powerEffect = (defId: string): PowerEffect | undefined => POWERS[defId];

/** Trainer card effects by card id. Base Set 2's are its originals'. */
const ORIGINAL_TRAINERS: Record<string, TrainerEffect> = { ...BASE1_TRAINERS, ...JUNGLE_TRAINERS, ...FOSSIL_TRAINERS, ...NEO1_TRAINERS, ...PROMO_TRAINERS };
const TRAINERS: Record<string, TrainerEffect> = { ...ORIGINAL_TRAINERS, ...base4Reprints(ORIGINAL_TRAINERS) };

/** The behaviour of a Trainer card, if it's implemented. */
export const trainerEffect = (defId: string): TrainerEffect | undefined => TRAINERS[defId];

/**
 * Whether the engine plays the card fully: every attack with text has its effect, its Pokémon Power
 * is implemented, and a Trainer has its effect. Basic Energy and Double Colorless always are.
 */
export function cardImplemented(def: CardDef): boolean {
  if (def.kind === 'energy') return true;
  if (def.kind === 'trainer' || def.trainerText) return !!trainerEffect(def.id);
  if (def.power && !powerEffect(def.id)) return false;
  return def.attacks.every((a) => !a.text || !!attackEffect(def.id, a.name));
}
