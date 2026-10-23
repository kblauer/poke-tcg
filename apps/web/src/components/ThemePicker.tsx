import { useColorTheme } from '../hooks/useColorTheme';
import { COLOR_THEMES, type ColorTheme, GENERATION_NAMES, themeVars } from '../utils/themes';

/** A small picture of the app in a theme's colours: the page, a panel with a line of text, and the accent. */
function Swatch({ theme }: { theme: ColorTheme }) {
  const v = themeVars(theme);
  return (
    <div className="flex h-12 items-center gap-2 rounded p-2" style={{ background: v['--color-slate-950'] }}>
      <div className="flex h-full flex-1 flex-col justify-center gap-1 rounded px-2" style={{ background: v['--color-slate-800'], boxShadow: `inset 0 0 0 1px ${v['--color-slate-600']}` }}>
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: v['--color-slate-100'] }} />
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: v['--color-slate-400'] }} />
      </div>
      <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: v['--color-yellow-300'] }} />
    </div>
  );
}

/**
 * The Settings page's colour themes (`COLOR_THEMES`), grouped by generation; a click puts one on at once and it's
 * remembered in the browser (`useColorTheme`).
 */
export function ThemePicker() {
  const [current, setTheme] = useColorTheme();
  const gens = [...new Set(COLOR_THEMES.map((t) => t.gen))];
  return (
    <div className="space-y-4">
      {gens.map((gen) => (
        <div key={gen} className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-300">{GENERATION_NAMES[gen]}</h4>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COLOR_THEMES.filter((t) => t.gen === gen).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTheme(t.id)}
                  aria-pressed={t.id === current}
                  className={`flex w-full flex-col gap-2 rounded-lg bg-slate-900 p-2 text-left text-sm transition hover:bg-slate-700 ${t.id === current ? 'ring-2 ring-yellow-400/70' : 'ring-1 ring-slate-700'}`}
                >
                  <Swatch theme={t} />
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{t.name}</span>
                    {t.id === current && <span className="shrink-0 text-xs font-semibold text-yellow-300">In use</span>}
                  </span>
                  <span className="text-xs text-slate-400">{t.from}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
