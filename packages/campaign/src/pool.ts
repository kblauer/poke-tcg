// The cards a run can use: every card the engine plays fully (cardImplemented), from the sets whose
// effects are done. The API builds it from the catalog (apps/api/src/pool.ts); here it's just data.
import { isBasicEnergy, type CardDef, type EnergyType } from '@poke-tcg/game-engine';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'holo';

export interface PoolCard {
  def: CardDef;
  rarity: Rarity;
}

/** Gen 1 runs' sets, whose card effects the engine has (Base Set, Jungle, Fossil, Wizards promos, Base Set 2, Team Rocket, Gym Heroes, Gym Challenge, Legendary Collection). */
export const POOL_SETS = ['base1', 'base2', 'base3', 'basep', 'base4', 'base5', 'gym1', 'gym2', 'lc'];

/**
 * Gen 2 runs' sets (agreed with the user): Neo Genesis to Skyridge, with Southern Islands but not Legendary Collection
 * (its Gen 1 reprints, in Gen 1's: agreed). Every one's card effects are done (GEN2_DONE_SETS, Generation `implementedSets`).
 */
export const GEN2_SETS = ['neo1', 'neo2', 'si1', 'neo3', 'neo4', 'ecard1', 'ecard2', 'ecard3'];

/** Generation 3's EX sets, EX Ruby & Sapphire to EX Power Keepers, in release order: Gen 3 (Hoenn) runs' sets and packs. */
export const EX_SETS = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8', 'ex9', 'ex10', 'ex11', 'ex12', 'ex13', 'ex14', 'ex15', 'ex16'];

/** Gen 3 runs' sets: the EX sets, every one's card effects done (Gen 3 runs take the cards the engine plays fully). */
export const GEN3_SETS = EX_SETS;
export const GEN3_DONE_SETS = EX_SETS;

/**
 * Generation 4's sets (Sinnoh), in release order: the Diamond & Pearl series with its Black Star Promos, and the Platinum
 * series (asked for 2026-10-24, on the `gen-4-packs` branch). In the card snapshot; not yet in any pool or pack: their
 * card effects are to come, and their packs unlock with Gen 4 runs, which are to come too (the user's).
 */
export const GEN4_SETS = ['dp1', 'dpp', 'dp2', 'dp3', 'dp4', 'dp5', 'dp6', 'dp7', 'pl1', 'pl2', 'pl3', 'pl4'];

/**
 * The HeartGold & SoulSilver series and Call of Legends, in release order: Gen 2's (Johto's) sets, each game in its
 * region's generation (the user's). In the card snapshot; they join GEN2_SETS once their card effects are done.
 */
export const HGSS_SETS = ['hgss1', 'hgssp', 'hgss2', 'hgss3', 'hgss4', 'col1'];

/** The Gen 2 sets whose card effects the engine has (every one of them now): Gen 2 runs take only the cards it plays fully from these. */
export const GEN2_DONE_SETS = GEN2_SETS;

/** Basic Energy card ids (Base Set printings) by type, and Double Colorless Energy: Gen 1's. */
export const BASIC_ENERGY: Partial<Record<EnergyType, string>> = {
  grass: 'base1-99',
  fire: 'base1-98',
  water: 'base1-102',
  lightning: 'base1-100',
  psychic: 'base1-101',
  fighting: 'base1-97',
};
export const DOUBLE_COLORLESS = 'base1-96';

/** Gen 2's basic Energy (Neo Genesis printings). Gen 2 has no Double Colorless. */
export const GEN2_BASIC_ENERGY: Partial<Record<EnergyType, string>> = {
  grass: 'neo1-108',
  fire: 'neo1-107',
  water: 'neo1-111',
  lightning: 'neo1-109',
  psychic: 'neo1-110',
  fighting: 'neo1-106',
};

/** Gen 3's basic Energy (EX Ruby & Sapphire printings). Gen 3 has no Double Colorless. */
export const GEN3_BASIC_ENERGY: Partial<Record<EnergyType, string>> = {
  grass: 'ex1-104',
  fire: 'ex1-108',
  water: 'ex1-106',
  lightning: 'ex1-109',
  psychic: 'ex1-107',
  fighting: 'ex1-105',
};

/** Types with a basic Energy card, the ones decks are built around. */
export const DECK_TYPES = Object.keys(BASIC_ENERGY) as EnergyType[];

/** Card shop prices in ₱. */
export const PRICES: Record<Rarity, number> = { common: 40, uncommon: 80, rare: 150, holo: 250 };

/** How often each rarity comes up when a card is offered (gifts, rewards, shops, trades). */
const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, uncommon: 6, rare: 3, holo: 1 };

export const rarityWeight = (c: PoolCard) => RARITY_WEIGHT[c.rarity];

/** Cards worth offering: Pokémon, Trainers and Double Colorless, not basic Energy. */
export const offerable = (pool: readonly PoolCard[]) => pool.filter((c) => !isBasicEnergy(c.def));

export const byId = (pool: readonly PoolCard[]) => new Map(pool.map((c) => [c.def.id, c]));

/** Card names compared without accents, spaces or case ('Pokémon Center' = 'pokemoncenter'). */
export const nameKey = (name: string) => name.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
