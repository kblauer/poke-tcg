import { describe, expect, it } from 'vitest';
import { areas } from './areas.js';
import { species } from './data.js';
import { DEX_SIZE, generation, generationOf, inGeneration, perGeneration } from './generation.js';
import { createIdleRun, DEFAULT_IDLE_SETTINGS, simulateSegment, type IdleState } from './idle.js';

describe('generations', () => {
  it('is Kanto by default, and for a run from before generations', () => {
    expect(generation().gen).toBe(1);
    expect(generation().region).toBe('Kanto');
    expect(generationOf({})).toBe(1);
    expect(createIdleRun({ species: 4 }, 1).gen).toBe(1);
    expect(DEX_SIZE).toBe(151);
    expect(species(25).name).toBe('Pikachu');
    expect(areas()[0]!.id).toBe('route-1');
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
