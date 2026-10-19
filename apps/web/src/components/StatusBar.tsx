import type { GameAction } from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Something the player could still do this turn, which End turn reminds them of first. */
export type EndTurnReminder = { kind: 'energy' | 'stadium' | 'powers'; text: string };

/** localStorage keys: the player turned off that reminder ("Don't remind me"). The Energy one predates the others. */
const SKIP_KEYS: Record<EndTurnReminder['kind'], string> = {
  energy: 'poke-tcg.skip-end-turn-energy-check',
  stadium: 'poke-tcg.skip-end-turn-stadium-check',
  powers: 'poke-tcg.skip-end-turn-powers-check',
};

function reminderOff(kind: EndTurnReminder['kind']): boolean {
  try {
    return localStorage.getItem(SKIP_KEYS[kind]) === '1';
  } catch {
    return false;
  }
}

function turnReminderOff(kind: EndTurnReminder['kind']) {
  try {
    localStorage.setItem(SKIP_KEYS[kind], '1');
  } catch {
    // Not remembered: it reminds them again next time.
  }
}

// Styled like the other dialogs: bg-slate-800, ring-slate-600, slate-600 buttons.
const button = 'rounded bg-slate-600 px-3 py-1 text-sm transition hover:bg-slate-500 active:scale-95';
const smallButton = 'rounded bg-slate-600 px-2 py-1 text-xs transition hover:bg-slate-500 active:scale-95';
/** End turn itself, blue like the turn bar's button. */
const endButton = 'rounded bg-blue-600 px-3 py-1 text-sm transition hover:bg-blue-500 active:scale-95';

/**
 * Whose turn it is, and below it the End turn button, both centred in the middle of the table between the two sides.
 * The text line and the button row keep fixed heights (the row stays when there's no button), so the button never
 * moves as the text or the turn changes.
 * `setup`: while placing Pokémon before the battle, the
 * Reset cards (take them all back) and Start battle buttons. `reminders`: what the player could still do this turn
 * (attach Energy, use the Stadium, use Pokémon Powers); End turn lists them and asks first, except those the player
 * turned off with "Don't remind me" (each remembered in the browser). `compact` (the phone layout): one row, the
 * text (up to two lines) on the left and the buttons, smaller, on the right, where the thumb is.
 */
export function StatusBar({
  status,
  canEndTurn,
  setup = null,
  reminders = [],
  pending,
  send,
  compact = false,
}: {
  status: string;
  canEndTurn: boolean;
  setup?: { canReset: boolean; canStart: boolean } | null;
  reminders?: EndTurnReminder[];
  pending: GameAction | null;
  send: (a: GameAction) => void;
  compact?: boolean;
}) {
  const busy = pending !== null;
  /** The reminders being asked about, or null. */
  const [asking, setAsking] = useState<EndTurnReminder[] | null>(null);
  /** The ones ticked "Don't remind me". */
  const [silenced, setSilenced] = useState<EndTurnReminder['kind'][]>([]);

  // The question is moot once the turn moves on.
  useEffect(() => {
    if (!canEndTurn) setAsking(null);
  }, [canEndTurn]);
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAsking(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking]);

  const clickEndTurn = () => {
    const open = reminders.filter((r) => !reminderOff(r.kind));
    if (!open.length) return send({ type: 'END_TURN' });
    setSilenced([]);
    setAsking(open);
  };
  const endTurn = () => {
    setAsking(null);
    for (const kind of silenced) turnReminderOff(kind);
    send({ type: 'END_TURN' });
  };
  const toggle = (kind: EndTurnReminder['kind'], on: boolean) => setSilenced((s) => (on ? [...s, kind] : s.filter((k) => k !== kind)));
  /** The big buttons (Start battle, End turn): a little smaller on a phone. */
  const big = compact ? 'px-4 py-2 text-sm' : 'min-w-36 px-6 py-2 text-base';

  return (
    <div className={compact ? 'flex min-w-0 flex-1 items-center gap-2' : 'flex shrink-0 flex-col items-center gap-1 text-center'}>
      {/* One line, so a longer message never pushes the button down (two beside the buttons on a phone). */}
      {compact ? (
        <p className="line-clamp-2 min-w-0 flex-1 text-xs font-semibold leading-4">{status}</p>
      ) : (
        <p className="h-5 max-w-full truncate px-2 text-sm font-semibold leading-5">{status}</p>
      )}
      <div className={`flex h-10 items-center justify-center ${compact ? 'shrink-0 gap-2' : ''}`}>
        {setup && (
          // Start battle in the middle, where End turn goes; Reset cards hangs off its left (beside it, on a phone).
          <span className={compact ? 'flex items-center gap-2' : 'relative'}>
            <button
              className={`${compact ? smallButton : `${button} absolute right-full top-1/2 mr-3 -translate-y-1/2`} whitespace-nowrap disabled:opacity-40`}
              disabled={busy || !setup.canReset}
              onClick={() => send({ type: 'RESET_SETUP' })}
              title="Take the Pokémon you've placed back into your hand"
            >
              Reset cards
            </button>
            <button
              className={`${big} rounded-lg bg-emerald-600 font-semibold shadow-lg shadow-black/40 transition hover:bg-emerald-500 active:scale-95 disabled:opacity-40`}
              disabled={busy || !setup.canStart}
              onClick={() => send({ type: 'START_BATTLE' })}
              title={setup.canStart ? 'Done placing your Pokémon' : 'Choose an Active Pokémon first'}
            >
              {pending?.type === 'START_BATTLE' ? 'Starting…' : 'Start battle'}
            </button>
          </span>
        )}
        {canEndTurn && (
          <button
            className={`${big} rounded-lg bg-blue-600 font-semibold shadow-lg shadow-black/40 transition hover:bg-blue-500 active:scale-95 disabled:cursor-progress`}
            disabled={busy}
            onClick={clickEndTurn}
          >
            {pending?.type === 'END_TURN' ? 'Ending turn…' : 'End turn'}
          </button>
        )}
      </div>
      {/* In the page body: the play area's container-type would trap a fixed dialog. */}
      {asking &&
        createPortal(
          <div data-keep-action className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" onClick={() => setAsking(null)}>
            <div
              role="alertdialog"
              aria-label="End your turn?"
              className="w-full max-w-md space-y-3 rounded-lg bg-slate-800 p-4 text-left text-sm ring-1 ring-slate-600"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-semibold">End your turn? You could still:</p>
              <ul className="space-y-2">
                {asking.map((r) => (
                  <li key={r.kind} className="space-y-1">
                    <p className="text-slate-200">• {r.text}</p>
                    <label className="ml-3 flex items-center gap-2 text-xs text-slate-400">
                      <input type="checkbox" checked={silenced.includes(r.kind)} onChange={(e) => toggle(r.kind, e.target.checked)} />
                      Don't remind me about this
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <button className={button} onClick={() => setAsking(null)} autoFocus>
                  Keep playing
                </button>
                <button className={endButton} onClick={endTurn}>
                  End turn
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
