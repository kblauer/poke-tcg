// Attack resolution: legality, the choices an attack asks for, damage (weakness, resistance,
// prevention) and the helpers card effects use. Card-specific behaviour lives in effects/.
import { lookupCard, type Attack, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { attackEffect, powerEffect } from './effects/index.js';
import {
  canPayCost,
  conditionLabel,
  energyProvided,
  type Affliction,
  type CardInstance,
  type GameState,
  type InPlayPokemon,
  type PlayerState,
  type PokemonEffects,
} from './engine.js';
import { powerActive } from './powers.js';
import { addLog, baseUid, clearOnLeavingActive, effectId, flipCoin, inPlayDef, pokemonName } from './status.js';
import type { PendingChoice, PendingChoiceInput } from './trainers.js';

/** Answers to an attack's questions. Each field belongs to one kind of ChoiceSpec. */
export interface AttackChoices {
  /** Own energy to discard to use the attack (Fire Spin, Ember…). */
  energyUids?: string[];
  /** Opponent's benched Pokémon to switch in (Lure). */
  benchSlot?: number;
  /** Energy to discard from the Defending Pokémon (Whirlpool, Hyper Beam). */
  defenderEnergyUid?: string;
  /** One of the Defending Pokémon's attacks (Amnesia). */
  attackIndex?: number;
  /** The Defending Pokémon's attack to copy (Metronome). */
  copyIndex?: number;
  /** A type (Conversion 1 and 2). */
  type?: EnergyType;
  /** Cards from your discard pile to put into your hand (Energy Conversion, Scavenge). */
  discardUids?: string[];
  /** Several of the opponent's benched Pokémon (Gigashock). */
  benchSlots?: number[];
  /** Whose deck the attack uses (Prophecy). */
  deck?: 'own' | 'opponent';
  /** One of your benched Pokémon (Teleport). */
  ownBenchSlot?: number;
}

/** A question an attack asks before it's used. `prompt` is shown to the player. */
export type ChoiceSpec = { prompt: string } & (
  | { kind: 'ownEnergy'; count: number; options: CardInstance[] }
  | { kind: 'opponentBench'; options: number[] }
  | { kind: 'defenderEnergy'; options: CardInstance[] }
  | { kind: 'defenderAttack'; options: number[] }
  | { kind: 'copyAttack'; options: number[] }
  | { kind: 'type'; options: EnergyType[] }
  | { kind: 'ownBench'; options: number[] }
  /** Any number (0 to all) of the attacker's energy, as part of the attack (Wildfire). */
  | { kind: 'ownEnergyUpTo'; options: CardInstance[] }
  | { kind: 'ownDiscard'; min: number; max: number; options: CardInstance[] }
  /** `count` of them, or all if there are fewer. */
  | { kind: 'opponentBenchMany'; count: number; options: number[] }
  | { kind: 'deck'; options: ('own' | 'opponent')[] }
);

/** What an attack can see before it's used. View-safe: the UI builds it from a PlayerView. */
export interface AttackSituation {
  attacker: InPlayPokemon;
  defender: InPlayPokemon;
  opponentBench: (InPlayPokemon | null)[];
  ownBench: (InPlayPokemon | null)[];
  ownDiscard: CardInstance[];
  cards: CardLibrary;
  turn: number;
}

/** Card-specific attack behaviour. Attacks without one just deal their base damage. */
export interface AttackEffect {
  /** Printed text, where TCGdex's text differs from the card. */
  text?: string;
  /** Energy the attacker discards in order to use the attack. */
  discard?: { count: number | 'all'; type?: EnergyType };
  /** Why the attack can't be used now (beyond its energy cost). */
  blocked?: (s: AttackSituation) => string | null;
  /** Questions besides the discard. May depend on earlier answers (Metronome). */
  choices?: (s: AttackSituation, c: AttackChoices) => ChoiceSpec[];
  run: (ctx: AttackContext) => void;
}

/** Everything an effect can do while an attack resolves. */
export interface AttackContext {
  state: GameState;
  me: PlayerState;
  opp: PlayerState;
  attacker: InPlayPokemon;
  attackerDef: PokemonCardDef;
  defender: InPlayPokemon;
  defenderDef: PokemonCardDef;
  choices: AttackChoices;
  turn: number;
  /** True = heads. Logged. */
  flip: () => boolean;
  /** Flips `n` coins and returns the number of heads. */
  flips: (n: number) => number;
  /** Damages the Defending Pokémon (weakness and resistance unless turned off). Returns the damage done. */
  hit: (amount: number, opts?: { weakness?: boolean }) => number;
  /** Damages the attacker (no weakness or resistance). */
  selfDamage: (amount: number) => void;
  /** Damages every benched Pokémon of `player` (no weakness or resistance). */
  benchDamage: (player: PlayerState, amount: number) => void;
  /** Damages one benched Pokémon of `player` (no weakness or resistance). */
  damageBenched: (player: PlayerState, slot: number, amount: number) => void;
  /** Gives the Defending Pokémon a Special Condition or Poison, unless its effects are prevented. */
  inflict: (affliction: Affliction) => void;
  /** Removes damage from the attacker. */
  heal: (amount: number | 'all') => void;
  /** Sets an effect on the attacker for the opponent's next turn. */
  protect: (key: 'preventDamage' | 'preventAll' | 'harden' | 'destinyBond' | 'minimize') => void;
  /** Runs `fn` on the Defending Pokémon's effects, unless its effects are prevented. */
  affectDefender: (fn: (effects: PokemonEffects) => void) => void;
  discardDefenderEnergy: (uid: string) => void;
  /** Switches the Defending Pokémon with the opponent's benched Pokémon in `slot`. */
  switchDefender: (slot: number) => void;
  /** Runs another attack's effect (Metronome), as if this Pokémon used it. */
  useAttack: (attack: Attack, sourceDefId: string) => void;
  /** The attacking player draws up to `n` cards. */
  draw: (n: number) => void;
  /** The attacker is now Confused (Petal Dance, Tantrum…). */
  confuseSelf: () => void;
  /** Switches the attacker with the attacking player's benched Pokémon in `slot` (Teleport). */
  switchOwn: (slot: number) => void;
  /** Returns the Defending Pokémon and every card attached to it to the opponent's hand (Hurricane). */
  returnDefender: () => void;
  /** Asks the attacking player to finish a search (see PendingChoice); the turn ends after it. */
  pend: (choice: PendingChoiceInput) => void;
  log: (text: string) => void;
}

const def = inPlayDef;

/** How many of the named Trainer card are attached to the Pokémon (PlusPower, Defender). */
const attachedCount = (cards: CardLibrary, p: InPlayPokemon, name: string) => (p.attached ?? []).filter((a) => lookupCard(cards, a.card.defId).name === name).length;

/**
 * Attack damage without weakness or resistance (to a benched Pokémon, or to the attacker itself,
 * Confusion included): Defender still takes off 20 each.
 */
const afterDefender = (cards: CardLibrary, p: InPlayPokemon, amount: number) => Math.max(0, amount - 20 * attachedCount(cards, p, 'Defender'));

/** An effect turned on for "your opponent's next turn" is still active this turn. */
const active = (until: number | undefined, turn: number) => until !== undefined && until >= turn;

/**
 * Why the attack can't be used now, or null if it can (given the right choices). View-safe.
 * The first-turn rule and the presence of a defender are checked by the caller.
 */
export function attackError(s: AttackSituation, attackIndex: number): string | null {
  const attackerDef = def(s.cards, s.attacker);
  const attack = attackerDef.attacks[attackIndex];
  if (!attack) return 'Invalid attack';
  const condition = s.attacker.condition;
  if (condition === 'asleep' || condition === 'paralyzed') return `${attackerDef.name} is ${conditionLabel(condition)} and can't attack`;
  if (s.attacker.effects?.amnesia?.attack === attack.name && active(s.attacker.effects.amnesia.until, s.turn)) {
    return `${attackerDef.name} can't use ${attack.name} this turn`;
  }
  const blockedTarget = s.attacker.effects?.cantAttack;
  if (blockedTarget && blockedTarget.target === baseUid(s.defender) && active(blockedTarget.until, s.turn)) {
    return `${attackerDef.name} can't attack ${def(s.cards, s.defender).name} this turn`;
  }
  if (!canPayCost(s.attacker, attack, s.cards)) return 'Not enough energy';
  const effect = attackEffect(effectId(s.attacker), attack.name);
  const discard = effect?.discard;
  if (discard && discard.count !== 'all' && discardOptions(s, discard.type).length < discard.count) {
    return `${attack.name} needs ${discard.count} ${discard.type ? `${typeName(discard.type)} ` : ''}Energy to discard`;
  }
  return effect?.blocked?.(s) ?? null;
}

/** Energy that can be discarded for the attack. A Transformed Ditto's Energy counts as any type. */
const discardOptions = (s: AttackSituation, type?: EnergyType) =>
  s.attacker.energy.filter((e) => !type || s.attacker.transformed || energyProvided(e, s.cards).type === type);

export const typeName = (t: EnergyType) => t[0]!.toUpperCase() + t.slice(1);

/** All questions the attack asks, given the answers so far. */
function choiceSpecs(s: AttackSituation, attackIndex: number, c: AttackChoices): ChoiceSpec[] {
  const attack = def(s.cards, s.attacker).attacks[attackIndex]!;
  const effect = attackEffect(effectId(s.attacker), attack.name);
  const specs: ChoiceSpec[] = [];
  const discard = effect?.discard;
  if (discard && discard.count !== 'all') {
    const type = discard.type ? `${typeName(discard.type)} ` : '';
    specs.push({
      kind: 'ownEnergy',
      count: discard.count,
      options: discardOptions(s, discard.type),
      prompt: `Choose ${discard.count} ${type}Energy to discard`,
    });
  }
  if (effect?.choices) specs.push(...effect.choices(s, c));
  return specs;
}

const FIELD = {
  ownEnergy: 'energyUids',
  opponentBench: 'benchSlot',
  defenderEnergy: 'defenderEnergyUid',
  defenderAttack: 'attackIndex',
  copyAttack: 'copyIndex',
  type: 'type',
  ownBench: 'ownBenchSlot',
  ownEnergyUpTo: 'energyUids',
  ownDiscard: 'discardUids',
  opponentBenchMany: 'benchSlots',
  deck: 'deck',
} as const satisfies Record<ChoiceSpec['kind'], keyof AttackChoices>;

/** The answer when there's nothing to decide (one option, or identical cards); undefined if the player must choose. */
function autoAnswer(spec: ChoiceSpec): AttackChoices[keyof AttackChoices] | undefined {
  switch (spec.kind) {
    case 'ownEnergy': {
      const same = new Set(spec.options.map((e) => e.defId)).size <= 1;
      return spec.options.length <= spec.count || same ? spec.options.slice(0, spec.count).map((e) => e.uid) : undefined;
    }
    case 'defenderEnergy':
      return new Set(spec.options.map((e) => e.defId)).size === 1 ? spec.options[0]!.uid : undefined;
    case 'type':
    case 'deck':
      return undefined;
    case 'ownEnergyUpTo':
      return spec.options.length === 0 ? [] : undefined;
    case 'ownDiscard':
      return spec.options.length <= spec.min ? spec.options.map((c) => c.uid) : undefined;
    case 'opponentBenchMany':
      return spec.options.length <= spec.count ? spec.options : undefined;
    default:
      return spec.options.length === 1 ? spec.options[0] : undefined;
  }
}

/** A list of distinct option ids, between `min` and `max` long. */
const pickedIds = (value: unknown, ids: unknown[], min: number, max: number) =>
  Array.isArray(value) && value.length >= min && value.length <= max && new Set(value).size === value.length && value.every((v) => ids.includes(v));

function validAnswer(spec: ChoiceSpec, value: unknown): boolean {
  switch (spec.kind) {
    case 'ownEnergy': {
      const uids = value as string[];
      return Array.isArray(uids) && uids.length === spec.count && new Set(uids).size === uids.length && uids.every((u) => spec.options.some((e) => e.uid === u));
    }
    case 'defenderEnergy':
      return spec.options.some((e) => e.uid === value);
    case 'ownEnergyUpTo':
      return pickedIds(value, spec.options.map((e) => e.uid), 0, spec.options.length);
    case 'ownDiscard':
      return pickedIds(value, spec.options.map((c) => c.uid), spec.min, spec.max);
    case 'opponentBenchMany': {
      const n = Math.min(spec.count, spec.options.length);
      return pickedIds(value, spec.options, n, n);
    }
    default:
      return (spec.options as unknown[]).includes(value);
  }
}

/**
 * Fills in the answers that need no decision and checks the given ones. Returns the complete
 * choices, or an error with the question still needing an answer (`need`).
 */
export function resolveChoices(
  s: AttackSituation,
  attackIndex: number,
  given: AttackChoices,
): { choices: AttackChoices } | { error: string; need?: ChoiceSpec } {
  const c: AttackChoices = { ...given };
  // Each answer can add questions (Metronome), so resolve one at a time.
  for (let guard = 0; guard < 10; guard++) {
    const specs = choiceSpecs(s, attackIndex, c);
    for (const spec of specs) {
      const value = c[FIELD[spec.kind]];
      if (value !== undefined && !validAnswer(spec, value)) return { error: `Invalid choice: ${spec.prompt.toLowerCase()}` };
    }
    const open = specs.find((spec) => c[FIELD[spec.kind]] === undefined);
    if (!open) return { choices: c };
    const auto = autoAnswer(open);
    if (auto === undefined) return { error: open.prompt, need: open };
    (c as Record<string, unknown>)[FIELD[open.kind]] = auto;
  }
  return { error: 'Too many choices' };
}

/** The next question the player has to answer for this attack, or null when it's ready to use. */
export function nextAttackChoice(s: AttackSituation, attackIndex: number, given: AttackChoices): ChoiceSpec | null {
  const result = resolveChoices(s, attackIndex, given);
  return 'need' in result ? (result.need ?? null) : null;
}

/** Records an answer to `spec` in `choices`. */
export const answerChoice = (choices: AttackChoices, spec: ChoiceSpec, value: AttackChoices[keyof AttackChoices]): AttackChoices => ({
  ...choices,
  [FIELD[spec.kind]]: value,
});

/**
 * Damage after weakness and resistance (never below 0). Conversion 1 and 2 change the types
 * through the defender's effects.
 */
export function applyWeaknessResistance(amount: number, attackerType: EnergyType, defender: PokemonCardDef, effects?: PokemonEffects): number {
  if (amount <= 0) return 0;
  const weakness = defender.weakness && { ...defender.weakness, type: effects?.weakness ?? defender.weakness.type };
  const resistance = effects?.resistance ? { type: effects.resistance, amount: defender.resistance?.amount ?? 30 } : defender.resistance;
  let damage = amount;
  if (weakness?.type === attackerType) damage *= weakness.multiplier;
  if (resistance?.type === attackerType) damage -= resistance.amount;
  return Math.max(0, damage);
}

/**
 * Damage an attack's base damage does to the defending Pokémon: doubled (or so) if it's weak to
 * the attacker's type, then reduced if it resists it, never below 0. Pass the defender in play
 * to include Conversion changes.
 */
export const attackDamage = (attack: Attack, attacker: PokemonCardDef, defender: PokemonCardDef, defenderInPlay?: InPlayPokemon) =>
  applyWeaknessResistance(attack.damage, attacker.type, defender, defenderInPlay?.effects);

/**
 * Uses an attack: validates it and its choices, then resolves Confusion, Sand-attack, the
 * discard and the effect. Mutates `state`; returns an error instead if the attack isn't allowed.
 * Knockouts and the end of the turn are handled by the caller.
 */
export function performAttack(state: GameState, me: PlayerState, opp: PlayerState, attackIndex: number, given: AttackChoices): string | null {
  const attacker = me.active!;
  const defender = opp.active!;
  const attackerDef = def(state.cards, attacker);
  const attack = attackerDef.attacks[attackIndex];
  if (!attack) return 'Invalid attack';
  const situation: AttackSituation = { attacker, defender, opponentBench: opp.bench, ownBench: me.bench, ownDiscard: me.discard, cards: state.cards, turn: state.turn };
  const error = attackError(situation, attackIndex);
  if (error) return error;
  const resolved = resolveChoices(situation, attackIndex, given);
  if ('error' in resolved) return resolved.error;
  const choices = resolved.choices;

  addLog(state, `${attackerDef.name} used ${attack.name}.`, me.id);
  // 1999 rules: a Confused Pokémon flips to attack; on tails it does 20 damage to itself instead.
  if (attacker.condition === 'confused' && !flipCoin(state, `${attackerDef.name} is Confused`, me.id)) {
    const damage = afterDefender(state.cards, attacker, 20);
    attacker.damage += damage;
    addLog(state, damage ? `${attackerDef.name} hurt itself for ${damage} damage.` : `Defender prevented the damage ${attackerDef.name} did to itself.`, me.id);
    return null;
  }
  for (const [key, name] of [['sandAttack', 'Sand-attack'], ['smokescreen', 'Smokescreen']] as const) {
    if (active(attacker.effects?.[key], state.turn) && !flipCoin(state, name, me.id)) {
      addLog(state, `${attack.name} did nothing.`, me.id);
      return null;
    }
  }

  const effect = attackEffect(effectId(attacker), attack.name);
  if (effect?.discard) {
    const uids = new Set(effect.discard.count === 'all' ? attacker.energy.map((e) => e.uid) : choices.energyUids);
    me.discard.push(...attacker.energy.filter((e) => uids.has(e.uid)));
    attacker.energy = attacker.energy.filter((e) => !uids.has(e.uid));
    addLog(state, `${attackerDef.name} discarded ${uids.size} Energy.`, me.id);
  }

  const ctx = createContext(state, me, opp, choices);
  ctx.useAttack(attack, effectId(attacker));
  return null;
}

function createContext(state: GameState, me: PlayerState, opp: PlayerState, choices: AttackChoices): AttackContext {
  const turn = state.turn;
  const attacker = me.active!;
  const attackerDef = def(state.cards, attacker);
  const log = (text: string, player = me.id) => addLog(state, text, player);
  const sides = [me, opp];
  /** The power of a Pokémon reacting to the attack, while it works (not Asleep etc., no Toxic Gas). */
  const passive = (p: InPlayPokemon) => (powerActive(p, state.cards, sides) ? powerEffect(effectId(p)) : undefined);
  const transparency = new Map<string, boolean>();
  /** Transparency: the first time this attack does anything to the Pokémon, a flip; heads prevents all its effects on it. */
  const transparent = (p: InPlayPokemon, owner: PlayerState) => {
    if (!passive(p)?.transparency) return false;
    if (!transparency.has(p.card.uid)) transparency.set(p.card.uid, flipCoin(state, 'Transparency', owner.id));
    return transparency.get(p.card.uid)!;
  };
  /** Kabuto Armor: attack damage to it is halved, rounded down to the nearest 10, after everything else. */
  const armor = (p: InPlayPokemon, damage: number, owner: PlayerState) => {
    if (damage <= 0 || !passive(p)?.halvesDamage) return damage;
    log(`Kabuto Armor halved the damage to ${pokemonName(state, p)}.`, owner.id);
    return Math.floor(damage / 20) * 10;
  };
  /**
   * Effects on the defender are blocked by Barrier and Agility, and by Transparency on heads. Read
   * live: Lure and Whirlwind change the defender.
   */
  const shielded = () => active(opp.active?.effects?.preventAll, turn) || (!!opp.active && transparent(opp.active, opp));
  /** Damage to a benched Pokémon or the attacker itself: Defender, then Kabuto Armor. */
  const benchedDamage = (p: InPlayPokemon, amount: number, owner: PlayerState) => {
    const damage = armor(p, afterDefender(state.cards, p, amount), owner);
    return damage >= 30 && passive(p)?.invisibleWall ? 0 : damage;
  };
  const record = (pokemon: InPlayPokemon) => {
    const effects = (pokemon.effects ??= {});
    if (effects.attackedOn?.turn !== turn) effects.attackedOn = { turn, damage: 0, afflictions: [] };
    return effects.attackedOn;
  };

  const ctx: AttackContext = {
    state,
    me,
    opp,
    attacker,
    attackerDef,
    get defender() {
      return opp.active!;
    },
    get defenderDef() {
      return def(state.cards, opp.active!);
    },
    choices,
    turn,
    flip: () => flipCoin(state, 'Coin flip', me.id),
    flips: (n) => Array.from({ length: n }, () => ctx.flip()).filter(Boolean).length,
    hit(amount, { weakness = true } = {}) {
      const defender = opp.active!;
      const defenderDef = def(state.cards, defender);
      if (amount <= 0) return 0;
      if (shielded()) {
        log(`${defenderDef.name} is protected from the attack.`, opp.id);
        return 0;
      }
      let damage = weakness ? applyWeaknessResistance(amount, attackerDef.type, defenderDef, defender.effects) : amount;
      // PlusPower adds 10 each, then Defender takes off 20 each (both after weakness and resistance).
      if (damage > 0) damage = Math.max(0, damage + 10 * attachedCount(state.cards, attacker, 'PlusPower') - 20 * attachedCount(state.cards, defender, 'Defender'));
      // Pounce and Snivel: less damage from the Pokémon they were used on (also after weakness and resistance).
      const pounce = attacker.effects?.pounce;
      if (damage > 0 && pounce && pounce.target === baseUid(defender) && active(pounce.until, turn)) {
        damage = Math.max(0, damage - pounce.amount);
        log(`The damage to ${defenderDef.name} was reduced by ${pounce.amount}.`, opp.id);
      }
      const effects = defender.effects;
      if (damage > 0 && active(effects?.minimize, turn)) {
        damage = Math.max(0, damage - 20);
        log(`Minimize reduced the damage to ${defenderDef.name} by 20.`, opp.id);
      }
      damage = armor(defender, damage, opp);
      if (damage >= 30 && passive(defender)?.invisibleWall) {
        log(`Invisible Wall prevented the damage to ${defenderDef.name}.`, opp.id);
        damage = 0;
      }
      if (active(effects?.preventDamage, turn) || (active(effects?.harden, turn) && damage <= 30)) {
        log(`The damage to ${defenderDef.name} was prevented.`, opp.id);
        damage = 0;
      }
      if (damage === 0) return 0;
      defender.damage += damage;
      record(defender).damage += damage;
      log(`${defenderDef.name} took ${damage} damage.`, opp.id);
      passive(defender)?.onAttackDamage?.(ctx, defender);
      if (defender.damage >= defenderDef.hp && active(effects?.destinyBond, turn)) {
        attacker.damage = Math.max(attacker.damage, attackerDef.hp);
        log(`Destiny Bond: ${attackerDef.name} is Knocked Out too.`, opp.id);
      }
      return damage;
    },
    selfDamage(amount) {
      if (transparent(attacker, me)) return log(`${attackerDef.name} is protected from the attack.`);
      const damage = benchedDamage(attacker, amount, me);
      if (damage === 0) return log(`The damage ${attackerDef.name} did to itself was prevented.`);
      attacker.damage += damage;
      log(`${attackerDef.name} did ${damage} damage to itself.`);
    },
    benchDamage(player, amount) {
      if (!player.bench.some(Boolean)) return;
      log(`${amount} damage to each benched Pokémon.`, player.id);
      for (const p of player.bench) {
        if (!p) continue;
        if (transparent(p, player)) {
          log(`${pokemonName(state, p)} is protected from the attack.`, player.id);
          continue;
        }
        const damage = benchedDamage(p, amount, player);
        if (damage < amount) log(`${pokemonName(state, p)} took ${damage} damage.`, player.id);
        if (damage === 0) continue;
        p.damage += damage;
        if (player === opp) passive(p)?.onAttackDamage?.(ctx, p);
      }
    },
    inflict(affliction) {
      const defender = opp.active!;
      const name = pokemonName(state, defender);
      if (shielded()) return log(`${name} is protected from the attack's effects.`, opp.id);
      if (def(state.cards, defender).trainerText || passive(defender)?.noConditions) return log(`${name} can't be affected by Special Conditions.`, opp.id);
      if (affliction === 'poisoned' || affliction === 'toxic') {
        defender.poison = Math.max(defender.poison ?? 0, affliction === 'toxic' ? 20 : 10);
        log(`${name} is now Poisoned${affliction === 'toxic' ? ' (20 damage)' : ''}.`, opp.id);
      } else {
        defender.condition = affliction;
        if (affliction === 'paralyzed') defender.paralyzedTurn = turn;
        log(`${name} is now ${conditionLabel(affliction)}.`, opp.id);
      }
      record(defender).afflictions.push(affliction);
    },
    damageBenched(player, slot, amount) {
      const benched = player.bench[slot];
      if (!benched || amount <= 0) return;
      if (transparent(benched, player)) return log(`${pokemonName(state, benched)} is protected from the attack.`, player.id);
      const damage = benchedDamage(benched, amount, player);
      if (damage === 0) return log(`The damage to ${pokemonName(state, benched)} was prevented.`, player.id);
      benched.damage += damage;
      log(`${pokemonName(state, benched)} took ${damage} damage.`, player.id);
      if (player === opp) passive(benched)?.onAttackDamage?.(ctx, benched);
    },
    heal(amount) {
      const healed = amount === 'all' ? attacker.damage : Math.min(amount, attacker.damage);
      attacker.damage -= healed;
      if (healed > 0) log(`${attackerDef.name} healed ${healed} damage.`);
    },
    protect(key) {
      (attacker.effects ??= {})[key] = turn + 1;
    },
    affectDefender(fn) {
      if (shielded()) return log(`${ctx.defenderDef.name} is protected from the attack's effects.`, opp.id);
      fn((opp.active!.effects ??= {}));
    },
    discardDefenderEnergy(uid) {
      if (shielded()) return log(`${ctx.defenderDef.name} is protected from the attack's effects.`, opp.id);
      const defender = opp.active!;
      const energy = defender.energy.find((e) => e.uid === uid);
      if (!energy) return;
      defender.energy = defender.energy.filter((e) => e !== energy);
      opp.discard.push(energy);
      log(`Discarded ${lookupCard(state.cards, energy.defId).name} from ${ctx.defenderDef.name}.`, opp.id);
    },
    switchDefender(slot) {
      if (shielded()) return log(`${ctx.defenderDef.name} is protected from the attack's effects.`, opp.id);
      const benched = opp.bench[slot];
      if (!benched) return;
      const old = opp.active!;
      clearOnLeavingActive(old);
      opp.bench[slot] = old;
      opp.active = benched;
      log(`${pokemonName(state, benched)} was switched in for ${pokemonName(state, old)}.`, opp.id);
    },
    useAttack(attack, sourceDefId) {
      const effect = attackEffect(sourceDefId, attack.name);
      if (effect) effect.run(ctx);
      else ctx.hit(attack.damage);
    },
    draw(n) {
      const drawn = me.deck.splice(0, n);
      me.hand.push(...drawn);
      log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
    confuseSelf() {
      if (passive(attacker)?.noConditions) return log(`${attackerDef.name} can't be affected by Special Conditions.`);
      attacker.condition = 'confused';
      log(`${attackerDef.name} is now Confused.`);
    },
    switchOwn(slot) {
      const benched = me.bench[slot];
      if (!benched) return;
      clearOnLeavingActive(attacker);
      me.bench[slot] = attacker;
      me.active = benched;
      log(`${pokemonName(state, attacker)} switched with ${pokemonName(state, benched)}.`);
    },
    returnDefender() {
      if (shielded()) return log(`${ctx.defenderDef.name} is protected from the attack's effects.`, opp.id);
      const defender = opp.active!;
      // A Buzzap'd Electrode attached as Energy is a Pokémon card again.
      const energy = defender.energy.map(({ provides: _, ...card }) => card);
      opp.hand.push(...defender.evolvedFrom, defender.card, ...energy, ...(defender.attached ?? []).map((a) => a.card));
      opp.active = null;
      log(`${pokemonName(state, defender)} and all cards attached to it returned to the hand.`, opp.id);
    },
    pend(choice) {
      state.pendingChoice = { ...choice, player: me.id } as PendingChoice;
    },
    log,
  };
  return ctx;
}
