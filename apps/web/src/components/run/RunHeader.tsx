import { ENCOUNTER_STYLE, encounterLabel } from './encounterIcons';
import { RUN_TYPES } from '@poke-tcg/campaign';
import type { ReactNode } from 'react';
import type { RunViewData } from '../../hooks/useRun';
import { PageHeader } from '../PageHeader';

/** The run's name and how far along it is (and who's next, at a Gym Trainer or boss). The page's heading (PageHeader). Its numbers (HP, ₱, EXP…) are in the site menu (RunStats). */
export function RunHeader({ view, actions }: { view: RunViewData; actions?: ReactNode }) {
  const step = Math.min(view.position + 1, view.steps.length);
  const next = view.steps[view.position]?.options;
  const fixed = next?.length === 1 ? next[0]! : null;
  return (
    <PageHeader
      title={RUN_TYPES[view.type].name}
      info={
        view.phase === 'won' ? 'Beaten!' : view.phase === 'lost' ? (view.conceded ? 'Conceded' : 'Lost') : `Step ${step} of ${view.steps.length}${fixed ? `: ${encounterLabel(fixed)} (${ENCOUNTER_STYLE[fixed.kind].name})` : ''}`
      }
      actions={actions}
    />
  );
}
