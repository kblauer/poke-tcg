import type { LogEntry, PlayerId } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState } from 'react';

/** How long the coin spins, then how long the result stays up. */
export const SPIN_MS = 1000;
const RESULT_MS = 900;
/** How long one coin flip takes to show, start to finish. */
export const COIN_MS = SPIN_MS + RESULT_MS;

interface Flip {
  n: number;
  player: PlayerId | null;
  reason: string;
  heads: boolean;
}

/**
 * Animates the coin flips that arrive in the log, one after another. The engine has already
 * decided each result; this replays them. Flips already in the log when the game is opened
 * aren't replayed. Shown in the middle of the screen, with what the flip is for (the attack,
 * Trainer, power or Special Condition); clicks go through it to the board.
 */
export function CoinFlip({ log, you }: { log: LogEntry[]; you: PlayerId }) {
  /** Highest log entry number seen so far; null until the first render of this game. */
  const seen = useRef<number | null>(null);
  const [queue, setQueue] = useState<Flip[]>([]);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const last = log.at(-1)?.n ?? 0;
    const since = seen.current;
    seen.current = last;
    if (since === null) return;
    const fresh = log.flatMap((e) => (e.coin && e.n !== undefined && e.n > since ? [{ n: e.n, player: e.player, ...e.coin }] : []));
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [log]);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    setLanded(false);
    const land = setTimeout(() => setLanded(true), SPIN_MS);
    const next = setTimeout(() => setQueue((q) => q.slice(1)), SPIN_MS + RESULT_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(next);
    };
  }, [current?.n]);

  if (!current) return null;
  const who = current.player === null ? null : current.player === you ? 'You' : 'CPU';
  return (
    <div className="pointer-events-none fixed inset-0 z-[1150] flex items-center justify-center p-4" aria-live="polite">
      <section className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-slate-900/95 px-8 py-5 text-center shadow-2xl shadow-black/70 ring-1 ring-slate-600">
        <p className="text-base text-slate-200">
          {who && <span className="font-semibold">{who}: </span>}
          {current.reason}
          {queue.length > 1 && <span className="text-slate-500"> (1 of {queue.length})</span>}
        </p>
        <SpinningCoin key={current.n} heads={current.heads} size="md" />
        <p className={`h-8 text-2xl font-black transition-opacity ${landed ? 'opacity-100' : 'opacity-0'} ${current.heads ? 'text-yellow-300' : 'text-slate-200'}`}>
          {current.heads ? 'Heads!' : 'Tails!'}
        </p>
      </section>
    </div>
  );
}

const COIN_SIZES = {
  md: { box: 'h-24 w-24', face: 'border-[3px] text-4xl' },
  lg: { box: 'h-40 w-40', face: 'border-4 text-6xl' },
};

/**
 * A coin that spins for `spinMs` and lands on heads or tails (give it a new `key` to flip again): `md` for
 * coin flips during the game, `lg` for the turn-order flip.
 */
export function SpinningCoin({ heads, size, spinMs = SPIN_MS }: { heads: boolean; size: keyof typeof COIN_SIZES; spinMs?: number }) {
  return (
    <div className="shrink-0 [perspective:400px]">
      <div
        className={`relative [transform-style:preserve-3d] ${COIN_SIZES[size].box}`}
        style={{ animation: `${heads ? 'coin-heads' : 'coin-tails'} ${spinMs}ms cubic-bezier(0.2, 0.6, 0.3, 1) forwards` }}
      >
        <CoinFace label="H" size={size} className="bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-600" />
        <CoinFace label="T" size={size} className="bg-gradient-to-br from-slate-200 via-slate-400 to-slate-600 [transform:rotateY(180deg)]" />
      </div>
    </div>
  );
}

function CoinFace({ label, size, className }: { label: string; size: keyof typeof COIN_SIZES; className: string }) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center rounded-full border-amber-700/60 font-black text-amber-900/70 shadow-inner [backface-visibility:hidden] ${COIN_SIZES[size].face} ${className}`}
    >
      {label}
    </div>
  );
}
