import LockIcon from '@mui/icons-material/Lock';
import RemoveIcon from '@mui/icons-material/Remove';
import { useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useHoldToInspect } from '../hooks/useHoldToInspect';
import { useScrollLock } from '../hooks/useScrollLock';
import { InspectContext, useInspectOnRightClick } from './InspectContext';
import { useUnlocked } from '../hooks/useUnlocked';
import { cardTitle, type CatalogCard } from '../utils/cardList';
import { CardViewer } from './CardViewer';
import { CardImage } from './CardImage';

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
 * `counts` (the deck builder) puts a badge with each card's copies in the deck on its strip, and `onRemove` a − in its top
 * left corner that takes one copy out per press.
 * `isLocked` darkens cards the account hasn't unlocked, with a lock on the strip.
 * `holdToInspect` (the deck builder, where a click adds a copy): pressing and holding a card shows it large in
 * the middle of the screen, with its details, until the press ends (the grid and the page don't scroll meanwhile). Inside an InspectContext (the deck builder),
 * right-clicking a card opens it in the CardInspector, as does a finger's hold (a phone), as soon as it registers.
 */
export function CardGrid({
  cards,
  selectedId,
  onSelect,
  counts,
  onRemove,
  isLocked,
  holdToInspect = false,
  compact = false,
}: {
  cards: CatalogCard[];
  selectedId: string | null;
  onSelect: (card: CatalogCard) => void;
  counts?: Map<string, number>;
  onRemove?: (card: CatalogCard) => void;
  isLocked?: (card: CatalogCard) => boolean;
  holdToInspect?: boolean;
  /** Narrower columns (a phone), so more cards fit across: 4 on a 360px-wide screen (2340×1080). */
  compact?: boolean;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const inspect = useContext(InspectContext);
  const hold = useHoldToInspect<CatalogCard>(inspect ?? undefined);
  useScrollLock(hold.inspecting !== null);
  const inspectOn = useInspectOnRightClick();
  // Holo Energy and special holos are tagged with how many were pulled (and holo Energy with its style).
  const { copies } = useUnlocked();
  const rowGap = useRowGap(grid, cards.length);
  if (cards.length === 0) return <p className="p-4 text-center text-slate-500">No cards match these filters.</p>;
  return (
    <>
      <div ref={grid} className={`grid min-h-0 flex-1 content-start overflow-y-auto p-1 ${compact ? 'grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-x-1.5' : 'grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-2'}`} style={{ rowGap }}>
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
                <CardImage src={`${c.imageUrl}/low.webp`} alt="" loading="lazy" className={`h-full w-full object-cover ${isLocked?.(c) ? 'brightness-[.35]' : ''}`} />
              ) : (
                <div className="h-full w-full bg-slate-800 p-1 text-xs">{c.name}</div>
              )}
              {c.limitedCopies && !isLocked?.(c) && (
                // How many were pulled: the most a deck holds.
                <span className="absolute inset-x-1 bottom-1 truncate rounded bg-fuchsia-600/90 px-1 text-center text-[10px] font-bold text-white shadow" title={`${copies(c.id)} pulled: a deck holds no more`}>
                  Holo{c.holoEnergy && ` · ${c.holoEnergy.label}`} ×{copies(c.id)}
                </span>
              )}
              {isLocked?.(c) && (
                // Beside the − when there is one.
                <span className={`absolute ${onRemove && counts?.get(c.id) ? 'left-7' : 'left-1'} top-1 flex items-center rounded-full bg-slate-900/90 p-0.5 text-slate-300`} title="Locked: win it in a run">
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
              title={`${cardTitle(c)} · ${c.setName} #${c.number}${isLocked?.(c) ? ' · Locked' : ''}`}
              aria-label={cardTitle(c)}
              className="absolute inset-x-0 top-0 z-20 aspect-[63/88] outline-none"
            />
            {onRemove && counts?.get(c.id) ? (
              // Above the click targets, so a press takes a copy out instead of adding one.
              <button
                onClick={() => onRemove(c)}
                title={`Take a ${c.name} out of the deck`}
                aria-label={`Take a ${c.name} out of the deck`}
                className="absolute left-1 top-1 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/90 text-slate-50 shadow ring-1 ring-slate-500 transition hover:bg-rose-600 active:scale-90"
              >
                <RemoveIcon sx={{ fontSize: 16 }} />
              </button>
            ) : null}
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
