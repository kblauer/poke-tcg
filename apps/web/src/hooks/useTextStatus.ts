import { toggleSetting } from './useToggleSetting';

/**
 * Whether a Pokémon's Special Conditions show as the original text tags (SLP, CNF, PAR, BRN, PSN) rather than the round icons
 * (public/status/, Card's conditionTags): off by default, the icons (the user's, 2026-10-26).
 */
export const useTextStatus = toggleSetting('textStatus', 'poke-tcg.text-status', false);
