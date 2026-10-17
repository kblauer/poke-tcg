// Runs on the server: the account's first run, saving run states, starting their battles and settling them.
import {
  applyRunAction,
  battleSetup,
  createRun,
  currentGameId,
  expandDeck,
  FIRST_RUN,
  needsBattle,
  runType,
  STARTER_DECK,
  type RunAction,
  type RunState,
  type RunSystemAction,
  type RunTypeId,
} from '@poke-tcg/campaign';
import { prisma, type Prisma, type Run } from '@poke-tcg/db';
import { createGame, runCpu, type GameAction } from '@poke-tcg/game-engine';
import { CPU_ID, HUMAN_ID } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { ensureUser, type AuthUser } from './auth.js';
import { loadCardLibrary } from './cards.js';
import { cardPool } from './pool.js';
import { unlockCards } from './unlocks.js';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export type LoadedRun = Omit<Run, 'state'> & { state: RunState };
const loaded = (run: Run): LoadedRun => ({ ...run, state: run.state as unknown as RunState });

export const STARTER_DECK_NAME = 'Starter deck';

/** The run's status column for its state. */
const statusOf = (state: RunState) => (state.phase === 'won' ? 'WON' : state.phase === 'lost' ? 'LOST' : 'ACTIVE');

/**
 * Sets up a new account (or one from before runs existed): the starter deck in its deck list, every card
 * in it unlocked, and the first run with it. Safe to call on every visit; it only creates what's missing.
 */
export async function ensureAccount(user: AuthUser) {
  await ensureUser(user);
  const [runs, unlocks] = await Promise.all([prisma.run.count({ where: { ownerId: user.id } }), prisma.cardUnlock.count({ where: { userId: user.id } })]);
  if (runs && unlocks) return;
  if (!(await prisma.deck.findFirst({ where: { ownerId: user.id, name: STARTER_DECK_NAME } }))) {
    await prisma.deck.create({
      data: { ownerId: user.id, name: STARTER_DECK_NAME, cards: { create: STARTER_DECK.map(([cardId, quantity]) => ({ cardId, quantity })) } },
    });
  }
  if (!unlocks) await unlockCards(user.id, STARTER_DECK.map(([cardId]) => cardId));
  if (!runs) await createRunRow(user.id, FIRST_RUN, expandDeck(STARTER_DECK));
}

async function createRunRow(ownerId: string, type: RunTypeId, deck: string[]) {
  const seed = newSeed();
  const state = createRun(type, deck, seed);
  return prisma.run.create({ data: { ownerId, type, seed, state: asJson(state), version: state.version } });
}

export async function loadOwnRun(runId: string, userId: string): Promise<LoadedRun> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  // Same error for "missing" and "not yours" so ids can't be probed.
  if (!run || run.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' });
  return loaded(run);
}

/** The account's latest run, with its battle settled if it just ended. */
export async function latestRun(userId: string): Promise<LoadedRun | null> {
  const run = await prisma.run.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  return run && settleBattle(loaded(run));
}

/**
 * Applies actions to a run and saves it, if nobody else changed it meanwhile (CONFLICT otherwise).
 * When the run asks for a battle, starts the game and records it; when the run is beaten, gives its rewards.
 */
export async function advanceRun(run: LoadedRun, actions: (RunAction | RunSystemAction)[]): Promise<LoadedRun> {
  const pool = await cardPool();
  let state = run.state;
  for (const action of actions) {
    const result = applyRunAction(state, action, pool);
    if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
    state = result.state;
  }
  let gameId: string | null = null;
  if (needsBattle(state)) {
    gameId = await startBattle(run, state);
    const started = applyRunAction(state, { type: 'BATTLE_STARTED', gameId }, pool);
    if (!started.ok) throw new Error(started.error);
    state = started.state;
  }

  const status = statusOf(state);
  const reward = status === 'WON' && !run.rewarded;
  const saved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.run.updateMany({
      where: { id: run.id, version: run.version },
      data: { state: asJson(state), version: state.version, status, ...(reward && { rewarded: true }) },
    });
    if (count === 0) return false;
    // Cards gained by these actions are unlocked for the deck builder at once (they don't join the run's deck).
    await unlockCards(run.ownerId, state.gained.slice(run.state.gained.length), tx);
    if (reward) await giveRewards(tx, run.ownerId, state);
    return true;
  });
  if (!saved) {
    // The battle game started for this attempt is orphaned; remove it.
    if (gameId) await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
    throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
  }
  return { ...run, state, version: state.version, status, rewarded: run.rewarded || reward };
}

/** For a beaten run: its EXP and the gym leader's badge. (Its cards were unlocked as they were gained.) */
async function giveRewards(tx: Prisma.TransactionClient, userId: string, state: RunState) {
  await tx.user.update({ where: { id: userId }, data: { exp: { increment: state.exp } } });
  const badge = runType(state.type).leader.badge;
  await tx.inventoryItem.upsert({ where: { userId_itemId: { userId, itemId: badge } }, create: { userId, itemId: badge, quantity: 1 }, update: {} });
}

/** Creates the battle's game: the run's deck against the encounter's opponent, with the run's battle rules. */
async function startBattle(run: LoadedRun, state: RunState): Promise<string> {
  const setup = battleSetup(state, await cardPool());
  const library = await loadCardLibrary([...state.deck, ...setup.deck]);
  const seed = newSeed();
  const initial = createGame({ id: HUMAN_ID, deck: state.deck }, { id: CPU_ID, deck: setup.deck }, seed, library);
  initial.cpuDifficulty = setup.difficulty;
  if (setup.rules.length) initial.rules = setup.rules;
  // The CPU picks its active right away, so the game is waiting on the player.
  const { state: game, actions } = runCpu(initial, CPU_ID);
  const created = await prisma.game.create({
    data: {
      ownerId: run.ownerId,
      runId: run.id,
      seed,
      state: asJson(game),
      version: game.version,
      actions: { create: actions.map((action: GameAction, i) => ({ playerId: CPU_ID, version: game.version - actions.length + i + 1, action: asJson(action) })) },
    },
    select: { id: true },
  });
  return created.id;
}

/** If the run's battle has finished, records the result (a win, or a loss and 1 HP). */
export async function settleBattle(run: LoadedRun): Promise<LoadedRun> {
  const gameId = currentGameId(run.state);
  if (!gameId) return run;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { status: true, winner: true } });
  if (!game || game.status !== 'FINISHED') return run;
  try {
    return await advanceRun(run, [{ type: 'BATTLE_OVER', gameId, won: game.winner === HUMAN_ID }]);
  } catch (error) {
    // Settled by another request first: reload.
    if (error instanceof TRPCError && error.code === 'CONFLICT') return loaded((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })));
    throw error;
  }
}

/**
 * Starts a new run of `type` with the deck. Earlier runs' ₱ go to the bank first; the new run starts
 * with STARTING_POKEDOLLARS. Not while a run is still going.
 */
export async function startRun(userId: string, type: RunTypeId, deck: string[]) {
  return prisma.$transaction(async (tx) => {
    if (await tx.run.count({ where: { ownerId: userId, status: 'ACTIVE' } })) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Finish your current run first' });
    }
    const unbanked = await tx.run.findMany({ where: { ownerId: userId, banked: false }, select: { id: true, state: true } });
    const total = unbanked.reduce((sum, r) => sum + (r.state as unknown as RunState).pokedollars, 0);
    if (unbanked.length) {
      await tx.run.updateMany({ where: { id: { in: unbanked.map((r) => r.id) } }, data: { banked: true } });
      await tx.user.update({ where: { id: userId }, data: { bank: { increment: total } } });
    }
    const seed = newSeed();
    const state = createRun(type, deck, seed);
    return tx.run.create({ data: { ownerId: userId, type, seed, state: asJson(state), version: state.version }, select: { id: true } });
  });
}
