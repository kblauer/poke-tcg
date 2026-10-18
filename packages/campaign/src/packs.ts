// Booster packs, bought with the ₱ in the bank. Each is 11 cards from one set with the generally accepted
// WOTC-era make-up (averaged over the sets, not each set's own odds): 1 rare (holo about 1 pack in 3),
// 3 uncommons and 6 commons, all different, plus 1 basic Energy: the set's own, or the closest earlier set's, and
// about 1 pack in 50 a holo Energy instead (found only in packs). Opening one unlocks its cards.
import { BASIC_ENERGY, type Rarity } from './pool.js';
import { chance, pick, sample, type Rng } from './random.js';

/** Sets with packs: the ones whose card effects the engine has. */
export const PACK_SETS = ['base1', 'base2', 'base3', 'basep', 'base4', 'base5'];

/** Price of a pack, in banked ₱. */
export const PACK_PRICE = 300;

/** The most packs bought and opened at once. */
export const MAX_PACKS_AT_ONCE = 50;

/** How often the rare is a holo. */
export const HOLO_CHANCE = 1 / 3;

/** How often the Energy card is a holo Energy (agreed with the user: 2%). */
export const HOLO_ENERGY_CHANCE = 0.02;

export const PACK_COMMONS = 6;
export const PACK_UNCOMMONS = 3;

/**
 * A set's cards by rarity (holos apart from other rares), for packs. Basic Energy isn't among them: `energy` is the
 * basic Energy its packs give (the set's own, or the closest earlier set's; missing: any type of BASIC_ENERGY), and
 * `holoEnergy` the holo versions of those (every type and style).
 */
export interface PackSet {
  common: string[];
  uncommon: string[];
  rare: string[];
  holo: string[];
  energy?: string[];
  holoEnergy?: string[];
}

export interface PackCard {
  cardId: string;
  /** The slot it came from: its rarity, basic Energy, or (instead, now and then) a holo Energy. */
  slot: Rarity | 'energy' | 'holoEnergy';
}

/**
 * The cards in one pack, in the order they're revealed: the basic Energy, the commons, the uncommons,
 * and the rare last. A set without holos (or other rares) uses whichever rares it has. A set of only
 * commons and holos (the Wizards promos, which TCGdex lists as Common) fills the uncommon and rare slots
 * with more commons, and the last card is a holo as often as any pack's.
 */
export function openPack(set: PackSet, rng: Rng, { forceHoloEnergy = false } = {}): PackCard[] {
  // `forceHoloEnergy`: always a holo Energy (the debug cheat for testing them).
  const energy: PackCard =
    set.holoEnergy?.length && (forceHoloEnergy || chance(rng, HOLO_ENERGY_CHANCE))
      ? { cardId: pick(rng, set.holoEnergy), slot: 'holoEnergy' }
      : { cardId: pick(rng, set.energy?.length ? set.energy : Object.values(BASIC_ENERGY)), slot: 'energy' };
  const commons = (n: number) => sample(rng, set.common, n).map((cardId) => ({ cardId, slot: 'common' as const }));
  if (!set.uncommon.length && !set.rare.length) {
    const holo = set.holo.length > 0 && chance(rng, HOLO_CHANCE);
    const last: PackCard[] = holo ? [{ cardId: pick(rng, set.holo), slot: 'holo' }] : [];
    return [energy, ...commons(PACK_COMMONS + PACK_UNCOMMONS + (holo ? 0 : 1)), ...last];
  }
  const holo = set.holo.length > 0 && (set.rare.length === 0 || chance(rng, HOLO_CHANCE));
  const rare = pick(rng, holo ? set.holo : set.rare);
  return [
    energy,
    ...commons(PACK_COMMONS),
    ...sample(rng, set.uncommon, PACK_UNCOMMONS).map((cardId) => ({ cardId, slot: 'uncommon' as const })),
    { cardId: rare, slot: holo ? 'holo' : 'rare' },
  ];
}
