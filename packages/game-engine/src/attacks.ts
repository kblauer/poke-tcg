// Attack resolution: legality, the choices an attack asks for, damage (weakness, resistance,
// prevention) and the helpers card effects use. Card-specific behaviour lives in effects/.
import { lookupCard, type Attack, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { attackEffect, powerEffect, trainerEffect } from './effects/index.js';
import {
  canPayCost,
  conditionLabel,
  activeLocked,
  counts,
  discardTheirEnergy,
  discardTool,
  isEnergyCardOf,
  energyProvided,
  toolOf,
  type Affliction,
  type CardInstance,
  type GameState,
  type InPlayPokemon,
  type PlayerId,
  type PlayerState,
  type PokemonEffects,
  type Target,
} from './engine.js';
import { discardsLocked, energyKept, powerActive, prehistoricMemory, scaredBy } from './powers.js';
import { shuffle } from './rng.js';
import { addLog, baseUid, clearOnLeavingActive, effectId, energyProtected, flipCoin, inPlayDef, pokemonName, revealFaceDown, shapeshiftCard } from './status.js';
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
  /** The Defending Pokémon's attack to copy (Metronome), or the attack of `copyFrom` (Super Metronome). */
  copyIndex?: number;
  /** The opponent's Pokémon whose attack is copied (Super Metronome). */
  copyFrom?: Target;
  /** Use the Pokémon Power that makes this attack stronger (Final Blow, Hydroelectric Power). */
  boost?: boolean;
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
  /** One of the opponent's Pokémon in play, Active or Benched (Telekinesis, Lightning Rod). */
  oppTarget?: Target;
  /** Another of the opponent's Pokémon, to move something to (Energy Control). */
  oppTo?: Target;
  /** One of your Pokémon in play (Devolution Beam). */
  ownTarget?: Target;
  /** Another of your Pokémon, to move something to (Energy Patch). */
  ownTo?: Target;
  /** Whose Pokémon the attack picks (Devolution Beam). */
  side?: 'own' | 'opponent';
  /** An Energy card attached to `oppTarget` (Energy Control). */
  oppEnergyUid?: string;
  /** A type for the Defending Pokémon's Weakness, when `type` is the attacker's Resistance (Texture Magic). */
  weaknessType?: EnergyType;
  /** A Special Condition or Poison for the Defending Pokémon (Magic Pollen). */
  condition?: 'asleep' | 'confused' | 'paralyzed' | 'poisoned';
  /** Vermilion City Gym: whether to flip for a Pokémon with Lt. Surge in its name (heads 10 more, tails 10 to itself). */
  vermilionFlip?: boolean;
  /** Charity: the most damage to do to the Defending Pokémon; -1 = no less than usual. */
  damageCap?: number;
  /** A number the attack asks for (Helping Hand: damage counters to remove; Group Attack: Koga's Zubat to bench). */
  amount?: number;
  /** A card in the opponent's discard pile (Pranks). */
  oppDiscardUid?: string;
}

/** A question an attack asks before it's used. `prompt` is shown to the player. */
export type ChoiceSpec = { prompt: string } & (
  | { kind: 'ownEnergy'; count: number; options: CardInstance[] }
  | { kind: 'opponentBench'; options: number[] }
  | { kind: 'defenderEnergy'; options: CardInstance[] }
  | { kind: 'defenderAttack'; options: number[] }
  /** An attack to copy: the Defending Pokémon's, or (`of`) that of another of the opponent's Pokémon. */
  | { kind: 'copyAttack'; options: number[]; of?: Target }
  /** Which of the opponent's Pokémon to copy an attack of (Super Metronome). */
  | { kind: 'copySource'; options: Target[] }
  /** Whether to use a Pokémon Power that makes the attack stronger (Final Blow, Hydroelectric Power): yes first. */
  | { kind: 'boost'; options: boolean[] }
  | { kind: 'type'; options: EnergyType[] }
  /** `optional`: the player may also not choose ("you may switch"), answered with -1, which is then among the options. */
  | { kind: 'ownBench'; options: number[]; optional?: boolean }
  /** Any number (0 to all, or to `max`) of the attacker's energy, as part of the attack (Wildfire). */
  | { kind: 'ownEnergyUpTo'; options: CardInstance[]; max?: number }
  /** Any number of the Energy cards attached to any of the attacking player's Pokémon (Rushing Flames). */
  | { kind: 'ownEnergyAny'; options: CardInstance[] }
  | { kind: 'ownDiscard'; min: number; max: number; options: CardInstance[] }
  /** `count` of them, or all if there are fewer. */
  | { kind: 'opponentBenchMany'; count: number; options: number[] }
  | { kind: 'deck'; options: ('own' | 'opponent')[] }
  /** Any of the opponent's Pokémon in play, clicked on the board. */
  | { kind: 'opponentPokemon'; options: Target[] }
  | { kind: 'opponentPokemonTo'; options: Target[] }
  /** Any of the attacking player's Pokémon in play, clicked on the board. */
  | { kind: 'ownPokemon'; options: Target[] }
  /** Another of the attacking player's Pokémon in play, to move something to (Energy Patch), clicked on the board. */
  | { kind: 'ownPokemonTo'; options: Target[] }
  | { kind: 'side'; options: ('own' | 'opponent')[] }
  /** One of the Energy cards attached to the chosen opponent's Pokémon. */
  | { kind: 'pokemonEnergy'; options: CardInstance[] }
  | { kind: 'weaknessType'; options: EnergyType[] }
  | { kind: 'condition'; options: NonNullable<AttackChoices['condition']>[] }
  | { kind: 'vermilion'; options: boolean[] }
  /** The most damage to do, -1 first (no limit). */
  | { kind: 'charity'; options: number[] }
  /** One card from either player's discard pile (Invigorate), answered in `discardUids`. */
  | { kind: 'eitherDiscard'; options: CardInstance[] }
  | { kind: 'oppDiscard'; options: CardInstance[] }
  /** A number, or with `labels` one of the labelled options (Genetic Memory: which attack), answered with its number. */
  | { kind: 'amount'; options: number[]; labels?: string[] }
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
  /** The Stadium card in play (Vermilion City Gym, Narrow Gym). Missing = none. */
  stadium?: CardInstance | null;
  /** Recall was played this turn: the attacks of the cards it evolved from can be used too. */
  recall?: boolean;
  /** The opponent's discard pile (Pranks, Invigorate). Missing = not needed. */
  opponentDiscard?: CardInstance[];
  /** Every Pokémon Power is off (Goop Gas Attack, Sputter: `powersOffUntil` on either player). */
  powersOff?: boolean;
  /** Allergic Pollen: the attack can't do anything with cards in discard piles (its questions about them aren't asked). */
  discardsLocked?: boolean;
}

/** An attack the Pokémon can use, and the card it's printed on (its effect's card id). */
export interface UsableAttack {
  attack: Attack;
  source: string;
  /** Recall: the lower-stage card's name, for attacks that aren't the Pokémon's own. */
  from?: string;
}

/**
 * The attacks the Pokémon can use, in attack-index order: its own (a Transformed Ditto's are the copy's), then with
 * Recall (or Prehistoric Memory) those of each card it evolved from, Basic first, then Psylink's, then with Mimic the
 * Defending Pokémon's (`defender`), then with Psymimic every attack of the opponent's Pokémon in play (`defender` and
 * `oppBench`), then a Technical Machine's attached to it.
 */
export function usableAttacks(
  attacker: InPlayPokemon,
  cards: CardLibrary,
  {
    recall = false,
    bench = [],
    defender = null,
    oppBench = [],
  }: { recall?: boolean; bench?: readonly (InPlayPokemon | null)[]; defender?: InPlayPokemon | null; oppBench?: readonly (InPlayPokemon | null)[] } = {},
): UsableAttack[] {
  // Shapeshift: the attached Evolution card's attacks, with that card's effects.
  const source = shapeshiftCard(attacker)?.defId ?? effectId(attacker);
  const own = def(cards, attacker).attacks.map((attack) => ({ attack, source }));
  const lower =
    recall && !attacker.transformed
      ? attacker.evolvedFrom.flatMap((c) => {
          const d = lookupCard(cards, c.defId);
          return d.kind === 'pokemon' ? d.attacks.map((attack) => ({ attack, source: d.id, from: d.name })) : [];
        })
      : [];
  // Psylink: a copy of every attack of the player's other Psychic Pokémon in play (all on the Bench), while it works.
  const psylink = powerEffect(effectId(attacker))?.psylink && !attacker.condition && attacker.powerOffUntil === undefined;
  const linked = psylink
    ? bench.flatMap((p) => {
        if (!p || def(cards, p).type !== 'psychic') return [];
        const d = def(cards, p);
        return d.attacks.map((attack) => ({ attack, source: shapeshiftCard(p)?.defId ?? effectId(p), from: d.name }));
      })
    : [];
  // Mimic: every attack of the Defending Pokémon, with its cost and effects, while the power works (as Psylink's).
  const mimic = defender && !defender.faceDown && powerEffect(effectId(attacker))?.mimic && !attacker.condition && attacker.powerOffUntil === undefined;
  const copied = mimic ? def(cards, defender).attacks.map((attack) => ({ attack, source: shapeshiftCard(defender)?.defId ?? effectId(defender), from: def(cards, defender).name })) : [];
  // Psymimic: every attack of the opponent's Pokémon in play, while it works (it stops with any Special Condition).
  const psymimic = powerEffect(effectId(attacker))?.psymimic && !attacker.condition && !attacker.poison && !attacker.burned && attacker.powerOffUntil === undefined;
  const mimicked = psymimic
    ? [defender, ...oppBench].flatMap((p) => {
        if (!p || p.faceDown) return [];
        const d = def(cards, p);
        return d.attacks.map((attack) => ({ attack, source: shapeshiftCard(p)?.defId ?? effectId(p), from: d.name }));
      })
    : [];
  // A Technical Machine attached to it: its attack.
  const machines = (attacker.attached ?? []).flatMap((a) => {
    const attack = trainerEffect(a.card.defId)?.technicalMachine;
    return attack ? [{ attack, source: a.card.defId, from: lookupCard(cards, a.card.defId).name }] : [];
  });
  return [...own, ...lower, ...linked, ...copied, ...mimicked, ...machines];
}

const attackAt = (s: AttackSituation, attackIndex: number) => usableAttacks(s.attacker, s.cards, { recall: s.recall, bench: s.ownBench, defender: s.defender, oppBench: s.opponentBench })[attackIndex];

/** Whether `me`'s Active Pokémon can use the attacks of the cards it evolved from now: Recall this turn, or Prehistoric Memory. */
export const recallsAttacks = (state: Pick<GameState, 'players' | 'playerOrder' | 'cards' | 'turn'>, me: PlayerState) =>
  me.recallTurn === state.turn || prehistoricMemory(state.playerOrder.map((id) => state.players[id]!), state.cards);

/** The Pokémon at `target` of the side whose active and bench are given. */
export const pokemonOn = (active: InPlayPokemon | null, bench: (InPlayPokemon | null)[], target: Target) => (target === 'active' ? active : bench[target]) ?? null;

/** Targets of the Pokémon in play on one side, Active first. */
export const targetsIn = (active: InPlayPokemon | null, bench: (InPlayPokemon | null)[]): Target[] => [
  ...(active ? (['active'] as Target[]) : []),
  ...bench.flatMap((p, i) => (p ? [i] : [])),
];

/** Card-specific attack behaviour. Attacks without one just deal their base damage. */
export interface AttackEffect {
  /** Printed text, where TCGdex's text differs from the card. */
  text?: string;
  /** Printed damage (e.g. "10"), where TCGdex leaves it out or has it wrong. */
  damage?: string;
  /** Printed Energy cost, where TCGdex has it wrong (Dark Magneton). */
  cost?: EnergyType[];
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
  /** The opponent flips (Knock Down, Bench Manipulation): true = heads. Logged as theirs. */
  oppFlip: () => boolean;
  /**
   * Damages the Defending Pokémon (weakness and resistance unless turned off; `resistance: false` keeps Weakness, as
   * Hook Shot does). `swift`: nothing on the Defending Pokémon changes the damage (Swift). Returns the damage done.
   */
  hit: (amount: number, opts?: { weakness?: boolean; resistance?: boolean; swift?: boolean }) => number;
  /** Damages the attacker (no weakness or resistance). */
  selfDamage: (amount: number) => void;
  /** Damages every benched Pokémon of `player` (no weakness or resistance). */
  benchDamage: (player: PlayerState, amount: number) => void;
  /** Damages one benched Pokémon of `player` (no weakness or resistance, unless `weakness` is set). */
  damageBenched: (player: PlayerState, slot: number, amount: number, opts?: { weakness?: boolean }) => void;
  /** Whether the attack can do anything to this Pokémon of `player` (logs why not): Neutral Shield, bench protection, Transparency. */
  canAffect: (player: PlayerState, pokemon: InPlayPokemon) => boolean;
  /** Runs `fn` once the attack's effect is done (Bolt shuffles Entei away only then). */
  after: (fn: () => void) => void;
  /** Gives the Defending Pokémon a Special Condition or Poison, unless its effects are prevented. */
  inflict: (affliction: Affliction) => void;
  /** Removes damage from the attacker. */
  heal: (amount: number | 'all') => void;
  /** Sets an effect on the attacker for the opponent's next turn. */
  protect: (key: 'preventDamage' | 'preventAll' | 'harden' | 'destinyBond' | 'minimize' | 'lightScreen' | 'mirrorShell' | 'fireWall' | 'crosscounter' | 'counter' | 'secretePoison' | 'slime') => void;
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
  /** The attacker is now Asleep (Roll Over). */
  sleepSelf: () => void;
  /** Switches the attacker with the attacking player's benched Pokémon in `slot` (Teleport). */
  switchOwn: (slot: number) => void;
  /** Returns the Defending Pokémon and every card attached to it to the opponent's hand (Hurricane). */
  returnDefender: () => void;
  /** Asks the attacking player to finish a search (see PendingChoice); the turn ends after it. */
  pend: (choice: PendingChoiceInput) => void;
  /** Asks the opponent to choose once the attack is over (Whirlwind: which Pokémon comes in); the turn ends after it. */
  opponentChooses: (choice: PendingChoiceInput) => void;
  /** Logs a line about the attacking player, or about `player`. */
  log: (text: string, player?: PlayerId) => void;
}

const def = inPlayDef;

/** How many of the named special Energy card are attached to the Pokémon (Darkness Energy, Metal Energy). */
const energyCount = (cards: CardLibrary, p: InPlayPokemon, name: string) => p.energy.filter((e) => !e.provides && !e.windless && lookupCard(cards, e.defId).name === name).length;

/** Expedition's Metal Energy: a non-Metal Pokémon's attack damage is reduced after Weakness and Resistance (Neo Genesis's: before). */
const METAL_AFTER_WEAKNESS = new Set(['ecard1-159']);

/** Metal Energy cards on the attacker that reduce its damage: Neo Genesis's (before Weakness and Resistance) or Expedition's (`after`). */
const metalOn = (cards: CardLibrary, p: InPlayPokemon, after: boolean) =>
  p.energy.filter((e) => !e.provides && !e.windless && lookupCard(cards, e.defId).name === 'Metal Energy' && METAL_AFTER_WEAKNESS.has(e.defId) === after).length;

/** Sprout Tower is the Stadium in play. */
const sproutTower = (state: Pick<GameState, 'stadium' | 'cards'>) => !!state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Sprout Tower';

/** How many of the named Trainer card are attached to the Pokémon (PlusPower, Defender). */
const attachedCount = (cards: CardLibrary, p: InPlayPokemon, name: string) => (p.attached ?? []).filter((a) => lookupCard(cards, a.card.defId).name === name).length;

/** How much less attack damage `player`'s Pokémon of `type` take from battle rules (a run's items). */
const ruleGuard = (state: GameState, player: PlayerId, type: EnergyType) =>
  (state.rules ?? []).reduce((n, r) => (r.kind === 'damageGuard' && r.player === player && (!r.type || r.type === type) ? n + r.amount : n), 0);

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
  const usable = attackAt(s, attackIndex);
  if (!usable) return 'Invalid attack';
  const attack = usable.attack;
  const condition = s.attacker.condition;
  if (condition === 'asleep' || condition === 'paralyzed') return `${attackerDef.name} is ${conditionLabel(condition)} and can't attack`;
  if (s.attacker.effects?.amnesia?.attack === attack.name && active(s.attacker.effects.amnesia.until, s.turn)) {
    return `${attackerDef.name} can't use ${attack.name} this turn`;
  }
  if (active(s.attacker.effects?.noAttack, s.turn)) return `${attackerDef.name} can't attack this turn`;
  if (s.attacker.effects?.frozen) return `${attackerDef.name} can't attack`;
  // Scare: a Baby Pokémon can't attack while the Defending Pokémon's Scare works.
  if (attackerDef.baby) {
    const sides = [{ active: s.attacker, bench: s.ownBench, ...(s.powersOff && { powersOffUntil: s.turn }) }, { active: s.defender, bench: s.opponentBench }];
    const scare = scaredBy(sides[0]!, sides, s.cards);
    if (scare) return `${scare}: ${attackerDef.name} can't attack`;
  }
  if (s.attacker.effects?.usedOnce?.includes(attack.name)) return `${attackerDef.name} can't use ${attack.name} again while it stays in play`;
  const blockedTarget = s.attacker.effects?.cantAttack;
  if (blockedTarget && blockedTarget.target === baseUid(s.defender) && active(blockedTarget.until, s.turn)) {
    return `${attackerDef.name} can't attack ${def(s.cards, s.defender).name} this turn`;
  }
  if (!canPayCost(s.attacker, attack, s.cards)) return 'Not enough energy';
  const effect = attackEffect(usable.source, attack.name);
  const discard = effect?.discard;
  if (discard && discard.count !== 'all' && discardOptions(s, discard.type).length < discard.count) {
    return `${attack.name} needs ${discard.count} ${discard.type ? `${typeName(discard.type)} ` : ''}Energy to discard`;
  }
  return effect?.blocked?.(s) ?? null;
}

/** Energy that can be discarded for the attack. A Transformed Ditto's Energy counts as any type. */
export const discardOptions = (s: AttackSituation, type?: EnergyType) =>
  s.attacker.energy.filter((e) => !type || s.attacker.transformed || counts(energyProvided(e, s.cards).type, type));

export const typeName = (t: EnergyType) => t[0]!.toUpperCase() + t.slice(1);

/** All questions the attack asks, given the answers so far. */
function choiceSpecs(s: AttackSituation, attackIndex: number, c: AttackChoices): ChoiceSpec[] {
  const { attack, source } = attackAt(s, attackIndex)!;
  const effect = attackEffect(source, attack.name);
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
  // Allergic Pollen: no cards can be taken from discard piles, so those questions go.
  if (effect?.choices) specs.push(...effect.choices(s, c).filter((spec) => !s.discardsLocked || !['ownDiscard', 'eitherDiscard', 'oppDiscard'].includes(spec.kind)));
  // Vermilion City Gym: a Pokémon with Lt. Surge in its name may flip (the CPU always does).
  if (s.stadium && lookupCard(s.cards, s.stadium.defId).name === 'Vermilion City Gym' && def(s.cards, s.attacker).name.includes('Lt. Surge')) {
    specs.push({ kind: 'vermilion', options: [true, false], prompt: 'Vermilion City Gym: flip a coin? Heads: 10 more damage; tails: 10 damage to your Pokémon' });
  }
  // Charity: the attack may do less damage to the Defending Pokémon. Any limit at or above its HP left is no limit.
  if (attachedCount(s.cards, s.attacker, 'Charity')) {
    const left = Math.max(0, def(s.cards, s.defender).hp - s.defender.damage);
    specs.push({ kind: 'charity', options: [-1, ...Array.from({ length: left / 10 }, (_, i) => i * 10)], prompt: 'Charity: the most damage to do to the Defending Pokémon' });
  }
  return specs;
}

const FIELD = {
  ownEnergy: 'energyUids',
  opponentBench: 'benchSlot',
  defenderEnergy: 'defenderEnergyUid',
  defenderAttack: 'attackIndex',
  copyAttack: 'copyIndex',
  copySource: 'copyFrom',
  boost: 'boost',
  type: 'type',
  ownBench: 'ownBenchSlot',
  ownEnergyUpTo: 'energyUids',
  ownEnergyAny: 'energyUids',
  ownDiscard: 'discardUids',
  opponentBenchMany: 'benchSlots',
  deck: 'deck',
  opponentPokemon: 'oppTarget',
  opponentPokemonTo: 'oppTo',
  ownPokemon: 'ownTarget',
  ownPokemonTo: 'ownTo',
  side: 'side',
  pokemonEnergy: 'oppEnergyUid',
  weaknessType: 'weaknessType',
  condition: 'condition',
  vermilion: 'vermilionFlip',
  charity: 'damageCap',
  eitherDiscard: 'discardUids',
  oppDiscard: 'oppDiscardUid',
  amount: 'amount',
} as const satisfies Record<ChoiceSpec['kind'], keyof AttackChoices>;

/** The answer when there's nothing to decide (one option, or identical cards); undefined if the player must choose. */
function autoAnswer(spec: ChoiceSpec): AttackChoices[keyof AttackChoices] | undefined {
  switch (spec.kind) {
    case 'ownEnergy': {
      const same = new Set(spec.options.map((e) => e.defId)).size <= 1;
      return spec.options.length <= spec.count || same ? spec.options.slice(0, spec.count).map((e) => e.uid) : undefined;
    }
    case 'defenderEnergy':
    case 'pokemonEnergy':
      return new Set(spec.options.map((e) => e.defId)).size === 1 ? spec.options[0]!.uid : undefined;
    case 'type':
    case 'weaknessType':
    case 'deck':
    case 'side':
    case 'condition':
    case 'vermilion':
      return undefined;
    case 'charity':
      return spec.options.length === 1 ? -1 : undefined;
    case 'eitherDiscard':
      return spec.options.length === 1 ? [spec.options[0]!.uid] : undefined;
    case 'oppDiscard':
      return spec.options.length === 1 ? spec.options[0]!.uid : undefined;
    case 'amount':
      return spec.options.length === 1 ? spec.options[0] : undefined;
    case 'ownEnergyUpTo':
    case 'ownEnergyAny':
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
    case 'pokemonEnergy':
    case 'oppDiscard':
      return spec.options.some((e) => e.uid === value);
    case 'eitherDiscard':
      return pickedIds(value, spec.options.map((c) => c.uid), 1, 1);
    case 'ownEnergyUpTo':
    case 'ownEnergyAny':
      return pickedIds(value, spec.options.map((e) => e.uid), 0, (spec.kind === 'ownEnergyUpTo' && spec.max) || spec.options.length);
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
export function applyWeaknessResistance(
  amount: number,
  attackerType: EnergyType,
  defender: PokemonCardDef,
  effects?: PokemonEffects,
  { resistance: withResistance = true, weakness: withWeakness = true, resistanceLess = 0 }: { resistance?: boolean; weakness?: boolean; resistanceLess?: number } = {},
): number {
  if (amount <= 0) return 0;
  const weakness = defender.weakness && { ...defender.weakness, type: effects?.weakness ?? defender.weakness.type };
  const resistance = effects?.resistance ? { type: effects.resistance, amount: defender.resistance?.amount ?? 30 } : defender.resistance;
  let damage = amount;
  // Cinnabar City Gym: no Weakness for a Water Pokémon's attack on Blaine's Pokémon.
  if (withWeakness && weakness?.type === attackerType) damage *= weakness.multiplier;
  // Hook Shot and Pewter City Gym: no Resistance. Resistance Gym: 20 less of it.
  if (withResistance && resistance?.type === attackerType) damage -= Math.max(0, resistance.amount - resistanceLess);
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
export function performAttack(
  state: GameState,
  me: PlayerState,
  opp: PlayerState,
  attackIndex: number,
  given: AttackChoices,
  { flee }: { flee?: number } = {},
): string | null {
  const attacker = me.active!;
  const defender = opp.active!;
  const attackerDef = def(state.cards, attacker);
  const situation = attackSituation(state, me, opp);
  const checked = checkAttack(situation, attackIndex, given);
  if ('error' in checked) return checked.error;
  const choices = checked.choices;
  const { attack, source: attackSource } = attackAt(situation, attackIndex)!;

  addLog(state, `${attackerDef.name} used ${attack.name}.`, me.id);
  // Lt. Surge's Secret Plan: a face-down Defending Pokémon is turned over; if it's discarded, there's nothing to attack.
  if (!revealFaceDown(state, opp.id, defender)) return null;
  // Rebellion (it works even while Confused): 2 tails and the attack does nothing; Misty's Gyarados is shuffled into the deck.
  if (powerEffect(effectId(attacker))?.rebellion && powerActive(attacker, state.cards, [me, opp])) {
    const tails = [flipCoin(state, 'Rebellion', me.id), flipCoin(state, 'Rebellion', me.id)].every((h) => !h);
    if (tails) {
      const cards = [...attacker.evolvedFrom, attacker.card, ...attacker.energy.map(({ provides: _, ...c }) => c), ...(attacker.attached ?? []).map((a) => a.card)];
      [me.deck, state.rngState] = shuffle([...me.deck, ...cards], state.rngState);
      me.active = null;
      addLog(state, `Rebellion: ${attack.name} did nothing, and ${attackerDef.name} was shuffled into the deck.`, me.id);
      return null;
    }
  }
  // Baby Pokémon rule: attacking an Active Baby takes heads, flipped before anything else; tails ends the turn.
  if (def(state.cards, defender).baby && !flipCoin(state, 'Baby Pokémon rule', me.id)) {
    addLog(state, `${attack.name} did nothing: ${def(state.cards, defender).name} is a Baby Pokémon.`, me.id);
    return null;
  }
  // 1999 rules: a Confused Pokémon flips to attack; on tails it does 20 damage to itself instead.
  if (attacker.condition === 'confused' && !flipCoin(state, `${attackerDef.name} is Confused`, me.id)) {
    // Frenzy: 30 more, even to itself.
    const frenzy = powerEffect(effectId(attacker))?.frenzy && powerActive(attacker, state.cards, [me, opp]) ? 30 : 0;
    const damage = afterDefender(state.cards, attacker, 20 + frenzy);
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
  // Ink Spurt lasts until the Pokémon evolves or is benched.
  if (attacker.effects?.inkSpurt && !flipCoin(state, 'Ink Spurt', me.id)) {
    addLog(state, `${attack.name} did nothing.`, me.id);
    return null;
  }

  // Vermilion City Gym: heads, 10 more damage to the Defending Pokémon; tails, 10 to the attacker as well.
  const vermilion = choices.vermilionFlip ? flipCoin(state, 'Vermilion City Gym', me.id) : undefined;

  const effect = attackEffect(attackSource, attack.name);
  if (effect?.discard) {
    const uids = new Set(effect.discard.count === 'all' ? attacker.energy.map((e) => e.uid) : choices.energyUids);
    me.discard.push(...attacker.energy.filter((e) => uids.has(e.uid)));
    attacker.energy = attacker.energy.filter((e) => !uids.has(e.uid));
    addLog(state, `${attackerDef.name} discarded ${uids.size} Energy.`, me.id);
  }

  const later: (() => void)[] = [];
  const ctx = createContext(state, me, opp, choices, later, `${attackerDef.name}'s ${attack.name}`, { vermilion, flee });
  ctx.useAttack(attack, attackSource);
  if (vermilion === false && me.active === attacker) ctx.selfDamage(10);
  for (const fn of later) fn();
  ctx.finish();
  // Earthdrill needs to know Lie Low was used the turn before.
  if (me.active === attacker) (attacker.effects ??= {}).lastAttack = { name: attack.name, turn: state.turn };
  return null;
}

/** What the attacking player's attack can see now. */
export const attackSituation = (state: GameState, me: PlayerState, opp: PlayerState): AttackSituation => ({
  attacker: me.active!,
  defender: opp.active!,
  opponentBench: opp.bench,
  ownBench: me.bench,
  ownDiscard: me.discard,
  cards: state.cards,
  turn: state.turn,
  stadium: state.stadium?.card ?? null,
  recall: recallsAttacks(state, me),
  opponentDiscard: opp.discard,
  powersOff: me.powersOffUntil !== undefined || opp.powersOffUntil !== undefined,
  discardsLocked: discardsLocked([me, opp], state.cards),
});

/** Whether the attack can be used with these answers: the complete choices, or why not. */
export function checkAttack(s: AttackSituation, attackIndex: number, given: AttackChoices): { choices: AttackChoices } | { error: string } {
  const error = attackError(s, attackIndex);
  if (error) return { error };
  const resolved = resolveChoices(s, attackIndex, given);
  return 'error' in resolved ? { error: resolved.error } : resolved;
}

/**
 * Damage the current player's attack does to a benched Pokémon its opponent chose after the attack (Cat
 * Punch), as part of that attack: Defender, Kabuto Armor, Transparency and bench protection apply.
 */
export function damageChosenBenched(state: GameState, slot: number, amount: number) {
  const me = state.players[state.currentPlayer]!;
  const opp = state.players[state.playerOrder.find((id) => id !== me.id)!]!;
  if (!me.active) return;
  const later: (() => void)[] = [];
  createContext(state, me, opp, {}, later, `${pokemonName(state, me.active)}'s attack`).damageBenched(opp, slot, amount);
  for (const fn of later) fn();
}

/**
 * Whether attacks can't affect `owner`'s Benched Pokémon this turn: Protective Flame from their last
 * turn, or a working Aurora Veil on their Active Pokémon.
 */
export function benchShielded(owner: PlayerState, cards: CardLibrary, sides: PlayerState[], turn: number): string | null {
  if ((owner.benchProtectedUntil ?? 0) >= turn) return 'Protective Flame';
  const active = owner.active;
  return active && powerEffect(effectId(active))?.auroraVeil && powerActive(active, cards, sides) ? 'Aurora Veil' : null;
}

/**
 * `source` names the attack on its coin flips ("Pikachu's Thundershock"). `vermilion`: Vermilion City Gym's flip (heads
 * true). `flee`: the bench slot the Defending Pokémon's Flee switches it with, if the attack damages it.
 */
function createContext(
  state: GameState,
  me: PlayerState,
  opp: PlayerState,
  choices: AttackChoices,
  later: (() => void)[],
  source: string,
  { vermilion, flee }: { vermilion?: boolean; flee?: number } = {},
): AttackContext & { finish: () => void } {
  const turn = state.turn;
  const attacker = me.active!;
  const attackerDef = def(state.cards, attacker);
  const log = (text: string, player = me.id) => addLog(state, text, player);
  const sides = [me, opp];
  /** The power of a Pokémon reacting to the attack, while it works (not Asleep etc., no Toxic Gas). */
  const passive = (p: InPlayPokemon) => (powerActive(p, state.cards, sides) ? powerEffect(effectId(p)) : undefined);
  /** Frenzy: the attacker does 30 more damage while it's Confused (before Weakness and Resistance), to itself too. */
  const frenzy = () => (attacker.condition === 'confused' && passive(attacker)?.frenzy ? 30 : 0);
  /** Neutral Shield: attacks by Evolved Pokémon don't affect it. */
  const neutral = (p: InPlayPokemon) => attacker.evolvedFrom.length > 0 && !!passive(p)?.neutralShield;
  /**
   * Whether the attack can't affect this Pokémon of `owner`, without flipping for Transparency: Barrier
   * or Agility, Neutral Shield, or (benched) Protective Flame or Aurora Veil.
   */
  /** Flee: the Defending Pokémon that took damage and switches out once the attack is over; nothing else the attack does affects it. */
  let fled: InPlayPokemon | null = null;
  /** [Quicken]: attacks do nothing to `owner`'s Pokémon with Unown in their names this turn. */
  const quickened = (p: InPlayPokemon, owner: PlayerState) => active(owner.quickenUntil, turn) && def(state.cards, p).name.includes('Unown');
  const immune = (p: InPlayPokemon, owner: PlayerState) =>
    p === fled || active(p.effects?.preventAll, turn) || neutral(p) || quickened(p, owner) || (owner.active !== p && !!benchShielded(owner, state.cards, sides, turn));
  /** Vermilion City Gym's 10 more damage, done once. */
  let vermilionBonus = vermilion === true;
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
  const shielded = () =>
    active(opp.active?.effects?.preventAll, turn) || (!!opp.active && (opp.active === fled || neutral(opp.active) || quickened(opp.active, opp) || transparent(opp.active, opp)));
  /** Shielded, or Crystal Body or Light Wave: the attack does nothing to the Defending Pokémon but damage. Logs why. */
  const untouchable = () => {
    const crystal = !!opp.active && (!!passive(opp.active)?.crystalBody || active(opp.active.effects?.effectProof, turn));
    if (!shielded() && !crystal) return false;
    log(crystal && !shielded() ? `The attack's effects other than damage don't affect ${ctx.defenderDef.name}.` : `${ctx.defenderDef.name} is protected from the attack's effects.`, opp.id);
    return true;
  };
  /** Charity: how much more damage the attack may do to the Defending Pokémon. */
  let capLeft = choices.damageCap !== undefined && choices.damageCap >= 0 ? choices.damageCap : Infinity;
  /** Bench Guard: once the attack is over, the owner of a damaged benched Pokémon may move 10 of the damage to a benched Brock's Rhydon. */
  const benchGuard = (owner: PlayerState, p: InPlayPokemon) => {
    const target = owner.bench.indexOf(p);
    const guard = owner.bench.findIndex((q) => q && q !== p && passive(q)?.benchGuard);
    if (target >= 0 && guard >= 0) (state.queuedChoices ??= []).push({ player: owner.id, source: 'Bench Guard', kind: 'benchGuard', target, guard });
  };
  /** Shell Armor: 10 less attack damage. Strange Barrier: an attack by a Basic Pokémon does 10 instead of 20 or more. */
  const barriers = (p: InPlayPokemon, damage: number, owner: PlayerState) => {
    if (damage > 0 && passive(p)?.shellArmor) {
      damage = Math.max(0, damage - 10);
      log(`Shell Armor reduced the damage to ${pokemonName(state, p)} by 10.`, owner.id);
    }
    // Rock Body, Exoskeleton: a set amount less.
    const reduction = passive(p)?.damageReduction;
    if (damage > 0 && reduction) {
      damage = Math.max(0, damage - reduction);
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${reduction}.`, owner.id);
    }
    if (damage >= 20 && attackerDef.stage === 'basic' && passive(p)?.strangeBarrier) {
      damage = 10;
      log(`Strange Barrier reduced the damage to ${pokemonName(state, p)} to 10.`, owner.id);
    }
    // Hard Shell: 40 or less (any attack's, its own player's too) is 10.
    if (damage > 10 && damage <= 40 && passive(p)?.hardShell) {
      damage = 10;
      log(`Hard Shell reduced the damage to ${pokemonName(state, p)} to 10.`, owner.id);
    }
    // Relaxing Scent, from either Active Pokémon: half the damage to any Pokémon, rounded up to the nearest 10.
    if (damage > 0 && [me.active, opp.active].some((a) => a && passive(a)?.relaxingScent)) {
      damage = Math.ceil(damage / 20) * 10;
      log(`Relaxing Scent halved the damage to ${pokemonName(state, p)}.`, owner.id);
    }
    return damage;
  };
  /** Fortitude: an opponent's attack that would Knock it Out leaves it with 10 HP on heads (its owner flips). */
  const fortitude = (p: InPlayPokemon, owner: PlayerState, damage: number) => {
    const hp = def(state.cards, p).hp;
    // Focus Band: on heads, not Knocked Out by the opponent's attack; 10 HP left, and Focus Band is discarded.
    if (owner === opp && p.damage + damage >= hp && toolOf(state.cards, p)?.name === 'Focus Band' && flipCoin(state, 'Focus Band', owner.id)) {
      log(`Focus Band: ${pokemonName(state, p)} isn't Knocked Out; it has 10 HP left.`, owner.id);
      discardTool(state, owner, p);
      return Math.max(0, hp - 10 - p.damage);
    }
    // Endure: not Knocked Out by an attack this turn; 10 HP left instead.
    if (owner === opp && p.damage + damage >= hp && active(p.effects?.endure, turn)) {
      log(`Endure: ${pokemonName(state, p)} isn't Knocked Out; it has 10 HP left.`, owner.id);
      return Math.max(0, hp - 10 - p.damage);
    }
    // Armor Up: on heads (its owner flips), not Knocked Out by the attack; 10 HP left.
    if (owner === opp && p.damage + damage >= hp && active(p.effects?.armorUp, turn) && flipCoin(state, 'Armor Up', owner.id)) {
      log(`Armor Up: ${pokemonName(state, p)} isn't Knocked Out; it has 10 HP left.`, owner.id);
      return Math.max(0, hp - 10 - p.damage);
    }
    // Time Travel: heads, it isn't Knocked Out; it's shuffled into its owner's deck once the attack is over (resolveKnockouts).
    if (owner === opp && p.damage + damage >= hp && !p.timeTravel && passive(p)?.timeTravel) {
      if (flipCoin(state, 'Time Travel', owner.id)) {
        p.timeTravel = true;
        log(`Time Travel: ${pokemonName(state, p)} won't be Knocked Out; it goes back into the deck.`, owner.id);
      }
      return damage;
    }
    if (owner !== opp || p.damage + damage < hp || !passive(p)?.fortitude || !flipCoin(state, 'Fortitude', owner.id)) return damage;
    log(`Fortitude: ${pokemonName(state, p)} isn't Knocked Out; it has 10 HP left.`, owner.id);
    return Math.max(0, hp - 10 - p.damage);
  };
  /**
   * Whether a benched Pokémon of `owner` can take attack damage: a face-down card (Secret Plan) is turned over first (and may
   * be discarded), and Transparent Walls prevents the damage.
   */
  const benchCanTake = (owner: PlayerState, p: InPlayPokemon) => {
    if (!revealFaceDown(state, owner.id, p)) return false;
    // Ice Pillar: while the Light Dewgong that used it is the Active Pokémon.
    const pillar = owner.icePillar;
    if (pillar && active(pillar.until, turn) && owner.active?.card.uid === pillar.by) {
      log(`Ice Pillar prevented the damage to ${pokemonName(state, p)}.`, owner.id);
      return false;
    }
    if ((owner.benchDamageProtectedUntil ?? 0) < turn) return true;
    log(`Transparent Walls prevented the damage to ${pokemonName(state, p)}.`, owner.id);
    return false;
  };
  /**
   * EXP.ALL: `owner`'s Active Pokémon `knocked` is being Knocked Out by the attack; the owner moves a basic Energy card from
   * it (of the EXP.ALL Pokémon's type, if any is) to their other Pokémon with EXP.ALL attached, and EXP.ALL is discarded.
   */
  const expAll = (owner: PlayerState, knocked: InPlayPokemon) => {
    const holder = [...owner.bench].find((p) => p && toolOf(state.cards, p)?.name === 'EXP.ALL');
    const basic = knocked.energy.filter((e) => {
      const d = lookupCard(state.cards, e.defId);
      return !e.provides && d.kind === 'energy' && d.basic !== false;
    });
    if (!holder || !basic.length) return;
    const type = def(state.cards, holder).type;
    const energy = basic.find((e) => isEnergyCardOf(e, state.cards, type)) ?? basic[0]!;
    knocked.energy = knocked.energy.filter((e) => e !== energy);
    holder.energy.push(energy);
    discardTool(state, owner, holder);
    log(`EXP.ALL: moved ${lookupCard(state.cards, energy.defId).name} from ${pokemonName(state, knocked)} to ${pokemonName(state, holder)}.`, owner.id);
  };
  /** Charm: the attacker's damage is `amount` less this turn, before Weakness and Resistance. */
  const charmed = (amount: number) => {
    const charm = attacker.effects?.charm;
    return charm && active(charm.until, turn) && amount > 0 ? Math.max(0, amount - charm.amount) : amount;
  };
  /** Frog Song: the Poliwag, Poliwhirl, Poliwrath and Politoed in play, both players'. */
  const frogs = () => sides.flatMap((s) => [s.active, ...s.bench]).filter((p) => p && ['Poliwag', 'Poliwhirl', 'Poliwrath', 'Politoed'].includes(def(state.cards, p).name)).length;
  /**
   * Unown D, M and N: 30 less attack damage (after Weakness and Resistance) to `owner`'s Pokémon from an attacker of the
   * Unown's type, while that Unown works and is the only one of its name `owner` has in play.
   */
  const unownGuarded = (p: InPlayPokemon, damage: number, owner: PlayerState) => {
    if (damage <= 0) return damage;
    const ownInPlay = [owner.active, ...owner.bench].filter((q): q is InPlayPokemon => !!q);
    const guard = ownInPlay.find((q) => {
      const name = def(state.cards, q).name;
      return passive(q)?.unownGuard === attackerDef.type && ownInPlay.filter((r) => def(state.cards, r).name === name).length === 1;
    });
    if (!guard) return damage;
    log(`${def(state.cards, guard).power!.name}: the damage to ${pokemonName(state, p)} was reduced by 30.`, owner.id);
    return Math.max(0, damage - 30);
  };
  /** Damage to a benched Pokémon or the attacker itself: Defender, then Kabuto Armor. */
  const benchedDamage = (p: InPlayPokemon, amount: number, owner: PlayerState) => {
    amount = Math.max(0, charmed(amount) - metalLess - metalAfter);
    if (amount > 0 && sproutTower(state) && attackerDef.type === 'colorless') amount = Math.max(0, amount - 30);
    amount = Math.max(0, amount - 10 * energyCount(state.cards, p, 'Metal Energy'));
    const damage = unownGuarded(p, barriers(p, armor(p, afterDefender(state.cards, p, amount), owner), owner), owner);
    return damage >= 30 && passive(p)?.invisibleWall ? 0 : damage;
  };
  /** Shadow Images: one flip per attack, by the attacking player; tails, the attack does no damage to the Pokémon. */
  let shadowImages: boolean | undefined;
  /** Metal Energy on an attacker that isn't Metal: its attacks do 10 less for each, before Weakness and Resistance (Neo Genesis's). */
  const metalLess = attackerDef.type === 'metal' ? 0 : 10 * metalOn(state.cards, attacker, false);
  /** Expedition's Metal Energy on an attacker that isn't Metal: 10 less for each, after Weakness and Resistance. */
  const metalAfter = attackerDef.type === 'metal' ? 0 : 10 * metalOn(state.cards, attacker, true);
  /** Whether the attack can affect this Pokémon; logs why not. Transparency flips the first time it's asked. */
  const canAffect = (player: PlayerState, p: InPlayPokemon) => {
    if (!immune(p, player) && !transparent(p, player)) return true;
    log(`${pokemonName(state, p)} is protected from the attack.`, player.id);
    return false;
  };
  const record = (pokemon: InPlayPokemon) => {
    const effects = (pokemon.effects ??= {});
    if (effects.attackedOn?.turn !== turn) effects.attackedOn = { turn, damage: 0, afflictions: [] };
    return effects.attackedOn;
  };

  const ctx: AttackContext & { finish: () => void } = {
    state,
    me,
    opp,
    attacker,
    attackerDef,
    finish() {
      const benched = flee === undefined ? null : opp.bench[flee];
      if (!fled || opp.active !== fled || !benched) return;
      clearOnLeavingActive(fled);
      opp.bench[flee!] = fled;
      opp.active = benched;
      log(`${pokemonName(state, benched)} was switched in for ${pokemonName(state, fled)}.`, opp.id);
    },
    get defender() {
      return opp.active!;
    },
    get defenderDef() {
      return def(state.cards, opp.active!);
    },
    choices,
    turn,
    flip: () => flipCoin(state, source, me.id),
    oppFlip: () => flipCoin(state, source, opp.id),
    flips: (n) => Array.from({ length: n }, () => ctx.flip()).filter(Boolean).length,
    hit(amount, { weakness = true, resistance = true, swift = false } = {}) {
      const defender = opp.active!;
      const defenderDef = def(state.cards, defender);
      if (amount <= 0) return 0;
      // A run's battle rules (Fire Pokémon do double damage…) change the base damage, before everything else,
      // and then its items' bonuses (X Attack, Charcoal…) are added.
      for (const rule of state.rules ?? []) if (rule.kind === 'typeDamage' && rule.type === attackerDef.type) amount *= rule.multiplier;
      amount += frenzy();
      for (const rule of state.rules ?? []) if (rule.kind === 'damageBonus' && rule.player === me.id && (!rule.type || rule.type === attackerDef.type)) amount += rule.amount;
      // Swift: nothing on the Defending Pokémon (effects of attacks, Pokémon Powers, Defender) changes its damage.
      if (!swift && shielded()) {
        log(`${defenderDef.name} is protected from the attack.`, opp.id);
        return 0;
      }
      if (!swift && defender.effects?.shadowImages) {
        shadowImages ??= ctx.flip();
        if (!shadowImages) {
          log(`Shadow Images: the attack did no damage to ${defenderDef.name}.`, opp.id);
          return 0;
        }
      }
      // Pewter City Gym: no Resistance for attacks by Pokémon with Brock in their names.
      const stadium = state.stadium && lookupCard(state.cards, state.stadium.card.defId).name;
      if (stadium === 'Pewter City Gym' && attackerDef.name.includes('Brock')) resistance = false;
      // Magnifier: no Resistance for its Pokémon's attack.
      if (attachedCount(state.cards, attacker, 'Magnifier')) resistance = false;
      const weaknessOff = stadium === 'Cinnabar City Gym' && attackerDef.type === 'water' && defenderDef.name.includes('Blaine');
      // Charm: the attacker's damage is less, before Weakness and Resistance.
      const before = amount;
      amount = charmed(amount);
      if (amount < before) log(`Charm reduced ${attackerDef.name}'s damage by ${before - amount}.`);
      // Togepi's Snivel: less damage from the Pokémon it was used on, before weakness and resistance.
      const snivel = attacker.effects?.pounce;
      if (snivel?.beforeWeakness && snivel.target === baseUid(defender) && active(snivel.until, turn)) {
        amount = Math.max(0, amount - snivel.amount);
        log(`The damage to ${defenderDef.name} was reduced by ${snivel.amount}.`, opp.id);
      }
      if (metalLess) amount = Math.max(0, amount - metalLess);
      const rules = { resistance, weakness: !weaknessOff, resistanceLess: stadium === 'Resistance Gym' ? 20 : 0 };
      let damage = weakness && !swift ? applyWeaknessResistance(amount, attackerDef.type, defenderDef, defender.effects, rules) : amount;
      // Misty: 20 more each, for a Pokémon with Misty in its name, if the attack does damage after Weakness and Resistance.
      const misty = me.misty?.turn === turn && attackerDef.name.includes('Misty') ? me.misty.count : 0;
      if (damage > 0 && misty) {
        damage += 20 * misty;
        log(`Misty: ${20 * misty} more damage.`);
      }
      // Darkness Energy: 10 more for each on the attacker, if the attack damages the Defending Pokémon after Weakness and Resistance.
      const dark = energyCount(state.cards, attacker, 'Darkness Energy');
      if (damage > 0 && dark) {
        damage += 10 * dark;
        log(`Darkness Energy: ${10 * dark} more damage.`);
      }
      // Strength Charm: 10 more, if the attack damages it after Weakness and Resistance; it's discarded at the end of the turn.
      const charm = toolOf(state.cards, attacker);
      if (damage > 0 && charm?.name === 'Strength Charm') {
        damage += 10;
        charm.tool.until = turn;
        log('Strength Charm: 10 more damage.');
      }
      if (damage > 0 && metalAfter) {
        damage = Math.max(0, damage - metalAfter);
        log(`Metal Energy reduced ${attackerDef.name}'s damage by ${metalAfter}.`);
      }
      // Frog Song: 40 more, if the attack damages it after Weakness and Resistance, while more than 3 Poliwag line Pokémon are in play.
      if (damage > 0 && passive(attacker)?.frogSong && frogs() > 3) {
        damage += 40;
        log('Frog Song: 40 more damage.');
      }
      // Screech: 20 more to it, if the attack damages it after Weakness and Resistance.
      if (damage > 0 && !swift && active(defender.effects?.screech, turn)) {
        damage += 20;
        log(`Screech: 20 more damage to ${defenderDef.name}.`, opp.id);
      }
      if (damage > 0 && vermilionBonus) {
        damage += 10;
        vermilionBonus = false;
        log('Vermilion City Gym: 10 more damage.');
      }
      // PlusPower adds 10 each, then Defender takes off 20 each (both after weakness and resistance).
      if (damage > 0) damage = Math.max(0, damage + 10 * attachedCount(state.cards, attacker, 'PlusPower') - (swift ? 0 : 20 * attachedCount(state.cards, defender, 'Defender')));
      // A run's items (X Defend, Leaf Jacket…) take some off too.
      const guard = ruleGuard(state, opp.id, defenderDef.type);
      if (damage > 0 && guard > 0) {
        damage = Math.max(0, damage - guard);
        log(`The damage to ${defenderDef.name} was reduced by ${guard}.`, opp.id);
      }
      // Pounce and Snivel: less damage from the Pokémon they were used on (also after weakness and resistance).
      const pounce = attacker.effects?.pounce;
      if (damage > 0 && pounce && !pounce.beforeWeakness && pounce.target === baseUid(defender) && active(pounce.until, turn)) {
        damage = Math.max(0, damage - pounce.amount);
        log(`The damage to ${defenderDef.name} was reduced by ${pounce.amount}.`, opp.id);
      }
      const effects = defender.effects;
      if (!swift) {
        if (damage > 0 && active(effects?.minimize, turn)) {
          damage = Math.max(0, damage - 20);
          log(`Minimize reduced the damage to ${defenderDef.name} by 20.`, opp.id);
        }
        // Sprout Tower: Colorless Pokémon's attacks do 30 less, after Weakness and Resistance.
        if (damage > 0 && sproutTower(state) && attackerDef.type === 'colorless') {
          damage = Math.max(0, damage - 30);
          log(`Sprout Tower reduced the damage to ${defenderDef.name} by 30.`, opp.id);
        }
        // Metal Energy: 10 less for each on the Defending Pokémon, after Weakness and Resistance.
        const metal = energyCount(state.cards, defender, 'Metal Energy');
        if (damage > 0 && metal) {
          damage = Math.max(0, damage - 10 * metal);
          log(`Metal Energy reduced the damage to ${defenderDef.name} by ${10 * metal}.`, opp.id);
        }
        // Lie Low and Barrier Attack: a set amount less, after Weakness and Resistance.
        const reduced = effects?.reduceDamage;
        if (damage > 0 && reduced && active(reduced.until, turn)) {
          damage = Math.max(0, damage - reduced.amount);
          log(`The damage to ${defenderDef.name} was reduced by ${reduced.amount}.`, opp.id);
        }
        damage = unownGuarded(defender, damage, opp);
        damage = barriers(defender, armor(defender, damage, opp), opp);
        // Light Screen and Deflector: half the damage, rounded down to the nearest 10, after everything else (like Kabuto Armor).
        if (damage > 0 && active(effects?.lightScreen, turn)) {
          damage = Math.floor(damage / 20) * 10;
          log(`The damage to ${defenderDef.name} was halved.`, opp.id);
        }
        if (damage >= 30 && (passive(defender)?.invisibleWall || active(effects?.pulseGuard, turn))) {
          log(`${passive(defender)?.invisibleWall ? 'Invisible Wall' : 'Pulse Guard'} prevented the damage to ${defenderDef.name}.`, opp.id);
          damage = 0;
        }
        const upTo = effects?.preventUpTo && active(effects.preventUpTo.until, turn) ? effects.preventUpTo.amount : 0;
        if (active(effects?.preventDamage, turn) || (active(effects?.harden, turn) && damage <= 30) || (damage > 0 && damage <= upTo)) {
          log(`The damage to ${defenderDef.name} was prevented.`, opp.id);
          damage = 0;
        }
        // Slime: the attacking player flips; tails prevents the damage.
        if (damage > 0 && active(effects?.slime, turn) && !flipCoin(state, 'Slime', me.id)) {
          log(`Slime prevented the damage to ${defenderDef.name}.`, opp.id);
          damage = 0;
        }
        // Dodge: its owner flips; heads prevents the damage.
        if (damage > 0 && active(effects?.dodge, turn) && flipCoin(state, 'Dodge', opp.id)) {
          log(`Dodge prevented the damage to ${defenderDef.name}.`, opp.id);
          damage = 0;
        }
        // Reflect Shield: its owner flips; heads prevents the damage and does 20 to the attacker (with Weakness and Resistance, as Fire Wall).
        if (damage > 0 && active(effects?.reflectShield, turn) && flipCoin(state, 'Reflect Shield', opp.id)) {
          const back = applyWeaknessResistance(20, defenderDef.type, attackerDef, attacker.effects);
          attacker.damage += back;
          log(`Reflect Shield prevented the damage to ${defenderDef.name} and did ${back} damage to ${attackerDef.name}.`, opp.id);
          damage = 0;
        }
      }
      if (damage > capLeft) {
        damage = capLeft;
        log(`Charity: the damage to ${defenderDef.name} was reduced to ${damage}.`);
      }
      damage = fortitude(defender, opp, damage);
      if (damage === 0) return 0;
      capLeft -= damage;
      defender.damage += damage;
      record(defender).damage += damage;
      log(`${defenderDef.name} took ${damage} damage.`, opp.id);
      if (effects) delete effects.shadowImages;
      passive(defender)?.onAttackDamage?.(ctx, defender);
      // Flee (asked before the attack): it switches out once the attack is over, and nothing else the attack does affects it.
      if (flee !== undefined && !fled && opp.bench[flee] && passive(defender)?.flee && defender.damage < defenderDef.hp) {
        fled = defender;
        log(`Flee: ${defenderDef.name} switches out after the attack.`, opp.id);
      }
      // Koga: a Pokémon with Koga in its name poisons the Defending Pokémon it damages this turn.
      if (me.kogaTurn === turn && attackerDef.name.includes('Koga') && opp.active === defender) ctx.inflict('poisoned');
      // Crosscounter: on heads, double the damage back to the attacker, with Weakness and Resistance, even if this Knocks it Out.
      if (active(effects?.crosscounter, turn) && flipCoin(state, 'Crosscounter', opp.id)) {
        const back = applyWeaknessResistance(2 * damage, defenderDef.type, attackerDef, attacker.effects);
        attacker.damage += back;
        log(`Crosscounter: ${defenderDef.name} did ${back} damage to ${attackerDef.name}.`, opp.id);
      }
      // Fire Wall: 10 damage back to the attacker, with Weakness and Resistance, even if this Knocks it Out.
      if (active(effects?.fireWall, turn)) {
        const back = applyWeaknessResistance(10, defenderDef.type, attackerDef, attacker.effects);
        attacker.damage += back;
        log(`Fire Wall: ${defenderDef.name} did ${back} damage to ${attackerDef.name}.`, opp.id);
      }
      // Mirror Shell: the same damage back to the attacker, without Weakness or anything else, even if this Knocks it Out.
      if (active(effects?.mirrorShell, turn)) {
        attacker.damage += damage;
        log(`Mirror Shell: ${defenderDef.name} did ${damage} damage back to ${attackerDef.name}.`, opp.id);
      }
      // Counter: on heads (its owner flips), the same damage back to the attacker, without Weakness or Resistance (agreed), even if this Knocks it Out.
      if (active(effects?.counter, turn) && flipCoin(state, 'Counter', opp.id)) {
        attacker.damage += damage;
        log(`Counter: ${defenderDef.name} did ${damage} damage to ${attackerDef.name}.`, opp.id);
      }
      // Counterattack Claws, on the Active Pokémon: heads puts 2 damage counters on the attacker, even if this Knocks it Out; then it's discarded.
      if (opp.active === defender && toolOf(state.cards, defender)?.name === 'Counterattack Claws') {
        if (flipCoin(state, 'Counterattack Claws', opp.id)) {
          attacker.damage += 20;
          log(`Counterattack Claws put 2 damage counters on ${attackerDef.name}.`, opp.id);
        }
        discardTool(state, opp, defender);
      }
      // EXP.ALL: when the Active Pokémon is Knocked Out, a basic Energy card goes from it to the Pokémon with EXP.ALL, which is discarded.
      if (opp.active === defender && defender.damage >= defenderDef.hp) expAll(opp, defender);
      // Secrete Poison: the attacker is Poisoned and 10 damage to each of the attacking player's benched Pokémon, even if this Knocks it Out.
      if (active(effects?.secretePoison, turn)) {
        log(`Secrete Poison: ${attackerDef.name} is now Poisoned, and 10 damage to each benched Pokémon.`);
        if (!passive(attacker)?.noConditions) attacker.poison = Math.max(attacker.poison ?? 0, 10);
        for (const p of me.bench) if (p) p.damage += 10;
      }
      if (defender.damage >= defenderDef.hp && active(effects?.destinyBond, turn)) {
        attacker.damage = Math.max(attacker.damage, attackerDef.hp);
        log(`Destiny Bond: ${attackerDef.name} is Knocked Out too.`, opp.id);
      }
      return damage;
    },
    selfDamage(amount) {
      if (transparent(attacker, me)) return log(`${attackerDef.name} is protected from the attack.`);
      const damage = benchedDamage(attacker, amount > 0 ? amount + frenzy() : amount, me);
      if (damage === 0) return log(`The damage ${attackerDef.name} did to itself was prevented.`);
      attacker.damage += damage;
      log(`${attackerDef.name} did ${damage} damage to itself.`);
    },
    benchDamage(player, amount) {
      if (!player.bench.some(Boolean)) return;
      log(`${amount} damage to each benched Pokémon.`, player.id);
      for (const p of player.bench) {
        if (!p || !benchCanTake(player, p) || !canAffect(player, p)) continue;
        const damage = fortitude(p, player, benchedDamage(p, amount, player));
        if (damage < amount) log(`${pokemonName(state, p)} took ${damage} damage.`, player.id);
        if (damage === 0) continue;
        p.damage += damage;
        if (player === opp) passive(p)?.onAttackDamage?.(ctx, p);
        benchGuard(player, p);
      }
    },
    inflict(affliction) {
      const defender = opp.active!;
      const name = pokemonName(state, defender);
      if (untouchable()) return;
      if (def(state.cards, defender).trainerText || passive(defender)?.noConditions || (defender.effects?.flashTouch && affliction !== 'burned')) return log(`${name} can't be affected by Special Conditions.`, opp.id);
      if (affliction !== 'burned' && active(defender.effects?.pollenShield, turn)) return log(`Pollen Shield: ${name} can't be ${affliction === 'toxic' || affliction === 'poisoned' ? 'Poisoned' : conditionLabel(affliction)}.`, opp.id);
      const guard = state.rules?.find((r) => r.kind === 'conditionGuard' && r.player === opp.id && r.conditions.includes(affliction === 'toxic' ? 'poisoned' : affliction));
      if (guard) return log(`${guard.label ?? 'A battle rule'} protected ${name} from that.`, opp.id);
      if (affliction === 'burned') {
        defender.burned = true;
        log(`${name} is now Burned.`, opp.id);
      } else if (affliction === 'poisoned' || affliction === 'toxic') {
        defender.poison = Math.max(defender.poison ?? 0, affliction === 'toxic' ? 20 : 10);
        log(`${name} is now Poisoned${affliction === 'toxic' ? ' (20 damage)' : ''}.`, opp.id);
      } else {
        defender.condition = affliction;
        if (affliction === 'paralyzed') defender.paralyzedTurn = turn;
        log(`${name} is now ${conditionLabel(affliction)}.`, opp.id);
      }
      record(defender).afflictions.push(affliction);
    },
    damageBenched(player, slot, amount, { weakness = false } = {}) {
      const benched = player.bench[slot];
      if (!benched || amount <= 0 || !benchCanTake(player, benched) || !canAffect(player, benched)) return;
      const weakened = weakness ? applyWeaknessResistance(amount, attackerDef.type, def(state.cards, benched), benched.effects) : amount;
      const damage = fortitude(benched, player, benchedDamage(benched, weakened, player));
      if (damage === 0) return log(`The damage to ${pokemonName(state, benched)} was prevented.`, player.id);
      benched.damage += damage;
      log(`${pokemonName(state, benched)} took ${damage} damage.`, player.id);
      if (player === opp) passive(benched)?.onAttackDamage?.(ctx, benched);
      benchGuard(player, benched);
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
      if (untouchable()) return;
      fn((opp.active!.effects ??= {}));
    },
    discardDefenderEnergy(uid) {
      if (untouchable()) return;
      const defender = opp.active!;
      if (energyProtected(state.cards, defender)) return log(`Brock's Protection: ${ctx.defenderDef.name}'s Energy can't be removed.`, opp.id);
      if (energyKept(opp, sides, state.cards, defender)) return log(`[Keep]: ${ctx.defenderDef.name}'s Energy cards can't be discarded.`, opp.id);
      const energy = defender.energy.find((e) => e.uid === uid);
      if (!energy) return;
      defender.energy = defender.energy.filter((e) => e !== energy);
      log(`Discarded ${lookupCard(state.cards, energy.defId).name} from ${ctx.defenderDef.name}.`, opp.id);
      discardTheirEnergy(state, opp, [energy]);
    },
    switchDefender(slot) {
      if (untouchable()) return;
      const locked = activeLocked(state, opp.id);
      if (locked) return log(`${locked}.`, opp.id);
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
      if (passive(attacker)?.noConditions || attacker.effects?.flashTouch) return log(`${attackerDef.name} can't be affected by Special Conditions.`);
      attacker.condition = 'confused';
      log(`${attackerDef.name} is now Confused.`);
    },
    sleepSelf() {
      if (passive(attacker)?.noConditions || attacker.effects?.flashTouch) return log(`${attackerDef.name} can't be affected by Special Conditions.`);
      attacker.condition = 'asleep';
      log(`${attackerDef.name} is now Asleep.`);
    },
    canAffect,
    after: (fn) => void later.push(fn),
    switchOwn(slot) {
      const benched = me.bench[slot];
      if (!benched) return;
      const locked = activeLocked(state, me.id);
      if (locked) return log(`${locked}.`);
      clearOnLeavingActive(attacker);
      me.bench[slot] = attacker;
      me.active = benched;
      log(`${pokemonName(state, attacker)} switched with ${pokemonName(state, benched)}.`);
    },
    returnDefender() {
      if (untouchable()) return;
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
    opponentChooses(choice) {
      state.pendingChoice = { ...choice, player: opp.id } as PendingChoice;
    },
    log,
  };
  return ctx;
}
