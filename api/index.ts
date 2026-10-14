// Vercel Function entry: vercel.json rewrites every /api/* request here, and the Hono app
// (basePath /api) routes on the original URL.
import { app } from '@poke-tcg/api';
import { handle } from '@hono/vercel';

export default handle(app);
