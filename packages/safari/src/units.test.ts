import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gen1Units } from './gen1.js';
import { KEYWORD_NAMES, KEYWORD_WORTH, TOP_TIER, unitEvolvesFrom, unitScore } from './units.js';

const units = gen1Units();

/** The planning tool's table (tools/safari/out/gen1-units.csv): the reference for the derivation. */
function toolTable() {
  const [head, ...lines] = readFileSync(new URL('../../../tools/safari/out/gen1-units.csv', import.meta.url), 'utf8').trim().split('\n');
  const cols = head!.split(',');
  return lines.map((line) => {
    const cells: string[] = [];
    for (const m of line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)) cells.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : (m[2] ?? ''));
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ''])) as Record<string, string>;
  });
}

describe('unit conversion', () => {
  it('agrees with the planning tool on every Gen 1 unit', () => {
    const rows = new Map(toolTable().map((r) => [r.id, r]));
    expect(units.length).toBe(rows.size);
    for (const u of units) {
      const row = rows.get(u.id);
      expect(row, u.id).toBeDefined();
      expect({ name: u.name, type: u.type, stage: u.stage, hp: String(u.hp), attack: String(u.attack), tier: String(u.tier), keyword: u.keyword ?? '', power: u.power ?? '' }, u.id).toEqual({
        name: row!.name,
        type: row!.type,
        stage: row!.stage,
        hp: row!.hp,
        attack: row!.attack,
        tier: row!.tier,
        keyword: row!.keyword,
        power: row!.power,
      });
    }
  });

  it("has the issue's counts, and the tiers' since effects count in them", () => {
    expect(units.length).toBe(432);
    const count = (key: (u: (typeof units)[number]) => string | number) => units.reduce<Record<string, number>>((n, u) => ({ ...n, [key(u)]: (n[key(u)] ?? 0) + 1 }), {});
    expect(count((u) => u.stage)).toEqual({ basic: 246, stage1: 146, stage2: 40 });
    expect(count((u) => u.tier)).toEqual({ 1: 106, 2: 96, 3: 85, 4: 80, 5: 65 });
    expect(units.filter((u) => u.raisedFrom !== undefined).length).toBe(13);
    expect(units.filter((u) => !u.keyword).length).toBe(166);
    expect(units.filter((u) => u.power).length).toBe(66);
  });

  it('ranks a unit higher for a stronger keyword or power', () => {
    const plain = { attack: 30, hp: 60 };
    expect(unitScore({ ...plain, keyword: 'Sleep' })).toBeGreaterThan(unitScore({ ...plain, keyword: 'Paralyze' }));
    expect(unitScore({ ...plain, keyword: 'Paralyze' })).toBeGreaterThan(unitScore(plain));
    expect(unitScore({ ...plain, power: 'Transparency' })).toBeGreaterThan(unitScore({ ...plain, power: 'Trickery' }));
    expect(unitScore({ ...plain, power: 'Trickery' })).toBe(unitScore(plain));
    // The units with the strongest keywords sit higher than the plain ones.
    const tier = (list: typeof units) => list.reduce((s, u) => s + u.tier, 0) / list.length;
    expect(tier(units.filter((u) => ['Sleep', 'Drain', 'Toxic', 'Explode', 'Family'].includes(u.keyword ?? '')))).toBeGreaterThan(tier(units.filter((u) => !u.keyword && !u.power)) + 1);
    for (const k of KEYWORD_NAMES) expect(KEYWORD_WORTH[k], k).toBeTypeOf('number');
  });

  it('keeps numbers on the TCG scale and tiers in range', () => {
    for (const u of units) {
      expect(u.attack % 10, u.id).toBe(0);
      expect(u.attack, u.id).toBeGreaterThanOrEqual(10);
      expect(u.hp % 10, u.id).toBe(0);
      expect(u.tier, u.id).toBeGreaterThanOrEqual(1);
      expect(u.tier, u.id).toBeLessThanOrEqual(TOP_TIER);
      if (u.keyword) expect(KEYWORD_NAMES).toContain(u.keyword);
    }
  });

  it('puts an evolved unit above every print it evolves from, in tier and in attack plus HP', () => {
    for (const u of units.filter((x) => x.stage !== 'basic')) {
      for (const below of units.filter((p) => unitEvolvesFrom(u, p.name))) {
        expect(u.tier, `${u.id} over ${below.id}`).toBeGreaterThan(below.tier);
        expect(u.attack + u.hp, `${u.id} over ${below.id}`).toBeGreaterThanOrEqual(below.attack + below.hp + 10);
      }
    }
  });
});
