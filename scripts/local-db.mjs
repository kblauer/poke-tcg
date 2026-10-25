// `pnpm db:local`: points this checkout's `.env` at a local Supabase (Docker) instead of the hosted project, so scripts and
// tools that read `.env` (Prisma Studio, the seed, throwaway `_*.tmp.ts` checks) use it too. `pnpm dev` doesn't need it:
// it asks which database to run on (local by default) and passes the choice to the servers. Starts the stack, migrates and
// seeds it (scripts/supabase-env.mjs), saves the hosted values to `.env.remote` the first time, and rewrites `.env`'s
// database and Supabase lines. `pnpm db:local --remote` puts `.env.remote` back.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { envValue, isLocalUrl, localEnv, localSupabasePorts, readText, reservedPorts, reservedPortsHelp } from './supabase-env.mjs';

const root = process.cwd();
const envPath = path.join(root, '.env');
const remotePath = path.join(root, '.env.remote');

if (process.argv.includes('--remote')) {
  if (!existsSync(remotePath)) throw new Error('No .env.remote to restore');
  copyFileSync(remotePath, envPath);
  console.log('.env points at the hosted Supabase project again (from .env.remote).');
  process.exit(0);
}

const conflicts = reservedPorts(localSupabasePorts(root));
if (conflicts.length) {
  console.error(reservedPortsHelp(conflicts));
  process.exit(1);
}

let text = readText(envPath) || readText(path.join(root, '.env.example'));
const url = envValue(text, 'DATABASE_URL');
if (url && !isLocalUrl(url) && !existsSync(remotePath)) {
  copyFileSync(envPath, remotePath);
  console.log('Saved the hosted values to .env.remote (`pnpm db:local --remote` puts them back).');
}

for (const [key, v] of Object.entries(await localEnv(root))) {
  const line = `${key}="${v}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
}
writeFileSync(envPath, text);
console.log('.env now points at the local Supabase.');
