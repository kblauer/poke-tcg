import { EFFECTS } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { at, emit, LOOKS, MOMENT_MS } from './flairEffects';

describe('flair effects', () => {
  it('every effect has a look', () => {
    for (const e of EFFECTS) expect(LOOKS[e.key], e.key).toBeDefined();
  });

  it("every moment's particles are born and gone within the moment", () => {
    for (const [key, look] of Object.entries(LOOKS))
      for (const moment of ['play', 'attack', 'evolve', 'ko'] as const) {
        const particles = emit(look, moment, 88 / 63, 7);
        expect(particles.length, `${key} ${moment}`).toBeGreaterThan(0);
        for (const p of particles) expect(p.born + p.life, `${key} ${moment}`).toBeLessThanOrEqual(MOMENT_MS[moment] / 1000 + 1e-9);
      }
  });

  it('a particle is drawn only while it lives, fading out at the end', () => {
    const [p] = emit(LOOKS.embers!, 'play', 1.4, 1);
    expect(at(p!, LOOKS.embers!, p!.born - 0.01)).toBeNull();
    expect(at(p!, LOOKS.embers!, p!.born + p!.life + 0.01)).toBeNull();
    expect(at(p!, LOOKS.embers!, p!.born + p!.life * 0.3)!.alpha).toBe(1);
    expect(at(p!, LOOKS.embers!, p!.born + p!.life * 0.95)!.alpha).toBeLessThan(0.2);
  });
});
