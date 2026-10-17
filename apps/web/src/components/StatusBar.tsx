import type { GameAction } from '@poke-tcg/game-engine';

/** Whose turn it is and the End turn button, centred in the middle of the table between the two sides. */
export function StatusBar({
  status,
  canEndTurn,
  pending,
  send,
}: {
  status: string;
  canEndTurn: boolean;
  pending: GameAction | null;
  send: (a: GameAction) => void;
}) {
  const busy = pending !== null;
  return (
    // 40% of the table's width, centred, so it keeps its size as the text changes; only very long text widens it.
    <div className="mx-auto flex w-fit min-w-[40%] shrink-0 items-center justify-center gap-4 rounded-lg bg-slate-900 px-4 py-1.5 text-center max-md:gap-2 max-md:px-2 max-md:py-1">
      <span className="font-semibold max-md:text-sm">{status}</span>
      {canEndTurn && (
        <button
          className="rounded bg-blue-600 px-3 py-1 text-sm transition hover:bg-blue-500 active:scale-95 disabled:cursor-progress"
          disabled={busy}
          onClick={() => send({ type: 'END_TURN' })}
        >
          {pending?.type === 'END_TURN' ? 'Ending turn…' : 'End turn'}
        </button>
      )}
    </div>
  );
}
