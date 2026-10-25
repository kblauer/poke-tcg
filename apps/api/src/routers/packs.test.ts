import { describe, expect, it } from 'vitest';
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
