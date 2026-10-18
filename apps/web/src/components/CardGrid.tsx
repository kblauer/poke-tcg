import LockIcon from '@mui/icons-material/Lock';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useHoldToInspect } from '../hooks/useHoldToInspect';
import { useInspectOnRightClick } from './InspectContext';
import type { CatalogCard } from '../utils/cardList';
import { CardViewer } from './CardViewer';

/** The least space between rows, as Tailwind spacing (gap-y-14): enough to read each card's name, a Trainer's too (it sits under the TRAINER banner). */
const MIN_GAP = 'calc(var(--spacing) * 14)';
/** Space under whole cards at the most (gap-2). */
const CARD_GAP = 'calc(var(--spacing) * 2)';

/**
 * The row gap (CSS) that spreads the rows down the whole height of the grid when they'd otherwise leave space
 * below, from MIN_GAP up to whole cards with a small gap (no overlap). Measured on the grid (columns from its
 * computed template, the card height from the first card), and again when it resizes.
 */
function useRowGap(grid: RefObject<HTMLDivElement | null>, count: number) {
  const [gap, setGap] = useState(MIN_GAP);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => {
      const card = el.querySelector<HTMLElement>('[data-card]');
      const columns = getComputedStyle(el).gridTemplateColumns.split(' ').length;
      if (!card || !columns) return;
      const rows = Math.ceil(count / columns);
      const style = getComputedStyle(el);
      const height = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const cardHeight = card.offsetHeight;
      const spread = rows > 1 ? Math.floor((height - cardHeight) / (rows - 1)) : 0;
      setGap(`clamp(${MIN_GAP}, ${spread}px, calc(${cardHeight}px + ${CARD_GAP}))`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [grid, count]);
  return gap;
}

/**
 * Scrollable grid of low-res card images. Columns fill the available width.
 * Rows overlap like a fanned-out stack: the row gap is the only space between rows, so each card
 * shows just its top strip with the name. Hovering a strip brings that card to the front. When there are
 * few enough rows, they spread out to fill the grid's height (up to whole cards, see useRowGap).
 * `counts` (the deck builder) puts a badge with each card's copies in the deck on its strip.
 * `isLocked` darkens cards the account hasn't unlocked, with a lock on the strip.
 * `holdToInspect` (the deck builder, where a click adds a copy): pressing and holding a card shows it large in
 * the middle of the screen, with its details, until the press ends. Inside an InspectContext (the deck builder),
 * right-clicking a card opens it in the CardInspector.
 */
export function CardGrid({
  cards,
  selectedId,
  onSelect,
  counts,
  isLocked,
  holdToInspect = false,
}: {
  cards: CatalogCard[];
  selectedId: string | null;
  onSelect: (card: CatalogCard) => void;
  counts?: Map<string, number>;
  isLocked?: (card: CatalogCard) => boolean;
  holdToInspect?: boolean;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const hold = useHoldToInspect<CatalogCard>();
  const inspectOn = useInspectOnRightClick();
  const rowGap = useRowGap(grid, cards.length);
  if (cards.length === 0) return <p className="p-4 text-center text-slate-500">No cards match these filters.</p>;
  return (
    <>
      <div ref={grid} className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] content-start gap-x-2 overflow-y-auto p-1" style={{ rowGap }}>
        {cards.map((c) => (
          // Zero-height cell: the card hangs down from it and later rows paint over it.
          // The last row's overflow still extends the scroll area.
          <div key={c.id} className="group relative h-0">
            <div
              data-card
              className={`pointer-events-none absolute inset-x-0 top-0 aspect-[63/88] overflow-hidden rounded-md shadow-md shadow-black/60 transition group-hover:z-10 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-within:z-10 group-focus-within:ring-2 group-focus-within:ring-sky-400 ${
                c.id === selectedId ? 'ring-2 ring-yellow-300' : ''
              }`}
            >
              {c.imageUrl ? (
                <img src={`${c.imageUrl}/low.webp`} alt="" loading="lazy" className={`h-full w-full object-cover ${isLocked?.(c) ? 'brightness-[.35]' : ''}`} />
              ) : (
                <div className="h-full w-full bg-slate-800 p-1 text-xs">{c.name}</div>
              )}
              {isLocked?.(c) && (
                <span className="absolute left-1 top-1 flex items-center rounded-full bg-slate-900/90 p-0.5 text-slate-300" title="Locked: win it in a run">
                  <LockIcon sx={{ fontSize: 14 }} />
                </span>
              )}
              {counts?.get(c.id) ? (
                <span className="absolute right-1 top-1 rounded-full bg-yellow-300 px-1.5 text-xs font-bold text-slate-900 shadow">×{counts.get(c.id)}</span>
              ) : null}
            </div>
            {/* Click target the size of the card, kept above every card so moving down a column reaches the
                next strip even while a hovered card covers it. Later buttons paint over earlier ones, so
                only the visible strip is clickable, except on the last card in a column, where it's all of it. */}
            <button
              {...(holdToInspect ? hold.press(c) : {})}
              {...inspectOn(c)}
              onClick={() => hold.clicked() && onSelect(c)}
              title={`${c.name} · ${c.setName} #${c.number}${isLocked?.(c) ? ' · Locked' : ''}`}
              aria-label={c.name}
              className="absolute inset-x-0 top-0 z-20 aspect-[63/88] outline-none"
            />
          </div>
        ))}
      </div>
      {hold.inspecting && (
        // Over the page while the press lasts; the press's own events still reach the grid underneath.
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-label={hold.inspecting.name}>
          <div className="w-full max-w-lg">
            <CardViewer card={hold.inspecting} locked={isLocked?.(hold.inspecting) ?? false} />
          </div>
        </div>
      )}
    </>
  );
}
