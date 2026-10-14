export type EnergyType = 'fire' | 'water' | 'grass' | 'lightning' | 'colorless';

export interface Attack {
  name: string;
  /** 'colorless' in a cost can be paid by any energy. */
  cost: EnergyType[];
  damage: number;
}

export interface PokemonCardDef {
  id: string;
  kind: 'pokemon';
  name: string;
  type: EnergyType;
  hp: number;
  attacks: Attack[];
}

export interface EnergyCardDef {
  id: string;
  kind: 'energy';
  name: string;
  energyType: Exclude<EnergyType, 'colorless'>;
}

export type CardDef = PokemonCardDef | EnergyCardDef;

// Placeholder card pool. Replace with data seeded from the database
// (packages/db) once real card effects are implemented.
const defs: CardDef[] = [
  { id: 'charmander', kind: 'pokemon', name: 'Charmander', type: 'fire', hp: 70, attacks: [{ name: 'Ember', cost: ['fire', 'colorless'], damage: 30 }] },
  { id: 'squirtle', kind: 'pokemon', name: 'Squirtle', type: 'water', hp: 60, attacks: [{ name: 'Bubble', cost: ['water'], damage: 20 }] },
  { id: 'bulbasaur', kind: 'pokemon', name: 'Bulbasaur', type: 'grass', hp: 70, attacks: [{ name: 'Vine Whip', cost: ['grass', 'colorless'], damage: 30 }] },
  { id: 'pikachu', kind: 'pokemon', name: 'Pikachu', type: 'lightning', hp: 60, attacks: [{ name: 'Thunder Shock', cost: ['lightning'], damage: 20 }] },
  { id: 'fire-energy', kind: 'energy', name: 'Fire Energy', energyType: 'fire' },
  { id: 'water-energy', kind: 'energy', name: 'Water Energy', energyType: 'water' },
  { id: 'grass-energy', kind: 'energy', name: 'Grass Energy', energyType: 'grass' },
  { id: 'lightning-energy', kind: 'energy', name: 'Lightning Energy', energyType: 'lightning' },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function getCard(defId: string): CardDef {
  const def = CARDS[defId];
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return def;
}

const STARTERS = {
  fire: ['charmander', 'fire-energy'],
  water: ['squirtle', 'water-energy'],
  grass: ['bulbasaur', 'grass-energy'],
  lightning: ['pikachu', 'lightning-energy'],
} as const;

export type StarterDeck = keyof typeof STARTERS;

/** 60-card mono-type deck: 20 Pokémon + 40 energy. */
export function starterDeck(type: StarterDeck): string[] {
  const [pokemon, energy] = STARTERS[type];
  return [...Array<string>(20).fill(pokemon), ...Array<string>(40).fill(energy)];
}
