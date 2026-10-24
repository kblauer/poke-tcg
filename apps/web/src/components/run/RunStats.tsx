import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { EQUIP_SLOTS, ITEMS, itemText } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import type { Overview, RunControl, RunViewData } from '../../hooks/useRun';
import { useTRPC } from '../../lib/trpc';
import { BagPanel } from './BagPanel';
import { DeltaFloat } from './DeltaFloat';
import { RunSection } from './RunSection';

const row = 'flex items-center justify-between gap-2 rounded bg-slate-800 px-3 py-1.5';
const label = 'text-xs uppercase tracking-wide text-slate-500';

/**
 * The run's numbers, in the site menu on a big screen (NavRail) and the side panel's Run tab on a phone: HP, ₱ (and the bank), the account's Stardust, the run's EXP and the
 * account's, the battle rules and consumables in effect, the equipment worn, the badges won this run, and the Bag. The equipment
 * and the Bag fold away (RunSection). `accountFigures` false: without the bank, Stardust and the account's EXP (the big
 * screen's menu shows them above, NavRail's AccountFigures).
 */
export function RunStats({ view, account, run, accountFigures = true }: { view: RunViewData; account: Overview['account']; run: RunControl; accountFigures?: boolean }) {
  const trpc = useTRPC();
  const inventory = useQuery(trpc.run.inventory.queryOptions());
  const stardust = useQuery(trpc.packs.stardust.queryOptions());
  const gear = EQUIP_SLOTS.flatMap((slot) => {
    const def = ITEMS[inventory.data?.equipment[slot] ?? ''];
    return def ? [def] : [];
  });
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <div className={row} title={`${view.hp} of ${view.maxHp} HP: losing a battle costs 1`}>
          <span className={label}>HP</span>
          <span className="relative flex text-rose-400">
            {/* A change floats up beside the number (DeltaFloat), as for ₱ below. */}
            <DeltaFloat value={view.hp} format={(n) => `${n} HP`} place="right-full top-1/2 -mt-2.5 mr-2" />
            {Array.from({ length: view.maxHp }, (_, i) => (i < view.hp ? <FavoriteIcon key={i} fontSize="small" /> : <FavoriteBorderIcon key={i} fontSize="small" />))}
          </span>
        </div>
        <div className={row} title="₱ to spend in this run; banked when the run ends">
          <span className={label}>₱</span>
          <span className="relative font-semibold text-yellow-300">
            <DeltaFloat value={view.pokedollars} format={(n) => `₱${n}`} place="right-full top-1/2 -mt-2.5 mr-2" />
            {view.pokedollars}
          </span>
        </div>
        {accountFigures && (
          <div className={row} title="₱ banked from earlier runs">
            <span className={label}>Bank</span>
            <span className="font-semibold text-yellow-200/70">{account.bank}</span>
          </div>
        )}
        {accountFigures && stardust.data !== undefined && (
          <div className={row} title="Stardust, from cards pulled again in packs; crafts cards in the deck builder">
            <span className={label}>Stardust</span>
            <span className="flex items-center gap-1 font-semibold text-sky-200">
              <AutoAwesomeIcon sx={{ fontSize: 14 }} />
              {stardust.data}
            </span>
          </div>
        )}
        <div className={row} title="EXP earned this run, added to your account when you beat it">
          <span className={label}>Run EXP</span>
          <span className="font-semibold text-sky-300">{view.exp}</span>
        </div>
        {accountFigures && (
          <div className={row} title="Account EXP, spent in the shop after a run">
            <span className={label}>EXP</span>
            <span className="font-semibold">{account.exp}</span>
          </div>
        )}
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
        <RunSection id="equipped" title="Equipped" count={gear.length}>
          <div className="space-y-1 text-xs">
            {gear.map((def, i) => (
              <p key={i} className="rounded bg-slate-800 px-2 py-1">
                <span className="font-semibold">{def.name}</span> <span className="text-slate-400">{itemText(def)}</span>
              </p>
            ))}
          </div>
        </RunSection>
      )}
      {(view.badges ?? []).length > 0 && (
        <div className="space-y-1 text-xs">
          <h4 className={label}>Won this run</h4>
          <p className="flex flex-wrap gap-1">
            {view.badges!.map((id) => (
              <span key={id} className="rounded bg-yellow-400/30 px-2 py-0.5">
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
