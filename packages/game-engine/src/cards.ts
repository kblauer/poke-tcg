export type EnergyType =
  | 'grass'
  | 'fire'
  | 'water'
  | 'lightning'
  | 'psychic'
  | 'fighting'
  | 'darkness'
  | 'metal'
  | 'colorless';

export type Stage = 'basic' | 'stage1' | 'stage2';

export interface Attack {
  name: string;
  /** 'colorless' in a cost can be paid by any energy. */
  cost: EnergyType[];
  /** Base damage: the number in printed values like "30+" or "20×"; effects work out the rest. */
  damage: number;
  /** Printed damage, e.g. "30+", "20×" or "?" (missing in older games). */
  damageText?: string | null;
  /** Printed attack text. Not implemented by the engine yet – shown for reference only. */
  text: string | null;
}

export interface PokemonCardDef {
  id: string;
  kind: 'pokemon';
  name: string;
  imageUrl: string | null;
  type: EnergyType;
  hp: number;
  stage: Stage;
  /** Name of the Pokémon this evolves from (null for Basics). */
  evolvesFrom: string | null;
  attacks: Attack[];
  /** Takes `multiplier`× damage from attackers of this type. Missing in games created before it was stored. */
  weakness?: { type: EnergyType; multiplier: number } | null;
  /** Takes `amount` less damage from attackers of this type. Missing in games created before it was stored. */
  resistance?: { type: EnergyType; amount: number } | null;
  /** Pokémon Power printed on the card, if any (the effect lives in the engine's effects/). */
  power?: { name: string; text: string } | null;
  /** Energy to discard to retreat (any type). Missing in games created before it was stored: treated as 0. */
  retreatCost?: number;
  /** Printed as a holofoil. Display only. */
  holo?: boolean;
}

export interface EnergyCardDef {
  id: string;
  kind: 'energy';
  name: string;
  imageUrl: string | null;
  energyType: Exclude<EnergyType, 'colorless'>;
  /** Printed as a holofoil. Display only. */
  holo?: boolean;
}

export type CardDef = PokemonCardDef | EnergyCardDef;

/** Card definitions by id. Built from the database and stored in each game's state. */
export type CardLibrary = Record<string, CardDef>;

export function lookupCard(cards: CardLibrary, defId: string): CardDef {
  const def = cards[defId];
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return def;
}

export const isBasicPokemon = (def: CardDef): def is PokemonCardDef & { stage: 'basic' } =>
  def.kind === 'pokemon' && def.stage === 'basic';
