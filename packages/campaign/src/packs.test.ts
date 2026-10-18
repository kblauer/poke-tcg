import { describe, expect, it } from 'vitest';
import { ALL_RARES_CHANCE, EXTRA_RARE_CHANCES, HOLO_CHANCE, HOLO_ENERGY_CHANCE, openPack, PACK_SETS, type PackCard } from './packs.js';
import { BASIC_ENERGY } from './pool.js';
import { rngFrom } from './random.js';
import { testPackSet } from './test-pool.js';

describe('openPack', () => {
  /** Rares and holos (the rare slot, and the extras). */
  const rareCount = (pack: PackCard[]) => pack.filter((c) => c.slot === 'rare' || c.slot === 'holo').length;

  it.each(PACK_SETS.filter((id) => id !== 'basep'))('%s: 1 basic Energy, then commons, uncommons and rares (6, 3 and 1, less any extra rares), all different and from the set', (setId) => {
    const set = testPackSet(setId);
    for (let seed = 0; seed < 300; seed++) {
      const pack = openPack(set, rngFrom(seed));
      expect(pack).toHaveLength(11);
      const slots = pack.map((c) => c.slot);
      const extra = rareCount(pack) - 1;
      const commons = slots.filter((s) => s === 'common').length;
      expect(commons + slots.filter((s) => s === 'uncommon').length).toBe(9 - extra);
      // In reveal order: Energy, commons, uncommons, the rares last.
      expect(slots).toEqual(['energy', ...Array(commons).fill('common'), ...Array(9 - extra - commons).fill('uncommon'), ...slots.slice(10 - extra)]);
      expect(slots.slice(10 - extra).every((s) => s === 'rare' || s === 'holo')).toBe(true);
      expect(Object.values(BASIC_ENERGY)).toContain(pack[0]!.cardId);
      expect(new Set(pack.slice(1).map((c) => c.cardId)).size).toBe(10);
      for (const c of pack.slice(1)) expect(set[c.slot as 'common' | 'uncommon' | 'rare' | 'holo']).toContain(c.cardId);
    }
  });

  it('about 1 pack in 3 has a holo as its rare', () => {
    const set = testPackSet('base1');
    const holos = Array.from({ length: 3000 }, (_, seed) => openPack(set, rngFrom(seed))).filter((p) => p[10]!.slot === 'holo').length;
    expect(Math.abs(holos / 3000 - HOLO_CHANCE)).toBeLessThan(0.03);
  });

  it('now and then a common or uncommon is a rare instead: about 31% of packs have an extra rare, 2.5% two or more', () => {
    const set = testPackSet('base1');
    const packs = Array.from({ length: 20000 }, (_, seed) => openPack(set, rngFrom(seed)));
    const share = (n: number) => packs.filter((p) => rareCount(p) >= n).length / packs.length;
    expect(EXTRA_RARE_CHANCES.slice(0, 2)).toEqual([0.04, 0.02]);
    // 1 − 0.96^9 ≈ 0.31; a second extra only from the cards after the first, at 2% each: ≈ 0.025, plus the all-rares packs.
    expect(Math.abs(share(2) - 0.31)).toBeLessThan(0.02);
    expect(Math.abs(share(3) - (0.025 + ALL_RARES_CHANCE))).toBeLessThan(0.006);
    expect(share(1)).toBe(1);
  });

  it("the Energy card is the set's own (or the closest earlier set's), and about 1 pack in 50 a holo Energy", () => {
    const set = { ...testPackSet('base1'), energy: ['base1-98', 'base1-102'], holoEnergy: ['base1-98-holo-rainbow', 'base1-102-holo-secret'] };
    const energies = Array.from({ length: 5000 }, (_, seed) => openPack(set, rngFrom(seed))[0]!);
    expect(new Set(energies.filter((c) => c.slot === 'energy').map((c) => c.cardId))).toEqual(new Set(set.energy));
    const holos = energies.filter((c) => c.slot === 'holoEnergy');
    expect(new Set(holos.map((c) => c.cardId))).toEqual(new Set(set.holoEnergy));
    expect(Math.abs(holos.length / 5000 - HOLO_ENERGY_CHANCE)).toBeLessThan(0.01);
  });

  it('about 1 pack in 170 is all rares and holos but its Energy, all different', () => {
    const set = testPackSet('base1');
    const packs = Array.from({ length: 30000 }, (_, seed) => openPack(set, rngFrom(seed)));
    const allRares = packs.filter((p) => rareCount(p) === 10);
    expect(Math.abs(allRares.length / packs.length - ALL_RARES_CHANCE)).toBeLessThan(0.0015);
    const forced = openPack(set, rngFrom(1), { forceAllRares: true });
    expect(forced[0]!.slot).toBe('energy');
    expect(rareCount(forced)).toBe(10);
    expect(new Set(forced.map((c) => c.cardId)).size).toBe(11);
  });

  it("Base Set's basic Energy isn't in its common slots", () => {
    expect(testPackSet('base1').common.filter((id) => Object.values(BASIC_ENERGY).includes(id))).toEqual([]);
  });
});

describe('openPack: Wizards Black Star Promos', () => {
  const set = testPackSet('basep');

  it('a basic Energy and 10 different promos, holos last (the last card a holo about 1 pack in 3, others now and then)', () => {
    expect([set.uncommon, set.rare, set.holo.length]).toEqual([[], [], 6]);
    for (let seed = 0; seed < 300; seed++) {
      const pack = openPack(set, rngFrom(seed));
      expect(pack).toHaveLength(11);
      expect(new Set(pack.slice(1).map((c) => c.cardId)).size).toBe(10);
      const slots = pack.map((c) => c.slot);
      const holos = slots.filter((s) => s === 'holo').length;
      expect(slots).toEqual(['energy', ...Array(10 - holos).fill('common'), ...Array(holos).fill('holo')]);
      for (const c of pack.slice(1)) expect(set[c.slot as 'common' | 'holo']).toContain(c.cardId);
    }
  });

  it('about 1 pack in 3 ends on a holo, and the promos that turn into extra rares are holos too: about 54% have one', () => {
    const packs = Array.from({ length: 5000 }, (_, seed) => openPack(set, rngFrom(seed)));
    // 1 − (1 − HOLO_CHANCE) × (most of 0.96^10) ≈ 0.54.
    const share = packs.filter((p) => p.some((c) => c.slot === 'holo')).length / packs.length;
    expect(Math.abs(share - (1 - (1 - HOLO_CHANCE) * 0.69))).toBeLessThan(0.03);
  });
});
