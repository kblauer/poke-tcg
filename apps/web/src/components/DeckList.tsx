import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import type { AppRouter } from '@poke-tcg/api/router';
import { DECK_NAME_LENGTH, DECK_SIZE } from '@poke-tcg/shared';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CatalogCard } from '../utils/cardList';
import { useInspectOnRightClick } from './InspectContext';
import { DECK_SECTIONS, deckRatio, deckSize, featuredPokemon, type DeckEntry } from '../utils/deckBuilder';
import { CardImage } from './CardImage';

export type SavedDeck = inferRouterOutputs<AppRouter>['decks']['list'][number];

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
  byId,
  isLocked,
  compact = false,
  large = false,
}: {
  entries: DeckEntry[];
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  compact?: boolean;
  large?: boolean;
}) {
  const featured = featuredPokemon(entries, byId);
  const inspectOn = useInspectOnRightClick();
  const ratio = deckRatio(entries, byId);
  const size = deckSize(entries);
  const cardSize = large ? 'h-[9.375rem] w-[6.72rem]' : 'h-14 w-10';
  const bar = (height: string, title?: string) => (
    <div className={`flex ${height} overflow-hidden rounded-full bg-slate-800`} title={title}>
      {size > 0 && DECK_SECTIONS.map(({ kind }) => <div key={kind} className={RATIO_COLORS[kind]} style={{ width: `${(ratio[kind] / size) * 100}%` }} />)}
    </div>
  );
  return (
    <div className={compact ? 'w-fit space-y-1' : large ? 'w-fit shrink-0 space-y-1.5' : 'flex items-center gap-3'}>
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
              className={`${cardSize} rounded-sm object-cover ${isLocked(card) ? 'brightness-50' : ''}`}
            />
          ) : (
            <div key={i} className={`${cardSize} rounded-sm bg-slate-800`} />
          );
        })}
      </div>
      {compact ? (
        bar('h-1', DECK_SECTIONS.map(({ kind, label }) => `${ratio[kind]} ${label}`).join(' · '))
      ) : (
        <div className={large ? 'space-y-1' : 'min-w-0 flex-1 space-y-1'}>
          {bar('h-2')}
          <div className="flex flex-wrap gap-x-2 text-xs text-slate-400">
            {DECK_SECTIONS.map(({ kind, label }) => (
              <span key={kind} className="flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${RATIO_COLORS[kind]}`} />
                {ratio[kind]} {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Keeps a press inside a deck button from opening the deck or starting a drag. */
const inside = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

/** The deck's name, with a pencil button that turns it into a text box: Enter or clicking away renames it, Escape doesn't. */
function DeckName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
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
        className="min-w-0 flex-1 rounded bg-slate-950 px-1.5 font-semibold outline-none ring-1 ring-yellow-300"
        aria-label="Deck name"
      />
    );
  }
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className="truncate font-semibold">{name}</span>
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

/** A deck's card count, green when it can be played (the colour says it's ready). */
function DeckCount({ size, ready }: { size: number; ready: boolean }) {
  return (
    <span className={`shrink-0 self-end text-xs ${ready ? 'text-emerald-400' : 'text-slate-400'}`} title={ready ? 'Ready to play' : undefined}>
      {size}/{DECK_SIZE}
    </span>
  );
}

/**
 * A deck's tile body: what it holds (DeckSummary), with its card count at the bottom right (DeckCount).
 */
function DeckBody({ entries, size, ready, byId, isLocked, compact }: { entries: DeckEntry[]; size: number; ready: boolean; byId: Map<string, CatalogCard>; isLocked: (card: CatalogCard) => boolean; compact: boolean }) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <DeckSummary entries={entries} byId={byId} isLocked={isLocked} compact={compact} />
      </div>
      <DeckCount size={size} ready={ready} />
    </div>
  );
}

/**
 * A deck's name (with its rename button). Without `onRename` (the automatic run deck) the name is plain, tagged Run deck.
 */
function DeckTitle({
  name,
  onRename,
  compact = false,
  children,
}: {
  name: string;
  onRename?: (name: string) => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
      {onRename ? (
        <DeckName name={name} onRename={onRename} />
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate font-semibold">{name}</span>
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
 * `compact` (a phone, where the list shares the top of the screen with the search): smaller tiles (DeckSummary's).
 */
export function DeckList({
  decks,
  byId,
  isLocked,
  onOpen,
  onNew,
  onCopy,
  onRename,
  onReorder,
  onFavorite,
  onImport,
  busy,
  compact = false,
}: {
  decks: SavedDeck[];
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  onOpen: (deckId: string) => void;
  onNew: () => void;
  /** Opens the Import dialog (a deck code from another player, or a text deck list). */
  onImport: () => void;
  onCopy: (deckId: string) => void;
  onRename: (deckId: string, name: string) => void;
  onReorder: (deckIds: string[]) => void;
  onFavorite: (deckId: string, favorite: boolean) => void;
  busy: boolean;
  compact?: boolean;
}) {
  // Shown in the new order straight away, while it's saved.
  const [order, setOrder] = useState(() => decks.map((d) => d.id));
  useEffect(() => setOrder(decks.map((d) => d.id)), [decks]);
  const shown = order.flatMap((id) => decks.filter((d) => d.id === id));
  // The distance keeps clicks on a deck (to open it) from starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    onReorder(next);
  };
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 rounded-lg bg-slate-900 text-sm ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Decks</span>
        <span className="flex gap-2">
          <button className={`flex items-center gap-1 rounded bg-slate-600 hover:bg-slate-500 ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`} onClick={onImport} title="Import a deck from a deck code or a deck list">
            <FileDownloadIcon sx={{ fontSize: 16 }} /> Import
          </button>
          <button className={`flex items-center gap-1 rounded bg-emerald-600 font-semibold hover:bg-emerald-500 ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`} onClick={onNew}>
            <AddIcon sx={{ fontSize: 16 }} /> {compact ? 'New' : 'New deck'}
          </button>
        </span>
      </div>
      {decks.length === 0 && <p className="text-slate-500">No decks yet. Start a new one.</p>}
      {decks.length > 1 && !compact && <p className="text-xs text-slate-500">Drag a deck to move it in the list.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {shown.map((d) => (
              <SortableDeck key={d.id} deck={d} byId={byId} isLocked={isLocked} onOpen={onOpen} onCopy={onCopy} onRename={onRename} onFavorite={onFavorite} busy={busy} compact={compact} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableDeck({
  deck,
  byId,
  isLocked,
  onOpen,
  onCopy,
  onRename,
  onFavorite,
  busy,
  compact,
}: {
  deck: SavedDeck;
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  onOpen: (deckId: string) => void;
  onCopy: (deckId: string) => void;
  onRename: (deckId: string, name: string) => void;
  onFavorite: (deckId: string, favorite: boolean) => void;
  busy: boolean;
  compact: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? 'relative z-10 opacity-80' : ''}>
      {/* dnd-kit's attributes make it a focusable button. */}
      <div
        className={`w-full cursor-pointer touch-none rounded-lg bg-slate-800 text-left ring-yellow-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-1 ${compact ? 'space-y-1 p-1.5' : 'space-y-2 p-2'}`}
        {...attributes}
        {...listeners}
        onClick={() => onOpen(deck.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen(deck.id);
          else listeners?.onKeyDown?.(e);
        }}
        title={deck.problems.join(' ') || undefined}
      >
        <DeckTitle name={deck.name} onRename={deck.runDeck ? undefined : (name) => onRename(deck.id, name)} compact={compact}>
          {deck.locked && LOCKED_TAG}
          <button
            className="flex shrink-0 items-center gap-1 self-center rounded bg-slate-600 px-1.5 text-xs leading-5 hover:bg-slate-500 disabled:opacity-40"
            disabled={busy}
            // Not a click on the deck (which opens it), and not the start of a drag.
            {...inside}
            onClick={(e) => {
              e.stopPropagation();
              onCopy(deck.id);
            }}
            title="Copy this deck to edit the copy"
            aria-label={`Copy ${deck.name}`}
          >
            <ContentCopyIcon sx={{ fontSize: 12 }} /> {!compact && 'Copy'}
          </button>
          {/* The favorite star, in the top right corner (not on the automatic run deck). */}
          {!deck.runDeck && (
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
              {deck.favorite ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
            </button>
          )}
        </DeckTitle>
        {/* Greyed out while it holds locked cards. */}
        <div className={deck.locked ? 'opacity-60' : ''}>
          <DeckBody entries={deck.cards} size={deck.cardCount} ready={deck.problems.length === 0} byId={byId} isLocked={isLocked} compact={compact} />
        </div>
      </div>
    </li>
  );
}

/**
 * The open deck at the top of the deck builder: click it to go back to the deck list, or the pencil to rename it
 * (not the automatic run deck, `readOnly`).
 */
export function CurrentDeck({
  name,
  onRename,
  readOnly = false,
  entries,
  ready,
  byId,
  isLocked,
  onBack,
  compact = false,
}: {
  name: string;
  onRename: (name: string) => void;
  readOnly?: boolean;
  entries: DeckEntry[];
  ready: boolean;
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  onBack: () => void;
  /** A phone: DeckSummary's small version, and a shorter way back. */
  compact?: boolean;
}) {
  return (
    // Not a <button>: the name's text box goes inside it.
    <div
      role="button"
      tabIndex={0}
      className={`w-full cursor-pointer rounded-lg bg-slate-900 text-left text-sm ring-1 ring-slate-700 hover:bg-slate-800 focus:outline-none focus-visible:ring-yellow-300 ${compact ? 'space-y-1 p-2' : 'space-y-2 p-3'}`}
      onClick={onBack}
      onKeyDown={(e) => e.key === 'Enter' && onBack()}
      title="Back to the deck list"
    >
      <DeckTitle name={name || 'Unnamed deck'} onRename={readOnly ? undefined : onRename} compact={compact}>
        <span className="shrink-0 text-xs text-slate-400">{compact ? '←' : '← All decks'}</span>
      </DeckTitle>
      <DeckBody entries={entries} size={deckSize(entries)} ready={ready} byId={byId} isLocked={isLocked} compact={compact} />
    </div>
  );
}
