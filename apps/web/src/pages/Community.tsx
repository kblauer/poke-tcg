import { GENERATIONS } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppRouter } from '@poke-tcg/api/router';
import { DECK_SIZE } from '@poke-tcg/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect, useMemo, useState } from 'react';
import { CardImage } from '../components/CardImage';
import { DeckSummary } from '../components/DeckList';
import { GenerationFilter } from '../components/packs/GenerationFilter';
import { AccountNameField } from '../components/AccountMenu';
import { CopyButton } from '../components/DeckShare';
import { useInspectOnRightClick } from '../components/InspectContext';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import { cardTitle, type CatalogCard } from '../utils/cardList';
import { DECK_SECTIONS, allGenerations, deckInGenerations, featuredPokemon, generationsOf, withCards } from '../utils/deckBuilder';
import { PAGE_WIDTH } from '../utils/layout';

type CommunityDeck = inferRouterOutputs<AppRouter>['community']['list'][number];

const button = 'rounded px-3 py-1 text-sm disabled:opacity-40';

/**
 * Community Decks (`/community`): decks players have published (Share on the Collection tab), the latest first, for
 * everyone to see and import (agreed with the user), as tiles of one size (CommunityDeckTile: click one for its buttons). Each shows its author, description and what it holds, how many of
 * its cards the account hasn't unlocked, and its card list; Import saves it as one of the account's decks (with as many
 * of their own holos as they have) and opens it in the deck builder; Copy code gives its share code. The account's own
 * published decks can be unpublished, and its account name (shown on its decks, never its real name) changed. The search
 * matches deck names, authors and descriptions; the generation dropdown (GenerationFilter) shows the decks with cards
 * from any of the generations ticked.
 */
export function CommunityPage() {
  const trpc = useTRPC();
  // The catalog only changes when the seed is re-run, so load it once per session.
  const catalog = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const decks = useQuery(trpc.community.list.queryOptions());
  const { isLocked } = useUnlocked();
  const byId = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.id, c])), [catalog.data]);
  const [search, setSearch] = useState('');
  /** The generations whose decks are shown (all to start): a deck shows if any of its cards' generations is on. */
  const [shownGens, setShownGens] = useState<ReadonlySet<number>>(allGenerations);
  /** The deck tile clicked to focus it (its buttons showing), if any. */
  const [focused, setFocused] = useState<string | null>(null);
  // A click outside the tiles (not in a card opened large from one), or Escape, puts the focused one back.
  useEffect(() => {
    if (!focused) return;
    const away = (e: PointerEvent) => !(e.target as Element).closest?.('[data-community-tile], [role=dialog]') && setFocused(null);
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setFocused(null);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [focused]);

  const error = decks.error?.message ?? catalog.error?.message;
  if (error) return <p className={`${PAGE_WIDTH} text-red-400`}>{error}</p>;
  if (!decks.data || !catalog.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;

  const words = search.trim().toLowerCase();
  const shown = decks.data.filter(
    (d) =>
      (!words || [d.name, d.author, d.description].some((s) => s.toLowerCase().includes(words))) &&
      deckInGenerations(d.cards, byId, shownGens),
  );
  return (
    <div className={`space-y-4 ${PAGE_WIDTH}`}>
      <h2 className="text-2xl font-bold">Community Decks</h2>
      <p className="text-sm text-slate-400">
        Decks other players have published. Import one to get it in your{' '}
        <Link to="/decks" className="text-yellow-300 hover:underline">
          Collection
        </Link>
        , even with cards you haven't unlocked (it can't be played until you have them). To publish one of yours, open it on the Collection tab and use Share.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <AccountNameField />
        <GenerationFilter picked={shownGens} onChange={setShownGens} toggles compact />
        {/* The search right after the generation dropdown. */}
        <input
          className="w-full max-w-xs rounded bg-slate-900 px-3 py-1.5 text-sm ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400"
          placeholder="Search decks, authors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search community decks"
        />
      </div>
      {shown.length === 0 && <p className="text-sm text-slate-500">{decks.data.length ? 'No decks match the search and generations.' : 'No decks published yet.'}</p>}
      <ul className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((d) => (
          <CommunityDeckTile key={d.id} deck={d} byId={byId} isLocked={isLocked} focused={focused === d.id} onFocus={(on) => setFocused(on ? d.id : null)} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One community deck, a tile of the same size as the others: its name, author and date, description (cut short with an
 * ellipsis, under its Pokémon's names, on one line with commas, beside the Pokémon shown large over the Pokémon/Trainer/Energy bar; the generations its cards are from, G1, G2…,
 * top right) and how many of its cards you haven't unlocked, if any. Clicking it focuses it (`focused`, one at a time;
 * agreed with the user): it grows a little, shows its whole description and its buttons along the bottom (Import, Copy
 * code, Cards for its card list, Unpublish on your own); clicking it again, outside it or Escape puts it back.
 */
function CommunityDeckTile({
  deck,
  byId,
  isLocked,
  focused,
  onFocus,
}: {
  deck: CommunityDeck;
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  focused: boolean;
  onFocus: (focused: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCards, setShowCards] = useState(false);
  // The card list closes with the tile.
  useEffect(() => {
    if (!focused) setShowCards(false);
  }, [focused]);
  const importDeck = useMutation(
    trpc.community.import.mutationOptions({
      onSuccess: async ({ id }) => {
        // The deck builder opens `?deck=<id>` once its deck list has it.
        await queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey(), refetchType: 'all' });
        navigate({ to: '/decks', search: { deck: id } });
      },
    }),
  );
  const unpublish = useMutation(trpc.community.unpublish.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.community.list.queryKey() }) }));
  const cards = withCards(deck.cards, byId);
  const locked = cards.reduce((n, e) => n + (isLocked(e.card) ? e.quantity : 0), 0);
  const generations = generationsOf(cards);
  const featured = featuredPokemon(deck.cards, byId);
  return (
    <li
      data-community-tile
      role="button"
      tabIndex={0}
      aria-expanded={focused}
      onClick={() => onFocus(!focused)}
      onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onFocus(!focused)}
      className={`@container flex cursor-pointer flex-col gap-2 rounded-lg bg-slate-900 p-3 text-sm ring-1 transition focus:outline-none focus-visible:ring-yellow-300 ${
        focused ? 'relative z-10 min-h-80 scale-[1.03] shadow-xl shadow-black/60 ring-yellow-300' : 'h-80 overflow-hidden ring-slate-700 hover:ring-slate-500'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{deck.name}</span>
        {/* The generations its cards are from, before Yours and the card count. */}
        {generations.map((g) => (
          <span key={g} title={`Gen ${g} · ${GENERATIONS[g]!.region} cards`} className="shrink-0 rounded bg-slate-700 px-1.5 text-[10px] font-semibold leading-5 text-slate-200">
            G{g}
          </span>
        ))}
        {deck.mine && <span className="shrink-0 rounded bg-sky-700 px-1.5 text-[10px] font-semibold uppercase leading-5 tracking-wide text-sky-100">Yours</span>}
        <span className={`shrink-0 text-xs ${deck.cardCount === DECK_SIZE ? 'text-emerald-400' : 'text-slate-400'}`}>
          {deck.cardCount}/{DECK_SIZE}
        </span>
      </div>
      <p className="truncate text-xs text-slate-500">
        by {deck.author} · {new Date(deck.createdAt).toLocaleDateString()}
      </p>
      {/* Its Pokémon large, the bar under them, and their names (one line, comma separated) over the description on their right (under them on a narrow tile), cut
          short with an ellipsis until the tile is focused. */}
      <div className="flex flex-col gap-3 @md:flex-row">
        <DeckSummary entries={deck.cards} byId={byId} isLocked={isLocked} large />
        <div className="min-w-0 flex-1 space-y-1">
          {featured.length > 0 && (
            <p className="truncate font-semibold text-slate-200" title={featured.map((card) => card.name).join(', ')}>
              {featured.map((card) => card.name).join(', ')}
            </p>
          )}
          <p className={`break-words text-slate-300 ${focused ? 'whitespace-pre-line' : 'line-clamp-2 @md:line-clamp-6'}`}>{deck.description || <span className="italic text-slate-500">No description</span>}</p>
          {locked > 0 && <p className="text-xs text-amber-300">{locked} of its cards you haven't unlocked yet</p>}
        </div>
      </div>
      {focused && (
        // Its buttons and card list don't put the tile back.
        <div className="mt-auto space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2">
            <button className={`${button} bg-emerald-600 font-semibold hover:bg-emerald-500`} disabled={importDeck.isPending} onClick={() => importDeck.mutate({ communityDeckId: deck.id })}>
              {importDeck.isPending ? 'Importing…' : 'Import'}
            </button>
            <CopyButton text={deck.code} label="Copy code" className={`${button} bg-slate-600 hover:bg-slate-500`} />
            <button className={`${button} bg-slate-700 hover:bg-slate-600`} onClick={() => setShowCards((s) => !s)} aria-expanded={showCards}>
              {showCards ? 'Hide cards' : 'Cards'}
            </button>
            {deck.mine && (
              <button
                className={`${button} ml-auto bg-slate-700 hover:bg-red-700`}
                disabled={unpublish.isPending}
                onClick={() => window.confirm(`Take ${deck.name} off Community Decks?`) && unpublish.mutate({ communityDeckId: deck.id })}
              >
                Unpublish
              </button>
            )}
          </div>
          {(importDeck.error ?? unpublish.error) && <p className="text-xs text-red-400">{(importDeck.error ?? unpublish.error)!.message}</p>}
          {showCards && <CardList cards={cards} isLocked={isLocked} />}
        </div>
      )}
    </li>
  );
}

/** A deck's cards by section (Pokémon, Trainers, Energy), locked ones darker; right-clicking one opens it large. */
function CardList({ cards, isLocked }: { cards: ReturnType<typeof withCards>; isLocked: (card: CatalogCard) => boolean }) {
  const inspectOn = useInspectOnRightClick();
  return (
    <div className="space-y-2 border-t border-slate-700 pt-2">
      {DECK_SECTIONS.map(({ kind, label }) => {
        const section = cards.filter((e) => e.card.kind === kind).sort((a, b) => a.card.order - b.card.order);
        if (!section.length) return null;
        return (
          <section key={kind}>
            <h4 className="mb-1 text-xs uppercase tracking-wide text-slate-500">
              {label} ({section.reduce((n, e) => n + e.quantity, 0)})
            </h4>
            <ul className="space-y-1">
              {section.map(({ card, quantity }) => (
                <li key={card.id} className={`flex items-center gap-2 ${isLocked(card) ? 'opacity-50' : ''}`} {...inspectOn(card)}>
                  {card.imageUrl ? (
                    <CardImage src={`${card.imageUrl}/low.webp`} alt="" loading="lazy" className="h-9 w-[1.6rem] shrink-0 rounded-sm object-cover" />
                  ) : (
                    <div className="h-9 w-[1.6rem] shrink-0 rounded-sm bg-slate-800" />
                  )}
                  <span className="w-5 shrink-0 text-right tabular-nums">{quantity}×</span>
                  <span className="min-w-0 flex-1 truncate">
                    {cardTitle(card)}
                    {isLocked(card) && <span className="ml-1 text-xs text-slate-400">(locked)</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {card.setName} #{card.number}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
