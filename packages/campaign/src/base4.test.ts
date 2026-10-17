// Base Set 2's reprint table (game-engine effects/base4.ts) checked against the TCGdex snapshot, which the
// engine's own tests can't read (it has no Node types). Here because this package's tests already read it.
import { readFileSync } from 'node:fs';
import { attackEffect, BASE4_REPRINTS, powerEffect, trainerEffect } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { TEST_POOL } from './test-pool.js';

interface Row {
  id: string;
  name: string;
  category: string;
  attacks?: { name: string; effect: string | null }[] | null;
  abilities?: { name: string }[] | null;
}
const rows: Row[] = JSON.parse(readFileSync(new URL('../../db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')).cards;
const row = (id: string) => rows.find((r) => r.id === id)!;
const base4 = rows.filter((r) => r.id.startsWith('base4-'));

describe('Base Set 2 reprints', () => {
  it('maps every card to a Base Set or Jungle card with the same name and attacks', () => {
    expect(Object.keys(BASE4_REPRINTS).sort()).toEqual(base4.map((r) => r.id).sort());
    for (const r of base4) {
      const original = row(BASE4_REPRINTS[r.id]!);
      expect(original.id).toMatch(/^base[12]-/);
      expect([original.name, (original.attacks ?? []).map((a) => a.name)]).toEqual([r.name, (r.attacks ?? []).map((a) => a.name)]);
    }
  });

  it("gives every attack with text its original's effect", () => {
    for (const r of base4.filter((r) => r.category === 'Pokemon')) {
      for (const a of r.attacks ?? []) {
        if (!a.effect) continue;
        expect(attackEffect(r.id, a.name), `${r.id} ${r.name}: ${a.name}`).toBeDefined();
        expect(attackEffect(r.id, a.name)).toBe(attackEffect(BASE4_REPRINTS[r.id]!, a.name));
      }
    }
  });

  it("gives every Pokémon Power and Trainer its original's effect", () => {
    for (const r of base4) {
      if (r.abilities?.length) expect(powerEffect(r.id), `${r.id} ${r.name}`).toBe(powerEffect(BASE4_REPRINTS[r.id]!));
      if (r.category === 'Trainer') expect(trainerEffect(r.id), `${r.id} ${r.name}`).toBe(trainerEffect(BASE4_REPRINTS[r.id]!));
    }
    expect(base4.filter((r) => r.abilities?.length).every((r) => powerEffect(r.id))).toBe(true);
    expect(base4.filter((r) => r.category === 'Trainer').every((r) => trainerEffect(r.id))).toBe(true);
  });

  it('is in the run card pool wherever its original is', () => {
    const pooled = new Set(TEST_POOL.map((c) => c.def.id));
    const missing = base4.filter((r) => pooled.has(BASE4_REPRINTS[r.id]!) && !pooled.has(r.id)).map((r) => `${r.id} ${r.name}`);
    expect(missing).toEqual([]);
    expect(base4.filter((r) => pooled.has(r.id)).length).toBe(base4.length);
  });
});
