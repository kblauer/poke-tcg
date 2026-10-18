import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { CardGrid } from '../components/CardGrid';
import { CardInspector } from '../components/CardInspector';
import { DeckFilters } from '../components/DeckFilters';
import { CurrentDeck, DeckList } from '../components/DeckList';
import { DeckPanel } from '../components/DeckPanel';
import { InspectContext } from '../components/InspectContext';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import { setNames, type CatalogCard } from '../utils/cardList';
import { EMPTY_DECK_FILTER, cantAdd, changeCount, filterForDeck, problemsOf, sortForDeck, type DeckEntry, type DeckFilter, type DeckSort } from '../utils/deckBuilder';
import { PAGE_WIDTH } from '../utils/layout';

const button = 'rounded px-3 py-1 text-sm disabled:opacity-40';

/**
 * Deck builder. On the left, the account's decks first (`DeckList`: open one, start a new one, rename or
 * copy one, drag to reorder); once a deck is open, the deck as a button back to the list (renaming it there
 * is an unsaved change, like its cards), save and delete, and its cards. The card search is on the right: clicking a card adds a copy to the open deck.
 * Cards not unlocked yet (win them in runs) are darker and can't be added. Right-clicking any card (in the
 * search, the open deck or a deck's headline Pokémon) opens it large, with − and + for the open deck.
 * A link can open a deck straight away: `?deck=<id>`, or `?deck=new` for a new one.
 */
export function DecksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The catalog only changes when the seed is re-run, so load it once per session.
  const catalog = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const decks = useQuery(trpc.decks.list.queryOptions());
  const { isLocked } = useUnlocked();

  /** A deck is open (false: the deck list is shown). */
  const [editing, setEditing] = useState(false);
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
  /** The card opened with a right-click (CardInspector). */
  const [inspected, setInspected] = useState<CatalogCard | null>(null);

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
        close(true);
        return refresh();
      },
    }),
  );
  const duplicate = useMutation(
    trpc.decks.duplicate.mutationOptions({
      onSuccess: async ({ id }) => {
        await refresh();
        open(id);
      },
    }),
  );
  const reorder = useMutation(trpc.decks.reorder.mutationOptions({ onSettled: refresh }));
  const rename = useMutation(trpc.decks.rename.mutationOptions({ onSuccess: refresh }));

  const byId = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.id, c])), [catalog.data]);
  const sets = useMemo(() => (catalog.data ? setNames(catalog.data) : []), [catalog.data]);
  const results = useMemo(() => (catalog.data ? sortForDeck(filterForDeck(catalog.data, filter, isLocked), sort) : []), [catalog.data, filter, sort, isLocked]);
  const counts = useMemo(() => new Map(entries.map((e) => [e.cardId, e.quantity])), [entries]);

  // Opened from a link to a deck: open it once the deck list is in (to name it), then drop it from the address.
  const linked = useSearch({ from: '/decks' }).deck;
  const navigate = useNavigate();
  useEffect(() => {
    if (!linked || !decks.data) return;
    if (linked === 'new') open(null, true);
    else if (decks.data.some((d) => d.id === linked)) open(linked, true);
    navigate({ to: '/decks', search: {}, replace: true });
  }, [linked, decks.data]);

  /** Opens a saved deck, or a new empty one (null), asking first if there are unsaved changes. */
  function open(id: string | null, force = false) {
    if (dirty && !force && !window.confirm('Discard the unsaved changes to this deck?')) return;
    setEditing(true);
    setDeckId(id);
    setDirty(false);
    setBlocked(null);
    setOpened((n) => n + 1);
    // A saved deck's cards replace these once they load (`loading` until then).
    setName(id === null ? 'New deck' : (decks.data?.find((d) => d.id === id)?.name ?? ''));
    setEntries([]);
  }

  /** Back to the deck list, asking first if there are unsaved changes. */
  function close(force = false) {
    if (dirty && !force && !window.confirm('Discard the unsaved changes to this deck?')) return;
    setEditing(false);
    setDeckId(null);
    setDirty(false);
    setBlocked(null);
    setEntries([]);
  }

  function change(card: CatalogCard, by: 1 | -1) {
    if (!editing) return setBlocked('Open a deck or start a new one to add cards');
    if (loading) return;
    const reason = by > 0 ? blockedFor(card) : null;
    setBlocked(reason);
    if (reason) return;
    setEntries((e) => changeCount(e, card.id, by));
    setDirty(true);
  }

  if (catalog.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{catalog.error.message}</p>;
  if (!catalog.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading cards…</p>;

  const problems = problemsOf(entries, byId);
  /** Why another copy of the card can't go in the open deck, or null. */
  const blockedFor = (card: CatalogCard) => (isLocked(card) ? `${card.name} isn't unlocked yet: win it in a run` : cantAdd(entries, card, byId));
  const error = save.error?.message ?? remove.error?.message ?? saved.error?.message;
  const listError = decks.error?.message ?? duplicate.error?.message ?? reorder.error?.message ?? rename.error?.message;
  return (
    <InspectContext.Provider value={setInspected}>
      <div className={`${PAGE_WIDTH} grid gap-4 lg:grid-cols-[24rem_1fr]`}>
        {!editing ? (
          <div className="flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
            {decks.data ? (
              <DeckList
                decks={decks.data}
                byId={byId}
                isLocked={isLocked}
                onOpen={(id) => open(id)}
                onNew={() => open(null)}
                onCopy={(id) => duplicate.mutate({ deckId: id })}
                onRename={(id, newName) => rename.mutate({ deckId: id, name: newName })}
                onReorder={(ids) => reorder.mutate({ deckIds: ids })}
                busy={duplicate.isPending}
              />
            ) : (
              !decks.error && <p className="text-sm text-slate-400">Loading your decks…</p>
            )}
            {listError && <p className="text-xs text-red-400">{listError}</p>}
          </div>
        ) : (
          <div className="flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
            <CurrentDeck
              name={name}
              onRename={(newName) => {
                if (loading) return;
                setName(newName);
                setDirty(true);
              }}
              entries={entries} ready={problems.length === 0} byId={byId} isLocked={isLocked} onBack={() => close()} />
            <div className="space-y-2 rounded-lg bg-slate-900 p-3">
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
                    // Named as saved (as in the deck list), not as it may have been renamed since.
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
        )}
        <div className="flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
          <DeckFilters filter={filter} sort={sort} sets={sets} shown={results.length} total={catalog.data.length} onChange={setFilter} onSortChange={setSort} />
          {blocked && <p className="text-sm text-amber-300">{blocked}.</p>}
          <CardGrid cards={results} selectedId={null} onSelect={(c) => change(c, 1)} counts={counts} isLocked={isLocked} holdToInspect />
        </div>
      </div>
      {inspected && (
        <CardInspector
          card={inspected}
          locked={isLocked(inspected)}
          deck={editing && !loading ? { name, copies: counts.get(inspected.id) ?? 0, blocked: blockedFor(inspected), onChange: (by) => change(inspected, by) } : undefined}
          onClose={() => setInspected(null)}
        />
      )}
    </InspectContext.Provider>
  );
}
