// Booster packs, bought with the ₱ in the bank. Each is 11 cards from one set with the generally accepted
// WOTC-era make-up (averaged over the sets, not each set's own odds): 1 rare (holo about 1 pack in 3),
// 3 uncommons and 6 commons, all different, plus 1 basic Energy. Opening one unlocks its cards.
import { BASIC_ENERGY, type Rarity } from './pool.js';
import { chance, pick, sample, type Rng } from './random.js';

/** Sets with packs: the ones whose card effects the engine has. */
export const PACK_SETS = ['base1', 'base2', 'base3'];

/** Price of a pack, in banked ₱. */
export const PACK_PRICE = 300;

/** How often the rare is a holo. */
export const HOLO_CHANCE = 1 / 3;

export const PACK_COMMONS = 6;
export const PACK_UNCOMMONS = 3;

/** A set's cards by rarity (holos apart from other rares), for packs. Basic Energy isn't among them. */
export interface PackSet {
  common: string[];
  uncommon: string[];
  rare: string[];
  holo: string[];
}

export interface PackCard {
  cardId: string;
  /** The slot it came from: its rarity, or basic Energy. */
  slot: Rarity | 'energy';
}

/**
 * The cards in one pack, in the order they're revealed: the basic Energy, the commons, the uncommons,
 * and the rare last. A set without holos (or other rares) uses whichever rares it has.
 */
export function openPack(set: PackSet, rng: Rng): PackCard[] {
  const holo = set.holo.length > 0 && (set.rare.length === 0 || chance(rng, HOLO_CHANCE));
  const rare = pick(rng, holo ? set.holo : set.rare);
  return [
    { cardId: pick(rng, Object.values(BASIC_ENERGY)), slot: 'energy' },
    ...sample(rng, set.common, PACK_COMMONS).map((cardId) => ({ cardId, slot: 'common' as const })),
    ...sample(rng, set.uncommon, PACK_UNCOMMONS).map((cardId) => ({ cardId, slot: 'uncommon' as const })),
    { cardId: rare, slot: holo ? 'holo' : 'rare' },
  ];
}
