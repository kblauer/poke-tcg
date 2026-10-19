import CloseIcon from '@mui/icons-material/Close';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A panel that slides in from one side of the screen, over the page: the site's menu, the Collection tab's decks, and its
 * card search on a phone. A click beside it or Escape closes it. Full height; its contents fill it as a column and scroll
 * themselves.
 */
export function SidePanel({ side, title, onClose, children }: { side: 'left' | 'right'; title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[900] bg-black/50" onClick={onClose} />
      <section
        role="dialog"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`fixed inset-y-0 z-[901] flex w-[min(88vw,24rem)] flex-col gap-2 bg-slate-800 p-3 shadow-2xl shadow-black/70 ring-1 ring-slate-600 ${side === 'left' ? 'panel-left left-0' : 'panel-right right-0'}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
          <button className="flex shrink-0 items-center rounded-full p-1 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </section>
    </>,
    document.body,
  );
}
