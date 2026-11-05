import { generation } from '@poke-tcg/idle';

/**
 * The player's overworld sprites in the shown run's region (issue #170, step 5): Kanto's FireRed's Red or Leaf (walking,
 * surfing, fishing), Johto's HeartGold's Ethan or Lyra (public/overworld/hgss/: walking, surfing; no fishing strip yet,
 * so a cast shows the walking or surfing one).
 */
export function playerSprites(gender: 'male' | 'female'): { walk: string; surf: string; fish: string | null } {
  if (generation().gen === 2) return gender === 'female' ? { walk: 'hgss/heroine', surf: 'hgss/swimheroine', fish: null } : { walk: 'hgss/hero', surf: 'hgss/swimhero', fish: null };
  const base = gender === 'female' ? 'leaf' : 'red';
  return { walk: base, surf: `${base}_surf`, fish: `${base}_fish` };
}
