import { describe, expect, it } from 'vitest';
import { effectLift, lift, synergyLift, tierLadder, trainerLift, unitRates, winRate } from './balance.js';
import { TUNING } from './effects.js';
import { allUnits } from './species.js';

const units = allUnits();

describe('the balance harness', () => {
  it('plays every unit, and the same seed gives the same rates', () => {
    const a = unitRates(units, 300, 1, TUNING.risingFrom);
    const b = unitRates(units, 300, 1, TUNING.risingFrom);
    expect([...a.units]).toEqual([...b.units]);
    expect(a.tiers).toEqual(b.tiers);
    for (const u of units) expect(a.units.get(u.id)!.games, u.id).toBeGreaterThan(0);
    for (const t of a.tiers) {
      expect(t.capped).toBe(0);
      // Every battle gives one win or two half wins: a tier's units' rates average 50%.
      const tier = units.filter((u) => u.tier === t.tier).map((u) => a.units.get(u.id)!);
      expect(tier.reduce((s, x) => s + x.wins, 0) / tier.reduce((s, x) => s + x.games, 0)).toBeCloseTo(0.5, 10);
    }
  });

  it('a higher tier beats the one below nearly every time', () => {
    for (const t of tierLadder(units, 400, 2)) expect(winRate(t)).toBeGreaterThan(0.9);
  });

  it('measures an effect against the same battles without it', () => {
    // Stripping nothing changes nothing.
    const drainers = units.filter((u) => u.abilities.some((a) => a.k === 'Armor'));
    expect(drainers.length).toBeGreaterThan(0);
    const same = effectLift(units, drainers, (u) => u, 300, 3);
    expect(same.with.games).toBe(300);
    expect(lift(same)).toBe(0);
    // Things that plainly help.
    expect(lift(effectLift(units, drainers, (u) => ({ ...u, abilities: u.abilities.filter((a) => a.k !== 'Armor') }), 1500, 3))).toBeGreaterThan(0.02);
    expect(lift(synergyLift(units, 'fighting', 4, 800, 4))).toBeGreaterThan(0.1);
    expect(lift(trainerLift(units, 'PlusPower', 3, 800, 5))).toBeGreaterThan(0.1);
    // Bill pays after the battle: nothing in it.
    expect(lift(trainerLift(units, 'Bill', 3, 200, 6))).toBe(0);
  });
});
