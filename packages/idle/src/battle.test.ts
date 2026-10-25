import { rngFrom } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { Battle, simulateBattle, opponentMon, type BattleSetup } from './battle.js';
import { catchChance, catchOdds, shakeThreshold } from './catch.js';
import { moveData, species } from './data.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { MARTS } from './data/gen1/marts.js';
import { MOVES } from './data/gen1/moves.js';
import { SPECIES } from './data/gen1/species.js';
import { TRAINERS } from './data/gen1/trainers.js';
import { levelEvolution, evolve } from './evolution.js';
import { autoSlots, basicMove, createMon, energyCost, lastFourMoves } from './mon.js';
import { EFFECTS } from './moves.js';
import { calcStats, expForLevel, levelForExp } from './stats.js';
import type { Mon, Stats } from './types.js';

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

describe('the generated data', () => {
  it('has the game\'s values', () => {
    expect(species(4).base).toEqual([39, 52, 43, 60, 50, 65]);
    expect(species(4).name).toBe('Charmander');
    expect(species(29).name).toBe('Nidoran♀');
    expect(SPECIES).toHaveLength(151);
    expect(moveData('scratch')).toMatchObject({ power: 40, accuracy: 100, pp: 35, type: 'normal' });
    expect(ENCOUNTERS.ROUTE1!.land!.rate).toBe(21);
    expect(ENCOUNTERS.ROUTE1!.land!.mons.map((m) => m[2])).toEqual([16, 19, 16, 19, 16, 19, 16, 19, 16, 19, 16, 19]);
    expect(TRAINERS['leader-brock']!.party.map((p) => [p.species, p.level])).toEqual([[74, 12], [95, 14]]);
    expect(MARTS.ViridianCity_Mart_Items).toEqual(['poke-ball', 'potion', 'antidote', 'paralyze-heal']);
    // Kanto's 151 only: Golbat doesn't evolve, Onix doesn't.
    expect(species(42).evolutions).toEqual([]);
    expect(species(95).evolutions).toEqual([]);
  });
});

describe('stats and experience', () => {
  it('follows the Gen 3 formulas', () => {
    expect(calcStats(4, 5, [31, 31, 31, 31, 31, 31], ZERO, 0)).toEqual([20, 11, 10, 12, 11, 13]);
    expect(calcStats(4, 50, ZERO, ZERO, 3)).toEqual([99, 62, 48, 58, 55, 70]);
    expect(expForLevel('mediumSlow', 5)).toBe(135);
    expect(expForLevel('mediumFast', 100)).toBe(1000000);
    expect(expForLevel('erratic', 100)).toBe(600000);
    expect(expForLevel('fluctuating', 100)).toBe(1640000);
    expect(levelForExp('mediumSlow', 135)).toBe(5);
    expect(levelForExp('mediumSlow', 134)).toBe(4);
  });
});

describe('damage', () => {
  it('matches a hand-worked calculation', () => {
    // Charmander Lv. 10 (Sp. Atk 17) Ember on Bulbasaur Lv. 10 (Sp. Def 18): 17 × 40 × 6 / 18 = 226, / 50 = 4, + 2 = 6;
    // STAB 9; Grass 2x = 18, Poison 1x.
    const b = new Battle(setup([mon(4, 10)], [mon(1, 10)]), rngFrom(1));
    const [c, bulba] = b.active;
    expect(c.stats.spa).toBe(17);
    expect(bulba.stats.spd).toBe(18);
    expect(b.baseDamage(c, bulba, moveData('ember'), { power: 40, type: 'fire', crit: false, effect: 'burn_hit' })).toEqual({ damage: 18, eff: 2 });
    // Scratch: Attack 15 × 40 × 6 / Defense 14 = 257, / 50 = 5, + 2 = 7; no STAB; a critical hit doubles it.
    expect(b.baseDamage(c, bulba, moveData('scratch'), { power: 40, type: 'normal', crit: false, effect: 'hit' }).damage).toBe(7);
    expect(b.baseDamage(c, bulba, moveData('scratch'), { power: 40, type: 'normal', crit: true, effect: 'hit' }).damage).toBe(14);
  });

  it('gives the player the badge boosts', () => {
    const b = new Battle(setup([mon(4, 10)], [mon(1, 10)], { badges: 1 }), rngFrom(1));
    const [c, bulba] = b.active;
    // Attack 15 × 1.1 = 16: 16 × 40 × 6 / 14 = 274, / 50 = 5, + 2 = 7.
    expect(b.baseDamage(c, bulba, moveData('scratch'), { power: 40, type: 'normal', crit: false, effect: 'hit' }).damage).toBe(7);
  });
});

describe('catching', () => {
  it('follows the Gen 3 formula', () => {
    // Pidgey (catch rate 255) at full HP in a Poké Ball: a = 85, b = 1048560 / 21.
    expect(catchOdds({ catchRate: 255, maxHp: 20, hp: 20, status: null, ball: 'poke-ball' })).toBe(85);
    expect(shakeThreshold(85)).toBe(49931);
    expect(catchOdds({ catchRate: 45, maxHp: 30, hp: 1, status: 'sleep', ball: 'ultra-ball' })).toBe(176);
    expect(catchChance({ catchRate: 255, maxHp: 20, hp: 1, status: 'sleep', ball: 'poke-ball' })).toBe(1);
    expect(catchChance({ catchRate: 3, maxHp: 200, hp: 200, status: null, ball: 'poke-ball' })).toBeLessThan(0.02);
  });
});

describe('moves and energy', () => {
  it('picks basic moves by the agreed rule', () => {
    expect(basicMove(4)).toBe('scratch');
    expect(basicMove(5)).toBe('scratch');
    expect(basicMove(6)).toBe('scratch');
    expect(basicMove(11)).toBe('tackle'); // Metapod: Caterpie's.
    expect(basicMove(128)).not.toBe('tackle'); // Tauros doesn't evolve: one step stronger.
  });

  it('costs energy by power', () => {
    expect(energyCost('scratch')).toBe(2);
    expect(energyCost('ember')).toBe(2);
    expect(energyCost('flamethrower')).toBe(5);
    expect(energyCost('hyper-beam')).toBe(6);
    expect(energyCost('sleep-powder')).toBe(5);
    expect(energyCost('growl')).toBe(2);
    expect(energyCost('thunder-wave')).toBe(4);
  });

  it('knows the game\'s moves at a level', () => {
    expect(lastFourMoves(4, 5)).toEqual(['scratch', 'growl']);
    expect(autoSlots({ species: 4, moves: ['scratch', 'growl', 'ember', 'metal-claw'] })).toEqual(['metal-claw', 'ember', 'growl']);
  });

  it('evolves at the right levels', () => {
    expect(levelEvolution({ species: 4, level: 16 })).toBe(5);
    expect(levelEvolution({ species: 4, level: 15 })).toBeNull();
    expect(levelEvolution({ species: 64, level: 36 })).toBe(65);
    const { mon: m } = evolve(mon(4, 16), 5);
    expect(m.species).toBe(5);
  });

  it('implements every move effect the Kanto data uses', () => {
    const used = new Set<string>();
    for (const s of SPECIES) for (const [, m] of s.learnset) used.add(m);
    for (const t of Object.values(TRAINERS)) for (const p of t.party) for (const m of p.moves ?? []) used.add(m);
    const missing = [...used].map((m) => MOVES[m]!.effect).filter((e) => !EFFECTS[e]);
    expect([...new Set(missing)]).toEqual([]);
    // Metronome reaches every move: every effect in the game has one too.
    expect([...new Set(Object.values(MOVES).map((m) => m.effect))].filter((e) => !EFFECTS[e])).toEqual([]);
  });
});

describe('battles', () => {
  it('plays out and ends, over many seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = rngFrom(seed);
      const a = createMon(rng, { species: 1 + (seed % 151), level: 5 + (seed % 40) });
      const f = createMon(rng, { species: 1 + ((seed * 7) % 151), level: 5 + ((seed * 3) % 40) });
      const out = simulateBattle(setup([a], [opponentMon(f)], { settings: { autoHeal: true, tryCatch: seed % 2 === 0 }, bag: { 'poke-ball': 5, potion: 2 } }), rng);
      expect(['won', 'lost', 'caught', 'fled']).toContain(out.result);
      expect(out.events.at(-1)).toEqual({ t: 'end', result: out.result });
    }
  });

  it('runs a trainer battle with several Pokémon and gives experience', () => {
    const party = [mon(6, 40), mon(9, 38)];
    const brock = TRAINERS['leader-brock']!;
    const foes = brock.party.map((p) => opponentMon(mon(p.species, p.level), p.moves));
    const out = simulateBattle(setup(party, foes, { kind: 'trainer' }), rngFrom(7));
    expect(out.result).toBe('won');
    expect(out.party[0]!.exp).toBeGreaterThan(party[0]!.exp);
    expect(out.events.some((e) => e.t === 'send' && e.side === 1 && e.mon.species === 95)).toBe(true);
  });

  it('catches with auto-catch, using safe moves first', () => {
    let caught = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const out = simulateBattle(setup([mon(25, 12)], [opponentMon(mon(16, 3))], { settings: { autoHeal: false, tryCatch: true }, bag: { 'poke-ball': 10 } }), rngFrom(seed));
      if (out.result === 'caught') caught++;
      expect(out.result).not.toBe('won');
    }
    expect(caught).toBeGreaterThan(15);
  });

  it('revives by the settings\' policy', () => {
    // A Level 5 lead against a level 40 foe faints at once; with the lead policy it's revived, with none never.
    const weak = () => [mon(10, 5), mon(150, 60)];
    const revived = (revives: ('last' | 'any' | 'boss' | 'lead')[]) =>
      simulateBattle(setup(weak(), [opponentMon(mon(68, 40))], { kind: 'trainer', bag: { revive: 1 }, settings: { autoHeal: true, tryCatch: false, revives } }), rngFrom(3)).events.some((e) => e.t === 'item' && e.item === 'revive');
    expect(revived([])).toBe(false);
    expect(revived(['lead'])).toBe(true);
    expect(revived(['any'])).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const s = setup([mon(7, 20)], [opponentMon(mon(19, 18))]);
    expect(simulateBattle(s, rngFrom(42)).events).toEqual(simulateBattle(s, rngFrom(42)).events);
  });
});
