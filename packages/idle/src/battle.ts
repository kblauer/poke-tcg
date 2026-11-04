// The Idle Adventure's battles (README: Idle Adventure): real Gen 3 single battles (FireRed's rules: pokefirered's
// battle_main.c, battle_script_commands.c, pokemon.c's CalculateBaseDamage, battle_util.c), played by themselves one
// turn a tick. Each tick both Pokémon act, the faster first (items before moves, then priority, then Speed, ties
// random), then the end-of-turn effects. Moves are picked by the cooldown rule (mon.ts; ai.ts) instead of PP. The whole
// battle is resolved at once from the seeded RNG and returned as an event log the browser plays back.
// Johto's battles play by HeartGold's rules instead (the generation's battleRules 4, `gen4`; issue #170): the same
// battles with Gen 4's changes from pokeheartgold (src/battle/: CalcMoveDamage, TryCriticalHit, ov12_02251D28's types),
// marked where they differ; a Gen 4 move's effect is named as Gen 3's where Gen 3 has it (data/gen2/moves.ts).
// Simplifications, agreed or forced by the mode: no switching but a fainted Pokémon's replacement (the next in party
// order) and Roar/Whirlwind; a wild Pokémon never runs; the party is healed after every battle by the run, not here.
import { int, type Rng } from '@poke-tcg/campaign';
import { attemptCatch } from './catch.js';
import { effectiveness, isPhysical, itemData, moveData, species } from './data.js';
import { generation } from './generation.js';
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
  /** Auto-catch's hits: the basic move, or the first slot's move when it's a damaging one that's ready (idle.ts's IdleSettings.catchMove; ai.ts). */
  catchMove?: 'basic' | 'slot';
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
  /** The player's own throws (the battle's ball button, the user's): from each tick listed, the best ball once, as soon as one can be thrown (a wild battle's). */
  throwAt?: number[];
  /** Debug (IdleState.debugCatch): every ball thrown catches. */
  sureCatch?: boolean;
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
  /** A trapping move's turns left, the move, and the side whose Pokémon trapped it (it ends as that one leaves). */
  trapped?: { turns: number; move: string; by?: Side };
  /** Can't escape (Mean Look, Block): nothing to escape from in these battles, kept for Baton Pass's sake. */
  meanLook?: boolean;
  attractedTo?: Side;
  focusEnergy?: boolean;
  /** A two-turn move's first turn done (Solar Beam, Fly…): the move comes next turn. */
  charging?: string;
  /** Out of reach mid-move: Fly and Bounce in the air, Dig underground, Dive underwater, Gen 4's Shadow Force vanished (nothing reaches it). */
  semiInvulnerable?: 'air' | 'underground' | 'underwater' | 'vanished';
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
  /** Gen 4's Stockpile: the Defense and Sp. Def stages it raised, taken back by Spit Up and Swallow. */
  stockpileDef?: number;
  stockpileSpd?: number;
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
  /** Gen 4's: turns since it came out with Slow Start; the Metronome item's moves in a row; Roost used this turn; Miracle Eye on it. */
  slowStart?: number;
  metronomeTurns?: number;
  roosted?: boolean;
  miracleEye?: boolean;
  /** Gen 4's lasting conditions: Magnet Rise's, Heal Block's and Embargo's turns left; Aqua Ring; Power Trick swapped. */
  magnetRise?: number;
  healBlock?: number;
  embargo?: number;
  aquaRing?: boolean;
  powerTrick?: boolean;
  /** Gen 4's Gastro Acid: the ability it took away (its ability is 'none' meanwhile). */
  suppressedAbility?: string;
  /** Gen 4's Last Resort: the other moves it has used since it came out. */
  usedMoves?: string[];
  /** Gen 4's Trump Card: its uses this battle, as the PP it would have spent (5). */
  trumpUses?: number;
  /** Lost HP this turn (Gen 4's Assurance), and the last damage a foe's move did to it this turn (Metal Burst). */
  lostHp?: boolean;
  lastHit?: { dealt: number; by: Side };
  /** Gen 4's Me First: the copied move's damage 1.5x. */
  meFirst?: boolean;
  /** Gen 4's abilities' state: Trace done, Truant's first acting tick (it loafs every other tick from it), an item held (Unburden). */
  traced?: boolean;
  truantFrom?: number;
  hadItem?: boolean;
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
  /**
   * The status moves in its slots still to use once, first, in the slots' order (the user's: slots set by hand, not the
   * automatic pick; chooseMove), against each foe Pokémon sent out (refilled at each, openersOf). Each one used is taken
   * off; until the next foe it goes by power as any slot move (status moves after attacks, before the basic move).
   */
  openers: string[];
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
    this.openers = openersOf(mon);
    this.basic = basicFor(mon);
    this.item = mon.item ?? null;
    void badges;
  }

  get level() {
    return this.mon.level;
  }

  /** Whether it can fall for `other` (Attract, Cute Charm): both gendered, opposite genders, not already in love. */
  attractable(other: Battler) {
    return this.v.attractedTo === undefined && !!this.mon.gender && !!other.mon.gender && this.mon.gender !== other.mon.gender;
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
  /** Future Sight and Doom Desire: the turns left, the damage, the move, and (Gen 4) the side that used it, for its accuracy. */
  futureSight?: { turns: number; damage: number; from: string; user?: Side };
  wish?: { turns: number; hp: number };
  mudSport?: boolean;
  waterSport?: boolean;
  /** Gen 4's Lucky Chant: no critical hits on this side, for its turns. */
  luckyChant?: number;
  /** Gen 4's: Tailwind's turns (Speed 2x), Toxic Spikes' layers, Stealth Rock, a Healing Wish or Lunar Dance for the next Pokémon sent out. */
  tailwind?: number;
  toxicSpikes?: number;
  stealthRock?: boolean;
  healingWish?: 'wish' | 'dance';
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
  /** The weather and its turns left; `permanent` (a weather ability's) never wears off, only another weather replaces it. */
  weather: { kind: Weather; turns: number; permanent?: boolean } | null = null;
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
  /** Auto-catch (ai.ts): the player's hits that did damage to the wild Pokémon, the most each move did, and whether the balls have started (no more hits then). */
  catchHits = 0;
  catchDamage: Record<string, number> = {};
  catchBalls = false;
  /** The player's own throws made so far (BattleSetup.throwAt). */
  throwsMade = 0;
  participated = new Set<number>();
  /** The move used last in the battle (Mirror Move's fallback is none). */
  lastMoveUsed: string | null = null;
  /** HeartGold's rules (the generation's battleRules 4): the physical/special split, Gen 4's damage and critical hits. */
  gen4: boolean;
  /** Gen 4's Gravity and Trick Room: their turns left. */
  gravity = 0;
  trickRoom = 0;
  /** This turn's chosen actions (Gen 4's Sucker Punch and Me First read the foe's). */
  turnActions: [Action, Action] | null = null;

  constructor(setup: BattleSetup, rng: Rng) {
    this.rng = rng;
    this.setup = setup;
    this.bag = { ...setup.bag };
    this.foeItems = [...(setup.foeItems ?? [])];
    this.party = setup.party.map((m, i) => new Battler(0, i, structuredClone(m), setup.badges));
    this.foes = setup.foes.map((m, i) => new Battler(1, i, structuredClone(m), 0));
    this.active = [this.party[0]!, this.foes[0]!];
    this.gen4 = generation().battleRules === 4;
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
    if (this.gen4) return this.speed4(b);
    let s = this.staged(b, 'spe');
    if ((b.ability === 'swift-swim' && this.isWeather('rain')) || (b.ability === 'chlorophyll' && this.isWeather('sun'))) s *= 2;
    if (b.status === 'paralysis') s = Math.floor(s / 4);
    if (b.item && itemData(b.item).hold === 'macho_brace') s = Math.floor(s / 2);
    return s;
  }

  /**
   * Gen 4's Speed (CheckSortSpeed): Simple doubling its stage; Swift Swim and Chlorophyll; the Choice Scarf; the Macho
   * Brace, the Iron Ball and the Power items halving it; Slow Start halving it for 5 turns; Quick Feet in place of the
   * paralysis quarter.
   */
  private speed4(b: Battler) {
    const stage = b.ability === 'simple' ? Math.max(-6, Math.min(6, b.stages.spe * 2)) : b.stages.spe;
    let s = this.staged(b, 'spe', stage);
    if ((b.ability === 'swift-swim' && this.isWeather('rain')) || (b.ability === 'chlorophyll' && this.isWeather('sun'))) s *= 2;
    const hold = this.holdEffect(b);
    const raw = b.item ? itemData(b.item).hold : 'none';
    if (hold === 'choice_speed') s = Math.floor((s * 15) / 10);
    if (raw === 'evs_up_speed_down' || raw === 'speed_down_grounded' || raw.startsWith('lvlup_')) s = Math.floor(s / 2);
    if (b.ability === 'slow-start' && (b.v.slowStart ?? 0) < 5) s = Math.floor(s / 2);
    // Unburden: twice as fast once the item it held is gone.
    if (b.ability === 'unburden' && b.v.hadItem && !b.item) s *= 2;
    if (b.ability === 'quick-feet' && b.status) s = Math.floor((s * 15) / 10);
    else if (b.status === 'paralysis') s = Math.floor(s / 4);
    if (this.sides[b.side].tailwind) s *= 2;
    return s;
  }

  /** A held item's hold effect (none under Gen 4's Embargo). */
  holdEffect(b: Battler) {
    return b.item && !(this.gen4 && (b.v.embargo || b.ability === 'klutz')) ? itemData(b.item).hold : 'none';
  }

  // ---- HP ----
  /** Lowers HP (never below 0), with its line; faints are checked after the action (checkFaints). */
  damage(b: Battler, amount: number, extra: { crit?: boolean; eff?: number; msg?: string } = {}) {
    const dealt = Math.min(b.hp, Math.max(0, amount));
    b.hp -= dealt;
    if (dealt > 0) b.v.lostHp = true;
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
      // White Smoke as Clear Body (both generations); Gen 4's Mold Breaker on the other side gets past them (BtlCmd_ChangeStatStage).
      const has = (a: string) => (this.gen4 ? this.targetHas(this.foeOf(b), b, a) : b.ability === a);
      if (has('clear-body') || has('white-smoke') || (has('hyper-cutter') && stat === 'atk') || (has('keen-eye') && stat === 'acc')) {
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
    if (this.gen4) return this.canStatus4(b, kind, from);
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

  /**
   * Gen 4's status immunities (the status subscripts): Gen 3's, an attacker's Mold Breaker getting past the abilities,
   * Leaf Guard in sun (all but freezing), a Soundproof Pokémon sleeping through an uproar.
   */
  private canStatus4(b: Battler, kind: StatusKind, from: Battler | null): boolean {
    const has = (a: string) => (from && from.side !== b.side ? this.targetHas(from, b, a) : b.ability === a);
    if (kind !== 'freeze' && has('leaf-guard') && this.isWeather('sun')) return false;
    switch (kind) {
      case 'sleep':
        return !has('insomnia') && !has('vital-spirit') && !(this.active.some((x) => x.v.uproar) && b.ability !== 'soundproof');
      case 'poison':
      case 'toxic':
        return !has('immunity') && !b.types.includes('poison') && !b.types.includes('steel');
      case 'burn':
        return !has('water-veil') && !b.types.includes('fire');
      case 'paralysis':
        return !has('limber');
      case 'freeze':
        return !has('magma-armor') && !b.types.includes('ice') && !this.isWeather('sun');
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
    const ownTempo = this.gen4 && from && from.side !== b.side ? this.targetHas(from, b, 'own-tempo') : b.ability === 'own-tempo';
    if (b.fainted || b.v.confused || ownTempo) return false;
    if (from && from.side !== b.side && this.sides[b.side].safeguard) return false;
    b.v.confused = (this.random16() & 3) + 2;
    this.text(`${this.Name(b)} became confused!`);
    return true;
  }

  // ---- Damage ----
  /** Whether a damaging move is physical: by Gen 4's rules its own category (the split), by Gen 3's its type's. */
  physical(move: MoveData, type: TypeName) {
    return this.gen4 ? move.category === 'physical' : isPhysical(type);
  }

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

  /** Whether the target has an ability the user's Mold Breaker doesn't ignore (CheckBattlerAbilityIfNotIgnored). */
  targetHas(user: Battler, target: Battler, ability: string) {
    return target.ability === ability && user.ability !== 'mold-breaker';
  }

  /**
   * Gen 4's critical hit (TryCriticalHit): its stage from Focus Energy (+2), the Scope Lens, the move (high-crit
   * effects +1), Super Luck, the Lucky Punch on Chansey and the Stick on Farfetch'd (+2 each), at most 4; Battle and
   * Shell Armor and Lucky Chant stop it. Returns the damage multiplier: 1, 2, or 3 with Sniper.
   */
  critMultiplier4(user: Battler, target: Battler, move: MoveData): number {
    const hold = this.holdEffect(user);
    let stage = (user.v.focusEnergy ? 2 : 0) + (hold === 'critrate_up' ? 1 : 0) + (HIGH_CRIT.has(move.effect) ? 1 : 0) + (user.ability === 'super-luck' ? 1 : 0);
    if (hold === 'chansey_critrate_up' && user.species === 113) stage += 2;
    if (hold === 'farfetchd_critrate_up' && user.species === 83) stage += 2;
    stage = Math.min(stage, CRIT_CHANCE.length - 1);
    if (this.random16() % CRIT_CHANCE[stage]! !== 0) return 1;
    if (this.targetHas(user, target, 'battle-armor') || this.targetHas(user, target, 'shell-armor') || this.sides[target.side].luckyChant) return 1;
    return user.ability === 'sniper' ? 3 : 2;
  }

  /**
   * A hit's damage by Gen 4's rules, in pokeheartgold's order: CalcMoveDamage (the power's and the stats' abilities and
   * items, the stages (Simple, Unaware), the category's stats, burn, the screens, the weather, Flash Fire, + 2), then
   * DamageCalcDefault's critical multiplier, the Life Orb and the Metronome, ApplyDamageRange's random 85–100%, then
   * ov12_02251D28's STAB (Adaptability), each type in turn (typeSteps4), Filter and Solid Rock, the Expert Belt and Tinted
   * Lens. Returns the damage and the type multiplier.
   */
  damage4(
    user: Battler,
    target: Battler,
    move: MoveData,
    o: { key: string; power: number; type: TypeName; crit: number; noRandom?: boolean; typeless?: boolean; selfHit?: boolean },
  ): { damage: number; eff: number } {
    const type = user.ability === 'normalize' ? 'normal' : o.type;
    const hold = this.holdEffect(user);
    const mod = user.item ? itemData(user.item).holdParam : 0;
    const targetHold = this.holdEffect(target);
    const physical = move.category === 'physical';
    let power = o.power;
    let atk = user.stats.atk;
    let def = target.stats.def;
    let spa = user.stats.spa;
    let spd = target.stats.spd;
    if (user.v.charged && type === 'electric') power *= 2;
    if (user.ability === 'technician' && o.key !== 'struggle' && power <= 60) power = Math.floor((power * 15) / 10);
    if (user.ability === 'huge-power' || user.ability === 'pure-power') atk *= 2;
    if (user.ability === 'slow-start' && (user.v.slowStart ?? 0) < 5) atk = Math.floor(atk / 2);
    if (TYPE_ENHANCERS4[hold] === type) power = Math.floor((power * (100 + mod)) / 100);
    if (hold === 'choice_atk') atk = Math.floor((atk * 150) / 100);
    if (hold === 'choice_spatk') spa = Math.floor((spa * 150) / 100);
    if (hold === 'lati_special' && (user.species === 380 || user.species === 381)) spa = Math.floor((spa * 150) / 100);
    if (targetHold === 'lati_special' && (target.species === 380 || target.species === 381)) spd = Math.floor((spd * 150) / 100);
    if (hold === 'clamperl_spatk' && user.species === 366) spa *= 2;
    if (targetHold === 'clamperl_spdef' && target.species === 366) spd *= 2;
    if (hold === 'pika_spatk_up' && user.species === 25) power *= 2;
    if (targetHold === 'ditto_def_up' && target.species === 132) def *= 2;
    if (hold === 'cubone_atk_up' && (user.species === 104 || user.species === 105)) atk *= 2;
    if (hold === 'dialga_boost' && (type === 'dragon' || type === 'steel') && user.species === 483) power = Math.floor((power * (100 + mod)) / 100);
    if (hold === 'palkia_boost' && (type === 'dragon' || type === 'water') && user.species === 484) power = Math.floor((power * (100 + mod)) / 100);
    if (hold === 'giratina_boost' && (type === 'dragon' || type === 'ghost') && !user.v.transformed && user.species === 487) power = Math.floor((power * (100 + mod)) / 100);
    if (hold === 'power_up_phys' && physical) power = Math.floor((power * (100 + mod)) / 100);
    if (hold === 'power_up_spec' && move.category === 'special') power = Math.floor((power * (100 + mod)) / 100);
    if (this.targetHas(user, target, 'thick-fat') && (type === 'fire' || type === 'ice')) power = Math.floor(power / 2);
    if (user.ability === 'hustle') atk = Math.floor((atk * 150) / 100);
    if (user.ability === 'guts' && user.status) atk = Math.floor((atk * 150) / 100);
    if (this.targetHas(user, target, 'marvel-scale') && target.status) def = Math.floor((def * 150) / 100);
    if (type === 'electric' && this.sides.some((s) => s.mudSport)) power = Math.floor(power / 2);
    if (type === 'fire' && this.sides.some((s) => s.waterSport)) power = Math.floor(power / 2);
    const pinch = user.hp <= Math.floor(user.maxHp / 3);
    if (pinch && ((type === 'grass' && user.ability === 'overgrow') || (type === 'fire' && user.ability === 'blaze') || (type === 'water' && user.ability === 'torrent') || (type === 'bug' && user.ability === 'swarm'))) {
      power = Math.floor((power * 150) / 100);
    }
    if (type === 'fire' && this.targetHas(user, target, 'heatproof')) power = Math.floor(power / 2);
    if (type === 'fire' && this.targetHas(user, target, 'dry-skin')) power = Math.floor((power * 125) / 100);
    const clamp = (s: number) => Math.max(-6, Math.min(6, s));
    let atkStage = user.stages.atk;
    let spaStage = user.stages.spa;
    let defStage = target.stages.def;
    let spdStage = target.stages.spd;
    if (user.ability === 'simple') [atkStage, spaStage] = [clamp(atkStage * 2), clamp(spaStage * 2)];
    if (this.targetHas(user, target, 'simple')) [defStage, spdStage] = [clamp(defStage * 2), clamp(spdStage * 2)];
    if (this.targetHas(user, target, 'unaware')) [atkStage, spaStage] = [0, 0];
    if (user.ability === 'unaware') [defStage, spdStage] = [0, 0];
    if (user.ability === 'rivalry' && user.mon.gender && target.mon.gender) power = Math.floor((power * (user.mon.gender === target.mon.gender ? 125 : 75)) / 100);
    if (user.ability === 'iron-fist' && PUNCHING_MOVES.has(o.key)) power = Math.floor((power * 12) / 10);
    if (this.weatherOn()) {
      if (this.isWeather('sun') && user.ability === 'solar-power') spa = Math.floor((spa * 15) / 10);
      if (this.isWeather('sandstorm') && target.types.includes('rock')) spd = Math.floor((spd * 15) / 10);
      if (this.isWeather('sun') && user.ability === 'flower-gift') atk = Math.floor((atk * 15) / 10);
      if (this.isWeather('sun') && user.ability !== 'mold-breaker' && target.ability === 'flower-gift') spd = Math.floor((spd * 15) / 10);
    }
    if (move.effect === 'explosion') def = Math.floor(def / 2);
    const staged = (value: number, stage: number) => Math.floor((value * STAGE_RATIOS[stage + 6]![0]) / STAGE_RATIOS[stage + 6]![1]);
    const crit = o.crit > 1;
    let damage = 0;
    if (move.category !== 'status') {
      const [a, aStage, d, dStage] = physical ? [atk, atkStage, def, defStage] : [spa, spaStage, spd, spdStage];
      // A critical hit ignores the attacker's lowered and the target's raised stages, and the screens.
      damage = crit && aStage <= 0 ? a : staged(a, aStage);
      damage = damage * power * (Math.floor((user.level * 2) / 5) + 2);
      damage = Math.floor(damage / (crit && dStage >= 0 ? d : staged(d, dStage)));
      damage = Math.floor(damage / 50);
      if (physical && user.status === 'burn' && user.ability !== 'guts') damage = Math.floor(damage / 2);
      const screen = physical ? this.sides[target.side].reflect : this.sides[target.side].lightScreen;
      if (screen && !crit && move.effect !== 'brick_break' && !o.selfHit) damage = Math.floor(damage / 2);
    }
    // A confused Pokémon's hit on itself is worked out with no screens and no weather (sideCondition, fieldCondition 0).
    if (this.weatherOn() && !o.selfHit) {
      if (this.isWeather('rain')) {
        if (type === 'fire') damage = Math.floor(damage / 2);
        if (type === 'water') damage = Math.floor((damage * 15) / 10);
      }
      if (!this.isWeather('sun') && o.key === 'solar-beam') damage = Math.floor(damage / 2);
      if (this.isWeather('sun')) {
        if (type === 'fire') damage = Math.floor((damage * 15) / 10);
        if (type === 'water') damage = Math.floor(damage / 2);
      }
    }
    if (user.v.flashFire && type === 'fire') damage = Math.floor((damage * 15) / 10);
    damage += 2;
    // DamageCalcDefault: the critical multiplier, the Life Orb, the Metronome; then ApplyDamageRange.
    damage *= o.crit;
    if (hold === 'hp_drain_on_atk') damage = Math.floor((damage * (100 + mod)) / 100);
    if (hold === 'boost_repeated') damage = Math.floor((damage * (10 + (user.v.metronomeTurns ?? 0))) / 10);
    if (user.v.meFirst) damage = Math.floor((damage * 15) / 10);
    if (!o.noRandom) damage = Math.floor((damage * (100 - (this.random16() % 16))) / 100);
    if (damage === 0) damage = 1;
    // ov12_02251D28: Struggle takes none of it, nor Future Sight's stored damage or a confused Pokémon's hit on itself.
    if (o.key === 'struggle' || o.typeless || o.selfHit) return { damage, eff: 1 };
    if (user.types.includes(type)) damage = user.ability === 'adaptability' ? damage * 2 : Math.floor((damage * 15) / 10);
    let eff = 1;
    for (const m of this.typeSteps4(user, target, type)) {
      if (damage) damage = divide(damage * m * 10, 10);
      eff *= m;
    }
    if (eff > 1 && move.power) {
      if (this.targetHas(user, target, 'filter') || this.targetHas(user, target, 'solid-rock')) damage = divide(damage * 3, 4);
      if (hold === 'power_up_se') damage = Math.floor((damage * (100 + mod)) / 100);
    }
    if (eff > 0 && eff < 1 && move.power && user.ability === 'tinted-lens') damage *= 2;
    return { damage, eff };
  }

  /**
   * Gen 4's type chart for one hit (ov12_02251D28, ov12_02251C74): each row for the move's type against the target's
   * first type, then its second (when it's another), in the chart's order; the rows after the Foresight marker (the
   * Ghost immunities) skipped altogether once Foresight or Scrappy is in play; the Iron Ball, Ingrain and Gravity lifting
   * Flying's Ground immunity, Roost taking Flying away for the turn, Miracle Eye lifting Dark's Psychic immunity.
   */
  typeSteps4(user: Battler, target: Battler, type: TypeName): number[] {
    const out: number[] = [];
    const [t1, t2] = target.types;
    for (const [attack, defend, mul, lifted] of generation().typeChart) {
      if (lifted && (target.v.foresight || user.ability === 'scrappy')) break;
      if (attack !== type) continue;
      const kept =
        !(defend === 'flying' && mul === 0 && (this.holdEffect(target) === 'speed_down_grounded' || target.v.ingrain || this.gravity)) &&
        !(defend === 'flying' && target.v.roosted) &&
        !(defend === 'dark' && mul === 0 && target.v.miracleEye);
      if (!kept) continue;
      if (defend === t1) out.push(mul);
      if (t2 && t2 !== t1 && defend === t2) out.push(mul);
    }
    return out;
  }

  /** Whether the target is out of the move's reach (Fly, Dig, Dive: a sure-hit move still misses it). */
  outOfReach(ctx: MoveCtx) {
    const semi = ctx.target.v.semiInvulnerable;
    return !!semi && !reachesSemi(ctx.key, ctx.move, semi);
  }

  /** Whether a move can't touch the target for its type (immunity, Levitate vs Ground; Wonder Guard isn't in Kanto). */
  immune(user: Battler, target: Battler, type: TypeName) {
    if (this.gen4) {
      // Gen 4: Levitate and Magnet Rise unless grounded (Gravity, the Iron Ball, Ingrain); the chart as typeSteps4 reads it.
      const grounded = this.gravity || this.holdEffect(target) === 'speed_down_grounded' || target.v.ingrain;
      if (type === 'ground' && !grounded && (this.targetHas(user, target, 'levitate') || target.v.magnetRise)) return true;
      return this.typeSteps4(user, target, type).includes(0);
    }
    if (type === 'ground' && target.ability === 'levitate') return true;
    return effectiveness(type, target.types, !!target.v.foresight) === 0;
  }

  /** The move's type for this use (Hidden Power, Weather Ball…), from its effect if it changes it. */
  moveType(user: Battler, move: MoveData): TypeName {
    // Gen 4's Normalize: every move Normal, before Hidden Power, Weather Ball, Judgment (BattleSystem_GetMoveType).
    if (this.gen4 && user.ability === 'normalize') return 'normal';
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
    // Gen 4: Lock-On and No Guard hit before the out-of-reach check (BattleSystem_CheckMoveHit).
    if (this.gen4 && (user.v.lockOn || user.ability === 'no-guard' || target.ability === 'no-guard')) return true;
    const semi = target.v.semiInvulnerable;
    if (semi && !reachesSemi(key, move, semi)) return false;
    if (user.v.lockOn) return true;
    if (move.effect === 'thunder' && this.isWeather('rain')) return true;
    // Gen 4: Blizzard never misses in hail (BattleSystem_CheckMoveEffect).
    if (this.gen4 && move.effect === 'blizzard' && this.isWeather('hail')) return true;
    if (move.accuracy === 0) return true;
    let buff = user.stages.acc + (target.v.foresight ? 0 : -target.stages.eva);
    if (this.gen4) {
      // Gen 4 (BattleSystem_CheckMoveHit): Simple doubles the stages, Unaware ignores the other's; Foresight and
      // Miracle Eye ignore only raised evasion.
      let acc = user.ability === 'simple' ? user.stages.acc * 2 : user.stages.acc;
      let eva = target.ability === 'simple' ? target.stages.eva * 2 : target.stages.eva;
      if (this.targetHas(user, target, 'unaware')) acc = 0;
      if (user.ability === 'unaware') eva = 0;
      if ((target.v.foresight || target.v.miracleEye) && eva > 0) eva = 0;
      buff = acc - eva;
    }
    buff = Math.max(-6, Math.min(6, buff));
    let acc = move.effect === 'thunder' && this.isWeather('sun') ? 50 : move.accuracy;
    const [n, d] = ACCURACY_RATIOS[buff + 6]!;
    let calc = Math.floor((n * acc) / d);
    if (user.ability === 'compound-eyes') calc = Math.floor((calc * 130) / 100);
    if ((this.gen4 ? this.targetHas(user, target, 'sand-veil') : target.ability === 'sand-veil') && this.isWeather('sandstorm')) calc = Math.floor((calc * 80) / 100);
    if (user.ability === 'hustle' && this.physical(move, this.moveType(user, move))) calc = Math.floor((calc * 80) / 100);
    if (this.holdEffect(target) === (this.gen4 ? 'acc_reduce' : 'evasion_up')) calc = Math.floor((calc * (100 - itemData(target.item!).holdParam)) / 100);
    if (this.gen4) {
      // Gen 4's: Snow Cloak in hail, Tangled Feet when confused, the Wide Lens, the Zoom Lens once the target has moved, Gravity.
      if (this.targetHas(user, target, 'snow-cloak') && this.isWeather('hail')) calc = Math.floor((calc * 80) / 100);
      if (this.targetHas(user, target, 'tangled-feet') && target.v.confused) calc = Math.floor((calc * 50) / 100);
      const hold = this.holdEffect(user);
      if (hold === 'accuracy_up') calc = Math.floor((calc * (100 + itemData(user.item!).holdParam)) / 100);
      if (hold === 'critrate_up_slower' && this.movedThisTurn.has(target.side)) calc = Math.floor((calc * (100 + itemData(user.item!).holdParam)) / 100);
      if (this.gravity) calc = Math.floor((calc * 10) / 6);
    }
    acc = (this.random16() % 100) + 1;
    return acc <= calc;
  }

  /** Whether the target's ability takes this move's type in (Volt Absorb, Water Absorb, Flash Fire), healing or powering up. */
  absorbs(user: Battler, target: Battler, type: TypeName, move: MoveData): boolean {
    if (user === target || move.target === 'user') return false;
    if (this.gen4) return this.absorbs4(user, target, type, move);
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
  /**
   * The ability that would take a move in, by Gen 4's rules (BattleContext_CheckMoveImmunityFromAbility; Mold Breaker
   * gets past all of them): Volt Absorb and Motor Drive any Electric move, Water Absorb and Dry Skin a damaging Water one,
   * Flash Fire a damaging Fire one or Will-O-Wisp (not while frozen). A plain check (the AI's too).
   */
  absorber4(user: Battler, target: Battler, type: TypeName, move: MoveData): string | null {
    if (user === target || move.target === 'user' || move.target === 'opponents_field') return null;
    const has = (a: string) => this.targetHas(user, target, a);
    if (type === 'electric' && (has('volt-absorb') || has('motor-drive'))) return target.ability;
    if (type === 'water' && move.power > 0 && (has('water-absorb') || has('dry-skin'))) return target.ability;
    if (type === 'fire' && (move.power > 0 || move.effect === 'will_o_wisp') && has('flash-fire') && target.status !== 'freeze') return target.ability;
    return null;
  }

  private absorbs4(user: Battler, target: Battler, type: TypeName, move: MoveData): boolean {
    const a = this.absorber4(user, target, type, move);
    if (!a) return false;
    const name = `${this.Name(target)}'s ${abilityName(a)}`;
    if (a === 'motor-drive') {
      if (target.stages.spe >= 6) this.text(`${name} made ${move.name} useless!`);
      else if (this.changeStat(target, 'spe', 1, true, true)) this.text(`${name} raised its Speed!`);
    } else if (a === 'flash-fire') {
      this.text(target.v.flashFire ? `${name} made ${move.name} ineffective!` : `${name} raised the power of its Fire-type moves!`);
      target.v.flashFire = true;
    } else if (target.hp === target.maxHp) this.text(`${name} made ${move.name} useless!`);
    else this.heal(target, Math.max(1, Math.floor(target.maxHp / 4)), `${this.Name(target)} restored HP using its ${abilityName(a)}!`);
    return true;
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
  strike(ctx: MoveCtx, o: { power?: number; fixed?: number; type?: TypeName; noCrit?: boolean; noRandom?: boolean; leaveOne?: boolean } = {}): { dealt: number; toMon: boolean; crit: boolean; eff: number } {
    const { user, target, move } = ctx;
    const type = o.type ?? ctx.type;
    let damage: number;
    let crit = false;
    let eff = 1;
    if (o.fixed !== undefined) {
      damage = o.fixed;
    } else if (this.gen4) {
      // Gen 4: the random roll comes before STAB and the types (damage4).
      const mult = o.noCrit ? 1 : this.critMultiplier4(user, target, move);
      crit = mult > 1;
      const r = this.damage4(user, target, move, { key: ctx.key, power: o.power ?? ctx.power, type, crit: mult, noRandom: o.noRandom });
      damage = r.damage;
      eff = r.eff;
    } else {
      crit = !o.noCrit && this.critRoll(user, target, move);
      const r = this.baseDamage(user, target, move, { power: o.power ?? ctx.power, type, crit, effect: move.effect });
      damage = r.damage;
      eff = r.eff;
      damage = Math.floor((damage * (100 - (this.random16() % 16))) / 100);
      if (damage === 0) damage = 1;
    }
    damage = Math.floor(damage * ctx.multiplier);
    if (target.v.substitute && user !== target) {
      const dealt = Math.min(target.v.substitute, damage);
      target.v.substitute -= dealt;
      if (crit) this.text('A critical hit!');
      if (crit) this.angerPoint(target);
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
      } else if (this.holdOn(target)) damage = target.hp - 1;
    }
    const dealt = this.damage(target, damage, { crit, eff });
    if (user.side !== target.side) target.v.lastHit = { dealt, by: user.side };
    if (crit) this.text('A critical hit!');
    if (crit) this.angerPoint(target);
    if (eff > 1) this.text("It's super effective!");
    else if (eff > 0 && eff < 1) this.text("It's not very effective…");
    target.v.hitThisTurn = true;
    if (this.physical(move, type)) target.v.physicalHit = dealt;
    else target.v.specialHit = dealt;
    target.lastHitBy = { move: ctx.key, type };
    if (target.v.bide) target.v.bide.damage += dealt;
    if (target.v.rage && dealt > 0 && target.hp > 0) this.changeStat(target, 'atk', 1, true);
    return { dealt, toMon: true, crit, eff };
  }

  /**
   * Whether a held item lets a Pokémon hang on at 1 HP from a hit that would knock it out, with its line: the Focus
   * Band (its param's %; Gen 4's maybe_endure), Gen 4's Focus Sash at full HP (used up).
   */
  holdOn(b: Battler) {
    const hold = this.holdEffect(b);
    if (hold === (this.gen4 ? 'maybe_endure' : 'focus_band') && this.roll(100) < itemData(b.item!).holdParam) {
      this.text(`${this.Name(b)} hung on using its Focus Band!`);
      return true;
    }
    if (this.gen4 && hold === 'endure' && b.hp === b.maxHp) {
      this.text(`${this.Name(b)} hung on using its Focus Sash!`);
      b.usedItem = b.item;
      b.item = null;
      return true;
    }
    return false;
  }

  /** Contact abilities on the attacker after a contact move hit (Static, Flame Body, Poison Point, Effect Spore, Cute Charm). */
  contact(user: Battler, target: Battler, move: MoveData, hit?: { toMon: boolean; dealt: number }) {
    if (!move.flags.includes('makes_contact') || user.fainted || target.ability === 'none') return;
    // Only when the hit damaged the target itself (TARGET_TURN_DAMAGED: not its Substitute; both generations).
    if (hit && (!hit.toMon || hit.dealt <= 0)) return;
    if (this.gen4) return this.contact4(user, target);
    const third = this.roll(3) === 0;
    switch (target.ability) {
      case 'rough-skin':
        if (user.hp > 0) this.damage(user, Math.max(1, Math.floor(user.maxHp / 16)), { msg: `${this.Name(target)}'s Rough Skin hurt ${this.name(user)}!` });
        break;
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

  /**
   * Gen 4's contact abilities (CheckAbilityEffectOnHit): Static, Flame Body, Poison Point and Cute Charm 30% (Cute Charm
   * needing its holder standing, Oblivious suppressing it), Effect Spore 30% then one of its three statuses on an attacker
   * with none, Rough Skin an eighth, Aftermath a quarter from a holder knocked out (not with Damp around); Magic Guard
   * taking neither.
   */
  private contact4(user: Battler, target: Battler) {
    const chance = () => this.random16() % 10 < 3;
    switch (target.ability) {
      case 'static':
        if (chance() && this.canStatus(user, 'paralysis', null)) this.setStatus(user, 'paralysis', target);
        break;
      case 'flame-body':
        if (chance() && this.canStatus(user, 'burn', null)) this.setStatus(user, 'burn', target);
        break;
      case 'poison-point':
        if (chance() && this.canStatus(user, 'poison', null)) this.setStatus(user, 'poison', target);
        break;
      case 'effect-spore':
        if (!user.status && chance()) {
          const kind = (['poison', 'paralysis', 'sleep'] as const)[this.random16() % 3]!;
          if (this.canStatus(user, kind, null)) this.setStatus(user, kind, target);
        }
        break;
      case 'cute-charm':
        if (target.hp > 0 && chance() && user.attractable(target)) {
          if (user.ability === 'oblivious') this.text(`${this.Name(user)}'s Oblivious suppressed ${this.name(target)}'s Cute Charm!`);
          else {
            user.v.attractedTo = target.side;
            this.text(`${this.Name(target)}'s Cute Charm infatuated ${this.name(user)}!`);
          }
        }
        break;
      case 'rough-skin':
        if (!this.magicGuard(user)) this.damage(user, Math.max(1, Math.floor(user.maxHp / 8)), { msg: `${this.Name(target)}'s Rough Skin hurt ${this.name(user)}!` });
        break;
      case 'aftermath':
        if (target.hp <= 0 && !this.magicGuard(user) && !this.active.some((x) => x.hp > 0 && x.ability === 'damp')) {
          this.damage(user, Math.max(1, Math.floor(user.maxHp / 4)), { msg: `${this.Name(user)} was hurt by ${this.name(target)}'s Aftermath!` });
        }
        break;
    }
  }

  /** Gen 4's Anger Point: a critical hit maxes its Attack. */
  private angerPoint(b: Battler) {
    if (!this.gen4 || b.ability !== 'anger-point' || b.hp <= 0 || b.stages.atk >= 6) return;
    const change = 6 - b.stages.atk;
    b.stages.atk = 6;
    this.emit({ t: 'stat', side: b.side, stat: 'atk', change, msg: `${this.Name(b)} maxed its Attack with Anger Point!` });
  }

  /** Gen 4's Color Change: after a hit that hurt it, it becomes the move's type (not Struggle's). */
  colorChange(ctx: MoveCtx, hit: { toMon: boolean; dealt: number }) {
    const { target, key, move } = ctx;
    if (!this.gen4 || target.ability !== 'color-change' || !hit.toMon || hit.dealt <= 0 || target.hp <= 0 || key === 'struggle' || !move.power) return;
    if (target.types.length === 1 && target.types[0] === ctx.type) return;
    target.types = [ctx.type];
    this.text(`${this.Name(target)}'s Color Change made it the ${ctx.type[0]!.toUpperCase() + ctx.type.slice(1)} type!`);
  }

  /** Whether a secondary effect happens: its chance (doubled by Serene Grace), not through Shield Dust or a Substitute. */
  secondaryHappens(ctx: MoveCtx, hit: { toMon: boolean }, chancePercent = ctx.move.chance, onTarget = true): boolean {
    const shieldDust = this.gen4 ? this.targetHas(ctx.user, ctx.target, 'shield-dust') : ctx.target.ability === 'shield-dust';
    if (onTarget && (!hit.toMon || ctx.target.fainted || ctx.target.hp <= 0 || shieldDust)) return false;
    const c = ctx.user.ability === 'serene-grace' ? chancePercent * 2 : chancePercent;
    return c >= 100 || this.random16() % 100 < c;
  }

  // ---- The turn ----
  /** Sends a Pokémon out (at the start, or replacing a fainted one): its line, Spikes, Intimidate, Trace. */
  sendOut(b: Battler, first = false) {
    this.active[b.side] = b;
    b.v.firstTurn = true;
    // A trapping move ends as its user leaves (the one it replaces).
    const other = this.active[b.side === 0 ? 1 : 0];
    if (other?.v.trapped?.by === b.side) delete other.v.trapped;
    if (b.side === 0) this.participated.add(b.index);
    const msg = b.side === 0 ? `Go! ${species(b.species).name}!` : this.setup.kind === 'wild' ? `A wild ${species(b.species).name} appeared!` : `The foe sent out ${species(b.species).name}!`;
    this.emit({ t: 'send', side: b.side, mon: b.view(), msg });
    // A new foe Pokémon (the user's): each of the player's Pokémon opens with its hand-set status moves against it again.
    if (b.side === 1) for (const p of this.party) p.openers = openersOf(p.mon);
    if (!first || b.side === 0) this.noteFacing();
    if (this.gen4) this.hazards4(b);
    else {
      const spikes = this.sides[b.side].spikes;
      if (spikes && !b.types.includes('flying') && b.ability !== 'levitate') {
        this.damage(b, Math.max(1, Math.floor(b.maxHp / ((5 - spikes) * 2))), { msg: `${this.Name(b)} is hurt by spikes!` });
      }
    }
    this.entryAbility(b);
    if (this.gen4) {
      b.v.hadItem = !!b.item;
      b.v.truantFrom = this.tick;
      // A Trace with nothing to copy tries the new foe (TryAbilityOnEntry, after every action).
      const other = this.active[b.side === 0 ? 1 : 0];
      if (other && other !== b && other.ability === 'trace' && !other.v.traced && !other.fainted) this.entryAbility(other);
    }
  }

  /**
   * Gen 4's hazards as a Pokémon comes in (subscript_0099 HazardsCheck): none for Magic Guard; Toxic Spikes (a grounded
   * Poison type takes them away; poison, or bad poison from 2 layers), Spikes (both for grounded Pokémon only: not Flying,
   * Levitate or Magnet Rise unless Gravity or the Iron Ball holds it down), Stealth Rock (by Rock's effectiveness on it);
   * then a Healing Wish or Lunar Dance waiting for it.
   */
  private hazards4(b: Battler) {
    const side = this.sides[b.side];
    if (!this.magicGuard(b)) {
      const grounded = this.gravity > 0 || this.holdEffect(b) === 'speed_down_grounded' || !(b.types.includes('flying') || b.ability === 'levitate' || b.v.magnetRise);
      if (side.toxicSpikes && grounded) {
        if (b.types.includes('poison')) {
          side.toxicSpikes = 0;
          this.text(`The poison spikes disappeared from around ${b.side === 0 ? 'your' : "the foe's"} team's feet!`);
        } else {
          const kind = side.toxicSpikes >= 2 ? 'toxic' : 'poison';
          if (this.canStatus(b, kind, null)) this.setStatus(b, kind, null);
        }
      }
      if (side.spikes && grounded) this.damage(b, Math.max(1, Math.floor(b.maxHp / ((5 - side.spikes) * 2))), { msg: `${this.Name(b)} is hurt by spikes!` });
      if (side.stealthRock && b.hp > 0) {
        const eff = this.typeSteps4(b, b, 'rock').reduce((m, x) => m * x, 1);
        this.damage(b, Math.max(1, Math.floor((b.maxHp * eff) / 8)), { msg: `Pointed stones dug into ${this.name(b)}!` });
      }
    }
    if (side.healingWish && b.hp > 0) {
      const dance = side.healingWish === 'dance';
      delete side.healingWish;
      this.text(dance ? 'It became cloaked in mystical moonlight!' : 'The healing wish came true!');
      this.cureStatus(b);
      if (dance) {
        b.cooldowns = {};
        this.emit({ t: 'cooldown', side: b.side, cooldowns: {} });
      }
      this.heal(b, b.maxHp, `${this.Name(b)} regained health!`);
    }
  }

  private entryAbility(b: Battler): void {
    const foe = this.foeOf(b);
    // A weather ability starts its weather for good (Drizzle, Drought, Sand Stream; Gen 4's Snow Warning), unless it's on for good already.
    const weather = ({ drizzle: 'rain', drought: 'sun', 'sand-stream': 'sandstorm', 'snow-warning': 'hail' } as const)[b.ability as 'drizzle'];
    if (weather && !(this.weather?.kind === weather && this.weather.permanent) && !(b.ability === 'snow-warning' && !this.gen4)) {
      this.weather = { kind: weather, turns: 0, permanent: true };
      const line = { drizzle: 'made it rain!', drought: "intensified the sun's rays!", 'sand-stream': 'whipped up a sandstorm!', 'snow-warning': 'whipped up a hailstorm!' }[b.ability as 'drizzle'];
      this.emit({ t: 'weather', weather, msg: `${this.Name(b)}'s ${abilityName(b.ability)} ${line}` });
    }
    if (this.gen4) return this.entryAbility4(b);
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

  /**
   * Gen 4's entry abilities in TryAbilityOnEntry's order: Trace (not Trace, Forecast or Multitype; tried again as the next
   * foe comes in), Intimidate (not through a Substitute, one line), Download, Anticipation, Forewarn, Frisk, Slow Start,
   * Mold Breaker and Pressure's lines; then Forecast and the abilities curing a status it has (CheckStatusHealAbility).
   */
  private entryAbility4(b: Battler): void {
    const foe = this.foeOf(b);
    const up = !!foe && !foe.fainted && foe.hp > 0;
    if (b.ability === 'trace' && !b.v.traced && up && !['trace', 'forecast', 'multitype', 'none'].includes(foe.ability)) {
      b.v.traced = true;
      b.ability = foe.ability;
      this.text(`${this.Name(b)} traced ${this.name(foe)}'s ${abilityName(foe.ability)}!`);
      return this.entryAbility(b);
    }
    if (b.ability === 'intimidate' && up && !foe.v.substitute) {
      const blocker = ['hyper-cutter', 'clear-body', 'white-smoke'].find((a) => foe.ability === a);
      if (this.sides[foe.side].mist) this.text(`${this.Name(foe)} is protected by Mist!`);
      else if (blocker) this.text(`${this.Name(foe)}'s ${abilityName(blocker)} suppressed ${this.name(b)}'s Intimidate!`);
      else if (foe.stages.atk > -6) {
        foe.stages.atk -= 1;
        this.emit({ t: 'stat', side: foe.side, stat: 'atk', change: -1, msg: `${this.Name(b)}'s Intimidate cuts ${this.name(foe)}'s Attack!` });
      }
    }
    if (b.ability === 'download' && up && !foe.v.substitute) this.changeStat(b, this.staged(foe, 'def') >= this.staged(foe, 'spd') ? 'spa' : 'atk', 1, true);
    if (b.ability === 'anticipation' && up && this.shudders(b, foe)) this.text(`${this.Name(b)}'s Anticipation made it shudder!`);
    if (b.ability === 'forewarn' && up) {
      const known = [...new Set([...foe.slots, foe.basic])];
      const rank = (k: string) => {
        const m = moveData(k);
        if (m.power !== 1) return m.power;
        return m.effect === 'ohko' ? 150 : ['counter', 'mirror_coat', 'metal_burst'].includes(m.effect) ? 120 : 80;
      };
      let pick = known[this.random16() % known.length]!;
      let best = 0;
      for (const k of known) if (rank(k) > best || (rank(k) === best && best > 0 && this.random16() & 1)) [pick, best] = [k, rank(k)];
      this.text(`${this.Name(b)}'s Forewarn alerted it to ${moveData(pick).name}!`);
    }
    if (b.ability === 'frisk' && up && foe.item) this.text(`${this.Name(b)} frisked its foe and found one ${itemData(foe.item).name}!`);
    if (b.ability === 'slow-start') {
      b.v.slowStart = 0;
      this.text(`${this.Name(b)} can't get it going because of its Slow Start!`);
    }
    if (b.ability === 'mold-breaker') this.text(`${this.Name(b)} breaks the mold!`);
    if (b.ability === 'pressure') this.text(`${this.Name(b)} is exerting its Pressure!`);
    this.forecast();
    this.statusHeal4(b);
  }

  /** Gen 4's Anticipation (TryAbilityOnEntry): a foe's move super effective on it (or a one-hit KO move it can land). */
  private shudders(b: Battler, foe: Battler) {
    const fixed = new Set(['dragon_rage', 'level_damage', 'psywave', 'counter', 'mirror_coat', 'metal_burst', 'explosion']);
    return [...new Set([...foe.slots, foe.basic])].some((k) => {
      const m = moveData(k);
      if (fixed.has(m.effect)) return false;
      if (m.effect === 'ohko') return b.level <= foe.level;
      const type = foe.ability === 'normalize' ? 'normal' : m.type;
      return !this.immune(foe, b, type) && this.typeSteps4(foe, b, type).reduce((x, y) => x * y, 1) > 1;
    });
  }

  /** Forecast (Castform): Fire in sun, Water in rain, Ice in hail, Normal otherwise or with Cloud Nine or Air Lock out. */
  forecast() {
    for (const b of this.active) {
      if (b.fainted || b.hp <= 0 || b.ability !== 'forecast' || b.species !== 351) continue;
      const t: TypeName = !this.weatherOn() ? 'normal' : ({ sun: 'fire', rain: 'water', hail: 'ice', sandstorm: 'normal' } as const)[this.weather!.kind];
      if (b.types.length === 1 && b.types[0] === t) continue;
      b.types = [t];
      this.text(`${this.Name(b)} transformed!`);
    }
  }

  /**
   * Gen 4's abilities curing a status their holder has anyway (CheckStatusHealAbility: after each action and on entry):
   * Immunity poison, Water Veil a burn, Insomnia and Vital Spirit sleep, Limber paralysis, Magma Armor a freeze, Own Tempo
   * confusion, Oblivious infatuation.
   */
  statusHeal4(b: Battler) {
    if (!this.gen4 || b.fainted || b.hp <= 0) return;
    const cures: Record<string, StatusKind[]> = { immunity: ['poison', 'toxic'], 'water-veil': ['burn'], insomnia: ['sleep'], 'vital-spirit': ['sleep'], limber: ['paralysis'], 'magma-armor': ['freeze'] };
    if (b.status && cures[b.ability]?.includes(b.status)) return void this.cureStatus(b, `${this.Name(b)}'s ${abilityName(b.ability)} cured its problem!`);
    if (b.ability === 'own-tempo' && b.v.confused) {
      delete b.v.confused;
      this.text(`${this.Name(b)}'s Own Tempo snapped it out of confusion!`);
    }
    if (b.ability === 'oblivious' && b.v.attractedTo !== undefined) {
      delete b.v.attractedTo;
      this.text(`${this.Name(b)}'s Oblivious cured its infatuation!`);
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
    this.turnActions = actions;
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
      if (this.gen4) {
        // After each action: the status-curing abilities (the mover, then the other) and Forecast.
        this.statusHeal4(b);
        this.statusHeal4(this.foeOf(b));
        this.forecast();
      }
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
      Object.assign(b.v, { flinch: false, protect: false, endure: false, helpingHand: false, magicCoat: false, snatch: false, hitThisTurn: false, physicalHit: 0, specialHit: 0, firstTurn: false, roosted: false, lostHp: false });
      delete b.v.lastHit;
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
    // Quick Claw (Gen 4's sometimes_priority): first, its param's % of the time, one roll for the turn (gRandomTurnNumber).
    const claws = this.active.map((b) => ['quick_claw', 'sometimes_priority'].includes(this.holdEffect(b)));
    const turnRoll = claws.some(Boolean) ? this.random16() : 0;
    const quick = (s: Side) => claws[s] && turnRoll < Math.floor((0xffff * itemData(this.active[s].item!).holdParam) / 100);
    let s0 = quick(0) ? Infinity : this.speed(this.active[0]);
    let s1 = quick(1) ? Infinity : this.speed(this.active[1]);
    if (this.gen4) {
      // Gen 4 (CheckSortSpeed): the Lagging Tail and Full Incense, then Stall, last among the same priority.
      const last = (b: Battler) => (this.holdEffect(b) === 'speed_down' ? 2 : b.ability === 'stall' ? 1 : 0);
      const [l0, l1] = [last(this.active[0]), last(this.active[1])];
      if (l0 !== l1 && !quick(0) && !quick(1)) [s0, s1] = l0 > l1 ? [0, 1] : [1, 0];
      // Trick Room: the slower first, after the claws and the items and abilities that move last.
      else if (this.trickRoom && quick(0) === quick(1) && s0 !== s1) [s0, s1] = [s1, s0];
    }
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
    if (this.gen4 && (this.banned4(b, key) || (key === 'last-resort' && !this.lastResortReady(b)) || (key === 'trump-card' && (b.v.trumpUses ?? 0) >= 5))) return false;
    return true;
  }

  /** A move Gen 4's Gravity or Heal Block won't let it use (sGravityUnusableMoves, sHealBlockUnusableMoves). */
  banned4(b: Battler, key: string) {
    return (this.gravity > 0 && GRAVITY_BANNED.has(key)) || (!!b.v.healBlock && HEAL_BLOCKED.has(key));
  }

  /** Whether Gen 4's Last Resort can work: it knows another move, and has used every other move it knows since it came out. */
  lastResortReady(b: Battler) {
    const known = [...new Set([...b.slots, b.basic])].filter((k) => k !== 'last-resort');
    return known.length >= 1 && known.every((k) => b.v.usedMoves?.includes(k));
  }

  /** Whether a slot move is ready (off cooldown), can be picked and would do something (statusUseless). */
  ready(b: Battler, key: string): boolean {
    return !b.cooldowns[key] && this.selectable(b, key) && !statusUseless(this, b, key);
  }

  /** A slot move used: it cools down for its cooldownTicks (the basic move and Struggle never do). */
  startCooldown(b: Battler, key: string) {
    if (key === b.basic || key === 'struggle' || !b.slots.includes(key)) return;
    // Gen 4's Pressure, the extra PP it costs as a tick longer to cool down (moves aimed at it: not the user's own side's).
    const target = moveData(key).target;
    const pressure = this.gen4 && this.foeOf(b).ability === 'pressure' && target !== 'user' && target !== 'user_side' ? 1 : 0;
    b.cooldowns[key] = cooldownTicks(key) + pressure;
    this.emit({ t: 'cooldown', side: b.side, cooldowns: { ...b.cooldowns } });
  }

  /**
   * The move a Pokémon uses this turn: one it's locked into (a two-turn move's second turn, Thrash, Rollout, Uproar,
   * Bide, Encore), else a status move set by hand still to use once against this foe Pokémon (`openers`, the user's: first,
   * above any attack; one that isn't ready waits), else (the user's, 2026-10-25, replacing the energy rule) the slot move with the
   * highest power (movePower; status moves last, the slots' order breaking ties) that's ready, which then cools down;
   * else its basic move (Struggle if even that can't be used).
   */
  chooseMove(b: Battler): string {
    const forced = b.v.charging ?? b.v.rampage?.move ?? (b.v.rollout && b.lastMove) ?? (b.v.uproar && b.lastMove) ?? (b.v.bide && 'bide') ?? null;
    if (forced) return forced;
    if (b.v.encore && this.selectable(b, b.v.encore.move)) return b.v.encore.move;
    const opener = b.openers.find((k) => b.slots.includes(k) && this.ready(b, k));
    if (opener) {
      b.openers = b.openers.filter((k) => k !== opener);
      this.startCooldown(b, opener);
      return opener;
    }
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
      // Gen 4's Copycat copies nothing after a turn a Pokémon couldn't move (moveNoPrev).
      if (this.gen4) this.lastMoveUsed = null;
      // A turn it couldn't move ends its locks (two-turn moves, Thrash, Rollout, Bide), as the game's cancelled multi-turn moves.
      delete b.v.charging;
      delete b.v.semiInvulnerable;
      delete b.v.rollout;
      delete b.v.bide;
      if (b.v.rampage) delete b.v.rampage;
      return;
    }
    // The player's move on a wild Pokémon: what it did, for auto-catch's next hits (ai.ts).
    const foe = this.active[1];
    const before = b.side === 0 && this.setup.kind === 'wild' ? foe.hp : null;
    this.useMove(b, action.move);
    if (before !== null && this.active[1] === foe && before > foe.hp) {
      this.catchHits += 1;
      this.catchDamage[action.move] = Math.max(this.catchDamage[action.move] ?? 0, before - foe.hp);
    }
  }

  /**
   * What stops a Pokémon from moving (AtkCanceller_UnableToUseMove): recharging, sleep (waking up on its counter's last
   * turn and moving: Gen 3), freeze (a 1 in 5 thaw), flinching, Disable, Taunt, confusion (half the time hurting itself
   * with a 40-power typeless hit), paralysis (1 in 4), attraction (half the time).
   */
  private canMove(b: Battler, move: string): boolean {
    if (b.v.recharging && !this.gen4) {
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
      // Gen 4: Flare Blitz thaws its user too.
      const thaws = THAWING.has(moveData(move).effect) || (this.gen4 && moveData(move).effect === 'recoil_burn_hit');
      if (this.roll(5) === 0 || thaws) this.cureStatus(b, `${this.Name(b)} was defrosted!`);
      else {
        this.text(`${this.Name(b)} is frozen solid!`);
        return false;
      }
    }
    if (this.gen4) {
      // Gen 4's Truant (CheckTruant: every other turn from its first, after sleep and freeze), then recharging.
      if (b.ability === 'truant' && b.v.truantFrom !== undefined && (this.tick - b.v.truantFrom) % 2 === 0) {
        b.v.recharging = false;
        this.text(`${this.Name(b)} is loafing around!`);
        return false;
      }
      if (b.v.recharging) {
        b.v.recharging = false;
        this.text(`${this.Name(b)} must recharge!`);
        return false;
      }
    }
    if (b.v.flinch) {
      this.text(`${this.Name(b)} flinched!`);
      // Gen 4's Steadfast: its Speed up 1 (subscript_0015_Flinched).
      if (this.gen4 && b.ability === 'steadfast') this.changeStat(b, 'spe', 1, true);
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
        const hurt = this.random16() & 1;
        if (hurt && this.gen4) {
          // Gen 4 (ov12_0224B528): Struggle's damage at 40 power on itself, with the random roll, the items and abilities
          // CalcMoveDamage reads and no screens or weather; straight to it past a Substitute, the hold-on items too.
          let dmg = this.damage4(b, b, moveData('struggle'), { key: 'struggle', power: 40, type: 'normal', crit: 1, selfHit: true }).damage;
          if (dmg >= b.hp && (b.v.endure || this.holdOn(b))) dmg = b.hp - 1;
          this.damage(b, dmg, { msg: 'It hurt itself in its confusion!' });
          return false;
        }
        if (hurt) {
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
    // Gen 4's Magic Guard is never fully paralyzed.
    if (b.status === 'paralysis' && !this.magicGuard(b) && this.roll(4) === 0) {
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
    // Gen 4: Gravity's and Heal Block's moves fail as they're used (ov12_0224B1FC).
    if (this.gen4 && this.banned4(user, realKey)) {
      return void this.text(`${this.Name(user)} can't use ${move.name} because of ${this.gravity && GRAVITY_BANNED.has(realKey) ? 'gravity' : 'Heal Block'}!`);
    }
    // Gen 4's Last Resort counts every other move used since it came out; Trump Card its uses.
    if (this.gen4 && realKey !== 'last-resort') user.v.usedMoves = [...new Set([...(user.v.usedMoves ?? []), realKey])];
    if (this.gen4 && realKey === 'trump-card') user.v.trumpUses = (user.v.trumpUses ?? 0) + (this.foeOf(user).ability === 'pressure' ? 2 : 1);
    if (!called) {
      delete user.v.destinyBond;
      delete user.v.grudge;
      if (realKey !== 'rage') delete user.v.rage;
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
    if ((this.gen4 ? this.targetHas(user, target, 'soundproof') : target.ability === 'soundproof') && (SOUND_MOVES.has(ctx.key) || (this.gen4 && SOUND_MOVES4.has(ctx.key)))) {
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
    if (this.wonderGuards(user, target, ctx.key, move, ctx.type)) {
      this.text(`${this.Name(target)} avoided damage by using Wonder Guard!`);
      return false;
    }
    return true;
  }

  /**
   * Whether Wonder Guard stops a damaging move that isn't super effective (Gen 3's and Gen 4's; Gen 4's Mold Breaker gets
   * past it). Struggle passes, and Gen 4's Fire Fang by its bug (ov12_02258440).
   */
  wonderGuards(user: Battler, target: Battler, key: string, move: MoveData, type: TypeName) {
    if (move.power === 0 || key === 'struggle' || user === target) return false;
    if (this.gen4) return this.targetHas(user, target, 'wonder-guard') && move.effect !== 'flinch_burn_hit' && this.typeSteps4(user, target, type).reduce((m, x) => m * x, 1) <= 1;
    return target.ability === 'wonder-guard' && effectiveness(type, target.types, !!target.v.foresight) <= 1;
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
    const { caught, shakes } = this.setup.sureCatch ? { caught: true, shakes: 4 } : attemptCatch(this.rng, { catchRate: species(target.species).catchRate, maxHp: target.maxHp, hp: target.hp, status: target.status, ball: item });
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
   * Pokémon that faced it, fainted or not (the user's, 2026-10-26), the rest of the party half each (Gen 6's Exp. Share: agreed), 1.5× for a
   * trainer's; each also gains its EV yield. Level-ups raise the
   * stats at once (its HP by as much as its max HP) and teach the level's moves (all kept; the slots follow if automatic).
   */
  private gainExp(foe: Battler) {
    const faced = [...(this.facedBy.get(foe.index) ?? [])].map((i) => this.party[i]!);
    if (!faced.length) return;
    const s = species(foe.species);
    let each = Math.floor(Math.floor((s.baseExp * foe.level) / 7) / faced.length);
    if (each === 0) each = 1;
    if (this.setup.kind === 'trainer') each = Math.floor((each * 150) / 100);
    // A quarter of the game's (the user's, 2026-10-25: slower, more idle), at least 1.
    each = Math.max(1, Math.floor(each * EXP_RATE));
    // The rest of the party gets half each (Gen 6's Exp. Share; agreed with the user, 2026-10-25), fainted ones too.
    const rest = this.party.filter((b) => !faced.includes(b));
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
          // The player's (only their Pokémon gain experience): with their bag's TMs.
          mon.slots = autoSlots(mon, this.bag);
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
      // Gen 4's Tailwind and Lucky Chant, after Safeguard (UFC_STATE_TAILWIND, UFC_STATE_LUCKY_CHANT).
      if (s.tailwind && --s.tailwind === 0) this.text(`${side === 0 ? 'Your' : "The foe's"} team's tailwind petered out!`);
      if (s.luckyChant && --s.luckyChant === 0) this.text(`${side === 0 ? 'Your' : "The foe's"} team's Lucky Chant wore off!`);
      if (s.wish && --s.wish.turns === 0) {
        const b = this.active[side];
        // Gen 4 (UFC_STATE_WISH): half the max HP of whoever is there now.
        if (!b.fainted && this.gen4 && b.v.healBlock) this.text(`${this.Name(b)} was prevented from healing due to Heal Block!`);
        else if (!b.fainted) this.heal(b, this.gen4 ? Math.max(1, Math.floor(b.maxHp / 2)) : s.wish.hp, `${this.Name(b)}'s wish came true!`);
        delete s.wish;
      }
    }
    if (this.weather) {
      if (!this.weather.permanent) this.weather.turns -= 1;
      if (!this.weather.permanent && this.weather.turns <= 0) {
        this.emit({ t: 'weather', weather: null, msg: ({ rain: 'The rain stopped.', sun: 'The sunlight faded.', sandstorm: 'The sandstorm subsided.', hail: 'The hail stopped.' })[this.weather.kind] });
        this.weather = null;
      } else if (this.weatherOn() && (this.weather.kind === 'sandstorm' || this.weather.kind === 'hail')) {
        for (const b of this.speedOrder()) {
          if (b.fainted || b.v.semiInvulnerable === 'underground' || b.v.semiInvulnerable === 'underwater') continue;
          if (this.gen4 && this.weather.kind === 'hail' && b.ability === 'ice-body') {
            if (b.hp < b.maxHp) this.heal(b, Math.max(1, Math.floor(b.maxHp / 16)), `${this.Name(b)}'s Ice Body restored its HP!`);
            continue;
          }
          // Gen 4: Snow Cloak too; Magic Guard takes none (BtlCmd_EndOfTurnWeatherEffect).
          const safe = this.weather.kind === 'sandstorm' ? b.types.some((t) => t === 'rock' || t === 'ground' || t === 'steel') || b.ability === 'sand-veil' : b.types.includes('ice') || (this.gen4 && b.ability === 'snow-cloak');
          if (!safe && !this.magicGuard(b)) this.damage(b, Math.max(1, Math.floor(b.maxHp / 16)), { msg: `${this.Name(b)} is buffeted by the ${this.weather.kind === 'hail' ? 'hail' : 'sandstorm'}!` });
        }
      }
      if (this.weather && this.weatherOn()) {
        for (const b of this.speedOrder()) {
          if (b.fainted || b.hp <= 0) continue;
          const kind = this.weather.kind;
          // Rain Dish (ABILITYEFFECT_ENDTURN); Gen 4's Dry Skin, Hydration, Solar Power.
          // Rain Dish only below full HP (ABILITYEFFECT_ENDTURN: maxHP > hp).
          if (kind === 'rain' && b.ability === 'rain-dish' && b.hp < b.maxHp) this.heal(b, Math.max(1, Math.floor(b.maxHp / 16)), `${this.Name(b)}'s Rain Dish restored its HP!`);
          if (!this.gen4) continue;
          if (kind === 'rain' && b.ability === 'dry-skin' && b.hp < b.maxHp) this.heal(b, Math.max(1, Math.floor(b.maxHp / 8)), `${this.Name(b)}'s Dry Skin restored its HP!`);
          if (kind === 'rain' && b.ability === 'hydration' && b.status) this.cureStatus(b, `${this.Name(b)}'s Hydration cured its status!`);
          const hidden = b.v.semiInvulnerable === 'underground' || b.v.semiInvulnerable === 'underwater';
          if (kind === 'sun' && (b.ability === 'dry-skin' || b.ability === 'solar-power') && !this.magicGuard(b) && !hidden) this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)}'s ${abilityName(b.ability)} hurt it!` });
        }
      }
    }
    // Gen 4's Gravity, after the weather (UFC_STATE_GRAVITY).
    if (this.gravity && --this.gravity === 0) this.text('Gravity returned to normal!');
    for (const b of this.speedOrder()) {
      if (b.fainted || b.hp <= 0) continue;
      const v = b.v;
      if (v.ingrain) {
        if (this.gen4 && v.healBlock) this.text(`${this.Name(b)} was prevented from healing due to Heal Block!`);
        else this.heal(b, Math.max(1, Math.floor(b.maxHp / 16)), `${this.Name(b)} absorbed nutrients with its roots!`);
      }
      // Gen 4's Aqua Ring, after Ingrain (UMC_STATE_AQUA_RING): the Big Root heals more, Heal Block not at all.
      if (v.aquaRing && b.hp < b.maxHp) {
        if (v.healBlock) this.text(`${this.Name(b)} was prevented from healing due to Heal Block!`);
        else {
          const amount = Math.max(1, Math.floor(b.maxHp / 16));
          this.heal(b, this.holdEffect(b) === 'leech_boost' ? Math.floor((amount * (100 + itemData(b.item!).holdParam)) / 100) : amount, `Aqua Ring restored ${this.name(b)}'s HP!`);
        }
      }
      // Shed Skin: 30% in Gen 4 (ov12_02253068), a third in Gen 3.
      if (b.ability === 'shed-skin' && b.status && (this.gen4 ? this.random16() % 10 < 3 : this.roll(3) === 0)) this.cureStatus(b, `${this.Name(b)}'s Shed Skin cured its status!`);
      // Speed Boost: nothing at +6 (both generations check the stage first).
      if (b.ability === 'speed-boost' && !v.firstTurn && b.stages.spe < 6) this.changeStat(b, 'spe', 1, true);
      const hold = this.holdEffect(b);
      if (hold === (this.gen4 ? 'hp_restore_gradual' : 'leftovers')) this.heal(b, Math.max(1, Math.floor(b.maxHp / 16)));
      // Gen 4's Black Sludge: a Poison type's Leftovers, the others hurt.
      if (this.gen4 && hold === 'hp_restore_psn_type') {
        if (b.types.includes('poison')) this.heal(b, Math.max(1, Math.floor(b.maxHp / 16)));
        else if (!this.magicGuard(b)) this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)} is hurt by its Black Sludge!` });
      }
      if (v.seededBy !== undefined) {
        const seeder = this.active[v.seededBy];
        // Nothing while the seeder's place is empty (its HP 0); Gen 4: none for Magic Guard, the Big Root healing more.
        if (seeder && seeder.hp > 0 && !this.magicGuard(b)) {
          const sap = this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)}'s health is sapped by Leech Seed!` });
          const heal = this.gen4 && this.holdEffect(seeder) === 'leech_boost' ? Math.floor((sap * (100 + itemData(seeder.item!).holdParam)) / 100) : sap;
          // Liquid Ooze hurts by the sap the Big Root grew (Gen 4), a Magic Guard seeder not at all (subscript_0069).
          if (b.ability === 'liquid-ooze') {
            if (this.magicGuard(seeder)) this.text(`${this.Name(seeder)}'s Magic Guard suppressed ${this.name(b)}'s Liquid Ooze!`);
            else this.damage(seeder, this.gen4 ? heal : sap, { msg: `${this.Name(seeder)} sucked up the liquid ooze!` });
          }
          else if (this.gen4 && seeder.v.healBlock) this.text(`${this.Name(seeder)} was prevented from healing due to Heal Block!`);
          else this.heal(seeder, heal);
        }
      }
      if (b.hp <= 0) continue;
      if ((b.status === 'poison' || b.status === 'toxic') && this.gen4 && b.ability === 'poison-heal') {
        // Gen 4's Poison Heal: an eighth back instead (not at full HP); the toxic count still goes up.
        if (b.status === 'toxic') b.toxicCount = Math.min(15, b.toxicCount + 1);
        if (b.hp < b.maxHp) this.heal(b, Math.max(1, Math.floor(b.maxHp / 8)), `${this.Name(b)}'s Poison Heal restored its HP!`);
      } else if (!this.magicGuard(b)) {
        if (b.status === 'poison') this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)} is hurt by poison!` });
        if (b.status === 'toxic') {
          b.toxicCount = Math.min(15, b.toxicCount + 1);
          this.damage(b, Math.max(1, Math.floor(b.maxHp / 16)) * b.toxicCount, { msg: `${this.Name(b)} is hurt by poison!` });
        }
        // Gen 4's Heatproof halves a burn's damage.
        if (b.status === 'burn') this.damage(b, Math.max(1, Math.floor(b.maxHp / (this.gen4 && b.ability === 'heatproof' ? 16 : 8))), { msg: `${this.Name(b)} is hurt by its burn!` });
        if (v.nightmare && b.status === 'sleep') this.damage(b, Math.max(1, Math.floor(b.maxHp / 4)), { msg: `${this.Name(b)} is locked in a nightmare!` });
        if (v.cursed) this.damage(b, Math.max(1, Math.floor(b.maxHp / 4)), { msg: `${this.Name(b)} is afflicted by the curse!` });
      } else if (b.status === 'toxic') b.toxicCount = Math.min(15, b.toxicCount + 1);
      if (v.trapped) {
        if (--v.trapped.turns <= 0) {
          this.text(`${this.Name(b)} was freed from ${moveData(v.trapped.move).name}!`);
          delete v.trapped;
        } else if (!this.magicGuard(b)) this.damage(b, Math.max(1, Math.floor(b.maxHp / 16)), { msg: `${this.Name(b)} is hurt by ${moveData(v.trapped.move).name}!` });
      }
      // Gen 4's Bad Dreams: a sleeper loses an eighth for each foe with it (UMC_STATE_BAD_DREAMS, after binding).
      const foe = this.foeOf(b);
      if (this.gen4 && b.status === 'sleep' && foe.ability === 'bad-dreams' && foe.hp > 0 && !this.magicGuard(b)) this.damage(b, Math.max(1, Math.floor(b.maxHp / 8)), { msg: `${this.Name(b)} is tormented by ${this.name(foe)}'s Bad Dreams!` });
      // Gen 4's Slow Start counts the turns since it came out: done after 5.
      if (this.gen4 && b.ability === 'slow-start' && v.slowStart !== undefined && v.slowStart < 5 && ++v.slowStart === 5) this.text(`${this.Name(b)} finally got its act together!`);
      // Gen 4: an uproar wakes the sleepers at each end of turn, but a Soundproof one.
      if (this.gen4 && b.status === 'sleep' && b.ability !== 'soundproof' && this.active.some((x) => x.v.uproar)) this.cureStatus(b, `${this.Name(b)} woke up in the uproar!`);
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
      // Gen 4's Magnet Rise, Heal Block, Embargo, after Taunt and before Yawn.
      if (v.magnetRise && --v.magnetRise === 0) {
        delete v.magnetRise;
        this.text(`${this.Name(b)}'s electromagnetism wore off!`);
      }
      if (v.healBlock && --v.healBlock === 0) {
        delete v.healBlock;
        this.text(`${this.Name(b)}'s Heal Block wore off!`);
      }
      if (v.embargo && --v.embargo === 0) {
        delete v.embargo;
        this.text(`${this.Name(b)} can use items again!`);
      }
      if (v.yawn && --v.yawn === 0) {
        delete v.yawn;
        if (this.canStatus(b, 'sleep', null)) this.setStatus(b, 'sleep', null);
      }
      if (this.holdEffect(b) === (this.gen4 ? 'hp_restore' : 'restore_hp') && b.hp <= Math.floor(b.maxHp / 2) && b.item) {
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
          const by = this.active[fs.user ?? (side === 0 ? 1 : 0)];
          if (this.gen4) {
            // Gen 4 (subscript_0121_FutureSightDamage): it can miss; a Substitute takes it; the hold-on items work.
            if (!this.hits(by, b, moveData(fs.from), fs.from)) this.text('But it failed!');
            else if (b.v.substitute) {
              b.v.substitute -= Math.min(b.v.substitute, fs.damage);
              this.text(`The substitute took damage for ${this.name(b)}!`);
              if (b.v.substitute <= 0) {
                delete b.v.substitute;
                this.text(`${this.Name(b)}'s substitute faded!`);
              }
            } else this.damage(b, fs.damage >= b.hp && (b.v.endure || this.holdOn(b)) ? b.hp - 1 : fs.damage);
          } else this.damage(b, fs.damage);
        }
      }
    }
    // Lock-On's sure hit wears off at the end of the turn after it (STATUS3_ALWAYS_HITS_TURN).
    for (const b of this.active) if (b.v.lockOn && --b.v.lockOn <= 0) delete b.v.lockOn;
    for (const b of this.speedOrder()) {
      if (b.fainted || b.v.perish === undefined) continue;
      // The count shown, then a faint at 0, else it falls (ENDTURN_PERISH_SONG).
      this.text(`${this.Name(b)}'s perish count fell to ${b.v.perish}!`);
      if (b.v.perish === 0) this.damage(b, b.hp);
      else b.v.perish -= 1;
    }
    // Gen 4's Trick Room, last of all (UFCE_STATE_TRICK_ROOM).
    if (this.trickRoom && --this.trickRoom === 0) this.text('The twisted dimensions returned to normal!');
    if (this.gen4) this.forecast();
  }

  /** Gen 4's Magic Guard: no damage but from moves. */
  magicGuard(b: Battler) {
    return this.gen4 && b.ability === 'magic-guard';
  }

  private speedOrder(): Battler[] {
    const [a, b] = this.active;
    return this.speed(a) >= this.speed(b) ? [a, b] : [b, a];
  }
}


/** Gen 4's type-boosting held items and Plates (sTypeEnhancingItems): their power boost's type. */
const TYPE_ENHANCERS4: Record<string, TypeName> = {
  strengthen_bug: 'bug', strengthen_steel: 'steel', strengthen_ground: 'ground', strengthen_rock: 'rock', strengthen_grass: 'grass', strengthen_dark: 'dark',
  strengthen_fight: 'fighting', strengthen_electric: 'electric', strengthen_water: 'water', strengthen_flying: 'flying', strengthen_poison: 'poison',
  strengthen_ice: 'ice', strengthen_ghost: 'ghost', strengthen_psychic: 'psychic', strengthen_fire: 'fire', strengthen_dragon: 'dragon', strengthen_normal: 'normal',
  arceus_fire: 'fire', arceus_water: 'water', arceus_electric: 'electric', arceus_grass: 'grass', arceus_ice: 'ice', arceus_fighting: 'fighting',
  arceus_poison: 'poison', arceus_ground: 'ground', arceus_flying: 'flying', arceus_psychic: 'psychic', arceus_bug: 'bug', arceus_rock: 'rock',
  arceus_ghost: 'ghost', arceus_dragon: 'dragon', arceus_dark: 'dark', arceus_steel: 'steel',
};

/** Iron Fist's moves (sPunchingMoves). */
const PUNCHING_MOVES = new Set(['ice-punch', 'fire-punch', 'thunder-punch', 'mach-punch', 'focus-punch', 'dizzy-punch', 'dynamic-punch', 'hammer-arm', 'mega-punch', 'comet-punch', 'meteor-mash', 'shadow-punch', 'drain-punch', 'bullet-punch', 'sky-uppercut']);

/** Gen 4's DamageDivide: a division that never rounds a non-zero number to 0. */
const divide = (num: number, den: number) => (num === 0 ? 0 : Math.trunc(num / den) || Math.sign(num));

/** Moves Gen 4's Gravity stops (sGravityUnusableMoves) and Heal Block stops (sHealBlockUnusableMoves). */
export const GRAVITY_BANNED = new Set(['fly', 'bounce', 'jump-kick', 'hi-jump-kick', 'splash', 'magnet-rise']);
export const HEAL_BLOCKED = new Set(['recover', 'soft-boiled', 'rest', 'milk-drink', 'morning-sun', 'synthesis', 'moonlight', 'swallow', 'heal-order', 'slack-off', 'roost', 'lunar-dance', 'healing-wish', 'wish']);

/** Gen 4's sound moves beyond Gen 3's, for Soundproof (sSoundMoves). */
const SOUND_MOVES4 = new Set(['bug-buzz', 'chatter']);

/** Effects with a raised critical-hit ratio. */
const HIGH_CRIT = new Set(['high_critical', 'blaze_kick', 'poison_tail', 'razor_wind', 'sky_attack']);
/** Effects that thaw their user (Flame Wheel, Sacred Fire). */
const THAWING = new Set(['thaw_hit']);

/** Whether a move reaches a semi-invulnerable target (Gust and Thunder the air, Earthquake and Magnitude underground, Surf and Whirlpool underwater). */
function reachesSemi(key: string, move: MoveData, semi: Volatiles['semiInvulnerable']): boolean {
  if (semi === 'air') return ['gust', 'twister', 'thunder', 'sky-uppercut'].includes(key);
  if (semi === 'underground') return move.effect === 'earthquake' || move.effect === 'magnitude';
  if (semi === 'underwater') return key === 'surf' || key === 'whirlpool';
  if (semi === 'vanished') return false;
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
  // A drop can't get past Clear Body or White Smoke (Hyper Cutter for Attack, Keen Eye for accuracy).
  const guarded = (s: BattleStat) => {
    // Gen 4 only, so Kanto's picks stay as they were.
    if (!b.gen4) return false;
    const has = (a: string) => b.targetHas(user, foe, a);
    return has('clear-body') || has('white-smoke') || (s === 'atk' && has('hyper-cutter')) || (s === 'acc' && has('keen-eye'));
  };
  if (lowers[e]) return lowers[e].every((s) => stage(foe, s, -1) || guarded(s)) || foe.v.substitute !== undefined || b.sides[foe.side].mist > 0;
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
    // Gen 4's own status moves.
    case 'gravity':
      return b.gravity > 0;
    case 'trick_room':
      return b.trickRoom > 0;
    case 'ignore_evation_remove_dark_immune':
      return !!foe.v.miracleEye;
    case 'double_speed_3_turns':
      return !!b.sides[user.side].tailwind;
    case 'prevent_crits':
      return !!b.sides[user.side].luckyChant;
    case 'random_stat_up_2':
      return user.v.substitute !== undefined || BATTLE_STATS.every((s) => user.stages[s] >= 6);
    case 'prevent_item_use':
      return !!foe.v.embargo || !foe.item;
    case 'prevent_healing':
      return !!foe.v.healBlock;
    case 'swap_atk_def':
      return !!user.v.powerTrick;
    case 'supress_ability':
      return foe.v.suppressedAbility !== undefined || foe.ability === 'none' || foe.ability === 'multitype';
    case 'set_ability_to_insomnia':
      return ['insomnia', 'truant', 'multitype'].includes(foe.ability) || foe.v.substitute !== undefined;
    case 'transfer_status':
      return !user.status || !!foe.status;
    case 'restore_hp_every_turn':
      return !!user.v.aquaRing;
    case 'give_ground_immunity':
      return !!user.v.magnetRise || user.ability === 'levitate' || !!user.v.ingrain || b.gravity > 0;
    case 'sp_atk_down_2_opposite_gender':
      return !user.mon.gender || !foe.mon.gender || user.mon.gender === foe.mon.gender || foe.stages.spa <= -6;
    case 'use_last_used_move':
      return !b.lastMoveUsed;
    // Healing Wish and Lunar Dance only once the user is nearly done for (a quarter of its HP or less), for a teammate.
    case 'faint_and_full_heal_next_mon':
    case 'faint_full_restore_next_mon':
      return user.hp > Math.floor(user.maxHp / 4) || !(user.side === 0 ? b.party : b.foes).some((m) => m !== user && !m.fainted) || (b.setup.kind === 'wild' && user.side === 1);
    // The stage swaps only when they'd gain the user more than it gives.
    case 'swap_atk_sp_atk_stat_changes':
      return foe.stages.atk + foe.stages.spa <= user.stages.atk + user.stages.spa;
    case 'swap_def_sp_def_stat_changes':
      return foe.stages.def + foe.stages.spd <= user.stages.def + user.stages.spd;
    case 'swap_stat_changes':
      return BATTLE_STATS.reduce((n, s) => n + foe.stages[s] - user.stages[s], 0) <= 0;
    case 'toxic_spikes':
      return (b.sides[foe.side].toxicSpikes ?? 0) >= 2 || b.setup.kind === 'wild' || (!b.foes.some((f) => !f.fainted && f !== b.active[1]) && foe.side === 1);
    case 'stealth_rock':
      return !!b.sides[foe.side].stealthRock || b.setup.kind === 'wild' || (!b.foes.some((f) => !f.fainted && f !== b.active[1]) && foe.side === 1);
    case 'remove_hazards_screens_eva_down': {
      const s = b.sides[foe.side];
      return foe.stages.eva <= -6 && !s.reflect && !s.lightScreen && !s.mist && !s.safeguard && !s.spikes && !s.toxicSpikes && !s.stealthRock;
    }
    case 'heal_half_remove_flying_type':
      return user.hp === user.maxHp;
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
      // Rest itself checks Insomnia, Vital Spirit and an uproar only (not Leaf Guard or Safeguard).
      return user.hp === user.maxHp || user.status === 'sleep' || user.ability === 'insomnia' || user.ability === 'vital-spirit' || (b.active.some((x) => x.v.uproar) && !(b.gen4 && user.ability === 'soundproof'));
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

/** A Pokémon's status moves to open with against each foe (Battler.openers): its slots' status moves set by hand, none on the automatic pick. */
const openersOf = (mon: Mon) => (mon.autoSlots ? [] : mon.slots.filter((k) => moveData(k).power === 0));

/** A wild or trainer's Pokémon for a battle: its moves the given ones or its last 4 level-up moves, its slots the 3 strongest. */
export function opponentMon(mon: Mon, moves?: string[]): Mon {
  const known = moves ?? lastFourMoves(mon.species, mon.level);
  return { ...mon, moves: known, slots: autoSlots({ species: mon.species, moves: known }), autoSlots: true };
}
