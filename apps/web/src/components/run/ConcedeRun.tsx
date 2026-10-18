import { bankablePokedollars, battlesFought } from '@poke-tcg/campaign';
import { useState } from 'react';
import type { RunControl, RunViewData } from '../../hooks/useRun';

/**
 * Giving up the run, while choosing the next step: asks first, saying what's kept. The cards gained stay unlocked;
 * the run's ₱ are banked only once a battle has been finished (won or lost), so a new run's ₱ can't just be banked.
 */
export function ConcedeRun({ view, run }: { view: RunViewData; run: RunControl }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-600 active:scale-95 disabled:opacity-40" disabled={run.busy} onClick={() => setAsking(true)}>
        Concede the run
      </button>
    );
  }
  const banked = bankablePokedollars({ ...view, conceded: true });
  const cards = view.gained.length;
  return (
    <div className="space-y-3 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
      <p className="text-sm font-semibold">Concede the run?</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
        <li>{cards ? `The ${cards} card${cards === 1 ? '' : 's'} you gained stay unlocked.` : 'You haven’t gained any cards yet.'}</li>
        <li>
          {battlesFought(view) > 0
            ? `₱${banked} go to your bank.`
            : `You haven’t finished a battle yet, so the run’s ₱${view.pokedollars} won’t be banked.`}
        </li>
        <li>You won’t get the run’s EXP: that’s only for beating it.</li>
      </ul>
      <div className="flex gap-2">
        <button className="rounded bg-rose-700 px-3 py-1.5 text-sm font-semibold transition hover:bg-rose-600 active:scale-95 disabled:opacity-40" disabled={run.busy} onClick={() => run.send({ type: 'CONCEDE' })}>
          Concede
        </button>
        <button className="rounded bg-slate-600 px-3 py-1.5 text-sm transition hover:bg-slate-500 active:scale-95" onClick={() => setAsking(false)}>
          Keep going
        </button>
      </div>
    </div>
  );
}
