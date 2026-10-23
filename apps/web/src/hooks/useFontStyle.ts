import { useSyncExternalStore } from 'react';
import { registerSetting, saveSetting } from '../utils/accountSettings';

/** The UI's font (Settings): the pixel font (Pixellocale, Pokémon R/B/Y, the default), Pokémon R/S/E (the Pokemon Emerald font),
 * Pokémon S/M (Noto Sans JP), or the system's standard one. */
export type FontStyle = 'pixel' | 'emerald' | 'noto' | 'standard';
const FONTS: FontStyle[] = ['pixel', 'emerald', 'noto', 'standard'];

const KEY = 'poke-tcg.font';

// Remembered in the browser (applied at once) and with the account (utils/accountSettings); storage failures just mean the default font.
function load(): FontStyle {
  try {
    const saved = localStorage.getItem(KEY) as FontStyle | null;
    return saved && FONTS.includes(saved) ? saved : 'pixel';
  } catch {
    return 'pixel';
  }
}

/** Puts the font on `<html>` (`data-font`), which index.css reads: the font and the sizes tuned for it. */
function apply(font: FontStyle) {
  document.documentElement.dataset.font = font;
}

// Applied as soon as this module loads (main.tsx imports it), before the first render.
let font = load();
apply(font);
const listeners = new Set<() => void>();

/** Picks a font: `fromAccount`, the account's (not saved back to it). */
function setFont(next: FontStyle, fromAccount = false) {
  font = next;
  apply(font);
  try {
    localStorage.setItem(KEY, font);
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
  if (!fromAccount) saveSetting('font', font);
  for (const l of listeners) l();
}

registerSetting('font', {
  read: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  apply: (value) => setFont(value && FONTS.includes(value as FontStyle) ? (value as FontStyle) : 'pixel', true),
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The UI's font style, shared by every component that shows or changes it. */
export function useFontStyle(): [FontStyle, (font: FontStyle) => void] {
  return [useSyncExternalStore(subscribe, () => font), (next) => setFont(next)];
}
