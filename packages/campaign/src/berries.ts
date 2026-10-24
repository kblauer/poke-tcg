// The berries of the Extras page's Berry Farm, Berry Blender and Poffin cooking: Pokémon Ruby, Sapphire and Emerald's
// (Generation 3), their data from the pret/pokeemerald decompilation (berry-data.ts, made by tools/extras/emerald_extras.py),
// then the ones Platinum (Generation 4) added, with the Enigma Berry, from pret/pokeplatinum (berry-data-gen4.ts, by
// tools/extras/platinum_extras.py).
import { BERRY_DATA } from './berry-data.js';
import { GEN4_BERRY_DATA } from './berry-data-gen4.js';

/** A Pokéblock's 5 flavours, in the game's order (FLAVOR_SPICY … FLAVOR_SOUR). */
export const FLAVORS = ['spicy', 'dry', 'sweet', 'bitter', 'sour'] as const;
export type Flavor = (typeof FLAVORS)[number];

/** A berry as the game has it (src/berry.c's gBerries). */
export interface BerryInfo {
  /** Its name in lower case ('cheri'): the key of the account's berries and its pictures' names (public/extras/berries, trees). */
  id: string;
  name: string;
  /** Its size in millimetres. */
  size: number;
  firmness: string;
  /** How many berries a tree of it gives (the game gives more the more it was watered; the farm a random number between them). */
  minYield: number;
  maxYield: number;
  /** The hours each of its tree's 4 stages takes in the game (the farm grows every tree in GROW_HOURS instead). */
  stageHours: number;
  /** Its flavours, in FLAVORS' order. */
  flavors: number[];
  /** The Pokéblock's feel it gives (lower is better). */
  smoothness: number;
  description: string;
  /** The generation it's from: 3 (Emerald's, grown in the farm's top garden) or 4 (Platinum's, in the one below). */
  gen: 3 | 4;
}

/**
 * Every berry: Emerald's, Cheri to Starf, in its order (its Enigma Berry, an e-Reader event's, left out); then Platinum's,
 * Occa to Chilan, the Enigma Berry, and Micle to Rowap, in its order (their yields on the farm a choice: Platinum's data
 * has none to use). Their flavours are their own game's (Platinum's for Poffins: POFFIN_BERRY_DATA).
 */
export const BERRIES: readonly BerryInfo[] = [...BERRY_DATA, ...GEN4_BERRY_DATA];

const BY_ID = new Map(BERRIES.map((b) => [b.id, b]));

/** A berry by its id, or undefined. */
export const berryInfo = (id: string) => BY_ID.get(id);

/** Whether a string is a berry's id. */
export const isBerry = (id: string) => BY_ID.has(id);
