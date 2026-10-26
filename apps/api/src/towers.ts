// Battle Tower challenges on the server (README: Battle Tower): starting one, saving its states, starting its battles and
// settling them, as runs.ts does for runs. Each win's Battle Points go to the account at once (User.bp, spent in the BP
// Shop), and the highest floor beaten (User.towerBest) gives later challenges their start floors.
import {
  applyTowerAction,
  createTower,
  floorsBeaten,
  startFloors,
  TOP_FLOOR,
  towerBattleSetup,
  towerGameId,
  towerOpponentDeck,
  towerGeneration,
  towerNeedsBattle,
  towerView,
  type TowerAction,
  type TowerState,
  type TowerSystemAction,
} from '@poke-tcg/campaign';
import { prisma, type Prisma, type TowerChallenge } from '@poke-tcg/db';
import { createGame, runCpu } from '@poke-tcg/game-engine';
import { CPU_ID, HUMAN_ID } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { loadCardLibrary } from './cards.js';
import { unlocksAll } from './debugFlags.js';
import { actionRows, asJson, newSeed } from './games.js';
import { cardPool } from './pool.js';
import { battleOverAction, lockUser } from './runs.js';
import { markPlayed, playableDeck, type DeckCosmetics } from './routers/decks.js';

/** The floors a challenge can start on (startFloors): from the highest floor beaten, or every checkpoint's with the debug switch to unlock everything (`all`, unlocksAll). */
export const towerStarts = (best: number, all: boolean) => startFloors(all ? TOP_FLOOR : best);

export type LoadedTower = Omit<TowerChallenge, 'state'> & { state: TowerState };
const loaded = (tower: TowerChallenge): LoadedTower => ({ ...tower, state: tower.state as unknown as TowerState });

type Db = Prisma.TransactionClient | typeof prisma;

/** The challenge's status column for its state. */
const statusOf = (state: TowerState) => (state.phase === 'won' ? 'WON' : state.phase === 'lost' ? 'LOST' : 'ACTIVE');

export async function loadOwnTower(towerId: string, userId: string): Promise<LoadedTower> {
  const tower = await prisma.towerChallenge.findUnique({ where: { id: towerId } });
  // Same error for "missing" and "not yours" so ids can't be probed.
  if (!tower || tower.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Challenge not found' });
  return loaded(tower);
}

/** The account's latest challenge (under way, saved or over), with its battle settled if it just ended. */
export async function latestTower(userId: string): Promise<LoadedTower | null> {
  const tower = await prisma.towerChallenge.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  return tower && settleTowerBattle(loaded(tower));
}

/**
 * Refuses (BAD_REQUEST) while a challenge is under way and not saved: the Play tab stays on it until it's saved with the
 * attendant or over (the user's), so no run or Training battle starts meanwhile.
 */
export async function towerUnderway(userId: string, db: Db = prisma) {
  const active = await db.towerChallenge.findFirst({ where: { ownerId: userId, status: 'ACTIVE' }, select: { state: true } });
  if (active && !(active.state as unknown as TowerState).saved) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Save or finish your Battle Tower challenge first' });
  }
}

/**
 * Applies actions to a challenge and saves it, if nobody else changed it meanwhile (CONFLICT otherwise). When it asks for
 * a battle, starts the game and records it; a win's BP go to the account and its floor to User.towerBest.
 */
export async function advanceTower(tower: LoadedTower, actions: (TowerAction | TowerSystemAction)[]): Promise<LoadedTower> {
  let state = tower.state;
  for (const action of actions) {
    const result = applyTowerAction(state, action);
    if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
    state = result.state;
  }
  let gameId: string | null = null;
  if (towerNeedsBattle(state)) {
    gameId = await startTowerBattle(tower, state);
    const started = applyTowerAction(state, { type: 'BATTLE_STARTED', gameId });
    // The challenge just asked for the battle, so this can't fail: a server-side inconsistency if it does.
    if (!started.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: started.error });
    state = started.state;
  }

  const status = statusOf(state);
  const bp = state.bp - tower.state.bp;
  const best = floorsBeaten(state);
  const saved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.towerChallenge.updateMany({ where: { id: tower.id, version: tower.version }, data: { state: asJson(state), version: state.version, status } });
    if (count === 0) return false;
    if (bp) await tx.user.update({ where: { id: tower.ownerId }, data: { bp: { increment: bp } } });
    if (best) await tx.user.updateMany({ where: { id: tower.ownerId, towerBest: { lt: best } }, data: { towerBest: best } });
    return true;
  });
  if (!saved) {
    // The battle game started for this attempt is orphaned; remove it.
    if (gameId) await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
    throw new TRPCError({ code: 'CONFLICT', message: 'Challenge changed, refresh and retry' });
  }
  return { ...tower, state, version: state.version, status };
}

/** Creates the battle's game: the challenge's deck against the floor's opponent (towerBattleSetup), with the deck's cosmetics. */
async function startTowerBattle(tower: LoadedTower, state: TowerState): Promise<string> {
  const setup = towerBattleSetup(state, await cardPool(towerGeneration(state.floor)));
  const library = await loadCardLibrary([...state.deck, ...setup.deck]);
  const seed = newSeed();
  const initial = createGame({ id: HUMAN_ID, deck: state.deck }, { id: CPU_ID, deck: setup.deck }, seed, library, setup.rules);
  initial.cpuDifficulty = setup.difficulty;
  initial.opponentName = setup.opponent;
  // The CPU picks its active right away, so the game is waiting on the player.
  const { state: game, actions } = runCpu(initial, CPU_ID);
  const cosmetics = tower.cosmetics as DeckCosmetics | null;
  const created = await prisma.game.create({
    data: {
      ownerId: tower.ownerId,
      towerId: tower.id,
      seed,
      ...(cosmetics && { cosmetics }),
      state: asJson(game),
      version: game.version,
      actions: { create: actionRows(actions.map((action) => ({ playerId: CPU_ID, action })), game.version) },
    },
    select: { id: true },
  });
  return created.id;
}

/** If the challenge's battle has finished, records the result (as a run's: settleBattle), conceded or skipped by debug. */
export async function settleTowerBattle(tower: LoadedTower, skipped = false): Promise<LoadedTower> {
  const gameId = towerGameId(tower.state);
  if (!gameId) return tower;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { status: true, winner: true } });
  if (!game || game.status !== 'FINISHED') return tower;
  const concedes = await prisma.gameAction.count({ where: { gameId, playerId: HUMAN_ID, action: { path: ['type'], equals: 'CONCEDE' } } });
  try {
    return await advanceTower(tower, [battleOverAction(gameId, game.winner, concedes, skipped) as TowerSystemAction]);
  } catch (error) {
    // Settled by another request first: reload.
    if (error instanceof TRPCError && error.code === 'CONFLICT') return loaded(await prisma.towerChallenge.findUniqueOrThrow({ where: { id: tower.id } }));
    throw error;
  }
}

/**
 * Starts a new challenge with one of the account's decks (playable, not the automatic run deck: its copy is kept in the
 * challenge alone) on `startFloor`, which must be 1 or the floor after a checkpoint reached (startFloors). Not while one
 * is under way; a saved one is given up (the receptionist asks first).
 */
export async function startTower(userId: string, deckId: string, startFloor: number) {
  const deck = await playableDeck(deckId, userId);
  if (deck.runDeck) throw new TRPCError({ code: 'BAD_REQUEST', message: "Start a challenge with one of your own decks (save the run's deck first)" });
  const started = await prisma.$transaction(async (tx) => {
    // The lock makes the checks below hold against two starts at once.
    await lockUser(tx, userId);
    const { towerBest } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { towerBest: true } });
    if (!towerStarts(towerBest, await unlocksAll(userId, tx)).includes(startFloor)) throw new TRPCError({ code: 'BAD_REQUEST', message: `A challenge can't start on floor ${startFloor} yet` });
    const active = await tx.towerChallenge.findFirst({ where: { ownerId: userId, status: 'ACTIVE' } });
    if (active) {
      const state = active.state as unknown as TowerState;
      if (!state.saved) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Finish your current challenge first' });
      const quit = applyTowerAction(state, { type: 'QUIT' });
      if (!quit.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: quit.error });
      await tx.towerChallenge.update({ where: { id: active.id }, data: { state: asJson(quit.state), version: quit.state.version, status: statusOf(quit.state) } });
    }
    const seed = newSeed();
    const state = createTower(deck.cards, seed, startFloor, deck.name);
    return tx.towerChallenge.create({ data: { ownerId: userId, seed, deckId, cosmetics: deck.cosmetics, state: asJson(state), version: state.version } });
  });
  await markPlayed(userId, deckId);
  return loaded(started);
}

/**
 * What the client gets for a challenge: its view (no RNG or deck seeds), the battle under way, and while it's on its
 * opponent's deck (`opponentDeck`, card ids, and its themed name, `opponentDeckName`: the VS banner's, the user's), made
 * again from its seed as the battle's was (towerOpponentDeck), so it's the very deck being faced.
 */
export async function clientTower(tower: LoadedTower) {
  const s = tower.state;
  const opponent = s.phase === 'battle' && s.opponent ? towerOpponentDeck(s, await cardPool(towerGeneration(s.floor))) : null;
  return { id: tower.id, status: tower.status, version: tower.version, gameId: towerGameId(s), view: towerView(s), opponentDeck: opponent?.deck ?? null, opponentDeckName: opponent?.name ?? null };
}
