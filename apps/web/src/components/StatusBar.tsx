import type { GameAction } from '@poke-tcg/game-engine';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** localStorage key: the player turned off the "no Energy attached" check on End turn. */
const SKIP_ENERGY_CHECK_KEY = 'poke-tcg.skip-end-turn-energy-check';

function energyCheckOff(): boolean {
  try {
    return localStorage.getItem(SKIP_ENERGY_CHECK_KEY) === '1';
  } catch {
    return false;
  }
}

function turnEnergyCheckOff() {
  try {
    localStorage.setItem(SKIP_ENERGY_CHECK_KEY, '1');
  } catch {
    // Not remembered: it asks again next time.
  }
}

// Styled like the other dialogs: bg-slate-800, ring-slate-600, slate-600 buttons.
const button = 'rounded bg-slate-600 px-3 py-1 text-sm transition hover:bg-slate-500 active:scale-95';
/** End turn itself, blue like the turn bar's button. */
const endButton = 'rounded bg-blue-600 px-3 py-1 text-sm transition hover:bg-blue-500 active:scale-95';

/**
 * Whose turn it is and the End turn button, centred in the middle of the table between the two sides.
 * `stadium` is the Stadium card in play (StadiumChip), if any. `setup`: while placing Pokémon before the battle, the
 * Reset cards (take them all back) and Start battle buttons. `energyUnattached`: the player hasn't
 * attached Energy this turn and has an Energy card in hand, so End turn asks first (unless they turned
 * that off with "Don't ask again", remembered in the browser).
 */
export function StatusBar({
  status,
  canEndTurn,
  setup = null,
  energyUnattached = false,
  pending,
  send,
  stadium,
}: {
  status: string;
  canEndTurn: boolean;
  setup?: { canReset: boolean; canStart: boolean } | null;
  energyUnattached?: boolean;
  pending: GameAction | null;
  send: (a: GameAction) => void;
  stadium?: ReactNode;
}) {
  const busy = pending !== null;
  const [asking, setAsking] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);

  // The question is moot once the turn moves on.
  useEffect(() => {
    if (!canEndTurn) setAsking(false);
  }, [canEndTurn]);
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAsking(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking]);

  const endTurn = () => {
    setAsking(false);
    if (dontAsk) turnEnergyCheckOff();
    send({ type: 'END_TURN' });
  };

  return (
    // 40% of the table's width, centred, so it keeps its size as the text changes; only very long text widens it.
    <div className="mx-auto flex w-fit min-w-[40%] shrink-0 items-center justify-center gap-4 rounded-lg bg-slate-900 px-4 py-1.5 text-center">
      <span className="font-semibold">{status}</span>
      {stadium}
      {setup && (
        <>
          <button className={`${button} disabled:opacity-40`} disabled={busy || !setup.canReset} onClick={() => send({ type: 'RESET_SETUP' })} title="Take the Pokémon you've placed back into your hand">
            Reset cards
          </button>
          <button
            className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:opacity-40"
            disabled={busy || !setup.canStart}
            onClick={() => send({ type: 'START_BATTLE' })}
            title={setup.canStart ? 'Done placing your Pokémon' : 'Choose an Active Pokémon first'}
          >
            {pending?.type === 'START_BATTLE' ? 'Starting…' : 'Start battle'}
          </button>
        </>
      )}
      {canEndTurn && (
        <button
          className="rounded bg-blue-600 px-3 py-1 text-sm transition hover:bg-blue-500 active:scale-95 disabled:cursor-progress"
          disabled={busy}
          onClick={() => (energyUnattached && !energyCheckOff() ? setAsking(true) : send({ type: 'END_TURN' }))}
        >
          {pending?.type === 'END_TURN' ? 'Ending turn…' : 'End turn'}
        </button>
      )}
      {/* In the page body: the play area's container-type would trap a fixed dialog. */}
      {asking &&
        createPortal(
          <div data-keep-action className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" onClick={() => setAsking(false)}>
            <div
              role="alertdialog"
              aria-label="End turn without attaching Energy?"
              className="w-full max-w-sm space-y-3 rounded-lg bg-slate-800 p-4 text-sm ring-1 ring-slate-600"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-semibold">End your turn without attaching an Energy?</p>
              <p className="text-slate-300">You haven't attached an Energy card this turn, and you have one in your hand.</p>
              <label className="flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
                Don't ask again
              </label>
              <div className="flex justify-end gap-2">
                <button className={button} onClick={() => setAsking(false)} autoFocus>
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
