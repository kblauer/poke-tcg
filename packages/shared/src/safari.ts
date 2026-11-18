// Safari Draft's inputs (README: Safari Draft): the player's actions, as the safari package's types. Type imports only,
// so nothing of the package reaches a bundle through these schemas; the bounds are the draft's (6 places a side, shops
// and encounters of at most 7 choices).
import type { SafariAction } from '@poke-tcg/safari';
import { z } from 'zod';

const unit = z.string().min(1).max(64);
const index = z.number().int().min(0).max(15);
const place = z.object({ zone: z.enum(['board', 'inventory']), at: z.number().int().min(0).max(5) });

export const safariActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PICK_STARTER'), unit }),
  z.object({ type: z.literal('BUY'), index }),
  z.object({ type: z.literal('SELL'), place }),
  z.object({ type: z.literal('MOVE'), from: place, to: place }),
  z.object({ type: z.literal('REROLL') }),
  z.object({ type: z.literal('FREEZE') }),
  z.object({ type: z.literal('TIER_UP') }),
  z.object({ type: z.literal('PICK'), unit }),
  z.object({ type: z.literal('SET_TRAINER'), key: z.number().int().min(0).max(1_000_000).nullable() }),
  z.object({ type: z.literal('CHOOSE'), index }),
  z.object({ type: z.literal('BATTLE') }),
  z.object({ type: z.literal('ENCOUNTER'), index }),
  z.object({ type: z.literal('TAKE'), index }),
  z.object({ type: z.literal('LEAVE') }),
  z.object({ type: z.literal('CONCEDE') }),
]) satisfies z.ZodType<SafariAction>;

export const safariActInput = z.object({
  runId: z.uuid(),
  /** The run's version the client acted on; stale submissions are rejected. */
  expectedVersion: z.number().int().min(0),
  action: safariActionSchema,
});
