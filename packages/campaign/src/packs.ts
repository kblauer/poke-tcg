// Booster packs, bought with the ₱ in the bank. Each is 11 cards from one set with the generally accepted
// WOTC-era make-up (averaged over the sets, not each set's own odds): 1 rare (holo about 1 pack in 3),
// 3 uncommons and 6 commons, all different (each of those now and then a rare instead: EXTRA_RARE_CHANCES), plus 1 basic Energy: the set's own, or the closest earlier set's, and
// about 1 pack in 50 a holo Energy instead (found only in packs). An EX set's pack has a reverse holo in place of one common
// (agreed with the user). Opening one unlocks its cards.
import { BASIC_ENERGY, EX_SETS, GEN2_SETS, type Rarity } from './pool.js';
import { chance, pick, sample, type Rng } from './random.js';

/** Sets with packs: Gen 1's, Gen 2's (GEN2_SETS) and Gen 3's (EX_SETS: locked until Gen 3's runs exist, agreed). */
export const PACK_SETS = ['base1', 'base2', 'base3', 'basep', 'base4', 'base5', 'gym1', 'gym2', 'lc', ...GEN2_SETS, ...EX_SETS];

/**
 * Stardust, the account's crafting currency, for each card pulled from a pack that the account already had (a new
 * unlock gives none), by its slot (agreed with the user): 50 a common, 100 an uncommon, 300 a rare or holo (a holo
 * Energy too, and a reverse holo, which counts as a holo: agreed); basic Energy gives none.
 */
export const STARDUST_PER_CARD: Record<PackCard['slot'], number> = { common: 50, uncommon: 100, rare: 300, holo: 300, energy: 0, holoEnergy: 300, reverse: 300 };

/** What crafting a card costs in Stardust, by its rarity (agreed with the user): 100 a common or uncommon, 500 a rare or holo. */
export const CRAFT_COST: Record<Rarity, number> = { common: 100, uncommon: 100, rare: 500, holo: 500 };

/** Price of a pack, in banked ₱. */
export const PACK_PRICE = 300;
/** Price of a pack in the Battle Tower's BP Shop, in Battle Points (a placeholder, the user's: packs are its stock for now). */
export const BP_PACK_PRICE = 1;

/** The most packs bought and opened at once. */
export const MAX_PACKS_AT_ONCE = 50;

/** How often the rare is a holo. */
export const HOLO_CHANCE = 1 / 3;

/**
 * The chance each of a pack's other cards (commons and uncommons) has of being a rare or holo instead, by how many such
 * extra rares the pack has so far (agreed with the user): 4%, then 2%, then dropping off sharply. About 31% of packs
 * get at least one extra rare, 2.5% two or more. A promo pack's extras are holo promos (its only rares). Placeholder
 * odds, to balance later.
 */
export const EXTRA_RARE_CHANCES = [0.04, 0.02, 0.005, 0.001];

/** How often a pack is all rares and holos besides its Energy (agreed with the user: 0.6%). The pack screen celebrates it. */
export const ALL_RARES_CHANCE = 0.006;

/** How often the Energy card is a holo Energy (agreed with the user: 4%, 2% until 2026-10-23). */
export const HOLO_ENERGY_CHANCE = 0.04;

export const PACK_COMMONS = 6;
export const PACK_UNCOMMONS = 3;

/** How many different holos a pack of a set made only of holos holds (Southern Islands, all galaxy foil). A placeholder. */
export const HOLO_SET_PACK = 6;

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
  /** The reverse-holo prints (EX sets): one of them takes a common's place in each pack. */
  reverse?: string[];
}

export interface PackCard {
  cardId: string;
  /** The slot it came from: its rarity, basic Energy, (instead, now and then) a holo Energy, or a reverse holo (EX sets). */
  slot: Rarity | 'energy' | 'holoEnergy' | 'reverse';
}

/**
 * The cards in one pack, in the order they're revealed: the basic Energy, the commons, the uncommons,
 * and the rare last. A set without holos (or other rares) uses whichever rares it has. A set of only
 * commons and holos (the Wizards promos, which TCGdex lists as Common) fills the uncommon and rare slots
 * with more commons, and the last card is a holo as often as any pack's. A set of only holos (Southern Islands) gives
 * HOLO_SET_PACK different ones.
 */
export function openPack(set: PackSet, rng: Rng, { forceHoloEnergy = false, forceAllRares = false } = {}): PackCard[] {
  // `forceHoloEnergy`, `forceAllRares`: always a holo Energy, or an all-rares pack (the debug cheats for testing them).
  const energy: PackCard =
    set.holoEnergy?.length && (forceHoloEnergy || chance(rng, HOLO_ENERGY_CHANCE))
      ? { cardId: pick(rng, set.holoEnergy), slot: 'holoEnergy' }
      : { cardId: pick(rng, set.energy?.length ? set.energy : Object.values(BASIC_ENERGY)), slot: 'energy' };
  const commons = (n: number) => sample(rng, set.common, n).map((cardId) => ({ cardId, slot: 'common' as const }));
  const taken = new Set<string>();
  /** A rare not in the pack yet: a holo HOLO_CHANCE of the time (always, for a set with no other rares). Null if none are left. */
  const rareCard = (): PackCard | null => {
    const holos = set.holo.filter((id) => !taken.has(id));
    const rares = set.rare.filter((id) => !taken.has(id));
    if (!holos.length && !rares.length) return null;
    const holo = holos.length > 0 && (rares.length === 0 || chance(rng, HOLO_CHANCE));
    const cardId = pick(rng, holo ? holos : rares);
    taken.add(cardId);
    return { cardId, slot: holo ? 'holo' : 'rare' };
  };
  /** The extra rares the other cards turned into (EXTRA_RARE_CHANCES), revealed with the rare, before it. */
  const extras: PackCard[] = [];
  /** Each card may be a rare instead, less likely the more extras the pack has; the cards that stay. */
  const upgrade = (cards: PackCard[]) =>
    cards.filter((c) => {
      const odds = EXTRA_RARE_CHANCES[extras.length] ?? 0;
      const rare = odds > 0 && chance(rng, odds) ? rareCard() : null;
      if (rare) extras.push(rare);
      return !rare;
    });
  if (!set.common.length && !set.uncommon.length && !set.rare.length) {
    return [energy, ...sample(rng, set.holo, HOLO_SET_PACK).map((cardId) => ({ cardId, slot: 'holo' as const }))];
  }
  // Now and then every card but the Energy is a rare or holo (commons only make up for a set with too few rares).
  if (forceAllRares || chance(rng, ALL_RARES_CHANCE)) {
    const rares = Array.from({ length: PACK_COMMONS + PACK_UNCOMMONS + 1 }, rareCard).filter((c): c is PackCard => c !== null);
    return [energy, ...commons(PACK_COMMONS + PACK_UNCOMMONS + 1 - rares.length), ...rares];
  }
  if (!set.uncommon.length && !set.rare.length) {
    const holo = set.holo.length > 0 && chance(rng, HOLO_CHANCE) ? rareCard() : null;
    const rest = upgrade(commons(PACK_COMMONS + PACK_UNCOMMONS + (holo ? 0 : 1)));
    return [energy, ...rest, ...extras, ...(holo ? [holo] : [])];
  }
  const rare = rareCard()!;
  // EX sets: a reverse holo of any card in the set instead of the last common, revealed just before the rare.
  const reverse: PackCard[] = set.reverse?.length ? [{ cardId: pick(rng, set.reverse), slot: 'reverse' }] : [];
  const rest = upgrade([...commons(PACK_COMMONS - reverse.length), ...sample(rng, set.uncommon, PACK_UNCOMMONS).map((cardId) => ({ cardId, slot: 'uncommon' as const }))]);
  return [energy, ...rest, ...extras, ...reverse, rare];
}
