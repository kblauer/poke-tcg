import LockIcon from '@mui/icons-material/Lock';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { BoosterPack } from '../components/packs/BoosterPack';
import type { PackSetInfo } from '../components/packs/PackOpening';

// The pack window (with its confetti and holo cards) loads when a pack is first opened.
const PackOpening = lazy(() => import('../components/packs/PackOpening').then((m) => ({ default: m.PackOpening })));
import { PACK_GENERATIONS } from '@poke-tcg/campaign';
import { GenerationFilter, packGeneration } from '../components/packs/GenerationFilter';
import { PreviewProvider } from '../components/PreviewProvider';
import { useIsPhone } from '../hooks/useIsPhone';
import { useTRPC } from '../lib/trpc';
import { PageHeader } from '../components/PageHeader';
import { PAGE_WIDTH } from '../utils/layout';
import { pickPackArt } from '../utils/packArt';

/**
 * Booster packs (`/packs`), bought with the ₱ in the bank: pick a set, then open its pack in a window
 * (PackOpening). Every card opened is unlocked for the deck builder. Locked sets are dimmed and can't be picked: a run's
 * first battle completed unlocks its generation's next one (marked), beating a run all of them. Every set shows until
 * generations are picked in the generation filter (GenerationFilter). On a phone held upright (useIsPhone) the packs
 * are a grid 4 wide, smaller; a tap on a locked one says under the grid how to unlock it.
 */
export function PacksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const packs = useQuery(trpc.packs.list.queryOptions());
  const phone = useIsPhone();
  const [opening, setOpening] = useState<PackSetInfo | null>(null);
  // The generations picked in the filter; none (as on every visit) shows every set.
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  /** On a phone: the locked pack last tapped, and how to unlock it. */
  const [lockedNote, setLockedNote] = useState<string | null>(null);
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
        <PageHeader
          title="Booster packs"
          info={`₱${price} each, from your bank. 11 cards: a rare (holo about 1 in 3), 3 uncommons, 6 commons and a basic Energy. Every card is unlocked for your decks.`}
          actions={
            <>
              <span className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-chip ring-1 ring-slate-700">
                Bank <span className="font-semibold text-yellow-300">₱{bank}</span>
              </span>
              <span
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-chip ring-1 ring-slate-700"
                title="Earned for every card you pull that you already have (50 a common, 100 an uncommon, 300 a rare or holo; new cards give none); spend it crafting cards on the Collection tab (right-click a card)"
              >
                Stardust <span className="font-semibold text-sky-200">{stardust}</span>
              </span>
            </>
          }
        />
        <GenerationFilter picked={picked} onChange={setPicked} />
        <div className={phone ? 'grid grid-cols-4 gap-2' : 'grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'}>
          {sets.filter((s) => picked.size === 0 || picked.has(packGeneration(s.id) ?? 0)).map((s) => {
            const why = s.upcoming
              ? `Locked until ${PACK_GENERATIONS[packGeneration(s.id) ?? 0]?.region ?? 'its generation'}'s runs arrive`
              : s.next
                ? `Next to unlock: complete a battle in a ${s.next} run (without conceding it)`
                : `Locked: beat a run, or keep completing battles in runs`;
            return phone ? (
              <button
                key={s.id}
                aria-disabled={s.locked}
                onClick={() => (s.locked ? setLockedNote(`${s.name}: ${why}`) : setOpening({ id: s.id, name: s.name, logoUrl: s.logoUrl, art: art[s.id] }))}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-lg bg-slate-900 p-1.5 ring-1 transition ${s.locked ? 'ring-slate-800' : 'ring-slate-700 active:bg-slate-800'}`}
              >
                <span className={`relative w-full ${s.locked ? 'opacity-40 grayscale' : ''}`}>
                  <BoosterPack setId={s.id} name={s.name} logoUrl={s.logoUrl} art={art[s.id]} size="xs" />
                </span>
                <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight">{s.name}</span>
                {s.locked ? (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-300">
                    <LockIcon sx={{ fontSize: 11 }} />
                    {s.next ? 'Next' : 'Locked'}
                  </span>
                ) : (
                  <div className="w-full space-y-0.5" title={`${s.unlockedCount} of this set's ${s.packCards} cards unlocked`}>
                    <div className="h-1 overflow-hidden rounded-full bg-slate-700">
                      <div className="h-full rounded-full bg-yellow-300" style={{ width: `${s.packCards ? (100 * s.unlockedCount) / s.packCards : 0}%` }} />
                    </div>
                    <p className={`text-center text-[10px] ${s.unlockedCount === s.packCards ? 'font-semibold text-yellow-300' : 'text-slate-300'}`}>
                      {s.unlockedCount}/{s.packCards}
                    </p>
                  </div>
                )}
              </button>
            ) : (
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
                    {why}
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
            );
          })}
        </div>
        {phone && lockedNote && <p className="text-xs text-amber-300">{lockedNote}.</p>}
      </div>
      {opening && (
        <Suspense fallback={null}>
          <PackOpening key={opening.id} set={opening} price={price} bank={bank} onClose={() => setOpening(null)} onOpened={refresh} />
        </Suspense>
      )}
    </PreviewProvider>
  );
}
