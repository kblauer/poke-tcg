import { EQUIP_SLOTS, fitsSlot, ITEMS, SLOT_LABELS, type ItemCategory } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';

const SECTIONS: { category: ItemCategory; title: string; hint: string }[] = [
  { category: 'consumable', title: 'Consumables', hint: 'Used from the Bag during a run; each lasts a number of battles. 3 per run.' },
  { category: 'misc', title: 'Misc items', hint: 'Used from the Bag during a run; some are used up, some have a limit per run.' },
  { category: 'key', title: 'Key items', hint: 'Records of what you have done. They stay forever.' },
  { category: 'equipment', title: 'Equipment', hint: 'Equip pieces in the slots above.' },
];

/** The account's items by category, the equipment slots (head, chest, legs, Poké Ball, 2 accessories) and unlocked cards. */
export function InventoryPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const inventory = useQuery(trpc.run.inventory.queryOptions());
  const equip = useMutation(trpc.run.equip.mutationOptions({ onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() }) }));
  if (inventory.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{inventory.error.message}</p>;
  if (!inventory.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const { items, equipment, unlockedCards } = inventory.data;

  return (
    <div className={`${PAGE_WIDTH} mx-auto max-w-5xl space-y-6`}>
      <p className="text-sm text-slate-400">
        Unlocked cards: {unlockedCards.total} ({unlockedCards.distinct} different), for the deck builder to come. Item effects aren't implemented yet.
      </p>
      {equip.error && <p className="text-sm text-red-400">{equip.error.message}</p>}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Equipped</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EQUIP_SLOTS.map((slot) => {
            const options = items.filter((i) => fitsSlot(i, slot));
            const current = equipment[slot];
            return (
              <label key={slot} className="space-y-1 rounded-lg bg-slate-800 p-3 text-sm ring-1 ring-slate-700">
                <span className="text-xs uppercase tracking-wide text-slate-500">{SLOT_LABELS[slot]}</span>
                <select
                  className="w-full rounded bg-slate-900 px-2 py-1 ring-1 ring-slate-600 focus:outline-none"
                  value={current ?? ''}
                  disabled={equip.isPending}
                  onChange={(e) => equip.mutate({ slot, itemId: e.target.value || null })}
                >
                  <option value="">Empty</option>
                  {options.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                {current && <span className="block text-xs text-slate-400">{ITEMS[current]?.effects?.join('. ')}</span>}
              </label>
            );
          })}
        </div>
      </section>

      {SECTIONS.map(({ category, title, hint }) => {
        const owned = items.filter((i) => i.category === category);
        return (
          <section key={category} className="space-y-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-slate-500">{hint}</p>
            {owned.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {owned.map((i) => (
                  <li key={i.id} className="rounded bg-slate-800 p-3 text-sm ring-1 ring-slate-700">
                    <span className="font-semibold">{i.name}</span> <span className="text-slate-500">×{i.quantity}</span>
                    <p className="text-xs text-slate-400">{i.effects?.join('. ') ?? i.description}</p>
                  </li>
                ))}
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
