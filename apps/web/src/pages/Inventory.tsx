import { itemText, type ItemCategory } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BADGE_IDS, BadgeCases } from '../components/BadgeCases';
import { EquipmentPanel } from '../components/EquipmentPanel';
import { ItemIcon } from '../components/ItemIcon';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';

const SECTIONS: { category: ItemCategory; title: string; hint: string }[] = [
  { category: 'consumable', title: 'Consumables', hint: 'Used from the Bag during a run; each lasts a number of battles. 3 per run.' },
  { category: 'misc', title: 'Misc items', hint: 'Used from the Bag during a run; some are used up, some have a limit per run.' },
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
  // Errors show above the panel (equip.error), so a failed equip needn't throw.
  const onEquip = (slot: Parameters<typeof equip.mutate>[0]['slot'], itemId: string | null) => equip.mutateAsync({ slot, itemId }).catch(() => {});
  if (inventory.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{inventory.error.message}</p>;
  if (!inventory.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const { items, equipment, trainerSprite } = inventory.data;

  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      {(equip.error ?? setSprite.error) && <p className="text-sm text-red-400">{(equip.error ?? setSprite.error)!.message}</p>}

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
            {owned.length || cases ? (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cases && <BadgeCases owned={new Set(items.map((i) => i.id))} />}
                {owned.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded bg-slate-800 p-3 text-sm ring-1 ring-slate-700">
                    <ItemIcon id={i.id} />
                    <div className="min-w-0">
                      <span className="font-semibold">{i.name}</span> <span className="text-slate-500">×{i.quantity}</span>
                      <p className="text-xs text-slate-400">{itemText(i)}</p>
                    </div>
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
