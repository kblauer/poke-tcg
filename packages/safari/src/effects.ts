// Safari Draft (issue #239, sections 2.4, 2.5, 3 and 5): what the keywords, Pokémon Powers, type synergies and Trainer
// buffs do in a battle, keyed by trigger (Hooks: battle start, on attack, on hit, when hit, after its attack, on faint).
// battle.ts calls them; the few that reach across the board (auras, Trainer buffs) are named in battle.ts where they
// apply, and listed here with their words so every effect has one entry.
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
  /** Sinkhole (Dark Dugtrio): what each opposing Pokémon takes on tails. */
  sinkhole: 20,
  /** Whether the attacks Gust of Wind aims are struck back. */
  gustStruckBack: true,
  /** Whether the Pokémon Scoop Up takes out comes back at the end of its line, fully healed. */
  scoopUpReturns: false,
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
  // Mine, placeholder numbers out of line with their like: Explode was worth three times any other keyword, Sinkhole
  // more than any other power.
  explode: 10,
  sinkhole: 10,
  // The Trainers worth nothing, buffed (the user's: buff or remove them): Gust of Wind's attacks aren't struck back, 2 of
  // them; the Pokémon Scoop Up takes out comes back at the end of its line, fully healed. The Clefairy Doll, which
  // nothing made worth playing (taking attacks is worth nothing when an attack is worth no more than being attacked), is
  // removed.
  gustStruckBack: false,
  gust: 2,
  scoopUpReturns: true,
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
  Gambler: 'Flip a coin: heads, your Pokémon get +20 attack; tails, −10',
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
  /** Works in the draft (the shop, the inventory), not in a battle: step 2's. */
  draft?: true;
  /** Named in battle.ts where it applies (an aura, a rule about coming back): no hook of its own. */
  rule?: true;
  /** Attacks twice, each hit flipping a coin to land. */
  flurry?: true;
  /** Before the battle: its lasting changes to attack and HP. */
  ready?(b: Battle, f: Fighter): void;
  /** At the start of the battle, once both sides stand: damage and Special Conditions. */
  start?(b: Battle, f: Fighter): void;
  /** What it adds to its attack, worked out whenever the attack is read. */
  attack?(b: Battle, f: Fighter): number;
  /** Before it attacks: false, and the attack does nothing. */
  mayAttack?(b: Battle, f: Fighter): boolean;
  /** Its attack's target, where it isn't a random one. */
  target?(b: Battle, f: Fighter, foes: Fighter[]): Fighter | undefined;
  /** The damage of its own attack (never of its strike back). */
  attackWith?(b: Battle, f: Fighter, target: Fighter, damage: number): number;
  /** The damage of any hit of its, its strike back too. */
  hitFor?(b: Battle, f: Fighter, target: Fighter, damage: number): number;
  /** A hit on it does nothing. `sure`: the hitter's side sees through coin flips (Clairvoyance). */
  prevents?(b: Battle, f: Fighter, by: Fighter, damage: number, sure: boolean): boolean;
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
  /** It would faint: true, and it doesn't. */
  survives?(b: Battle, f: Fighter): boolean;
  /** It fainted, `at` its place in the line. */
  fainted?(b: Battle, f: Fighter, killer: Fighter | undefined, at: number): void;
  /** It Knocked Out a Pokémon. */
  knockedOut?(b: Battle, f: Fighter): void;
}

const up10 = (n: number) => Math.ceil(n / 10) * 10;
const down10 = (n: number) => Math.floor(n / 10) * 10;
const others = (b: Battle, f: Fighter, type: EnergyType) => b.allies(f).filter((g) => g.type === type).length;
/** The ally that has lost the most HP, if any has. */
const mostDamaged = (b: Battle, f: Fighter) => b.allies(f).reduce<Fighter | undefined>((best, g) => (g.maxHp - g.hp > (best ? best.maxHp - best.hp : 0) ? g : best), undefined);
const leastHp = (foes: Fighter[]) => foes.reduce((best, g) => (g.hp < best.hp ? g : best));

export const KEYWORDS: Record<Keyword, Hooks> = {
  Explode: {
    text: 'When it faints, 10 damage to every opposing Pokémon',
    fainted: (b, f) => b.foes(f).forEach((g) => b.damage(g, TUNING.explode, f, 'Explode', true)),
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
    prevents: (b, f, _by, _damage, sure) => {
      if (f.once.guard) return false;
      f.once.guard = true;
      return !sure && b.flip();
    },
  },
  Harden: { text: 'Takes 10 less from every hit', reduces: (_b, _f, _by, damage) => damage - TUNING.harden },
  Blind: { text: "Its target's next hit flips a coin: tails, it does nothing", hit: (b, _f, target, _dealt, attacking) => attacking && b.blind(target) },
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
  Whirlwind: { text: "Its target moves to the end of its side's line", attacked: (b, _f, target) => b.moveToEnd(target, 'Whirlwind') },
  Family: {
    text: 'When it faints, a 10-attack, 30-HP copy of it takes its place',
    fainted: (b, f, _killer, at) => b.join(f.side, { name: f.name, type: f.type, stage: f.stage, attack: TUNING.familyAttack, hp: TUNING.familyHp }, at, 'Family'),
  },
  Copycat: { text: "Attacks with its target's attack when that's higher", attackWith: (b, _f, target, damage) => Math.max(damage, b.attackOf(target)) },
  Enrage: { text: "+10 attack each time it's hit", struck: (b, f) => b.buff(f, TUNING.enrage, 'Enrage') },
  Finisher: { text: "+20 damage to a Pokémon that's already damaged", hitFor: (_b, _f, target, damage) => (target.hp < target.maxHp ? damage + TUNING.finisher : damage) },
  Charge: { text: 'Every second attack does double', attackWith: (_b, f, _target, damage) => (f.attacks % 2 === 0 ? damage * 2 : damage) },
  Flurry: { text: 'Attacks twice, each hit flipping a coin to land', flurry: true },
  Recoil: {
    text: '+10 attack, and takes 10 each time it attacks',
    ready: (b, f) => b.buff(f, TUNING.recoilAttack, 'Recoil'),
    attacked: (b, f) => b.damage(f, TUNING.recoilSelf, undefined, 'Recoil'),
  },
  'Pay Day': { text: '+₱ each time it Knocks Out a Pokémon', knockedOut: (b, f) => b.pay(f) },
};

/** A power that is only attack and HP. */
const stats = (text: string, attack: number, hp: number): Hooks => ({
  text,
  ready: (b, f) => {
    if (attack) b.buff(f, attack, 'power');
    if (hp) b.grow(f, hp, 'power');
  },
});
/** At the start of battle, a coin: heads, the first opposing Pokémon gets the condition; tails, its own side's first. */
const scent = (text: string, condition: 'asleep' | 'confused'): Hooks => ({
  text,
  start: (b, f) => {
    const first = b.first(b.flip() ? b.otherSide(f.side) : f.side);
    if (first) b.afflict(first, condition, f);
  },
});

/** Gen 1's 66 Pokémon Powers by name (issue #239, 2.5), one card each. No power may show an opponent's board. */
export const POWERS: Record<string, Hooks> = {
  'Aurora Veil': { text: 'Its allies take no Splash, Explode or start-of-battle damage', rule: true },
  'Bench Guard': { text: 'Takes 10 of every hit on a neighbour in its place', rule: true },
  Buzzap: {
    text: 'When it faints, the ally with the most attack gets +20 attack',
    fainted: (b, f) => {
      const allies = b.allies(f);
      if (allies.length) b.buff(allies.reduce((best, g) => (b.attackOf(g) > b.attackOf(best) ? g : best)), 20, 'Buzzap');
    },
  },
  'Call the Boss': stats('+10 attack, +10 HP', 10, 10),
  'Chain Reaction': stats('+10 HP', 0, 10),
  Clairvoyance: { text: "Its side's attacks are never stopped by a coin flip (Guard, Blind, Transparency)", rule: true },
  Cowardice: { text: 'Sells for its full price', draft: true },
  Curse: {
    text: 'After it attacks, 10 damage to another random opposing Pokémon',
    attacked: (b, f, target) => {
      const rest = b.foes(f).filter((g) => g !== target);
      if (rest.length) b.damage(rest[b.roll(rest.length)]!, 10, f, 'Curse');
    },
  },
  'Damage Swap': {
    text: 'After it attacks, moves 10 damage from the most damaged ally to itself, never fainting from it',
    attacked: (b, f) => {
      const ally = mostDamaged(b, f);
      if (!ally || f.hp <= 10) return;
      b.heal(ally, 10, 'Damage Swap');
      b.damage(f, 10, undefined, 'Damage Swap');
    },
  },
  Emerge: stats('+20 HP', 0, 20),
  'Energy Burn': stats('+20 attack', 20, 0),
  'Energy Charge': { text: '+10 attack for each other Lightning ally, up to +30', attack: (b, f) => Math.min(30, 10 * others(b, f, 'lightning')) },
  'Energy Drain': { text: 'When hit, flips a coin: heads, the attacker has −10 attack', struck: (b, _f, by) => b.flip() && b.buff(by, -10, 'Energy Drain') },
  'Energy Trans': { text: 'At the start of battle, each other Grass ally gets +10 attack', ready: (b, f) => b.allies(f).forEach((g) => g.type === 'grass' && b.buff(g, 10, 'Energy Trans')) },
  'Evolutionary Light': { text: "While it's on the board, shops show 1 more card", draft: true },
  'Final Beam': { text: 'When Knocked Out, flips a coin: heads, 40 damage to the Pokémon that did it', fainted: (b, f, killer) => killer && b.flip() && b.damage(killer, 40, f, 'Final Beam') },
  Flee: {
    text: 'The first hit on it does nothing and moves it to the end of its line',
    prevents: (b, f) => {
      if (f.once.flee) return false;
      f.once.flee = true;
      b.flee(f);
      return true;
    },
  },
  Fortitude: {
    text: 'When it would faint, flips a coin: heads, it stays with 10 HP',
    survives: (b, f) => {
      if (!b.flip()) return false;
      b.set(f, 10, 'Fortitude');
      return true;
    },
  },
  'Fragrance Trap': { text: 'Before it attacks, flips a coin: heads, it hits the opposing Pokémon with the least HP', target: (b, _f, foes) => (b.flip() ? leastHp(foes) : undefined) },
  Frenzy: { text: '+30 attack while Confused', attack: (_b, f) => (f.condition === 'confused' ? 30 : 0) },
  'Gaseous Form': { text: '+10 HP for each other Psychic ally', ready: (b, f) => b.grow(f, 10 * others(b, f, 'psychic'), 'Gaseous Form') },
  'Gather Fire': { text: '+10 attack while it has another Fire ally', attack: (b, f) => (others(b, f, 'fire') ? 10 : 0) },
  Guard: stats('+20 HP', 0, 20),
  'Hay Fever': { text: "Neither side's Trainer buff works", rule: true },
  Heal: {
    text: 'After it attacks, flips a coin: heads, the most damaged ally heals 10',
    attacked: (b, f) => {
      const ally = mostDamaged(b, f);
      if (ally && b.flip()) b.heal(ally, 10, 'Heal');
    },
  },
  'Healing Fire': { text: 'Heals 10 after each of its attacks', attacked: (b, f) => b.heal(f, 10, 'Healing Fire') },
  'Invisible Wall': { text: 'Hits of 30 or more do nothing to it', prevents: (_b, _f, _by, damage) => damage >= 30 },
  'Kabuto Armor': { text: 'Takes half damage, rounded down to 10', reduces: (_b, _f, _by, damage) => down10(damage / 2) },
  'Long Distance Hypnosis': scent("At the start of battle, flips a coin: heads, the first opposing Pokémon is Asleep; tails, its own side's first", 'asleep'),
  'Matter Exchange': { text: 'One free reroll in each shop', draft: true },
  'Natural Healing': { text: 'Heals 10 after each of its attacks', attacked: (b, f) => b.heal(f, 10, 'Natural Healing') },
  'Neutral Shield': { text: 'Takes no damage from evolved Pokémon', prevents: (_b, _f, by) => by.stage !== 'basic' },
  Peek: { text: 'Its first attack hits the opposing Pokémon with the least HP', target: (_b, f, foes) => (f.attacks === 0 ? leastHp(foes) : undefined) },
  Photosynthesis: stats('+10 attack', 10, 0),
  'Pollen Defense': { text: 'When hit, flips a coin: heads, the attacker is Confused', struck: (b, f, by) => b.flip() && b.afflict(by, 'confused', f) },
  'Pollen Stench': scent("At the start of battle, flips a coin: heads, the first opposing Pokémon is Confused; tails, its own side's first", 'confused'),
  'Prehistoric Power': { text: 'Opposing Stage 1 and Stage 2 Pokémon have −10 attack', rule: true },
  Psylink: {
    text: "Attacks with the highest attack among its side's Psychic Pokémon",
    attack: (b, f) => Math.max(0, Math.max(0, ...b.allies(f).filter((g) => g.type === 'psychic' && g.power !== 'Psylink').map((g) => b.attackOf(g))) - (f.base + f.buff)),
  },
  'Rain Dance': {
    text: 'At the start of battle, each Water Pokémon of its side (itself too) gets +10 attack',
    ready: (b, f) => [f, ...b.allies(f)].forEach((g) => g.type === 'water' && b.buff(g, 10, 'Rain Dance')),
  },
  Rebellion: { text: 'Each attack flips 2 coins: both tails, it does nothing', mayAttack: (b) => [b.flip(), b.flip()].some(Boolean) },
  Rebirth: { text: 'The first time it faints, it comes back at the end of its line with half its HP', rule: true },
  'Reel In': { text: "When it's gained, a random tier-1 Basic goes to the inventory", draft: true },
  'Relaxing Scent': { text: "While it's its side's first Pokémon, every hit by either side does half, rounded up to 10", rule: true },
  'Restless Sleep': { text: "While it's Asleep, a Pokémon that hits it takes 20", struck: (b, f, by) => f.condition === 'asleep' && b.damage(by, 20, f, 'Restless Sleep') },
  'Retreat Aid': stats('+10 HP', 0, 10),
  Scram: { text: 'Once, at exactly 10 HP, it goes to the end of its line fully healed', rule: true },
  Shapeshift: { text: 'At the start of battle, becomes a copy of the ally on its right', rule: true },
  'Shell Armor': { text: 'Takes 10 less from every hit', reduces: (_b, _f, _by, damage) => damage - 10 },
  Shift: { text: 'Counts as the type of the ally on its left too, for synergies', rule: true },
  'Shock Blast': {
    text: 'When hit, flips a coin: tails, 20 damage to the attacker and to itself',
    struck: (b, f, by) => {
      if (b.flip()) return;
      b.damage(by, 20, f, 'Shock Blast');
      b.damage(f, 20, undefined, 'Shock Blast');
    },
  },
  Sinkhole: { text: 'At the start of battle, each opposing Pokémon flips a coin: tails, it takes 10', start: (b, f) => b.foes(f).forEach((g) => !b.flip() && b.damage(g, TUNING.sinkhole, f, 'Sinkhole', true)) },
  'Sneak Attack': {
    text: 'At the start of battle, 10 damage to a random opposing Pokémon',
    start: (b, f) => {
      const foes = b.foes(f);
      if (foes.length) b.damage(foes[b.roll(foes.length)]!, 10, f, 'Sneak Attack', true);
    },
  },
  'Soak Up': { text: '+10 attack for each other Grass ally, up to +20', attack: (b, f) => Math.min(20, 10 * others(b, f, 'grass')) },
  'Solar Power': { text: 'Once, when an ally gets a Special Condition, every Pokémon of its side is cured', rule: true },
  'Special Delivery': { text: 'One free reroll in each shop', draft: true },
  'Step In': { text: "Makes its side's first attack, wherever it stands", rule: true },
  'Sticky Goo': {
    text: 'A Pokémon it hits has −10 attack',
    hit: (b, f, target) => {
      if (target.once[`goo ${f.uid}`]) return;
      target.once[`goo ${f.uid}`] = true;
      b.buff(target, -10, 'Sticky Goo');
    },
  },
  'Strange Barrier': { text: "Basic Pokémon's hits of 20 or more do 10 to it", reduces: (_b, _f, by, damage) => (by.stage === 'basic' && damage >= 20 ? 10 : damage) },
  'Strange Behavior': { text: 'After each hit on an ally, moves 10 of that damage to itself, never fainting from it', rule: true },
  'Strikes Back': { text: 'A Pokémon that hits it takes 10', struck: (b, f, by) => b.damage(by, 10, f, 'Strikes Back') },
  'Summon Minions': { text: "When it's gained, 2 random tier-1 Basics go to the inventory", draft: true },
  'Thick Skinned': { text: "Can't be Poisoned, Paralyzed, Asleep or Confused", rule: true },
  'Toxic Gas': { text: "No other Pokémon's power works, either side's", rule: true },
  Transform: { text: 'At the start of battle, becomes a copy of the opposing Pokémon across from it', rule: true },
  Transparency: { text: 'Each hit on it flips a coin: heads, it does nothing', prevents: (b, _f, _by, _damage, sure) => !sure && b.flip() },
  Trickery: { text: 'One free reroll in each shop', draft: true },
};
