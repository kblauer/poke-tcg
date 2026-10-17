import { CPU_DIFFICULTIES, MAX_BENCH, type AttackChoices, type DebugCommand, type GameAction, type PowerChoices, type TrainerChoices } from '@poke-tcg/game-engine';
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
  discardUids: z.array(z.string()).max(60).optional(),
  benchSlots: z.array(benchSlot).max(MAX_BENCH).optional(),
  deck: z.enum(['own', 'opponent']).optional(),
}) satisfies z.ZodType<AttackChoices>;

/** Answers to a Pokémon Power's questions (see PowerChoices in the engine). */
const powerChoicesSchema = z.object({
  from: target.optional(),
  to: target.optional(),
  cardUid: z.string().optional(),
  energyUid: z.string().optional(),
  type: energyType.optional(),
  oppFrom: target.optional(),
  oppTo: target.optional(),
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

/**
 * Zod drops keys a schema doesn't list, so a choice field missing here would silently never reach the
 * engine. These fail to compile if any field of the engine's choice types is left out.
 */
type Missing<T, S extends z.ZodType> = Exclude<keyof T, keyof z.infer<S>>;
const covers = <T, S extends z.ZodType>(_: [Missing<T, S>] extends [never] ? true : Missing<T, S>) => {};
covers<AttackChoices, typeof attackChoicesSchema>(true);
covers<PowerChoices, typeof powerChoicesSchema>(true);
covers<TrainerChoices, typeof trainerChoicesSchema>(true);

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

/** Runtime validation for debug commands (testing cheats; the API refuses them unless debugging is enabled). */
export const debugCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ADD_TO_HAND'), defId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('DRAW') }),
  z.object({ type: z.literal('SET_HP'), side: z.enum(['self', 'opponent']), target, hp: z.number().int().min(10).max(1000) }),
  z.object({ type: z.literal('SET_CPU_DIFFICULTY'), difficulty: z.enum(CPU_DIFFICULTIES) }),
]) satisfies z.ZodType<DebugCommand>;

export const debugInput = z.object({
  gameId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  command: debugCommandSchema,
});
