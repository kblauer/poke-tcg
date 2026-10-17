import type { CatalogCard } from '../utils/cardList';

/**
 * Scrollable grid of low-res card images. Columns fill the available width.
 * Rows overlap like a fanned-out stack: the row gap is the only space between rows, so each card
 * shows just its top strip with the name. Hovering a strip brings that card to the front.
 * `counts` (the deck builder) puts a badge with each card's copies in the deck on its strip.
 */
export function CardGrid({
  cards,
  selectedId,
  onSelect,
  counts,
}: {
  cards: CatalogCard[];
  selectedId: string | null;
  onSelect: (card: CatalogCard) => void;
  counts?: Map<string, number>;
}) {
  if (cards.length === 0) return <p className="p-4 text-center text-slate-500">No cards match these filters.</p>;
  return (
    // Narrower columns on a phone, so it isn't just two.
    <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] content-start gap-x-2 gap-y-6 overflow-y-auto p-1 max-sm:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]">
      {cards.map((c) => (
        // Zero-height cell: the card hangs down from it and later rows paint over it.
        // The last row's overflow still extends the scroll area.
        <div key={c.id} className="group relative h-0">
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 aspect-[63/88] overflow-hidden rounded-md shadow-md shadow-black/60 transition group-hover:z-10 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-within:z-10 group-focus-within:ring-2 group-focus-within:ring-sky-400 ${
              c.id === selectedId ? 'ring-2 ring-yellow-300' : ''
            }`}
          >
            {c.imageUrl ? (
              <img src={`${c.imageUrl}/low.webp`} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-slate-800 p-1 text-xs">{c.name}</div>
            )}
            {counts?.get(c.id) ? (
              <span className="absolute right-1 top-1 rounded-full bg-yellow-300 px-1.5 text-xs font-bold text-slate-900 shadow">×{counts.get(c.id)}</span>
            ) : null}
          </div>
          {/* Click target the size of the card, kept above every card so moving down a column reaches the
              next strip even while a hovered card covers it. Later buttons paint over earlier ones, so
              only the visible strip is clickable, except on the last card in a column, where it's all of it. */}
          <button
            onClick={() => onSelect(c)}
            title={`${c.name} · ${c.setName} #${c.number}`}
            aria-label={c.name}
            className="absolute inset-x-0 top-0 z-20 aspect-[63/88] outline-none"
          />
        </div>
      ))}
    </div>
  );
}
