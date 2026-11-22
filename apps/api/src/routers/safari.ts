import { safariActInput } from '@poke-tcg/shared';
import { actSafari, clientSafari, latestSafari, safariUnits, startSafari } from '../safari.js';
import { protectedProcedure, router } from '../trpc.js';

/** Safari Draft (README: Safari Draft): the account's run, the units it drafts from, starting a run and playing it. */
export const safariRouter = router({
  /** The account's latest run (under way or over), as its view. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const run = await latestSafari(ctx.user.id);
    return { run: run && clientSafari(run, await safariUnits()) };
  }),

  /** Every draft unit (one a Pokémon, #1–386, with its picture's card id): what the screen shows of a unit id. The same for every account. */
  units: protectedProcedure.query(() => safariUnits()),

  /** Starts a run (startSafari: not while one is under way). */
  start: protectedProcedure.mutation(async ({ ctx }) => clientSafari(await startSafari(ctx.user.id), await safariUnits())),

  /** A player's action on their run (actSafari: the version checked, a won run's ₱ banked once). */
  act: protectedProcedure.input(safariActInput).mutation(async ({ ctx, input }) => clientSafari(await actSafari(ctx.user.id, input.runId, input.expectedVersion, input.action), await safariUnits())),
});
