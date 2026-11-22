// Safari Draft's battle playback speed (the user's, 2026-11-22: picked in the site menu, and kept once picked): one
// value for the browser, remembered (`poke-tcg.safari-speed`), read by the playback and the menu alike.
import { useSyncExternalStore } from 'react';

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

const KEY = 'poke-tcg.safari-speed';

function load(): Speed {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? (saved as Speed) : 1;
  } catch {
    return 1;
  }
}

let speed = load();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function setSafariSpeed(next: Speed) {
  speed = next;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
  for (const l of listeners) l();
}

/** The playback speed, and its setter. */
export function useSafariSpeed(): [Speed, (next: Speed) => void] {
  return [useSyncExternalStore(subscribe, () => speed), setSafariSpeed];
}
