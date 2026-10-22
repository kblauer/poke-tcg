import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useSyncExternalStore, type ReactNode } from 'react';

const KEY = 'poke-tcg.run-sections';

// Remembered per browser; a convenience only, so storage failures leave every section open.
function load(): Record<string, boolean> {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, boolean> | null) ?? {};
  } catch {
    return {};
  }
}

let closed = load();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function toggle(id: string) {
  closed = { ...closed, [id]: !closed[id] };
  try {
    localStorage.setItem(KEY, JSON.stringify(closed));
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
  for (const l of listeners) l();
}

/**
 * A section of the run's numbers (RunStats) that folds away: its heading (with `count`, the number of things in it)
 * opens and closes it, open at first and remembered per section (`id`) in the browser, shared by every copy on screen.
 */
export function RunSection({ id, title, count, className = '', children }: { id: string; title: string; count?: number; className?: string; children: ReactNode }) {
  const open = !useSyncExternalStore(subscribe, () => !!closed[id]);
  return (
    <div className={className}>
      <button
        className="flex w-full items-center gap-1 rounded text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-300"
        aria-expanded={open}
        onClick={() => toggle(id)}
      >
        <span className="flex-1 text-left">
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal normal-case text-slate-600">{count}</span>}
        </span>
        {open ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
