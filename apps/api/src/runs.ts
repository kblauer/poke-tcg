// Runs on the server: the account's first run, saving run states, starting their battles and settling them.
import {
  applyRunAction,
  bankablePokedollars,
  battleSetup,
  createRun,
  currentGameId,
  expandDeck,
  FIRST_RUN,
  needsBattle,
  STARTER_DECK,
  withConsumablesBefore,
  type RunAction,
  type RunState,
  type RunSystemAction,
  type RunTypeId,
} from '@poke-tcg/campaign';
import { prisma, saveGameState, type Prisma, type Run } from '@poke-tcg/db';
import { applyAction, createGame, runCpu, type GameAction, type GameState } from '@poke-tcg/game-engine';
import { CPU_ID, HUMAN_ID } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { ensureUser, type AuthUser } from './auth.js';
import { loadCardLibrary } from './cards.js';
import { runPool } from './pool.js';
import { earnedPacks, unlockPacks } from './progress.js';
import { unlockCards } from './unlocks.js';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export type LoadedRun = Omit<Run, 'state'> & { state: RunState };
const loaded = (run: Run): LoadedRun => ({ ...run, state: run.state as unknown as RunState });

export const STARTER_DECK_NAME = 'Starter deck';
/** The automatic run deck's name in the deck list, until it's saved under a name of the player's. */
export const RUN_DECK_NAME = 'Current run';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Locks the account's user row until the transaction ends, so two requests for the same account at once (two tabs, a
 * double click) can't both pass a check that the other's write would fail: a second starter deck, a second active run.
 */
const lockUser = (tx: Prisma.TransactionClient, userId: string) => tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;

/**
 * Makes the account's automatic run deck (`Deck.runId`) a copy of this run's deck: the deck the account has (left over
 * from the last run, if it wasn't saved) is taken over, or one is made, at the top of the deck list. Called when a run
 * starts and whenever its deck changes (a trade, switching decks).
 */
export async function syncRunDeck(ownerId: string, runId: string, deck: string[], db: Db = prisma) {
  const existing = await db.deck.findFirst({ where: { ownerId, runId: { not: null } }, select: { id: true } });
  const row = existing
    ? await db.deck.update({ where: { id: existing.id }, data: { runId, name: RUN_DECK_NAME } })
    : await db.deck.create({ data: { ownerId, runId, name: RUN_DECK_NAME, position: -1 } });
  const counts = deck.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
  await db.deckCard.deleteMany({ where: { deckId: row.id } });
  await db.deckCard.createMany({ data: [...counts].map(([cardId, quantity]) => ({ deckId: row.id, cardId, quantity })) });
}

/** The run's status column for its state. */
const statusOf = (state: RunState) => (state.phase === 'won' ? 'WON' : state.phase === 'lost' ? 'LOST' : 'ACTIVE');

/**
 * Sets up a new account (or one from before runs existed): the starter deck in its deck list, every card
 * in it unlocked, and the first run with it. Safe to call on every visit; it only creates what's missing.
 */
export async function ensureAccount(user: AuthUser) {
  await ensureUser(user);
  // In one transaction with the user row locked: a new account's first two requests at once would each make a starter deck and a run.
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const runs = await tx.run.count({ where: { ownerId: user.id } });
    const unlocks = await tx.cardUnlock.count({ where: { userId: user.id } });
    if (runs && unlocks) return;
    if (!(await tx.deck.findFirst({ where: { ownerId: user.id, name: STARTER_DECK_NAME } }))) {
      await tx.deck.create({
        data: { ownerId: user.id, name: STARTER_DECK_NAME, cards: { create: STARTER_DECK.map(([cardId, quantity]) => ({ cardId, quantity })) } },
      });
    }
    if (!unlocks) await unlockCards(user.id, STARTER_DECK.map(([cardId]) => cardId), tx);
    if (!runs) await createRunRow(user.id, FIRST_RUN, expandDeck(STARTER_DECK), STARTER_DECK_NAME, tx);
  });
}

async function createRunRow(ownerId: string, type: RunTypeId, deck: string[], deckName: string, db: Db = prisma) {
  const seed = newSeed();
  const state = createRun(type, deck, seed, deckName);
  const run = await db.run.create({ data: { ownerId, type, seed, state: asJson(state), version: state.version } });
  await syncRunDeck(ownerId, run.id, state.deck, db);
  return run;
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

/** The account's equipped items: they work in its runs from the next encounter after they're put on. */
export async function equippedGear(userId: string): Promise<string[]> {
  return (await prisma.equipment.findMany({ where: { userId }, select: { itemId: true } })).map((e) => e.itemId);
}

/**
 * Applies actions to a run and saves it, if nobody else changed it meanwhile (CONFLICT otherwise).
 * When the run asks for a battle, starts the game and records it; when the run is beaten, gives its rewards;
 * when it ends (beaten or lost), moves its ₱ to the bank; its first battle completed (and beating it) unlocks packs.
 */
export async function advanceRun(run: LoadedRun, actions: (RunAction | RunSystemAction)[]): Promise<LoadedRun> {
  // The run's generation's cards: its offers and its trainers' decks are that generation's.
  const [pool, gear] = await Promise.all([runPool(run.state.type), equippedGear(run.ownerId)]);
  let state = run.state;
  for (const action of actions) {
    const result = applyRunAction(state, action, pool, gear);
    if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
    state = result.state;
  }
  let gameId: string | null = null;
  if (needsBattle(state)) {
    gameId = await startBattle(run, state, gear);
    const started = applyRunAction(state, { type: 'BATTLE_STARTED', gameId }, pool, gear);
    if (!started.ok) throw new Error(started.error);
    state = started.state;
  }

  const status = statusOf(state);
  const reward = status === 'WON' && !run.rewarded;
  // A run's ₱ go to the bank as soon as it ends (only if it completed a battle without conceding it: bankablePokedollars).
  // A lost run carried on (the Retry testing aid) takes them back out, as far as the bank still has them, so they
  // aren't banked twice.
  const bank = status !== 'ACTIVE' && !run.banked;
  const unbank = status === 'ACTIVE' && run.banked;
  const saved = await prisma.$transaction(async (tx) => {
    // Its first battle completed unlocks its generation's next booster pack, beating it all of them; the run's log says so.
    const packs = await earnedPacks(run.ownerId, run.state, state, tx);
    for (const { name } of packs) state.log.push(`Unlocked ${name} booster packs.`);
    const { count } = await tx.run.updateMany({
      where: { id: run.id, version: run.version },
      data: { state: asJson(state), version: state.version, status, ...(reward && { rewarded: true }), ...((bank || unbank) && { banked: bank }) },
    });
    if (count === 0) return false;
    if (bank) await tx.user.update({ where: { id: run.ownerId }, data: { bank: { increment: bankablePokedollars(state) } } });
    if (unbank) {
      const { bank: banked } = await tx.user.findUniqueOrThrow({ where: { id: run.ownerId }, select: { bank: true } });
      await tx.user.update({ where: { id: run.ownerId }, data: { bank: { decrement: Math.min(banked, state.pokedollars) } } });
    }
    // Cards gained by these actions are unlocked for the deck builder at once (they don't join the run's deck),
    // and badges (or the Champion's ribbon) go to the inventory as they're won.
    await unlockCards(run.ownerId, state.gained.slice(run.state.gained.length), tx);
    await unlockPacks(run.ownerId, packs.map((p) => p.id), tx);
    for (const itemId of (state.badges ?? []).slice(run.state.badges?.length ?? 0)) {
      await tx.inventoryItem.upsert({ where: { userId_itemId: { userId: run.ownerId, itemId } }, create: { userId: run.ownerId, itemId, quantity: 1 }, update: {} });
    }
    if (reward) await giveRewards(tx, run.ownerId, state);
    // A trade or a switch of decks changed the run's deck: so does its automatic deck.
    if (state.deck.join() !== run.state.deck.join()) await syncRunDeck(run.ownerId, run.id, state.deck, tx);
    return true;
  });
  if (!saved) {
    // The battle game started for this attempt is orphaned; remove it.
    if (gameId) await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
    throw new TRPCError({ code: 'CONFLICT', message: 'Run changed, refresh and retry' });
  }
  return { ...run, state, version: state.version, status, rewarded: run.rewarded || reward, banked: (run.banked || bank) && !unbank };
}

/** For a beaten run: its EXP. (Its cards and badges were given as they were won.) */
async function giveRewards(tx: Prisma.TransactionClient, userId: string, state: RunState) {
  await tx.user.update({ where: { id: userId }, data: { exp: { increment: state.exp } } });
}

/** Creates the battle's game: the run's deck against the encounter's opponent, with the run's battle rules and the player's items'. */
async function startBattle(run: LoadedRun, state: RunState, gear: string[]): Promise<string> {
  const setup = battleSetup(state, await runPool(state.type), { gear, player: HUMAN_ID });
  const library = await loadCardLibrary([...state.deck, ...setup.deck]);
  const seed = newSeed();
  const initial = createGame({ id: HUMAN_ID, deck: state.deck }, { id: CPU_ID, deck: setup.deck }, seed, library, setup.rules);
  initial.cpuDifficulty = setup.difficulty;
  // The CPU picks its active right away, so the game is waiting on the player.
  const { state: game, actions } = runCpu(initial, CPU_ID);
  // The run deck's cosmetics (those of the deck it was started with, or switched to).
  const cosmetics = await prisma.deck.findFirst({ where: { runId: run.id }, select: { cardBack: true, playmat: true, coin: true } });
  const created = await prisma.game.create({
    data: {
      ownerId: run.ownerId,
      runId: run.id,
      seed,
      ...(cosmetics && { cosmetics }),
      state: asJson(game),
      version: game.version,
      actions: { create: actions.map((action: GameAction, i) => ({ playerId: CPU_ID, version: game.version - actions.length + i + 1, action: asJson(action) })) },
    },
    select: { id: true },
  });
  return created.id;
}

/** Ends a battle the run has left (with an Escape Rope) by conceding it, so it can't be played on. */
export async function abandonBattle(gameId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status === 'FINISHED') return;
  const action: GameAction = { type: 'CONCEDE' };
  const result = applyAction(game.state as unknown as GameState, HUMAN_ID, action);
  if (!result.ok) return;
  const next = result.state;
  await saveGameState({
    gameId,
    expectedVersion: game.version,
    state: next,
    version: next.version,
    status: 'FINISHED',
    winner: next.winner,
    actions: [{ playerId: HUMAN_ID, version: next.version, action: asJson(action) }],
  });
}

/**
 * If the run's battle has finished, records the result (a win, or a loss and 1 HP), and whether the player conceded
 * it (a CONCEDE of theirs in its action rows): a conceded battle isn't a completed one (battlesCompleted).
 */
export async function settleBattle(run: LoadedRun, skipped = false): Promise<LoadedRun> {
  const gameId = currentGameId(run.state);
  if (!gameId) return run;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { status: true, winner: true } });
  if (!game || game.status !== 'FINISHED') return run;
  const conceded = (await prisma.gameAction.count({ where: { gameId, playerId: HUMAN_ID, action: { path: ['type'], equals: 'CONCEDE' } } })) > 0;
  try {
    return await advanceRun(run, [{ type: 'BATTLE_OVER', gameId, won: game.winner === HUMAN_ID, ...(conceded && { conceded }), ...(skipped && { skipped }) }]);
  } catch (error) {
    // Settled by another request first: reload.
    if (error instanceof TRPCError && error.code === 'CONFLICT') return loaded((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })));
    throw error;
  }
}

/**
 * Starts a new run of `type` with the deck; it starts with STARTING_POKEDOLLARS. Not while a run is still going.
 * The automatic run deck (if the last run's wasn't saved) is taken over by this run (syncRunDeck).
 * Runs' ₱ are banked when they end (advanceRun); any earlier run whose ₱ weren't (one that ended before that
 * rule) is banked here first. The consumables used from the Inventory between runs (`User.pendingConsumables`) take effect (withConsumablesBefore).
 */
export async function startRun(userId: string, type: RunTypeId, deck: { name: string; cards: string[] }) {
  return prisma.$transaction(async (tx) => {
    // The lock makes the check below hold: two Start clicks at once would otherwise both see no active run and make one each.
    await lockUser(tx, userId);
    if (await tx.run.count({ where: { ownerId: userId, status: 'ACTIVE' } })) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Finish your current run first' });
    }
    const unbanked = await tx.run.findMany({ where: { ownerId: userId, banked: false }, select: { id: true, state: true } });
    const total = unbanked.reduce((sum, r) => sum + bankablePokedollars(r.state as unknown as RunState), 0);
    if (unbanked.length) {
      await tx.run.updateMany({ where: { id: { in: unbanked.map((r) => r.id) } }, data: { banked: true } });
      await tx.user.update({ where: { id: userId }, data: { bank: { increment: total } } });
    }
    const seed = newSeed();
    // The consumables used from the Inventory between runs all take effect now, among this run's 3.
    const { pendingConsumables } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { pendingConsumables: true } });
    const state = withConsumablesBefore(createRun(type, deck.cards, seed, deck.name), pendingConsumables);
    if (pendingConsumables.length) await tx.user.update({ where: { id: userId }, data: { pendingConsumables: [] } });
    const run = await tx.run.create({ data: { ownerId: userId, type, seed, state: asJson(state), version: state.version }, select: { id: true } });
    await syncRunDeck(userId, run.id, state.deck, tx);
    return run;
  });
}
