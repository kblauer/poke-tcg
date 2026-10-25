import { describe, expect, it } from 'vitest';
import { AREAS, isTown, type WalkArea } from './areas.js';
import { applyIdleAction, catchUp, createIdleRun, DEFAULT_IDLE_SETTINGS, grindTarget, simulateSegment, storeStock, topLevel, visitStore, type IdleSettings, type IdleState } from './idle.js';

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
  while (state.phase !== 'won' && segments < maxSegments) {
    if (state.phase === 'town') {
      state = visitStore(state, settings).state;
      state = townChoice(state);
      continue;
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

  it("starts just outside the player's house in Pallet Town, then walks Route 1", () => {
    const s = createIdleRun({ species: 1 }, 1);
    const leg = (AREAS[s.area] as WalkArea).legs[s.leg]!;
    expect(leg.maps[leg.track[s.step]![0]]).toBe('PalletTown');
    expect(leg.track[s.step]!.slice(1, 3)).toEqual([6, 8]);
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
    expect(simulateSegment(end, DEFAULT_IDLE_SETTINGS, new Set())!.state.phase).toBe('town');
    const strong = { ...end, party: [{ ...end.party[0]!, level: 20 }] };
    expect(AREAS[simulateSegment(strong, auto, new Set())!.state.area]!.id).toBe('pewter-gym');
  });

  it('refuses what a town doesn\'t allow', () => {
    const s = createIdleRun({ species: 1 }, 1);
    expect(applyIdleAction(s, { type: 'GYM' }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'BUY', item: 'potion', count: 1 }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'SET_SLOTS', uid: s.party[0]!.uid, slots: ['tackle'] }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'SET_SLOTS', uid: s.party[0]!.uid, slots: ['growl'] }).ok).toBe(true);
  });
});
