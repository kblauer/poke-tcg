// `pnpm dev`: asks which checkout to run the dev servers from, the main one or one of its git worktrees (.claude/worktrees/), then runs that checkout's `turbo run dev`.
// Arrow keys (or a number) and Enter pick; Esc or Ctrl+C quits. `pnpm dev --here`, or a shell that isn't a terminal, skips the question and runs this checkout.
// A worktree with no .env gets a copy of the main checkout's (it's gitignored, so new worktrees have none); one with no node_modules gets `pnpm install` first.
// Then it asks which database to run on: the local Supabase (the default: started, migrated and seeded as needed) or the hosted project (`.env.remote`).
// `--local` or `--remote` skips that question; a shell that isn't a terminal gets the local one. The choice goes to the servers as environment variables,
// which win over `.env` (Node's --env-file, Vite and Prisma's dotenv never override them), so `.env` itself isn't changed.
// Starting up shows a progress bar instead of the usual logs (errors are shown as they come); once the servers are up, only the
// web link stays on screen, with a running list of errors labelled frontend or backend. `--verbose` shows every log instead.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { hostedEnv, localEnv, localSupabasePorts, reservedPorts, reservedPortsHelp } from './supabase-env.mjs';

const here = process.cwd();

const worktrees = () => {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  return out.split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
    const lines = block.split(/\r?\n/);
    const dir = path.resolve(lines.find((l) => l.startsWith('worktree '))?.slice(9) ?? '');
    const branch = lines.find((l) => l.startsWith('branch '))?.slice(7).replace('refs/heads/', '');
    return { dir, label: branch ?? (lines.includes('detached') ? '(detached HEAD)' : '(bare)'), bare: lines.includes('bare') };
  }).filter((w) => !w.bare && existsSync(w.dir));
};

const same = (a, b) => path.relative(a, b) === '';

const clearScreen = () => process.stdout.isTTY && process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

const pick = (question, choices, start) => new Promise((resolve) => {
  let index = start;
  const out = process.stdout;
  const draw = (first) => {
    if (!first) out.write(`\x1b[${choices.length}A`);
    choices.forEach((c, i) => out.write(`\x1b[2K${i === index ? '\x1b[33m❯' : ' '} ${i + 1}. ${c}\x1b[0m\n`));
  };
  out.write(`${question} (↑/↓ or a number, Enter; Esc quits)\n`);
  draw(true);
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const done = (value) => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.off('keypress', onKey);
    resolve(value);
  };
  const onKey = (str, key = {}) => {
    if ((key.ctrl && key.name === 'c') || key.name === 'escape' || key.name === 'q') return done(null);
    if (key.name === 'up' || key.name === 'k') index = (index + choices.length - 1) % choices.length;
    else if (key.name === 'down' || key.name === 'j') index = (index + 1) % choices.length;
    else if (key.name === 'return') return done(index);
    else if (/^[1-9]$/.test(str ?? '') && Number(str) <= choices.length) index = Number(str) - 1;
    else return;
    draw(false);
  };
  process.stdin.on('keypress', onKey);
});

// shell on Windows so it finds pnpm.cmd, given one command line (Node warns about args with a shell).
const command = (cmd, args) => (process.platform === 'win32' ? [[cmd, ...args].join(' '), []] : [cmd, args]);

const run = (cmd, args, cwd, env = process.env) => new Promise((resolve) => {
  const child = spawn(...command(cmd, args), { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
});

let dir = here;
const all = worktrees();
if (!process.argv.includes('--here') && process.stdin.isTTY && all.length > 1) {
  const main = all[0].dir;
  const choices = all.map((w) => {
    const name = same(w.dir, main) ? 'main checkout' : path.basename(w.dir);
    return `${name.padEnd(36)} ${w.label}${same(w.dir, here) ? '  (here)' : ''}`;
  });
  const chosen = await pick('Start the dev servers from which checkout?', choices, Math.max(0, all.findIndex((w) => same(w.dir, here))));
  if (chosen === null) process.exit(0);
  dir = all[chosen].dir;
  if (!existsSync(path.join(dir, '.env')) && existsSync(path.join(main, '.env'))) {
    copyFileSync(path.join(main, '.env'), path.join(dir, '.env'));
    console.log(`Copied .env from the main checkout into ${dir}`);
  }
  if (!existsSync(path.join(dir, 'node_modules'))) {
    console.log(`No node_modules in ${dir}: running pnpm install`);
    const code = await run('pnpm', ['install'], dir);
    if (code) process.exit(code);
  }
}

// The local database by default: each API restart reloads the whole catalog, which on the hosted project is egress.
const hosted = hostedEnv(dir);
let remote = process.argv.includes('--remote');
if (!remote && !process.argv.includes('--local') && process.stdin.isTTY) {
  const choices = ['local Supabase (Docker)', hosted ? 'hosted Supabase project (spends its egress)' : 'hosted Supabase project (none: no hosted values in .env.remote or .env)'];
  clearScreen(); // the checkout question gone, so this one is on top
  const chosen = await pick('Run on which database?', choices, 0);
  if (chosen === null) process.exit(0);
  remote = chosen === 1;
}
if (remote && !hosted) {
  console.error('No hosted Supabase values: put them in .env.remote (see .env.example).');
  process.exit(1);
}
if (!same(dir, here)) console.log(`Starting the dev servers in ${dir}\n`);

// From here on a progress bar stands in for the usual start-up logs, unless `--verbose` or the output isn't a terminal.
const quiet = process.stdout.isTTY && !process.argv.includes('--verbose');
const progress = (() => {
  const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  let label = '';
  let done = 0;
  let total = 1;
  let frame = 0;
  let timer = null;
  const draw = () => {
    if (!timer) return;
    const width = 24;
    const filled = Math.min(width, Math.round((done / total) * width));
    process.stdout.write(`\r\x1b[2K\x1b[33m${frames[frame++ % frames.length]}\x1b[0m [\x1b[32m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(width - filled)}\x1b[0m] ${label}…`);
  };
  return {
    start: (steps) => { total = steps; if (quiet) timer = setInterval(draw, 80); },
    /** Starts the next part; `more` adds parts not counted at the start (the seed). */
    step: (text, more = 0) => {
      if (label) done++;
      total += more;
      label = text;
      if (quiet) draw();
      else console.log(`${text}…`);
    },
    /** Prints `text` above the bar. */
    print: (text) => { if (timer) process.stdout.write('\r\x1b[2K'); console.log(text); draw(); },
    stop: () => { clearInterval(timer); timer = null; if (quiet) process.stdout.write('\r\x1b[2K'); },
  };
})();
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const fail = (message, output = '') => {
  progress.stop();
  console.error(red(message));
  if (output.trim()) console.error(output.trimEnd().split(/\r?\n/).slice(-30).join('\n'));
  process.exit(1);
};

// The local Supabase's parts (scripts/supabase-env.mjs), then turbo, then the web and API servers each saying they're ready.
progress.start(remote ? 4 : 9);
progress.step('Checking ports');
// Web on :5173, the API on :8787 (or PORT), and for the local database the Supabase stack's ports: none may be reserved by Windows.
const conflicts = reservedPorts([5173, Number(process.env.PORT ?? 8787), ...(remote ? [] : localSupabasePorts(dir))]);
if (conflicts.length) fail(reservedPortsHelp(conflicts));
let database;
try {
  database = remote ? hosted : await localEnv(dir, { quiet, step: (text) => progress.step(text, text.startsWith('Seeding') ? 1 : 0) });
} catch (error) {
  fail(`Could not start the local Supabase (is Docker running?): ${error.message}`, error.output);
}
if (!quiet) console.log(`Database: ${remote ? '\x1b[33mhosted Supabase project\x1b[0m' : 'local Supabase'} (${database.SUPABASE_URL})\n`);

const env = { ...process.env, ...database };
if (!quiet) process.exit(await run('pnpm', ['exec', 'turbo', 'run', 'dev'], dir, env));

// turbo's stream output, each line prefixed with its task (`@poke-tcg/web:dev: …`): read for the two servers' ready lines
// and for errors, which are shown labelled (the web app is the frontend, the API the backend), with the lines that follow them.
const LABELS = { web: 'frontend', api: 'backend' };
const ERROR = /errors?\b|\bERR!|ERR_[A-Z_]+|exception|\bfailed\b|EACCES|EADDRINUSE|✘|uncaught/i;
const CONTINUES = /^(\s|at |\||>|\^|\d+\s*\|)/;
const errors = [];
const recent = []; // the last lines, shown if turbo stops before the servers are up
let url = null;
let apiReady = false;
let ready = false;
let errorFrom = null; // the source of the error being printed, while its following lines come
let stopping = false; // after Ctrl+C, when the servers' exit codes aren't errors
const show = (text) => (ready ? console.log(text) : progress.print(text));
const onLine = (raw) => {
  const line = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trimEnd();
  const m = line.match(/^@poke-tcg\/([\w-]+):([\w-]+): ?(.*)$/);
  const source = m ? (LABELS[m[1]] ?? `${m[1]} ${m[2]}`) : 'turbo';
  const text = m ? m[3] : line;
  if (!text.trim() || stopping) return;
  recent.push(`[${source}] ${text}`);
  if (recent.length > 40) recent.shift();
  if (errorFrom === source && CONTINUES.test(text)) {
    const entry = `\x1b[90m${' '.repeat(source.length + 3)}${text}\x1b[0m`;
    errors.push(entry);
    return show(entry);
  }
  errorFrom = null;
  if (ERROR.test(text)) {
    errorFrom = source;
    const entry = `${red(`[${source}]`)} ${text}`;
    errors.push(entry);
    return show(entry);
  }
  if (ready) return;
  const local = source === 'frontend' && text.match(/Local:\s+(https?:\/\/\S+)/);
  if (local && !url) { url = local[1]; progress.step(apiReady ? 'Almost there' : 'Waiting for the backend'); }
  if (source === 'backend' && /API listening on/.test(text) && !apiReady) { apiReady = true; progress.step(url ? 'Almost there' : 'Waiting for the frontend'); }
  if (url && apiReady) {
    ready = true;
    progress.stop();
    // Only the link stays on screen, then the errors so far and any to come.
    clearScreen();
    console.log(`\x1b[1m\x1b[32m➜\x1b[0m  \x1b[1m${url}\x1b[0m${remote ? '  \x1b[33m(hosted Supabase project)\x1b[0m' : ''}`);
    console.log(`\x1b[90mErrors from the frontend and backend show up below. Ctrl+C stops the servers; \`pnpm dev --verbose\` shows every log.\x1b[0m\n`);
    for (const entry of errors) console.log(entry);
  }
};
progress.step('Waiting for the frontend and backend');
const child = spawn(...command('pnpm', ['exec', 'turbo', 'run', 'dev', '--ui=stream']), { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
for (const stream of [child.stdout, child.stderr]) readline.createInterface({ input: stream }).on('line', onLine);
child.on('exit', (code, signal) => {
  const exit = signal ? 1 : (code ?? 1);
  if (!ready) fail(`The dev servers stopped before they were ready (exit ${exit}). Their last lines:`, recent.join('\n'));
  if (!stopping) console.log(`\nThe dev servers stopped (exit ${exit}).`);
  process.exit(stopping ? 0 : exit);
});
// Ctrl+C reaches turbo too (it shares the console); this process waits for it to stop.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; if (signal === 'SIGTERM') child.kill(); });
