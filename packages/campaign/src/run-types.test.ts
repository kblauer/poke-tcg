import { describe, expect, it } from 'vitest';
import { boss } from './bosses.js';
import { PACK_SETS } from './packs.js';
import { bossTypes, generation, generationBadges, generationLock, nextPack, PACK_GENERATIONS, RUN_TYPE_IDS, RUN_TYPES, runTypeLock } from './run-types.js';
import { EX_SETS } from './pool.js';

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

  it("Hoenn's Gym Challenge needs its 8 badges, and its Champion run the Hoenn Gym Challenge beaten", () => {
    const hoenn = generationBadges(generation(3));
    const johtoBeaten = new Set(['johtoGyms']);
    expect(hoenn).toEqual(['stone-badge', 'knuckle-badge', 'dynamo-badge', 'heat-badge', 'balance-badge', 'feather-badge', 'mind-badge', 'rain-badge']);
    expect(runTypeLock(RUN_TYPES.hoennGyms, { beaten: johtoBeaten, badges: new Set(generationBadges(kanto)) })).toBe('Earn all 8 Hoenn badges first (8 to go)');
    expect(runTypeLock(RUN_TYPES.hoennGyms, { beaten: johtoBeaten, badges: new Set(hoenn) })).toBeNull();
    expect(runTypeLock(RUN_TYPES.hoennChampion, { beaten: johtoBeaten, badges: new Set(hoenn) })).toBe('Beat the Hoenn Gym Challenge first');
    expect(runTypeLock(RUN_TYPES.hoennChampion, { ...none, beaten: new Set(['johtoGyms', 'hoennGyms']) })).toBeNull();
  });

  it("each generation's runs need the Gym Challenge of the one before beaten, its Champion run or not", () => {
    expect(generationLock(1, none.beaten)).toBeNull();
    expect(generationLock(2, none.beaten)).toBe('Beat the Kanto Gym Challenge first');
    expect(generationLock(2, new Set(['kantoChampion']))).toBe('Beat the Kanto Gym Challenge first');
    expect(generationLock(2, new Set(['kantoGyms']))).toBeNull();
    expect(generationLock(3, new Set(['kantoGyms']))).toBe('Beat the Johto Gym Challenge first');
    expect(generationLock(3, new Set(['johtoGyms']))).toBeNull();
    // Beating the Kanto Gym Challenge opens Johto's 8 gym runs; its Gym Challenge and Champion run keep their own locks.
    const johto = RUN_TYPE_IDS.filter((id) => RUN_TYPES[id].generation === 2);
    expect(johto.map((id) => runTypeLock(RUN_TYPES[id], none))).toEqual(johto.map(() => 'Beat the Kanto Gym Challenge first'));
    const open = johto.filter((id) => runTypeLock(RUN_TYPES[id], { ...none, beaten: new Set(['kantoGyms']) }) === null);
    expect(open).toHaveLength(8);
    expect(open).not.toContain('johtoGyms');
    expect(runTypeLock(RUN_TYPES.johtoGyms, { ...none, beaten: new Set(['kantoGyms']) })).toBe('Earn all 8 Johto badges first (8 to go)');
    // Badges alone never open a generation.
    expect(runTypeLock(RUN_TYPES.johtoGyms, { ...none, badges: new Set(generationBadges(generation(2))) })).toBe('Beat the Kanto Gym Challenge first');
  });

  it('the Champion run needs the Gym Challenge beaten, badges or not', () => {
    expect(runTypeLock(RUN_TYPES.kantoChampion, { ...none, badges: new Set(generationBadges(kanto)) })).toBe('Beat the Kanto Gym Challenge first');
    expect(runTypeLock(RUN_TYPES.kantoChampion, { ...none, beaten: new Set(['kantoGyms']) })).toBeNull();
  });
});

describe('generation packs', () => {
  it("the generations' packs are every pack set, each in one generation, one at a time in release order", () => {
    expect(Object.values(PACK_GENERATIONS).flatMap((g) => g.packs).sort()).toEqual([...PACK_SETS].sort());
    expect([...kanto.packs, ...generation(2).packs, ...generation(3).packs, ...PACK_GENERATIONS[4]!.packs].sort()).toEqual([...PACK_SETS].sort());
    expect(nextPack(generation(2), new Set(kanto.packs))).toBe('neo1');
    // Gen 3's runs unlock the EX sets' packs, from EX Ruby & Sapphire.
    expect(generation(3).packs).toEqual(EX_SETS);
    expect(nextPack(generation(3), new Set([...kanto.packs, ...generation(2).packs]))).toBe('ex1');
    expect(nextPack(kanto, new Set())).toBe('base1');
    expect(nextPack(kanto, new Set(['base1']))).toBe('base2');
    expect(nextPack(kanto, new Set(kanto.packs))).toBeNull();
  });
});

describe('bossTypes', () => {
  it("is the boss deck's basic Energy types, the most first", () => {
    expect(bossTypes(boss('erika'))).toEqual(['grass', 'psychic']);
    expect(bossTypes(boss('brock'))).toEqual(['fighting']);
    // Gen 3's basic Energy (EX Ruby & Sapphire's) counts too.
    expect(bossTypes(boss('flannery'))).toEqual(['fire']);
    expect(bossTypes(boss('winona'))).toEqual(['colorless']);
  });
});
