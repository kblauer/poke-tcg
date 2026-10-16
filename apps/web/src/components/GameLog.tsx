import type { LogEntry, PlayerId } from '@poke-tcg/game-engine';
import { useEffect, useRef, type ReactNode } from 'react';

/** What happened in the game (attacks, coin flips, knockouts), newest at the bottom. `actions` sit in its header. */
export function GameLog({ log, you, actions }: { log: LogEntry[]; you: PlayerId; actions?: ReactNode }) {
  const end = useRef<HTMLLIElement>(null);
  // Keep the newest entries in view as they arrive.
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [log.length]);
  return (
    <section className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm text-slate-400">Game log</h3>
        {actions && <div className="flex gap-0.5">{actions}</div>}
      </div>
      <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-xs">
        {log.length === 0 && <li className="text-slate-500">Nothing yet.</li>}
        {log.map((entry, i) => (
          <li key={i} className={entry.player === null ? 'text-slate-400' : entry.player === you ? 'text-sky-300' : 'text-rose-300'}>
            {entry.player !== null && <span className="font-semibold">{entry.player === you ? 'You' : 'CPU'}: </span>}
            {entry.text}
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ol>
    </section>
  );
}
