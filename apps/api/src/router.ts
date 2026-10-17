import { cardsRouter } from './routers/cards.js';
import { debugRouter } from './routers/debug.js';
import { decksRouter } from './routers/decks.js';
import { gameRouter } from './routers/game.js';
import { protectedProcedure, publicProcedure, router } from './trpc.js';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  cards: cardsRouter,
  decks: decksRouter,
  game: gameRouter,
  debug: debugRouter,
});

export type AppRouter = typeof appRouter;
