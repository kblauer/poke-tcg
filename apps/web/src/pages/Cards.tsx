import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CardFilters } from '../components/CardFilters';
import { CardGrid } from '../components/CardGrid';
import { CardViewer } from '../components/CardViewer';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTRPC } from '../lib/trpc';
import { EMPTY_FILTER, filterCards, setNames, sortCards, type CardFilter, type CardSort } from '../utils/cardList';
import { PAGE_WIDTH, WIDE_SCREEN } from '../utils/layout';

/**
 * Card browser: searchable, filterable grid on the left, the selected card on the right. A smaller screen
 * has only room for the grid, so the selected card opens over it; tapping anywhere closes it.
 */
export function CardsPage() {
  const trpc = useTRPC();
  // The catalog only changes when the seed is re-run, so load it once per session.
  const { data, error } = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<CardSort>({ key: 'set', dir: 'asc' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE_SCREEN);

  const sets = useMemo(() => (data ? setNames(data) : []), [data]);
  const cards = useMemo(() => (data ? sortCards(filterCards(data, filter), sort) : []), [data, filter, sort]);

  if (error) return <p className={`${PAGE_WIDTH} text-red-400`}>{error.message}</p>;
  if (!data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading cards…</p>;

  const selected = data.find((c) => c.id === selectedId) ?? null;
  return (
    <div className={`${PAGE_WIDTH} grid gap-4 lg:grid-cols-2`}>
      <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-3">
        <CardFilters filter={filter} sort={sort} sets={sets} shown={cards.length} total={data.length} onFilterChange={setFilter} onSortChange={setSort} />
        <CardGrid cards={cards} selectedId={selectedId} onSelect={(c) => setSelectedId(c.id)} />
      </div>
      {wide ? (
        <div className="sticky top-4 self-start">
          <CardViewer card={selected} />
        </div>
      ) : (
        selected && (
          <div
            role="dialog"
            aria-label={selected.name}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4"
            onClick={() => setSelectedId(null)}
          >
            <div className="w-full">
              <CardViewer card={selected} />
            </div>
          </div>
        )
      )}
    </div>
  );
}
