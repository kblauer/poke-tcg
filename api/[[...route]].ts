// Vercel Function entry: serves the Hono app (apps/api) for every /api/* request.
import { app } from '@poke-tcg/api';
import { handle } from '@hono/vercel';

export default handle(app);
