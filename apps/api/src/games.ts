// What saving games, runs and Battle Tower challenges share (routers/game.ts, runs.ts, towers.ts): the cast for Prisma's
// JSON columns, a new seed, the action log rows of a game, a game's state as it's saved and loaded (without its card
// library), and debug's Skip battle.
import { prisma, saveGameState, type Prisma } from '@poke-tcg/db';
import { applyDebug, type CardLibrary, type DebugCommand, type GameAction, type GameState } from '@poke-tcg/game-engine';
import { HUMAN_ID } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { loadCardLibrary } from './cards.js';

export const asJson = (value: unknown) => value as Prisma.InputJsonValue;

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * A game's state as it's saved (Game.state): without its card library (`cards`), with the library's card ids instead
 * (`libraryIds`). The library is the catalog's definitions of both decks' cards, some 11 KB of a 16 KB state, and was
 * read back and written again with every action (README: Performance); restoreState builds it again from the catalog.
 * Games saved before this hold their library in `cards` and are read as they are.
 */
export type StoredState = Omit<GameState, 'cards'> & { cards?: CardLibrary; libraryIds?: string[] };

/** The state to save: its library's card ids in place of the library. */
export function storedState(state: GameState): StoredState {
  const { cards, ...rest } = state;
  return { ...rest, libraryIds: Object.keys(cards) };
}

/** A saved state as the engine takes it: its library built again from the catalog (the same definitions createGame was given). */
export async function restoreState(stored: StoredState): Promise<GameState> {
  if (stored.cards) return stored as GameState;
  const { libraryIds = [], ...rest } = stored;
  return { ...rest, cards: await loadCardLibrary(libraryIds) };
}

/** The saved game, its state restored (restoreState), or null when there's none. */
export async function loadGame(gameId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  return game && { ...game, state: await restoreState(game.state as unknown as StoredState) };
}

/** Log rows for a sequence of actions that ended at `finalVersion`. */
export function actionRows(entries: { playerId: string; action: GameAction }[], finalVersion: number) {
  const first = finalVersion - entries.length + 1;
  return entries.map((e, i) => ({ playerId: e.playerId, version: first + i, action: asJson(e.action) }));
}

/**
 * Debug's Skip battle (only from a debugProcedure): wins the game at once with the WIN debug command, saved as a DEBUG
 * action row. The caller then settles the battle as skipped (no ₱, EXP or card reward).
 */
export async function debugWinGame(gameId: string | null) {
  const game = gameId ? await loadGame(gameId) : null;
  if (!game) throw new TRPCError({ code: 'BAD_REQUEST', message: 'The battle did not start' });
  const command: DebugCommand = { type: 'WIN' };
  const result = applyDebug(game.state, HUMAN_ID, command);
  if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
  const next = result.state;
  const saved = await saveGameState({
    gameId: game.id,
    expectedVersion: game.version,
    state: storedState(next),
    version: next.version,
    status: 'FINISHED',
    winner: next.winner,
    actions: [{ playerId: HUMAN_ID, version: next.version, action: asJson({ type: 'DEBUG', command }) }],
  });
  if (!saved) throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });
}
