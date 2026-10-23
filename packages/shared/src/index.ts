import { CPU_DIFFICULTIES, DEBUG_CONDITIONS, MAX_BENCH, type AttackChoices, type DebugCommand, type GameAction, type PowerChoices, type TrainerChoices } from '@poke-tcg/game-engine';
import { BOSS_IDS, COSMETIC_IDS, EQUIP_SLOTS, MAX_PACKS_AT_ONCE, PACK_SETS, RUN_TYPE_IDS, type RunAction, type RunTypeId } from '@poke-tcg/campaign';
import { z } from 'zod';
import { DECK_NAME_LENGTH } from './deck.js';
import { TRAINER_SPRITES } from './trainer-sprites.js';

export * from './deck.js';
export * from './trainer-sprites.js';

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
  copyFrom: target.optional(),
  boost: z.boolean().optional(),
  type: energyType.optional(),
  discardUids: z.array(z.string()).max(60).optional(),
  // -1: the Active Pokémon, for an attack that picks among all of the opponent's Pokémon (Triple Breach).
  benchSlots: z.array(z.number().int().min(-1).max(MAX_BENCH - 1)).max(MAX_BENCH + 1).optional(),
  deck: z.enum(['own', 'opponent']).optional(),
  // -1: not switching, for a "you may switch" (Teleport Blast).
  ownBenchSlot: z.number().int().min(-1).max(MAX_BENCH - 1).optional(),
  oppTarget: target.optional(),
  oppTo: target.optional(),
  ownTarget: target.optional(),
  ownTo: target.optional(),
  side: z.enum(['own', 'opponent']).optional(),
  oppEnergyUid: z.string().optional(),
  weaknessType: energyType.optional(),
  condition: z.enum(['asleep', 'confused', 'paralyzed', 'poisoned', 'burned']).optional(),
  vermilionFlip: z.boolean().optional(),
  // -1: Charity's "no limit".
  damageCap: z.number().int().min(-1).max(990).optional(),
  amount: z.number().int().min(0).max(60).optional(),
  oppDiscardUid: z.string().optional(),
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
  peek: z.enum(['deck', 'oppDeck', 'oppHand', 'prize', 'oppPrize']).optional(),
  prize: z.number().int().min(0).max(5).optional(),
  counters: z.number().int().min(1).max(30).optional(),
  fromSide: z.enum(['own', 'opp']).optional(),
  toSide: z.enum(['own', 'opp']).optional(),
  energyUid2: z.string().optional(),
}) satisfies z.ZodType<PowerChoices>;

/** Answers to a Trainer's questions (see TrainerChoices in the engine). */
const trainerChoicesSchema = z.object({
  handUids: z.array(z.string()).max(60).optional(),
  discardUids: z.array(z.string()).max(60).optional(),
  target: target.optional(),
  target2: target.optional(),
  oppTarget: target.optional(),
  energyUids: z.array(z.string()).max(60).optional(),
  oppEnergyUids: z.array(z.string()).max(60).optional(),
  stage: z.enum(['stage1', 'stage2']).optional(),
  pick: z.number().int().min(0).max(60).optional(),
  guess: z.number().int().min(0).max(60).optional(),
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
  z.object({
    type: z.literal('RESOLVE_CHOICE'),
    cardUid: z.string().optional(),
    order: z.array(z.string()).max(10).optional(),
    target: target.optional(),
    count: z.number().int().min(0).max(60).optional(),
  }),
  z.object({ type: z.literal('DISCARD_DOLL'), target }),
  z.object({ type: z.literal('RESET_SETUP') }),
  z.object({ type: z.literal('START_BATTLE') }),
  z.object({ type: z.literal('USE_STADIUM') }),
  z.object({ type: z.literal('FLIP_FACE_DOWN'), target }),
  z.object({ type: z.literal('DISCARD_SHAPESHIFT'), target }),
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

/** A single battle's opponent: a random trainer with a deck suiting their name, or a boss with their own deck. */
export const singleBattleOpponent = z.discriminatedUnion('kind', [z.object({ kind: z.literal('trainer') }), z.object({ kind: z.literal('boss'), bossId: z.enum(BOSS_IDS) })]);
export type SingleBattleOpponent = z.infer<typeof singleBattleOpponent>;

/** A single battle (outside runs): one of your decks (null: the fixed test deck), the CPU's difficulty and its opponent. */
export const singleBattleInput = z.object({
  deckId: z.uuid().nullable(),
  difficulty: z.enum(CPU_DIFFICULTIES),
  opponent: singleBattleOpponent,
});
export type SingleBattleInput = z.infer<typeof singleBattleInput>;

/** Runtime validation for debug commands (testing cheats; the API refuses them unless debugging is enabled). */
export const debugCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ADD_TO_HAND'), defId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('DRAW') }),
  z.object({ type: z.literal('SET_HP'), side: z.enum(['self', 'opponent']), target, hp: z.number().int().min(10).max(1000) }),
  z.object({ type: z.literal('SET_CPU_DIFFICULTY'), difficulty: z.enum(CPU_DIFFICULTIES) }),
  z.object({ type: z.literal('SET_CONDITION'), side: z.enum(['self', 'opponent']), condition: z.enum(DEBUG_CONDITIONS), on: z.boolean() }),
  z.object({ type: z.literal('WIN') }),
]) satisfies z.ZodType<DebugCommand>;

export const debugInput = z.object({
  gameId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  command: debugCommandSchema,
});

/** A player's move in a run (see RunAction in @poke-tcg/campaign). The server's own actions aren't accepted. */
export const runActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CHOOSE'), option: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal('ACCEPT') }),
  z.object({ type: z.literal('LEAVE') }),
  z.object({ type: z.literal('CONCEDE') }),
  z.object({ type: z.literal('PICK'), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal('BUY'), index: z.number().int().min(0).max(10) }),
]) satisfies z.ZodType<RunAction>;

export const runIdInput = z.object({ runId: z.uuid() });
export const runActInput = z.object({
  runId: z.uuid(),
  /** The run version the client acted on; stale submissions are rejected. */
  expectedVersion: z.number().int().min(0),
  action: runActionSchema,
});
/** Choosing a step's option on the map; for a battle, `deckId` first switches the run to another of the account's decks. */
export const runChooseInput = z.object({
  runId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  option: z.number().int().min(0).max(9),
  deckId: z.uuid().optional(),
});
/** Saving the automatic run deck once the run is over, under a name of the player's. */
export const saveRunDeckInput = z.object({ runId: z.uuid(), name: z.string().trim().min(1).max(DECK_NAME_LENGTH) });
export const useItemInput = z.object({ runId: z.uuid(), itemId: z.string().min(1).max(64) });
/** A consumable used from the Inventory: in the run under way, or kept for the next run when there's none. */
export const useConsumableInput = z.object({ itemId: z.string().min(1).max(64) });
export const startRunInput = z.object({ type: z.enum(RUN_TYPE_IDS as [RunTypeId, ...RunTypeId[]]), deckId: z.uuid() });
export const buyItemInput = z.object({ itemId: z.string().min(1).max(64) });
export const equipInput = z.object({ slot: z.enum(EQUIP_SLOTS), itemId: z.string().min(1).max(64).nullable() });
/** The Inventory's trainer sprite, one of Showdown's. */
export const trainerSpriteInput = z.object({ sprite: z.enum(TRAINER_SPRITES) });
/** The player's sprite on the run maps: the boy (Red, Ethan, Brendan) or the girl (Leaf, Lyra, May). */
export const PLAYER_GENDERS = ['male', 'female'] as const;
export type PlayerGender = (typeof PLAYER_GENDERS)[number];
export const playerGenderInput = z.object({ gender: z.enum(PLAYER_GENDERS) });
/** A cosmetic (card back, playmat or coin) to buy, or to use (its kind's, or null for the default). */
export const buyCosmeticInput = z.object({ id: z.enum(COSMETIC_IDS as [string, ...string[]]) });
export const useCosmeticInput = z.object({ kind: z.enum(['cardBack', 'playmat', 'coin']), id: z.enum(COSMETIC_IDS as [string, ...string[]]).nullable() });

export const openPackInput = z.object({
  setId: z.enum(PACK_SETS as [string, ...string[]]),
  /** How many packs to buy and open at once. */
  count: z.number().int().min(1).max(MAX_PACKS_AT_ONCE).default(1),
});

/** Crafting a card with Stardust (packs.craft). */
export const craftCardInput = z.object({ cardId: z.string().min(1).max(64) });

/** Adding a card to the account's favorites, or taking it out (decks.setFavorite). */
export const favoriteCardInput = z.object({ cardId: z.string().min(1).max(64), favorite: z.boolean() });
/** Starring one of the account's decks (or not), for the run's Favorite decks. */
export const favoriteDeckInput = z.object({ deckId: z.uuid(), favorite: z.boolean() });

/** The debug pack opener's cheats (packs.debugOpen): a holo Energy in every pack, or every pack all rares. */
export const debugOpenPackInput = openPackInput.extend({ holoEnergy: z.boolean().default(false), allRares: z.boolean().default(false) });
