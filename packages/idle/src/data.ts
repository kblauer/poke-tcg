// Lookups over the generated Gen 1 tables (data/gen1/, by tools/idle/firered_data.py). Every read of the tables goes
// through these, so a missing key fails loudly instead of reading undefined.
import { ITEMS } from './data/gen1/items.js';
import { MOVES } from './data/gen1/moves.js';
import { SPECIES } from './data/gen1/species.js';
import { TYPE_CHART } from './data/gen1/types.js';
import type { ItemData, MoveData, SpeciesData, TypeName } from './types.js';

/** The number of species in the dex (Kanto's 151). */
export const DEX_SIZE = SPECIES.length;

export function species(id: number): SpeciesData {
  const s = SPECIES[id - 1];
  if (!s) throw new Error(`Unknown species ${id}`);
  return s;
}

export function moveData(key: string): MoveData {
  const m = MOVES[key];
  if (!m) throw new Error(`Unknown move ${key}`);
  return m;
}

export const isMove = (key: string) => key in MOVES;

export function itemData(key: string): ItemData {
  const i = ITEMS[key];
  if (!i) throw new Error(`Unknown item ${key}`);
  return i;
}

export const allMoveKeys = () => Object.keys(MOVES);

/** Physical types (the Gen 3 rule: a move's category is its type's). */
const PHYSICAL: ReadonlySet<TypeName> = new Set(['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel']);
export const isPhysical = (type: TypeName) => PHYSICAL.has(type);

/**
 * One attacking type against one defending type: 0, 0.5, 1 or 2 (gTypeEffectiveness). `foresight` (Foresight or Odor
 * Sleuth on the target) lifts the Ghost immunities.
 */
export function matchup(attack: TypeName, defend: TypeName, foresight = false): number {
  for (const [a, d, mul, lifted] of TYPE_CHART) if (a === attack && d === defend && !(foresight && lifted)) return mul;
  return 1;
}

/** An attacking type against every type of the defender (the game multiplies each in turn). */
export const effectiveness = (attack: TypeName, defend: readonly TypeName[], foresight = false) => defend.reduce((m, t) => m * matchup(attack, t, foresight), 1);
