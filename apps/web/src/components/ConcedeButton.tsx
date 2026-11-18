import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscape } from '../hooks/useEscape';
import { BUTTON, DIALOG, DIALOG_BACKDROP } from '../utils/styles';

/**
 * A battle's Concede button, which asks first (the user's, 2026-11-18: a Battle Tower challenge was lost to a concede the
 * player didn't mean): Concede in the question ends the battle, Keep playing, a click beside it or Escape doesn't.
 * `note`: what conceding costs here (the Battle Tower challenge, the run's battle), under the question.
 */
export function ConcedeButton({ className, disabled, note, onConcede, children = 'Concede' }: { className: string; disabled?: boolean; note?: string; onConcede: () => void; children?: ReactNode }) {
  const [asking, setAsking] = useState(false);
  useEscape(() => setAsking(false), asking);
  return (
    <>
      <button className={className} disabled={disabled} onClick={() => setAsking(true)}>
        {children}
      </button>
      {asking &&
        createPortal(
          <div className={`${DIALOG_BACKDROP} z-[1200]`} onClick={() => setAsking(false)} data-keep-action>
            <div className={`${DIALOG} w-full max-w-sm space-y-4 p-5`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <p className="font-semibold">Concede this battle?</p>
              {note && <p className="text-sm text-slate-300">{note}</p>}
              <div className="flex justify-end gap-2">
                <button className={BUTTON} autoFocus onClick={() => setAsking(false)}>
                  Keep playing
                </button>
                <button
                  className="rounded bg-rose-700 px-3 py-1 text-sm font-semibold hover:bg-rose-600"
                  onClick={() => {
                    setAsking(false);
                    onConcede();
                  }}
                >
                  Concede
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
