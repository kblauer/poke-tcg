import ListAltIcon from '@mui/icons-material/ListAlt';
import { runType } from '@poke-tcg/campaign';
import { useState } from 'react';
import { LogDrawer, LogSheet } from '../components/LogDrawer';
import { PreviewProvider } from '../components/PreviewProvider';
import { DeckPanel } from '../components/run/DeckPanel';
import { EncounterPanel } from '../components/run/EncounterPanel';
import { NewRunPicker } from '../components/run/NewRunPicker';
import { RunHeader } from '../components/run/RunHeader';
import { ConcedeRun } from '../components/run/ConcedeRun';
import { RouteChoice } from '../components/run/RouteChoice';
import { RunMap } from '../components/run/RunMap';
import { RouteView } from '../components/run/RouteView';
import { RunOver } from '../components/run/RunOver';
import { RunStats } from '../components/run/RunStats';
import { useIsPhone } from '../hooks/useIsPhone';
import { useRun } from '../hooks/useRun';
import { useWindowFill } from '../hooks/useWindowFill';
import { PAGE_WIDTH } from '../utils/layout';

/**
 * The run hub, laid out like the game: the page within the same side margins, filling the window, with
 * the side panel at the window's edge (its Run tab has HP, ₱, EXP, consumables and the Bag; its log tab
 * the run log). The page has the run's map and its encounter with the deck below; after a run, its
 * results, the shop and the next run. A run whose type has routes (Pewter City: Route 2) shows them instead of the
 * icon map: zoomed in on the step's spot, alone in the top row, with the encounter, the cards unlocked and Concede below.
 * A new account is set up with its first run on the first visit.
 * On a phone (useIsPhone) the side panel is a round button floating in the top right corner instead, which opens its
 * tabs full screen (LogSheet, as on the phone's battle screen).
 */
export function HomePage() {
  const run = useRun();
  const fill = useWindowFill<HTMLDivElement>();
  const phone = useIsPhone();
  /** On a phone: the side panel's tabs are open. */
  const [panel, setPanel] = useState(false);
  const { overview } = run;
  if (overview.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{overview.error.message}</p>;
  if (!overview.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const current = overview.data.run;
  const view = current?.view;
  // The side panel's tabs: the run (HP, ₱, EXP, items) and its log.
  const sidePanel = {
    log: (view?.log ?? []).map((text) => ({ text, player: null })),
    you: 'player',
    logTitle: 'Run log',
    run: view && <RunStats view={view} account={overview.data.account} run={run} />,
  } as const;
  const routes = view ? runType(view.type).routes : undefined;
  // The next encounter (or the one under way), the cards unlocked this run, and Concede below them, out of the way.
  const panels = view && (
    <div className="min-w-0 space-y-6">
      {view.phase === 'map' ? (
        // A new step starts with the run's deck picked again.
        <RouteChoice key={view.position} view={view} run={run} iconMap={!routes} />
      ) : (
        <EncounterPanel view={view} run={run} />
      )}
      <DeckPanel view={view} />
      {view.phase === 'map' && <ConcedeRun view={view} run={run} />}
    </div>
  );

  return (
    // -mt/-mb undo the layout's spacing, as on the game page, so the side panel runs from the header to the bottom.
    // Cards show the large hover preview; the wheel still scrolls the page.
    <PreviewProvider scrollZoom={false}>
      <div ref={fill.ref} className="-mb-4 -mt-6 flex" style={fill.style}>
        <div className={`min-w-0 flex-1 space-y-6 overflow-y-auto pb-4 pt-6 ${PAGE_WIDTH}`}>
          {run.error && <p className="rounded bg-red-400 px-3 py-2 text-sm font-medium text-slate-900">{run.error}</p>}
          {!current || !view ? (
            <NewRunPicker overview={overview.data} run={run} title="Start a run" />
          ) : (
            <>
              <RunHeader view={view} />
              {view.phase === 'won' || view.phase === 'lost' ? (
                <RunOver current={current} overview={overview.data} run={run} />
              ) : routes ? (
                <>
                  <RouteView routes={routes} gym={runType(view.type).gym} view={view} spotted={run.spotted} />
                  {panels}
                </>
              ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[23rem_1fr]">
                  <RunMap view={view} run={run} />
                  {panels}
                </div>
              )}
            </>
          )}
        </div>
        {phone ? (
          <>
            <button
              className="fixed right-3 top-3 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-slate-200 shadow-lg shadow-black/60 ring-1 ring-slate-600 transition active:scale-95"
              onClick={() => setPanel(true)}
              aria-label="The run and its log"
              title="The run and its log"
            >
              <ListAltIcon />
            </button>
            {panel && <LogSheet {...sidePanel} onClose={() => setPanel(false)} />}
          </>
        ) : (
          <LogDrawer {...sidePanel} />
        )}
      </div>
    </PreviewProvider>
  );
}
