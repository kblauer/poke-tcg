import { dexGen, generation } from '@poke-tcg/idle';

/**
 * The player's overworld sprites in the shown run's region (issue #170, step 5): Kanto's FireRed's Red or Leaf (walking,
 * surfing, fishing, on land or surfing), Johto's HeartGold's Ethan or Lyra (public/overworld/hgss/: walking, surfing,
 * fishing on land, its strip with its own frames facing right, `fishRight`; a cast while surfing shows the surfing one:
 * no strip of him fishing on his Pokémon yet), Hoenn's Emerald's Brendan or May (public/overworld/rse/, the Badge
 * Challenge's walking and surfing ones and tools/idle/hoenn_areas.py's fishing ones, FireRed's layout; fishing from the
 * water on Emerald's surf blob in their palette, `blob`, FireRed's surf_blob.png's layout).
 */
export function playerSprites(gender: 'male' | 'female'): { walk: string; surf: string; fish: string; fishSurfing: boolean; fishRight: boolean; blob: string } {
  const look = generation().look;
  if (look === 'hgss') return { ...(gender === 'female' ? { walk: 'hgss/heroine', surf: 'hgss/swimheroine', fish: 'hgss/fish_heroine' } : { walk: 'hgss/hero', surf: 'hgss/swimhero', fish: 'hgss/fish_hero' }), fishSurfing: false, fishRight: true, blob: 'surf_blob' };
  const base = look === 'rse' ? `rse/${gender === 'female' ? 'may' : 'brendan'}` : gender === 'female' ? 'leaf' : 'red';
  return { walk: base, surf: `${base}_surf`, fish: `${base}_fish`, fishSurfing: true, fishRight: false, blob: look === 'rse' ? `${base}_surf_blob` : 'surf_blob' };
}

/**
 * The GBA screens' pictures of the shown run's region (battle, party, shop, town-map: public/idle/<gen>/<kind>/):
 * FireRed's (gen1) or Emerald's (gen3, issue #226, step 5), drawn by the same components.
 */
export const gbaArt = (kind: 'battle' | 'party' | 'shop' | 'town-map') => `/idle/${generation().look === 'rse' ? 'gen3' : 'gen1'}/${kind}`;

/** The shown run's region's Pokémon pictures (front/, back/, shiny/, icon/<id>.png): FireRed's in Kanto, HeartGold's in Johto (tools/idle/hgss_pics.py). */
export const pokemonPics = () => `/idle/gen${generation().gen}/pokemon`;

/** A Pokédex species' front picture (issue #170, step 6): its generation's (dexGen: FireRed's in Kanto for its 151, HeartGold's for the rest and in Johto). */
export const dexPic = (id: number, shiny = false) => `/idle/gen${dexGen(id)}/pokemon/${shiny ? 'shiny/' : ''}front/${id}.png`;
