import CloseIcon from '@mui/icons-material/Close';
import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './Card';

/**
 * A discard pile spread out to browse, newest card first, in a pane over the board (opened by holding the pile).
 * Hovering a card shows the large preview, which sits above the pane. Closed with the × button, Esc, or a click
 * beside it. In the page body: the play area's container-type would trap a fixed pane.
 */
export function DiscardPane({ title, discard, cards, onClose }: { title: string; discard: CardInstance[]; cards: CardLibrary; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    // Below the card preview (z-[1100]), above the board's dialogs.
    <div data-keep-action className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-label={title}
        className="flex max-h-full w-full max-w-4xl flex-col gap-3 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">
            {title} <span className="text-sm font-normal text-slate-400">({discard.length}, newest first)</span>
          </h2>
          <button className="rounded-full p-1 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </button>
        </div>
        {/* Cards outside the play area take their width from --card-sm. */}
        <div className="flex flex-wrap justify-center gap-2 overflow-y-auto p-1" style={{ '--card-sm': '6.5rem' } as CSSProperties}>
          {[...discard].reverse().map((c) => (
            <Card key={c.uid} def={lookupCard(cards, c.defId)} small />
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
