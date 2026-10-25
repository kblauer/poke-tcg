import type { AppRouter } from '@poke-tcg/api/router';
import { AREAS, FADE_MS, STEP_MS, TICK_MS, type CatchUpSummary, type IdleAction, type IdleSettings, type SegmentEvent, type WalkArea } from '@poke-tcg/idle';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { inferRouterOutputs } from '@trpc/server';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTRPC } from '../lib/trpc';
import type { Facing } from '../utils/overworld';

export type IdleOverview = inferRouterOutputs<AppRouter>['idle']['overview'];
export type ClientIdleRun = NonNullable<IdleOverview['run']>;
export type BattleSegment = Extract<SegmentEvent, { t: 'battle' }>;

/** The Idle Adventure's overview (idle.overview): the run, the settings, the starters and the Pokédex. */
export function useIdleOverview(enabled = true) {
  const trpc = useTRPC();
  // Not refetched on the window's focus: the server is ahead of the screen while a segment plays, and its state (a town
  // reached) would cut the playback short.
  return useQuery({ ...trpc.idle.overview.queryOptions(), staleTime: 0, refetchOnWindowFocus: false, enabled });
}

/** The run's moves: starting one, the town choices and the party's, the settings; each answer put in the cached overview. */
export function useIdleActions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.idle.overview.queryKey();
  const setRun = (run: ClientIdleRun) => queryClient.setQueryData(key, (old) => old && { ...old, run });
  const start = useMutation(trpc.idle.start.mutationOptions({ onSuccess: (run) => (setRun(run), void queryClient.invalidateQueries({ queryKey: key })) }));
  const act = useMutation(trpc.idle.act.mutationOptions({ onSuccess: ({ run }) => setRun(run) }));
  const settings = useMutation(trpc.idle.settings.mutationOptions({ onSuccess: (s) => queryClient.setQueryData(key, (old) => old && { ...old, settings: s }) }));
  const warp = useMutation(trpc.idle.debugWarp.mutationOptions({ onSuccess: setRun }));
  return {
    busy: start.isPending || act.isPending,
    start: (species: number) => start.mutateAsync({ species }),
    act: (run: ClientIdleRun, action: IdleAction) => act.mutateAsync({ runId: run.id, expectedVersion: run.version, action }),
    settings: (s: Partial<IdleSettings>) => settings.mutateAsync(s),
    warp: (run: ClientIdleRun, area: string) => warp.mutateAsync({ runId: run.id, area }),
    // Changing a run invalidates any segment in flight: refetch the overview so its version is the newest.
    refresh: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** Where the player stands on the scene: the area, its leg and the step along its track. */
export interface Place {
  area: number;
  leg: number;
  step: number;
}

/** What the scene shows while a run plays back (useIdlePlayback). */
export interface Playback {
  place: Place | null;
  face: Facing;
  /** The walk cycle's frame count, and how long the current step takes (for the slide). */
  walkTick: number;
  moveMs: number;
  /** A ledge being jumped (its stamp, for the jump's arc). */
  jump: { ms: number; stamp: number } | null;
  /** The scene fading out between maps. */
  fading: boolean;
  /** A trainer who has just seen the player ("!"). */
  spotted: string | null;
  /** The battle on screen, and how many of its events have played. */
  battle: BattleSegment | null;
  shown: number;
  /** A battle's start: the screen flashing into it. */
  entering: boolean;
  /** A line about what just happened (money, a catch, an evolution, a badge), shown for a moment. */
  notice: string | null;
}

const IDLE: Playback = { place: null, face: 'up', walkTick: 0, moveMs: 0, jump: null, fading: false, spotted: null, battle: null, shown: 0, entering: false, notice: null };

/** Thrown into the playback when it's stopped (the page left), so it goes no further. */
class Stopped extends Error {}

const faceOf = (dx: number, dy: number, fallback: Facing): Facing => (dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : dy < 0 ? 'up' : fallback);

/** A line for each event that isn't a step or a battle. */
function noticeOf(e: SegmentEvent, name: (id: number) => string): string | null {
  switch (e.t) {
    case 'money':
      return `Got ₱${e.amount.toLocaleString()} for winning! (${e.why})`;
    case 'evolve':
      return `${name(e.from)} evolved into ${name(e.into)}!`;
    case 'caught':
      return e.kept ? (e.replaced ? `${name(e.species)} joined the party in place of ${name(e.replaced)}.` : `${name(e.species)} joined the party!`) : `${name(e.species)} was registered in the Pokédex and released.`;
    case 'badge':
      return `Won the ${e.badge} Badge!`;
    case 'whiteout':
      return `Blacked out! Lost ₱${e.lost.toLocaleString()} and went back to the start.`;
    case 'won':
      return 'Became the Pokémon League Champion!';
    default:
      return null;
  }
}

/**
 * Plays a run back (agreed with the user: the server resolves everything, the browser plays it): on opening, catches up
 * the time since it was last played (idle.catchUp, again while there's more), then asks for the next segment, plays its
 * walk at the walk speed, its battle a turn per 3 s (both at the speed setting), and asks again, until the run waits in
 * a town or is over. Stops when the page goes.
 */
export function useIdlePlayback(run: ClientIdleRun | null | undefined, speed: number, name: (id: number) => string, onError: (message: string) => void) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.idle.overview.queryKey();
  const next = useMutation(trpc.idle.next.mutationOptions());
  const catchUp = useMutation(trpc.idle.catchUp.mutationOptions());
  const [play, setPlay] = useState<Playback>(IDLE);
  const [summary, setSummary] = useState<CatchUpSummary | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const update = useCallback((p: Partial<Playback>) => setPlay((old) => ({ ...old, ...p })), []);
  /** The run as the server last returned it (ahead of the screen while a segment plays). */
  const latest = useRef<ClientIdleRun | null>(null);
  /** Bumped to start the playback again after an error. */
  const [restart, setRestart] = useState(0);
  const runId = run?.id ?? null;
  const walking = run?.status === 'ACTIVE' && run.view.phase === 'walking';

  useEffect(() => {
    if (!run || !walking) {
      if (run) update({ place: { area: run.view.area, leg: run.view.leg, step: run.view.step }, battle: null, spotted: null });
      return;
    }
    let stopped = false;
    const timers = new Set<number>();
    const wait = (ms: number) =>
      new Promise<void>((done, fail) => {
        if (stopped) return fail(new Stopped());
        const t = window.setTimeout(() => {
          timers.delete(t);
          if (stopped) fail(new Stopped());
          else done();
        }, ms / speedRef.current);
        timers.add(t);
      });
    let current = run;
    const setRun = (r: ClientIdleRun) => {
      current = r;
      queryClient.setQueryData(key, (old) => old && { ...old, run: r });
    };

    async function walk(e: Extract<SegmentEvent, { t: 'walk' }>, place: Place) {
      const leg = (AREAS[place.area] as WalkArea).legs[place.leg]!;
      for (let i = e.from + 1; i <= e.to; i++) {
        const [m, x, y, flags] = leg.track[i]!;
        const [pm, px, py] = leg.track[i - 1]!;
        if (flags & 1 || m !== pm) {
          // As long as the server counts it: the step and the fade.
          update({ fading: true });
          await wait((STEP_MS + FADE_MS) / 2);
          setPlay((old) => ({ ...old, place: { ...place, step: i }, moveMs: 0, fading: false }));
          await wait((STEP_MS + FADE_MS) / 2);
          continue;
        }
        const jump = (flags & 2) !== 0;
        const ms = (STEP_MS * (jump ? 2 : 1)) / speedRef.current;
        setPlay((old) => ({
          ...old,
          place: { ...place, step: i },
          face: faceOf(x - px, y - py, old.face),
          walkTick: old.walkTick + 1,
          moveMs: ms,
          jump: jump ? { ms, stamp: Date.now() } : old.jump,
        }));
        await wait(STEP_MS * (jump ? 2 : 1));
      }
      place.step = e.to;
    }

    async function battle(e: BattleSegment) {
      update({ entering: true });
      await wait(900);
      update({ battle: e, shown: 0, entering: false });
      // Each tick's events spread over its 3 s; the opening (send-outs) at a quicker pace.
      let i = 0;
      while (i < e.events.length) {
        const start = i;
        i++;
        while (i < e.events.length && e.events[i]!.t !== 'tick') i++;
        const group = e.events.slice(start, i);
        const count = group.filter((x) => 'msg' in x && x.msg).length;
        const per = (start === 0 ? 1600 : TICK_MS) / Math.max(1, count);
        for (let j = start; j < i; j++) {
          update({ shown: j + 1 });
          const ev = e.events[j]!;
          if ('msg' in ev && ev.msg) await wait(per);
        }
        // A turn with nothing to say (both Pokémon asleep, say) still takes its 3 s.
        if (!count && start > 0) await wait(TICK_MS);
      }
      await wait(1400);
      update({ battle: null, shown: 0, spotted: null });
    }

    /** The place on screen (the walk moves its step along). */
    let shown: Place = { area: current.view.area, leg: current.view.leg, step: current.view.step };

    async function playSegment(events: SegmentEvent[]) {
      let place: Place | null = null;
      for (const e of events) {
        if (e.t === 'area') {
          const changed = shown.area !== e.area || shown.leg !== e.leg;
          place = { area: e.area, leg: e.leg, step: e.step };
          shown = place;
          if (changed) {
            update({ fading: true });
            await wait(FADE_MS / 2);
            update({ place: { ...place }, fading: false, moveMs: 0 });
            await wait(FADE_MS / 2);
          } else update({ place: { ...place }, moveMs: 0 });
        } else if (e.t === 'walk' && place) {
          await walk(e, place);
        } else if (e.t === 'spotted') {
          update({ spotted: e.trainer });
          await wait(1500);
        } else if (e.t === 'battle') {
          await battle(e);
        } else {
          const line = noticeOf(e, name);
          if (line) {
            update({ notice: line });
            await wait(1600);
            update({ notice: null });
          }
        }
      }
    }

    /** The newest version the server has (an action taken meanwhile, `acted`, may be newer than ours). */
    const newest = () => (latest.current && latest.current.id === current.id && latest.current.version > current.version ? latest.current : current);

    (async () => {
      try {
        update({ place: { area: current.view.area, leg: current.view.leg, step: current.view.step } });
        // Offline catch-up first: the time since it was last played, a share at a time.
        let total: CatchUpSummary | null = null;
        for (let more = true; more; ) {
          const r = await catchUp.mutateAsync({ runId: current.id, expectedVersion: newest().version });
          if (stopped) return;
          latest.current = r.run;
          setRun(r.run);
          more = r.more;
          if (r.summary) total = total ? mergeSummaries(total, r.summary) : r.summary;
        }
        if (total && total.segments > 0) {
          setSummary(total);
          shown = { area: current.view.area, leg: current.view.leg, step: current.view.step };
          update({ place: { ...shown } });
        }
        while (!stopped && current.status === 'ACTIVE' && current.view.phase === 'walking') {
          let r;
          try {
            r = await next.mutateAsync({ runId: current.id, expectedVersion: newest().version });
          } catch (e) {
            // Played back faster than the server counted (a faster speed picked midway, a reload): wait until it's caught up.
            if (stopped || !(e instanceof Error) || !e.message.startsWith('Still playing')) throw e;
            const ahead = new Date(newest().simulatedAt).getTime() - Date.now();
            await wait(Math.max(1000, ahead - 10_000) * speedRef.current);
            continue;
          }
          if (stopped) return;
          // The server's newest state at once (actions use its version); the screen's once the segment has played.
          latest.current = r.run;
          await playSegment(r.segment.events);
          setRun(newest().version > r.run.version ? newest() : r.run);
        }
      } catch (e) {
        if (e instanceof Stopped || stopped) return;
        onError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        // Start over from the server's state after a moment (a stale version, a hiccup).
        await new Promise((done) => window.setTimeout(done, 2000));
        if (stopped) return;
        await queryClient.invalidateQueries({ queryKey: key });
        if (!stopped) setRestart((n) => n + 1);
      }
    })();
    return () => {
      stopped = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
    // Restarted only for another run or when it starts or stops walking; it reads the newest run as it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, walking, restart]);

  return {
    play,
    summary,
    closeSummary: () => setSummary(null),
    /** The run to act on: the server's newest (a segment playing is already saved), else the one given. */
    actOn: (r: ClientIdleRun) => (latest.current && latest.current.id === r.id && latest.current.version > r.version ? latest.current : r),
    /** After an action: its answer is the newest run (the playback asks for the next segment with its version). */
    acted: (r: ClientIdleRun) => void (latest.current = r),
  };
}

/** Two catch-up calls' summaries as one. */
function mergeSummaries(a: CatchUpSummary, b: CatchUpSummary): CatchUpSummary {
  return {
    segments: a.segments + b.segments,
    durationMs: a.durationMs + b.durationMs,
    battles: a.battles + b.battles,
    caught: [...a.caught, ...b.caught],
    levels: a.levels + b.levels,
    evolutions: [...a.evolutions, ...b.evolutions],
    whiteOuts: a.whiteOuts + b.whiteOuts,
    money: a.money + b.money,
    badges: [...a.badges, ...b.badges],
    stopped: b.stopped,
  };
}
