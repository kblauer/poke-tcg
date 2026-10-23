import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import { boss, generationBadges, GENERATIONS, ITEMS } from '@poke-tcg/campaign';
import { useState } from 'react';
import { useEscape } from '../hooks/useEscape';
import { DIALOG, DIALOG_BACKDROP } from '../utils/styles';
import { ItemIcon } from './ItemIcon';

/** Every badge id, for leaving them out of the key items list (the cases show them). */
export const BADGE_IDS = new Set(Object.values(GENERATIONS).flatMap(generationBadges));

/**
 * The key items list's badge cases: one per generation of runs (GENERATIONS), with how many of its badges the account
 * has. Clicking one opens it (BadgeCaseDialog). The icon (`public/items/badge-case.png`) is the Medal Box: the games have
 * no bag icon for a Badge Case, which is a Trainer Card screen.
 */
export function BadgeCases({ owned, tile }: { owned: ReadonlySet<string>; /** The Inventory's tile style, so a case is the size of the items beside it. */ tile: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {Object.entries(GENERATIONS).map(([id, g]) => {
        const badges = generationBadges(g);
        const have = badges.filter((b) => owned.has(b)).length;
        return (
          <li key={id}>
            <button
              className={`${tile} w-full text-left transition hover:bg-slate-700/60 hover:ring-slate-500`}
              onClick={() => setOpen(Number(id))}
            >
              <ItemIcon id="badge-case" className="shrink-0" />
              <div className="min-w-0">
                <span className="font-semibold">{g.region} Badge Case</span>
                <p className={`text-xs ${have === badges.length ? 'font-semibold text-yellow-300' : 'text-slate-400'}`}>
                  {have} of {badges.length} badges · click to open
                </p>
              </div>
            </button>
          </li>
        );
      })}
      {open !== null && <BadgeCaseDialog gen={open} owned={owned} onClose={() => setOpen(null)} />}
    </>
  );
}

/** A generation's badges in gym order, each with its gym leader: the ones the account has in colour and ticked, the rest greyed out. */
function BadgeCaseDialog({ gen, owned, onClose }: { gen: number; owned: ReadonlySet<string>; onClose: () => void }) {
  const g = GENERATIONS[gen]!;
  useEscape(onClose);
  return (
    <div className={`${DIALOG_BACKDROP} z-[1100]`} onClick={onClose}>
      <section
        role="dialog"
        aria-label={`${g.region} Badge Case`}
        className={`${DIALOG} w-full max-w-2xl space-y-4 p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <ItemIcon id="badge-case" />
          <h3 className="flex-1 text-lg font-semibold">{g.region} Badge Case</h3>
          <button className="rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon sx={{ fontSize: 20 }} />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {g.gyms.map((id) => {
            const leader = boss(id);
            const badge = leader.gym!.badge;
            const have = owned.has(badge);
            return (
              <li key={id} className={`flex flex-col items-center gap-1 rounded-lg p-3 text-center ring-1 ${have ? 'bg-slate-700 ring-yellow-400/60' : 'bg-slate-900 ring-slate-700'}`}>
                <ItemIcon id={badge} size={64} className={have ? undefined : 'opacity-40 grayscale'} />
                <span className={`text-sm font-semibold ${have ? '' : 'text-slate-500'}`}>{ITEMS[badge]?.name ?? badge}</span>
                <span className="text-xs text-slate-400">
                  {leader.name} · {leader.gym!.city}
                </span>
                {have ? (
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-300">
                    <CheckCircleIcon sx={{ fontSize: 14 }} /> Obtained
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Not yet</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
