import { DECK_NAME_LENGTH } from '@poke-tcg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { CardGrid } from '../components/CardGrid';
import { DeckFilters } from '../components/DeckFilters';
import { DeckPanel } from '../components/DeckPanel';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import { setNames, type CatalogCard } from '../utils/cardList';
import { EMPTY_DECK_FILTER, cantAdd, changeCount, filterForDeck, problemsOf, sortForDeck, type DeckEntry, type DeckFilter, type DeckSort } from '../utils/deckBuilder';
import { PAGE_WIDTH } from '../utils/layout';

const input = 'rounded bg-slate-800 px-2 py-1 text-sm outline-none ring-yellow-300 focus:ring-1';
const button = 'rounded px-3 py-1 text-sm disabled:opacity-40';

/**
 * Deck builder: the deck being built on the left (pick a saved deck or start a new one, name it, save
 * or delete it), the card search on the right. Clicking a card in the search adds a copy. Cards not
 * unlocked yet (win them in runs) are darker and can't be added.
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

  /**
   * The `opened` count whose saved cards are in the editor. Until a saved deck's cards arrive it can't be
   * edited, saved or deleted: the editor would still hold the previous deck's cards.
   */
  const [loaded, setLoaded] = useState(0);
  const loading = deckId !== null && loaded !== opened;

  const saved = useQuery({ ...trpc.decks.get.queryOptions({ deckId: deckId ?? '' }), enabled: deckId !== null });
  // Load the saved cards when a deck is opened, and when it's reloaded unless there are edits to keep.
  useEffect(() => {
    if (!saved.data || (dirty && loaded === opened)) return;
    setName(saved.data.name);
    setEntries(saved.data.cards);
    setLoaded(opened);
  }, [saved.data, opened]);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() }), queryClient.invalidateQueries({ queryKey: trpc.decks.get.queryKey() })]);
  const save = useMutation(
    trpc.decks.save.mutationOptions({
      onSuccess: ({ id }) => {
        setDeckId(id);
        setDirty(false);
        // The editor already holds what was saved.
        setLoaded(opened);
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
  const results = useMemo(() => (catalog.data ? sortForDeck(filterForDeck(catalog.data, filter, isLocked), sort) : []), [catalog.data, filter, sort, isLocked]);
  const counts = useMemo(() => new Map(entries.map((e) => [e.cardId, e.quantity])), [entries]);

  /** Opens a saved deck, or a new empty one (null), asking first if there are unsaved changes. */
  function open(id: string | null, force = false) {
    if (dirty && !force && !window.confirm('Discard the unsaved changes to this deck?')) return;
    setDeckId(id);
    setDirty(false);
    setBlocked(null);
    setOpened((n) => n + 1);
    // A saved deck's cards replace these once they load (`loading` until then).
    setName(id === null ? 'New deck' : (decks.data?.find((d) => d.id === id)?.name ?? ''));
    setEntries([]);
  }

  function change(card: CatalogCard, by: 1 | -1) {
    if (loading) return;
    const reason = by > 0 ? (isLocked(card) ? `${card.name} isn't unlocked yet: win it in a run` : cantAdd(entries, card, byId)) : null;
    setBlocked(reason);
    if (reason) return;
    setEntries((e) => changeCount(e, card.id, by));
    setDirty(true);
  }

  if (catalog.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{catalog.error.message}</p>;
  if (!catalog.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading cards…</p>;

  const problems = problemsOf(entries, byId);
  const error = save.error?.message ?? remove.error?.message ?? saved.error?.message;
  return (
    <div className={`${PAGE_WIDTH} grid gap-4 lg:grid-cols-[24rem_1fr]`}>
      <div className="flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
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
            disabled={loading}
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
              disabled={save.isPending || loading || !name.trim() || (!dirty && deckId !== null)}
              onClick={() => save.mutate({ ...(deckId && { deckId }), name: name.trim(), cards: entries })}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {deckId && (
              <button
                className={`${button} bg-slate-700 hover:bg-red-700`}
                disabled={remove.isPending || loading}
                // Named as saved (the dropdown's deck), not as it may have been renamed since.
                onClick={() => window.confirm(`Delete ${decks.data?.find((d) => d.id === deckId)?.name ?? name}?`) && remove.mutate({ deckId })}
              >
                Delete
              </button>
            )}
            {loading ? <span className="text-xs text-slate-400">Loading the deck…</span> : dirty && <span className="text-xs text-slate-400">Unsaved changes</span>}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DeckPanel entries={entries} byId={byId} problems={problems} isLocked={isLocked} onChange={(cardId, by) => change(byId.get(cardId)!, by)} />
      </div>
      <div className="flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
        <DeckFilters filter={filter} sort={sort} sets={sets} shown={results.length} total={catalog.data.length} onChange={setFilter} onSortChange={setSort} />
        {blocked && <p className="text-sm text-amber-300">{blocked}.</p>}
        <CardGrid cards={results} selectedId={null} onSelect={(c) => change(c, 1)} counts={counts} isLocked={isLocked} holdToInspect />
      </div>
    </div>
  );
}
