import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import type { LogEntry, PlayerId, PlayerView } from '@poke-tcg/game-engine';
import { lazy, Suspense, useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { NARROW_SCREEN } from '../utils/layout';
import { CoinFlip } from './CoinFlip';
import { GameLog } from './GameLog';

// Only builds with the debug tools load (or even include) the Debug tab's panel.
// __DEBUG_BUILD__ (vite.config.ts) is a literal here, so a production build has no DebugPanel chunk at all.
const DebugPanel = __DEBUG_BUILD__ ? lazy(() => import('./DebugPanel')) : null;

interface LogPrefs {
  side: 'left' | 'right';
  open: boolean;
  /** Width in pixels while open. */
  width: number;
  /** The tab shown: the log, or the debug tools (when available). */
  tab: 'log' | 'debug';
}

const PREFS_KEY = 'poke-tcg.game-log';
const DEFAULTS: LogPrefs = { side: 'right', open: true, width: 256, tab: 'log' };
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
 * With `debug` (only while debugging is enabled, never in production) it has a second tab, Debug, with testing cheats.
 * On a phone (NARROW_SCREEN) there's no room for it beside the board, so it opens over the board instead (CompactLog),
 * from a button the board puts beside the turn bar (CompactLogButton); `sheet` is whether it's open.
 */
export function LogDrawer({
  log,
  you,
  debug,
  sheet,
}: {
  log: LogEntry[];
  you: PlayerId;
  debug?: { gameId: string; view: PlayerView };
  sheet: { open: boolean; setOpen: (open: boolean) => void };
}) {
  const compact = useMediaQuery(NARROW_SCREEN);
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  const { side, open, width } = prefs;
  const tab = debug && DebugPanel ? prefs.tab : 'log';
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
  /** Title row: the tabs (just "Game log" without the debug tools), then the move and minimise buttons. */
  const tabButton = (t: LogPrefs['tab'], label: string) => (
    <button
      role="tab"
      aria-selected={tab === t}
      onClick={() => update({ tab: t })}
      className={`rounded px-2 py-0.5 text-sm transition ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {label}
    </button>
  );
  const header = (buttons: ReactNode) => (
    <div className="mb-2 flex items-center justify-between gap-2">
      {debug && DebugPanel ? (
        <div role="tablist" className="flex gap-1">
          {tabButton('log', 'Game log')}
          {tabButton('debug', 'Debug')}
        </div>
      ) : (
        <h3 className="text-sm text-slate-400">Game log</h3>
      )}
      <div className="flex gap-0.5">{buttons}</div>
    </div>
  );
  /** The open panel's tab, under its title row. */
  const body = (buttons: ReactNode) =>
    tab === 'debug' && debug && DebugPanel ? (
      <section className="flex min-h-0 flex-1 flex-col p-3">
        {header(buttons)}
        <Suspense fallback={<p className="text-xs text-slate-500">Loading…</p>}>
          <DebugPanel gameId={debug.gameId} view={debug.view} />
        </Suspense>
      </section>
    ) : (
      <GameLog log={log} you={you} header={header(buttons)} />
    );

  if (compact) {
    return (
      <CompactLog open={sheet.open} close={() => sheet.setOpen(false)} coins={<CoinFlip log={log} you={you} />}>
        {body(
          <button className={iconButton} title="Close the game log" aria-label="Close the game log" onClick={() => sheet.setOpen(false)}>
            <CloseIcon fontSize="small" />
          </button>,
        )}
      </CompactLog>
    );
  }

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
      {body(
        <>
          {moveButton}
          <button className={iconButton} title="Minimise the game log" aria-label="Minimise the game log" onClick={() => update({ open: false })}>
            {towardsEdge}
          </button>
        </>,
      )}
      <div className="border-t border-slate-700 empty:hidden">
        <CoinFlip log={log} you={you} />
      </div>
    </aside>
  );
}

/** On a phone, the button that opens the game log over the board (the board puts it beside the turn bar). Never cancels a move. */
export function CompactLogButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      data-keep-action
      onClick={onClick}
      title="Show the game log"
      aria-label="Show the game log"
      className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-300 ring-1 ring-slate-600 transition hover:bg-slate-700"
    >
      <ListAltIcon sx={{ fontSize: 16 }} />
      Log
    </button>
  );
}

/**
 * The game log on a phone, where the board needs the whole width: CompactLogButton opens it as a panel over
 * the board from the right (tapping beside it closes it). Coin flips show in the middle of the screen while
 * it's closed, and under the log while it's open.
 */
function CompactLog({ open, close, coins, children }: { open: boolean; close: () => void; coins: ReactNode; children: ReactNode }) {
  if (!open) {
    return <div className="pointer-events-none fixed left-1/2 top-1/2 z-[1050] w-64 -translate-x-1/2 -translate-y-1/2 shadow-2xl shadow-black/70 empty:hidden">{coins}</div>;
  }
  return (
    // Clicks in the panel or on the dimmed board beside it never cancel a move; the close button and the backdrop close it.
    <div data-keep-action className="fixed inset-0 z-[1050]">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <aside className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-slate-700 bg-slate-900 shadow-2xl">
        {children}
        <div className="border-t border-slate-700 empty:hidden">{coins}</div>
      </aside>
    </div>
  );
}
