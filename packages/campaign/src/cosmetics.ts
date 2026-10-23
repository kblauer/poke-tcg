// Cosmetics: card backs (the player's own face-down cards), playmats (the player's side of the table) and coins (every coin
// flip). An account has
// the default of each from the start; the others are bought with banked ₱ on the Cosmetics tab, or unlocked by beating a
// Gym Challenge or Champion run (agreed with the user). Every one is unlocked while debugging. Prices are placeholders.

import type { RunTypeId } from './run-types.js';

export type CosmeticKind = 'cardBack' | 'playmat' | 'coin';

/** How a cosmetic is had: from the start, bought with banked ₱, or by beating a run type. */
export type CosmeticUnlock = { type: 'default' } | { type: 'buy'; price: number } | { type: 'beat'; runType: RunTypeId };

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  unlock: CosmeticUnlock;
}

const BASE_COSMETICS: CosmeticDef[] = [
  // Card backs: the English and Japanese backs, and foiled versions of them (images in the web app's public/cardbacks/).
  { id: 'classic', kind: 'cardBack', name: 'Classic', description: 'The card back since 1999.', unlock: { type: 'default' } },
  { id: 'japanese', kind: 'cardBack', name: 'Japanese', description: "The Japanese cards' back.", unlock: { type: 'buy', price: 1000 } },
  { id: 'shadow', kind: 'cardBack', name: 'Shadow', description: 'The classic back, drained of colour in Team Rocket purple.', unlock: { type: 'buy', price: 1500 } },
  { id: 'cosmos', kind: 'cardBack', name: 'Cosmos', description: 'The classic back with a cosmos holo foil.', unlock: { type: 'beat', runType: 'kantoGyms' } },
  { id: 'ancient', kind: 'cardBack', name: 'Ancient', description: 'The classic back with an ancient-glyph foil.', unlock: { type: 'beat', runType: 'kantoChampion' } },
  { id: 'glitter', kind: 'cardBack', name: 'Glitter', description: 'The Japanese back with a glitter foil.', unlock: { type: 'beat', runType: 'johtoGyms' } },
  { id: 'illusion', kind: 'cardBack', name: 'Illusion', description: 'The Japanese back with a rainbow illusion foil.', unlock: { type: 'beat', runType: 'johtoChampion' } },
  { id: 'maze', kind: 'cardBack', name: 'Maze', description: 'The classic back with a labyrinth foil.', unlock: { type: 'beat', runType: 'hoennGyms' } },
  { id: 'tidal', kind: 'cardBack', name: 'Tidal', description: 'The classic back with a rolling-wave foil.', unlock: { type: 'beat', runType: 'hoennChampion' } },
  // Playmats: faint geometric patterns that answer a click on the table subtly, shifting or lighting their lines and points
  // (agreed: nothing turns or flips; the web app draws them, Playmat.tsx).
  { id: 'plain', kind: 'playmat', name: 'Plain', description: 'The bare table.', unlock: { type: 'default' } },
  { id: 'dots', kind: 'playmat', name: 'Dot matrix', description: 'A grid of dots that scatter from where you click.', unlock: { type: 'buy', price: 1500 } },
  { id: 'squares', kind: 'playmat', name: 'Grid', description: 'Grid lines that light up, their crossings nudged aside, as a wave runs out from where you click.', unlock: { type: 'buy', price: 2000 } },
  { id: 'crosses', kind: 'playmat', name: 'Crosses', description: 'Small crosses that light up and open out as a wave passes them.', unlock: { type: 'buy', price: 1000 } },
  { id: 'diagonals', kind: 'playmat', name: 'Pinstripes', description: 'Fine diagonal lines that bend aside and light up as a wave passes.', unlock: { type: 'buy', price: 1000 } },
  { id: 'contours', kind: 'playmat', name: 'Contours', description: "Wavy lines like a map's contours, bowed apart and lit by a wave from where you click.", unlock: { type: 'beat', runType: 'kantoGyms' } },
  { id: 'hex', kind: 'playmat', name: 'Hexes', description: 'Hexagons: the one you click lights up, and the light runs out along their edges.', unlock: { type: 'beat', runType: 'kantoChampion' } },
  { id: 'constellation', kind: 'playmat', name: 'Constellation', description: 'Scattered stars: the one nearest your click lights up, and the light runs from star to star.', unlock: { type: 'beat', runType: 'johtoGyms' } },
  { id: 'triangles', kind: 'playmat', name: 'Triangles', description: 'A triangle tiling whose lines and corners light up, nudged aside, as a wave passes.', unlock: { type: 'beat', runType: 'johtoChampion' } },
  // Coins: the coin tossed for every coin flip (the web app draws them, coinDesigns.tsx): Poké Balls and Energy for ₱, the
  // rarer balls behind each region's Champion run.
  { id: 'coin-classic', kind: 'coin', name: 'Classic', description: 'Gold heads, silver tails.', unlock: { type: 'default' } },
  { id: 'coin-pokeball', kind: 'coin', name: 'Poké Ball', description: 'A Poké Ball on heads.', unlock: { type: 'buy', price: 1000 } },
  { id: 'coin-greatball', kind: 'coin', name: 'Great Ball', description: 'A Great Ball on heads.', unlock: { type: 'buy', price: 1500 } },
  { id: 'coin-ultraball', kind: 'coin', name: 'Ultra Ball', description: 'An Ultra Ball on heads.', unlock: { type: 'buy', price: 2000 } },
  { id: 'coin-fire', kind: 'coin', name: 'Fire Energy', description: 'The Fire symbol, gleaming on heads.', unlock: { type: 'buy', price: 1000 } },
  { id: 'coin-water', kind: 'coin', name: 'Water Energy', description: 'The Water symbol, gleaming on heads.', unlock: { type: 'buy', price: 1000 } },
  { id: 'coin-grass', kind: 'coin', name: 'Grass Energy', description: 'The Grass symbol, gleaming on heads.', unlock: { type: 'buy', price: 1000 } },
  { id: 'coin-lightning', kind: 'coin', name: 'Lightning Energy', description: 'The Lightning symbol, gleaming on heads.', unlock: { type: 'buy', price: 1000 } },
  { id: 'coin-psychic', kind: 'coin', name: 'Psychic Energy', description: 'The Psychic symbol, gleaming on heads.', unlock: { type: 'buy', price: 1000 } },
  { id: 'coin-masterball', kind: 'coin', name: 'Master Ball', description: 'A Master Ball on heads.', unlock: { type: 'beat', runType: 'kantoChampion' } },
  { id: 'coin-gsball', kind: 'coin', name: 'GS Ball', description: 'The gold and silver GS Ball on heads.', unlock: { type: 'beat', runType: 'johtoChampion' } },
  { id: 'coin-luxuryball', kind: 'coin', name: 'Luxury Ball', description: 'A Luxury Ball on heads.', unlock: { type: 'beat', runType: 'hoennChampion' } },
];

/**
 * Card backs from Pokémon TCG Pocket's card sleeves (the full images from Bulbagarden Archives, tools/cardbacks/; in the web
 * app as public/cardbacks/sleeves/<slug>.webp): most sold for ₱ (the shiny and special ones dearer), two behind each Gym
 * Challenge and Champion run (agreed). Their ids are `sleeve-<slug>`.
 */
const SLEEVES: [slug: string, name: string, unlock: CosmeticUnlock][] = [
  ['acerola', 'Acerola', { type: 'buy', price: 1500 }],
  ['alolan-vulpix', 'Alolan Vulpix', { type: 'buy', price: 1500 }],
  ['arceus', 'Arceus', { type: 'buy', price: 1500 }],
  ['arven', 'Arven', { type: 'buy', price: 1500 }],
  ['blastoise', 'Blastoise', { type: 'beat', runType: 'kantoChampion' }],
  ['charizard', 'Charizard', { type: 'buy', price: 1500 }],
  ['chimchar', 'Chimchar', { type: 'buy', price: 1500 }],
  ['cynthia', 'Cynthia', { type: 'buy', price: 1500 }],
  ['darkrai', 'Darkrai', { type: 'buy', price: 1500 }],
  ['eevee', 'Eevee', { type: 'buy', price: 1500 }],
  ['eevee-ver-2', 'Eevee ver 2', { type: 'buy', price: 1500 }],
  ['erika', 'Erika', { type: 'beat', runType: 'kantoGyms' }],
  ['espeon-umbreon', 'Espeon Umbreon', { type: 'beat', runType: 'johtoGyms' }],
  ['gardevoir', 'Gardevoir', { type: 'buy', price: 1500 }],
  ['gladion', 'Gladion', { type: 'buy', price: 1500 }],
  ['goomy', 'Goomy', { type: 'buy', price: 1500 }],
  ['greninja', 'Greninja', { type: 'buy', price: 1500 }],
  ['ho-oh-lugia', 'Ho-Oh Lugia', { type: 'beat', runType: 'johtoChampion' }],
  ['iono', 'Iono', { type: 'buy', price: 1500 }],
  ['koraidon', 'Koraidon', { type: 'buy', price: 1500 }],
  ['leafeon-glaceon', 'Leafeon Glaceon', { type: 'buy', price: 1500 }],
  ['lillie', 'Lillie', { type: 'buy', price: 1500 }],
  ['lillie-ver-2', 'Lillie ver 2', { type: 'buy', price: 1500 }],
  ['lucario', 'Lucario', { type: 'buy', price: 1500 }],
  ['manaphy', 'Manaphy', { type: 'buy', price: 1500 }],
  ['may', 'May', { type: 'beat', runType: 'hoennGyms' }],
  ['mega-altaria', 'Mega Altaria', { type: 'beat', runType: 'hoennGyms' }],
  ['mega-blaziken', 'Mega Blaziken', { type: 'beat', runType: 'hoennChampion' }],
  ['mega-charizard-y', 'Mega Charizard Y', { type: 'buy', price: 1500 }],
  ['mega-evolution-pokemon', 'Mega Evolution Pokémon', { type: 'buy', price: 2500 }],
  ['mega-gardevoir', 'Mega Gardevoir', { type: 'buy', price: 1500 }],
  ['mega-gyarados', 'Mega Gyarados', { type: 'buy', price: 1500 }],
  ['mega-kangaskhan', 'Mega Kangaskhan', { type: 'buy', price: 1500 }],
  ['mega-lucario', 'Mega Lucario', { type: 'buy', price: 1500 }],
  ['mega-sceptile', 'Mega Sceptile', { type: 'beat', runType: 'hoennChampion' }],
  ['meowth', 'Meowth', { type: 'buy', price: 1500 }],
  ['mewtwo', 'Mewtwo', { type: 'buy', price: 1500 }],
  ['mimikyu', 'Mimikyu', { type: 'buy', price: 1500 }],
  ['miraidon', 'Miraidon', { type: 'buy', price: 1500 }],
  ['morpeko', 'Morpeko', { type: 'buy', price: 1500 }],
  ['mythical-island-mew', 'Mythical Island Mew', { type: 'buy', price: 1500 }],
  ['new-year-with-pikachu', 'New Year with Pikachu', { type: 'buy', price: 1500 }],
  ['pichu', 'Pichu', { type: 'buy', price: 1500 }],
  ['pikachu', 'Pikachu', { type: 'buy', price: 1500 }],
  ['pokemon-30th-celebration-design', 'Pokémon 30th Celebration Design', { type: 'buy', price: 2500 }],
  ['pokemon-of-the-forest', 'Pokémon of the Forest', { type: 'buy', price: 1500 }],
  ['professor-oak', 'Professor Oak', { type: 'buy', price: 1500 }],
  ['psyduck', 'Psyduck', { type: 'buy', price: 1500 }],
  ['quagsire-clodsire', 'Quagsire Clodsire', { type: 'buy', price: 1500 }],
  ['red-pikachu', 'Red Pikachu', { type: 'beat', runType: 'kantoGyms' }],
  ['rowlet', 'Rowlet', { type: 'buy', price: 1500 }],
  ['sableye', 'Sableye', { type: 'buy', price: 1500 }],
  ['serena', 'Serena', { type: 'buy', price: 1500 }],
  ['shiny-charizard', 'Shiny Charizard', { type: 'buy', price: 2500 }],
  ['shiny-mega-gengar', 'Shiny Mega Gengar', { type: 'buy', price: 2500 }],
  ['shiny-mewtwo', 'Shiny Mewtwo', { type: 'beat', runType: 'kantoChampion' }],
  ['solgaleo', 'Solgaleo', { type: 'buy', price: 1500 }],
  ['special-set-01', 'Special Set 01', { type: 'buy', price: 2500 }],
  ['special-set-02', 'Special Set 02', { type: 'buy', price: 2500 }],
  ['sprigatito', 'Sprigatito', { type: 'buy', price: 1500 }],
  ['street-party', 'Street Party', { type: 'buy', price: 1500 }],
  ['suicune', 'Suicune', { type: 'beat', runType: 'johtoGyms' }],
  ['sylveon', 'Sylveon', { type: 'buy', price: 1500 }],
  ['toxtricity', 'Toxtricity', { type: 'buy', price: 1500 }],
  ['tyranitar', 'Tyranitar', { type: 'beat', runType: 'johtoChampion' }],
  ['ultra-necrozma', 'Ultra Necrozma', { type: 'buy', price: 1500 }],
  ['venusaur', 'Venusaur', { type: 'buy', price: 1500 }],
  ['zoroark', 'Zoroark', { type: 'buy', price: 1500 }],
];

const COSMETIC_LIST: CosmeticDef[] = [
  ...BASE_COSMETICS,
  ...SLEEVES.map(([slug, name, unlock]): CosmeticDef => ({ id: `sleeve-${slug}`, kind: 'cardBack', name, description: 'A Pokémon TCG Pocket card sleeve.', unlock })),
];

export const COSMETICS: Record<string, CosmeticDef> = Object.fromEntries(COSMETIC_LIST.map((c) => [c.id, c]));
export const COSMETIC_IDS = COSMETIC_LIST.map((c) => c.id);

/** The cosmetic of each kind every account has from the start, used when none is picked. */
export const DEFAULT_COSMETIC: Record<CosmeticKind, string> = { cardBack: 'classic', playmat: 'plain', coin: 'coin-classic' };

/**
 * Whether an account has a cosmetic: the defaults always, a bought one once it's bought (`bought`, its CosmeticUnlock rows),
 * a run type's once that run type has been beaten (`beaten`), and every one while debugging (`debug`).
 */
export function hasCosmetic(def: CosmeticDef, account: { bought: Set<string>; beaten: Set<string>; debug: boolean }): boolean {
  if (account.debug) return true;
  switch (def.unlock.type) {
    case 'default':
      return true;
    case 'buy':
      return account.bought.has(def.id);
    case 'beat':
      return account.beaten.has(def.unlock.runType);
  }
}
