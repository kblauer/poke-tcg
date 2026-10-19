import LockIcon from '@mui/icons-material/Lock';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BoosterPack } from '../components/packs/BoosterPack';
import { PackOpening, type PackSetInfo } from '../components/packs/PackOpening';
import { PreviewProvider } from '../components/PreviewProvider';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';
import { pickPackArt } from '../utils/packArt';

/**
 * Booster packs (`/packs`), bought with the ₱ in the bank: pick a set, then open its pack in a window
 * (PackOpening). Every card opened is unlocked for the deck builder. Locked sets are dimmed and can't be picked: a run's
 * first battle completed unlocks its generation's next one (marked), beating a run all of them.
 */
export function PacksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const packs = useQuery(trpc.packs.list.queryOptions());
  const [opening, setOpening] = useState<PackSetInfo | null>(null);
  // A random one of each set's wrappers, picked when the page is opened.
  const [art] = useState(pickPackArt);
  if (packs.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{packs.error.message}</p>;
  if (!packs.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const { bank, stardust, price, sets } = packs.data;

  /** After a pack is bought: the bank, the unlocks and the run screen's bank figure change. */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.packs.stardust.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.decks.unlocked.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
  };

  return (
    <PreviewProvider scrollZoom={false}>
      <div className={`${PAGE_WIDTH} space-y-6`}>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-xl font-bold">Booster packs</h2>
          <span className="text-sm text-slate-400">
            ₱{price} each, from your bank. 11 cards: a rare (holo about 1 in 3), 3 uncommons, 6 commons and a basic Energy. Every card is unlocked for your decks.
          </span>
          <span className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-sm ring-1 ring-slate-700">
            Bank <span className="font-semibold text-yellow-300">₱{bank}</span>
          </span>
          <span
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm ring-1 ring-slate-700"
            title="Earned for every card you pull that you already have (50 a common, 100 an uncommon, 300 a rare or holo; new cards give none); spend it crafting cards on the Collection tab (right-click a card)"
          >
            Stardust <span className="font-semibold text-sky-200">{stardust}</span>
          </span>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {sets.map((s) => (
            <button
              key={s.id}
              disabled={s.locked}
              onClick={() => setOpening({ id: s.id, name: s.name, logoUrl: s.logoUrl, art: art[s.id] })}
              className="flex flex-col items-center gap-3 rounded-lg bg-slate-900 p-6 ring-1 ring-slate-800 transition hover:bg-slate-800 hover:ring-slate-600 disabled:cursor-not-allowed disabled:hover:bg-slate-900 disabled:hover:ring-slate-800"
            >
              <span className={s.locked ? 'opacity-40 grayscale' : undefined}>
                <BoosterPack setId={s.id} name={s.name} logoUrl={s.logoUrl} art={art[s.id]} size="sm" />
              </span>
              <span className="font-semibold">{s.name}</span>
              {s.locked && (
                <span className="flex items-center gap-1 text-center text-xs text-amber-300">
                  <LockIcon sx={{ fontSize: 14 }} />
                  {s.next ? `Next to unlock: complete a battle in a ${s.next} run (without conceding it)` : `Locked: beat a run, or keep completing battles in runs`}
                </span>
              )}
              <span className="text-xs text-slate-400">
                {s.releaseDate && new Date(s.releaseDate).getUTCFullYear()} · {s.cardCount} cards
              </span>
              {/* How much of the set is unlocked: the cards a pack can hold, basic Energy aside. */}
              <div className="w-full max-w-40 space-y-1" title={`${s.unlockedCount} of this set's ${s.packCards} cards unlocked`}>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full bg-yellow-300" style={{ width: `${s.packCards ? (100 * s.unlockedCount) / s.packCards : 0}%` }} />
                </div>
                <p className={`text-xs ${s.unlockedCount === s.packCards ? 'font-semibold text-yellow-300' : 'text-slate-300'}`}>
                  {s.unlockedCount} / {s.packCards} unlocked
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
      {opening && <PackOpening key={opening.id} set={opening} price={price} bank={bank} onClose={() => setOpening(null)} onOpened={refresh} />}
    </PreviewProvider>
  );
}
