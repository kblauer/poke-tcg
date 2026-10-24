import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { verifyToken } from './auth.js';
import { appRouter } from './router.js';

export const app = new Hono().basePath('/api');

app.use(logger());

app.get('/health', (c) => c.json({ ok: true }));

// The card catalog (cards.list) is the same for everyone and only changes with the seed: browsers and the CDN may keep it
// for an hour. Only when it's asked for on its own (a batch with other, per-user procedures has another path): the web
// app's tRPC client sends it through its own link (splitLink, apps/web/src/lib/trpc.ts).
app.use('/trpc/cards.list', async (c, next) => {
  await next();
  if (c.req.method === 'GET' && c.res.ok) c.res.headers.set('Cache-Control', 'public, max-age=3600');
});

app.use(
  '/trpc/*',
  trpcServer({
    endpoint: '/api/trpc',
    router: appRouter,
    createContext: async (_opts, c) => ({ user: await verifyToken(c.req.header('authorization')) }),
  }),
);

export default app;
