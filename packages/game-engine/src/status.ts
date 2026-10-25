// Small state helpers shared by the reducer and attack effects (no imports of engine values,
// so effect modules can use them without import cycles).
import { lookupCard, namesMatch, type CardLibrary, type PokemonCardDef } from './cards.js';
import type { CardInstance, GameState, InPlayPokemon, PlayerId, PlayerState } from './engine.js';
import { nextRandom } from './rng.js';
import { powerEffect } from './effects/index.js';

export const LOG_SIZE = 100;

/** A line in the game log. `player` is whose Pokémon or action it's about, if anyone's. */
export interface LogEntry {
  text: string;
  player: PlayerId | null;
  /** Running number across the whole game (the log itself is trimmed), so clients can spot new entries. Missing in older games. */
  n?: number;
  /** Set on coin flips, for the UI's coin animation. */
  coin?: { reason: string; heads: boolean };
  /**
   * Set when an attached Pokémon Tool works by itself (a Berry between turns), for the UI's animation over its Pokémon:
   * the Pokémon (its card's uid), the Tool's name, and the damage it healed (none: it cured Special Conditions).
   */
  tool?: { uid: string; name: string; heal?: number };
}

export function addLog(state: GameState, text: string, player: PlayerId | null = null, coin?: LogEntry['coin']) {
  const log = (state.log ??= []);
  log.push({ text, player, n: (log.at(-1)?.n ?? 0) + 1, ...(coin && { coin }) });
  if (log.length > LOG_SIZE) log.splice(0, log.length - LOG_SIZE);
}

/** Logs a Pokémon Tool working by itself (LogEntry's `tool`). */
export function logTool(state: GameState, text: string, player: PlayerId, tool: NonNullable<LogEntry['tool']>) {
  addLog(state, text, player);
  state.log!.at(-1)!.tool = tool;
}

/** Flips a coin with the game's RNG and logs the result. True = heads. */
export function flipCoin(state: GameState, reason: string, player: PlayerId | null = null): boolean {
  const [r, next] = nextRandom(state.rngState);
  state.rngState = next;
  // A battle rule (a run's item) can make the player's next flips heads.
  const lucky = player === null ? undefined : state.rules?.find((rule) => rule.kind === 'luckyFlips' && rule.player === player && rule.flips > 0);
  if (lucky?.kind === 'luckyFlips') lucky.flips -= 1;
  // Hidden Power: every coin the player flips is tails for a turn.
  const tails = player !== null && (state.players[player]?.tailsUntil ?? 0) >= state.turn;
  const heads = !tails && (!!lucky || r < 0.5);
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

/** Removes every Special Condition from the Pokémon, Poisoned and Burned included (Full Heal, Rest, Lum Berry…). Doesn't log. */
export function clearSpecialConditions(pokemon: InPlayPokemon) {
  pokemon.condition = null;
  pokemon.poison = 0;
  pokemon.burned = false;
  delete pokemon.burnDamage;
  delete pokemon.paralyzedTurn;
}

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
/** The Pokémon's top card is a Pokémon LV.X. */
const levelledUp = (cards: CardLibrary, pokemon: InPlayPokemon) => {
  const top = lookupCard(cards, pokemon.card.defId);
  return top.kind === 'pokemon' && top.stage === 'levelUp';
};

/**
 * Whether an effect that removes "the highest Stage Evolution card" can reach the Pokémon (Flash Cannon, Devo Flash, Pull
 * Down…): an Evolution card is on it, under a Pokémon LV.X's card or not (agreed: Dialga LV.X, on a Basic Pokémon, has none).
 */
export function devolvable(cards: CardLibrary, pokemon: InPlayPokemon): boolean {
  return pokemon.evolvedFrom.length > (levelledUp(cards, pokemon) ? 1 : 0);
}

/**
 * Removes the Pokémon's highest Stage Evolution card and returns it, for the effect to put where it says. A Pokémon LV.X's card
 * on it is discarded with it (agreed). An effect that removes "the top card" (Retro Energy) takes the LV.X card itself instead.
 */
export function removeTopEvolution(state: GameState, owner: PlayerState, pokemon: InPlayPokemon): CardInstance {
  if (levelledUp(state.cards, pokemon)) {
    const lvx = pokemon.card;
    pokemon.card = pokemon.evolvedFrom.pop()!;
    owner.discard.push(lvx);
    addLog(state, `${lookupCard(state.cards, lvx.defId).name} LV.X was discarded with the card under it.`, owner.id);
  }
  const top = pokemon.card;
  pokemon.card = pokemon.evolvedFrom.pop()!;
  return top;
}

/** A card under the Pokémon has this name, whatever its case ("if Clefairy is evolved from Cleffa", "if Mantyke is anywhere under Mantine"). */
export function evolvedFromName(cards: CardLibrary, pokemon: InPlayPokemon, name: string): boolean {
  const key = name.toLowerCase();
  return pokemon.evolvedFrom.some((c) => {
    const d = lookupCard(cards, c.defId);
    return d.kind === 'pokemon' && d.name.toLowerCase() === key;
  });
}

/** The side has Pokémon with each of these names in play (the lake trio's Poké-Bodies). */
export const lakeTrio = (cards: CardLibrary, side: Pick<PlayerState, 'active' | 'bench'>, names: string[]) =>
  names.every((n) => [side.active, ...side.bench].some((p) => p && namesMatch(inPlayDef(cards, p).name, n)));

/** A Pokémon LV.X's previous level: the card it was put onto (null for any other Pokémon). */
export function previousLevel(cards: CardLibrary, pokemon: InPlayPokemon): PokemonCardDef | null {
  const top = lookupCard(cards, pokemon.card.defId);
  const under = pokemon.evolvedFrom.at(-1);
  if (top.kind !== 'pokemon' || top.stage !== 'levelUp' || !under) return null;
  const d = lookupCard(cards, under.defId);
  return d.kind === 'pokemon' ? d : null;
}

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
  // Type Change: the Defending Pokémon's types, until the end of the turn.
  if (pokemon.typesCopied?.length) d = { ...d, type: pokemon.typesCopied[0]!, types: pokemon.typesCopied.length > 1 ? pokemon.typesCopied : undefined };
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
  // A Pokémon LV.X shows the power it can use (pokemonPower): its own, or its previous level's when it has none or only a Poké-Body.
  const previous = !pokemon.transformed && pokemon.levelUpFrom ? previousLevel(cards, pokemon) : null;
  if (previous?.power && (!d.power || (powerEffect(own.id)?.body && powerEffect(previous.id)?.use))) d = { ...d, power: previous.power };
  // Strange Cave, Holon Fossil, Influence: a Stage 1 Fossil Pokémon put into play as a Basic Pokémon (while it's the top card).
  if (pokemon.asBasic && !pokemon.evolvedFrom.length) d = { ...d, stage: 'basic' };
  if (pokemon.effects?.giantGrowth) d = { ...d, hp: 80 };
  // Sunbeam: Lunatone's HP is now 80 while its player has a Solrock with it working.
  if (pokemon.hpSet) d = { ...d, hp: pokemon.hpSet };
  if (pokemon.hpPlus) d = { ...d, hp: d.hp + pokemon.hpPlus };
  // Unown E's EQUIP: attached as a Pokémon Tool, 10 more HP.
  if (pokemon.attached?.some((a) => a.tool && a.equip && lookupCard(cards, a.card.defId).name === 'Unown E')) d = { ...d, hp: d.hp + 10 };
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

/** A δ Pokémon in play: δ on its card, or (Holon Veil) any Pokémon of a player whose Ampharos δ's Holon Veil works (`veiled`). */
export const isDelta = (cards: CardLibrary, pokemon: InPlayPokemon) => !!pokemon.veiled || / δ$/.test(inPlayDef(cards, pokemon).name);

/** A δ Pokémon card out of play (deck, hand, discard pile): δ on it, or any Pokémon card of a player with Holon Veil (`veiled`). */
export const isDeltaCard = (def: { kind: string; name: string; trainerText?: string }, veiled = false) => def.kind === 'pokemon' && !def.trainerText && (veiled || / δ$/.test(def.name));

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
 * The first empty Bench slot a Pokémon can be put into, or -1 when the Bench is full: 5 Pokémon, 3 while Giant Stump or 4 while Narrow Gym
 * is the Stadium in play (`stadium`).
 */
export function openBenchSlot(bench: readonly (InPlayPokemon | null)[], cards: CardLibrary, stadium?: CardInstance | null): number {
  return benchRoom(bench, cards, stadium) > 0 ? bench.indexOf(null) : -1;
}

/** How many more Pokémon the Bench can hold (see openBenchSlot). */
export function benchRoom(bench: readonly (InPlayPokemon | null)[], cards: CardLibrary, stadium?: CardInstance | null): number {
  const name = stadium && lookupCard(cards, stadium.defId).name;
  const limit = name === 'Narrow Gym' ? 4 : name === 'Giant Stump' ? 3 : bench.length;
  return Math.max(0, limit - bench.filter(Boolean).length);
}

/**
 * Benching or evolving removes Special Conditions (Burned and Poisoned included) and the effects of attacks, except the
 * ones that last while it stays in play (Leek Slap, Hyper Needle).
 */
export function clearOnLeavingActive(pokemon: InPlayPokemon) {
  // Ion Coating ends when the Active Pokémon leaves the Active spot.
  for (const e of pokemon.energy) if (e.converted?.activeOnly) delete e.converted;
  clearSpecialConditions(pokemon);
  const { leekSlapUsed, usedOnce } = pokemon.effects ?? {};
  pokemon.effects = { ...(leekSlapUsed && { leekSlapUsed }), ...(usedOnce && { usedOnce }) };
}
