import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLOR_THEMES, DEFAULT_THEME, findTheme, playmatColors, themeVars } from './themes';

describe('colour themes', () => {
  it('have unique ids, and an unknown id falls back to the default', () => {
    expect(new Set(COLOR_THEMES.map((t) => t.id)).size).toBe(COLOR_THEMES.length);
    expect(findTheme(DEFAULT_THEME).id).toBe(DEFAULT_THEME);
    expect(findTheme('no-such-theme')).toBe(COLOR_THEMES[0]);
    expect(COLOR_THEMES[0]!.id).toBe(DEFAULT_THEME);
  });

  it("set every slate shade and yellow 50–400 (never yellow 500 and up: those mean things in play), as OKLCH colours", () => {
    for (const theme of COLOR_THEMES) {
      const vars = themeVars(theme);
      const keys = Object.keys(vars).sort();
      expect(keys.filter((k) => k.startsWith('--color-slate-'))).toHaveLength(11);
      expect(keys.filter((k) => k.startsWith('--color-yellow-')).sort()).toEqual(['--color-yellow-100', '--color-yellow-200', '--color-yellow-300', '--color-yellow-400', '--color-yellow-50']);
      for (const value of Object.values(vars)) expect(value, `${theme.id}`).toMatch(/^oklch\(\d\.\d{3} \d\.\d{4} \d+(\.\d+)?\)$/);
    }
  });

  it('keep the neutrals’ lightness steps: slate-50 the lightest and slate-950 the darkest, turned round for a light theme', () => {
    const lightness = (v: string) => Number(/^oklch\((\d\.\d{3})/.exec(v)![1]);
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    expect(COLOR_THEMES.some((t) => t.light)).toBe(true);
    for (const theme of COLOR_THEMES) {
      const vars = themeVars(theme);
      const steps = shades.map((s) => lightness(vars[`--color-slate-${s}`]!));
      for (let i = 1; i < steps.length; i++) {
        if (theme.light) expect(steps[i]!, `${theme.id} slate-${shades[i]}`).toBeGreaterThan(steps[i - 1]!);
        else expect(steps[i]!, `${theme.id} slate-${shades[i]}`).toBeLessThan(steps[i - 1]!);
      }
    }
  });

  it("playmat colours: Slate keeps Tailwind's slate-400 lines and sky-300 glow; other themes take their hue", () => {
    expect(playmatColors(findTheme(DEFAULT_THEME))).toEqual({ line: '148, 163, 184', glow: '125, 211, 252' });
    for (const theme of COLOR_THEMES.slice(1)) {
      const { line, glow } = playmatColors(theme);
      expect(line, theme.id).toMatch(/^\d+, \d+, \d+$/);
      expect(glow, theme.id).toMatch(/^\d+, \d+, \d+$/);
    }
  });
});

// Dark text on a background no theme changes (amber, red, white, yellow 500 and up: any colour but slate and yellow
// 50–400) must not be slate: a light theme turns slate-900 near white (LIGHT_NEUTRAL), and the text disappears (#204).
// `text-gray-900` is the same dark in every theme. A scan of the source's class strings.
const SRC = fileURLToPath(new URL('..', import.meta.url));
const THEMED_BG = /^bg-(?:slate-\d+|yellow-(?:50|100|200|300|400))(?:\/\d+)?$/;

/** The `text-slate-900` classes of one class string that sit on a background a theme doesn't change, or on none it names. */
function darkOnFixed(classes: string): string[] {
  const tokens = classes.split(/\s+/).filter(Boolean);
  return tokens.flatMap((token) => {
    if (!token.endsWith('text-slate-900')) return [];
    // With the same variants (`hover:`…) as the text: the backgrounds it's read on.
    const variants = token.slice(0, -'text-slate-900'.length);
    const backgrounds = tokens.filter((t) => t.startsWith(`${variants}bg-`)).map((t) => t.slice(variants.length));
    return backgrounds.length && backgrounds.every((bg) => THEMED_BG.test(bg)) ? [] : [token];
  });
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('dark text on a colour no theme changes', () => {
  it('is found by the scan', () => {
    expect(darkOnFixed('rounded bg-red-400 px-3 text-slate-900')).toEqual(['text-slate-900']);
    expect(darkOnFixed('bg-white text-slate-900 hover:bg-slate-200')).toEqual(['text-slate-900']);
    expect(darkOnFixed('bg-yellow-500 text-slate-900')).toEqual(['text-slate-900']);
    // Its background is somewhere the scan can't see: it must be named with it, or the text be gray.
    expect(darkOnFixed('rounded-lg px-5 text-slate-900 shadow-lg')).toEqual(['text-slate-900']);
    expect(darkOnFixed('bg-yellow-300 text-slate-900')).toEqual([]);
    expect(darkOnFixed('rounded bg-red-400 px-3 text-gray-900')).toEqual([]);
    // Each state's text with that state's background.
    expect(darkOnFixed('bg-yellow-500 text-gray-900 hover:bg-yellow-400 hover:text-slate-900')).toEqual([]);
    expect(darkOnFixed('bg-yellow-400 text-gray-900 hover:bg-amber-500 hover:text-slate-900')).toEqual(['hover:text-slate-900']);
  });

  it('is never slate-900 (`text-gray-900` instead): every class string in the source', () => {
    // Still to fix (the contest screens were being changed elsewhere when this was written): the Tough category's tag.
    const known = ['components/contest/contestUi.tsx'];
    const files = sources(SRC).filter((path) => !known.includes(relative(SRC, path).replace(/\\/g, '/')));
    expect(files.length).toBeGreaterThan(200);
    const hits = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .flatMap((line, i) =>
          // Each quoted piece of the line by itself: 'a' : 'b' are two class strings.
          line
            .split(/['"`]|\$\{|\}/)
            .filter((piece) => darkOnFixed(piece).length)
            .map((piece) => `${relative(SRC, path).replace(/\\/g, '/')}:${i + 1}: ${piece.trim()}`),
        ),
    );
    expect(hits).toEqual([]);
  });
});
