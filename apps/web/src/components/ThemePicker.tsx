import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';
import { useColorTheme } from '../hooks/useColorTheme';
import { COLOR_THEMES, type ColorTheme, findTheme, GENERATION_NAMES, themeVars } from '../utils/themes';

/** A small picture of the app in a theme's colours: the page, a panel with a line of text, and the accent. */
function Swatch({ theme }: { theme: ColorTheme }) {
  const v = themeVars(theme);
  return (
    <div className="flex h-8 items-center gap-1.5 rounded p-1.5" style={{ background: v['--color-slate-950'] }}>
      <div className="flex h-full flex-1 flex-col justify-center gap-1 rounded px-1.5" style={{ background: v['--color-slate-800'], boxShadow: `inset 0 0 0 1px ${v['--color-slate-600']}` }}>
        <span className="h-1 w-3/4 rounded-full" style={{ background: v['--color-slate-100'] }} />
        <span className="h-1 w-1/2 rounded-full" style={{ background: v['--color-slate-400'] }} />
      </div>
      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: v['--color-yellow-300'] }} />
    </div>
  );
}

/** A theme's tile: its swatch and name (where its colours come from on hover), ringed when it's in use. */
function ThemeTile({ theme, current, onPick }: { theme: ColorTheme; current: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={current}
      title={theme.from}
      className={`flex w-full flex-col gap-1 rounded-md bg-slate-900 p-1.5 text-left text-xs transition hover:bg-slate-700 ${current ? 'ring-2 ring-yellow-400/70' : 'ring-1 ring-slate-700'}`}
    >
      <Swatch theme={theme} />
      <span className={`truncate font-semibold ${current ? 'text-yellow-300' : ''}`}>{theme.name}</span>
    </button>
  );
}

/**
 * The Settings page's colour themes (`COLOR_THEMES`): an accordion per group, System themes (Slate and Start Menu, the
 * user's) then each generation's, the one holding the theme in use open at first; a click puts one on at once and it's remembered in the browser
 * (`useColorTheme`).
 */
export function ThemePicker() {
  const [current, setTheme] = useColorTheme();
  // The system themes (Slate, Start Menu) first, as a group like the generations' (the user's).
  const gens = [...new Set(COLOR_THEMES.map((t) => t.gen))].sort((a, b) => a - b);
  const [open, setOpen] = useState(() => new Set<number>([findTheme(current).gen]));
  const toggle = (gen: number) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(gen)) next.add(gen);
      return next;
    });
  const tiles = 'grid grid-cols-3 gap-2 sm:grid-cols-5';
  return (
    <div className="space-y-2">
      {gens.map((gen) => {
        const themes = COLOR_THEMES.filter((t) => t.gen === gen);
        const inUse = themes.find((t) => t.id === current);
        const isOpen = open.has(gen);
        return (
          <div key={gen}>
            <button type="button" className="flex w-full items-center gap-1 py-1 text-sm font-semibold text-slate-300 hover:text-slate-50" aria-expanded={isOpen} onClick={() => toggle(gen)}>
              {isOpen ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
              <span className="flex-1 text-left">
                {GENERATION_NAMES[gen]} <span className="font-normal text-slate-500">({themes.length})</span>
              </span>
              {!isOpen && inUse && <span className="text-xs font-normal text-yellow-300">{inUse.name}</span>}
            </button>
            {isOpen && (
              <ul className={`${tiles} pb-2 pt-1`}>
                {themes.map((t) => (
                  <li key={t.id}>
                    <ThemeTile theme={t} current={t.id === current} onPick={() => setTheme(t.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
