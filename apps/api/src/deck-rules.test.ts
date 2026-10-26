// The Black & White series' ACE SPEC rule (README: Generation 5): a deck may hold only 1 ACE SPEC card, whatever its name,
// as the API's deck rules see a catalog row (ruleCard, from the campaign's isAceSpec).
import { isAceSpec } from '@poke-tcg/campaign';
import { deckProblems, type DeckRuleCard } from '@poke-tcg/shared';
import { describe, expect, it } from 'vitest';
import { ruleCard } from './routers/decks.js';

const trainer = (id: string, name: string) => ({ card: ruleCard({ name, kind: 'TRAINER', stage: null, data: {} }, id), quantity: 1 });
const basics: { card: DeckRuleCard; quantity: number } = { card: { name: 'Pikachu', kind: 'POKEMON', stage: 'Basic', basicEnergy: false }, quantity: 4 };
const energy: { card: DeckRuleCard; quantity: number } = { card: { name: 'Lightning Energy', kind: 'ENERGY', stage: null, basicEnergy: true }, quantity: 54 };

describe('ACE SPEC cards', () => {
  it('are the printed ones, reverse prints too', () => {
    expect(isAceSpec('bw7-137')).toBe(true); // Computer Search
    expect(isAceSpec('bw7-137-reverse')).toBe(true);
    expect(isAceSpec('bw9-108')).toBe(true); // Rock Guard
    expect(isAceSpec('base1-71')).toBe(false); // Base Set's Computer Search
  });

  it('a deck may hold 1, whatever its name', () => {
    expect(deckProblems([basics, { ...energy, quantity: 55 }, trainer('bw7-137', 'Computer Search')])).toEqual([]);
    expect(deckProblems([basics, energy, trainer('bw7-137', 'Computer Search'), trainer('bw8-128', 'Dowsing Machine')])).toContain('2 ACE SPEC cards: at most 1, whatever its name.');
  });
});
