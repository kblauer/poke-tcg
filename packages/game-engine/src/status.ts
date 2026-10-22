// Small state helpers shared by the reducer and attack effects (no imports of engine values,
// so effect modules can use them without import cycles).
import { lookupCard, type CardLibrary, type PokemonCardDef } from './cards.js';
import type { CardInstance, GameState, InPlayPokemon, PlayerId } from './engine.js';
import { nextRandom } from './rng.js';

export const LOG_SIZE = 100;

/** A line in the game log. `player` is whose Pokémon or action it's about, if anyone's. */
export interface LogEntry {
  text: string;
  player: PlayerId | null;
  /** Running number across the whole game (the log itself is trimmed), so clients can spot new entries. Missing in older games. */
  n?: number;
  /** Set on coin flips, for the UI's coin animation. */
  coin?: { reason: string; heads: boolean };
}

export function addLog(state: GameState, text: string, player: PlayerId | null = null, coin?: LogEntry['coin']) {
  const log = (state.log ??= []);
  log.push({ text, player, n: (log.at(-1)?.n ?? 0) + 1, ...(coin && { coin }) });
  if (log.length > LOG_SIZE) log.splice(0, log.length - LOG_SIZE);
}

/** Flips a coin with the game's RNG and logs the result. True = heads. */
export function flipCoin(state: GameState, reason: string, player: PlayerId | null = null): boolean {
  const [r, next] = nextRandom(state.rngState);
  state.rngState = next;
  // A battle rule (a run's item) can make the player's next flips heads.
  const lucky = player === null ? undefined : state.rules?.find((rule) => rule.kind === 'luckyFlips' && rule.player === player && rule.flips > 0);
  if (lucky?.kind === 'luckyFlips') lucky.flips -= 1;
  const heads = !!lucky || r < 0.5;
  addLog(state, `${reason}: ${heads ? 'heads' : 'tails'}.`, player, { reason, heads });
  return heads;
}

/** The Pokémon's name for the log; a face-down card (Secret Plan) stays secret. */
export const pokemonName = (state: GameState, pokemon: InPlayPokemon) => (pokemon.faceDown ? 'Face-down card' : lookupCard(state.cards, pokemon.card.defId).name);

/** Identifies a Pokémon in play across evolutions: the uid of its bottom card (Tail Wag, Pounce). */
export const baseUid = (pokemon: InPlayPokemon) => (pokemon.evolvedFrom[0] ?? pokemon.card).uid;

/** The card id whose attack and power effects apply: the copied card while Ditto is Transformed. */
export const effectId = (pokemon: InPlayPokemon) => pokemon.transformed ?? pokemon.card.defId;

/**
 * Whether the Pokémon has any Special Condition, Poisoned and Burned included. Pokémon Powers stop with any of them, also
 * the older ones printed "Asleep, Confused, or Paralyzed" (agreed with the user).
 */
export const hasSpecialCondition = (pokemon: InPlayPokemon) => !!(pokemon.condition || pokemon.poison || pokemon.burned);

/** The label of the Pokémon's Special Condition for messages: its Asleep/Confused/Paralyzed one first. */
export const specialConditionLabel = (pokemon: InPlayPokemon) =>
  pokemon.condition ? ({ asleep: 'Asleep', confused: 'Confused', paralyzed: 'Paralyzed' } as const)[pokemon.condition] : pokemon.burned ? 'Burned' : 'Poisoned';

/**
 * A card put face down onto the Bench by Lt. Surge's Secret Plan: a Basic Pokémon with no attacks, which is turned face
 * up (revealFaceDown) before anything could damage it, so its HP never matter.
 */
export const FACE_DOWN: PokemonCardDef = {
  id: 'face-down',
  kind: 'pokemon',
  name: 'Face-down card',
  imageUrl: null,
  type: 'colorless',
  hp: 990,
  stage: 'basic',
  evolvesFrom: null,
  attacks: [],
  retreatCost: 0,
};

/**
 * The card a Pokémon in play counts as. Usually its own; a Transformed Ditto is the Defending Pokémon's
 * card (type, HP, Weakness, Resistance, retreat cost, attacks and power) but keeps its name and stage,
 * and Transform when the copied card has no power. A face-down card (Secret Plan) is FACE_DOWN. Brock's Ninetales
 * with an Evolution card attached by Shapeshift is that card, keeping its own power. Koga's Ditto after Giant Growth
 * has 80 HP; Sabrina's Gastly's Gaseous Form adds 10 HP per Psychic Energy card (it works whatever its condition;
 * Stare stops it here, Toxic Gas and Goop Gas Attack don't, as this sees no other Pokémon). A submerged Lanturn is Water,
 * and Rocket's Hideout gives a Pokémon with Dark in its name 20 more HP. Kecleon's Energy Variation makes it every type of
 * basic Energy card attached (`types`), and Low Pressure System gives Grass and Lightning Pokémon 10 more HP.
 */
export function inPlayDef(cards: CardLibrary, pokemon: InPlayPokemon): PokemonCardDef {
  if (pokemon.faceDown) return FACE_DOWN;
  const own = lookupCard(cards, pokemon.card.defId) as PokemonCardDef;
  let d: PokemonCardDef = own;
  if (pokemon.transformed) {
    const copy = lookupCard(cards, pokemon.transformed) as PokemonCardDef;
    d = { ...copy, name: own.name, stage: own.stage, evolvesFrom: own.evolvesFrom, evolvesFromBasic: own.evolvesFromBasic, power: copy.power ?? own.power };
  } else if (shapeshiftCard(pokemon)) {
    d = { ...(lookupCard(cards, shapeshiftCard(pokemon)!.defId) as PokemonCardDef), power: own.power };
  } else if (pokemon.shiftedType) d = { ...own, type: pokemon.shiftedType, types: undefined };
  // Crystal Type: the type of the basic Energy card attached from the hand, until the end of the turn.
  if (pokemon.crystalType) d = { ...d, type: pokemon.crystalType, types: undefined };
  // Submerge: Lanturn is a Water Pokémon until the end of the turn.
  if (pokemon.submerged !== undefined) d = { ...d, type: 'water', types: undefined };
  // Crystal Shard: Colorless while it's attached.
  if (pokemon.attached?.some((a) => a.tool && lookupCard(cards, a.card.defId).name === 'Crystal Shard')) d = { ...d, type: 'colorless', types: undefined };
  // Energy Variation (a Poké-Body): every type of basic Energy card attached, while it works (refreshHideout).
  const varied = pokemon.variedTypes;
  if (varied?.length) {
    d = { ...d, type: varied[0]! };
    if (varied.length > 1) d.types = varied;
    else delete d.types;
  }
  if (pokemon.effects?.giantGrowth) d = { ...d, hp: 80 };
  // Sunbeam: Lunatone's HP is now 80 while its player has a Solrock with it working.
  if (pokemon.hpSet) d = { ...d, hp: pokemon.hpSet };
  // Low Pressure System: 10 more HP for a Grass or Lightning Pokémon.
  if (pokemon.lowPressure) d = { ...d, hp: d.hp + 10 };
  // Rocket's Hideout: 20 more HP for a Pokémon with Dark in its name.
  if (pokemon.hideout) d = { ...d, hp: d.hp + 20 };
  if (own.power?.name === 'Gaseous Form' && pokemon.powerOffUntil === undefined) {
    const psychic = pokemon.energy.filter((e) => {
      const ed = !e.provides && lookupCard(cards, e.defId);
      return ed && ed.kind === 'energy' && (!!ed.anyType || (ed.energyType === 'psychic' && ed.basic !== false));
    }).length;
    if (psychic) d = { ...d, hp: d.hp + 10 * psychic };
  }
  return d;
}

/** The Evolution card Shapeshift attached to Brock's Ninetales, if any. */
export const shapeshiftCard = (pokemon: InPlayPokemon) => pokemon.attached?.find((a) => a.shapeshift)?.card;

/**
 * Turns a face-down card (Secret Plan) of `owner` face up: if it isn't a Basic Pokémon card, it's discarded with every
 * card attached. Returns whether it's still in play.
 */
export function revealFaceDown(state: GameState, owner: PlayerId, pokemon: InPlayPokemon): boolean {
  if (!pokemon.faceDown) return true;
  delete pokemon.faceDown;
  const player = state.players[owner]!;
  const def = lookupCard(state.cards, pokemon.card.defId);
  addLog(state, `The face-down card is ${def.name}.`, owner);
  if (def.kind === 'pokemon' && def.stage === 'basic' && !def.trainerText) return true;
  player.discard.push(pokemon.card, ...pokemon.energy.map(({ provides: _, ...card }) => card), ...(pokemon.attached ?? []).map((a) => a.card));
  if (player.active === pokemon) player.active = null;
  else player.bench = player.bench.map((p) => (p === pokemon ? null : p));
  addLog(state, `It isn't a Basic Pokémon, so it was discarded with every card attached.`, owner);
  return false;
}

/** Brock's Protection is attached: the opponent's attacks and Trainer cards can't remove its Energy cards. */
export const energyProtected = (cards: CardLibrary, pokemon: InPlayPokemon) =>
  (pokemon.attached ?? []).some((a) => lookupCard(cards, a.card.defId).name === "Brock's Protection");

/** Viridian City Gym: a Pokémon with Giovanni in its name that just evolved has 2 damage counters removed (or 1). */
export function evolvedHook(state: GameState, owner: PlayerId, pokemon: InPlayPokemon) {
  const stadium = state.stadium?.card;
  if (!stadium || lookupCard(state.cards, stadium.defId).name !== 'Viridian City Gym') return;
  if (!pokemonName(state, pokemon).includes('Giovanni') || pokemon.damage < 10) return;
  const healed = Math.min(20, pokemon.damage);
  pokemon.damage -= healed;
  addLog(state, `Viridian City Gym: removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(state, pokemon)}.`, owner);
}

/**
 * The first empty Bench slot a Pokémon can be put into, or -1 when the Bench is full: 5 Pokémon, or 4 while Narrow Gym
 * is the Stadium in play (`stadium`).
 */
export function openBenchSlot(bench: readonly (InPlayPokemon | null)[], cards: CardLibrary, stadium?: CardInstance | null): number {
  return benchRoom(bench, cards, stadium) > 0 ? bench.indexOf(null) : -1;
}

/** How many more Pokémon the Bench can hold (see openBenchSlot). */
export function benchRoom(bench: readonly (InPlayPokemon | null)[], cards: CardLibrary, stadium?: CardInstance | null): number {
  const limit = stadium && lookupCard(cards, stadium.defId).name === 'Narrow Gym' ? 4 : bench.length;
  return Math.max(0, limit - bench.filter(Boolean).length);
}

/**
 * Benching or evolving removes Special Conditions (Burned and Poisoned included) and the effects of attacks, except the
 * ones that last while it stays in play (Leek Slap, Hyper Needle).
 */
export function clearOnLeavingActive(pokemon: InPlayPokemon) {
  // Ion Coating ends when the Active Pokémon leaves the Active spot.
  for (const e of pokemon.energy) if (e.converted?.activeOnly) delete e.converted;
  pokemon.condition = null;
  pokemon.poison = 0;
  pokemon.burned = false;
  delete pokemon.paralyzedTurn;
  const { leekSlapUsed, usedOnce } = pokemon.effects ?? {};
  pokemon.effects = { ...(leekSlapUsed && { leekSlapUsed }), ...(usedOnce && { usedOnce }) };
}
