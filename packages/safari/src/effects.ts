// Safari Draft (issue #239, sections 2.4, 3 and 5): what the keywords, type synergies and Trainer buffs do in a battle,
// keyed by trigger (Hooks: battle start, on attack, on hit, when hit, after its attack, on faint).
// battle.ts calls them; the few that reach across the board (Taunt, Trainer buffs) are named in battle.ts where they
// apply, and listed here with their words so every effect has one entry. The Pokémon Powers were removed (the user's,
// 2026-11-18: one kind of effect, the keyword; units.ts gives a power's card a keyword in its place).
//
// The numbers are TUNING's. SPEC keeps the issue's placeholder numbers (approved "for the balance pass") beside them: the
// balance report (tools/safari/balance.ts) plays both. Change a number in TUNING only, with the report's reason.
import type { EnergyType } from '@poke-tcg/game-engine';
import type { Battle, Fighter } from './battle.js';
import type { Keyword } from './units.js';

/** The issue's numbers, as approved. Levels are a synergy's first, second and third strength (2 / 4 / 6 of a type). */
export const SPEC = {
  /** Explode: damage to every opposing Pokémon when it faints. */
  explode: 20,
  /** Poison's damage after each of the target's side's attacks; Toxic's. */
  poison: 10,
  toxic: 20,
  /** How many times a poisoning damages before it ends (the user's, 2026-11-18). */
  poisonTicks: 3,
  /** What a Confused Pokémon does to itself on tails; it's then no longer Confused (the user's, 2026-11-18). */
  confusion: 30,
  mend: 20,
  harden: 10,
  weaken: 10,
  splash: 10,
  unburden: 10,
  familyAttack: 10,
  familyHp: 30,
  enrage: 10,
  finisher: 20,
  recoilAttack: 10,
  recoilSelf: 10,
  /** The round from which every hit does more, and how much more each round (the user's, 2026-11-18: every battle ends). */
  risingFrom: 10,
  rising: 10,
  /** Grass, Poison: the poisoning's damage. */
  grass: [10, 20, 30],
  /** Fire, Blaze: damage to the target's neighbours. */
  fire: [10, 20, 40],
  /** Water, Shell: less from every hit. */
  water: [10, 20, 30],
  /** Lightning, Quick: how many attack before the normal order. */
  lightning: [1, 2, 3],
  /** Psychic, Mind: damage to every opposing Pokémon at the start. */
  psychic: [10, 20, 30],
  /** Fighting, Brawn: attack. */
  fighting: [10, 20, 40],
  /** Colorless, Versatile: attack and HP for each different type on the board, times the level's number. */
  colorless: [1, 2, 3],
  versatile: 10,
  /** Whether Versatile counts Colorless itself among the board's types (the issue's words: "each different type"). */
  versatileOwn: true,
  plusPower: 10,
  defender: 10,
  potion: 30,
  superPotion: 20,
  energyRemoval: 20,
  gust: 3,
  gamblerHeads: 20,
  gamblerTails: -10,
  imposter: 2,
  /** Whether a Pokémon that is Asleep or Paralyzed strikes back when it's attacked (the first build's rule, not the issue's). */
  restingStrikesBack: true,
  /** Whether Blind's coin is for the target's next attack only (false: its next hit, a strike back too). */
  blindAttackOnly: true,
  /** Whether Quick's attacks before the normal order are struck back. */
  quickStruckBack: true,
  /** Whether Versatile gives attack as well as HP. */
  versatileAttack: true,
  /** Whether the attacks Gust of Wind aims are struck back. */
  gustStruckBack: true,
  /** Whether the Pokémon Scoop Up takes out comes back at the end of its line, fully healed. */
  scoopUpReturns: false,
  // Step 7's balance pass (2026-11-18): proposals for the effects worth about nothing, each off as the issue has it, measured
  // on and off by tools/safari/balance.ts before the user decides.
  /** Flurry: its first hit always lands, only the second flips (false: each flips). */
  flurrySure: false,
  /** Whirlwind: its attacks aren't struck back (the target is blown away first). */
  whirlwindUnanswered: false,
  /** Charge: its doubled attack isn't struck back. */
  chargeUnanswered: false,
  /** Blind: its target is Blinded as it's hit, so its strike back flips a coin (tails, none). */
  blindAtOnce: false,
};
export type Tuning = typeof SPEC;

/**
 * The numbers battles play by: the issue's but where the balance pass of 2026-11-18 changed one (README: Safari Draft, the
 * balance pass; tools/safari/out/balance-report.md plays both).
 */
export const TUNING: Tuning = {
  ...SPEC,
  // The user's (2026-11-18), from the pass's findings. Damage being simultaneous, an attack is worth no more than being
  // attacked, so making a Pokémon miss was worth nothing: an Asleep or Paralyzed Pokémon doesn't strike back, and Blind's
  // coin covers its target's next hit.
  restingStrikesBack: false,
  blindAttackOnly: false,
  // Quick was worth nothing for the same reason: its attacks aren't struck back, and the leftmost 1/3/6 make them.
  quickStruckBack: false,
  lightning: [1, 3, 6],
  // Versatile was worth five times any other synergy: +10 HP for each other type on the board, no attack.
  versatileOwn: false,
  versatileAttack: false,
  // Mine, a placeholder number out of line with its like: Explode was worth three times any other keyword.
  explode: 10,
  // The Trainers worth nothing, buffed (the user's: buff or remove them): Gust of Wind's attacks aren't struck back, 2 of
  // them; the Pokémon Scoop Up takes out comes back at the end of its line, fully healed. The Clefairy Doll, which
  // nothing made worth playing (taking attacks is worth nothing when an attack is worth no more than being attacked), is
  // removed.
  gustStruckBack: false,
  gust: 2,
  scoopUpReturns: true,
  // Step 7's balance pass (the user's, 2026-11-18): the keywords (and the powers, since removed) worth about nothing, changed so each is worth
  // something (tools/safari/out/balance-report.md), and Gambler with no downside. Whirlwind and Charge are kept as they
  // are for now, their switches (whirlwindUnanswered, chargeUnanswered) off, for the user's testing by hand.
  flurrySure: true,
  blindAtOnce: true,
  gamblerTails: 0,
};

/** The types with a synergy: Gen 1's seven. */
export const SYNERGY_TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless'] as const satisfies readonly EnergyType[];
export type SynergyType = (typeof SYNERGY_TYPES)[number];

/** A synergy's level, 0 to 3, for how many of its type a board has (issue #239, 3: 2 / 4 / 6). */
export const synergyLevel = (count: number) => (count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0);

/**
 * The synergies built (the issue's main column, Quick and Versatile as the user changed them in the balance pass); the
 * alternatives are documented in the issue only.
 */
export const SYNERGIES: Record<SynergyType, { name: string; text: string }> = {
  grass: { name: 'Poison', text: 'A Pokémon hit by a Grass Pokémon is Poisoned, taking 10/20/30 after each of its side\'s attacks' },
  fire: { name: 'Blaze', text: "Fire Pokémon's attacks also do 10/20/40 to the target's neighbours" },
  water: { name: 'Shell', text: 'Water Pokémon take 10/20/30 less from every hit' },
  lightning: { name: 'Quick', text: 'The leftmost 1/3/6 Lightning Pokémon attack once before the normal order starts, with no strike back' },
  psychic: { name: 'Mind', text: 'At the start of battle, 10/20/30 damage to every opposing Pokémon' },
  fighting: { name: 'Brawn', text: 'Fighting Pokémon get +10/20/40 attack' },
  colorless: { name: 'Versatile', text: 'Colorless Pokémon get +10 HP for each other type on the board, ×1/2/3' },
};

/**
 * The Trainers a side may play, one a battle (issue #239, 5). battle.ts applies each where its words say. The issue's
 * Clefairy Doll was removed in the balance pass.
 */
export const TRAINERS = {
  PlusPower: 'Your Pokémon get +10 attack',
  Defender: 'Your Pokémon take 10 less from every hit',
  Potion: 'The first of your Pokémon to fall under half its HP heals 30',
  'Super Potion': "Each of your Pokémon heals 20 the first time it's hit",
  'Full Heal': "Your Pokémon can't be Poisoned, Burned or Paralyzed",
  Revive: 'The first of your Pokémon to faint comes back with half its HP',
  'Pokémon Center': "Once, when you're down to 3 Pokémon, they heal fully",
  'Gust of Wind': 'Your first 2 attacks hit the opposing Pokémon with the most attack, with no strike back',
  'Energy Removal': 'The opposing Pokémon with the most attack has −20 attack',
  'Super Energy Removal': 'The 2 opposing Pokémon with the most attack have −20 attack',
  'Scoop Up': 'The first of your Pokémon that would faint goes to the end of your line fully healed instead, and your next Pokémon attacks at once',
  Gambler: 'Flip a coin: heads, your Pokémon get +20 attack',
  'Imposter Professor Oak': "The opponent's type synergies count 2 Pokémon fewer",
  /** After the battle: the draft's (step 2), nothing in the battle itself. */
  Bill: '+₱ after the battle, won or lost',
  'Professor Oak': "The next shop's rerolls are free",
} as const;
export type TrainerName = keyof typeof TRAINERS;
export const TRAINER_NAMES = Object.keys(TRAINERS) as TrainerName[];

/** What an effect does, by when. `f` is the Pokémon that has it. */
export interface Hooks {
  /** Its words, as the issue has them. */
  text: string;
  /** Named in battle.ts where it applies (Taunt): no hook of its own. */
  rule?: true;
  /** Attacks twice, each hit flipping a coin to land. */
  flurry?: true;
  /** Its attack on `target` isn't struck back. */
  unanswered?(b: Battle, f: Fighter, target: Fighter): boolean;
  /** Before the battle: its lasting changes to attack and HP. */
  ready?(b: Battle, f: Fighter): void;
  /** The damage of its own attack (never of its strike back). */
  attackWith?(b: Battle, f: Fighter, target: Fighter, damage: number): number;
  /** The damage of any hit of its, its strike back too. */
  hitFor?(b: Battle, f: Fighter, target: Fighter, damage: number): number;
  /** A hit on it does nothing. */
  prevents?(b: Battle, f: Fighter, by: Fighter, damage: number): boolean;
  /** What a hit on it does, after its reduction. */
  reduces?(b: Battle, f: Fighter, by: Fighter, damage: number): number;
  /** Its hit landed. `attacking`: its own attack, not its strike back. */
  hit?(b: Battle, f: Fighter, target: Fighter, dealt: number, attacking: boolean): void;
  /** A hit landed on it. */
  struck?(b: Battle, f: Fighter, by: Fighter, dealt: number): void;
  /** Damage its attacks also do to the target's neighbours. */
  splash?(b: Battle, f: Fighter): number;
  /** After its attack. */
  attacked?(b: Battle, f: Fighter, target: Fighter): void;
  /** It fainted, `at` its place in the line. */
  fainted?(b: Battle, f: Fighter, killer: Fighter | undefined, at: number): void;
  /** It Knocked Out a Pokémon. */
  knockedOut?(b: Battle, f: Fighter): void;
}

const up10 = (n: number) => Math.ceil(n / 10) * 10;
/** The ally that has lost the most HP, if any has. */
const mostDamaged = (b: Battle, f: Fighter) => b.allies(f).reduce<Fighter | undefined>((best, g) => (g.maxHp - g.hp > (best ? best.maxHp - best.hp : 0) ? g : best), undefined);

export const KEYWORDS: Record<Keyword, Hooks> = {
  Explode: {
    text: 'When it faints, 10 damage to every opposing Pokémon',
    fainted: (b, f) => b.foes(f).forEach((g) => b.damage(g, TUNING.explode, f, 'Explode')),
  },
  'Destiny Bond': {
    text: 'When it faints, the Pokémon that Knocked it Out faints too',
    fainted: (b, f, killer) => killer && b.fell(killer, f, 'Destiny Bond'),
  },
  Toxic: { text: 'Its hits Poison for 20 instead of 10', hit: (b, f, target) => b.poison(target, TUNING.toxic, f) },
  Poison: { text: "Its hits Poison: 10 damage after each of the target's side's attacks", hit: (b, f, target) => b.poison(target, TUNING.poison, f) },
  Paralyze: { text: "Its hits flip a coin: heads, the target misses its next attack and doesn't strike back until then", hit: (b, f, target) => b.flip() && b.afflict(target, 'paralyzed', f) },
  Sleep: { text: "Its hits put the target to sleep: it misses attacks and doesn't strike back until it flips heads", hit: (b, f, target) => b.afflict(target, 'asleep', f) },
  Confuse: { text: "Its hits Confuse: the target's attacks flip a coin, tails doing 30 to itself instead", hit: (b, f, target) => b.afflict(target, 'confused', f) },
  Drain: { text: 'Heals itself for half the damage it deals', hit: (b, f, _target, dealt) => b.heal(f, up10(dealt / 2), 'Drain') },
  Mend: {
    text: 'After it attacks, the most damaged ally heals 20',
    attacked: (b, f) => {
      const ally = mostDamaged(b, f);
      if (ally) b.heal(ally, TUNING.mend, 'Mend');
    },
  },
  Guard: {
    text: 'Flips a coin when first hit: heads, no damage',
    prevents: (b, f) => {
      if (f.once.guard) return false;
      f.once.guard = true;
      return b.flip();
    },
  },
  Harden: { text: 'Takes 10 less from every hit', reduces: (_b, _f, _by, damage) => damage - TUNING.harden },
  Blind: {
    text: "Its target's next hit, its strike back too, flips a coin: tails, it does nothing",
    hit: (b, _f, target, _dealt, attacking) => attacking && b.blind(target),
    unanswered: (b) => TUNING.blindAtOnce && !b.flip(),
  },
  Weaken: { text: 'Its target has −10 attack for the battle', hit: (b, _f, target, _dealt, attacking) => attacking && b.buff(target, -TUNING.weaken, 'Weaken') },
  Splash: { text: "Its attacks also do 10 to the target's neighbours", splash: () => TUNING.splash },
  Unburden: {
    text: "Its first hit on a Pokémon takes 10 off that Pokémon's attack",
    hit: (b, f, target) => {
      if (target.once[`unburden ${f.uid}`]) return;
      target.once[`unburden ${f.uid}`] = true;
      b.buff(target, -TUNING.unburden, 'Unburden');
    },
  },
  Whirlwind: { text: "Its target moves to the end of its side's line", attacked: (b, _f, target) => b.moveToEnd(target, 'Whirlwind'), unanswered: () => TUNING.whirlwindUnanswered },
  Family: {
    text: 'When it faints, a 10-attack, 30-HP copy of it takes its place',
    fainted: (b, f, _killer, at) => b.join(f.side, { name: f.name, type: f.type, stage: f.stage, attack: TUNING.familyAttack, hp: TUNING.familyHp }, at, 'Family'),
  },
  Copycat: { text: "Attacks with its target's attack when that's higher", attackWith: (b, _f, target, damage) => Math.max(damage, b.attackOf(target)) },
  Enrage: { text: "+10 attack each time it's hit", struck: (b, f) => b.buff(f, TUNING.enrage, 'Enrage') },
  Finisher: { text: "+20 damage to a Pokémon that's already damaged", hitFor: (_b, _f, target, damage) => (target.hp < target.maxHp ? damage + TUNING.finisher : damage) },
  Charge: { text: 'Every second attack does double', attackWith: (_b, f, _target, damage) => (f.attacks % 2 === 0 ? damage * 2 : damage), unanswered: (_b, f) => TUNING.chargeUnanswered && f.attacks % 2 === 0 },
  Flurry: { text: 'Attacks twice: the first hit always lands, the second flips a coin', flurry: true },
  Recoil: {
    text: '+10 attack, and takes 10 each time it attacks',
    ready: (b, f) => b.buff(f, TUNING.recoilAttack, 'Recoil'),
    attacked: (b, f) => b.damage(f, TUNING.recoilSelf, undefined, 'Recoil'),
  },
  'Pay Day': { text: '+₱ each time it Knocks Out a Pokémon', knockedOut: (b, f) => b.pay(f) },
  Taunt: { text: 'Opposing Pokémon must attack it while it stands', rule: true },
};
