// Safari Draft (issue #239, section 5): a battle, a pure function of two boards and a seed. No player input: the server
// plays it and the browser plays the event log back.
//
// The rules the issue fixes: 6 Pokémon a side; a coin flip decides which side attacks first; the sides alternate, each
// side's Pokémon attacking left to right, each attack at a random opposing Pokémon (a random Taunt one while one stands,
// the user's, 2026-11-18); damage is simultaneous (attacker and
// target each deal their attack to the other); a side with no Pokémon left loses, both at once is a draw.
//
// The fine rules, the user's (2026-11-18, the issue's "Not specified yet"):
//   - Every battle ends: from round TUNING.risingFrom on, every hit does TUNING.rising more each round, past every
//     reduction and prevention. A round is over once both sides' order has come back round to its left end.
//   - Battlegrounds' pointer: a side's next attack is by the next living Pokémon to the right of its last attacker,
//     wrapping to the left end. One moved to the end of the line attacks when the pointer reaches it there.
//   - Special Conditions the TCG's way: Asleep, Confused and Paralyzed replace each other, Poisoned sits beside them.
//     Poison doesn't stack (the strongest amount stays) and ends after TUNING.poisonTicks ticks; Paralysis ends with the
//     one missed attack; Sleep on its heads; Confusion the first time its tails hurts the Pokémon.
//   - An Asleep or Paralyzed Pokémon doesn't strike back, and Blind's coin covers its target's next hit, attack or strike
//     back (the balance pass: a missed attack alone was worth nothing, damage being simultaneous).
//   - Quick's attacks before the normal order aren't struck back (the balance pass, the same reason).
//   - A strike back counts as a hit: it carries its Pokémon's on-hit effects (Poison, Paralyze, Sleep, Confuse, Drain,
//     Finisher…). Effects worded for its attack work only on its own attack (Flurry, Charge, Copycat, Splash, Whirlwind,
//     Blind, Weaken, Recoil's damage to itself).
//   - Order: the attacker's effects, then the target's, then faints (the attacker's side first, left to right), then the
//     attacker's side's Poison.
//
// The rest of the fine rules, first the implementer's, agreed by the user (2026-11-18; issue #239, section 5):
//   - a hit that is prevented (Guard) carries no effects; one reduced to 0 still does; damage that isn't a hit (Splash,
//     Blaze, Explode, Poison) is never reduced;
//   - a Confused Pokémon strikes back, with no coin;
//   - type synergies are counted on the boards as they stand before the battle and last it;
//   - Weaken takes its 10 off each time it attacks, Unburden once a Pokémon;
//   - a Pokémon Knocked Out by Poison or by its own Confusion has no Pokémon that did it (Destiny Bond, Pay Day);
//   - Gust of Wind's aim comes before Taunt (its words name the Pokémon it hits).
import { int, random, rngFrom, type Rng } from '@poke-tcg/campaign';
import type { EnergyType } from '@poke-tcg/game-engine';
import { KEYWORDS, SYNERGY_TYPES, TUNING, synergyLevel, type Hooks, type SynergyType, type TrainerName } from './effects.js';
import type { Keyword, Unit, UnitStage } from './units.js';

export type SideId = 0 | 1;
export const BOARD_SIZE = 6;
/** A backstop no battle should reach: rising damage ends them long before. */
const ROUND_CAP = 200;

/** One side of a battle: up to 6 units, left to right, and the Trainer it plays. An opponent is just a board. */
export interface Board {
  units: readonly Unit[];
  trainer?: TrainerName;
}

export type Condition = 'asleep' | 'paralyzed' | 'confused';

/** A Pokémon in a battle. */
export interface Fighter {
  /** Its side's letter and its number: 'a0'…'a5' as the board stood, later ones joined in the battle. */
  uid: string;
  side: SideId;
  /** The unit it came from (what a copy of it copies). */
  unit: Unit | undefined;
  name: string;
  type: EnergyType;
  stage: UnitStage;
  keyword: Keyword | undefined;
  /** Its attack before the battle's changes, and their sum. Read its attack with `attackOf`. */
  base: number;
  buff: number;
  maxHp: number;
  hp: number;
  condition: Condition | null;
  poison: number;
  poisonTicks: number;
  /** Its next attack flips a coin: tails, it does nothing (Blind). */
  blind: boolean;
  /** Attacks made. */
  attacks: number;
  /** The Pokémon whose damage it last took, if a Pokémon's. */
  hitBy: Fighter | undefined;
  /** Out of the battle. */
  gone: boolean;
  /** What happens to it once. */
  once: Record<string, true>;
}

interface Side {
  id: SideId;
  line: Fighter[];
  /** The place in the line of its next attacker. */
  next: number;
  /** Its order has come back to the left end this round. */
  wrapped: boolean;
  trainer: TrainerName | undefined;
  levels: Record<SynergyType, number>;
  /** Attacks left that Gust of Wind aims. */
  gust: number;
  once: Record<string, true>;
  joined: number;
  payDays: number;
}

export type BattleEvent =
  | { e: 'first'; side: SideId }
  | { e: 'synergy'; side: SideId; type: SynergyType; level: number }
  | { e: 'trainer'; side: SideId; trainer: TrainerName; flip?: boolean }
  | { e: 'join'; uid: string; side: SideId; at: number; name: string; attack: number; hp: number; why: string }
  | { e: 'buff'; uid: string; attack: number; why: string }
  | { e: 'grow'; uid: string; hp: number; why: string }
  | { e: 'round'; round: number; rising: number }
  | { e: 'attack'; uid: string; target: string }
  | { e: 'miss'; uid: string; why: string }
  | { e: 'blocked'; uid: string; why: string }
  | { e: 'damage'; uid: string; amount: number; hp: number; why: string }
  | { e: 'heal'; uid: string; amount: number; hp: number; why: string }
  | { e: 'status'; uid: string; status: Condition | 'poisoned' | 'blind' | 'awake' | 'cured' }
  | { e: 'move'; uid: string; why: string }
  | { e: 'faint'; uid: string }
  | { e: 'leave'; uid: string; why: string }
  | { e: 'pay'; uid: string }
  | { e: 'end'; winner: SideId | 'draw' };

export interface BattleResult {
  winner: SideId | 'draw';
  events: BattleEvent[];
  rounds: number;
  /** The side that attacked first. */
  first: SideId;
  /** Each side's Knock Outs by Pay Day Pokémon, for the draft's ₱. */
  payDays: [number, number];
  /** Each side's Pokémon left standing. */
  left: [number, number];
  /** Ended by the round cap, which should never happen. */
  capped: boolean;
}

export interface BattleOptions {
  /** False: no event log (the balance harness plays millions). */
  events?: boolean;
  /** Each side's type synergies switched off, for the balance harness's with-and-without comparisons. */
  mute?: [(readonly SynergyType[] | undefined)?, (readonly SynergyType[] | undefined)?];
}

const up10 = (n: number) => Math.ceil(n / 10) * 10;
const NONE: Hooks[] = [];

export class Battle {
  private readonly rng: Rng;
  private readonly sides: [Side, Side];
  private readonly events: BattleEvent[] | undefined;
  private round = 1;
  private capped = false;
  /** Sides owed an attack at once (Scoop Up). */
  private readonly extra: SideId[] = [];
  /** The attack being worked out is one Gust of Wind aimed. */
  private gusted = false;

  constructor(a: Board, b: Board, seed: number, private readonly options: BattleOptions = {}) {
    this.rng = rngFrom(seed);
    this.events = options.events === false ? undefined : [];
    this.sides = [this.side(0, a), this.side(1, b)];
  }

  private side(id: SideId, board: Board): Side {
    if (board.units.length > BOARD_SIZE) throw new Error(`A board holds ${BOARD_SIZE} Pokémon`);
    const side: Side = { id, line: [], next: 0, wrapped: false, trainer: board.trainer, levels: { grass: 0, fire: 0, water: 0, lightning: 0, psychic: 0, fighting: 0, colorless: 0 }, gust: 0, once: {}, joined: 0, payDays: 0 };
    side.line = board.units.map((unit) => this.fighter(side, unit));
    return side;
  }

  private fighter(side: Side, unit: Unit): Fighter {
    return { ...this.blank(side), unit, name: unit.name, type: unit.type, stage: unit.stage, keyword: unit.keyword, base: unit.attack, maxHp: unit.hp, hp: unit.hp };
  }

  private blank(side: Side): Fighter {
    return { uid: `${'ab'[side.id]}${side.joined++}`, side: side.id, unit: undefined, name: '', type: 'colorless', stage: 'basic', keyword: undefined, base: 0, buff: 0, maxHp: 0, hp: 0, condition: null, poison: 0, poisonTicks: 0, blind: false, attacks: 0, hitBy: undefined, gone: false, once: {} };
  }

  // What the effects read and do (effects.ts).

  /** A coin flip: true is heads. */
  flip(): boolean {
    return random(this.rng) < 0.5;
  }

  /** An integer in [0, n). */
  roll(n: number): number {
    return int(this.rng, n);
  }

  otherSide(side: SideId): SideId {
    return side === 0 ? 1 : 0;
  }

  /** The other living Pokémon of its side. */
  allies(f: Fighter): Fighter[] {
    return this.sides[f.side].line.filter((g) => g !== f && g.hp > 0);
  }

  /** The living opposing Pokémon. */
  foes(f: Fighter): Fighter[] {
    return this.sides[this.otherSide(f.side)].line.filter((g) => g.hp > 0);
  }

  /** A side's first Pokémon. */
  first(side: SideId): Fighter | undefined {
    return this.sides[side].line.find((g) => g.hp > 0);
  }

  private hooks(f: Fighter): Hooks[] {
    return f.keyword ? [KEYWORDS[f.keyword]] : NONE;
  }

  /** A Pokémon's attack now. */
  attackOf(f: Fighter): number {
    return Math.max(0, f.base + f.buff);
  }

  /** A lasting change to its attack. */
  buff(f: Fighter, attack: number, why: string) {
    if (f.gone || !attack) return;
    f.buff += attack;
    this.events?.push({ e: 'buff', uid: f.uid, attack, why });
  }

  /** More HP for the battle. */
  grow(f: Fighter, hp: number, why: string) {
    if (f.gone || !hp) return;
    f.maxHp += hp;
    f.hp += hp;
    this.events?.push({ e: 'grow', uid: f.uid, hp, why });
  }

  /** Damage that isn't worked out as a hit is: `by` the Pokémon that did it. Faints are settled by the caller's turn. */
  damage(f: Fighter, amount: number, by: Fighter | undefined, why: string) {
    if (f.gone || f.hp <= 0 || amount <= 0) return;
    f.hp -= amount;
    f.hitBy = by;
    this.events?.push({ e: 'damage', uid: f.uid, amount, hp: Math.max(0, f.hp), why });
    const side = this.sides[f.side];
    if (side.trainer === 'Potion' && !side.once.potion && f.hp > 0 && f.hp < f.maxHp / 2) {
      side.once.potion = true;
      this.heal(f, TUNING.potion, 'Potion');
    }
  }

  heal(f: Fighter, amount: number, why: string) {
    const healed = Math.min(amount, f.maxHp - f.hp);
    if (f.gone || f.hp <= 0 || healed <= 0) return;
    f.hp += healed;
    this.events?.push({ e: 'heal', uid: f.uid, amount: healed, hp: f.hp, why });
  }

  /** It faints, whatever its HP (Destiny Bond). */
  fell(f: Fighter, by: Fighter, why: string) {
    if (f.gone || f.hp <= 0) return;
    this.events?.push({ e: 'damage', uid: f.uid, amount: f.hp, hp: 0, why });
    f.hp = 0;
    f.hitBy = by;
  }

  private immune(f: Fighter, condition: Condition | 'poisoned') {
    if (f.gone || f.hp <= 0) return true;
    return this.sides[f.side].trainer === 'Full Heal' && (condition === 'poisoned' || condition === 'paralyzed');
  }

  /** Asleep, Confused or Paralyzed: the newest stays. */
  afflict(f: Fighter, condition: Condition, _by: Fighter) {
    if (this.immune(f, condition)) return;
    f.condition = condition;
    this.events?.push({ e: 'status', uid: f.uid, status: condition });
  }

  /** Poisoned: the strongest amount stays, and its ticks start again. */
  poison(f: Fighter, amount: number, _by: Fighter) {
    if (amount <= 0 || this.immune(f, 'poisoned')) return;
    f.poison = Math.max(f.poison, amount);
    f.poisonTicks = TUNING.poisonTicks;
    this.events?.push({ e: 'status', uid: f.uid, status: 'poisoned' });
  }

  /** Its next attack flips a coin (Blind). Not a Special Condition. */
  blind(f: Fighter) {
    if (f.gone || f.hp <= 0) return;
    f.blind = true;
    this.events?.push({ e: 'status', uid: f.uid, status: 'blind' });
  }

  private remove(f: Fighter): number {
    const side = this.sides[f.side];
    const at = side.line.indexOf(f);
    side.line.splice(at, 1);
    if (at < side.next) side.next--;
    return at;
  }

  private insert(f: Fighter, at: number) {
    const side = this.sides[f.side];
    side.line.splice(at, 0, f);
    if (at < side.next) side.next++;
  }

  /** To the end of its side's line. */
  moveToEnd(f: Fighter, why: string) {
    const line = this.sides[f.side].line;
    if (f.gone || f.hp <= 0 || line.at(-1) === f) return;
    this.remove(f);
    line.push(f);
    this.events?.push({ e: 'move', uid: f.uid, why });
  }

  /** A new Pokémon in a side's line (Family's copy): no keyword. */
  join(sideId: SideId, of: { name: string; type: EnergyType; stage: UnitStage; attack: number; hp: number }, at: number, why: string) {
    const side = this.sides[sideId];
    const f: Fighter = { ...this.blank(side), name: of.name, type: of.type, stage: of.stage, base: of.attack, maxHp: of.hp, hp: of.hp };
    this.insert(f, Math.min(at, side.line.length));
    this.events?.push({ e: 'join', uid: f.uid, side: sideId, at, name: f.name, attack: f.base, hp: f.hp, why });
  }

  /** A Knock Out by a Pay Day Pokémon. */
  pay(f: Fighter) {
    this.sides[f.side].payDays++;
    this.events?.push({ e: 'pay', uid: f.uid });
  }

  // The battle.

  run(): BattleResult {
    const first: SideId = this.flip() ? 0 : 1;
    const order = [first, this.otherSide(first)] as const;
    this.events?.push({ e: 'first', side: first });
    this.setUp(order);
    this.settle(first);

    // Quick: the leftmost Lightning Pokémon attack once before the normal order, with no strike back.
    for (const s of order) {
      const quick = this.sides[s].line.filter((f) => f.type === 'lightning').slice(0, TUNING.lightning[this.sides[s].levels.lightning - 1] ?? 0);
      for (const f of quick) {
        if (this.over()) break;
        this.act(f, TUNING.quickStruckBack);
        this.afterTurn(s);
        this.extras();
      }
    }

    let s = first;
    while (!this.over()) {
      const side = this.sides[s];
      const f = this.nextAttacker(side);
      if (f) this.act(f);
      this.afterTurn(s);
      this.extras();
      s = this.otherSide(s);
      if (this.sides[0].wrapped && this.sides[1].wrapped) {
        this.sides[0].wrapped = this.sides[1].wrapped = false;
        if (++this.round > ROUND_CAP) {
          this.capped = true;
          break;
        }
        this.events?.push({ e: 'round', round: this.round, rising: this.rising() });
      }
    }

    const left = this.sides.map((side) => side.line.filter((f) => f.hp > 0).length) as [number, number];
    const winner: SideId | 'draw' = this.capped || !!left[0] === !!left[1] ? 'draw' : left[0] ? 0 : 1;
    this.events?.push({ e: 'end', winner });
    return { winner, events: this.events ?? [], rounds: this.round, first, payDays: [this.sides[0].payDays, this.sides[1].payDays], left, capped: this.capped };
  }

  private over() {
    return this.sides.some((side) => !side.line.some((f) => f.hp > 0));
  }

  /** What every hit does more, from round TUNING.risingFrom on. */
  private rising() {
    return this.round >= TUNING.risingFrom ? TUNING.rising * (this.round - TUNING.risingFrom + 1) : 0;
  }

  /** Before the first attack: Trainers, synergies, lasting changes, then the start of battle's damage. */
  private setUp(order: readonly [SideId, SideId]) {
    const everyone = () => order.flatMap((s) => [...this.sides[s].line]);
    for (const s of order) if (this.sides[s].trainer) this.events?.push({ e: 'trainer', side: s, trainer: this.sides[s].trainer! });

    // Type synergies, counted on the boards as they stand: a unit counts for its printed type; Imposter Professor Oak
    // takes 2 off the opponent's counts.
    const types = order.map((s) => new Set<EnergyType>(this.sides[s].line.map((f) => f.type)));
    for (const s of order) {
      const side = this.sides[s];
      const fewer = this.sides[this.otherSide(s)].trainer === 'Imposter Professor Oak' ? TUNING.imposter : 0;
      for (const type of SYNERGY_TYPES) {
        if (this.options.mute?.[s]?.includes(type)) continue;
        const count = side.line.filter((f) => f.type === type).length;
        side.levels[type] = synergyLevel(count - fewer);
        if (side.levels[type]) this.events?.push({ e: 'synergy', side: s, type, level: side.levels[type] });
      }
    }

    for (const s of order) {
      const side = this.sides[s];
      if (side.trainer === 'Gust of Wind') side.gust = TUNING.gust;
      let attack = side.trainer === 'PlusPower' ? TUNING.plusPower : 0;
      if (side.trainer === 'Gambler') {
        const heads = this.flip();
        attack = heads ? TUNING.gamblerHeads : TUNING.gamblerTails;
        this.events?.push({ e: 'trainer', side: s, trainer: 'Gambler', flip: heads });
      }
      const brawn = TUNING.fighting[side.levels.fighting - 1] ?? 0;
      const versatile = (TUNING.colorless[side.levels.colorless - 1] ?? 0) * TUNING.versatile * (types[order.indexOf(s)]!.size - (TUNING.versatileOwn ? 0 : 1));
      for (const f of side.line) {
        if (attack) this.buff(f, attack, side.trainer!);
        if (brawn && f.type === 'fighting') this.buff(f, brawn, 'Brawn');
        if (versatile > 0 && f.type === 'colorless') {
          if (TUNING.versatileAttack) this.buff(f, versatile, 'Versatile');
          this.grow(f, versatile, 'Versatile');
        }
      }
    }
    for (const f of everyone()) for (const h of this.hooks(f)) h.ready?.(this, f);

    // The Energy Removals, once every attack stands.
    for (const s of order) {
      const count = this.sides[s].trainer === 'Energy Removal' ? 1 : this.sides[s].trainer === 'Super Energy Removal' ? 2 : 0;
      const foes = this.sides[this.otherSide(s)].line;
      for (const f of foes.map((g) => ({ g, attack: this.attackOf(g) })).sort((x, y) => y.attack - x.attack).slice(0, count)) this.buff(f.g, -TUNING.energyRemoval, this.sides[s].trainer!);
    }

    for (const s of order) {
      const mind = TUNING.psychic[this.sides[s].levels.psychic - 1] ?? 0;
      if (mind) for (const f of [...this.sides[this.otherSide(s)].line]) this.damage(f, mind, undefined, 'Mind');
    }
  }

  /** The side's next attacker: the next living Pokémon to the right of its last one, wrapping. */
  private nextAttacker(side: Side): Fighter | undefined {
    for (let tries = 0; tries <= side.line.length; tries++) {
      if (side.next >= side.line.length) {
        side.next = 0;
        side.wrapped = true;
      }
      const f = side.line[side.next++];
      if (f && f.hp > 0) return f;
    }
    return undefined;
  }

  /** Attacks owed at once (Scoop Up: "your next Pokémon attacks at once"). */
  private extras() {
    while (this.extra.length && !this.over()) {
      const s = this.extra.shift()!;
      const f = this.nextAttacker(this.sides[s]);
      if (f) this.act(f);
      this.afterTurn(s);
    }
  }

  /** One Pokémon's attack, with everything that can stop it. */
  private act(f: Fighter, struckBack = true) {
    if (f.gone || f.hp <= 0) return;
    const miss = (why: string) => this.events?.push({ e: 'miss', uid: f.uid, why });
    if (f.condition === 'asleep') {
      if (!this.flip()) return void miss('Asleep');
      f.condition = null;
      this.events?.push({ e: 'status', uid: f.uid, status: 'awake' });
    } else if (f.condition === 'paralyzed') {
      f.condition = null;
      return void miss('Paralyzed');
    }
    if (f.blind) {
      f.blind = false;
      if (!this.flip()) return void miss('Blind');
    }
    if (f.condition === 'confused' && !this.flip()) {
      miss('Confused');
      f.condition = null;
      this.damage(f, TUNING.confusion, undefined, 'Confused');
      this.settle(f.side);
      return;
    }
    const target = this.target(f);
    if (!target) return;
    f.attacks++;
    this.events?.push({ e: 'attack', uid: f.uid, target: target.uid });

    const hooks = this.hooks(f);
    const line = this.sides[target.side].line;
    const at = line.indexOf(target);
    const neighbours = [line[at - 1], line[at + 1]];
    const landed = this.strike(f, target, struckBack && (TUNING.gustStruckBack || !this.gusted) && !hooks.some((h) => h.unanswered?.(this, f, target)));
    if (landed) {
      const splash = hooks.reduce((sum, h) => sum + (h.splash?.(this, f) ?? 0), 0) + (f.type === 'fire' ? (TUNING.fire[this.sides[f.side].levels.fire - 1] ?? 0) : 0);
      if (splash) for (const g of neighbours) if (g) this.damage(g, splash, f, 'Splash');
    }
    if (f.hp > 0) for (const h of hooks) h.attacked?.(this, f, target);
    this.settle(f.side);
  }

  /** The attack's target: Gust of Wind's, then a random Taunt Pokémon while one stands, then a random one. */
  private target(f: Fighter): Fighter | undefined {
    const foes = this.foes(f);
    this.gusted = false;
    if (!foes.length) return undefined;
    const side = this.sides[f.side];
    // Gust of Wind: aimed at the opposing Pokémon with the most attack, and not struck back.
    if (side.gust > 0) {
      side.gust--;
      this.gusted = true;
      return foes.reduce((best, g) => (this.attackOf(g) > this.attackOf(best) ? g : best));
    }
    const taunting = foes.filter((g) => g.keyword === 'Taunt');
    const from = taunting.length ? taunting : foes;
    return from[this.roll(from.length)];
  }

  /** The exchange: the attacker's hit (two for Flurry) and the target's strike back, at once. Whether a hit landed. */
  private strike(f: Fighter, target: Fighter, struckBack: boolean): boolean {
    let back = !struckBack || (!TUNING.restingStrikesBack && (target.condition === 'asleep' || target.condition === 'paralyzed')) ? 0 : this.attackOf(target);
    if (back > 0 && target.blind && !TUNING.blindAttackOnly) {
      target.blind = false;
      if (!this.flip()) {
        this.events?.push({ e: 'miss', uid: target.uid, why: 'Blind' });
        back = 0;
      }
    }
    let damage = this.attackOf(f);
    const hooks = this.hooks(f);
    for (const h of hooks) if (h.attackWith) damage = h.attackWith(this, f, target, damage);
    const landed: number[] = [];
    const flurry = hooks.some((h) => h.flurry);
    for (let i = 0; i < (flurry ? 2 : 1); i++) {
      if (flurry && !(TUNING.flurrySure && i === 0) && !this.flip()) {
        this.events?.push({ e: 'miss', uid: f.uid, why: 'Flurry' });
        continue;
      }
      const dealt = this.hit(f, target, damage, 'attack');
      if (dealt >= 0) landed.push(dealt);
    }
    const dealtBack = back > 0 ? this.hit(target, f, back, 'strike back') : -1;
    for (const dealt of landed) this.landed(f, target, dealt, true);
    if (dealtBack >= 0) this.landed(target, f, dealtBack, false);
    return landed.length > 0;
  }

  /** One hit's damage, through what prevents and reduces it. −1: prevented. */
  private hit(by: Fighter, target: Fighter, base: number, why: string): number {
    let damage = base;
    for (const h of this.hooks(by)) if (h.hitFor) damage = h.hitFor(this, by, target, damage);
    const rising = this.rising();
    for (const h of this.hooks(target)) {
      if (!h.prevents?.(this, target, by, damage)) continue;
      this.events?.push({ e: 'blocked', uid: target.uid, why: target.keyword ?? '' });
      this.damage(target, rising, by, 'rising');
      return -1;
    }
    for (const h of this.hooks(target)) if (h.reduces) damage = h.reduces(this, target, by, damage);
    const side = this.sides[target.side];
    if (target.type === 'water') damage -= TUNING.water[side.levels.water - 1] ?? 0;
    if (side.trainer === 'Defender') damage -= TUNING.defender;
    damage = Math.max(0, damage);
    this.damage(target, damage + rising, by, why);
    return damage + rising;
  }

  /** A hit landed: the hitter's on-hit effects, then what being hit sets off. */
  private landed(by: Fighter, target: Fighter, dealt: number, attacking: boolean) {
    for (const h of this.hooks(by)) h.hit?.(this, by, target, dealt, attacking);
    const grass = by.type === 'grass' ? (TUNING.grass[this.sides[by.side].levels.grass - 1] ?? 0) : 0;
    if (grass) this.poison(target, grass, by);
    if (target.gone) return;
    for (const h of this.hooks(target)) h.struck?.(this, target, by, dealt);
    if (this.sides[target.side].trainer === 'Super Potion' && !target.once.superPotion && target.hp > 0) {
      target.once.superPotion = true;
      this.heal(target, TUNING.superPotion, 'Super Potion');
    }
  }

  /** After a side's turn, its attack made or missed: its Poisoned Pokémon take their Poison. */
  private afterTurn(s: SideId) {
    for (const f of [...this.sides[s].line]) {
      if (!f.poison || f.hp <= 0) continue;
      this.damage(f, f.poison, undefined, 'Poison');
      if (--f.poisonTicks <= 0) f.poison = 0;
    }
    this.settle(s);
  }

  /** Every Pokémon at 0 HP faints, `first`'s side first, left to right, until none is left to. */
  private settle(first: SideId) {
    for (let again = true; again; ) {
      again = false;
      for (const s of [first, this.otherSide(first)]) {
        for (const f of [...this.sides[s].line]) {
          if (f.gone || f.hp > 0) continue;
          again = true;
          this.faint(f);
        }
      }
    }
  }

  private faint(f: Fighter) {
    const side = this.sides[f.side];
    if (side.trainer === 'Scoop Up' && !side.once.scoopUp) {
      side.once.scoopUp = true;
      this.leave(f);
      this.events?.push({ e: 'leave', uid: f.uid, why: 'Scoop Up' });
      if (TUNING.scoopUpReturns) this.comeBack(f, side.line.length, 'Scoop Up', f.maxHp);
      this.extra.push(f.side);
      return;
    }
    const hooks = this.hooks(f);
    const killer = f.hitBy;
    const at = this.leave(f);
    this.events?.push({ e: 'faint', uid: f.uid });
    if (killer && !killer.gone) for (const h of this.hooks(killer)) h.knockedOut?.(this, killer);
    for (const h of hooks) h.fainted?.(this, f, killer && !killer.gone && killer.hp > 0 ? killer : undefined, at);

    // Coming back: Revive, where it stood, once, with half its HP.
    if (side.trainer === 'Revive' && !side.once.revive && f.unit) {
      side.once.revive = true;
      this.comeBack(f, at, 'Revive');
    }
    const living = side.line.filter((g) => g.hp > 0);
    if (side.trainer === 'Pokémon Center' && !side.once.center && living.length > 0 && living.length <= 3) {
      side.once.center = true;
      for (const g of living) this.heal(g, g.maxHp, 'Pokémon Center');
    }
  }

  /** Out of its line, for good or until it comes back. Its place. */
  private leave(f: Fighter): number {
    const at = this.remove(f);
    f.gone = true;
    return at;
  }

  private comeBack(f: Fighter, at: number, why: string, hp = up10(f.maxHp / 2)) {
    Object.assign(f, { gone: false, hp, condition: null, poison: 0, poisonTicks: 0, blind: false, hitBy: undefined });
    this.insert(f, Math.min(at, this.sides[f.side].line.length));
    this.events?.push({ e: 'join', uid: f.uid, side: f.side, at, name: f.name, attack: this.attackOf(f), hp: f.hp, why });
  }
}

/** A battle of two boards from a seed: the same boards and seed always give the same battle. */
export const simulateBattle = (a: Board, b: Board, seed: number, options?: BattleOptions): BattleResult => new Battle(a, b, seed, options).run();
