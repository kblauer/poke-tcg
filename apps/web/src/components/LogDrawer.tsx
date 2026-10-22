import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import type { LogEntry, PlayerId, PlayerView } from '@poke-tcg/game-engine';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSkipFlips } from '../hooks/useSkipFlips';
import { GameLog } from './GameLog';
import { MusicControls } from './MusicPlayer';
import { OptionsPanel } from './OptionsPanel';
import { PageMenu } from './PageNav';

// Only builds with the debug tools load (or even include) the Debug tab's panel.
// __DEBUG_BUILD__ (vite.config.ts) is a literal here, so a production build has no DebugPanel chunk at all.
const DebugPanel = __DEBUG_BUILD__ ? lazy(() => import('./DebugPanel')) : null;

type Tab = 'log' | 'run' | 'options' | 'debug';

interface LogPrefs {
  side: 'left' | 'right';
  open: boolean;
  /** Width in pixels while open. */
  width: number;
  /** The tab shown: the log, the run (during a run), the options, or the debug tools (when available). */
  tab: Tab;
  /** PanelTabs on a phone: collapsed to its tab row. */
  collapsed?: boolean;
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

/** The tabs there are: the run's (during a run), the log, the options, and the debug tools (when available). */
function panelTabs(logTitle: string, run: boolean, debug: boolean): { id: Tab; label: string }[] {
  return [...(run ? [{ id: 'run' as const, label: 'Run' }] : []), { id: 'log', label: logTitle }, { id: 'options', label: 'Options' }, ...(debug && DebugPanel ? [{ id: 'debug' as const, label: 'Debug' }] : [])];
}

const iconButton = 'flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-100';

/**
 * The game log as a full-height panel at the left or right edge of the window. With `coinFlips` (a game), the log tab
 * has the "Skip coin flips" setting (the flips themselves play in the middle of the screen, CoinFlip in GamePage).
 * It can be minimised to a thin strip, moved to the other side, and resized by dragging its inner
 * edge. Clicks here never cancel a move.
 * During a run it has a Run tab (`run`: HP, ₱, EXP, consumables, the Bag); an Options tab (OptionsPanel); with `debug` (only while debugging
 * is enabled, never in production) a Debug tab with testing cheats. The tabs can be picked from the minimised
 * strip too, which opens the panel on that tab. `logTitle` names the log tab ("Game log", or "Run log" on the run screen).
 */
export function LogDrawer({
  log,
  you,
  logTitle = 'Game log',
  run,
  debug,
  coinFlips = false,
}: {
  log: LogEntry[];
  you: PlayerId;
  logTitle?: string;
  run?: ReactNode;
  coinFlips?: boolean;
  debug?: { gameId: string; view: PlayerView };
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [skipFlips, setSkipFlips] = useSkipFlips();
  useEffect(() => savePrefs(prefs), [prefs]);
  const { side, open, width } = prefs;
  const tabs = panelTabs(logTitle, !!run, !!debug);
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
  const header = (
    <div className="mb-2 flex items-center justify-between gap-2">
      {tabs.length > 1 ? (
        <div role="tablist" className="flex gap-1">
          {tabs.map((t) => tabButton(t.id, t.label))}
        </div>
      ) : (
        <h3 className="text-sm text-slate-400">{logTitle}</h3>
      )}
      <div className="flex gap-0.5">
        {moveButton}
        <button className={iconButton} title="Minimise the panel" aria-label="Minimise the panel" onClick={() => update({ open: false })}>
          {towardsEdge}
        </button>
      </div>
    </div>
  );
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
      {tab === 'run' && run ? (
        <section className="flex min-h-0 flex-1 flex-col p-3">
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto">{run}</div>
        </section>
      ) : tab === 'options' ? (
        <section className="flex min-h-0 flex-1 flex-col p-3">
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OptionsPanel />
          </div>
        </section>
      ) : tab === 'debug' && debug && DebugPanel ? (
        <section className="flex min-h-0 flex-1 flex-col p-3">
          {header}
          <Suspense fallback={<p className="text-xs text-slate-500">Loading…</p>}>
            <DebugPanel gameId={debug.gameId} view={debug.view} />
          </Suspense>
        </section>
      ) : (
        <GameLog
          log={log}
          you={you}
          header={
            <>
              {header}
              {coinFlips && (
                <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                  <input type="checkbox" checked={skipFlips} onChange={(e) => setSkipFlips(e.target.checked)} />
                  Skip coin flip animations
                </label>
              )}
            </>
          }
        />
      )}
    </aside>
  );
}

/**
 * The phone layout's version of the panel, opened by its round ☰ button: the same tabs, filling the screen, with
 * `actions` (Concede) along the bottom and a button to close it. It remembers the panel's tab (the same preferences).
 * With `pages` (the phone battle screen, which covers the site's header) the site's pages head it (PageMenu), the tabs below.
 */
export function LogSheet({
  log,
  you,
  logTitle = 'Game log',
  run,
  debug,
  coinFlips = false,
  actions,
  pages = false,
  onClose,
}: {
  log: LogEntry[];
  you: PlayerId;
  logTitle?: string;
  run?: ReactNode;
  coinFlips?: boolean;
  debug?: { gameId: string; view: PlayerView };
  actions?: ReactNode;
  pages?: boolean;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [skipFlips, setSkipFlips] = useSkipFlips();
  useEffect(() => savePrefs(prefs), [prefs]);
  const tabs = panelTabs(logTitle, !!run, !!debug);
  const tab = tabs.some((t) => t.id === prefs.tab) ? prefs.tab : 'log';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // In the page body, outside the board, which is locked against scrolling (touch-none): the log scrolls.
  return createPortal(
    <div data-keep-action role="dialog" aria-label="Menu" className="fixed inset-0 z-[1000] flex flex-col bg-slate-900 p-3 text-slate-100">
      {pages && (
        <div className="mb-3 flex items-center gap-2 border-b border-slate-700 pb-3">
          <div className="min-w-0 flex-1">
            <PageMenu onPick={onClose} iconsOnly />
          </div>
          <button className={`${iconButton} h-9 w-9 shrink-0`} title="Close the menu" aria-label="Close the menu" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setPrefs((p) => ({ ...p, tab: t.id }))}
              className={`rounded px-3 py-1.5 text-sm transition ${tab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!pages && (
          <button className={`${iconButton} h-9 w-9`} title="Close the menu" aria-label="Close the menu" onClick={onClose}>
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="-mx-3 flex min-h-0 flex-1 flex-col">
        {tab === 'run' && run ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{run}</div>
        ) : tab === 'options' ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <OptionsPanel />
          </div>
        ) : tab === 'debug' && debug && DebugPanel ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <Suspense fallback={<p className="text-xs text-slate-500">Loading…</p>}>
              <DebugPanel gameId={debug.gameId} view={debug.view} />
            </Suspense>
          </div>
        ) : (
          <GameLog
            log={log}
            you={you}
            header={
              coinFlips ? (
                <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                  <input type="checkbox" checked={skipFlips} onChange={(e) => setSkipFlips(e.target.checked)} />
                  Skip coin flip animations
                </label>
              ) : (
                <></>
              )
            }
          />
        )}
      </div>
      {/* The music player's bar (it isn't floating on a phone) and the actions (Concede). */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-700 pt-3">
        <MusicControls onOpen={onClose} />
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Where LogMenu's panel goes in the play area, in pixels from its top left corner. */
interface MenuBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Below this the space is too small for the panel, which then floats beside the ☰ at its own size. */
const MIN_MENU = { width: 200, height: 160 };

/**
 * The empty space on the right of the table (`area`, the PlayArea): right of both Active Pokémon, left of the CPU's Prize
 * cards and your deck and discard, below the CPU's Bench and above yours (the elements marked `data-slot` and
 * `data-menu-edge`), with a gap to each. Null when they aren't all there or it's too small.
 */
function menuBox(area: HTMLElement): MenuBox | null {
  const a = area.getBoundingClientRect();
  const rect = (selector: string) => area.querySelector(selector)?.getBoundingClientRect();
  const [oppActive, ownActive] = [rect('[data-slot="cpu-active"]'), rect('[data-slot="active"]')];
  const [oppBench, ownBench, prizes, piles] = ['opp-bench', 'own-bench', 'opp-prizes', 'own-piles'].map((edge) => rect(`[data-menu-edge="${edge}"]`));
  if (!oppActive || !ownActive || !oppBench || !ownBench || !prizes || !piles) return null;
  const gap = 12;
  const left = Math.max(oppActive.right, ownActive.right) + gap - a.left;
  const top = oppBench.bottom + gap - a.top;
  const width = Math.min(prizes.left, piles.left) - gap - a.left - left;
  const height = ownBench.top - gap - a.top - top;
  return width >= MIN_MENU.width && height >= MIN_MENU.height ? { left, top, width, height } : null;
}

/**
 * The game board's version of the panel (big screens): a round ☰ button floating at the middle of the play area's right
 * edge, opening the same tabs in a panel filling the empty space on the right of the table (`menuBox`: between the
 * Active Pokémon, the Benches, the CPU's Prize cards and your discard pile), over the table. It stays open while you play (the log keeps
 * up), until the ☰ or × is clicked again or Escape is pressed. It remembers the panel's tab (the same preferences).
 */
export function LogMenu({
  log,
  you,
  run,
  debug,
}: {
  log: LogEntry[];
  you: PlayerId;
  run?: ReactNode;
  debug?: { gameId: string; view: PlayerView };
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<MenuBox | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [skipFlips, setSkipFlips] = useSkipFlips();
  useEffect(() => savePrefs(prefs), [prefs]);
  const tabs = panelTabs('Game log', !!run, !!debug);
  const tab = tabs.some((t) => t.id === prefs.tab) ? prefs.tab : 'log';
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  // Measured while open: again when the table changes size, and after each move (a Bench filling up, the CPU's hand turned face up).
  useLayoutEffect(() => {
    const area = root.current?.parentElement;
    if (!open || !area) return;
    const measure = () => {
      const next = menuBox(area);
      setBox((b) => (b && next && b.left === next.left && b.top === next.top && b.width === next.width && b.height === next.height ? b : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [open, log.length]);
  return (
    <div ref={root} data-keep-action className="pointer-events-none absolute inset-0 z-[1050]">
      <button
        className={`pointer-events-auto absolute right-2 top-1/2 flex -translate-y-1/2 h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-200 shadow-lg ring-1 transition hover:bg-slate-700 active:scale-95 ${open ? 'ring-slate-400' : 'ring-slate-600'}`}
        title={open ? 'Close the menu' : 'Menu: game log, options and more'}
        aria-label={open ? 'Close the menu' : 'Menu: game log, options and more'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Menu"
          style={box ?? undefined}
          className={`pointer-events-auto absolute flex flex-col rounded-lg bg-slate-800 shadow-2xl ring-1 ring-slate-600 ${box ? '' : 'right-16 top-1/2 h-[min(36rem,90%)] w-80 max-w-[60cqw] -translate-y-1/2'}`}
        >
          <div role="tablist" className="flex gap-1 px-3 pt-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setPrefs((p) => ({ ...p, tab: t.id }))}
                className={`rounded px-2 py-0.5 text-sm transition ${tab === t.id ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'run' && run ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{run}</div>
          ) : tab === 'options' ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <OptionsPanel />
            </div>
          ) : tab === 'debug' && debug && DebugPanel ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <Suspense fallback={<p className="text-xs text-slate-500">Loading…</p>}>
                <DebugPanel gameId={debug.gameId} view={debug.view} />
              </Suspense>
            </div>
          ) : (
            <GameLog
              log={log}
              you={you}
              header={
                <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                  <input type="checkbox" checked={skipFlips} onChange={(e) => setSkipFlips(e.target.checked)} />
                  Skip coin flip animations
                </label>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The side panel's tabs in the page itself, filling the box it's put in (the run screen's right half, below the route
 * map): the same tabs and the same remembered tab, with no moving, resizing or minimising.
 */
export function PanelTabs({ log, you, logTitle = 'Game log', run, collapsible = false }: { log: LogEntry[]; you: PlayerId; logTitle?: string; run?: ReactNode; collapsible?: boolean }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  const tabs = panelTabs(logTitle, !!run, false);
  const tab = tabs.some((t) => t.id === prefs.tab) ? prefs.tab : 'log';
  // With `collapsible` (a phone, where it's under the deck choice or the encounter): its own height, 24rem open, or just
  // the tab row collapsed (the chevron, or picking a tab, opens it again); remembered with the panel's preferences.
  const collapsed = collapsible && !!prefs.collapsed;
  return (
    <div data-keep-action className={`flex min-h-0 flex-col rounded-lg bg-slate-900 ring-1 ring-slate-700 ${!collapsible ? 'h-full' : collapsed ? 'pb-3' : 'h-96'}`}>
      <div className="flex items-center gap-1 px-3 pt-3">
        <div role="tablist" className="flex flex-1 gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={!collapsed && tab === t.id}
              onClick={() => setPrefs((p) => ({ ...p, tab: t.id, collapsed: false }))}
              className={`rounded px-2 py-0.5 text-sm transition ${!collapsed && tab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {collapsible && (
          <button className={iconButton} aria-expanded={!collapsed} title={collapsed ? 'Show the panel' : 'Collapse the panel'} aria-label={collapsed ? 'Show the panel' : 'Collapse the panel'} onClick={() => setPrefs((p) => ({ ...p, collapsed: !collapsed }))}>
            {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          </button>
        )}
      </div>
      {collapsed ? null : tab === 'run' && run ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{run}</div>
      ) : tab === 'options' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <OptionsPanel />
        </div>
      ) : (
        <GameLog log={log} you={you} header={<></>} />
      )}
    </div>
  );
}
