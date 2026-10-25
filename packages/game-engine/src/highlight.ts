// What to show of a move the other player (the CPU) made: the card it played or used, and the Pokémon it changed.
import type { GameAction, GameState, InPlayPokemon, PlayerId, Target } from './engine.js';

/** A Pokémon in play, by its owner and its spot. */
export interface SpotRef {
  player: PlayerId;
  target: Target;
}

/**
 * A move's highlight: the card played or used (its definition id; null for a move with no card of its own, such as
 * the answer to an attack's question), and the Pokémon in play it changed (damage, Energy, a Special Condition, an
 * evolution, a new Pokémon…), either player's.
 */
export interface MoveHighlight {
  defId: string | null;
  pokemon: SpotRef[];
}

const spots = (state: GameState, player: PlayerId): [Target, InPlayPokemon | null][] => [
  ['active', state.players[player]!.active],
  ...state.players[player]!.bench.map((p, i): [Target, InPlayPokemon | null] => [i, p]),
];

/** The Pokémon in play that are in `after` but not the same in `before` (a Pokémon Knocked Out or moved away isn't one). */
function changedPokemon(before: GameState, after: GameState): SpotRef[] {
  return after.playerOrder.flatMap((player) => {
    const was = new Map(spots(before, player));
    return spots(after, player).flatMap(([target, p]) => (p && JSON.stringify(p) !== JSON.stringify(was.get(target) ?? null) ? [{ player, target }] : []));
  });
}

/** The card a move plays or uses, from the state before it: a card from the hand, the Pokémon whose power it is, the Stadium, Clefairy Doll. */
function moveCard(before: GameState, player: PlayerId, action: GameAction): string | null {
  const me = before.players[player]!;
  const at = (t: Target) => (t === 'active' ? me.active : me.bench[t]);
  switch (action.type) {
    case 'PLAY_TRAINER':
    case 'ATTACH_ENERGY':
    case 'EVOLVE':
    case 'PLAY_BENCH':
      return me.hand.find((c) => c.uid === action.cardUid)?.defId ?? null;
    case 'USE_POWER':
      return at(action.source)?.card.defId ?? null;
    case 'DISCARD_DOLL':
      return at(action.target)?.card.defId ?? null;
    case 'USE_STADIUM':
      return before.stadium?.card.defId ?? null;
    case 'USE_ENERGY':
      return me.active?.energy.find((e) => e.uid === action.cardUid)?.defId ?? null;
    default:
      return null;
  }
}

/**
 * The highlights of a player's moves, one per move (null for a move with nothing to show: an attack, retreating,
 * ending the turn, the setup). `states[i]` is the state after `actions[i]`, `start` the state before the first. The
 * answer to a question (RESOLVE_CHOICE) shows no card, only the Pokémon it changed: the card that asked was shown
 * when it was played or used, and showing it again looked like a second one (Dual Ball, Master Ball).
 */
export function moveHighlights(start: GameState, player: PlayerId, actions: GameAction[], states: GameState[]): (MoveHighlight | null)[] {
  return actions.map((action, i) => {
    const before = i === 0 ? start : states[i - 1]!;
    const after = states[i]!;
    if (before.phase === 'setup') return null;
    const own = action.type === 'RESOLVE_CHOICE' ? null : moveCard(before, player, action);
    if (own === null && action.type !== 'RESOLVE_CHOICE') return null;
    const pokemon = changedPokemon(before, after);
    return own === null && !pokemon.length ? null : { defId: own, pokemon };
  });
}
