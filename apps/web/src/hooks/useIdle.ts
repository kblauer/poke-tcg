import type { AppRouter } from '@poke-tcg/api/router';
import { AREAS, areaIndex, FADE_MS, ITEMS, playing, STEP_MS, TICK_MS, type CatchUpSummary, type IdleAction, type IdleSettings, type SegmentEvent, type TownArea, type TrackStep, type WalkArea } from '@poke-tcg/idle';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { inferRouterOutputs } from '@trpc/server';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TRANSITION_MS } from '../components/BattleTransition';
import { useTRPC } from '../lib/trpc';
import type { Facing } from '../utils/overworld';

export type IdleOverview = inferRouterOutputs<AppRouter>['idle']['overview'];
export type ClientIdleRun = NonNullable<IdleOverview['run']>;
export type BattleSegment = Extract<SegmentEvent, { t: 'battle' }>;
type BattleEvent = BattleSegment['events'][number];

/** A Pokémon's reward after a foe faints (EXP., a level, a move learned): a run of them is shown at once, as one line's time (the user's). */
export const isReward = (e: BattleEvent) => e.t === 'exp' || e.t === 'level' || e.t === 'learn';

/** How long after an attack's line its hit lands (the HP drop and the blink). */
const HIT_BEAT_MS = 500;

/** The least time away that's told (what happened while away); a shorter catch-up just plays on. */
const CATCH_UP_TOLD_MS = 60_000;

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
    start: (species: number, shiny = false) => start.mutateAsync({ species, shiny }),
    act: (run: ClientIdleRun, action: IdleAction) => act.mutateAsync({ runId: run.id, expectedVersion: run.version, action }),
    settings: (s: Partial<IdleSettings>) => settings.mutateAsync(s),
    warp: (run: ClientIdleRun, area: string) => warp.mutateAsync({ runId: run.id, area }),
    // Changing a run invalidates any segment in flight: refetch the overview so its version is the newest.
    refresh: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** Where the player stands on the scene: the area, its leg and the step along its track; grinding, `grind` (the town) and the step round its loop. */
export interface Place {
  area: number;
  leg: number;
  step: number;
  grind?: number;
}

/** The track a place's step is on: its leg's, or grinding, the town's loop (TownArea.grind). */
export function placeTrack(place: Place): TrackStep[] {
  if (place.grind !== undefined) return (AREAS[place.grind] as TownArea).grind!.loop;
  const area = AREAS[place.area] as WalkArea;
  return area.legs[Math.min(place.leg, area.legs.length - 1)]!.track;
}

/** The place on a town's grind loop at its step `at`. */
function grindPlace(town: number, at: number): Place {
  const grind = (AREAS[town] as TownArea).grind!;
  return { area: areaIndex(grind.area), leg: grind.leg, step: at, grind: town };
}

/** Where a run stands: its area's step, or grinding, its step round the town's loop. */
export const placeOf = (view: ClientIdleRun['view']): Place => (view.phase === 'grinding' && view.grind ? grindPlace(view.area, view.grind.at) : { area: view.area, leg: view.leg, step: view.step });

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
  /**
   * The battle about to start (the user's: its music starts as the trainer's "!" shows, and with a wild one's flash),
   * then the battle on screen; the music follows it, so the song carries on into the battle.
   */
  cue: BattleSegment | null;
  shown: number;
  /** A battle's start: the play area's battle transition over the scene (SceneTransition), TRANSITION_MS. */
  entering: boolean;
  /** A line about what just happened (money, a catch, an evolution, a badge), shown for a moment. */
  notice: string | null;
  /** The game's tick (TICK_MS, shown in a battle: the user's): the battle's turn (null out of battle) and when the current tick began. */
  turn: number | null;
  tickAt: number;
}

const IDLE: Playback = { place: null, face: 'up', walkTick: 0, moveMs: 0, jump: null, fading: false, spotted: null, battle: null, cue: null, shown: 0, entering: false, notice: null, turn: null, tickAt: 0 };

/** Whether the tab is showing (document.visibilityState), followed as it changes. */
function useTabVisible() {
  return useSyncExternalStore(
    (changed) => {
      document.addEventListener('visibilitychange', changed);
      return () => document.removeEventListener('visibilitychange', changed);
    },
    () => document.visibilityState === 'visible',
  );
}

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
    case 'bought':
      return `Bought ${e.count} ${ITEMS[e.item]?.name ?? e.item}${e.count === 1 ? '' : 's'} for ₱${e.cost.toLocaleString()}.`;
    case 'caught':
      return (e.shiny ? 'A shiny! ' : '') + (e.kept ? (e.replaced ? `${name(e.species)} joined the party in place of ${name(e.replaced)}.` : `${name(e.species)} joined the party!`) : `${name(e.species)} was registered in the Pokédex and released.`);
    case 'badge':
      return `Won the ${e.badge} Badge!`;
    case 'whiteout':
      return 'Blacked out! Went back to the start.';
    case 'won':
      return 'Became the Pokémon League Champion!';
    default:
      return null;
  }
}

/**
 * Plays a run back (agreed with the user: the server resolves everything, the browser plays it): on opening, catches up
 * the time since it was last played (idle.catchUp, again while there's more), then asks for the next segment, plays its
 * walk a step at a time, its battle a turn per 3 s (one pace: no speed setting), and asks again, until the run waits in
 * a town or is over. Stops when the page goes.
 */
export function useIdlePlayback(run: ClientIdleRun | null | undefined, name: (id: number) => string, onError: (message: string) => void) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.idle.overview.queryKey();
  const next = useMutation(trpc.idle.next.mutationOptions());
  const catchUp = useMutation(trpc.idle.catchUp.mutationOptions());
  const [play, setPlay] = useState<Playback>(IDLE);
  const [summary, setSummary] = useState<CatchUpSummary | null>(null);
  const update = useCallback((p: Partial<Playback>) => setPlay((old) => ({ ...old, ...p })), []);
  /** The run as the server last returned it (ahead of the screen while a segment plays). */
  const latest = useRef<ClientIdleRun | null>(null);
  /** Bumped to start the playback again after an error. */
  const [restart, setRestart] = useState(0);
  const runId = run?.id ?? null;
  const walking = run?.status === 'ACTIVE' && playing(run.view);
  // A hidden tab stops the playback (the browser slows its timers, so it would fall behind and the time be lost); shown
  // again, it starts over, catching up the time it was hidden as after the page was closed (the user's).
  const visible = useTabVisible();

  useEffect(() => {
    if (!run || !walking) {
      if (run) update({ place: placeOf(run.view), battle: null, cue: null, spotted: null });
      // Opened in a town (the user's: no prompt waits on the player): time away past its wait is caught up too, and the
      // run, walking again, plays on (this effect again, for the rest).
      if (run?.status !== 'ACTIVE' || run.view.phase !== 'town' || !visible) return;
      let gone = false;
      catchUp
        .mutateAsync({ runId: run.id, expectedVersion: run.version })
        .then((r) => {
          if (gone || !r.summary) return;
          latest.current = r.run;
          const told = r.summary;
          if (told.durationMs >= CATCH_UP_TOLD_MS) setSummary((old) => (old ? mergeSummaries(old, told) : told));
          queryClient.setQueryData(key, (old) => old && { ...old, run: r.run });
        })
        .catch(() => {});
      return () => void (gone = true);
    }
    if (!visible) return;
    // Whatever was playing when it stopped (a battle half shown, a fade, a line) is dropped: the server is past it.
    update({ battle: null, cue: null, shown: 0, entering: false, spotted: null, notice: null, fading: false, turn: null, tickAt: Date.now() });
    let stopped = false;
    const timers = new Set<number>();
    const wait = (ms: number) =>
      new Promise<void>((done, fail) => {
        if (stopped) return fail(new Stopped());
        const t = window.setTimeout(() => {
          timers.delete(t);
          if (stopped) fail(new Stopped());
          else done();
        }, ms);
        timers.add(t);
      });
    // The server's newest (a segment cut short when the tab was hidden is saved already), else the run given.
    let current = latest.current && latest.current.id === run.id && latest.current.version > run.version ? latest.current : run;
    const setRun = (r: ClientIdleRun) => {
      current = r;
      queryClient.setQueryData(key, (old) => old && { ...old, run: r });
    };

    async function walk(e: Extract<SegmentEvent, { t: 'walk' }>, place: Place) {
      const track = placeTrack(place);
      // Forward along the track, or back along it (a route grind pacing back and forth: the user's).
      const dir = e.to >= e.from ? 1 : -1;
      for (let i = e.from + dir; dir > 0 ? i <= e.to : i >= e.to; i += dir) {
        const [m, x, y, flags] = track[i]!;
        const [pm, px, py] = track[i - dir]!;
        if ((dir > 0 && flags & 1) || m !== pm) {
          // As long as the server counts it: the step and the fade.
          update({ fading: true });
          await wait((STEP_MS + FADE_MS) / 2);
          setPlay((old) => ({ ...old, place: { ...place, step: i }, moveMs: 0, fading: false }));
          await wait((STEP_MS + FADE_MS) / 2);
          continue;
        }
        const jump = dir > 0 && (flags & 2) !== 0;
        const ms = STEP_MS * (jump ? 2 : 1);
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

    /** Steps round a grind loop (the user's: running in a circle), a step each STEP_MS. */
    async function circle(e: Extract<SegmentEvent, { t: 'circle' }>, place: Place) {
      const loop = placeTrack(place);
      for (let k = 1; k <= e.steps; k++) {
        const i = (e.from + k) % loop.length;
        const [, x, y] = loop[i]!;
        const [, px, py] = loop[(i + loop.length - 1) % loop.length]!;
        setPlay((old) => ({ ...old, place: { ...place, step: i }, face: faceOf(x - px, y - py, old.face), walkTick: old.walkTick + 1, moveMs: STEP_MS }));
        await wait(STEP_MS);
        place.step = i;
      }
    }

    async function battle(e: BattleSegment) {
      // The play area's battle transition over the scene (SceneTransition, the user's), the battle once it's closed.
      update({ entering: true, cue: e });
      await wait(TRANSITION_MS);
      update({ battle: e, shown: 0, entering: false });
      // Each tick's events spread over its TICK_MS; the opening (send-outs) at a quicker pace. A run of rewards (EXP.,
      // levels, moves learned) is one line: shown at once.
      const said = (x: BattleEvent) => 'msg' in x && !!x.msg;
      let i = 0;
      while (i < e.events.length) {
        const start = i;
        const first = e.events[start]!;
        if (first.t === 'tick' && start > 0) update({ turn: first.n, tickAt: Date.now() });
        i++;
        while (i < e.events.length && e.events[i]!.t !== 'tick') i++;
        // The group's lines, each run of rewards counted once. A line takes the silent events after it (an attack's hit:
        // its HP drop and blink), shown a beat after it (the user's: the HP falls with the hit, not with the next line).
        const slots: [number, number][] = [];
        for (let j = start; j < i; j++) {
          let end = j;
          if (isReward(e.events[j]!)) while (end + 1 < i && isReward(e.events[end + 1]!)) end++;
          else if (said(e.events[j]!)) while (end + 1 < i && !said(e.events[end + 1]!) && !isReward(e.events[end + 1]!)) end++;
          slots.push([j, end]);
          j = end;
        }
        const count = slots.filter(([j, end]) => e.events.slice(j, end + 1).some(said)).length;
        const per = (start === 0 ? 1600 : TICK_MS) / Math.max(1, count);
        const beat = Math.min(HIT_BEAT_MS, per / 2);
        for (const [j, end] of slots) {
          if (!e.events.slice(j, end + 1).some(said)) {
            update({ shown: end + 1 });
            continue;
          }
          // A line with silent events after it: the line, then the rest a beat later.
          const head = isReward(e.events[j]!) ? end : j;
          update({ shown: head + 1 });
          if (end > head) {
            await wait(beat);
            update({ shown: end + 1 });
            await wait(per - beat);
          } else await wait(per);
        }
        // A turn with nothing to say (both Pokémon asleep, say) still takes its tick.
        if (!count && start > 0) await wait(TICK_MS);
      }
      await wait(1400);
      update({ battle: null, cue: null, shown: 0, spotted: null, turn: null, tickAt: Date.now() });
    }

    /** The place on screen (the walk moves its step along). */
    let shown: Place = placeOf(current.view);

    async function playSegment(events: SegmentEvent[]) {
      let place: Place | null = null;
      for (const [i, e] of events.entries()) {
        if (e.t === 'area' || e.t === 'grind') {
          const next = e.t === 'grind' ? grindPlace(e.town, e.at) : { area: e.area, leg: e.leg, step: e.step };
          // A jump along the same track (a route grind going back, Continue route) fades too.
          const changed = shown.area !== next.area || shown.leg !== next.leg || shown.grind !== next.grind || Math.abs(shown.step - next.step) > 1;
          place = next;
          shown = place;
          if (changed) {
            update({ fading: true });
            await wait(FADE_MS / 2);
            update({ place: { ...place }, fading: false, moveMs: 0 });
            await wait(FADE_MS / 2);
          } else update({ place: { ...place }, moveMs: 0 });
        } else if (e.t === 'walk' && place) {
          await walk(e, place);
        } else if (e.t === 'circle' && place) {
          await circle(e, place);
        } else if (e.t === 'spotted') {
          // The trainer's battle (the next one in the segment): its music from the "!".
          const next = events.slice(i + 1).find((x): x is BattleSegment => x.t === 'battle') ?? null;
          update({ spotted: e.trainer, cue: next });
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
        update({ place: placeOf(current.view) });
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
          const told = total;
          if (told.durationMs >= CATCH_UP_TOLD_MS) setSummary((old) => (old ? mergeSummaries(old, told) : told));
          shown = placeOf(current.view);
          update({ place: { ...shown } });
        }
        while (!stopped && current.status === 'ACTIVE' && playing(current.view)) {
          let r;
          try {
            r = await next.mutateAsync({ runId: current.id, expectedVersion: newest().version });
          } catch (e) {
            // Played back faster than the server counted (a reload mid-segment): wait until it's caught up.
            if (stopped || !(e instanceof Error) || !e.message.startsWith('Still playing')) throw e;
            const ahead = new Date(newest().simulatedAt).getTime() - Date.now();
            await wait(Math.max(1000, ahead - 10_000));
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
    // Restarted only for another run, when it starts or stops walking, or the tab is shown again; it reads the newest run
    // as it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, walking, restart, visible]);

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
