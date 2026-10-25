import { prisma } from '@poke-tcg/db';
import { AREAS, applyIdleAction, areaIndex, catchUp, createIdleRun, DEFAULT_IDLE_SETTINGS, isTown, simulateSegment, starterOptions, STARTERS, visitStore, type IdleSettings, type Stats } from '@poke-tcg/idle';
import { idleActInput, idleRunInput, idleSettingsInput, idleWarpInput, startIdleInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { asJson, newSeed } from '../games.js';
import { caughtSpecies, clientIdleRun, idleSettings, latestIdleRun, loadOwnIdleRun, saveIdleRun, type LoadedIdleRun } from '../idle.js';
import { lockUser } from '../runs.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';

/** How far ahead of now a run may be played (the browser asks for the next segment as the last one ends; a little early is fine). */
const AHEAD_MS = 15_000;

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
      dex: dex.map((d) => ({ species: d.species, seen: d.seen, caught: d.caught, bestIv: d.bestIv, bestEv: d.bestEv })),
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
      const seed = newSeed();
      const state = createIdleRun({ species: input.species, ...(record && { ivs: record.bestIv as Stats, evs: record.bestEv as Stats }) }, seed);
      return tx.idleRun.create({ data: { ownerId: ctx.user.id, state: asJson(state), version: state.version, seed } });
    });
    return clientIdleRun({ ...created, state: created.state as never });
  }),

  /**
   * The next segment (agreed with the user: the server resolves everything, the browser plays it back): steps until a
   * trainer or a wild Pokémon, then the whole battle, as an event log. The run is played up to the segment's end at the
   * playback speed; asked for too far ahead of that, it's refused.
   */
  next: protectedProcedure.input(idleRunInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const now = Date.now();
    if (run.simulatedAt.getTime() > now + AHEAD_MS) throw new TRPCError({ code: 'CONFLICT', message: 'Still playing the last part' });
    const settings = await idleSettings(ctx.user.id);
    const caught = new Set(await caughtSpecies(ctx.user.id));
    const next = simulateSegment(run.state, settings, caught);
    if (!next) throw failed(run.state.phase === 'town' ? 'Waiting in town' : 'This run is over');
    const playedTo = new Date(Math.max(now, run.simulatedAt.getTime()) + next.segment.durationMs / settings.speed);
    const saved = await saveIdleRun(run, next.state, { dex: next.segment.dex, simulatedAt: playedTo });
    return { run: clientIdleRun(saved), segment: next.segment };
  }),

  /**
   * Offline catch-up (agreed): plays the time since the run was last played (at most 8 hours), up to a town or the
   * title, a share of segments a call (`more`: call again). Returns what happened, not the events.
   */
  catchUp: protectedProcedure.input(idleRunInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const now = Date.now();
    const elapsed = now - run.simulatedAt.getTime();
    if (run.state.phase !== 'walking' || elapsed <= 0) return { run: clientIdleRun(run), summary: null, more: false };
    const settings = await idleSettings(ctx.user.id);
    const caught = new Set(await caughtSpecies(ctx.user.id));
    const { state, summary, dex } = catchUp(run.state, settings, caught, elapsed);
    if (!summary.segments) return { run: clientIdleRun(run), summary: null, more: false };
    const more = summary.stopped === 'limit';
    // Played up to where it stopped: the time used, or now when it reached a town (time waiting there isn't played).
    const playedTo = new Date(more ? run.simulatedAt.getTime() + summary.durationMs : now);
    const saved = await saveIdleRun(run, state, { dex, simulatedAt: playedTo });
    return { run: clientIdleRun(saved), summary, more };
  }),

  /** The player's choices: in a town (gym, store, buying, on), the party's order and moves, stones, giving up. */
  act: protectedProcedure.input(idleActInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const result = applyIdleAction(run.state, input.action);
    if (!result.ok) throw failed(result.error);
    let state = result.state;
    let events: ReturnType<typeof visitStore>['events'] = [];
    if (input.action.type === 'VISIT_STORE') {
      const visited = visitStore(state, await idleSettings(ctx.user.id));
      state = visited.state;
      events = visited.events;
    }
    // Leaving a town starts the clock again from now (time spent waiting there isn't played).
    const leaving = input.action.type === 'GYM' || input.action.type === 'CONTINUE';
    const saved = await saveIdleRun(run, state, { dex: state.party.map((m) => ({ species: m.species, ivs: m.ivs, evs: m.evs })), ...(leaving && { simulatedAt: new Date() }) });
    return { run: clientIdleRun(saved), events };
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
    const next = simulateSegment(run.state, { ...DEFAULT_IDLE_SETTINGS, ...(await idleSettings(ctx.user.id)) }, new Set(await caughtSpecies(ctx.user.id)));
    if (!next) throw failed('Not walking');
    const saved = await saveIdleRun(run, next.state, { dex: next.segment.dex, simulatedAt: new Date() });
    return { run: clientIdleRun(saved), segment: next.segment };
  }),

  /** Debug (refused in production): warps the run to an area's start (a town waits there), its party and bag kept. */
  debugWarp: debugProcedure.input(idleWarpInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    const index = areaIndex(input.area);
    if (index < 0) throw failed('Unknown area');
    const state = structuredClone(run.state);
    Object.assign(state, { area: index, leg: 0, step: 0, beaten: [], phase: isTown(AREAS[index]!) ? 'town' : 'walking', version: state.version + 1 });
    state.log.push(`Debug: warped to ${AREAS[index]!.name}.`);
    return clientIdleRun(await saveIdleRun(run, state, { simulatedAt: new Date() }));
  }),
});
