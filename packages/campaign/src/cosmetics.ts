// Cosmetics: card backs (the player's own face-down cards), mats (the table under the cards), playmats (the table's click
// overlays) and coins (every coin flip). An account has
// the default of each from the start; the others are bought with banked ₱ on the Cosmetics tab, or unlocked by beating a
// Gym Challenge or Champion run (agreed with the user). Every one is unlocked while debugging. Prices are placeholders.

import type { RunTypeId } from './run-types.js';

/** `playmat` is the click overlays' kind (its id kept from before mats, saved in User.playmat and Deck.playmat). */
export type CosmeticKind = 'cardBack' | 'mat' | 'playmat' | 'coin';

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
  { id: 'pearl', kind: 'cardBack', name: 'Pearl', description: 'The classic back with a pearlescent sheen.', unlock: { type: 'beat', runType: 'sinnohGyms' } },
  { id: 'diamond', kind: 'cardBack', name: 'Diamond', description: 'The classic back with a diamond-cut sparkle foil.', unlock: { type: 'beat', runType: 'sinnohChampion' } },
  // Mats (the user's, 2026-11-06, after Pokémon TCG Live's): the table under the cards, the whole table (both sides) on a
  // big screen and the whole battle screen on a phone, drawn by the web app (TypeMat.tsx, utils/typeMats.ts).
  { id: 'mat-plain', kind: 'mat', name: 'Bare table', description: 'The table as it is.', unlock: { type: 'default' } },
  // The games' own looks (the user's, 2026-11-06): made-up scenes from FireRed/LeafGreen's and Diamond/Pearl's tiles (tools/mats/),
  // each taking on the type of the player's Active Pokémon (the drawn Elemental mat removed, the user's, 2026-11-07).
  {
    id: 'mat-frlg',
    kind: 'mat',
    name: 'FireRed & LeafGreen',
    description: "Takes on your Active Pokémon's type, in FireRed and LeafGreen's tiles: a sandy island in the sea for Water, a rocky island in lava for Fire, a field ringed by flowers for Grass, a stormy mountain for Lightning, Mt. Pyre for Psychic, Victory Road for Fighting, Unown ruins for Darkness, a cycling bridge for Metal, a department store for Colorless.",
    unlock: { type: 'buy', price: 3000 },
  },
  {
    id: 'mat-dp',
    kind: 'mat',
    name: 'Diamond & Pearl',
    description: "Takes on your Active Pokémon's type, in Diamond and Pearl's look: Route 222's sand in the sea for Water, Stark Mountain's rock in its magma for Fire, a field in Floaroma's flowers for Grass, a stormy mountain with Sunyshore's lighthouses for Lightning, Celestic Town's shrine for Psychic, Victory Road for Fighting, the Solaceon Ruins for Darkness, the Cycling Road for Metal, Veilstone Department Store for Colorless.",
    unlock: { type: 'buy', price: 3000 },
  },
  // Places (the user's, 2026-11-07): each a mat of its own, a real place as the games draw it, the same scene whatever the
  // type (tools/mats/frlg_places.py).
  {
    id: 'mat-mt-chimney',
    kind: 'mat',
    name: 'Mt. Chimney',
    description: "Emerald's Mt. Chimney: its lava crater at the top, the summit's rocky floor round the cards.",
    unlock: { type: 'buy', price: 3000 },
  },
  {
    id: 'mat-vermilion-city',
    kind: 'mat',
    name: 'Vermilion City',
    description: "FireRed's Vermilion harbour: the pier and its lighthouses, the dock running down to the S.S. Anne.",
    unlock: { type: 'buy', price: 3000 },
  },
  {
    id: 'mat-viridian-forest',
    kind: 'mat',
    name: 'Viridian Forest',
    description: "FireRed's Viridian Forest at its south end: the path winding up through its tall grass and trees.",
    unlock: { type: 'buy', price: 3000 },
  },
  {
    id: 'mat-pretty-petal-flower-shop',
    kind: 'mat',
    name: 'Pretty Petal Flower Shop',
    description: "Emerald's flower shop on Route 104, its planters, shelves and counter just as the game lays them out.",
    unlock: { type: 'buy', price: 3000 },
  },
  // Playmats (the overlays): faint geometric patterns that answer a click on the table subtly, shifting or lighting their lines and points
  // (agreed: nothing turns or flips; the web app draws them, Playmat.tsx).
  { id: 'plain', kind: 'playmat', name: 'None', description: 'Nothing happens when you click the table.', unlock: { type: 'default' } },
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
  { id: 'coin-duskball', kind: 'coin', name: 'Dusk Ball', description: 'A Dusk Ball on heads.', unlock: { type: 'beat', runType: 'sinnohChampion' } },
];

/**
 * Card backs from Pokémon TCG Pocket's card sleeves (the full images from Bulbagarden Archives, tools/cardbacks/; in the web
 * app as public/cardbacks/sleeves/<slug>.webp): most sold for ₱ (the shiny and special ones dearer), two behind each Gym
 * Challenge and Champion run (agreed). Their ids are `sleeve-<slug>`.
 */
const SLEEVES: [slug: string, name: string, unlock: CosmeticUnlock][] = [
  ['acerola', 'Acerola', { type: 'buy', price: 1500 }],
  ['alolan-vulpix', 'Alolan Vulpix', { type: 'buy', price: 1500 }],
  ['arceus', 'Arceus', { type: 'beat', runType: 'sinnohChampion' }],
  ['arven', 'Arven', { type: 'buy', price: 1500 }],
  ['blastoise', 'Blastoise', { type: 'beat', runType: 'kantoChampion' }],
  ['charizard', 'Charizard', { type: 'buy', price: 1500 }],
  ['chimchar', 'Chimchar', { type: 'beat', runType: 'sinnohGyms' }],
  ['cynthia', 'Cynthia', { type: 'beat', runType: 'sinnohChampion' }],
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
  ['lucario', 'Lucario', { type: 'beat', runType: 'sinnohGyms' }],
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
export const DEFAULT_COSMETIC: Record<CosmeticKind, string> = { cardBack: 'classic', mat: 'mat-plain', playmat: 'plain', coin: 'coin-classic' };

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
