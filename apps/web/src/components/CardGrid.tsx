import type { CatalogCard } from '../utils/cardList';

/** Scrollable grid of low-res card images. Columns fill the available width. */
export function CardGrid({
  cards,
  selectedId,
  onSelect,
}: {
  cards: CatalogCard[];
  selectedId: string | null;
  onSelect: (card: CatalogCard) => void;
}) {
  if (cards.length === 0) return <p className="p-4 text-center text-slate-500">No cards match these filters.</p>;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] content-start gap-2 overflow-y-auto p-1">
      {cards.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          title={`${c.name} · ${c.setName} #${c.number}`}
          className={`aspect-[63/88] overflow-hidden rounded-md transition hover:-translate-y-0.5 hover:shadow-lg ${
            c.id === selectedId ? 'ring-2 ring-yellow-300' : ''
          }`}
        >
          {c.imageUrl ? (
            <img src={`${c.imageUrl}/low.webp`} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-slate-800 p-1 text-xs">{c.name}</div>
          )}
        </button>
      ))}
    </div>
  );
}
