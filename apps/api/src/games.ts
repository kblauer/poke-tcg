// What saving games and runs share (routers/game.ts, runs.ts): the cast for Prisma's JSON columns, a new seed, and the
// action log rows of a game.
import type { Prisma } from '@poke-tcg/db';
import type { GameAction } from '@poke-tcg/game-engine';

export const asJson = (value: unknown) => value as Prisma.InputJsonValue;

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Log rows for a sequence of actions that ended at `finalVersion`. */
export function actionRows(entries: { playerId: string; action: GameAction }[], finalVersion: number) {
  const first = finalVersion - entries.length + 1;
  return entries.map((e, i) => ({ playerId: e.playerId, version: first + i, action: asJson(e.action) }));
}
