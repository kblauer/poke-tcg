import LockIcon from '@mui/icons-material/Lock';
import RemoveIcon from '@mui/icons-material/Remove';
import { memo, useCallback, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useHoldToInspect } from '../hooks/useHoldToInspect';
import { useScrollLock } from '../hooks/useScrollLock';
import { InspectContext, useInspectOnRightClick } from './InspectContext';
import { useUnlocked } from '../hooks/useUnlocked';
import { cardTitle, type CatalogCard } from '../utils/cardList';
import { gridHeight, gridWindow, type GridLayout } from '../utils/gridWindow';
import { CardViewer } from './CardViewer';
import { CardImage } from './CardImage';

/** The least space between rows, as Tailwind spacing (gap-y-14): enough to read each card's name, a Trainer's too (it sits under the TRAINER banner). */
const MIN_GAP = 'calc(var(--spacing) * 14)';
/** Space under whole cards at the most (gap-2). */
const CARD_GAP = 'calc(var(--spacing) * 2)';
/** Cards rendered before the grid has been measured (the first layout effect measures them, before anything is painted). */
const FIRST_CARDS = 60;

/**
 * The grid's layout (GridLayout: columns, row pitch and card height, in px) and the rows to render (gridWindow) for
 * its scroll position. The row gap spreads the rows down the whole height of the scroller when they'd otherwise leave
 * space below, from MIN_GAP up to whole cards with a small gap (no overlap). Measured on the grid (columns from its
 * computed template, the card height from a card, the gap resolved to px by the browser), and again when the
 * scroller resizes or the number of cards changes. The window changes only when its rows do, so scrolling within a
 * row renders nothing.
 */
function useGridWindow(scroller: RefObject<HTMLDivElement | null>, grid: RefObject<HTMLDivElement | null>, count: number) {
  const [layout, setLayout] = useState<GridLayout | null>(null);
  const [rows, setRows] = useState({ first: 0, last: -1 });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const windowRows = useCallback(() => {
    const el = scroller.current;
    const at = layoutRef.current;
    if (!el || !at) return;
    const next = gridWindow(count, at, el.scrollTop - parseFloat(getComputedStyle(el).paddingTop), el.clientHeight);
    setRows((now) => (now.first === next.first && now.last === next.last ? now : next));
  }, [scroller, count]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const cells = grid.current;
      const card = cells?.querySelector<HTMLElement>('[data-card]');
      const columns = cells ? getComputedStyle(cells).gridTemplateColumns.split(' ').length : 0;
      if (!cells || !card || !columns) return;
      const style = getComputedStyle(el);
      const height = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const cardHeight = card.offsetHeight;
      const lines = Math.ceil(count / columns);
      const spread = lines > 1 ? Math.floor((height - cardHeight) / (lines - 1)) : 0;
      // The browser resolves the clamp (rem and px) to px: tried on the grid, then put back.
      const was = cells.style.rowGap;
      cells.style.rowGap = `clamp(${MIN_GAP}, ${spread}px, calc(${cardHeight}px + ${CARD_GAP}))`;
      const pitch = parseFloat(getComputedStyle(cells).rowGap);
      cells.style.rowGap = was;
      const next = { columns, pitch: Number.isFinite(pitch) && pitch > 0 ? pitch : Math.max(56, Math.min(spread, cardHeight + 8)), cardHeight };
      const now = layoutRef.current;
      if (!now || now.columns !== next.columns || now.pitch !== next.pitch || now.cardHeight !== next.cardHeight) setLayout((layoutRef.current = next));
      windowRows();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scroller, grid, count, windowRows]);
  return { layout, rows, onScroll: windowRows };
}

/** A card's cell in the grid, memoised: it takes the card, numbers and flags, and handlers that stay the same between renders. */
const GridCell = memo(function GridCell({
  card: c,
  count,
  locked,
  copies,
  selected,
  onSelect,
  onRemove,
  press,
  clicked,
  inspectOn,
}: {
  card: CatalogCard;
  /** Copies in the open deck (0 when there's no deck). */
  count: number;
  locked: boolean;
  /** How many were pulled, for holo Energy and special holos. */
  copies: number;
  selected: boolean;
  onSelect: (card: CatalogCard) => void;
  onRemove?: (card: CatalogCard) => void;
  /** useHoldToInspect's `press`, with `holdToInspect`. */
  press?: (card: CatalogCard) => object;
  clicked: () => boolean;
  inspectOn: (card: CatalogCard) => object;
}) {
  return (
    // Zero-height cell: the card hangs down from it and later rows paint over it.
    <div className="group relative h-0">
      <div
        data-card
        className={`pointer-events-none absolute inset-x-0 top-0 aspect-[63/88] overflow-hidden rounded-md shadow-md shadow-black/60 transition group-hover:z-10 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-within:z-10 group-focus-within:ring-2 group-focus-within:ring-sky-400 ${
          selected ? 'ring-2 ring-yellow-300' : ''
        }`}
      >
        {c.imageUrl ? (
          <CardImage src={`${c.imageUrl}/low.webp`} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${locked ? 'brightness-[.35]' : ''}`} />
        ) : (
          <div className="h-full w-full bg-slate-800 p-1 text-xs">{c.name}</div>
        )}
        {c.limitedCopies && !locked && (
          // How many were pulled: the most a deck holds.
          <span className="absolute inset-x-1 bottom-1 truncate rounded bg-fuchsia-600/90 px-1 text-center text-[10px] font-bold text-white shadow" title={`${copies} pulled: a deck holds no more`}>
            Holo{c.holoEnergy && ` · ${c.holoEnergy.label}`} ×{copies}
          </span>
        )}
        {locked && (
          // Beside the − when there is one.
          <span className={`absolute ${onRemove && count ? 'left-7' : 'left-1'} top-1 flex items-center rounded-full bg-slate-900/90 p-0.5 text-slate-300`} title="Locked: win it in a run">
            <LockIcon sx={{ fontSize: 14 }} />
          </span>
        )}
        {count ? <span className="absolute right-1 top-1 rounded-full bg-yellow-300 px-1.5 text-xs font-bold text-slate-900 shadow">×{count}</span> : null}
      </div>
      {/* Click target the size of the card, kept above every card so moving down a column reaches the
          next strip even while a hovered card covers it. Later buttons paint over earlier ones, so
          only the visible strip is clickable, except on the last card in a column, where it's all of it. */}
      <button
        {...press?.(c)}
        {...inspectOn(c)}
        onClick={() => clicked() && onSelect(c)}
        title={`${cardTitle(c)} · ${c.setName} #${c.number}${locked ? ' · Locked' : ''}`}
        aria-label={cardTitle(c)}
        className="absolute inset-x-0 top-0 z-20 aspect-[63/88] outline-none"
      />
      {onRemove && count ? (
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
  );
});

/**
 * Scrollable grid of low-res card images. Columns fill the available width.
 * Rows overlap like a fanned-out stack: the row gap is the only space between rows, so each card
 * shows just its top strip with the name. Hovering a strip brings that card to the front. When there are
 * few enough rows, they spread out to fill the grid's height (up to whole cards, see useGridWindow).
 * Only the rows in view are rendered (with those above whose cards hang into it, gridWindow), in a box as tall as
 * all of them, so thousands of cards stay a few hundred elements. The grid and its cells are memoised: pass handlers
 * that stay the same between renders (useCallback), or every cell renders again.
 * `counts` (the deck builder) puts a badge with each card's copies in the deck on its strip, and `onRemove` a − in its top
 * left corner that takes one copy out per press.
 * `isLocked` darkens cards the account hasn't unlocked, with a lock on the strip.
 * `holdToInspect` (the deck builder, where a click adds a copy): pressing and holding a card shows it large in
 * the middle of the screen, with its details, until the press ends (the grid and the page don't scroll meanwhile). Inside an InspectContext (the deck builder),
 * right-clicking a card opens it in the CardInspector, as does a finger's hold (a phone), as soon as it registers.
 */
export const CardGrid = memo(function CardGrid({
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
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const inspect = useContext(InspectContext);
  const hold = useHoldToInspect<CatalogCard>(inspect ?? undefined);
  useScrollLock(hold.inspecting !== null);
  const inspectOn = useInspectOnRightClick();
  // Holo Energy and special holos are tagged with how many were pulled (and holo Energy with its style).
  const { copies } = useUnlocked();
  const { layout, rows, onScroll } = useGridWindow(scroller, grid, cards.length);
  if (cards.length === 0) return <p className="p-4 text-center text-slate-500">No cards match these filters.</p>;
  // Until it's measured, the first cards (to measure); then the window's rows, from a row's start so the columns line up.
  const shown = layout ? cards.slice(rows.first * layout.columns, (rows.last + 1) * layout.columns) : cards.slice(0, FIRST_CARDS);
  return (
    <>
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-1">
        <div className="relative" style={layout ? { height: gridHeight(cards.length, layout) } : undefined}>
          <div
            ref={grid}
            className={`absolute inset-x-0 grid content-start ${compact ? 'grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-x-1.5' : 'grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-2'}`}
            style={{ top: layout ? rows.first * layout.pitch : 0, rowGap: layout ? layout.pitch : MIN_GAP }}
          >
            {shown.map((c) => (
              <GridCell
                key={c.id}
                card={c}
                count={counts?.get(c.id) ?? 0}
                locked={isLocked?.(c) ?? false}
                copies={c.limitedCopies ? copies(c.id) : 0}
                selected={c.id === selectedId}
                onSelect={onSelect}
                onRemove={onRemove}
                press={holdToInspect ? hold.press : undefined}
                clicked={hold.clicked}
                inspectOn={inspectOn}
              />
            ))}
          </div>
        </div>
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
});
