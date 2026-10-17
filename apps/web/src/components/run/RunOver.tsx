import { finalBoss, ITEMS, runType } from '@poke-tcg/campaign';
import type { ClientRun, Overview, RunControl } from '../../hooks/useRun';
import { ItemShop } from './ItemShop';
import { NewRunPicker } from './NewRunPicker';
import { RunCard } from './RunCard';

/**
 * After a run. Beaten: the EXP it earned, the cards gained in it (already unlocked in the deck builder) and
 * the badges it won, then the shop, then the next run. Lost: start over, or (for testing) carry on with full HP.
 */
export function RunOver({ current, overview, run }: { current: ClientRun; overview: Overview; run: RunControl }) {
  const view = current.view;
  const type = runType(view.type);
  const last = finalBoss(type);
  const won = (view.badges ?? []).map((id) => ITEMS[id]?.name).filter(Boolean);
  if (view.phase === 'lost') {
    return (
      <div className="space-y-4">
        <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-rose-700">
          <h3 className="text-lg font-semibold text-rose-300">Out of HP: the run is over</h3>
          <p className="text-sm text-slate-300">
            You made it to encounter {Math.min(view.position + 1, view.steps.length)} of {view.steps.length}. The cards you gained stay unlocked in the deck builder.
          </p>
          <button className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold transition hover:bg-amber-500 active:scale-95 disabled:opacity-40" disabled={run.busy} onClick={() => run.retry()}>
            Retry with 3 HP (testing)
          </button>
        </section>
        <NewRunPicker overview={overview} run={run} title="Start over" defaultType={view.type} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-yellow-500">
        <h3 className="text-lg font-semibold text-yellow-300">
          You beat {last.title} {last.name}!
        </h3>
        <p className="text-sm text-slate-300">
          +{view.exp} EXP{won.length > 0 && ` · ${won.join(', ')}`} · ₱{view.pokedollars} left (banked when you start your next run)
        </p>
        {view.gained.length > 0 ? (
          <>
            <p className="text-sm text-slate-400">Cards you gained (unlocked on the Decks tab):</p>
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
      <ItemShop />
      <NewRunPicker overview={overview} run={run} title="Next run" />
    </div>
  );
}
