import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import type { AppRouter } from '@poke-tcg/api/router';
import { DECK_NAME_LENGTH, DECK_SIZE } from '@poke-tcg/shared';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CatalogCard } from '../utils/cardList';
import { DECK_SECTIONS, deckRatio, deckSize, featuredPokemon, type DeckEntry } from '../utils/deckBuilder';

export type SavedDeck = inferRouterOutputs<AppRouter>['decks']['list'][number];

/** Bar colours for the deck's Pokémon, Trainers and Energy. */
const RATIO_COLORS = { POKEMON: 'bg-rose-500', TRAINER: 'bg-sky-500', ENERGY: 'bg-amber-400' } as const;

/**
 * What a deck holds at a glance: its 3 headline Pokémon (see featuredPokemon) and how its cards split
 * between Pokémon, Trainers and Energy, as a bar and counts.
 */
export function DeckSummary({ entries, byId, isLocked }: { entries: DeckEntry[]; byId: Map<string, CatalogCard>; isLocked: (card: CatalogCard) => boolean }) {
  const featured = featuredPokemon(entries, byId);
  const ratio = deckRatio(entries, byId);
  const size = deckSize(entries);
  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 gap-1">
        {[0, 1, 2].map((i) => {
          const card = featured[i];
          return card?.imageUrl ? (
            <img
              key={i}
              src={`${card.imageUrl}/low.webp`}
              alt={card.name}
              title={card.name}
              loading="lazy"
              className={`h-14 w-10 rounded-sm object-cover ${isLocked(card) ? 'brightness-50' : ''}`}
            />
          ) : (
            <div key={i} className="h-14 w-10 rounded-sm bg-slate-800" />
          );
        })}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
          {size > 0 && DECK_SECTIONS.map(({ kind }) => <div key={kind} className={RATIO_COLORS[kind]} style={{ width: `${(ratio[kind] / size) * 100}%` }} />)}
        </div>
        <div className="flex flex-wrap gap-x-2 text-xs text-slate-400">
          {DECK_SECTIONS.map(({ kind, label }) => (
            <span key={kind} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${RATIO_COLORS[kind]}`} />
              {ratio[kind]} {label}
            </span>
          ))}
        </div>
      </div>
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

/** A deck's name (with its rename button) and card count, with whether it can be played. */
function DeckTitle({ name, onRename, size, ready, children }: { name: string; onRename: (name: string) => void; size: number; ready: boolean; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <DeckName name={name} onRename={onRename} />
      {children}
      <span className={`shrink-0 text-xs ${ready ? 'text-emerald-400' : 'text-slate-400'}`}>
        {size}/{DECK_SIZE}
        {ready && ', ready'}
      </span>
    </div>
  );
}

/**
 * The account's decks as buttons to open, in their saved order: drag one to move it (the new order is
 * saved with `onReorder`). Each can be renamed (the pencil by its name) or copied, and a new deck started from scratch.
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
  busy,
}: {
  decks: SavedDeck[];
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  onOpen: (deckId: string) => void;
  onNew: () => void;
  onCopy: (deckId: string) => void;
  onRename: (deckId: string, name: string) => void;
  onReorder: (deckIds: string[]) => void;
  busy: boolean;
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg bg-slate-900 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Decks</span>
        <button className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500" onClick={onNew}>
          <AddIcon sx={{ fontSize: 16 }} /> New deck
        </button>
      </div>
      {decks.length === 0 && <p className="text-slate-500">No decks yet. Start a new one.</p>}
      {decks.length > 1 && <p className="text-xs text-slate-500">Drag a deck to move it in the list.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {shown.map((d) => (
              <SortableDeck key={d.id} deck={d} byId={byId} isLocked={isLocked} onOpen={onOpen} onCopy={onCopy} onRename={onRename} busy={busy} />
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
  busy,
}: {
  deck: SavedDeck;
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  onOpen: (deckId: string) => void;
  onCopy: (deckId: string) => void;
  onRename: (deckId: string, name: string) => void;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? 'relative z-10 opacity-80' : ''}>
      {/* dnd-kit's attributes make it a focusable button. */}
      <div
        className="w-full cursor-pointer touch-none space-y-2 rounded-lg bg-slate-800 p-2 text-left ring-yellow-300 hover:bg-slate-700 focus:outline-none focus-visible:ring-1"
        {...attributes}
        {...listeners}
        onClick={() => onOpen(deck.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen(deck.id);
          else listeners?.onKeyDown?.(e);
        }}
        title={deck.problems.join(' ') || undefined}
      >
        <DeckTitle name={deck.name} onRename={(name) => onRename(deck.id, name)} size={deck.cardCount} ready={deck.problems.length === 0}>
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
          >
            <ContentCopyIcon sx={{ fontSize: 12 }} /> Copy
          </button>
        </DeckTitle>
        <DeckSummary entries={deck.cards} byId={byId} isLocked={isLocked} />
      </div>
    </li>
  );
}

/** The open deck at the top of the deck builder: click it to go back to the deck list, or the pencil to rename it. */
export function CurrentDeck({
  name,
  onRename,
  entries,
  ready,
  byId,
  isLocked,
  onBack,
}: {
  name: string;
  onRename: (name: string) => void;
  entries: DeckEntry[];
  ready: boolean;
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  onBack: () => void;
}) {
  return (
    // Not a <button>: the name's text box goes inside it.
    <div
      role="button"
      tabIndex={0}
      className="w-full cursor-pointer space-y-2 rounded-lg bg-slate-900 p-3 text-left text-sm ring-1 ring-slate-700 hover:bg-slate-800 focus:outline-none focus-visible:ring-yellow-300"
      onClick={onBack}
      onKeyDown={(e) => e.key === 'Enter' && onBack()}
      title="Back to the deck list"
    >
      <DeckTitle name={name || 'Unnamed deck'} onRename={onRename} size={deckSize(entries)} ready={ready}>
        <span className="shrink-0 text-xs text-slate-400">← All decks</span>
      </DeckTitle>
      <DeckSummary entries={entries} byId={byId} isLocked={isLocked} />
    </div>
  );
}
