import type { PlayerView } from '@poke-tcg/game-engine';

export const isMyTurn = (view: PlayerView) => view.phase === 'playing' && view.currentPlayer === view.you;

/** The player's active was knocked out and they must pick a replacement from the bench. */
export const mustPromote = (view: PlayerView) => view.phase === 'promote' && view.pendingPromotion === view.you;

/** Headline for the status bar (none for whose turn it is). Setup is always "You're going first/second. Place your Basic Pokémon." (the setup buttons say the rest). */
export function statusText(view: PlayerView): string {
  if (view.phase === 'finished') return view.winner === view.you ? 'You win!' : 'You lose.';
  if (view.phase === 'setup') {
    // During setup, the current player is the one who won the turn-order flip (createGame).
    const order = view.currentPlayer === view.you ? "You're going first." : "You're going second.";
    return `${order} Place your Basic Pokémon.`;
  }
  if (mustPromote(view)) return 'Choose a benched Pokémon to promote.';
  // No line for whose turn it is, either's: its banner says so (TurnBanner; the user's).
  return '';
}
