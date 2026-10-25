// Attack resolution: legality, the choices an attack asks for, damage (weakness, resistance,
// prevention) and the helpers card effects use. Card-specific behaviour lives in effects/.
import { conditionProof, hasOwner, hasType, isBasicEnergy, lookupCard, namesMatch, typeName, typesOf, weaknessLabel, type Attack, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { attackEffect, powerEffect, trainerEffect } from './effects/index.js';
import {
  afflictBetweenTurns,
  canPayCost,
  conditionLabel,
  activeLocked,
  counts,
  discardTheirEnergy,
  discardTool,
  isEnergyCardOf,
  isSpecialEnergy,
  energyPool,
  energyProvided,
  toolOf,
  type Affliction,
  type CardInstance,
  opponentOf,
  type GameState,
  type InPlayPokemon,
  type PlayerId,
  type PlayerState,
  type PokemonEffects,
  type Target,
} from './engine.js';
import { conditionBarred, conditionFree, discardsLocked, hasReact, holonWith, reactCount, energyKept, enervatingPollen, powerActive, prehistoricMemory, scaredBy, type Sides, pokemonPower } from './powers.js';
import { shuffle } from './rng.js';
import { addLog, baseUid, clearOnLeavingActive, effectId, evolvedFromName, isDelta, energyProtected, flipCoin, inPlayDef, lakeTrio, pokemonName, previousLevel, revealFaceDown, shapeshiftCard } from './status.js';
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
  /** A Special Condition or Poison for the Defending Pokémon (Magic Pollen; Miracle Tail: Burned too). */
  condition?: 'asleep' | 'confused' | 'paralyzed' | 'poisoned' | 'burned';
  /** Vermilion City Gym: whether to flip for a Pokémon with Lt. Surge in its name (heads 10 more, tails 10 to itself). */
  vermilionFlip?: boolean;
  /** Charity: the most damage to do to the Defending Pokémon; -1 = no less than usual. */
  damageCap?: number;
  /** A number the attack asks for (Helping Hand: damage counters to remove; Group Attack: Koga's Zubat to bench). */
  amount?: number;
  /** A card in the opponent's discard pile (Pranks). */
  oppDiscardUid?: string;
  /** The opponent's answer, asked before the attack (beforeAttack): Charity Tail 1 = they discarded 2 cards; Trick Play 0 = heads, 1 = tails. */
  answer?: number;
}

/** A question an attack asks before it's used. `prompt` is shown to the player. */
export type ChoiceSpec = { prompt: string } & (
  | { kind: 'ownEnergy'; count: number; options: CardInstance[] }
  /** `optional`: the player may also not choose ("you may switch": Spiral Aura), answered with -1, which is then among the options. */
  | { kind: 'opponentBench'; options: number[]; optional?: boolean }
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
  /** `count` of them, or all if there are fewer. `repeat`: exactly `count` picks, the same one any number of times (Rock Blast). */
  | { kind: 'opponentBenchMany'; count: number; options: number[]; repeat?: boolean }
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
  /** The attacking player's hand (Type Match). Missing in older callers. */
  ownHand?: CardInstance[];
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
  /** How many Prize cards the opponent has left (the Mystery Plates). Missing = not known: their questions are asked anyway. */
  opponentPrizes?: number;
  /** How many Prize cards the attacking player has left (Rage Aura). Missing = not known. */
  ownPrizes?: number;
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
    stadium = null,
    sides = [{ active: attacker, bench: [...bench] }, { active: defender, bench: [...oppBench] }],
  }: { recall?: boolean; bench?: readonly (InPlayPokemon | null)[]; defender?: InPlayPokemon | null; oppBench?: readonly (InPlayPokemon | null)[]; stadium?: CardInstance | null; /** Both players, for whether the copying powers work (Goop Gas, auras); without them, made up from the rest. */ sides?: Sides } = {},
): UsableAttack[] {
  // Shapeshift: the attached Evolution card's attacks, with that card's effects.
  const source = shapeshiftCard(attacker)?.defId ?? effectId(attacker);
  const own = def(cards, attacker).attacks.map((attack) => ({ attack, source }));
  // A Pokémon LV.X: its previous level's attacks too, with that card's effects.
  const previous = !attacker.transformed && !shapeshiftCard(attacker) ? previousLevel(cards, attacker) : null;
  const levels = previous ? previous.attacks.map((attack) => ({ attack, source: previous.id, from: previous.name })) : [];
  const lower =
    recall && !attacker.transformed
      ? attacker.evolvedFrom.flatMap((c) => {
          const d = lookupCard(cards, c.defId);
          return d.kind === 'pokemon' ? d.attacks.map((attack) => ({ attack, source: d.id, from: d.name })) : [];
        })
      : [];
  // The copying powers and bodies below work only while the power does (`powerActive`: any Special Condition for the
  // powers, Goop Gas, Toxic Gas, auras, Imprison, Ancient Wind for the bodies).
  const working = powerActive(attacker, cards, sides) ? pokemonPower(attacker) : undefined;
  // Psylink: a copy of every attack of the player's other Psychic Pokémon in play (all on the Bench), while it works.
  const linked = working?.psylink
    ? bench.flatMap((p) => {
        if (!p || !hasType(def(cards, p), 'psychic')) return [];
        const d = def(cards, p);
        return d.attacks.map((attack) => ({ attack, source: shapeshiftCard(p)?.defId ?? effectId(p), from: d.name }));
      })
    : [];
  // Mimic: every attack of the Defending Pokémon, with its cost and effects, while the power works (as Psylink's).
  const mimic = defender && !defender.faceDown && working?.mimic;
  const copied = mimic ? def(cards, defender).attacks.map((attack) => ({ attack, source: shapeshiftCard(defender)?.defId ?? effectId(defender), from: def(cards, defender).name })) : [];
  // Psymimic: every attack of the opponent's Pokémon in play, while it works.
  const mimicked = working?.psymimic
    ? [defender, ...oppBench].flatMap((p) => {
        if (!p || p.faceDown) return [];
        const d = def(cards, p);
        return d.attacks.map((attack) => ({ attack, source: shapeshiftCard(p)?.defId ?? effectId(p), from: d.name }));
      })
    : [];
  // Fellowship (Poké-Body): every attack of the player's Benched Pokémon with these names. Versatile (Poké-Body): every
  // attack of every other Pokémon in play, either player's.
  const fellows = working?.fellowship;
  // LINK (Unown L): every attack of every other Unown in play, either player's.
  const unown = working?.link ? [...bench, defender, ...oppBench].filter((p) => p && def(cards, p).name.startsWith('Unown')) : [];
  const others = [...(fellows ? bench.filter((p) => p && fellows.some((n) => namesMatch(def(cards, p).name, n))) : []), ...(working?.versatile ? [...bench, defender, ...oppBench] : []), ...unown];
  const shared = [...new Set(others)].flatMap((p) => {
    if (!p || p.faceDown) return [];
    const d = def(cards, p);
    return d.attacks.map((attack) => ({ attack, source: shapeshiftCard(p)?.defId ?? effectId(p), from: d.name }));
  });
  // Memory Berry, and Meteor Falls (an Evolved Pokémon that isn't a Pokémon-ex): the attacks of the cards it evolved from, as with Recall.
  const falls = !!stadium && lookupCard(cards, stadium.defId).name === 'Meteor Falls' && !def(cards, attacker).ex;
  const memory = !recall && !attacker.transformed && (falls || (attacker.attached ?? []).some((a) => a.tool && lookupCard(cards, a.card.defId).name === 'Memory Berry'));
  const remembered = memory
    ? attacker.evolvedFrom.flatMap((c) => {
        const d = lookupCard(cards, c.defId);
        return d.kind === 'pokemon' ? d.attacks.map((attack) => ({ attack, source: d.id, from: d.name })) : [];
      })
    : [];
  // Dragon DNA: the attacks of its Basic Pokémon (the card at the bottom), while it works.
  const basic = working?.dragonDna && attacker.evolvedFrom[0] ? lookupCard(cards, attacker.evolvedFrom[0].defId) : undefined;
  const dna = basic?.kind === 'pokemon' ? basic.attacks.map((attack) => ({ attack, source: basic.id, from: basic.name })) : [];
  // Dark Genes: a Murkrow can use each of its player's working Honchkrow's attacks for no Energy while that Honchkrow has the Energy for it.
  const ownSide = sides[0];
  const genes = namesMatch(def(cards, attacker).name, 'Murkrow') && ownSide
    ? [ownSide.active, ...ownSide.bench].flatMap((p) => {
        if (!p || p === attacker || !powerActive(p, cards, sides) || !pokemonPower(p)?.darkGenes) return [];
        const d = def(cards, p);
        return d.attacks.filter((attack) => canPayCost(p, attack, cards)).map((attack) => ({ attack: { ...attack, cost: [] }, source: effectId(p), from: d.name }));
      })
    : [];
  // A Technical Machine attached to it: its attack.
  const machines = (attacker.attached ?? []).flatMap((a) => {
    const attack = trainerEffect(a.card.defId)?.technicalMachine;
    return attack ? [{ attack, source: a.card.defId, from: lookupCard(cards, a.card.defId).name }] : [];
  });
  // A Stadium's attack (Rocket's Tricky Gym: for Pokémon with Dark or Rocket's in their names).
  const gym = stadium ? trainerEffect(stadium.defId)?.stadiumAttack : undefined;
  const gymAttack = gym && gym.for(def(cards, attacker).name, attacker, cards) ? [{ attack: gym.attack, source: stadium!.defId, from: lookupCard(cards, stadium!.defId).name }] : [];
  return [...own, ...levels, ...dna, ...genes, ...lower, ...remembered, ...linked, ...copied, ...mimicked, ...shared, ...machines, ...gymAttack];
}

/** Every attack the situation's attacker can use, by attack index (its own, then Recall's, Technical Machines'…). */
export const situationAttacks = (s: AttackSituation) => usableAttacks(s.attacker, s.cards, { recall: s.recall, bench: s.ownBench, defender: s.defender, oppBench: s.opponentBench, stadium: s.stadium });
const attackAt = (s: AttackSituation, attackIndex: number) => situationAttacks(s)[attackIndex];

/** The Nidoran line (Mother Pheromone). */
const NIDO_LINE = ['Nidoran ♀', 'Nidorina', 'Nidoran ♂', 'Nidorino', 'Nidoking'];

/** The question the attack asks the opponent before it's used, if any (AttackEffect.askOpponent). */
export function attackAsks(s: AttackSituation, attackIndex: number): AttackEffect['askOpponent'] {
  const usable = attackAt(s, attackIndex);
  return usable ? attackEffect(usable.source, usable.attack.name)?.askOpponent : undefined;
}

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
  /** The cost it has now, when something changes it (Delta Aura); null for the printed one. */
  costNow?: (s: AttackSituation) => EnergyType[] | null;
  /** Energy the attacker discards in order to use the attack. */
  discard?: { count: number | 'all'; type?: EnergyType };
  /** It can be used while the attacker is Asleep (Toss and Turn). */
  whileAsleep?: boolean;
  /** Why the attack can't be used now (beyond its energy cost). */
  blocked?: (s: AttackSituation) => string | null;
  /** A question for the opponent before the attack (beforeAttack): Charity Tail's discard, Trick Play's guess. Its answer is `answer`. */
  askOpponent?: 'discardTwo' | 'guessCoin';
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
  hit: (amount: number, opts?: { weakness?: boolean; resistance?: boolean; swift?: boolean; keepWeakness?: boolean }) => number;
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
  /** The attack being used, and the card it's printed on (Memory Out, Dragon DNA). Missing for damage outside an attack's own run. */
  attackName?: string;
  attackSource?: string;
}

const def = inPlayDef;

/**
 * How many of the named special Energy card are attached to the Pokémon (Darkness Energy, Metal Energy). The Diamond & Pearl
 * series' basic Darkness and Metal Energy share their names but not their effects.
 */
const energyCount = (cards: CardLibrary, p: InPlayPokemon, name: string) =>
  p.energy.filter((e) => {
    const d = lookupCard(cards, e.defId);
    return !e.provides && !e.windless && e.faceDownUntil === undefined && d.name === name && d.kind === 'energy' && d.basic === false;
  }).length;

/** Sprout Tower is the Stadium in play. */
const sproutTower = (state: Pick<GameState, 'stadium' | 'cards'>) => !!state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Sprout Tower';

/** How many of the named Trainer card are attached to the Pokémon (PlusPower, Defender). */
const attachedCount = (cards: CardLibrary, p: InPlayPokemon, name: string) => (p.attached ?? []).filter((a) => lookupCard(cards, a.card.defId).name === name).length;

/** How much less attack damage `player`'s Pokémon of `type` take from battle rules (a run's items). */
const ruleGuard = (state: GameState, player: PlayerId, types: readonly EnergyType[]) =>
  (state.rules ?? []).reduce((n, r) => (r.kind === 'damageGuard' && r.player === player && (!r.type || types.includes(r.type)) ? n + r.amount : n), 0);

/**
 * Attack damage without weakness or resistance (to a benched Pokémon, or to the attacker itself,
 * Confusion included): Defender still takes off 20 each.
 */
const afterDefender = (cards: CardLibrary, p: InPlayPokemon, amount: number) => Math.max(0, amount - 20 * attachedCount(cards, p, 'Defender'));

/** An effect turned on for "your opponent's next turn" is still active this turn. */
const active = (until: number | undefined, turn: number) => until !== undefined && until >= turn;

/** A reduction that takes all of an attack's damage, however much (Synergy Effect's "prevent all damage"): more than any attack does. */
const ALL_DAMAGE = 1000;

/** One change to an attack's damage to the Defending Pokémon, and what made it (traceDamage). An empty label is the damage the attack itself did before any of them. */
export interface DamageStep {
  label: string;
  change: number;
}

/** While traceDamage runs: every change made to an attack's damage to the Defending Pokémon, in order. */
let damageSteps: DamageStep[] | null = null;

/** Runs `run` (an attack, played on a copy of the game) and returns what changed its damage to the Defending Pokémon, for the attack list. */
export function traceDamage(run: () => void): DamageStep[] {
  const was = damageSteps;
  const steps: DamageStep[] = [];
  damageSteps = steps;
  try {
    run();
  } finally {
    damageSteps = was;
  }
  return steps;
}

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
  // Toss and Turn: "This attack can be used even if … is Asleep."
  const whileAsleep = condition === 'asleep' && attackEffect(usable.source, attack.name)?.whileAsleep;
  if ((condition === 'asleep' && !whileAsleep) || condition === 'paralyzed') return `${attackerDef.name} is ${conditionLabel(condition)} and can't attack`;
  const amnesia = s.attacker.effects?.amnesia;
  if (amnesia && amnesia.attack === attack.name && active(amnesia.until, s.turn)) {
    return `${attackerDef.name} can't use ${attack.name} this turn`;
  }
  if (active(s.attacker.effects?.noAttack, s.turn)) return `${attackerDef.name} can't attack this turn`;
  const encore = s.attacker.effects?.encore;
  if (encore && active(encore.until, s.turn) && encore.attack !== attack.name) return `Encore: ${attackerDef.name} can use only ${encore.attack} this turn`;
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
  const sides = [{ active: s.attacker, bench: s.ownBench, ...(s.powersOff && { powersOffUntil: s.turn }) }, { active: s.defender, bench: s.opponentBench }];
  const working = (p: InPlayPokemon) => powerActive(p, s.cards, sides) ? pokemonPower(p) : undefined;
  // Power Saver: not while 3 or fewer Pokémon in play (both players') have its team in their names.
  const saver = working(s.attacker)?.powerSaver;
  if (saver && sides.flatMap((side) => [side.active, ...side.bench]).filter((p) => p && def(s.cards, p).name.includes(saver)).length <= 3) {
    return `Power Saver: ${attackerDef.name} can't attack while 3 or fewer Pokémon in play have ${saver} in their names`;
  }
  // Intimidating Ring (the Defending Pokémon's), and Shining Horn (a Skarmory that's its player's only Pokémon in play):
  // Basic Pokémon can't attack.
  if (attackerDef.stage === 'basic') {
    const ring = working(s.defender)?.intimidatingRing || working(s.defender)?.intimidatingArmor;
    const horn = working(s.defender)?.shiningHorn && !s.opponentBench.some(Boolean);
    if (ring || horn) return `${def(s.cards, s.defender).power!.name}: ${attackerDef.name} can't attack`;
  }
  // Deadlock: the Defending Pokémon's stops the attacker's name (the opponent's Dunsparce).
  const locked = working(s.defender)?.deadlock;
  if (locked && namesMatch(attackerDef.name, locked)) return `Deadlock: ${attackerDef.name} can't attack`;
  // Invisible Tentacles (the opponent's): attacking takes a card from the hand to discard.
  if (!s.ownHand?.length && [s.defender, ...s.opponentBench].some((p) => p && working(p)?.invisibleTentacles)) return `Invisible Tentacles: ${attackerDef.name} can't attack without a card in your hand to discard`;
  // Slow Start: not until the opponent has 3 or fewer Prize cards left.
  if (working(s.attacker)?.slowStart && (s.opponentPrizes ?? 6) > 3) return `Slow Start: ${attackerDef.name} can't attack until your opponent has 3 or fewer Prize cards left`;
  // Mark of Antiquity: either Active Pokémon's stops the Pokémon it names, whoever's they are.
  for (const active of [s.attacker, s.defender]) {
    const marked = working(active)?.markOfAntiquity;
    if (marked?.some((name) => namesMatch(attackerDef.name, name))) return `Mark of Antiquity: ${attackerDef.name} can't attack`;
  }
  // Primal Pull: either Active Claydol's makes an Evolved Pokémon's attacks cost 1 more Colorless Energy.
  const pulled = s.attacker.evolvedFrom.length > 0 && [s.attacker, s.defender].some((a) => working(a)?.primalPull);
  const effect = attackEffect(usable.source, attack.name);
  const cost = effect?.costNow?.(s) ?? attack.cost;
  // Extra Liquid (anywhere in play, either player's): a Pokémon-ex's attacks cost 1 Colorless more (only 1, however many).
  const liquid = !!attackerDef.ex && sides.some((side) => [side.active, ...side.bench].some((p) => p && working(p)?.extraLiquid));
  // Downer Material (the opponent's, with their Uxie and Mesprit in play): a Basic Pokémon's attacks cost 1 Colorless more (only 1).
  const downer = attackerDef.stage === 'basic' && [s.defender, ...s.opponentBench].some((p) => p && working(p)?.downerMaterial && lakeTrio(s.cards, sides[1]!, ['Uxie', 'Mesprit']));
  // Mother Pheromone: 1 Colorless less for each of the player's working Nidoqueen, for the Nidoran line.
  // Regi Form: 1 Colorless less with Regirock, Regice and Registeel in play.
  const regi = working(s.attacker)?.regiForm && ['Regirock', 'Regice', 'Registeel'].every((n) => [s.attacker, ...s.ownBench].some((p) => p && namesMatch(def(s.cards, p).name, n))) ? 1 : 0;
  const pheromone = (NIDO_LINE.some((n) => namesMatch(attackerDef.name, n)) ? [s.attacker, ...s.ownBench].filter((p) => p && working(p)?.motherPheromone).length : 0) + regi;
  const more = [...(pulled ? ['colorless' as const] : []), ...(liquid ? ['colorless' as const] : []), ...(downer ? ['colorless' as const] : [])];
  // Battle Rush: no Colorless Energy at all while the opponent has a Pokémon of 120 HP or more in play.
  const rush = working(s.attacker)?.battleRush && [s.defender, ...s.opponentBench].some((p) => p && def(s.cards, p).hp >= 120);
  const fewer = (c: typeof cost) => {
    let left = pheromone;
    return c.filter((t) => !(t === 'colorless' && (rush || left-- > 0)));
  };
  if (!canPayCost(s.attacker, { ...attack, cost: fewer([...cost, ...more]) }, s.cards)) return more.length ? `Not enough energy (${[pulled && 'Primal Pull', liquid && 'Extra Liquid'].filter(Boolean).join(', ')}: ${more.length} more Colorless Energy)` : 'Not enough energy';
  const discard = effect?.discard;
  if (discard && discard.count !== 'all' && discardOptions(s, discard.type).length < discard.count) {
    return `${attack.name} needs ${discard.count} ${discard.type ? `${typeName(discard.type)} ` : ''}Energy to discard`;
  }
  return effect?.blocked?.(s) ?? null;
}

/** Energy that can be discarded for the attack. A Transformed Ditto's Energy counts as any type. */
export const discardOptions = (s: AttackSituation, type?: EnergyType) =>
  s.attacker.energy.filter((e) => !type || s.attacker.transformed || counts(energyProvided(e, s.cards).type, type));

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
      if (spec.repeat) return spec.options.length === 1 ? Array.from({ length: spec.count }, () => spec.options[0]!) : undefined;
      return spec.options.length <= spec.count ? spec.options : undefined;
    default:
      return spec.options.length === 1 ? spec.options[0] : undefined;
  }
}

/** The first allowed answer to `spec` (a copied attack's questions, performCopiedAttack). */
function firstAnswer(spec: ChoiceSpec): AttackChoices[keyof AttackChoices] {
  switch (spec.kind) {
    case 'ownEnergy':
      return spec.options.slice(0, spec.count).map((e) => e.uid);
    case 'ownEnergyUpTo':
    case 'ownEnergyAny':
      return [];
    case 'ownDiscard':
      return spec.options.slice(0, spec.min).map((c) => c.uid);
    case 'eitherDiscard':
      return spec.options.slice(0, 1).map((c) => c.uid);
    case 'defenderEnergy':
    case 'pokemonEnergy':
    case 'oppDiscard':
      return spec.options[0]?.uid;
    case 'opponentBenchMany':
      return spec.repeat ? Array.from({ length: spec.count }, () => spec.options[0]!) : spec.options.slice(0, spec.count);
    default:
      return spec.options[0];
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
      if (spec.repeat) return Array.isArray(value) && value.length === spec.count && value.every((v) => spec.options.includes(v));
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
 * through the defender's effects. An attacker of several types (Energy Variation) meets Weakness or Resistance if any of
 * them is its type (agreed), once.
 */
export function applyWeaknessResistance(
  amount: number,
  attackerType: EnergyType | readonly EnergyType[],
  defender: PokemonCardDef,
  effects?: PokemonEffects,
  {
    resistance: withResistance = true,
    weakness: withWeakness = true,
    resistanceLess = 0,
    resistanceCap = Infinity,
    weaknessIgnore,
    doubleWeakness = false,
  }: { resistance?: boolean; weakness?: boolean; resistanceLess?: number; resistanceCap?: number; weaknessIgnore?: EnergyType; /** Lake Boundary: every Weakness is ×2. */ doubleWeakness?: boolean } = {},
): number {
  if (amount <= 0) return 0;
  const weakness = defender.weakness && { ...defender.weakness, type: effects?.weakness ?? defender.weakness.type };
  const resistance = effects?.resistance ? { type: effects.resistance, amount: defender.resistance?.amount ?? 30 } : defender.resistance;
  let damage = amount;
  const types: readonly EnergyType[] = typeof attackerType === 'string' ? [attackerType] : attackerType;
  // A second printed Weakness or Resistance (Team Magma's Aggron: Grass and Water) counts too, but each applies once
  // (agreed). Conversion's changed type replaces them all.
  // Dark Hole (`weaknessIgnore`): Darkness Weakness doesn't apply.
  const weakTo = (weakness ? [weakness.type, ...(effects?.weakness ? [] : (defender.moreWeakness ?? []))] : []).filter((t) => t !== weaknessIgnore);
  const resists = resistance ? [resistance.type, ...(effects?.resistance ? [] : (defender.moreResistance ?? []))] : [];
  // Cinnabar City Gym: no Weakness for a Water Pokémon's attack on Blaine's Pokémon.
  if (withWeakness && weakness && types.some((t) => weakTo.includes(t))) damage = doubleWeakness ? damage * 2 : weakness.plus ? damage + weakness.plus : damage * weakness.multiplier;
  // Hook Shot and Pewter City Gym: no Resistance. Resistance Gym: 20 less of it.
  if (withResistance && resistance && types.some((t) => resists.includes(t))) damage -= Math.min(resistanceCap, Math.max(0, resistance.amount - resistanceLess));
  return Math.max(0, damage);
}

/**
 * Damage an attack's base damage does to the defending Pokémon: doubled (or so) if it's weak to
 * the attacker's type, then reduced if it resists it, never below 0. Pass the defender in play
 * to include Conversion changes.
 */
export const attackDamage = (attack: Attack, attacker: PokemonCardDef, defender: PokemonCardDef, defenderInPlay?: InPlayPokemon) =>
  applyWeaknessResistance(attack.damage, typesOf(attacker), defender, defenderInPlay?.effects);

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
  if (pokemonPower(attacker)?.rebellion && powerActive(attacker, state.cards, [me, opp])) {
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
  // Modern rules (agreed with the user, for every set): a Confused Pokémon flips to attack; on tails it does 30 damage to
  // itself instead.
  if (attacker.condition === 'confused' && !flipCoin(state, `${attackerDef.name} is Confused`, me.id)) {
    // Frenzy: 30 more, even to itself.
    const frenzy = pokemonPower(attacker)?.frenzy && powerActive(attacker, state.cards, [me, opp]) ? 30 : 0;
    // Hard Protection: no damage from its own attacks, Confusion's included (agreed).
    const hard = pokemonPower(attacker)?.hardProtection && powerActive(attacker, state.cards, [me, opp]);
    // Magical Step: 60 instead of 30.
    const damage = hard ? 0 : afterDefender(state.cards, attacker, (attacker.effects?.magicalStep ? 60 : 30) + frenzy);
    attacker.damage += damage;
    addLog(state, damage ? `${attackerDef.name} hurt itself for ${damage} damage.` : `The damage ${attackerDef.name} did to itself was prevented.`, me.id);
    return null;
  }
  for (const [key, name] of [['sandAttack', 'Sand-attack'], ['smokescreen', 'Smokescreen']] as const) {
    if (active(attacker.effects?.[key], state.turn) && !flipCoin(state, name, me.id)) {
      addLog(state, `${attack.name} did nothing.`, me.id);
      return null;
    }
  }
  // Pattern Distraction: the Defending player's working Active Spinda makes a Basic Pokémon's attack a flip; tails, it does nothing.
  const spinda = opp.active;
  if (spinda && attackerDef.stage === 'basic' && pokemonPower(spinda)?.patternDistraction && powerActive(spinda, state.cards, [me, opp]) && !flipCoin(state, 'Pattern Distraction', me.id)) {
    addLog(state, `${attack.name} did nothing.`, me.id);
    return null;
  }
  // Holon Circle: an Active Pokémon's attack does nothing at all; then the Stadium is discarded.
  const circle = state.stadium;
  if (circle && lookupCard(state.cards, circle.card.defId).name === 'Holon Circle') {
    state.players[circle.owner]!.discard.push(circle.card);
    state.stadium = null;
    addLog(state, `Holon Circle: ${attack.name} did nothing, and Holon Circle was discarded.`, me.id);
    return null;
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
  const ctx = createContext(state, me, opp, choices, later, `${attackerDef.name}'s ${attack.name}`, { vermilion, flee, attackName: attack.name, attackSource });
  ctx.useAttack(attack, attackSource);
  if (vermilion === false && me.active === attacker) ctx.selfDamage(10);
  // Memory Berry and Crystal Shard: discarded at the end of a turn their Pokémon attacks.
  const memory = toolOf(state.cards, attacker);
  if (memory?.name === 'Memory Berry' || memory?.name === 'Crystal Shard') memory.tool.until = state.turn;
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
  ownHand: me.hand,
  cards: state.cards,
  turn: state.turn,
  stadium: state.stadium?.card ?? null,
  recall: recallsAttacks(state, me),
  opponentDiscard: opp.discard,
  powersOff: me.powersOffUntil !== undefined || opp.powersOffUntil !== undefined,
  discardsLocked: discardsLocked([me, opp], state.cards),
  opponentPrizes: opp.prizes.length,
  ownPrizes: me.prizes.length,
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
  const opp = state.players[opponentOf(state, me.id)]!;
  if (!me.active) return;
  const later: (() => void)[] = [];
  createContext(state, me, opp, {}, later, `${pokemonName(state, me.active)}'s attack`).damageBenched(opp, slot, amount);
  for (const fn of later) fn();
}

/**
 * The current player's Active Pokémon performs a copied attack chosen after its own attack began (Skill Hack: a card in the
 * opponent's hand), as part of that attack. The copied attack's own questions take their first answer that's allowed.
 */
export function performCopiedAttack(state: GameState, attack: Attack, source: string) {
  const me = state.players[state.currentPlayer]!;
  const opp = state.players[opponentOf(state, me.id)]!;
  if (!me.active || !opp.active) return;
  const s = attackSituation(state, me, opp);
  const effect = attackEffect(source, attack.name);
  const choices: AttackChoices = {};
  for (let guard = 0; guard < 10; guard++) {
    const open = (effect?.choices?.(s, choices) ?? []).find((spec) => choices[FIELD[spec.kind]] === undefined);
    if (!open) break;
    (choices as Record<string, unknown>)[FIELD[open.kind]] = autoAnswer(open) ?? firstAnswer(open);
  }
  // Its Energy discard, if any, still has to be done (the first Energy that fits).
  const discard = effect?.discard;
  if (discard) {
    const options = discardOptions(s, discard.type);
    if (discard.count !== 'all' && options.length < discard.count) return addLog(state, `${attack.name} did nothing: not enough Energy to discard.`, me.id);
    const gone = discard.count === 'all' ? [...me.active.energy] : options.slice(0, discard.count);
    me.active.energy = me.active.energy.filter((e) => !gone.includes(e));
    me.discard.push(...gone);
    addLog(state, `${pokemonName(state, me.active)} discarded ${gone.length} Energy.`, me.id);
  }
  const later: (() => void)[] = [];
  const ctx = createContext(state, me, opp, choices, later, `${pokemonName(state, me.active)}'s ${attack.name}`);
  ctx.useAttack(attack, source);
  for (const fn of later) fn();
  ctx.finish();
}

/**
 * Whether attacks can't affect `owner`'s Benched Pokémon this turn: Protective Flame from their last
 * turn, or a working Aurora Veil on their Active Pokémon.
 */
export function benchShielded(owner: PlayerState, cards: CardLibrary, sides: PlayerState[], turn: number): string | null {
  if ((owner.benchProtectedUntil ?? 0) >= turn) return 'Protective Flame';
  const active = owner.active;
  return active && pokemonPower(active)?.auroraVeil && powerActive(active, cards, sides) ? 'Aurora Veil' : null;
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
  { vermilion, flee, attackName, attackSource }: { vermilion?: boolean; flee?: number; attackName?: string; attackSource?: string } = {},
): AttackContext & { finish: () => void } {
  const turn = state.turn;
  const attacker = me.active!;
  const attackerDef = def(state.cards, attacker);
  const log = (text: string, player = me.id) => addLog(state, text, player);
  const sides = [me, opp];
  /** The power of a Pokémon reacting to the attack, while it works (not Asleep etc., no Toxic Gas). */
  const passive = (p: InPlayPokemon) => (powerActive(p, state.cards, sides) ? pokemonPower(p) : undefined);
  /** Frenzy: the attacker does 30 more damage while it's Confused (before Weakness and Resistance), to itself too. */
  const frenzy = () => (attacker.condition === 'confused' && passive(attacker)?.frenzy ? 30 : 0);
  /** While `hit` works out the damage to the Defending Pokémon: each change to it is noted (traceDamage). */
  let hitting = false;
  /** `after`, noting the change from `before` as `label`'s while hitting the Defending Pokémon. */
  const noted = (label: string, before: number, after: number) => {
    if (hitting && damageSteps && after !== before) damageSteps.push({ label, change: after - before });
    return after;
  };
  /** Neutral Shield: attacks by Evolved Pokémon don't affect it. Safeguard: nor by Pokémon-ex; Wonder Guard: by either (the opponent's). */
  const neutral = (p: InPlayPokemon) => {
    const evolved = attacker.evolvedFrom.length > 0;
    const theirs = [opp.active, ...opp.bench].includes(p);
    // Beacon Protection, Extra Protection: only while its player has the partner in play.
    const partner = passive(p)?.guardPartner;
    const partnered = !partner || [opp.active, ...opp.bench].some((q) => q && namesMatch(def(state.cards, q).name, partner));
    const from = partnered ? passive(p)?.guardFrom : undefined;
    // Fast Protection: nor by the opponent's Basic Pokémon. Advanced Armor, Psychic Shield: nor, this turn, by the opponent's
    // Evolved Pokémon or Pokémon-ex.
    if (theirs && ((passive(p)?.basicProof && attackerDef.stage === 'basic') || (active(p.effects?.evolvedProof, turn) && evolved) || (active(p.effects?.exProof, turn) && attackerDef.ex))) return true;
    // Holy Shield ('dark'): nor by Pokémon with Dark in their names.
    if (from === 'dark') return theirs && /\bDark\b/.test(attackerDef.name);
    // Mysterious Shard: nothing from the opponent's Pokémon-ex's attacks.
    if (theirs && attackerDef.ex && toolOf(state.cards, p)?.name === 'Mysterious Shard') return true;
    // Solid Shell (Cloyster δ): nothing from the opponent's attacks to its player's Benched δ Pokémon.
    if (theirs && opp.bench.includes(p) && isDelta(state.cards, p) && [opp.active, ...opp.bench].some((q) => q && passive(q)?.deltaBenchShield)) return true;
    // Reactive Shield: the player's Tentacruel, while one with a React Energy card attached has it working, from Pokémon-ex.
    if (theirs && attackerDef.ex && namesMatch(def(state.cards, p).name, 'Tentacruel') && [opp.active, ...opp.bench].some((q) => q && passive(q)?.reactiveShield && hasReact(q, state.cards))) return true;
    return (evolved && !!passive(p)?.neutralShield) || (!!from && theirs && (!!attackerDef.ex || (from === 'evolvedOrEx' && evolved)));
  };
  /** Flee: the Defending Pokémon that took damage and switches out once the attack is over; nothing else the attack does affects it. */
  let fled: InPlayPokemon | null = null;
  /** [Quicken]: attacks do nothing to `owner`'s Pokémon with Unown in their names this turn. */
  const quickened = (p: InPlayPokemon, owner: PlayerState) => active(owner.quickenUntil, turn) && def(state.cards, p).name.includes('Unown');
  /**
   * Whether the attack can't affect this Pokémon of `owner`, without flipping for Transparency: it fled, Barrier
   * or Agility, Neutral Shield, Quicken, or (benched) Protective Flame or Aurora Veil.
   */
  const immune = (p: InPlayPokemon, owner: PlayerState) =>
    p === fled ||
    active(p.effects?.preventAll, turn) ||
    neutral(p) ||
    quickened(p, owner) ||
    (owner.active !== p && !!benchShielded(owner, state.cards, sides, turn)) ||
    // UNSEEN: the player's Unown U on the Bench keeps the opponent's attacks off their Benched Unown.
    (owner === opp && owner.active !== p && def(state.cards, p).name.startsWith('Unown') && owner.bench.some((q) => q && passive(q)?.unseen));
  /** Vermilion City Gym's 10 more damage, done once. */
  let vermilionBonus = vermilion === true;
  const transparency = new Map<string, boolean>();
  /** Transparency: the first time this attack does anything to the Pokémon, a flip; heads prevents all its effects on it. */
  const transparent = (p: InPlayPokemon, owner: PlayerState) => {
    // Fluff: only against the opponent's attack, with a damage counter on it.
    const fluff = !!passive(p)?.fluff && owner === opp && p.damage >= 10;
    if (!passive(p)?.transparency && !fluff) return false;
    if (!transparency.has(p.card.uid)) transparency.set(p.card.uid, flipCoin(state, fluff ? 'Fluff' : 'Transparency', owner.id));
    return transparency.get(p.card.uid)!;
  };
  /**
   * Time Shard: the opponent's attack's damage is Knocking out `p` (of `owner`): it's marked for resolveKnockouts, which
   * returns its basic Energy cards. With more than 2, its owner picks up to 2 once the attack is over (agreed).
   */
  const shard = (p: InPlayPokemon, owner: PlayerState) => {
    if (owner !== opp || p.timeShard || p.damage < def(state.cards, p).hp || toolOf(state.cards, p)?.name !== 'Time Shard') return;
    const basic = p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)));
    if (basic.length <= 2) {
      p.timeShard = true;
      return;
    }
    p.timeShard = 'asked';
    const target: Target = owner.active === p ? 'active' : owner.bench.indexOf(p);
    (state.queuedChoices ??= []).push({ player: owner.id, source: 'Time Shard', kind: 'discardAttached', target, toHand: true, count: 2, optional: true });
  };
  /** Kabuto Armor: attack damage to it is halved, rounded down to the nearest 10, after everything else. */
  const armor = (p: InPlayPokemon, damage: number, owner: PlayerState) => {
    if (damage <= 0 || !passive(p)?.halvesDamage) return damage;
    log(`Kabuto Armor halved the damage to ${pokemonName(state, p)}.`, owner.id);
    return noted('Kabuto Armor', damage, Math.floor(damage / 20) * 10);
  };
  /**
   * Effects on the defender are blocked by Barrier and Agility, and by Transparency on heads. Read
   * live: Lure and Whirlwind change the defender.
   */
  const shielded = () =>
    active(opp.active?.effects?.preventAll, turn) ||
    (!!opp.active &&
      (opp.active === fled ||
        neutral(opp.active) ||
        quickened(opp.active, opp) ||
        transparent(opp.active, opp) ||
        (airy(opp.active) && evolvedFromName(state.cards, opp.active, 'Mime Jr.')) ||
        (!!passive(opp.active)?.potShell && attacker.energy.some((e) => isSpecialEnergy(state.cards, e))) ||
        // Marvel Scale: nothing from the opponent's Pokémon LV.X.
        (!!passive(opp.active)?.marvelScale && attackerDef.stage === 'levelUp') ||
        // Psybarrier: nothing from the opponent's Pokémon that aren't Evolved Pokémon.
        (!!passive(opp.active)?.psybarrier && !attacker.evolvedFrom.length) ||
        // Poison Enzyme: nothing from a Poisoned attacker.
        (!!passive(opp.active)?.poisonEnzyme && !!attacker.poison) ||
        // Night Spin: nothing from an attacker with 2 Energy or less attached.
        (active(opp.active.effects?.nightSpin, turn) && energyPool(attacker, state.cards).length <= 2)));
  /** Airy Wall works against this attack: the attacker has 2 or fewer Energy cards attached. */
  const airy = (p: InPlayPokemon) => !!passive(p)?.airyWall && attacker.energy.filter((e) => !e.provides).length <= 2;
  /** Shielded, or Crystal Body or Light Wave: the attack does nothing to the Defending Pokémon but damage. Logs why. */
  const untouchable = () => {
    // Darkness Veil: Crystal Body with Darkness Energy attached.
    const veil = opp.active && passive(opp.active)?.crystalBodyWith;
    // Dragon Aura's condition; Holon Energy WP with a basic Water Energy card attached.
    const veiled =
      (!!veil && energyPool(opp.active!, state.cards).some((e) => counts(e, veil))) ||
      (!!opp.active && (!!passive(opp.active)?.crystalBodyWhen?.(opp.active, state.cards) || holonWith(opp.active, state.cards, 'WP', 'water')));
    // Unown G's GUARD: attached as a Pokémon Tool, nothing but damage.
    const guarded = !!opp.active?.attached?.some((a) => a.equip && lookupCard(state.cards, a.card.defId).name === 'Unown G');
    const crystal = !!opp.active && (!!passive(opp.active)?.crystalBody || veiled || guarded || active(opp.active.effects?.effectProof, turn));
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
  /** Intimidating Fang: while the opponent's Active Pokémon has it, the attack does less to any of their Pokémon (before Weakness and Resistance). */
  const intimidated = (amount: number, owner: PlayerState) => {
    const guard = owner.active ? passive(owner.active) : undefined;
    // Lazy Aura: only against the opponent's Pokémon-ex (agreed: the Bench too, as Intimidating Fang).
    // Craggy Face: only against the opponent's Stage 2 Evolved Pokémon.
    const craggy = attackerDef.stage === 'stage2' && attacker.evolvedFrom.length ? (guard?.stage2Less ?? 0) : 0;
    const less = (guard?.intimidatingFang ?? 0) + (attackerDef.ex ? (guard?.exAura ?? 0) : 0) + craggy;
    if (!less || amount <= 0) return amount;
    log(`${def(state.cards, owner.active!).power!.name} reduced the damage by ${less}.`, owner.id);
    return Math.max(0, amount - less);
  };
  /** Shell Armor: 10 less attack damage. Strange Barrier: an attack by a Basic Pokémon does 10 instead of 20 or more. */
  const barriers = (p: InPlayPokemon, damage: number, owner: PlayerState) => {
    const body = passive(p);
    // Unown W's WALL: its player's Active Unown W makes the opponent's attacks do 10 less to each of their Pokémon.
    const wall = owner.active ? passive(owner.active)?.wall : undefined;
    if (damage > 0 && owner === opp && wall) {
      damage = noted(def(state.cards, owner.active!).power?.name ?? 'WALL', damage, Math.max(0, damage - wall));
      log(`${def(state.cards, owner.active!).power?.name ?? 'WALL'} reduced the damage to ${pokemonName(state, p)} by ${wall}.`, owner.id);
    }
    // Protect Wing: 20 less from the opponent's Stage 2 Pokémon.
    if (damage > 0 && owner === opp && owner.active && passive(owner.active)?.protectWing && attackerDef.stage === 'stage2') {
      damage = noted('Protect Wing', damage, Math.max(0, damage - 20));
      log(`Protect Wing reduced the damage to ${pokemonName(state, p)} by 20.`, owner.id);
    }
    if (damage > 0 && owner === opp && body) {
      // Steel Coating: 10 less for each Metal Energy attached, 20 at most.
      const steel = body.steelCoating ? Math.min(20, 10 * energyPool(p, state.cards).filter((e) => counts(e, 'metal')).length) : 0;
      if (steel) {
        damage = noted('Steel Coating', damage, Math.max(0, damage - steel));
        log(`Steel Coating reduced the damage to ${pokemonName(state, p)} by ${steel}.`, owner.id);
      }
      // Honeycomb Defender: 40 less with 6 or more damage counters on it.
      if (body.honeycomb && p.damage >= 60 && damage > 0) {
        damage = noted('Honeycomb Defender', damage, Math.max(0, damage - 40));
        log(`Honeycomb Defender reduced the damage to ${pokemonName(state, p)} by 40.`, owner.id);
      }
      // Fossil Armor: no damage of 60 or less.
      if (body.fossilArmor && damage > 0 && damage <= 60) {
        log(`Fossil Armor prevented the damage to ${pokemonName(state, p)}.`, owner.id);
        return noted('Fossil Armor', damage, 0);
      }
      // Cotton Spore: on its owner's heads, no damage from the opponent's attack.
      if (body.cottonSpore && flipCoin(state, 'Cotton Spore', owner.id)) {
        log(`Cotton Spore prevented the damage to ${pokemonName(state, p)}.`, owner.id);
        return noted('Cotton Spore', damage, 0);
      }
      // Pot Shell: no damage from an attacker with a Special Energy card attached.
      if (body.potShell && attacker.energy.some((e) => isSpecialEnergy(state.cards, e))) {
        log(`Pot Shell prevented the damage to ${pokemonName(state, p)}.`, owner.id);
        return noted('Pot Shell', damage, 0);
      }
      // Trash Cloak (with a Pokémon Tool attached), Camouflage (a basic Energy card of the attacker's type attached), Cotton Balloon
      // (with Grass Energy attached, against an Evolved Pokémon): less after Weakness and Resistance.
      const trash = body.trashCloak && (p.attached ?? []).some((a) => a.tool) ? 20 : 0;
      const camo = body.camouflage && p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)) && typesOf(attackerDef).some((t) => isEnergyCardOf(e, state.cards, t))) ? 40 : 0;
      const balloon = body.cottonBalloon && attacker.evolvedFrom.length > 0 && energyPool(p, state.cards).some((e) => counts(e, 'grass')) ? 20 : 0;
      const less = trash + camo + balloon;
      if (less) {
        damage = noted(def(state.cards, p).power?.name ?? 'Less damage', damage, Math.max(0, damage - less));
        log(`${def(state.cards, p).power?.name ?? 'A Poké-Body'} reduced the damage to ${pokemonName(state, p)} by ${less}.`, owner.id);
      }
    }
    // Hard Cocoon: the opponent's attack, on its owner's heads, does a set amount less.
    const cocoon = passive(p)?.hardCocoon;
    if (damage > 0 && cocoon && owner === opp && flipCoin(state, 'Hard Cocoon', owner.id)) {
      damage = Math.max(0, damage - cocoon);
      log(`Hard Cocoon reduced the damage to ${pokemonName(state, p)} by ${cocoon}.`, owner.id);
    }
    if (damage > 0 && passive(p)?.shellArmor) {
      damage = noted('Shell Armor', damage, Math.max(0, damage - 10));
      log(`Shell Armor reduced the damage to ${pokemonName(state, p)} by 10.`, owner.id);
    }
    // Dense Body: 20 less from a Basic Pokémon's attack (not a Baby Pokémon's).
    const guarded = passive(p)?.basicGuard;
    if (damage > 0 && guarded && attackerDef.stage === 'basic' && !attackerDef.baby) {
      damage = noted(def(state.cards, p).power!.name, damage, Math.max(0, damage - guarded));
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${guarded}.`, owner.id);
    }
    // Thick Shell: a set amount less from an Evolved Pokémon's attack.
    const shell = passive(p)?.evolvedGuard;
    if (damage > 0 && shell && attacker.evolvedFrom.length > 0) {
      damage = noted(def(state.cards, p).power!.name, damage, Math.max(0, damage - shell));
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${shell}.`, owner.id);
    }
    // Energy Guard: a set amount less from the opponent's attack, with a basic Energy card attached.
    const energyGuard = passive(p)?.energyGuard;
    if (damage > 0 && energyGuard && owner === opp && p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))) {
      damage = Math.max(0, damage - energyGuard);
      log(`Energy Guard reduced the damage to ${pokemonName(state, p)} by ${energyGuard}.`, owner.id);
    }
    // Glowing Screen: a set amount less from an attacker of its types, while its owner has its partner in play.
    const screen = passive(p)?.partnerGuard;
    if (damage > 0 && screen && screen.types.some((t) => hasType(attackerDef, t)) && [owner.active, ...owner.bench].some((q) => q && namesMatch(def(state.cards, q).name, screen.partner))) {
      damage = Math.max(0, damage - screen.amount);
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${screen.amount}.`, owner.id);
    }
    // Ice Wall: a set amount less from the opponent's Pokémon with a Special Energy card attached.
    const iceWall = passive(p)?.specialGuard;
    if (damage > 0 && iceWall && owner === opp && attacker.energy.some((e) => isSpecialEnergy(state.cards, e))) {
      damage = Math.max(0, damage - iceWall);
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${iceWall}.`, owner.id);
    }
    // Shell Retreat, Core Guard: a set amount less with Energy (of a type) attached; only from the opponent's attacks unless `anyAttack`.
    const core = passive(p)?.coreGuard;
    const energized = core && (core.energy ? energyPool(p, state.cards).some((e) => counts(e, core.energy!)) : p.energy.some((e) => !e.provides));
    if (damage > 0 && core && energized && (owner === opp || core.anyAttack)) {
      damage = Math.max(0, damage - core.amount);
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${core.amount}.`, owner.id);
    }
    // Buffer Piece: 20 less from the opponent's attack.
    if (damage > 0 && owner === opp && toolOf(state.cards, p)?.name === 'Buffer Piece') {
      damage = Math.max(0, damage - 20);
      log(`Buffer Piece reduced the damage to ${pokemonName(state, p)} by 20.`, owner.id);
    }
    // Rai-shield: a set amount less from the opponent's Pokémon-ex. Mist: a set amount less from Stage 2 Pokémon.
    const exLess = passive(p)?.exReduction;
    if (damage > 0 && exLess && owner === opp && attackerDef.ex) {
      damage = Math.max(0, damage - exLess);
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${exLess}.`, owner.id);
    }
    // Thick Fat: a set amount less from Pokémon of its types. Holon Energy GL with a basic Lightning Energy card: 10 less from
    // the opponent's Pokémon-ex (agreed: after Weakness and Resistance, to its own Pokémon only). Reversal Aura: 20 less from
    // the Active Pokémon while its player has more Prize cards left.
    const fat = passive(p)?.typeGuard;
    const reversed = (passive(p)?.reversalAura ?? 0) && attacker === me.active && owner.prizes.length > (owner === opp ? me : opp).prizes.length ? passive(p)!.reversalAura! : 0;
    // Psychic Protector (agreed: chosen before the attack, used only if Flygon ex is damaged): the cards are discarded, 10 less each.
    const protector = state.psychicProtector;
    if (damage > 0 && owner === opp && protector?.length && passive(p)?.psychicProtector) {
      const gone = owner.hand.filter((c) => protector.includes(c.uid));
      owner.hand = owner.hand.filter((c) => !gone.includes(c));
      owner.discard.push(...gone);
      delete state.psychicProtector;
      damage = Math.max(0, damage - 10 * gone.length);
      log(`Psychic Protector: discarded ${gone.length} card${gone.length === 1 ? '' : 's'}; the damage to ${pokemonName(state, p)} was reduced by ${10 * gone.length}.`, owner.id);
    }
    // Ancient Shell: 20 less while its player has its partners in play. Reactive Protection: 10 less for each React Energy card attached.
    const ancient = passive(p)?.partnerShell;
    const shelled = ancient && [owner.active, ...owner.bench].some((q) => q && ancient.names.some((n) => namesMatch(def(state.cards, q).name, n))) ? ancient.amount : 0;
    const reactive = owner === opp && passive(p)?.reactiveProtection ? 10 * reactCount(p, state.cards) : 0;
    // Delta Protection: 40 less from the opponent's δ Pokémon. Hard Rock (only one): 20 less for its player's Groudon ex. Armor:
    // 30 less while the opponent has 5 or more cards in the hand. Glalie's Synergy Effect: 30 less with Glacia's Stadium in play.
    // Drake's Stadium: 10 less for a Colorless Active Pokémon, from the opponent's attack.
    const stadiumName = state.stadium && lookupCard(state.cards, state.stadium.card.defId).name;
    const theirs = owner === opp;
    const delta = theirs && isDelta(state.cards, attacker) ? (passive(p)?.deltaGuard ?? 0) : 0;
    const rock = def(state.cards, p).name === 'Groudon ex' && [owner.active, ...owner.bench].some((q) => q && passive(q)?.hardRock && energyPool(q, state.cards).length <= 1) ? 20 : 0;
    const armor = theirs && passive(p)?.handArmor && me.hand.length >= 5 ? 30 : 0;
    const synergy = passive(p)?.synergy;
    const synergized = theirs && synergy && synergy.stadium === stadiumName ? (synergy.less ?? 0) + (synergy.exProof && attackerDef.ex ? ALL_DAMAGE : 0) : 0;
    const drake = stadiumName === "Drake's Stadium" && owner.active === p && hasType(def(state.cards, p), 'colorless') && theirs ? 10 : 0;
    const less = (fat && fat.types.some((t) => hasType(attackerDef, t)) ? fat.amount : 0) + (owner === opp && attackerDef.ex && holonWith(p, state.cards, 'GL', 'lightning') ? 10 : 0) + reversed + shelled + reactive + delta + rock + armor + synergized + drake;
    if (damage > 0 && less) {
      damage = Math.max(0, damage - less);
      log(`The damage to ${pokemonName(state, p)} was reduced by ${less}.`, owner.id);
    }
    const mist = passive(p)?.stage2Guard;
    if (damage > 0 && mist && attackerDef.stage === 'stage2') {
      damage = Math.max(0, damage - mist);
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${mist}.`, owner.id);
    }
    // Energy Protection: 10 less for each Energy card attached, at most a set amount. Dark Protection: for each Darkness
    // Energy (provided), only against the opponent's attacks.
    const protection = passive(p)?.energyProtection;
    if (damage > 0 && protection && (!protection.oppOnly || owner === opp)) {
      const attached = protection.type ? energyPool(p, state.cards).filter((e) => counts(e, protection.type!)).length : p.energy.filter((e) => !e.provides).length;
      const less = Math.min(protection.max, 10 * attached);
      if (less) {
        damage = Math.max(0, damage - less);
        log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${less}.`, owner.id);
      }
    }
    // Powder Protection: a set amount less from a Pokémon with an owner in its name.
    const powder = passive(p)?.ownerGuard;
    if (damage > 0 && powder && hasOwner(attackerDef.name)) {
      damage = Math.max(0, damage - powder);
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${powder}.`, owner.id);
    }
    // Rock Body, Exoskeleton: a set amount less.
    const reduction = passive(p)?.damageReduction;
    if (damage > 0 && reduction) {
      damage = noted(def(state.cards, p).power!.name, damage, Math.max(0, damage - reduction));
      log(`${def(state.cards, p).power!.name} reduced the damage to ${pokemonName(state, p)} by ${reduction}.`, owner.id);
    }
    if (damage >= 20 && attackerDef.stage === 'basic' && passive(p)?.strangeBarrier) {
      damage = noted('Strange Barrier', damage, 10);
      log(`Strange Barrier reduced the damage to ${pokemonName(state, p)} to 10.`, owner.id);
    }
    // Hard Shell: 40 or less (any attack's, its own player's too) is 10.
    if (damage > 10 && damage <= 40 && passive(p)?.hardShell) {
      damage = noted('Hard Shell', damage, 10);
      log(`Hard Shell reduced the damage to ${pokemonName(state, p)} to 10.`, owner.id);
    }
    // Relaxing Scent, from either Active Pokémon: half the damage to any Pokémon, rounded up to the nearest 10.
    if (damage > 0 && [me.active, opp.active].some((a) => a && passive(a)?.relaxingScent)) {
      damage = noted('Relaxing Scent', damage, Math.ceil(damage / 20) * 10);
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
      return noted('Focus Band', damage, Math.max(0, hp - 10 - p.damage));
    }
    // Endure: not Knocked Out by an attack this turn; 10 HP left instead.
    if (owner === opp && p.damage + damage >= hp && active(p.effects?.endure, turn)) {
      log(`Endure: ${pokemonName(state, p)} isn't Knocked Out; it has 10 HP left.`, owner.id);
      return noted('Endure', damage, Math.max(0, hp - 10 - p.damage));
    }
    // Armor Up: on heads (its owner flips), not Knocked Out by the attack; 10 HP left.
    if (owner === opp && p.damage + damage >= hp && active(p.effects?.armorUp, turn) && flipCoin(state, 'Armor Up', owner.id)) {
      log(`Armor Up: ${pokemonName(state, p)} isn't Knocked Out; it has 10 HP left.`, owner.id);
      return noted('Armor Up', damage, Math.max(0, hp - 10 - p.damage));
    }
    // Time Travel: heads, it isn't Knocked Out; it's shuffled into its owner's deck once the attack is over (resolveKnockouts).
    if (owner === opp && p.damage + damage >= hp && !p.timeTravel && passive(p)?.timeTravel) {
      if (flipCoin(state, 'Time Travel', owner.id)) {
        p.timeTravel = passive(p)!.timeTravel === 'bottom' ? 'bottom' : true;
        log(`Time Travel: ${pokemonName(state, p)} won't be Knocked Out; it goes back into the deck.`, owner.id);
      }
      return damage;
    }
    if (owner !== opp || p.damage + damage < hp || !passive(p)?.fortitude || !flipCoin(state, 'Fortitude', owner.id)) return damage;
    log(`Fortitude: ${pokemonName(state, p)} isn't Knocked Out; it has 10 HP left.`, owner.id);
    return noted('Fortitude', damage, Math.max(0, hp - 10 - p.damage));
  };
  /**
   * Whether a benched Pokémon of `owner` can take attack damage: a face-down card (Secret Plan) is turned over first (and may
   * be discarded), and Transparent Walls prevents the damage.
   */
  const benchCanTake = (owner: PlayerState, p: InPlayPokemon) => {
    if (!revealFaceDown(state, owner.id, p)) return false;
    // Submerge: no damage from the opponent's attacks while it's on the Bench.
    if (owner === opp && passive(p)?.benchImmune) {
      log(`${def(state.cards, p).power!.name} prevented the damage to ${pokemonName(state, p)}.`, owner.id);
      return false;
    }
    // Sand Veil (its owner's, anywhere): no damage from the opponent's attacks to their Benched Pokémon.
    const veil = owner === opp && [owner.active, ...owner.bench].find((q) => q && passive(q)?.sandVeil);
    if (veil) {
      log(`Sand Veil prevented the damage to ${pokemonName(state, p)}.`, owner.id);
      return false;
    }
    // Power Diffusion: its owner's Active Pokémon's stops every attack's damage to their Benched Pokémon, theirs too (agreed).
    if (owner.active && passive(owner.active)?.powerDiffusion) {
      log(`Power Diffusion prevented the damage to ${pokemonName(state, p)}.`, owner.id);
      return false;
    }
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
    const types = typesOf(def(state.cards, holder));
    const energy = basic.find((e) => types.some((type) => isEnergyCardOf(e, state.cards, type))) ?? basic[0]!;
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
      const guarded = passive(q)?.unownGuard;
      return !!guarded && hasType(attackerDef, guarded) && ownInPlay.filter((r) => def(state.cards, r).name === name).length === 1;
    });
    if (!guard) return damage;
    log(`${def(state.cards, guard).power!.name}: the damage to ${pokemonName(state, p)} was reduced by 30.`, owner.id);
    return noted(def(state.cards, guard).power!.name, damage, Math.max(0, damage - 30));
  };
  /** Damage to a benched Pokémon or the attacker itself: Defender, then Kabuto Armor. */
  const benchedDamage = (p: InPlayPokemon, amount: number, owner: PlayerState) => {
    // Hard Protection: no damage from its own player's attacks, its own recoil included (agreed). Accelerative Dive: the same, for a while.
    if (owner === me && (passive(p)?.hardProtection || active(p.effects?.selfProof, turn))) return 0;
    // Feebas's Submerge: on the Bench, no damage from any attack.
    if (owner.active !== p && passive(p)?.benchImmuneAll) return 0;
    amount = charmed(amount);
    // Hitmonlee's Stages of Evolution: more to any of the opponent's Pokémon.
    if (owner === opp && amount > 0) amount += passive(attacker)?.attackMore ?? 0;
    if (owner === opp) amount = intimidated(amount, owner);
    if (amount > 0 && sproutTower(state) && hasType(attackerDef, 'colorless')) amount = Math.max(0, amount - 30);
    if (hasType(def(state.cards, p), 'metal')) amount = Math.max(0, amount - 10 * energyCount(state.cards, p, 'Metal Energy'));
    let damage = unownGuarded(p, barriers(p, armor(p, afterDefender(state.cards, p, amount), owner), owner), owner);
    if (owner === opp && damage > 0 && doubleRainbow()) damage = Math.max(0, damage - 10);
    return (damage >= 30 && passive(p)?.invisibleWall) || magicNumber(p, damage, owner) ? 0 : damage;
  };
  /** Magic Odds, Magic Evens: an attack's final damage of an odd (or even) number of tens, 10 to 180, is prevented (agreed: the final damage). */
  const magicNumber = (p: InPlayPokemon, damage: number, owner: PlayerState) => {
    const magic = passive(p)?.magicNumbers;
    if (!magic || damage <= 0 || damage > 180 || damage % 10 || (damage / 10) % 2 !== (magic === 'odd' ? 1 : 0)) return false;
    log(`${def(state.cards, p).power!.name} prevented the damage to ${pokemonName(state, p)}.`, owner.id);
    return true;
  };
  /** Power Gene: 10 more for each of the attacking player's working Nidoking whose names include the attacker's. */
  const powerGene = () =>
    [me.active, ...me.bench].reduce((n, q) => {
      const gene = q ? passive(q)?.powerGene : undefined;
      return n + (gene && gene.names.some((name) => namesMatch(attackerDef.name, name)) ? gene.amount : 0);
    }, 0);
  /** R Energy: 10 more to the Active Pokémon for each attached to the attacker (its effect not stopped by Miraculous Wind). */
  const rEnergy = () => 10 * energyCount(state.cards, attacker, 'R Energy');
  /** Double Rainbow Energy is attached to the attacker (its effect not stopped by Miraculous Wind). */
  const doubleRainbow = () => attacker.energy.some((e) => !e.provides && !e.windless && lookupCard(state.cards, e.defId).name === 'Double Rainbow Energy');
  /** Energy Grounding: used at most once a turn by each player. */
  let grounded = false;
  /**
   * Energy Grounding: the opponent's attack is Knocking Out `p` (of `owner`), who has another Pokémon with it working; once
   * the attack is over they may move one of `p`'s basic Energy cards to that Pokémon (before the Knock Out discards them).
   */
  const grounding = (p: InPlayPokemon, owner: PlayerState) => {
    if (grounded || owner !== opp || p.damage < def(state.cards, p).hp || owner.groundingTurn === turn) return;
    const lanturn = [owner.active, ...owner.bench].find((q) => q && q !== p && passive(q)?.energyGrounding);
    if (!lanturn || !p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))) return;
    grounded = true;
    const target: Target = owner.active === p ? 'active' : owner.bench.indexOf(p);
    (state.queuedChoices ??= []).push({ player: owner.id, source: 'Energy Grounding', kind: 'energyGrounding', target, to: lanturn.card.uid });
  };
  /**
   * EXP. ALL (EX FireRed & LeafGreen): the attack is Knocking Out `owner`'s Active Pokémon `p`; once it's over they may move one
   * of its basic Energy cards to one of their Pokémon with EXP. ALL attached (agreed: they pick which, before the Knock Out
   * discards it), and that EXP. ALL is discarded.
   */
  const expAllEx = (p: InPlayPokemon, owner: PlayerState) => {
    if (owner !== opp || owner.active !== p || p.damage < def(state.cards, p).hp || p.expAllAsked) return;
    const holders = owner.bench.filter((q): q is InPlayPokemon => !!q && toolOf(state.cards, q)?.name === 'EXP. ALL');
    if (!holders.length || !p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))) return;
    p.expAllAsked = true;
    (state.queuedChoices ??= []).push({ player: owner.id, source: 'EXP. ALL', kind: 'energyGrounding', target: 'active', to: holders[0]!.card.uid, expAll: holders.map((q) => q.card.uid) });
  };
  /**
   * The attack's damage is Knocking Out `owner`'s Pokémon `p`. Curse Powder (on their Active Pokémon): 3 damage counters on the
   * attacker. Golden Wing: once the attack is over, its owner may move up to 2 of its Energy cards (agreed: cards) to their
   * other Pokémon, before the Knock Out discards them (as Energy Grounding).
   */
  const knockedOutEffects = (p: InPlayPokemon, owner: PlayerState) => {
    if (owner !== opp || p.damage < def(state.cards, p).hp || p.koHandled) return;
    p.koHandled = true;
    if (owner.active === p && toolOf(state.cards, p)?.name === 'Curse Powder') {
      attacker.damage += 30;
      log(`Curse Powder: put 3 damage counters on ${attackerDef.name}.`, owner.id);
    }
    // Spiral Swirl (Poliwrath, as its player's Active Pokémon): the attacker is now Confused.
    if (owner.active === p && passive(p)?.spiralSwirl) {
      log('Spiral Swirl:', owner.id);
      afflictBetweenTurns(state, me.id, attacker, 'confused');
    }
    const others = [owner.active, ...owner.bench].filter((q): q is InPlayPokemon => !!q && q !== p);
    const target: Target = owner.active === p ? 'active' : owner.bench.indexOf(p);
    if (passive(p)?.goldenWing && others.length && p.energy.some((e) => !e.provides)) {
      (state.queuedChoices ??= []).push({ player: owner.id, source: 'Golden Wing', kind: 'energyGrounding', target, to: others[0]!.card.uid, expAll: others.map((q) => q.card.uid), goldenWing: 2 });
    }
    // Reactive Recharge: any number of its React Energy cards to its player's other Pokémon.
    const react = reactCount(p, state.cards);
    if (passive(p)?.reactiveRecharge && others.length && react) {
      (state.queuedChoices ??= []).push({ player: owner.id, source: 'Reactive Recharge', kind: 'energyGrounding', target, to: others[0]!.card.uid, expAll: others.map((q) => q.card.uid), goldenWing: react, reactOnly: true });
    }
    // Shadow Curse: its player may put 3 damage counters on one of the attacking player's Pokémon.
    if (passive(p)?.shadowCurse) (state.queuedChoices ??= []).push({ player: owner.id, source: 'Shadow Curse', kind: 'placeCounters', count: 3, active: true, together: true, optional: true });
  };
  /** Shadow Images: one flip per attack, by the attacking player; tails, the attack does no damage to the Pokémon. */
  let shadowImages: boolean | undefined;
  /**
   * Darkness Energy (the EX rules for every set's, agreed with the user): 10 more for each to the Active Pokémon, before
   * Weakness and Resistance, from an attacker that's Darkness or has Dark in its name.
   */
  // Dark Shadow: each basic Darkness Energy card on its player's Darkness Pokémon does the Special card's 10 more too.
  const darkMore = () =>
    (hasType(attackerDef, 'darkness') || attackerDef.name.includes('Dark') ? 10 * energyCount(state.cards, attacker, 'Darkness Energy') : 0) +
    (hasType(attackerDef, 'darkness') && [me.active, ...me.bench].some((q) => q && passive(q)?.darkShadow) ? 10 * attacker.energy.filter((e) => !e.provides && !e.windless && isEnergyCardOf(e, state.cards, 'darkness')).length : 0);
  /** Whether the attack can affect this Pokémon; logs why not. Transparency flips the first time it's asked. */
  const canAffect = (player: PlayerState, p: InPlayPokemon) => {
    if (!immune(p, player) && !transparent(p, player)) return true;
    log(`${pokemonName(state, p)} is protected from the attack.`, player.id);
    return false;
  };
  /** Marks a Pokémon the attack's damage left with no HP (knockedByAttack, for Revenge). */
  const ko = (pokemon: InPlayPokemon) => {
    if (pokemon.damage >= def(state.cards, pokemon).hp) pokemon.knockedByAttack = turn;
  };
  const record = (pokemon: InPlayPokemon) => {
    const effects = (pokemon.effects ??= {});
    if (effects.attackedOn?.turn !== turn) effects.attackedOn = { turn, damage: 0, afflictions: [] };
    return effects.attackedOn;
  };

  /** ctx.hit's damage to the Defending Pokémon, each change to it noted while tracing (traceDamage). */
  const hitDefender = (amount: number, { weakness = true, resistance = true, swift = false, keepWeakness = false }: { weakness?: boolean; resistance?: boolean; swift?: boolean; keepWeakness?: boolean } = {}): number => {
    const defender = opp.active!;
    const defenderDef = def(state.cards, defender);
    if (amount <= 0) return 0;
    damageSteps?.push({ label: '', change: amount });
    // A run's battle rules (Fire Pokémon do double damage…) change the base damage, before everything else,
    // and then its items' bonuses (X Attack, Charcoal…) are added.
    for (const rule of state.rules ?? []) if (rule.kind === 'typeDamage' && hasType(attackerDef, rule.type)) amount = noted(rule.label ?? `${typeName(rule.type)} Pokémon do ${rule.multiplier}× damage`, amount, amount * rule.multiplier);
    amount = noted(attackerDef.power?.name ?? 'Frenzy', amount, amount + frenzy());
    for (const rule of state.rules ?? []) if (rule.kind === 'damageBonus' && rule.player === me.id && (!rule.type || hasType(attackerDef, rule.type))) amount = noted(rule.label ?? 'Battle rule', amount, amount + rule.amount);
    // Swift: nothing on the Defending Pokémon (effects of attacks, Pokémon Powers, Defender) changes its damage.
    if (!swift && shielded()) {
      log(`${defenderDef.name} is protected from the attack.`, opp.id);
      noted('Protected from the attack', amount, 0);
      return 0;
    }
    if (!swift && defender.effects?.shadowImages) {
      shadowImages ??= ctx.flip();
      if (!shadowImages) {
        log(`Shadow Images: the attack did no damage to ${defenderDef.name}.`, opp.id);
        noted('Shadow Images', amount, 0);
        return 0;
      }
    }
    // Pewter City Gym: no Resistance for attacks by Pokémon with Brock in their names.
    const stadium = state.stadium && lookupCard(state.cards, state.stadium.card.defId).name;
    if (stadium === 'Pewter City Gym' && attackerDef.name.includes('Brock')) resistance = false;
    // Magnifier: no Resistance for its Pokémon's attack. Withering Dust, from anywhere in play: none for any Active Pokémon.
    if (attachedCount(state.cards, attacker, 'Magnifier')) resistance = false;
    if (sides.some((side) => [side.active, ...side.bench].some((p) => p && passive(p)?.witheringDust))) resistance = false;
    // Tropical Motion: the attacking player's Active Tropius takes the opponent's Resistance away.
    if (me.active && passive(me.active)?.tropicalMotion) resistance = false;
    // Sunlight: with Lunatone in play, the player's Psychic and Fighting Pokémon ignore Resistance. Disturbance Scales: every one of them.
    const mine = [me.active, ...me.bench];
    if (mine.some((q) => q && passive(q)?.disturbanceScales)) resistance = false;
    if ((hasType(attackerDef, 'psychic') || hasType(attackerDef, 'fighting')) && mine.some((q) => q && passive(q)?.sunlight) && mine.some((q) => q && namesMatch(def(state.cards, q).name, 'Lunatone'))) resistance = false;
    // Holon Energy FF with a basic Fighting Energy card: the attacker's damage isn't affected by Resistance.
    if (holonWith(attacker, state.cards, 'FF', 'fighting')) resistance = false;
    // Ancient Tentacles: the attacking player's Omanyte line and Kabuto line ignore Resistance.
    if ([me.active, ...me.bench].some((q) => q && passive(q)?.ancientTentacles?.some((n) => namesMatch(attackerDef.name, n)))) resistance = false;
    // Cinnabar City Gym, and Weakness Guard: no Weakness.
    // Ancient Tomb: no Weakness, but for Pokémon-ex and Pokémon with an owner in their names.
    const tomb = stadium === 'Ancient Tomb' && !defenderDef.ex && !hasOwner(defenderDef.name);
    // Dragon Veil: no Weakness for the Active Pokémon of a player with one working; Dark Condition: none with Darkness Energy attached.
    const veiled = [opp.active, ...opp.bench].some((q) => q && passive(q)?.dragonVeil);
    const condition = passive(defender)?.noWeaknessWith;
    const conditioned = !!condition && energyPool(defender, state.cards).some((e) => counts(e, condition));
    // Ancient Protection: the Defending player's Omanyte line and Kabuto line have no Weakness. Hydro Barrier: nor their
    // Water Pokémon, while the Rayquaza δ has a Holon Energy card attached.
    const ancientProtected = [opp.active, ...opp.bench].some((q) => q && passive(q)?.ancientProtection?.some((n) => namesMatch(defenderDef.name, n)));
    const hydroBarred = hasType(defenderDef, 'water') && [opp.active, ...opp.bench].some((q) => q && passive(q)?.hydroBarrier && q.energy.some((e) => !e.provides && !e.windless && lookupCard(state.cards, e.defId).name.startsWith('Holon Energy')));
    const weaknessOff = (stadium === 'Cinnabar City Gym' && hasType(attackerDef, 'water') && defenderDef.name.includes('Blaine')) || attachedCount(state.cards, defender, 'Weakness Guard') > 0 || tomb || veiled || conditioned || !!passive(defender)?.noWeakness || ([opp.active, ...opp.bench].some((q) => q && passive(q)?.moonlightVeil) && evolvedFromName(state.cards, defender, 'Eevee')) || ['Protective Orb', 'Bubble Coat'].includes(toolOf(state.cards, defender)?.name ?? '') || (hasType(defenderDef, 'psychic') && [opp.active, ...opp.bench].some((q) => q && passive(q)?.psychicAura)) || holonWith(defender, state.cards, 'FF', 'fire') || ancientProtected || hydroBarred || active(defender.effects?.weaknessOffUntil, turn) || (stadium === "Glacia's Stadium" && hasType(defenderDef, 'water') && !defenderDef.ex) || (stadium === 'Holon Legacy' && isDelta(state.cards, defender));
    // Charm: the attacker's damage is less, before Weakness and Resistance.
    const before = amount;
    amount = noted('Charm', amount, charmed(amount));
    if (amount < before) log(`Charm reduced ${attackerDef.name}'s damage by ${before - amount}.`);
    // Delta Reduction: less damage to it, before Weakness and Resistance. Extra Smoke: 10 less for each of its player's, to a Stage 2 Pokémon-ex.
    const lessBefore = defender.effects?.reduceBefore;
    const smoke = defenderDef.ex && defenderDef.stage === 'stage2' ? 10 * [opp.active, ...opp.bench].filter((q) => q && passive(q)?.extraSmoke).length : 0;
    const before2 = (lessBefore && active(lessBefore.until, turn) ? lessBefore.amount : 0) + smoke;
    if (before2 && amount > 0) {
      amount = noted(smoke && !lessBefore ? 'Extra Smoke' : 'Less damage from an earlier attack', amount, Math.max(0, amount - before2));
      log(`The damage to ${defenderDef.name} was reduced by ${before2}.`, opp.id);
    }
    // Togepi's Snivel: less damage from the Pokémon it was used on, before weakness and resistance.
    const snivel = attacker.effects?.pounce;
    if (snivel?.beforeWeakness && snivel.target === baseUid(defender) && active(snivel.until, turn)) {
      amount = noted('Snivel', amount, Math.max(0, amount - snivel.amount));
      log(`The damage to ${defenderDef.name} was reduced by ${snivel.amount}.`, opp.id);
    }
    // As the damage is done: the attack may have discarded its Darkness Energy first (Dark Fire).
    // Hunch, Blaze: more with little HP left. Vigorous Aura (either Active Pokémon's): more for each Active Pokémon's attack.
    // Pivot Throw: more to the Pokémon that used it, this turn.
    const low = passive(attacker)?.lowHpBoost;
    const aura = [me.active, opp.active].reduce((n, a) => n + (a ? (passive(a)?.vigorousAura ?? 0) : 0), 0);
    const pivot = active(defender.effects?.pivot, turn) ? 10 : 0;
    // Hitmonlee's Stages of Evolution; Solid Rage and Reversal Aura while the attacking player has more Prize cards left.
    const behind = me.prizes.length > opp.prizes.length;
    const rage = behind && toolOf(state.cards, attacker)?.name === 'Solid Rage' ? 20 : 0;
    const reversal = behind ? (passive(attacker)?.reversalAura ?? 0) : 0;
    // Paranoid, Ancient Fang: more while their condition holds. Delta Reactor (each one, agreed): 10 more for a δ Pokémon while a Holon Stadium is in play.
    const more = passive(attacker)?.defendingMore;
    const conditional = more && more.when(attacker, me, state.cards) ? more.more : 0;
    const reactor = stadium?.includes('Holon') && isDelta(state.cards, attacker) ? 10 * [me.active, ...me.bench].filter((q) => q && passive(q)?.deltaReactor).length : 0;
    // Crystal Laser: more on the turn after.
    const laser = attacker.effects?.nextTurnMore?.turn === turn ? attacker.effects.nextTurnMore.amount : 0;
    // Battle Aura (δ Pokémon), Extra Feather (Stage 2 Pokémon-ex): 10 more for each of the attacking player's.
    const allies = [me.active, ...me.bench].reduce((n, q) => {
      const kind = q ? passive(q)?.allyMore : undefined;
      const fits = kind === 'delta' ? isDelta(state.cards, attacker) : kind === 'stage2ex' ? !!attackerDef.ex && attackerDef.stage === 'stage2' : false;
      return n + (fits ? 10 : 0);
    }, 0);
    // Dragon DNA: 30 more with an attack of its Basic Pokémon's.
    const dna = passive(attacker)?.dragonDna && !!attackSource && attackSource === attacker.evolvedFrom[0]?.defId ? 30 : 0;
    // Rainbow Scale: 40 more to a Defending Pokémon weak to a type of Energy attached to it, without a Special Energy card attached.
    const weakTo = defenderDef.weakness ? [defenderDef.weakness.type, ...(defenderDef.moreWeakness ?? [])] : [];
    const scale =
      passive(attacker)?.rainbowScale && !attacker.energy.some((e) => isSpecialEnergy(state.cards, e)) && weakTo.some((t) => energyPool(attacker, state.cards).some((e) => counts(e, t))) ? 40 : 0;
    // Fury Blaze: 50 more while the opponent has 3 or fewer Prize cards left. Anger Point: 40 more with damage counters on it.
    const fury = (passive(attacker)?.furyBlaze && opp.prizes.length <= 3 ? 50 : 0) + (passive(attacker)?.angerPoint && attacker.damage ? 40 : 0);
    // Rivalry: 50 more while the opponent has a Pokémon LV.X in play. Revenge Fang: 40 more with fewer Benched Pokémon than the opponent.
    const rivalry = passive(attacker)?.rivalry && [opp.active, ...opp.bench].some((q) => q && def(state.cards, q).stage === 'levelUp') ? 50 : 0;
    const revenge = passive(attacker)?.revengeFang && me.bench.filter(Boolean).length < opp.bench.filter(Boolean).length ? 40 : 0;
    // Enthusiasm: 60 more for Poliwag, Poliwhirl and Poliwrath while the player has all three in play, with a working Politoed.
    const poli = ['Poliwag', 'Poliwhirl', 'Poliwrath'];
    const team = [me.active, ...me.bench];
    const enthused = poli.some((n) => namesMatch(attackerDef.name, n)) && team.some((q) => q && passive(q)?.enthusiasm) && poli.every((n) => team.some((q) => q && namesMatch(def(state.cards, q).name, n))) ? 60 : 0;
    // Buck's Training: 10 more while it's the player's Supporter in play.
    // Sunny Day: 10 more for Grass and Fire Pokémon. Green Dignity: 10 more for each Grass Pokémon on the Bench while behind on Prize cards. No Guard: 60 more.
    const sunny = (hasType(attackerDef, 'grass') || hasType(attackerDef, 'fire')) && team.some((q) => q && passive(q)?.sunnyDay) ? 10 : 0;
    const dignity = passive(attacker)?.greenDignity && me.prizes.length > opp.prizes.length ? 10 * me.bench.filter((q) => q && hasType(def(state.cards, q), 'grass')).length : 0;
    const noGuard = (passive(attacker)?.noGuard ? 60 : 0) + (passive(attacker)?.revengeSeed && me.grassKnockedOutTurn === turn - 1 ? 60 : 0);
    const buck = me.supporterTurn === turn && me.supporterUid && me.discard.concat(me.hand).some((c) => c.uid === me.supporterUid && lookupCard(state.cards, c.defId).name === "Buck's Training") ? 10 : 0;
    const boost = (low && attackerDef.hp - attacker.damage <= low.hpLeft ? low.more : 0) + aura + pivot + (passive(attacker)?.attackMore ?? 0) + rage + reversal + conditional + reactor + laser + allies + dna + scale + fury + rivalry + revenge + enthused + buck + sunny + dignity + noGuard;
    if (amount > 0 && boost) {
      amount = noted(attackerDef.power?.name ?? 'More damage', amount, amount + boost);
      log(`${boost} more damage.`);
    }
    const dark = darkMore();
    if (amount > 0 && dark) {
      amount = noted('Darkness Energy', amount, amount + dark);
      log(`Darkness Energy: ${dark} more damage.`);
    }
    const r = rEnergy();
    if (amount > 0 && r) {
      amount = noted('R Energy', amount, amount + r);
      log(`R Energy: ${r} more damage.`);
    }
    const gene = powerGene();
    if (amount > 0 && gene) {
      amount = noted('Power Gene', amount, amount + gene);
      log(`Power Gene: ${gene} more damage.`);
    }
    // Power Pinchers (its player's Active Pokémon's) and Dragon Dance: more damage, before Weakness and Resistance.
    const pinchers = me.active ? (passive(me.active)?.powerPinchers ?? 0) : 0;
    if (amount > 0 && pinchers) {
      amount = noted('Power Pinchers', amount, amount + pinchers);
      log(`Power Pinchers: ${pinchers} more damage.`);
    }
    // Dragon Dance, Bay Dance: more to the Defending Pokémon from whichever Pokémon attacks next turn (agreed: never the Bench).
    if (amount > 0 && me.dragonDanceTurn === turn) {
      const more = me.dragonDanceMore ?? 40;
      amount = noted(me.dragonDanceSource ?? 'Dragon Dance', amount, amount + more);
      log(`${me.dragonDanceSource ?? 'Dragon Dance'}: ${more} more damage.`);
    }
    // Overzealous: more while the opponent has a Pokémon-ex in play.
    const zeal = passive(attacker)?.overzealous;
    if (amount > 0 && zeal && [opp.active, ...opp.bench].some((q) => q && def(state.cards, q).ex)) {
      amount = noted(attackerDef.power!.name, amount, amount + zeal);
      log(`${attackerDef.power!.name}: ${zeal} more damage.`);
    }
    // Magnetic Storm: no Resistance for Psychic and Fighting Pokémon's attacks.
    if (stadium === 'Magnetic Storm' && (hasType(attackerDef, 'psychic') || hasType(attackerDef, 'fighting'))) resistance = false;
    // EX Deoxys's Strength Charm: 10 more before Weakness and Resistance (Expedition's adds it after); discarded at the end
    // of the turn its Pokémon attacks.
    const charm = toolOf(state.cards, attacker);
    const charmEarly = charm?.name === 'Strength Charm' && /before applying Weakness/.test((lookupCard(state.cards, charm.tool.card.defId) as { text?: string }).text ?? '');
    if (charmEarly) charm!.tool.until = turn;
    if (amount > 0 && charmEarly) {
      amount = noted('Strength Charm', amount, amount + 10);
      log('Strength Charm: 10 more damage.');
    }
    amount = noted(opp.active ? (def(state.cards, opp.active).power?.name ?? 'Less damage') : 'Less damage', amount, intimidated(amount, opp));
    // Enervating Pollen: Resistance takes off at most 10.
    const rules = { resistance, weakness: !weaknessOff, resistanceLess: stadium === 'Resistance Gym' ? 20 : 0, resistanceCap: enervatingPollen(sides, state.cards) ? 10 : undefined, weaknessIgnore: opp.bench.some((q) => q && passive(q)?.darkHole) ? ('darkness' as const) : undefined, doubleWeakness: stadium === 'Lake Boundary' };
    // Brick Smash (`keepWeakness`): nothing on the Defending Pokémon but its Weakness changes the damage.
    let damage = amount;
    if (weakness && (!swift || keepWeakness)) {
      // Weakness, then Resistance, noted apart.
      const weak = applyWeaknessResistance(amount, typesOf(attackerDef), defenderDef, defender.effects, { ...rules, resistance: false });
      damage = applyWeaknessResistance(amount, typesOf(attackerDef), defenderDef, defender.effects, swift ? { ...rules, resistance: false } : rules);
      noted(`Weakness (${rules.doubleWeakness ? '×2' : weaknessLabel(defenderDef.weakness)})`, amount, weak);
      noted('Resistance', weak, damage);
    }
    // Misty: 20 more each, for a Pokémon with Misty in its name, if the attack does damage after Weakness and Resistance.
    const misty = me.misty?.turn === turn && attackerDef.name.includes('Misty') ? me.misty.count : 0;
    if (damage > 0 && misty) {
      damage = noted('Misty', damage, damage + 20 * misty);
      log(`Misty: ${20 * misty} more damage.`);
    }
    // Strength Charm: 10 more, if the attack damages it after Weakness and Resistance; it's discarded at the end of the turn.
    if (damage > 0 && charm?.name === 'Strength Charm' && !charmEarly) {
      damage = noted('Strength Charm', damage, damage + 10);
      charm.tool.until = turn;
      log('Strength Charm: 10 more damage.');
    }
    // Frog Song: 40 more, if the attack damages it after Weakness and Resistance, while more than 3 Poliwag line Pokémon are in play.
    if (damage > 0 && passive(attacker)?.frogSong && frogs() > 3) {
      damage = noted('Frog Song', damage, damage + 40);
      log('Frog Song: 40 more damage.');
    }
    // Screech: 20 more to it, if the attack damages it after Weakness and Resistance.
    if (damage > 0 && !swift && active(defender.effects?.screech, turn)) {
      damage = noted('Screech', damage, damage + 20);
      log(`Screech: 20 more damage to ${defenderDef.name}.`, opp.id);
    }
    // Sand Eject: more to it on the turn it was set for, if the attack damages it after Weakness and Resistance.
    const exposed = defender.effects?.exposed;
    if (damage > 0 && !swift && exposed?.turn === turn) {
      damage = noted('Sand Eject', damage, damage + exposed.amount);
      log(`${exposed.amount} more damage to ${defenderDef.name}.`, opp.id);
    }
    // Silver Wind: 30 more to it, if the attack damages it after Weakness and Resistance.
    if (damage > 0 && !swift && active(defender.effects?.silverWind, turn)) {
      damage = noted('Silver Wind', damage, damage + 30);
      log(`Silver Wind: 30 more damage to ${defenderDef.name}.`, opp.id);
    }
    if (damage > 0 && vermilionBonus) {
      damage = noted('Vermilion City Gym', damage, damage + 10);
      vermilionBonus = false;
      log('Vermilion City Gym: 10 more damage.');
    }
    // PlusPower adds 10 each, then Defender takes off 20 each (both after weakness and resistance).
    if (damage > 0) {
      damage = noted('PlusPower', damage, damage + 10 * attachedCount(state.cards, attacker, 'PlusPower'));
      damage = noted('Defender', damage, Math.max(0, damage - (swift ? 0 : 20 * attachedCount(state.cards, defender, 'Defender'))));
    }
    // Double Rainbow Energy: 10 less damage from the Pokémon it's attached to, after Weakness and Resistance.
    if (damage > 0 && doubleRainbow()) {
      damage = noted('Double Rainbow Energy', damage, Math.max(0, damage - 10));
      log('Double Rainbow Energy: 10 less damage.');
    }
    // A run's items (X Defend, Leaf Jacket…) take some off too.
    const guard = ruleGuard(state, opp.id, typesOf(defenderDef));
    if (damage > 0 && guard > 0) {
      damage = noted(state.rules?.find((r) => r.kind === 'damageGuard' && r.player === opp.id)?.label ?? 'Battle rule', damage, Math.max(0, damage - guard));
      log(`The damage to ${defenderDef.name} was reduced by ${guard}.`, opp.id);
    }
    // Pounce and Snivel: less damage from the Pokémon they were used on (also after weakness and resistance).
    const pounce = attacker.effects?.pounce;
    if (damage > 0 && pounce && !pounce.beforeWeakness && pounce.target === baseUid(defender) && active(pounce.until, turn)) {
      damage = noted('Pounce', damage, Math.max(0, damage - pounce.amount));
      log(`The damage to ${defenderDef.name} was reduced by ${pounce.amount}.`, opp.id);
    }
    const effects = defender.effects;
    if (!swift) {
      if (damage > 0 && active(effects?.minimize, turn)) {
        damage = noted('Minimize', damage, Math.max(0, damage - 20));
        log(`Minimize reduced the damage to ${defenderDef.name} by 20.`, opp.id);
      }
      // Sprout Tower: Colorless Pokémon's attacks do 30 less, after Weakness and Resistance.
      if (damage > 0 && sproutTower(state) && hasType(attackerDef, 'colorless')) {
        damage = noted('Sprout Tower', damage, Math.max(0, damage - 30));
        log(`Sprout Tower reduced the damage to ${defenderDef.name} by 30.`, opp.id);
      }
      // Metal Energy (the EX rules for every set's, agreed): 10 less for each on a Metal Defending Pokémon, after Weakness and Resistance.
      const metal = hasType(defenderDef, 'metal') ? energyCount(state.cards, defender, 'Metal Energy') : 0;
      if (damage > 0 && metal) {
        damage = noted('Metal Energy', damage, Math.max(0, damage - 10 * metal));
        log(`Metal Energy reduced the damage to ${defenderDef.name} by ${10 * metal}.`, opp.id);
      }
      // Psychic Guard: less from a Stage 2 Evolved Pokémon's attack, after Weakness and Resistance.
      const guard = effects?.stage2Guard;
      if (damage > 0 && guard && active(guard.until, turn) && attackerDef.stage === 'stage2' && attacker.evolvedFrom.length) {
        damage = noted('Less damage from an earlier attack', damage, Math.max(0, damage - guard.amount));
        log(`The damage to ${defenderDef.name} was reduced by ${guard.amount}.`, opp.id);
      }
      // Close Combat: a set amount more, after Weakness and Resistance.
      const more = effects?.takeMore;
      if (damage > 0 && more && active(more.until, turn)) {
        damage = noted('More damage from an earlier attack', damage, damage + more.amount);
        log(`${more.amount} more damage to ${defenderDef.name}.`, opp.id);
      }
      // No Guard: 60 more to it.
      if (damage > 0 && passive(defender)?.noGuard) {
        damage = noted('No Guard', damage, damage + 60);
        log(`No Guard: 60 more damage to ${defenderDef.name}.`, opp.id);
      }
      // Lie Low and Barrier Attack: a set amount less, after Weakness and Resistance.
      const reduced = effects?.reduceDamage;
      if (damage > 0 && reduced && active(reduced.until, turn) && (!reduced.evolvedOnly || attacker.evolvedFrom.length > 0)) {
        damage = noted('Less damage from an earlier attack', damage, Math.max(0, damage - reduced.amount));
        log(`The damage to ${defenderDef.name} was reduced by ${reduced.amount}.`, opp.id);
      }
      // Cold Fat: 40 less while it's Asleep.
      if (damage > 0 && passive(defender)?.coldFat && defender.condition === 'asleep') {
        damage = noted('Cold Fat', damage, Math.max(0, damage - 40));
        log(`Cold Fat reduced the damage to ${defenderDef.name} by 40.`, opp.id);
      }
      // Airy Wall: no damage from an attacker with 2 or fewer Energy cards attached.
      if (damage > 0 && airy(defender)) {
        damage = noted('Airy Wall', damage, 0);
        log(`Airy Wall prevented the damage to ${defenderDef.name}.`, opp.id);
      }
      damage = unownGuarded(defender, damage, opp);
      damage = barriers(defender, armor(defender, damage, opp), opp);
      // Light Screen and Deflector: half the damage, rounded down to the nearest 10, after everything else (like Kabuto Armor).
      if (damage > 0 && active(effects?.lightScreen, turn)) {
        damage = noted('Half damage from an earlier attack', damage, Math.floor(damage / 20) * 10);
        log(`The damage to ${defenderDef.name} was halved.`, opp.id);
      }
      if (damage >= 30 && (passive(defender)?.invisibleWall || active(effects?.pulseGuard, turn))) {
        log(`${passive(defender)?.invisibleWall ? 'Invisible Wall' : 'Pulse Guard'} prevented the damage to ${defenderDef.name}.`, opp.id);
        damage = noted(passive(defender)?.invisibleWall ? 'Invisible Wall' : 'Pulse Guard', damage, 0);
      }
      const upTo = effects?.preventUpTo && active(effects.preventUpTo.until, turn) ? effects.preventUpTo.amount : 0;
      if (active(effects?.preventDamage, turn) || (active(effects?.harden, turn) && damage <= 30) || (damage > 0 && damage <= upTo)) {
        log(`The damage to ${defenderDef.name} was prevented.`, opp.id);
        damage = noted('Prevented by an earlier attack', damage, 0);
      }
      // Slime: the attacking player flips; tails prevents the damage.
      if (damage > 0 && active(effects?.slime, turn) && !flipCoin(state, 'Slime', me.id)) {
        log(`Slime prevented the damage to ${defenderDef.name}.`, opp.id);
        damage = noted('Slime', damage, 0);
      }
      // Dodge: its owner flips; heads prevents the damage.
      if (damage > 0 && active(effects?.dodge, turn) && flipCoin(state, 'Dodge', opp.id)) {
        log(`Dodge prevented the damage to ${defenderDef.name}.`, opp.id);
        damage = noted('Dodge', damage, 0);
      }
      // Reflect Shield: its owner flips; heads prevents the damage and does 20 to the attacker (with Weakness and Resistance, as Fire Wall).
      if (damage > 0 && active(effects?.reflectShield, turn) && flipCoin(state, 'Reflect Shield', opp.id)) {
        const back = applyWeaknessResistance(20, typesOf(defenderDef), attackerDef, attacker.effects);
        attacker.damage += back;
        log(`Reflect Shield prevented the damage to ${defenderDef.name} and did ${back} damage to ${attackerDef.name}.`, opp.id);
        damage = noted('Reflect Shield', damage, 0);
      }
    }
    if (!swift && magicNumber(defender, damage, opp)) damage = noted(defenderDef.power?.name ?? 'Prevented', damage, 0);
    if (damage > capLeft) {
      damage = noted('Charity', damage, capLeft);
      log(`Charity: the damage to ${defenderDef.name} was reduced to ${damage}.`);
    }
    damage = fortitude(defender, opp, damage);
    if (damage === 0) return 0;
    capLeft -= damage;
    defender.damage += damage;
    record(defender).damage += damage;
    ko(defender);
    log(`${defenderDef.name} took ${damage} damage.`, opp.id);
    shard(defender, opp);
    grounding(defender, opp);
    expAllEx(defender, opp);
    knockedOutEffects(defender, opp);
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
      const back = applyWeaknessResistance(2 * damage, typesOf(defenderDef), attackerDef, attacker.effects);
      attacker.damage += back;
      log(`Crosscounter: ${defenderDef.name} did ${back} damage to ${attackerDef.name}.`, opp.id);
    }
    // Fire Wall: 10 damage back to the attacker, with Weakness and Resistance, even if this Knocks it Out.
    if (active(effects?.fireWall, turn)) {
      const back = applyWeaknessResistance(10, typesOf(defenderDef), attackerDef, attacker.effects);
      attacker.damage += back;
      log(`Fire Wall: ${defenderDef.name} did ${back} damage to ${attackerDef.name}.`, opp.id);
    }
    // Spike Armor: 4 damage counters on the attacker, even if this Knocks it Out.
    if (active(effects?.spikeArmor, turn)) {
      attacker.damage += 40;
      log(`Spike Armor put 4 damage counters on ${attackerDef.name}.`, opp.id);
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
      if (!conditionFree(attacker, state.cards, passive(attacker))) attacker.poison = Math.max(attacker.poison ?? 0, 10);
      for (const p of me.bench) if (p) p.damage += 10;
    }
    if (defender.damage >= defenderDef.hp && active(effects?.destinyBond, turn)) {
      attacker.damage = Math.max(attacker.damage, attackerDef.hp);
      log(`Destiny Bond: ${attackerDef.name} is Knocked Out too.`, opp.id);
    }
    return damage;
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
    hit(amount, options) {
      const was = hitting;
      hitting = true;
      try {
        return hitDefender(amount, options);
      } finally {
        hitting = was;
      }
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
        ko(p);
        shard(p, player);
        grounding(p, player);
        if (player === opp) passive(p)?.onAttackDamage?.(ctx, p);
        benchGuard(player, p);
      }
    },
    inflict(affliction) {
      const defender = opp.active!;
      const name = pokemonName(state, defender);
      if (untouchable()) return;
      if (conditionProof(def(state.cards, defender)) || conditionFree(defender, state.cards, passive(defender)) || conditionBarred(passive(defender), affliction, defender) || (defender.effects?.flashTouch && affliction !== 'burned') || active(defender.effects?.conditionProof, turn)) return log(`${name} can't be affected by Special Conditions.`, opp.id);
      if ((affliction === 'poisoned' || affliction === 'toxic') && passive(defender)?.noPoison) return log(`${name} can't be Poisoned.`, opp.id);
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
      // Mirror Coat: Poisoned or Burned by the attack, it makes the attacker the same.
      if (affliction !== 'burned' && affliction !== 'poisoned' && affliction !== 'toxic') return;
      if (!passive(defender)?.mirrorCoat || me.active !== attacker) return;
      if (conditionProof(attackerDef) || conditionFree(attacker, state.cards, passive(attacker)) || (affliction !== 'burned' && passive(attacker)?.noPoison)) return;
      if (affliction === 'burned') attacker.burned = true;
      else attacker.poison = Math.max(attacker.poison ?? 0, affliction === 'toxic' ? 20 : 10);
      log(`Mirror Coat: ${attackerDef.name} is now ${affliction === 'burned' ? 'Burned' : 'Poisoned'}.`);
    },
    damageBenched(player, slot, amount, { weakness = false } = {}) {
      const benched = player.bench[slot];
      if (!benched || amount <= 0 || !benchCanTake(player, benched) || !canAffect(player, benched)) return;
      const weakened = weakness ? applyWeaknessResistance(amount, typesOf(attackerDef), def(state.cards, benched), benched.effects) : amount;
      const damage = fortitude(benched, player, benchedDamage(benched, weakened, player));
      if (damage === 0) return log(`The damage to ${pokemonName(state, benched)} was prevented.`, player.id);
      benched.damage += damage;
      ko(benched);
      log(`${pokemonName(state, benched)} took ${damage} damage.`, player.id);
      shard(benched, player);
      grounding(benched, player);
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
      if (conditionFree(attacker, state.cards, passive(attacker)) || conditionBarred(passive(attacker), 'confused', attacker) || attacker.effects?.flashTouch) return log(`${attackerDef.name} can't be affected by Special Conditions.`);
      attacker.condition = 'confused';
      log(`${attackerDef.name} is now Confused.`);
    },
    sleepSelf() {
      if (conditionFree(attacker, state.cards, passive(attacker)) || conditionBarred(passive(attacker), 'asleep', attacker) || attacker.effects?.flashTouch) return log(`${attackerDef.name} can't be affected by Special Conditions.`);
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
    attackName,
    attackSource,
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
