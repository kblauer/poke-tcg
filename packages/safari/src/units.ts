// Safari Draft (issue #254, the redesign of #239's section 2): a draft unit. One for each Pokémon species, #1–386, written
// by hand in species.ts: a name, a type, a tier (1–5), an attack, an HP and 0 to 3 keywords (most have 1, a select few 3), each of which may carry a
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

/**
 * The keywords, by the generation each is kept for (the user's, 2026-11-22: 64 are a whole game's, split over the nine
 * generations; the split and its themes are mine, packages/safari/CLAUDE.md). Only the generations in play (GENERATIONS_IN_PLAY)
 * are on a unit, an upgrade or an opponent; the later ones are written and tested (effects.ts, battle.test.ts) and wait.
 */
export const KEYWORDS_BY_GENERATION = {
  // The basics, after Red and Blue's moves: who is attacked, a Shield, hitting neighbours, the three Special Conditions.
  1: ['Taunt', 'Shield', 'Quick', 'Flying', 'Splash', 'Rally', 'Face-off', 'Explode', 'Whirlwind', 'Paralyze', 'Confuse', 'Burn', 'Transform', 'Pay Day'],
  // Gold and Silver's moves and arrivals: Steel, Dark, breeding, held items.
  2: ['Armor', 'Finisher', 'Baton Pass', 'Safeguard', 'Sketch', 'Destiny Bond', 'Family', 'Regen'],
  // Ruby and Sapphire's Abilities, and Follow Me from its double battles.
  3: ['Intimidate', 'Sturdy', 'Truant', 'Static', 'Flame Body', 'Cute Charm', 'Thorns', 'Bodyguard'],
  // Diamond and Pearl: U-turn, Stealth Rock, Sniper, Reckless, Skill Link, Mold Breaker.
  4: ['U-turn', 'Barrage', 'Sniper', 'Recoil', 'Double Strike', 'Breaker'],
  // Black and White: triple battles' neighbours (Friend Guard, Healer, Wide Guard), Moxie, Justified, Speed Boost.
  5: ['Guardian', 'Mend', 'Screen', 'Rampage', 'Enrage', 'Grow'],
  // X and Y: hordes, Mega Evolution, the type chart redrawn.
  6: ['Pack', 'Leader', 'Fortify', 'Bane', 'Cleave', 'Drain'],
  // Sun and Moon: what a faint leaves behind (Receiver, Soul-Heart, Innards Out), Ultra Beasts, Z-Moves.
  7: ['Legacy', 'Scavenger', 'Memento', 'Weaken', 'Loner', 'Trample'],
  // Sword and Shield: Intrepid Sword, Dauntless Shield, Unseen Fist, Body Press, Court Change.
  8: ['Vanguard', 'Rearguard', 'Reach', 'Counter', 'Roar'],
  // Scarlet and Violet: the first move on the Pokémon across.
  9: ['Pounce', 'Glare', 'Supersonic', 'Will-O-Wisp', 'Evasive'],
} as const;
/** The generations whose Pokémon and keywords are in the game now. */
export const GENERATIONS_IN_PLAY = 3;
export const KEYWORD_NAMES = Object.values(KEYWORDS_BY_GENERATION).flat();
export type Keyword = (typeof KEYWORDS_BY_GENERATION)[keyof typeof KEYWORDS_BY_GENERATION][number];
/** The generation a keyword is kept for. */
export const keywordGeneration = (k: Keyword) => Number(Object.entries(KEYWORDS_BY_GENERATION).find(([, ks]) => (ks as readonly string[]).includes(k))![0]);
/** Whether a keyword is in the game now. */
export const keywordInPlay = (k: Keyword) => keywordGeneration(k) <= GENERATIONS_IN_PLAY;
/** The keywords in the game now. */
export const KEYWORDS_IN_PLAY = KEYWORD_NAMES.filter(keywordInPlay);

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
