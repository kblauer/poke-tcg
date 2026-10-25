import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useTowerOverview } from '../../hooks/useTower';
import { useTRPC } from '../../lib/trpc';
import { pickPackArt } from '../../utils/packArt';
import { BoosterPack } from '../packs/BoosterPack';
import type { PackSetInfo } from '../packs/PackOpening';

// The pack window loads when a pack is first opened, as on the Packs tab.
const PackOpening = lazy(() => import('../packs/PackOpening').then((m) => ({ default: m.PackOpening })));

/**
 * A whole pack scaled down to fit a short box (the user's: the room a pack's middle 60% took, 29:30), so the shop's tiles
 * stay small: as tall as the box, as wide as the pack's art (29:50) makes it, centred.
 */
function FittedPack({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={`flex aspect-[29/30] items-center justify-center ${className}`}>
      <div className="aspect-[29/50] h-full">{children}</div>
    </div>
  );
}

/**
 * The Battle Tower lobby's BP Shop (the user's): Battle Points, won in the tower, exchanged for booster packs (a placeholder
 * stock), the sets whose packs the account has unlocked, each opened in the Packs tab's window (PackOpening) at
 * BP_PACK_PRICE, paid in BP. Its tiles are the Packs tab's, each pack whole but smaller (FittedPack). It closes with the vendor's Return to reception, beside the dialogue box (towerScripts.ts).
 */
export function BpShop() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const packs = useQuery(trpc.packs.list.queryOptions());
  const tower = useTowerOverview().data;
  const phone = useIsPhone();
  const [opening, setOpening] = useState<PackSetInfo | null>(null);
  const [art] = useState(pickPackArt);
  /** After a pack is bought: the BP, the unlocks and Stardust change. */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.tower.overview.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.packs.stardust.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.decks.unlocked.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() });
  };
  const sets = packs.data?.sets.filter((s) => !s.locked) ?? [];
  return (
    <section className="space-y-4 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-lg font-semibold">BP Shop</h3>
        {tower && (
          <span className="text-sm text-slate-400">
            Exchange your Battle Points for booster packs: {tower.packPrice} BP a pack. You have <span className="font-semibold text-emerald-300">{tower.bp} BP</span>.
          </span>
        )}
      </div>
      {!packs.data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : sets.length === 0 ? (
        <p className="text-sm text-slate-400">No booster packs are unlocked yet: complete a battle in a run to unlock your first.</p>
      ) : (
        <div className={phone ? 'grid grid-cols-4 gap-2' : 'grid grid-cols-[repeat(auto-fill,minmax(9.75rem,1fr))] gap-3'}>
          {sets.map((s) => {
            const open = () => setOpening({ id: s.id, name: s.name, logoUrl: s.logoUrl, art: art[s.id] });
            const price = tower && <span className="text-xs font-semibold text-emerald-300">{tower.packPrice} BP</span>;
            return phone ? (
              <button key={s.id} onClick={open} className="flex min-w-0 flex-col items-center gap-1 rounded-lg bg-slate-900 p-1.5 ring-1 ring-slate-700 transition active:bg-slate-800">
                <FittedPack className="w-full">
                  <BoosterPack setId={s.id} name={s.name} logoUrl={s.logoUrl} art={art[s.id]} size="xs" />
                </FittedPack>
                <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight">{s.name}</span>
                {price}
              </button>
            ) : (
              <button key={s.id} onClick={open} className="flex flex-col items-center gap-1.5 rounded-lg bg-slate-900 px-1.5 py-3 ring-1 ring-slate-800 transition hover:bg-slate-800 hover:ring-slate-600">
                <FittedPack className="w-36">
                  <BoosterPack setId={s.id} name={s.name} logoUrl={s.logoUrl} art={art[s.id]} size="xs" />
                </FittedPack>
                <span className="font-semibold">{s.name}</span>
                <span className="text-xs text-slate-400">
                  {s.releaseDate && new Date(s.releaseDate).getUTCFullYear()} · {s.cardCount} cards
                </span>
                {/* How much of the set is unlocked, as on the Packs tab. */}
                <div className="w-full max-w-40 space-y-1" title={`${s.unlockedCount} of this set's ${s.packCards} cards unlocked`}>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full rounded-full bg-yellow-300" style={{ width: `${s.packCards ? (100 * s.unlockedCount) / s.packCards : 0}%` }} />
                  </div>
                  <p className={`text-xs ${s.unlockedCount === s.packCards ? 'font-semibold text-yellow-300' : 'text-slate-300'}`}>
                    {s.unlockedCount} / {s.packCards} unlocked
                  </p>
                </div>
                {price}
              </button>
            );
          })}
        </div>
      )}
      {opening && tower && (
        <Suspense fallback={null}>
          <PackOpening key={opening.id} set={opening} price={tower.packPrice} bank={tower.bp} currency="bp" onClose={() => setOpening(null)} onOpened={refresh} />
        </Suspense>
      )}
    </section>
  );
}
