import FavoriteIcon from '@mui/icons-material/Favorite';
import { Link } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRun } from '../hooks/useRun';
import { GameLog } from './GameLog';
import { useNavGameLog } from './NavLog';
import { PAGES, SETTINGS_PAGE } from './PageNav';
import { DeltaFloat } from './run/DeltaFloat';
import { RunStats } from './run/RunStats';
import { useDebugEnabled } from '../utils/debug';

// Only builds with the debug tools load (or even include) the Debug tab's panel (as in LogDrawer.tsx).
const DebugPanel = __DEBUG_BUILD__ ? lazy(() => import('./DebugPanel')) : null;

// The router sets data-status="active" on the link for the current page: lit in the logo's yellow.
const item =
  'flex h-10 shrink-0 items-center gap-3 rounded-md px-2.5 text-slate-300 transition hover:bg-slate-800 hover:text-white data-[status=active]:bg-yellow-400/15 data-[status=active]:text-yellow-200 data-[status=active]:ring-1 data-[status=active]:ring-yellow-400/60';

type LogTab = 'run' | 'game' | 'debug';

/** The open menu's sections: the run's numbers' height (px), and the log tab picked. */
interface SectionPrefs {
  run: number;
  tab: LogTab;
}

const SECTIONS_KEY = 'poke-tcg.nav-sections';
const SECTION_DEFAULTS: SectionPrefs = { run: 320, tab: 'game' };
const MIN_SECTION = 80;
const MAX_SECTION = 1600;
const clampHeight = (h: number) => Math.min(MAX_SECTION, Math.max(MIN_SECTION, Math.round(h)));

// Remembered per browser; a convenience only, so storage failures fall back to the defaults.
function loadSections(): SectionPrefs {
  try {
    return { ...SECTION_DEFAULTS, ...(JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? 'null') as Partial<SectionPrefs> | null) };
  } catch {
    return SECTION_DEFAULTS;
  }
}

/**
 * The site's menu on a big screen, down the left edge under the top bar, beside the page: minimised, a column of the
 * pages' icons (their names on hover), Settings last; `open` (toggled by the top bar's ☰), wider, with each
 * page's name beside its icon. Either way it takes its own room on the left and the page beside it stays usable.
 * Under them: open, the run's numbers and the logs (NavSections); minimised, the run's HP and ₱.
 */
export function NavRail({ open }: { open: boolean }) {
  const link = (p: (typeof PAGES)[number] | typeof SETTINGS_PAGE, className = '') => (
    <Link key={p.to} to={p.to} className={`${item} ${className}`} activeOptions={{ exact: p.to === '/' }} title={open ? undefined : p.label} aria-label={p.label}>
      <p.Icon sx={{ fontSize: 22 }} className="shrink-0" />
      <span className={`truncate font-medium transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}>{p.label}</span>
    </Link>
  );
  return (
    <nav
      className={`sticky top-14 z-[810] flex h-[calc(100dvh-3.5rem)] shrink-0 flex-col gap-1 overflow-hidden whitespace-nowrap border-r border-slate-800 bg-slate-900 p-2 transition-[width] duration-200 ${
        open ? 'w-72' : 'w-14'
      }`}
    >
      {PAGES.map((p) => link(p))}
      {link(SETTINGS_PAGE)}
      {open ? <NavSections /> : <RunSummary />}
    </nav>
  );
}

/** The run under way's view and account, or null between runs (a finished run's screen shows its own results). */
function useRunUnderWay() {
  const run = useRun();
  const data = run.overview.data;
  const view = data?.run?.view;
  return { run, data: data && view && view.phase !== 'won' && view.phase !== 'lost' ? { view, account: data.account } : null };
}

/** The minimised menu's run: its HP and ₱, under the pages' icons. */
function RunSummary() {
  const { data } = useRunUnderWay();
  if (!data) return null;
  const { view } = data;
  return (
    <section className="mt-2 flex flex-col items-center gap-3 border-t border-slate-800 pt-3 text-xs font-semibold">
      <span className="relative flex flex-col items-center text-rose-400" title={`${view.hp} of ${view.maxHp} HP`}>
        {/* A change floats up over the number (DeltaFloat). */}
        <DeltaFloat value={view.hp} format={(n) => String(n)} place="inset-x-0 top-0 text-center" />
        <FavoriteIcon sx={{ fontSize: 20 }} />
        {view.hp}/{view.maxHp}
      </span>
      <span className="relative flex flex-col items-center text-yellow-300" title="₱ to spend in this run">
        <DeltaFloat value={view.pokedollars} format={(n) => String(n)} place="inset-x-0 top-0 text-center" />
        <span className="text-base leading-5">₱</span>
        {view.pokedollars}
      </span>
    </section>
  );
}

/**
 * The open menu's sections under the pages, set apart by a margin and a line: during a run its numbers (RunStats: HP,
 * ₱, bank, EXP, items in effect, equipment, the Bag), then the logs, with a tab each for the run's log (during a run)
 * and the battle's (while a game is on screen, useGameLogInNav), and with the debug tools enabled (never in production) a
 * Debug tab for that game (DebugPanel). The run's section's height is set by dragging the bar
 * under it, remembered with the log tab (`poke-tcg.nav-sections`); the logs fill the rest, down to the menu's bottom.
 */
function NavSections() {
  const { run, data } = useRunUnderWay();
  const game = useNavGameLog();
  const debug = useDebugEnabled() && DebugPanel !== null;
  const [prefs, setPrefs] = useState(loadSections);
  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(prefs));
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }, [prefs]);
  const tabs: { id: LogTab; label: string }[] = [
    ...(data ? [{ id: 'run' as const, label: 'Run log' }] : []),
    ...(game ? [{ id: 'game' as const, label: 'Battle log' }] : []),
    // The debug tools (testing cheats, never in production) work on the game on screen.
    ...(game && debug ? [{ id: 'debug' as const, label: 'Debug' }] : []),
  ];
  if (!data && !tabs.length) return null;
  const tab = tabs.find((t) => t.id === prefs.tab)?.id ?? tabs[0]?.id;
  const log = tab === 'game' && game ? game : { log: (data?.view.log ?? []).map((text) => ({ text, player: null })), you: 'player' as const };
  const tabRow = (
    <div role="tablist" className="mb-2 flex gap-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setPrefs((p) => ({ ...p, tab: t.id }))}
          className={`rounded px-2 py-0.5 text-sm transition ${tab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
  return (
    // Its own width, so nothing reflows while the menu widens.
    <div className="mt-2 flex min-h-0 w-[16.5rem] flex-1 flex-col gap-1 overflow-hidden whitespace-normal border-t border-slate-800 pt-3">
      {data && (
        <Resizable height={prefs.run} onHeight={(run) => setPrefs((p) => ({ ...p, run }))} label="the run's section">
          <div className="h-full overflow-y-auto pr-1">
            <RunStats view={data.view} account={data.account} run={run} />
          </div>
        </Resizable>
      )}
      {tab && (
        // The rest of the menu, down to its bottom (at least 8rem: the run's section gives way first).
        <div data-keep-action className="flex min-h-32 flex-1 flex-col rounded-lg bg-slate-950/60 ring-1 ring-slate-800 [&>section]:p-2">
          {tab === 'debug' && game && DebugPanel ? (
            <section className="flex min-h-0 flex-1 flex-col">
              {tabRow}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Suspense fallback={<p className="text-xs text-slate-500">Loading…</p>}>
                  <DebugPanel gameId={game.gameId} view={game.view} />
                </Suspense>
              </div>
            </section>
          ) : (
            <GameLog log={log.log} you={log.you} header={tabRow} />
          )}
        </div>
      )}
    </div>
  );
}

/** A section `height` px tall (less when the menu is too short), with a bar under it that's dragged to change the height (`onHeight`). */
function Resizable({ height, onHeight, label, children }: { height: number; onHeight: (height: number) => void; label: string; children: ReactNode }) {
  function startResize(e: ReactPointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const move = (ev: PointerEvent) => onHeight(clampHeight(height + ev.clientY - startY));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }
  return (
    <div className="flex min-h-0 flex-col">
      <div style={{ height }} className="min-h-0 shrink">
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${label}`}
        title={`Drag to resize ${label}`}
        onPointerDown={startResize}
        className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-slate-700 transition group-hover:bg-slate-500" />
      </div>
    </div>
  );
}
