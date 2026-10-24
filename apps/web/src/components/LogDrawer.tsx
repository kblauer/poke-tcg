import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { LogEntry, PlayerId, PlayerView } from '@poke-tcg/game-engine';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscape } from '../hooks/useEscape';
import { useSkipFlips } from '../hooks/useSkipFlips';
import { ICON_BUTTON as iconButton } from '../utils/styles';
import { GameLog } from './GameLog';
import { MusicControls } from './MusicPlayer';
import { OptionsPanel } from './OptionsPanel';
import { PageMenu } from './PageNav';

// Only builds with the debug tools load (or even include) the Debug tab's panel.
// __DEBUG_BUILD__ (vite.config.ts) is a literal here, so a production build has no DebugPanel chunk at all.
const DebugPanel = __DEBUG_BUILD__ ? lazy(() => import('./DebugPanel')) : null;

type Tab = 'log' | 'run' | 'options' | 'debug';

interface LogPrefs {
  /** The tab shown: the log, the run (during a run), the options, or the debug tools (when available). */
  tab: Tab;
  /** PanelTabs on a phone: collapsed to its tab row. */
  collapsed?: boolean;
}

const PREFS_KEY = 'poke-tcg.game-log';
const DEFAULTS: LogPrefs = { tab: 'log' };

// Remembered per browser; a convenience only, so storage failures fall back to the defaults.
function loadPrefs(): LogPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<LogPrefs> | null;
    return saved ? { ...DEFAULTS, ...saved } : DEFAULTS;
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

/** The phone's tabs: the run's (during a run), the log, the options, and the debug tools (when available). */
function panelTabs(logTitle: string, run: boolean, debug: boolean): { id: Tab; label: string }[] {
  return [
    ...(run ? [{ id: 'run' as const, label: 'Run' }] : []),
    { id: 'log', label: logTitle },
    { id: 'options', label: 'Options' },
    ...(debug && DebugPanel ? [{ id: 'debug' as const, label: 'Debug' }] : []),
  ];
}

/**
 * The phone layout's version of the panel, opened by its round ☰ button: the same tabs, filling the screen, with
 * `actions` (Concede) along the bottom and a button to close it. It remembers the panel's tab (the same preferences).
 * With `pages` (the phone battle screen, which covers the site's header) the site's pages head it (PageMenu), the tabs below.
 */
export function LogSheet({
  log,
  you,
  logTitle = 'Battle log',
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
  useEscape(onClose);
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

/**
 * The side panel's tabs in the page itself, filling the box it's put in (the run screen's right half, below the route
 * map): the same tabs and the same remembered tab, with no moving, resizing or minimising.
 */
export function PanelTabs({ log, you, logTitle = 'Battle log', run, collapsible = false }: { log: LogEntry[]; you: PlayerId; logTitle?: string; run?: ReactNode; collapsible?: boolean }) {
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
