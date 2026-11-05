import { describe, expect, it } from 'vitest';
import type { TownArea, WalkArea } from './areas.js';
import { ABILITY_NAMES } from './data/gen2/abilities.js';
import { JOHTO_AREAS } from './data/gen2/areas.js';
import { ENCOUNTERS } from './data/gen2/encounters.js';
import { ITEMS } from './data/gen2/items.js';
import { JOHTO_MAPS } from './data/gen2/maps.js';
import { MART_CLERKS, MARTS } from './data/gen2/marts.js';
import { MOVES } from './data/gen2/moves.js';
import { SPECIES } from './data/gen2/species.js';
import { TM_LEARNERS, TM_MOVES } from './data/gen2/tms.js';
import { TRAINERS } from './data/gen2/trainers.js';
import { TYPE_CHART } from './data/gen2/types.js';
import type { EncounterSlots } from './types.js';

// Johto's tables (data/gen2/, tools/idle/hgss_data.py from pokeheartgold; issue #170, step 2): known values, and every
// reference between them resolving.
describe("Johto's data", () => {
  it('has every species to Arceus, with Gen 4 learnsets and evolutions', () => {
    expect(SPECIES).toHaveLength(493);
    SPECIES.forEach((s, i) => expect(s.id).toBe(i + 1));
    const chikorita = SPECIES[151]!;
    expect(chikorita).toMatchObject({ key: 'chikorita', name: 'Chikorita', types: ['grass'], base: [45, 49, 65, 49, 65, 45], catchRate: 45, growth: 'mediumSlow', abilities: ['overgrow'] });
    expect(chikorita.learnset.slice(0, 3)).toEqual([[1, 'tackle'], [1, 'growl'], [6, 'razor-leaf']]);
    expect(chikorita.evolutions).toEqual([{ method: 'level', into: 153, level: 16 }]);
    expect(SPECIES[171]!.evolutions).toEqual([{ method: 'friendship', into: 25 }]);
    expect(SPECIES[132]!.evolutions).toContainEqual({ method: 'friendship_day', into: 196 });
    expect(SPECIES[94]!.evolutions).toEqual([{ method: 'trade_item', into: 208, item: 'metal-coat' }]);
    expect(SPECIES[24]!.evolutions).toEqual([{ method: 'item', into: 26, item: 'thunder-stone' }]);
    expect(SPECIES.map((s) => s.name)).toEqual(expect.arrayContaining(['Nidoran♀', "Farfetch'd", 'Mr. Mime', 'Ho-Oh', 'Porygon2', 'Mime Jr.', 'Porygon-Z']));
    expect(SPECIES[0]!.dexText).toMatch(/^It carries a seed on its back right from birth\./);
  });

  it('has Gen 4 moves with their split', () => {
    expect(MOVES['pound']).toMatchObject({ category: 'physical', power: 40, accuracy: 100, pp: 35, effect: 'hit' });
    expect(MOVES['growl']).toMatchObject({ category: 'status', effect: 'attack_down', target: 'both' });
    expect(MOVES['fire-punch']!.category).toBe('physical');
    expect(MOVES['shadow-ball']!.category).toBe('special');
    expect(MOVES['close-combat']).toMatchObject({ type: 'fighting', power: 120, category: 'physical' });
    expect(MOVES['quick-attack']!.priority).toBe(1);
    expect(MOVES['tackle']!.flags).toContain('makes_contact');
    // Kanto's keys for the same moves.
    for (const k of ['smokescreen', 'self-destruct', 'soft-boiled', 'thunder-punch', 'vice-grip']) expect(MOVES[k], k).toBeDefined();
  });

  it('resolves every move, item, ability and species the tables name', () => {
    const species = (id: number) => id >= 1 && id <= SPECIES.length;
    for (const s of SPECIES) {
      for (const [, m] of s.learnset) expect(MOVES[m], `${s.key}: ${m}`).toBeDefined();
      for (const a of s.abilities) expect(ABILITY_NAMES[a], a).toBeDefined();
      for (const e of s.evolutions) {
        expect(species(e.into)).toBe(true);
        if (e.item) expect(ITEMS[e.item], e.item).toBeDefined();
        if (e.move) expect(MOVES[e.move], e.move).toBeDefined();
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
    for (const lists of Object.values(MART_CLERKS)) for (const l of lists) expect(l === 'badges' || l in MARTS, l).toBe(true);
    const tables = Object.values(ENCOUNTERS).flatMap((t) => Object.values(t).filter((v) => typeof v === 'object') as EncounterSlots[]);
    for (const t of Object.values(ENCOUNTERS)) if (t.nightFish) expect(species(t.nightFish)).toBe(true);
    for (const t of tables) {
      for (const [, , d] of [...t.mons, ...(t.morning ?? []), ...(t.night ?? [])]) expect(species(d)).toBe(true);
      for (const slots of Object.values(t.soulSilver ?? {})) for (const [slot, , , d] of slots) expect(slot < t.mons.length && species(d)).toBe(true);
    }
  });

  it("has HeartGold's wild tables, by time of day, with SoulSilver's Pokémon", () => {
    const route29 = ENCOUNTERS['R29']!.land!;
    expect(route29.rate).toBe(25);
    expect(route29.mons).toHaveLength(12);
    expect(route29.mons.map(([, , d]) => d)).toContain(16); // Pidgey by day
    expect(route29.night!.map(([, , d]) => d)).toContain(163); // Hoothoot at night
    expect(route29.soulSilver).toBeDefined();
    expect(ENCOUNTERS['D24R0101']!.water).toBeDefined(); // Union Cave
  });

  it("has the gym leaders' and the League's parties", () => {
    const falkner = TRAINERS['leader-falkner']!;
    expect(falkner).toMatchObject({ class: 'Leader', name: 'Falkner' });
    expect(falkner.party.map((p) => [p.species, p.level])).toEqual([[16, 9], [17, 13]]);
    expect(falkner.party[1]!.moves).toContain('roost');
    expect(TRAINERS['leader-whitney']!.party.at(-1)!.species).toBe(241);
    expect(TRAINERS['youngster-joey']!.party).toEqual([{ species: 19, level: 4, iv: 0 }]);
    expect(TRAINERS['youngster-joey']!.money).toBe(4);
    expect(TRAINERS['twins-amy-and-mimi']!.double).toBe(true);
  });

  it('has the marts by badge count, and Gen 4 items', () => {
    expect(MARTS['badges-0']).toEqual(['poke-ball', 'potion', 'antidote', 'paralyze-heal']);
    expect(MARTS['badges-8']).toContain('full-restore');
    expect(ITEMS['leftovers']).toMatchObject({ hold: 'hp_restore_gradual', holdParam: 10, flingPower: 10 });
    expect(ITEMS['sitrus-berry']!.naturalGift).toEqual([60, 'psychic']);
    expect(Object.keys(TM_MOVES)).toHaveLength(100);
    expect(TM_MOVES['tm01']).toBe('focus-punch');
    expect(TM_MOVES['hm08']).toBe('rock-climb');
  });

  it("has Gen 4's type chart", () => {
    const mul = (a: string, d: string) => TYPE_CHART.find(([x, y, , lifted]) => x === a && y === d && !lifted)?.[2] ?? 1;
    expect(mul('fire', 'grass')).toBe(2);
    expect(mul('electric', 'ground')).toBe(0);
    expect(mul('steel', 'steel')).toBe(0.5);
    expect(TYPE_CHART.some(([a, d, m, lifted]) => a === 'normal' && d === 'ghost' && m === 0 && lifted)).toBe(true);
  });
  // Johto's areas (data/gen2/areas.ts and maps.ts, tools/idle/johto_areas.py; issue #170, step 4b).
  it("walks Johto's main road from New Bark Town to Lance, every reference resolving", () => {
    const walks = JOHTO_AREAS.filter((a): a is WalkArea => a.kind !== 'town');
    const towns = JOHTO_AREAS.filter((a): a is TownArea => a.kind === 'town');
    expect(JOHTO_AREAS[0]!.id).toBe('route-29');
    expect(JOHTO_AREAS.at(-1)).toMatchObject({ id: 'lance', kind: 'league', leader: 'champion-lance' });
    expect(walks.filter((a) => a.kind === 'gym').map((a) => a.leader)).toEqual(['leader-falkner', 'leader-bugsy', 'leader-whitney', 'leader-morty', 'leader-chuck', 'leader-jasmine', 'leader-pryce', 'leader-clair']);
    expect(new Set(JOHTO_AREAS.map((a) => a.id)).size).toBe(JOHTO_AREAS.length);
    for (const a of walks) {
      for (const l of a.legs) {
        for (const m of l.maps) expect(JOHTO_MAPS[m], `${a.id}: ${m}`).toBeDefined();
        expect(l.track.length, a.id).toBeGreaterThan(0);
        l.track.forEach(([mi, x, y], i) => {
          const m = JOHTO_MAPS[l.maps[mi]!]!;
          expect(x >= 0 && y >= 0 && x < m.width && y < m.height, `${a.id} step ${i}`).toBe(true);
        });
      }
      for (const t of a.trainers) expect(TRAINERS[t.key], `${a.id}: ${t.key}`).toBeDefined();
      // Gyms and League rooms end at their boss, met last.
      if (a.leader) expect(a.trainers.at(-1)!.key).toBe(a.leader);
    }
    for (const t of towns) {
      expect(JOHTO_MAPS[t.map]).toBeDefined();
      expect(JOHTO_MAPS[t.mart.map]).toBeDefined();
      for (const m of t.marts) expect(m === 'badges' || m in MARTS, `${t.id}: ${m}`).toBe(true);
      if (t.gym) expect(JOHTO_AREAS.some((a) => a.id === t.gym)).toBe(true);
    }
    for (const m of Object.values(JOHTO_MAPS)) if (m.encounters) expect(ENCOUNTERS[m.encounters], m.name).toBeDefined();
  });
});
