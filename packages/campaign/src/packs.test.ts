import { describe, expect, it } from 'vitest';
import { HOLO_CHANCE, openPack, PACK_SETS } from './packs.js';
import { BASIC_ENERGY } from './pool.js';
import { rngFrom } from './random.js';
import { testPackSet } from './test-pool.js';

describe('openPack', () => {
  it.each(PACK_SETS.filter((id) => id !== 'basep'))('%s: 1 basic Energy, 6 commons, 3 uncommons and a rare, all different and from the set', (setId) => {
    const set = testPackSet(setId);
    for (let seed = 0; seed < 100; seed++) {
      const pack = openPack(set, rngFrom(seed));
      expect(pack).toHaveLength(11);
      expect(pack.map((c) => c.slot)).toEqual(['energy', ...Array(6).fill('common'), ...Array(3).fill('uncommon'), pack[10]!.slot]);
      expect(Object.values(BASIC_ENERGY)).toContain(pack[0]!.cardId);
      expect(new Set(pack.slice(1).map((c) => c.cardId)).size).toBe(10);
      for (const c of pack.slice(1)) expect(set[c.slot as 'common' | 'uncommon' | 'rare' | 'holo']).toContain(c.cardId);
    }
  });

  it('about 1 pack in 3 has a holo', () => {
    const set = testPackSet('base1');
    const holos = Array.from({ length: 3000 }, (_, seed) => openPack(set, rngFrom(seed))).filter((p) => p[10]!.slot === 'holo').length;
    expect(Math.abs(holos / 3000 - HOLO_CHANCE)).toBeLessThan(0.03);
  });

  it("Base Set's basic Energy isn't in its common slots", () => {
    expect(testPackSet('base1').common.filter((id) => Object.values(BASIC_ENERGY).includes(id))).toEqual([]);
  });
});

describe('openPack: Wizards Black Star Promos', () => {
  const set = testPackSet('basep');

  it('a basic Energy and 10 different promos; the last a holo or not, like any pack', () => {
    expect([set.uncommon, set.rare, set.holo.length]).toEqual([[], [], 6]);
    for (let seed = 0; seed < 100; seed++) {
      const pack = openPack(set, rngFrom(seed));
      expect(pack).toHaveLength(11);
      expect(new Set(pack.slice(1).map((c) => c.cardId)).size).toBe(10);
      expect(pack.slice(0, 10).map((c) => c.slot)).toEqual(['energy', ...Array(9).fill('common')]);
      expect(set[pack[10]!.slot as 'common' | 'holo']).toContain(pack[10]!.cardId);
    }
  });

  it('about 1 pack in 3 has a holo', () => {
    const holos = Array.from({ length: 3000 }, (_, seed) => openPack(set, rngFrom(seed))).filter((p) => p[10]!.slot === 'holo').length;
    expect(Math.abs(holos / 3000 - HOLO_CHANCE)).toBeLessThan(0.03);
  });
});
