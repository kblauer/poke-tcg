// Safari Draft (issue #239, section 2): a Pokémon card turned into a draft unit: an attack number, an HP number, a tier
// (1–5) and its effects (one keyword from its attacks' wording, and its Pokémon Power's name). A port of the planning
// tool, tools/safari/unit_table.ts, which stays the reference: units.test.ts checks the two agree on every Gen 1 unit.
//   - attack: the average damage a turn over 6 turns, alone, attaching 1 Energy a turn, starting with 1 Energy attached
//     and 1 more for each stage, never under 10;
//   - HP: the printed HP;
//   - the evolution floor: an evolved unit's attack and HP together are at least 10 more than every print it evolves from;
//   - tier: the units ranked by √(attack × HP), raised by what their keyword and power are worth (the user's, 2026-11-18,
//     from the balance pass: the stronger effects are for the higher tiers), and cut in TIER_SHARES, an evolved card
//     always above what it evolves from;
//   - keyword: the first of KEYWORD_WORDINGS one of its attacks matches.
// No Weakness, Resistance, Energy or retreat: a unit's type is the card's printed type.
import { evolvesFromName, type Attack, type EnergyType, type PokemonCardDef } from '@poke-tcg/game-engine';

/** The formula's knobs (the user's, 2026-11-18: 1 Energy to start with and 1 more for each stage). */
const TURNS = 6;
const START_ENERGY = 1;
const STAGE_ENERGY: Record<string, number> = { basic: 0, stage1: 1, stage2: 2 };
/** The share of the units in each tier, 1 to 5: slightly more at the bottom, a wide top tier (the user's). */
export const TIER_SHARES = [0.25, 0.23, 0.2, 0.17, 0.15];
export const TOP_TIER = 5;

/** The keywords (issue #239, 2.4), in the order their wordings are tried. */
export type Keyword =
  | 'Explode'
  | 'Destiny Bond'
  | 'Toxic'
  | 'Poison'
  | 'Paralyze'
  | 'Sleep'
  | 'Confuse'
  | 'Drain'
  | 'Mend'
  | 'Guard'
  | 'Harden'
  | 'Blind'
  | 'Weaken'
  | 'Splash'
  | 'Unburden'
  | 'Whirlwind'
  | 'Family'
  | 'Copycat'
  | 'Enrage'
  | 'Finisher'
  | 'Charge'
  | 'Flurry'
  | 'Recoil'
  | 'Pay Day';

export type UnitStage = 'basic' | 'stage1' | 'stage2';

/** A draft unit: what a battle and the shop know of a card. */
export interface Unit {
  /** The card's id: every print is its own unit. */
  id: string;
  name: string;
  type: EnergyType;
  stage: UnitStage;
  hp: number;
  attack: number;
  tier: number;
  keyword?: Keyword;
  /** Its Pokémon Power's name (effects.ts's POWERS has what it does). */
  power?: string;
  /** The names it's printed to evolve from, for merging by the TCG's rules. */
  evolvesFrom: string | null;
  alsoEvolvesFrom?: string[];
}

/** A unit with how it was derived, for the planning tool's table and the balance report. */
export interface DerivedUnit extends Unit {
  /** The average damage a turn before rounding. */
  raw: number;
  /** The attack its keyword came from. */
  keywordFrom?: string;
  /** Its attack before the evolution floor raised it. */
  raisedFrom?: number;
}

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
const num = (s: string | undefined) => (s ? ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }[s.toLowerCase()] ?? Number(s)) : 0);

/** What one use of an attack is worth, with `energy` attached, and what using it costs. */
function attackValue(def: PokemonCardDef, a: Attack, energy: number) {
  const text = a.text ?? '';
  let damage = a.damage;
  const coins = /Flip (\d+|a|two|three|four) coins?\. This attack does (\d+) damage times the number of heads/i.exec(text);
  const untilTails = /Flip a coin until you get tails\. This attack does (\d+) damage times the number of heads/i.exec(text);
  const extraEnergy = /plus (\d+) more damage for each .*?Energy attached to .*? but not used to pay/i.exec(text);
  const coinPlus = /Flip a coin\. If heads, this attack does (\d+) damage plus (\d+) more damage/i.exec(text);
  const perEnergy = /Flip a number of coins equal to the (?:total )?number of .*?Energy cards? (?:attached|you discarded)[^.]*\. This attack does (\d+) damage times the number of heads/i.exec(text);
  // The tool's own pattern, kept as it is (its `d+` never matches, so the printed damage stands): the two must agree.
  const birthday = /If it's not your birthday, this attack does (d+) damage/i.exec(text);
  if (birthday) damage = Number(birthday[1]); // it's never the player's birthday (the user's)
  else if (perEnergy) damage = (energy * Number(perEnergy[1])) / 2;
  else if (coins) damage = (num(coins[1]) * Number(coins[2])) / 2;
  else if (untilTails) damage = Number(untilTails[1]);
  else if (extraEnergy) damage += Math.min(Math.max(energy - a.cost.length, 0), 2) * Number(extraEnergy[1]);
  else if (coinPlus) damage = Number(coinPlus[1]) + Number(coinPlus[2]) / 2;
  else if (/damage counter on (?!the Defending)/i.test(text) && /[×x+]/.test(a.damageText ?? '')) damage = a.damage * (/×|x/.test(a.damageText ?? '') ? def.hp / 20 : 1) + (/\+/.test(a.damageText ?? '') ? def.hp / 20 : 0);
  else if (/×|x$/.test(a.damageText ?? '')) damage = a.damage * 2; // any other "×": a typical 2
  else if (/\+$/.test(a.damageText ?? '')) damage = a.damage + 10; // any other "+": a typical 10 more
  if (/If tails, this attack does nothing/i.test(text)) damage /= 2;
  if (/If 1 or both of them are tails, this attack does nothing/i.test(text)) damage /= 4;
  // Damage to itself: half its worth off, a quarter when a flip decides it.
  const self = /does (\d+) damage to (?:itself|[A-Z][\w'’.♀♂ -]*?)(?=[.,]| and)/.exec(text.replace(/to (the Defending|each|your opponent)[^.]*/gi, ''));
  if (self && /to itself|damage to [A-Z]/.test(self[0]) && !/Benched/.test(self[0])) damage -= Number(self[1]) * (/If tails[^.]*damage to/i.test(text) ? 0.25 : 0.5);
  const discard = /Discard (\d+|a|an|one|two|all)(?: of the)? .*?Energy cards? attached to (?!the Defending)/i.exec(text);
  const discards = perEnergy && /Discard a number of Energy/i.test(text) ? Math.ceil(energy / 2) : discard ? (discard[1]!.toLowerCase() === 'all' ? energy : num(discard[1])) : 0;
  const rests = /can't attack during your next turn/i.test(text);
  return { damage: Math.max(damage, 0), discards, rests };
}

/** The 6 turns: each turn 1 Energy more, then the payable attack worth the most. */
function derivedAttack(def: PokemonCardDef) {
  let energy = START_ENERGY + (STAGE_ENERGY[def.stage] ?? 0);
  let total = 0;
  let resting = false;
  for (let turn = 0; turn < TURNS; turn++) {
    energy++;
    if (resting) {
      resting = false;
      continue;
    }
    const best = def.attacks
      .filter((a) => a.cost.length <= energy)
      .map((a) => attackValue(def, a, energy))
      .sort((x, y) => y.damage - x.damage)[0];
    if (!best) continue;
    total += best.damage;
    energy -= best.discards;
    resting = best.rests;
  }
  return total / TURNS;
}

/** The wording each keyword comes from, first match first (issue #239, 2.4). */
const KEYWORD_WORDINGS: [keyword: Keyword, wording: RegExp][] = [
  ['Explode', /damage to itself[^.]*\.[^.]*Bench|Selfdestruct|Explosion/i],
  ['Destiny Bond', /Destiny Bond|Knocked Out during your opponent's next turn/i],
  ['Toxic', /takes 20 Poison damage/i],
  ['Poison', /Poisoned/i],
  ['Paralyze', /Paralyzed/i],
  ['Sleep', /Asleep/i],
  ['Confuse', /Confused/i],
  ['Drain', /Remove (?:a number of |\d+ |all )?damage counters? from (?!the Defending|1 of your)/i],
  ['Mend', /Remove .*?damage counters? from (?:1|each) of your/i],
  ['Guard', /prevent all (?:effects of attacks, including )?damage done to|Prevent all damage/i],
  ['Harden', /damage done to .*? is reduced|whenever \d+ or less damage is done/i],
  ['Blind', /tries to attack[^.]*flips? a coin|If tails, that attack does nothing/i],
  ['Weaken', /attacks? .*?(?:do|does) \d+ less damage|can't (?:use that attack|attack)(?! during your next)/i],
  ['Splash', /damage to each (?:of your opponent's )?Benched|to each Pokémon on each player's Bench|1 of your opponent's Benched Pokémon/i],
  ['Unburden', /Discard \d+ .*?Energy cards? attached to the Defending|choose 1 Energy card attached to the Defending/i],
  ['Whirlwind', /switch(?:es)? (?:it|the Defending Pokémon) with|your opponent switches/i],
  ['Family', /Search your deck for .*?put (?:it|them) onto your Bench/i],
  ['Copycat', /Metronome|Mirror Move|copies? (?:that|1 of the Defending)/i],
  ['Enrage', /for each damage counter on (?!the Defending)/i],
  ['Finisher', /for each damage counter on the Defending|If the Defending Pokémon (?:already )?has/i],
  ['Charge', /during your next turn[^.]*(?:base damage|does? \d+ damage instead|double)/i],
  ['Flurry', /times the number of heads/i],
  ['Recoil', /does \d+ damage to itself/i],
  ['Pay Day', /draw (?:a|\d+) cards?/i],
];

/**
 * What each keyword is worth to a unit that has it, in points of win rate: the balance report's measurements of
 * 2026-11-18 (tools/safari/out/balance-report.md, "Keywords"). A unit's rank for its tier counts them (unitScore).
 * Measure again with tools/safari/balance.ts after changing what an effect does, and put its new worth here.
 */
export const KEYWORD_WORTH: Record<Keyword, number> = {
  Explode: 14, 'Destiny Bond': 10, Toxic: 15, Poison: 7, Paralyze: 5, Sleep: 13, Confuse: 6, Drain: 12, Mend: 0, Guard: 8, Harden: 9, Blind: 1,
  Weaken: 4, Splash: 7, Unburden: 0, Whirlwind: 0, Family: 11, Copycat: 5, Enrage: 6, Finisher: 7, Charge: 1, Flurry: -1, Recoil: 3, 'Pay Day': 0,
};

/** The same for the Pokémon Powers (the report's "Pokémon Powers"); one not listed, a draft-only power among them, counts 0. */
export const POWER_WORTH: Record<string, number> = {
  'Prehistoric Power': 17, Transparency: 16, Rebirth: 16, Sinkhole: 13, Fortitude: 11, 'Energy Burn': 10, 'Kabuto Armor': 10, Scram: 9, 'Call the Boss': 9,
  'Shell Armor': 9, 'Thick Skinned': 9, 'Rain Dance': 8, Emerge: 8, Shift: 6, Flee: 6, 'Sticky Goo': 6, 'Aurora Veil': 6, Guard: 6, Shapeshift: 5,
  'Strikes Back': 5, 'Strange Barrier': 5, Transform: 5, 'Retreat Aid': 5, 'Natural Healing': 5, Photosynthesis: 4, 'Energy Trans': 4, 'Solar Power': 4,
  'Sneak Attack': 4, 'Final Beam': 4, 'Chain Reaction': 3, Buzzap: 3, 'Soak Up': 3, 'Healing Fire': 3, Curse: 2, 'Shock Blast': 2, 'Pollen Defense': 2,
  'Energy Charge': 2, 'Gaseous Form': 2, 'Gather Fire': 1, Clairvoyance: 1, 'Invisible Wall': 1, 'Energy Drain': 1, 'Strange Behavior': 1, 'Restless Sleep': 1,
  'Fragrance Trap': -1, 'Pollen Stench': -1, 'Bench Guard': -1,
};

/**
 * How much of its rank a point of worth is: a keyword worth 10 points ranks its unit as one with 40% more √(attack × HP).
 * Of 0, 0.01, 0.02, 0.03, 0.04 and 0.06, the weight that left the units' win rates within their tiers closest together
 * (their spread 7.4 points at 0, 6.1 here): the units with Sleep, Drain, Toxic, Explode or Family a tier higher on
 * average (2.8 to 3.6) and winning 53% of their tier's battles where they won 61%.
 */
export const WORTH_WEIGHT = 0.04;

/** A unit's rank for its tier: what it deals times how long it lasts, raised by what its effects are worth. */
export const unitScore = (u: Pick<Unit, 'attack' | 'hp' | 'keyword' | 'power'>) =>
  Math.sqrt(u.attack * u.hp) * (1 + WORTH_WEIGHT * ((u.keyword ? KEYWORD_WORTH[u.keyword] : 0) + (u.power ? (POWER_WORTH[u.power] ?? 0) : 0)));

export const KEYWORD_NAMES: readonly Keyword[] = KEYWORD_WORDINGS.map(([keyword]) => keyword);

function keywordOf(def: PokemonCardDef): { keyword?: Keyword; keywordFrom?: string } {
  for (const [keyword, wording] of KEYWORD_WORDINGS) {
    const from = def.attacks.find((a) => wording.test(`${a.name}. ${a.text ?? ''}`));
    if (from) return { keyword, keywordFrom: from.name };
  }
  return {};
}

/**
 * The cards that are units (issue #239, 2.1), of a generation's Pokémon cards: no word-for-word reprint (`reprints`: Base
 * Set 2's and Legendary Collection's, the caller's, so this package never loads the engine's effects), no Trainer card
 * played as a Pokémon, no Pokémon past #151 (`dexOf`: the snapshot's Pokédex numbers), and a card printed twice in its
 * set, holo and not, once: the holo.
 */
export function safariPool(defs: readonly PokemonCardDef[], reprints: ReadonlySet<string>, dexOf: (id: string) => readonly number[] | undefined): PokemonCardDef[] {
  const pokemon = defs.filter((d) => !reprints.has(d.id) && d.hp > 0 && !d.trainerText && (d.stage === 'basic' || d.stage === 'stage1' || d.stage === 'stage2')).filter((d) => !(dexOf(d.id) ?? []).some((n) => n > 151));
  const print = (d: PokemonCardDef) => JSON.stringify([d.id.split('-')[0], d.name, d.hp, d.attacks, d.power]);
  const holos = new Set(pokemon.filter((d) => d.holo).map(print));
  return pokemon.filter((d) => d.holo || !holos.has(print(d)));
}

/** A generation's units from its Pokémon cards' definitions: safariPool's cards, derived (the API's and gen1.ts's one way). */
export const unitsFrom = (defs: readonly PokemonCardDef[], reprints: ReadonlySet<string>, dexOf: (id: string) => readonly number[] | undefined) => deriveUnits(safariPool(defs, reprints, dexOf));

/** Whether `evolved` is printed to evolve from a Pokémon called `name` (the TCG's rule, by name, never by card id). */
export const unitEvolvesFrom = (evolved: Pick<Unit, 'evolvesFrom' | 'alsoEvolvesFrom'>, name: string) => evolvesFromName(evolved, name) || !!evolved.alsoEvolvesFrom?.includes(name);

/** Every unit of a pool (safariPool's), in the pool's order: the ranking's ties fall by it, as the planning tool's do. */
export function deriveUnits(pool: readonly PokemonCardDef[]): DerivedUnit[] {
  const units: DerivedUnit[] = pool.map((def) => {
    const raw = derivedAttack(def);
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      stage: def.stage as UnitStage,
      hp: def.hp,
      attack: round10(raw),
      tier: 0,
      ...keywordOf(def),
      ...(def.power ? { power: def.power.name } : {}),
      evolvesFrom: def.evolvesFrom,
      ...(def.alsoEvolvesFrom ? { alsoEvolvesFrom: def.alsoEvolvesFrom } : {}),
      raw,
    };
  });
  const printsBelow = (u: Unit) => units.filter((p) => unitEvolvesFrom(u, p.name));

  // The evolution floor: Stage 1s first, so a Stage 2 stands on the raised ones.
  for (const stage of ['stage1', 'stage2']) {
    for (const u of units.filter((x) => x.stage === stage)) {
      const below = printsBelow(u);
      const need = 10 + Math.max(0, ...below.map((p) => p.attack + p.hp));
      if (!below.length || u.attack + u.hp >= need) continue;
      u.raisedFrom = u.attack;
      u.attack = need - u.hp;
    }
  }

  // Tiers: shares of the ranking (unitScore), then a card that evolves leaves room above it (a Basic of a 3-stage line at
  // most 3) and an evolved card is at least one above every print it evolves from.
  const sorted = [...units].sort((a, b) => unitScore(a) - unitScore(b));
  const tierEnds = TIER_SHARES.map((_, t) => TIER_SHARES.slice(0, t + 1).reduce((a, b) => a + b, 0) * sorted.length);
  sorted.forEach((u, i) => (u.tier = 1 + tierEnds.findIndex((end) => i < end)));
  const evolvesInto = (name: string) => units.filter((u) => unitEvolvesFrom(u, name));
  const above = new Map<string, number>();
  const stagesAbove = (name: string): number => {
    if (!above.has(name)) above.set(name, Math.max(0, ...evolvesInto(name).map((u) => 1 + stagesAbove(u.name))));
    return above.get(name)!;
  };
  for (const u of units) u.tier = Math.min(u.tier, TOP_TIER - stagesAbove(u.name));
  for (const stage of ['stage1', 'stage2']) {
    for (const u of units.filter((x) => x.stage === stage)) u.tier = Math.max(u.tier, 1 + Math.max(0, ...printsBelow(u).map((p) => p.tier)));
  }
  return units;
}
