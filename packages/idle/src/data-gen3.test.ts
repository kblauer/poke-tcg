import { describe, expect, it } from 'vitest';
import { ABILITY_NAMES } from './data/gen3/abilities.js';
import { ENCOUNTERS } from './data/gen3/encounters.js';
import { ITEMS } from './data/gen3/items.js';
import { MARTS } from './data/gen3/marts.js';
import { MOVES } from './data/gen3/moves.js';
import { SPECIES } from './data/gen3/species.js';
import { TM_LEARNERS, TM_MOVES } from './data/gen3/tms.js';
import { TRAINERS } from './data/gen3/trainers.js';
import { MOVES as KANTO_MOVES } from './data/gen1/moves.js';
import { TYPE_CHART as KANTO_TYPE_CHART } from './data/gen1/types.js';
import { TYPE_CHART } from './data/gen3/types.js';
import { leavesShedinja, levelEvolution, SET_LEVELS, stoneEvolution } from './evolution.js';
import { inGeneration, regionReady } from './generation.js';
import type { EncounterSlots } from './types.js';

// Hoenn's tables (data/gen3/, tools/idle/emerald_data.py from pokeemerald; issue #226, step 2): known values, every
// reference between them resolving, and Emerald's evolutions read as Johto's are.
describe("Hoenn's data", () => {
  it('has every species to Deoxys by National Pokédex number, from Emerald', () => {
    expect(SPECIES).toHaveLength(386);
    SPECIES.forEach((s, i) => expect(s.id).toBe(i + 1));
    const treecko = SPECIES[251]!;
    expect(treecko).toMatchObject({ key: 'treecko', name: 'Treecko', types: ['grass'], base: [40, 45, 35, 65, 55, 70], catchRate: 45, growth: 'mediumSlow', abilities: ['overgrow'], friendship: 70 });
    expect(treecko.learnset.slice(0, 3)).toEqual([[1, 'pound'], [1, 'leer'], [6, 'absorb']]);
    expect(treecko.evolutions).toEqual([{ method: 'level', into: 253, level: 16 }]);
    expect(SPECIES[385]).toMatchObject({ key: 'deoxys', name: 'Deoxys' });
    expect(SPECIES.map((s) => s.name)).toEqual(expect.arrayContaining(['Nidoran♀', "Farfetch'd", 'Mr. Mime', 'Ho-Oh', 'Porygon2']));
    expect(treecko.dexText).toMatch(/^It makes its nest in a giant tree in the forest\./);
    // Wild held items ([common, rare]): Emerald's own.
    expect(SPECIES[0]!.heldItems).toBeUndefined();
    expect(SPECIES[112]!.heldItems).toEqual([null, 'lucky-egg']);
  });

  it("reads Emerald's evolutions as Johto's are named", () => {
    expect(SPECIES[264]!.evolutions).toEqual([{ method: 'level_pid_lo', into: 266, level: 7 }, { method: 'level_pid_hi', into: 268, level: 7 }]);
    expect(SPECIES[289]!.evolutions).toEqual([{ method: 'level_ninjask', into: 291, level: 20 }, { method: 'level_shedinja', into: 292, level: 20 }]);
    expect(SPECIES[348]!.evolutions).toEqual([{ method: 'beauty', into: 350, beauty: 170 }]);
    expect(SPECIES[41]!.evolutions).toEqual([{ method: 'friendship', into: 169 }]);
    expect(SPECIES[94]!.evolutions).toEqual([{ method: 'trade_item', into: 208, item: 'metal-coat' }]);
    expect(SPECIES[132]!.evolutions).toContainEqual({ method: 'friendship_day', into: 196 });
    // Every evolution the runs can't do as the game does has its set level (evolution.ts's SET_LEVELS).
    for (const s of SPECIES) for (const e of s.evolutions) if (/^friendship|^trade_item$|^beauty$/.test(e.method)) expect(SET_LEVELS[e.into], `${s.name} into ${e.into}`).toBeDefined();
    inGeneration(3, () => {
      expect(levelEvolution({ species: 252, level: 16 })).toBe(253);
      expect(levelEvolution({ species: 349, level: 30 })).toBe(350);
      expect(stoneEvolution({ species: 271 }, 'water-stone')).toBe(272);
      expect(leavesShedinja(290)).toBe(true);
    });
  });

  it("has Gen 3's moves and type chart: Kanto's, the same engine's", () => {
    expect(Object.keys(MOVES).sort()).toEqual(Object.keys(KANTO_MOVES).sort());
    expect(MOVES['pound']).toMatchObject({ power: 40, accuracy: 100, pp: 35, effect: 'hit' });
    expect(MOVES['pound']!.category).toBeUndefined();
    expect(TYPE_CHART).toEqual(KANTO_TYPE_CHART);
  });

  it('has the TMs and HMs, keyed as Kanto\'s', () => {
    expect(Object.keys(TM_MOVES)).toHaveLength(58);
    expect(TM_MOVES).toMatchObject({ tm01: 'focus-punch', tm50: 'overheat', hm01: 'cut', hm08: 'dive' });
    expect(ITEMS['tm01']).toMatchObject({ name: 'TM01', price: 3000 });
    expect(TM_LEARNERS[252]).toContain('tm01');
  });

  it("has Emerald's trainers, the double battles marked", () => {
    expect(TRAINERS['roxanne-1']).toMatchObject({ class: 'Leader', name: 'Roxanne', pic: 'leader_roxanne', female: true });
    expect(TRAINERS['roxanne-1']!.party.map((p) => p.species)).toEqual([74, 74, 299]);
    expect(TRAINERS['tate-and-liza-1']).toMatchObject({ name: 'Tate & Liza', double: true });
    expect(TRAINERS['wallace']).toMatchObject({ class: 'Champion', name: 'Wallace' });
    expect(TRAINERS['wallace']!.party.at(-1)).toMatchObject({ species: 350 });
    for (const k of ['sidney', 'phoebe', 'glacia', 'drake']) expect(TRAINERS[k]!.class).toBe('Elite Four');
  });

  it('resolves every move, item, ability and species the tables name', () => {
    const species = (id: number) => id >= 1 && id <= SPECIES.length;
    for (const s of SPECIES) {
      for (const [, m] of s.learnset) expect(MOVES[m], `${s.key}: ${m}`).toBeDefined();
      for (const a of s.abilities) expect(ABILITY_NAMES[a], a).toBeDefined();
      for (const e of s.evolutions) {
        expect(species(e.into)).toBe(true);
        if (e.item) expect(ITEMS[e.item], e.item).toBeDefined();
      }
      for (const i of s.heldItems ?? []) if (i) expect(ITEMS[i], i).toBeDefined();
    }
    for (const [tm, m] of Object.entries(TM_MOVES)) {
      expect(MOVES[m], tm).toBeDefined();
      expect(ITEMS[tm], tm).toBeDefined();
    }
    for (const list of Object.values(TM_LEARNERS)) for (const tm of list) expect(TM_MOVES[tm], tm).toBeDefined();
    for (const [k, t] of Object.entries(TRAINERS)) {
      for (const i of t.items) expect(ITEMS[i], `${k}: ${i}`).toBeDefined();
      for (const p of t.party) {
        expect(species(p.species), k).toBe(true);
        if (p.item) expect(ITEMS[p.item], `${k}: ${p.item}`).toBeDefined();
        for (const m of p.moves ?? []) expect(MOVES[m], `${k}: ${m}`).toBeDefined();
      }
    }
    for (const list of Object.values(MARTS)) for (const i of list) expect(ITEMS[i], i).toBeDefined();
    const tables = Object.values(ENCOUNTERS).flatMap((t) => Object.values(t) as EncounterSlots[]);
    for (const t of tables) for (const [, , d] of t.mons) expect(species(d)).toBe(true);
    expect(ENCOUNTERS['ROUTE101']!.land!.mons.map(([, , d]) => d)).toEqual(expect.arrayContaining([261, 263, 265]));
    expect(ENCOUNTERS['GRANITE_CAVE_1F']!.land).toBeDefined();
  });

  it('is registered, but no Hoenn run starts before its areas exist (steps 4 to 6)', () => {
    expect(inGeneration(3, () => SPECIES.length)).toBe(386);
    expect(regionReady(1)).toBe(true);
    expect(regionReady(2)).toBe(true);
    expect(regionReady(3)).toBe(false);
  });
});
