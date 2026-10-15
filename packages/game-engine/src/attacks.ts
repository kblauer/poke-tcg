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
import { addLog, clearOnLeavingActive, flipCoin, pokemonName } from './status.js';

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
}

/** A question an attack asks before it's used. `prompt` is shown to the player. */
export type ChoiceSpec = { prompt: string } & (
  | { kind: 'ownEnergy'; count: number; options: CardInstance[] }
  | { kind: 'opponentBench'; options: number[] }
  | { kind: 'defenderEnergy'; options: CardInstance[] }
  | { kind: 'defenderAttack'; options: number[] }
  | { kind: 'copyAttack'; options: number[] }
  | { kind: 'type'; options: EnergyType[] }
);

/** What an attack can see before it's used. View-safe: the UI builds it from a PlayerView. */
export interface AttackSituation {
  attacker: InPlayPokemon;
  defender: InPlayPokemon;
  opponentBench: (InPlayPokemon | null)[];
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
  /** Gives the Defending Pokémon a Special Condition or Poison, unless its effects are prevented. */
  inflict: (affliction: Affliction) => void;
  /** Removes damage from the attacker. */
  heal: (amount: number | 'all') => void;
  /** Sets an effect on the attacker for the opponent's next turn. */
  protect: (key: 'preventDamage' | 'preventAll' | 'harden' | 'destinyBond') => void;
  /** Runs `fn` on the Defending Pokémon's effects, unless its effects are prevented. */
  affectDefender: (fn: (effects: PokemonEffects) => void) => void;
  discardDefenderEnergy: (uid: string) => void;
  /** Switches the Defending Pokémon with the opponent's benched Pokémon in `slot`. */
  switchDefender: (slot: number) => void;
  /** Runs another attack's effect (Metronome), as if this Pokémon used it. */
  useAttack: (attack: Attack, sourceDefId: string) => void;
  log: (text: string) => void;
}

const def = (cards: CardLibrary, p: InPlayPokemon) => lookupCard(cards, p.card.defId) as PokemonCardDef;

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
  if (!canPayCost(s.attacker, attack, s.cards)) return 'Not enough energy';
  const effect = attackEffect(s.attacker.card.defId, attack.name);
  const discard = effect?.discard;
  if (discard && discard.count !== 'all' && discardOptions(s, discard.type).length < discard.count) {
    return `${attack.name} needs ${discard.count} ${discard.type ? `${typeName(discard.type)} ` : ''}Energy to discard`;
  }
  return effect?.blocked?.(s) ?? null;
}

const discardOptions = (s: AttackSituation, type?: EnergyType) => s.attacker.energy.filter((e) => !type || energyProvided(e, s.cards).type === type);

export const typeName = (t: EnergyType) => t[0]!.toUpperCase() + t.slice(1);

/** All questions the attack asks, given the answers so far. */
function choiceSpecs(s: AttackSituation, attackIndex: number, c: AttackChoices): ChoiceSpec[] {
  const attack = def(s.cards, s.attacker).attacks[attackIndex]!;
  const effect = attackEffect(s.attacker.card.defId, attack.name);
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
      return undefined;
    default:
      return spec.options.length === 1 ? spec.options[0] : undefined;
  }
}

function validAnswer(spec: ChoiceSpec, value: unknown): boolean {
  switch (spec.kind) {
    case 'ownEnergy': {
      const uids = value as string[];
      return Array.isArray(uids) && uids.length === spec.count && new Set(uids).size === uids.length && uids.every((u) => spec.options.some((e) => e.uid === u));
    }
    case 'defenderEnergy':
      return spec.options.some((e) => e.uid === value);
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
  const situation: AttackSituation = { attacker, defender, opponentBench: opp.bench, cards: state.cards, turn: state.turn };
  const error = attackError(situation, attackIndex);
  if (error) return error;
  const resolved = resolveChoices(situation, attackIndex, given);
  if ('error' in resolved) return resolved.error;
  const choices = resolved.choices;

  addLog(state, `${attackerDef.name} used ${attack.name}.`, me.id);
  // 1999 rules: a Confused Pokémon flips to attack; on tails it does 20 damage to itself instead.
  if (attacker.condition === 'confused' && !flipCoin(state, `${attackerDef.name} is Confused`, me.id)) {
    attacker.damage += 20;
    addLog(state, `${attackerDef.name} hurt itself for 20 damage.`, me.id);
    return null;
  }
  if (active(attacker.effects?.sandAttack, state.turn) && !flipCoin(state, 'Sand-attack', me.id)) {
    addLog(state, `${attack.name} did nothing.`, me.id);
    return null;
  }

  const effect = attackEffect(attacker.card.defId, attack.name);
  if (effect?.discard) {
    const uids = new Set(effect.discard.count === 'all' ? attacker.energy.map((e) => e.uid) : choices.energyUids);
    me.discard.push(...attacker.energy.filter((e) => uids.has(e.uid)));
    attacker.energy = attacker.energy.filter((e) => !uids.has(e.uid));
    addLog(state, `${attackerDef.name} discarded ${uids.size} Energy.`, me.id);
  }

  const ctx = createContext(state, me, opp, choices);
  ctx.useAttack(attack, attacker.card.defId);
  return null;
}

function createContext(state: GameState, me: PlayerState, opp: PlayerState, choices: AttackChoices): AttackContext {
  const turn = state.turn;
  const attacker = me.active!;
  const attackerDef = def(state.cards, attacker);
  const log = (text: string, player = me.id) => addLog(state, text, player);
  /** Effects on the defender are blocked by Barrier and Agility. Read live: Lure and Whirlwind change the defender. */
  const shielded = () => active(opp.active?.effects?.preventAll, turn);
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
      const count = (p: InPlayPokemon, name: string) => (p.attached ?? []).filter((a) => lookupCard(state.cards, a.card.defId).name === name).length;
      if (damage > 0) damage = Math.max(0, damage + 10 * count(attacker, 'PlusPower') - 20 * count(defender, 'Defender'));
      const effects = defender.effects;
      if (active(effects?.preventDamage, turn) || (active(effects?.harden, turn) && damage <= 30)) {
        log(`The damage to ${defenderDef.name} was prevented.`, opp.id);
        damage = 0;
      }
      if (damage === 0) return 0;
      defender.damage += damage;
      record(defender).damage += damage;
      log(`${defenderDef.name} took ${damage} damage.`, opp.id);
      powerEffect(defender.card.defId)?.onAttackDamage?.(ctx, defender);
      if (defender.damage >= defenderDef.hp && active(effects?.destinyBond, turn)) {
        attacker.damage = Math.max(attacker.damage, attackerDef.hp);
        log(`Destiny Bond: ${attackerDef.name} is Knocked Out too.`, opp.id);
      }
      return damage;
    },
    selfDamage(amount) {
      attacker.damage += amount;
      log(`${attackerDef.name} did ${amount} damage to itself.`);
    },
    benchDamage(player, amount) {
      if (!player.bench.some(Boolean)) return;
      log(`${amount} damage to each benched Pokémon.`, player.id);
      for (const p of player.bench) {
        if (!p) continue;
        p.damage += amount;
        if (player === opp) powerEffect(p.card.defId)?.onAttackDamage?.(ctx, p);
      }
    },
    inflict(affliction) {
      const defender = opp.active!;
      const name = pokemonName(state, defender);
      if (shielded()) return log(`${name} is protected from the attack's effects.`, opp.id);
      if (def(state.cards, defender).trainerText) return log(`${name} can't be affected by Special Conditions.`, opp.id);
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
    log,
  };
  return ctx;
}
