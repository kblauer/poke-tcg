import type { PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState } from 'react';

/** How long the banner takes: sliding in from the right, held across the middle, then sliding off to the left. */
const SLIDE_MS = 320;
const HOLD_MS = 800;
export const TURN_BANNER_MS = 2 * SLIDE_MS + HOLD_MS;

/** A new turn on screen: whose it is and its number (the game's turn count, both players' turns together). */
interface NewTurn {
  mine: boolean;
  turn: number;
}

/**
 * The turn that just began in `view`, while its banner shows (TURN_BANNER_MS): set when the turn number changes or the
 * battle starts, never for the view first shown (a reload mid-turn shows none).
 */
export function useNewTurn(view: PlayerView): NewTurn | null {
  const seen = useRef(view.phase === 'setup' ? 0 : view.turn);
  const [shown, setShown] = useState<NewTurn | null>(null);
  const playing = view.phase === 'playing' || view.phase === 'promote';
  useEffect(() => {
    if (!playing || view.turn === seen.current) return;
    seen.current = view.turn;
    setShown({ mine: view.currentPlayer === view.you, turn: view.turn });
  }, [playing, view.turn]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), TURN_BANNER_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return shown;
}

/**
 * The setup line on a phone ("You go first. Place your Basic Pokémon."), on a band like the turn's: it slides in from
 * the right and stays until `leaving` (Start battle), then slides off to the left and `onGone` is called. Board puts it
 * just above the bar between the sides, clear of the Start battle and Reset cards buttons. It can't be clicked.
 */
export function SetupBanner({ text, first, leaving, onGone }: { text: string; first: boolean; leaving: boolean; onGone: () => void }) {
  const band = useRef<HTMLDivElement>(null);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    band.current?.animate(reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out', fill: 'forwards' });
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const out = band.current?.animate(reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none' }, { transform: 'translateX(-100%)' }], { duration: SLIDE_MS, easing: 'ease-in', fill: 'forwards' });
    if (!out) return onGone();
    out.onfinish = onGone;
    return () => {
      out.onfinish = null;
    };
  }, [leaving, onGone]);
  return (
    <div className="pointer-events-none absolute -inset-x-2 bottom-full z-[950] mb-1 flex items-center" role="status">
      <div
        ref={band}
        className={`w-full py-2 text-center ${first ? 'bg-gradient-to-r from-sky-900/0 via-sky-800/95 to-sky-900/0' : 'bg-gradient-to-r from-rose-950/0 via-rose-900/95 to-rose-950/0'}`}
      >
        <span className="text-sm font-semibold text-slate-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">{text}</span>
      </div>
    </div>
  );
}

/**
 * "Your Turn" or "Opponent's Turn" with the turn count, on a band across the middle of the play area as TCG Pocket
 * shows it: it slides in from the right, stays a moment, then slides off to the left. It can't be clicked. `inBar` (the
 * phone layout): centred on the bar between the sides instead (Board puts it there), across the screen's width.
 */
export function TurnBanner({ turn, inBar = false }: { turn: NewTurn; inBar?: boolean }) {
  const band = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const [from, to] = reduced ? [{ opacity: 0 }, { opacity: 0 }] : [{ transform: 'translateX(100%)' }, { transform: 'translateX(-100%)' }];
    const held = { opacity: 1, transform: 'none' };
    const at = SLIDE_MS / TURN_BANNER_MS;
    band.current?.animate([{ ...from, easing: 'ease-out' }, { ...held, offset: at }, { ...held, offset: 1 - at, easing: 'ease-in' }, to], { duration: TURN_BANNER_MS, fill: 'forwards' });
  }, [turn.turn]);
  return (
    <div
      className={`pointer-events-none absolute z-[950] flex items-center ${inBar ? '-inset-x-2 top-1/2 -translate-y-1/2' : 'inset-0 overflow-hidden'}`}
      role="status"
    >
      <div
        ref={band}
        className={`flex w-full flex-col items-center py-3 ${
          turn.mine ? 'bg-gradient-to-r from-sky-900/0 via-sky-800/95 to-sky-900/0' : 'bg-gradient-to-r from-rose-950/0 via-rose-900/95 to-rose-950/0'
        }`}
      >
        <span className="text-3xl font-black italic tracking-wide text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">{turn.mine ? 'Your Turn' : "Opponent's Turn"}</span>
        <span className="text-sm font-semibold uppercase tracking-widest text-slate-200">Turn {turn.turn}</span>
      </div>
    </div>
  );
}
