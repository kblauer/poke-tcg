// A Pokémon's condition (README: Super Contests): its Cool, Beauty, Cute, Smart and Tough and its sheen, each 0-255,
// raised by feeding it Pokéblocks (Emerald's use_pokeblock.c) and Poffins (Platinum's poffin_case/main.c). In the Idle
// Adventure a Pokédex entry is the Pokémon (the user's): what it eats is kept on the entry for good, and its nature (the
// player's choice, IdleDex.contestNature) decides which flavour it likes and which it dislikes.

/** Cool, Beauty, Cute, Smart, Tough, Sheen. */
export type Condition = [number, number, number, number, number, number];

export const CONDITION_NAMES = ['Cool', 'Beauty', 'Cute', 'Smart', 'Tough', 'Sheen'] as const;
/** MAX_CONDITION and MAX_SHEEN (both games'). */
export const MAX_CONDITION = 255;
export const MAX_SHEEN = 255;

export const NO_CONDITION: Condition = [0, 0, 0, 0, 0, 0];

/** A stored condition (an IdleDex row's), filled out to six values. */
export const conditionOf = (values: readonly number[] | null | undefined): Condition => [0, 1, 2, 3, 4, 5].map((i) => Math.max(0, Math.min(255, values?.[i] ?? 0))) as Condition;

/** Whether it won't eat any more (both games' only refusal: its sheen is full). */
export const sheenMaxed = (condition: Condition) => condition[5] >= MAX_SHEEN;

/**
 * The flavour a nature likes and the one it dislikes (the flavours in FLAVORS' order, spicy, dry, sweet, bitter, sour),
 * or null for the 5 that have none (Hardy, Docile, Serious, Bashful, Quirky): the flavour of the stat it raises and of the
 * one it lowers (Attack spicy, Defense sour, Speed sweet, Sp. Atk dry, Sp. Def bitter), as both games' tables have them
 * (gPokeblockFlavorCompatibilityTable, sFlavorPreferences).
 */
const STAT_FLAVOR = [0, 4, 2, 1, 3];
export function natureFlavors(nature: number): { liked: number; disliked: number } | null {
  const up = Math.trunc(nature / 5);
  const down = nature % 5;
  return up === down ? null : { liked: STAT_FLAVOR[up]!, disliked: STAT_FLAVOR[down]! };
}

/** How a nature takes a flavour: 1 liked, −1 disliked, 0 neither (GetMonFlavorRelation). */
export function flavorRelation(nature: number, flavor: number) {
  const f = natureFlavors(nature);
  return f?.liked === flavor ? 1 : f?.disliked === flavor ? -1 : 0;
}

const add = (condition: Condition, gains: readonly number[], sheen: number): Condition => {
  const out = condition.map((v, i) => (i < 5 ? Math.max(0, Math.min(MAX_CONDITION, v + (gains[i] ?? 0))) : v)) as Condition;
  out[5] = Math.min(MAX_SHEEN, out[5] + Math.max(0, sheen));
  return out;
};

/**
 * Its condition after a Pokéblock (Emerald's AddPokeblockToConditions): each flavour added to its condition and the
 * feel to its sheen, kept to 0-255. A nature that takes the block well overall (PokeblockGetGain: its liked flavours
 * outweigh its disliked) gets a tenth more (rounded) of the flavour it likes; one that takes it badly a tenth less of the
 * one it dislikes (CalculatePokeblockEffectiveness). Null when its sheen is full: it won't eat.
 */
export function feedPokeblock(condition: Condition, flavors: readonly number[], feel: number, nature: number): Condition | null {
  if (sheenMaxed(condition)) return null;
  const gains = [0, 1, 2, 3, 4].map((i) => Math.max(0, flavors[i] ?? 0));
  const total = gains.reduce((sum, g, i) => sum + g * flavorRelation(nature, i), 0);
  const direction = Math.sign(total);
  if (direction)
    for (let i = 0; i < 5; i++) {
      const boost = Math.trunc(gains[i]! / 10) + (gains[i]! % 10 >= 5 ? 1 : 0);
      const relation = flavorRelation(nature, i);
      if (relation === direction) gains[i]! += boost * relation;
    }
  return add(condition, gains, feel);
}

/** A float multiplication as the DS does it (single precision), then cut to a whole number, as `(u8)(x * 1.1f)`. */
const f32Times = (x: number, by: number) => Math.trunc(Math.fround(Math.fround(x) * Math.fround(by)));

/**
 * Its condition after a Poffin (Platinum's PoffinCase_UpdateMonContestStats): each flavour added to its condition and
 * the smoothness to its sheen, kept to 255; the flavour its nature likes ×1.1 and the one it dislikes ×0.9 (cut to whole
 * numbers). Null when its sheen is full: it won't eat.
 */
export function feedPoffin(condition: Condition, flavors: readonly number[], smoothness: number, nature: number): Condition | null {
  if (sheenMaxed(condition)) return null;
  const gains = [0, 1, 2, 3, 4].map((i) => Math.max(0, flavors[i] ?? 0));
  const f = natureFlavors(nature);
  if (f) {
    gains[f.liked] = f32Times(gains[f.liked]!, 1.1);
    gains[f.disliked] = f32Times(gains[f.disliked]!, 0.9);
  }
  return add(condition, gains, smoothness);
}
