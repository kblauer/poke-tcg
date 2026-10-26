// The Idle Adventure's battles (README: Idle Adventure): real Gen 3 single battles (FireRed's rules: pokefirered's
// battle_main.c, battle_script_commands.c, pokemon.c's CalculateBaseDamage, battle_util.c), played by themselves one
// turn a tick. Each tick both Pokémon act, the faster first (items before moves, then priority, then Speed, ties
// random), then the end-of-turn effects. Moves are picked by the cooldown rule (mon.ts; ai.ts) instead of PP. The whole
// battle is resolved at once from the seeded RNG and returned as an event log the browser plays back.
// Simplifications, agreed or forced by the mode: no switching but a fainted Pokémon's replacement (the next in party
// order) and Roar/Whirlwind; a wild Pokémon never runs; the party is healed after every battle by the run, not here.
import { int, type Rng } from '@poke-tcg/campaign';
import { attemptCatch } from './catch.js';
import { effectiveness, isPhysical, itemData, moveData, species } from './data.js';
import { abilityOf, autoSlots, basicFor, cooldownTicks, lastFourMoves, movePower, movesAt } from './mon.js';
import { EFFECTS, fixedDamageEffect, type MoveCtx } from './moves.js';
import { addEvs, calcStats, levelForExp } from './stats.js';
import { chooseFoeItem, choosePlayerAction, type Action } from './ai.js';
import type { Mon, MoveData, TypeName } from './types.js';

export type Side = 0 | 1;
export type StatusKind = 'sleep' | 'poison' | 'toxic' | 'burn' | 'paralysis' | 'freeze';
export type Weather = 'rain' | 'sun' | 'sandstorm' | 'hail';
/** The battle stats with stages, in the game's order after HP: Attack, Defense, Speed, Sp. Atk, Sp. Def, accuracy, evasion. */
export type BattleStat = 'atk' | 'def' | 'spe' | 'spa' | 'spd' | 'acc' | 'eva';
export const BATTLE_STATS: BattleStat[] = ['atk', 'def', 'spe', 'spa', 'spd', 'acc', 'eva'];
const STAT_LABEL: Record<BattleStat, string> = { atk: 'Attack', def: 'Defense', spe: 'Speed', spa: 'Sp. Atk', spd: 'Sp. Def', acc: 'accuracy', eva: 'evasiveness' };

/** The battle terrain under the player (GetBattleTerrain), for the background, Camouflage, Secret Power and Nature Power. */
export type Terrain = 'grass' | 'longgrass' | 'sand' | 'water' | 'pond' | 'mountain' | 'cave' | 'building' | 'plain';

/** What the browser shows of a Pokémon in battle. */
export interface BattlerView {
  uid: string;
  species: number;
  level: number;
  hp: number;
  maxHp: number;
  status: StatusKind | null;
  gender: Mon['gender'];
  /** Its slot moves and basic move (a Transformed Pokémon's are its target's), and the ticks each slot move still cools down (cooldownTicks; none: ready). */
  slots: string[];
  basic: string;
  cooldowns: Record<string, number>;
  /** Its party index on its side. */
  index: number;
  shiny?: boolean;
}

/** One thing that happened in a battle, in order. `msg` is the game's line for it, when it has one. */
export type BattleEvent =
  | { t: 'tick'; n: number }
  | { t: 'text'; msg: string }
  | { t: 'move'; side: Side; move: string; msg: string }
  | { t: 'hp'; side: Side; hp: number; maxHp: number; delta: number; crit?: true; eff?: number; msg?: string }
  | { t: 'status'; side: Side; status: StatusKind | null; msg?: string }
  | { t: 'stat'; side: Side; stat: BattleStat; change: number; msg: string }
  | { t: 'faint'; side: Side; msg: string }
  | { t: 'send'; side: Side; mon: BattlerView; msg: string }
  /** A side's active Pokémon's cooldowns (a move used, a tick gone by, Spite): ticks left per move, the ready ones left out. */
  | { t: 'cooldown'; side: Side; cooldowns: Record<string, number> }
  | { t: 'item'; side: Side; item: string; msg: string }
  | { t: 'ball'; item: string; shakes: number; caught: boolean; msg: string }
  | { t: 'exp'; uid: string; gained: number; exp: number; msg: string }
  | { t: 'level'; uid: string; level: number; hp: number; maxHp: number; msg: string }
  | { t: 'learn'; uid: string; move: string; msg: string }
  | { t: 'weather'; weather: Weather | null; msg?: string }
  | { t: 'end'; result: BattleResult };

export type BattleResult = 'won' | 'lost' | 'caught' | 'fled';

export interface BattleSettings {
  /** Use healing and status items from the bag on the active Pokémon (ai.ts). */
  autoHeal: boolean;
  /** Try to catch this wild Pokémon (the run decides from the auto-catch setting, the dex and the party). */
  tryCatch: boolean;
  /** When auto-heal uses Revives (idle.ts's RevivePolicy; none, never). */
  revives?: ('last' | 'any' | 'boss' | 'lead')[];
}

export interface BattleSetup {
  kind: 'wild' | 'trainer';
  /** The player's party, in order (each at full HP). */
  party: Mon[];
  foes: Mon[];
  /** The trainer's bag items (Potions, Full Restores…), used up as they go. */
  foeItems?: string[];
  /** The player's bag: item → count. */
  bag: Record<string, number>;
  settings: BattleSettings;
  /** Badges won: Boulder (1st) raises Attack, Soul (5th) Defense, Volcano (7th) Sp. Atk and Sp. Def by 10% (FireRed's badge boosts). */
  badges: number;
  /** A Gym Leader's, an Elite Four member's or the Champion's battle (the Revive policy's 'boss'). */
  boss?: boolean;
  terrain: Terrain;
  /** The battle ends after this many ticks: a wild Pokémon wanders off, a trainer battle is lost (no endless stalls). */
  maxTicks?: number;
}


export interface BattleOutcome {
  result: BattleResult;
  events: BattleEvent[];
  ticks: number;
  /** The party afterwards: experience, levels, EVs, moves (no evolutions yet: the run evolves after the battle, as the game). */
  party: Mon[];
  /** The party's indexes that took part (sent out at some point). */
  participated: string[];
  bag: Record<string, number>;
  caught: Mon | null;
  /** Pay Day's coins, picked up after a win. */
  payDay: number;
}

/** Stat stage ratios (gStatStageRatios), by stage + 6. */
const STAGE_RATIOS: [number, number][] = [[10, 40], [10, 35], [10, 30], [10, 25], [10, 20], [10, 15], [10, 10], [15, 10], [20, 10], [25, 10], [30, 10], [35, 10], [40, 10]];
/** Accuracy stage ratios (sAccuracyStageRatios), by stage + 6. */
const ACCURACY_RATIOS: [number, number][] = [[33, 100], [36, 100], [43, 100], [50, 100], [60, 100], [75, 100], [1, 1], [133, 100], [166, 100], [2, 1], [233, 100], [133, 50], [3, 1]];
/** Critical hit odds by stage (sCriticalHitChance): 1 in 16, 8, 4, 3, 2. */
const CRIT_CHANCE = [16, 8, 4, 3, 2];

/** The types each hold-item type booster raises (sHoldEffectToType), by hold effect. */
const TYPE_BOOSTERS: Record<string, TypeName> = {
  bug_power: 'bug', steel_power: 'steel', ground_power: 'ground', rock_power: 'rock', grass_power: 'grass', dark_power: 'dark',
  fighting_power: 'fighting', electric_power: 'electric', water_power: 'water', flying_power: 'flying', poison_power: 'poison',
  ice_power: 'ice', ghost_power: 'ghost', psychic_power: 'psychic', fire_power: 'fire', dragon_power: 'dragon', normal_power: 'normal',
};

/** Sound-based moves (battle_util.c's sSoundMovesTable), stopped by Soundproof. */
export const SOUND_MOVES = new Set(['growl', 'roar', 'sing', 'supersonic', 'screech', 'snore', 'uproar', 'metal-sound', 'grass-whistle', 'hyper-voice', 'perish-song', 'heal-bell']);

export interface Volatiles {
  confused?: number;
  flinch?: boolean;
  seededBy?: Side;
  substitute?: number;
  trapped?: { turns: number; move: string };
  /** Can't escape (Mean Look, Block): nothing to escape from in these battles, kept for Baton Pass's sake. */
  meanLook?: boolean;
  attractedTo?: Side;
  focusEnergy?: boolean;
  /** A two-turn move's first turn done (Solar Beam, Fly…): the move comes next turn. */
  charging?: string;
  semiInvulnerable?: 'air' | 'underground' | 'underwater';
  recharging?: boolean;
  /** Thrash, Outrage, Petal Dance: the move and turns left, then confusion. */
  rampage?: { move: string; turns: number };
  rollout?: { turns: number };
  uproar?: number;
  bide?: { turns: number; damage: number };
  furyCutter?: number;
  rage?: boolean;
  disabled?: { move: string; turns: number };
  encore?: { move: string; turns: number };
  taunt?: number;
  torment?: boolean;
  protect?: boolean;
  protectStreak?: number;
  endure?: boolean;
  destinyBond?: boolean;
  grudge?: boolean;
  minimized?: boolean;
  defenseCurl?: boolean;
  cursed?: boolean;
  nightmare?: boolean;
  foresight?: boolean;
  lockOn?: number;
  perish?: number;
  yawn?: number;
  ingrain?: boolean;
  charged?: number;
  stockpile?: number;
  transformed?: boolean;
  imprison?: boolean;
  helpingHand?: boolean;
  magicCoat?: boolean;
  snatch?: boolean;
  flashFire?: boolean;
  /** Damage taken this turn from a physical and a special move (Counter, Mirror Coat), and by whom. */
  physicalHit?: number;
  specialHit?: number;
  /** Took damage this turn (Revenge, Focus Punch, Rage). */
  hitThisTurn?: boolean;
  /** Its first turn out (Fake Out). */
  firstTurn?: boolean;
  /** Mimic's copy, in place of Mimic for the battle. */
  mimicked?: { from: string; to: string };
}

/** A Pokémon in battle. */
export class Battler {
  side: Side;
  index: number;
  mon: Mon;
  species: number;
  types: TypeName[];
  ability: string;
  hp: number;
  maxHp: number;
  /** Attack, Defense, Speed, Sp. Atk, Sp. Def (battle order). */
  stats: { atk: number; def: number; spe: number; spa: number; spd: number };
  stages: Record<BattleStat, number> = { atk: 0, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 };
  status: StatusKind | null = null;
  sleepTurns = 0;
  toxicCount = 0;
  v: Volatiles = {};
  /** The ticks each slot move still cools down (the cooldown rule, chooseMove); none: ready. Every move starts ready. */
  cooldowns: Record<string, number> = {};
  /** The moves its slots hold and its basic move (a Transformed Pokémon's are its target's). */
  slots: string[];
  basic: string;
  item: string | null;
  /** Its held item was used up (Recycle brings it back). */
  usedItem: string | null = null;
  lastMove: string | null = null;
  /** The last move that hit it, and by whom (Mirror Move, Conversion 2). */
  lastHitBy: { move: string; type: TypeName } | null = null;
  fainted = false;

  constructor(side: Side, index: number, mon: Mon, badges: number) {
    this.side = side;
    this.index = index;
    this.mon = mon;
    this.species = mon.species;
    this.types = [...species(mon.species).types];
    this.ability = abilityOf(mon);
    const s = calcStats(mon.species, mon.level, mon.ivs, mon.evs, mon.nature);
    this.hp = this.maxHp = s[0];
    this.stats = { atk: s[1], def: s[2], spa: s[3], spd: s[4], spe: s[5] };
    this.slots = [...mon.slots];
    this.basic = basicFor(mon);
    this.item = mon.item ?? null;
    void badges;
  }

  get level() {
    return this.mon.level;
  }

  view(): BattlerView {
    return { uid: this.mon.uid, species: this.species, level: this.level, hp: this.hp, maxHp: this.maxHp, status: this.status, gender: this.mon.gender, slots: [...this.slots], basic: this.basic, cooldowns: { ...this.cooldowns }, index: this.index, ...(this.mon.shiny && { shiny: true }) };
  }
}

/** A side's lasting effects (Reflect, Light Screen, Mist, Safeguard, Spikes; Future Sight and Wish aimed at it). */
export interface SideState {
  reflect: number;
  lightScreen: number;
  mist: number;
  safeguard: number;
  spikes: number;
  futureSight?: { turns: number; damage: number; from: string };
  wish?: { turns: number; hp: number };
  mudSport?: boolean;
  waterSport?: boolean;
}

const newSide = (): SideState => ({ reflect: 0, lightScreen: 0, mist: 0, safeguard: 0, spikes: 0 });

/** The name a Pokémon goes by in the battle's lines: "Charmander", "the wild Pidgey", "the foe's Onix". */
export class Battle {
  rng: Rng;
  setup: BattleSetup;
  events: BattleEvent[] = [];
  party: Battler[];
  foes: Battler[];
  active: [Battler, Battler];
  sides: [SideState, SideState] = [newSide(), newSide()];
  weather: { kind: Weather; turns: number } | null = null;
  bag: Record<string, number>;
  foeItems: string[];
  tick = 0;
  result: BattleResult | null = null;
  caught: Mon | null = null;
  payDay = 0;
  /** The order this turn's actors move in, and whether each has moved yet (Pursuit, Revenge, Focus Punch read it). */
  movedThisTurn = new Set<Side>();
  /** For each foe, the player's Pokémon that faced it (they share its experience). */
  facedBy = new Map<number, Set<number>>();
  participated = new Set<number>();
  /** The move used last in the battle (Mirror Move's fallback is none). */
  lastMoveUsed: string | null = null;

  constructor(setup: BattleSetup, rng: Rng) {
    this.rng = rng;
    this.setup = setup;
    this.bag = { ...setup.bag };
    this.foeItems = [...(setup.foeItems ?? [])];
    this.party = setup.party.map((m, i) => new Battler(0, i, structuredClone(m), setup.badges));
    this.foes = setup.foes.map((m, i) => new Battler(1, i, structuredClone(m), 0));
    this.active = [this.party[0]!, this.foes[0]!];
  }

  // ---- Output ----
  emit(e: BattleEvent) {
    this.events.push(e);
  }
  text(msg: string) {
    this.emit({ t: 'text', msg });
  }
  /** A Pokémon's name in a line: the player's by its species, the opponent's "the wild X" or "the foe's X" (FireRed: "Wild X", "Foe X"). */
  name(b: Battler) {
    const n = species(b.species).name;
    if (b.side === 0) return n;
    return this.setup.kind === 'wild' ? `the wild ${n}` : `the foe's ${n}`;
  }
  /** As `name`, capitalised to start a line. */
  Name(b: Battler) {
    const n = this.name(b);
    return n[0]!.toUpperCase() + n.slice(1);
  }
  foeOf(b: Battler) {
    return this.active[b.side === 0 ? 1 : 0];
  }

  // ---- RNG (the game's Random() is 16-bit) ----
  random16() {
    return int(this.rng, 65536);
  }
  roll(n: number) {
    return int(this.rng, n);
  }
  percent(p: number) {
    return this.roll(100) < p;
  }

  // ---- Stats ----
  /** A stat with its stage applied (APPLY_STAT_MOD). */
  staged(b: Battler, stat: 'atk' | 'def' | 'spe' | 'spa' | 'spd', stage = b.stages[stat]) {
    const [num, den] = STAGE_RATIOS[stage + 6]!;
    return Math.floor((b.stats[stat] * num) / den);
  }

  weatherOn() {
    return !!this.weather && !this.active.some((b) => !b.fainted && (b.ability === 'cloud-nine' || b.ability === 'air-lock'));
  }
  isWeather(kind: Weather) {
    return this.weatherOn() && this.weather!.kind === kind;
  }

  /** A battler's Speed for turn order (GetWhoStrikesFirst): its stage, Swift Swim and Chlorophyll in their weather, a quarter when paralyzed. */
  speed(b: Battler) {
    let s = this.staged(b, 'spe');
    if ((b.ability === 'swift-swim' && this.isWeather('rain')) || (b.ability === 'chlorophyll' && this.isWeather('sun'))) s *= 2;
    if (b.status === 'paralysis') s = Math.floor(s / 4);
    if (b.item && itemData(b.item).hold === 'macho_brace') s = Math.floor(s / 2);
    return s;
  }

  holdEffect(b: Battler) {
    return b.item ? itemData(b.item).hold : 'none';
  }

  // ---- HP ----
  /** Lowers HP (never below 0), with its line; faints are checked after the action (checkFaints). */
  damage(b: Battler, amount: number, extra: { crit?: boolean; eff?: number; msg?: string } = {}) {
    const dealt = Math.min(b.hp, Math.max(0, amount));
    b.hp -= dealt;
    this.emit({ t: 'hp', side: b.side, hp: b.hp, maxHp: b.maxHp, delta: -dealt, ...(extra.crit && { crit: true as const }), ...(extra.eff !== undefined && extra.eff !== 1 && { eff: extra.eff }), ...(extra.msg && { msg: extra.msg }) });
    return dealt;
  }
  heal(b: Battler, amount: number, msg?: string) {
    const healed = Math.min(b.maxHp - b.hp, Math.max(0, amount));
    if (healed <= 0 && !msg) return 0;
    b.hp += healed;
    this.emit({ t: 'hp', side: b.side, hp: b.hp, maxHp: b.maxHp, delta: healed, ...(msg && { msg }) });
    return healed;
  }

  // ---- Stat stages ----
  /**
   * Changes a stat stage by `change` (ChangeStatBuffs): fails at +6/−6; a drop by the other side is stopped by Mist,
   * Clear Body, Hyper Cutter (Attack), Keen Eye (accuracy) and a Substitute (`bySelf` false). Returns whether it changed.
   */
  changeStat(b: Battler, stat: BattleStat, change: number, bySelf: boolean, quiet = false): boolean {
    if (change < 0 && !bySelf) {
      if (this.sides[b.side].mist) return quiet || void this.text(`${this.Name(b)} is protected by Mist!`), false;
      if (b.ability === 'clear-body' || (b.ability === 'hyper-cutter' && stat === 'atk') || (b.ability === 'keen-eye' && stat === 'acc')) {
        if (!quiet) this.text(`${this.Name(b)}'s ${abilityName(b.ability)} prevents ${STAT_LABEL[stat]} loss!`);
        return false;
      }
    }
    const before = b.stages[stat];
    const after = Math.max(-6, Math.min(6, before + change));
    if (after === before) {
      if (!quiet) this.text(`${this.Name(b)}'s ${STAT_LABEL[stat]} won't go ${change > 0 ? 'higher' : 'lower'}!`);
      return false;
    }
    b.stages[stat] = after;
    const words = Math.abs(change) >= 2 ? (change > 0 ? 'sharply rose' : 'harshly fell') : change > 0 ? 'rose' : 'fell';
    this.emit({ t: 'stat', side: b.side, stat, change: after - before, msg: `${this.Name(b)}'s ${STAT_LABEL[stat]} ${words}!` });
    return true;
  }

  // ---- Special Conditions ----
  /** Whether a major status can be given (type and ability immunities, Safeguard, an existing status, Uproar for sleep). */
  canStatus(b: Battler, kind: StatusKind, from: Battler | null): boolean {
    if (b.fainted || b.status) return false;
    if (from && from.side !== b.side && this.sides[b.side].safeguard) return false;
    switch (kind) {
      case 'sleep':
        return b.ability !== 'insomnia' && b.ability !== 'vital-spirit' && !this.active.some((x) => x.v.uproar);
      case 'poison':
      case 'toxic':
        return b.ability !== 'immunity' && !b.types.includes('poison') && !b.types.includes('steel');
      case 'burn':
        return b.ability !== 'water-veil' && !b.types.includes('fire');
      case 'paralysis':
        return b.ability !== 'limber';
      case 'freeze':
        return b.ability !== 'magma-armor' && !b.types.includes('ice') && !this.isWeather('sun');
    }
  }

  /** Gives a major status (it must be allowed: canStatus), with its line; Synchronize passes poison, burn and paralysis back. */
  setStatus(b: Battler, kind: StatusKind, from: Battler | null, turns?: number) {
    b.status = kind;
    if (kind === 'sleep') b.sleepTurns = turns ?? (this.random16() & 3) + 2;
    if (kind === 'toxic') b.toxicCount = 0;
    const words: Record<StatusKind, string> = { sleep: 'fell asleep', poison: 'was poisoned', toxic: 'was badly poisoned', burn: 'was burned', paralysis: 'is paralyzed! It may be unable to move', freeze: 'was frozen solid' };
    this.emit({ t: 'status', side: b.side, status: kind, msg: `${this.Name(b)} ${words[kind]}!` });
    if (from && from !== b && b.ability === 'synchronize' && (kind === 'poison' || kind === 'toxic' || kind === 'burn' || kind === 'paralysis')) {
      const back = kind === 'toxic' ? 'poison' : kind;
      if (this.canStatus(from, back, null)) this.setStatus(from, back, null);
    }
  }

  cureStatus(b: Battler, msg?: string) {
    if (!b.status) return;
    b.status = null;
    b.sleepTurns = 0;
    b.toxicCount = 0;
    b.v.nightmare = false;
    this.emit({ t: 'status', side: b.side, status: null, ...(msg && { msg }) });
  }

  /** Confuses for 2–5 turns (Own Tempo and Safeguard stop it). */
  confuse(b: Battler, from: Battler | null): boolean {
    if (b.fainted || b.v.confused || b.ability === 'own-tempo') return false;
    if (from && from.side !== b.side && this.sides[b.side].safeguard) return false;
    b.v.confused = (this.random16() & 3) + 2;
    this.text(`${this.Name(b)} became confused!`);
    return true;
  }

  // ---- Damage ----
  /** A critical hit (Cmd_critcalc): stage from Focus Energy (+2), high-crit moves (+1), Scope Lens (+1); Battle/Shell Armor stop it. */
  critRoll(user: Battler, target: Battler, move: MoveData): boolean {
    let stage = (user.v.focusEnergy ? 2 : 0) + (HIGH_CRIT.has(move.effect) ? 1 : 0) + (this.holdEffect(user) === 'scope_lens' ? 1 : 0);
    stage = Math.min(stage, CRIT_CHANCE.length - 1);
    if (target.ability === 'battle-armor' || target.ability === 'shell-armor') return false;
    return this.random16() % CRIT_CHANCE[stage]! === 0;
  }

  /**
   * The damage before the random roll (CalculateBaseDamage, then the critical hit, STAB and type multipliers): `crit`
   * doubles it, ignoring the attacker's lowered and the target's raised stages and the screens. Returns the damage and
   * the type multiplier.
   */
  baseDamage(user: Battler, target: Battler, move: MoveData, o: { power: number; type: TypeName; crit: boolean; effect: string }): { damage: number; eff: number } {
    const badges = user.side === 0 ? this.setup.badges : 0;
    const defBadges = target.side === 0 ? this.setup.badges : 0;
    let power = o.power;
    const type = o.type;
    let atk = user.stats.atk;
    let def = target.stats.def;
    let spa = user.stats.spa;
    let spd = target.stats.spd;
    if (user.ability === 'huge-power' || user.ability === 'pure-power') atk *= 2;
    // FireRed's badge boosts (ShouldGetStatBadgeBoost): the player's Pokémon only.
    if (badges >= 1) atk = Math.floor((110 * atk) / 100);
    if (defBadges >= 5) def = Math.floor((110 * def) / 100);
    if (badges >= 7) spa = Math.floor((110 * spa) / 100);
    if (defBadges >= 7) spd = Math.floor((110 * spd) / 100);
    const hold = this.holdEffect(user);
    if (TYPE_BOOSTERS[hold] === type) {
      const param = itemData(user.item!).holdParam;
      if (isPhysical(type)) atk = Math.floor((atk * (param + 100)) / 100);
      else spa = Math.floor((spa * (param + 100)) / 100);
    }
    if (hold === 'choice_band') atk = Math.floor((150 * atk) / 100);
    if (hold === 'light_ball' && user.species === 25) spa *= 2;
    if (hold === 'thick_club' && (user.species === 104 || user.species === 105)) atk *= 2;
    if (this.holdEffect(target) === 'metal_powder' && target.species === 132) def *= 2;
    if (target.ability === 'thick-fat' && (type === 'fire' || type === 'ice')) spa = Math.floor(spa / 2);
    if (user.ability === 'hustle') atk = Math.floor((150 * atk) / 100);
    if (user.ability === 'guts' && user.status) atk = Math.floor((150 * atk) / 100);
    if (target.ability === 'marvel-scale' && target.status) def = Math.floor((150 * def) / 100);
    if (type === 'electric' && this.sides.some((s) => s.mudSport)) power = Math.floor(power / 2);
    if (type === 'fire' && this.sides.some((s) => s.waterSport)) power = Math.floor(power / 2);
    const pinch = user.hp <= Math.floor(user.maxHp / 3);
    if (pinch && ((type === 'grass' && user.ability === 'overgrow') || (type === 'fire' && user.ability === 'blaze') || (type === 'water' && user.ability === 'torrent') || (type === 'bug' && user.ability === 'swarm'))) {
      power = Math.floor((150 * power) / 100);
    }
    if (o.effect === 'explosion') def = Math.floor(def / 2);
    const lvl = Math.floor((2 * user.level) / 5) + 2;
    let damage = 0;
    const mod = (value: number, stage: number) => Math.floor((value * STAGE_RATIOS[stage + 6]![0]) / STAGE_RATIOS[stage + 6]![1]);
    if (isPhysical(type)) {
      damage = o.crit && user.stages.atk <= 0 ? atk : mod(atk, user.stages.atk);
      damage = damage * power * lvl;
      const d = o.crit && target.stages.def >= 0 ? def : mod(def, target.stages.def);
      damage = Math.floor(Math.floor(damage / d) / 50);
      if (user.status === 'burn' && user.ability !== 'guts') damage = Math.floor(damage / 2);
      if (this.sides[target.side].reflect && !o.crit) damage = Math.floor(damage / 2);
      if (damage === 0) damage = 1;
    }
    if (type === 'mystery') damage = 0;
    if (!isPhysical(type) && type !== 'mystery') {
      damage = o.crit && user.stages.spa <= 0 ? spa : mod(spa, user.stages.spa);
      damage = damage * power * lvl;
      const d = o.crit && target.stages.spd >= 0 ? spd : mod(spd, target.stages.spd);
      damage = Math.floor(Math.floor(damage / d) / 50);
      if (this.sides[target.side].lightScreen && !o.crit) damage = Math.floor(damage / 2);
      if (this.weatherOn()) {
        if (this.weather!.kind === 'rain') {
          if (type === 'fire') damage = Math.floor(damage / 2);
          if (type === 'water') damage = Math.floor((15 * damage) / 10);
        }
        if (this.weather!.kind !== 'sun' && o.effect === 'solar_beam') damage = Math.floor(damage / 2);
        if (this.weather!.kind === 'sun') {
          if (type === 'fire') damage = Math.floor((15 * damage) / 10);
          if (type === 'water') damage = Math.floor(damage / 2);
        }
      }
      if (user.v.flashFire && type === 'fire') damage = Math.floor((15 * damage) / 10);
    }
    damage += 2;
    // Cmd_damagecalc: the critical hit, Charge and Helping Hand; then Cmd_typecalc: STAB and each type in turn.
    if (o.crit) damage *= 2;
    if (user.v.charged && type === 'electric') damage *= 2;
    if (user.v.helpingHand) damage = Math.floor((damage * 15) / 10);
    if (user.types.includes(type)) damage = Math.floor((damage * 15) / 10);
    let eff = 1;
    for (const t of target.types) {
      const m = effectiveness(type, [t], !!target.v.foresight);
      eff *= m;
      if (m !== 1) {
        damage = Math.floor((damage * m * 10) / 10);
        if (damage === 0 && m !== 0) damage = 1;
      }
    }
    return { damage, eff };
  }

  /** Whether a move can't touch the target for its type (immunity, Levitate vs Ground; Wonder Guard isn't in Kanto). */
  immune(user: Battler, target: Battler, type: TypeName) {
    if (type === 'ground' && target.ability === 'levitate') return true;
    return effectiveness(type, target.types, !!target.v.foresight) === 0;
  }

  /** The move's type for this use (Hidden Power, Weather Ball…), from its effect if it changes it. */
  moveType(user: Battler, move: MoveData): TypeName {
    if (move.effect === 'weather_ball' && this.weatherOn()) return ({ rain: 'water', sun: 'fire', sandstorm: 'rock', hail: 'ice' } as const)[this.weather!.kind];
    if (move.effect === 'hidden_power') return hiddenPowerType(user.mon);
    return move.type;
  }

  /**
   * The accuracy check (Cmd_accuracycheck): a target out of reach (semi-invulnerable) is missed unless the move reaches
   * it; Lock-On always hits; moves with no accuracy always hit; otherwise accuracy times the stages' ratio (Foresight
   * ignoring evasion), Compound Eyes, Sand Veil, Hustle, BrightPowder.
   */
  hits(user: Battler, target: Battler, move: MoveData, key: string): boolean {
    if (user === target) return true;
    const semi = target.v.semiInvulnerable;
    if (semi && !reachesSemi(key, move, semi)) return false;
    if (user.v.lockOn) return true;
    if (move.effect === 'thunder' && this.isWeather('rain')) return true;
    if (move.accuracy === 0) return true;
    let buff = user.stages.acc + (target.v.foresight ? 0 : -target.stages.eva);
    buff = Math.max(-6, Math.min(6, buff));
    let acc = move.effect === 'thunder' && this.isWeather('sun') ? 50 : move.accuracy;
    const [n, d] = ACCURACY_RATIOS[buff + 6]!;
    let calc = Math.floor((n * acc) / d);
    if (user.ability === 'compound-eyes') calc = Math.floor((calc * 130) / 100);
    if (target.ability === 'sand-veil' && this.isWeather('sandstorm')) calc = Math.floor((calc * 80) / 100);
    if (user.ability === 'hustle' && isPhysical(this.moveType(user, move))) calc = Math.floor((calc * 80) / 100);
    if (this.holdEffect(target) === 'evasion_up') calc = Math.floor((calc * (100 - itemData(target.item!).holdParam)) / 100);
    acc = (this.random16() % 100) + 1;
    return acc <= calc;
  }

  /** Whether the target's ability takes this move's type in (Volt Absorb, Water Absorb, Flash Fire), healing or powering up. */
  absorbs(user: Battler, target: Battler, type: TypeName, move: MoveData): boolean {
    if (user === target || move.target === 'user') return false;
    if (target.ability === 'volt-absorb' && type === 'electric' && move.target !== 'opponents_field') {
      this.absorbHeal(target);
      return true;
    }
    if (target.ability === 'water-absorb' && type === 'water' && move.target !== 'opponents_field') {
      this.absorbHeal(target);
      return true;
    }
    if (target.ability === 'flash-fire' && type === 'fire' && target.status !== 'freeze') {
      target.v.flashFire = true;
      this.text(`${this.Name(target)}'s Flash Fire raised its Fire power!`);
      return true;
    }
    return false;
  }
  private absorbHeal(target: Battler) {
    if (target.hp === target.maxHp) this.text(`${this.Name(target)}'s ${abilityName(target.ability)} made it ineffective!`);
    else this.heal(target, Math.max(1, Math.floor(target.maxHp / 4)), `${this.Name(target)} restored HP using its ${abilityName(target.ability)}!`);
  }

  /**
   * One damaging hit of a move on the target: the critical roll, the damage with its random 85–100%, a Substitute
   * taking it, Endure and False Swipe leaving 1 HP, the lines. Assumes the move hit (accuracy, protection and immunity
   * checked). Returns the damage done (to a Substitute too) and whether it went to the Pokémon itself.
   */
  strike(ctx: MoveCtx, o: { power?: number; fixed?: number; type?: TypeName; noCrit?: boolean; leaveOne?: boolean } = {}): { dealt: number; toMon: boolean; crit: boolean; eff: number } {
    const { user, target, move } = ctx;
    const type = o.type ?? ctx.type;
    let damage: number;
    let crit = false;
    let eff = 1;
    if (o.fixed !== undefined) {
      damage = o.fixed;
    } else {
      crit = !o.noCrit && this.critRoll(user, target, move);
      const r = this.baseDamage(user, target, move, { power: o.power ?? ctx.power, type, crit, effect: move.effect });
      damage = r.damage;
      eff = r.eff;
      damage = Math.floor((damage * (100 - (this.random16() % 16))) / 100);
      if (damage === 0) damage = 1;
    }
    damage = Math.floor(damage * ctx.multiplier);
    if (target.v.substitute && !SOUND_MOVES.has(ctx.key) && user !== target) {
      const dealt = Math.min(target.v.substitute, damage);
      target.v.substitute -= dealt;
      if (crit) this.text('A critical hit!');
      this.text(`The substitute took damage for ${this.name(target)}!`);
      if (target.v.substitute <= 0) {
        delete target.v.substitute;
        this.text(`${this.Name(target)}'s substitute faded!`);
      }
      return { dealt, toMon: false, crit, eff };
    }
    if (damage >= target.hp) {
      if (o.leaveOne || target.v.endure) {
        damage = target.hp - 1;
        if (target.v.endure) this.text(`${this.Name(target)} endured the hit!`);
      } else if (this.holdEffect(target) === 'focus_band' && this.roll(100) < itemData(target.item!).holdParam) {
        damage = target.hp - 1;
        this.text(`${this.Name(target)} hung on using its Focus Band!`);
      }
    }
    const dealt = this.damage(target, damage, { crit, eff });
    if (crit) this.text('A critical hit!');
    if (eff > 1) this.text("It's super effective!");
    else if (eff > 0 && eff < 1) this.text("It's not very effective…");
    target.v.hitThisTurn = true;
    if (isPhysical(type)) target.v.physicalHit = dealt;
    else target.v.specialHit = dealt;
    target.lastHitBy = { move: ctx.key, type };
    if (target.v.bide) target.v.bide.damage += dealt;
    if (target.v.rage && dealt > 0 && target.hp > 0) this.changeStat(target, 'atk', 1, true);
    return { dealt, toMon: true, crit, eff };
  }

  /** Contact abilities on the attacker after a contact move hit (Static, Flame Body, Poison Point, Effect Spore, Cute Charm). */
  contact(user: Battler, target: Battler, move: MoveData) {
    if (!move.flags.includes('makes_contact') || user.fainted || target.ability === 'none') return;
    const third = this.roll(3) === 0;
    switch (target.ability) {
      case 'static':
        if (third && this.canStatus(user, 'paralysis', null)) this.setStatus(user, 'paralysis', target);
        break;
      case 'flame-body':
        if (third && this.canStatus(user, 'burn', null)) this.setStatus(user, 'burn', target);
        break;
      case 'poison-point':
        if (third && this.canStatus(user, 'poison', null)) this.setStatus(user, 'poison', target);
        break;
      case 'effect-spore':
        if (this.roll(10) === 0) {
          const kind = (['poison', 'paralysis', 'sleep'] as const)[this.roll(3)]!;
          if (this.canStatus(user, kind, null)) this.setStatus(user, kind, target);
        }
        break;
      case 'cute-charm':
        if (third && !user.v.attractedTo && user.ability !== 'oblivious' && user.mon.gender && target.mon.gender && user.mon.gender !== target.mon.gender) {
          user.v.attractedTo = target.side;
          this.text(`${this.Name(target)}'s Cute Charm infatuated ${this.name(user)}!`);
        }
        break;
    }
  }

  /** Whether a secondary effect happens: its chance (doubled by Serene Grace), not through Shield Dust or a Substitute. */
  secondaryHappens(ctx: MoveCtx, hit: { toMon: boolean }, chancePercent = ctx.move.chance, onTarget = true): boolean {
    if (onTarget && (!hit.toMon || ctx.target.fainted || ctx.target.hp <= 0 || ctx.target.ability === 'shield-dust')) return false;
    const c = ctx.user.ability === 'serene-grace' ? chancePercent * 2 : chancePercent;
    return c >= 100 || this.random16() % 100 < c;
  }

  // ---- The turn ----
  /** Sends a Pokémon out (at the start, or replacing a fainted one): its line, Spikes, Intimidate, Trace. */
  sendOut(b: Battler, first = false) {
    this.active[b.side] = b;
    b.v.firstTurn = true;
    if (b.side === 0) this.participated.add(b.index);
    const msg = b.side === 0 ? `Go! ${species(b.species).name}!` : this.setup.kind === 'wild' ? `A wild ${species(b.species).name} appeared!` : `The foe sent out ${species(b.species).name}!`;
    this.emit({ t: 'send', side: b.side, mon: b.view(), msg });
    if (!first || b.side === 0) this.noteFacing();
    const spikes = this.sides[b.side].spikes;
    if (spikes && !b.types.includes('flying') && b.ability !== 'levitate') {
      this.damage(b, Math.max(1, Math.floor((b.maxHp * [0, 1, 1.5, 2][spikes]!) / 8)), { msg: `${this.Name(b)} is hurt by spikes!` });
    }
    this.entryAbility(b);
  }

  private entryAbility(b: Battler) {
    const foe = this.foeOf(b);
    if (!foe || foe.fainted) return;
    if (b.ability === 'intimidate') {
      this.text(`${this.Name(b)}'s Intimidate cuts ${this.name(foe)}'s Attack!`);
      this.changeStat(foe, 'atk', -1, false);
    }
    if (b.ability === 'trace' && foe.ability !== 'none') {
      b.ability = foe.ability;
      this.text(`${this.Name(b)} traced ${this.name(foe)}'s ${abilityName(foe.ability)}!`);
    }
  }

  /** The player's active Pokémon has faced the foe's active one (it shares its experience). */
  noteFacing() {
    const [p, f] = this.active;
    if (!this.facedBy.has(f.index)) this.facedBy.set(f.index, new Set());
    if (!p.fainted) this.facedBy.get(f.index)!.add(p.index);
  }

  /** Plays the battle out. */
  run(): BattleOutcome {
    this.emit({ t: 'tick', n: 0 });
    this.sendOut(this.active[1], true);
    this.sendOut(this.active[0], true);
    const maxTicks = this.setup.maxTicks ?? 200;
    while (!this.result) {
      this.tick += 1;
      if (this.tick > maxTicks) {
        if (this.setup.kind === 'wild') {
          this.text(`${this.Name(this.active[1])} wandered off!`);
          this.end('fled');
        } else {
          this.text('The battle went on too long…');
          this.end('lost');
        }
        break;
      }
      this.turn();
    }
    this.emit({ t: 'end', result: this.result! });
    return {
      result: this.result!,
      events: this.events,
      ticks: this.tick,
      party: this.party.map((b) => b.mon),
      participated: [...this.participated].map((i) => this.party[i]!.mon.uid),
      bag: this.bag,
      caught: this.caught,
      payDay: this.payDay,
    };
  }

  end(result: BattleResult) {
    if (!this.result) this.result = result;
  }

  private turn() {
    this.emit({ t: 'tick', n: this.tick });
    const actions: [Action, Action] = [choosePlayerAction(this), this.foeAction()];
    const order = this.order(actions);
    this.movedThisTurn.clear();
    for (const side of order) {
      if (this.result) return;
      const b = this.active[side];
      if (b.fainted || this.foeOf(b).fainted && actions[side].kind === 'move' && !targetsSelf(actions[side])) {
        this.movedThisTurn.add(side);
        continue;
      }
      this.act(b, actions[side]);
      this.movedThisTurn.add(side);
      this.checkFaints();
      if (this.result) return;
    }
    this.endOfTurn();
    this.checkFaints();
    if (this.result) return;
    // A tick gone by: every move cooling down a tick nearer ready (the one used this tick too, so a 1-tick move is ready again next tick).
    for (const b of this.active) {
      if (b.fainted || !Object.keys(b.cooldowns).length) continue;
      for (const [k, n] of Object.entries(b.cooldowns)) {
        if (n > 1) b.cooldowns[k] = n - 1;
        else delete b.cooldowns[k];
      }
      this.emit({ t: 'cooldown', side: b.side, cooldowns: { ...b.cooldowns } });
    }
    this.replaceFainted();
    for (const b of this.active) {
      Object.assign(b.v, { flinch: false, protect: false, endure: false, helpingHand: false, magicCoat: false, snatch: false, hitThisTurn: false, physicalHit: 0, specialHit: 0, firstTurn: false });
    }
  }

  /** The foe's action: a trainer's item if it would use one (ai.ts), otherwise its move by the cooldown rule. */
  private foeAction(): Action {
    const b = this.active[1];
    if (this.setup.kind === 'trainer') {
      const item = chooseFoeItem(this, b);
      if (item) return { kind: 'item', item, target: b.index };
    }
    return { kind: 'move', move: this.chooseMove(b) };
  }

  /** Who moves first (GetWhoStrikesFirst): items and balls before moves, then priority, then Speed, ties at random. */
  private order(actions: [Action, Action]): Side[] {
    const prio = (side: Side) => {
      const a = actions[side];
      if (a.kind !== 'move') return 10;
      return moveData(a.move).priority;
    };
    const p0 = prio(0);
    const p1 = prio(1);
    if (p0 !== p1) return p0 > p1 ? [0, 1] : [1, 0];
    const s0 = this.speed(this.active[0]);
    const s1 = this.speed(this.active[1]);
    if (s0 !== s1) return s0 > s1 ? [0, 1] : [1, 0];
    return this.random16() & 1 ? [1, 0] : [0, 1];
  }

  // ---- Choosing a move: the cooldown rule ----
  /** Whether a move can be picked now (Disable, Taunt, Torment, Imprison). */
  selectable(b: Battler, key: string): boolean {
    if (b.v.disabled?.move === key) return false;
    if (b.v.taunt && moveData(key).power === 0) return false;
    if (b.v.torment && b.lastMove === key && key !== 'struggle') return false;
    const foe = this.foeOf(b);
    if (foe.v.imprison && (foe.slots.includes(key) || foe.basic === key)) return false;
    return true;
  }

  /** Whether a slot move is ready (off cooldown), can be picked and would do something (statusUseless). */
  ready(b: Battler, key: string): boolean {
    return !b.cooldowns[key] && this.selectable(b, key) && !statusUseless(this, b, key);
  }

  /** A slot move used: it cools down for its cooldownTicks (the basic move and Struggle never do). */
  startCooldown(b: Battler, key: string) {
    if (key === b.basic || key === 'struggle' || !b.slots.includes(key)) return;
    b.cooldowns[key] = cooldownTicks(key);
    this.emit({ t: 'cooldown', side: b.side, cooldowns: { ...b.cooldowns } });
  }

  /**
   * The move a Pokémon uses this turn: one it's locked into (a two-turn move's second turn, Thrash, Rollout, Uproar,
   * Bide, Encore), else (the user's, 2026-10-25, replacing the energy rule) the slot move with the highest power
   * (movePower; status moves last, the slots' order breaking ties) that's ready, which then cools down; else its basic
   * move (Struggle if even that can't be used).
   */
  chooseMove(b: Battler): string {
    const forced = b.v.charging ?? b.v.rampage?.move ?? (b.v.rollout && b.lastMove) ?? (b.v.uproar && b.lastMove) ?? (b.v.bide && 'bide') ?? null;
    if (forced) return forced;
    if (b.v.encore && this.selectable(b, b.v.encore.move)) return b.v.encore.move;
    const best = b.slots.filter((k) => this.ready(b, k)).sort((x, y) => movePower(y) - movePower(x))[0];
    if (best) {
      this.startCooldown(b, best);
      return best;
    }
    if (this.selectable(b, b.basic)) return b.basic;
    return 'struggle';
  }

  // ---- Acting ----
  private act(b: Battler, action: Action) {
    if (action.kind === 'item') return this.useItem(b, action.item, action.target);
    if (action.kind === 'ball') return this.throwBall(action.item);
    if (!this.canMove(b, action.move)) {
      // A turn it couldn't move ends its locks (two-turn moves, Thrash, Rollout, Bide), as the game's cancelled multi-turn moves.
      delete b.v.charging;
      delete b.v.semiInvulnerable;
      delete b.v.rollout;
      delete b.v.bide;
      if (b.v.rampage) delete b.v.rampage;
      return;
    }
    this.useMove(b, action.move);
  }

  /**
   * What stops a Pokémon from moving (AtkCanceller_UnableToUseMove): recharging, sleep (waking up on its counter's last
   * turn and moving: Gen 3), freeze (a 1 in 5 thaw), flinching, Disable, Taunt, confusion (half the time hurting itself
   * with a 40-power typeless hit), paralysis (1 in 4), attraction (half the time).
   */
  private canMove(b: Battler, move: string): boolean {
    if (b.v.recharging) {
      b.v.recharging = false;
      this.text(`${this.Name(b)} must recharge!`);
      return false;
    }
    if (b.status === 'sleep') {
      const toSub = b.ability === 'early-bird' ? 2 : 1;
      b.sleepTurns = Math.max(0, b.sleepTurns - toSub);
      if (b.sleepTurns > 0) {
        this.text(`${this.Name(b)} is fast asleep.`);
        if (move !== 'snore' && move !== 'sleep-talk') return false;
      } else {
        this.cureStatus(b, `${this.Name(b)} woke up!`);
      }
    }
    if (b.status === 'freeze') {
      if (this.roll(5) === 0 || THAWING.has(moveData(move).effect)) this.cureStatus(b, `${this.Name(b)} was defrosted!`);
      else {
        this.text(`${this.Name(b)} is frozen solid!`);
        return false;
      }
    }
    if (b.v.flinch) {
      this.text(`${this.Name(b)} flinched!`);
      return false;
    }
    if (b.v.disabled?.move === move) {
      this.text(`${this.Name(b)}'s ${moveData(move).name} is disabled!`);
      return false;
    }
    if (b.v.taunt && moveData(move).power === 0) {
      this.text(`${this.Name(b)} can't use ${moveData(move).name} after the taunt!`);
      return false;
    }
    if (b.v.confused) {
      b.v.confused -= 1;
      if (b.v.confused <= 0) {
        delete b.v.confused;
        this.text(`${this.Name(b)} snapped out of confusion!`);
      } else {
        this.text(`${this.Name(b)} is confused!`);
        if (this.random16() & 1) {
          // A 40-power typeless physical hit on itself (no critical hit, no type, no random roll: Gen 3).
          const lvl = Math.floor((2 * b.level) / 5) + 2;
          const atk = this.staged(b, 'atk');
          const def = this.staged(b, 'def');
          let dmg = Math.floor(Math.floor((atk * 40 * lvl) / def) / 50);
          if (b.status === 'burn') dmg = Math.floor(dmg / 2);
          dmg = Math.max(1, dmg) + 2;
          if (b.v.substitute) this.text('It hurt itself in its confusion!');
          else this.damage(b, dmg, { msg: 'It hurt itself in its confusion!' });
          return false;
        }
      }
    }
    if (b.status === 'paralysis' && this.roll(4) === 0) {
      this.text(`${this.Name(b)} is paralyzed! It can't move!`);
      return false;
    }
    if (b.v.attractedTo !== undefined) {
      this.text(`${this.Name(b)} is in love with ${this.name(this.foeOf(b))}!`);
      if (this.random16() & 1) {
        this.text(`${this.Name(b)} is immobilized by love!`);
        return false;
      }
    }
    return true;
  }

  /** Uses a move (a called one, by Metronome or Sleep Talk, with `called`). */
  useMove(user: Battler, key: string, called = false) {
    const move = moveData(key === 'mimic' && user.v.mimicked ? user.v.mimicked.to : key);
    const realKey = key === 'mimic' && user.v.mimicked ? user.v.mimicked.to : key;
    const target = move.target === 'user' ? user : this.foeOf(user);
    if (!called || !user.v.charging) this.emit({ t: 'move', side: user.side, move: realKey, msg: `${this.Name(user)} used ${move.name}!` });
    // Protect and Endure only grow less likely when used in a row.
    if (move.effect !== 'protect' && move.effect !== 'endure') delete user.v.protectStreak;
    if (!called) {
      user.lastMove = realKey;
      if (user.v.encore && user.v.encore.move !== realKey) delete user.v.encore;
    }
    this.lastMoveUsed = realKey;
    const ctx: MoveCtx = {
      b: this,
      user,
      target,
      key: realKey,
      move,
      type: this.moveType(user, move),
      power: move.power,
      multiplier: 1,
    };
    const effect = EFFECTS[move.effect] ?? (move.power > 0 ? EFFECTS.hit! : EFFECTS.splash!);
    effect(ctx);
    if (user.v.lockOn && realKey !== 'lock-on' && realKey !== 'mind-reader') user.v.lockOn -= 1;
    if (user.v.charged && move.type === 'electric' && move.power > 0) delete user.v.charged;
  }

  /**
   * The checks a move aimed at the other Pokémon goes through before it lands (Protect, being out of reach, accuracy,
   * type immunity, absorbing abilities, Soundproof), each with its line. Returns whether it lands.
   */
  lands(ctx: MoveCtx, o: { accuracy?: boolean; immunity?: boolean } = {}): boolean {
    const { user, target, move } = ctx;
    if (target === user) return true;
    if (target.fainted) {
      this.text('But there was no target…');
      return false;
    }
    if (target.v.protect && move.flags.includes('protect_affected')) {
      this.text(`${this.Name(target)} protected itself!`);
      return false;
    }
    if (target.ability === 'soundproof' && SOUND_MOVES.has(ctx.key)) {
      this.text(`${this.Name(target)}'s Soundproof blocks ${move.name}!`);
      return false;
    }
    if (this.absorbs(user, target, ctx.type, move)) return false;
    if (o.accuracy !== false && !this.hits(user, target, move, ctx.key)) {
      this.text(`${this.Name(user)}'s attack missed!`);
      return false;
    }
    if (o.immunity !== false && (move.power > 0 || fixedDamageEffect(move.effect)) && this.immune(user, target, ctx.type)) {
      this.text(`It doesn't affect ${this.name(target)}…`);
      return false;
    }
    return true;
  }

  /** After a move: an attacker knocked out by Destiny Bond's holder takes it down too. */
  destinyBond(user: Battler, target: Battler) {
    if (target.fainted || target.hp > 0 || !target.v.destinyBond || user.hp <= 0) return;
    this.text(`${this.Name(target)} took ${this.name(user)} with it!`);
    this.damage(user, user.hp);
  }

  // ---- Items and balls ----
  private useItem(b: Battler, item: string, targetIndex: number) {
    const side = b.side;
    const owner = side === 0 ? 'You' : 'The foe';
    const target = side === 0 ? this.party[targetIndex]! : this.foes[targetIndex]!;
    if (side === 0) this.bag[item] = (this.bag[item] ?? 0) - 1;
    else this.foeItems.splice(this.foeItems.indexOf(item), 1);
    if (side === 0 && !this.bag[item]) delete this.bag[item];
    this.emit({ t: 'item', side, item, msg: `${owner} used ${itemData(item).name}${target !== b ? ` on ${species(target.species).name}` : ''}!` });
    const med = MEDICINE[item];
    if (!med) return;
    if (med.revive) {
      target.fainted = false;
      target.hp = med.revive === 'full' ? target.maxHp : Math.max(1, Math.floor(target.maxHp / 2));
      target.status = null;
      this.text(`${species(target.species).name} was revived!`);
      return;
    }
    if (med.heal) this.heal(target, med.heal === 'full' ? target.maxHp : med.heal, `${species(target.species).name}'s HP was restored.`);
    if (med.cures && target.status && (med.cures === 'all' || med.cures.includes(target.status))) this.cureStatus(target, `${species(target.species).name} was cured!`);
    if (med.cures === 'all' && target.v.confused) delete target.v.confused;
  }

  private throwBall(item: string) {
    const target = this.active[1];
    this.bag[item] = (this.bag[item] ?? 0) - 1;
    if (!this.bag[item]) delete this.bag[item];
    const { caught, shakes } = attemptCatch(this.rng, { catchRate: species(target.species).catchRate, maxHp: target.maxHp, hp: target.hp, status: target.status, ball: item });
    const name = species(target.species).name;
    const lines = ['Oh, no! The Pokémon broke free!', 'Aww! It appeared to be caught!', 'Aargh! Almost had it!', 'Shoot! It was so close, too!'];
    this.emit({ t: 'ball', item, shakes, caught, msg: caught ? `Gotcha! ${name} was caught!` : lines[shakes]! });
    if (caught) {
      this.caught = structuredClone(target.mon);
      this.end('caught');
    }
  }

  // ---- Fainting, experience ----
  /** Faints every Pokémon at 0 HP (its line), sharing a fainted foe's experience among the player's Pokémon that faced it. */
  checkFaints() {
    for (const b of [...this.active]) {
      if (b.fainted || b.hp > 0) continue;
      b.fainted = true;
      b.status = null;
      b.v = {};
      this.emit({ t: 'faint', side: b.side, msg: `${this.Name(b)} fainted!` });
      if (b.side === 1) this.gainExp(b);
    }
    if (this.party.every((b) => b.fainted)) this.end('lost');
    else if (this.foes.every((b) => b.fainted)) this.end('won');
  }

  /**
   * Experience for a fainted foe (Cmd_getexp, Gen 3, × EXP_RATE): base experience × its level / 7, split evenly among the player's
   * Pokémon that faced it and haven't fainted, the rest of the party half each (Gen 6's Exp. Share: agreed), 1.5× for a
   * trainer's; each also gains its EV yield. Level-ups raise the
   * stats at once (its HP by as much as its max HP) and teach the level's moves (all kept; the slots follow if automatic).
   */
  private gainExp(foe: Battler) {
    const faced = [...(this.facedBy.get(foe.index) ?? [])].map((i) => this.party[i]!).filter((b) => !b.fainted);
    if (!faced.length) return;
    const s = species(foe.species);
    let each = Math.floor(Math.floor((s.baseExp * foe.level) / 7) / faced.length);
    if (each === 0) each = 1;
    if (this.setup.kind === 'trainer') each = Math.floor((each * 150) / 100);
    // A quarter of the game's (the user's, 2026-10-25: slower, more idle), at least 1.
    each = Math.max(1, Math.floor(each * EXP_RATE));
    // The rest of the party gets half each (Gen 6's Exp. Share; agreed with the user, 2026-10-25).

    const rest = this.party.filter((b) => !b.fainted && !faced.includes(b));
    const gains: [Battler, number][] = [...faced.map((b) => [b, each] as [Battler, number]), ...rest.map((b) => [b, Math.max(1, Math.floor(each / 2))] as [Battler, number])];
    for (const [b, gained] of gains) {
      const mon = b.mon;
      if (mon.level >= 100) continue;
      mon.evs = addEvs(mon.evs, s.evYield);
      const growth = species(mon.species).growth;
      mon.exp += gained;
      this.emit({ t: 'exp', uid: mon.uid, gained, exp: mon.exp, msg: `${species(mon.species).name} gained ${gained} EXP. Points!` });
      const reached = levelForExp(growth, mon.exp);
      while (mon.level < reached) {
        mon.level += 1;
        const st = calcStats(mon.species, mon.level, mon.ivs, mon.evs, mon.nature);
        const gain = st[0] - b.maxHp;
        b.maxHp = st[0];
        if (!b.fainted) b.hp += gain;
        b.stats = { atk: st[1], def: st[2], spa: st[3], spd: st[4], spe: st[5] };
        this.emit({ t: 'level', uid: mon.uid, level: mon.level, hp: b.hp, maxHp: b.maxHp, msg: `${species(mon.species).name} grew to Lv. ${mon.level}!` });
        for (const m of movesAt(mon.species, mon.level)) {
          if (mon.moves.includes(m)) continue;
          mon.moves.push(m);
          this.emit({ t: 'learn', uid: mon.uid, move: m, msg: `${species(mon.species).name} learned ${moveData(m).name}!` });
        }
        if (mon.autoSlots) {
          mon.slots = autoSlots(mon);
          if (!b.v.transformed) b.slots = [...mon.slots];
        }
      }
    }
  }

  /** Sends in the next Pokémon (party order) for a fainted active one; a wild battle won ends instead. */
  private replaceFainted() {
    for (const side of [0, 1] as Side[]) {
      const b = this.active[side];
      if (!b.fainted) continue;
      const team = side === 0 ? this.party : this.foes;
      const next = team.find((x) => !x.fainted);
      if (!next) continue;
      this.sendOut(next);
    }
    this.noteFacing();
  }

  // ---- End of turn (DoFieldEndTurnEffects, DoBattlerEndTurnEffects, DoFutureSightAttacks…) ----
  private endOfTurn() {
    for (const side of [0, 1] as Side[]) {
      const s = this.sides[side];
      for (const k of ['reflect', 'lightScreen', 'mist', 'safeguard'] as const) {
        if (s[k] > 0 && --s[k] === 0) this.text(`${side === 0 ? 'Your team' : "The foe's team"}'s ${({ reflect: 'Reflect', lightScreen: 'Light Screen', mist: 'Mist', safeguard: 'Safeguard' })[k]} wore off!`);
      }
      if (s.wish && --s.wish.turns === 0) {
        const b = this.active[side];
        if (!b.fainted) this.heal(b, s.wish.hp, `${this.Name(b)}'s wish came true!`);
        delete s.wish;
      }
    }
    if (this.weather) {
      this.weather.turns -= 1;
      if (this.weather.turns <= 0) {
        this.emit({ t: 'weather', weather: null, msg: ({ rain: 'The rain stopped.', sun: 'The sunlight faded.', sandstorm: 'The sandstorm subsided.', hail: 'The hail stopped.' })[this.weather.kind] });
        this.weather = null;
      } else if (this.weatherOn() && (this.weather.kind === 'sandstorm' || this.weather.kind === 'hail')) {
        for (const b of this.speedOrder()) {
          if (b.fainted || b.v.semiInvulnerable === 'underground' || b.v.semiInvulnerable === 'underwater') continue;
          const safe = this.weather.kind === 'sandstorm' ? b.types.some((t) => t === 'rock' || t === 'ground' || t === 'steel') || b.ability === 'sand-veil' : b.types.includes('ice');
          if (!safe) this.damage(b, Math.max(1, Math.floor(b.maxHp / 16)), { msg: `${this.Name(b)} is buffeted by the ${this.weather.kind === 'hail' ? 'hail' : 'sandstorm'}!` });
        }
      }
    }
    for (const b of this.speedOrder()) {
      if (b.fainted || b.hp <= 0) continue;
      const v = b.v;
      if (v.ingrain) this.heal(b, Math.max(1, Math.floor(b.maxHp / 16)), `${this.Name(b)} absorbed nutrients with its roots!`);
      if (b.ability === 'shed-skin' && b.status && this.roll(3) === 0) this.cureStatus(b, `${this.Name(b)}'s Shed Skin cured its status!`);
      if (b.ability === 'speed-boost' && !v.firstTurn) this.changeStat(b, 'spe', 1, true);
      if (this.holdEffect(b) === 'leftovers') this.heal(b, Math.max(1, Math.floor(b.maxHp / 16)));
      if (v.seededBy !== undefined) {
        const seeder = this.active[v.seededBy];
        const sap = this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)}'s health is sapped by Leech Seed!` });
        if (seeder && !seeder.fainted) {
          if (b.ability === 'liquid-ooze') this.damage(seeder, sap, { msg: `${this.Name(seeder)} sucked up the liquid ooze!` });
          else this.heal(seeder, sap);
        }
      }
      if (b.hp <= 0) continue;
      if (b.status === 'poison') this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)} is hurt by poison!` });
      if (b.status === 'toxic') {
        b.toxicCount = Math.min(15, b.toxicCount + 1);
        this.damage(b, Math.max(1, Math.floor((b.maxHp / 16) * b.toxicCount)), { msg: `${this.Name(b)} is hurt by poison!` });
      }
      if (b.status === 'burn') this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)} is hurt by its burn!` });
      if (v.nightmare && b.status === 'sleep') this.damage(b, Math.max(1, Math.floor(b.maxHp / 4)), { msg: `${this.Name(b)} is locked in a nightmare!` });
      if (v.cursed) this.damage(b, Math.max(1, Math.floor(b.maxHp / 4)), { msg: `${this.Name(b)} is afflicted by the curse!` });
      if (v.trapped) {
        if (--v.trapped.turns <= 0) {
          this.text(`${this.Name(b)} was freed from ${moveData(v.trapped.move).name}!`);
          delete v.trapped;
        } else this.damage(b, Math.max(1, Math.floor(b.maxHp / 16)), { msg: `${this.Name(b)} is hurt by ${moveData(v.trapped.move).name}!` });
      }
      if (v.uproar && --v.uproar <= 0) {
        delete v.uproar;
        this.text(`${this.Name(b)} calmed down.`);
      }
      if (v.disabled && --v.disabled.turns <= 0) {
        delete v.disabled;
        this.text(`${this.Name(b)} is no longer disabled!`);
      }
      if (v.encore && --v.encore.turns <= 0) delete v.encore;
      if (v.taunt && --v.taunt <= 0) delete v.taunt;
      if (v.charged) v.charged -= 1;
      if (v.yawn && --v.yawn === 0) {
        delete v.yawn;
        if (this.canStatus(b, 'sleep', null)) this.setStatus(b, 'sleep', null);
      }
      if (this.holdEffect(b) === 'restore_hp' && b.hp <= Math.floor(b.maxHp / 2) && b.item) {
        const amount = itemData(b.item).holdParam;
        this.emit({ t: 'item', side: b.side, item: b.item, msg: `${this.Name(b)}'s ${itemData(b.item).name} restored health!` });
        b.usedItem = b.item;
        b.item = null;
        this.heal(b, amount);
      }
    }
    for (const side of [0, 1] as Side[]) {
      const fs = this.sides[side].futureSight;
      if (fs && --fs.turns === 0) {
        const b = this.active[side];
        delete this.sides[side].futureSight;
        if (!b.fainted) {
          this.text(`${this.Name(b)} took the ${moveData(fs.from).name} attack!`);
          this.damage(b, fs.damage);
        }
      }
    }
    for (const b of this.speedOrder()) {
      if (b.fainted || b.v.perish === undefined) continue;
      b.v.perish -= 1;
      this.text(`${this.Name(b)}'s perish count fell to ${b.v.perish}!`);
      if (b.v.perish <= 0) this.damage(b, b.hp);
    }
  }

  private speedOrder(): Battler[] {
    const [a, b] = this.active;
    return this.speed(a) >= this.speed(b) ? [a, b] : [b, a];
  }
}


/** Effects with a raised critical-hit ratio. */
const HIGH_CRIT = new Set(['high_critical', 'blaze_kick', 'poison_tail', 'razor_wind', 'sky_attack']);
/** Effects that thaw their user (Flame Wheel, Sacred Fire). */
const THAWING = new Set(['thaw_hit']);

/** Whether a move reaches a semi-invulnerable target (Gust and Thunder the air, Earthquake and Magnitude underground, Surf and Whirlpool underwater). */
function reachesSemi(key: string, move: MoveData, semi: Volatiles['semiInvulnerable']): boolean {
  if (semi === 'air') return ['gust', 'twister', 'thunder', 'sky-uppercut'].includes(key);
  if (semi === 'underground') return move.effect === 'earthquake' || move.effect === 'magnitude';
  if (semi === 'underwater') return key === 'surf' || key === 'whirlpool';
  return true;
}

const targetsSelf = (a: Action) => a.kind === 'move' && moveData(a.move).target === 'user';

/** Hidden Power's type from the IVs (Gen 3). */
export function hiddenPowerType(mon: Mon): TypeName {
  const [hp, atk, def, spa, spd, spe] = mon.ivs;
  const bits = (hp & 1) | ((atk & 1) << 1) | ((def & 1) << 2) | ((spe & 1) << 3) | ((spa & 1) << 4) | ((spd & 1) << 5);
  const types: TypeName[] = ['fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark'];
  return types[Math.floor((bits * 15) / 63)]!;
}

/** An ability's display name. */
export function abilityName(key: string) {
  return key.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

/** What each healing item does (item_effects.h): HP restored, statuses cured, revives. */
/** The share of the game's experience a battle gives (the user's, 2026-10-25: a quarter, slower and more idle). */
export const EXP_RATE = 0.25;

export const MEDICINE: Record<string, { heal?: number | 'full'; cures?: StatusKind[] | 'all'; revive?: 'half' | 'full' }> = {
  potion: { heal: 20 },
  'super-potion': { heal: 50 },
  'hyper-potion': { heal: 200 },
  'max-potion': { heal: 'full' },
  'full-restore': { heal: 'full', cures: 'all' },
  'fresh-water': { heal: 50 },
  'soda-pop': { heal: 60 },
  lemonade: { heal: 80 },
  'moomoo-milk': { heal: 100 },
  'energy-powder': { heal: 50 },
  'energy-root': { heal: 200 },
  'berry-juice': { heal: 20 },
  antidote: { cures: ['poison', 'toxic'] },
  'burn-heal': { cures: ['burn'] },
  'ice-heal': { cures: ['freeze'] },
  awakening: { cures: ['sleep'] },
  'paralyze-heal': { cures: ['paralysis'] },
  'full-heal': { cures: 'all' },
  'heal-powder': { cures: 'all' },
  'lava-cookie': { cures: 'all' },
  revive: { revive: 'half' },
  'max-revive': { revive: 'full' },
  'revival-herb': { revive: 'full' },
};

/**
 * Whether a status move would do nothing now (agreed with the user: it isn't used while its effect is already in place:
 * no Growl at −6, no Sleep Powder on a sleeping target, no Reflect while it's up, no Recover at full HP…).
 */
export function statusUseless(b: Battle, user: Battler, key: string): boolean {
  const m = moveData(key);
  if (m.power > 0) return false;
  const foe = b.foeOf(user);
  const stage = (who: Battler, stat: BattleStat, dir: number) => (dir > 0 ? who.stages[stat] >= 6 : who.stages[stat] <= -6);
  const e = m.effect;
  const raises: Record<string, BattleStat[]> = {
    attack_up: ['atk'], attack_up_2: ['atk'], defense_up: ['def'], defense_up_2: ['def'], defense_curl: ['def'], speed_up_2: ['spe'],
    special_attack_up: ['spa'], special_attack_up_2: ['spa'], special_defense_up_2: ['spd'], evasion_up: ['eva'], minimize: ['eva'],
    accuracy_up: ['acc'], bulk_up: ['atk', 'def'], calm_mind: ['spa', 'spd'], cosmic_power: ['def', 'spd'], dragon_dance: ['atk', 'spe'],
  };
  const lowers: Record<string, BattleStat[]> = {
    attack_down: ['atk'], attack_down_2: ['atk'], defense_down: ['def'], defense_down_2: ['def'], speed_down: ['spe'], speed_down_2: ['spe'],
    special_defense_down_2: ['spd'], accuracy_down: ['acc'], evasion_down: ['eva'], tickle: ['atk', 'def'],
  };
  if (raises[e]) return raises[e].every((s) => stage(user, s, 1));
  if (lowers[e]) return lowers[e].every((s) => stage(foe, s, -1)) || foe.v.substitute !== undefined || b.sides[foe.side].mist > 0;
  switch (e) {
    case 'sleep':
      return !b.canStatus(foe, 'sleep', user) || foe.v.substitute !== undefined;
    case 'yawn':
      return !b.canStatus(foe, 'sleep', user) || !!foe.v.yawn;
    case 'poison':
    case 'toxic':
      return !b.canStatus(foe, e === 'toxic' ? 'toxic' : 'poison', user) || foe.v.substitute !== undefined;
    case 'paralyze':
      return !b.canStatus(foe, 'paralysis', user) || foe.v.substitute !== undefined || (m.type === 'electric' && b.immune(user, foe, 'electric'));
    case 'will_o_wisp':
      return !b.canStatus(foe, 'burn', user) || foe.v.substitute !== undefined;
    case 'confuse':
    case 'teeter_dance':
      return !!foe.v.confused || foe.ability === 'own-tempo' || foe.v.substitute !== undefined;
    case 'swagger':
    case 'flatter':
      return !!foe.v.confused || foe.ability === 'own-tempo';
    case 'attract':
      return foe.v.attractedTo !== undefined || !user.mon.gender || !foe.mon.gender || user.mon.gender === foe.mon.gender || foe.ability === 'oblivious';
    case 'leech_seed':
      return foe.v.seededBy !== undefined || foe.types.includes('grass');
    case 'reflect':
      return b.sides[user.side].reflect > 0;
    case 'light_screen':
      return b.sides[user.side].lightScreen > 0;
    case 'mist':
      return b.sides[user.side].mist > 0;
    case 'safeguard':
      return b.sides[user.side].safeguard > 0;
    case 'spikes':
      return b.sides[foe.side].spikes >= 3 || b.setup.kind === 'wild' || !b.foes.some((f) => !f.fainted && f !== b.active[1]) && foe.side === 1;
    case 'rain_dance':
      return b.weather?.kind === 'rain';
    case 'sunny_day':
      return b.weather?.kind === 'sun';
    case 'sandstorm':
      return b.weather?.kind === 'sandstorm';
    case 'hail':
      return b.weather?.kind === 'hail';
    case 'substitute':
      return user.v.substitute !== undefined || user.hp <= Math.floor(user.maxHp / 4);
    case 'restore_hp':
    case 'softboiled':
    case 'synthesis':
    case 'moonlight':
    case 'morning_sun':
    case 'swallow':
      return user.hp === user.maxHp || (e === 'swallow' && !user.v.stockpile);
    case 'rest':
      return user.hp === user.maxHp || user.status === 'sleep' || !b.canStatus({ ...user, status: null } as Battler, 'sleep', null);
    case 'wish':
      return !!b.sides[user.side].wish || user.hp === user.maxHp;
    case 'focus_energy':
      return !!user.v.focusEnergy;
    case 'haze':
      return b.active.every((x) => BATTLE_STATS.every((s) => x.stages[s] === 0));
    case 'mean_look':
      return !!foe.v.meanLook;
    case 'foresight':
      return !!foe.v.foresight;
    case 'lock_on':
      return !!user.v.lockOn;
    case 'ingrain':
      return !!user.v.ingrain;
    case 'charge':
      return !!user.v.charged;
    case 'stockpile':
      return (user.v.stockpile ?? 0) >= 3;
    case 'disable':
      return !!foe.v.disabled || !foe.lastMove;
    case 'encore':
      return !!foe.v.encore || !foe.lastMove;
    case 'taunt':
      return !!foe.v.taunt;
    case 'torment':
      return !!foe.v.torment;
    case 'imprison':
      return !!user.v.imprison;
    case 'nightmare':
      return foe.status !== 'sleep' || !!foe.v.nightmare;
    case 'curse':
      return user.types.includes('ghost') ? !!foe.v.cursed : stage(user, 'atk', 1) && stage(user, 'def', 1);
    case 'belly_drum':
      return user.hp <= Math.floor(user.maxHp / 2) || user.stages.atk >= 6;
    case 'perish_song':
      return foe.v.perish !== undefined;
    case 'heal_bell':
    case 'refresh':
      return !user.status;
    case 'mud_sport':
      return !!b.sides[user.side].mudSport;
    case 'water_sport':
      return !!b.sides[user.side].waterSport;
    case 'transform':
      return !!user.v.transformed;
    case 'protect':
    case 'endure':
      return (user.v.protectStreak ?? 0) > 0;
    case 'follow_me':
    case 'helping_hand':
    case 'baton_pass':
    case 'teleport':
    case 'splash':
      return true;
    case 'destiny_bond':
      return !!user.v.destinyBond;
    case 'psych_up':
      return BATTLE_STATS.every((s) => foe.stages[s] === user.stages[s]);
    case 'camouflage':
    case 'conversion':
      return !!user.v.transformed;
  }
  return false;
}

/** Plays a battle out from its setup with the RNG (advanced in place). */
export function simulateBattle(setup: BattleSetup, rng: Rng): BattleOutcome {
  return new Battle(setup, rng).run();
}

/** A wild or trainer's Pokémon for a battle: its moves the given ones or its last 4 level-up moves, its slots the 3 strongest. */
export function opponentMon(mon: Mon, moves?: string[]): Mon {
  const known = moves ?? lastFourMoves(mon.species, mon.level);
  return { ...mon, moves: known, slots: autoSlots({ species: mon.species, moves: known }), autoSlots: true };
}
