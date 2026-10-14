// Local development server. On Vercel the same app is served by src/vercel.ts (see scripts/vercel-build.mjs).
import { config } from 'dotenv';
config({ path: '../../.env', quiet: true });

const { serve } = await import('@hono/node-server');
const { app } = await import('./app.js');

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`API listening on http://localhost:${port}/api`));
