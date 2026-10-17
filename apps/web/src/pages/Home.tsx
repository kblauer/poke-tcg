import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { LogDrawer } from '../components/LogDrawer';
import { PreviewProvider } from '../components/PreviewProvider';
import { DeckPanel } from '../components/run/DeckPanel';
import { EncounterPanel } from '../components/run/EncounterPanel';
import { NewRunPicker } from '../components/run/NewRunPicker';
import { RunHeader } from '../components/run/RunHeader';
import { RunMap } from '../components/run/RunMap';
import { RunOver } from '../components/run/RunOver';
import { RunStats } from '../components/run/RunStats';
import { useRun } from '../hooks/useRun';
import { useWindowFill } from '../hooks/useWindowFill';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';

/**
 * The run hub, laid out like the game: the page within the same side margins, filling the window, with
 * the side panel at the window's edge (its Run tab has HP, ₱, EXP, consumables and the Bag; its log tab
 * the run log). The page has the run's map and its encounter with the deck below; after a run, its
 * results, the shop and the next run. A new account is set up with its first run on the first visit.
 */
export function HomePage() {
  const run = useRun();
  const fill = useWindowFill<HTMLDivElement>();
  const { overview } = run;
  if (overview.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{overview.error.message}</p>;
  if (!overview.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const current = overview.data.run;
  const view = current?.view;

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
              ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[23rem_1fr]">
                  <RunMap view={view} run={run} />
                  <div className="min-w-0 space-y-6">
                    {view.phase === 'map' ? (
                      <p className="rounded-lg bg-slate-800 p-5 text-slate-300 ring-1 ring-slate-600">
                        Choose your next encounter on the map: the highlighted step. You climb from the bottom to the run's last boss at the top.
                      </p>
                    ) : (
                      <EncounterPanel view={view} run={run} />
                    )}
                    <DeckPanel view={view} />
                  </div>
                </div>
              )}
            </>
          )}
          <PracticeGame />
        </div>
        <LogDrawer
          log={(view?.log ?? []).map((text) => ({ text, player: null }))}
          you="player"
          logTitle="Run log"
          run={view && <RunStats view={view} account={overview.data.account} run={run} />}
        />
      </div>
    </PreviewProvider>
  );
}

/**
 * Practice battles outside the run, against the CPU's Rock Crusher deck: with one of your decks (those that
 * can be played), or with the fixed Base Set test deck.
 */
function PracticeGame() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const toGame = ({ id }: { id: string }) => navigate({ to: '/game/$gameId', params: { gameId: id } });
  const decks = useQuery(trpc.decks.list.queryOptions());
  const [deckId, setDeckId] = useState('');
  const create = useMutation(trpc.game.create.mutationOptions({ onSuccess: toGame }));
  const createTest = useMutation(trpc.game.createTest.mutationOptions({ onSuccess: toGame }));
  const starting = create.isPending || createTest.isPending;
  const error = create.error?.message ?? createTest.error?.message;
  const playable = (decks.data ?? []).filter((d) => d.problems.length === 0);
  const chosen = deckId || playable[0]?.id || '';
  const button = 'rounded bg-slate-800 px-3 py-1 text-slate-300 hover:bg-slate-700 disabled:opacity-50';
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4 text-sm text-slate-500">
      <span>Practice outside the run:</span>
      {playable.length > 0 && (
        <>
          <select className="rounded bg-slate-800 px-2 py-1 text-slate-300" value={chosen} onChange={(e) => setDeckId(e.target.value)} aria-label="Practice deck">
            {playable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button className={button} disabled={starting || !chosen} onClick={() => create.mutate({ deckId: chosen })}>
            Battle with this deck
          </button>
          <span>or</span>
        </>
      )}
      <button className={button} disabled={starting} onClick={() => createTest.mutate()}>
        {createTest.isPending ? 'Starting…' : 'Test deck'}
      </button>
      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}
