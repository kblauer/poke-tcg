import CloseIcon from '@mui/icons-material/Close';
import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import { useContext, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './Card';
import { PreviewContext } from './PreviewContext';

/**
 * A discard pile spread out to view, newest card first, in a window in the middle of the screen styled like the
 * card choices (PendingChoicePanel): the same large high-res cards in a scrolling grid. Opened by clicking the pile.
 * Hovering a card shows the large preview, which sits above the window. Closed with the × button, Esc, or a click
 * beside it. In the page body: the play area's container-type would trap a fixed window.
 */
export function DiscardPane({
  title,
  discard,
  cards,
  onClose,
  note = `${discard.length}, newest first`,
}: {
  title: string;
  discard: CardInstance[];
  cards: CardLibrary;
  onClose: () => void;
  /** Beside the title. Other cards shown the same way (the phone layout's face-up prizes and CPU hand) just give their count. */
  note?: string;
}) {
  const setPreview = useContext(PreviewContext);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    // Below the card preview (z-[1100]), above the board's dialogs.
    <div data-keep-action className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      {/* Hovered cards still show the preview, but the wheel scrolls the cards rather than resizing it. */}
      <PreviewContext.Provider value={(p) => setPreview(p && { ...p, scrollZoom: false })}>
        <section
          role="dialog"
          aria-label={title}
          className="flex max-h-full w-fit max-w-[min(56rem,100%)] flex-col gap-2 rounded-lg bg-slate-800 p-3 ring-1 ring-slate-600"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {title} <span className="font-normal text-slate-400">({note})</span>
            </p>
            <button className="rounded-full p-1 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={onClose} aria-label="Close">
              <CloseIcon fontSize="small" />
            </button>
          </div>
          {/* Cards outside the play area take their width from --card-lg. */}
          <div className="flex max-h-[70vh] flex-wrap justify-center gap-2 overflow-y-auto p-1" style={{ '--card-lg': '8.5rem' } as CSSProperties}>
            {[...discard].reverse().map((c) => (
              <Card key={c.uid} def={lookupCard(cards, c.defId)} highRes />
            ))}
          </div>
        </section>
      </PreviewContext.Provider>
    </div>,
    document.body,
  );
}
