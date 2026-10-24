/**
 * The run's bars (HpBar, and StatusBox's box) are Black 2 and White 2's (the user's): pieces of its HP bars sheet in `public/bars/`
 * (tools/bars/bw_bars.py), drawn 2 screen pixels to the sprite's 1 and never smoothed. A bar's strip is the sheet's
 * 1-pixel #101010 border (the sprite's own black, as the game's colours are, not the theme's) round its fill's tile,
 * repeated along it, so it's sharp at any width.
 */
export const BAR_BORDER = 'relative box-content border-2 border-[#101010] [image-rendering:pixelated]';

/** A strip's background: one of the sheet's tiles (`public/bars/<name>.png`), `w`×`h` screen pixels, repeated along it. */
export const barTile = (name: string, w: number, h: number) => ({ background: `url(/bars/${name}.png) 0 0 / ${w}px ${h}px repeat-x` });

/** How full the bar is for each HP lost (the user's): full and green, then 45% and yellow, then 15% and red. */
const LEVELS = [100, 45, 15];

/** The bar's fill for `hp` of `maxHp`: its width (%) and colour, as the games' bars turn yellow at half and red at a fifth. */
export function hpBarFill(hp: number, maxHp: number): { percent: number; color: 'green' | 'yellow' | 'red' } {
  const percent = hp <= 0 ? 0 : (LEVELS[maxHp - hp] ?? Math.round((hp / maxHp) * 100));
  return { percent, color: percent > 50 ? 'green' : percent > 20 ? 'yellow' : 'red' };
}

/**
 * The run's HP as a Pokémon health bar (the user's, in place of hearts): Black 2's "HP" tag (`label`) and the bar,
 * which slides to its new length (and colour) when a battle is lost or a Pokémon Center heals (hpBarFill). `track`: the
 * bar's width class.
 */
export function HpBar({ hp, maxHp, track = 'w-28', label = true }: { hp: number; maxHp: number; track?: string; label?: boolean }) {
  const { percent, color } = hpBarFill(hp, maxHp);
  return (
    <span className="flex shrink-0 items-center" role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp} title={`${hp} of ${maxHp} HP: losing a battle costs 1`}>
      {label && <img src="/bars/hp-tag.png" alt="" width={34} height={14} draggable={false} className="-mr-0.5 [image-rendering:pixelated]" />}
      <span className={`${BAR_BORDER} h-1.5 ${track}`} style={barTile('hp-empty', 2, 6)}>
        <span className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out" style={{ width: `${percent}%`, ...barTile(`hp-${color}`, 2, 6) }} />
      </span>
    </span>
  );
}
