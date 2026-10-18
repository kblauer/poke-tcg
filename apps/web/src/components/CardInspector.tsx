import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { useEffect } from 'react';
import type { CatalogCard } from '../utils/cardList';
import { CardViewer } from './CardViewer';

const small = 'flex rounded bg-slate-600 p-1 hover:bg-slate-500 disabled:opacity-30';

/**
 * A card shown large in the middle of the screen, as holding it does, but staying open (right-clicking a card, see
 * CardInspectProvider) until Escape or a click outside it. With a deck open (`deck`), − and + change its copies in
 * the deck; + is disabled with the reason when the card can't be added. In the deck builder (`craft`), Craft unlocks the
 * card for Stardust.
 */
export function CardInspector({
  card,
  locked,
  deck,
  craft,
  onClose,
}: {
  card: CatalogCard;
  locked: boolean;
  deck?: { name: string; copies: number; blocked: string | null; onChange: (by: 1 | -1) => void };
  /** The deck builder's crafting: the card's Stardust cost, the Stardust held, and why it can't be crafted (or null). */
  craft?: { cost: number; stardust: number; blocked: string | null; pending: boolean; error?: string; onCraft: () => void };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      // Above everything, the game's dialogs and hover preview included; clicks in it don't cancel a move in progress.
      data-keep-action
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-label={card.name}
      onClick={onClose}
      // Right-clicking another spot closes it, without the browser's menu.
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col items-center gap-3" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        <CardViewer card={card} locked={locked} />
        {deck && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-600">
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
          <div className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-600">
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
      </div>
    </div>
  );
}
