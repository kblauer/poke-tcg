// A Pokémon's condition (README: Super Contests): its Cool, Beauty, Cute, Smart and Tough and its sheen, each 0-255,
// raised by feeding it Pokéblocks (Emerald's use_pokeblock.c) and Poffins (Platinum's poffin_case/main.c). In the Idle
// Adventure a Pokédex entry is the Pokémon (the user's): what it eats is kept on the entry for good, and an entry has
// no nature, so neither game's nature bonus (a liked flavour's 10% more, a disliked one's less) ever applies.

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
 * Its condition after a Pokéblock or a Poffin (AddPokeblockToConditions, PoffinCase_UpdateMonContestStats): each flavour
 * (spicy, dry, sweet, bitter, sour) added to its condition (Cool, Beauty, Cute, Smart, Tough) and the treat's feel or
 * smoothness to its sheen, each kept to 255. Null when its sheen is full: it won't eat.
 */
export function feedCondition(condition: Condition, flavors: readonly number[], sheen: number): Condition | null {
  if (sheenMaxed(condition)) return null;
  const out = condition.map((v, i) => (i < 5 ? Math.min(MAX_CONDITION, v + Math.max(0, flavors[i] ?? 0)) : v)) as Condition;
  out[5] = Math.min(MAX_SHEEN, out[5] + Math.max(0, sheen));
  return out;
}
