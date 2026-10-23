import { TRPCError } from '@trpc/server';
import { boss, bossLabel, generateDeck, rngFrom, TRAINERS, trainerFavorites } from '@poke-tcg/campaign';
import { prisma, saveGameState } from '@poke-tcg/db';
import { applyAction, createGame, getPlayerView, moveHighlights, runCpu, type CpuDifficulty, type GameAction, type GameState } from '@poke-tcg/game-engine';
import { CPU_ID, HUMAN_ID, gameIdInput, singleBattleInput, submitActionInput, type SingleBattleInput, type SingleBattleOpponent } from '@poke-tcg/shared';
import { ensureUser } from '../auth.js';
import { loadCardLibrary } from '../cards.js';
import { actionRows, asJson, newSeed } from '../games.js';
import { cardPool } from '../pool.js';
import { loadOwnRun, settleBattle } from '../runs.js';
import { PLAYER_TEST_DECK, expandDeck } from '../test-decks.js';
import type { AuthUser } from '../auth.js';
import { protectedProcedure, router } from '../trpc.js';
import { markPlayed, playableDeck, type DeckCosmetics } from './decks.js';

/**
 * The CPU's reply to the player's action. If the CPU throws (an engine bug on a position it can't handle), nothing is lost:
 * the error is logged and the CPU concedes instead, so the game is saved whole and can be finished, rather than the
 * player's every legal action failing the same way with no way out but conceding themselves.
 */
function cpuTurn(state: GameState): ReturnType<typeof runCpu> {
  try {
    return runCpu(state, CPU_ID);
  } catch (error) {
    console.error('CPU failed to play; conceding', error);
    const action: GameAction = { type: 'CONCEDE' };
    const result = applyAction(state, CPU_ID, action);
    if (!result.ok) throw error;
    return { state: result.state, actions: [action], states: [result.state] };
  }
}

/** The player's view after a CPU move, with the card the move shows (a Trainer shuffled away is no longer in sight). */
function shownView(state: GameState, defId: string | null | undefined) {
  const view = getPlayerView(state, HUMAN_ID);
  if (defId) view.cards[defId] = state.cards[defId]!;
  return view;
}

export async function loadOwnGame(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  // Same error for "missing" and "not yours" so ids can't be probed.
  if (!game || game.ownerId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game not found' });
  return { ...game, state: game.state as unknown as GameState };
}

/** The CPU's side of a single battle: a boss's own deck, or a random trainer with a random deck suiting their name, as on a run's map. */
async function opponentSetup(opponent: SingleBattleOpponent, difficulty: CpuDifficulty): Promise<{ name: string; deck: string[] }> {
  if (opponent.kind === 'boss') {
    const b = boss(opponent.bossId);
    return { name: bossLabel(b), deck: expandDeck(b.deck) };
  }
  const name = TRAINERS[Math.floor(Math.random() * TRAINERS.length)]!;
  // The Passive CPU plays no Trainers anyway: it gets the Trainer CPU's deck.
  return { name, deck: generateDeck(await cardPool(), rngFrom(newSeed()), { favorites: trainerFavorites(name), difficulty: difficulty === 'gymLeader' ? 'gymLeader' : 'trainer' }) };
}

/**
 * Starts a single battle: `playerDeck` (one card id per card) against the chosen opponent at the chosen difficulty, using
 * cards from the catalog, with the deck's `cosmetics` (none for the test deck).
 */
async function startGame(user: AuthUser, playerDeck: string[], { difficulty, opponent }: Omit<SingleBattleInput, 'deckId'>, cosmetics: DeckCosmetics | null) {
  const cpu = await opponentSetup(opponent, difficulty);
  const [library] = await Promise.all([loadCardLibrary([...playerDeck, ...cpu.deck]), ensureUser(user)]);
  const seed = newSeed();
  const initial = createGame({ id: HUMAN_ID, deck: playerDeck }, { id: CPU_ID, deck: cpu.deck }, seed, library);
  initial.cpuDifficulty = difficulty;
  initial.opponentName = cpu.name;
  // The CPU picks its active right away, so the game is waiting on the player.
  const { state, actions } = runCpu(initial, CPU_ID);

  return prisma.game.create({
    data: {
      ownerId: user.id,
      seed,
      state: asJson(state),
      ...(cosmetics && { cosmetics }),
      version: state.version,
      actions: { create: actionRows(actions.map((action) => ({ playerId: CPU_ID, action })), state.version) },
    },
    select: { id: true },
  });
}

export const gameRouter = router({
  /**
   * Starts a single battle with one of the player's decks, which must follow the deck rules and hold only unlocked
   * cards, or with the test deck (`deckId` null).
   */
  create: protectedProcedure.input(singleBattleInput).mutation(async ({ ctx, input }) => {
    const deck = input.deckId === null ? null : await playableDeck(input.deckId, ctx.user.id);
    const game = await startGame(ctx.user, deck?.cards ?? expandDeck(PLAYER_TEST_DECK), input, deck?.cosmetics ?? null);
    if (input.deckId !== null) await markPlayed(ctx.user.id, input.deckId);
    return game;
  }),

  /**
   * The player's filtered view of the game – never the raw state – the opponent's name, for a run's battle the run, and
   * its deck's cosmetics (each null, or the whole thing, for the account's).
   */
  view: protectedProcedure.input(gameIdInput).query(async ({ ctx, input }) => {
    const game = await loadOwnGame(input.gameId, ctx.user.id);
    const encounter = game.runId ? (await loadOwnRun(game.runId, ctx.user.id)).state.encounter : null;
    const runOpponent = encounter && 'trainer' in encounter && 'gameId' in encounter && encounter.gameId === game.id ? encounter.trainer : null;
    const opponent = runOpponent ?? game.state.opponentName ?? null;
    return { id: game.id, status: game.status, runId: game.runId, opponent, cosmetics: game.cosmetics as DeckCosmetics | null, view: getPlayerView(game.state, HUMAN_ID) };
  }),

  /**
   * Validates the player's action with the engine, then lets the CPU respond,
   * and persists everything in one write. The server is the only authority.
   * Returns the player's view after each move (theirs first, then each of the CPU's), so the
   * client can show the CPU's moves one at a time; the last frame is the current view.
   */
  act: protectedProcedure.input(submitActionInput).mutation(async ({ ctx, input }) => {
    const game = await loadOwnGame(input.gameId, ctx.user.id);
    if (game.status !== 'ACTIVE') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Game is over' });
    if (game.version !== input.expectedVersion) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });
    }

    const result = applyAction(game.state, HUMAN_ID, input.action);
    if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
    const cpu = cpuTurn(result.state);
    const next = cpu.state;
    const log = [
      { playerId: HUMAN_ID, action: input.action },
      ...cpu.actions.map((action) => ({ playerId: CPU_ID, action })),
    ];

    // One round trip. Optimistic concurrency: only writes if the game wasn't advanced meanwhile (e.g. another tab).
    const saved = await saveGameState({
      gameId: game.id,
      expectedVersion: game.version,
      state: next,
      version: next.version,
      status: next.phase === 'finished' ? 'FINISHED' : 'ACTIVE',
      winner: next.winner,
      actions: actionRows(log, next.version),
    });
    if (!saved) throw new TRPCError({ code: 'CONFLICT', message: 'Game state changed, refresh and retry' });
    // A run's battle that just ended: the run records the result now (a reward, or 1 HP lost).
    if (next.phase === 'finished' && game.runId) await settleBattle(await loadOwnRun(game.runId, ctx.user.id));

    // Each of the CPU's moves comes with the card it played or used and the Pokémon it changed, for the board to show.
    const highlights = moveHighlights(result.state, CPU_ID, cpu.actions, cpu.states);
    const frames = [
      { player: HUMAN_ID, type: input.action.type, view: getPlayerView(result.state, HUMAN_ID), highlight: null },
      ...cpu.actions.map((action, i) => ({ player: CPU_ID, type: action.type, view: shownView(cpu.states[i]!, highlights[i]?.defId), highlight: highlights[i] ?? null })),
    ];
    return { frames };
  }),
});
