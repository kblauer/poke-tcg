import { prisma } from '@poke-tcg/db';
import { buyUpgrade, starterSlots, START_MONEY, areas, applyIdleAction, areaIndex, generation, generationOf, IDLE_GENERATIONS, inGeneration, regionReady, isBaseForm, isOptional, catchUp, createIdleRun, cutSegment, cuts, DEFAULT_IDLE_SETTINGS, isTown, partyNotes, playing, reachedArea, simulateSegment, TOWN_WAIT_MS, starterOptions, starters, visitStore, withPending, type IdleGen, type IdleSettings, type IdleUpgrades, type Stats, type UpgradeId } from '@poke-tcg/idle';
import { idleBuyUpgradeInput, idleActInput, idleDebugCatchInput, idleDebugNextInput, idleHereInput, idleRunInput, idleSettingsInput, idleThrowInput, idleWarpInput, startIdleInput, type StartIdleInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { asJson, newSeed } from '../games.js';
import { idleUpgrades, withUpgrades, catchUpWindow, caughtSpecies, generationLocked, caughtWithDue, clientIdleRun, dueNotes, idleSettings, latestIdleRun, loadOwnIdleRun, nextWait, restartAt, saveIdleRun, splitNotes, throwError, throwPlayedTo, throwTimeError, withoutDueNotes, type LoadedIdleRun } from '../idle.js';
import { lockUser } from '../runs.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';

/** Debug's money button (idle.debugMoney): ₱ added to the run under way. */
const DEBUG_MONEY = 1_000_000;

/** A run's state checked against the version the browser had (CONFLICT when stale). */
function checkVersion(run: LoadedIdleRun, expected: number) {
  if (run.version !== expected) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
}

const failed = (error: string) => new TRPCError({ code: 'BAD_REQUEST', message: error });

type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma;

/** The generations whose Champion the account has beaten in a run (the regions' locks, the user's; a run with no generation is Kanto's). */
async function championsBeaten(userId: string, db: Db = prisma): Promise<Set<number>> {
  const rows = await db.$queryRaw<{ gen: string }[]>`SELECT DISTINCT COALESCE(state->>'gen', '1') AS gen FROM "IdleRun" WHERE "ownerId" = ${userId}::uuid AND status = 'BEATEN'`;
  return new Set(rows.map((r) => Number(r.gen)));
}


/**
 * Starts a run (one under way at a time): its generation open (`debug`: any, debug mode's), its starter one of that
 * generation's three or (from the second run) a caught base form, at level 5, a dex species with its record's best IVs and EVs;
 * with the Starter slots upgrade up to 2 more (`more`, each as the first, all different), and Send some to Mom's money
 * added to its start (then spent: issue #270).
 */
async function startIdle(userId: string, input: StartIdleInput, debug: boolean) {
  const created = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    if (await tx.idleRun.findFirst({ where: { ownerId: userId, status: 'ACTIVE' }, select: { id: true } })) throw failed('A run is already under way');
    if (!regionReady(input.gen)) throw failed(`No ${inGeneration(input.gen, () => generation().region)} run can start yet`);
    const locked = !debug && generationLocked(input.gen, await championsBeaten(userId, tx));
    if (locked) throw failed(locked);
    const runs = await tx.idleRun.count({ where: { ownerId: userId } });
    const caught = await caughtSpecies(userId, tx);
    const account = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { idleMom: true } });
    // (The upgrades in effect: a Starter slots tier switched off gives no slot.)
    const upgrades = await idleUpgrades(userId, tx);
    const picks = [{ species: input.species, shiny: input.shiny }, ...input.more];
    if (picks.length > starterSlots(upgrades)) throw failed(`Only ${starterSlots(upgrades)} starter${starterSlots(upgrades) === 1 ? '' : 's'}`);
    if (new Set(picks.map((p) => p.species)).size !== picks.length) throw failed('Pick different Pokémon');
    const choices = [];
    for (const pick of picks) {
      // (Only the region's own species: one caught in another region's run isn't its starter, and createIdleRun doesn't know it.)
      if (!inGeneration(input.gen, () => (runs ? starterOptions(caught.filter((id) => id <= generation().species.length)) : starters()).includes(pick.species))) throw failed("That Pokémon can't be picked");
      // A caught species starts with its record's best IVs and EVs (a starter never caught: random IVs, no EVs).
      const record = caught.includes(pick.species) ? await tx.idleDex.findUnique({ where: { userId_species: { userId, species: pick.species } } }) : null;
      if (pick.shiny && !(runs && record?.shiny)) throw failed('No shiny of that Pokémon has been caught');
      choices.push({ species: pick.species, shiny: pick.shiny, ...(record && { ivs: record.bestIv as Stats, evs: record.bestEv as Stats }) });
    }
    const seed = newSeed();
    const state = createIdleRun(choices, seed, input.gen, { money: START_MONEY + account.idleMom });
    if (account.idleMom) await tx.user.update({ where: { id: userId }, data: { idleMom: 0 } });
    return tx.idleRun.create({ data: { ownerId: userId, state: asJson(state), version: state.version, seed } });
  });
  return clientIdleRun(withUpgrades({ ...created, state: created.state as never }, await idleUpgrades(userId)));
}

/**
 * A tier just bought switches its upgrade fully on (the user's: a tier switched off is on again with the new one):
 * its level dropped from the settings (IdleSettings.upgradeLevels).
 */
async function switchOn(tx: Db, userId: string, id: UpgradeId) {
  const { idleSettings: saved } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { idleSettings: true } });
  const settings = (saved ?? {}) as Partial<IdleSettings>;
  if (settings.upgradeLevels?.[id] === undefined) return;
  const { [id]: _, ...levels } = settings.upgradeLevels;
  await tx.user.update({ where: { id: userId }, data: { idleSettings: asJson({ ...settings, upgradeLevels: levels }) } });
}

/** The account's upgrade tree (issue #270): its currency, the tiers bought and Mom's money for the next run. */
async function upgradeView(userId: string, db: Db = prisma) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { idleMiles: true, idleUpgrades: true, idleMom: true } });
  return { miles: u.idleMiles, owned: (u.idleUpgrades ?? {}) as IdleUpgrades, mom: u.idleMom };
}

/**
 * The Idle Adventure (README: Idle Adventure): the account's run, starting one, its segments as it walks, the town
 * choices, offline catch-up, the settings and the Pokédex.
 */
export const idleRouter = router({
  /**
   * The account's latest run (under way or over), its settings, each generation's starters (`generations`: why it's
   * locked, if it is; its three, or from the second run on any caught species in its tables too) and its Pokédex.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const [run, settings, dex, runs, beaten, upgrades] = await Promise.all([
      latestIdleRun(ctx.user.id),
      idleSettings(ctx.user.id),
      prisma.idleDex.findMany({ where: { userId: ctx.user.id }, orderBy: { species: 'asc' } }),
      prisma.idleRun.count({ where: { ownerId: ctx.user.id } }),
      championsBeaten(ctx.user.id),
      upgradeView(ctx.user.id),
    ]);
    const caught = dex.filter((d) => d.caught).map((d) => d.species);
    const generations = IDLE_GENERATIONS.filter(regionReady).map((gen) =>
      inGeneration(gen, () => {
        const known = (id: number) => id <= generation().species.length;
        return {
          gen,
          region: generation().region,
          locked: generationLocked(gen, beaten),
          // The three starters on the first run; from the second on, any species the Pokédex has caught too (agreed).
          starters: runs ? starterOptions(caught.filter(known)) : [...starters()],
          // A species with a shiny caught can start shiny (agreed).
          shinyStarters: runs ? dex.filter((d) => d.shiny && known(d.species) && isBaseForm(d.species)).map((d) => d.species) : [],
        };
      }),
    );
    return {
      run: run && clientIdleRun(run),
      settings,
      upgrades,
      generations,
      dex: dex.map((d) => ({ species: d.species, seen: d.seen, caught: d.caught, shiny: d.shiny, bestIv: d.bestIv, bestEv: d.bestEv, champion: d.champion })),
    };
  }),

  /** Starts a run in an open generation with a starter. One run under way at a time. */
  start: protectedProcedure.input(startIdleInput).mutation(({ ctx, input }) => startIdle(ctx.user.id, input, false)),

  /** Debug (refused in production): starts a run in any generation, locked or not (the user's, 2026-11-04). */
  debugStart: debugProcedure.input(startIdleInput).mutation(({ ctx, input }) => startIdle(ctx.user.id, input, true)),

  /**
   * The next segment (agreed with the user: the server resolves everything, the browser plays it back): steps until a
   * trainer or a wild Pokémon, then the whole battle, as an event log. The run is played up to the segment's end at the
   * pace (one pace: no speed setting, agreed); asked for too far ahead of that, it's refused.
   */
  next: protectedProcedure.input(idleRunInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const now = Date.now();
    // (Too far ahead, CONFLICT; a town waits TOWN_WAIT_MS for the player's choice, the browser takes it then, then goes on by itself.)
    const wait = nextWait(run.state, run.simulatedAt.getTime(), now);
    if (wait) throw wait === 'Waiting in town' ? failed(wait) : new TRPCError({ code: 'CONFLICT', message: wait });
    const settings = await idleSettings(ctx.user.id);
    const caughtList = caughtWithDue(await caughtSpecies(ctx.user.id), run.state);
    // Watched (`ask`): a catch with the party full waits for the player's choice (IdleState.choosing).
    const next = simulateSegment(run.state, settings, new Set(caughtList), { ask: true });
    if (!next) throw failed(withPending(run.state).stopped ? 'Stopped' : run.state.inStore ? 'In the store' : run.state.choosing ? 'Waiting for your choice' : 'This run is over');
    const from = Math.max(now, run.simulatedAt.getTime());
    const playedTo = new Date(from + next.segment.durationMs);
    // Its start kept, to play it again: from the moment a page opened meanwhile (resume), and its wild battle with a ball
    // the player asks for (throwBall); its catches for the Pokédex once it's past, the last segment's now (splitNotes).
    const { replay: _, ...prev } = run.state;
    const notes = splitNotes(next.segment.dex);
    next.state.replay = { prev, settings, caught: caughtList, from, throws: [], throwable: next.segment.events.some((e) => e.t === 'battle' && e.kind === 'wild'), dex: notes.later };
    const saved = await saveIdleRun(run, next.state, { dex: [...dueNotes(run.state), ...notes.now], simulatedAt: playedTo });
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
    // The cap is on the whole absence, not each call: time before the last 12 hours isn't played (catchUpWindow).
    const { from, elapsed } = catchUpWindow(run.simulatedAt.getTime(), Date.now());
    if ((!playing(run.state) && run.state.phase !== 'town' && !run.state.choosing) || elapsed <= 0) return { run: clientIdleRun(run), summary: null, more: false };
    const settings = await idleSettings(ctx.user.id);
    const caught = new Set(caughtWithDue(await caughtSpecies(ctx.user.id), run.state));
    const { state, summary, dex } = catchUp(run.state, settings, caught, elapsed);
    if (!summary.segments) return { run: clientIdleRun(run), summary: null, more: false };
    const more = summary.stopped === 'limit';
    // Played up to the time used (the rest, less than a segment, is played next).
    const playedTo = new Date(from + summary.durationMs);
    // (The last segment watched is past: its catches too. Nothing played offline is shown, so all of its notes at once.)
    const saved = await saveIdleRun(run, state, { dex: [...dueNotes(run.state), ...dex], simulatedAt: playedTo });
    return { run: clientIdleRun(saved), summary, more };
  }),

  /** The player's choices: in a town (gym, grinding, store, buying, on), the party's order and moves, stones, giving up. */
  act: protectedProcedure.input(idleActInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    // Stop, Continue run and the Town Map act at once (the user's): the segment playing cut where the player is now (a
    // battle begun dropped, no rewards), then the choice.
    const now = Date.now();
    // As the run stands now; kept whole (`past`: no segment playing, or its catch shown), its catches go to the Pokédex
    // now, and a cut that drops them drops their notes with them (cutSegment's run has no replay).
    const atNow = cutSegment(run.state, now);
    const past = atNow === run.state;
    const result = applyIdleAction(cuts(input.action) ? atNow : run.state, input.action);
    if (!result.ok) throw failed(result.error);
    let state = past ? withoutDueNotes(result.state) : result.state;
    let events: ReturnType<typeof visitStore>['events'] = [];
    if (input.action.type === 'VISIT_STORE') {
      const visited = visitStore(state, await idleSettings(ctx.user.id));
      state = visited.state;
      events = visited.events;
    }
    // Leaving a town, the store, a catch's choice, going on after Stop, a cut: the clock restarted (restartAt).
    const restart = restartAt(run.state, state, input.action, now, run.simulatedAt.getTime());
    // A party Pokémon replaced by a catch: its best stats to the dex too, as it leaves. (While a segment plays, only the
    // party it began with: one it caught waits with its notes.)
    const gone = run.state.party.filter((m) => !state.party.some((p) => p.uid === m.uid));
    const began = past ? null : new Set(run.state.replay!.prev.party.map((m) => m.uid));
    const party = [...state.party, ...gone].filter((m) => !began || began.has(m.uid));
    const saved = await saveIdleRun(run, state, { dex: [...(past ? dueNotes(run.state) : []), ...partyNotes(party)], ...(restart && { simulatedAt: restart }) });
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
    const refused = throwError(run.state, input.tick, !!input.master);
    if (refused) throw failed(refused);
    const replay = run.state.replay!;
    const throws = [...replay.throws, input.master ? { tick: input.tick, ball: 'master-ball' as const } : input.tick];
    const again = simulateSegment(replay.prev, replay.settings, new Set(replay.caught), { throwAt: throws, ask: true });
    const b = again?.segment.events.find((e) => e.t === 'battle');
    if (!again || b?.t !== 'battle' || b.kind !== 'wild') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The battle could not be played again' });
    // Over by then, or that tick played already by the clock (#204: a lost battle played again with a ball on turn 1).
    const now = Date.now();
    const late = throwTimeError(replay.from, b, input.tick, now);
    if (late) throw failed(late);
    again.state.version = run.version + 1;
    const notes = splitNotes(again.segment.dex);
    again.state.replay = { ...replay, throws, dex: notes.later };
    // The party changes queued during this battle (applyIdleAction) still wait for its end.
    if (run.state.pending?.length) again.state.pending = run.state.pending;
    const saved = await saveIdleRun(run, again.state, { dex: notes.now, simulatedAt: throwPlayedTo(replay.from, again.segment.durationMs, now) });
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

  /**
   * Buys an upgrade's next tier with the account's currency (issue #270), the user row locked: the tree after it. It
   * applies to the run under way from its next segment (the run reads the account's upgrades as it's loaded).
   */
  buyUpgrade: protectedProcedure.input(idleBuyUpgradeInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = await upgradeView(ctx.user.id, tx);
      const bought = buyUpgrade(now.owned, input.id, now.miles);
      if ('error' in bought) throw failed(bought.error);
      await tx.user.update({ where: { id: ctx.user.id }, data: { idleMiles: { decrement: bought.price }, idleUpgrades: asJson(bought.upgrades) } });
      await switchOn(tx, ctx.user.id, input.id);
      return { ...now, miles: now.miles - bought.price, owned: bought.upgrades };
    }),
  ),

  /**
   * Debug (refused in production; the user's, 2026-11-23): an upgrade's next tier for free, none bought until asked
   * (debug mode doesn't unlock them by default), the currency untouched.
   */
  debugBuyUpgrade: debugProcedure.input(idleBuyUpgradeInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = await upgradeView(ctx.user.id, tx);
      const bought = buyUpgrade(now.owned, input.id, Number.MAX_SAFE_INTEGER);
      if ('error' in bought) throw failed(bought.error);
      await tx.user.update({ where: { id: ctx.user.id }, data: { idleUpgrades: asJson(bought.upgrades) } });
      await switchOn(tx, ctx.user.id, input.id);
      return { ...now, owned: bought.upgrades };
    }),
  ),

  /** Debug (refused in production; the user's): every upgrade bought is taken back (the currency and Mom's money kept). */
  debugResetUpgrades: debugProcedure.mutation(({ ctx }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      await tx.user.update({ where: { id: ctx.user.id }, data: { idleUpgrades: {} } });
      return upgradeView(ctx.user.id, tx);
    }),
  ),

  /** Changes some of the mode's settings (User.idleSettings); they apply from the next battle. */
  settings: protectedProcedure.input(idleSettingsInput).mutation(async ({ ctx, input }) => {
    const settings: IdleSettings = { ...(await idleSettings(ctx.user.id)), ...input };
    await prisma.user.update({ where: { id: ctx.user.id }, data: { idleSettings: asJson(settings) } });
    return settings;
  }),

  /**
   * Debug (refused in production): the next segment at once, with no wait for the last one's playback (debug mode's ×3
   * speed, the user's, 2026-11-04: `speed`), played up to its length over `speed` from now, its start kept as `next` keeps
   * it (the ball button, resuming).
   */
  debugNext: debugProcedure.input(idleDebugNextInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    checkVersion(run, input.expectedVersion);
    const settings = await idleSettings(ctx.user.id);
    const caughtList = caughtWithDue(await caughtSpecies(ctx.user.id), run.state);
    const next = simulateSegment(run.state, settings, new Set(caughtList), { ask: true });
    if (!next) throw failed(withPending(run.state).stopped ? 'Stopped' : run.state.inStore ? 'In the store' : run.state.choosing ? 'Waiting for your choice' : 'This run is over');
    const from = Date.now();
    const { replay: _, ...prev } = run.state;
    const notes = splitNotes(next.segment.dex);
    next.state.replay = { prev, settings, caught: caughtList, from, throws: [], throwable: next.segment.events.some((e) => e.t === 'battle' && e.kind === 'wild'), dex: notes.later };
    const saved = await saveIdleRun(run, next.state, { dex: [...dueNotes(run.state), ...notes.now], simulatedAt: new Date(from + next.segment.durationMs / input.speed) });
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
    // One statement with its checks in it, rather than loading the run (its whole state, some 11 KB) every few seconds
    // for a timestamp (README: Performance): the player's own active run, in a town or waiting for a choice, whose time is
    // behind now by less than the town's wait (a gap of the wait or more is time away, the catch-up's to play; a time
    // ahead of now is a segment still playing, set by the action that saved it). Nothing else changes: no version, no state.
    const count = await prisma.$executeRaw`
      UPDATE "IdleRun" SET "simulatedAt" = now(), "updatedAt" = now()
      WHERE id = ${input.runId}::uuid AND "ownerId" = ${ctx.user.id}::uuid AND status = 'ACTIVE'
        AND (state->>'phase' = 'town' OR jsonb_typeof(state->'choosing') NOT IN ('null'))
        AND "simulatedAt" < now() AND "simulatedAt" > now() - make_interval(secs => ${TOWN_WAIT_MS / 1000})`;
    return { ok: count > 0 };
  }),

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

  /** Debug (refused in production): warps the run to an area's start (a town waits there), its party and bag kept. */
  debugWarp: debugProcedure.input(idleWarpInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnIdleRun(input.runId, ctx.user.id);
    // Only a run under way (a finished one is banked: warping it back would make two runs under way).
    if (run.status !== 'ACTIVE') throw failed('This run is over');
    // The run's own region's areas.
    const state = inGeneration(generationOf(run.state), () => {
      const index = areaIndex(input.area);
      if (index < 0) throw failed('Unknown area');
      const state = structuredClone(run.state);
      // The Town Map's places up to it open with it.
      Object.assign(state, { reached: Math.max(reachedArea(state), isOptional(index) ? 0 : index), area: index, leg: 0, step: 0, beaten: [], phase: isTown(areas()[index]!) ? 'town' : 'walking', version: state.version + 1 });
      delete state.grind;
      delete state.replay;
      state.log.push(`Debug: warped to ${areas()[index]!.name}.`);
      return state;
    });
    return clientIdleRun(await saveIdleRun(run, state, { simulatedAt: new Date() }));
  }),
});
