import type { PlayerView } from '@poke-tcg/game-engine';

export const isMyTurn = (view: PlayerView) => view.phase === 'playing' && view.currentPlayer === view.you;

/** The player's active was knocked out and they must pick a replacement from the bench. */
export const mustPromote = (view: PlayerView) => view.phase === 'promote' && view.pendingPromotion === view.you;

/**
 * Headline for the status bar. `short` (the phone layout, where it sits between the Active Pokémon beside the setup
 * buttons): setup keeps to "Place your Basic Pokémon." once the Active is placed too.
 */
export function statusText(view: PlayerView, short = false): string {
  if (view.phase === 'finished') return view.winner === view.you ? 'You win!' : 'You lose.';
  if (view.phase === 'setup') {
    // During setup, the current player is the one who won the turn-order flip (createGame).
    const order = view.currentPlayer === view.you ? 'You go first.' : 'You go second.';
    const step = view.self.ready
      ? 'Waiting for the CPU to start the battle…'
      : view.self.active && !short
        ? 'Add Basic Pokémon to your Bench if you like, then Start battle.'
        : 'Place your Basic Pokémon.';
    return `${order} ${step}`;
  }
  if (mustPromote(view)) return 'Choose a benched Pokémon to promote.';
  return isMyTurn(view) ? `Your turn (turn ${view.turn})` : "CPU's turn";
}
