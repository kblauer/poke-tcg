import { TRPCError } from '@trpc/server';
import { saveGameState, type Prisma } from '@poke-tcg/db';
import { applyDebug, getPlayerView } from '@poke-tcg/game-engine';
import { debugInput, HUMAN_ID } from '@poke-tcg/shared';
import { loadCardLibrary } from '../cards.js';
import { env } from '../env.js';
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
      extra = await loadCardLibrary([command.defId]).catch(() => {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown card: ${command.defId}` });
      });
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
});
