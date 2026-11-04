// Every move effect (battle_moves.h's EFFECT_, lower case), one implementation each, as the TCG effect tables are: each
// gets the move in use (MoveCtx) and does what FireRed's battle script for it does (data/battle_scripts_1.s), through
// the Battle's helpers (battle.ts). Where there are no PP or no switching in these battles, the closest sense is kept
// (README: Idle Adventure): Spite adds cooldown instead of taking PP, Baton Pass, Follow Me, Helping Hand and Sketch fail.
import type { Battle, Battler, StatusKind, Terrain, Weather } from './battle.js';
import { hiddenPowerType } from './battle.js';
import { allMoveKeys, effectiveness, itemData, moveData, species } from './data.js';
import type { MoveData, TypeName } from './types.js';

/** A move in use: the battle, who uses it on whom, the move (key and data), its type and power for this use. */
export interface MoveCtx {
  b: Battle;
  user: Battler;
  target: Battler;
  key: string;
  move: MoveData;
  type: TypeName;
  power: number;
  /** A multiplier on the damage (Stomp on a Minimized target, Gust in the air, Earthquake underground). */
  multiplier: number;
}

type Effect = (ctx: MoveCtx) => void;

/** Effects whose damage is fixed or computed apart from the formula (type immunities still apply). */
const FIXED = new Set(['dragon_rage', 'sonicboom', 'level_damage', 'psywave', 'super_fang', 'endeavor', 'counter', 'mirror_coat', 'bide', 'ohko']);
export const fixedDamageEffect = (effect: string) => FIXED.has(effect);

// ---- Shared pieces ----
type Hit = ReturnType<Battle['strike']>;

/**
 * The ordinary damaging move: lands (Protect, accuracy, immunity), strikes, contact abilities, a Fire move thawing its
 * target, Destiny Bond; then `after` (a secondary effect) with the hit. Returns the hit, or null when it missed.
 */
function hit(ctx: MoveCtx, after?: (h: Hit) => void, o: Parameters<Battle['strike']>[1] & { accuracy?: boolean } = {}): Hit | null {
  const { b, user, target } = ctx;
  if (!b.lands(ctx, { accuracy: o.accuracy })) return null;
  const h = b.strike(ctx, o);
  if (h.toMon && ctx.type === 'fire' && target.status === 'freeze') b.cureStatus(target, `${b.Name(target)} was defrosted!`);
  b.contact(user, target, ctx.move);
  after?.(h);
  b.destinyBond(user, target);
  return h;
}

/** A damaging move with a chance of a major status on the target. */
const statusHit = (kind: StatusKind): Effect => (ctx) =>
  void hit(ctx, (h) => {
    if (ctx.b.secondaryHappens(ctx, h) && ctx.b.canStatus(ctx.target, kind, ctx.user)) ctx.b.setStatus(ctx.target, kind, ctx.user);
  });

/** A damaging move with a chance of lowering the target's stat (or raising the user's: `self`). */
const statHit = (stat: Parameters<Battle['changeStat']>[1], change: number, self = false): Effect => (ctx) =>
  void hit(ctx, (h) => {
    if (self) {
      if (!ctx.user.fainted && ctx.b.secondaryHappens(ctx, h, ctx.move.chance, false)) ctx.b.changeStat(ctx.user, stat, change, true);
    } else if (ctx.b.secondaryHappens(ctx, h)) ctx.b.changeStat(ctx.target, stat, change, false);
  });

/** A status move aimed at the target: Protect, accuracy, a Substitute, Magic Coat; then `apply`. */
function onTarget(ctx: MoveCtx, apply: (target: Battler) => void, o: { substitute?: boolean; accuracy?: boolean } = {}) {
  const { b } = ctx;
  let target = ctx.target;
  if (target.v.magicCoat && ctx.move.flags.includes('magic_coat_affected')) {
    b.text(`${b.Name(target)} bounced the ${ctx.move.name} back!`);
    target = ctx.user;
    ctx = { ...ctx, target, user: ctx.target };
  }
  if (!b.lands(ctx, { accuracy: o.accuracy, immunity: false })) return;
  if (o.substitute !== false && target.v.substitute && target !== ctx.user) {
    b.text('But it failed!');
    return;
  }
  apply(target);
}

const fail = (b: Battle) => b.text('But it failed!');

/** A status move giving a major status. */
const statusMove = (kind: StatusKind, typeCheck = false): Effect => (ctx) =>
  onTarget(ctx, (t) => {
    if (typeCheck && ctx.b.immune(ctx.user, t, ctx.type)) return void ctx.b.text(`It doesn't affect ${ctx.b.name(t)}…`);
    if (t.status === kind || (kind === 'poison' && t.status === 'toxic')) return void ctx.b.text(`${ctx.b.Name(t)} is already ${({ sleep: 'asleep', poison: 'poisoned', toxic: 'poisoned', burn: 'burned', paralysis: 'paralyzed', freeze: 'frozen' })[kind]}!`);
    if (!ctx.b.canStatus(t, kind, ctx.user)) return fail(ctx.b);
    ctx.b.setStatus(t, kind, ctx.user);
  });

/** A status move changing the user's stats. */
const selfStats = (...changes: [Parameters<Battle['changeStat']>[1], number][]): Effect => (ctx) => {
  let any = false;
  for (const [s, c] of changes) any = ctx.b.changeStat(ctx.user, s, c, true) || any;
  if (!any && changes.length > 1) return;
};

/** A status move lowering the target's stats. */
const foeStats = (...changes: [Parameters<Battle['changeStat']>[1], number][]): Effect => (ctx) =>
  onTarget(ctx, (t) => {
    for (const [s, c] of changes) ctx.b.changeStat(t, s, c, false);
  });

/** A move hitting 2–5 times (37.5%, 37.5%, 12.5%, 12.5%: Gen 3), or exactly `times`; Gen 4's Skill Link always 5. */
function multiHit(ctx: MoveCtx, times?: number, each?: (h: Hit, i: number) => void) {
  const { b, user, target } = ctx;
  if (!b.lands(ctx)) return;
  let n = times ?? 0;
  if (!times && b.gen4 && user.ability === 'skill-link') n = 5;
  else if (!times) {
    n = b.random16() & 3;
    n = n > 1 ? (b.random16() & 3) + 2 : n + 2;
  }
  let count = 0;
  for (let i = 0; i < n && !target.fainted && target.hp > 0 && user.hp > 0; i++) {
    const h = b.strike(ctx);
    b.contact(user, target, ctx.move);
    count++;
    each?.(h, i);
  }
  b.text(`Hit ${count} time${count === 1 ? '' : 's'}!`);
  b.destinyBond(user, target);
}

/** The two-turn moves' first turn (Razor Wind, Solar Beam, Skull Bash, Sky Attack, Fly, Dig, Dive, Bounce). Returns whether this is the strike. */
function twoTurn(ctx: MoveCtx, line: string, semi?: 'air' | 'underground' | 'underwater', skip = false): boolean {
  const { user } = ctx;
  if (user.v.charging === ctx.key) {
    delete user.v.charging;
    delete user.v.semiInvulnerable;
    return true;
  }
  if (skip) return true;
  // Gen 4's Power Herb: the charge turn's line, then the strike at once, the herb used up (BATTLE_SUBSCRIPT_ITEM_SKIP_CHARGE_TURN).
  if (ctx.b.gen4 && ctx.b.holdEffect(user) === 'charge_skip') {
    ctx.b.text(`${ctx.b.Name(user)} ${line}`);
    ctx.b.emit({ t: 'item', side: user.side, item: user.item!, msg: `${ctx.b.Name(user)} became fully charged due to its Power Herb!` });
    user.usedItem = user.item;
    user.item = null;
    return true;
  }
  user.v.charging = ctx.key;
  if (semi) user.v.semiInvulnerable = semi;
  ctx.b.text(`${ctx.b.Name(user)} ${line}`);
  return false;
}

/** Heals the user by a fraction of its max HP. */
function healSelf(ctx: MoveCtx, num: number, den: number) {
  const { b, user } = ctx;
  if (user.hp === user.maxHp) return void b.text(`${b.Name(user)}'s HP is full!`);
  b.heal(user, Math.max(1, Math.floor((user.maxHp * num) / den)), `${b.Name(user)} regained health!`);
}

/** Gen 4's weather rocks (Damp Rock, Heat Rock, Smooth Rock, Icy Rock): their weather's turns longer by their param. */
const WEATHER_ROCKS: Record<Weather, string> = { rain: 'extend_rain', sun: 'extend_sun', sandstorm: 'extend_sandstorm', hail: 'extend_hail' };

/** A held item's param when its hold effect is `hold` (Gen 4's extending items), else 0. */
const heldParam = (b: Battle, user: Battler, hold: string) => (b.gen4 && b.holdEffect(user) === hold ? itemData(user.item!).holdParam : 0);

/** Effects a Pokémon's weather move starts (5 turns; Gen 4's rocks longer). */
const weatherMove = (kind: Weather, line: string): Effect => ({ b, user }) => {
  if (b.weather?.kind === kind) return fail(b);
  b.weather = { kind, turns: 5 + heldParam(b, user, WEATHER_ROCKS[kind]) };
  b.emit({ t: 'weather', weather: kind, msg: line });
};

/** Moves Metronome can't call (sMovesForbiddenToCopy). */
const NO_METRONOME = new Set(['metronome', 'struggle', 'sketch', 'mimic', 'counter', 'mirror-coat', 'protect', 'detect', 'endure', 'destiny-bond', 'sleep-talk', 'thief', 'follow-me', 'snatch', 'helping-hand', 'covet', 'trick', 'focus-punch']);
/** Gen 4's (sMetronomeUnuseableMoves, CheckMoveCallsOtherMove): Gen 3's and the moves that call or copy others. */
const NO_METRONOME4 = new Set([...NO_METRONOME, 'chatter', 'assist', 'mirror-move', 'feint', 'copycat', 'me-first', 'switcheroo']);
const noMetronome = (b: Battle) => (b.gen4 ? NO_METRONOME4 : NO_METRONOME);
/** Moves Sleep Talk can't call (sMovesForbiddenToCopy and the two-turn moves). */
const NO_SLEEP_TALK = new Set(['sleep-talk', 'focus-punch', 'uproar', 'bide', 'assist', 'mirror-move', 'metronome', 'razor-wind', 'solar-beam', 'skull-bash', 'sky-attack', 'fly', 'dig', 'dive', 'bounce']);
/** Gen 4's (BtlCmd_TrySleepTalk): Gen 3's, the moves that call others, Chatter and Shadow Force. */
const NO_SLEEP_TALK4 = new Set([...NO_SLEEP_TALK, 'copycat', 'me-first', 'chatter', 'shadow-force']);

/** Gen 4's Secret Power, Nature Power and Camouflage by terrain (sSecretPowerEffectTable, sNaturePowerMoveTable, sCamouflageTypeTable): our terrains as Gen 4's (pond its puddle). */
const TERRAIN4: Record<Terrain, { secret: 'acc' | 'sleep' | 'flinch' | 'atk' | 'paralysis' | 'spe'; nature: string; type: TypeName }> = {
  plain: { secret: 'acc', nature: 'earthquake', type: 'ground' },
  sand: { secret: 'acc', nature: 'earthquake', type: 'ground' },
  grass: { secret: 'sleep', nature: 'seed-bomb', type: 'grass' },
  longgrass: { secret: 'sleep', nature: 'seed-bomb', type: 'grass' },
  pond: { secret: 'sleep', nature: 'seed-bomb', type: 'grass' },
  mountain: { secret: 'flinch', nature: 'rock-slide', type: 'rock' },
  cave: { secret: 'flinch', nature: 'rock-slide', type: 'rock' },
  water: { secret: 'atk', nature: 'hydro-pump', type: 'water' },
  building: { secret: 'paralysis', nature: 'tri-attack', type: 'normal' },
};

/** The move Nature Power becomes on each terrain (sNaturePowerMoves). */
const NATURE_POWER: Record<Terrain, string> = { grass: 'stun-spore', longgrass: 'razor-leaf', sand: 'earthquake', water: 'surf', pond: 'bubble-beam', mountain: 'rock-slide', cave: 'shadow-ball', building: 'swift', plain: 'swift' };
/** Camouflage's type on each terrain (sTerrainToType). */
const CAMOUFLAGE: Record<Terrain, TypeName> = { grass: 'grass', longgrass: 'grass', sand: 'ground', water: 'water', pond: 'water', mountain: 'rock', cave: 'rock', building: 'normal', plain: 'normal' };

/** Magnitude's powers by its roll (4 to 10). */
function magnitude(b: Battle): { n: number; power: number } {
  const r = b.random16() % 100;
  if (r < 5) return { n: 4, power: 10 };
  if (r < 15) return { n: 5, power: 30 };
  if (r < 35) return { n: 6, power: 50 };
  if (r < 65) return { n: 7, power: 70 };
  if (r < 85) return { n: 8, power: 90 };
  if (r < 95) return { n: 9, power: 110 };
  return { n: 10, power: 150 };
}

/** Low Kick's power by the target's weight (tenths of a kilo); Gen 4's (BtlCmd_CalcWeightBasedPower) up to each bound. */
function lowKickPower(weight: number, gen4: boolean) {
  if (gen4) return [100, 250, 500, 1000, 2000].findIndex((w) => weight <= w) * 20 + 20 || 120;
  if (weight < 100) return 20;
  if (weight < 250) return 40;
  if (weight < 500) return 60;
  if (weight < 1000) return 80;
  if (weight < 2000) return 100;
  return 120;
}

/** Flail and Reversal's power by HP left (sFlailHpScaleToPowerTable; Gen 4's sFlailDamageTable on its 64-pixel bar). */
function flailPower(hp: number, max: number, gen4: boolean) {
  if (gen4) {
    const p = Math.max(1, Math.floor((hp * 64) / max));
    return p <= 1 ? 200 : p <= 5 ? 150 : p <= 12 ? 100 : p <= 21 ? 80 : p <= 42 ? 40 : 20;
  }
  const s = Math.floor((hp * 48) / max);
  if (s <= 1) return 200;
  if (s <= 4) return 150;
  if (s <= 9) return 100;
  if (s <= 16) return 80;
  if (s <= 32) return 40;
  return 20;
}

/** A stockpile's Spit Up and Swallow: resets it, and (Gen 4) takes back the Defense and Sp. Def it raised, never below 0 (Gen 3 keeps no stat change). */
const takeStockpile = (b: Battle, u: Battler) => {
  const n = u.v.stockpile ?? 0;
  delete u.v.stockpile;
  if (b.gen4 && n) {
    for (const [stat, raised] of [['def', u.v.stockpileDef ?? 0], ['spd', u.v.stockpileSpd ?? 0]] as const) {
      const drop = Math.min(raised, Math.max(0, u.stages[stat]));
      if (drop) b.changeStat(u, stat, -drop, true);
    }
    delete u.v.stockpileDef;
    delete u.v.stockpileSpd;
  }
  return n;
};

/** The friendship every Pokémon is taken to have (none is kept in these runs): the species' usual 70, for Return and Frustration. */
const FRIENDSHIP = 70;

export const EFFECTS: Record<string, Effect> = {
  hit: (ctx) => void hit(ctx),
  // Gen 4: a sure hit still misses a target out of reach (BattleSystem_CheckMoveEffect); its accuracy is 0.
  always_hit: (ctx) => void hit(ctx, undefined, { accuracy: ctx.b.gen4 }),
  quick_attack: (ctx) => void hit(ctx),
  vital_throw: (ctx) => void hit(ctx),
  high_critical: (ctx) => void hit(ctx),
  pursuit: (ctx) => void hit(ctx),
  sky_uppercut: (ctx) => void hit(ctx),

  // ---- Damage with a secondary effect ----
  burn_hit: statusHit('burn'),
  freeze_hit: statusHit('freeze'),
  paralyze_hit: statusHit('paralysis'),
  poison_hit: statusHit('poison'),
  poison_fang: statusHit('toxic'),
  thaw_hit: statusHit('burn'),
  blaze_kick: statusHit('burn'),
  poison_tail: statusHit('poison'),
  thunder: statusHit('paralysis'),
  tri_attack: (ctx) =>
    void hit(ctx, (h) => {
      if (!ctx.b.secondaryHappens(ctx, h)) return;
      const kind = (['burn', 'freeze', 'paralysis'] as const)[ctx.b.roll(3)]!;
      if (ctx.b.canStatus(ctx.target, kind, ctx.user)) ctx.b.setStatus(ctx.target, kind, ctx.user);
    }),
  confuse_hit: (ctx) => void hit(ctx, (h) => ctx.b.secondaryHappens(ctx, h) && ctx.b.confuse(ctx.target, ctx.user)),
  flinch_hit: (ctx) => void hit(ctx, (h) => flinch(ctx, h)),
  flinch_minimize_hit: (ctx) => {
    if (ctx.target.v.minimized) ctx.multiplier = 2;
    hit(ctx, (h) => flinch(ctx, h));
  },
  fake_out: (ctx) => {
    if (!ctx.user.v.firstTurn) return fail(ctx.b);
    hit(ctx, (h) => flinch(ctx, h, 100));
  },
  twister: (ctx) => {
    if (ctx.target.v.semiInvulnerable === 'air') ctx.multiplier = 2;
    hit(ctx, (h) => flinch(ctx, h));
  },
  gust: (ctx) => {
    if (ctx.target.v.semiInvulnerable === 'air') ctx.multiplier = 2;
    hit(ctx);
  },
  snore: (ctx) => {
    if (ctx.user.status !== 'sleep') return fail(ctx.b);
    hit(ctx, (h) => flinch(ctx, h));
  },
  attack_down_hit: statHit('atk', -1),
  defense_down_hit: statHit('def', -1),
  speed_down_hit: statHit('spe', -1),
  special_attack_down_hit: statHit('spa', -1),
  special_defense_down_hit: statHit('spd', -1),
  accuracy_down_hit: statHit('acc', -1),
  attack_up_hit: statHit('atk', 1, true),
  defense_up_hit: statHit('def', 1, true),
  all_stats_up_hit: (ctx) =>
    void hit(ctx, (h) => {
      if (ctx.user.fainted || !ctx.b.secondaryHappens(ctx, h, ctx.move.chance, false)) return;
      for (const s of ['atk', 'def', 'spe', 'spa', 'spd'] as const) ctx.b.changeStat(ctx.user, s, 1, true);
    }),
  superpower: (ctx) =>
    void hit(ctx, () => {
      ctx.b.changeStat(ctx.user, 'atk', -1, true);
      ctx.b.changeStat(ctx.user, 'def', -1, true);
    }),
  overheat: (ctx) => void hit(ctx, () => ctx.b.changeStat(ctx.user, 'spa', -2, true)),
  secret_power: (ctx) =>
    void hit(ctx, (h) => {
      const { b, target, user } = ctx;
      if (!b.secondaryHappens(ctx, h)) return;
      if (b.gen4) {
        const s = TERRAIN4[b.setup.terrain].secret;
        if (s === 'sleep' || s === 'paralysis') {
          if (b.canStatus(target, s, user)) b.setStatus(target, s, user);
        } else if (s === 'flinch') flinch(ctx, h, 100);
        else b.changeStat(target, s, -1, false);
        return;
      }
      switch (b.setup.terrain) {
        case 'grass':
          if (b.canStatus(target, 'poison', user)) b.setStatus(target, 'poison', user);
          break;
        case 'longgrass':
          if (b.canStatus(target, 'sleep', user)) b.setStatus(target, 'sleep', user);
          break;
        case 'sand':
          b.changeStat(target, 'acc', -1, false);
          break;
        case 'water':
          b.changeStat(target, 'atk', -1, false);
          break;
        case 'pond':
          b.changeStat(target, 'spe', -1, false);
          break;
        case 'mountain':
          b.confuse(target, user);
          break;
        case 'cave':
          flinch(ctx, h, 100);
          break;
        default:
          if (b.canStatus(target, 'paralysis', user)) b.setStatus(target, 'paralysis', user);
      }
    }),
  pay_day: (ctx) =>
    void hit(ctx, () => {
      if (ctx.user.side === 0) {
        ctx.b.payDay += ctx.user.level * 5;
        ctx.b.text('Coins scattered everywhere!');
      }
    }),
  twineedle: (ctx) => multiHit(ctx, 2, (h) => ctx.b.secondaryHappens(ctx, h) && ctx.b.canStatus(ctx.target, 'poison', ctx.user) && ctx.b.setStatus(ctx.target, 'poison', ctx.user)),
  double_hit: (ctx) => multiHit(ctx, 2),
  multi_hit: (ctx) => multiHit(ctx),
  triple_kick: (ctx) => {
    const { b, user, target } = ctx;
    let count = 0;
    for (let i = 1; i <= 3 && !target.fainted && target.hp > 0; i++) {
      if (!b.lands(ctx)) break;
      b.strike({ ...ctx, power: 10 * i });
      b.contact(user, target, ctx.move);
      count++;
    }
    if (count) b.text(`Hit ${count} time${count === 1 ? '' : 's'}!`);
  },
  beat_up: (ctx) => {
    const { b, user, target } = ctx;
    if (!b.lands(ctx, { immunity: false })) return;
    const team = user.side === 0 ? b.party : b.foes;
    for (const m of team) {
      // Gen 4 (BtlCmd_BeatUp): the user joins in whatever its status, each hit with a critical roll and the random roll.
      if (m.fainted || (m.status && !(b.gen4 && m === user)) || target.hp <= 0) continue;
      const atk = species(m.species).base[1];
      const def = species(target.species).base[2];
      let dmg = Math.floor(Math.floor((atk * (Math.floor((2 * m.level) / 5) + 2) * ctx.move.power) / def) / 50) + 2;
      if (b.gen4) dmg = Math.max(1, Math.floor((dmg * b.critMultiplier4(user, target, ctx.move) * (100 - (b.random16() % 16))) / 100));
      b.text(`${species(m.species).name}'s attack!`);
      b.strike(ctx, { fixed: dmg });
    }
  },

  // ---- Damage with a twist ----
  recoil: (ctx) => {
    reckless(ctx);
    hit(ctx, (h) => {
      if (ctx.user.ability === 'rock-head' && ctx.key !== 'struggle') return;
      // Gen 4 (subscript_0063_Recoil_1_4): none for Magic Guard, nor when nothing was dealt.
      if (ctx.b.gen4 && (ctx.user.ability === 'magic-guard' || h.dealt === 0)) return;
      const r = Math.max(1, Math.floor(h.dealt / 4));
      ctx.b.damage(ctx.user, r, { msg: `${ctx.b.Name(ctx.user)} is hit with recoil!` });
    });
  },
  double_edge: (ctx) => {
    reckless(ctx);
    hit(ctx, (h) => {
      if (ctx.user.ability === 'rock-head') return;
      if (ctx.b.gen4 && (ctx.user.ability === 'magic-guard' || h.dealt === 0)) return;
      ctx.b.damage(ctx.user, Math.max(1, Math.floor(h.dealt / 3)), { msg: `${ctx.b.Name(ctx.user)} is hit with recoil!` });
    });
  },
  recoil_if_miss: (ctx) => {
    const { b, user, target } = ctx;
    reckless(ctx);
    if (b.lands(ctx)) {
      b.strike(ctx);
      b.contact(user, target, ctx.move);
      return;
    }
    if (b.gen4) {
      // Gen 4 (subscript_0061_CrashOnMiss): half the damage it would have done, critical roll, random roll and types
      // included, at most half the target's max HP; none for Magic Guard.
      if (user.ability === 'magic-guard') return;
      const r = b.damage4(user, target, ctx.move, { key: ctx.key, power: ctx.power, type: ctx.type, crit: b.critMultiplier4(user, target, ctx.move) });
      const crash = Math.min(Math.floor(r.damage / 2), Math.floor(target.maxHp / 2));
      if (crash > 0) b.damage(user, crash, { msg: `${b.Name(user)} kept going and crashed!` });
      return;
    }
    // The crash: half the damage it would have done (Gen 3), worked out on the spot.
    const r = b.baseDamage(user, target, ctx.move, { power: ctx.power, type: ctx.type, crit: false, effect: ctx.move.effect });
    b.damage(user, Math.max(1, Math.floor(r.damage / 2)), { msg: `${b.Name(user)} kept going and crashed!` });
  },
  absorb: (ctx) =>
    void hit(ctx, (h) => drain(ctx, h)),
  dream_eater: (ctx) => {
    if (ctx.target.status !== 'sleep' || ctx.target.v.substitute) return void ctx.b.text(`${ctx.b.Name(ctx.target)} wasn't affected!`);
    hit(ctx, (h) => drain(ctx, h));
  },
  explosion: (ctx) => {
    const { b, user } = ctx;
    if (b.active.some((x) => !x.fainted && x.ability === 'damp' && !(b.gen4 && x !== user && user.ability === 'mold-breaker'))) return void b.text(`${b.Name(b.foeOf(user))}'s Damp prevents ${ctx.move.name}!`);
    b.damage(user, user.hp);
    hit(ctx);
  },
  recharge: (ctx) => void hit(ctx, () => (ctx.user.v.recharging = true)),
  rampage: (ctx) => {
    const { b, user } = ctx;
    if (!user.v.rampage) user.v.rampage = { move: ctx.key, turns: (b.random16() & 1) + 2 };
    const h = hit(ctx);
    user.v.rampage.turns -= 1;
    // Gen 4 (UMC_STATE_RAMPAGE, ov12_02252218): a miss or Protect goes on; only an immune target stops it early.
    const stopped = b.gen4 ? !h && b.immune(user, ctx.target, ctx.type) : !h;
    if (stopped || user.v.rampage.turns <= 0) {
      const done = user.v.rampage.turns <= 0;
      delete user.v.rampage;
      if (done && !user.fainted) b.confuse(user, null) || void 0;
    }
  },
  uproar: (ctx) => {
    const { b, user } = ctx;
    if (!user.v.uproar) {
      // Gen 4 (subscript_0056): 3–6 turns, the sleepers woken at the end of each turn (endOfTurn), not now.
      user.v.uproar = b.gen4 ? (b.random16() & 3) + 3 : (b.random16() & 3) + 2;
      b.text(`${b.Name(user)} caused an uproar!`);
      if (!b.gen4) for (const x of b.active) if (x.status === 'sleep') b.cureStatus(x, `${b.Name(x)} woke up in the uproar!`);
    }
    hit(ctx);
  },
  rollout: (ctx) => {
    const { user } = ctx;
    const turn = user.v.rollout?.turns ?? 0;
    ctx.power = ctx.move.power * 2 ** turn * (user.v.defenseCurl ? 2 : 1);
    const h = hit(ctx);
    if (!h || turn >= 4) delete user.v.rollout;
    else user.v.rollout = { turns: turn + 1 };
  },
  fury_cutter: (ctx) => {
    const { user } = ctx;
    const n = user.v.furyCutter ?? 0;
    ctx.power = Math.min(160, ctx.move.power * 2 ** n);
    const h = hit(ctx);
    user.v.furyCutter = h ? Math.min(4, n + 1) : 0;
  },
  rage: (ctx) =>
    void hit(ctx, () => {
      // Set once it hits (MOVE_EFFECT_RAGE); ended by choosing another move (TryClearRageStatuses: useMove).
      ctx.user.v.rage = true;
    }),
  trap: (ctx) =>
    void hit(ctx, (h) => {
      const { b, target, user } = ctx;
      if (!h.toMon || target.fainted || target.v.trapped) return;
      // Gen 4's Grip Claw: 6 turns (subscript_0058_BindStart).
      target.v.trapped = { turns: b.gen4 && b.holdEffect(user) === 'extend_trapping' ? 6 : (b.random16() & 3) + 3, move: ctx.key, by: user.side };
      const how: Record<string, string> = { wrap: 'was wrapped by', bind: 'was squeezed by', 'fire-spin': 'was trapped in the vortex by', clamp: 'was clamped by', whirlpool: 'was trapped in the vortex by', 'sand-tomb': 'was trapped by Sand Tomb from' };
      b.text(`${b.Name(target)} ${how[ctx.key] ?? 'was trapped by'} ${b.name(user)}!`);
    }),
  false_swipe: (ctx) => void hit(ctx, undefined, { leaveOne: true }),
  facade: (ctx) => {
    if (ctx.user.status && ctx.user.status !== 'sleep' && ctx.user.status !== 'freeze') ctx.power *= 2;
    hit(ctx);
  },
  smellingsalt: (ctx) => {
    if (ctx.target.status === 'paralysis' && !ctx.target.v.substitute) ctx.power *= 2;
    hit(ctx, (h) => h.toMon && ctx.target.status === 'paralysis' && ctx.b.cureStatus(ctx.target, `${ctx.b.Name(ctx.target)} was cured of paralysis.`));
  },
  revenge: (ctx) => {
    if (ctx.user.v.hitThisTurn) ctx.power *= 2;
    hit(ctx);
  },
  focus_punch: (ctx) => {
    if (ctx.user.v.hitThisTurn) return void ctx.b.text(`${ctx.b.Name(ctx.user)} lost its focus and couldn't move!`);
    hit(ctx);
  },
  eruption: (ctx) => {
    ctx.power = Math.max(1, Math.floor((150 * ctx.user.hp) / ctx.user.maxHp));
    hit(ctx);
  },
  flail: (ctx) => {
    ctx.power = flailPower(ctx.user.hp, ctx.user.maxHp, ctx.b.gen4);
    hit(ctx, undefined, { noCrit: false });
  },
  low_kick: (ctx) => {
    ctx.power = lowKickPower(species(ctx.target.species).weight, ctx.b.gen4);
    hit(ctx);
  },
  return: (ctx) => {
    ctx.power = Math.max(1, Math.floor((FRIENDSHIP * 10) / 25));
    hit(ctx);
  },
  frustration: (ctx) => {
    ctx.power = Math.max(1, Math.floor(((255 - FRIENDSHIP) * 10) / 25));
    hit(ctx);
  },
  hidden_power: (ctx) => {
    const [hp, atk, def, spa, spd, spe] = ctx.user.mon.ivs;
    const bits = ((hp & 2) >> 1) | (atk & 2) | ((def & 2) << 1) | ((spe & 2) << 2) | ((spa & 2) << 3) | ((spd & 2) << 4);
    ctx.power = Math.floor((bits * 40) / 63) + 30;
    ctx.type = hiddenPowerType(ctx.user.mon);
    hit(ctx);
  },
  weather_ball: (ctx) => {
    if (ctx.b.weatherOn()) ctx.power *= 2;
    hit(ctx);
  },
  magnitude: (ctx) => {
    const m = magnitude(ctx.b);
    ctx.b.text(`Magnitude ${m.n}!`);
    ctx.power = m.power;
    if (ctx.target.v.semiInvulnerable === 'underground') ctx.multiplier = 2;
    hit(ctx);
  },
  earthquake: (ctx) => {
    if (ctx.target.v.semiInvulnerable === 'underground') ctx.multiplier = 2;
    hit(ctx);
  },
  present: (ctx) => {
    const { b, target } = ctx;
    const r = b.random16() & 0xff;
    if (r < 102) ctx.power = 40;
    else if (r < 178) ctx.power = 80;
    else if (r < 204) ctx.power = 120;
    else {
      if (!b.lands(ctx, { immunity: false })) return;
      if (target.hp === target.maxHp) return void b.text(`${b.Name(target)} can't receive the gift!`);
      return void b.heal(target, Math.floor(target.maxHp / 4), `${b.Name(target)} regained health!`);
    }
    hit(ctx);
  },
  brick_break: (ctx) => {
    const { b, target } = ctx;
    // Gen 4 (MOVE_SIDE_EFFECT_BREAK_SCREENS): the screens break even when the move can't touch the target, not on a miss.
    if (!b.lands(ctx, { immunity: !b.gen4 })) return;
    const side = b.sides[target.side];
    if (side.reflect || side.lightScreen) {
      side.reflect = 0;
      side.lightScreen = 0;
      b.text('It shattered the barrier!');
    }
    if (b.gen4 && b.immune(ctx.user, target, ctx.type)) return void b.text(`It doesn't affect ${b.name(target)}…`);
    b.strike(ctx);
    b.contact(ctx.user, target, ctx.move);
  },
  knock_off: (ctx) =>
    void hit(ctx, (h) => {
      const { b, target } = ctx;
      if (!h.toMon || !target.item || target.ability === 'sticky-hold') return;
      b.text(`${b.Name(ctx.user)} knocked off ${b.name(target)}'s ${itemName(target.item)}!`);
      target.item = null;
    }),
  thief: (ctx) =>
    void hit(ctx, (h) => {
      const { b, target, user } = ctx;
      // The foe's side never steals outside link battles (MOVE_EFFECT_STEAL_ITEM).
      if (!h.toMon || !target.item || user.item || target.ability === 'sticky-hold' || user.side === 1) return;
      b.text(`${b.Name(user)} stole ${b.name(target)}'s ${itemName(target.item)}!`);
      user.item = target.item;
      target.item = null;
    }),
  rapid_spin: (ctx) =>
    void hit(ctx, () => {
      const { b, user } = ctx;
      if (user.v.trapped) {
        b.text(`${b.Name(user)} got free of ${moveData(user.v.trapped.move).name}!`);
        delete user.v.trapped;
      }
      if (user.v.seededBy !== undefined) {
        delete user.v.seededBy;
        b.text(`${b.Name(user)} was freed from Leech Seed!`);
      }
      if (b.sides[user.side].spikes) {
        b.sides[user.side].spikes = 0;
        b.text(`${b.Name(user)} blew away Spikes!`);
      }
    }),
  spit_up: (ctx) => {
    const n = takeStockpile(ctx.b, ctx.user);
    if (!n) return fail(ctx.b);
    ctx.power = 100 * n;
    // Gen 4 (CalcCrit, CalcMaxDamage): a critical hit can happen, no random roll.
    hit(ctx, undefined, ctx.b.gen4 ? { noRandom: true } : { noCrit: true });
  },

  // ---- Fixed damage ----
  dragon_rage: (ctx) => void hit(ctx, undefined, { fixed: 40 }),
  sonicboom: (ctx) => void hit(ctx, undefined, { fixed: 20 }),
  level_damage: (ctx) => void hit(ctx, undefined, { fixed: ctx.user.level }),
  psywave: (ctx) => void hit(ctx, undefined, { fixed: Math.max(1, Math.floor((ctx.user.level * ((ctx.b.random16() % 11) * 10 + 50)) / 100)) }),
  super_fang: (ctx) => void hit(ctx, undefined, { fixed: Math.max(1, Math.floor(ctx.target.hp / 2)) }),
  endeavor: (ctx) => {
    if (ctx.target.hp <= ctx.user.hp) return fail(ctx.b);
    hit(ctx, undefined, { fixed: ctx.target.hp - ctx.user.hp });
  },
  ohko: (ctx) => {
    const { b, user, target } = ctx;
    if (b.gen4 ? b.targetHas(user, target, 'sturdy') : target.ability === 'sturdy') return void b.text(`${b.Name(target)} was protected by Sturdy!`);
    if (target.level > user.level) return fail(b);
    if (!b.lands(ctx, { accuracy: false })) return;
    if (b.gen4) {
      // Gen 4 (BtlCmd_TryOHKOMove): out of reach misses; No Guard always hits; hits below accuracy + the level gap.
      const sure = user.v.lockOn || user.ability === 'no-guard' || target.ability === 'no-guard';
      if (!sure && (b.outOfReach(ctx) || b.random16() % 100 >= ctx.move.accuracy + (user.level - target.level))) return void b.text(`${b.Name(user)}'s attack missed!`);
    } else if (!user.v.lockOn && b.random16() % 100 + 1 >= ctx.move.accuracy + (user.level - target.level)) return void b.text(`${b.Name(user)}'s attack missed!`);
    b.strike(ctx, { fixed: target.hp });
    b.text("It's a one-hit KO!");
  },
  counter: (ctx) => counterLike(ctx, 'physicalHit'),
  mirror_coat: (ctx) => counterLike(ctx, 'specialHit'),
  bide: (ctx) => {
    const { b, user } = ctx;
    if (!user.v.bide) {
      user.v.bide = { turns: 2, damage: 0 };
      return void b.text(`${b.Name(user)} is storing energy!`);
    }
    if (--user.v.bide.turns > 0) return void b.text(`${b.Name(user)} is storing energy!`);
    const dmg = user.v.bide.damage * 2;
    delete user.v.bide;
    b.text(`${b.Name(user)} unleashed energy!`);
    if (!dmg) return fail(b);
    // Its data aims it at the user (MOVE_TARGET_USER): the stored energy goes to the foe.
    hit({ ...ctx, target: b.foeOf(user) }, undefined, { fixed: dmg, accuracy: false });
  },

  // ---- Two-turn and semi-invulnerable moves ----
  razor_wind: (ctx) => twoTurn(ctx, 'whipped up a whirlwind!') && void hit(ctx),
  solar_beam: (ctx) => twoTurn(ctx, 'took in sunlight!', undefined, ctx.b.isWeather('sun')) && void hit(ctx),
  skull_bash: (ctx) => {
    if (ctx.user.v.charging !== ctx.key) ctx.b.changeStat(ctx.user, 'def', 1, true);
    if (twoTurn(ctx, 'lowered its head!')) hit(ctx);
  },
  sky_attack: (ctx) => twoTurn(ctx, 'is glowing!') && void hit(ctx, (h) => flinch(ctx, h)),
  semi_invulnerable: (ctx) => {
    const where = ctx.key === 'dig' ? 'underground' : ctx.key === 'dive' ? 'underwater' : 'air';
    const line = { underground: 'dug a hole!', underwater: 'hid underwater!', air: ctx.key === 'bounce' ? 'sprang up!' : 'flew up high!' }[where];
    if (twoTurn(ctx, line, where)) hit(ctx, (h) => ctx.key === 'bounce' && ctx.b.secondaryHappens(ctx, h) && ctx.b.canStatus(ctx.target, 'paralysis', ctx.user) && ctx.b.setStatus(ctx.target, 'paralysis', ctx.user));
  },
  future_sight: (ctx) => {
    const { b, user, target } = ctx;
    const side = b.sides[target.side];
    if (side.futureSight) return fail(b);
    if (b.gen4) {
      // Gen 4 (BtlCmd_TryFutureSight): CalcMoveDamage with the random roll, no STAB or types; it can miss when it comes.
      const r = b.damage4(user, target, ctx.move, { key: ctx.key, power: ctx.power, type: ctx.type, crit: 1, typeless: true });
      side.futureSight = { turns: 3, damage: r.damage, from: ctx.key, user: user.side };
      return void b.text(`${b.Name(user)} foresaw an attack!`);
    }
    // Typeless (Gen 3): computed now as a special move without type or STAB, dealt two turns later.
    const lvl = Math.floor((2 * user.level) / 5) + 2;
    const raw = Math.floor(Math.floor((b.staged(user, 'spa') * ctx.power * lvl) / b.staged(target, 'spd')) / 50) + 2;
    side.futureSight = { turns: 3, damage: Math.floor((raw * (100 - (b.random16() % 16))) / 100), from: ctx.key };
    b.text(`${b.Name(user)} foresaw an attack!`);
  },

  // ---- Major status ----
  sleep: statusMove('sleep'),
  poison: statusMove('poison'),
  toxic: statusMove('toxic'),
  paralyze: (ctx) => statusMove('paralysis', ctx.type === 'electric')(ctx),
  will_o_wisp: statusMove('burn'),
  yawn: (ctx) =>
    onTarget(ctx, (t) => {
      if (t.v.yawn || !ctx.b.canStatus(t, 'sleep', ctx.user)) return fail(ctx.b);
      t.v.yawn = 2;
      ctx.b.text(`${ctx.b.Name(ctx.user)} made ${ctx.b.name(t)} drowsy!`);
    }),
  confuse: (ctx) => onTarget(ctx, (t) => (t.v.confused ? void ctx.b.text(`${ctx.b.Name(t)} is already confused!`) : ctx.b.confuse(t, ctx.user) || fail(ctx.b))),
  teeter_dance: (ctx) => onTarget(ctx, (t) => ctx.b.confuse(t, ctx.user) || fail(ctx.b)),
  swagger: (ctx) =>
    onTarget(ctx, (t) => {
      ctx.b.changeStat(t, 'atk', 2, false);
      ctx.b.confuse(t, ctx.user);
    }),
  flatter: (ctx) =>
    onTarget(ctx, (t) => {
      ctx.b.changeStat(t, 'spa', 1, false);
      ctx.b.confuse(t, ctx.user);
    }),
  attract: (ctx) =>
    onTarget(ctx, (t) => {
      const { b, user } = ctx;
      if (t.v.attractedTo !== undefined || (b.gen4 ? b.targetHas(user, t, 'oblivious') : t.ability === 'oblivious') || !user.mon.gender || !t.mon.gender || user.mon.gender === t.mon.gender) return fail(b);
      t.v.attractedTo = user.side;
      b.text(`${b.Name(t)} fell in love!`);
    }, { substitute: !ctx.b.gen4 }),

  // ---- Stats ----
  attack_up: selfStats(['atk', 1]),
  attack_up_2: selfStats(['atk', 2]),
  defense_up: selfStats(['def', 1]),
  defense_up_2: selfStats(['def', 2]),
  speed_up: selfStats(['spe', 1]),
  speed_up_2: selfStats(['spe', 2]),
  special_attack_up: selfStats(['spa', 1]),
  special_attack_up_2: selfStats(['spa', 2]),
  special_defense_up: selfStats(['spd', 1]),
  special_defense_up_2: selfStats(['spd', 2]),
  accuracy_up: selfStats(['acc', 1]),
  evasion_up: selfStats(['eva', 1]),
  bulk_up: selfStats(['atk', 1], ['def', 1]),
  calm_mind: selfStats(['spa', 1], ['spd', 1]),
  cosmic_power: selfStats(['def', 1], ['spd', 1]),
  dragon_dance: selfStats(['atk', 1], ['spe', 1]),
  defense_curl: (ctx) => {
    ctx.user.v.defenseCurl = true;
    ctx.b.changeStat(ctx.user, 'def', 1, true);
  },
  minimize: (ctx) => {
    ctx.user.v.minimized = true;
    ctx.b.changeStat(ctx.user, 'eva', 1, true);
  },
  attack_down: foeStats(['atk', -1]),
  attack_down_2: foeStats(['atk', -2]),
  defense_down: foeStats(['def', -1]),
  defense_down_2: foeStats(['def', -2]),
  speed_down: foeStats(['spe', -1]),
  speed_down_2: foeStats(['spe', -2]),
  special_attack_down: foeStats(['spa', -1]),
  special_defense_down: foeStats(['spd', -1]),
  special_defense_down_2: foeStats(['spd', -2]),
  accuracy_down: foeStats(['acc', -1]),
  evasion_down: foeStats(['eva', -1]),
  tickle: foeStats(['atk', -1], ['def', -1]),
  memento: (ctx) => {
    const { b, user, target } = ctx;
    b.damage(user, user.hp);
    // Gen 4 (effect_script_0168): the user faints first; the drops then need it to land (a miss, Protect).
    if (b.gen4 && !b.lands(ctx, { immunity: false })) return;
    if (target.fainted || target.v.substitute) return fail(b);
    b.changeStat(target, 'atk', -2, false);
    b.changeStat(target, 'spa', -2, false);
  },
  belly_drum: (ctx) => {
    const { b, user } = ctx;
    // Fails at half HP or less, or at +6 Attack (Cmd_maxattackhalvehp; subscript_0120).
    if (user.hp <= Math.floor(user.maxHp / 2) || user.stages.atk === 6) return fail(b);
    b.damage(user, Math.floor(user.maxHp / 2));
    user.stages.atk = 6;
    b.emit({ t: 'stat', side: user.side, stat: 'atk', change: 12, msg: `${b.Name(user)} cut its own HP and maximized Attack!` });
  },
  charge: (ctx) => {
    ctx.user.v.charged = 2;
    ctx.b.text(`${ctx.b.Name(ctx.user)} began charging power!`);
    // Gen 4 (subscript_0131_Charge): and Sp. Def up 1.
    if (ctx.b.gen4) ctx.b.changeStat(ctx.user, 'spd', 1, true);
  },
  curse: (ctx) => {
    const { b, user, target } = ctx;
    if (!user.types.includes('ghost')) {
      b.changeStat(user, 'spe', -1, true);
      b.changeStat(user, 'atk', 1, true);
      b.changeStat(user, 'def', 1, true);
      return;
    }
    // A target out of reach dodges it (NO_ACC_CALC_CHECK_LOCK_ON; subscript_0097).
    if (target.v.cursed || target.v.substitute || b.outOfReach(ctx)) return fail(b);
    if (!b.lands(ctx, { accuracy: false, immunity: false })) return;
    target.v.cursed = true;
    b.damage(user, Math.max(1, Math.floor(user.maxHp / 2)), { msg: `${b.Name(user)} cut its own HP and laid a curse on ${b.name(target)}!` });
  },
  haze: ({ b }) => {
    for (const x of b.active) for (const s of Object.keys(x.stages) as (keyof Battler['stages'])[]) x.stages[s] = 0;
    b.text('All stat changes were eliminated!');
  },
  psych_up: (ctx) => {
    ctx.user.stages = { ...ctx.target.stages };
    // Gen 4 (BtlCmd_CopyStatStages): Focus Energy too.
    if (ctx.b.gen4 && ctx.target.v.focusEnergy) ctx.user.v.focusEnergy = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} copied ${ctx.b.name(ctx.target)}'s stat changes!`);
  },
  focus_energy: (ctx) => {
    if (ctx.user.v.focusEnergy) return fail(ctx.b);
    ctx.user.v.focusEnergy = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} is getting pumped!`);
  },

  // ---- Healing ----
  restore_hp: (ctx) => healSelf(ctx, 1, 2),
  softboiled: (ctx) => healSelf(ctx, 1, 2),
  synthesis: (ctx) => weatherHeal(ctx),
  moonlight: (ctx) => weatherHeal(ctx),
  morning_sun: (ctx) => weatherHeal(ctx),
  rest: (ctx) => {
    const { b, user } = ctx;
    if (user.status === 'sleep') return void b.text(`${b.Name(user)} is already asleep!`);
    if (user.hp === user.maxHp) return void b.text(`${b.Name(user)}'s HP is full!`);
    if (user.ability === 'insomnia' || user.ability === 'vital-spirit' || b.active.some((x) => x.v.uproar)) return fail(b);
    user.status = null;
    b.setStatus(user, 'sleep', null, 3);
    b.heal(user, user.maxHp, `${b.Name(user)} slept and became healthy!`);
  },
  wish: (ctx) => {
    const side = ctx.b.sides[ctx.user.side];
    if (side.wish) return fail(ctx.b);
    // Gen 4 (UFC_STATE_WISH): half the max HP of whoever is there when it comes true (endOfTurn).
    side.wish = { turns: 2, hp: Math.floor(ctx.user.maxHp / 2) };
    ctx.b.text(`${ctx.b.Name(ctx.user)} made a wish!`);
  },
  swallow: (ctx) => {
    const n = takeStockpile(ctx.b, ctx.user);
    if (!n) return fail(ctx.b);
    healSelf(ctx, 1, n === 1 ? 4 : n === 2 ? 2 : 1);
  },
  ingrain: (ctx) => {
    if (ctx.user.v.ingrain) return fail(ctx.b);
    ctx.user.v.ingrain = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} planted its roots!`);
  },
  heal_bell: (ctx) => {
    const { b, user } = ctx;
    const team = user.side === 0 ? b.party : b.foes;
    b.text(ctx.key === 'heal-bell' ? 'A bell chimed!' : 'A soothing aroma wafted through the area!');
    // Heal Bell doesn't reach a Soundproof Pokémon (Cmd_healpartystatus; Gen 4 unless the user has Mold Breaker); Aromatherapy does.
    const deaf = (m: Battler) => ctx.key === 'heal-bell' && m.ability === 'soundproof' && !(b.gen4 && m !== user && user.ability === 'mold-breaker');
    for (const m of team) if (m.status && !m.fainted && !deaf(m)) b.cureStatus(m);
  },
  refresh: (ctx) => {
    const { b, user } = ctx;
    if (!user.status || user.status === 'sleep' || user.status === 'freeze') return fail(b);
    b.cureStatus(user, `${b.Name(user)}'s status returned to normal!`);
  },
  pain_split: (ctx) =>
    onTarget(ctx, (t) => {
      const { b, user } = ctx;
      const avg = Math.floor((user.hp + t.hp) / 2);
      const du = avg - user.hp;
      const dt = avg - t.hp;
      if (du > 0) b.heal(user, du);
      else b.damage(user, -du);
      if (dt > 0) b.heal(t, dt);
      else b.damage(t, -dt);
      b.text('The battlers shared their pain!');
    }, { substitute: true }),

  // ---- Field and sides ----
  reflect: (ctx) => sideEffect(ctx, 'reflect', 'Reflect raised Defense!'),
  light_screen: (ctx) => sideEffect(ctx, 'lightScreen', 'Light Screen raised Sp. Def!'),
  mist: (ctx) => sideEffect(ctx, 'mist', 'Your team became shrouded in mist!'),
  safeguard: (ctx) => sideEffect(ctx, 'safeguard', 'Your team became cloaked in a mystical veil!'),
  spikes: (ctx) => {
    const { b, user } = ctx;
    const side = b.sides[user.side === 0 ? 1 : 0];
    if (side.spikes >= 3) return fail(b);
    side.spikes += 1;
    b.text('Spikes were scattered all around the opponent\'s side!');
  },
  rain_dance: weatherMove('rain', 'It started to rain!'),
  sunny_day: weatherMove('sun', 'The sunlight got bright!'),
  sandstorm: weatherMove('sandstorm', 'A sandstorm brewed!'),
  hail: weatherMove('hail', 'It started to hail!'),
  mud_sport: (ctx) => {
    ctx.b.sides[ctx.user.side].mudSport = true;
    ctx.b.text("Electricity's power was weakened!");
  },
  water_sport: (ctx) => {
    ctx.b.sides[ctx.user.side].waterSport = true;
    ctx.b.text("Fire's power was weakened!");
  },

  // ---- Protection and stalling ----
  protect: (ctx) => protectLike(ctx, 'protect'),
  endure: (ctx) => protectLike(ctx, 'endure'),
  substitute: (ctx) => {
    const { b, user } = ctx;
    const cost = Math.floor(user.maxHp / 4);
    if (user.v.substitute) return void b.text(`${b.Name(user)} already has a substitute!`);
    if (user.hp <= cost || cost === 0) return void b.text('It was too weak to make a substitute!');
    b.damage(user, cost, { msg: `${b.Name(user)} made a substitute!` });
    user.v.substitute = cost;
    delete user.v.trapped;
  },
  destiny_bond: (ctx) => {
    ctx.user.v.destinyBond = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} is trying to take its foe with it!`);
  },
  grudge: (ctx) => {
    ctx.user.v.grudge = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} wants the foe to bear a grudge!`);
  },
  lock_on: (ctx) =>
    onTarget(ctx, (t) => {
      ctx.user.v.lockOn = 2;
      ctx.b.text(`${ctx.b.Name(ctx.user)} took aim at ${ctx.b.name(t)}!`);
    }, { substitute: ctx.b.gen4 }),
  foresight: (ctx) =>
    onTarget(ctx, (t) => {
      t.v.foresight = true;
      ctx.b.text(`${ctx.b.Name(ctx.user)} identified ${ctx.b.name(t)}!`);
    }, { substitute: false }),
  mean_look: (ctx) =>
    onTarget(ctx, (t) => {
      if (t.v.meanLook) return fail(ctx.b);
      t.v.meanLook = true;
      ctx.b.text(`${ctx.b.Name(t)} can't escape now!`);
    }, { substitute: ctx.b.gen4 }),
  leech_seed: (ctx) =>
    onTarget(ctx, (t) => {
      const { b, user } = ctx;
      if (t.types.includes('grass')) return void b.text(`It doesn't affect ${b.name(t)}…`);
      if (t.v.seededBy !== undefined) return void b.text(`${b.Name(t)} evaded the attack!`);
      t.v.seededBy = user.side;
      b.text(`${b.Name(t)} was seeded!`);
    }),
  nightmare: (ctx) =>
    onTarget(ctx, (t) => {
      if (t.status !== 'sleep' || t.v.nightmare) return fail(ctx.b);
      t.v.nightmare = true;
      ctx.b.text(`${ctx.b.Name(t)} began having a nightmare!`);
    }),
  perish_song: ({ b }) => {
    let any = false;
    for (const x of b.active) {
      if (x.fainted || x.v.perish !== undefined || x.ability === 'soundproof') continue;
      x.v.perish = 3;
      any = true;
    }
    if (any) b.text('All Pokémon hearing the song will faint in three turns!');
    else fail(b);
  },

  // ---- Move control ----
  disable: (ctx) =>
    onTarget(ctx, (t) => {
      const { b } = ctx;
      if (t.v.disabled || !t.lastMove || t.lastMove === 'struggle') return fail(b);
      // Gen 4 (BtlCmd_TryDisable): 3–6 more turns, counted down one end of turn later than Gen 3.
      t.v.disabled = { move: t.lastMove, turns: b.gen4 ? (b.random16() % 4) + 4 : (b.random16() & 3) + 2 };
      b.text(`${b.Name(t)}'s ${moveData(t.lastMove).name} was disabled!`);
    }, { substitute: false }),
  encore: (ctx) =>
    onTarget(ctx, (t) => {
      const { b } = ctx;
      const last = t.lastMove;
      if (t.v.encore || !last || ['encore', 'mimic', 'mirror-move', 'struggle', 'transform', 'sketch'].includes(last)) return fail(b);
      // Gen 4 (BtlCmd_TryEncore): 3–7 more turns.
      t.v.encore = { move: last, turns: ctx.b.gen4 ? (ctx.b.random16() % 5) + 4 : (b.random16() & 3) + 3 };
      b.text(`${b.Name(t)} got an encore!`);
    }, { substitute: false }),
  taunt: (ctx) =>
    onTarget(ctx, (t) => {
      if (t.v.taunt) return fail(ctx.b);
      // Gen 4 (subscript_0132_TauntStart): 3–5 turns.
      t.v.taunt = ctx.b.gen4 ? (ctx.b.random16() % 3) + 3 : 2;
      ctx.b.text(`${ctx.b.Name(t)} fell for the taunt!`);
    }, { substitute: false }),
  torment: (ctx) =>
    onTarget(ctx, (t) => {
      if (t.v.torment) return fail(ctx.b);
      t.v.torment = true;
      ctx.b.text(`${ctx.b.Name(ctx.user)} subjected ${ctx.b.name(t)} to torment!`);
    }, { substitute: !ctx.b.gen4 }),
  imprison: (ctx) => {
    // Fails unless the foe knows one of the user's moves (Cmd_tryimprison; BtlCmd_TryImprison).
    const own = [...ctx.user.slots, ctx.user.basic];
    const foe = ctx.b.foeOf(ctx.user);
    if (ctx.user.v.imprison || ![...foe.slots, foe.basic].some((k) => own.includes(k))) return fail(ctx.b);
    ctx.user.v.imprison = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} sealed the opponent's moves!`);
  },
  spite: (ctx) =>
    onTarget(ctx, (t) => {
      // No PP in these battles: Spite puts the target's last move out of use for the 2–5 PP it would have taken, in
      // ticks of cooldown (README: Idle Adventure); it fails on a basic move or Struggle, which never cool down.
      const { b } = ctx;
      const last = t.lastMove;
      if (!last || last === t.basic || last === 'struggle' || !t.slots.includes(last)) return fail(b);
      // Gen 4 (BtlCmd_TrySpite): always 4.
      const n = b.gen4 ? 4 : (b.random16() & 3) + 2;
      t.cooldowns[last] = (t.cooldowns[last] ?? 0) + n;
      b.emit({ t: 'cooldown', side: t.side, cooldowns: { ...t.cooldowns } });
      b.text(`It put ${b.Name(t)}'s ${moveData(last).name} out of use for ${n} more turns!`);
    }, { substitute: false }),
  stockpile: (ctx) => {
    const { b, user } = ctx;
    const n = user.v.stockpile ?? 0;
    if (n >= 3) return void b.text(`${b.Name(user)} can't stockpile any more!`);
    user.v.stockpile = n + 1;
    b.text(`${b.Name(user)} stockpiled ${n + 1}!`);
    // Gen 4 (subscript_0124): Defense and Sp. Def up 1 each, the stages that rose counted for Spit Up and Swallow.
    if (b.gen4) {
      if (b.changeStat(user, 'def', 1, true)) user.v.stockpileDef = (user.v.stockpileDef ?? 0) + 1;
      if (b.changeStat(user, 'spd', 1, true)) user.v.stockpileSpd = (user.v.stockpileSpd ?? 0) + 1;
    }
  },

  // ---- Calling and copying other moves ----
  metronome: (ctx) => {
    const { b, user } = ctx;
    const keys = allMoveKeys().filter((k) => !noMetronome(b).has(k) && !user.slots.includes(k) && k !== user.basic);
    const key = keys[b.roll(keys.length)]!;
    b.text(`Waggling a finger let it use ${moveData(key).name}!`);
    b.useMove(user, key, true);
  },
  mirror_move: (ctx) => {
    const { b, user, target } = ctx;
    const last = target.lastMove;
    if (!last || !moveData(last).flags.includes('mirror_move_affected')) return fail(b);
    b.useMove(user, last, true);
  },
  sleep_talk: (ctx) => {
    const { b, user } = ctx;
    if (user.status !== 'sleep') return fail(b);
    const options = [...user.slots, user.basic].filter((k) => !(b.gen4 ? NO_SLEEP_TALK4 : NO_SLEEP_TALK).has(k));
    if (!options.length) return fail(b);
    b.useMove(user, options[b.roll(options.length)]!, true);
  },
  assist: (ctx) => {
    const { b, user } = ctx;
    const team = user.side === 0 ? b.party : b.foes;
    const options = team.filter((m) => m !== user).flatMap((m) => [...m.slots, m.basic]).filter((k) => !noMetronome(b).has(k) && k !== 'assist');
    if (!options.length) return fail(b);
    b.useMove(user, options[b.roll(options.length)]!, true);
  },
  nature_power: (ctx) => {
    const key = ctx.b.gen4 ? TERRAIN4[ctx.b.setup.terrain].nature : NATURE_POWER[ctx.b.setup.terrain];
    ctx.b.text(`Nature Power turned into ${moveData(key).name}!`);
    ctx.b.useMove(ctx.user, key, true);
  },
  mimic: (ctx) =>
    onTarget(ctx, (t) => {
      const { b, user } = ctx;
      const last = t.lastMove;
      // Gen 4 (BtlCmd_TryMimic): fails on a Substitute or a Transformed user; Transform can be copied, Chatter can't.
      const banned = b.gen4 ? ['mimic', 'struggle', 'metronome', 'sketch', 'chatter'] : ['mimic', 'struggle', 'metronome', 'transform', 'sketch'];
      if (b.gen4 && (t.v.substitute || user.v.transformed)) return fail(b);
      if (!last || banned.includes(last) || user.slots.includes(last)) return fail(b);
      user.slots = user.slots.map((k) => (k === 'mimic' ? last : k));
      user.v.mimicked = { from: 'mimic', to: last };
      b.text(`${b.Name(user)} learned ${moveData(last).name}!`);
    }, { substitute: false }),
  transform: (ctx) =>
    onTarget(ctx, (t) => {
      const { b, user } = ctx;
      if (user.v.transformed || t.v.transformed) return fail(b);
      user.v.transformed = true;
      user.species = t.species;
      user.types = [...t.types];
      user.ability = t.ability;
      user.stats = { ...t.stats };
      user.stages = { ...t.stages };
      user.slots = [...t.slots];
      user.basic = t.basic;
      b.text(`${b.Name(user)} transformed into ${species(t.species).name}!`);
    }, { substitute: false }),
  conversion: (ctx) => {
    const { b, user } = ctx;
    const types = [...user.slots, user.basic].map((k) => moveData(k).type).filter((t) => t !== 'mystery' && !user.types.includes(t));
    if (!types.length) return fail(b);
    const t = types[b.roll(types.length)]!;
    user.types = [t];
    b.text(`${b.Name(user)} transformed into the ${t[0]!.toUpperCase() + t.slice(1)} type!`);
  },
  conversion_2: (ctx) => {
    const { b, user } = ctx;
    const last = user.lastHitBy;
    if (!last) return fail(b);
    const all: TypeName[] = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark'];
    const resists = all.filter((t) => effectiveness(last.type, [t]) < 1 && !user.types.includes(t));
    if (!resists.length) return fail(b);
    const t = resists[b.roll(resists.length)]!;
    user.types = [t];
    b.text(`${b.Name(user)} transformed into the ${t[0]!.toUpperCase() + t.slice(1)} type!`);
  },
  camouflage: (ctx) => {
    const t = ctx.b.gen4 ? TERRAIN4[ctx.b.setup.terrain].type : CAMOUFLAGE[ctx.b.setup.terrain];
    if (ctx.user.types.includes(t) || (ctx.b.gen4 && ctx.user.ability === 'multitype')) return fail(ctx.b);
    ctx.user.types = [t];
    ctx.b.text(`${ctx.b.Name(ctx.user)} transformed into the ${t[0]!.toUpperCase() + t.slice(1)} type!`);
  },
  role_play: (ctx) => {
    const { b, user, target } = ctx;
    // Gen 4 (subscript_0135_CopyAbility): a target out of reach dodges it; no failing on the same ability.
    if (target.ability === 'none' || target.ability === 'wonder-guard' || (b.gen4 ? target.v.semiInvulnerable || target.ability === 'multitype' : user.ability === target.ability)) return fail(b);
    user.ability = target.ability;
    b.text(`${b.Name(user)} copied ${b.name(target)}'s ability!`);
  },
  skill_swap: (ctx) =>
    onTarget(ctx, (t) => {
      const { b, user } = ctx;
      if (t.ability === 'wonder-guard' || user.ability === 'wonder-guard') return fail(b);
      [user.ability, t.ability] = [t.ability, user.ability];
      b.text(`${b.Name(user)} swapped abilities with its target!`);
    }, { substitute: false }),
  trick: (ctx) =>
    onTarget(ctx, (t) => {
      const { b, user } = ctx;
      // The foe's side never trades items outside link battles (Cmd_tryswapitems).
      if ((!user.item && !t.item) || t.ability === 'sticky-hold' || user.side === 1) return fail(b);
      [user.item, t.item] = [t.item, user.item];
      b.text(`${b.Name(user)} switched items with its target!`);
    }),
  recycle: (ctx) => {
    const { b, user } = ctx;
    if (user.item || !user.usedItem) return fail(b);
    user.item = user.usedItem;
    user.usedItem = null;
    b.text(`${b.Name(user)} found one ${itemName(user.item)}!`);
  },
  magic_coat: (ctx) => {
    ctx.user.v.magicCoat = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} shrouded itself with Magic Coat!`);
  },
  snatch: (ctx) => {
    ctx.user.v.snatch = true;
    ctx.b.text(`${ctx.b.Name(ctx.user)} waits for a target to make a move!`);
  },

  // ---- Leaving the battle, and what singles without switching can't do ----
  roar: (ctx) =>
    onTarget(ctx, (t) => {
      const { b } = ctx;
      if (t.v.ingrain || (b.gen4 ? b.targetHas(ctx.user, t, 'suction-cups') : t.ability === 'suction-cups')) return fail(b);
      // Gen 4 (WhirlwindCheck): a lower-level user succeeds only by a roll on both levels.
      const [ul, tl] = [ctx.user.level, t.level];
      if (b.gen4 && ul < tl && Math.floor(((b.random16() & 0xff) * (ul + tl)) / 256) + 1 <= Math.floor(tl / 4)) return fail(b);
      if (b.setup.kind === 'wild') {
        b.text(t.side === 1 ? `${b.Name(t)} fled!` : `${b.Name(ctx.user)} scared you off!`);
        return b.end('fled');
      }
      const team = t.side === 0 ? b.party : b.foes;
      const others = team.filter((m) => m !== t && !m.fainted);
      if (!others.length) return fail(b);
      const next = others[b.roll(others.length)]!;
      b.text(`${b.Name(t)} was dragged out!`);
      b.sendOut(next);
    }, { substitute: false }),
  teleport: (ctx) => {
    const { b, user } = ctx;
    if (b.setup.kind !== 'wild' || user.v.meanLook || user.v.trapped) return fail(b);
    b.text(user.side === 1 ? `${b.Name(user)} fled!` : `${b.Name(user)} teleported away!`);
    b.end('fled');
  },
  splash: ({ b }) => b.text('But nothing happened!'),
  baton_pass: fail0,
  follow_me: fail0,
  helping_hand: fail0,
  sketch: fail0,
};

function fail0(ctx: MoveCtx) {
  fail(ctx.b);
}

const itemName = (key: string) => key.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');

/** Flinches the target, if it hasn't moved yet this turn (Inner Focus stops it). */
function flinch(ctx: MoveCtx, h: Hit, chancePercent = ctx.move.chance) {
  const { b, target } = ctx;
  if ((b.gen4 ? b.targetHas(ctx.user, target, 'inner-focus') : target.ability === 'inner-focus') || b.movedThisTurn.has(target.side)) return;
  if (b.secondaryHappens(ctx, h, chancePercent)) target.v.flinch = true;
}

/** Absorb's half of the damage dealt back to the user (Liquid Ooze hurts instead). */
function drain(ctx: MoveCtx, h: Hit) {
  const { b, user, target } = ctx;
  let amount = Math.max(1, Math.floor(h.dealt / 2));
  // Gen 4: the Big Root heals more; Magic Guard takes no Liquid Ooze; Dream Eater never meets Liquid Ooze (subscript_0024, subscript_0033).
  if (b.gen4 && b.holdEffect(user) === 'leech_boost') amount = Math.floor((amount * (100 + itemData(user.item!).holdParam)) / 100);
  const ooze = target.ability === 'liquid-ooze' && !(b.gen4 && ctx.move.effect === 'dream_eater');
  if (ooze) {
    if (!(b.gen4 && user.ability === 'magic-guard')) b.damage(user, amount, { msg: `${b.Name(user)} sucked up the liquid ooze!` });
  } else b.heal(user, amount, `${b.Name(target)} had its energy drained!`);
}

/** Gen 4's Reckless: recoil moves' power 1.2x. */
function reckless(ctx: MoveCtx) {
  if (ctx.b.gen4 && ctx.user.ability === 'reckless') ctx.power = Math.floor((ctx.power * 12) / 10);
}

/** Counter and Mirror Coat: twice the physical (or special) damage taken from the other Pokémon this turn. */
function counterLike(ctx: MoveCtx, kind: 'physicalHit' | 'specialHit') {
  const taken = ctx.user.v[kind] ?? 0;
  if (!taken) return fail(ctx.b);
  const t = ctx.type;
  ctx.type = 'mystery';
  if (!ctx.b.lands(ctx, { immunity: false })) return;
  ctx.type = t;
  if (ctx.b.immune(ctx.user, ctx.target, t)) return void ctx.b.text(`It doesn't affect ${ctx.b.name(ctx.target)}…`);
  ctx.b.strike(ctx, { fixed: taken * 2 });
}

/** Synthesis, Moonlight and Morning Sun: half the max HP, 2/3 in the sun, 1/4 in other weather. */
function weatherHeal(ctx: MoveCtx) {
  const { b } = ctx;
  if (!b.weatherOn()) return healSelf(ctx, 1, 2);
  if (b.weather!.kind === 'sun') return healSelf(ctx, 2, 3);
  healSelf(ctx, 1, 4);
}

/** Reflect, Light Screen, Mist and Safeguard on the user's side for 5 turns. */
function sideEffect(ctx: MoveCtx, key: 'reflect' | 'lightScreen' | 'mist' | 'safeguard', line: string) {
  const side = ctx.b.sides[ctx.user.side];
  if (side[key]) return fail(ctx.b);
  // Gen 4's Light Clay: the screens longer by its param (BtlCmd_TryReflect, BtlCmd_TryLightScreen).
  side[key] = 5 + (key === 'reflect' || key === 'lightScreen' ? heldParam(ctx.b, ctx.user, 'extend_screens') : 0);
  ctx.b.text(ctx.user.side === 1 ? line.replace('Your team', "The foe's team") : line);
}

/** Protect, Detect and Endure: less likely each time in a row (1, 1/2, 1/4, 1/8: sProtectSuccessRates). */
function protectLike(ctx: MoveCtx, kind: 'protect' | 'endure') {
  const { b, user } = ctx;
  const streak = user.v.protectStreak ?? 0;
  const odds = [65535, 32767, 16383, 8191][Math.min(3, streak)]!;
  // It fails for the last to move this turn (Cmd_setprotectlike's notLastTurn; BtlCmd_TryProtection).
  if (b.random16() > odds || b.movedThisTurn.has(b.foeOf(user).side)) {
    delete user.v.protectStreak;
    return fail(b);
  }
  user.v.protectStreak = streak + 1;
  user.v[kind] = true;
  b.text(kind === 'protect' ? `${b.Name(user)} protected itself!` : `${b.Name(user)} braced itself!`);
}

