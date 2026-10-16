import { TRPCError } from '@trpc/server';
import { prisma, saveGameState, type Prisma } from '@poke-tcg/db';
import { applyAction, createGame, getPlayerView, runCpu, type GameAction, type GameState } from '@poke-tcg/game-engine';
import { CPU_ID, HUMAN_ID, gameIdInput, submitActionInput } from '@poke-tcg/shared';
import { ensureUser } from '../auth.js';
import { loadCardLibrary } from '../cards.js';
import { CPU_TEST_DECK, PLAYER_TEST_DECK, expandDeck } from '../test-decks.js';
import { protectedProcedure, router } from '../trpc.js';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/** Log rows for a sequence of actions that ended at `finalVersion`. */
function actionRows(entries: { playerId: string; action: GameAction }[], finalVersion: number) {
  const first = finalVersion - entries.length + 1;
  return entries.map((e, i) => ({ playerId: e.playerId, version: first + i, action: asJson(e.action) }));
}

export async function loadOwnGame(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  // Same error for "missing" and "not yours" so ids can't be probed.
  if (!game || game.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game not found' });
  return { ...game, state: game.state as unknown as GameState };
}

export const gameRouter = router({
  /** Starts a test game: the player's test deck against a CPU with no AI, using cards from the catalog. */
  createTest: protectedProcedure.mutation(async ({ ctx }) => {
    const playerDeck = expandDeck(PLAYER_TEST_DECK);
    const cpuDeck = expandDeck(CPU_TEST_DECK);
    const [library] = await Promise.all([loadCardLibrary([...playerDeck, ...cpuDeck]), ensureUser(ctx.user)]);
    const seed = Math.floor(Math.random() * 2 ** 31);
    const initial = createGame({ id: HUMAN_ID, deck: playerDeck }, { id: CPU_ID, deck: cpuDeck }, seed, library);
    // The CPU picks its active right away, so the game is waiting on the player.
    const { state, actions } = runCpu(initial, CPU_ID);

    return prisma.game.create({
      data: {
        ownerId: ctx.user.id,
        seed,
        state: asJson(state),
        version: state.version,
        actions: { create: actionRows(actions.map((action) => ({ playerId: CPU_ID, action })), state.version) },
      },
      select: { id: true },
    });
  }),

  /** The player's filtered view of the game – never the raw state. */
  view: protectedProcedure.input(gameIdInput).query(async ({ ctx, input }) => {
    const game = await loadOwnGame(input.gameId, ctx.user.id);
    return { id: game.id, status: game.status, view: getPlayerView(game.state, HUMAN_ID) };
  }),

  /**
   * Validates the player's action with the engine, then lets the CPU respond,
   * and persists everything in one write. The server is the only authority.
   */
  act: protectedProcedure.input(submitActionInput).mutation(async ({ ctx, input }) => {
    const game = await loadOwnGame(input.gameId, ctx.user.id);
    if (game.status !== 'ACTIVE') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game is over' });
    if (game.version !== input.expectedVersion) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });
    }

    const result = applyAction(game.state, HUMAN_ID, input.action);
    if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
    const cpu = runCpu(result.state, CPU_ID);
    const next = cpu.state;
    const log = [
      { playerId: HUMAN_ID, action: input.action },
      ...cpu.actions.map((action) => ({ playerId: CPU_ID, action })),
    ];

    // One round trip. Optimistic concurrency: only writes if the game wasn't advanced meanwhile (e.g. another tab).
    const saved = await saveGameState({
      gameId: game.id,
      expectedVersion: game.version,
      state: next,
      version: next.version,
      status: next.phase === 'finished' ? 'FINISHED' : 'ACTIVE',
      winner: next.winner,
      actions: actionRows(log, next.version),
    });
    if (!saved) throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });

    return getPlayerView(next, HUMAN_ID);
  }),
});
