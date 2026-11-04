import { rngFrom } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { Battle, simulateBattle, type BattleSetup } from './battle.js';
import { moveData } from './data.js';
import { MOVES as JOHTO_MOVES } from './data/gen2/moves.js';
import { EFFECTS } from './moves.js';
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

/** A level-30 battle (Kanto: Charmander on Bulbasaur; Johto: Cyndaquil on Chikorita), every random roll 0 unless given. */
function duel(johtoBattle: boolean, roll = 0) {
  const b = johtoBattle ? new Battle(setup([mon(155, 30)], [mon(152, 30)]), rngFrom(1)) : new Battle(setup([mon(4, 30)], [mon(1, 30)]), rngFrom(1));
  b.random16 = () => roll;
  b.roll = () => roll;
  return b;
}
const endTurn = (b: Battle) => b['endOfTurn']();

describe('rules both generations share (checked against pokefirered)', () => {
  it("releases Bide's stored energy on the foe, not the user", () => {
    const b = duel(false);
    const [u, f] = b.active;
    u.v.bide = { turns: 1, damage: 10 };
    b.useMove(u, 'bide');
    expect(f.hp).toBe(f.maxHp - 20);
    expect(u.hp).toBe(u.maxHp);
  });

  it("takes Toxic's sixteenth, rounded, times the count", () => {
    const b = duel(false);
    const f = b.active[1];
    f.status = 'toxic';
    f.toxicCount = 1;
    endTurn(b);
    expect(f.maxHp - f.hp).toBe(Math.max(1, Math.floor(f.maxHp / 16)) * 2);
  });

  it('hurts with Spikes by 1/8, 1/6 and 1/4', () => {
    const b = duel(false);
    const f = b.active[1];
    b.sides[1].spikes = 2;
    b.sendOut(f);
    expect(f.maxHp - f.hp).toBe(Math.floor(f.maxHp / 6));
  });

  it('faints a Perish Song listener at the fourth end of turn', () => {
    const b = duel(false);
    const u = b.active[0];
    u.v.perish = 3;
    for (let i = 0; i < 3; i++) endTurn(b);
    expect(u.hp).toBe(u.maxHp);
    endTurn(b);
    expect(u.hp).toBe(0);
  });

  it("ends Destiny Bond and Rage as their user moves on, Lock-On at the next turn's end", () => {
    const b = duel(false);
    const u = b.active[0];
    u.v.destinyBond = true;
    u.v.rage = true;
    b.useMove(u, 'growl');
    expect(u.v.destinyBond).toBeUndefined();
    expect(u.v.rage).toBeUndefined();
    b.useMove(u, 'lock-on');
    expect(u.v.lockOn).toBe(2);
    endTurn(b);
    expect(u.v.lockOn).toBe(1);
    endTurn(b);
    expect(u.v.lockOn).toBeUndefined();
  });

  it("fails Rest while asleep, Protect for the last to move, and the foe's Thief", () => {
    const b = duel(false);
    const [u, f] = b.active;
    u.status = 'sleep';
    u.sleepTurns = 2;
    u.hp = 1;
    b.useMove(u, 'rest');
    expect(u.hp).toBe(1);
    b.movedThisTurn.add(1);
    b.useMove(u, 'protect');
    expect(u.v.protect).toBeUndefined();
    u.item = 'leftovers';
    b.useMove(f, 'thief');
    expect([u.item, f.item]).toEqual(['leftovers', null]);
  });
});

describe("Gen 4's changes to the Gen 3 effects", () => {
  it('raises Sp. Def with Charge, and Defense and Sp. Def with Stockpile until Spit Up', () =>
    johto(() => {
      const b = duel(true);
      const u = b.active[0];
      b.useMove(u, 'charge');
      expect(u.stages.spd).toBe(1);
      u.stages.spd = 0;
      b.useMove(u, 'stockpile');
      expect([u.stages.def, u.stages.spd]).toEqual([1, 1]);
      b.useMove(u, 'spit-up');
      expect([u.stages.def, u.stages.spd]).toEqual([0, 0]);
    }));

  it('lasts Taunt 3–5 turns and Disable 4–7', () =>
    johto(() => {
      const b = duel(true, 2);
      const [u, f] = b.active;
      b.useMove(u, 'taunt');
      expect(f.v.taunt).toBe(5);
      f.lastMove = 'tackle';
      b.useMove(u, 'disable');
      expect(f.v.disabled).toEqual({ move: 'tackle', turns: 6 });
    }));

  it('skips a charge turn with the Power Herb, and lengthens rain with the Damp Rock', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      u.item = 'power-herb';
      b.useMove(u, 'solar-beam');
      expect(f.hp).toBeLessThan(f.maxHp);
      expect([u.item, u.v.charging]).toEqual([null, undefined]);
      u.item = 'damp-rock';
      b.useMove(u, 'rain-dance');
      expect(b.weather).toEqual({ kind: 'rain', turns: 8 });
    }));

  it('misses a sure-hit move on a target out of reach (Kanto hits)', () => {
    for (const gen4 of [true, false]) {
      const run = () => {
        const b = duel(gen4);
        const [u, f] = b.active;
        f.v.semiInvulnerable = 'air';
        b.useMove(u, 'swift');
        return f.hp < f.maxHp;
      };
      expect(gen4 ? johto(run) : run()).toBe(!gen4);
    }
  });

  it('reads Leaf Guard, Mold Breaker and Magic Guard', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      f.ability = 'leaf-guard';
      b.weather = { kind: 'sun', turns: 5 };
      expect(b.canStatus(f, 'sleep', u)).toBe(false);
      u.ability = 'mold-breaker';
      expect(b.canStatus(f, 'sleep', u)).toBe(true);
      b.weather = null;
      f.ability = 'magic-guard';
      f.status = 'poison';
      endTurn(b);
      expect(f.hp).toBe(f.maxHp);
    }));
});

describe("Gen 4's own effects", () => {
  it('has an implementation for every Johto move', () => {
    expect([...new Set(Object.values(JOHTO_MOVES).map((m) => m.effect))].filter((e) => !EFFECTS[e])).toEqual([]);
  });

  it('roosts, grounding a Flying type for the turn', () =>
    johto(() => {
      const b = new Battle(setup([mon(155, 30)], [mon(16, 30)]), rngFrom(1));
      b.random16 = () => 0;
      const [u, f] = b.active;
      expect(b.immune(u, f, 'ground')).toBe(true);
      f.hp = 10;
      b.useMove(f, 'roost');
      expect(f.hp).toBe(10 + Math.floor(f.maxHp / 2));
      expect(b.immune(u, f, 'ground')).toBe(false);
    }));

  it('lays Stealth Rock and Toxic Spikes for the next Pokémon in', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      b.useMove(u, 'stealth-rock');
      b.useMove(u, 'toxic-spikes');
      b.sendOut(f);
      // Rock on Grass is neutral: an eighth; one layer of Toxic Spikes poisons.
      expect(f.maxHp - f.hp).toBe(Math.floor(f.maxHp / 8));
      expect(f.status).toBe('poison');
    }));

  it('doubles Speed with Tailwind and turns the order round with Trick Room', () =>
    johto(() => {
      const b = duel(true);
      const u = b.active[0];
      const before = b.speed(u);
      b.useMove(u, 'tailwind');
      expect(b.speed(u)).toBe(before * 2);
      const order = (b2: Battle) => b2['order']([{ kind: 'move', move: 'tackle' }, { kind: 'move', move: 'tackle' }]);
      const b2 = duel(true);
      const fast = order(b2);
      b2.trickRoom = 5;
      expect(order(b2)).toEqual([...fast].reverse());
    }));

  it('bans Fly under Gravity and healing moves under Heal Block', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      b.useMove(u, 'gravity');
      expect(b.gravity).toBe(5);
      expect(b.selectable(u, 'fly')).toBe(false);
      b.useMove(u, 'heal-block');
      expect(f.v.healBlock).toBe(5);
      expect(b.selectable(f, 'roost')).toBe(false);
    }));

  it('fails Sucker Punch against a status move, and doubles Assurance after damage', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      b.turnActions = [{ kind: 'move', move: 'sucker-punch' }, { kind: 'move', move: 'growl' }];
      b.useMove(u, 'sucker-punch');
      expect(f.hp).toBe(f.maxHp);
      b.turnActions = [{ kind: 'move', move: 'sucker-punch' }, { kind: 'move', move: 'tackle' }];
      b.useMove(u, 'sucker-punch');
      expect(f.hp).toBeLessThan(f.maxHp);
      const once = f.maxHp - f.hp;
      f.hp = f.maxHp;
      f.v.lostHp = false;
      b.useMove(u, 'assurance');
      const plain = f.maxHp - f.hp;
      f.hp = f.maxHp;
      b.useMove(u, 'assurance');
      expect(f.maxHp - f.hp).toBeGreaterThan(plain);
      expect(once).toBeGreaterThan(0);
    }));

  it('takes Struggle recoil from max HP, and Close Combat its user\x27s defenses', () =>
    johto(() => {
      const b = duel(true);
      const u = b.active[0];
      b.useMove(u, 'struggle');
      expect(u.maxHp - u.hp).toBe(Math.floor(u.maxHp / 4));
      b.useMove(u, 'close-combat');
      expect([u.stages.def, u.stages.spd]).toEqual([-1, -1]);
    }));

  it('heals the next Pokémon with Healing Wish, and powers Trump Card by its uses', () =>
    johto(() => {
      const b = new Battle(setup([mon(155, 30), mon(158, 30)], [mon(152, 30)]), rngFrom(1));
      b.random16 = () => 0;
      const [u, f] = b.active;
      const next = b.party[1]!;
      next.hp = 1;
      next.status = 'burn';
      b.useMove(u, 'healing-wish');
      expect(u.hp).toBe(0);
      b.sendOut(next);
      expect([next.hp, next.status]).toEqual([next.maxHp, null]);
      for (let i = 0; i < 5; i++) b.useMove(f, 'trump-card');
      expect(f.v.trumpUses).toBe(5);
      expect(b.selectable(f, 'trump-card')).toBe(false);
    }));
});

describe("Gen 4's abilities", () => {
  it('starts permanent rain with Drizzle, and ends Slow Start after 5 turns', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      u.ability = 'drizzle';
      b.sendOut(u);
      expect(b.weather).toMatchObject({ kind: 'rain', permanent: true });
      for (let i = 0; i < 8; i++) endTurn(b);
      expect(b.weather?.kind).toBe('rain');
      f.ability = 'slow-start';
      b.sendOut(f);
      const slow = b.speed(f);
      for (let i = 0; i < 5; i++) endTurn(b);
      expect(f.v.slowStart).toBe(5);
      expect(b.speed(f)).toBe(slow * 2);
    }));

  it('reads Intimidate (not through a Substitute) and Download', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      u.ability = 'intimidate';
      f.v.substitute = 10;
      b.sendOut(u);
      expect(f.stages.atk).toBe(0);
      delete f.v.substitute;
      b.sendOut(u);
      expect(f.stages.atk).toBe(-1);
      u.ability = 'download';
      b.sendOut(u);
      // Chikorita's Defense and Sp. Def are equal: Sp. Atk up.
      expect(u.stages.spa).toBe(1);
    }));

  it('hurts a contact attacker with Rough Skin and Static, not through a Substitute', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      f.ability = 'rough-skin';
      b.useMove(u, 'tackle');
      expect(u.maxHp - u.hp).toBe(Math.floor(u.maxHp / 8));
      u.hp = u.maxHp;
      f.v.substitute = 999;
      b.useMove(u, 'tackle');
      expect(u.hp).toBe(u.maxHp);
      delete f.v.substitute;
      f.ability = 'static';
      b.useMove(u, 'tackle');
      expect(u.status).toBe('paralysis');
    }));

  it('absorbs with Volt Absorb and Motor Drive, past which Mold Breaker gets, and guards with Wonder Guard', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      f.ability = 'motor-drive';
      b.useMove(u, 'thunder-shock');
      expect([f.hp, f.stages.spe]).toEqual([f.maxHp, 1]);
      u.ability = 'mold-breaker';
      b.useMove(u, 'thunder-shock');
      expect(f.hp).toBeLessThan(f.maxHp);
      f.hp = f.maxHp;
      u.ability = 'blaze';
      f.ability = 'wonder-guard';
      b.useMove(u, 'tackle');
      expect(f.hp).toBe(f.maxHp);
      b.useMove(u, 'ember');
      expect(f.hp).toBeLessThan(f.maxHp);
    }));

  it('loafs every other turn with Truant, and Klutz turns its item off', () =>
    johto(() => {
      const b = duel(true);
      const u = b.active[0];
      u.ability = 'truant';
      b.sendOut(u);
      const acts = [1, 2, 3, 4].map((t) => {
        b.tick = t;
        return b['canMove'](u, 'tackle');
      });
      expect(acts).toEqual([true, false, true, false]);
      u.ability = 'klutz';
      u.item = 'leftovers';
      expect(b.holdEffect(u)).toBe('none');
    }));

  it('maxes Attack on a critical hit with Anger Point, and changes type with Color Change', () =>
    johto(() => {
      const b = duel(true);
      const [u, f] = b.active;
      f.ability = 'anger-point';
      b.random16 = () => 0;
      b.useMove(u, 'tackle');
      expect(f.stages.atk).toBe(6);
      f.hp = f.maxHp;
      b.random16 = () => 1;
      f.ability = 'color-change';
      b.useMove(u, 'ember');
      expect(f.types).toEqual(['fire']);
    }));
});
