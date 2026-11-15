// The hosted-database guard (issue #204): anything that writes to the database in bulk (the seed, the local Supabase's set-up)
// refuses a connection string that isn't the local Supabase's unless the run opts in with `--remote` or ALLOW_HOSTED_DB=1.
// CLAUDE.md's "run `pnpm db:local` first" rule used to be enforced only by memory: a `.env` still pointing at the hosted project
// made `pnpm db:seed` run against it. Pure functions, so scripts/supabase-env.mjs, packages/db/prisma/seed.ts and a test
// (apps/api/src/local-guard.test.ts) share them; they never read `.env` and never print a connection string's password.

/** Whether a database URL points at this machine (the local Supabase's 127.0.0.1 or localhost). An unreadable or missing URL isn't. */
export function isLocalUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The host of a database URL for an error message (never its user or password), or "an unreadable URL". */
export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'an unreadable URL';
  }
}

/**
 * Throws unless every database URL in `env` (DATABASE_URL, DIRECT_URL) that is set is local, or the run opted in to the hosted
 * project: `--remote` among `argv`, or ALLOW_HOSTED_DB=1 in `env`. `env` and `argv` default to the process's.
 */
export function assertLocalDatabase(env = process.env, argv = process.argv) {
  const hosted = ['DATABASE_URL', 'DIRECT_URL'].filter((key) => env[key] && !isLocalUrl(env[key]));
  if (!hosted.length || argv.includes('--remote') || env.ALLOW_HOSTED_DB === '1') return;
  throw new Error(
    `${hosted.map((key) => `${key} (${hostOf(env[key])})`).join(' and ')} is not the local Supabase. Run \`pnpm db:local\` first, or, to really use the hosted project, pass --remote or set ALLOW_HOSTED_DB=1.`,
  );
}
