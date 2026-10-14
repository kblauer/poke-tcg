import { prisma } from './client.js';

export interface GameActionRow {
  playerId: string;
  /** state.version after this action was applied. */
  version: number;
  action: unknown;
}

export interface SaveGameStateInput {
  gameId: string;
  /** Version the new state was computed from; the write is skipped if the row has moved on. */
  expectedVersion: number;
  state: unknown;
  version: number;
  status: 'ACTIVE' | 'FINISHED';
  winner: string | null;
  /** Must be non-empty: the inserted row count doubles as the success signal. */
  actions: GameActionRow[];
}

/**
 * Saves a new game state and appends its actions in a single SQL statement (one database
 * round trip, atomic by itself). Returns false if `expectedVersion` no longer matches.
 *
 * Raw SQL because Prisma can't express "update with a version check, then insert into a
 * child table" without an interactive transaction, which costs 3 extra round trips.
 * Keep the column names in sync with prisma/schema.prisma.
 */
export async function saveGameState(input: SaveGameStateInput): Promise<boolean> {
  if (input.actions.length === 0) throw new Error('saveGameState needs at least one action');
  const inserted = await prisma.$executeRaw`
    WITH updated AS (
      UPDATE "Game"
      SET "state" = ${JSON.stringify(input.state)}::jsonb,
          "version" = ${input.version},
          "status" = ${input.status}::"GameStatus",
          "winner" = ${input.winner},
          "updatedAt" = now()
      WHERE "id" = ${input.gameId}::uuid AND "version" = ${input.expectedVersion}
      RETURNING "id"
    )
    INSERT INTO "GameAction" ("gameId", "playerId", "version", "action")
    SELECT updated."id", a."playerId", a."version", a."action"
    FROM updated, jsonb_to_recordset(${JSON.stringify(input.actions)}::jsonb)
      AS a("playerId" text, "version" int, "action" jsonb)`;
  return inserted > 0;
}
