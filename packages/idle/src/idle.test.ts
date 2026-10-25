import { describe, expect, it } from 'vitest';
import { AREAS, isTown, type WalkArea } from './areas.js';
import { applyIdleAction, catchUp, createIdleRun, DEFAULT_IDLE_SETTINGS, simulateSegment, storeStock, visitStore, type IdleSettings, type IdleState } from './idle.js';

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

  it('refuses what a town doesn\'t allow', () => {
    const s = createIdleRun({ species: 1 }, 1);
    expect(applyIdleAction(s, { type: 'GYM' }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'BUY', item: 'potion', count: 1 }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'SET_SLOTS', uid: s.party[0]!.uid, slots: ['tackle'] }).ok).toBe(false);
    expect(applyIdleAction(s, { type: 'SET_SLOTS', uid: s.party[0]!.uid, slots: ['growl'] }).ok).toBe(true);
  });
});
