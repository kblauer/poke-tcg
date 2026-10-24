import type { AccountSetting } from '@poke-tcg/shared';
import { useSyncExternalStore } from 'react';
import { registerSetting, saveSetting } from '../utils/accountSettings';

/**
 * An on/off Settings page choice, remembered in the browser (`storageKey`) and with the account (`key`,
 * utils/accountSettings), off or on by default (`fallback`; storage failures just mean it). Returns its hook, as
 * [value, set], shared by every component that shows or changes it.
 */
export function toggleSetting(key: AccountSetting, storageKey: string, fallback: boolean) {
  const parse = (value: string | null) => (value === null ? fallback : value === 'true');
  const read = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };
  let on = parse(read());
  const listeners = new Set<() => void>();
  /** `fromAccount`: the account's value (not saved back to it). */
  const set = (value: boolean, fromAccount = false) => {
    on = value;
    try {
      localStorage.setItem(storageKey, String(value));
    } catch {
      // Not remembered; it still applies until the page is reloaded.
    }
    if (!fromAccount) saveSetting(key, String(value));
    for (const l of listeners) l();
  };
  registerSetting(key, { read, apply: (value) => set(parse(value), true) });
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  return (): [boolean, (value: boolean) => void] => [useSyncExternalStore(subscribe, () => on), (value) => set(value)];
}
