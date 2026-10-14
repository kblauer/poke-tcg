// Downloads the Wizards of the Coast era card pool (1999–2003, before the EX series)
// from TCGdex into a JSON snapshot that `prisma/seed.ts` loads into the database.
//
//   pnpm --filter @poke-tcg/db cards:fetch
//
// The snapshot is committed so seeding is reproducible and doesn't depend on TCGdex.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SNAPSHOT_PATH, type CardSnapshot, type TcgdexCard, type TcgdexSet } from '../prisma/tcgdex.js';

const API = 'https://api.tcgdex.net/v2';

/**
 * All WOTC-era sets. Deliberately excluded: `jumbo` (oversized, not playable),
 * `sp` (2002 e-Card "Sample" demo cards) and `miscp` (miscellaneous promos).
 */
export const WOTC_SETS = [
  // Base series
  'base1', 'base2', 'basep', 'wp', 'base3', 'base4', 'base5',
  // Gym series
  'gym1', 'gym2',
  // Neo series
  'neo1', 'neo2', 'si1', 'neo3', 'neo4',
  // Legendary Collection & e-Card series
  'lc', 'ecard1', 'bog', 'ecard2', 'ecard3',
];

const CARD_FIELDS = `
  id localId name image category rarity illustrator hp types stage evolveFrom dexId retreat suffix
  effect trainerType energyType
  set { id }
  variants { firstEdition holo normal reverse }
  attacks { name cost damage effect }
  abilities { name type effect }
  weaknesses { type value }
  resistances { type value }
  item { name effect }`;

/** Cards per GraphQL request (each card is an aliased `card(id:)` field). */
const BATCH_SIZE = 100;

async function request<T>(url: string, init?: RequestInit, attempt = 1): Promise<T> {
  const res = await fetch(url, init);
  if (res.ok) return (await res.json()) as T;
  if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return request(url, init, attempt + 1);
  }
  throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${res.status} ${await res.text()}`);
}

interface SetResponse extends Omit<TcgdexSet, 'series'> {
  serie: { id: string };
  cards: { id: string }[];
}

async function fetchSet(id: string) {
  const { cards, serie, ...set } = await request<SetResponse>(`${API}/en/sets/${id}`);
  return {
    set: {
      id: set.id,
      name: set.name,
      series: serie.id,
      releaseDate: set.releaseDate ?? null,
      cardCount: set.cardCount,
      logo: set.logo ?? null,
      symbol: set.symbol ?? null,
    } satisfies TcgdexSet,
    cardIds: cards.map((c) => c.id),
  };
}

const CARD_KEYS = [
  'id', 'localId', 'name', 'image', 'category', 'rarity', 'illustrator', 'hp', 'types', 'stage', 'evolveFrom',
  'dexId', 'retreat', 'suffix', 'effect', 'trainerType', 'energyType', 'set', 'variants', 'attacks', 'abilities',
  'weaknesses', 'resistances', 'item',
] as const satisfies readonly (keyof TcgdexCard)[];

/**
 * REST fallback for cards the GraphQL schema can't return (e.g. an attack with no name
 * violates a non-null field). Normalized to the same shape as the GraphQL result.
 */
async function fetchCardRest(id: string): Promise<TcgdexCard> {
  const raw = await request<Record<string, unknown>>(`${API}/en/cards/${encodeURIComponent(id)}`);
  const card = Object.fromEntries(CARD_KEYS.map((k) => [k, raw[k] ?? null])) as unknown as TcgdexCard;
  card.set = { id: (raw.set as { id: string }).id };
  return card;
}

async function fetchCards(ids: string[]): Promise<TcgdexCard[]> {
  const query = `{ ${ids.map((id, i) => `c${i}: card(id: ${JSON.stringify(id)}) { ${CARD_FIELDS} }`).join('\n')} }`;
  const body = await request<{ data?: Record<string, TcgdexCard | null>; errors?: { path?: (string | number)[] }[] }>(
    `${API}/graphql`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) },
  );
  // Partial GraphQL errors: anything under an errored alias may be nulled out, so refetch those cards.
  const broken = new Set((body.errors ?? []).map((e) => e.path?.[0]).filter((p) => typeof p === 'string'));
  return Promise.all(
    ids.map(async (id, i) => {
      const card = body.data?.[`c${i}`];
      if (card && !broken.has(`c${i}`)) return card;
      console.warn(`\n  ${id}: GraphQL returned an error, using REST`);
      return fetchCardRest(id);
    }),
  );
}

const sets: TcgdexSet[] = [];
const cardIds: string[] = [];
for (const id of WOTC_SETS) {
  const result = await fetchSet(id);
  sets.push(result.set);
  cardIds.push(...result.cardIds);
  console.log(`${result.set.name.padEnd(28)} ${result.cardIds.length} cards`);
}

const cards: TcgdexCard[] = [];
for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
  cards.push(...(await fetchCards(cardIds.slice(i, i + BATCH_SIZE))));
  process.stdout.write(`\rFetched ${cards.length}/${cardIds.length} cards`);
}
process.stdout.write('\n');

// Cards without art can't be shown in the UI, so leave them out, along with any set left empty.
const withImages = cards.filter((c) => c.image);
const setsWithCards = sets.filter((s) => withImages.some((c) => c.set.id === s.id));
console.log(`Skipped ${cards.length - withImages.length} cards without images`);
for (const s of sets) if (!setsWithCards.includes(s)) console.log(`Skipped empty set ${s.name}`);

const snapshot: CardSnapshot = {
  source: 'tcgdex',
  fetchedAt: new Date().toISOString(),
  sets: setsWithCards,
  cards: withImages,
};
const out = fileURLToPath(new URL(`../${SNAPSHOT_PATH}`, import.meta.url));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(snapshot, null, 1) + '\n');
console.log(`Wrote ${snapshot.sets.length} sets and ${snapshot.cards.length} cards to ${SNAPSHOT_PATH}`);
