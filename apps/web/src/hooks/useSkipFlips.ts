import { useSyncExternalStore } from 'react';

const KEY = 'poke-tcg.skip-coin-flips';

// Remembered per browser; a convenience only, so storage failures just mean the animations play.
function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

let skip = load();
const listeners = new Set<() => void>();

function setSkip(value: boolean) {
  skip = value;
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Whether coin flips skip their animation, shared by every component that shows or changes it. */
export function useSkipFlips(): [boolean, (value: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => skip), setSkip];
}
