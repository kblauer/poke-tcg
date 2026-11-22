// Safari Draft (issue #239, section 5, with #254's redesign): a battle, a pure function of two boards and a seed. No
// player input: the server plays it and the browser plays the event log back.
//
// The rules #239 fixes: 6 Pokémon a side; a coin flip decides which side attacks first; the sides alternate, each side's
// Pokémon attacking left to right; damage is simultaneous (attacker and target each deal their attack to the other); a
// side with no Pokémon left loses, both at once is a draw.
//
// Places (#254): a Pokémon's "neighbours" are those beside it in its line, the Pokémon "across" from it the opposing one
// in the same place of its line, counted from the left. Lines close up as Pokémon faint, so both change through a battle;
// start-of-battle effects are worked out once, on the boards as the battle starts.
//
// The start of a battle, in order: the type synergies are counted on the boards as they stand; Roar; Transform and
// Sketch; the Trainers' and the synergies' lasting changes; the keywords' (ready); the Energy Removals; the
// start-of-battle damage (Pounce, Barrage); then the attacks before the normal order (Lightning's Quick, the keyword
// Quick), which aren't struck back.
//
// An attack's target: Gust of Wind's first; then a Taunt Pokémon while one stands (not for Flying); then the attacker's
// own aim (Sniper: the least HP; Face-off and Fighting's Duel: the Pokémon across from it), else a random one; then a
// Bodyguard beside the target takes it (not for Flying, nor Gust of Wind).
//
// The fine rules, the user's (2026-11-18, #239):
//   - Every battle ends: from round TUNING.risingFrom on, every hit does TUNING.rising more each round, past every
//     reduction and prevention. A round is over once both sides' order has come back round to its left end (or each has
//     had a turn for every Pokémon it has: Whirlwind and U-turn can keep an order from its end).
//   - Battlegrounds' pointer: a side's next attack is by the next living Pokémon to the right of its last attacker,
//     wrapping to the left end. One moved to the end of the line attacks when the pointer reaches it there.
//   - A strike back counts as a hit: it carries its Pokémon's on-hit effects. Effects worded for its attack work only on
//     its own attack (Double Strike, Splash, Cleave, Trample, Whirlwind, Weaken, Recoil).
//   - Order: the attacker's effects, then the target's, then faints (the attacker's side first, left to right).
//   - A hit that is prevented (Shield, Evasive) carries no effects; one reduced to 0 still does; damage that isn't a hit
//     (Splash, Cleave, Trample, Thorns, Explode, Barrage, Pounce, Recoil) is never reduced nor prevented.
//
// Special Conditions (the user's, 2026-11-21: these three only):
//   - Paralyzed: it misses its next attack and doesn't strike back until then;
//   - Confused: its attacks flip a coin, tails doing TUNING.confusion to itself instead, which ends it;
//   - Burned: its attack is halved (rounded up to 10), its strikes back too, until it has made its next attack. A Pokémon
//     is Burned as the hit lands, so its strike back to that very hit is halved (mine, to check with the user);
//   - Paralyzed and Confused replace each other, Burned sits beside them (the TCG's way).
import { int, random, rngFrom, type Rng } from '@poke-tcg/campaign';
import { KEYWORDS, SYNERGY_TYPES, TUNING, synergyLevel, type Hooks, type SynergyType, type TrainerName } from './effects.js';
import type { Ability, Keyword, Unit, UnitStage, UnitType } from './units.js';

export type SideId = 0 | 1;
export const BOARD_SIZE = 6;
/** A backstop no battle should reach: rising damage ends them long before. */
const ROUND_CAP = 200;

/** One side of a battle: up to 6 units, left to right, and the Trainer it plays. An opponent is just a board. */
export interface Board {
  units: readonly Unit[];
  trainer?: TrainerName;
}

export type Condition = 'paralyzed' | 'confused';

/** A Pokémon in a battle. */
export interface Fighter {
  /** Its side's letter and its number: 'a0'…'a5' as the board stood, later ones joined in the battle. */
  uid: string;
  side: SideId;
  /** The unit it came from. */
  unit: Unit | undefined;
  name: string;
  type: UnitType;
  stage: UnitStage;
  abilities: Ability[];
  /** Its attack before the battle's changes, and their sum. Read its attack with `attackOf`. */
  base: number;
  buff: number;
  maxHp: number;
  hp: number;
  condition: Condition | null;
  burned: boolean;
  /** The next hit on it does nothing (Shield, Screen). */
  shield: boolean;
  /** It misses its next attack and doesn't strike back until then (Truant). */
  resting: boolean;
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
  /** Its order has come back to the left end this round, or it has had a turn for each of its Pokémon (moves can keep the order from its end). */
  wrapped: boolean;
  /** Its turns this round. */
  turns: number;
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
  /** It became another Pokémon's copy, or took keywords (Transform, Sketch). */
  | { e: 'become'; uid: string; attack: number; hp: number; type: UnitType; abilities: Ability[]; why: string }
  | { e: 'round'; round: number; rising: number }
  | { e: 'attack'; uid: string; target: string }
  | { e: 'miss'; uid: string; why: string }
  | { e: 'blocked'; uid: string; why: string }
  | { e: 'shield'; uid: string; on: boolean }
  | { e: 'damage'; uid: string; amount: number; hp: number; why: string }
  | { e: 'heal'; uid: string; amount: number; hp: number; why: string }
  | { e: 'status'; uid: string; status: Condition | 'burned'; off?: true }
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
const has = (f: Fighter, k: Keyword) => f.abilities.some((a) => a.k === k);
const numberOf = (f: Fighter, k: Keyword) => f.abilities.find((a) => a.k === k)?.n ?? 0;

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
    const side: Side = { id, line: [], next: 0, wrapped: false, turns: 0, trainer: board.trainer, levels: { grass: 0, fire: 0, water: 0, lightning: 0, psychic: 0, fighting: 0, colorless: 0, darkness: 0, metal: 0 }, gust: 0, once: {}, joined: 0, payDays: 0 };
    side.line = board.units.map((unit) => this.fighter(side, unit));
    return side;
  }

  private fighter(side: Side, unit: Unit): Fighter {
    return { ...this.blank(side), unit, name: unit.name, type: unit.type, stage: unit.stage, abilities: unit.abilities, base: unit.attack, maxHp: unit.hp, hp: unit.hp, shield: unit.abilities.some((a) => a.k === 'Shield') };
  }

  private blank(side: Side): Fighter {
    return { uid: `${'ab'[side.id]}${side.joined++}`, side: side.id, unit: undefined, name: '', type: 'colorless', stage: 'basic', abilities: [], base: 0, buff: 0, maxHp: 0, hp: 0, condition: null, burned: false, shield: false, resting: false, attacks: 0, hitBy: undefined, gone: false, once: {} };
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

  /** The living Pokémon one place to its left (−1) or right (1). */
  beside(f: Fighter, step: -1 | 1): Fighter | undefined {
    const line = this.sides[f.side].line;
    const g = line[line.indexOf(f) + step];
    return g && g.hp > 0 && line.includes(f) ? g : undefined;
  }

  /** Its living neighbours, left then right. */
  neighbours(f: Fighter): Fighter[] {
    return [this.beside(f, -1), this.beside(f, 1)].filter((g): g is Fighter => !!g);
  }

  /** The living opposing Pokémon in the same place of its line. */
  across(f: Fighter): Fighter | undefined {
    const at = this.sides[f.side].line.indexOf(f);
    const g = at < 0 ? undefined : this.sides[this.otherSide(f.side)].line[at];
    return g && g.hp > 0 ? g : undefined;
  }

  private hooks(f: Fighter): [Hooks, Ability][] {
    return f.abilities.map((a) => [KEYWORDS[a.k], a]);
  }

  /** A Pokémon's attack now: halved while it's Burned. */
  attackOf(f: Fighter): number {
    const attack = Math.max(0, f.base + f.buff);
    return f.burned ? up10(attack / 2) : attack;
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

  /** Whether nothing can give it a Special Condition: Full Heal, or Safeguard (its own or a neighbour's). */
  private immune(f: Fighter) {
    if (f.gone || f.hp <= 0) return true;
    return this.sides[f.side].trainer === 'Full Heal' || has(f, 'Safeguard') || this.neighbours(f).some((g) => has(g, 'Safeguard'));
  }

  /** Paralyzed or Confused: the newest stays. */
  afflict(f: Fighter, condition: Condition) {
    if (this.immune(f) || f.condition === condition) return;
    f.condition = condition;
    this.events?.push({ e: 'status', uid: f.uid, status: condition });
  }

  /** Burned: beside the other two. */
  burn(f: Fighter) {
    if (this.immune(f) || f.burned) return;
    f.burned = true;
    this.events?.push({ e: 'status', uid: f.uid, status: 'burned' });
  }

  /** A Shield: the next hit on it does nothing. */
  shield(f: Fighter, _why: string) {
    if (f.gone || f.hp <= 0 || f.shield) return;
    f.shield = true;
    this.events?.push({ e: 'shield', uid: f.uid, on: true });
  }

  /** It takes another Pokémon's numbers, type and keywords (Transform), or more keywords (Sketch). Before the battle's changes. */
  become(f: Fighter, as: { attack: number; hp: number; type: UnitType; abilities: Ability[] }, why: string) {
    Object.assign(f, { base: as.attack, maxHp: as.hp, hp: as.hp, type: as.type, abilities: as.abilities, shield: f.shield || as.abilities.some((a) => a.k === 'Shield') });
    this.events?.push({ e: 'become', uid: f.uid, attack: as.attack, hp: as.hp, type: as.type, abilities: as.abilities, why });
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
  join(sideId: SideId, of: { name: string; type: UnitType; stage: UnitStage; attack: number; hp: number }, at: number, why: string) {
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

    // Before the normal order, with no strike back: the leftmost Lightning Pokémon (Quick, the synergy) and the Pokémon
    // with the keyword Quick, each once, left to right.
    for (const s of order) {
      const side = this.sides[s];
      const leftmost = side.line.filter((f) => f.type === 'lightning').slice(0, TUNING.lightning[side.levels.lightning - 1] ?? 0);
      for (const f of side.line.filter((g) => leftmost.includes(g) || has(g, 'Quick'))) {
        if (this.over()) break;
        this.act(f, false);
        this.extras();
      }
    }

    let s = first;
    while (!this.over()) {
      const side = this.sides[s];
      const f = this.nextAttacker(side);
      if (f) this.act(f);
      this.extras();
      if (++side.turns >= Math.max(1, side.line.length)) side.wrapped = true;
      s = this.otherSide(s);
      if (this.sides[0].wrapped && this.sides[1].wrapped) {
        this.sides[0].wrapped = this.sides[1].wrapped = false;
        this.sides[0].turns = this.sides[1].turns = 0;
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

  /** Before the first attack (the order in this file's header). */
  private setUp(order: readonly [SideId, SideId]) {
    const everyone = () => order.flatMap((s) => [...this.sides[s].line]);
    const each = (run: (h: Hooks, f: Fighter, a: Ability) => void) => {
      for (const f of everyone()) for (const [h, a] of this.hooks(f)) run(h, f, a);
    };
    for (const s of order) if (this.sides[s].trainer) this.events?.push({ e: 'trainer', side: s, trainer: this.sides[s].trainer! });

    // Type synergies, counted on the boards as they stand; Imposter Professor Oak takes 2 off the opponent's counts.
    const types = order.map((s) => new Set<UnitType>(this.sides[s].line.map((f) => f.type)));
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

    each((h, f, a) => h.opening?.(this, f, a));
    each((h, f, a) => h.copies?.(this, f, a));

    for (const s of order) {
      const side = this.sides[s];
      if (side.trainer === 'Gust of Wind') side.gust = TUNING.gust;
      let attack = side.trainer === 'PlusPower' ? TUNING.plusPower : 0;
      if (side.trainer === 'Gambler') {
        const heads = this.flip();
        attack = heads ? TUNING.gambler : 0;
        this.events?.push({ e: 'trainer', side: s, trainer: 'Gambler', flip: heads });
      }
      const versatile = (TUNING.colorless[side.levels.colorless - 1] ?? 0) * TUNING.versatile * (types[order.indexOf(s)]!.size - 1);
      const current = TUNING.water[side.levels.water - 1] ?? 0;
      const pressure = TUNING.psychic[side.levels.psychic - 1] ?? 0;
      for (const f of [...side.line]) {
        if (attack) this.buff(f, attack, side.trainer!);
        if (versatile > 0 && f.type === 'colorless') this.grow(f, versatile, 'Versatile');
        if (current && f.type === 'water') this.grow(f, current * this.neighbours(f).filter((g) => g.type === 'water').length, 'Current');
        const x = pressure && f.type === 'psychic' ? this.across(f) : undefined;
        if (x) this.buff(x, -pressure, 'Pressure');
      }
    }
    each((h, f, a) => h.ready?.(this, f, a));

    // The Energy Removals, once every attack stands.
    for (const s of order) {
      const count = this.sides[s].trainer === 'Energy Removal' ? 1 : this.sides[s].trainer === 'Super Energy Removal' ? 2 : 0;
      const foes = this.sides[this.otherSide(s)].line;
      for (const f of foes.map((g) => ({ g, attack: this.attackOf(g) })).sort((x, y) => y.attack - x.attack).slice(0, count)) this.buff(f.g, -TUNING.energyRemoval, this.sides[s].trainer!);
    }

    each((h, f, a) => h.volley?.(this, f, a));
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
    }
  }

  /** One Pokémon's attack, with everything that can stop it. */
  private act(f: Fighter, struckBack = true) {
    if (f.gone || f.hp <= 0) return;
    const miss = (why: string) => this.events?.push({ e: 'miss', uid: f.uid, why });
    if (f.resting) {
      f.resting = false;
      return void miss('Truant');
    }
    if (f.condition === 'paralyzed') {
      f.condition = null;
      this.events?.push({ e: 'status', uid: f.uid, status: 'paralyzed', off: true });
      return void miss('Paralyzed');
    }
    if (f.condition === 'confused' && !this.flip()) {
      miss('Confused');
      f.condition = null;
      this.events?.push({ e: 'status', uid: f.uid, status: 'confused', off: true });
      this.damage(f, TUNING.confusion, undefined, 'Confused');
      this.settle(f.side);
      return;
    }
    const target = this.target(f);
    if (!target) return;
    f.attacks++;
    // Burned until it has made its next attack: a burn it gets in this one lasts to the one after.
    const burned = f.burned;
    this.events?.push({ e: 'attack', uid: f.uid, target: target.uid });

    const neighbours = this.neighbours(target);
    const landed = this.strike(f, target, struckBack && !this.gusted && !has(f, 'Reach'));
    if (landed) {
      const splash = has(f, 'Cleave') ? this.attackOf(f) : numberOf(f, 'Splash');
      if (splash) for (const g of neighbours) this.damage(g, splash, f, has(f, 'Cleave') ? 'Cleave' : 'Splash');
      // Trample: what the hit did beyond the Knock Out, to one of the target's neighbours still standing.
      const over = has(f, 'Trample') && target.hp < 0 ? -target.hp : 0;
      const standing = neighbours.filter((g) => g.hp > 0);
      if (over && standing.length) this.damage(standing[this.roll(standing.length)]!, over, f, 'Trample');
    }
    if (f.hp > 0) for (const [h, a] of this.hooks(f)) h.attacked?.(this, f, a, target);
    if (burned && f.burned) {
      f.burned = false;
      this.events?.push({ e: 'status', uid: f.uid, status: 'burned', off: true });
    }
    if (has(f, 'Truant')) f.resting = true;
    this.settle(f.side);
  }

  /** Whether Fighting's Duel aims `f` at the Pokémon across from it. */
  private duels(f: Fighter) {
    return f.type === 'fighting' && this.sides[f.side].levels.fighting > 0;
  }

  /** The attack's target (the order in this file's header). */
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
    const flying = has(f, 'Flying');
    const taunting = flying ? [] : foes.filter((g) => has(g, 'Taunt'));
    const from = taunting.length ? taunting : foes;
    const across = this.across(f);
    const aimed = has(f, 'Sniper') ? from.reduce((best, g) => (g.hp < best.hp ? g : best)) : across && from.includes(across) && (has(f, 'Face-off') || this.duels(f)) ? across : from[this.roll(from.length)]!;
    const guard = flying || has(aimed, 'Bodyguard') ? undefined : this.neighbours(aimed).find((g) => has(g, 'Bodyguard'));
    return guard ?? aimed;
  }

  /** Whether `f`'s hits Burn: the keyword, or Fire's Blaze. */
  private burns(f: Fighter) {
    return has(f, 'Burn') || (f.type === 'fire' && this.sides[f.side].levels.fire > 0);
  }

  /** The exchange: the attacker's hit (two for Double Strike) and the target's strike back, at once. Whether a hit landed. */
  private strike(f: Fighter, target: Fighter, struckBack: boolean): boolean {
    const answers = struckBack && target.condition !== 'paralyzed' && !target.resting;
    const landed: number[] = [];
    for (let i = 0; i < (has(f, 'Double Strike') ? 2 : 1); i++) {
      const dealt = this.hit(f, target, this.attackOf(f), 'attack');
      if (dealt < 0) continue;
      landed.push(dealt);
      // Burned as the hit lands: its strike back to this hit is halved (and Double Strike's second hit finds it Burned).
      if (this.burns(f)) this.burn(target);
    }
    const back = !answers ? 0 : has(target, 'Counter') ? Math.max(this.attackOf(target), this.attackOf(f)) : this.attackOf(target);
    const dealtBack = back > 0 ? this.hit(target, f, back, 'strike back') : -1;
    for (const dealt of landed) this.landed(f, target, dealt, true);
    if (dealtBack >= 0) this.landed(target, f, dealtBack, false);
    return landed.length > 0;
  }

  /** One hit's damage, through what prevents and reduces it. −1: prevented. */
  private hit(by: Fighter, target: Fighter, base: number, why: string): number {
    let damage = base;
    for (const [h, a] of this.hooks(by)) if (h.hitFor) damage = h.hitFor(this, by, a, target, damage);
    const mine = this.sides[by.side];
    if (this.duels(by) && this.across(by) === target) damage += TUNING.fighting[mine.levels.fighting - 1]!;
    if (by.type === 'darkness' && mine.levels.darkness && (target.hp < target.maxHp || target.condition || target.burned)) damage += TUNING.darkness[mine.levels.darkness - 1]!;
    if (target.burned) damage += TUNING.fire[mine.levels.fire - 1] ?? 0;
    const rising = this.rising();
    const breaker = has(by, 'Breaker');
    const blocked = (blocks: string) => {
      this.events?.push({ e: 'blocked', uid: target.uid, why: blocks });
      this.damage(target, rising, by, 'rising');
      return -1;
    };
    if (target.shield && !breaker) {
      target.shield = false;
      this.events?.push({ e: 'shield', uid: target.uid, on: false });
      return blocked('Shield');
    }
    if (has(target, 'Evasive') && this.flip()) return blocked('Evasive');
    if (!breaker) for (const [h, a] of this.hooks(target)) if (h.reduces) damage = h.reduces(this, target, a, damage);
    const side = this.sides[target.side];
    const beside = this.neighbours(target);
    for (const g of beside) damage -= numberOf(g, 'Guardian');
    if (side.levels.metal && beside.some((g) => g.type === 'metal')) damage -= TUNING.metal[side.levels.metal - 1]!;
    if (side.trainer === 'Defender') damage -= TUNING.defender;
    damage = Math.max(0, damage);
    this.damage(target, damage + rising, by, why);
    return damage + rising;
  }

  /** A hit landed: the hitter's on-hit effects, then what being hit sets off. */
  private landed(by: Fighter, target: Fighter, dealt: number, attacking: boolean) {
    for (const [h, a] of this.hooks(by)) h.hit?.(this, by, a, target, dealt, attacking);
    const leech = by.type === 'grass' ? (TUNING.grass[this.sides[by.side].levels.grass - 1] ?? 0) : 0;
    if (leech) this.heal(by, leech, 'Leech');
    if (target.gone) return;
    for (const [h, a] of this.hooks(target)) h.struck?.(this, target, a, by, dealt);
    if (this.sides[target.side].trainer === 'Super Potion' && !target.once.superPotion && target.hp > 0) {
      target.once.superPotion = true;
      this.heal(target, TUNING.superPotion, 'Super Potion');
    }
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
    if (has(f, 'Sturdy') && !f.once.sturdy) {
      f.once.sturdy = true;
      f.hp = 10;
      this.events?.push({ e: 'heal', uid: f.uid, amount: 10, hp: 10, why: 'Sturdy' });
      return;
    }
    if (side.trainer === 'Scoop Up' && !side.once.scoopUp) {
      side.once.scoopUp = true;
      this.leave(f);
      this.events?.push({ e: 'leave', uid: f.uid, why: 'Scoop Up' });
      this.comeBack(f, side.line.length, 'Scoop Up', f.maxHp);
      this.extra.push(f.side);
      return;
    }
    const hooks = this.hooks(f);
    const killer = f.hitBy;
    const neighbours = this.neighbours(f);
    const at = this.leave(f);
    this.events?.push({ e: 'faint', uid: f.uid });
    if (killer && !killer.gone) for (const [h, a] of this.hooks(killer)) h.knockedOut?.(this, killer, a);
    for (const [h, a] of hooks) h.fainted?.(this, f, a, killer && !killer.gone && killer.hp > 0 ? killer : undefined, at, neighbours);
    for (const g of side.line) if (g.hp > 0) for (const [h, a] of this.hooks(g)) h.allyFainted?.(this, g, a);

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
    Object.assign(f, { gone: false, hp, condition: null, burned: false, resting: false, hitBy: undefined });
    this.insert(f, Math.min(at, this.sides[f.side].line.length));
    this.events?.push({ e: 'join', uid: f.uid, side: f.side, at, name: f.name, attack: this.attackOf(f), hp: f.hp, why });
  }
}

/** A battle of two boards from a seed: the same boards and seed always give the same battle. */
export const simulateBattle = (a: Board, b: Board, seed: number, options?: BattleOptions): BattleResult => new Battle(a, b, seed, options).run();
