import { TURN_ORDER_FLIP, type PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { SPIN_MS, SpinningCoin } from './CoinFlip';

/** The big coin spins twice as long as the log's; the result then stays up this long before it closes. */
const LAND_MS = 2 * SPIN_MS;
const RESULT_MS = 2500;

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
 * The coin flip for turn order (see createGame), big in the middle of the screen when a battle starts: the
 * coin spins, then says who goes first. Shown once per game in this browser session, while the game is still
 * being set up; a click closes it early.
 */
export function TurnOrderFlip({ view, gameId }: { view: PlayerView; gameId: string }) {
  const flip = view.log.find((e) => e.coin?.reason === TURN_ORDER_FLIP);
  const [open, setOpen] = useState(() => view.phase === 'setup' && !!flip && !shown(gameId));
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    markShown(gameId);
    const land = setTimeout(() => setLanded(true), LAND_MS);
    const close = setTimeout(() => setOpen(false), LAND_MS + RESULT_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(close);
    };
  }, [open]);

  if (!open || !flip?.coin) return null;
  const { heads } = flip.coin;
  // The flip is called by the first player in the game's order: heads they go first, tails the other player does.
  const caller = flip.player === view.you ? 'you go' : 'the CPU goes';
  const other = flip.player === view.you ? 'the CPU goes' : 'you go';
  const first = heads ? caller : other;
  return (
    <div
      data-keep-action
      role="dialog"
      aria-label={TURN_ORDER_FLIP}
      aria-live="polite"
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4"
      onClick={() => setOpen(false)}
    >
      <div className="flex flex-col items-center gap-5 rounded-2xl bg-slate-900/95 px-10 py-8 text-center shadow-2xl shadow-black/70 ring-1 ring-slate-600">
        <div>
          <p className="text-xl font-bold text-slate-100">{TURN_ORDER_FLIP}</p>
          <p className="text-sm text-slate-400">
            Heads: {caller} first. Tails: {other} first.
          </p>
        </div>
        <SpinningCoin heads={heads} large />
        <div className={`transition-opacity duration-300 ${landed ? 'opacity-100' : 'opacity-0'}`}>
          <p className={`text-3xl font-black ${heads ? 'text-yellow-300' : 'text-slate-200'}`}>{heads ? 'Heads!' : 'Tails!'}</p>
          <p className="text-lg font-semibold text-slate-100">{first[0]!.toUpperCase() + first.slice(1)} first.</p>
          <p className="mt-2 text-xs text-slate-500">Click anywhere to continue</p>
        </div>
      </div>
    </div>
  );
}
