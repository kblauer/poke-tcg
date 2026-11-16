import { describe, expect, it } from 'vitest';
import { areas, legendOf, mapView, type WalkArea } from './areas.js';
import { species } from './data.js';
import { generation, inGeneration } from './generation.js';
import { applyIdleAction, catchUp, createIdleRun, DEFAULT_IDLE_SETTINGS, legendError, runLegendOf, simulateSegment, starters, wildSpots, type IdleState, type SegmentEvent } from './idle.js';

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
      const prizes: { amount: number; why: string }[] = [];
      const weathers = new Set<string>();
      for (let i = 0; i < 30000 && s.phase !== 'won'; i++) {
        const n = simulateSegment(s, DEFAULT_IDLE_SETTINGS, caught);
        expect(n).not.toBeNull();
        ms += n!.segment.durationMs;
        for (const e of n!.segment.events) if (e.t === 'money' && e.why !== 'Pay Day') prizes.push(e);
        for (const e of n!.segment.events) if (e.t === 'battle') for (const b of e.events) if (b.t === 'weather' && b.weather) weathers.add(b.weather);
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
      // Only Kanto's 8th badge gives a Master Ball.
      expect(s.bag['master-ball'], how).toBeUndefined();
      // The first prize: the class's ₱ a level × its last Pokémon's level (a quarter of Emerald's, as Kanto's are of FireRed's).
      const first = inGeneration(3, () => Object.values(generation().trainers).find((t) => prizes[0]!.why === `${t.class} ${t.name}`))!;
      expect(prizes[0]!.amount, how).toBe(first.money * first.party.at(-1)!.level);
      // Route 111's desert edge and Route 120's rain spots: some battle in the map's weather.
      expect(weathers.size, how).toBeGreaterThan(0);
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

  it('catches up offline: an hour away plays an hour of the run', () => {
    const offline = catchUp(createIdleRun({ species: 258 }, 8, 3), DEFAULT_IDLE_SETTINGS, new Set(), 60 * 60 * 1000);
    expect(offline.summary.battles).toBeGreaterThan(10);
    expect(offline.state.gen).toBe(3);
  });
});

// The 'Later' list (the user's, 2026-11-15): the places off the main road, every Pokémon, the legendaries.
describe("Hoenn's Pokémon", () => {
  const index = (id: string) => inGeneration(3, () => areas().findIndex((a) => a.id === id));
  const BADGES = ['Stone', 'Knuckle', 'Dynamo', 'Heat', 'Balance', 'Feather', 'Mind', 'Rain'];

  // Emerald's Hoenn Pokédex (include/constants/pokedex.h's HOENN_DEX_ order: its 202), by national number: Treecko to
  // Deoxys (252–386) and these.
  const HOENN_DEX = [
    ...[25, 26, 27, 28, 37, 38, 39, 40, 41, 42, 43, 44, 45, 54, 55, 63, 64, 65, 66, 67, 68, 72, 73, 74, 75, 76, 81, 82, 84, 85, 88, 89, 100, 101, 109, 110, 111, 112],
    ...[116, 117, 118, 119, 120, 121, 127, 129, 130, 169, 170, 171, 172, 174, 177, 178, 182, 183, 184, 202, 203, 214, 218, 219, 222, 227, 230, 231, 232],
    ...Array.from({ length: 386 - 251 }, (_, i) => 252 + i),
  ];

  it("offer every Hoenn Pokédex Pokémon but the event-only Jirachi and Deoxys: wild, extra slots, fished (Feebas too), the starters and legendaries, or evolving from one", () => {
    inGeneration(3, () => {
      expect(HOENN_DEX.length).toBe(202);
      const got = new Set<number>(starters());
      areas().forEach((_, i) => {
        const legend = legendOf(i);
        if (legend) got.add(legend.species);
        for (const spot of wildSpots(i)) {
          const [map, kind] = spot.id.split(':');
          const table = generation().encounters[mapView(map!).encounters]![kind === 'f' ? 'fishing' : kind === 'w' ? 'water' : 'land']!;
          [...table.mons, ...(table.extra ?? [])].forEach(([, , id]) => got.add(id));
          // Route 119's fishing spot is one of Emerald's Feebas tiles (idle.ts's FEEBAS_MAP).
          if (spot.id === 'Route119:f') got.add(349);
        }
      });
      // A species is had when it or what it evolves from is (Lilycove's stones are sold, and trades evolve by level).
      const from = new Map(generation().species.flatMap((s) => s.evolutions.map((e) => [e.into, s.id] as const)));
      const had = (id: number): boolean => got.has(id) || (from.has(id) && had(from.get(id)!));
      // Jirachi and Deoxys, the event-only ones (the user's).
      expect(HOENN_DEX.filter((id) => !had(id)).map((id) => species(id).name)).toEqual(['Jirachi', 'Deoxys']);
    });
  });

  it('roll Latias or Latios once a run for Southern Island (the other not there), Hoenn only', () => {
    const eons = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) eons.add(createIdleRun({ species: 252 }, seed, 3).eon!);
    expect([...eons].sort()).toEqual([380, 381]);
    expect(createIdleRun({ species: 1 }, 1, 1).eon).toBeUndefined();
    expect(createIdleRun({ species: 152 }, 1, 2).eon).toBeUndefined();
    inGeneration(3, () => {
      expect(runLegendOf({ eon: 380 }, index('latias'))!.species).toBe(380);
      expect(runLegendOf({ eon: 380 }, index('latios'))).toBeNull();
      expect(runLegendOf({ eon: 381 }, index('latios'))!.species).toBe(381);
      expect(runLegendOf({ eon: 381 }, index('groudon'))!.species).toBe(383);
    });
  });

  it('open the legendaries from Ever Grande City; walked up to and battled at their level, then back to Ever Grande City', () => {
    inGeneration(3, () => {
      const base = createIdleRun({ species: 258 }, 4, 3);
      const mossdeep: IdleState = { ...base, area: index('mossdeep-city'), phase: 'town', reached: index('mossdeep-city'), badges: BADGES.slice(0, 6) };
      expect(legendError(mossdeep, index('groudon'))).toBe('Reach Ever Grande City first');
      const town: IdleState = { ...base, area: index('ever-grande-city'), phase: 'town', reached: index('ever-grande-city'), badges: BADGES, party: [{ ...base.party[0]!, level: 100 }] };
      const other = base.eon === 380 ? 'latios' : 'latias';
      expect(legendError(town, index(other))).toBe('No legendary Pokémon there');
      const r = applyIdleAction(town, { type: 'LEGEND', area: index('regirock') });
      if (!r.ok) throw new Error(r.error);
      let s = r.state;
      const events: SegmentEvent[] = [];
      for (let i = 0; i < 10 && s.phase !== 'town'; i++) {
        const next = simulateSegment(s, DEFAULT_IDLE_SETTINGS, new Set())!;
        events.push(...next.segment.events);
        s = next.state;
      }
      const fights = events.filter((e): e is Extract<SegmentEvent, { t: 'battle' }> => e.t === 'battle');
      expect(fights.map((f) => f.foes[0])).toEqual([{ species: 377, level: 40 }]);
      expect(s).toMatchObject({ area: index('ever-grande-city'), phase: 'town' });
      if (['won', 'caught'].includes(fights[0]!.result)) expect(legendError(s, index('regirock'))).toBe('Regirock is gone');
    });
  });

  it("meet the extra slots' Pokémon while grinding (Granite Cave B2F's Nosepass, the Rock Smash one)", () => {
    inGeneration(3, () => {
      const base = createIdleRun({ species: 255 }, 5, 3);
      const dewford: IdleState = { ...base, area: index('dewford-town'), phase: 'town', reached: index('dewford-town'), badges: BADGES.slice(0, 1), party: [{ ...base.party[0]!, level: 100 }] };
      const r = applyIdleAction(dewford, { type: 'GRIND_AT', area: index('granite-cave'), kind: 'wild', spot: 'GraniteCave_B2F:l' });
      if (!r.ok) throw new Error(r.error);
      let s = r.state;
      const seen = new Set<number>();
      for (let i = 0; i < 150 && !seen.has(299); i++) {
        const next = simulateSegment(s, { ...DEFAULT_IDLE_SETTINGS, autoCatch: 'off', autoGrind: false }, new Set())!;
        for (const e of next.segment.events) if (e.t === 'battle') e.foes.forEach((f) => seen.add(f.species));
        s = next.state;
      }
      expect(seen.has(299)).toBe(true);
    });
  });
});
