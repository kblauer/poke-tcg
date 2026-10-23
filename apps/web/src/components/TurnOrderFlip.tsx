import { TURN_ORDER_FLIP, type PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { CoinFlip } from './CoinFlip';

const storageKey = (gameId: string) => `poke-tcg.turn-order.${gameId}`;

/** Whether this browser has shown the game's turn-order flip already (storage can be unavailable: then it hasn't). */
function shown(gameId: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(gameId)) !== null;
  } catch {
    return false;
  }
}

function markShown(gameId: string) {
  try {
    sessionStorage.setItem(storageKey(gameId), '1');
  } catch {
    // Not remembered: it may show again after a reload.
  }
}

/**
 * The coin flip for turn order (see createGame) when a battle starts: the same coin flip as the game's (CoinFlip, just the
 * coin on the play area, the same size, speed and place: beside the Active Pokémon of whoever calls it). Shown once per
 * game in this browser session, while the game is still being set up; a click closes it early.
 */
export function TurnOrderFlip({ view, gameId }: { view: PlayerView; gameId: string }) {
  const flip = view.log.find((e) => e.coin?.reason === TURN_ORDER_FLIP);
  const [open, setOpen] = useState(() => view.phase === 'setup' && !!flip && !shown(gameId));
  useEffect(() => {
    if (open) markShown(gameId);
  }, [open]);

  if (!open || !flip?.coin) return null;
  const { heads } = flip.coin;
  return (
    <CoinFlip
      // On the side of whoever calls it.
      flips={[{ n: flip.n ?? 0, player: flip.player, reason: TURN_ORDER_FLIP, heads }]}
      you={view.you}
      onDone={() => setOpen(false)}
    />
  );
}
