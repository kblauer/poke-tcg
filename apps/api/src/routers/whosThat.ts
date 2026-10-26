import {
  dailyPlaylist,
  isSkip,
  namesPokemon,
  randomWhosThatCard,
  rngFrom,
  rotationCard,
  whosThatAnswer,
  whosThatDay,
  whosThatGame,
  whosThatTimes,
  WHOS_THAT_GRACE_MS,
  WHOS_THAT_PASS_MS,
  WHOS_THAT_REVEAL_MS,
  WHOS_THAT_ROUNDS,
  WHOS_THAT_RUN_MS,
} from '@poke-tcg/campaign';
import { prisma, type WhosThatGame } from '@poke-tcg/db';
import { whosThatBoardInput, whosThatGameInput, whosThatGuessInput, whosThatRunGuessInput, whosThatRunInput, whosThatStartInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { newSeed } from '../games.js';
import { advanceRun, loadOwnRun, lockUser, type LoadedRun } from '../runs.js';
import { protectedProcedure, publicProcedure, router } from '../trpc.js';
import { cardName, cardShape, whosThatCards } from '../whos-that.js';
import { clientRun } from './run.js';

/** How many players a leaderboard shows. */
const BOARD_SIZE = 50;

/** The run's Who's That Pokémon? event under way, or BAD_REQUEST. */
function runEvent(run: LoadedRun) {
  const e = run.state.encounter;
  if (e?.kind !== 'event' || e.event.id !== 'whosThat') throw new TRPCError({ code: 'BAD_REQUEST', message: "There's no Who's That Pokémon? here" });
  return e.event;
}

/** What the browser gets of an Extras game's round: the Pokémon's shape, never its card. `elapsedMs`: how long it's been shown (a game taken up again). */
async function round(game: WhosThatGame, now: number) {
  return { gameId: game.id, daily: game.day !== null, index: game.index, total: game.cards.length, shape: await cardShape(game.cards[game.index]!), elapsedMs: now - game.shownAt.getTime() };
}

/** An Extras game's finished results. */
const results = (game: Pick<WhosThatGame, 'fastestMs' | 'averageMs' | 'day'>) => ({ fastestMs: game.fastestMs, averageMs: game.averageMs ?? 0, daily: game.day !== null });

/** A leaderboard's players' names: their account names (never their Google name or email), or Anonymous. */
async function names(userIds: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, accountName: true } });
  return new Map(users.map((u) => [u.id, u.accountName?.trim() || 'Anonymous']));
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * The game moves on from the Pokémon on screen, named or passed (`passed`) after `timeMs`: the next one is shown from now
 * (after a pass, once the passed one has been revealed: WHOS_THAT_REVEAL_MS), or the game is finished with its times.
 * Returns the saved game.
 */
function moveOn(tx: Tx, game: WhosThatGame, timeMs: number, passed: boolean, now: number) {
  const times = [...game.times, timeMs];
  const passes = [...game.passed, passed];
  const finished = times.length >= game.cards.length;
  const shownAt = new Date(passed ? now + WHOS_THAT_REVEAL_MS : now);
  return tx.whosThatGame.update({
    where: { id: game.id },
    data: { times, passed: passes, index: game.index + 1, shownAt, ...(finished && { finishedAt: new Date(now), ...whosThatTimes(times, passes) }) },
  });
}

/** The game under way, the player's own: NOT_FOUND or BAD_REQUEST otherwise. */
async function gameUnderWay(tx: Tx, gameId: string, userId: string) {
  const game = await tx.whosThatGame.findFirst({ where: { id: gameId, userId } });
  if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such game' });
  if (game.finishedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This game is over' });
  return game;
}

/**
 * The Pokémon on screen passed: it counts WHOS_THAT_PASS_MS, its name and card are given for the reveal, and the next
 * one's clock starts once it's been shown (or the game's results).
 */
async function passRound(tx: Tx, game: WhosThatGame, now: number) {
  const cardId = game.cards[game.index]!;
  const saved = await moveOn(tx, game, WHOS_THAT_PASS_MS, true, now);
  return {
    correct: true as const,
    passed: true,
    answer: whosThatAnswer(await cardName(cardId)),
    cardId,
    timeMs: WHOS_THAT_PASS_MS,
    next: saved.finishedAt ? null : await round(saved, now),
    results: saved.finishedAt ? results(saved) : null,
  };
}

/**
 * Who's That Pokémon? (README: Who's That Pokémon?): a run's Mystery event (`runStart`, `runGuess`: 10 seconds to name the
 * Pokémon, for EXP) and the Extras mode (`start`, `guess`, `pass`, `status`: 10 in a row, timed; `leaderboard`, public).
 * The server picks the cards and keeps the time; the browser is sent only each Pokémon's shape (cardShape), and its name
 * once it's named, passed or missed.
 */
export const whosThatRouter = router({
  /**
   * Shows a run's Who's That Pokémon?: its card picked (a random holo's, or the rotating list's of the day) and the clock
   * started (WHOS_THAT_STARTED). Once started, it's the same picture and the same clock, however often it's asked for.
   */
  runStart: protectedProcedure.input(whosThatRunInput).mutation(async ({ ctx, input }) => {
    let run = await loadOwnRun(input.runId, ctx.user.id);
    let event = runEvent(run);
    if (event.startedAt === undefined) {
      if (run.version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
      const now = Date.now();
      const cardId = event.source === 'rotation' ? rotationCard(whosThatDay(now)) : randomWhosThatCard(rngFrom(newSeed()), await whosThatCards());
      run = await advanceRun(run, [{ type: 'WHOS_THAT_STARTED', cardId, at: now }]);
      event = runEvent(run);
    }
    return { run: await clientRun(run), shape: await cardShape(event.cardId!), remainingMs: event.startedAt! + WHOS_THAT_RUN_MS - Date.now() };
  }),

  /**
   * A name typed in a run's Who's That Pokémon?: the Pokémon's (in time, with WHOS_THAT_GRACE_MS for the round trip) wins
   * its EXP; any other is `wrong` while there's time left (an empty one is how the browser says its clock ran out), and
   * once time is up it's missed; "skip" gives up at once (missed). Won or missed, the event is settled (WHOS_THAT_OVER)
   * and the answer given.
   */
  runGuess: protectedProcedure.input(whosThatRunGuessInput).mutation(async ({ ctx, input }) => {
    const run = await loadOwnRun(input.runId, ctx.user.id);
    const event = runEvent(run);
    if (event.startedAt === undefined || !event.cardId) throw new TRPCError({ code: 'BAD_REQUEST', message: "It hasn't started" });
    const elapsed = Date.now() - event.startedAt;
    const name = await cardName(event.cardId);
    const won = elapsed <= WHOS_THAT_RUN_MS + WHOS_THAT_GRACE_MS && namesPokemon(input.guess, name);
    if (!won && elapsed < WHOS_THAT_RUN_MS && !isSkip(input.guess)) return { result: 'wrong' as const, remainingMs: WHOS_THAT_RUN_MS - elapsed };
    const answer = whosThatAnswer(name);
    const settled = await advanceRun(run, [{ type: 'WHOS_THAT_OVER', won, answer }]);
    return { result: won ? ('won' as const) : ('missed' as const), answer, cardId: event.cardId, exp: won ? event.exp : 0, run: await clientRun(settled) };
  }),

  /** The account's day (the daily playlist's, in UTC), today's daily game (played, under way or not yet) and its best times in the random games. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const day = whosThatDay(Date.now());
    const [daily, best] = await Promise.all([
      prisma.whosThatGame.findUnique({ where: { userId_day: { userId: ctx.user.id, day } } }),
      prisma.whosThatGame.aggregate({ where: { userId: ctx.user.id, day: null, finishedAt: { not: null } }, _min: { averageMs: true, fastestMs: true }, _count: true }),
    ]);
    return {
      day,
      daily: daily && { finished: daily.finishedAt !== null, index: daily.index, ...results(daily) },
      best: { averageMs: best._min.averageMs, fastestMs: best._min.fastestMs, games: best._count },
    };
  }),

  /**
   * Starts a game of 10: random Pokémon (any game of them under way is given up), or today's playlist (`daily`: one a
   * day; under way, it's taken up again where it was, its clock still running; BAD_REQUEST once it's been played).
   */
  start: protectedProcedure.input(whosThatStartInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = Date.now();
      const cards = await whosThatCards();
      if (input.daily) {
        const day = whosThatDay(now);
        const played = await tx.whosThatGame.findUnique({ where: { userId_day: { userId: ctx.user.id, day } } });
        if (played?.finishedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: "You've played today's playlist: come back tomorrow" });
        const game = played ?? (await tx.whosThatGame.create({ data: { userId: ctx.user.id, day, cards: dailyPlaylist(day, cards), shownAt: new Date(now) } }));
        return round(game, now);
      }
      await tx.whosThatGame.deleteMany({ where: { userId: ctx.user.id, day: null, finishedAt: null } });
      const game = await tx.whosThatGame.create({ data: { userId: ctx.user.id, cards: whosThatGame(rngFrom(newSeed()), cards), shownAt: new Date(now) } });
      return round(game, now);
    }),
  ),

  /**
   * A name typed in an Extras game: the Pokémon on screen's (`correct`) records the time since it was shown and shows the
   * next (`next`), or finishes the game (`results`). "skip", or any name once WHOS_THAT_PASS_MS have gone by, passes it
   * (`passed`: revealed, counting WHOS_THAT_PASS_MS: passRound). Any other is just `correct: false`, as is one sent
   * before the Pokémon is up (while the one before is revealed).
   */
  guess: protectedProcedure.input(whosThatGuessInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = Date.now();
      const game = await gameUnderWay(tx, input.gameId, ctx.user.id);
      const timeMs = now - game.shownAt.getTime();
      if (timeMs < 0) return { correct: false as const };
      if (isSkip(input.guess) || timeMs >= WHOS_THAT_PASS_MS) return passRound(tx, game, now);
      const cardId = game.cards[game.index]!;
      const name = await cardName(cardId);
      if (!namesPokemon(input.guess, name)) return { correct: false as const };
      const saved = await moveOn(tx, game, timeMs, false, now);
      return { correct: true as const, passed: false, answer: whosThatAnswer(name), cardId, timeMs, next: saved.finishedAt ? null : await round(saved, now), results: saved.finishedAt ? results(saved) : null };
    }),
  ),

  /**
   * Passes the Pokémon on screen (passRound): typed "skip", the Skip button, or its WHOS_THAT_PASS_MS run out (the browser
   * asks then; any guess after it is a pass too).
   */
  pass: protectedProcedure.input(whosThatGameInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const now = Date.now();
      return passRound(tx, await gameUnderWay(tx, input.gameId, ctx.user.id), now);
    }),
  ),

  /**
   * A leaderboard, open to anyone, signed in or not (the user's: public): each player's best average time over a game of
   * random Pokémon (`average`), their fastest Pokémon named in one (`fastest`), or today's playlist's games (`daily`, by
   * average, the earlier first on a tie). The top 50, each with the player's account name (or Anonymous); `me` marks the
   * signed-in player's rows.
   */
  leaderboard: publicProcedure.input(whosThatBoardInput).query(async ({ ctx, input }) => {
    const day = whosThatDay(Date.now());
    let rows: { userId: string; averageMs: number | null; fastestMs: number | null }[];
    if (input.board === 'daily') {
      rows = await prisma.whosThatGame.findMany({
        where: { day, finishedAt: { not: null } },
        orderBy: [{ averageMs: 'asc' }, { finishedAt: 'asc' }],
        take: BOARD_SIZE,
        select: { userId: true, averageMs: true, fastestMs: true },
      });
    } else {
      const field = input.board === 'average' ? 'averageMs' : 'fastestMs';
      const groups = await prisma.whosThatGame.groupBy({
        by: ['userId'],
        where: { day: null, finishedAt: { not: null }, [field]: { not: null } },
        _min: { averageMs: true, fastestMs: true },
        orderBy: { _min: { [field]: 'asc' } },
        take: BOARD_SIZE,
      });
      rows = groups.map((g) => ({ userId: g.userId, averageMs: g._min.averageMs, fastestMs: g._min.fastestMs }));
    }
    const named = await names(rows.map((r) => r.userId));
    return { day, rounds: WHOS_THAT_ROUNDS, rows: rows.map((r, i) => ({ rank: i + 1, name: named.get(r.userId) ?? 'Anonymous', averageMs: r.averageMs, fastestMs: r.fastestMs, me: r.userId === ctx.user?.id })) };
  }),
});
