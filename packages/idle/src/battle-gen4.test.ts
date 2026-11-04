import { rngFrom } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { Battle, simulateBattle, type BattleSetup } from './battle.js';
import { moveData } from './data.js';
import { inGeneration } from './generation.js';
import { createMon } from './mon.js';
import type { Mon, Stats } from './types.js';

// Johto's battles by HeartGold's rules (battle.ts's gen4; issue #170, step 3): Gen 4's damage in pokeheartgold's order.
const ZERO: Stats = [0, 0, 0, 0, 0, 0];
const mon = (id: number, level: number, o: Partial<Mon> = {}): Mon => ({ ...createMon(rngFrom(1), { species: id, level, ivs: ZERO, evs: ZERO, nature: 0 }), ...o });
const setup = (party: Mon[], foes: Mon[], o: Partial<BattleSetup> = {}): BattleSetup => ({
  kind: 'wild',
  party,
  foes,
  bag: {},
  settings: { autoHeal: false, tryCatch: false },
  badges: 0,
  terrain: 'grass',
  ...o,
});
const johto = <T>(run: () => T) => inGeneration(2, run);

/** A battle between two level-10 Pokémon with no IVs or EVs, its random rolls fixed (0: the top 100% damage roll). */
function battle(user: number, target: number, roll = 0) {
  const b = new Battle(setup([mon(user, 10)], [mon(target, 10)]), rngFrom(1));
  b.random16 = () => roll;
  return b;
}

describe("Gen 4's damage", () => {
  it('plays Johto by Gen 4 rules and Kanto by Gen 3', () => {
    expect(johto(() => battle(155, 152).gen4)).toBe(true);
    expect(new Battle(setup([mon(4, 10)], [mon(1, 10)]), rngFrom(1)).gen4).toBe(false);
  });

  it('matches hand-worked calculations', () =>
    johto(() => {
      // Cyndaquil Lv. 10 (Atk 15, Sp. Atk 17) on Chikorita Lv. 10 (Def 18, Sp. Def 18).
      const b = battle(155, 152);
      const [c, chiko] = b.active;
      expect([c.stats.atk, c.stats.spa, chiko.stats.def, chiko.stats.spd]).toEqual([15, 17, 18, 18]);
      const ember = { key: 'ember', power: 40, type: 'fire' as const, crit: 1 };
      // Ember, special: 17 × 40 × 6 / 18 = 226, / 50 = 4, + 2 = 6; 100%; STAB 9; Grass 2x = 18.
      expect(b.damage4(c, chiko, moveData('ember'), ember)).toEqual({ damage: 18, eff: 2 });
      // Fire Punch, physical by the split: 15 × 75 × 6 / 18 = 375, / 50 = 7, + 2 = 9; STAB 13; 2x = 26 (Gen 3 read it as special: 30).
      expect(b.damage4(c, chiko, moveData('fire-punch'), { key: 'fire-punch', power: 75, type: 'fire', crit: 1 }).damage).toBe(26);
      // A critical hit doubles before the roll: 12; STAB 18; 2x = 36. Sniper triples it: 18, 27, 54.
      expect(b.damage4(c, chiko, moveData('ember'), { ...ember, crit: 2 }).damage).toBe(36);
      expect(b.damage4(c, chiko, moveData('ember'), { ...ember, crit: 3 }).damage).toBe(54);
    }));

  it('rolls the random 85–100% before STAB and the types', () =>
    johto(() => {
      // 6 × 85% = 5; STAB 7; 2x = 14 (Gen 3's order, the roll last, would give 15).
      const b = battle(155, 152, 15);
      const [c, chiko] = b.active;
      expect(b.damage4(c, chiko, moveData('ember'), { key: 'ember', power: 40, type: 'fire', crit: 1 }).damage).toBe(14);
    }));

  it('applies Tinted Lens and Adaptability after the types', () =>
    johto(() => {
      // Cyndaquil's Ember on Totodile (Sp. Def 14): 17 × 40 × 6 / 14 = 291, / 50 = 5, + 2 = 7; STAB 10; Water 0.5x = 5; Tinted Lens 10.
      const b = battle(155, 158);
      const [c, toto] = b.active;
      const ember = { key: 'ember', power: 40, type: 'fire' as const, crit: 1 };
      expect(b.damage4(c, toto, moveData('ember'), ember)).toEqual({ damage: 5, eff: 0.5 });
      c.ability = 'tinted-lens';
      expect(b.damage4(c, toto, moveData('ember'), ember).damage).toBe(10);
      // Adaptability: STAB 2x, 7 × 2 = 14; 0.5x = 7.
      c.ability = 'adaptability';
      expect(b.damage4(c, toto, moveData('ember'), ember).damage).toBe(7);
    }));

  it('reads the Gen 4 held items in its order', () =>
    johto(() => {
      const b = battle(155, 152);
      const [c, chiko] = b.active;
      const ember = { key: 'ember', power: 40, type: 'fire' as const, crit: 1 };
      // Charcoal (+20% power): 48: 17 × 48 × 6 / 18 = 272, / 50 = 5, + 2 = 7; STAB 10; 2x = 20.
      c.item = 'charcoal';
      expect(b.damage4(c, chiko, moveData('ember'), ember).damage).toBe(20);
      // Life Orb (+30% after the base damage): 6 × 1.3 = 7; STAB 10; 2x = 20.
      c.item = 'life-orb';
      expect(b.damage4(c, chiko, moveData('ember'), ember).damage).toBe(20);
      // Choice Specs (Sp. Atk 1.5x = 25): 25 × 40 × 6 / 18 = 333, / 50 = 6, + 2 = 8; STAB 12; 2x = 24.
      c.item = 'choice-specs';
      expect(b.damage4(c, chiko, moveData('ember'), ember).damage).toBe(24);
    }));

  it('plays whole Johto battles', () =>
    johto(() => {
      const results = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) {
        const rng = rngFrom(seed);
        const a = createMon(rng, { species: 152 + ((seed * 7) % 99), level: 5 + (seed % 40) });
        const f = createMon(rng, { species: 152 + ((seed * 13) % 99), level: 5 + ((seed * 3) % 40) });
        const out = simulateBattle(setup([a], [f], { kind: seed % 2 ? 'wild' : 'trainer', maxTicks: 60 }), rng);
        expect(out.events.at(-1)!.t).toBe('end');
        results.add(out.result);
      }
      expect(results.has('won') || results.has('lost')).toBe(true);
    }));
});
