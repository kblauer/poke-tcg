import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COSMETICS, DEFAULT_COSMETIC, hasCosmetic } from './cosmetics.js';
import { RUN_TYPES } from './run-types.js';

const none = { bought: new Set<string>(), beaten: new Set<string>(), debug: false };

describe('cosmetics', () => {
  it('every account has the defaults, and only them, from the start', () => {
    const had = Object.values(COSMETICS).filter((c) => hasCosmetic(c, none)).map((c) => c.id);
    expect(had.sort()).toEqual(Object.values(DEFAULT_COSMETIC).sort());
  });

  it('a sold one once bought, a run type\'s once that run is beaten', () => {
    expect(hasCosmetic(COSMETICS.japanese!, { ...none, bought: new Set(['japanese']) })).toBe(true);
    expect(hasCosmetic(COSMETICS.cosmos!, { ...none, bought: new Set(['cosmos']) })).toBe(false);
    expect(hasCosmetic(COSMETICS.cosmos!, { ...none, beaten: new Set(['kantoGyms']) })).toBe(true);
  });

  it('every one while debugging', () => {
    expect(Object.values(COSMETICS).every((c) => hasCosmetic(c, { ...none, debug: true }))).toBe(true);
  });

  it("every card back's image is in the web app (public/cardbacks; a sleeve's in sleeves/<slug>.webp)", () => {
    const dir = new URL('../../../apps/web/public/cardbacks/', import.meta.url);
    const missing = Object.values(COSMETICS)
      .filter((c) => c.kind === 'cardBack')
      .map((c) => (c.id.startsWith('sleeve-') ? `sleeves/${c.id.slice('sleeve-'.length)}.webp` : `${c.id}.jpg`))
      .filter((file) => !existsSync(new URL(file, dir)));
    expect(missing).toEqual([]);
  });

  it('two sleeves behind each Gym Challenge and Champion run', () => {
    for (const run of ['kantoGyms', 'kantoChampion', 'johtoGyms', 'johtoChampion'])
      expect(Object.values(COSMETICS).filter((c) => c.id.startsWith('sleeve-') && c.unlock.type === 'beat' && c.unlock.runType === run)).toHaveLength(2);
  });

  it('unlocks name real run types, and each kind has its default', () => {
    for (const c of Object.values(COSMETICS)) if (c.unlock.type === 'beat') expect(RUN_TYPES[c.unlock.runType]).toBeDefined();
    expect(COSMETICS[DEFAULT_COSMETIC.cardBack]?.kind).toBe('cardBack');
    expect(COSMETICS[DEFAULT_COSMETIC.playmat]?.kind).toBe('playmat');
  });
});
