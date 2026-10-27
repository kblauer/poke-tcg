import { describe, expect, it } from 'vitest';
import { AREAS, isTown, type TownArea, type WalkArea } from './areas.js';
import { familyMovesUpTo } from './mon.js';
import type { BattleEvent } from './battle.js';
import { catchTextFrame, FRAME_MS, openingMs } from './battle-timing.js';
import { applyIdleAction, atProgress, BATTLE_HOLD_MS, BATTLE_MS, catchUp, cutSegment, mapGrindPlan, progressOf, reachedArea, travelError, createIdleRun, DEFAULT_IDLE_SETTINGS, FADE_MS, grindTarget, idleView, meetStep, modeOf, previousRoute, routeGrindPlan, starterOptions, TICK_MS, TOWN_WAIT_MS, simulateSegment, storeStock, topLevel, visitStore, type IdleSettings, type IdleState, type SegmentEvent } from './idle.js';

type BattleSeg = Extract<SegmentEvent, { t: 'battle' }>;

/** The settings with auto-grind off (it's on by default). */
const MANUAL: IdleSettings = { ...DEFAULT_IDLE_SETTINGS, autoGrind: false };

/** A player who goes into every gym and on, and keeps a few Potions and Poké Balls in the bag. */
function townChoice(state: IdleState): IdleState {
  const area = AREAS[state.area]!;
  if (!isTown(area)) return state;
  let s = state;
  const stock = storeStock(area);
  for (const [item, want] of [['potion', 5], ['super-potion', 5], ['poke-ball', 5], ['great-ball', 5]] as const) {
    if (!stock.includes(item) || (s.bag[item] ?? 0) >= want) continue;
    const r = applyIdleAction(s, { type: 'BUY', item, count: want - (s.bag[item] ?? 0) });
    if (r.ok) s = r.state;
  }
  const gym = applyIdleAction(s, { type: 'GYM' });
  if (gym.ok) return gym.state;
  const on = applyIdleAction(s, { type: 'CONTINUE' });
  if (!on.ok) throw new Error(on.error);
  return on.state;
}

function play(seed: number, settings: IdleSettings, maxSegments: number) {
  let state = createIdleRun({ species: [1, 4, 7][seed % 3]! }, seed);
  const caught = new Set<number>();
  let segments = 0;
  // A route grind (a white-out starts one): the player presses Continue route once the best Pokémon is 2 levels up.
  let grindFrom: number | null = null;
  while (state.phase !== 'won' && segments < maxSegments) {
    if (state.phase === 'town') {
      state = visitStore(state, settings).state;
      state = townChoice(state);
      continue;
    }
    if (!state.loop) grindFrom = null;
    else if (grindFrom === null) grindFrom = topLevel(state.party);
    else if (topLevel(state.party) >= grindFrom + 2) {
      const on = applyIdleAction(state, { type: 'CONTINUE_ROUTE' });
      if (on.ok) state = on.state;
      grindFrom = null;
    }
    const next = simulateSegment(state, settings, caught);
    if (!next) break;
    state = next.state;
    segments++;
  }
  return { state, segments };
}

describe('an idle run', () => {
  it('starts with a level-5 starter and the game\'s money', () => {
    const s = createIdleRun({ species: 4 }, 1);
    expect(s.party).toHaveLength(1);
    expect(s.party[0]!.level).toBe(5);
    expect(s.party[0]!.moves).toEqual(['scratch', 'growl']);
    expect(s.money).toBe(3000);
    expect(s.rivalStarter).toBe('squirtle');
  });

  it('is deterministic for a seed', () => {
    const a = play(5, DEFAULT_IDLE_SETTINGS, 60);
    const b = play(5, DEFAULT_IDLE_SETTINGS, 60);
    expect(a.state).toEqual(b.state);
  });

  // A whole run, a town's choices made by a player who always goes on: it must reach the Champion (however many white-outs).
  it('plays to the Champion', { timeout: 120000 }, () => {
    for (const seed of [1, 2]) {
      const { state, segments } = play(seed, DEFAULT_IDLE_SETTINGS, 40000);
      const how = `seed ${seed}: ${state.phase} in ${AREAS[state.area]!.id} after ${segments} segments, ${state.totals.whiteOuts} white-outs`;
      expect(state.phase, how).toBe('won');
      expect(state.badges).toHaveLength(8);
    }
  });

  it('plays to the Champion with auto-grind, each gym at its highest level or more', { timeout: 120000 }, () => {
    const { state, segments } = play(3, { ...DEFAULT_IDLE_SETTINGS, autoGrind: true }, 40000);
    expect(state.phase, `${state.phase} in ${AREAS[state.area]!.id} after ${segments} segments`).toBe('won');
    expect(topLevel(state.party)).toBeGreaterThanOrEqual(grindTarget(AREAS.findIndex((a) => a.id === 'indigo-plateau'), state.rivalStarter)!);
  });

  it('catches up offline until a town', () => {
    const s = createIdleRun({ species: 7 }, 9);
    const { state, summary } = catchUp(s, DEFAULT_IDLE_SETTINGS, new Set(), 60 * 60 * 1000, 1000);
    expect(summary.battles).toBeGreaterThan(0);
    expect(state.phase === 'town' || summary.stopped === 'time').toBe(true);
  });

  it('catches up nothing a moment after starting: only whole segments that fit in the time away', () => {
    const s = createIdleRun({ species: 4 }, 3);
    expect(catchUp(s, DEFAULT_IDLE_SETTINGS, new Set(), 1000).summary.segments).toBe(0);
    const first = simulateSegment(s, DEFAULT_IDLE_SETTINGS, new Set())!.segment.durationMs;
    expect(catchUp(s, DEFAULT_IDLE_SETTINGS, new Set(), first - 1).summary.segments).toBe(0);
    expect(catchUp(s, DEFAULT_IDLE_SETTINGS, new Set(), first).summary.segments).toBe(1);
  });

  it("starts coming out of Professor Oak's lab in Pallet Town, then walks Route 1", () => {
    const s = createIdleRun({ species: 1 }, 1);
    const leg = (AREAS[s.area] as WalkArea).legs[s.leg]!;
    expect(leg.maps[leg.track[s.step]![0]]).toBe('PalletTown');
    expect(leg.track[s.step]!.slice(1, 3)).toEqual([16, 13]);
    expect(leg.maps.at(-1)).toBe('Route1');
  });

  it('has a grind loop before every gym: a ring of wild encounter tiles, each a step from the next', () => {
    for (const town of AREAS.filter(isTown).filter((t) => t.gym)) {
      const grind = town.grind!;
      expect(grind, town.id).toBeDefined();
      // The area walked just before the town.
      expect(AREAS[AREAS.indexOf(town) - 1]!.id, town.id).toBe(grind.area);
      const loop = grind.loop;
      expect(loop.length, town.id).toBeGreaterThanOrEqual(4);
      loop.forEach(([m, x, y, , tile], i) => {
        const [nm, nx, ny] = loop[(i + 1) % loop.length]!;
        expect(nm, town.id).toBe(m);
        expect(Math.abs(nx - x) + Math.abs(ny - y), town.id).toBe(1);
        expect('lw', town.id).toContain(tile[0]);
      });
    }
  });

  it("grinds to the gym's highest level (Brock's Onix, Lv. 14), then goes into the gym", () => {
    const pewter = AREAS.findIndex((a) => a.id === 'pewter-city');
    expect(grindTarget(pewter, 'charmander')).toBe(14);
    const start = { ...createIdleRun({ species: 4 }, 4), area: pewter, phase: 'town' as const };
    const grinding = applyIdleAction(start, { type: 'GRIND' });
    expect(grinding.ok).toBe(true);
    let state = (grinding as { state: IdleState }).state;
    expect(state.phase).toBe('grinding');
    let segments = 0;
    while (state.phase === 'grinding' && segments < 500) {
      const next = simulateSegment(state, DEFAULT_IDLE_SETTINGS, new Set())!;
      expect(next.segment.events[0]!.t).toBe('grind');
      state = next.state;
      segments++;
    }
    // A white-out ends it in town; otherwise it reached the level and went into Pewter Gym.
    if (state.phase === 'town') expect(state.totals.whiteOuts).toBeGreaterThan(0);
    else {
      expect(AREAS[state.area]!.id).toBe('pewter-gym');
      expect(topLevel(state.party)).toBeGreaterThanOrEqual(14);
    }
    expect(applyIdleAction({ ...start, party: [{ ...start.party[0]!, level: 14 }] }, { type: 'GRIND' }).ok).toBe(false);
  });

  it('stops grinding back in town', () => {
    const pewter = AREAS.findIndex((a) => a.id === 'pewter-city');
    const s = (applyIdleAction({ ...createIdleRun({ species: 1 }, 2), area: pewter, phase: 'town' }, { type: 'GRIND' }) as { state: IdleState }).state;
    const back = applyIdleAction(s, { type: 'STOP_GRIND' });
    expect(back.ok && back.state.phase).toBe('town');
    expect(back.ok && back.state.grind).toBeUndefined();
  });

  it('auto-grinds on reaching a gym town, and with the level reached, goes into the gym', () => {
    // Route 2's end, the step before Pewter City.
    const route2 = AREAS.findIndex((a) => a.id === 'route-2');
    const leg = (AREAS[route2] as WalkArea).legs.length - 1;
    const base = createIdleRun({ species: 4 }, 6);
    const end = { ...base, area: route2, leg, step: (AREAS[route2] as WalkArea).legs[leg]!.track.length - 1, beaten: (AREAS[route2] as WalkArea).trainers.map((t) => t.key) };
    const auto = { ...DEFAULT_IDLE_SETTINGS, autoGrind: true };
    expect(simulateSegment(end, auto, new Set())!.state.phase).toBe('grinding');
    expect(simulateSegment(end, MANUAL, new Set())!.state.phase).toBe('town');
    const strong = { ...end, party: [{ ...end.party[0]!, level: 20 }] };
    expect(AREAS[simulateSegment(strong, auto, new Set())!.state.area]!.id).toBe('pewter-gym');
  });

  it('after a white-out, auto-grind trains 2 levels above the party\'s highest, then goes into the gym again', () => {
    // A level-14 Magikarp knows only Splash: it can't win in Pewter Gym.
    const gym = AREAS.findIndex((a) => a.id === 'pewter-gym');
    let state: IdleState = { ...createIdleRun({ species: 129 }, 8), area: gym };
    state.party = [{ ...state.party[0]!, level: 14, moves: ['splash'], slots: [] }];
    const auto = { ...DEFAULT_IDLE_SETTINGS, autoGrind: true };
    for (let i = 0; i < 20 && !state.totals.whiteOuts; i++) state = simulateSegment(state, auto, new Set())!.state;
    expect(state.totals.whiteOuts).toBe(1);
    expect(state.phase).toBe('grinding');
    expect(state.grind!.level).toBe(16);
    // Without auto-grind it waits in town.
    let manual: IdleState = { ...createIdleRun({ species: 129 }, 8), area: gym };
    manual.party = state.party.map((m) => ({ ...m, level: 14 }));
    for (let i = 0; i < 20 && !manual.totals.whiteOuts; i++) manual = simulateSegment(manual, MANUAL, new Set())!.state;
    expect(manual.phase).toBe('town');
    // A white-out costs nothing (the user's).
    expect(manual.money).toBe(createIdleRun({ species: 129 }, 8).money);
  });

  it("fights a gym's Gym Trainers once a run: back in the gym, only the leader is left", () => {
    const gym = AREAS.findIndex((a) => a.id === 'pewter-gym');
    const town = AREAS.findIndex((a) => a.id === 'pewter-city');
    const base = createIdleRun({ species: 6 }, 8);
    let state: IdleState = { ...base, area: gym, party: [{ ...base.party[0]!, level: 70, moves: ['flamethrower', 'slash', 'scratch'], slots: ['flamethrower', 'slash'] }] };
    for (let i = 0; i < 20 && !state.beaten.includes('camper-liam'); i++) state = simulateSegment(state, MANUAL, new Set())!.state;
    expect(state.gymBeaten).toEqual(['camper-liam']);
    // Back in Pewter City with Brock unbeaten (as after a white-out), then into the gym again: Liam is walked past.
    const again = applyIdleAction({ ...state, area: town, phase: 'town' }, { type: 'GYM' });
    if (!again.ok) throw new Error(again.error);
    expect(again.state.beaten).toEqual(['camper-liam']);
    const next = simulateSegment(again.state, MANUAL, new Set())!;
    expect(next.segment.events.flatMap((e) => (e.t === 'spotted' ? [e.trainer] : []))).toEqual(['leader-brock']);
    // A route's trainers aren't kept: on from the town, Route 3's are all to fight.
    const on = applyIdleAction({ ...state, area: town, phase: 'town', badges: ['Boulder'] }, { type: 'CONTINUE' });
    if (!on.ok) throw new Error(on.error);
    expect(on.state.beaten).toEqual([]);
  });

  describe('grinding on a route', () => {
    /** A run on Route 3 with a party that wins every battle, walked until it has beaten `n` trainers there. */
    const route3 = (n: number) => {
      const area = AREAS.findIndex((a) => a.id === 'route-3');
      const base = createIdleRun({ species: 6 }, 11);
      let s: IdleState = { ...base, area, party: [{ ...base.party[0]!, level: 70, moves: ['flamethrower', 'slash', 'scratch'], slots: ['flamethrower', 'slash'] }] };
      for (let i = 0; i < 500 && s.beaten.length < n; i++) s = simulateSegment(s, MANUAL, new Set())!.state;
      return s;
    };

    it('trainer grind fights every trainer of the route in a loop, never past the last; rematches pay a quarter; Continue route goes on from where it was', () => {
      const start = route3(1);
      const area = AREAS[start.area] as WalkArea;
      const keys = area.trainers.map((t) => t.key).filter((k) => meetStep(area, k));
      const r = applyIdleAction(start, { type: 'TRAINER_GRIND' });
      expect(r.ok).toBe(true);
      let s = (r as { state: IdleState }).state;
      expect(s.loop).toMatchObject({ kind: 'trainers', keys, resume: { leg: start.leg, step: start.step } });
      expect(s.beaten).toEqual([]);
      const last = keys.map((k) => meetStep(area, k)!).reduce((x, y) => (x.leg > y.leg || (x.leg === y.leg && x.step > y.step) ? x : y));
      const money: { why: string; amount: number }[] = [];
      for (let i = 0; i < 400; i++) {
        const next = simulateSegment(s, MANUAL, new Set())!;
        s = next.state;
        for (const e of next.segment.events) if (e.t === 'money') money.push(e);
        expect(s.leg < last.leg || (s.leg === last.leg && s.step <= last.step)).toBe(true);
      }
      // Every trainer at least twice: the full prize first, a quarter after.
      for (const k of keys) expect(s.paid).toContain(k);
      const first = money.find((m) => !m.why.endsWith('rematch'))!;
      const again = money.find((m) => m.why === `${first.why}, rematch`)!;
      expect(again.amount).toBe(Math.floor(first.amount / 4));
      const on = applyIdleAction(s, { type: 'CONTINUE_ROUTE' });
      expect(on.ok && on.state.loop).toBeUndefined();
      // Where it started grinding, or further on if the loop was past it.
      const at = on.ok ? on.state : start;
      expect(at.leg > start.leg || (at.leg === start.leg && at.step >= start.step)).toBe(true);
      expect(at.leg > s.leg || (at.leg === s.leg && at.step >= s.step)).toBe(true);
      // The trainers it beat count in the real run.
      expect(on.ok && keys.every((k) => on.state.beaten.includes(k))).toBe(true);
    });

    it('a white-out in a trainer grind turns it to a wild grind near the route start, its beaten trainers kept', () => {
      // Route 2 (and Viridian Forest): grass from its start.
      const area = AREAS.findIndex((a) => a.id === 'route-2');
      const base = createIdleRun({ species: 129 }, 3);
      let s: IdleState = { ...base, area, beaten: [], party: [{ ...base.party[0]!, level: 2, moves: ['splash'], slots: [] }] };
      s = (applyIdleAction(s, { type: 'TRAINER_GRIND' }) as { state: IdleState }).state;
      for (let i = 0; i < 100 && !s.totals.whiteOuts; i++) s = simulateSegment(s, MANUAL, new Set())!.state;
      expect(s.totals.whiteOuts).toBe(1);
      expect(s.loop?.kind).toBe('pace');
      expect(s.area).toBe(area);
      expect(s.leg).toBe(0);
      expect(s.step).toBeLessThan(30);
    });

    it('wild grind paces over wild encounter tiles near where it is', () => {
      let s = createIdleRun({ species: 4 }, 2);
      s = { ...s, step: 50, party: [{ ...s.party[0]!, level: 60 }] };
      const r = applyIdleAction(s, { type: 'WILD_GRIND' });
      expect(r.ok).toBe(true);
      let g = (r as { state: IdleState }).state;
      const loop = g.loop as Extract<NonNullable<IdleState['loop']>, { kind: 'pace' }>;
      expect(loop.kind).toBe('pace');
      for (let i = 0; i < 30; i++) {
        g = simulateSegment(g, MANUAL, new Set())!.state;
        expect(g.step).toBeGreaterThanOrEqual(loop.from);
        expect(g.step).toBeLessThanOrEqual(loop.to);
      }
      expect(g.totals.wild).toBeGreaterThan(s.totals.wild);
      const on = applyIdleAction(g, { type: 'CONTINUE_ROUTE' });
      expect(on.ok && on.state.step).toBe(50);
    });

    it('with no wild Pokémon where it is, goes back to the most recent stretch that has them, and Continue route returns', () => {
      const wild = (leg: WalkArea['legs'][number]) => leg.track.some(([, , , , t]) => t[0] === 'l' || t[0] === 'w');
      let checked = 0;
      AREAS.forEach((a, i) => {
        if (a.kind !== 'route' && a.kind !== 'dungeon') return;
        (a as WalkArea).legs.forEach((leg, li) => {
          if (wild(leg)) return;
          checked++;
          const plan = routeGrindPlan({ ...createIdleRun({ species: 4 }, 1), area: i, leg: li, step: leg.track.length - 1, beaten: [] }, 'wild');
          expect('error' in plan, `${a.id} leg ${li}`).toBe(false);
          const p = plan as Extract<typeof plan, { kind: 'pace' }>;
          expect(p.kind).toBe('pace');
          expect(p.area < i || (p.area === i && p.leg < li), `${a.id} leg ${li}`).toBe(true);
          expect(wild((AREAS[p.area] as WalkArea).legs[p.leg]!)).toBe(true);
        });
      });
      expect(checked).toBeGreaterThan(0);
      // Route 23 past Victory Road (no wild Pokémon): back into Victory Road's caves, then back again on Continue route.
      const vr = AREAS.findIndex((a) => a.id === 'victory-road');
      const s: IdleState = { ...createIdleRun({ species: 4 }, 1), area: vr, leg: 1, step: 5, beaten: [] };
      const g = applyIdleAction(s, { type: 'WILD_GRIND' });
      expect(g.ok && [g.state.area, g.state.leg]).toEqual([vr, 0]);
      const on = g.ok ? applyIdleAction(g.state, { type: 'CONTINUE_ROUTE' }) : g;
      expect(on.ok && [on.state.area, on.state.leg, on.state.step]).toEqual([vr, 1, 5]);
    });

    it('only on a route or in a dungeon', () => {
      const s = createIdleRun({ species: 4 }, 2);
      expect(applyIdleAction({ ...s, area: AREAS.findIndex((a) => a.id === 'pewter-gym') }, { type: 'WILD_GRIND' }).ok).toBe(false);
      // (From a town it goes out to the route before it: see the auto-grind test.)
      expect(applyIdleAction({ ...s, area: AREAS.findIndex((a) => a.id === 'pewter-city'), phase: 'town', inStore: true }, { type: 'WILD_GRIND' }).ok).toBe(false);
      expect(applyIdleAction(s, { type: 'CONTINUE_ROUTE' }).ok).toBe(false);
      // Route 1 has no trainers.
      expect(applyIdleAction(s, { type: 'TRAINER_GRIND' }).ok).toBe(false);
    });
  });

  it("plays a segment again the same up to the turn a ball was asked for, then throws it (the ball button)", () => {
    // Walk Route 1 with auto-catch off until a segment holds a wild battle of 3 turns or more.
    const settings = { ...MANUAL, autoCatch: 'off' as const };
    let s: IdleState = { ...createIdleRun({ species: 4 }, 5), bag: { 'great-ball': 3 } };
    let found: { prev: IdleState; battle: BattleSeg } | null = null;
    for (let i = 0; i < 100 && !found; i++) {
      const next = simulateSegment(s, settings, new Set())!;
      const b = next.segment.events.find((e) => e.t === 'battle');
      if (b?.t === 'battle' && b.kind === 'wild' && b.ticks >= 3) found = { prev: s, battle: b };
      s = next.state;
    }
    expect(found).not.toBeNull();
    const again = simulateSegment(found!.prev, settings, new Set(), { throwAt: [2] })!;
    const b = again.segment.events.find((e) => e.t === 'battle') as BattleSeg;
    const tick2 = (ev: BattleSeg['events']) => ev.findIndex((e) => e.t === 'tick' && e.n === 2);
    // The same up to turn 2…
    expect(b.events.slice(0, tick2(b.events))).toEqual(found!.battle.events.slice(0, tick2(found!.battle.events)));
    // …then a Great Ball.
    const turn2 = b.events.slice(tick2(b.events), b.events.findIndex((e) => e.t === 'tick' && e.n === 3) >>> 0);
    expect(turn2.some((e) => e.t === 'ball' && e.item === 'great-ball')).toBe(true);
  });

  it('a white-out on a route with no grind on goes back to its start and starts a wild grind there', () => {
    // A level-2 Magikarp knowing only Splash, on Route 2: the first battle whites it out.
    const area = AREAS.findIndex((a) => a.id === 'route-2');
    const base = createIdleRun({ species: 129 }, 3);
    let s: IdleState = { ...base, area, step: 40, party: [{ ...base.party[0]!, level: 2, moves: ['splash'], slots: [] }] };
    for (let i = 0; i < 100 && !s.totals.whiteOuts; i++) s = simulateSegment(s, MANUAL, new Set())!.state;
    expect(s.totals.whiteOuts).toBe(1);
    expect(s.loop).toMatchObject({ kind: 'pace', resume: { area, leg: 0, step: 0 } });
    expect([s.area, s.leg]).toEqual([area, 0]);
    expect(s.step).toBeLessThan(30);
    // Continue route goes on from the route's start.
    const on = applyIdleAction(s, { type: 'CONTINUE_ROUTE' });
    expect(on.ok && [on.state.area, on.state.leg, on.state.loop]).toEqual([area, 0, undefined]);
  });

  it("teaches a caught Pokémon every move its line learns by its level: a Kakuna knows Weedle's", () => {
    expect(familyMovesUpTo(14, 7)).toEqual(['poison-sting', 'string-shot', 'harden']);
    // Charizard at 40: Charmander's, Charmeleon's and its own, by level.
    expect(familyMovesUpTo(6, 40)).toEqual(expect.arrayContaining(['scratch', 'growl', 'ember', 'metal-claw', 'smokescreen', 'scary-face', 'flamethrower', 'slash', 'wing-attack']));
    // Catching one in Viridian Forest (wild grinding there): auto-catch every wild Pokémon with Master Balls until a Kakuna joins.
    const area = AREAS.findIndex((a) => a.id === 'route-2');
    const leg = (AREAS[area] as WalkArea).legs[0]!;
    const forest = leg.maps.indexOf('ViridianForest');
    const step = leg.track.findIndex(([m, , , , t]) => m === forest && t[0] === 'l');
    const base = createIdleRun({ species: 4 }, 7);
    let s: IdleState = { ...base, area, step, beaten: (AREAS[area] as WalkArea).trainers.map((t) => t.key), bag: { 'master-ball': 99 }, party: [{ ...base.party[0]!, level: 12 }] };
    s = (applyIdleAction(s, { type: 'WILD_GRIND' }) as { state: IdleState }).state;
    const settings = { ...MANUAL, autoCatch: 'all' as const, replaceLowest: true };
    for (let i = 0; i < 400 && !s.party.some((m) => m.species === 14); i++) s = simulateSegment(s, settings, new Set())!.state;
    const kakuna = s.party.find((m) => m.species === 14);
    expect(kakuna).toBeDefined();
    expect(kakuna!.moves).toEqual(expect.arrayContaining(['poison-sting', 'string-shot', 'harden']));
  });

  it('offers as starters only Pokémon that evolve from none', () => {
    // Charmeleon, Pidgeotto and Vaporeon caught: not startable; Pidgey, Tauros (no evolutions) and Eevee are.
    expect(starterOptions([5, 16, 17, 128, 133, 134])).toEqual([1, 4, 7, 16, 128, 133]);
  });

  it('queues party changes while a wild battle can be played again, shows them at once and applies them at the next segment', () => {
    // A run with two Pokémon and a held replay (a wild battle just played).
    const base = createIdleRun({ species: 4 }, 2);
    const second = { ...base.party[0]!, uid: 'second', species: 16 };
    const s: IdleState = { ...base, party: [base.party[0]!, second], replay: { prev: base, settings: MANUAL, caught: [], from: 0, throws: [] } };
    const r = applyIdleAction(s, { type: 'SET_ORDER', uids: ['second', base.party[0]!.uid] });
    expect(r.ok).toBe(true);
    const q = (r as { state: IdleState }).state;
    // Queued: the replay kept, the party as it was, the view as it will be.
    expect(q.replay).toBeDefined();
    expect(q.pending).toHaveLength(1);
    expect(q.party[0]!.uid).toBe(base.party[0]!.uid);
    expect(idleView(q).party[0]!.uid).toBe('second');
    expect(idleView(q).pendingChanges).toBe(1);
    // A change that can't be made is refused at once.
    expect(applyIdleAction(q, { type: 'SET_SLOTS', uid: 'nobody', slots: [] }).ok).toBe(false);
    // The next segment starts with them applied.
    const next = simulateSegment(q, MANUAL, new Set())!.state;
    expect(next.pending).toBeUndefined();
    expect(next.party[0]!.uid).toBe('second');
  });

  it('goes back from a town to the end of the route before it, wild grinding there, and Route mode walks on to the town again', () => {
    const pewter = AREAS.findIndex((a) => a.id === 'pewter-city');
    const route2 = AREAS.findIndex((a) => a.id === 'route-2');
    expect(previousRoute(pewter)).toBe(route2);
    const base = createIdleRun({ species: 4 }, 2);
    const r = applyIdleAction({ ...base, area: pewter, phase: 'town', party: [{ ...base.party[0]!, level: 40 }] }, { type: 'BACK_ROUTE' });
    expect(r.ok).toBe(true);
    let s = (r as { state: IdleState }).state;
    const leg = (AREAS[route2] as WalkArea).legs.length - 1;
    const end = (AREAS[route2] as WalkArea).legs[leg]!.track.length - 1;
    expect(s).toMatchObject({ area: route2, phase: 'walking', loop: { kind: 'pace', resume: { area: route2, leg, step: end } } });
    for (let i = 0; i < 10; i++) s = simulateSegment(s, MANUAL, new Set())!.state;
    expect(s.loop?.kind).toBe('pace');
    s = (applyIdleAction(s, { type: 'CONTINUE_ROUTE' }) as { state: IdleState }).state;
    for (let i = 0; i < 20 && s.phase !== 'town'; i++) s = simulateSegment(s, MANUAL, new Set())!.state;
    expect([s.phase, s.area]).toEqual(['town', pewter]);
  });

  it('switches straight from one grind to the other (the mode toggle), and refuses the one already on', () => {
    const area = AREAS.findIndex((a) => a.id === 'route-2');
    const base = createIdleRun({ species: 4 }, 2);
    const s: IdleState = { ...base, area, step: 60, party: [{ ...base.party[0]!, level: 40 }] };
    const wild = (applyIdleAction(s, { type: 'WILD_GRIND' }) as { state: IdleState }).state;
    expect(applyIdleAction(wild, { type: 'WILD_GRIND' }).ok).toBe(false);
    const trainers = applyIdleAction(wild, { type: 'TRAINER_GRIND' });
    expect(trainers.ok && trainers.state.loop?.kind).toBe('trainers');
    // Its resume is where the first grind began.
    expect(trainers.ok && trainers.state.loop?.resume.step).toBe(60);
    const back = trainers.ok ? applyIdleAction(trainers.state, { type: 'WILD_GRIND' }) : trainers;
    expect(back.ok && back.state.loop?.kind).toBe('pace');
  });

  it('stops where it is in the Stop mode (no segment, offline either) and goes on in any other mode', () => {
    const area = AREAS.findIndex((a) => a.id === 'route-2');
    const base = createIdleRun({ species: 4 }, 2);
    const s: IdleState = { ...base, area, step: 60, party: [{ ...base.party[0]!, level: 40 }] };
    const r = applyIdleAction(s, { type: 'SET_MODE', mode: 'stop' });
    expect(r.ok).toBe(true);
    const stopped = (r as { state: IdleState }).state;
    expect(modeOf(stopped)).toBe('stop');
    expect(idleView(stopped).stopped).toBe(true);
    expect(simulateSegment(stopped, MANUAL, new Set())).toBeNull();
    const away = catchUp(stopped, MANUAL, new Set(), 60 * 60 * 1000);
    expect(away.summary.segments).toBe(0);
    expect(away.state).toBe(stopped);
    // Stopping again changes nothing; Route, Wild grind or Trainer grind go on from where it stopped.
    expect((applyIdleAction(stopped, { type: 'SET_MODE', mode: 'stop' }) as { state: IdleState }).state.log).toEqual(stopped.log);
    for (const mode of ['route', 'wild', 'trainers'] as const) {
      const on = applyIdleAction(stopped, { type: 'SET_MODE', mode });
      expect(on.ok && modeOf(on.state)).toBe(mode);
      expect(on.ok && (on.state.loop?.resume.step ?? on.state.step)).toBe(60);
      expect(on.ok && simulateSegment(on.state, MANUAL, new Set())).not.toBeNull();
    }
  });

  it('switches modes with SET_MODE: a grind already on stays as it is, and Route ends one', () => {
    const area = AREAS.findIndex((a) => a.id === 'route-2');
    const base = createIdleRun({ species: 4 }, 2);
    const s: IdleState = { ...base, area, step: 60, party: [{ ...base.party[0]!, level: 40 }] };
    const wild = (applyIdleAction(s, { type: 'SET_MODE', mode: 'wild' }) as { state: IdleState }).state;
    expect(modeOf(wild)).toBe('wild');
    const again = applyIdleAction(wild, { type: 'SET_MODE', mode: 'wild' });
    expect(again.ok && again.state.loop).toEqual(wild.loop);
    const trainers = applyIdleAction(wild, { type: 'SET_MODE', mode: 'trainers' });
    expect(trainers.ok && trainers.state.loop?.resume.step).toBe(60);
    const route = trainers.ok ? applyIdleAction(trainers.state, { type: 'SET_MODE', mode: 'route' }) : trainers;
    expect(route.ok && modeOf(route.state)).toBe('route');
    // A grind that can't start is refused (in a gym; in a town's store).
    expect(applyIdleAction({ ...s, area: AREAS.findIndex((a) => a.id === 'pewter-gym') }, { type: 'SET_MODE', mode: 'wild' }).ok).toBe(false);
    expect(applyIdleAction({ ...s, area: AREAS.findIndex((a) => a.id === 'pewter-city'), phase: 'town', inStore: true }, { type: 'SET_MODE', mode: 'wild' }).ok).toBe(false);
  });

  it('changes the mode once the wild battle playing is over: queued, shown at once, saved by the next segment', () => {
    const base = createIdleRun({ species: 4 }, 2);
    const held: IdleState = { ...base, replay: { prev: base, settings: MANUAL, caught: [], from: 0, throws: [], throwable: true } };
    const r = applyIdleAction(held, { type: 'SET_MODE', mode: 'stop' });
    const q = (r as { state: IdleState }).state;
    expect(q.stopped).toBeUndefined();
    expect(q.pending).toHaveLength(1);
    expect(idleView(q).stopped).toBe(true);
    // The next segment applies it and plays nothing; the one after isn't played at all.
    const next = simulateSegment(q, MANUAL, new Set())!;
    expect(next.segment.events).toEqual([]);
    expect(next.state).toMatchObject({ stopped: true, version: q.version + 1 });
    expect(next.state.pending).toBeUndefined();
    expect(simulateSegment(next.state, MANUAL, new Set())).toBeNull();
  });

  it('leaves auto-grinding for a wild or trainer grind on the route before the town, held until Route walks back to the town', () => {
    const pewter = AREAS.findIndex((a) => a.id === 'pewter-city');
    const route2 = AREAS.findIndex((a) => a.id === 'route-2');
    const town = (AREAS[pewter] as TownArea).grind!;
    const base = createIdleRun({ species: 4 }, 2);
    // Reaching Pewter City below Brock's level: auto-grind starts.
    let s: IdleState = (applyIdleAction({ ...base, area: pewter, phase: 'town' }, { type: 'GRIND' }) as { state: IdleState }).state;
    expect(s.phase).toBe('grinding');
    for (const mode of ['wild', 'trainers'] as const) {
      const r = applyIdleAction(s, { type: 'SET_MODE', mode });
      expect(r.ok).toBe(true);
      const g = (r as { state: IdleState }).state;
      expect(modeOf(g)).toBe(mode);
      expect(g).toMatchObject({ phase: 'walking', loop: { resume: { area: route2, leg: town.leg } } });
      expect(g.grind).toBeUndefined();
    }
    s = (applyIdleAction(s, { type: 'SET_MODE', mode: 'wild' }) as { state: IdleState }).state;
    // Held: still grinding after many segments, never back in the town.
    for (let i = 0; i < 15; i++) s = simulateSegment(s, DEFAULT_IDLE_SETTINGS, new Set())!.state;
    expect(modeOf(s)).toBe('wild');
    expect(s.phase).toBe('walking');
    // Route: on from the route's end into the town, where auto-grind takes over again.
    s = (applyIdleAction(s, { type: 'SET_MODE', mode: 'route' }) as { state: IdleState }).state;
    for (let i = 0; i < 10 && s.phase === 'walking'; i++) s = simulateSegment(s, DEFAULT_IDLE_SETTINGS, new Set())!.state;
    expect(s.area).toBe(pewter);
    expect(['grinding', 'town']).toContain(s.phase);
  });

  it('travels by the Town Map to a town reached already, its choices waiting there; never further on, nor where it waits', () => {
    const index = (id: string) => AREAS.findIndex((a) => a.id === id);
    const base = createIdleRun({ species: 4 }, 2);
    // On Route 3 with Pewter's badge (an older run: no `reached`, worked out from where it is and its badges).
    const s: IdleState = { ...base, area: index('route-3'), step: 10, badges: ['Boulder'], party: [{ ...base.party[0]!, level: 40 }] };
    expect(reachedArea(s)).toBe(index('route-3'));
    const r = applyIdleAction(s, { type: 'TRAVEL', area: index('viridian-city') });
    expect(r.ok).toBe(true);
    const t = (r as { state: IdleState }).state;
    expect(t).toMatchObject({ area: index('viridian-city'), phase: 'town', reached: index('route-3') });
    // The furthest point is kept: Pewter City is still a choice, Cerulean City isn't yet.
    expect(travelError(t, index('pewter-city'))).toBeNull();
    expect(travelError(t, index('cerulean-city'))).toBe('Not reached yet');
    expect(applyIdleAction(t, { type: 'TRAVEL', area: index('viridian-city') }).ok).toBe(false);
    expect(applyIdleAction(t, { type: 'TRAVEL', area: index('route-2') }).ok).toBe(false);
    // From the town, Continue walks Route 2 again.
    const on = applyIdleAction(t, { type: 'CONTINUE' });
    expect(on.ok && on.state.area).toBe(index('route-2'));
  });

  it('grinds on a route picked on the Town Map: from its end, its trainers passed, Continue route going back where it was', () => {
    const index = (id: string) => AREAS.findIndex((a) => a.id === id);
    const base = createIdleRun({ species: 4 }, 2);
    const town: IdleState = { ...base, area: index('cerulean-city'), phase: 'town', reached: index('cerulean-city'), party: [{ ...base.party[0]!, level: 40 }] };
    for (const kind of ['wild', 'trainers'] as const) {
      expect('error' in mapGrindPlan(town, index('route-2'), kind)).toBe(false);
      const r = applyIdleAction(town, { type: 'GRIND_AT', area: index('route-2'), kind });
      expect(r.ok).toBe(true);
      const g = (r as { state: IdleState }).state;
      expect(modeOf(g)).toBe(kind);
      expect(g).toMatchObject({ area: index('route-2'), phase: 'walking', reached: index('cerulean-city') });
    }
    // Not a route, or not reached yet.
    expect(applyIdleAction(town, { type: 'GRIND_AT', area: index('pewter-city'), kind: 'wild' }).ok).toBe(false);
    expect(applyIdleAction(town, { type: 'GRIND_AT', area: index('route-24'), kind: 'wild' }).ok).toBe(false);
    // A wild grind on Route 2, then Continue run: straight back to Cerulean City, the run's furthest place (the user's).
    let s = (applyIdleAction(town, { type: 'GRIND_AT', area: index('route-2'), kind: 'wild' }) as { state: IdleState }).state;
    for (let i = 0; i < 5; i++) s = simulateSegment(s, MANUAL, new Set())!.state;
    expect(modeOf(s)).toBe('wild');
    s = (applyIdleAction(s, { type: 'CONTINUE_RUN' }) as { state: IdleState }).state;
    expect([s.phase, s.area]).toEqual(['town', index('cerulean-city')]);
  });

  it('goes straight to its furthest place with Continue run, however the Town Map moved it, and on from there when it is there', () => {
    const index = (id: string) => AREAS.findIndex((a) => a.id === id);
    const base = createIdleRun({ species: 4 }, 2);
    const route3: IdleState = { ...base, area: index('route-3'), step: 10, beaten: ['x'], badges: ['Boulder'], party: [{ ...base.party[0]!, level: 40 }] };
    const act = (s: IdleState, a: Parameters<typeof applyIdleAction>[1]) => {
      const r = applyIdleAction(s, a);
      if (!r.ok) throw new Error(r.error);
      return r.state;
    };
    // An older run (no progress kept): where it is.
    expect(progressOf(route3)).toMatchObject({ area: index('route-3'), step: 10, beaten: ['x'] });
    // A town, then a grind elsewhere, then Continue run: Route 3's place, as it was.
    let s = act(act(route3, { type: 'TRAVEL', area: index('viridian-city') }), { type: 'GRIND_AT', area: index('route-2'), kind: 'wild' });
    expect(atProgress(s)).toBe(false);
    s = act(s, { type: 'CONTINUE_RUN' });
    expect(s).toMatchObject({ area: index('route-3'), step: 10, beaten: ['x'], phase: 'walking' });
    expect(s.loop).toBeUndefined();
    expect(atProgress(s)).toBe(true);
    // Walking on marks it further; a town behind and Continue run come back to the new place.
    for (let i = 0; i < 3; i++) s = simulateSegment(s, MANUAL, new Set())!.state;
    const furthest = progressOf(s);
    expect(furthest.area > index('route-3') || furthest.step > 10).toBe(true);
    const again = act(act(s, { type: 'TRAVEL', area: index('pewter-city') }), { type: 'CONTINUE_RUN' });
    expect([again.area, again.leg, again.step]).toEqual([furthest.area, furthest.leg, furthest.step]);
    // In a town that is the furthest place, its gym beaten: on to the next area (as Continue).
    const pewter: IdleState = { ...base, area: index('pewter-city'), phase: 'town', badges: ['Boulder'], progress: undefined };
    expect(atProgress(pewter)).toBe(true);
    expect(act(pewter, { type: 'CONTINUE_RUN' }).area).toBe(index('route-3'));
    // Its gym's badge puts the town past the gym (back there after the badge).
    expect(progressOf({ ...pewter, reached: index('pewter-gym') }).area).toBe(index('pewter-city'));
  });

  it("does nothing on Stop in a town; walking, it stops where the player stands, a battle begun dropped (cutSegment)", () => {
    const index = (id: string) => AREAS.findIndex((a) => a.id === id);
    const base = createIdleRun({ species: 4 }, 5);
    const town = applyIdleAction({ ...base, area: index('viridian-city'), phase: 'town' }, { type: 'SET_MODE', mode: 'stop' });
    expect(town.ok && town.state.stopped).toBeFalsy();
    // A segment with a battle, kept to play again (as idle.next keeps it).
    let s: IdleState = { ...base, party: [{ ...base.party[0]!, level: 30 }] };
    let next = simulateSegment(s, MANUAL, new Set())!;
    for (let i = 0; i < 20 && !next.segment.events.some((e) => e.t === 'battle'); i++) {
      s = next.state;
      next = simulateSegment(s, MANUAL, new Set())!;
    }
    const saved: IdleState = { ...next.state, replay: { prev: s, settings: MANUAL, caught: [], from: 1000, throws: [] } };
    // Over already: unchanged.
    expect(cutSegment(saved, 1000 + next.segment.durationMs)).toBe(saved);
    // Just before its end: the battle dropped, no rewards, the player where it began.
    const cut = cutSegment(saved, 1000 + next.segment.durationMs - 1);
    expect(cut.totals.battles).toBe(s.totals.battles);
    expect(cut.party[0]!.exp).toBe(s.party[0]!.exp);
    expect(cut.version).toBe(saved.version);
    const walks = next.segment.events.filter((e): e is Extract<SegmentEvent, { t: 'walk' }> => e.t === 'walk');
    if (walks.length) expect(cut.step).toBe(walks[walks.length - 1]!.to);
    // At its start: where it stood.
    expect(cutSegment(saved, 1000).step).toBe(s.step);
    // Stopped there.
    const stopped = applyIdleAction(cut, { type: 'SET_MODE', mode: 'stop' });
    expect(stopped.ok && stopped.state.stopped).toBe(true);
  });

  it('keeps a Pokémon caught when Stop comes after its "Gotcha!", and drops the catch before it', () => {
    const settings: IdleSettings = { ...MANUAL, autoCatch: 'all' };
    let s: IdleState = { ...createIdleRun({ species: 4 }, 7), bag: { 'ultra-ball': 99 } };
    let next = simulateSegment(s, settings, new Set())!;
    const caughtBattle = () => next.segment.events.find((e): e is Extract<SegmentEvent, { t: 'battle' }> => e.t === 'battle' && e.result === 'caught');
    for (let i = 0; i < 60 && !caughtBattle(); i++) {
      s = next.state;
      next = simulateSegment(s, settings, new Set())!;
    }
    const b = caughtBattle()!;
    expect(b).toBeDefined();
    const saved: IdleState = { ...next.state, replay: { prev: s, settings, caught: [], from: 0, throws: [] } };
    // The battle starts once the walk is done: what's left of the segment is the battle.
    const start = next.segment.durationMs - (BATTLE_MS + openingMs(b.events, 'wild') + b.ticks * TICK_MS);
    const ball = b.events.find((e): e is Extract<BattleEvent, { t: 'ball' }> => e.t === 'ball' && e.caught)!;
    const tick = b.events.slice(0, b.events.indexOf(ball)).reverse().find((e): e is Extract<BattleEvent, { t: 'tick' }> => e.t === 'tick')!;
    const gotcha = start + BATTLE_MS - BATTLE_HOLD_MS + openingMs(b.events, 'wild') + Math.max(0, tick.n - 1) * TICK_MS + catchTextFrame(ball.shakes, true) * FRAME_MS;
    expect(cutSegment(saved, gotcha + 1)).toBe(saved);
    expect(cutSegment(saved, gotcha - 1).party).toHaveLength(s.party.length);
  });

  it("fights a trainer whose sight a segment starts in (a cut at the leader's \"!\", Continue run), never walking past to the badge", () => {
    const area = AREAS.findIndex((a) => a.id === 'pewter-gym');
    const gym = AREAS[area] as WalkArea;
    const at = meetStep(gym, gym.leader!)!;
    const base = createIdleRun({ species: 7 }, 4);
    const s: IdleState = { ...base, area, leg: at.leg, step: at.step, beaten: gym.trainers.map((t) => t.key).filter((k) => k !== gym.leader), party: [{ ...base.party[0]!, level: 60 }] };
    const next = simulateSegment(s, MANUAL, new Set())!;
    const fought = next.segment.events.find((e): e is Extract<SegmentEvent, { t: 'battle' }> => e.t === 'battle');
    expect(fought?.trainer).toBe(gym.leader);
    expect(next.segment.events.findIndex((e) => e.t === 'battle')).toBeLessThan(next.segment.events.findIndex((e) => e.t === 'badge'));
  });

  it('picks a grind on the route it walks from where it is, and refuses the one already on', () => {
    const area = AREAS.findIndex((a) => a.id === 'route-2');
    const base = createIdleRun({ species: 4 }, 2);
    const s: IdleState = { ...base, area, step: 60, party: [{ ...base.party[0]!, level: 40 }] };
    const wild = applyIdleAction(s, { type: 'GRIND_AT', area, kind: 'wild' });
    expect(wild.ok && wild.state.loop?.resume.step).toBe(60);
    expect(applyIdleAction((wild as { state: IdleState }).state, { type: 'GRIND_AT', area, kind: 'wild' }).ok).toBe(false);
  });

  it('plays a segment again from its kept start exactly as it played (resuming a page opened mid-segment)', () => {
    let s = createIdleRun({ species: 7 }, 12);
    for (let i = 0; i < 8; i++) {
      const next = simulateSegment(s, MANUAL, new Set())!;
      const again = simulateSegment(s, MANUAL, new Set())!;
      expect(again.segment).toEqual(next.segment);
      s = next.state;
    }
  });

  it("keeps the start through a change that isn't queued, but no ball; queues party changes only while a ball can be thrown", () => {
    const base = createIdleRun({ species: 4 }, 2);
    const second = { ...base.party[0]!, uid: 'second', species: 16 };
    const held = (throwable: boolean): IdleState => ({ ...base, party: [base.party[0]!, second], replay: { prev: base, settings: MANUAL, caught: [], from: 0, throws: [], throwable } });
    const order = { type: 'SET_ORDER' as const, uids: ['second', base.party[0]!.uid] };
    // A trainer's (or walking) segment: applied at once, its start kept for resuming.
    const now = applyIdleAction(held(false), order);
    expect(now.ok && now.state.pending).toBeUndefined();
    expect(now.ok && now.state.party[0]!.uid).toBe('second');
    expect(now.ok && now.state.replay?.throwable).toBe(false);
    // A wild battle's: queued; an action that isn't queued then ends the ball but keeps the start.
    const queued = applyIdleAction(held(true), order);
    expect(queued.ok && queued.state.pending).toHaveLength(1);
    const stopped = queued.ok ? applyIdleAction(queued.state, { type: 'GIVE_UP' }) : queued;
    expect(stopped.ok && stopped.state.replay).toMatchObject({ throwable: false });
  });

  it('has auto-grind on by default', () => {
    expect(DEFAULT_IDLE_SETTINGS.autoGrind).toBe(true);
  });

  it('waits 10 s in a town, then goes into its unbeaten gym, or on once it is beaten, offline too', () => {
    const pewter = AREAS.findIndex((a) => a.id === 'pewter-city');
    const town = { ...createIdleRun({ species: 4 }, 4), area: pewter, phase: 'town' as const };
    const into = simulateSegment(town, DEFAULT_IDLE_SETTINGS, new Set())!;
    expect(into.segment.durationMs).toBe(TOWN_WAIT_MS + FADE_MS);
    expect(AREAS[into.state.area]!.id).toBe('pewter-gym');
    const beaten = simulateSegment({ ...town, badges: ['Boulder'] }, DEFAULT_IDLE_SETTINGS, new Set())!;
    expect(AREAS[beaten.state.area]!.id).toBe('route-3');
    // Catch-up plays through the town's wait.
    const { state, summary } = catchUp({ ...town, badges: ['Boulder'] }, DEFAULT_IDLE_SETTINGS, new Set(), 60 * 60 * 1000, 1000);
    expect(summary.segments).toBeGreaterThan(1);
    expect(state.area).toBeGreaterThan(pewter);
    // Less than the wait away: nothing.
    expect(catchUp(town, DEFAULT_IDLE_SETTINGS, new Set(), TOWN_WAIT_MS - 1).summary.segments).toBe(0);
  });

  it("doesn't go on from a town while the player is in its store, which is left by hand; buys only in it", () => {
    const pewter = AREAS.findIndex((a) => a.id === 'pewter-city');
    const town: IdleState = { ...createIdleRun({ species: 4 }, 4), area: pewter, phase: 'town', money: 1000 };
    expect(applyIdleAction(town, { type: 'BUY', item: 'poke-ball', count: 1 }).ok).toBe(false);
    const inStore = (applyIdleAction(town, { type: 'VISIT_STORE' }) as { state: IdleState }).state;
    expect(inStore.inStore).toBe(true);
    expect(idleView(inStore).inStore).toBe(true);
    // No wait played, watched or offline; nowhere to go but out.
    expect(simulateSegment(inStore, DEFAULT_IDLE_SETTINGS, new Set())).toBeNull();
    expect(catchUp(inStore, DEFAULT_IDLE_SETTINGS, new Set(), 60 * 60 * 1000).summary.segments).toBe(0);
    expect(applyIdleAction(inStore, { type: 'GYM' }).ok).toBe(false);
    const bought = applyIdleAction(inStore, { type: 'BUY', item: 'poke-ball', count: 2 });
    expect(bought.ok && bought.state.bag['poke-ball']).toBe((inStore.bag['poke-ball'] ?? 0) + 2);
    // Left: the town's wait again, then into the gym.
    const out = (applyIdleAction(inStore, { type: 'LEAVE_STORE' }) as { state: IdleState }).state;
    expect(out.inStore).toBeUndefined();
    expect(applyIdleAction(out, { type: 'LEAVE_STORE' }).ok).toBe(false);
    expect(AREAS[simulateSegment(out, DEFAULT_IDLE_SETTINGS, new Set())!.state.area]!.id).toBe('pewter-gym');
  });

  it("knows each town's Poké Mart: the player across the counter from the clerk, facing them", () => {
    for (const a of AREAS.filter(isTown)) {
      const m = a.mart;
      const clerk = m.people.find((p) => p.sprite === 'clerk' && Math.abs(p.x - m.x) + Math.abs(p.y - m.y) === 2 && (p.x === m.x || p.y === m.y));
      expect(clerk, a.id).toBeDefined();
    }
  });

  it('auto-buys balls on reaching a town, up to the setting, the cheapest the store sells, while the money lasts', () => {
    const route2 = AREAS.findIndex((a) => a.id === 'route-2');
    const leg = (AREAS[route2] as WalkArea).legs.length - 1;
    const base = createIdleRun({ species: 4 }, 6);
    const end = { ...base, area: route2, leg, step: (AREAS[route2] as WalkArea).legs[leg]!.track.length - 1, beaten: (AREAS[route2] as WalkArea).trainers.map((t) => t.key), bag: { 'poke-ball': 2, 'great-ball': 1 } };
    // Pewter City sells Poké Balls at ₱200: 3 in the bag, 7 bought.
    const s = simulateSegment(end, { ...DEFAULT_IDLE_SETTINGS, autoBalls: 10 }, new Set())!;
    expect(s.state.bag['poke-ball']).toBe(9);
    expect(s.state.money).toBe(end.money - 7 * 200);
    expect(s.segment.events).toContainEqual({ t: 'bought', item: 'poke-ball', count: 7, cost: 1400 });
    // Only what the money pays for; off at 0.
    expect(simulateSegment({ ...end, money: 500 }, { ...DEFAULT_IDLE_SETTINGS, autoBalls: 10 }, new Set())!.state.bag['poke-ball']).toBe(4);
    expect(simulateSegment(end, DEFAULT_IDLE_SETTINGS, new Set())!.state.bag['poke-ball']).toBe(2);
  });

  it('refuses what a town doesn\'t allow', () => {
    const s = createIdleRun({ species: 1 }, 1);
    expect(applyIdleAction(s, { type: 'GYM' }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'BUY', item: 'potion', count: 1 }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'SET_SLOTS', uid: s.party[0]!.uid, slots: ['tackle'] }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'SET_SLOTS', uid: s.party[0]!.uid, slots: ['growl'] }).ok).toBe(true);
  });
});
