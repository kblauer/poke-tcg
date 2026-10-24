import { toggleSetting } from './useToggleSetting';

/** Whether the EXP bar (its fill and "EXP") is in the colour theme's accent (StatusBox), or the game's blue: on by default (the user's). */
export const useExpTheme = toggleSetting('expTheme', 'poke-tcg.exp-theme', true);

/**
 * Whether the run's ₱ amounts are in the colour theme's accent (PokedollarAmount), or the Pokédollar icon's gold: off by
 * default (the user's).
 */
export const usePokedollarTheme = toggleSetting('pokedollarTheme', 'poke-tcg.pokedollar-theme', false);

/** The Pokédollar icon's gold (tools/icons/pokedollar.py's GOLD): the run's ₱ amounts' colour when they aren't themed. */
export const POKEDOLLAR_GOLD = '#f8c830';

/** The run's ₱ amounts' text colour: the theme's accent or the icon's gold (usePokedollarTheme). */
export function usePokedollarColor(): { className: string; style?: { color: string } } {
  const [themed] = usePokedollarTheme();
  return themed ? { className: 'text-yellow-300' } : { className: '', style: { color: POKEDOLLAR_GOLD } };
}
