import TuneIcon from '@mui/icons-material/Tune';
import ViewListIcon from '@mui/icons-material/ViewList';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DECK_SIZE } from '@poke-tcg/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CardGrid } from '../components/CardGrid';
import { CardInspector } from '../components/CardInspector';
import { DeckFilters } from '../components/DeckFilters';
import { CurrentDeck, DeckList } from '../components/DeckList';
import { DeckPanel } from '../components/DeckPanel';
import { ImportDeckDialog, ShareDeckDialog } from '../components/DeckShare';
import { InspectContext } from '../components/InspectContext';
import { SidePanel } from '../components/SidePanel';
import { useFavorites } from '../hooks/useFavorites';
import { useIsPhone } from '../hooks/useIsPhone';
import { useSwipe } from '../hooks/useSwipe';
import { useUnlocked } from '../hooks/useUnlocked';
import { useWindowFill } from '../hooks/useWindowFill';
import { useTRPC } from '../lib/trpc';
import { isVersion, setGroups, type CatalogCard } from '../utils/cardList';
import { EMPTY_DECK_FILTER, LOCKED_DECK_PROBLEM, cantAdd, changeCount, deckSize, filterForDeck, hasLockedCards, lockedWarning, problemsOf, sortForDeck, type DeckEntry, type DeckFilter, type DeckSort } from '../utils/deckBuilder';
import { PAGE_WIDTH } from '../utils/layout';
import { PAGE_BUTTON as button } from '../utils/styles';

const READ_ONLY = "This is your run's deck, which follows the run: copy it to make changes, or save it when the run is over";

/**
 * Deck builder. On the left, the account's decks first (`DeckList`: open one, start a new one, rename or
 * copy one, drag to reorder); once a deck is open, the deck as a button back to the list (renaming it there
 * is an unsaved change, like its cards), save and delete, and its cards. The card search is on the right: clicking a card adds a copy to the open deck.
 * Cards not unlocked yet (win them in runs) are darker. They can be added, with a warning: a deck holding any can't be
 * played until they're unlocked (agreed with the user). Right-clicking any card (in the
 * search, the open deck or a deck's headline Pokémon) opens it large, with − and + for the open deck.
 * Share (a saved deck) gives its share code and publishes it to Community Decks; Import (the deck list) saves a code's deck.
 * A link can open a deck straight away: `?deck=<id>`, or `?deck=new` for a new one.
 * The search's Favorites toggle shows only the account's favorite cards (the ★ on a card opened large adds it).
 * On a phone held upright (useIsPhone) the cards fill the screen, under a bar with two buttons: one slides in the decks
 * (or the open deck, with its cards) from the left, as does a swipe to the right, the other the search from the right (SidePanel). Opening a saved deck keeps
 * the panel open, showing that deck's cards; starting a new one closes it, so cards can be tapped into it.
 */
export function DecksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The catalog only changes when the seed is re-run, so load it once per session.
  const catalog = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const decks = useQuery(trpc.decks.list.queryOptions());
  const { isLocked, copies, holoCopies } = useUnlocked();
  const favorites = useFavorites();
  const phone = useIsPhone();
  const fill = useWindowFill<HTMLDivElement>();

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
  /** Why the last card clicked couldn't be added, or that adding it locked the deck (lockedWarning). */
  const [blocked, setBlocked] = useState<string | null>(null);
  /** The Share dialog (the open deck's) or the Import one is open. */
  const [dialog, setDialog] = useState<'share' | 'import' | null>(null);
  /** The deck picked with the deck list's Publish icon, whose Share dialog is open. */
  const [sharedId, setSharedId] = useState<string | null>(null);
  /** The card opened with a right-click (CardInspector). */
  const [inspected, setInspected] = useState<CatalogCard | null>(null);
  /** On a phone: the side panel slid in, if any. */
  const [panel, setPanel] = useState<'decks' | 'filters' | null>(null);
  // On a phone, a swipe to the right slides the decks (the open deck's cards) in. The page only pans up and down
  // (touch-pan-y), so the browser doesn't take a sideways swipe as going back.
  const swipe = useSwipe({ onRight: () => setPanel('decks') });

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
  const favorite = useMutation(trpc.decks.favoriteDeck.mutationOptions({ onSuccess: refresh }));
  // Crafting: Stardust (earned from packs) unlocks a card as pulling it would.
  const stardust = useQuery(trpc.packs.stardust.queryOptions());
  // Only cards from sets whose packs are unlocked can be crafted.
  const unlockedSets = useQuery(trpc.packs.unlockedSets.queryOptions());
  const craft = useMutation(
    trpc.packs.craft.mutationOptions({
      onSuccess: ({ stardust: left }) => {
        queryClient.setQueryData(trpc.packs.stardust.queryKey(), left);
        queryClient.invalidateQueries({ queryKey: trpc.decks.unlocked.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
      },
    }),
  );
  /** Why the card can't be crafted now, or null: one already unlocked (unless it counts copies), its set's packs still locked, or too little Stardust. */
  const craftBlocked = (card: CatalogCard, cost: number) =>
    !isLocked(card) && !card.limitedCopies
      ? `${card.name} is already unlocked`
      : !unlockedSets.data?.includes(card.setId)
        ? `Unlock ${card.setName} booster packs to craft its cards`
        : (stardust.data ?? 0) < cost
        ? `Crafting it takes ${cost} Stardust; you have ${stardust.data ?? 0}`
        : null;

  const byId = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.id, c])), [catalog.data]);
  const sets = useMemo(() => (catalog.data ? setGroups(catalog.data) : []), [catalog.data]);
  // Holo Energy and reverse holos (versions of other cards, agreed with the user) only show once they've been gained.
  const searchable = useMemo(() => (catalog.data ?? []).filter((c) => !isVersion(c) || copies(c.id) > 0), [catalog.data, copies]);
  // The grid follows the filters a beat behind the typing (useDeferredValue): a keystroke shows at once, the whole catalog's
  // filtering, sorting and re-rendering comes after it rather than holding it up.
  const shownFilter = useDeferredValue(filter);
  const results = useMemo(() => sortForDeck(filterForDeck(searchable, shownFilter, isLocked, favorites.isFavorite), sort), [searchable, shownFilter, sort, isLocked, favorites.isFavorite]);
  // The numbers of cards shown and in all: holo Energy and reverse holos are never counted (they're versions of other cards).
  const shownCount = useMemo(() => results.filter((c) => !isVersion(c)).length, [results]);
  const totalCount = useMemo(() => (catalog.data ?? []).filter((c) => !isVersion(c)).length, [catalog.data]);
  const counts = useMemo(() => new Map(entries.map((e) => [e.cardId, e.quantity])), [entries]);
  /** The open deck is the automatic run deck: it can be looked at and copied, not changed. */
  const readOnly = deckId !== null && (decks.data?.find((d) => d.id === deckId)?.runDeck ?? false);

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
    // On a phone, a saved deck opens in the decks panel, which stays open to show it (agreed); a new one closes it, so cards can be tapped in.
    if (id === null) setPanel(null);
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
    if (readOnly) return setBlocked(READ_ONLY);
    if (loading) return;
    const reason = by > 0 ? blockedFor(card) : null;
    // A locked card goes in, with a warning that the deck can't be played.
    setBlocked(reason ?? (by > 0 ? lockedWarning(entries, card, isLocked(card), copies(card.id)) : null));
    if (reason) return;
    setEntries((e) => changeCount(e, card.id, by));
    setDirty(true);
  }

  if (catalog.error && !catalog.data) return <p className={`${PAGE_WIDTH} text-red-400`}>{catalog.error.message}</p>;
  if (!catalog.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading cards…</p>;

  // The rules' problems (all a deck needs to be published), then its locked cards'.
  const ruleProblems = problemsOf(entries, byId);
  const problems = hasLockedCards(entries, byId, isLocked, copies) ? [...ruleProblems, LOCKED_DECK_PROBLEM] : ruleProblems;
  /** Why another copy of the card can't go in the open deck, or null. */
  const blockedFor = (card: CatalogCard) => cantAdd(entries, card, byId);
  const sharedDeck = decks.data?.find((d) => d.id === sharedId);
  const error = save.error?.message ?? remove.error?.message ?? saved.error?.message;
  const listError = decks.error?.message ?? duplicate.error?.message ?? reorder.error?.message ?? rename.error?.message;
  // Shares the saved deck, so changes are saved first.
  const shareButton = deckId && (
    <button className={`${button} bg-slate-600 hover:bg-slate-500`} disabled={loading || dirty} title={dirty ? 'Save the deck to share it' : 'Copy its deck code, or publish it to Community Decks'} onClick={() => setDialog('share')}>
      Share
    </button>
  );
  /** The left column: the deck list, or the open deck. */
  // On a phone (in its side panel) the open deck's column scrolls as a whole (the deck list scrolls its decks).
  const column = phone ? `flex min-h-0 flex-1 flex-col gap-2 ${editing ? 'overflow-y-auto' : ''}` : 'flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]';
  const deckColumn = !editing ? (
    <div className={column}>
      {decks.data ? (
        <DeckList
          decks={decks.data}
          onOpen={(id) => open(id)}
          onNew={() => open(null)}
          onCopy={(id) => duplicate.mutate({ deckId: id })}
          onRename={(id, newName) => rename.mutate({ deckId: id, name: newName })}
          onFavorite={(id, on) => favorite.mutate({ deckId: id, favorite: on })}
          onReorder={(ids) => reorder.mutate({ deckIds: ids })}
          onImport={() => setDialog('import')}
          onShare={setSharedId}
          busy={duplicate.isPending}
          compact={phone}
        />
      ) : (
        !decks.error && <p className="text-sm text-slate-400">Loading your decks…</p>
      )}
      {listError && <p className="text-xs text-red-400">{listError}</p>}
    </div>
  ) : (
    <div className={column}>
      <CurrentDeck
        compact={phone}
        cosmetics={decks.data?.find((d) => d.id === deckId)?.cosmetics}
        name={name}
        readOnly={readOnly}
        onRename={(newName) => {
          if (loading) return;
          setName(newName);
          setDirty(true);
        }}
        entries={entries} ready={problems.length === 0} onBack={() => close()} />
      <div className={`space-y-2 rounded-lg bg-slate-900 ${phone ? 'p-2' : 'p-3'}`}>
        {readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button className={`${button} bg-slate-600 hover:bg-slate-500`} disabled={duplicate.isPending || loading} onClick={() => deckId && duplicate.mutate({ deckId })}>
              Copy to edit
            </button>
            {shareButton}
            <span className="text-xs text-slate-400">Your run's deck: it changes with the run (trades, switching decks).</span>
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2">
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
          {shareButton}
          {loading ? <span className="text-xs text-slate-400">Loading the deck…</span> : dirty && <span className="text-xs text-slate-400">Unsaved changes</span>}
        </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <DeckPanel entries={entries} byId={byId} problems={problems} isLocked={isLocked} onChange={(cardId, by) => change(byId.get(cardId)!, by)} compact={phone} />
    </div>
  );
  const filters = <DeckFilters filter={filter} sort={sort} sets={sets} shown={shownCount} total={totalCount} onChange={setFilter} onSortChange={setSort} compact={phone} />;
  const blockedNote = blocked && <p className={`${phone ? 'text-xs' : 'text-sm'} text-amber-300`}>{blocked}.</p>;
  const grid = <CardGrid cards={results} selectedId={null} onSelect={(c) => change(c, 1)} onRemove={(c) => change(c, -1)} counts={counts} isLocked={isLocked} holdToInspect compact={phone} />;
  /** How many of the search's filters are set (the phone's Filters button shows it). */
  const filtersOn = (Object.keys(EMPTY_DECK_FILTER) as (keyof DeckFilter)[]).filter((k) => JSON.stringify(filter[k]) !== JSON.stringify(EMPTY_DECK_FILTER[k])).length;
  const size = deckSize(entries);
  const barButton = 'flex min-w-0 items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm ring-1 ring-slate-600 transition hover:bg-slate-700 active:bg-slate-700';
  const decksButton = (
    <button className={`${barButton} ${editing ? 'ring-yellow-300/60' : ''}`} onClick={() => setPanel('decks')}>
      <ViewListIcon sx={{ fontSize: 18 }} className="shrink-0 text-slate-400" />
      {editing ? (
        <>
          <span className="truncate font-semibold">{name}</span>
          <span className={`shrink-0 text-xs ${problems.length === 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
            {size}/{DECK_SIZE}
            {dirty && ' •'}
          </span>
        </>
      ) : (
        'Decks'
      )}
    </button>
  );
  const decksPanel = panel === 'decks' && (
    <SidePanel side="left" title={editing ? 'Open deck' : 'Your decks'} onClose={() => setPanel(null)}>
      {deckColumn}
    </SidePanel>
  );
  return (
    <InspectContext.Provider value={setInspected}>
      {phone ? (
        // To the bottom of the screen (-mb-4 undoes the layout's spacing): the bar, then the cards.
        <div ref={fill.ref} style={fill.style} className="-mb-4 flex touch-pan-y flex-col gap-2 overscroll-x-none px-2 pb-2" {...swipe}>
          <div className="flex shrink-0 items-center gap-2">
            {decksButton}
            <button className={`${barButton} shrink-0 ${filtersOn ? 'ring-yellow-300/60' : ''}`} onClick={() => setPanel('filters')}>
              <TuneIcon sx={{ fontSize: 18 }} className="text-slate-400" />
              Filters
              {filtersOn > 0 && <span className="rounded-full bg-yellow-300 px-1.5 text-xs font-semibold text-slate-900">{filtersOn}</span>}
            </button>
            <span className="ml-auto shrink-0 text-xs text-slate-400">{shownCount === totalCount ? `${shownCount} cards` : `${shownCount} of ${totalCount}`}</span>
          </div>
          {blockedNote}
          {grid}
          {decksPanel}
          {panel === 'filters' && (
            <SidePanel side="right" title="Search" onClose={() => setPanel(null)}>
              {filters}
            </SidePanel>
          )}
        </div>
      ) : (
        <div className={`${PAGE_WIDTH} grid gap-4 lg:grid-cols-[24rem_1fr]`}>
          {deckColumn}
          <div className="flex h-[70vh] flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
            {filters}
            {blockedNote}
            {grid}
          </div>
        </div>
      )}
      {inspected && (
        <CardInspector
          card={inspected}
          locked={isLocked(inspected)}
          deck={editing && !loading && !readOnly ? { name, copies: counts.get(inspected.id) ?? 0, blocked: blockedFor(inspected), onChange: (by) => change(inspected, by) } : undefined}
          favorite={{ on: favorites.isFavorite(inspected.id), onToggle: () => favorites.toggle(inspected.id) }}
          unlocked={holoCopies(inspected)}
          craft={
            inspected.craftCost !== null && stardust.data !== undefined
              ? {
                  cost: inspected.craftCost,
                  stardust: stardust.data,
                  blocked: craftBlocked(inspected, inspected.craftCost),
                  pending: craft.isPending,
                  error: craft.variables?.cardId === inspected.id ? craft.error?.message : undefined,
                  onCraft: () => craft.mutate({ cardId: inspected.id }),
                }
              : undefined
          }
          onClose={() => setInspected(null)}
        />
      )}
      {dialog === 'share' && deckId && <ShareDeckDialog deckId={deckId} name={name} problem={ruleProblems[0]} onClose={() => setDialog(null)} />}
      {sharedDeck && <ShareDeckDialog deckId={sharedDeck.id} name={sharedDeck.name} problem={problemsOf(sharedDeck.cards, byId)[0]} onClose={() => setSharedId(null)} />}
      {dialog === 'import' && (
        <ImportDeckDialog
          onClose={() => setDialog(null)}
          onImported={(id, locked) => {
            setDialog(null);
            open(id);
            if (locked) setBlocked("Imported. Some of its cards aren't unlocked yet: the deck can't be played until they are");
          }}
        />
      )}
    </InspectContext.Provider>
  );
}
