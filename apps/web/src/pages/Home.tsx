import { runType } from '@poke-tcg/campaign';
import { useEffect, useRef } from 'react';
import { PanelTabs } from '../components/LogDrawer';
import { PageHeader } from '../components/PageHeader';
import { PreviewProvider } from '../components/PreviewProvider';
import { RunDeckPanel } from '../components/run/RunDeckPanel';
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
import { useRunMusic } from '../hooks/useRunMusic';
import { useWindowFill } from '../hooks/useWindowFill';
import { PAGE_WIDTH } from '../utils/layout';

/**
 * The run hub, laid out like the game: the page within the same side margins, filling the window (on a big screen the
 * run's numbers and its log are in the site menu, NavRail). The page has the run's map and its encounter with the deck below; after a run, its
 * results, the shop and the next run. A run whose type has routes (Pewter City: Route 2) shows them instead of the
 * icon map: zoomed in on the step's spot, alone in the top row, with the encounter, the cards unlocked and Concede below.
 * A new account is set up with its first run on the first visit.
 * On a phone (useIsPhone) the run's numbers and log are in the site's ☰ panel, as on a big screen (PhoneNavRun); with a
 * route map they're also under the deck choice (or the encounter) (PanelTabs).
 */
export function HomePage() {
  const run = useRun();
  const fill = useWindowFill<HTMLDivElement>();
  const phone = useIsPhone();
  const { overview } = run;
  // Auto play follows the run: the route, the town, the gym, a Pokémon Center.
  useRunMusic(overview.data?.run?.view);
  // On a phone, once an encounter is over (its reward taken), the page scrolls back up to the route map, to watch the
  // player walk on to the next spot.
  const routeMap = useRef<HTMLDivElement>(null);
  const phase = overview.data?.run?.view.phase;
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phone && phase === 'map' && lastPhase.current === 'encounter') routeMap.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    lastPhase.current = phase;
  }, [phase, phone]);
  // A failed refetch keeps the run screen (and the map's walk) up with what it has.
  if (overview.error && !overview.data) return <p className={`${PAGE_WIDTH} text-red-400`}>{overview.error.message}</p>;
  if (!overview.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const current = overview.data.run;
  const view = current?.view;
  // The phone's side panel tabs: the run (HP, ₱, EXP, items) and its log (on a big screen both are in the site menu, NavRail).
  const sidePanel = {
    log: (view?.log ?? []).map((text) => ({ text, player: null })),
    you: 'player',
    logTitle: 'Run log',
    run: view && <RunStats view={view} account={overview.data.account} run={run} />,
  } as const;
  const routes = view ? runType(view.type).routes : undefined;
  // On a phone, under a route map, the side panel's tabs are in the panel below it (PanelTabs, collapsible to its tab row):
  // under the deck choice, or under the encounter.
  const inline = !!routes && !!view && view.phase !== 'won' && view.phase !== 'lost';
  const tabs = inline && phone && <PanelTabs {...sidePanel} collapsible />;
  // The next encounter (or the one under way), the cards unlocked this run, and Concede below them, out of the way.
  const panels = view && (
    <div className="min-w-0 space-y-6">
      {view.phase === 'map' ? (
        // A new step starts with the run's deck picked again.
        <RouteChoice key={view.position} view={view} run={run} side={tabs || undefined} />
      ) : tabs && phone ? (
        <>
          <EncounterPanel view={view} run={run} />
          {tabs}
        </>
      ) : tabs ? (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="min-w-0">
            <EncounterPanel view={view} run={run} />
          </div>
          {/* As tall as the encounter (at least 24rem), never taller: the log scrolls inside it. */}
          <div className="relative min-h-96">
            <div className="absolute inset-0">{tabs}</div>
          </div>
        </div>
      ) : (
        <EncounterPanel view={view} run={run} />
      )}
      <RunDeckPanel view={view} />
      {view.phase === 'map' && <ConcedeRun view={view} run={run} />}
    </div>
  );

  return (
    // -mt/-mb undo the layout's spacing, as on the game page, so the page fills the window from the header to the bottom.
    // Cards show the large hover preview; the wheel still scrolls the page.
    <PreviewProvider scrollZoom={false}>
      <div ref={fill.ref} className="-mb-4 -mt-6 flex" style={fill.style}>
        <div className={`min-w-0 flex-1 space-y-6 overflow-y-auto pb-4 pt-6 ${PAGE_WIDTH}`}>
          {run.error && <p className="rounded bg-red-400 px-3 py-2 text-sm font-medium text-slate-900">{run.error}</p>}
          {!current || !view ? (
            <>
              <PageHeader title="Play" />
              <NewRunPicker overview={overview.data} run={run} title="Start a run" />
            </>
          ) : (
            <>
              <RunHeader view={view} />
              {view.phase === 'won' || view.phase === 'lost' ? (
                <RunOver current={current} overview={overview.data} run={run} />
              ) : routes ? (
                <>
                  <div ref={routeMap}>
                    <RouteView routes={routes} gym={runType(view.type).gym} view={view} spotted={run.spotted} gender={overview.data.playerGender} />
                  </div>
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
      </div>
    </PreviewProvider>
  );
}
