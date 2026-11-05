import { generation } from '@poke-tcg/idle';

/**
 * The player's overworld sprites in the shown run's region (issue #170, step 5): Kanto's FireRed's Red or Leaf (walking,
 * surfing, fishing, on land or surfing), Johto's HeartGold's Ethan or Lyra (public/overworld/hgss/: walking, surfing,
 * fishing on land, its strip with its own frames facing right, `fishRight`; a cast while surfing shows the surfing one:
 * no strip of him fishing on his Pokémon yet).
 */
export function playerSprites(gender: 'male' | 'female'): { walk: string; surf: string; fish: string; fishSurfing: boolean; fishRight: boolean } {
  if (generation().gen === 2) return { ...(gender === 'female' ? { walk: 'hgss/heroine', surf: 'hgss/swimheroine', fish: 'hgss/fish_heroine' } : { walk: 'hgss/hero', surf: 'hgss/swimhero', fish: 'hgss/fish_hero' }), fishSurfing: false, fishRight: true };
  const base = gender === 'female' ? 'leaf' : 'red';
  return { walk: base, surf: `${base}_surf`, fish: `${base}_fish`, fishSurfing: true, fishRight: false };
}

/** The shown run's region's Pokémon pictures (front/, back/, shiny/, icon/<id>.png): FireRed's in Kanto, HeartGold's in Johto (tools/idle/hgss_pics.py). */
export const pokemonPics = () => (generation().gen === 2 ? '/idle/gen2/pokemon' : '/idle/gen1/pokemon');
