// The cards a run can use: every card the engine plays fully (cardImplemented), from the sets whose
// effects are done. The API builds it from the catalog (apps/api/src/pool.ts); here it's just data.
import { isBasicEnergy, type CardDef, type EnergyType } from '@poke-tcg/game-engine';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'holo';

export interface PoolCard {
  def: CardDef;
  rarity: Rarity;
}

/** Sets whose card effects the engine has (Base Set, Jungle, Fossil, Wizards promos, Base Set 2, Team Rocket, Gym Heroes). */
export const POOL_SETS = ['base1', 'base2', 'base3', 'basep', 'base4', 'base5', 'gym1'];

/** Basic Energy card ids (Base Set printings) by type, and Double Colorless Energy. */
export const BASIC_ENERGY: Partial<Record<EnergyType, string>> = {
  grass: 'base1-99',
  fire: 'base1-98',
  water: 'base1-102',
  lightning: 'base1-100',
  psychic: 'base1-101',
  fighting: 'base1-97',
};
export const DOUBLE_COLORLESS = 'base1-96';

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
