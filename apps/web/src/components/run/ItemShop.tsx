import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';

const CATEGORY: Record<string, string> = { consumable: 'Consumable', misc: 'Misc item', key: 'Key item', equipment: 'Equipment' };

/** The post-run shop: items for account EXP. None of them has an effect yet. */
export function ItemShop() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const shop = useQuery(trpc.run.shop.queryOptions());
  const buy = useMutation(
    trpc.run.buyItem.mutationOptions({
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: trpc.run.shop.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
      },
    }),
  );
  if (!shop.data) return null;
  return (
    <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
      <div className="flex items-baseline gap-3">
        <h3 className="text-lg font-semibold">Shop</h3>
        <span className="text-sm text-slate-400">Spend the EXP from your runs. Items have no effects yet.</span>
        <span className="ml-auto font-semibold text-sky-300">{shop.data.exp} EXP</span>
      </div>
      {buy.error && <p className="text-sm text-red-400">{buy.error.message}</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shop.data.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 rounded bg-slate-900 p-3">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{item.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                {CATEGORY[item.category]}
                {item.equip && ` · ${item.equip}`}
              </span>
            </div>
            <p className="flex-1 text-xs text-slate-400">{item.effects?.join('. ') ?? item.description}</p>
            <button
              className="self-start rounded bg-slate-600 px-3 py-1 text-sm transition hover:bg-slate-500 active:scale-95 disabled:opacity-40"
              disabled={buy.isPending || shop.data.exp < item.price!}
              onClick={() => buy.mutate({ itemId: item.id })}
            >
              Buy · {item.price} EXP
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
