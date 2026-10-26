import { TRPCError } from '@trpc/server';
import { prisma, saveGameState, type Prisma } from '@poke-tcg/db';
import { applyDebug, getPlayerView } from '@poke-tcg/game-engine';
import { debugFlagsInput, debugInput, HUMAN_ID } from '@poke-tcg/shared';
import { loadCardLibrary } from '../cards.js';
import { DEBUG_BANK, debugFlags, type DebugFlags } from '../debugFlags.js';
import { env } from '../env.js';
import { lockUser } from '../runs.js';
import { debugProcedure, publicProcedure, router } from '../trpc.js';
import { loadOwnGame } from './game.js';

/**
 * Testing cheats for the player's own games (a card into the hand, a Pokémon's HP…). Every
 * procedure that changes anything is a debugProcedure, so it's refused in production; `enabled`
 * tells the client whether to offer the Debug tab at all.
 */
export const debugRouter = router({
  /** Whether this server accepts debug commands. Not a secret: it only hides the client's Debug tab. */
  enabled: publicProcedure.query(() => env.debugEnabled),

  /** Runs a debug command on the player's side of the game. The CPU doesn't respond to it. */
  run: debugProcedure.input(debugInput).mutation(async ({ ctx, input }) => {
    const game = await loadOwnGame(input.gameId, ctx.user.id);
    if (game.status !== 'ACTIVE') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game is over' });
    if (game.version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });

    const { command } = input;
    // A card from outside both decks: add its def to the game's library.
    let extra = {};
    if (command.type === 'ADD_TO_HAND' && !game.state.cards[command.defId]) {
      try {
        extra = await loadCardLibrary([command.defId]);
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown card: ${command.defId}` });
      }
    }
    const result = applyDebug(game.state, HUMAN_ID, command, extra);
    if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
    const next = result.state;

    const saved = await saveGameState({
      gameId: game.id,
      expectedVersion: game.version,
      state: next,
      version: next.version,
      status: 'ACTIVE',
      winner: next.winner,
      // Logged with the moves (marked DEBUG), so a replay can tell the game was changed by hand.
      actions: [{ playerId: HUMAN_ID, version: next.version, action: { type: 'DEBUG', command } as unknown as Prisma.InputJsonValue }],
    });
    if (!saved) throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });
    return getPlayerView(next, HUMAN_ID);
  }),

  /** The Settings page's debug switches (debugFlags.ts): unlocking everything that's locked, and 1,000,000 ₱ in the bank. */
  flags: debugProcedure.query(async ({ ctx }) => {
    const { unlockAll = false, million = false } = await debugFlags(ctx.user.id);
    return { unlockAll, million };
  }),

  /**
   * Sets the debug switches given. The million switch on keeps the bank (`bankBefore`) and fills it to DEBUG_BANK; off,
   * it puts the bank it kept back (what was earned or spent meanwhile is gone). With the user row locked, so the bank kept
   * is the one replaced.
   */
  setFlags: debugProcedure.input(debugFlagsInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const [flags, { bank }] = await Promise.all([debugFlags(ctx.user.id, tx), tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { bank: true } })]);
      const next: DebugFlags = { ...flags };
      let newBank = bank;
      if (input.unlockAll !== undefined) next.unlockAll = input.unlockAll;
      if (input.million === true && !flags.million) {
        next.million = true;
        next.bankBefore = bank;
        newBank = DEBUG_BANK;
      } else if (input.million === false && flags.million) {
        next.million = false;
        newBank = flags.bankBefore ?? bank;
        delete next.bankBefore;
      }
      await tx.user.update({ where: { id: ctx.user.id }, data: { debugFlags: next as Prisma.InputJsonValue, bank: newBank } });
      return { unlockAll: !!next.unlockAll, million: !!next.million };
    }),
  ),
});
