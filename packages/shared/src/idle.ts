// The Idle Adventure's inputs (README: Idle Adventure): the player's actions and settings, as the idle package's types.
import { DEX_SIZE, IDLE_MODES, MAX_AUTO_BALLS, type IdleAction, type IdleSettings } from '@poke-tcg/idle';
import { z } from 'zod';

const uid = z.string().min(1).max(32);

export const idleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GYM') }),
  z.object({ type: z.literal('CONTINUE') }),
  z.object({ type: z.literal('BACK_ROUTE') }),
  z.object({ type: z.literal('VISIT_STORE') }),
  z.object({ type: z.literal('LEAVE_STORE') }),
  z.object({ type: z.literal('GRIND') }),
  z.object({ type: z.literal('STOP_GRIND') }),
  z.object({ type: z.literal('WILD_GRIND') }),
  z.object({ type: z.literal('TRAINER_GRIND') }),
  z.object({ type: z.literal('CONTINUE_ROUTE') }),
  z.object({ type: z.literal('SET_MODE'), mode: z.enum(IDLE_MODES) }),
  z.object({ type: z.literal('BUY'), item: z.string().min(1).max(40), count: z.number().int().min(1).max(99) }),
  z.object({ type: z.literal('SET_ORDER'), uids: z.array(uid).min(1).max(6) }),
  z.object({ type: z.literal('SET_SLOTS'), uid, slots: z.array(z.string().min(1).max(40)).max(3), auto: z.boolean().optional() }),
  z.object({ type: z.literal('USE_STONE'), uid, item: z.string().min(1).max(40) }),
  z.object({ type: z.literal('GIVE_UP') }),
]) satisfies z.ZodType<IdleAction>;

export const idleSettingsSchema = z.object({
  autoHeal: z.boolean(),
  revives: z.array(z.enum(['last', 'any', 'boss', 'lead'])).max(4),
  autoCatch: z.enum(['off', 'new', 'all']),
  stopWhenFull: z.boolean(),
  replaceLowest: z.boolean(),
  autoEvolve: z.boolean(),
  autoGrind: z.boolean(),
  autoBalls: z.number().int().min(0).max(MAX_AUTO_BALLS),
}) satisfies z.ZodType<IdleSettings>;

/** A new run: its starter (one of the three, or a species the account's Pokédex has caught, from the second run on), shiny if one was caught. */
export const startIdleInput = z.object({ species: z.number().int().min(1).max(DEX_SIZE), shiny: z.boolean().default(false) });
export const idleRunInput = z.object({ runId: z.uuid(), expectedVersion: z.number().int().min(0) });
export const idleActInput = idleRunInput.extend({ action: idleActionSchema });
/** The battle's ball button: a ball on this tick of the wild battle playing (the tick after the one on screen). */
export const idleThrowInput = idleRunInput.extend({ tick: z.number().int().min(1).max(100000) });
/** Changes some of the settings (the rest kept). */
export const idleSettingsInput = idleSettingsSchema.partial();
/** Debug: a warp to an area (the run's party and bag kept). */
export const idleWarpInput = z.object({ runId: z.uuid(), area: z.string().min(1).max(40) });
