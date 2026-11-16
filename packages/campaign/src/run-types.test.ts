import { describe, expect, it } from 'vitest';
import { boss } from './bosses.js';
import { PACK_SETS } from './packs.js';
import { bossSummary, bossTypes, generation, generationBadges, generationLock, loadRunMaps, nextPack, PACK_GENERATIONS, RUN_TYPE_IDS, RUN_TYPE_INFO, RUN_TYPES, runFinalBoss, runType, runTypeLock } from './run-types.js';
import { DP_SETS, EX_SETS, GEN4_SETS, GEN5_SETS } from './pool.js';

const kanto = generation(1);
const none = { badges: new Set<string>(), beaten: new Set<string>() };

describe('run types and their maps', () => {
  it('every run type has its maps, the same the site loads for it by its region (loadRunMaps)', async () => {
    for (const id of RUN_TYPE_IDS) {
      const maps = await loadRunMaps(id);
      expect(maps.routes.length, id).toBeGreaterThan(0);
      expect(maps.routes, id).toBe(runType(id).routes);
      expect(maps.gym, id).toBe(runType(id).gym);
      expect({ ...runType(id), routes: undefined, gym: undefined }, id).toEqual({ ...RUN_TYPE_INFO[id], routes: undefined, gym: undefined });
    }
    await expect(loadRunMaps('nowhere')).rejects.toThrow();
  });

  it("a gym run's encounters and description agree with its maps: a step per route spot, the maps' and the gym's names", () => {
    for (const id of RUN_TYPE_IDS.filter((t) => runType(t).gym)) {
      const type = runType(id);
      expect(type.segments[0]!.steps, id).toBe(type.routes!.reduce((n, r) => n + r.spots.length, 0));
      // One name for several floors of one place (the Pokémon Tower, Iron Island), otherwise each map's (its areas once).
      const names = [...new Set(type.routes!.map((r) => r.name.replace(/ \(.*\)$/, '')))];
      const places = [...new Set(names.map((n) => n.replace(/ (\d+F|B\d+F)$/, '')))];
      const along = places.length === 1 && places[0] !== names[0] ? places[0] : names.join(', ');
      expect(type.description.startsWith(`${along}, ${type.gym!.name}. `), `${id}: ${type.description}`).toBe(true);
    }
  });
});

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

  it("Sinnoh's runs open once the Hoenn Gym Challenge is beaten; its Gym Challenge needs its 8 badges, its Champion run the Sinnoh Gym Challenge", () => {
    const sinnoh = generationBadges(generation(4));
    expect(sinnoh).toEqual(['coal-badge', 'forest-badge', 'cobble-badge', 'fen-badge', 'relic-badge', 'mine-badge', 'icicle-badge', 'beacon-badge']);
    expect(runTypeLock(RUN_TYPES.oreburgh, { ...none, beaten: new Set(['johtoGyms']) })).toBe('Beat the Hoenn Gym Challenge first');
    const hoennBeaten = new Set(['hoennGyms']);
    const gyms = RUN_TYPE_IDS.filter((id) => RUN_TYPES[id].generation === 4 && !runType(id).requires);
    expect(gyms.map((id) => runTypeLock(RUN_TYPES[id], { ...none, beaten: hoennBeaten }))).toEqual(gyms.map(() => null));
    expect(gyms).toHaveLength(8);
    expect(runTypeLock(RUN_TYPES.sinnohGyms, { ...none, beaten: hoennBeaten })).toBe('Earn all 8 Sinnoh badges first (8 to go)');
    expect(runTypeLock(RUN_TYPES.sinnohGyms, { beaten: hoennBeaten, badges: new Set(sinnoh) })).toBeNull();
    expect(runTypeLock(RUN_TYPES.sinnohChampion, { beaten: hoennBeaten, badges: new Set(sinnoh) })).toBe('Beat the Sinnoh Gym Challenge first');
    expect(runTypeLock(RUN_TYPES.sinnohChampion, { ...none, beaten: new Set(['hoennGyms', 'sinnohGyms']) })).toBeNull();
  });

  it("Unova's runs open once the Sinnoh Gym Challenge is beaten; its Gym Challenge needs its 8 badges (Striaton's whichever leader gave it), its Champion run the Unova Gym Challenge", () => {
    const unova = generationBadges(generation(5));
    expect(unova).toEqual(['trio-badge', 'basic-badge', 'insect-badge', 'bolt-badge', 'quake-badge', 'jet-badge', 'freeze-badge', 'legend-badge']);
    expect(['cilan', 'chili', 'cress'].map((id) => boss(id).gym!.badge)).toEqual(['trio-badge', 'trio-badge', 'trio-badge']);
    expect(runTypeLock(RUN_TYPES.striaton, { ...none, beaten: new Set(['hoennGyms']) })).toBe('Beat the Sinnoh Gym Challenge first');
    const sinnohBeaten = new Set(['sinnohGyms']);
    const gyms = RUN_TYPE_IDS.filter((id) => RUN_TYPES[id].generation === 5 && !runType(id).requires);
    expect(gyms).toEqual(['striaton', 'nacrene', 'castelia', 'nimbasa', 'driftveil', 'mistralton', 'icirrus', 'opelucid']);
    expect(gyms.map((id) => runTypeLock(RUN_TYPES[id], { ...none, beaten: sinnohBeaten }))).toEqual(gyms.map(() => null));
    expect(runTypeLock(RUN_TYPES.unovaGyms, { ...none, beaten: sinnohBeaten })).toBe('Earn all 8 Unova badges first (8 to go)');
    expect(runTypeLock(RUN_TYPES.unovaGyms, { beaten: sinnohBeaten, badges: new Set(unova) })).toBeNull();
    expect(runTypeLock(RUN_TYPES.unovaChampion, { beaten: sinnohBeaten, badges: new Set(unova) })).toBe('Beat the Unova Gym Challenge first');
    expect(runTypeLock(RUN_TYPES.unovaChampion, { ...none, beaten: new Set(['sinnohGyms', 'unovaGyms']) })).toBeNull();
  });

  it("names Striaton's three leaders where a run shows its boss, and the run's own once it's rolled", () => {
    expect(bossSummary(RUN_TYPES.striaton)).toBe('Striaton Gym Leader Cilan, Chili or Cress');
    expect(RUN_TYPES.striaton.description).toBe('Route 1, Route 2, Striaton Gym. Cilan, Chili or Cress at random, each with his own deck.');
    expect(bossSummary(RUN_TYPES.unovaGyms)).toBe('8 gym leaders');
    expect(bossSummary(RUN_TYPES.unovaChampion)).toBe('Gym leaders, Elite Four & Champion');
    expect(runFinalBoss({ type: 'striaton', steps: [{ options: [{ boss: 'chili' }] }] }).name).toBe('Chili');
    expect(runFinalBoss({ type: 'unovaChampion', steps: [{ options: [{ boss: 'alder' }] }] }).name).toBe('Alder');
    // A run saved with no boss on its last step: its type's.
    expect(runFinalBoss({ type: 'pewter', steps: [{ options: [{}] }] }).name).toBe('Brock');
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
    expect([...kanto.packs, ...generation(2).packs, ...generation(3).packs, ...generation(4).packs, ...generation(5).packs].sort()).toEqual([...PACK_SETS].sort());
    // Gen 5's runs unlock the Black & White series' packs, from Black & White.
    expect(generation(5).packs).toEqual(GEN5_SETS);
    expect(PACK_GENERATIONS[5]).toEqual({ region: 'Unova', packs: GEN5_SETS });
    expect(nextPack(generation(5), new Set(GEN4_SETS))).toBe('bw1');
    expect(nextPack(generation(2), new Set(kanto.packs))).toBe('neo1');
    // Gen 3's runs unlock the EX sets' packs, from EX Ruby & Sapphire.
    expect(generation(3).packs).toEqual(EX_SETS);
    expect(nextPack(generation(3), new Set([...kanto.packs, ...generation(2).packs]))).toBe('ex1');
    // Gen 4's runs unlock the Diamond & Pearl to HGSS sets' packs, from Diamond & Pearl.
    expect(generation(4).packs).toEqual(GEN4_SETS);
    expect(nextPack(generation(4), new Set(EX_SETS))).toBe(DP_SETS[0]);
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
    // And Gen 4's (Diamond & Pearl's), basic Metal Energy too.
    expect(bossTypes(boss('byron'))).toEqual(['metal']);
    // And Gen 5's (Black & White's); Drayden's Dragon deck names its type.
    expect(bossTypes(boss('chili'))).toEqual(['fire']);
    expect(bossTypes(boss('grimsley'))).toEqual(['darkness']);
    expect(bossTypes(boss('drayden'))).toEqual(['dragon']);
  });
});
