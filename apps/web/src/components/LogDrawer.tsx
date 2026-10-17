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

type Tab = 'log' | 'run' | 'debug';

interface LogPrefs {
  side: 'left' | 'right';
  open: boolean;
  /** Width in pixels while open. */
  width: number;
  /** The tab shown: the log, the run (during a run), or the debug tools (when available). */
  tab: Tab;
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
 * During a run it has a Run tab (`run`: HP, ₱, EXP, consumables, the Bag); with `debug` (only while debugging
 * is enabled, never in production) a Debug tab with testing cheats. The tabs can be picked from the minimised
 * strip too, which opens the panel on that tab. `logTitle` names the log tab ("Game log", or "Run log" on the run screen).
 * On a phone (NARROW_SCREEN) there's no room for it beside the page, so it opens over the page instead (CompactLog).
 * The game board opens it from a button beside the turn bar (CompactLogButton) and passes whether it's open as `sheet`;
 * without `sheet` (the run screen) it keeps that itself, with a Log button in the bottom-right corner.
 */
export function LogDrawer({
  log,
  you,
  logTitle = 'Game log',
  run,
  debug,
  sheet,
}: {
  log: LogEntry[];
  you: PlayerId;
  logTitle?: string;
  run?: ReactNode;
  debug?: { gameId: string; view: PlayerView };
  sheet?: { open: boolean; setOpen: (open: boolean) => void };
}) {
  const compact = useMediaQuery(NARROW_SCREEN);
  /** The compact panel is open, when the page doesn't say (no `sheet`). Not remembered: it starts closed. */
  const [ownSheetOpen, setOwnSheetOpen] = useState(false);
  const sheetOpen = sheet ? sheet.open : ownSheetOpen;
  const setSheetOpen = sheet ? sheet.setOpen : setOwnSheetOpen;
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  const { side, open, width } = prefs;
  const tabs: { id: Tab; label: string }[] = [
    ...(run ? [{ id: 'run' as const, label: 'Run' }] : []),
    { id: 'log', label: logTitle },
    ...(debug && DebugPanel ? [{ id: 'debug' as const, label: 'Debug' }] : []),
  ];
  const tab = tabs.some((t) => t.id === prefs.tab) ? prefs.tab : 'log';
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
  /** Title row: the tabs (just the log's title when it's the only one), then the move and minimise buttons. */
  const tabButton = (t: Tab, label: string) => (
    <button
      key={t}
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
      {tabs.length > 1 ? (
        <div role="tablist" className="flex gap-1">
          {tabs.map((t) => tabButton(t.id, t.label))}
        </div>
      ) : (
        <h3 className="text-sm text-slate-400">{logTitle}</h3>
      )}
      <div className="flex gap-0.5">{buttons}</div>
    </div>
  );
  /** The open panel's tab, under its title row. */
  const body = (buttons: ReactNode) =>
    tab === 'run' && run ? (
      <section className="flex min-h-0 flex-1 flex-col p-3">
        {header(buttons)}
        <div className="min-h-0 flex-1 overflow-y-auto">{run}</div>
      </section>
    ) : tab === 'debug' && debug && DebugPanel ? (
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
      <CompactLog
        open={sheetOpen}
        close={() => setSheetOpen(false)}
        button={!sheet && <CompactLogButton floating onClick={() => setSheetOpen(true)} />}
        coins={<CoinFlip log={log} you={you} />}
      >
        {body(
          <button className={iconButton} title="Close the panel" aria-label="Close the panel" onClick={() => setSheetOpen(false)}>
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
        <button className={iconButton} title="Show the panel" aria-label="Show the panel" onClick={() => update({ open: true })}>
          {awayFromEdge}
        </button>
        {moveButton}
        {/* The tabs, written sideways: picking one opens the panel on it. */}
        <div role="tablist" aria-orientation="vertical" className="mt-2 flex flex-col gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              title={`Show ${t.label}`}
              onClick={() => update({ tab: t.id, open: true })}
              className={`rounded px-1 py-2 text-xs transition [writing-mode:vertical-rl] ${tab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
          <button className={iconButton} title="Minimise the panel" aria-label="Minimise the panel" onClick={() => update({ open: false })}>
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

/**
 * On a phone, the button that opens the side panel over the page: beside the turn bar on the game board, or
 * `floating` in the bottom-right corner of the window (the run screen). Never cancels a move.
 */
export function CompactLogButton({ onClick, floating = false }: { onClick: () => void; floating?: boolean }) {
  return (
    <button
      data-keep-action
      onClick={onClick}
      title="Show the log"
      aria-label="Show the log"
      className={`flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-300 ring-1 ring-slate-600 transition hover:bg-slate-700 ${
        floating ? 'fixed bottom-4 right-4 z-30 shadow-lg shadow-black/60' : ''
      }`}
    >
      <ListAltIcon sx={{ fontSize: 16 }} />
      Log
    </button>
  );
}

/**
 * The side panel on a phone, where the page needs the whole width: it opens over the page from the right
 * (tapping beside it closes it). Coin flips show in the middle of the screen while it's closed, and under the
 * log while it's open. `button` is the floating Log button, when the page has no place of its own for one.
 */
function CompactLog({ open, close, button, coins, children }: { open: boolean; close: () => void; button: ReactNode; coins: ReactNode; children: ReactNode }) {
  if (!open) {
    return (
      <>
        {button}
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-[1050] w-64 -translate-x-1/2 -translate-y-1/2 shadow-2xl shadow-black/70 empty:hidden">{coins}</div>
      </>
    );
  }
  return (
    // Clicks in the panel or on the dimmed page beside it never cancel a move; the close button and the backdrop close it.
    <div data-keep-action className="fixed inset-0 z-[1050]">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <aside className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-slate-700 bg-slate-900 shadow-2xl">
        {children}
        <div className="border-t border-slate-700 empty:hidden">{coins}</div>
      </aside>
    </div>
  );
}
