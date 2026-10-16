import type { GameAction } from '@poke-tcg/game-engine';

/** Turn status, the latest hint and the End turn / Concede buttons. */
export function StatusBar({
  status,
  hint,
  error,
  canEndTurn,
  canConcede,
  pending,
  send,
}: {
  status: string;
  hint: string | null;
  /** The server rejected the last move. */
  error?: string;
  canEndTurn: boolean;
  canConcede: boolean;
  pending: GameAction | null;
  send: (a: GameAction) => void;
}) {
  const busy = pending !== null;
  return (
    <div className="flex items-center justify-between rounded bg-slate-900 p-3">
      <div>
        <span className="font-semibold">{status}</span>
        {hint && <span className="ml-3 text-sm text-amber-300">{hint}</span>}
        {error && <span className="ml-3 text-sm text-red-400">{error}</span>}
      </div>
      <div className="flex gap-2">
        {canEndTurn && (
          <button
            className="rounded bg-blue-600 px-3 py-1 transition hover:bg-blue-500 active:scale-95 disabled:cursor-progress"
            disabled={busy}
            onClick={() => send({ type: 'END_TURN' })}
          >
            {pending?.type === 'END_TURN' ? 'Ending turn…' : 'End turn'}
          </button>
        )}
        {canConcede && (
          <button
            className="rounded bg-slate-700 px-3 py-1 transition hover:bg-slate-600 active:scale-95 disabled:cursor-progress"
            disabled={busy}
            onClick={() => send({ type: 'CONCEDE' })}
          >
            Concede
          </button>
        )}
      </div>
    </div>
  );
}
