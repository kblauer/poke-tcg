import type { LogEntry, PlayerId } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState } from 'react';

/** How long the coin spins, then how long the result stays up. */
const SPIN_MS = 1000;
const RESULT_MS = 900;

interface Flip {
  n: number;
  player: PlayerId | null;
  reason: string;
  heads: boolean;
}

/**
 * Animates the coin flips that arrive in the log, one after another. The engine has already
 * decided each result; this replays them. Flips already in the log when the game is opened
 * aren't replayed. Shown as a small panel under the game log.
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
    <section className="flex items-center gap-3 rounded-lg bg-slate-900 p-3" aria-live="polite">
      <div className="shrink-0 [perspective:400px]">
        <div
          key={current.n}
          className="relative h-12 w-12 [transform-style:preserve-3d]"
          style={{ animation: `${current.heads ? 'coin-heads' : 'coin-tails'} ${SPIN_MS}ms cubic-bezier(0.2, 0.6, 0.3, 1) forwards` }}
        >
          <CoinFace label="H" className="bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-600" />
          <CoinFace label="T" className="bg-gradient-to-br from-slate-200 via-slate-400 to-slate-600 [transform:rotateY(180deg)]" />
        </div>
      </div>
      <div className="min-w-0 text-xs">
        <p className="text-slate-300">
          {who && <span className="font-semibold">{who}: </span>}
          {current.reason}
          {queue.length > 1 && <span className="text-slate-500"> (1 of {queue.length})</span>}
        </p>
        <p className={`h-6 text-base font-bold transition-opacity ${landed ? 'opacity-100' : 'opacity-0'} ${current.heads ? 'text-yellow-300' : 'text-slate-300'}`}>
          {current.heads ? 'Heads!' : 'Tails!'}
        </p>
      </div>
    </section>
  );
}

function CoinFace({ label, className }: { label: string; className: string }) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center rounded-full border-2 border-amber-700/60 text-xl font-black text-amber-900/70 shadow-inner [backface-visibility:hidden] ${className}`}
    >
      {label}
    </div>
  );
}
