// Vercel Function entry, bundled by scripts/vercel-build.mjs into the Build Output API layout.
import { getRequestListener } from '@hono/node-server';
import { app } from './app.js';

export default getRequestListener(app.fetch);
