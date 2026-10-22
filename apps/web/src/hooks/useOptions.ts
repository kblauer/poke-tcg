import { useSyncExternalStore } from 'react';

/** The side panel's Options tab: which of the CPU's cards are shown large when it plays them (Trainers always are). */
export interface Options {
  showPokemonPlayed: boolean;
  showEnergyPlayed: boolean;
}

const KEY = 'poke-tcg.options';
const DEFAULTS: Options = { showPokemonPlayed: true, showEnergyPlayed: true };

// Remembered per browser; a convenience only, so storage failures fall back to the defaults.
function load(): Options {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Options> | null) };
  } catch {
    return DEFAULTS;
  }
}

let options = load();
const listeners = new Set<() => void>();

function setOptions(change: Partial<Options>) {
  options = { ...options, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The player's options, shared by every component that reads or changes them. */
export function useOptions(): [Options, (change: Partial<Options>) => void] {
  return [useSyncExternalStore(subscribe, () => options), setOptions];
}
