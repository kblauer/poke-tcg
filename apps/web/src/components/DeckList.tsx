import { closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PublishIcon from '@mui/icons-material/Publish';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import type { AppRouter } from '@poke-tcg/api/router';
import { COSMETICS, DEFAULT_COSMETIC, type CosmeticKind } from '@poke-tcg/campaign';
import { DECK_NAME_LENGTH, DECK_SIZE } from '@poke-tcg/shared';
import { useQuery } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DeckCosmetics } from '../hooks/useCosmetics';
import { useEscape } from '../hooks/useEscape';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import { cardBackUrl } from '../utils/cardBack';
import type { CatalogCard } from '../utils/cardList';
import { CARD_THUMB_LG, CARD_THUMB_MD, CARD_THUMB_SM, CARD_THUMB_XL } from '../utils/layout';
import { CatalogContext, useInspectOnRightClick } from './InspectContext';
import { DECK_SECTIONS, allGenerations, deckInGenerations, deckRatio, deckSize, featuredPokemon, type DeckEntry } from '../utils/deckBuilder';
import { CardImage } from './CardImage';
import { SpinningCoin } from './CoinFlip';
import { GenerationFilter } from './packs/GenerationFilter';
import { Toasts } from './Toasts';

export type SavedDeck = inferRouterOutputs<AppRouter>['decks']['list'][number];

/** The catalog before it's loaded (CatalogContext is null then): the tiles show no Pokémon, as with an empty map. */
const EMPTY_CATALOG = new Map<string, CatalogCard>();

/** The card catalog by id (CatalogContext, loaded once per session by CardInspectProvider), for a deck's headline Pokémon and card split. */
function useCatalog(): Map<string, CatalogCard> {
  return useContext(CatalogContext) ?? EMPTY_CATALOG;
}

/** Bar colours for the deck's Pokémon, Trainers and Energy. */
const RATIO_COLORS = { POKEMON: 'bg-rose-500', TRAINER: 'bg-sky-500', ENERGY: 'bg-amber-400' } as const;

/**
 * What a deck holds at a glance: its 3 headline Pokémon (see featuredPokemon) and how its cards split
 * between Pokémon, Trainers and Energy, as a bar and counts. Right-clicking a Pokémon opens it in the CardInspector.
 * `compact` (a phone): just a thin bar under the Pokémon, with the counts as its tooltip. `large` (Community Decks): bigger
 * Pokémon, with the bar and counts under them.
 */
export function DeckSummary({
  entries,
  compact = false,
  large = false,
}: {
  entries: DeckEntry[];
  compact?: boolean;
  large?: boolean;
}) {
  const byId = useCatalog();
  const ratio = deckRatio(entries, byId);
  const size = deckSize(entries);
  return (
    <div className={compact ? 'w-fit space-y-1' : large ? 'w-fit shrink-0 space-y-1.5' : 'flex items-center gap-3'}>
      <FeaturedCards featured={featuredPokemon(entries, byId)} size={large ? CARD_THUMB_XL : CARD_THUMB_MD} />
      {compact ? (
        <RatioBar ratio={ratio} size={size} height="h-1" title={DECK_SECTIONS.map(({ kind, label }) => `${ratio[kind]} ${label}`).join(' · ')} />
      ) : (
        <div className={large ? 'space-y-1' : 'min-w-0 flex-1 space-y-1'}>
          <RatioBar ratio={ratio} size={size} height="h-2" />
          <RatioCounts ratio={ratio} />
        </div>
      )}
    </div>
  );
}

/** A deck's 3 headline Pokémon (featuredPokemon) as cards of `size` (Tailwind height and width), the ones not unlocked darker; right-clicking one opens it in the CardInspector. */
function FeaturedCards({ featured, size }: { featured: CatalogCard[]; size: string }) {
  const inspectOn = useInspectOnRightClick();
  const { isLocked } = useUnlocked();
  return (
    <div className="flex shrink-0 gap-1">
      {[0, 1, 2].map((i) => {
        const card = featured[i];
        return card?.imageUrl ? (
          <CardImage
            key={i}
            src={`${card.imageUrl}/low.webp`}
            alt={card.name}
            title={card.name}
            loading="lazy"
            {...inspectOn(card)}
            className={`${size} rounded-sm object-cover ${isLocked(card) ? 'brightness-50' : ''}`}
          />
        ) : (
          <div key={i} className={`${size} rounded-sm bg-slate-800`} />
        );
      })}
    </div>
  );
}

type Ratio = ReturnType<typeof deckRatio>;

/** How a deck's `size` cards split between Pokémon, Trainers and Energy, as a bar `height` high. */
function RatioBar({ ratio, size, height, title }: { ratio: Ratio; size: number; height: string; title?: string }) {
  return (
    <div className={`flex ${height} overflow-hidden rounded-full bg-slate-800`} title={title}>
      {size > 0 && DECK_SECTIONS.map(({ kind }) => <div key={kind} className={RATIO_COLORS[kind]} style={{ width: `${(ratio[kind] / size) * 100}%` }} />)}
    </div>
  );
}

/** The bar's counts, each with its colour's dot; `small` for the deck list's tiles: just the numbers, the labels as a tooltip. */
function RatioCounts({ ratio, small = false }: { ratio: Ratio; small?: boolean }) {
  return (
    <div
      className={`flex flex-wrap text-slate-400 ${small ? 'gap-x-1.5 text-[10px] leading-3' : 'gap-x-2 text-xs'}`}
      title={small ? DECK_SECTIONS.map(({ kind, label }) => `${ratio[kind]} ${label}`).join(' · ') : undefined}
    >
      {DECK_SECTIONS.map(({ kind, label }) => (
        <span key={kind} className="flex items-center gap-1">
          <span className={`inline-block rounded-full ${small ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${RATIO_COLORS[kind]}`} />
          {ratio[kind]}
          {!small && ` ${label}`}
        </span>
      ))}
    </div>
  );
}

/** Keeps a press inside a deck button from opening the deck or starting a drag. */
const inside = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

/** The deck's name, with a pencil button that turns it into a text box: Enter or clicking away renames it, Escape doesn't. */
function DeckName({ name, onRename, large = false }: { name: string; onRename: (name: string) => void; large?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  /** Escape was pressed: the blur that follows shouldn't rename. */
  const cancelled = useRef(false);
  const commit = () => {
    const next = draft?.trim();
    setDraft(null);
    if (!cancelled.current && next && next !== name) onRename(next);
    cancelled.current = false;
  };
  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={DECK_NAME_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          // Typing a space shouldn't pick the deck up (dnd-kit's keyboard drag).
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        {...inside}
        className={`min-w-0 flex-1 rounded bg-slate-950 px-1.5 font-semibold outline-none ring-1 ring-yellow-300 ${large ? 'text-base' : ''}`}
        aria-label="Deck name"
      />
    );
  }
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className={`truncate font-semibold ${large ? 'text-base' : ''}`}>{name}</span>
      <button
        className="flex shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-600 hover:text-slate-100"
        {...inside}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(name);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        title="Rename"
        aria-label={`Rename ${name}`}
      >
        <EditIcon sx={{ fontSize: 14 }} />
      </button>
    </span>
  );
}

/** The automatic run deck's tag by its name: it copies the run's deck, so it can't be renamed or edited. */
const RUN_DECK_TAG = (
  <span className="shrink-0 rounded bg-sky-700 px-1.5 text-[10px] font-semibold uppercase leading-5 tracking-wide text-sky-100" title="Copies your run's deck as it changes. Copy it to edit it, or save it when the run is over.">
    Run deck
  </span>
);

/**
 * The tag on a deck holding cards the account hasn't unlocked (decks.list's `locked`): it can't be played until they
 * are, so wherever deck tiles are shown it's greyed out with this tag (agreed with the user).
 */
export const LOCKED_TAG = (
  <span className="shrink-0 rounded bg-slate-600 px-1.5 text-[10px] font-semibold uppercase leading-5 tracking-wide text-slate-200" title="Holds cards you haven't unlocked: it can't be played until you have them">
    Locked
  </span>
);

/** A deck's card count, green when it can be played (the colour says it's ready); `large` on the deck list's tiles. */
function DeckCount({ size, ready, large = false }: { size: number; ready: boolean; large?: boolean }) {
  return (
    <span className={`shrink-0 self-end ${large ? 'text-sm' : 'text-xs'} ${ready ? 'text-emerald-400' : 'text-slate-400'}`} title={ready ? 'Ready to play' : undefined}>
      {size}/{DECK_SIZE}
    </span>
  );
}

/**
 * A deck tile's contents, as agreed with the user (the Collection's deck list, and the run's deck menu): its Pokémon large
 * on the left with the Pokémon/Trainer/Energy bar and its counts under them; on their right `title` (the name) with the
 * Pokémon's names (comma separated, wrapping) and any `note` under it, and `corner` (the star) and the card count at the
 * bottom right. Greyed out while it holds `locked` cards.
 */
export function DeckTile({
  entries,
  size,
  ready,
  locked = false,
  title,
  note,
  corner,
  detail,
  titleAbove = false,
}: {
  entries: DeckEntry[];
  size: number;
  ready: boolean;
  locked?: boolean;
  title: ReactNode;
  note?: ReactNode;
  corner?: ReactNode;
  /** Shown in place of the Pokémon's names (the open deck's cosmetics). */
  detail?: ReactNode;
  /** The title across the top of the tile, above the cards (the open deck's), instead of beside them. */
  titleAbove?: boolean;
}) {
  const byId = useCatalog();
  const dim = locked ? 'opacity-60' : '';
  const featured = featuredPokemon(entries, byId);
  const ratio = deckRatio(entries, byId);
  const row = (
    <div className="flex gap-2.5">
      <div className={`space-y-1 ${dim}`}>
        <FeaturedCards featured={featured} size={CARD_THUMB_LG} />
        <RatioBar ratio={ratio} size={deckSize(entries)} height="h-1.5" />
        <RatioCounts ratio={ratio} small />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {!titleAbove && title}
        {detail ?? <p className={`break-words text-xs leading-4 text-slate-200 ${dim}`}>{featured.map((card) => card.name).join(', ')}</p>}
        {note}
        <div className="mt-auto flex items-center justify-end gap-1">
          {corner}
          <DeckCount size={size} ready={ready} large />
        </div>
      </div>
    </div>
  );
  return titleAbove ? (
    <div className="space-y-2">
      {title}
      {row}
    </div>
  ) : (
    row
  );
}

/** A small deck tile (the Cosmetics tab's): its first Pokémon's card, its name and its card count. */
export function CompactDeckTile({ entries, name }: { entries: DeckEntry[]; name: string }) {
  const byId = useCatalog();
  const { isLocked } = useUnlocked();
  const [card] = featuredPokemon(entries, byId);
  return (
    <span className="flex min-w-0 items-center gap-2">
      {card?.imageUrl ? (
        <CardImage src={`${card.imageUrl}/low.webp`} alt="" loading="lazy" className={`${CARD_THUMB_SM} shrink-0 rounded-sm object-cover ${isLocked(card) ? 'brightness-50' : ''}`} />
      ) : (
        <span className={`${CARD_THUMB_SM} shrink-0 rounded-sm bg-slate-700`} />
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-semibold">{name}</span>
        <span className="block text-[11px] text-slate-400">
          {deckSize(entries)}/{DECK_SIZE}
        </span>
      </span>
    </span>
  );
}

/** A deck's card back and coin, small and side by side (CurrentDeck): its own, else the account's defaults. */
function CosmeticsPreview({ cosmetics }: { cosmetics?: DeckCosmetics }) {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.cosmetics.list.queryOptions(), staleTime: 5 * 60_000 });
  const pick = (kind: CosmeticKind) => cosmetics?.[kind] ?? list.data?.defaults[kind] ?? DEFAULT_COSMETIC[kind];
  const name = (id: string) => COSMETICS[id]?.name ?? id;
  const cardBack = pick('cardBack');
  const coin = pick('coin');
  return (
    <div className="ml-8 flex items-center gap-2">
      <img src={cardBackUrl(cardBack)} alt="" title={`Card back: ${name(cardBack)}`} className={`${CARD_THUMB_LG} rounded-sm object-cover shadow`} />
      {/* The smallest SpinningCoin is 96px wide: shrunk to the card back's height. */}
      <div className={`${CARD_THUMB_LG} flex items-center justify-center`} title={`Coin: ${name(coin)}`}>
        <div className="scale-[0.45]">
          <SpinningCoin heads size="md" design={coin} still flat headroom={false} />
        </div>
      </div>
    </div>
  );
}

/**
 * A deck's name (with its rename button). Without `onRename` (the automatic run deck) the name is plain, tagged Run deck.
 * `large`: the deck list's tiles' bigger name.
 */
function DeckTitle({
  name,
  onRename,
  compact = false,
  large = false,
  children,
}: {
  name: string;
  onRename?: (name: string) => void;
  compact?: boolean;
  large?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      {onRename ? (
        <DeckName name={name} onRename={onRename} large={large} />
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`truncate font-semibold ${large ? 'text-base' : ''}`}>{name}</span>
          {RUN_DECK_TAG}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * The account's decks as buttons to open, in their saved order: drag one to move it (the new order is
 * saved with `onReorder`). Each can be renamed (the pencil by its name) or copied, and a new deck started from scratch;
 * the star in a deck's top right corner favorites it (`onFavorite`: the run's Favorite decks), not the automatic run deck.
 * The toolbar's Filters icon pops out Favorites (only the favorite decks; off to start) and the generations
 * (GenerationFilter with `toggles`, as on Community Decks; all on to start), listing only the decks with cards from any
 * generation ticked. Its Copy and Publish icons ask for a deck (a
 * prompt toast; Escape, the icon again or a click outside the decks cancels), then `onCopy` copies it or `onShare` opens
 * its Share dialog.
 * `compact` (a phone, in its side panel): tighter padding and no drag hint; the tiles are the same on every screen.
 */
export function DeckList({
  decks,
  onOpen,
  onNew,
  onCopy,
  onRename,
  onReorder,
  onFavorite,
  onImport,
  onShare,
  busy,
  compact = false,
}: {
  decks: SavedDeck[];
  onOpen: (deckId: string) => void;
  onNew: () => void;
  /** Opens the Import dialog (a deck code from another player, or a text deck list). */
  onImport: () => void;
  /** Opens the Share dialog (its deck code, and Publish to Community Decks) for the deck picked. */
  onShare: (deckId: string) => void;
  onCopy: (deckId: string) => void;
  onRename: (deckId: string, name: string) => void;
  onReorder: (deckIds: string[]) => void;
  onFavorite: (deckId: string, favorite: boolean) => void;
  busy: boolean;
  compact?: boolean;
}) {
  const byId = useCatalog();
  // Shown in the new order straight away, while it's saved.
  const [order, setOrder] = useState(() => decks.map((d) => d.id));
  useEffect(() => setOrder(decks.map((d) => d.id)), [decks]);
  /** The generations whose decks are listed (all to start). */
  const [shownGens, setShownGens] = useState<ReadonlySet<number>>(allGenerations);
  /** Only the favorite decks (the Filters' Favorites). */
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const shown = order.flatMap((id) => decks.filter((d) => d.id === id && (!favoritesOnly || d.favorite) && deckInGenerations(d.cards, byId, shownGens)));
  /** Waiting for a deck to be picked to copy or publish. */
  const [picking, setPicking] = useState<'copy' | 'share' | null>(null);
  useEffect(() => {
    if (!picking) return;
    // Capture phase, so it runs before the click lands; the decks and the icons are `data-keep-action`.
    const onDown = (e: PointerEvent) => !(e.target as Element).closest('[data-keep-action]') && setPicking(null);
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [picking]);
  useEscape(() => setPicking(null), !!picking);
  const pick = (deckId: string) => {
    setPicking(null);
    if (picking === 'copy') onCopy(deckId);
    else onShare(deckId);
  };
  /** A toolbar icon that asks for a deck (`mode`), highlighted while it does. */
  const pickButton = (mode: 'copy' | 'share', label: string, title: string, icon: ReactNode, disabled: boolean) => (
    <button
      data-keep-action
      className={`flex items-center rounded p-1 transition hover:bg-slate-700 disabled:opacity-40 ${picking === mode ? 'bg-slate-700 text-yellow-300' : 'text-slate-300 hover:text-white'}`}
      onClick={() => setPicking(picking === mode ? null : mode)}
      aria-pressed={picking === mode}
      disabled={disabled}
      title={title}
      aria-label={label}
    >
      {icon}
    </button>
  );
  // The distance keeps clicks on a deck (to open it) from starting a drag; a finger must hold the deck first, so a swipe
  // over it scrolls the list (as EquipmentPanel's).
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    onReorder(next);
  };
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 rounded-lg bg-slate-900 text-sm ${compact ? 'p-2' : 'p-3'}`}>
      {/* The toolbar across the top: New deck, Copy, Import, Publish and Filters (the generations, popping out) as icons. */}
      <div className="flex items-center gap-1 border-b border-slate-700 pb-1.5">
        <span className="mr-auto font-semibold">Decks</span>
        <button className="flex items-center rounded p-1 text-emerald-400 transition hover:bg-slate-700 hover:text-emerald-300" onClick={onNew} title="New deck" aria-label="New deck">
          <AddIcon sx={{ fontSize: 20 }} />
        </button>
        {pickButton('copy', 'Copy a deck', 'Copy a deck to edit the copy', <ContentCopyIcon sx={{ fontSize: 18 }} />, decks.length === 0 || busy)}
        <button className="flex items-center rounded p-1 text-slate-300 transition hover:bg-slate-700 hover:text-white" onClick={onImport} title="Import a deck from a deck code or a deck list" aria-label="Import">
          <FileDownloadIcon sx={{ fontSize: 20 }} />
        </button>
        {pickButton('share', 'Publish to Community Decks', 'Publish a deck to Community Decks (or copy its deck code)', <PublishIcon sx={{ fontSize: 20 }} />, decks.length === 0)}
        <GenerationFilter
          picked={shownGens}
          onChange={setShownGens}
          toggles
          icon
          filtering={favoritesOnly}
          before={
            <button
              role="option"
              aria-selected={favoritesOnly}
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-slate-200 transition hover:bg-slate-700"
            >
              {favoritesOnly ? <CheckBoxIcon sx={{ fontSize: 18 }} className="text-yellow-300" /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18 }} className="text-slate-500" />}
              Favorites
              <StarIcon sx={{ fontSize: 16 }} className="text-amber-300" />
            </button>
          }
        />
      </div>
      <Toasts toasts={[]} prompt={picking === 'copy' ? 'Click the deck to copy' : picking === 'share' ? 'Click the deck to publish to Community Decks' : null} />
      {decks.length === 0 && <p className="text-slate-500">No decks yet. Start a new one.</p>}
      {decks.length > 0 && shown.length === 0 && <p className="text-slate-500">{favoritesOnly ? 'No favorite decks with cards from the generations picked.' : 'No decks with cards from the generations picked.'}</p>}
      {decks.length > 1 && !compact && <p className="text-xs text-slate-500">Drag a deck to move it in the list.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {shown.map((d) => (
              <SortableDeck key={d.id} deck={d} onOpen={picking ? pick : onOpen} picking={picking !== null} onRename={onRename} onFavorite={onFavorite} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableDeck({
  deck,
  onOpen,
  picking,
  onRename,
  onFavorite,
}: {
  deck: SavedDeck;
  /** Opens the deck, or picks it to copy or publish while `picking` (each deck then outlined). */
  onOpen: (deckId: string) => void;
  picking: boolean;
  onRename: (deckId: string, name: string) => void;
  onFavorite: (deckId: string, favorite: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id });
  // The favorite star (not on the automatic run deck).
  const star = !deck.runDeck && (
    <button
      className={`flex shrink-0 rounded p-0.5 hover:bg-slate-600 ${deck.favorite ? 'text-amber-300' : 'text-slate-400 hover:text-slate-100'}`}
      {...inside}
      onClick={(e) => {
        e.stopPropagation();
        onFavorite(deck.id, !deck.favorite);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-pressed={deck.favorite}
      title={deck.favorite ? 'Favorite deck (click to unfavorite)' : 'Favorite this deck: it shows under the deck choice in a run'}
      aria-label={`${deck.favorite ? 'Unfavorite' : 'Favorite'} ${deck.name}`}
    >
      {deck.favorite ? <StarIcon sx={{ fontSize: 18 }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
    </button>
  );
  const onRenameDeck = deck.runDeck ? undefined : (name: string) => onRename(deck.id, name);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? 'relative z-10 opacity-80' : ''}>
      {/* dnd-kit's attributes make it a focusable button. */}
      <div
        data-keep-action
        className={`w-full cursor-pointer touch-manipulation rounded-lg bg-slate-800 text-left hover:bg-slate-700 focus:outline-none focus-visible:ring-1 ${picking ? 'ring-1 ring-yellow-300/60 hover:ring-2 hover:ring-yellow-300' : 'ring-yellow-300'} p-2`}
        {...attributes}
        {...listeners}
        onClick={() => onOpen(deck.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen(deck.id);
          else listeners?.onKeyDown?.(e);
        }}
        title={deck.problems.join(' ') || undefined}
      >
        <DeckTile
          entries={deck.cards}
          size={deck.cardCount}
          ready={deck.problems.length === 0}
          locked={deck.locked}
          title={
            <DeckTitle name={deck.name} onRename={onRenameDeck} large>
              {deck.locked && LOCKED_TAG}
            </DeckTitle>
          }
          corner={star}
        />
      </div>
    </li>
  );
}

/**
 * The open deck at the top of the deck builder, as the deck list's tiles show a deck (DeckTile, agreed), but with its
 * name across the top and its card back and coin (`cosmetics`: its own, else the account's defaults; the coin face on)
 * where the Pokémon's names go: click it to go
 * back to the deck list, or the pencil to rename it (not the automatic run deck, `readOnly`).
 */
export function CurrentDeck({
  name,
  onRename,
  readOnly = false,
  entries,
  ready,
  onBack,
  cosmetics,
  compact = false,
}: {
  name: string;
  onRename: (name: string) => void;
  readOnly?: boolean;
  entries: DeckEntry[];
  ready: boolean;
  onBack: () => void;
  /** Its cosmetics (decks.list's; none for a new deck). */
  cosmetics?: DeckCosmetics;
  /** A phone: a shorter way back. */
  compact?: boolean;
}) {
  const byId = useCatalog();
  const { isLocked } = useUnlocked();
  // Greyed out and tagged Locked while it holds cards not unlocked yet, as in the list.
  const locked = entries.some((e) => {
    const card = byId.get(e.cardId);
    return card !== undefined && isLocked(card);
  });
  return (
    // Not a <button>: the name's text box goes inside it.
    <div
      role="button"
      tabIndex={0}
      className="w-full cursor-pointer rounded-lg bg-slate-800 p-2 text-left ring-1 ring-slate-700 hover:bg-slate-700 focus:outline-none focus-visible:ring-yellow-300"
      onClick={onBack}
      onKeyDown={(e) => e.key === 'Enter' && onBack()}
      title="Back to the deck list"
    >
      <DeckTile
        entries={entries}
        size={deckSize(entries)}
        ready={ready}
        locked={locked}
        title={
          <DeckTitle name={name || 'Unnamed deck'} onRename={readOnly ? undefined : onRename} large>
            {locked && LOCKED_TAG}
            <span className="shrink-0 text-xs text-slate-400">{compact ? '←' : '← All decks'}</span>
          </DeckTitle>
        }
        detail={<CosmeticsPreview cosmetics={cosmetics} />}
        titleAbove
      />
    </div>
  );
}
