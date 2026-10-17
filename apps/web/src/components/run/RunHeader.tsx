import { ENCOUNTER_STYLE } from './encounterIcons';
import { RUN_TYPES } from '@poke-tcg/campaign';
import type { RunViewData } from '../../hooks/useRun';

/** The run's name and how far along it is (and who's next, at a Gym Trainer or boss). Its numbers (HP, ₱, EXP…) are in the side panel's Run tab (RunStats). */
export function RunHeader({ view }: { view: RunViewData }) {
  const step = Math.min(view.position + 1, view.steps.length);
  const next = view.steps[view.position]?.options;
  const fixed = next?.length === 1 ? next[0]! : null;
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-xl font-bold">{RUN_TYPES[view.type].name}</h2>
      <p className="text-sm text-slate-400">
        {view.phase === 'won' ? 'Beaten!' : view.phase === 'lost' ? 'Lost' : `Step ${step} of ${view.steps.length}${fixed ? `: ${fixed.label} (${ENCOUNTER_STYLE[fixed.kind].name})` : ''}`}
      </p>
    </div>
  );
}
