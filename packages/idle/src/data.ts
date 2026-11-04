// Lookups over the active generation's generated tables (generation.ts; Kanto's data/gen1/, by tools/idle/firered_data.py).
// Every read of the tables goes through these, so a missing key fails loudly instead of reading undefined.
import { generation } from './generation.js';
import type { ItemData, MoveData, SpeciesData, TypeName } from './types.js';

export { DEX_SIZE } from './generation.js';

export function species(id: number): SpeciesData {
  const s = generation().species[id - 1];
  if (!s) throw new Error(`Unknown species ${id}`);
  return s;
}

export function moveData(key: string): MoveData {
  const m = generation().moves[key];
  if (!m) throw new Error(`Unknown move ${key}`);
  return m;
}

export const isMove = (key: string) => key in generation().moves;

export function itemData(key: string): ItemData {
  const i = generation().items[key];
  if (!i) throw new Error(`Unknown item ${key}`);
  return i;
}

export const allMoveKeys = () => Object.keys(generation().moves);

/** Physical types (the Gen 3 rule: a move's category is its type's). */
const PHYSICAL: ReadonlySet<TypeName> = new Set(['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel']);
export const isPhysical = (type: TypeName) => PHYSICAL.has(type);

/**
 * One attacking type against one defending type: 0, 0.5, 1 or 2 (gTypeEffectiveness). `foresight` (Foresight or Odor
 * Sleuth on the target) lifts the Ghost immunities.
 */
export function matchup(attack: TypeName, defend: TypeName, foresight = false): number {
  for (const [a, d, mul, lifted] of generation().typeChart) if (a === attack && d === defend && !(foresight && lifted)) return mul;
  return 1;
}

/** An attacking type against every type of the defender (the game multiplies each in turn). */
export const effectiveness = (attack: TypeName, defend: readonly TypeName[], foresight = false) => defend.reduce((m, t) => m * matchup(attack, t, foresight), 1);
