// Safari Draft (issue #254, sections 3 to 5; the Trainers redesigned with them, 2026-11-22): what the keywords, type
// synergies and Trainer cards do in a battle. A keyword's entry has its words (for the card) and its hooks by trigger (start of battle,
// on hit, when hit, after its attack, on fainting); battle.ts calls them. The keywords that are rules of the battle itself
// (who is attacked, whether a hit is struck back, what a hit does beyond its target) have only their words here (`rule`)
// and are named in battle.ts where they apply.
//
// "Neighbours" are the Pokémon beside it in its line; "across" is the opposing Pokémon in the same place of its line,
// counted from the left. The numbers that aren't a card's own are TUNING's.
import type { Battle, Fighter } from './battle.js';
import type { Ability, Keyword, UnitType } from './units.js';

export { abilityName } from './units.js';

/** The numbers battles play by. Levels are a synergy's first, second and third strength (2 / 4 / 6 of a type). */
export const TUNING = {
  /** What a Confused Pokémon does to itself on tails; it's then no longer Confused. */
  confusion: 30,
  /** The round from which every hit does more, and how much more each round (the user's, 2026-11-18: every battle ends). */
  risingFrom: 10,
  rising: 10,
  /** Grass, Leech: what a Grass Pokémon heals each time it hits. */
  grass: [10, 10, 10],
  /** Fire, Blaze: Fire Pokémon's hits Burn; what a Burned Pokémon takes more from every hit. */
  fire: [10, 10, 20],
  /** Water, Current: HP for each Water neighbour. */
  water: [10, 10, 20],
  /** Lightning, Quick: how many attack before the normal order. */
  lightning: [1, 3, 6],
  /** Psychic, Pressure: attack taken off the Pokémon across from each Psychic Pokémon. */
  psychic: [10, 10, 10],
  /** Fighting, Duel: damage more to the Pokémon across. */
  fighting: [10, 10, 10],
  /** Colorless, Versatile: HP for each other type on the board, times the level's number. */
  colorless: [1, 1, 2],
  versatile: 10,
  /** Darkness, Prey: damage more to a Pokémon that's damaged or has a Special Condition. */
  darkness: [20, 20, 40],
  /** Metal, Plating: what Metal Pokémon's neighbours take less from every hit. */
  metal: [10, 10, 20],
  plusPower: 20,
  potion: 30,
  superPotion: 20,
  clefairyDoll: 30,
  energyRemoval: 20,
  gust: 2,
  imposter: 2,
};

/** The types with a synergy: all nine. */
export const SYNERGY_TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'darkness', 'metal'] as const satisfies readonly UnitType[];
export type SynergyType = (typeof SYNERGY_TYPES)[number];

/** A synergy's level, 0 to 3, for how many of its type a board has (2 / 4 / 6). */
export const synergyLevel = (count: number) => (count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0);

/** The synergies (issue #254, section 5). */
export const SYNERGIES: Record<SynergyType, { name: string; text: string }> = {
  grass: { name: 'Leech', text: 'Grass Pokémon heal 10 each time they hit' },
  fire: { name: 'Blaze', text: "Fire Pokémon's hits Burn; a Burned Pokémon takes 10/10/20 more from every hit" },
  water: { name: 'Current', text: 'Water Pokémon get +10/10/20 HP for each Water neighbour' },
  lightning: { name: 'Quick', text: 'The leftmost 1/3/6 Lightning Pokémon attack once before the normal order starts, with no strike back' },
  psychic: { name: 'Pressure', text: 'The Pokémon across from each Psychic Pokémon has −10 attack' },
  fighting: { name: 'Duel', text: 'Fighting Pokémon attack the Pokémon across from them while it stands, for +10 damage' },
  colorless: { name: 'Versatile', text: 'Colorless Pokémon get +10 HP for each other type on the board, ×1/1/2' },
  darkness: { name: 'Prey', text: "Darkness Pokémon do +20/20/40 damage to a Pokémon that's damaged or has a Special Condition" },
  metal: { name: 'Plating', text: "Metal Pokémon's neighbours take 10/10/20 less from every hit" },
};

/**
 * The Trainers a side may play, one a battle. battle.ts applies each where its words say. Redesigned with the units (the
 * user's, 2026-11-22; the cards mine): most read places, as the keywords do (the first and last Pokémon of a line, a
 * Pokémon's neighbours), so where a Pokémon stands matters to them too. "First" is the left end of a line.
 */
export const TRAINERS = {
  PlusPower: 'Your first 2 Pokémon get +20 attack',
  Defender: 'Your first and last Pokémon start with a Shield',
  Potion: 'The first of your Pokémon to fall under half its HP heals 30, and so do its neighbours',
  'Super Potion': 'When one of your Pokémon faints, its neighbours heal 20',
  'Full Heal': "Your Pokémon can't be Burned, Paralyzed or Confused",
  Revive: 'The first of your Pokémon to faint comes back with half its HP',
  'Pokémon Center': "Once, when you're down to 3 Pokémon, they heal fully",
  'Gust of Wind': 'Your first 2 attacks hit the opposing Pokémon with the most attack, with no strike back',
  'Energy Removal': 'The opposing Pokémon with the most attack has −20 attack',
  'Super Energy Removal': 'The 2 opposing Pokémon with the most attack have −20 attack',
  'Scoop Up': 'The first of your Pokémon that would faint goes to the end of your line fully healed instead, and your next Pokémon attacks at once',
  'Clefairy Doll': 'Your last Pokémon has Taunt and +30 HP',
  'Imposter Professor Oak': "The opponent's type synergies count 2 Pokémon fewer",
  /** After the battle: the draft's, nothing in the battle itself. */
  Bill: '+₱ after the battle, won or lost',
  'Professor Oak': "The next shop's rerolls are free",
} as const;
export type TrainerName = keyof typeof TRAINERS;
export const TRAINER_NAMES = Object.keys(TRAINERS) as TrainerName[];

/** What a keyword does, by when. `f` is the Pokémon that has it, `a` the keyword as it has it (its number, its type). */
export interface Hooks {
  /** Its words on a card. */
  text(a: Ability): string;
  /** A rule of the battle, named in battle.ts where it applies: no hook of its own. */
  rule?: true;
  /** Before anything else: moving the boards (Roar). */
  opening?(b: Battle, f: Fighter, a: Ability): void;
  /** Then: becoming another Pokémon, taking keywords (Transform, Sketch). */
  copies?(b: Battle, f: Fighter, a: Ability): void;
  /** Start of battle: its lasting changes, on the boards as they then stand. */
  ready?(b: Battle, f: Fighter, a: Ability): void;
  /** Start of battle, once every change is made: damage. */
  volley?(b: Battle, f: Fighter, a: Ability): void;
  /** The damage of any hit of its, its strike back too. */
  hitFor?(b: Battle, f: Fighter, a: Ability, target: Fighter, damage: number): number;
  /** What a hit on it does, after its reduction (not against Breaker). */
  reduces?(b: Battle, f: Fighter, a: Ability, damage: number): number;
  /** Its hit landed. `attacking`: its own attack, not its strike back. */
  hit?(b: Battle, f: Fighter, a: Ability, target: Fighter, dealt: number, attacking: boolean): void;
  /** A hit landed on it. */
  struck?(b: Battle, f: Fighter, a: Ability, by: Fighter, dealt: number): void;
  /** After its attack. */
  attacked?(b: Battle, f: Fighter, a: Ability, target: Fighter): void;
  /** It fainted, `at` its place in the line: `neighbours` those it had. */
  fainted?(b: Battle, f: Fighter, a: Ability, killer: Fighter | undefined, at: number, neighbours: Fighter[]): void;
  /** It Knocked Out a Pokémon. */
  knockedOut?(b: Battle, f: Fighter, a: Ability): void;
  /** An ally of its fainted. */
  allyFainted?(b: Battle, f: Fighter, a: Ability): void;
}

const up10 = (n: number) => Math.ceil(n / 10) * 10;
const typeName = (t: UnitType | undefined) => (t ? t[0]!.toUpperCase() + t.slice(1) : '');
const n = (a: Ability) => a.n ?? 0;
const rule = (text: string): Hooks => ({ text: () => text, rule: true });

export const KEYWORDS: Record<Keyword, Hooks> = {
  // Aim (battle.ts, target).
  Taunt: rule('Opposing Pokémon must attack it while it stands'),
  Bodyguard: rule('Attacks aimed at its neighbours hit it instead'),
  'Face-off': rule('It attacks the Pokémon across from it while one stands'),
  Sniper: rule('It attacks the opposing Pokémon with the least HP'),
  Flying: rule('Its attacks ignore Taunt and Bodyguard'),

  // Tempo (battle.ts, run, act and strike).
  Quick: rule("At the start of battle it makes an extra attack that isn't struck back"),
  Reach: rule("Its attacks aren't struck back"),
  'Double Strike': rule('It attacks twice'),
  Truant: rule("It rests after each attack: it misses its next attack and doesn't strike back until then"),

  // Damage.
  Splash: { text: (a) => `Its attacks also do ${n(a)} to the target's neighbours`, rule: true },
  Cleave: rule("Its attacks hit the target's neighbours too, for the same damage"),
  Trample: rule("Damage beyond a Knock Out carries on to one of the target's neighbours"),
  Finisher: { text: (a) => `+${n(a)} damage to a Pokémon that's already damaged`, hitFor: (_b, _f, a, target, damage) => (target.hp < target.maxHp ? damage + n(a) : damage) },
  Bane: { text: (a) => `+${n(a)} damage to ${typeName(a.type)} Pokémon`, hitFor: (_b, _f, a, target, damage) => (target.type === a.type ? damage + n(a) : damage) },
  Breaker: rule('Its hits ignore Shields and Armor'),
  Barrage: { text: (a) => `Start of battle: ${n(a)} damage to every opposing Pokémon`, volley: (b, f, a) => b.foes(f).forEach((g) => b.damage(g, n(a), f, 'Barrage')) },
  Recoil: { text: (a) => `It takes ${n(a)} after each of its attacks`, attacked: (b, f, a) => b.damage(f, n(a), undefined, 'Recoil') },

  // Growing.
  Enrage: { text: (a) => `+${n(a)} attack each time it's hit`, struck: (b, f, a) => b.buff(f, n(a), 'Enrage') },
  Rampage: { text: (a) => `+${n(a)} attack each time it Knocks Out a Pokémon`, knockedOut: (b, f, a) => b.buff(f, n(a), 'Rampage') },
  Grow: { text: (a) => `+${n(a)} attack after each of its attacks`, attacked: (b, f, a) => b.buff(f, n(a), 'Grow') },
  Scavenger: { text: (a) => `+${n(a)} attack each time an ally faints`, allyFainted: (b, f, a) => b.buff(f, n(a), 'Scavenger') },

  // Defence.
  Shield: rule('The first hit on it does nothing'),
  Armor: { text: (a) => `It takes ${n(a)} less from every hit`, reduces: (_b, _f, a, damage) => damage - n(a) },
  Thorns: { text: (a) => `A Pokémon that hits it takes ${n(a)}`, struck: (b, f, a, by) => b.damage(by, n(a), f, 'Thorns') },
  Sturdy: rule('The first time it would faint, it stays with 10 HP'),
  Evasive: rule('Each hit on it flips a coin: heads, it does nothing'),
  Regen: { text: (a) => `It heals ${n(a)} after each of its attacks`, attacked: (b, f, a) => b.heal(f, n(a), 'Regen') },
  Drain: { text: () => 'It heals half the damage its hits deal', hit: (b, f, _a, _target, dealt) => b.heal(f, up10(dealt / 2), 'Drain') },
  Counter: rule("It strikes back with its attacker's attack when that's higher"),

  // Neighbours.
  Rally: { text: (a) => `Start of battle: its neighbours get +${n(a)} attack`, ready: (b, f, a) => b.neighbours(f).forEach((g) => b.buff(g, n(a), 'Rally')) },
  Fortify: { text: (a) => `Start of battle: its neighbours get +${n(a)} HP`, ready: (b, f, a) => b.neighbours(f).forEach((g) => b.grow(g, n(a), 'Fortify')) },
  Screen: {
    text: () => 'Start of battle: the ally on its right gets a Shield',
    ready: (b, f) => {
      const right = b.beside(f, 1);
      if (right) b.shield(right, 'Screen');
    },
  },
  Pack: { text: (a) => `Start of battle: +${n(a)} attack for each neighbour of its type`, ready: (b, f, a) => b.buff(f, n(a) * b.neighbours(f).filter((g) => g.type === f.type).length, 'Pack') },
  Guardian: { text: (a) => `While it stands, its neighbours take ${n(a)} less from every hit`, rule: true },
  Safeguard: rule("It and its neighbours can't be Burned, Paralyzed or Confused"),
  Mend: { text: (a) => `After it attacks, its neighbours heal ${n(a)}`, attacked: (b, f, a) => b.neighbours(f).forEach((g) => b.heal(g, n(a), 'Mend')) },
  'Baton Pass': {
    text: (a) => `After it attacks, the ally on its right gets +${n(a)} attack`,
    attacked: (b, f, a) => {
      const right = b.beside(f, 1);
      if (right) b.buff(right, n(a), 'Baton Pass');
    },
  },
  Legacy: { text: (a) => `When it faints, its neighbours get +${n(a)} attack`, fainted: (b, _f, a, _killer, _at, neighbours) => neighbours.forEach((g) => b.buff(g, n(a), 'Legacy')) },

  // Place and type.
  Vanguard: { text: (a) => `Start of battle: +${n(a)} attack if it's your first Pokémon`, ready: (b, f, a) => !b.beside(f, -1) && b.buff(f, n(a), 'Vanguard') },
  Rearguard: { text: (a) => `Start of battle: +${n(a)} HP if it's your last Pokémon`, ready: (b, f, a) => !b.beside(f, 1) && b.grow(f, n(a), 'Rearguard') },
  Leader: { text: (a) => `Start of battle: your other Pokémon of its type get +${n(a)} attack`, ready: (b, f, a) => b.allies(f).forEach((g) => g.type === f.type && b.buff(g, n(a), 'Leader')) },
  Loner: {
    text: (a) => `Start of battle: +${n(a)} attack and +${n(a)} HP if no ally shares its type`,
    ready: (b, f, a) => {
      if (b.allies(f).some((g) => g.type === f.type)) return;
      b.buff(f, n(a), 'Loner');
      b.grow(f, n(a), 'Loner');
    },
  },

  // Across.
  Intimidate: {
    text: (a) => `Start of battle: the Pokémon across from it has −${n(a)} attack`,
    ready: (b, f, a) => {
      const x = b.across(f);
      if (x) b.buff(x, -n(a), 'Intimidate');
    },
  },
  Pounce: {
    text: (a) => `Start of battle: ${n(a)} damage to the Pokémon across from it`,
    volley: (b, f, a) => {
      const x = b.across(f);
      if (x) b.damage(x, n(a), f, 'Pounce');
    },
  },
  Glare: {
    text: () => 'Start of battle: the Pokémon across from it is Paralyzed',
    ready: (b, f) => {
      const x = b.across(f);
      if (x) b.afflict(x, 'paralyzed');
    },
  },
  Supersonic: {
    text: () => 'Start of battle: the Pokémon across from it is Confused',
    ready: (b, f) => {
      const x = b.across(f);
      if (x) b.afflict(x, 'confused');
    },
  },
  'Will-O-Wisp': {
    text: () => 'Start of battle: the Pokémon across from it is Burned',
    ready: (b, f) => {
      const x = b.across(f);
      if (x) b.burn(x);
    },
  },
  Transform: {
    text: () => 'Start of battle: it becomes a copy of the Pokémon across from it',
    copies: (b, f) => {
      const x = b.across(f);
      if (x) b.become(f, { attack: x.base, hp: x.maxHp, type: x.type, abilities: x.abilities.filter((y) => y.k !== 'Transform') }, 'Transform');
    },
  },

  // Moving.
  Roar: {
    text: () => 'Before anything else, the Pokémon across from it goes to the end of its line',
    opening: (b, f) => {
      const x = b.across(f);
      if (x) b.moveToEnd(x, 'Roar');
    },
  },
  Whirlwind: { text: () => 'Its target moves to the end of its line', attacked: (b, _f, _a, target) => b.moveToEnd(target, 'Whirlwind') },
  'U-turn': { text: () => 'After it attacks, it goes to the end of its line', attacked: (b, f) => b.moveToEnd(f, 'U-turn') },

  // Fainting.
  Explode: { text: (a) => `When it faints, ${n(a)} damage to every opposing Pokémon`, fainted: (b, f, a) => b.foes(f).forEach((g) => b.damage(g, n(a), f, 'Explode')) },
  'Destiny Bond': { text: () => 'When it faints, the Pokémon that Knocked it Out faints too', fainted: (b, f, _a, killer) => killer && b.fell(killer, f, 'Destiny Bond') },
  Family: {
    text: () => 'When it faints, a copy with half its attack and HP and no keywords takes its place',
    fainted: (b, f, _a, _killer, at) => b.join(f.side, { name: f.name, type: f.type, stage: f.stage, attack: up10(f.base / 2), hp: up10(f.maxHp / 2) }, at, 'Family'),
  },
  Memento: { text: (a) => `When it faints, the Pokémon that Knocked it Out has −${n(a)} attack`, fainted: (b, _f, a, killer) => killer && b.buff(killer, -n(a), 'Memento') },

  // Status.
  Paralyze: { text: () => 'Its hits flip a coin: heads, the target is Paralyzed', hit: (b, _f, _a, target) => b.flip() && b.afflict(target, 'paralyzed') },
  Confuse: { text: () => 'Its hits Confuse', hit: (b, _f, _a, target) => b.afflict(target, 'confused') },
  // A Pokémon is Burned as the hit lands (battle.ts, strike), so its strike back to that hit is halved: this is its strike back's.
  Burn: { text: () => 'Its hits Burn', hit: (b, _f, _a, target) => b.burn(target) },
  Static: { text: () => "A Pokémon that hits it flips a coin: heads, it's Paralyzed", struck: (b, _f, _a, by) => b.flip() && b.afflict(by, 'paralyzed') },
  'Flame Body': { text: () => 'A Pokémon that hits it is Burned', struck: (b, _f, _a, by) => b.burn(by) },
  'Cute Charm': { text: () => 'A Pokémon that hits it is Confused', struck: (b, _f, _a, by) => b.afflict(by, 'confused') },

  // Other.
  Weaken: { text: (a) => `Its attacks take ${n(a)} off their target's attack for the battle`, hit: (b, _f, a, target, _dealt, attacking) => attacking && b.buff(target, -n(a), 'Weaken') },
  Sketch: {
    text: () => 'Start of battle: it has the keywords of the ally on its left',
    copies: (b, f) => {
      const left = b.beside(f, -1);
      const taken = left?.abilities.filter((y) => y.k !== 'Sketch' && y.k !== 'Transform' && !f.abilities.some((mine) => mine.k === y.k)) ?? [];
      if (taken.length) b.become(f, { attack: f.base, hp: f.maxHp, type: f.type, abilities: [...f.abilities, ...taken] }, 'Sketch');
    },
  },
  'Pay Day': { text: () => '+₱ each time it Knocks Out a Pokémon', knockedOut: (b, f) => b.pay(f) },
};

/** A keyword's words as a card has it. */
export const abilityText = (a: Ability) => KEYWORDS[a.k].text(a);
