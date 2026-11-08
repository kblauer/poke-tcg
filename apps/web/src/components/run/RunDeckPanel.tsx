import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useEffect, useRef, useState } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { BagGrid } from './BagPanel';
import { RunCard } from './RunCard';
import { PANEL_COUNT, PANEL_HEADING } from '../../utils/styles';

const GROUPS = [
  { title: 'Pokémon', test: (kind: string, trainer: boolean) => kind === 'pokemon' && !trainer },
  { title: 'Trainers', test: (kind: string, trainer: boolean) => kind === 'trainer' || trainer },
  { title: 'Energy', test: (kind: string) => kind === 'energy' },
];

/**
 * The cards unlocked in this run (gifts, rewards, shops, trades, events), one per kind with how many came,
 * grouped into Pokémon, Trainers and Energy, in the left half, wrapping within it, and the Bag (BagGrid) in the right
 * (the user's; no link to the Collection tab). On a phone (useIsPhone) the halves are one above the other and the cards
 * start minimised to their title and count, with a button in the top right corner to open them.
 */
export function RunDeckPanel({ view, run }: { view: RunViewData; run: RunControl }) {
  const phone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const open = !phone || expanded;
  const entries = gainedEntries(view);
  return (
    <section className={`grid gap-6 rounded-lg bg-slate-800 ring-1 ring-slate-600 md:grid-cols-2 ${phone ? 'p-4' : 'p-5'}`}>
      {/* The left half: the cards, wrapping within its width. */}
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-3">
          <h3 className={PANEL_HEADING}>
            Unlocked this run <span className={PANEL_COUNT}>({view.gained.length})</span>
          </h3>
          {phone && (
            <button
              className="ml-auto flex shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Minimise' : 'Show the cards'}
              title={expanded ? 'Minimise' : 'Show the cards'}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </button>
          )}
        </div>
        {open && <Gained entries={entries} />}
      </div>
      {/* The right half (below on a phone): the Bag. */}
      <div className="min-w-0">
        <BagGrid view={view} run={run} />
      </div>
    </section>
  );
}

/** The cards gained this run, one per card with how many came. */
const gainedEntries = (view: RunViewData) => {
  const gained = new Map<string, number>();
  for (const id of view.gained) gained.set(id, (gained.get(id) ?? 0) + 1);
  return [...gained].map(([id, count]) => ({ id, count, def: view.cards[id] }));
};

/** The cards gained this run, grouped into Pokémon, Trainers and Energy (or a line saying there are none yet). */
function Gained({ entries }: { entries: ReturnType<typeof gainedEntries> }) {
  if (!entries.length) return <p className="text-sm text-slate-400">No cards yet: win battles, visit shops and take gifts to unlock more.</p>;
  return (
    <>
      {GROUPS.map(({ title, test }) => {
          const cards = entries.filter((e) => e.def && test(e.def.kind, e.def.kind === 'pokemon' && !!e.def.trainerText));
          if (!cards.length) return null;
          return (
            <div key={title} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {title} ({cards.reduce((n, c) => n + c.count, 0)})
              </h4>
              <div className="flex flex-wrap gap-2">
                {cards.map((c) => (
                  <RunCard key={c.id} def={c.def} footer={c.count > 1 ? <span className="text-sm font-semibold text-slate-300">×{c.count}</span> : undefined} />
                ))}
              </div>
            </div>
          );
        })}
    </>
  );
}

/**
 * The Bag as a corner of the run map (the user's experiment, RouteView's `corners`): a bag button that opens a panel
 * above it with the Bag (BagGrid) and the cards unlocked this run; the button again, a click outside or Escape closes it.
 */
export function MapBag({ view, run }: { view: RunViewData; run: RunControl }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEscape(() => setOpen(false), open);
  return (
    // As tall as the map's view (RouteView's corner layer), so the panel can take its height above the button.
    <div ref={ref} className="pointer-events-none relative h-full">
      {open && (
        <div className={`pointer-events-auto absolute bottom-32 left-0 ${phone ? 'w-72' : 'w-96'} max-h-[calc(100%-8rem)] space-y-4 overflow-y-auto rounded-lg bg-slate-800 p-3 shadow-xl shadow-black/60 ring-1 ring-slate-600`}>
          <BagGrid view={view} run={run} />
          <div className="space-y-3">
            <h3 className={PANEL_HEADING}>
              Unlocked this run <span className={PANEL_COUNT}>({view.gained.length})</span>
            </h3>
            <Gained entries={gainedEntries(view)} />
          </div>
        </div>
      )}
      {/* FireRed's bag, open on its Key Items pocket (tools/icons/bag.py), at twice its size (the user's: whole pixels); a glow while it's open. */}
      <button
        className={`pointer-events-auto absolute bottom-0 left-0 transition hover:-translate-y-0.5 hover:brightness-110 active:scale-95 ${open ? 'drop-shadow-[0_0_6px_var(--color-yellow-300)]' : 'drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]'}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Bag"
        title="Bag and cards unlocked this run"
      >
        <img src="/nav/bag.png" alt="" width={84} height={114} draggable={false} className="block select-none [image-rendering:pixelated]" />
      </button>
    </div>
  );
}
