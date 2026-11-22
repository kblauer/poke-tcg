import { describe, expect, it } from 'vitest';
import { botRun, botRuns } from './economy.js';
import { allUnits } from './species.js';

const units = allUnits();

describe('the economy check', () => {
  it('plays whole runs to their end through the draft, the same way from the same seed', () => {
    const runs = botRuns(units, 12, 40);
    for (const run of runs) {
      expect(run.won || run.hp === 0).toBe(true);
      expect(run.banked).toBe(run.won ? run.pokedollars : 0);
      // What came in less what went out is what's left.
      expect(300 + run.earned + run.fromSales - run.onCards - run.onTiers - run.onRerolls).toBe(run.pokedollars);
    }
    expect(runs.some((r) => r.bought > 5)).toBe(true);
    expect(botRun(units, 41)).toEqual(runs[1]);
  });
});
