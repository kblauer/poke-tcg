import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CatalogCard } from '../../utils/cardList';
import { deckSize, type DeckEntry } from '../../utils/deckBuilder';
import { DeckTile, LOCKED_TAG } from '../DeckList';

/** A deck in DeckMenu: null is the run's own deck. */
export interface MenuDeck {
  id: string | null;
  name: string;
  note?: string;
  entries: DeckEntry[];
  disabled?: boolean;
  /** Holds locked cards (tagged Locked). */
  locked?: boolean;
}

/**
 * The deck choice: a drop-down menu whose entries are deck tiles, the same as the Collection tab's (DeckTile, on every
 * screen; `compact`, a phone, only changes where the list opens). On a desktop the list
 * floats over the page below the menu (above it without room below), every other deck in it, scrolling past LIST_HEIGHT;
 * on a phone it opens in place below the deck picked. Escape closes it too. Closed, it shows the deck picked;
 * decks that can't be played are greyed out, with why. Picking one, or a click outside, closes it.
 */
export function DeckMenu({
  decks,
  selected,
  onPick,
  byId,
  isLocked,
  compact,
}: {
  decks: MenuDeck[];
  selected: string | null;
  onPick: (id: string | null) => void;
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  /** A phone: the list opens in place, below the deck picked. */
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  // On a desktop the list floats over the page below the menu, or above it when there isn't room below (and there's more above).
  const [below, setBelow] = useState(false);
  const toggle = () => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setBelow(window.innerHeight - box.bottom >= LIST_HEIGHT + 16 || window.innerHeight - box.bottom >= box.top);
    setOpen(!open);
  };
  const picked = decks.find((d) => d.id === selected) ?? decks[0]!;
  /** A deck's tile, as on the Collection tab (DeckTile), with its note (why it can't be played) under the Pokémon's names. */
  const tile = (d: MenuDeck) => (
    <DeckTile
      entries={d.entries}
      size={deckSize(d.entries)}
      ready={!d.disabled}
      locked={d.locked}
      byId={byId}
      isLocked={isLocked}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-semibold">{d.name}</span>
          {d.locked && LOCKED_TAG}
        </span>
      }
      note={d.note && <span className={`text-xs ${d.disabled ? 'text-amber-300' : 'text-slate-400'}`}>{d.note}</span>}
    />
  );
  return (
    <div ref={ref} className={compact ? 'space-y-2' : 'relative'}>
      <button
        className="flex w-full items-center gap-2 rounded-lg bg-slate-900 p-2 text-left text-sm ring-1 ring-yellow-300"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Deck: ${picked.name}`}
      >
        <span className="min-w-0 flex-1 space-y-1">{tile(picked)}</span>
        {open ? <ExpandLessIcon className="shrink-0 text-slate-400" /> : <ExpandMoreIcon className="shrink-0 text-slate-400" />}
      </button>
      {open && decks.length > 1 && (
        <ul
          role="listbox"
          aria-label="Decks"
          className={
            compact
              ? 'space-y-2'
              : `absolute inset-x-0 z-30 space-y-2 overflow-y-auto rounded-lg bg-slate-800 p-2 shadow-xl shadow-black/60 ring-1 ring-slate-600 ${below ? 'top-full mt-2' : 'bottom-full mb-2'}`
          }
          style={compact ? undefined : { maxHeight: LIST_HEIGHT }}
        >
          {/* The other decks: the one picked is the menu's button. */}
          {decks
            .filter((d) => d !== picked)
            .map((d) => (
              <li key={d.id ?? 'run'}>
                <button
                  role="option"
                  aria-selected={false}
                  disabled={d.disabled}
                  onClick={() => {
                    onPick(d.id);
                    setOpen(false);
                  }}
                  className={`w-full space-y-1 rounded-lg bg-slate-900 p-2 text-left text-sm ring-1 transition hover:bg-slate-700 active:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-900 ring-slate-700`}
                >
                  {tile(d)}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/** How tall the desktop deck menu's floating list gets before it scrolls, in px: about 3 tiles. */
const LIST_HEIGHT = 370;

/** One deck to battle with. */
export function DeckOption({
  name,
  note,
  selected,
  disabled = false,
  locked = false,
  onPick,
  children,
}: {
  name: string;
  note?: string;
  selected: boolean;
  disabled?: boolean;
  /** Holds locked cards (tagged Locked). */
  locked?: boolean;
  onPick: () => void;
  children?: ReactNode;
}) {
  return (
    <li>
      <button
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onPick}
        className={`h-full w-full space-y-2 rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${
          selected ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900 ring-slate-700 hover:ring-slate-500'
        } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:ring-slate-700`}
      >
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">{name}</span>
          {locked && LOCKED_TAG}
          {note && <span className={`truncate text-xs ${disabled ? 'text-amber-300' : 'text-slate-400'}`}>{note}</span>}
        </span>
        {children}
      </button>
    </li>
  );
}
