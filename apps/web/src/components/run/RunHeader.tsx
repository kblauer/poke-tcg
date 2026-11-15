import { ENCOUNTER_STYLE, encounterLabel } from './encounterIcons';
import { routeAt, RUN_TYPE_INFO, type RunMaps } from '@poke-tcg/campaign';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useRunMaps } from '../../hooks/useRunMaps';
import type { ReactNode } from 'react';
import type { RunViewData } from '../../hooks/useRun';
import { PageHeader } from '../PageHeader';

/** The run's name, the map its step is on and how far along it is (and who's next, at a Gym Trainer or boss). The page's heading (PageHeader). Its numbers (HP, ₱, EXP…) are in the site menu (RunStats). */
export function RunHeader({ view, actions }: { view: RunViewData; actions?: ReactNode }) {
  const phone = useIsPhone();
  const step = Math.min(view.position + 1, view.steps.length);
  const next = view.steps[view.position]?.options;
  const fixed = next?.length === 1 ? next[0]! : null;
  const over = view.phase === 'won' || view.phase === 'lost';
  // The run's maps (useRunMaps, shared with the run screen): the heading names none until they're loaded.
  const { maps } = useRunMaps(over ? undefined : view.type);
  const map = over || !maps ? null : mapAt(view, maps);
  const progress = `Step ${step} of ${view.steps.length}${fixed ? `: ${encounterLabel(fixed)} (${ENCOUNTER_STYLE[fixed.kind].name})` : ''}`;
  return (
    <PageHeader
      title={RUN_TYPE_INFO[view.type].name}
      // The map the step is on beside the run's name (the user's; the step is in the map's caption), on a phone all on one
      // line with Return to Play; a run with no route maps says how far along it is instead.
      info={
        over ? (
          view.phase === 'won' ? 'Victory!' : view.conceded ? 'Conceded' : 'Lost'
        ) : (
          <>
            {map ? <span className="font-semibold text-slate-200">{map}</span> : maps ? progress : null}
          </>
        )
      }
      actions={actions}
      oneLine={phone}
    />
  );
}

/** The name of the map a run's step is on (a route's, or its gym's: the run's last steps), or null for a run with no route maps. */
function mapAt(view: RunViewData, maps: RunMaps): string | null {
  if (!maps.routes.length) return null;
  if (maps.gym && view.position >= view.steps.length - maps.gym.spots.length) return maps.gym.name;
  return (routeAt(maps, view.position)?.route ?? maps.routes.at(-1)!).name;
}
