// The API's card definitions (toCardDef, from catalog rows) are the campaign's test pool's (test-pool.ts, from the
// snapshot): both go through card-fixes.ts, so the fixes it carries (Baby Pokémon, Blissey ex's two pre-evolutions,
// Dark and Light lines, owners' Pokémon, the fossils, δ Pokémon) agree, and a sample of every set says so.
import { readFileSync } from 'node:fs';
import type { Card } from '@poke-tcg/db';
import { describe, expect, it } from 'vitest';
import { catalogDef, toCatalog, type Row } from '../../../packages/campaign/src/test-pool.js';
import { toCardDef } from './cards.js';

const rows = (JSON.parse(readFileSync(new URL('../../../packages/db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')) as { cards: Row[] }).cards;
const byName = (name: string, set?: string) => rows.find((r) => r.name === name && (!set || r.id.startsWith(`${set}-`)))!;

/** The API's definition of a snapshot card, from a row shaped as the seed writes it, without the Pokédex length the test pool doesn't add. */
function apiDef(r: Row) {
  const row = { ...toCatalog(r), setId: r.id.split('-')[0]!, localId: r.localId ?? r.id.split('-')[1]! } as unknown as Card;
  const { length: _, ...def } = toCardDef(row) as ReturnType<typeof toCardDef> & { length?: string };
  return def;
}

describe('the API’s card definitions and the test pool’s', () => {
  it.each([
    ['a Baby Pokémon', 'Pichu', 'neo1'],
    ['Blissey ex (evolves from Chansey or Chansey ex)', 'Blissey ex', 'ex10'],
    ['a Dark Stage 2 (from the Dark Stage 1)', 'Dark Alakazam', 'base5'],
    ["an owner's Pokémon", "Brock's Rhydon", 'gym1'],
    ['a fossil evolution (from Mysterious Fossil)', 'Omanyte', 'base3'],
    ['a δ Pokémon', 'Beldum δ', 'ex11'],
  ])('agree on %s', (_, name, set) => {
    const row = byName(name, set);
    expect(row, `${name} in ${set}`).toBeDefined();
    expect(apiDef(row)).toEqual(catalogDef(row.id));
  });

  it('agree on a sample of every set (one card in 17)', () => {
    const sample = rows.filter((_, i) => i % 17 === 0);
    expect(sample.length).toBeGreaterThan(150);
    const differ: string[] = [];
    for (const r of sample) {
      let theirs;
      try {
        theirs = catalogDef(r.id);
      } catch {
        // The catalog can't load it: the API throws on it too (the loaders leave such cards out).
        expect(() => apiDef(r), r.id).toThrow();
        continue;
      }
      try {
        expect(apiDef(r)).toEqual(theirs);
      } catch {
        differ.push(r.id);
      }
    }
    expect(differ).toEqual([]);
  });
});
