import { TRPCError } from '@trpc/server';
import { prisma, saveGameState, type Prisma } from '@poke-tcg/db';
import { applyDebug, getPlayerView } from '@poke-tcg/game-engine';
import { debugFlagsInput, debugInput, HUMAN_ID } from '@poke-tcg/shared';
import { loadCardLibrary } from '../cards.js';
import { CURRENCY_FLAGS, DEBUG_AMOUNT, debugFlags, type DebugFlags } from '../debugFlags.js';
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

  /** The Settings page's debug switches (debugFlags.ts): unlocking everything that's locked, and 1,000,000 ₱, Stardust and EXP added. */
  flags: debugProcedure.query(async ({ ctx }) => switches(await debugFlags(ctx.user.id))),

  /**
   * Sets the debug switches given. Each currency's switch on adds DEBUG_AMOUNT to it (the million switch the bank, the
   * dust switch Stardust, the exp switch EXP); off, it takes it away again (never below 0), so what was earned or spent
   * meanwhile stays (the user's). With the user row locked, so a switch can't add or take it twice.
   */
  setFlags: debugProcedure.input(debugFlagsInput).mutation(({ ctx, input }) =>
    prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const [flags, held] = await Promise.all([debugFlags(ctx.user.id, tx), tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { bank: true, stardust: true, exp: true } })]);
      const next: DebugFlags = { ...flags };
      const amounts = { ...held };
      if (input.unlockAll !== undefined) next.unlockAll = input.unlockAll;
      for (const [flag, field] of Object.entries(CURRENCY_FLAGS) as [keyof typeof CURRENCY_FLAGS, keyof typeof held][]) {
        if (input[flag] === undefined || input[flag] === !!flags[flag]) continue;
        next[flag] = input[flag];
        amounts[field] = input[flag] ? held[field] + DEBUG_AMOUNT : Math.max(0, held[field] - DEBUG_AMOUNT);
      }
      await tx.user.update({ where: { id: ctx.user.id }, data: { debugFlags: next as Prisma.InputJsonValue, ...amounts } });
      return switches(next);
    }),
  ),
});

/** The switches as the client sees them, each on or off. */
const switches = (flags: DebugFlags) => ({ unlockAll: !!flags.unlockAll, million: !!flags.million, dust: !!flags.dust, exp: !!flags.exp });
