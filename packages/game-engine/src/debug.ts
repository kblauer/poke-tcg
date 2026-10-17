// Debug commands for testing: cheats that change a game outside the rules (a card into the hand,
// a Pokémon's HP). They aren't GameActions, so the normal action path can never reach them; the API
// only runs them when debugging is enabled (never in production).
import { lookupCard, type CardLibrary } from './cards.js';
import { CPU_DIFFICULTIES, CPU_DIFFICULTY_LABELS, type CpuDifficulty } from './cpu/index.js';
import { opponentOf, type ActionResult, type GameState, type PlayerId, type Target } from './engine.js';
import { addLog, inPlayDef, pokemonName } from './status.js';

export type DebugCommand =
  /** Puts a new copy of a card into the player's hand. Its def must be in the game's library (see `cards`). */
  | { type: 'ADD_TO_HAND'; defId: string }
  /** Draws the top card of the player's deck. */
  | { type: 'DRAW' }
  /** Sets the HP left on a Pokémon in play, on either side (at least 10: one damage counter short of Knocked Out). */
  | { type: 'SET_HP'; side: 'self' | 'opponent'; target: Target; hp: number }
  /** Changes how the CPU plays from its next move on. */
  | { type: 'SET_CPU_DIFFICULTY'; difficulty: CpuDifficulty };

/**
 * Runs a debug command for `playerId`. `cards` adds card defs to the game's library first (a card
 * from outside both decks). Each command is logged, so a game that was tampered with says so.
 */
export function applyDebug(prev: GameState, playerId: PlayerId, command: DebugCommand, cards: CardLibrary = {}): ActionResult {
  const fail = (error: string): ActionResult => ({ ok: false, error });
  if (!prev.players[playerId]) return fail('Not a player in this game');
  if (prev.phase === 'finished') return fail('Game is over');
  const state = structuredClone(prev);
  state.cards = { ...state.cards, ...cards };
  const me = state.players[playerId]!;

  switch (command.type) {
    case 'ADD_TO_HAND': {
      const def = state.cards[command.defId];
      if (!def) return fail(`Unknown card: ${command.defId}`);
      // The version is unique per state, so this uid can't collide with another card.
      me.hand.push({ uid: `${playerId}-debug-${state.version}`, defId: def.id });
      addLog(state, `Debug: put ${def.name} into the hand.`, playerId);
      break;
    }
    case 'DRAW': {
      const drawn = me.deck.shift();
      if (!drawn) return fail('The deck is empty');
      me.hand.push(drawn);
      addLog(state, 'Debug: drew a card.', playerId);
      break;
    }
    case 'SET_HP': {
      const owner = command.side === 'self' ? me : state.players[opponentOf(state, playerId)]!;
      const pokemon = command.target === 'active' ? owner.active : owner.bench[command.target];
      if (!pokemon) return fail('No Pokémon there');
      const def = inPlayDef(state.cards, pokemon);
      if (!Number.isInteger(command.hp) || command.hp % 10 !== 0 || command.hp < 10 || command.hp > def.hp) {
        return fail(`HP must be a multiple of 10 from 10 to ${def.hp}`);
      }
      pokemon.damage = def.hp - command.hp;
      addLog(state, `Debug: set ${pokemonName(state, pokemon)} to ${command.hp} HP.`, playerId);
      break;
    }
    case 'SET_CPU_DIFFICULTY': {
      if (!CPU_DIFFICULTIES.includes(command.difficulty)) return fail(`Unknown CPU difficulty: ${command.difficulty}`);
      state.cpuDifficulty = command.difficulty;
      addLog(state, `Debug: set the CPU to ${CPU_DIFFICULTY_LABELS[command.difficulty]}.`, playerId);
      break;
    }
  }
  state.version += 1;
  return { ok: true, state };
}
