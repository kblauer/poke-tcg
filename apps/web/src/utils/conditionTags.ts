/** What a Special Condition tag needs to know of a Pokémon: the TCG's in-play fields, or Safari Draft's fighter's. */
export interface ConditionHolder {
  condition?: 'asleep' | 'confused' | 'paralyzed' | null;
  burned?: boolean;
  poison?: number;
}

export interface ConditionTag {
  image: string;
  title: string;
  /** Poison's damage, when it's more than 10. */
  amount?: number;
  label: string;
  className: string;
}

/**
 * The Special Conditions on a Pokémon, as the user's round icons (public/status/: game8's, made one size by
 * tools/status-tags/standardize.py; agreed 2026-10-26): `amount` is Poison's damage when it's more than 10. With the Settings
 * page's text status tags on (useTextStatus), the original text tags instead: `label` on `className`. The battle page's
 * cards and Safari Draft's show them alike.
 */
export function conditionTags(p: ConditionHolder): ConditionTag[] {
  const tags: ConditionTag[] = [];
  if (p.condition === 'asleep') tags.push({ image: '/status/asleep.png', title: "Asleep: flips to wake up between turns; can't attack or retreat", label: 'SLP', className: 'bg-indigo-500' });
  if (p.condition === 'confused') tags.push({ image: '/status/confused.png', title: 'Confused: flips to attack (tails: 30 damage to itself); retreats with no flip', label: 'CNF', className: 'bg-pink-500' });
  if (p.condition === 'paralyzed') tags.push({ image: '/status/paralyzed.png', title: "Paralyzed: can't attack or retreat until after its owner's next turn", label: 'PAR', className: 'bg-yellow-500 text-gray-900' });
  if (p.burned) tags.push({ image: '/status/burned.png', title: 'Burned: 20 damage between turns, then a flip; heads cures it', label: 'BRN', className: 'bg-orange-600' });
  if (p.poison) tags.push({ image: '/status/poisoned.png', title: `Poisoned: ${p.poison} damage between turns`, ...(p.poison > 10 && { amount: p.poison }), label: `PSN${p.poison > 10 ? ` ${p.poison}` : ''}`, className: 'bg-green-600' });
  return tags;
}
