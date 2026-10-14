import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CardFilters } from '../components/CardFilters';
import { CardGrid } from '../components/CardGrid';
import { CardViewer } from '../components/CardViewer';
import { useTRPC } from '../lib/trpc';
import { EMPTY_FILTER, filterCards, sortCards, type CardFilter, type CardSort } from '../utils/cardList';

/** Card browser: searchable, filterable grid on the left, the selected card on the right. */
export function CardsPage() {
  const trpc = useTRPC();
  // The catalog only changes when the seed is re-run, so load it once per session.
  const { data, error } = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<CardSort>({ key: 'set', dir: 'asc' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cards = useMemo(() => (data ? sortCards(filterCards(data, filter), sort) : []), [data, filter, sort]);

  if (error) return <p className="text-red-400">{error.message}</p>;
  if (!data) return <p className="text-slate-400">Loading cards…</p>;

  const selected = data.find((c) => c.id === selectedId) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
        <CardFilters filter={filter} sort={sort} shown={cards.length} total={data.length} onFilterChange={setFilter} onSortChange={setSort} />
        <CardGrid cards={cards} selectedId={selectedId} onSelect={(c) => setSelectedId(c.id)} />
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <CardViewer card={selected} />
      </div>
    </div>
  );
}
