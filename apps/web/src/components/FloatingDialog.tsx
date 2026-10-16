import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useState, type ReactNode } from 'react';

/**
 * Panels floating over the table (the Trainer being played, a search of the deck), placed by the
 * caller. An eye button fades them to 20% opacity, outlined so it's clear where they still are, and
 * lets every click through to what's underneath (only the eye button stays clickable); clicking it
 * again brings them back.
 */
export function FloatingDialog({ children, className }: { children: ReactNode; className: string }) {
  const [peeking, setPeeking] = useState(false);
  return (
    <div
      data-keep-action
      className={`z-20 w-max max-w-[min(42rem,90cqw)] rounded-lg ${peeking ? 'pointer-events-none outline-1 outline-offset-2 outline-dashed outline-slate-400/60' : ''} ${className}`}
    >
      <button
        onClick={() => setPeeking((p) => !p)}
        title={peeking ? 'Show the dialog again' : 'See what’s behind this dialog'}
        aria-label={peeking ? 'Show the dialog again' : 'See what’s behind this dialog'}
        aria-pressed={peeking}
        className="pointer-events-auto absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-slate-200 shadow-lg ring-1 ring-black/40 transition hover:bg-slate-600"
      >
        {peeking ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
      </button>
      <div
        className={`flex flex-col gap-2 transition-opacity [&>*]:shadow-2xl [&>*]:shadow-black/70 ${peeking ? 'pointer-events-none opacity-20' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}
