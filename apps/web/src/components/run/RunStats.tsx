import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { EQUIP_SLOTS, ITEMS, itemText, MAX_CONSUMABLES_PER_RUN } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import type { Overview, RunControl, RunViewData } from '../../hooks/useRun';
import { useTRPC } from '../../lib/trpc';
import { BagPanel } from './BagPanel';

const row = 'flex items-center justify-between gap-2 rounded bg-slate-800 px-3 py-1.5';
const label = 'text-xs uppercase tracking-wide text-slate-500';

/**
 * The run tab of the side panel: HP, ₱ (and the bank), the run's EXP and the account's, consumables used,
 * the battle rules and consumables in effect, the equipment worn, the badges won this run, and the Bag.
 */
export function RunStats({ view, account, run }: { view: RunViewData; account: Overview['account']; run: RunControl }) {
  const trpc = useTRPC();
  const inventory = useQuery(trpc.run.inventory.queryOptions());
  const gear = EQUIP_SLOTS.flatMap((slot) => {
    const def = ITEMS[inventory.data?.equipment[slot] ?? ''];
    return def ? [def] : [];
  });
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <div className={row} title={`${view.hp} of ${view.maxHp} HP: losing a battle costs 1`}>
          <span className={label}>HP</span>
          <span className="flex text-rose-400">
            {Array.from({ length: view.maxHp }, (_, i) => (i < view.hp ? <FavoriteIcon key={i} fontSize="small" /> : <FavoriteBorderIcon key={i} fontSize="small" />))}
          </span>
        </div>
        <div className={row} title="₱ to spend in this run; banked when the next run starts">
          <span className={label}>₱</span>
          <span className="font-semibold text-yellow-300">{view.pokedollars}</span>
        </div>
        <div className={row} title="₱ banked from earlier runs">
          <span className={label}>Bank</span>
          <span className="font-semibold text-yellow-200/70">{account.bank}</span>
        </div>
        <div className={row} title="EXP earned this run, added to your account when you beat it">
          <span className={label}>Run EXP</span>
          <span className="font-semibold text-sky-300">{view.exp}</span>
        </div>
        <div className={row} title="Account EXP, spent in the shop after a run">
          <span className={label}>EXP</span>
          <span className="font-semibold">{account.exp}</span>
        </div>
        <div className={row} title={`Consumables used this run (at most ${MAX_CONSUMABLES_PER_RUN})`}>
          <span className={label}>Consumables</span>
          <span className="font-semibold">
            {view.consumablesUsed}/{MAX_CONSUMABLES_PER_RUN}
          </span>
        </div>
      </div>
      {(view.rules.length > 0 || view.consumables.length > 0) && (
        <div className="space-y-1 text-xs">
          <h4 className={label}>In effect</h4>
          {view.rules.map((r, i) => (
            <p key={i} className="rounded bg-violet-800 px-2 py-1">
              {r.label} · {r.battlesLeft} battle{r.battlesLeft === 1 ? '' : 's'}
            </p>
          ))}
          {view.consumables.map((c, i) => (
            <p key={i} className="rounded bg-emerald-800 px-2 py-1" title={ITEMS[c.itemId] && itemText(ITEMS[c.itemId]!)}>
              {ITEMS[c.itemId]?.name} · {c.battlesLeft} battle{c.battlesLeft === 1 ? '' : 's'}
            </p>
          ))}
        </div>
      )}
      {gear.length > 0 && (
        <div className="space-y-1 text-xs">
          <h4 className={label}>Equipped</h4>
          {gear.map((def, i) => (
            <p key={i} className="rounded bg-slate-800 px-2 py-1">
              <span className="font-semibold">{def.name}</span> <span className="text-slate-400">{itemText(def)}</span>
            </p>
          ))}
        </div>
      )}
      {(view.badges ?? []).length > 0 && (
        <div className="space-y-1 text-xs">
          <h4 className={label}>Won this run</h4>
          <p className="flex flex-wrap gap-1">
            {view.badges!.map((id) => (
              <span key={id} className="rounded bg-yellow-700/60 px-2 py-0.5">
                {ITEMS[id]?.name ?? id}
              </span>
            ))}
          </p>
        </div>
      )}
      {view.phase !== 'won' && view.phase !== 'lost' && <BagPanel view={view} run={run} />}
    </div>
  );
}
