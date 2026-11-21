import { createContext } from 'react';

/**
 * An attack's question asking for Energy attached to the player's Pokémon (ownEnergy, ownEnergyUpTo, ownEnergyAny: Lost
 * Burn), answered on the board (the user's, 2026-11-21: the panel's loose icons didn't say whose they were): Card makes
 * each option's Energy icon on its Pokémon a button, marking the ones picked.
 */
export interface EnergyPick {
  options: ReadonlySet<string>;
  picked: ReadonlySet<string>;
  toggle: (uid: string) => void;
}

export const EnergyPickContext = createContext<EnergyPick | null>(null);
