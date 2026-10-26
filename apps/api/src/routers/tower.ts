import { BP_PACK_PRICE, towerGameId } from '@poke-tcg/campaign';
import { prisma } from '@poke-tcg/db';
import { startTowerInput, towerActInput, towerIdInput } from '@poke-tcg/shared';
import { TRPCError } from '@trpc/server';
import { unlocksAll } from '../debugFlags.js';
import { debugWinGame } from '../games.js';
import { advanceTower, clientTower, latestTower, loadOwnTower, settleTowerBattle, startTower, towerStarts } from '../towers.js';
import { debugProcedure, protectedProcedure, router } from '../trpc.js';

/** The Battle Tower (README: Battle Tower): the account's challenge, starting one, and the attendant's choices. */
export const towerRouter = router({
  /**
   * The Battle Tower's desk: the account's latest challenge (under way, saved or over, with its battle settled if it just
   * ended), the highest floor beaten, the floors a new challenge can start on, the account's Battle Points and the BP
   * Shop's price for a pack (BP_PACK_PRICE; it opens them with `packs.open`). The decks come from `run.overview`.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const tower = await latestTower(ctx.user.id);
    // Read after settling: a battle just won may have raised it.
    const { towerBest: best, bp } = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { towerBest: true, bp: true } });
    return { challenge: tower && (await clientTower(tower)), best, startFloors: towerStarts(best, await unlocksAll(ctx.user.id)), bp, packPrice: BP_PACK_PRICE };
  }),

  /** Starts a new challenge (startTower: a saved one is given up). */
  start: protectedProcedure.input(startTowerInput).mutation(async ({ ctx, input }) => clientTower(await startTower(ctx.user.id, input.deckId, input.startFloor))),

  /** The attendant's or receptionist's choice (go on, save and stop, take up again, give up). Going on starts the battle. */
  act: protectedProcedure.input(towerActInput).mutation(async ({ ctx, input }) => {
    const tower = await loadOwnTower(input.towerId, ctx.user.id);
    if (tower.version !== input.expectedVersion) throw new TRPCError({ code: 'CONFLICT', message: 'Challenge changed, refresh and retry' });
    return clientTower(await advanceTower(tower, [input.action]));
  }),

  /**
   * Debug (a debugProcedure, refused in production): lets the next opponent in like `act` with CONTINUE, then wins the game
   * at once and settles it as skipped: no BP.
   */
  debugSkipBattle: debugProcedure.input(towerIdInput).mutation(async ({ ctx, input }) => {
    const tower = await loadOwnTower(input.towerId, ctx.user.id);
    const going = await advanceTower(tower, [{ type: 'CONTINUE' }]);
    await debugWinGame(towerGameId(going.state));
    return clientTower(await settleTowerBattle(going, true));
  }),
});
