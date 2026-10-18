import { itemText, onlyOne } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';

const CATEGORY: Record<string, string> = { consumable: 'Consumable', misc: 'Misc item', key: 'Key item', equipment: 'Equipment' };

/**
 * How many the account has: items that stack (consumables, and misc items that are used up) show the count in the
 * Bag (0 too); the rest an Owned badge when there's one (the shop sells only one of each; the count shows for any
 * bought before that rule).
 */
function Owned({ stacks, quantity }: { stacks: boolean; quantity: number }) {
  if (stacks) return <span className={`ml-auto text-xs ${quantity ? 'text-sky-300' : 'text-slate-500'}`}>In your bag: {quantity}</span>;
  if (!quantity) return null;
  return <span className="ml-auto rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Owned{quantity > 1 ? ` ×${quantity}` : ''}</span>;
}

/**
 * The post-run shop: items for account EXP, with how many of each you already have. Equipment and misc items that
 * aren't used up can't be bought again while you have one.
 */
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
        <span className="text-sm text-slate-400">Spend the EXP from your runs. Equip gear on the Inventory tab; use consumables and misc items from the Bag in a run.</span>
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
              <Owned stacks={!onlyOne(item)} quantity={shop.data.owned[item.id] ?? 0} />
            </div>
            <p className="flex-1 text-xs text-slate-400" title={item.description}>
              {itemText(item)}
            </p>
            <button
              className="self-start rounded bg-slate-600 px-3 py-1 text-sm transition hover:bg-slate-500 active:scale-95 disabled:opacity-40"
              // Equipment and misc items that aren't used up: only one each.
              disabled={buy.isPending || shop.data.exp < item.price! || (onlyOne(item) && !!shop.data.owned[item.id])}
              onClick={() => buy.mutate({ itemId: item.id })}
            >
              {onlyOne(item) && shop.data.owned[item.id] ? 'Already owned' : `Buy · ${item.price} EXP`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
