// The database and Supabase settings the dev servers run with, shared by `pnpm dev` (scripts/dev.mjs) and `pnpm db:local`
// (scripts/local-db.mjs): the local Supabase (Docker), started, migrated and seeded when it's empty, or the hosted project's
// values (`.env.remote`, or `.env` itself while it still points at the hosted project).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const shell = process.platform === 'win32';

export const readText = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
export const envValue = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"(.*)"$/, '$1') ?? '';
export const isLocalUrl = (url) => /@(127\.0\.0\.1|localhost):/.test(url);

/** The settings that say which database and Supabase the servers use: everything else in `.env` is the same either way. */
export const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_JWT_SECRET', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

/** The hosted project's settings for the checkout `root`, or null when it has none. */
export function hostedEnv(root) {
  for (const file of ['.env.remote', '.env']) {
    const text = readText(path.join(root, file));
    const url = envValue(text, 'DATABASE_URL');
    if (url && !isLocalUrl(url)) return Object.fromEntries(DB_KEYS.map((k) => [k, envValue(text, k)]));
  }
  return null;
}

/** The local Supabase's ports: every `port` of a section of supabase/config.toml that isn't `enabled = false`. */
export const localSupabasePorts = (root) =>
  readText(path.join(root, 'supabase', 'config.toml'))
    .split(/^\[/m)
    .filter((section) => !/^enabled\s*=\s*false/m.test(section))
    .flatMap((section) => [...section.matchAll(/^port\s*=\s*(\d+)/gm)].map((m) => Number(m[1])));

/**
 * The ports Windows has reserved (`netsh … show excludedportrange`) that the dev servers need: with Hyper-V or WSL on (Docker Desktop
 * turns them on), WinNAT reserves blocks of the dynamic port range at each boot, and a reserved port can't be listened on (Vite's
 * `listen EACCES`). Empty elsewhere, and when netsh can't be read.
 */
export function reservedPorts(ports) {
  if (process.platform !== 'win32') return [];
  const ranges = [];
  for (const ip of ['ipv4', 'ipv6']) {
    try {
      const out = execFileSync('netsh', ['interface', ip, 'show', 'excludedportrange', 'protocol=tcp'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const m of out.matchAll(/^\s*(\d+)\s+(\d+)/gm)) ranges.push([Number(m[1]), Number(m[2])]);
    } catch {
      // No netsh: nothing to check.
    }
  }
  return ports.filter((port) => ranges.some(([start, end]) => port >= start && port <= end)).map((port) => ({ port, range: ranges.find(([start, end]) => port >= start && port <= end) }));
}

/**
 * What to tell the developer about reserved ports, with the fix (an administrator PowerShell). A port under 49152 is only reserved
 * when the machine's dynamic range was moved down from Windows' default (49152–65535): put it back. A reserved port in the default
 * range (the local Supabase's 5432x) is WinNAT's pick of the day: restarting it picks other blocks.
 */
export const reservedPortsHelp = (conflicts) => [
  `Windows has reserved port${conflicts.length > 1 ? 's' : ''} the dev servers need: ${conflicts.map(({ port, range }) => `${port} (in ${range[0]}–${range[1]})`).join(', ')}.`,
  'Hyper-V/WSL (on with Docker Desktop) reserves blocks of the dynamic port range at each boot, and a reserved port can\'t be listened on.',
  ...(conflicts.some(({ port }) => port < 49152)
    ? [
        'This machine\'s dynamic range starts below the default 49152 (`netsh int ipv4 show dynamicport tcp`). Fix, once, in an administrator PowerShell',
        '(quit Docker Desktop first, or reboot after the two netsh lines):',
        '  netsh int ipv4 set dynamic tcp start=49152 num=16384',
        '  netsh int ipv6 set dynamic tcp start=49152 num=16384',
        '  net stop winnat',
        '  net start winnat',
      ]
    : ['Fix, in an administrator PowerShell (quit Docker Desktop first): `net stop winnat`, then `net start winnat`, which picks other blocks.']),
].join('\n');

/**
 * Runs a command; resolves to its stdout. `quiet` captures its output instead of showing it, and a failure's error carries
 * what it printed (`output`), for `pnpm dev`'s progress bar to show.
 */
const run = (cmd, args, root, env, quiet, useShell = shell) => new Promise((resolve, reject) => {
  // shell on Windows so it finds npx.cmd and pnpm.cmd, given one command line (Node warns about args with a shell).
  const child = spawn(useShell ? [cmd, ...args].join(' ') : cmd, useShell ? [] : args, { cwd: root, env, shell: useShell, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  let stdout = '';
  let output = '';
  child.stdout?.on('data', (d) => { stdout += d; output += d; });
  child.stderr?.on('data', (d) => { output += d; });
  child.on('error', reject);
  child.on('exit', (code) => (code ? reject(Object.assign(new Error(`${cmd} ${args.join(' ')} failed (exit ${code})`), { output })) : resolve(stdout)));
});

/**
 * Starts the local Supabase for the checkout `root` (a no-op when it's running; every checkout shares the one stack),
 * applies the checkout's migrations, seeds the catalog when it's empty, and returns the local settings.
 * `step(label)` is told as each part starts; `quiet` captures the commands' output (shown only when one fails).
 */
export async function localEnv(root, { step = () => {}, quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  // Only the Google client goes to the CLI: the hosted DATABASE_URL must never reach this process's children, or the migrations could run against it.
  const text = readText(path.join(root, '.env')) || readText(path.join(root, '.env.remote'));
  const google = ['SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID', 'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET'];
  const cliEnv = { ...process.env, ...Object.fromEntries(google.map((k) => [k, envValue(text, k)])) };
  step('Starting the local Supabase');
  await run('npx', ['supabase', 'start'], root, cliEnv, quiet);
  step('Reading its settings');
  const status = JSON.parse(await run('npx', ['supabase', 'status', '-o', 'json'], root, cliEnv, true));
  // The local stack signs user tokens with ES256 and serves a JWKS, so SUPABASE_JWT_SECRET stays empty (auth.ts checks the JWKS).
  const local = { DATABASE_URL: status.DB_URL, DIRECT_URL: status.DB_URL, SUPABASE_URL: status.API_URL, SUPABASE_JWT_SECRET: '', VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY };

  const dbEnv = { ...process.env, ...local };
  step('Applying migrations');
  await run('pnpm', ['--filter', '@poke-tcg/db', 'migrate:deploy'], root, dbEnv, quiet);
  step('Generating the Prisma client');
  await run('pnpm', ['--filter', '@poke-tcg/db', 'generate'], root, dbEnv, quiet); // the client is gitignored: a new worktree has none for the seed
  step('Checking the catalog');
  const container = `supabase_db_${readText(path.join(root, 'supabase', 'config.toml')).match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? path.basename(root)}`;
  const cards = Number((await run('docker', ['exec', container, 'psql', '-U', 'postgres', '-tAc', 'select count(*) from "Card"'], root, process.env, true, false)).trim());
  if (cards) log(`The local catalog has ${cards} cards: not re-seeding (\`pnpm db:seed\` does it).`);
  else {
    step('Seeding the catalog (the first time only; takes a while)');
    await run('pnpm', ['--filter', '@poke-tcg/db', 'seed'], root, dbEnv, quiet);
  }
  log(`Local Supabase: ${status.API_URL} (Studio ${status.STUDIO_URL}).`);
  return local;
}
