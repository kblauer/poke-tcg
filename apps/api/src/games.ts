// What saving games, runs and Battle Tower challenges share (routers/game.ts, runs.ts, towers.ts): the cast for Prisma's
// JSON columns, a new seed, the action log rows of a game, and debug's Skip battle.
import { prisma, saveGameState, type Prisma } from '@poke-tcg/db';
import { applyDebug, type DebugCommand, type GameAction, type GameState } from '@poke-tcg/game-engine';
import { HUMAN_ID } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';

export const asJson = (value: unknown) => value as Prisma.InputJsonValue;

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Log rows for a sequence of actions that ended at `finalVersion`. */
export function actionRows(entries: { playerId: string; action: GameAction }[], finalVersion: number) {
  const first = finalVersion - entries.length + 1;
  return entries.map((e, i) => ({ playerId: e.playerId, version: first + i, action: asJson(e.action) }));
}

/**
 * Debug's Skip battle (only from a debugProcedure): wins the game at once with the WIN debug command, saved as a DEBUG
 * action row. The caller then settles the battle as skipped (no ₱, EXP or card reward).
 */
export async function debugWinGame(gameId: string | null) {
  const game = gameId ? await prisma.game.findUnique({ where: { id: gameId } }) : null;
  if (!game) throw new TRPCError({ code: 'BAD_REQUEST', message: 'The battle did not start' });
  const command: DebugCommand = { type: 'WIN' };
  const result = applyDebug(game.state as unknown as GameState, HUMAN_ID, command);
  if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
  const next = result.state;
  const saved = await saveGameState({
    gameId: game.id,
    expectedVersion: game.version,
    state: next,
    version: next.version,
    status: 'FINISHED',
    winner: next.winner,
    actions: [{ playerId: HUMAN_ID, version: next.version, action: asJson({ type: 'DEBUG', command }) }],
  });
  if (!saved) throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });
}
