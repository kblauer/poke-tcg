// `tsx scripts/dump-catalog.ts <out.json>` (run by vercel-build.mjs): writes the card catalog and the Card table's
// fingerprint to the file the bundled API reads at start (src/catalog.ts), so a new instance doesn't read the whole
// table from the database. Both are read in one repeatable-read transaction, so the fingerprint is the rows'.
import { writeFile } from 'node:fs/promises';
import { prisma } from '@poke-tcg/db';
import { catalogFingerprint, catalogFromDb, type CatalogFile } from '../src/catalog.js';

const out = process.argv[2];
if (!out) throw new Error('Usage: tsx scripts/dump-catalog.ts <out.json>');

const [fingerprint, rows] = await prisma.$transaction(async (tx) => [await catalogFingerprint(tx), await catalogFromDb(tx)] as const, { isolationLevel: 'RepeatableRead' });
const file: CatalogFile = { fingerprint, rows: rows.map((r) => ({ ...r, set: { name: r.set.name, releaseDate: r.set.releaseDate?.toISOString() ?? null } })) };
const json = JSON.stringify(file);
await writeFile(out, json);
console.log(`Wrote ${rows.length} catalog cards (${(json.length / 1e6).toFixed(1)} MB, fingerprint ${fingerprint}) to ${out}`);
await prisma.$disconnect();
