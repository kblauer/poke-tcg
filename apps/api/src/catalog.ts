// The card catalog (the Card table, each card with its set's name and release date) as the API reads it: once per
// instance, from the copy the Vercel build puts beside the function (catalog.json, scripts/dump-catalog.ts) while the
// table is still what it was at the deploy, otherwise from the database. Reading the whole table on each instance's
// first requests was most of the hosted database's egress (about 4 MB a read; README: Performance). The catalog only
// changes with the seed, so every card lookup (decks, packs, pools, card libraries) is served from here.
import { readFile } from 'node:fs/promises';
import { prisma, type Card, type Prisma } from '@poke-tcg/db';

/** A catalog card: every column of its Card row, with its set's name and release date. */
export type CatalogRow = Pick<Card, 'id' | 'setId' | 'name' | 'localId' | 'kind' | 'imageUrl' | 'rarity' | 'hp' | 'types' | 'stage' | 'evolveFrom' | 'data'> & { set: { name: string; releaseDate: Date | null } };

/** The bundled copy: the rows in the database's id order, and the table's fingerprint when they were read (catalogFingerprint). */
export interface CatalogFile {
  fingerprint: string;
  rows: (Omit<CatalogRow, 'set'> & { set: { name: string; releaseDate: string | null } })[];
}

const select = {
  id: true, setId: true, name: true, localId: true, kind: true, imageUrl: true, rarity: true, hp: true, types: true, stage: true, evolveFrom: true, data: true,
  set: { select: { name: true, releaseDate: true } },
} satisfies Prisma.CardSelect;

type Db = Prisma.TransactionClient | typeof prisma;

/** Every catalog card from the database, in id order (the order run pools have always been built in). */
export const catalogFromDb = (db: Db = prisma): Promise<CatalogRow[]> => db.card.findMany({ select, orderBy: { id: 'asc' } });

/** One md5 over every Card row and its set's name and release date, worked out in the database: a single short row comes back. */
export async function catalogFingerprint(db: Db = prisma): Promise<string> {
  const [row] = await db.$queryRaw<{ fingerprint: string | null }[]>`
    SELECT md5(string_agg(md5(c::text) || s.name || coalesce(s."releaseDate"::text, ''), '' ORDER BY c.id)) AS fingerprint
    FROM "Card" c JOIN "CardSet" s ON s.id = c."setId"`;
  return row?.fingerprint ?? '';
}

/** The bundled copy beside the function, or null where there's none (the dev servers: they read the local database). */
async function bundled(): Promise<CatalogFile | null> {
  try {
    return JSON.parse(await readFile(new URL('./catalog.json', import.meta.url), 'utf8')) as CatalogFile;
  } catch {
    return null;
  }
}

async function load(): Promise<CatalogRow[]> {
  const file = await bundled();
  if (!file) return catalogFromDb();
  // A re-seed since the deploy changes the fingerprint: the bundled copy is stale, so read the table instead.
  const now = await catalogFingerprint().catch(() => file.fingerprint);
  if (now !== file.fingerprint) {
    console.warn('The bundled catalog is out of date (re-seeded since the deploy): reading the Card table');
    return catalogFromDb();
  }
  return file.rows.map((r) => ({ ...r, set: { name: r.set.name, releaseDate: r.set.releaseDate === null ? null : new Date(r.set.releaseDate) } }));
}

let rows: Promise<CatalogRow[]> | undefined;

/** Every catalog card in the database's id order, loaded once per instance. Never changed: callers copy before sorting. */
export function catalogInIdOrder(): Promise<CatalogRow[]> {
  rows ??= load();
  rows.catch(() => (rows = undefined));
  return rows;
}

let index: Promise<Map<string, CatalogRow>> | undefined;

/** The catalog by card id. */
export function catalogIndex(): Promise<Map<string, CatalogRow>> {
  index ??= catalogInIdOrder().then((all) => new Map(all.map((r) => [r.id, r])));
  index.catch(() => (index = undefined));
  return index;
}

/** The catalog rows of these ids that exist (unknown ids left out), in the order given. */
export async function catalogCards(ids: Iterable<string>): Promise<CatalogRow[]> {
  const byId = await catalogIndex();
  return [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);
}
