// Legendary Collection's reprint table (game-engine effects/lc.ts) checked against the TCGdex snapshot, as base4.test.ts
// does for Base Set 2.
import { readFileSync } from 'node:fs';
import { attackEffect, LC_REPRINTS, powerEffect, trainerEffect } from '@poke-tcg/game-engine';
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
const lc = rows.filter((r) => r.id.startsWith('lc-'));
/** The printed name (the seed fixes Nidoran's spacing) and attack names (TCGdex misspells two). */
const printed = (r: Row) => [r.name.replace(/^Nidoran ([♀♂])$/, 'Nidoran$1'), (r.attacks ?? []).map((a) => ({ 'Pin Missle': 'Pin Missile', Minimized: 'Minimize' })[a.name] ?? a.name)];

describe('Legendary Collection reprints', () => {
  it('maps every card to an earlier card with the same name and attacks', () => {
    expect(Object.keys(LC_REPRINTS).sort()).toEqual(lc.map((r) => r.id).sort());
    for (const r of lc) {
      const original = row(LC_REPRINTS[r.id]!);
      expect(original.id).toMatch(/^(base[1235]|basep)-/);
      expect(printed(original), r.id).toEqual(printed(r));
    }
  });

  it("gives every attack with text its original's effect", () => {
    for (const r of lc.filter((r) => r.category === 'Pokemon')) {
      for (const a of r.attacks ?? []) {
        if (!a.effect) continue;
        const effect = attackEffect(r.id, a.name);
        expect(effect, `${r.id} ${r.name}: ${a.name}`).toBeDefined();
        const name = printed(r)[1]![(r.attacks ?? []).indexOf(a)] as string;
        expect(effect!.run).toBe(attackEffect(LC_REPRINTS[r.id]!, name)!.run);
      }
    }
  });

  it("gives every Pokémon Power the original's, stopped by any Special Condition, and every Trainer the original's", () => {
    for (const r of lc) {
      if (r.abilities?.length) {
        const original = powerEffect(LC_REPRINTS[r.id]!)!;
        expect(powerEffect(r.id), `${r.id} ${r.name}`).toEqual({ ...original, stopsOnAnyCondition: true, stopsOnlyWhileAsleep: false });
      }
      if (r.category === 'Trainer') expect(trainerEffect(r.id), `${r.id} ${r.name}`).toBe(trainerEffect(LC_REPRINTS[r.id]!));
    }
    expect(lc.filter((r) => r.category === 'Trainer').every((r) => trainerEffect(r.id))).toBe(true);
  });

  it('is all in the run card pool', () => {
    const pooled = new Set(TEST_POOL.map((c) => c.def.id));
    expect(lc.filter((r) => !pooled.has(r.id)).map((r) => `${r.id} ${r.name}`)).toEqual([]);
  });
});
