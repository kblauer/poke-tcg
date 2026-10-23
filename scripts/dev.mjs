// `pnpm dev`: asks which checkout to run the dev servers from, the main one or one of its git worktrees (.claude/worktrees/), then runs that checkout's `turbo run dev`.
// Arrow keys (or a number) and Enter pick; Esc or Ctrl+C quits. `pnpm dev --here`, or a shell that isn't a terminal, skips the question and runs this checkout.
// A worktree with no .env gets a copy of the main checkout's (it's gitignored, so new worktrees have none); one with no node_modules gets `pnpm install` first.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

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

const pick = (choices, start) => new Promise((resolve) => {
  let index = start;
  const out = process.stdout;
  const draw = (first) => {
    if (!first) out.write(`\x1b[${choices.length}A`);
    choices.forEach((c, i) => out.write(`\x1b[2K${i === index ? '\x1b[33m❯' : ' '} ${i + 1}. ${c}\x1b[0m\n`));
  };
  out.write('Start the dev servers from which checkout? (↑/↓ or a number, Enter; Esc quits)\n');
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

const run = (cmd, args, cwd) => new Promise((resolve) => {
  // shell: true so Windows finds pnpm.cmd.
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
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
  const chosen = await pick(choices, Math.max(0, all.findIndex((w) => same(w.dir, here))));
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
  console.log(`Starting the dev servers in ${dir}\n`);
}

process.exit(await run('pnpm', ['exec', 'turbo', 'run', 'dev'], dir));
