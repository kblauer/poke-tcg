import type { GameAction } from '@poke-tcg/game-engine';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscape } from '../hooks/useEscape';
import { registerSetting, saveSetting } from '../utils/accountSettings';

/** Something the player could still do this turn, which End turn reminds them of first. */
export type EndTurnReminder = { kind: 'energy' | 'stadium' | 'powers'; text: string };

/** localStorage keys: the player turned off that reminder (on the Settings page). The Energy one predates the others. */
const SKIP_KEYS: Record<EndTurnReminder['kind'], string> = {
  energy: 'poke-tcg.skip-end-turn-energy-check',
  stadium: 'poke-tcg.skip-end-turn-stadium-check',
  powers: 'poke-tcg.skip-end-turn-powers-check',
};

/** Each reminder, as the Settings page names it (where each is turned on or off). */
export const REMINDER_LABELS: Record<EndTurnReminder['kind'], string> = {
  energy: "An Energy card you haven't attached",
  stadium: "A Stadium you haven't used (Lucky Stadium)",
  powers: "Pokémon Powers you haven't used",
};

export function reminderOff(kind: EndTurnReminder['kind']): boolean {
  try {
    return localStorage.getItem(SKIP_KEYS[kind]) === '1';
  } catch {
    return false;
  }
}

const REMINDER_KINDS = Object.keys(SKIP_KEYS) as EndTurnReminder['kind'][];

/** The reminders turned off, as the account keeps them (null: none, the default). */
function remindersOff(): string | null {
  const off = REMINDER_KINDS.filter(reminderOff);
  return off.length ? JSON.stringify(off) : null;
}

/** Turns a reminder off, or back on (the Settings page). `fromAccount`: the account's (not saved back to it). */
export function setReminderOff(kind: EndTurnReminder['kind'], off = true, fromAccount = false) {
  try {
    if (off) localStorage.setItem(SKIP_KEYS[kind], '1');
    else localStorage.removeItem(SKIP_KEYS[kind]);
  } catch {
    // Not remembered: it reminds them again next time.
  }
  if (!fromAccount) saveSetting('reminders', remindersOff());
}

// Kept with the account too (utils/accountSettings): the ones turned off.
registerSetting('reminders', {
  read: remindersOff,
  apply: (value) => {
    let off: string[] = [];
    try {
      off = JSON.parse(value ?? '[]') as string[];
    } catch {
      // Unreadable: every reminder on.
    }
    for (const kind of REMINDER_KINDS) setReminderOff(kind, off.includes(kind), true);
  },
});

// Styled like the other dialogs: bg-slate-800, ring-slate-600, slate-600 buttons.
const button = 'rounded bg-slate-600 px-3 py-1 text-sm transition hover:bg-slate-500 active:scale-95';
const smallButton = 'rounded bg-slate-600 px-2 py-1 text-xs transition hover:bg-slate-500 active:scale-95';
/** End turn itself, blue like the turn bar's button. */
const endButton = 'rounded bg-blue-600 px-3 py-1 text-sm transition hover:bg-blue-500 active:scale-95';

/**
 * Asks before a move that ends the turn (End turn, or an attack) while the player could still do something this turn
 * (`reminders`, but for those turned off on the Settings page, each remembered in the browser): `check(move, go)` runs `go` at once when there's nothing to remind them of, else opens `dialog`
 * (render it anywhere: it's portalled to the page body), whose confirm button runs it. `active`: the player's turn;
 * the question is moot once it's over.
 */
export function useTurnReminders(reminders: EndTurnReminder[], active: boolean): { check: (move: 'end' | 'attack', go: () => void) => void; dialog: ReactNode } {
  /** The reminders being asked about, the move and what it does, or null. */
  const [asking, setAsking] = useState<{ reminders: EndTurnReminder[]; move: 'end' | 'attack'; go: () => void } | null>(null);

  useEffect(() => {
    if (!active) setAsking(null);
  }, [active]);
  useEscape(() => setAsking(null), !!asking);

  const check = (move: 'end' | 'attack', go: () => void) => {
    const open = reminders.filter((r) => !reminderOff(r.kind));
    if (!open.length) return go();
    setAsking({ reminders: open, move, go });
  };
  const confirm = () => {
    if (!asking) return;
    setAsking(null);
    asking.go();
  };
  const attack = asking?.move === 'attack';
  // In the page body: the play area's container-type would trap a fixed dialog.
  const dialog =
    asking &&
    createPortal(
      <div data-keep-action className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" onClick={() => setAsking(null)}>
        <div
          role="alertdialog"
          aria-label={attack ? 'Attack now?' : 'End your turn?'}
          className="w-full max-w-md space-y-3 rounded-lg bg-slate-800 p-4 text-left text-sm ring-1 ring-slate-600"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-semibold">{attack ? 'Attack now? Attacking ends your turn, and you could still:' : 'End your turn? You could still:'}</p>
          <ul className="space-y-2">
            {asking.reminders.map((r) => (
              <li key={r.kind} className="text-slate-200">
                • {r.text}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Choose what you're reminded of on the Settings page.</p>
          <div className="flex justify-end gap-2">
            <button className={button} onClick={() => setAsking(null)} autoFocus>
              Keep playing
            </button>
            <button className={endButton} onClick={confirm}>
              {attack ? 'Attack' : 'End turn'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  return { check, dialog };
}

/**
 * Whose turn it is, and below it the End turn button, both centred in the middle of the table between the two sides.
 * The text line and the button row keep fixed heights (the row stays when there's no button), so the button never
 * moves as the text or the turn changes.
 * `setup`: while placing Pokémon before the battle, the
 * Reset cards (take them all back) and Start battle buttons. `endTurn`: what End turn does, through useTurnReminders'
 * `check` (which asks first while the player could still attach Energy, use the Stadium or a Pokémon Power). `compact` (the phone layout): one row, the
 * text (up to two lines) centred on the screen, between the two Active Pokémon, and the buttons, smaller, on the right, where the thumb is;
 * during setup no text (Board's SetupBanner shows it) and Start battle centred on the screen, Reset cards on its right.
 */
export function StatusBar({
  status,
  canEndTurn,
  setup = null,
  endTurn,
  pending,
  send,
  compact = false,
}: {
  status: string;
  canEndTurn: boolean;
  setup?: { canReset: boolean; canStart: boolean } | null;
  endTurn: () => void;
  pending: GameAction | null;
  send: (a: GameAction) => void;
  compact?: boolean;
}) {
  const busy = pending !== null;
  /** The big buttons (Start battle, End turn): a little smaller on a phone. */
  const big = compact ? 'px-4 py-2 text-sm' : 'min-w-36 px-6 py-2 text-base';

  return (
    <div className={compact ? 'flex min-w-0 flex-1 items-center gap-2' : 'flex shrink-0 flex-col items-center gap-1 text-center'}>
      {/* One line, so a longer message never pushes the button down (two beside the buttons on a phone). */}
      {compact ? (
        // Centred on the screen, in line with the Active Pokémon above and below it (the bar is its containing block; agreed),
        // with room left beside it for the Stadium and the buttons.
        <>
          <p className="pointer-events-none absolute left-1/2 top-1/2 line-clamp-2 w-[38%] -translate-x-1/2 -translate-y-1/2 text-center text-xs font-semibold leading-4">{status}</p>
          <span className="flex-1" />
        </>
      ) : (
        <p className="h-5 max-w-full truncate px-2 text-sm font-semibold leading-5">{status}</p>
      )}
      <div className={`flex h-10 items-center justify-center ${compact ? 'shrink-0 gap-2' : ''}`}>
        {setup && (
          // Start battle in the middle, where End turn goes; Reset cards hangs off its left (on a phone, centred on the
          // screen with Reset cards on its right, the setup line on a banner above: agreed).
          <span className={compact ? 'absolute left-1/2 top-1/2 z-[960] -translate-x-1/2 -translate-y-1/2' : 'relative'}>
            <button
              className={`${compact ? `${smallButton} absolute left-full top-1/2 ml-2 -translate-y-1/2` : `${button} absolute right-full top-1/2 mr-3 -translate-y-1/2`} whitespace-nowrap disabled:opacity-40`}
              disabled={busy || !setup.canReset}
              onClick={() => send({ type: 'RESET_SETUP' })}
              title="Take the Pokémon you've placed back into your hand"
            >
              Reset cards
            </button>
            <button
              className={`${big} whitespace-nowrap rounded-lg bg-emerald-600 font-semibold shadow-lg shadow-black/40 transition hover:bg-emerald-500 active:scale-95 disabled:opacity-40`}
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
            onClick={endTurn}
          >
            {pending?.type === 'END_TURN' ? 'Ending turn…' : 'End turn'}
          </button>
        )}
      </div>
    </div>
  );
}
