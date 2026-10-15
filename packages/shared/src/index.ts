import { MAX_BENCH, type AttackChoices, type GameAction, type PowerChoices, type TrainerChoices } from '@poke-tcg/game-engine';
import { z } from 'zod';

/** Engine player ids for single-player games. */
export const HUMAN_ID = 'player';
export const CPU_ID = 'cpu';

const benchSlot = z.number().int().min(0).max(MAX_BENCH - 1);
const target = z.union([z.literal('active'), benchSlot]);

const energyType = z.enum(['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless']);

/** Answers to an attack's questions (see AttackChoices in the engine). */
const attackChoicesSchema = z.object({
  energyUids: z.array(z.string()).max(60).optional(),
  benchSlot: benchSlot.optional(),
  defenderEnergyUid: z.string().optional(),
  attackIndex: z.number().int().min(0).optional(),
  copyIndex: z.number().int().min(0).optional(),
  type: energyType.optional(),
}) satisfies z.ZodType<AttackChoices>;

/** Answers to a Pokémon Power's questions (see PowerChoices in the engine). */
const powerChoicesSchema = z.object({
  from: target.optional(),
  to: target.optional(),
  cardUid: z.string().optional(),
  energyUid: z.string().optional(),
  type: energyType.optional(),
}) satisfies z.ZodType<PowerChoices>;

/** Answers to a Trainer's questions (see TrainerChoices in the engine). */
const trainerChoicesSchema = z.object({
  handUids: z.array(z.string()).max(60).optional(),
  discardUids: z.array(z.string()).max(60).optional(),
  target: target.optional(),
  oppTarget: target.optional(),
  energyUids: z.array(z.string()).max(60).optional(),
  oppEnergyUids: z.array(z.string()).max(60).optional(),
  stage: z.enum(['stage1', 'stage2']).optional(),
}) satisfies z.ZodType<TrainerChoices>;

/** Runtime validation for actions arriving from clients. Kept in sync with GameAction. */
export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SET_ACTIVE'), cardUid: z.string() }),
  z.object({ type: z.literal('PLAY_BENCH'), cardUid: z.string(), slot: benchSlot }),
  z.object({ type: z.literal('ATTACH_ENERGY'), cardUid: z.string(), target }),
  z.object({ type: z.literal('EVOLVE'), cardUid: z.string(), target }),
  z.object({ type: z.literal('ATTACK'), attackIndex: z.number().int().min(0), choices: attackChoicesSchema.optional() }),
  z.object({ type: z.literal('PROMOTE'), slot: benchSlot }),
  z.object({ type: z.literal('RETREAT'), slot: benchSlot, energyUids: z.array(z.string()).max(60) }),
  z.object({ type: z.literal('USE_POWER'), source: target, choices: powerChoicesSchema.optional() }),
  z.object({ type: z.literal('PLAY_TRAINER'), cardUid: z.string(), choices: trainerChoicesSchema.optional() }),
  z.object({ type: z.literal('RESOLVE_CHOICE'), cardUid: z.string().optional(), order: z.array(z.string()).max(10).optional() }),
  z.object({ type: z.literal('DISCARD_DOLL'), target }),
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
