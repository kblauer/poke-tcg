// Safari Draft (issue #254, the redesign of #239's section 2): a draft unit. One for each Pokémon species, #1–386, written
// by hand in species.ts: a name, a type, a tier (1–5), an attack, an HP and 0 to 3 keywords, each of which may carry a
// number ("Splash 20") or a type ("Bane water 20"). Nothing of a unit comes from a TCG print any more (the user's,
// 2026-11-21): the package holds its own table and never reads the card catalog. The API picks each unit's picture.
//   - types: the TCG's nine of the Gen 1–3 era, one a unit;
//   - stages: the games' evolution lines (Pichu → Pikachu → Raichu), by `evolvesFrom`, a Pokémon's name;
//   - an evolved unit is at least one tier above what it evolves from, and a Pokémon with two stages above it is at most
//     tier 3 (units.test.ts);
//   - legendaries are never in a shop (encounter rewards), nor the last Pokémon of a 3-stage line.
// No Weakness, Resistance, Energy or retreat.

export const UNIT_TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'darkness', 'metal'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export const TOP_TIER = 5;

/** The keywords (issue #254, section 3). effects.ts has what each does. */
export const KEYWORD_NAMES = [
  // Aim.
  'Taunt', 'Bodyguard', 'Face-off', 'Sniper', 'Flying',
  // Tempo.
  'Quick', 'Reach', 'Double Strike', 'Truant',
  // Damage.
  'Splash', 'Cleave', 'Trample', 'Finisher', 'Bane', 'Breaker', 'Barrage', 'Recoil',
  // Growing.
  'Enrage', 'Rampage', 'Grow', 'Scavenger',
  // Defence.
  'Shield', 'Armor', 'Thorns', 'Sturdy', 'Evasive', 'Regen', 'Drain', 'Counter',
  // Neighbours.
  'Rally', 'Fortify', 'Screen', 'Pack', 'Guardian', 'Safeguard', 'Mend', 'Baton Pass', 'Legacy',
  // Place and type.
  'Vanguard', 'Rearguard', 'Leader', 'Loner',
  // Across.
  'Intimidate', 'Pounce', 'Glare', 'Supersonic', 'Will-O-Wisp', 'Transform',
  // Moving.
  'Roar', 'Whirlwind', 'U-turn',
  // Fainting.
  'Explode', 'Destiny Bond', 'Family', 'Memento',
  // Status.
  'Paralyze', 'Confuse', 'Burn', 'Static', 'Flame Body', 'Cute Charm',
  // Other.
  'Weaken', 'Sketch', 'Pay Day',
] as const;
export type Keyword = (typeof KEYWORD_NAMES)[number];

/** A keyword on a unit: its number where it has one ("Splash 20"), its type for Bane. */
export interface Ability {
  k: Keyword;
  n?: number;
  type?: UnitType;
}

export type UnitStage = 'basic' | 'stage1' | 'stage2';

/** A draft unit: what a battle and the shop know of a Pokémon. */
export interface Unit {
  /** Its Pokédex number, as a string: a run's state holds it. */
  id: string;
  dex: number;
  name: string;
  type: UnitType;
  stage: UnitStage;
  hp: number;
  attack: number;
  tier: number;
  abilities: Ability[];
  /** The Pokémon it evolves from, for merging. */
  evolvesFrom: string | null;
  /** Never in a shop: an encounter's reward. */
  legendary?: true;
  /** Its picture: a print of it (a card id), and of the Pokémon it evolves from. The API's; the package never reads cards. */
  card?: string;
  fromCard?: string;
}

/** "Splash 20", "Bane water 20", "Taunt": a keyword as species.ts writes it. */
export function parseAbility(text: string): Ability {
  const words = text.trim().split(' ');
  const last = words.at(-1)!;
  const n = /^\d+$/.test(last) ? Number(words.pop()) : undefined;
  const type = (UNIT_TYPES as readonly string[]).includes(words.at(-1)!) ? (words.pop() as UnitType) : undefined;
  const k = words.join(' ') as Keyword;
  if (!KEYWORD_NAMES.includes(k)) throw new Error(`Unknown keyword "${text}"`);
  return { k, ...(n !== undefined && { n }), ...(type && { type }) };
}

/** A keyword's name as a card shows it: "Splash 20", "Bane Water 20". */
export const abilityName = (a: Ability) => [a.k, a.type && a.type[0]!.toUpperCase() + a.type.slice(1), a.n].filter((x) => x !== undefined).join(' ');

/** Whether a unit has a keyword. */
export const hasKeyword = (u: Pick<Unit, 'abilities'>, k: Keyword) => u.abilities.some((a) => a.k === k);

/** Whether `evolved` evolves from a Pokémon called `name`. */
export const unitEvolvesFrom = (evolved: Pick<Unit, 'evolvesFrom'>, name: string) => evolved.evolvesFrom === name;

/**
 * A unit's rank within its tier, for the opponents' boards (the weaker or the stronger half of a tier): what it deals
 * times how long it lasts, a little more for each keyword. Its tier is written by hand (species.ts), not derived from this.
 */
export const unitScore = (u: Pick<Unit, 'attack' | 'hp' | 'abilities'>) => Math.sqrt(Math.max(u.attack, 10) * u.hp) * (1 + 0.15 * u.abilities.length);
