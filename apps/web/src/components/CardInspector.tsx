import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { holoPattern } from '@poke-tcg/campaign';
import { useRef, useState } from 'react';
import { useEscape } from '../hooks/useEscape';
import { useScrollLock } from '../hooks/useScrollLock';
import type { CatalogCard } from '../utils/cardList';
import { CardViewer } from './CardViewer';
import { PatternPicker } from './PatternPicker';

const small = 'flex rounded bg-slate-600 p-1 hover:bg-slate-500 disabled:opacity-30';

/** What a click or tap in the view leaves alone: the card itself, its controls and their rows. Anywhere else closes it. */
const KEEP_OPEN = 'button, input, a, [data-keep-open]';

/**
 * A card shown large in the middle of the screen, as holding it does, but staying open (right-clicking a card, see
 * CardInspectProvider) until Escape, its × (top right) or a click anywhere but the card and its controls (beside the
 * card too). Opened by a long press, it ignores the finger lifting (the
 * click that ends the press lands on it): only a press that starts on it closes it. With a deck open (`deck`), − and + change its copies in
 * the deck; + is disabled with the reason when the card can't be added. In the deck builder (`craft`), Craft unlocks the
 * card for Stardust. The page behind it doesn't scroll while it's open (useScrollLock); it scrolls itself only when it's
 * taller than the screen. The ★ button (`favorite`) adds the card to the account's favorites, or takes it out. For a holo,
 * `unlocked` is how many copies the account has (see useUnlocked's `holoCopies`), shown above it. A holo that can switch
 * its pattern has the holo patterns under it (PatternPicker, card flair), previewed on the card.
 */
export function CardInspector({
  card,
  locked,
  deck,
  craft,
  favorite,
  unlocked,
  onClose,
}: {
  card: CatalogCard;
  locked: boolean;
  deck?: { name: string; copies: number; blocked: string | null; onChange: (by: 1 | -1) => void };
  /** The deck builder's crafting: the card's Stardust cost, the Stardust held, and why it can't be crafted (or null). */
  craft?: { cost: number; stardust: number; blocked: string | null; pending: boolean; error?: string; onCraft: () => void };
  /** Whether the card is one of the account's favorites, and adding or taking it out. */
  favorite?: { on: boolean; onToggle: () => void };
  /** How many copies of the card the account has unlocked, for a card that counts them. */
  unlocked?: number;
  onClose: () => void;
}) {
  /** A press has started on it since it opened. */
  const pressed = useRef(false);
  /** The holo pattern previewed on the card (PatternPicker): a key, null for its own, undefined for the one in use. */
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  const overlay = useRef<HTMLDivElement>(null);
  useScrollLock(true, overlay);
  useEscape(onClose);
  return (
    <div
      // Above everything, the game's dialogs and hover preview included; clicks in it don't cancel a move in progress.
      data-keep-action
      ref={overlay}
      className="fixed inset-0 z-[1200] flex overflow-y-auto overscroll-contain bg-black/80 p-4"
      role="dialog"
      aria-label={card.name}
      onPointerDown={() => (pressed.current = true)}
      onClick={(e) => pressed.current && !(e.target as Element).closest(KEEP_OPEN) && onClose()}
      // Right-clicking another spot closes it, without the browser's menu.
      onContextMenu={(e) => {
        e.preventDefault();
        if (pressed.current && !(e.target as Element).closest(KEEP_OPEN)) onClose();
      }}
    >
      <button className="fixed right-3 top-3 z-10 flex rounded-full bg-slate-800/80 p-2 text-slate-200 ring-1 ring-slate-600 transition hover:bg-slate-700 hover:text-slate-50" onClick={onClose} aria-label="Close" title="Close">
        <CloseIcon />
      </button>
      <div className="m-auto flex w-full max-w-lg flex-col items-center gap-3">
        <CardViewer card={card} locked={locked} pattern={preview === undefined ? undefined : (holoPattern(preview) ?? null)} />
        {unlocked !== undefined && (
          <p className="text-sm text-slate-300">
            Unlocked: <span className="font-semibold tabular-nums text-fuchsia-300">{unlocked}</span> {unlocked === 1 ? 'copy' : 'copies'}
          </p>
        )}
        {favorite && (
          <button
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 transition active:scale-95 ${favorite.on ? 'bg-yellow-300/15 text-yellow-300 ring-yellow-300/60 hover:bg-yellow-300/25' : 'bg-slate-800 text-slate-200 ring-slate-600 hover:bg-slate-700'}`}
            aria-pressed={favorite.on}
            onClick={favorite.onToggle}
          >
            {favorite.on ? <StarIcon sx={{ fontSize: 18 }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
            {favorite.on ? 'Favorite' : 'Add to favorites'}
          </button>
        )}
        {deck && (
          <div data-keep-open className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-600">
            <span className="max-w-56 truncate text-slate-400">In {deck.name || 'this deck'}</span>
            <button className={small} disabled={deck.copies === 0} onClick={() => deck.onChange(-1)} aria-label={`Remove a ${card.name}`}>
              <RemoveIcon sx={{ fontSize: 16 }} />
            </button>
            <span className="w-5 text-center font-semibold tabular-nums">{deck.copies}</span>
            <button className={small} disabled={deck.blocked !== null} title={deck.blocked ?? undefined} onClick={() => deck.onChange(1)} aria-label={`Add a ${card.name}`}>
              <AddIcon sx={{ fontSize: 16 }} />
            </button>
          </div>
        )}
        {deck?.blocked && <p className="text-xs text-amber-300">{deck.blocked}.</p>}
        {craft && (
          <div data-keep-open className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-600">
            <span className="text-slate-400">
              Stardust <span className="font-semibold text-sky-200">{craft.stardust}</span>
            </span>
            <button
              className="rounded bg-sky-700 px-3 py-1 font-semibold transition hover:bg-sky-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-sky-700"
              disabled={craft.blocked !== null || craft.pending}
              title={craft.blocked ?? `Unlock ${card.name} for ${craft.cost} Stardust`}
              onClick={craft.onCraft}
            >
              {craft.pending ? 'Crafting…' : `Craft for ${craft.cost}`}
            </button>
          </div>
        )}
        {craft && (craft.error ?? craft.blocked) && <p className="text-xs text-amber-300">{craft.error ?? craft.blocked}.</p>}
        <PatternPicker card={card} locked={locked} preview={preview} onPreview={setPreview} />
      </div>
    </div>
  );
}
