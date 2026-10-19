import { FADE_MS, type Toast } from '../hooks/useToasts';

const toast = 'toast-in rounded-lg px-5 py-3 text-sm font-medium text-slate-900 shadow-lg shadow-black/50';

/**
 * The messages from useToasts in the bottom right of the page (just above the music player), newest at the bottom: amber for warnings
 * (why a card can't be played), red for errors (a move the server rejected). `prompt` is an instruction
 * for a move in progress (where to put a held card): it sits nearest the corner for as long as it's
 * given, with no timer or fade, so it's gone as soon as the move is made or cancelled. They let clicks
 * through, so they never block what's under them.
 */
export function Toasts({ toasts, prompt = null }: { toasts: Toast[]; prompt?: string | null }) {
  return (
    <div className="pointer-events-none fixed bottom-16 right-4 z-[1200] flex w-96 max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`${toast} transition-opacity ${t.kind === 'error' ? 'bg-red-400' : 'bg-amber-300'} ${t.leaving ? 'opacity-0' : 'opacity-100'}`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        >
          {t.text}
        </div>
      ))}
      {prompt && (
        <div role="status" className={`${toast} bg-amber-300`}>
          {prompt}
        </div>
      )}
    </div>
  );
}
