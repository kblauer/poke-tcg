import { cardsRouter } from './routers/cards.js';
import { communityRouter } from './routers/community.js';
import { cosmeticsRouter } from './routers/cosmetics.js';
import { debugRouter } from './routers/debug.js';
import { extrasRouter } from './routers/extras.js';
import { decksRouter } from './routers/decks.js';
import { gameRouter } from './routers/game.js';
import { idleRouter } from './routers/idle.js';
import { packsRouter } from './routers/packs.js';
import { runRouter } from './routers/run.js';
import { settingsRouter } from './routers/settings.js';
import { towerRouter } from './routers/tower.js';
import { protectedProcedure, publicProcedure, router } from './trpc.js';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  cards: cardsRouter,
  decks: decksRouter,
  community: communityRouter,
  game: gameRouter,
  run: runRouter,
  tower: towerRouter,
  idle: idleRouter,
  packs: packsRouter,
  cosmetics: cosmeticsRouter,
  settings: settingsRouter,
  extras: extrasRouter,
  debug: debugRouter,
});

export type AppRouter = typeof appRouter;
