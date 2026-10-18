import { itemText, MAX_CONSUMABLES_PER_RUN } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
import type { RunControl, RunViewData } from '../../hooks/useRun';

/**
 * The consumables and misc items you own, with a Use button each: consumables last a number of battles
 * (3 per run at most, used before a battle starts), misc items keep their own per-run limits.
 */
export function BagPanel({ view, run }: { view: RunViewData; run: RunControl }) {
  const trpc = useTRPC();
  const inventory = useQuery(trpc.run.inventory.queryOptions());
  const usable = (inventory.data?.items ?? []).filter((i) => i.category === 'consumable' || i.category === 'misc');
  if (!usable.length) return null;
  const why = (i: (typeof usable)[number]) => {
    if (i.category === 'consumable' && view.consumablesUsed >= MAX_CONSUMABLES_PER_RUN) return `Only ${MAX_CONSUMABLES_PER_RUN} consumables per run`;
    if (i.category === 'consumable' && view.encounter && 'gameId' in view.encounter && view.encounter.gameId) return 'Use consumables before a battle starts';
    if (i.perRun !== undefined && (view.itemUses[i.id] ?? 0) >= i.perRun) return 'Used up for this run';
    return null;
  };
  return (
    <div className="space-y-2 rounded-lg bg-slate-800 p-3 ring-1 ring-slate-700">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bag</h3>
      <ul className="space-y-1 text-sm">
        {usable.map((i) => (
          <li key={i.id} className="flex items-center gap-2" title={itemText(i)}>
            <span className="min-w-0 flex-1 truncate">
              {i.name} <span className="text-slate-500">×{i.quantity}</span>
            </span>
            <button
              className="rounded bg-slate-600 px-2 py-0.5 text-xs transition hover:bg-slate-500 disabled:opacity-40"
              disabled={run.busy || !!why(i)}
              title={why(i) ?? undefined}
              onClick={() => run.applyItem(i.id)}
            >
              Use
            </button>
          </li>
        ))}
      </ul>
      {run.error && <p className="text-xs text-red-400">{run.error}</p>}
    </div>
  );
}
