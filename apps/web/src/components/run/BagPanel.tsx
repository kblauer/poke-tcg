import { itemText, ITEMS, MAX_CONSUMABLES_PER_RUN } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTRPC } from '../../lib/trpc';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { ItemIcon } from '../ItemIcon';
import { RunSection } from './RunSection';

/**
 * Why no consumable can be used in the run now, or null: 3 per run at most, used before a battle starts, and one at a time
 * (another waits until the one in effect has run out). As USE_ITEM checks, for the Bag and the Inventory's tiles.
 */
export function consumableProblem(view: RunViewData): string | null {
  if (view.consumablesUsed >= MAX_CONSUMABLES_PER_RUN) return `Only ${MAX_CONSUMABLES_PER_RUN} consumables per run`;
  if (view.encounter && 'gameId' in view.encounter && view.encounter.gameId) return 'Use consumables before a battle starts';
  const active = view.consumables[0];
  if (active) return `${ITEMS[active.itemId]?.name ?? 'A consumable'} is still active (${active.battlesLeft} battle${active.battlesLeft === 1 ? '' : 's'} left)`;
  return null;
}

/** The Bag: the consumables and misc items you own, and why each can't be used now (null when it can). */
function useBag(view: RunViewData) {
  const trpc = useTRPC();
  const inventory = useQuery(trpc.run.inventory.queryOptions());
  const usable = (inventory.data?.items ?? []).filter((i) => i.category === 'consumable' || i.category === 'misc');
  const why = (i: (typeof usable)[number]) => {
    if (i.category === 'consumable') return consumableProblem(view);
    if (i.perRun !== undefined && (view.itemUses[i.id] ?? 0) >= i.perRun) return 'Used up for this run';
    return null;
  };
  return { usable, why };
}

/**
 * The consumables and misc items you own, with a Use button each: consumables last a number of battles
 * (consumableProblem: 3 per run at most, before a battle starts, one at a time), misc items keep their own per-run limits.
 * Its heading folds it away (RunSection).
 */
export function BagPanel({ view, run }: { view: RunViewData; run: RunControl }) {
  const { usable, why } = useBag(view);
  if (!usable.length) return null;
  return (
    <RunSection id="bag" title="Bag" count={usable.reduce((n, i) => n + i.quantity, 0)} className="rounded-lg bg-slate-800 p-3 ring-1 ring-slate-700">
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
      {run.error && <p className="mt-2 text-xs text-red-400">{run.error}</p>}
    </RunSection>
  );
}

/**
 * The Bag on the run screen (the user's, beside the cards unlocked this run, RunDeckPanel), as Black 2 and White 2's
 * Bag: a list of the consumables and misc items with their counts, scrolled through (arrow keys too), the one clicked
 * outlined in the theme's accent; along the bottom, that item's picture (ItemIcon) in a frame, what it does and its Use
 * button (useBag's rules, as BagPanel's).
 */
export function BagGrid({ view, run }: { view: RunViewData; run: RunControl }) {
  const { usable, why } = useBag(view);
  const [picked, setPicked] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // The first item until one is clicked (or the one clicked is used up).
  const item = usable.find((i) => i.id === picked) ?? usable[0];
  const pick = (id: string) => {
    setPicked(id);
    list.current?.querySelector(`[data-item="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const step = (by: 1 | -1) => {
    const at = usable.findIndex((i) => i === item);
    const next = usable[at + by];
    if (next) pick(next.id);
  };
  const problem = item && why(item);
  return (
    <div className="flex h-full flex-col gap-3">
      <h3 className="text-lg font-semibold">
        Bag <span className="text-sm font-normal text-slate-400">({usable.reduce((n, i) => n + i.quantity, 0)})</span>
      </h3>
      {!item ? (
        <p className="text-sm text-slate-400">Your bag is empty: buy consumables and misc items in the shop after a run.</p>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-700">
          <ul
            ref={list}
            role="listbox"
            aria-label="Bag"
            tabIndex={0}
            className="h-52 space-y-0.5 overflow-y-auto p-2 outline-none"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              step(e.key === 'ArrowDown' ? 1 : -1);
            }}
          >
            {usable.map((i) => (
              <li key={i.id} data-item={i.id} role="option" aria-selected={i === item}>
                <button
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition ${i === item ? 'bg-slate-800 text-slate-50 ring-2 ring-yellow-300/80' : 'text-slate-300 hover:bg-slate-800/60'}`}
                  onClick={() => pick(i.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-slate-400">×{i.quantity}</span>
                </button>
              </li>
            ))}
          </ul>
          {/* The picked item along the bottom: its picture, what it does, and Use. */}
          <div className="flex items-center gap-3 border-t border-slate-700 bg-slate-800 p-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-slate-950 ring-1 ring-slate-600">
              <ItemIcon id={item.id} />
            </span>
            <p className="min-w-0 flex-1 text-sm leading-snug text-slate-200">{itemText(item)}</p>
            <button
              className="shrink-0 rounded bg-slate-600 px-3 py-1 text-sm font-semibold transition hover:bg-slate-500 disabled:opacity-40"
              disabled={run.busy || !!problem}
              title={problem ?? `Use ${item.name}`}
              onClick={() => run.applyItem(item.id)}
            >
              Use
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
