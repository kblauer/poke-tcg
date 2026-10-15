// Small state helpers shared by the reducer and attack effects (no imports of engine values,
// so effect modules can use them without import cycles).
import { lookupCard } from './cards.js';
import type { GameState, InPlayPokemon, PlayerId } from './engine.js';
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
  const heads = r < 0.5;
  addLog(state, `${reason}: ${heads ? 'heads' : 'tails'}.`, player, { reason, heads });
  return heads;
}

export const pokemonName = (state: GameState, pokemon: InPlayPokemon) => lookupCard(state.cards, pokemon.card.defId).name;

/** Benching or evolving removes Special Conditions and the effects of attacks (except Leek Slap's). */
export function clearOnLeavingActive(pokemon: InPlayPokemon) {
  pokemon.condition = null;
  pokemon.poison = 0;
  delete pokemon.paralyzedTurn;
  pokemon.effects = pokemon.effects?.leekSlapUsed ? { leekSlapUsed: true } : {};
}
