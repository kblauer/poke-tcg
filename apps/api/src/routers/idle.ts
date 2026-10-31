import { prisma } from '@poke-tcg/db';
import { AREAS, applyIdleAction, areaIndex, BALLS, throwable, isBaseForm, isOptional, CATCH_UP_CAP_MS, catchUp, createIdleRun, cutSegment, cuts, DEFAULT_IDLE_SETTINGS, isTown, partyNotes, playing, reachedArea, simulateSegment, TOWN_WAIT_MS, starterOptions, STARTERS, visitStore, withPending, type IdleSettings, type Stats } from '@poke-tcg/idle';
import { idleActInput, idleDebugCatchInput, idleHereInput, idleRunInput, idleSettingsInput, idleThrowInput, idleWarpInput, startIdleInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { asJson, newSeed } from '../games.js';
import { caughtSpecies, clientIdleRun, idleSettings, latestIdleRun, loadOwnIdleRun, saveIdleRun, type LoadedIdleRun } from '../idle.js';
import { lockUser } from '../runs.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';

/** How far ahead of now a run may be played (the browser asks for the next segment as the last one ends; a little early is fine). */
const AHEAD_MS = 15_000;
/** Debug's money button (idle.debugMoney): ₱ added to the run under way. */
const DEBUG_MONEY = 1_000_000;

/** A run's state checked against the version the browser had (CONFLICT when stale). */
function checkVersion(run: LoadedIdleRun, expected: number) {
  if (run.version !== expected) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
}

const failed = (error: string) => new TRPCError({ code: 'BAD_REQUEST', message: error });

/**
 * The Idle Adventure (README: Idle Adventure): the account's run, starting one, its segments as it walks, the town
 * choices, offline catch-up, the settings and the Pokédex.
 */
export const idleRouter = router({
  /** The account's latest run (under way or over), its settings, the starters it can pick and its Pokédex. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const [run, settings, dex, runs] = await Promise.all([
      latestIdleRun(ctx.user.id),
      idleSettings(ctx.user.id),
      prisma.idleDex.findMany({ where: { userId: ctx.user.id }, orderBy: { species: 'asc' } }),
      prisma.idleRun.count({ where: { ownerId: ctx.user.id } }),
    ]);
    const caught = dex.filter((d) => d.caught).map((d) => d.species);
    return {
      run: run && clientIdleRun(run),
      settings,
      // The three starters on the first run; from the second on, any species the Pokédex has caught too (agreed).
      starters: runs ? starterOptions(caught) : STARTERS,
      // A species with a shiny caught can start shiny (agreed).
      shinyStarters: runs ? dex.filter((d) => d.shiny && isBaseForm(d.species)).map((d) => d.species) : [],
      dex: dex.map((d) => ({ species: d.species, seen: d.seen, caught: d.caught, shiny: d.shiny, bestIv: d.bestIv, bestEv: d.bestEv })),
    };
  }),

  /** Starts a run with a starter (at level 5; a dex species with its record's best IVs and EVs). One run under way at a time. */
  start: protectedProcedure.input(startIdleInput).mutation(async ({ ctx, input }) => {
    const created = await prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      if (await tx.idleRun.findFirst({ where: { ownerId: ctx.user.id, status: 'ACTIVE' }, select: { id: true } })) throw failed('A run is already under way');
      const runs = await tx.idleRun.count({ where: { ownerId: ctx.user.id } });
      const caught = await caughtSpecies(ctx.user.id, tx);
      if (!(runs ? starterOptions(caught) : STARTERS).includes(input.species)) throw failed("That Pokémon can't be picked");
      // A caught species starts with its record's best IVs and EVs (a starter never caught: random IVs, no EVs).
      const record = caught.includes(input.species) ? await tx.idleDex.findUnique({ where: { userId_species: { userId: ctx.user.id, species: input.species } } }) : null;
      if (input.shiny && !(runs && record?.shiny)) throw failed('No shiny of that Pokémon has been caught');
      const seed = newSeed();
      const state = createIdleRun({ species: input.species, shiny: input.shiny, ...(record && { ivs: record.bestIv as Stats, evs: record.bestEv as Stats }) }, seed);
      return tx.idleRun.create({ data: { ownerId: ctx.user.id, state: asJson(state), version: state.version, seed } });
    });
    return clientIdleRun({ ...created, state: created.state as never });
  }),

  /**
   * The next segment (agreed with the user: the server resolves everything, the browser plays it back): steps until a
   * trainer or a wild Pokémon, then the whole battle, as an event log. The run is played up to the segment's end at the
   * pace (one pace: no speed setting, agreed); asked for too far ahead of that, it's refused.
   */
  next: protectedProcedure.input(idleRunInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const now = Date.now();
    if (run.simulatedAt.getTime() > now + AHEAD_MS) throw new TRPCError({ code: 'CONFLICT', message: 'Still playing the last part' });
    // A town waits TOWN_WAIT_MS for the player's choice (the browser takes it then), then goes on by itself.
    if (run.state.phase === 'town' && now < run.simulatedAt.getTime() + TOWN_WAIT_MS) throw failed('Waiting in town');
    const settings = await idleSettings(ctx.user.id);
    const caughtList = await caughtSpecies(ctx.user.id);
    // Watched (`ask`): a catch with the party full waits for the player's choice (IdleState.choosing).
    const next = simulateSegment(run.state, settings, new Set(caughtList), { ask: true });
    if (!next) throw failed(withPending(run.state).stopped ? 'Stopped' : run.state.inStore ? 'In the store' : run.state.choosing ? 'Waiting for your choice' : 'This run is over');
    const from = Math.max(now, run.simulatedAt.getTime());
    const playedTo = new Date(from + next.segment.durationMs);
    // Its start kept, to play it again: from the moment a page opened meanwhile (resume), and its wild battle with a ball
    // the player asks for (throwBall).
    const { replay: _, ...prev } = run.state;
    next.state.replay = { prev, settings, caught: caughtList, from, throws: [], throwable: next.segment.events.some((e) => e.t === 'battle' && e.kind === 'wild') };
    const saved = await saveIdleRun(run, next.state, { dex: next.segment.dex, simulatedAt: playedTo });
    return { run: clientIdleRun(saved), segment: next.segment };
  }),

  /**
   * Offline catch-up (agreed): plays the time since the run was last played (at most 12 hours), through towns (each
   * waits TOWN_WAIT_MS, then goes on: the user's) up to the title, a share of segments a call (`more`: call again).
   * Returns what happened, not the events.
   */
  catchUp: protectedProcedure.input(idleRunInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const now = Date.now();
    // The cap is on the whole absence, not each call: time before the last 8 hours isn't played.
    const from = Math.max(run.simulatedAt.getTime(), now - CATCH_UP_CAP_MS);
    const elapsed = now - from;
    if ((!playing(run.state) && run.state.phase !== 'town' && !run.state.choosing) || elapsed <= 0) return { run: clientIdleRun(run), summary: null, more: false };
    const settings = await idleSettings(ctx.user.id);
    const caught = new Set(await caughtSpecies(ctx.user.id));
    const { state, summary, dex } = catchUp(run.state, settings, caught, elapsed);
    if (!summary.segments) return { run: clientIdleRun(run), summary: null, more: false };
    const more = summary.stopped === 'limit';
    // Played up to the time used (the rest, less than a segment, is played next).
    const playedTo = new Date(from + summary.durationMs);
    const saved = await saveIdleRun(run, state, { dex, simulatedAt: playedTo });
    return { run: clientIdleRun(saved), summary, more };
  }),

  /** The player's choices: in a town (gym, grinding, store, buying, on), the party's order and moves, stones, giving up. */
  act: protectedProcedure.input(idleActInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    // Stop, Continue run and the Town Map act at once (the user's): the segment playing cut where the player is now (a
    // battle begun dropped, no rewards), then the choice.
    const cut = cuts(input.action);
    const result = applyIdleAction(cut ? cutSegment(run.state, Date.now()) : run.state, input.action);
    if (!result.ok) throw failed(result.error);
    let state = result.state;
    let events: ReturnType<typeof visitStore>['events'] = [];
    if (input.action.type === 'VISIT_STORE') {
      const visited = visitStore(state, await idleSettings(ctx.user.id));
      state = visited.state;
      events = visited.events;
    }
    // Leaving a town starts the clock again from now (time spent waiting there isn't played).
    // (Leaving the store too: the town's wait starts again then, the user's.)
    // (Any action out of a waiting town too: a grind chosen there, the user's.)
    // (Those that cut the segment playing too: the run goes on from where it is now.)
    // (A catch with the party full settled by the player too: the run goes on from now, the user's.)
    const leaving = cut || ['GYM', 'CONTINUE', 'GRIND', 'BACK_ROUTE', 'LEAVE_STORE', 'CAUGHT_CHOICE'].includes(input.action.type) || (run.state.phase === 'town' && state.phase !== 'town');
    // So does going on after the Stop mode (time stopped isn't played either); a segment still playing ends first.
    const unstopped = withPending(run.state).stopped && !withPending(state).stopped;
    const restart = leaving ? new Date() : unstopped ? new Date(Math.max(Date.now(), run.simulatedAt.getTime())) : null;
    // A party Pokémon replaced by a catch: its best stats to the dex too, as it leaves.
    const gone = run.state.party.filter((m) => !state.party.some((p) => p.uid === m.uid));
    const saved = await saveIdleRun(run, state, { dex: partyNotes([...state.party, ...gone]), ...(restart && { simulatedAt: restart }) });
    return { run: clientIdleRun(saved), events };
  }),

  /**
   * The battle's ball button (the user's): the best ball on `tick` of the wild battle playing (the tick after the one on
   * screen). The segment is played again from its start (IdleState.replay) with every ball asked for, the same up to
   * that tick, and replaces the one saved; the browser carries on with it from that tick.
   */
  throwBall: protectedProcedure.input(idleThrowInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const replay = run.state.replay;
    if (!replay || !throwable(run.state)) throw failed('Too late to throw a ball in this battle');
    if (replay.throws.some((t) => t >= input.tick)) throw failed('A ball is already on its way');
    if (!BALLS.some(([b]) => (replay.prev.bag[b] ?? 0) > 0)) throw failed('No Poké Balls in the bag');
    const throws = [...replay.throws, input.tick];
    const again = simulateSegment(replay.prev, replay.settings, new Set(replay.caught), { throwAt: throws, ask: true });
    const b = again?.segment.events.find((e) => e.t === 'battle');
    if (!again || b?.t !== 'battle' || b.kind !== 'wild') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The battle could not be played again' });
    if (input.tick > b.ticks) throw failed('The battle is over');
    again.state.version = run.version + 1;
    again.state.replay = { ...replay, throws };
    // The party changes queued during this battle (applyIdleAction) still wait for its end.
    if (run.state.pending?.length) again.state.pending = run.state.pending;
    const saved = await saveIdleRun(run, again.state, { dex: again.segment.dex, simulatedAt: new Date(replay.from + again.segment.durationMs) });
    return { run: clientIdleRun(saved), segment: again.segment };
  }),

  /**
   * The segment still playing (the user's: a page opened mid-segment plays it from where it is, never waiting on it):
   * played again from its start (IdleState.replay, the ball's too), with when it began, so the browser picks it up at
   * now. Null when none is still playing (or the run has no start kept).
   */
  resume: protectedProcedure.input(idleRunInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    const replay = run.state.replay;
    if (!replay || run.simulatedAt.getTime() <= Date.now()) return null;
    const again = simulateSegment(replay.prev, replay.settings, new Set(replay.caught), { throwAt: replay.throws, ask: true });
    if (!again) return null;
    return { run: clientIdleRun(run), segment: again.segment, from: replay.from };
  }),

  /** Changes some of the mode's settings (User.idleSettings); they apply from the next battle. */
  settings: protectedProcedure.input(idleSettingsInput).mutation(async ({ ctx, input }) => {
    const settings: IdleSettings = { ...(await idleSettings(ctx.user.id)), ...input };
    await prisma.user.update({ where: { id: ctx.user.id }, data: { idleSettings: asJson(settings) } });
    return settings;
  }),

  /** Debug (refused in production): the next segment at once, with no wait for playback. */
  debugNext: debugProcedure.input(idleRunInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const next = simulateSegment(run.state, { ...DEFAULT_IDLE_SETTINGS, ...(await idleSettings(ctx.user.id)) }, new Set(await caughtSpecies(ctx.user.id)), { ask: true });
    if (!next) throw failed('Not walking');
    const saved = await saveIdleRun(run, next.state, { dex: next.segment.dex, simulatedAt: new Date() });
    return { run: clientIdleRun(saved), segment: next.segment };
  }),

  /**
   * The player watching a town (the user's, 2026-10-27: a town never goes on by itself while they're there), or a catch
   * with the party full waiting for their choice (IdleState.choosing, the same): the browser
   * says so every few seconds (TOWN_HERE_MS) while a town is on a visible page, and the run's time moves up to now, so
   * only time away (the page hidden or closed) counts toward the town's wait (TOWN_WAIT_MS, played by the offline
   * catch-up). Nothing else changes: no version, no state.
   */
  here: protectedProcedure.input(idleHereInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    const now = new Date();
    // Only while they've been here all along: a gap of the town's wait or more is time away, the catch-up's to play.
    if (run.status !== 'ACTIVE' || (run.state.phase !== 'town' && !run.state.choosing) || run.simulatedAt >= now || now.getTime() - run.simulatedAt.getTime() >= TOWN_WAIT_MS) return { ok: false };
    // Only the version seen: an action saved meanwhile sets its own time.
    const { count } = await prisma.idleRun.updateMany({ where: { id: run.id, version: run.version }, data: { simulatedAt: now } });
    return { ok: count > 0 };
  }),

  /** Debug (refused in production): warps the run to an area's start (a town waits there), its party and bag kept. */
  /** Debug (refused in production): ₱1,000,000 more for the run under way (its segment's start too, so a ball thrown keeps it). */
  debugMoney: debugProcedure.input(idleHereInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    if (run.status !== 'ACTIVE') throw failed('This run is over');
    const state = structuredClone(run.state);
    state.money += DEBUG_MONEY;
    if (state.replay) state.replay.prev.money += DEBUG_MONEY;
    state.version += 1;
    state.log.push(`Debug: +₱${DEBUG_MONEY.toLocaleString()}.`);
    return clientIdleRun(await saveIdleRun(run, state, {}));
  }),

  /** Debug (refused in production): every ball thrown in the run catches (IdleState.debugCatch), or not; from the next battle. */
  debugCatch: debugProcedure.input(idleDebugCatchInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    if (run.status !== 'ACTIVE') throw failed('This run is over');
    const state = structuredClone(run.state);
    if (input.on) state.debugCatch = true;
    else delete state.debugCatch;
    state.version += 1;
    state.log.push(`Debug: every ball catches ${input.on ? 'on' : 'off'}.`);
    return clientIdleRun(await saveIdleRun(run, state, {}));
  }),

  debugWarp: debugProcedure.input(idleWarpInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    // Only a run under way (a finished one is banked: warping it back would make two runs under way).
    if (run.status !== 'ACTIVE') throw failed('This run is over');
    const index = areaIndex(input.area);
    if (index < 0) throw failed('Unknown area');
    const state = structuredClone(run.state);
    // The Town Map's places up to it open with it.
    Object.assign(state, { reached: Math.max(reachedArea(state), isOptional(index) ? 0 : index), area: index, leg: 0, step: 0, beaten: [], phase: isTown(AREAS[index]!) ? 'town' : 'walking', version: state.version + 1 });
    delete state.grind;
    delete state.replay;
    state.log.push(`Debug: warped to ${AREAS[index]!.name}.`);
    return clientIdleRun(await saveIdleRun(run, state, { simulatedAt: new Date() }));
  }),
});
