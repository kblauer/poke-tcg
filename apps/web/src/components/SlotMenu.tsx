import type { ReactNode } from 'react';

/** A small panel under a clicked Pokémon in play with what can be done with it (Activate a power, Discard Clefairy Doll). */
export function SlotMenu({ children }: { children: ReactNode }) {
  return <div data-keep-action className="absolute left-1/2 top-full z-10 mt-1 w-36 -translate-x-1/2 space-y-1 rounded-lg bg-slate-800 p-1.5 text-xs shadow-lg ring-1 ring-slate-600">{children}</div>;
}
