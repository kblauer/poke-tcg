import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { useEffect } from 'react';
import type { CatalogCard } from '../utils/cardList';
import { CardViewer } from './CardViewer';

const small = 'flex rounded bg-slate-600 p-1 hover:bg-slate-500 disabled:opacity-30';

/**
 * A card shown large in the middle of the screen, as holding it does, but staying open (the deck builder's
 * right-click) until Escape or a click outside it. With a deck open (`deck`), − and + change its copies in
 * the deck; + is disabled with the reason when the card can't be added.
 */
export function CardInspector({
  card,
  locked,
  deck,
  onClose,
}: {
  card: CatalogCard;
  locked: boolean;
  deck?: { name: string; copies: number; blocked: string | null; onChange: (by: 1 | -1) => void };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
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
      </div>
    </div>
  );
}
