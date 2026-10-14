import { MAX_BENCH, type GameAction } from '@poke-tcg/game-engine';
import { z } from 'zod';

/** Engine player ids for single-player games. */
export const HUMAN_ID = 'player';
export const CPU_ID = 'cpu';

const benchSlot = z.number().int().min(0).max(MAX_BENCH - 1);
const target = z.union([z.literal('active'), benchSlot]);

/** Runtime validation for actions arriving from clients. Kept in sync with GameAction. */
export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SET_ACTIVE'), cardUid: z.string() }),
  z.object({ type: z.literal('PLAY_BENCH'), cardUid: z.string(), slot: benchSlot }),
  z.object({ type: z.literal('ATTACH_ENERGY'), cardUid: z.string(), target }),
  z.object({ type: z.literal('ATTACK'), attackIndex: z.number().int().min(0) }),
  z.object({ type: z.literal('PROMOTE'), slot: benchSlot }),
  z.object({ type: z.literal('END_TURN') }),
  z.object({ type: z.literal('CONCEDE') }),
]) satisfies z.ZodType<GameAction>;

export const gameIdInput = z.object({ gameId: z.uuid() });
export const submitActionInput = z.object({
  gameId: z.uuid(),
  /** The state version the client acted on; stale submissions are rejected. */
  expectedVersion: z.number().int().min(0),
  action: gameActionSchema,
});
