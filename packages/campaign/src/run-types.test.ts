import { describe, expect, it } from 'vitest';
import { boss } from './bosses.js';
import { PACK_SETS } from './packs.js';
import { bossTypes, generation, generationBadges, nextPack, RUN_TYPES, runTypeLock } from './run-types.js';

const kanto = generation(1);
const none = { badges: new Set<string>(), beaten: new Set<string>() };

describe('unlocking run types', () => {
  it('gym runs are open from the start', () => {
    expect(runTypeLock(RUN_TYPES.pewter, none)).toBeNull();
  });

  it('the Gym Challenge needs all 8 badges of its generation', () => {
    const badges = generationBadges(kanto);
    expect(badges).toHaveLength(8);
    expect(runTypeLock(RUN_TYPES.kantoGyms, { ...none, badges: new Set(badges.slice(1)) })).toBe('Earn all 8 Kanto badges first (1 to go)');
    expect(runTypeLock(RUN_TYPES.kantoGyms, { ...none, badges: new Set(badges) })).toBeNull();
  });

  it('the Champion run needs the Gym Challenge beaten, badges or not', () => {
    expect(runTypeLock(RUN_TYPES.kantoChampion, { ...none, badges: new Set(generationBadges(kanto)) })).toBe('Beat the Kanto Gym Challenge first');
    expect(runTypeLock(RUN_TYPES.kantoChampion, { ...none, beaten: new Set(['kantoGyms']) })).toBeNull();
  });
});

describe('generation packs', () => {
  it('Kanto unlocks every pack set, one at a time in release order', () => {
    expect([...kanto.packs].sort()).toEqual([...PACK_SETS].sort());
    expect(nextPack(kanto, new Set())).toBe('base1');
    expect(nextPack(kanto, new Set(['base1']))).toBe('base2');
    expect(nextPack(kanto, new Set(kanto.packs))).toBeNull();
  });
});

describe('bossTypes', () => {
  it("is the boss deck's basic Energy types, the most first", () => {
    expect(bossTypes(boss('erika'))).toEqual(['grass', 'psychic']);
    expect(bossTypes(boss('brock'))).toEqual(['fighting']);
  });
});
