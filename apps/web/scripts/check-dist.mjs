// A check of the production build (`npx vite build`, then `node scripts/check-dist.mjs` in apps/web; `pnpm check:dist`):
// what the bundles must never hold, and what each page may load. It reads dist/assets/*.js as text: the chunks' import
// statements give the graph (a static `import … from"./x.js"` is loaded with its importer, an `import("./x.js")` only when
// asked for), and a few marker strings say which chunks hold which data.
//
// 1. No debug tool in a production build (CLAUDE.md: Debug tools): none of the debug procedures' names or the debug
//    buttons' words. A cheat's hook is `useMutation(DEBUG_BUILD ? trpc.x.debugY.mutationOptions(…) : NO_DEBUG)` and its
//    button `DEBUG_BUILD && …`, so the build drops both.
// 2. The site's first load (the entry and everything it imports statically: the layout, the sign-in screen) holds no
//    rules engine, no run maps or boss decks and no Idle Adventure data, and stays under ENTRY_BUDGET_KB.
// 3. The rules engine's card effects load only with the battle page (Game).
// 4. The Idle Adventure's species data loads only with the Idle Adventure and the Extras (the contest lobby), Safari Draft's
//    effects (its keywords', powers' and Trainers' words) only with its page.
// 5. Each region's run maps (campaign's kanto-run-maps.ts…) are a chunk of their own, holding no other region's, that no
//    page loads with it: only loadRunMaps' dynamic import brings one, for the run screen of a run of that region.
//
// Skipped (exit 0, with a note) for a build made with the debug tools on (VITE_ENABLE_DEBUG=true): rule 1 can't hold.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const assets = join(dist, 'assets');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('check-dist: no build in apps/web/dist: run `npx vite build` first.');
  process.exit(1);
}

/** The debug procedures' names (the API's `debugProcedure`s the site calls) and the debug buttons' words. */
const DEBUG_STRINGS = ['setFlags', 'addCurrency', 'debugOpen', 'debugSkipBattle', 'debugStart', 'debugWarp', 'debugMoney', 'debugCatch', 'debugNext', 'Skip battle', 'Unlock everything', 'Debug: force'];
/**
 * Each region's run maps: a string only they hold (a gym's picture: the Idle Adventure has route pictures of its own;
 * Hoenn's Gym Challenge's Pokémon Center: Hoenn's Idle maps reuse its gyms' pictures, issue #226).
 */
const REGION_MAPS = {
  'Kanto\'s run maps': '/routes/pewter_gym.png',
  'Johto\'s run maps': '/routes/violet_gym.png',
  'Hoenn\'s run maps': '/routes/rse_lavaridge_pokemoncenter_1f.png',
  'Sinnoh\'s run maps': '/routes/oreburgh_gym.png',
  'Unova\'s run maps': '/routes/bw_striaton_gym.png',
};
/** A string only that data holds: an attack's text, a boss's deck name, a species' field, a run map's picture. */
const MARKERS = {
  'the rules engine\'s card effects': 'is now Paralyzed',
  'the boss decks': 'Zapping Selfdestruct',
  'the Idle Adventure\'s species data': 'catchRate',
  'Safari Draft\'s effects': 'Opposing Pokémon must attack it while it stands',
  ...REGION_MAPS,
};
const [ENGINE, , IDLE, SAFARI] = Object.keys(MARKERS);
/** The pages (their chunks' names) that may load each kind of data; the site's first load may load none, and no page a region's maps. */
const ALLOWED = { [ENGINE]: ['Game'], [IDLE]: ['Idle', 'Extras'], [SAFARI]: ['Safari'], ...Object.fromEntries(Object.keys(REGION_MAPS).map((what) => [what, []])) };
/** The first load's size limit, in kB before compression (300 kB of it is React, the router, tRPC and Supabase's client). */
const ENTRY_BUDGET_KB = 800;

const chunks = new Map(readdirSync(assets).filter((name) => name.endsWith('.js')).map((name) => [name, readFileSync(join(assets, name), 'utf8')]));
const quoted = '["\'`]\\./([^"\'`]+\\.js)["\'`]';
const statics = (code) => [...code.matchAll(new RegExp(`(?:\\bfrom|\\bimport)\\s*${quoted}`, 'g'))].map((m) => m[1]);
const dynamics = (code) => [...code.matchAll(new RegExp(`\\bimport\\(\\s*${quoted}\\s*\\)`, 'g'))].map((m) => m[1]);
/** A chunk and everything loaded with it. */
function closure(name, seen = new Set()) {
  if (seen.has(name) || !chunks.has(name)) return seen;
  seen.add(name);
  for (const dep of statics(chunks.get(name))) closure(dep, seen);
  return seen;
}
/** A chunk's name without its hash: "Home-CMl3Ag5d.js" is "Home". */
const page = (name) => name.replace(/-[\w-]{8}\.js$/, '');
const holding = (names, marker) => [...names].filter((name) => chunks.get(name).includes(marker));

const failures = [];
const entryName = /<script[^>]*\bsrc="\/assets\/([^"]+\.js)"/.exec(readFileSync(join(dist, 'index.html'), 'utf8'))?.[1];
if (!entryName || !chunks.has(entryName)) {
  console.error('check-dist: dist/index.html names no entry script in dist/assets.');
  process.exit(1);
}
if (process.env.VITE_ENABLE_DEBUG === 'true') {
  console.log('check-dist: a build with the debug tools on (VITE_ENABLE_DEBUG=true): nothing checked.');
  process.exit(0);
}

// 1. No debug strings.
for (const [name, code] of chunks) for (const s of DEBUG_STRINGS) if (code.includes(s)) failures.push(`${name} holds the debug string "${s}"`);

// 2. The first load.
const entry = closure(entryName);
for (const [what, marker] of Object.entries(MARKERS)) for (const name of holding(entry, marker)) failures.push(`the site's first load holds ${what} (${name}, loaded with ${entryName})`);
const kB = (names) => [...names].reduce((sum, name) => sum + Buffer.byteLength(chunks.get(name)), 0) / 1000;
const entrySize = kB(entry);
if (entrySize > ENTRY_BUDGET_KB) failures.push(`the site's first load is ${entrySize.toFixed(0)} kB in ${entry.size} files, over its ${ENTRY_BUDGET_KB} kB budget`);

// 3 and 4. What each lazily loaded part (a page, the card inspector, the pack window…) brings with it.
const lazy = new Set([...entry].flatMap((name) => dynamics(chunks.get(name))).filter((name) => chunks.has(name)));
if (!lazy.size) failures.push('no lazily loaded page found from the entry: has the build\'s import syntax changed?');
for (const [what, marker] of Object.entries(MARKERS)) {
  const all = holding(chunks.keys(), marker);
  if (!all.length) failures.push(`no chunk holds ${what} ("${marker}"): the marker needs changing`);
  const allowed = ALLOWED[what];
  if (!allowed) continue;
  for (const root of lazy) {
    if (allowed.includes(page(root))) continue;
    for (const name of holding(closure(root), marker)) failures.push(`${page(root)} loads ${what} (${name}); ${allowed.length ? `only ${allowed.join(' and ')} may` : 'no page may'}`);
  }
}

// 5. Each region's maps in a chunk of their own (that no page loads with it: ALLOWED, above).
for (const [what, marker] of Object.entries(REGION_MAPS)) {
  const [own, ...more] = holding(chunks.keys(), marker);
  if (more.length) failures.push(`${what} are in ${[own, ...more].join(', ')}, not one chunk`);
  for (const [other, theirs] of Object.entries(REGION_MAPS)) if (own && other !== what && chunks.get(own).includes(theirs)) failures.push(`${what}' chunk ${own} holds ${other} too`);
}

const sizes = Object.entries(MARKERS).map(([what, marker]) => `${what}: ${holding(chunks.keys(), marker).map((name) => `${name} ${kB([name]).toFixed(0)} kB`).join(', ')}`);
console.log(`check-dist: ${chunks.size} chunks; first load ${entrySize.toFixed(0)} kB in ${entry.size} files (budget ${ENTRY_BUDGET_KB} kB); ${lazy.size} lazily loaded parts.`);
for (const line of sizes) console.log(`  ${line}`);
if (failures.length) {
  console.error(`check-dist: ${failures.length} ${failures.length === 1 ? 'failure' : 'failures'}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('check-dist: ok');
