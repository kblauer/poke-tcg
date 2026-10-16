import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import type { LogEntry, PlayerId } from '@poke-tcg/game-engine';
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CoinFlip } from './CoinFlip';
import { GameLog } from './GameLog';

interface LogPrefs {
  side: 'left' | 'right';
  open: boolean;
  /** Width in pixels while open. */
  width: number;
}

const PREFS_KEY = 'poke-tcg.game-log';
const DEFAULTS: LogPrefs = { side: 'right', open: true, width: 256 };
const MIN_WIDTH = 192;
const MAX_WIDTH = 640;
const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));

// Remembered per browser; a convenience only, so storage failures fall back to the defaults.
function loadPrefs(): LogPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<LogPrefs> | null;
    return saved ? { ...DEFAULTS, ...saved, width: clampWidth(saved.width ?? DEFAULTS.width) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(prefs: LogPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

const iconButton = 'flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-100';

/**
 * The game log (with coin flips under it) as a full-height panel at the left or right edge of the window.
 * It can be minimised to a thin strip, moved to the other side, and resized by dragging its inner
 * edge. Coin flips still show beside the strip while it's minimised. Clicks here never cancel a move.
 */
export function LogDrawer({ log, you }: { log: LogEntry[]; you: PlayerId }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  const { side, open, width } = prefs;
  const update = (change: Partial<LogPrefs>) => setPrefs((p) => ({ ...p, ...change }));

  /** Drags the inner edge: towards the board widens the panel. */
  function startResize(e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      update({ width: clampWidth(side === 'right' ? startWidth - dx : startWidth + dx) });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  const moveButton = (
    <button
      className={iconButton}
      title={`Move the log to the ${side === 'right' ? 'left' : 'right'}`}
      aria-label={`Move the log to the ${side === 'right' ? 'left' : 'right'}`}
      onClick={() => update({ side: side === 'right' ? 'left' : 'right' })}
    >
      <SwapHorizIcon fontSize="small" />
    </button>
  );
  // Minimising slides the panel towards its edge of the screen; expanding pulls it back out.
  const towardsEdge = side === 'right' ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />;
  const awayFromEdge = side === 'right' ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />;
  // A panel at the window edge, from the header to the bottom, with a border on the board side.
  const edge = `h-full shrink-0 bg-slate-900 border-slate-700 ${side === 'left' ? 'order-first border-r' : 'order-last border-l'}`;

  if (!open) {
    return (
      <aside data-keep-action className={`relative flex w-9 flex-col items-center gap-1 py-2 ${edge}`}>
        <button className={iconButton} title="Show the game log" aria-label="Show the game log" onClick={() => update({ open: true })}>
          {awayFromEdge}
        </button>
        {moveButton}
        <span className="mt-2 text-xs text-slate-400 [writing-mode:vertical-rl]">Game log</span>
        {/* Coin flips still need to be seen while the log is minimised: beside the strip, over the board. */}
        <div className={`absolute bottom-0 z-30 w-64 ${side === 'right' ? 'right-full mr-2' : 'left-full ml-2'}`}>
          <CoinFlip log={log} you={you} />
        </div>
      </aside>
    );
  }

  return (
    <aside data-keep-action className={`relative flex flex-col ${edge}`} style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the game log"
        title="Drag to resize"
        onPointerDown={startResize}
        className={`group absolute inset-y-0 z-10 flex w-3 cursor-col-resize justify-center ${side === 'right' ? '-left-3' : '-right-3'}`}
      >
        <div className="h-full w-0.5 rounded bg-transparent transition group-hover:bg-slate-500" />
      </div>
      <GameLog
        log={log}
        you={you}
        actions={
          <>
            {moveButton}
            <button className={iconButton} title="Minimise the game log" aria-label="Minimise the game log" onClick={() => update({ open: false })}>
              {towardsEdge}
            </button>
          </>
        }
      />
      <div className="border-t border-slate-700 empty:hidden">
        <CoinFlip log={log} you={you} />
      </div>
    </aside>
  );
}
