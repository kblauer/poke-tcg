import { rngFrom } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { fishBite4, pickWild4, timeOfDay, wildCheck4, type EncounterState4 } from './encounters4.js';
import { inGeneration } from './generation.js';
import { createIdleRun, DEFAULT_IDLE_SETTINGS, hourOf, rodList, simulateSegment, timeOfDayOf, type IdleState } from './idle.js';
import { areas, type WalkArea } from './areas.js';
import { createMon } from './mon.js';
import type { EncounterTable, Mon } from './types.js';

// HGSS's wild encounters (encounters4.ts, issue #170, step 4d; pokeheartgold's encounter_check.c) and the run's play clock.
const johto = <T>(run: () => T) => inGeneration(2, run);
// A lead with an ability: a species with it in its first slot.
const lead = (id: number, level = 30, o: Partial<Mon> = {}): Mon => johto(() => ({ ...createMon(rngFrom(1), { species: id, level }), abilitySlot: 0, ...o }));
const PIDGEY = 16; // Keen Eye
const MAGNEMITE = 81; // Magnet Pull
const DIGLETT = 50; // Sand Veil (no field effect in HGSS)
const DUGTRIO_ARENA = 51; // Arena Trap is Dugtrio's second ability
const MACHOP = 66; // Guts
const ABRA = 63; // Synchronize
const CLEFAIRY = 35; // Cute Charm
const MANKEY = 56; // Vital Spirit

/** A land table of 12 slots, one species and level each (the day's), with a morning and night species. */
const LAND: EncounterTable = {
  land: { rate: 25, mons: Array.from({ length: 12 }, (_, i) => [3 + i, 3 + i, i === 11 ? 81 : 19] as [number, number, number]), morning: Array.from({ length: 12 }, () => [5, 5, 16]), night: Array.from({ length: 12 }, () => [5, 5, 163]) },
  goodRod: { rate: 50, mons: [[20, 20, 129], [20, 20, 129], [20, 20, 129], [20, 20, 129], [20, 20, 129]] },
  nightFish: 98,
};

const tally = (n: number, f: (seed: number) => unknown) => {
  const counts = new Map<unknown, number>();
  for (let i = 0; i < n; i++) {
    const v = f(i);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
};

describe("HGSS's wild encounters", () => {
  it('has the time of day bands of GF_RTC_GetTimeOfDayWildParamByHour', () => {
    expect([0, 3, 4, 9, 10, 19, 20, 23].map(timeOfDay)).toEqual(['night', 'night', 'morning', 'morning', 'day', 'day', 'night', 'night']);
  });

  it('never meets one in the 3 steps after a map change or battle, then 40% × the rate', () => {
    const l = lead(MACHOP);
    const enc = (steps: number): EncounterState4 => ({ steps, buff: 0, prev: 'm' });
    for (const steps of [0, 1, 2, 3]) expect(tally(200, (s) => wildCheck4(rngFrom(s), enc(steps), 100, l, undefined)).get(true)).toBeUndefined();
    const met = tally(20000, (s) => wildCheck4(rngFrom(s), enc(10), 25, l, undefined)).get(true)!;
    expect(met / 20000).toBeGreaterThan(0.085);
    expect(met / 20000).toBeLessThan(0.115);
  });

  it("doubles the rate for Arena Trap, not for Sand Veil (no field effect in HGSS), and counts turns back", () => {
    const n = 20000;
    const rate = (l: Mon) => tally(n, (s) => wildCheck4(rngFrom(s), { steps: 10, buff: 0, prev: 'm' }, 25, l, undefined)).get(true)! / n;
    expect(rate(lead(DUGTRIO_ARENA, 30, { abilitySlot: 1 }))).toBeGreaterThan(0.18);
    expect(rate(lead(DIGLETT))).toBeLessThan(0.115);
    const enc: EncounterState4 = { steps: 10, buff: 0, prev: 'm' };
    for (const face of ['left', 'right', 'left', 'right']) wildCheck4(rngFrom(1), enc, 0, lead(MACHOP), face);
    expect(enc.buff).toBe(3);
    wildCheck4(rngFrom(1), enc, 0, lead(MACHOP), 'up');
    expect(enc.buff).toBe(3);
  });

  it("takes land's slots by the time of day, the slot's own level, and the night's fished Pokémon at night", () => {
    johto(() => {
      const l = lead(MACHOP);
      expect([...tally(300, (s) => pickWild4(rngFrom(s), 'land', LAND, l, 'morning')!.species).keys()]).toEqual([16]);
      expect([...tally(300, (s) => pickWild4(rngFrom(s), 'land', LAND, l, 'night')!.species).keys()]).toEqual([163]);
      for (let s = 0; s < 300; s++) {
        const w = pickWild4(rngFrom(s), 'land', LAND, l, 'day')!;
        expect(w.level).toBe(LAND.land!.mons.find((m) => m[2] === w.species && m[0] === w.level)![0]);
      }
      const night = tally(2000, (s) => pickWild4(rngFrom(s), 'goodRod', LAND, l, 'night')!.species);
      expect(night.get(98)! / 2000).toBeGreaterThan(0.07);
      expect(tally(300, (s) => pickWild4(rngFrom(s), 'goodRod', LAND, l, 'day')!.species).has(98)).toBe(false);
    });
  });

  it('has the lead abilities: Magnet Pull, Keen Eye, Vital Spirit, Synchronize, Cute Charm', () => {
    johto(() => {
      // Magnet Pull: half the time one of the Steel slots (only slot 11, 1% by the odds).
      const magnets = tally(2000, (s) => pickWild4(rngFrom(s), 'land', LAND, lead(MAGNEMITE), 'day')!.species).get(81)!;
      expect(magnets / 2000).toBeGreaterThan(0.45);
      // Keen Eye at level 30: half the Pokémon 5 or more levels below it scared off (all here).
      const off = tally(2000, (s) => pickWild4(rngFrom(s), 'land', LAND, lead(PIDGEY, 30), 'day')).get(null)!;
      expect(off / 2000).toBeGreaterThan(0.45);
      expect(off / 2000).toBeLessThan(0.55);
      expect(tally(200, (s) => pickWild4(rngFrom(s), 'land', LAND, lead(PIDGEY, 5), 'day')).has(null)).toBe(false);
      // Vital Spirit: half the time the species' highest slot level (Pidgey's: 13).
      const pidgeys = Array.from({ length: 2000 }, (_, s) => pickWild4(rngFrom(s), 'land', LAND, lead(MANKEY), 'day')!).filter((w) => w.species === 19);
      expect(pidgeys.filter((w) => w.level === 13).length / pidgeys.length).toBeGreaterThan(0.45);
      // Synchronize: half the time the lead's nature.
      const abra = lead(ABRA, 30, { nature: 7 });
      expect(tally(2000, (s) => pickWild4(rngFrom(s), 'land', LAND, abra, 'day')!.nature).get(7)! / 2000).toBeGreaterThan(0.45);
      // Cute Charm: two times in three the other gender.
      const clefairy = lead(CLEFAIRY, 30, { gender: 'female' });
      expect(tally(3000, (s) => pickWild4(rngFrom(s), 'land', LAND, clefairy, 'day')!.gender).get('male')! / 3000).toBeGreaterThan(0.6);
    });
  });

  it("bites by the rod's rate, doubled for Sticky Hold or Suction Cups", () => {
    const table = LAND.goodRod!;
    const bites = (l: Mon) => tally(10000, (s) => fishBite4(rngFrom(s), table, l)).get(true)! / 10000;
    expect(bites(lead(MACHOP))).toBeGreaterThan(0.45);
    expect(bites(lead(MACHOP))).toBeLessThan(0.55);
    expect(bites(lead(88, 30, { abilitySlot: 1 }))).toBe(1); // Grimer's Sticky Hold
  });
});

describe("Johto's run clock", () => {
  it('starts at 10:00 and runs on by the segments played, a 2-hour day; Kanto has none', () => {
    let s: IdleState = createIdleRun({ species: 155 }, 3, 2);
    expect(johto(() => hourOf(s))).toBe(10);
    const caught = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const n = simulateSegment(s, DEFAULT_IDLE_SETTINGS, caught);
      if (!n) break;
      expect(n.state.clock).toBe((s.clock ?? 0) + n.segment.durationMs);
      s = n.state;
    }
    expect(s.clock).toBeGreaterThan(0);
    // An hour of play is 12 hours of the day.
    expect(johto(() => hourOf({ clock: 60 * 60 * 1000 }))).toBe(22);
    expect(johto(() => timeOfDayOf({ clock: 60 * 60 * 1000 }))).toBe('night');
    const kanto = simulateSegment(createIdleRun({ species: 1 }, 3), DEFAULT_IDLE_SETTINGS, caught)!;
    expect(kanto.state.clock).toBeUndefined();
    expect(hourOf(kanto.state)).toBeNull();
  });

  it("has Johto's rods: Route 32, Olivine City, the Indigo Plateau", () => {
    expect(johto(() => rodList().map((r) => r.town))).toEqual(['route-32', 'olivine-city', 'indigo-plateau']);
    expect(rodList().map((r) => r.town)).toEqual(['vermilion-city', 'fuchsia-city', 'cinnabar-island']);
  });

  it('meets Policeman Keith (Route 34) only at night, by the run clock', () => {
    const spotted = (clock: number) =>
      johto(() => {
        const index = areas().findIndex((a) => a.id === 'ilex-forest');
        const area = areas()[index] as WalkArea;
        const keith = area.trainers.find((t) => t.key === 'policeman-keith')!;
        expect(keith.night).toBe(true);
        const track = area.legs[keith.leg]!.track;
        const step = track.findIndex(([m, x, y]) => m === keith.map && keith.sight.some(([sx, sy]) => sx === x && sy === y));
        const s: IdleState = { ...createIdleRun({ species: 155 }, 1, 2), area: index, leg: keith.leg, step: step - 1, phase: 'walking', beaten: area.trainers.filter((t) => t !== keith).map((t) => t.key), clock };
        const events = simulateSegment(s, DEFAULT_IDLE_SETTINGS, new Set())!.segment.events;
        return events.some((e) => e.t === 'spotted' && e.trainer === 'policeman-keith');
      });
    expect(spotted(0)).toBe(false);
    expect(spotted(60 * 60 * 1000)).toBe(true);
  });
});
