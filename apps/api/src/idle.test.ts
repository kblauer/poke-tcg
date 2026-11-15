import { CATCH_UP_CAP_MS, createIdleRun, cutSegment, DEFAULT_IDLE_SETTINGS, simulateSegment, tickStartMs, TOWN_WAIT_MS, type IdleAction, type IdleSettings, type IdleState, type SegmentEvent } from '@poke-tcg/idle';
import { describe, expect, it } from 'vitest';
import { bankedMoney } from '@poke-tcg/idle';
import { AHEAD_MS, catchUpWindow, caughtWithDue, dueNotes, idleStatusOf, mergeNotes, nextWait, restartAt, splitNotes, THROW_GRACE_MS, throwError, throwPlayedTo, throwTimeError, withoutDueNotes } from './idle.js';

type BattleSeg = Extract<SegmentEvent, { t: 'battle' }>;
const SETTINGS: IdleSettings = { ...DEFAULT_IDLE_SETTINGS, autoGrind: false, autoCatch: 'all' };

/** A segment with a wild battle (caught, with balls in the bag, or not), kept to play again as idle.next keeps it. */
function wildSegment(seed: number, caught: boolean) {
  let s: IdleState = { ...createIdleRun({ species: 4 }, seed), bag: caught ? { 'ultra-ball': 99 } : {} };
  for (let i = 0; i < 80; i++) {
    const next = simulateSegment(s, SETTINGS, new Set(), { ask: true })!;
    const b = next.segment.events.find((e): e is BattleSeg => e.t === 'battle' && e.kind === 'wild' && (e.result === 'caught') === caught);
    if (b) {
      const notes = splitNotes(next.segment.dex);
      const saved: IdleState = { ...next.state, replay: { prev: s, settings: SETTINGS, caught: [], from: 0, throws: [], throwable: true, dex: notes.later } };
      return { prev: s, saved, segment: next.segment, battle: b, notes };
    }
    s = next.state;
  }
  throw new Error('no wild battle');
}

describe('the Idle Adventure on the server', () => {
  it("merges a segment's dex notes, each stat's best on its own", () => {
    const merged = mergeNotes([
      { species: 4, ivs: [31, 0, 5, 0, 0, 0], evs: [0, 10, 0, 0, 0, 0] },
      { species: 4, ivs: [2, 20, 1, 0, 0, 0], evs: [0, 4, 8, 0, 0, 0] },
      { species: 16, seen: true },
    ]);
    expect(merged.get(4)).toEqual({ caught: true, shiny: false, iv: [31, 20, 5, 0, 0, 0], ev: [0, 10, 8, 0, 0, 0] });
    // Seen only: not caught, no stats.
    expect(merged.get(16)).toEqual({ caught: false, shiny: false, iv: [0, 0, 0, 0, 0, 0], ev: [0, 0, 0, 0, 0, 0] });
  });

  it('gives a run its status from its phase', () => {
    const s = createIdleRun({ species: 1 }, 1);
    expect(idleStatusOf(s)).toBe('ACTIVE');
    expect(idleStatusOf({ ...s, phase: 'won' })).toBe('BEATEN');
    expect(idleStatusOf({ ...s, phase: 'given-up' })).toBe('GIVEN_UP');
    // Only a run that beat the Champion banks its money (the user's).
    expect(bankedMoney({ ...s, phase: 'won', money: 5000 })).toBe(5000);
    expect(bankedMoney({ ...s, phase: 'given-up', money: 5000 })).toBe(0);
  });
});

// The router's time rules (#204's test 8), pure.
describe("the Idle Adventure's clock", () => {
  const run = createIdleRun({ species: 4 }, 2);
  const town: IdleState = { ...run, phase: 'town' };
  const now = 1_000_000;

  it('restarts the clock at now only for a cut; any other move on waits for the segment playing, and a party change leaves it', () => {
    const ahead = now + 60_000;
    expect(restartAt(run, run, { type: 'SET_MODE', mode: 'stop' }, now, ahead)).toEqual(new Date(now));
    expect(restartAt(run, run, { type: 'CONTINUE_RUN' }, now, ahead)).toEqual(new Date(now));
    expect(restartAt(town, { ...town, phase: 'walking' }, { type: 'GYM' }, now, ahead)).toEqual(new Date(ahead));
    expect(restartAt(town, { ...town, phase: 'walking' }, { type: 'GYM' }, now, now - 5000)).toEqual(new Date(now));
    expect(restartAt({ ...run, choosing: run.party[0] }, run, { type: 'CAUGHT_CHOICE' }, now, ahead)).toEqual(new Date(ahead));
    expect(restartAt({ ...run, stopped: true }, run, { type: 'SET_MODE', mode: 'route' }, now, ahead)).toEqual(new Date(ahead));
    expect(restartAt(run, run, { type: 'SET_ORDER', uids: [] }, now, ahead)).toBeNull();
    expect(restartAt(town, town, { type: 'BUY', item: 'poke-ball', count: 1 }, now, ahead)).toBeNull();
    // Never before the segment playing's end, unless the action cuts it.
    const actions: IdleAction[] = [{ type: 'GYM' }, { type: 'CONTINUE' }, { type: 'GRIND' }, { type: 'BACK_ROUTE' }, { type: 'LEAVE_STORE' }, { type: 'CAUGHT_CHOICE' }, { type: 'VISIT_STORE' }, { type: 'WILD_GRIND' }, { type: 'SET_SLOTS', uid: 'x', slots: [] }, { type: 'GIVE_UP' }];
    for (const a of actions) for (const [before, after] of [[town, run], [run, run], [town, town]] as const) {
      const at = restartAt(before, after, a, now, ahead);
      if (at) expect(at.getTime(), a.type).toBe(ahead);
    }
  });

  it("plays offline at most the cap's time, from where the run was played to", () => {
    expect(catchUpWindow(now - 5000, now)).toEqual({ from: now - 5000, elapsed: 5000 });
    expect(catchUpWindow(now - CATCH_UP_CAP_MS - 99_999, now)).toEqual({ from: now - CATCH_UP_CAP_MS, elapsed: CATCH_UP_CAP_MS });
    expect(catchUpWindow(now + 5000, now).elapsed).toBeLessThan(0);
  });

  it("asks for the next segment only near the last one's end, and a town only after its wait", () => {
    expect(nextWait(run, now + AHEAD_MS, now)).toBeNull();
    expect(nextWait(run, now + AHEAD_MS + 1, now)).toBe('Still playing the last part');
    expect(nextWait(town, now - TOWN_WAIT_MS + 1, now)).toBe('Waiting in town');
    expect(nextWait(town, now - TOWN_WAIT_MS, now)).toBeNull();
  });

  it("takes a ball only for a tick not played yet by the clock, and never plays the run back to before now", () => {
    const { saved, battle } = wildSegment(3, false);
    const ball = { ...saved, replay: { ...saved.replay!, prev: { ...saved.replay!.prev, bag: { 'poke-ball': 5 } } } };
    expect(throwError(saved, 2, false)).toBe('No Poké Balls in the bag');
    expect(throwError(ball, 2, true)).toBe('No Master Ball in the bag');
    expect(throwError(ball, 2, false)).toBeNull();
    expect(throwError({ ...ball, replay: { ...ball.replay, throws: [3] } }, 2, false)).toBe('A ball is already on its way');
    expect(throwError({ ...ball, replay: { ...ball.replay, throwable: false } }, 2, false)).toBe('Too late to throw a ball in this battle');
    expect(throwError({ ...ball, replay: undefined }, 2, false)).toBe('Too late to throw a ball in this battle');
    // Tick 1 of a battle long over (a crafted ask after it was lost or fled): refused; the next tick, while it plays: taken.
    const from = 50_000;
    const tick1 = from + battle.at! + tickStartMs(battle, 1);
    expect(throwTimeError(from, battle, 1, tick1 + THROW_GRACE_MS)).toBeNull();
    expect(throwTimeError(from, battle, 1, tick1 + THROW_GRACE_MS + 1)).toBe('Too late to throw a ball in this battle');
    expect(throwTimeError(from, battle, 1, from + battle.at! + tickStartMs(battle, battle.ticks) + 60_000)).toBe('Too late to throw a ball in this battle');
    expect(throwTimeError(from, battle, battle.ticks + 1, from)).toBe('The battle is over');
    expect(throwPlayedTo(from, 10_000, from + 20_000)).toEqual(new Date(from + 20_000));
    expect(throwPlayedTo(from, 30_000, from + 20_000)).toEqual(new Date(from + 30_000));
  });
});

// The Pokédex follows what was kept (#204's test 9): a catch is recorded once it's shown.
describe("the Idle Adventure's Pokédex notes", () => {
  it('records a segment\'s seen Pokémon at once and its catch only once it is past; a cut before the "Gotcha!" drops it', () => {
    const { saved, segment, battle, notes } = wildSegment(7, true);
    const foe = battle.foes[0]!.species;
    expect(notes.now.every((n) => !n.ivs)).toBe(true);
    expect(notes.now.some((n) => n.species === foe)).toBe(true);
    expect(notes.later.some((n) => n.species === foe && n.ivs)).toBe(true);
    expect(dueNotes(saved)).toBe(notes.later);
    // Auto-catch's "new" knows the catch before it's recorded.
    expect(caughtWithDue([1], saved)).toContain(foe);
    // Cut at the battle's start (Stop): the run has no replay, nothing of the catch to record.
    const cut = cutSegment(saved, battle.at!);
    expect(cut).not.toBe(saved);
    expect(dueNotes(cut)).toEqual([]);
    // Past the segment's end, kept whole: recorded once (and taken out of the run).
    const past = cutSegment(saved, segment.durationMs);
    expect(past).toBe(saved);
    expect(dueNotes(withoutDueNotes(past))).toEqual([]);
    expect(withoutDueNotes(past).replay?.from).toBe(0);
  });
});
