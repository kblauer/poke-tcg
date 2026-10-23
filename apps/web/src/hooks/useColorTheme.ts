import { useSyncExternalStore } from 'react';
import { registerSetting, saveSetting } from '../utils/accountSettings';
import { DEFAULT_THEME, findTheme, themeVars } from '../utils/themes';

const KEY = 'poke-tcg.theme';

// Remembered in the browser (applied at once) and with the account (utils/accountSettings); storage failures just mean the default colours.
function load(): string {
  try {
    return findTheme(localStorage.getItem(KEY) ?? DEFAULT_THEME).id;
  } catch {
    return DEFAULT_THEME;
  }
}

// Every variable any theme sets, so switching clears the last theme's before setting the new one's.
const ALL_VARS = Object.keys(themeVars(findTheme(DEFAULT_THEME)));

/** Puts a theme's colours on `<html>`; the default sets none, leaving Tailwind's own. */
function apply(id: string) {
  const style = document.documentElement.style;
  for (const name of ALL_VARS) style.removeProperty(name);
  if (id !== DEFAULT_THEME) for (const [name, value] of Object.entries(themeVars(findTheme(id)))) style.setProperty(name, value);
  document.documentElement.dataset.colorTheme = id;
}

// Applied as soon as this module loads (main.tsx imports it), before the first render.
let theme = load();
apply(theme);
const listeners = new Set<() => void>();

/** Picks a theme: `fromAccount`, the account's (not saved back to it). */
function setTheme(id: string, fromAccount = false) {
  theme = findTheme(id).id;
  apply(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
  if (!fromAccount) saveSetting('theme', theme);
  for (const l of listeners) l();
}

registerSetting('theme', {
  read: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  apply: (value) => setTheme(value ?? DEFAULT_THEME, true),
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The colour theme's id (`COLOR_THEMES`), shared by every component that shows or changes it. */
export function useColorTheme(): [string, (id: string) => void] {
  return [useSyncExternalStore(subscribe, () => theme), (id) => setTheme(id)];
}
