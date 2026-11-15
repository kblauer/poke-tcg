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
  whosThatStep,
  whosThatTimes,
  WHOS_THAT_GRACE_MS,
  WHOS_THAT_ROUNDS,
  WHOS_THAT_RUN_MS,
  type WhosThatMove,
} from '@poke-tcg/campaign';
import { prisma, type WhosThatGame } from '@poke-tcg/db';
import { whosThatBoardInput, whosThatGameInput, whosThatGuessInput, whosThatPassInput, whosThatRunGuessInput, whosThatRunInput, whosThatStartInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { newSeed } from '../games.js';
import { advanceRun, loadOwnRun, lockUser, type LoadedRun } from '../runs.js';
import { protectedProcedure, publicProcedure, router } from '../trpc.js';
import { cardName, cardShape, whosThatCards, whosThatRound } from '../whos-that.js';
import { clientRun } from './run.js';

/** How many players a leaderboard shows. */
const BOARD_SIZE = 50;

/** The run's Who's That Pokémon? event under way, or BAD_REQUEST. */
function runEvent(run: LoadedRun) {
  const e = run.state.encounter;
  if (e?.kind !== 'event' || e.event.id !== 'whosThat') throw new TRPCError({ code: 'BAD_REQUEST', message: "There's no Who's That Pokémon? here" });
  return e.event;
}

/** An Extras game's finished results. */
const results = (game: Pick<WhosThatGame, 'fastestMs' | 'averageMs' | 'day'>) => ({ fastestMs: game.fastestMs, averageMs: game.averageMs ?? 0, daily: game.day !== null });

/** A leaderboard's players' names: their account names (never their Google name or email), or Anonymous. */
async function names(userIds: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, accountName: true } });
  return new Map(users.map((u) => [u.id, u.accountName?.trim() || 'Anonymous']));
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** The player's own game: NOT_FOUND otherwise. */
async function ownGame(tx: Tx, gameId: string, userId: string) {
  const game = await tx.whosThatGame.findFirst({ where: { id: gameId, userId } });
  if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such game' });
  return game;
}

/**
 * A move of the player's game (whosThatStep): the Pokémon on screen named or passed moves the game on (its name and card
 * given, then the next round, `next`, or the game's `results`); a wrong name, or a move before the Pokémon is up, is
 * just `correct: false`; one for another round than the game is on changes nothing and says where the game is (`stale`,
 * with its `round`, null once it's over).
 */
async function move(tx: Tx, gameId: string, userId: string, moved: WhosThatMove) {
  const now = Date.now();
  const game = await ownGame(tx, gameId, userId);
  const cardId = game.cards[game.index];
  const step = whosThatStep({ rounds: game.cards.length, index: game.index, shownAt: game.shownAt.getTime(), times: game.times, passed: game.passed }, cardId ? await cardName(cardId) : '', moved, now);
  if (step.outcome === 'stale') return { correct: false as const, stale: true, round: game.finishedAt ? null : await whosThatRound(game, now) };
  if (step.outcome === 'early' || step.outcome === 'wrong' || !cardId) return { correct: false as const, stale: false, round: null };
  const { index, shownAt, times, passed } = step.game;
  const finished = index >= game.cards.length;
  const saved = await tx.whosThatGame.update({
    where: { id: game.id },
    data: { times, passed, index, shownAt: new Date(shownAt), ...(finished && { finishedAt: new Date(now), ...whosThatTimes(times, passed) }) },
  });
  return {
    correct: true as const,
    passed: step.outcome === 'passed',
    answer: whosThatAnswer(await cardName(cardId)),
    cardId,
    timeMs: step.timeMs,
    next: saved.finishedAt ? null : await whosThatRound(saved, now),
    results: saved.finishedAt ? results(saved) : null,
  };
}

/**
 * Who's That Pokémon? (README: Who's That Pokémon?): a run's Mystery event (`runStart`, `runGuess`: 10 seconds to name the
 * Pokémon, for EXP) and the Extras mode (`start`, `guess`, `pass`, `round`, `status`: 10 in a row, timed; `leaderboard`, public).
 * The server picks the cards and keeps the time; the browser is sent only each Pokémon's shape (cardShape), once its clock
 * has started (whosThatRound), and its name once it's named, passed or missed.
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
        return whosThatRound(game, now);
      }
      await tx.whosThatGame.deleteMany({ where: { userId: ctx.user.id, day: null, finishedAt: null } });
      const game = await tx.whosThatGame.create({ data: { userId: ctx.user.id, cards: whosThatGame(rngFrom(newSeed()), cards), shownAt: new Date(now) } });
      return whosThatRound(game, now);
    }),
  ),

  /**
   * A name typed in an Extras game for the Pokémon the player sees (`index`): the Pokémon on screen's (`correct`) records
   * the time since it was shown and shows the next (`next`), or finishes the game (`results`). "skip", or any name once
   * WHOS_THAT_PASS_MS have gone by, passes it (`passed`: revealed, counting WHOS_THAT_PASS_MS). Any other is just
   * `correct: false`, as is one sent before the Pokémon is up (while the one before is revealed) or for a round the game
   * has left (`stale`): move.
   */
  guess: protectedProcedure.input(whosThatGuessInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      return move(tx, input.gameId, ctx.user.id, { index: input.index, guess: input.guess });
    }),
  ),

  /**
   * Passes the Pokémon the player sees (`index`): the Skip button, or its WHOS_THAT_PASS_MS run out (the browser asks
   * then; any guess after it is a pass too). Nothing changes if the game is on another round by then (a guess got there
   * first) or the Pokémon isn't up yet: move.
   */
  pass: protectedProcedure.input(whosThatPassInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      return move(tx, input.gameId, ctx.user.id, { index: input.index, pass: true });
    }),
  ),

  /**
   * The round a game under way is on (whosThatRound): asked for once a passed Pokémon has been revealed, the next one's
   * shape being held back until its clock starts. BAD_REQUEST once the game is over.
   */
  round: protectedProcedure.input(whosThatGameInput).query(async ({ ctx, input }) => {
    const game = await prisma.whosThatGame.findFirst({ where: { id: input.gameId, userId: ctx.user.id } });
    if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such game' });
    if (game.finishedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This game is over' });
    return whosThatRound(game, Date.now());
  }),

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
