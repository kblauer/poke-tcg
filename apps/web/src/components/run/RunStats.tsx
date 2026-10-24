import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { EQUIP_SLOTS, ITEMS, itemText } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import type { Overview, RunControl, RunViewData } from '../../hooks/useRun';
import { useTRPC } from '../../lib/trpc';
import { PokedollarIcon } from '../PageNav';
import { BagPanel } from './BagPanel';
import { DeltaFloat } from './DeltaFloat';
import { StatusBox } from './StatusBox';
import { usePokedollarColor } from '../../hooks/useThemedFigures';
import { RunSection } from './RunSection';
import { commas } from '../../utils/math';

const row = 'flex items-center justify-between gap-2 rounded bg-slate-800 px-3 py-1.5';
const label = 'text-xs uppercase tracking-wide text-slate-500';

/**
 * The run's numbers, in the site menu on a big screen (NavRail) and the side panel's Run tab on a phone: HP and the run's EXP (StatusBox), ₱ (and the bank), the account's Stardust, the
 * account's, the battle rules and consumables in effect, the equipment worn, the badges won this run, and the Bag. The equipment
 * and the Bag fold away (RunSection). `nav` (the big screen's site menu): only HP, the run's EXP and ₱ (the user's): not the bank,
 * Stardust and the account's EXP (its top bar shows them, TopBarAccount), the items in effect, the badges won, the equipment or
 * the Bag (the run screen shows the Bag, BagGrid).
 */
export function RunStats({ view, account, run, nav = false }: { view: RunViewData; account: Overview['account']; run: RunControl; nav?: boolean }) {
  const trpc = useTRPC();
  // The run's ₱: the theme's accent or the Pokédollar icon's gold (Settings: Themed Pokédollars).
  const money = usePokedollarColor();
  const inventory = useQuery(trpc.run.inventory.queryOptions());
  const stardust = useQuery(trpc.packs.stardust.queryOptions());
  const gear = EQUIP_SLOTS.flatMap((slot) => {
    const def = ITEMS[inventory.data?.equipment[slot] ?? ''];
    return def ? [def] : [];
  });
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        {/* HP and the run's EXP in Black 2's player box (StatusBox), clear of what's above it (Settings, in the site menu);
            an HP change floats up beside it (DeltaFloat). */}
        <div className="relative flex justify-center pb-1 pt-3 text-rose-400">
          <DeltaFloat value={view.hp} format={(n) => `${n} HP`} place="left-0 top-0" />
          <StatusBox hp={view.hp} maxHp={view.maxHp} exp={view.exp} />
        </div>
        {/* The run's ₱ centred under the box, on the panel itself, its number as big as its icon (the user's); a change floats up beside it (DeltaFloat). */}
        <div className="flex justify-center pt-1" title="₱ to spend in this run; banked when the run ends">
          <span className={`relative flex items-center gap-1.5 text-xl font-semibold leading-none ${money.className}`} style={money.style}>
            <DeltaFloat value={view.pokedollars} format={(n) => `₱${commas(n)}`} place="left-full top-1/2 -mt-2.5 ml-2" />
            {/* 2px down, so its glyph lines up with the number (centred, it sits a little high). */}
            <PokedollarIcon className="translate-y-0.5" />
            {commas(view.pokedollars)}
          </span>
        </div>
        {!nav && (
          <div className={row} title="₱ banked from earlier runs">
            <span className={label}>Bank</span>
            <span className="font-semibold text-yellow-200/70">{account.bank}</span>
          </div>
        )}
        {!nav && stardust.data !== undefined && (
          <div className={row} title="Stardust, from cards pulled again in packs; crafts cards in the deck builder">
            <span className={label}>Stardust</span>
            <span className="flex items-center gap-1 font-semibold text-sky-200">
              <AutoAwesomeIcon sx={{ fontSize: 14 }} />
              {stardust.data}
            </span>
          </div>
        )}
        {!nav && (
          <div className={row} title="Account EXP, spent in the shop after a run">
            <span className={label}>EXP</span>
            <span className="font-semibold">{account.exp}</span>
          </div>
        )}
      </div>
      {!nav && (view.rules.length > 0 || view.consumables.length > 0) && (
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
      {!nav && gear.length > 0 && (
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
      {!nav && (view.badges ?? []).length > 0 && (
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
      {!nav && view.phase !== 'won' && view.phase !== 'lost' && <BagPanel view={view} run={run} />}
    </div>
  );
}
