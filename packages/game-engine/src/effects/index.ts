import type { CardDef } from '../cards.js';
import type { AttackEffect } from '../attacks.js';
import type { PowerEffect } from '../powers.js';
import type { EnergyEffect, TrainerEffect } from '../trainers.js';
import { BASE1_POWERS } from './base1-powers.js';
import { BASE1 } from './base1.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { base4Reprints } from './base4.js';
import { FOSSIL } from './fossil.js';
import { JUNGLE } from './jungle.js';
import { JUNGLE_POWERS } from './jungle-powers.js';
import { JUNGLE_TRAINERS } from './jungle-trainers.js';
import { NEO1 } from './neo1.js';
import { NEO1_POWERS } from './neo1-powers.js';
import { NEO1_ENERGY, NEO1_TRAINERS } from './neo1-trainers.js';
import { NEO2 } from './neo2.js';
import { NEO2_POWERS } from './neo2-powers.js';
import { NEO2_TRAINERS } from './neo2-trainers.js';
import { NEO3 } from './neo3.js';
import { NEO3_POWERS } from './neo3-powers.js';
import { NEO3_TRAINERS } from './neo3-trainers.js';
import { NEO4 } from './neo4.js';
import { NEO4_POWERS } from './neo4-powers.js';
import { NEO4_ENERGY, NEO4_TRAINERS } from './neo4-trainers.js';
import { SI1 } from './si1.js';
import { PROMOS } from './promos.js';
import { ROCKET } from './rocket.js';
import { PROMO_POWERS } from './promos-powers.js';
import { PROMO_TRAINERS } from './promos-trainers.js';
import { FOSSIL_POWERS } from './fossil-powers.js';
import { ROCKET_POWERS } from './rocket-powers.js';
import { FOSSIL_TRAINERS } from './fossil-trainers.js';
import { ROCKET_ENERGY, ROCKET_TRAINERS } from './rocket-trainers.js';
import { GYM1 } from './gym1.js';
import { GYM1_POWERS } from './gym1-powers.js';
import { GYM1_TRAINERS } from './gym1-trainers.js';
import { GYM2 } from './gym2.js';
import { GYM2_POWERS } from './gym2-powers.js';
import { GYM2_TRAINERS } from './gym2-trainers.js';
import { lcAttacks, lcPowers, lcReprints } from './lc.js';
import { ECARD1 } from './ecard1.js';
import { ECARD1_POWERS } from './ecard1-powers.js';
import { ECARD1_ENERGY, ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2 } from './ecard2.js';
import { ECARD2_POWERS } from './ecard2-powers.js';
import { ECARD2_ENERGY, ECARD2_TRAINERS } from './ecard2-trainers.js';
import { ECARD3 } from './ecard3.js';
import { ECARD3_POWERS } from './ecard3-powers.js';
import { ECARD3_ENERGY, ECARD3_TRAINERS } from './ecard3-trainers.js';
import { EX1 } from './ex1.js';
import { EX1_POWERS } from './ex1-powers.js';
import { EX1_ENERGY, EX1_TRAINERS } from './ex1-trainers.js';
import { EX2 } from './ex2.js';
import { EX2_POWERS } from './ex2-powers.js';
import { EX2_ENERGY, EX2_TRAINERS } from './ex2-trainers.js';
import { EX3 } from './ex3.js';
import { EX3_POWERS } from './ex3-powers.js';
import { EX3_TRAINERS } from './ex3-trainers.js';
import { EX4 } from './ex4.js';
import { EX4_POWERS } from './ex4-powers.js';
import { EX4_ENERGY, EX4_TRAINERS } from './ex4-trainers.js';
import { EX5 } from './ex5.js';
import { EX5_POWERS } from './ex5-powers.js';
import { EX5_TRAINERS } from './ex5-trainers.js';
import { EX6 } from './ex6.js';
import { EX6_POWERS } from './ex6-powers.js';
import { EX6_ENERGY, EX6_TRAINERS } from './ex6-trainers.js';
import { EX7 } from './ex7.js';
import { EX7_POWERS } from './ex7-powers.js';
import { EX7_ENERGY, EX7_TRAINERS } from './ex7-trainers.js';
import { EX8 } from './ex8.js';
import { EX8_POWERS } from './ex8-powers.js';
import { EX8_ENERGY, EX8_TRAINERS } from './ex8-trainers.js';
import { EX9 } from './ex9.js';
import { EX9_POWERS } from './ex9-powers.js';
import { EX9_ENERGY, EX9_TRAINERS } from './ex9-trainers.js';
import { EX10 } from './ex10.js';
import { EX10_POWERS } from './ex10-powers.js';
import { EX10_ENERGY, EX10_TRAINERS } from './ex10-trainers.js';
import { EX11 } from './ex11.js';
import { EX11_POWERS } from './ex11-powers.js';
import { EX11_ENERGY, EX11_TRAINERS } from './ex11-trainers.js';
import { EX12 } from './ex12.js';
import { EX12_POWERS } from './ex12-powers.js';
import { EX12_ENERGY, EX12_TRAINERS } from './ex12-trainers.js';
import { EX13 } from './ex13.js';
import { EX13_POWERS } from './ex13-powers.js';
import { EX13_ENERGY, EX13_TRAINERS } from './ex13-trainers.js';
import { EX14 } from './ex14.js';
import { EX14_POWERS } from './ex14-powers.js';
import { EX14_ENERGY, EX14_TRAINERS } from './ex14-trainers.js';
import { EX15 } from './ex15.js';
import { EX15_POWERS } from './ex15-powers.js';
import { EX15_ENERGY, EX15_TRAINERS } from './ex15-trainers.js';
import { EX16 } from './ex16.js';
import { EX16_POWERS } from './ex16-powers.js';
import { EX16_ENERGY, EX16_TRAINERS } from './ex16-trainers.js';
import { EX_TEMPLATE_DATA } from './ex-template-data.js';
import { templateEffects } from './ex-templates.js';

/** Effects by card id, then attack name. Base Set 2's and Legendary Collection's are their originals' (base4.ts, lc.ts). */
const ORIGINAL_EFFECTS: Record<string, Record<string, AttackEffect>> = { ...BASE1, ...JUNGLE, ...FOSSIL, ...PROMOS, ...ROCKET, ...GYM1, ...GYM2, ...NEO1, ...NEO2, ...SI1, ...NEO3, ...NEO4, ...ECARD1, ...ECARD2, ...ECARD3, ...EX1, ...EX2, ...EX3, ...EX4, ...EX5, ...EX6, ...EX7, ...EX8, ...EX9, ...EX10, ...EX11, ...EX12, ...EX13, ...EX14, ...EX15, ...EX16 };
const EFFECTS: Record<string, Record<string, AttackEffect>> = { ...ORIGINAL_EFFECTS, ...base4Reprints(ORIGINAL_EFFECTS), ...lcAttacks(ORIGINAL_EFFECTS) };

/**
 * The later EX sets' attacks worded as one of the shared wordings (ex-templates.ts), under a set's own effects, which have
 * the last word on any attack. Built on the first lookup, as ex-templates.ts can still be loading while this module does.
 */
let allEffects: Record<string, Record<string, AttackEffect>> | undefined;
function effectsOf(id: string): Record<string, AttackEffect> | undefined {
  if (!allEffects) {
    allEffects = { ...EFFECTS };
    for (const [card, attacks] of Object.entries(templateEffects(EX_TEMPLATE_DATA))) allEffects[card] = { ...attacks, ...EFFECTS[card] };
  }
  return allEffects[id];
}

/** The card-specific behaviour of an attack, if it has any (plain-damage attacks don't). */
/** A reverse-holo print (EX sets, "<card id>-reverse") plays as its card: every lookup goes by the card's own id. */
const printOf = (defId: string) => (defId.endsWith('-reverse') ? defId.slice(0, -'-reverse'.length) : defId);

export const attackEffect = (defId: string, attackName: string): AttackEffect | undefined => effectsOf(printOf(defId))?.[attackName];

/** Pokémon Power effects by card id (WOTC cards have at most one power). Base Set 2's and Legendary Collection's are their originals' (LC's stop with any Special Condition). */
const ORIGINAL_POWERS: Record<string, PowerEffect> = { ...BASE1_POWERS, ...JUNGLE_POWERS, ...FOSSIL_POWERS, ...PROMO_POWERS, ...ROCKET_POWERS, ...GYM1_POWERS, ...GYM2_POWERS, ...NEO1_POWERS, ...NEO2_POWERS, ...NEO3_POWERS, ...NEO4_POWERS, ...ECARD1_POWERS, ...ECARD2_POWERS, ...ECARD3_POWERS, ...EX1_POWERS, ...EX2_POWERS, ...EX3_POWERS, ...EX4_POWERS, ...EX5_POWERS, ...EX6_POWERS, ...EX7_POWERS, ...EX8_POWERS, ...EX9_POWERS, ...EX10_POWERS, ...EX11_POWERS, ...EX12_POWERS, ...EX13_POWERS, ...EX14_POWERS, ...EX15_POWERS, ...EX16_POWERS };
const POWERS: Record<string, PowerEffect> = { ...ORIGINAL_POWERS, ...base4Reprints(ORIGINAL_POWERS), ...lcPowers(ORIGINAL_POWERS) };

/** The behaviour of the card's Pokémon Power, if it's implemented. */
export const powerEffect = (defId: string): PowerEffect | undefined => POWERS[printOf(defId)];

/** Trainer card effects by card id. Base Set 2's and Legendary Collection's are their originals'. */
const ORIGINAL_TRAINERS: Record<string, TrainerEffect> = { ...BASE1_TRAINERS, ...JUNGLE_TRAINERS, ...FOSSIL_TRAINERS, ...NEO1_TRAINERS, ...NEO2_TRAINERS, ...NEO3_TRAINERS, ...NEO4_TRAINERS, ...PROMO_TRAINERS, ...ROCKET_TRAINERS, ...GYM1_TRAINERS, ...GYM2_TRAINERS, ...ECARD1_TRAINERS, ...ECARD2_TRAINERS, ...ECARD3_TRAINERS, ...EX1_TRAINERS, ...EX2_TRAINERS, ...EX3_TRAINERS, ...EX4_TRAINERS, ...EX5_TRAINERS, ...EX6_TRAINERS, ...EX7_TRAINERS, ...EX8_TRAINERS, ...EX9_TRAINERS, ...EX10_TRAINERS, ...EX11_TRAINERS, ...EX12_TRAINERS, ...EX13_TRAINERS, ...EX14_TRAINERS, ...EX15_TRAINERS, ...EX16_TRAINERS };
const TRAINERS: Record<string, TrainerEffect> = { ...ORIGINAL_TRAINERS, ...base4Reprints(ORIGINAL_TRAINERS), ...lcReprints(ORIGINAL_TRAINERS) };

/** The behaviour of a Trainer card, if it's implemented. */
export const trainerEffect = (defId: string): TrainerEffect | undefined => TRAINERS[printOf(defId)];

/** Special Energy effects by card id (Team Rocket's, reprinted in Legendary Collection). */
const ORIGINAL_ENERGY: Record<string, EnergyEffect> = { ...ROCKET_ENERGY, ...NEO1_ENERGY, ...NEO4_ENERGY, ...ECARD1_ENERGY, ...ECARD2_ENERGY, ...ECARD3_ENERGY, ...EX1_ENERGY, ...EX2_ENERGY, ...EX4_ENERGY, ...EX6_ENERGY, ...EX7_ENERGY, ...EX8_ENERGY, ...EX9_ENERGY, ...EX10_ENERGY, ...EX11_ENERGY, ...EX12_ENERGY, ...EX13_ENERGY, ...EX14_ENERGY, ...EX15_ENERGY, ...EX16_ENERGY };
const ENERGY: Record<string, EnergyEffect> = { ...ORIGINAL_ENERGY, ...lcReprints(ORIGINAL_ENERGY) };

/** What the special Energy card does when attached from the hand, if it does anything. */
export const energyEffect = (defId: string): EnergyEffect | undefined => ENERGY[printOf(defId)];

/**
 * Every card id the effect tables name (the shared EX wordings aside: they come from the snapshot itself), with the
 * attack names each has effects for, so a test can check none is an orphan (a card not in the snapshot, or an attack it
 * doesn't have).
 */
export function effectIds(): { attacks: Record<string, string[]>; powers: string[]; trainers: string[]; energy: string[] } {
  return {
    attacks: Object.fromEntries(Object.entries(EFFECTS).map(([id, byName]) => [id, Object.keys(byName)])),
    powers: Object.keys(POWERS),
    trainers: Object.keys(TRAINERS),
    energy: Object.keys(ENERGY),
  };
}

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
