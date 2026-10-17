import { RUN_TYPES } from '@poke-tcg/campaign';
import type { RunViewData } from '../../hooks/useRun';

/** The run's name and how far along it is. Its numbers (HP, ₱, EXP…) are in the side panel's Run tab (RunStats). */
export function RunHeader({ view }: { view: RunViewData }) {
  const step = Math.min(view.position + 1, view.steps.length);
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-xl font-bold">{RUN_TYPES[view.type].name}</h2>
      <p className="text-sm text-slate-400">
        {view.phase === 'won' ? 'Beaten!' : view.phase === 'lost' ? 'Lost' : step === view.steps.length ? 'Gym leader' : `Encounter ${step} of ${view.steps.length - 1}`}
      </p>
    </div>
  );
}
