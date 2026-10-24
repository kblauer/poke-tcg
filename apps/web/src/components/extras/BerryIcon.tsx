import { berryInfo } from '@poke-tcg/campaign';

/** A berry's bag icon (Emerald's, `public/extras/berries/`, 24px), drawn crisp at `size`. */
export function BerryIcon({ berry, size = 24, className = '' }: { berry: string; size?: number; className?: string }) {
  return (
    <img
      src={`/extras/berries/${berry}.png`}
      alt={`${berryInfo(berry)?.name ?? berry} Berry`}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 select-none [image-rendering:pixelated] ${className}`}
    />
  );
}

/** A berry's name as the games print it ("Cheri Berry"). */
export const berryName = (berry: string) => `${berryInfo(berry)?.name ?? berry} Berry`;
