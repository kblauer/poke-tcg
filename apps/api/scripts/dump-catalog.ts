// `tsx scripts/dump-catalog.ts <out.json>` (run by vercel-build.mjs): writes the card catalog and the Card table's
// fingerprint to the file the bundled API reads at start (src/catalog.ts), so a new instance doesn't read the whole
// table from the database. The catalog only changes with a seed, and there are many builds a day (every push, each
// preview deployment too), so the dump is kept between builds in node_modules/.cache (Vercel keeps node_modules from one
// build to the next; CATALOG_CACHE_DIR puts it elsewhere) under its fingerprint: a build asks the database for the
// fingerprint, one short row, and reads the table only when no dump of that fingerprint is cached (README: Performance).
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma } from '@poke-tcg/db';
import { catalogFingerprint, catalogFromDb, type CatalogFile } from '../src/catalog.js';

const out = process.argv[2];
if (!out) throw new Error('Usage: tsx scripts/dump-catalog.ts <out.json>');

const cacheDir = process.env.CATALOG_CACHE_DIR ?? fileURLToPath(new URL('../../../node_modules/.cache/poke-tcg/', import.meta.url));
const cachedFile = (fingerprint: string) => `${cacheDir}catalog-${fingerprint}.json`;

/** The cached dump of this fingerprint, or null when there's none (or it isn't that fingerprint's after all). */
async function cached(fingerprint: string): Promise<string | null> {
  try {
    const json = await readFile(cachedFile(fingerprint), 'utf8');
    return (JSON.parse(json) as CatalogFile).fingerprint === fingerprint ? json : null;
  } catch {
    return null;
  }
}

const current = await catalogFingerprint();
const reused = await cached(current);
if (reused) {
  await writeFile(out, reused);
  console.log(`Reused the cached catalog (${(reused.length / 1e6).toFixed(1)} MB, fingerprint ${current}) from ${cachedFile(current)}`);
} else {
  // Both read in one repeatable-read transaction, so the fingerprint is the rows'.
  const [fingerprint, rows] = await prisma.$transaction(async (tx) => [await catalogFingerprint(tx), await catalogFromDb(tx)] as const, { isolationLevel: 'RepeatableRead' });
  const file: CatalogFile = { fingerprint, rows: rows.map((r) => ({ ...r, set: { name: r.set.name, releaseDate: r.set.releaseDate?.toISOString() ?? null } })) };
  const json = JSON.stringify(file);
  await writeFile(out, json);
  console.log(`Wrote ${rows.length} catalog cards (${(json.length / 1e6).toFixed(1)} MB, fingerprint ${fingerprint}) to ${out}`);
  try {
    await mkdir(cacheDir, { recursive: true });
    await copyFile(out, cachedFile(fingerprint));
  } catch (error) {
    console.warn(`Could not cache the catalog in ${cacheDir}: ${(error as Error).message}`);
  }
}
await prisma.$disconnect();
