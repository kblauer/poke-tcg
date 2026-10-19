import CloseIcon from '@mui/icons-material/Close';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The phone layout's moves for your Active Pokémon (its attacks, Retreat, Pokémon Powers and the like), in a sheet
 * that slides up from the bottom when you tap it. A tap above it closes it, cancelling a move being set up, as a click
 * outside one does elsewhere. Its buttons are a little bigger than the board's, for fingers. In the page body, outside
 * the board, which is locked against scrolling: a long list scrolls.
 */
export function ActiveSheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[900] bg-black/40" onClick={onClose} />
      <section
        data-keep-action
        role="dialog"
        aria-label="Your Active Pokémon"
        className="sheet-up fixed inset-x-0 bottom-0 z-[901] max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-slate-800 p-4 pb-6 shadow-2xl shadow-black/70 ring-1 ring-slate-600 [&_button]:py-2 [&_button]:text-sm"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
          <button className="flex shrink-0 items-center rounded-full !p-1 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </button>
        </div>
        <div className="flex flex-col gap-2">{children}</div>
      </section>
    </>,
    document.body,
  );
}
