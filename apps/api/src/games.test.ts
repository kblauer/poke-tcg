import type { CardLibrary, GameState } from '@poke-tcg/game-engine';
import { describe, expect, it, vi } from 'vitest';

// The catalog isn't read in a test: a definition for any id asked for stands in.
vi.mock('./cards.js', () => ({
  loadCardLibrary: async (ids: string[]): Promise<CardLibrary> => Object.fromEntries(ids.map((id) => [id, { id, kind: 'trainer', name: id }])) as unknown as CardLibrary,
}));

const { restoreState, storedState } = await import('./games.js');

const library = { 'base1-1': { id: 'base1-1' }, 'base1-2': { id: 'base1-2' } } as unknown as CardLibrary;
const state = { version: 3, phase: 'main', cards: library, players: {} } as unknown as GameState;

describe("a game's saved state", () => {
  it("holds the library's card ids in place of the library", () => {
    const stored = storedState(state);
    expect(stored).not.toHaveProperty('cards');
    expect(stored.libraryIds).toEqual(['base1-1', 'base1-2']);
    expect(stored.version).toBe(3);
    // The state given is left as it was.
    expect(state.cards).toBe(library);
  });

  it('is restored with its library built from the catalog again', async () => {
    const restored = await restoreState(storedState(state));
    expect(restored).not.toHaveProperty('libraryIds');
    expect(Object.keys(restored.cards)).toEqual(['base1-1', 'base1-2']);
    expect(restored.cards['base1-2']).toMatchObject({ id: 'base1-2', name: 'base1-2' });
    expect(restored.version).toBe(3);
  });

  it('is read as it is when it was saved with its library (games saved before)', async () => {
    const restored = await restoreState({ ...state });
    expect(restored.cards).toBe(library);
  });
});
