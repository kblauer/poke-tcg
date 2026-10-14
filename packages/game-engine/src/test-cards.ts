// Card fixtures for engine tests (not exported from the package).
import type { CardLibrary } from './cards.js';

export const TEST_CARDS: CardLibrary = {
  charmander: { id: 'charmander', kind: 'pokemon', name: 'Charmander', imageUrl: null, type: 'fire', hp: 50, stage: 'basic', evolvesFrom: null, attacks: [{ name: 'Scratch', cost: ['colorless'], damage: 10, text: null }] },
  charmeleon: { id: 'charmeleon', kind: 'pokemon', name: 'Charmeleon', imageUrl: null, type: 'fire', hp: 80, stage: 'stage1', evolvesFrom: 'Charmander', attacks: [{ name: 'Slash', cost: ['colorless', 'colorless'], damage: 30, text: null }] },
  squirtle: { id: 'squirtle', kind: 'pokemon', name: 'Squirtle', imageUrl: null, type: 'water', hp: 40, stage: 'basic', evolvesFrom: null, attacks: [{ name: 'Bubble', cost: ['water'], damage: 20, text: null }] },
  'fire-energy': { id: 'fire-energy', kind: 'energy', name: 'Fire Energy', imageUrl: null, energyType: 'fire' },
  'water-energy': { id: 'water-energy', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: 'water' },
};

/** 30-card mono-type deck. */
export function testDeck(type: 'fire' | 'water'): string[] {
  const pokemon = type === 'fire' ? ['charmander', 'charmander', 'charmander', 'charmander', 'charmeleon', 'charmeleon'] : Array<string>(6).fill('squirtle');
  return [...pokemon, ...Array<string>(24).fill(`${type}-energy`)];
}
