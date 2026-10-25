// Assembles .vercel/output (Vercel Build Output API v3) at the repo root:
//   static/            the built web app (apps/web/dist)
//   functions/api.func the API bundled into one ESM file, so no workspace TypeScript is left for Vercel to compile
// Run after `turbo run build --filter=@poke-tcg/web`, which also generates the Prisma client.
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = `${root}.vercel/output`;
const func = `${out}/functions/api.func`;

await rm(out, { recursive: true, force: true });
await cp(`${root}apps/web/dist`, `${out}/static`, { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL('../src/vercel.ts', import.meta.url))],
  outfile: `${func}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  // CommonJS dependencies (pg, ...) call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  // Optional native driver that pg only loads when asked for.
  external: ['pg-native'],
  logLevel: 'warning',
});

// The card catalog beside the function (src/catalog.ts reads it at start), read from the deployment's database once
// per build instead of once per instance. Without it the API still works, reading the table itself.
try {
  execFileSync('tsx', [fileURLToPath(new URL('./dump-catalog.ts', import.meta.url)), `${func}/catalog.json`], { stdio: 'inherit', shell: process.platform === 'win32' });
} catch {
  console.warn('Could not bundle the card catalog: each instance will read it from the database');
}

const json = (path, data) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
await json(`${func}/.vc-config.json`, {
  runtime: 'nodejs24.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  supportsResponseStreaming: true,
  regions: ['iad1'],
});
await json(`${out}/config.json`, {
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/api(?:/.*)?', dest: '/api' },
    { src: '/.*', dest: '/index.html' },
  ],
});
console.log(`Wrote ${out}`);
