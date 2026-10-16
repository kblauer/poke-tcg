import { FADE_MS, type Toast } from '../hooks/useToasts';

/**
 * The messages from useToasts in the top right of the page, oldest on top: amber for warnings
 * (why a card can't be played), red for errors (a move the server rejected). They let clicks
 * through, so they never block what's under them.
 */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[1200] flex w-80 max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`toast-in rounded-lg px-4 py-2 text-sm font-medium text-slate-900 shadow-lg shadow-black/50 transition-opacity ${
            t.kind === 'error' ? 'bg-red-400' : 'bg-amber-300'
          } ${t.leaving ? 'opacity-0' : 'opacity-100'}`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
