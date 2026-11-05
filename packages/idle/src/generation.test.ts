import { describe, expect, it } from 'vitest';
import { areas } from './areas.js';
import { dexGen, dexSpecies, species } from './data.js';
import { allGenerations, DEX_SIZE, generation, generationOf, inGeneration, perGeneration } from './generation.js';
import { createIdleRun, DEFAULT_IDLE_SETTINGS, simulateSegment, type IdleState } from './idle.js';

describe('generations', () => {
  it('is Kanto by default, and for a run from before generations', () => {
    expect(generation().gen).toBe(1);
    expect(generation().region).toBe('Kanto');
    expect(generationOf({})).toBe(1);
    expect(createIdleRun({ species: 4 }, 1).gen).toBe(1);
    expect(DEX_SIZE).toBe(Math.max(...allGenerations().map((g) => g.species.length)));
    expect(species(25).name).toBe('Pikachu');
    expect(areas()[0]!.id).toBe('route-1');
  });

  it("reads the account Pokédex's every species (issue #170, step 6) from the shown region's tables where it has it, else Johto's", () => {
    expect([dexGen(25), dexGen(152), dexGen(493)]).toEqual([1, 2, 2]);
    expect(dexSpecies(493).name).toBe('Arceus');
    expect(dexSpecies(25)).toBe(species(25));
    inGeneration(2, () => {
      expect(dexGen(25)).toBe(2);
      expect(dexSpecies(25)).toBe(species(25));
    });
    expect(() => dexGen(DEX_SIZE + 1)).toThrow();
  });

  it('restores the outer generation, even when the inner call throws', () => {
    expect(() =>
      inGeneration(1, () => {
        throw new Error('inside');
      }),
    ).toThrow('inside');
    expect(generation().gen).toBe(1);
    expect(inGeneration(undefined, () => generation().gen)).toBe(1);
  });

  it("reads Johto's tables inside its generation", () => {
    expect(inGeneration(2, () => [generation().region, generation().battleRules, species(152).name])).toEqual(['Johto', 4, 'Chikorita']);
    expect(generation().region).toBe('Kanto');
    expect(() => species(152)).toThrow();
  });

  it('works a per-generation value out once', () => {
    let made = 0;
    const value = perGeneration((g) => ({ region: g.region, made: ++made }));
    expect(value()).toBe(value());
    expect(value().region).toBe('Kanto');
    expect(made).toBe(1);
  });

  it('plays a run with no generation as a Kanto one', () => {
    const run = createIdleRun({ species: 7 }, 42);
    const { gen: _, ...old } = run;
    let a: IdleState = run;
    let b = old as IdleState;
    for (let i = 0; i < 20; i++) {
      const na = simulateSegment(a, DEFAULT_IDLE_SETTINGS, new Set());
      const nb = simulateSegment(b, DEFAULT_IDLE_SETTINGS, new Set());
      expect(nb?.segment).toEqual(na?.segment);
      if (!na || !nb) break;
      a = na.state;
      b = nb.state;
    }
  });
});
