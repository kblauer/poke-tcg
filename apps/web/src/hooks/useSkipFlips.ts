import { useSyncExternalStore } from 'react';
import { registerSetting, saveSetting } from '../utils/accountSettings';

const KEY = 'poke-tcg.skip-coin-flips';

// Remembered in the browser and with the account (utils/accountSettings); storage failures just mean the animations play.
function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

let skip = load();
const listeners = new Set<() => void>();

/** `fromAccount`: the account's value (not saved back to it). */
function setSkip(value: boolean, fromAccount = false) {
  skip = value;
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
  if (!fromAccount) saveSetting('skipFlips', String(value));
  for (const l of listeners) l();
}

registerSetting('skipFlips', {
  read: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  apply: (value) => setSkip(value === 'true', true),
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Whether coin flips skip their animation, shared by every component that shows or changes it. */
export function useSkipFlips(): [boolean, (value: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => skip), (value) => setSkip(value)];
}
