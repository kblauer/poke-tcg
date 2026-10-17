import { DECK_NAME_LENGTH } from '@poke-tcg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { CardGrid } from '../components/CardGrid';
import { DeckFilters } from '../components/DeckFilters';
import { DeckPanel } from '../components/DeckPanel';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import { setNames, type CatalogCard } from '../utils/cardList';
import { EMPTY_DECK_FILTER, cantAdd, changeCount, deckSize, filterForDeck, problemsOf, sortForDeck, type DeckEntry, type DeckFilter, type DeckSort } from '../utils/deckBuilder';
import { PAGE_WIDTH } from '../utils/layout';

const input = 'rounded bg-slate-800 px-2 py-1 text-sm outline-none ring-yellow-300 focus:ring-1';
const button = 'rounded px-3 py-1 text-sm disabled:opacity-40';
const tab = 'flex-1 rounded px-3 py-1.5 text-sm transition aria-selected:bg-slate-700 aria-selected:text-slate-100 text-slate-400';

/**
 * Deck builder: the deck being built on the left (pick a saved deck or start a new one, name it, save
 * or delete it), the card search on the right. Clicking a card in the search adds a copy. Cards not
 * unlocked yet (win them in runs) are darker and can't be added. Below the lg breakpoint there's only room
 * for one of the two columns, so tabs switch between them.
 */
export function DecksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The catalog only changes when the seed is re-run, so load it once per session.
  const catalog = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const decks = useQuery(trpc.decks.list.queryOptions());
  const { isLocked } = useUnlocked();

  /** The saved deck being edited; null for a new one. */
  const [deckId, setDeckId] = useState<string | null>(null);
  const [name, setName] = useState('New deck');
  const [entries, setEntries] = useState<DeckEntry[]>([]);
  /** Changed since it was opened or saved. */
  const [dirty, setDirty] = useState(false);
  /** Bumped each time a deck is (re)opened, so its saved cards load even when they're already cached. */
  const [opened, setOpened] = useState(0);
  const [filter, setFilter] = useState<DeckFilter>(EMPTY_DECK_FILTER);
  const [sort, setSort] = useState<DeckSort>('set');
  /** Why the last card clicked couldn't be added. */
  const [blocked, setBlocked] = useState<string | null>(null);
  /** The column shown on a smaller screen. */
  const [shown, setShown] = useState<'deck' | 'search'>('deck');

  const saved = useQuery({ ...trpc.decks.get.queryOptions({ deckId: deckId ?? '' }), enabled: deckId !== null });
  // Load the saved cards when a deck is opened or reloaded, unless there are edits to keep.
  useEffect(() => {
    if (!saved.data || dirty) return;
    setName(saved.data.name);
    setEntries(saved.data.cards);
  }, [saved.data, opened]);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() }), queryClient.invalidateQueries({ queryKey: trpc.decks.get.queryKey() })]);
  const save = useMutation(
    trpc.decks.save.mutationOptions({
      onSuccess: ({ id }) => {
        setDeckId(id);
        setDirty(false);
        return refresh();
      },
    }),
  );
  const remove = useMutation(
    trpc.decks.delete.mutationOptions({
      onSuccess: () => {
        open(null, true);
        return refresh();
      },
    }),
  );

  const byId = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.id, c])), [catalog.data]);
  const sets = useMemo(() => (catalog.data ? setNames(catalog.data) : []), [catalog.data]);
  const results = useMemo(() => (catalog.data ? sortForDeck(filterForDeck(catalog.data, filter), sort) : []), [catalog.data, filter, sort]);
  const counts = useMemo(() => new Map(entries.map((e) => [e.cardId, e.quantity])), [entries]);

  /** Opens a saved deck, or a new empty one (null), asking first if there are unsaved changes. */
  function open(id: string | null, force = false) {
    if (dirty && !force && !window.confirm('Discard the unsaved changes to this deck?')) return;
    setDeckId(id);
    setDirty(false);
    setBlocked(null);
    setOpened((n) => n + 1);
    if (id === null) {
      setName('New deck');
      setEntries([]);
    }
  }

  function change(card: CatalogCard, by: 1 | -1) {
    const reason = by > 0 ? (isLocked(card) ? `${card.name} isn't unlocked yet: win it in a run` : cantAdd(entries, card, byId)) : null;
    setBlocked(reason);
    if (reason) return;
    setEntries((e) => changeCount(e, card.id, by));
    setDirty(true);
  }

  if (catalog.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{catalog.error.message}</p>;
  if (!catalog.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading cards…</p>;

  const problems = problemsOf(entries, byId);
  const error = save.error?.message ?? remove.error?.message;
  return (
    // Each column fills the window below the header; on a smaller screen, below the tabs too.
    <div className={`${PAGE_WIDTH} grid gap-4 max-lg:gap-3 lg:grid-cols-[24rem_1fr]`}>
      <div role="tablist" className="flex gap-1 rounded-lg bg-slate-900 p-1 lg:hidden">
        <button role="tab" aria-selected={shown === 'deck'} className={tab} onClick={() => setShown('deck')}>
          Deck ({deckSize(entries)}/60){dirty && ' •'}
        </button>
        <button role="tab" aria-selected={shown === 'search'} className={tab} onClick={() => setShown('search')}>
          Add cards
        </button>
      </div>
      <div className={`flex h-[calc(100dvh-10rem)] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)] ${shown === 'deck' ? '' : 'max-lg:hidden'}`}>
        <div className="space-y-2 rounded-lg bg-slate-900 p-3">
          <select value={deckId ?? ''} onChange={(e) => open(e.target.value || null)} className={`${input} w-full`} aria-label="Deck">
            <option value="">New deck</option>
            {decks.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.cardCount}/60{d.problems.length ? '' : ', ready'})
              </option>
            ))}
          </select>
          <input
            value={name}
            maxLength={DECK_NAME_LENGTH}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className={`${input} w-full`}
            aria-label="Deck name"
          />
          <div className="flex items-center gap-2">
            <button
              className={`${button} bg-emerald-600 font-semibold hover:bg-emerald-500`}
              disabled={save.isPending || !name.trim() || (!dirty && deckId !== null)}
              onClick={() => save.mutate({ ...(deckId && { deckId }), name: name.trim(), cards: entries })}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {deckId && (
              <button
                className={`${button} bg-slate-700 hover:bg-red-700`}
                disabled={remove.isPending}
                onClick={() => window.confirm(`Delete ${name}?`) && remove.mutate({ deckId })}
              >
                Delete
              </button>
            )}
            {dirty && <span className="text-xs text-slate-400">Unsaved changes</span>}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DeckPanel entries={entries} byId={byId} problems={problems} isLocked={isLocked} onChange={(cardId, by) => change(byId.get(cardId)!, by)} />
      </div>
      <div className={`flex h-[calc(100dvh-10rem)] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)] ${shown === 'search' ? '' : 'max-lg:hidden'}`}>
        <DeckFilters filter={filter} sort={sort} sets={sets} shown={results.length} total={catalog.data.length} onChange={setFilter} onSortChange={setSort} />
        {blocked && <p className="text-sm text-amber-300">{blocked}.</p>}
        <CardGrid cards={results} selectedId={null} onSelect={(c) => change(c, 1)} counts={counts} isLocked={isLocked} />
      </div>
    </div>
  );
}
