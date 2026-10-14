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
  /** Base damage. Modifiers like "30+" or "20×" are reduced to the number for now. */
  damage: number;
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
}

export interface EnergyCardDef {
  id: string;
  kind: 'energy';
  name: string;
  imageUrl: string | null;
  energyType: Exclude<EnergyType, 'colorless'>;
}

export type CardDef = PokemonCardDef | EnergyCardDef;

/** Card definitions by id. Built from the database and stored in each game's state. */
export type CardLibrary = Record<string, CardDef>;

export function lookupCard(cards: CardLibrary, defId: string): CardDef {
  const def = cards[defId];
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return def;
}

export const isBasicPokemon = (def: CardDef): def is PokemonCardDef => def.kind === 'pokemon' && def.stage === 'basic';
