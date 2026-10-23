import { cardsRouter } from './routers/cards.js';
import { communityRouter } from './routers/community.js';
import { cosmeticsRouter } from './routers/cosmetics.js';
import { debugRouter } from './routers/debug.js';
import { decksRouter } from './routers/decks.js';
import { gameRouter } from './routers/game.js';
import { packsRouter } from './routers/packs.js';
import { runRouter } from './routers/run.js';
import { protectedProcedure, publicProcedure, router } from './trpc.js';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  cards: cardsRouter,
  decks: decksRouter,
  community: communityRouter,
  game: gameRouter,
  run: runRouter,
  packs: packsRouter,
  cosmetics: cosmeticsRouter,
  debug: debugRouter,
});

export type AppRouter = typeof appRouter;
