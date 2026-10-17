// Pokémon Powers: legality, the questions a power asks, and the context power effects run with.
// Card-specific behaviour lives in effects/ (POWERS), next to the attack effects.
import type { AttackContext } from './attacks.js';
import { lookupCard, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { powerEffect } from './effects/index.js';
import { conditionLabel, type CardInstance, type GameState, type InPlayPokemon, type PlayerState, type Target } from './engine.js';
import { addLog, effectId, inPlayDef } from './status.js';

/** Answers to a power's questions. Each question names the field it fills. */
export interface PowerChoices {
  /** One of your Pokémon to take something from (Damage Swap, Energy Trans). */
  from?: Target;
  /** One of your Pokémon to give something to. */
  to?: Target;
  /** A card in your hand (Rain Dance). */
  cardUid?: string;
  /** One of the opponent's Pokémon to take something from (Curse). */
  oppFrom?: Target;
  /** One of the opponent's Pokémon to give something to. */
  oppTo?: Target;
  /** An Energy card attached to `from` (Energy Trans). */
  energyUid?: string;
  /** A type (Buzzap). */
  type?: EnergyType;
}

/** A question a power asks before it's used. */
export type PowerChoiceSpec = { prompt: string } & (
  | { kind: 'ownPokemon'; field: 'from' | 'to'; options: Target[] }
  | { kind: 'handCard'; field: 'cardUid'; options: CardInstance[] }
  | { kind: 'attachedEnergy'; field: 'energyUid'; options: CardInstance[] }
  | { kind: 'type'; field: 'type'; options: EnergyType[] }
  | { kind: 'oppPokemon'; field: 'oppFrom' | 'oppTo'; options: Target[] }
);

/** What a power can see before it's used. View-safe: the UI builds it from a PlayerView. */
export interface PowerSituation {
  me: Pick<PlayerState, 'active' | 'bench' | 'hand'>;
  opp: Pick<PlayerState, 'active' | 'bench'>;
  /** The Pokémon whose power it is. */
  source: Target;
  cards: CardLibrary;
  turn: number;
}

/** Card-specific power behaviour. */
export interface PowerEffect {
  /** Why the power can't be used now (beyond Special Conditions). */
  blocked?: (s: PowerSituation) => string | null;
  choices?: (s: PowerSituation, c: PowerChoices) => PowerChoiceSpec[];
  /** Using the power. Missing for powers that only react to something (Strikes Back). */
  use?: (ctx: PowerContext) => void;
  /** Called when an opponent's attack damages this Pokémon (Strikes Back). */
  onAttackDamage?: (ctx: AttackContext, damaged: InPlayPokemon) => void;
  /** Usable once during each of its owner's turns (Step In, Curse). */
  oncePerTurn?: boolean;
  /** Stops working only while Asleep, not Confused or Paralyzed (Transparency). */
  stopsOnlyWhileAsleep?: boolean;
  /** Toxic Gas: every other power is ignored. */
  toxicGas?: boolean;
  /** Prehistoric Power: no Evolution cards can be played. */
  blocksEvolution?: boolean;
  /** Transform: as the active, Ditto is a copy of the Defending Pokémon (refreshTransforms). */
  transform?: boolean;
  /** Transparency: a flip whenever an attack does anything to it; heads prevents all of it. */
  transparency?: boolean;
  /** Kabuto Armor: attack damage to it is halved, rounded down to the nearest 10. */
  halvesDamage?: boolean;
  /** Clairvoyance: the opponent plays with their hand face up. */
  revealsHand?: boolean;
}

export interface PowerContext {
  state: GameState;
  me: PlayerState;
  opp: PlayerState;
  source: InPlayPokemon;
  sourceTarget: Target;
  choices: PowerChoices;
  log: (text: string) => void;
}

/** The player's Pokémon at a target, or null. */
export const pokemonAt = (me: Pick<PlayerState, 'active' | 'bench'>, target: Target): InPlayPokemon | null =>
  (target === 'active' ? me.active : me.bench[target]) ?? null;

/** Targets of the player's Pokémon in play, active first. */
export const ownTargets = (me: Pick<PlayerState, 'active' | 'bench'>): Target[] => [
  ...(me.active ? (['active'] as Target[]) : []),
  ...me.bench.flatMap((p, i) => (p ? [i] : [])),
];

/** The power printed on a Pokémon in play (or copied by Ditto), if any. */
export function powerOf(pokemon: InPlayPokemon, cards: CardLibrary) {
  return inPlayDef(cards, pokemon).power ?? null;
}

type Sides = Pick<PlayerState, 'active' | 'bench'>[];
const allInPlay = (sides: Sides) => sides.flatMap((s) => [s.active, ...s.bench]).filter((p): p is InPlayPokemon => !!p);

/** A Muk's Toxic Gas is working, so every other power is ignored. Copies don't count: Toxic Gas stops Ditto's Transform. */
export const toxicGas = (sides: Sides) => allInPlay(sides).some((p) => powerEffect(p.card.defId)?.toxicGas && !p.condition);

/**
 * Whether the Pokémon's power is working: it has one, isn't Asleep, Confused or Paralyzed (only
 * Asleep, for Transparency), and Toxic Gas isn't ignoring it.
 */
export function powerActive(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): boolean {
  if (!inPlayDef(cards, pokemon).power) return false;
  const effect = powerEffect(effectId(pokemon));
  if (effect?.stopsOnlyWhileAsleep ? pokemon.condition === 'asleep' : pokemon.condition) return false;
  return !!effect?.toxicGas || !toxicGas(sides);
}

/** Why no Evolution cards can be played (Prehistoric Power), or null. */
export function evolutionBlocked(sides: Sides, cards: CardLibrary): string | null {
  const blocker = allInPlay(sides).find((p) => powerEffect(effectId(p))?.blocksEvolution && powerActive(p, cards, sides));
  return blocker ? `${powerOf(blocker, cards)!.name}: no Evolution cards can be played` : null;
}

/** Whether a working power of `viewer`'s Pokémon shows them the opponent's hand (Clairvoyance). */
export const seesOpponentHand = (viewer: Pick<PlayerState, 'active' | 'bench'>, sides: Sides, cards: CardLibrary) =>
  allInPlay([viewer]).some((p) => powerEffect(effectId(p))?.revealsHand && powerActive(p, cards, sides));

/**
 * Ditto's Transform: an active Ditto that isn't Asleep, Confused or Paralyzed, with no Toxic Gas,
 * is a copy of the Defending Pokémon (not of a Trainer played as a Pokémon, or another Ditto).
 * Run after every change to the board, so `transformed` is always current.
 */
export function refreshTransforms(state: GameState) {
  const [a, b] = state.playerOrder.map((id) => state.players[id]!) as [PlayerState, PlayerState];
  const gas = toxicGas([a, b]);
  for (const [player, opponent] of [[a, b], [b, a]] as const) {
    for (const p of player.bench) if (p) delete p.transformed;
    const ditto = player.active;
    if (!ditto) continue;
    const defender = opponent.active;
    const copy = defender && lookupCard(state.cards, defender.card.defId);
    const works = powerEffect(ditto.card.defId)?.transform && !ditto.condition && !gas;
    if (works && copy?.kind === 'pokemon' && !copy.trainerText && !powerEffect(copy.id)?.transform) ditto.transformed = copy.id;
    else delete ditto.transformed;
  }
}

/** Why the Pokémon's power can't be used now, or null if it can (given the right choices). View-safe. */
export function powerError(s: PowerSituation): string | null {
  const source = pokemonAt(s.me, s.source);
  if (!source) return 'No Pokémon there';
  const def = inPlayDef(s.cards, source);
  const effect = powerEffect(effectId(source));
  if (!def.power || !effect?.use) return `${def.name} has no power to use`;
  // Powers that are used all stop working while their Pokémon is Asleep, Confused or Paralyzed.
  if (source.condition) return `${def.name} is ${conditionLabel(source.condition)} and can't use ${def.power.name}`;
  if (toxicGas([s.me, s.opp])) return `Toxic Gas: ${def.power.name} can't be used`;
  const blocked = effect.blocked?.(s);
  if (blocked) return blocked;
  return effect.oncePerTurn && source.powerUsedTurn === s.turn ? `${def.name} has already used ${def.power.name} this turn` : null;
}

function choiceSpecs(s: PowerSituation, c: PowerChoices): PowerChoiceSpec[] {
  const source = pokemonAt(s.me, s.source)!;
  return powerEffect(effectId(source))?.choices?.(s, c) ?? [];
}

/** The answer when there's nothing to decide; undefined if the player must choose. */
function autoAnswer(spec: PowerChoiceSpec): PowerChoices[keyof PowerChoices] | undefined {
  switch (spec.kind) {
    case 'handCard':
    case 'attachedEnergy':
      // Identical cards (e.g. two Water Energy) make no difference.
      return new Set(spec.options.map((e) => e.defId)).size === 1 && !spec.options.some((e) => e.provides) ? spec.options[0]!.uid : undefined;
    case 'type':
      return undefined;
    default:
      return spec.options.length === 1 ? spec.options[0] : undefined;
  }
}

function validAnswer(spec: PowerChoiceSpec, value: unknown): boolean {
  if (spec.kind === 'handCard' || spec.kind === 'attachedEnergy') return spec.options.some((e) => e.uid === value);
  return (spec.options as unknown[]).includes(value);
}

/** Fills in answers that need no decision and checks the given ones (see resolveChoices for attacks). */
export function resolvePowerChoices(
  s: PowerSituation,
  given: PowerChoices,
): { choices: PowerChoices } | { error: string; need?: PowerChoiceSpec } {
  const c: PowerChoices = { ...given };
  for (let guard = 0; guard < 10; guard++) {
    const specs = choiceSpecs(s, c);
    for (const spec of specs) {
      const value = c[spec.field];
      if (value !== undefined && !validAnswer(spec, value)) return { error: `Invalid choice: ${spec.prompt.toLowerCase()}` };
    }
    const open = specs.find((spec) => c[spec.field] === undefined);
    if (!open) return { choices: c };
    if (open.options.length === 0) return { error: `${open.prompt}: nothing to choose` };
    const auto = autoAnswer(open);
    if (auto === undefined) return { error: open.prompt, need: open };
    (c as Record<string, unknown>)[open.field] = auto;
  }
  return { error: 'Too many choices' };
}

/**
 * Whether the power puts this card from the hand into play (Rain Dance). The UI uses it to play a
 * dropped hand card through a power; powers that don't take a hand card (Energy Burn) never match.
 */
export function powerTakesHandCard(s: PowerSituation, cardUid: string): boolean {
  return choiceSpecs(s, {}).some((spec) => spec.kind === 'handCard' && spec.options.some((c) => c.uid === cardUid));
}

/** The next question the player has to answer for this power, or null when it's ready to use. */
export function nextPowerChoice(s: PowerSituation, given: PowerChoices): PowerChoiceSpec | null {
  const result = resolvePowerChoices(s, given);
  return 'need' in result ? (result.need ?? null) : null;
}

/** Uses the power of the Pokémon at `source`. Mutates `state`; returns an error instead if not allowed. */
export function usePower(state: GameState, me: PlayerState, opp: PlayerState, sourceTarget: Target, given: PowerChoices): string | null {
  const situation: PowerSituation = { me, opp, source: sourceTarget, cards: state.cards, turn: state.turn };
  const error = powerError(situation);
  if (error) return error;
  const resolved = resolvePowerChoices(situation, given);
  if ('error' in resolved) return resolved.error;
  const source = pokemonAt(me, sourceTarget)!;
  const def = inPlayDef(state.cards, source);
  const effect = powerEffect(effectId(source))!;
  addLog(state, `${def.name} used ${def.power!.name}.`, me.id);
  if (effect.oncePerTurn) source.powerUsedTurn = state.turn;
  effect.use!({
    state,
    me,
    opp,
    source,
    sourceTarget,
    choices: resolved.choices,
    log: (text) => addLog(state, text, me.id),
  });
  return null;
}
