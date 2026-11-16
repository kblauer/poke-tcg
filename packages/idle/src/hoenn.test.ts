import { describe, expect, it } from 'vitest';
import { areas, type WalkArea } from './areas.js';
import { generation, inGeneration } from './generation.js';
import { applyIdleAction, createIdleRun, DEFAULT_IDLE_SETTINGS, simulateSegment, wildSpots, type IdleState, type SegmentEvent } from './idle.js';

// A Hoenn run (issue #226, step 4): whole runs to Wallace on Emerald's main road, as Johto's to Lance (johto.test.ts).
describe("Hoenn's run", () => {
  it('sets off from Littleroot Town', () => {
    expect(createIdleRun({ species: 252 }, 1, 3).log[0]).toBe('Set off from Littleroot Town with Treecko.');
  });

  /** The highest level of an area's trainers (0 with none). */
  const topLevel = (area: number) => inGeneration(3, () => Math.max(0, ...(areas()[area] as WalkArea).trainers.map((t) => Math.max(...generation().trainers[t.key]!.party.map((p) => p.level)))));

  // With each starter, as a player who leaves it be (towns going on after their wait, auto-grind on) but for one thing:
  // a white-out on a route starts a wild grind there until Continue run (the user's), and Routes 105 to 109's surfed
  // trainers (24–27, the game's for after Norman's badge) white the run out there before Dewford's gym, so the player
  // presses Continue run once the grind has the party's highest up to the route's trainers'. Kanto's and Johto's runs
  // never need it.
  it('plays a whole run to Wallace with every starter', () => {
    for (const [species, seed] of [[252, 1], [255, 2], [258, 3]] as const) {
      let s: IdleState = createIdleRun({ species }, seed, 3);
      const caught = new Set<number>();
      let ms = 0;
      for (let i = 0; i < 30000 && s.phase !== 'won'; i++) {
        const n = simulateSegment(s, DEFAULT_IDLE_SETTINGS, caught);
        expect(n).not.toBeNull();
        ms += n!.segment.durationMs;
        for (const d of n!.segment.dex) if (d.caught) caught.add(d.species);
        s = n!.state;
        if (s.phase === 'walking' && s.loop?.kind === 'pace' && Math.max(...s.party.map((m) => m.level)) >= topLevel(s.area)) {
          const r = applyIdleAction(s, { type: 'CONTINUE_RUN' });
          if (r.ok) s = r.state;
        }
      }
      const how = `${species} seed ${seed}: ${s.phase}, ${(ms / 3600000).toFixed(1)} hours, ${s.totals.whiteOuts} white-outs`;
      expect(s.phase, how).toBe('won');
      expect(s.badges, how).toEqual(['Stone', 'Knuckle', 'Dynamo', 'Heat', 'Balance', 'Feather', 'Mind', 'Rain']);
      expect(ms / 3600000, how).toBeLessThan(90);
    }
  }, 180000);

  // Route 119's spot is one of Emerald's Feebas tiles (the user's, 2026-11-15): half the bites Feebas at 20–25; no other map's.
  it("fishes Feebas at Route 119's spot half the time, and nowhere else", () => {
    inGeneration(3, () => {
      const index = (id: string) => areas().findIndex((a) => a.id === id);
      const spots = wildSpots(index('route-118')).filter((s) => s.fish);
      const fished = (map: string) => {
        const spot = spots.find((s) => s.map === map)!;
        expect(spot, map).toBeDefined();
        const base = createIdleRun({ species: 252 }, 7, 3);
        let s: IdleState = { ...base, area: index('fortree-city'), phase: 'town', reached: index('fortree-city'), badges: ['Stone', 'Knuckle', 'Dynamo', 'Heat', 'Balance'], party: [{ ...base.party[0]!, level: 60 }] };
        const r = applyIdleAction(s, { type: 'GRIND_AT', area: index('route-118'), kind: 'wild', spot: spot.id });
        if (!r.ok) throw new Error(r.error);
        s = r.state;
        const foes: { species: number; level: number }[] = [];
        for (let i = 0; i < 60; i++) {
          const next = simulateSegment(s, { ...DEFAULT_IDLE_SETTINGS, autoGrind: false, autoCatch: 'off' }, new Set())!;
          const fight = next.segment.events.find((e): e is Extract<SegmentEvent, { t: 'battle' }> => e.t === 'battle');
          if (fight) foes.push(fight.foes[0]!);
          s = next.state;
        }
        return foes;
      };
      const feebas = fished('Route119').filter((f) => f.species === 349);
      expect(feebas.length).toBeGreaterThan(15);
      expect(feebas.length).toBeLessThan(45);
      for (const f of feebas) expect(f.level >= 20 && f.level <= 25).toBe(true);
      expect(fished('Route118').some((f) => f.species === 349)).toBe(false);
    });
  });

  // Mr. Briney's boat trips (the user's, 2026-11-15): Routes 105 to 109 crossed with no trainers and no wild Pokémon.
  it('crosses Routes 105 to 109 meeting no one', () => {
    inGeneration(3, () => {
      for (const id of ['route-105', 'route-107']) {
        const a = areas().find((x) => x.id === id) as WalkArea;
        expect(a.trainers, id).toEqual([]);
        for (const leg of a.legs) for (const step of leg.track) expect(step[4][0], id).toBe('.');
      }
    });
  });
});
