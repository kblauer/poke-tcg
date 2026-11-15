import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOLO_ENERGY_SETS } from '../../../../packages/db/prisma/holo-energy.js';
import { packBasicEnergy } from './packs.js';

const energy = (data: object) => ({ kind: 'ENERGY' as const, data: { energyType: 'Normal', ...data } });

describe("packs' Energy slot", () => {
  it('packBasicEnergy: plain basic Energy only, never a holo Energy or a reverse-holo print', () => {
    expect(packBasicEnergy(energy({}))).toBe(true);
    expect(packBasicEnergy(energy({ holoEnergy: { key: 'galaxy', label: 'Galaxy', rarity: 'rare holo cosmos' } }))).toBe(false);
    expect(packBasicEnergy(energy({ reverseHolo: true }))).toBe(false);
    expect(packBasicEnergy({ kind: 'ENERGY', data: { energyType: 'Special' } })).toBe(false);
    expect(packBasicEnergy({ kind: 'POKEMON', data: {} })).toBe(false);
  });
});

describe('holo Energy', () => {
  it("is made for every set with basic Energy of its own, or that set's packs (and the later sets' that use its Energy) never give one (#99, #204)", () => {
    const { cards } = JSON.parse(readFileSync(new URL('../../../../packages/db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')) as { cards: { id: string; category: string; energyType?: string }[] };
    const own = [...new Set(cards.filter((c) => c.category === 'Energy' && c.energyType === 'Normal').map((c) => c.id.split('-')[0]!))];
    expect(own.length).toBeGreaterThan(10);
    expect(own.filter((set) => !HOLO_ENERGY_SETS.includes(set))).toEqual([]);
  });
});
