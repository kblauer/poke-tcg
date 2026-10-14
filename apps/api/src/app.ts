import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { verifyToken } from './auth.js';
import { appRouter } from './router.js';

export const app = new Hono().basePath('/api');

app.use(logger());

app.get('/health', (c) => c.json({ ok: true }));

app.use(
  '/trpc/*',
  trpcServer({
    endpoint: '/api/trpc',
    router: appRouter,
    createContext: async (_opts, c) => ({ user: await verifyToken(c.req.header('authorization')) }),
  }),
);

export default app;
