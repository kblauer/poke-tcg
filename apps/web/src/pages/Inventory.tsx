import { itemText, ITEMS, MAX_CONSUMABLES_PER_RUN, type ItemCategory, type ItemDef } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BADGE_IDS, BadgeCases } from '../components/BadgeCases';
import { EquipmentPanel } from '../components/EquipmentPanel';
import { ItemIcon } from '../components/ItemIcon';
import { PageHeader } from '../components/PageHeader';
import { consumableProblem } from '../components/run/BagPanel';
import { useEscape } from '../hooks/useEscape';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';
import { DIALOG, DIALOG_BACKDROP } from '../utils/styles';

type OwnedItem = ItemDef & { quantity: number };

/**
 * Every section's tiles are the same size: as many columns as fit (each at least 15rem, sharing the row's width), every
 * tile one height, its description cut to 2 lines (the whole of it on hover).
 */
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2';
const ITEM_TILE = 'flex h-[5.25rem] items-center gap-3 rounded bg-slate-800 p-3 text-sm ring-1 ring-slate-700';

const SECTIONS: { category: ItemCategory; title: string; hint: string }[] = [
  { category: 'consumable', title: 'Consumables', hint: 'Used from the Bag during a run; each lasts a number of battles. 3 per run.' },
  { category: 'misc', title: 'Miscellaneous items', hint: 'Used from the Bag during a run; some are used up, some have a limit per run.' },
  { category: 'key', title: 'Key items', hint: 'Records of what you have done. They stay forever. Open a badge case to see its badges.' },
];

/**
 * The account's equipment (EquipmentPanel: the trainer with its slots, and the pieces to drag onto them), its other items
 * by category, each with its picture (the key items' badges in a badge case per generation, BadgeCases).
 */
export function InventoryPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const inventory = useQuery(trpc.run.inventory.queryOptions());
  const equip = useMutation(trpc.run.equip.mutationOptions({ onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() }) }));
  const setSprite = useMutation(trpc.run.setTrainerSprite.mutationOptions({ onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() }) }));
  // The player's sprite on the run maps: the run screen reads it from run.overview.
  const setGender = useMutation(
    trpc.run.setPlayerGender.mutationOptions({
      onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() }), queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() })]),
    }),
  );
  // Errors show above the panel (equip.error), so a failed equip needn't throw.
  const onEquip = (slot: Parameters<typeof equip.mutate>[0]['slot'], itemId: string | null) => equip.mutateAsync({ slot, itemId }).catch(() => {});
  // The run under way (if any), whose rules say whether a consumable can be used now, and the consumable clicked (asked
  // about first): used in that run, or kept for the next one (run.useConsumable).
  const overview = useQuery(trpc.run.overview.queryOptions());
  const [using, setUsing] = useState<OwnedItem | null>(null);
  const useConsumable = useMutation(
    trpc.run.useConsumable.mutationOptions({
      onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() }), queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() })]),
    }),
  );
  if (inventory.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{inventory.error.message}</p>;
  if (!inventory.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const { items, equipment, trainerSprite, playerGender, pendingConsumables } = inventory.data;
  const current = overview.data?.run;
  const activeRun = current?.status === 'ACTIVE' ? current : null;
  // Used between runs: no longer in the inventory, waiting for the next run (at most its 3).
  const waiting = pendingConsumables.map((id) => ITEMS[id]?.name ?? id);

  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      <PageHeader title="Inventory" />
      {(equip.error ?? setSprite.error ?? setGender.error ?? useConsumable.error) && <p className="text-sm text-red-400">{(equip.error ?? setSprite.error ?? setGender.error ?? useConsumable.error)!.message}</p>}
      {using && (
        <UseConsumableDialog
          item={using}
          // In a run: its rules (consumableProblem); between runs: only one can wait for the next run.
          problem={!overview.data ? 'Loading…' : activeRun ? consumableProblem(activeRun.view) : waiting.length >= MAX_CONSUMABLES_PER_RUN ? `${MAX_CONSUMABLES_PER_RUN} consumables are already waiting for your next run (${MAX_CONSUMABLES_PER_RUN} per run)` : null}
          note={activeRun ? undefined : `No run is under way: it takes effect when your next run starts, with any others waiting, as one of its ${MAX_CONSUMABLES_PER_RUN} consumables.`}
          busy={useConsumable.isPending}
          onUse={() => {
            useConsumable.mutate({ itemId: using.id });
            setUsing(null);
          }}
          onClose={() => setUsing(null)}
        />
      )}

      {/* EquipmentPanel heads itself ("Equipped"), level with its hint over the item grid. */}
      <section>
        <EquipmentPanel
          items={items}
          equipment={equipment}
          busy={equip.isPending}
          onEquip={onEquip}
          // Shown at once, before the server has it.
          sprite={setSprite.isPending ? setSprite.variables.sprite : trainerSprite}
          onSprite={(sprite) => setSprite.mutate({ sprite })}
          gender={setGender.isPending ? setGender.variables.gender : playerGender}
          onGender={(gender) => setGender.mutate({ gender })}
        />
      </section>

      {SECTIONS.map(({ category, title, hint }) => {
        // Badges are kept in their generation's badge case, listed first among the key items.
        const owned = items.filter((i) => i.category === category && !BADGE_IDS.has(i.id));
        const cases = category === 'key';
        return (
          <section key={category} className="space-y-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-slate-500">{hint}</p>
            {category === 'consumable' && waiting.length > 0 && (
              <p className="text-sm text-yellow-300">
                Waiting for your next run ({waiting.length}/{MAX_CONSUMABLES_PER_RUN}): {waiting.join(', ')}. They take effect when it starts.
              </p>
            )}
            {owned.length || cases ? (
              <ul className={GRID}>
                {cases && <BadgeCases owned={new Set(items.map((i) => i.id))} tile={ITEM_TILE} />}
                {owned.map((i) => {
                  const body = (
                    <>
                      <ItemIcon id={i.id} className="shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate">
                          <span className="font-semibold">{i.name}</span> <span className="text-slate-500">×{i.quantity}</span>
                        </p>
                        <p className="line-clamp-2 text-xs text-slate-400">{itemText(i)}</p>
                      </div>
                    </>
                  );
                  return (
                    <li key={i.id} title={`${i.name}: ${itemText(i)}`}>
                      {/* A consumable is used from here too, after a confirmation (UseConsumableDialog). */}
                      {category === 'consumable' ? (
                        <button className={`${ITEM_TILE} w-full text-left transition hover:bg-slate-700/60 hover:ring-slate-500`} onClick={() => setUsing(i)}>
                          {body}
                        </button>
                      ) : (
                        <div className={ITEM_TILE}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">None yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * "Use a X Attack?": clicking a consumable on the Inventory asks first, then `onUse` uses it (in the run under way, or
 * kept for the next run, with `note` saying so). When it can't be used now (`problem`: one in effect, 3 used or waiting,
 * a battle under way), it says why instead. Escape or a click outside closes it.
 */
function UseConsumableDialog({
  item,
  problem,
  note,
  busy,
  onUse,
  onClose,
}: {
  item: OwnedItem;
  problem: string | null;
  note?: string;
  busy: boolean;
  onUse: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const article = /^[aeiou]/i.test(item.name) ? 'an' : 'a';
  return (
    <div className={`${DIALOG_BACKDROP} z-[1100]`} onClick={onClose}>
      <section role="dialog" aria-label={`Use ${item.name}`} className={`${DIALOG} w-full max-w-sm space-y-3 p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <ItemIcon id={item.id} className="shrink-0" />
          <h3 className="text-lg font-semibold">
            Use {article} {item.name}?
          </h3>
        </div>
        <p className="text-sm text-slate-300">{itemText(item)}</p>
        {problem ? <p className="text-sm text-amber-300">{problem}</p> : note && <p className="text-sm text-slate-400">{note}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded bg-slate-600 px-4 py-1.5 text-sm transition hover:bg-slate-500" onClick={onClose}>
            {problem ? 'Close' : 'Cancel'}
          </button>
          {!problem && (
            <button
              className="rounded bg-slate-600 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-500 disabled:opacity-40"
              disabled={busy}
              onClick={onUse}
            >
              Use
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
