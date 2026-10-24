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

  it('keep the neutrals’ lightness steps: slate-50 is the lightest and slate-950 the darkest, for every theme', () => {
    const lightness = (v: string) => Number(/^oklch\((\d\.\d{3})/.exec(v)![1]);
    for (const theme of COLOR_THEMES) {
      const vars = themeVars(theme);
      const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => lightness(vars[`--color-slate-${s}`]!));
      for (let i = 1; i < steps.length; i++) expect(steps[i]!, `${theme.id} slate-${[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950][i]}`).toBeLessThan(steps[i - 1]!);
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
