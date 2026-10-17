import type { PlayerView } from '@poke-tcg/game-engine';

export const isMyTurn = (view: PlayerView) => view.phase === 'playing' && view.currentPlayer === view.you;

/** The player's active was knocked out and they must pick a replacement from the bench. */
export const mustPromote = (view: PlayerView) => view.phase === 'promote' && view.pendingPromotion === view.you;

/** Headline for the status bar. */
export function statusText(view: PlayerView): string {
  if (view.phase === 'finished') return view.winner === view.you ? 'You win!' : 'You lose.';
  if (view.phase === 'setup') {
    // During setup, the current player is the one who won the turn-order flip (createGame).
    const order = view.currentPlayer === view.you ? 'You go first.' : 'The CPU goes first.';
    return `${order} ${view.self.active ? 'Waiting for the CPU to choose an active Pokémon…' : 'Drag or click a Basic Pokémon into your active spot.'}`;
  }
  if (mustPromote(view)) return 'Choose a benched Pokémon to promote.';
  return isMyTurn(view) ? `Your turn (turn ${view.turn})` : "CPU's turn";
}
