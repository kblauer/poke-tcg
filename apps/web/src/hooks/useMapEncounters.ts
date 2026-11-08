import { toggleSetting } from './useToggleSetting';

/**
 * Whether a run's encounters are on its route map (the user's experiment, 2026-11-08): the map zooming in on each step
 * with a card beside each encounter's figure, the encounter under way over the map's bottom, and Concede, the Bag and the
 * deck in its corners (Home.tsx, RouteView); off, the panels under the map as before. Off by default (the user's).
 */
export const useMapEncounters = toggleSetting('mapEncounters', 'poke-tcg.map-encounters', false);
