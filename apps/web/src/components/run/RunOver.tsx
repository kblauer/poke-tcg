import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { bankablePokedollars, finalBoss, ITEMS, runType } from '@poke-tcg/campaign';
import { useEffect, useState, type ReactNode } from 'react';
import type { ClientRun, Overview, RunControl } from '../../hooks/useRun';
import { ItemShop } from './ItemShop';
import { NewRunPicker } from './NewRunPicker';
import { RunCard } from './RunCard';
import { SaveRunDeck } from './SaveRunDeck';

/** localStorage key: the run whose results the player closed, and which panels (see useClosed). */
const CLOSED_KEY = 'poke-tcg.run-over-closed';
type Panel = 'result' | 'shop';

/**
 * The panels of a beaten run's screen the player closed. They stay closed for this run only: the next run's
 * end shows them full size again. Remembered in the browser, so a reload keeps them closed.
 */
function useClosed(runId: string) {
  const [closed, setClosed] = useState<Panel[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? 'null') as { runId: string; panels: Panel[] } | null;
      return saved?.runId === runId ? saved.panels : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify({ runId, panels: closed }));
    } catch {
      // Not saved (private window or blocked storage): they just open again on the next visit.
    }
  }, [runId, closed]);
  const toggle = (panel: Panel) => setClosed((c) => (c.includes(panel) ? c.filter((p) => p !== panel) : [...c, panel]));
  return { isClosed: (panel: Panel) => closed.includes(panel), toggle };
}

/** The button that closes a panel, at the end of its header. */
const CloseButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button className="flex shrink-0 self-center rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200" onClick={onClick} aria-label={label} title={label}>
    <CloseIcon sx={{ fontSize: 18 }} />
  </button>
);

/** A closed panel: one slim bar with its title and a summary, which opens it again. */
const Minimized = ({ title, summary, onOpen }: { title: ReactNode; summary?: ReactNode; onOpen: () => void }) => (
  <button className="flex w-full items-center gap-3 rounded-lg bg-slate-800 px-4 py-2 text-left text-sm ring-1 ring-slate-600 transition hover:ring-slate-400" onClick={onOpen}>
    <span className="font-semibold">{title}</span>
    {summary && <span className="min-w-0 flex-1 truncate text-slate-400">{summary}</span>}
    <ExpandMoreIcon sx={{ fontSize: 18 }} className="ml-auto shrink-0 text-slate-400" />
  </button>
);

/**
 * After a run. Beaten: the next run first, then the EXP it earned, the cards gained in it (already unlocked in
 * the deck builder) and the badges it won, then the shop. The results and the shop can be closed to a slim bar
 * (see useClosed). Lost: start over, or (for testing) carry on with full HP. Conceded: start over (no retry).
 * Whichever way it ended, SaveRunDeck offers to save the run's deck before the next run.
 */
export function RunOver({ current, overview, run }: { current: ClientRun; overview: Overview; run: RunControl }) {
  const view = current.view;
  const type = runType(view.type);
  const last = finalBoss(type);
  const won = (view.badges ?? []).map((id) => ITEMS[id]?.name).filter(Boolean);
  // The booster packs the run unlocked (its first battle completed, or beating it), from its log.
  const packs = view.log.flatMap((line) => line.match(/^Unlocked (.+) booster packs\.$/)?.slice(1) ?? []);
  const packsNote = packs.length > 0 ? ` Unlocked booster packs: ${packs.join(', ')}.` : '';
  const banked = bankablePokedollars(view);
  const { isClosed, toggle } = useClosed(current.id);
  // Before the next run, which takes the run's deck over if it isn't saved.
  const saveDeck = <SaveRunDeck current={current} saveName={overview.runDeck?.saveName ?? null} />;
  if (view.phase === 'lost' && view.conceded) {
    return (
      <div className="space-y-4">
        <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
          <h3 className="text-lg font-semibold text-slate-200">You conceded the run</h3>
          <p className="text-sm text-slate-300">
            You made it to encounter {Math.min(view.position + 1, view.steps.length)} of {view.steps.length}. The cards you gained stay unlocked in the deck builder.{' '}
            {banked ? `₱${banked} went to your bank.` : 'No battle was completed without conceding it, so no ₱ were banked.'}
            {packsNote}
          </p>
        </section>
        {saveDeck}
        <NewRunPicker overview={overview} run={run} title="Start over" defaultType={view.type} />
      </div>
    );
  }
  if (view.phase === 'lost') {
    return (
      <div className="space-y-4">
        <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-rose-700">
          <h3 className="text-lg font-semibold text-rose-300">Out of HP: the run is over</h3>
          <p className="text-sm text-slate-300">
            You made it to encounter {Math.min(view.position + 1, view.steps.length)} of {view.steps.length}. The cards you gained stay unlocked in the deck builder.{' '}
            {banked ? `₱${banked} went to your bank.` : 'No battle was completed without conceding it, so no ₱ were banked.'}
            {packsNote}
          </p>
          <button className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold transition hover:bg-amber-500 active:scale-95 disabled:opacity-40" disabled={run.busy} onClick={() => run.retry()}>
            Retry with 3 HP (testing)
          </button>
        </section>
        {saveDeck}
        <NewRunPicker overview={overview} run={run} title="Start over" defaultType={view.type} />
      </div>
    );
  }
  const beat = `You beat ${last.title} ${last.name}!`;
  const rewards = `+${view.exp} EXP${won.length > 0 ? ` · ${won.join(', ')}` : ''} · ₱${view.pokedollars} banked${packs.length > 0 ? ` · ${packs.join(', ')} booster packs unlocked` : ''}`;
  return (
    <div className="space-y-4">
      {saveDeck}
      <NewRunPicker overview={overview} run={run} title="Next run" />
      {isClosed('result') ? (
        <Minimized title={<span className="text-yellow-300">{beat}</span>} summary={`${rewards} · ${view.gained.length} cards gained`} onOpen={() => toggle('result')} />
      ) : (
        <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-yellow-500">
          <div className="flex items-start gap-3">
            <h3 className="flex-1 text-lg font-semibold text-yellow-300">{beat}</h3>
            <CloseButton label="Close the results" onClick={() => toggle('result')} />
          </div>
          <p className="text-sm text-slate-300">{rewards}</p>
          {view.gained.length > 0 ? (
            <>
              <p className="text-sm text-slate-400">Cards you gained (unlocked on the Collection tab):</p>
              <div className="flex flex-wrap gap-3">
                {view.gained.map((id, i) => (
                  <RunCard key={i} def={view.cards[id]} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">No new cards this time.</p>
          )}
        </section>
      )}
      {isClosed('shop') ? (
        <Minimized title="Shop" summary="Spend the EXP from your runs" onOpen={() => toggle('shop')} />
      ) : (
        <ItemShop close={<CloseButton label="Close the shop" onClick={() => toggle('shop')} />} />
      )}
    </div>
  );
}
