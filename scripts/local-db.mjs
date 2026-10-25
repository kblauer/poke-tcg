// `pnpm db:local`: points this checkout's dev servers at a local Supabase (Docker) instead of the hosted project, so dev servers, worktrees and
// review jobs don't spend the hosted database's egress (every API restart reloads the whole card catalog). Starts the stack (`supabase start`),
// saves the hosted values to `.env.remote` the first time, rewrites `.env`'s database and Supabase lines with the local ones, applies the
// migrations and seeds the catalog when it's empty. `pnpm db:local --remote` puts `.env.remote` back. Worktrees copy the main checkout's `.env`
// (scripts/dev.mjs), so they follow it; every checkout shares the one local stack.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env');
const remotePath = path.join(root, '.env.remote');
const shell = process.platform === 'win32';

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const value = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"(.*)"$/, '$1') ?? '';
const isLocal = (url) => /@(127\.0\.0\.1|localhost):/.test(url);

if (process.argv.includes('--remote')) {
  if (!existsSync(remotePath)) throw new Error('No .env.remote to restore');
  copyFileSync(remotePath, envPath);
  console.log('.env points at the hosted Supabase project again (from .env.remote).');
  process.exit(0);
}

let text = read(envPath) || read(path.join(root, '.env.example'));
if (!isLocal(value(text, 'DATABASE_URL')) && value(text, 'DATABASE_URL') && !existsSync(remotePath)) {
  copyFileSync(envPath, remotePath);
  console.log('Saved the hosted values to .env.remote (`pnpm db:local --remote` puts them back).');
}

// Only the Google client goes to the CLI: never load the hosted DATABASE_URL into this process, or the migrations below could run against it.
const google = ['SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID', 'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET'];
const cliEnv = { ...process.env, ...Object.fromEntries(google.map((k) => [k, value(text, k)])) };
const started = spawnSync('npx', ['supabase', 'start'], { cwd: root, stdio: 'inherit', env: cliEnv, shell });
if (started.status) process.exit(started.status);
const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { cwd: root, env: cliEnv, shell, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));

// The local stack signs user tokens with ES256 and serves a JWKS, so SUPABASE_JWT_SECRET stays empty (auth.ts checks the JWKS).
const local = {
  DATABASE_URL: status.DB_URL,
  DIRECT_URL: status.DB_URL,
  SUPABASE_URL: status.API_URL,
  SUPABASE_JWT_SECRET: '',
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
};
for (const [key, v] of Object.entries(local)) {
  const line = `${key}="${v}"`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text.trimEnd()}\n${line}\n`;
}
writeFileSync(envPath, text);
console.log(`.env now points at the local Supabase (${status.API_URL}, Studio ${status.STUDIO_URL}).`);

const dbEnv = { ...process.env, DATABASE_URL: status.DB_URL, DIRECT_URL: status.DB_URL };
const run = (args) => {
  const r = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: dbEnv, shell });
  if (r.status) process.exit(r.status);
};
run(['--filter', '@poke-tcg/db', 'migrate:deploy']);
run(['--filter', '@poke-tcg/db', 'generate']); // the client is gitignored: a new worktree has none for the seed

const container = `supabase_db_${read(path.join(root, 'supabase', 'config.toml')).match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? path.basename(root)}`;
const cards = Number(execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-tAc', 'select count(*) from "Card"'], { encoding: 'utf8' }).trim());
if (cards) console.log(`The local catalog has ${cards} cards: not re-seeding (\`pnpm db:seed\` does it).`);
else run(['--filter', '@poke-tcg/db', 'seed']);
