import { describe, expect, it } from 'vitest';
import { areaById, areas, type TownArea } from './areas.js';
import { catchTextFrame, HGSS_SHAKES_AT, INTRO_MS, introMs } from './battle-timing.js';
import { leavesShedinja, levelEvolution, stoneEvolution } from './evolution.js';
import { inGeneration } from './generation.js';
import { applyIdleAction, catchUp, createIdleRun, DEFAULT_IDLE_SETTINGS, simulateSegment, storeStock, tmShopOpen, type IdleState } from './idle.js';
import { createMon } from './mon.js';
import { rngFrom } from '@poke-tcg/campaign';

// A Johto run (issue #170, step 4e): HGSS's evolutions, Johto's stores and prizes, and whole runs to Lance.
const johto = <T>(run: () => T) => inGeneration(2, run);

describe("Johto's evolutions", () => {
  it('evolves by a known move, gender, Tyrogue\'s stats, a party member and the set levels', () => {
    johto(() => {
      // Aipom into Ambipom knowing Double Hit.
      expect(levelEvolution({ species: 190, level: 30, moves: ['scratch'] })).toBeNull();
      expect(levelEvolution({ species: 190, level: 30, moves: ['double-hit'] })).toBe(424);
      // Combee into Vespiquen only as a female.
      expect(levelEvolution({ species: 415, level: 21, gender: 'male' })).toBeNull();
      expect(levelEvolution({ species: 415, level: 21, gender: 'female' })).toBe(416);
      // Tyrogue by Attack against Defense (Hitmonlee, Hitmonchan, Hitmontop).
      expect(levelEvolution({ species: 236, level: 20, ivs: [0, 31, 0, 0, 0, 0], evs: [0, 0, 0, 0, 0, 0], nature: 0 })).toBe(106);
      // Mantyke with a Remoraid in the party.
      expect(levelEvolution({ species: 458, level: 10 }, { party: [{ species: 458 }] })).toBeNull();
      expect(levelEvolution({ species: 458, level: 10 }, { party: [{ species: 458 }, { species: 223 }] })).toBe(226);
      // The set levels (the user's): Golbat into Crobat at 35; Onix into Steelix at 35; Eevee by the time of day at 25.
      expect(levelEvolution({ species: 42, level: 34 })).toBeNull();
      expect(levelEvolution({ species: 42, level: 35 })).toBe(169);
      expect(levelEvolution({ species: 95, level: 35 })).toBe(208);
      expect(levelEvolution({ species: 133, level: 25 }, { time: 'day' })).toBe(196);
      expect(levelEvolution({ species: 133, level: 25 }, { time: 'night' })).toBe(197);
      // Sneasel into Weavile only at night.
      expect(levelEvolution({ species: 215, level: 35 }, { time: 'day' })).toBeNull();
      expect(levelEvolution({ species: 215, level: 35 }, { time: 'night' })).toBe(461);
      // Nincada leaves a Shedinja; the Dawn Stone by gender.
      expect(leavesShedinja(290)).toBe(true);
      expect(stoneEvolution({ species: 281, gender: 'male' }, 'dawn-stone')).toBe(475);
      expect(stoneEvolution({ species: 281, gender: 'female' }, 'dawn-stone')).toBeNull();
    });
  });
});

describe("Johto's battle timing", () => {
  it("counts HGSS's frames (step 5), Kanto's FireRed's as they were", () => {
    const kanto = [catchTextFrame(3, true), catchTextFrame(1, false), introMs('wild'), introMs('trainer')];
    expect(kanto[2]).toBe(INTRO_MS);
    johto(() => {
      // The shakes from the throw's 16, the open's 40 and the fall's 39; 32, 32 and 37 each; the click and its stars.
      expect(HGSS_SHAKES_AT).toBe(16 + 40 + 8 + 11 + 20);
      expect(catchTextFrame(3, true)).toBe(HGSS_SHAKES_AT + 32 + 32 + 37 + 12 + 22);
      expect(catchTextFrame(1, false)).toBe(HGSS_SHAKES_AT + 32 + 25);
      expect(introMs('wild')).toBeGreaterThan(introMs('trainer'));
    });
    expect([catchTextFrame(3, true), catchTextFrame(1, false), introMs('wild'), introMs('trainer')]).toEqual(kanto);
  });
});

describe("Johto's run", () => {
  it('sets off from New Bark Town', () => {
    expect(createIdleRun({ species: 152 }, 1, 2).log[0]).toBe('Set off from New Bark Town with Chikorita.');
  });

  it("sells by the badges (HGSS's Poké Mart tiers) and TMs from Goldenrod City on", () => {
    johto(() => {
      const run = createIdleRun({ species: 152 }, 1, 2);
      const violet = areaById('violet-city') as TownArea;
      const at = (badges: string[], area = 'violet-city'): Pick<IdleState, 'reached' | 'area' | 'loop' | 'badges'> => ({ ...run, badges, area: areas().findIndex((a) => a.id === area), reached: areas().findIndex((a) => a.id === area) });
      expect(storeStock(violet, at([]))).not.toContain('great-ball');
      expect(storeStock(violet, at([]))).toContain('net-ball');
      expect(storeStock(violet, at(['Zephyr', 'Hive', 'Plain']))).toContain('great-ball');
      expect(tmShopOpen(at([], 'azalea-town'))).toBe(false);
      expect(tmShopOpen(at([], 'goldenrod-city'))).toBe(true);
      // The evolution stones at Goldenrod's Department Store (the user's, 2026-11-15: HGSS's marts sell none), and only there.
      const goldenrod = areaById('goldenrod-city') as TownArea;
      const stones = ['fire-stone', 'thunder-stone', 'water-stone', 'leaf-stone', 'moon-stone', 'sun-stone', 'shiny-stone', 'dusk-stone', 'dawn-stone'];
      expect(storeStock(goldenrod, at([], 'goldenrod-city'))).toEqual(expect.arrayContaining(stones));
      expect(storeStock(violet, at([]))).not.toContain('fire-stone');
    });
  });

  it('plays a whole run to Lance, and catches up offline', () => {
    let s: IdleState = createIdleRun({ species: 158 }, 5, 2);
    const caught = new Set<number>();
    const prizes: number[] = [];
    const hours = new Set<number>();
    for (let i = 0; i < 12000 && s.phase !== 'won'; i++) {
      const n = simulateSegment(s, DEFAULT_IDLE_SETTINGS, caught);
      expect(n).not.toBeNull();
      for (const e of n!.segment.events) if (e.t === 'money' && e.why.startsWith('Youngster Joey')) prizes.push(e.amount);
      for (const e of n!.segment.events) if (e.t === 'battle') hours.add(e.hour!);
      for (const d of n!.segment.dex) if (d.caught) caught.add(d.species);
      s = n!.state;
    }
    expect(s.phase).toBe('won');
    expect(s.badges).toEqual(['Zephyr', 'Hive', 'Plain', 'Fog', 'Storm', 'Mineral', 'Glacier', 'Rising']);
    // Only Kanto's 8th badge gives a Master Ball.
    expect(s.bag['master-ball']).toBeUndefined();
    // The prize: Joey's Rattata at level 4, ₱4 a level (a quarter of HGSS's, as Kanto's are of FireRed's).
    expect(prizes[0]).toBe(4 * 4);
    // Each battle has its hour on the run's clock (its background's palette), and the day goes round.
    expect([...hours].every((h) => h >= 0 && h < 24)).toBe(true);
    expect(hours.size).toBe(24);
    const offline = catchUp(createIdleRun({ species: 152 }, 6, 2), DEFAULT_IDLE_SETTINGS, new Set(), 60 * 60 * 1000);
    expect(offline.state.clock).toBeGreaterThan(50 * 60 * 1000);
    expect(offline.summary.battles).toBeGreaterThan(10);
  }, 60000);

  // A Trainer grind holds until Continue run (the agreed rule), whatever the time of day: a route with a trainer there only
  // at night (Policeman Keith in Ilex Forest, Route 35's) went on to the next gym by day (#204).
  it('keeps a Trainer grind on a route with a night-only trainer going over a whole day', () => {
    for (const id of ['ilex-forest', 'route-35']) {
      const index = johto(() => areas().findIndex((a) => a.id === id));
      const base = createIdleRun({ species: 155 }, 4, 2);
      const party = [johto(() => createMon(rngFrom(1), { species: 157, level: 100 }))];
      const start: IdleState = { ...base, area: index, leg: 0, step: 0, phase: 'walking', beaten: [], party, reached: index, progress: { area: index, leg: 0, step: 0, beaten: [] } };
      const r = applyIdleAction(start, { type: 'TRAINER_GRIND' });
      expect(r.ok, id).toBe(true);
      let s = (r as { state: IdleState }).state;
      const caught = new Set<number>();
      for (let i = 0; i < 20000 && (s.clock ?? 0) < 3 * 60 * 60 * 1000; i++) {
        const n = simulateSegment(s, { ...DEFAULT_IDLE_SETTINGS, autoGrind: false }, caught)!;
        expect(n.segment.durationMs, id).toBeGreaterThan(0);
        s = n.state;
        expect(s.area, `${id} after ${i} segments, ${s.log.at(-1)}`).toBe(index);
        expect(s.loop, id).toBeDefined();
      }
      expect(s.clock, id).toBeGreaterThanOrEqual(3 * 60 * 60 * 1000);
    }
  }, 60000);

  // Step 7 (issue #170): whole runs with each starter, as a player who leaves it be (towns going on by themselves,
  // auto-grind on), each winning; and their time and white-outs within what Kanto's take (README: Idle Adventure, Johto's
  // balance: 31–51 hours of play, 25–30 white-outs, Kanto's 40–57 and 12–25).
  it('wins with every starter, in a Kanto-like time', () => {
    for (const [species, seed] of [[152, 3], [155, 1], [158, 2]] as const) {
      let s: IdleState = createIdleRun({ species }, seed, 2);
      const caught = new Set<number>();
      let ms = 0;
      for (let i = 0; i < 20000 && s.phase !== 'won'; i++) {
        const n = simulateSegment(s, DEFAULT_IDLE_SETTINGS, caught)!;
        ms += n.segment.durationMs;
        for (const d of n.segment.dex) if (d.caught) caught.add(d.species);
        s = n.state;
      }
      const how = `${species} seed ${seed}: ${s.phase}, ${(ms / 3600000).toFixed(1)} hours, ${s.totals.whiteOuts} white-outs`;
      expect(s.phase, how).toBe('won');
      expect(ms / 3600000, how).toBeLessThan(70);
      expect(s.totals.whiteOuts, how).toBeLessThan(60);
    }
  }, 120000);
});
