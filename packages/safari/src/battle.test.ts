import { describe, expect, it } from 'vitest';
import { int, rngFrom, sample } from '@poke-tcg/campaign';
import { simulateBattle, type BattleEvent, type BattleResult, type Board } from './battle.js';
import { KEYWORDS, SYNERGY_TYPES, TUNING, type TrainerName } from './effects.js';
import { allUnits } from './species.js';
import { KEYWORD_NAMES, parseAbility, type Keyword, type Unit, type UnitType } from './units.js';

/** A unit for a test: its attack, HP, keywords as species.ts writes them, and type. */
const unit = (attack: number, hp: number, words = '', type: UnitType = 'colorless', name = 'Test'): Unit => ({ id: name, dex: 0, name, type, stage: 'basic', hp, attack, tier: 1, abilities: words ? words.split(';').map(parseAbility) : [], evolvesFrom: null });
const wall = (hp = 300) => unit(0, hp);
const fight = (a: Unit[], b: Unit[], seed = 1, trainers: [TrainerName?, TrainerName?] = []): BattleResult =>
  simulateBattle({ units: a, ...(trainers[0] && { trainer: trainers[0] }) }, { units: b, ...(trainers[1] && { trainer: trainers[1] }) }, seed);
type Of<E extends BattleEvent['e']> = Extract<BattleEvent, { e: E }>;
const events = <E extends BattleEvent['e']>(r: BattleResult, e: E, pick: (x: Of<E>) => boolean = () => true) => r.events.filter((x): x is Of<E> => x.e === e && pick(x as Of<E>));
const buffs = (r: BattleResult, uid: string, why: string) => events(r, 'buff', (x) => x.uid === uid && x.why === why).map((x) => x.attack);
const grows = (r: BattleResult, uid: string, why: string) => events(r, 'grow', (x) => x.uid === uid && x.why === why).map((x) => x.hp);
const damages = (r: BattleResult, uid: string, why: string) => events(r, 'damage', (x) => x.uid === uid && x.why === why).map((x) => x.amount);
/** The hits it took, attacks and strikes back, in order. */
const hits = (r: BattleResult, uid: string) => events(r, 'damage', (x) => x.uid === uid && (x.why === 'attack' || x.why === 'strike back')).map((x) => x.amount);
const attacksBy = (r: BattleResult, uid: string) => events(r, 'attack', (x) => x.uid === uid).map((x) => x.target);
const statuses = (r: BattleResult, uid: string) => events(r, 'status', (x) => x.uid === uid && !x.off).map((x) => x.status);
/** The keywords this file's tests name, checked against the list at the end. */
const tested = new Set<Keyword>();
const kw = (...ks: Keyword[]) => ks.forEach((k) => tested.add(k));
const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

describe('a battle', () => {
  it('is a pure function of its boards and seed', () => {
    const all = allUnits();
    const a = all.slice(0, 6);
    const b = all.slice(20, 26);
    expect(fight(a, b, 7)).toEqual(fight(a, b, 7));
    expect(fight(a, b, 7).events).not.toEqual(fight(a, b, 8).events);
  });

  it('always ends, whatever the boards: no round cap, a winner or a draw', () => {
    const all = allUnits();
    const rng = rngFrom(11);
    for (let i = 0; i < 1500; i++) {
      const size = () => 1 + int(rng, 6);
      const r = simulateBattle({ units: sample(rng, all, size()) }, { units: sample(rng, all, size()) }, int(rng, 2 ** 31), { events: false });
      expect(r.capped).toBe(false);
      expect(r.left[0] === 0 || r.left[1] === 0).toBe(true);
    }
  });

  it('ends even when Whirlwind and U-turn keep the orders from their ends, and nothing can hurt', () => {
    const r = fight([unit(0, 50, 'Whirlwind; Regen 10'), unit(0, 50, 'U-turn')], [unit(0, 50, 'Whirlwind; Regen 10'), unit(0, 50, 'U-turn')]);
    kw('Whirlwind', 'U-turn', 'Regen');
    expect(r.capped).toBe(false);
    expect(r.rounds).toBeGreaterThanOrEqual(TUNING.risingFrom);
  });

  it('deals damage both ways at once', () => {
    const r = fight([unit(30, 30)], [unit(30, 30)]);
    expect(r.winner).toBe('draw');
    expect(damages(r, 'a0', 'strike back').concat(damages(r, 'a0', 'attack'))).toEqual([30]);
  });
});

describe('aim', () => {
  it('Taunt is attacked while it stands, but not by Flying', () => {
    kw('Taunt', 'Flying');
    for (const seed of seeds) {
      const r = fight([unit(10, 500)], [wall(), unit(0, 40, 'Taunt'), wall()], seed);
      const targets = attacksBy(r, 'a0');
      const fell = targets.lastIndexOf('b1');
      expect(targets.slice(0, fell + 1).every((t) => t === 'b1')).toBe(true);
    }
    const flying = seeds.flatMap((seed) => attacksBy(fight([unit(10, 500, 'Flying')], [wall(), unit(0, 400, 'Taunt'), wall()], seed), 'a0').slice(0, 3));
    expect(flying.some((t) => t !== 'b1')).toBe(true);
  });

  it('Bodyguard takes the attacks aimed at its neighbours', () => {
    kw('Bodyguard');
    for (const seed of seeds) {
      const r = fight([unit(10, 500)], [wall(), unit(0, 900, 'Bodyguard'), wall()], seed);
      expect(attacksBy(r, 'a0').slice(0, 6).every((t) => t === 'b1')).toBe(true);
    }
  });

  it('Face-off attacks the Pokémon across from it, Sniper the one with the least HP', () => {
    kw('Face-off', 'Sniper');
    for (const seed of seeds) {
      const faceOff = fight([wall(), unit(10, 300, 'Face-off')], [wall(), wall(), wall()], seed);
      expect(attacksBy(faceOff, 'a1').slice(0, 5).every((t) => t === 'b1')).toBe(true);
      const sniper = fight([unit(10, 300, 'Sniper')], [wall(), wall(100), wall()], seed);
      expect(attacksBy(sniper, 'a0').slice(0, 5).every((t) => t === 'b1')).toBe(true);
    }
  });
});

describe('tempo', () => {
  it('Quick attacks once before the order, with no strike back; Reach is never struck back', () => {
    kw('Quick', 'Reach');
    const quick = fight([unit(10, 100, 'Quick')], [unit(50, 100)]);
    expect(quick.events.find((e) => e.e === 'attack')).toMatchObject({ uid: 'a0' });
    const firstHit = quick.events.findIndex((e) => e.e === 'attack');
    const nextAttack = quick.events.findIndex((e, i) => i > firstHit && e.e === 'attack');
    expect(quick.events.slice(firstHit, nextAttack).some((e) => e.e === 'damage' && e.uid === 'a0')).toBe(false);
    const reach = fight([unit(10, 100, 'Reach')], [unit(0, 100, 'Thorns 10')], 2);
    expect(damages(reach, 'a0', 'strike back')).toEqual([]);
  });

  it('Double Strike hits twice; Truant rests after each attack and does not strike back while it rests', () => {
    kw('Double Strike', 'Truant');
    const twice = fight([unit(10, 100, 'Double Strike')], [wall(200)]);
    expect(damages(twice, 'b0', 'attack').length).toBeGreaterThanOrEqual(2 * (attacksBy(twice, 'a0').length - 1));
    expect(attacksBy(twice, 'a0').length).toBeGreaterThan(2);
    const truant = fight([unit(20, 500, 'Truant')], [unit(10, 100)]);
    expect(events(truant, 'miss', (x) => x.uid === 'a0' && x.why === 'Truant').length).toBeGreaterThan(0);
    // It strikes back only to the attacks made on it while it isn't resting: fewer than b0's attacks.
    expect(damages(truant, 'b0', 'strike back').length).toBeLessThan(attacksBy(truant, 'b0').length);
  });
});

describe('damage', () => {
  it('Splash and Cleave reach the target\'s neighbours, Trample carries on past a Knock Out', () => {
    kw('Splash', 'Cleave', 'Trample');
    const splash = fight([unit(10, 500, 'Splash 20; Face-off')], [wall(), wall(), wall()]);
    expect(damages(splash, 'b1', 'Splash')[0]).toBe(20);
    const cleave = fight([wall(), unit(30, 500, 'Cleave; Face-off')], [wall(), wall(), wall()]);
    expect(damages(cleave, 'b0', 'Cleave')[0]).toBe(30);
    expect(damages(cleave, 'b2', 'Cleave')[0]).toBe(30);
    const trample = fight([unit(50, 500, 'Trample; Face-off; Quick')], [wall(20), wall()]);
    expect(damages(trample, 'b1', 'Trample')).toEqual([30]);
  });

  it('Finisher, Bane, Barrage and Recoil', () => {
    kw('Finisher', 'Bane', 'Barrage', 'Recoil');
    expect(hits(fight([unit(10, 500, 'Finisher 20')], [wall(100)]), 'b0').slice(0, 2)).toEqual([10, 30]);
    expect(hits(fight([unit(10, 500, 'Bane water 20')], [unit(0, 100, '', 'water')]), 'b0')[0]).toBe(30);
    expect(hits(fight([unit(10, 500, 'Bane water 20')], [wall(100)]), 'b0')[0]).toBe(10);
    const barrage = fight([unit(0, 500, 'Barrage 20')], [wall(), wall()]);
    expect([damages(barrage, 'b0', 'Barrage'), damages(barrage, 'b1', 'Barrage')]).toEqual([[20], [20]]);
    expect(damages(fight([unit(10, 30, 'Recoil 10')], [wall()]), 'a0', 'Recoil')).toEqual([10, 10, 10]);
  });

  it('Breaker ignores Shields and Armor', () => {
    kw('Breaker', 'Shield', 'Armor');
    const plain = fight([unit(30, 500)], [unit(0, 100, 'Shield; Armor 20')]);
    expect(events(plain, 'blocked', (x) => x.uid === 'b0' && x.why === 'Shield')).toHaveLength(1);
    expect(hits(plain, 'b0')[0]).toBe(10);
    const breaker = fight([unit(30, 500, 'Breaker')], [unit(0, 90, 'Shield; Armor 20')]);
    expect(events(breaker, 'blocked')).toHaveLength(0);
    expect(hits(breaker, 'b0')).toEqual([30, 30, 30]);
  });
});

describe('growing', () => {
  it('Enrage, Rampage, Grow and Scavenger raise attack', () => {
    kw('Enrage', 'Rampage', 'Grow', 'Scavenger');
    expect(buffs(fight([unit(0, 30, 'Enrage 10')], [unit(10, 100)]), 'a0', 'Enrage').length).toBeGreaterThanOrEqual(2);
    expect(buffs(fight([unit(30, 500, 'Rampage 20')], [wall(30), wall(30)]), 'a0', 'Rampage')).toEqual([20, 20]);
    expect(damages(fight([unit(10, 500, 'Grow 10')], [wall(900)]), 'b0', 'attack').slice(0, 3)).toEqual([10, 20, 30]);
    expect(buffs(fight([wall(10), unit(0, 500, 'Scavenger 10')], [unit(50, 500)]), 'a1', 'Scavenger')).toEqual([10]);
  });
});

describe('defence', () => {
  it('Thorns, Sturdy, Evasive, Drain and Counter', () => {
    kw('Thorns', 'Sturdy', 'Evasive', 'Drain', 'Counter');
    expect(damages(fight([unit(10, 100)], [unit(0, 30, 'Thorns 20')]), 'a0', 'Thorns')[0]).toBe(20);
    const sturdy = fight([unit(100, 500)], [unit(0, 50, 'Sturdy')]);
    expect(events(sturdy, 'heal', (x) => x.uid === 'b0' && x.why === 'Sturdy')).toHaveLength(1);
    expect(hits(sturdy, 'b0')).toHaveLength(2);
    const dodges = seeds.reduce((n, seed) => n + events(fight([unit(10, 500)], [unit(0, 100, 'Evasive')], seed), 'blocked', (x) => x.why === 'Evasive').length, 0);
    const landed = seeds.reduce((n, seed) => n + hits(fight([unit(10, 500)], [unit(0, 100, 'Evasive')], seed), 'b0').length, 0);
    expect(dodges / (dodges + landed)).toBeGreaterThan(0.35);
    expect(dodges / (dodges + landed)).toBeLessThan(0.65);
    const drain = fight([unit(40, 100, 'Drain')], [unit(30, 200)]);
    expect(events(drain, 'heal', (x) => x.uid === 'a0' && x.why === 'Drain')[0]!.amount).toBe(20);
    const counter = fight([unit(40, 100)], [unit(0, 300, 'Counter')]);
    expect(damages(counter, 'a0', 'strike back')[0]).toBe(40);
  });
});

describe('neighbours, places and types', () => {
  it('Rally, Fortify, Screen, Pack and Guardian read the Pokémon beside it', () => {
    kw('Rally', 'Fortify', 'Screen', 'Pack', 'Guardian');
    const r = fight([wall(), unit(0, 300, 'Rally 10; Fortify 20; Screen'), wall(), wall()], [wall()]);
    expect([buffs(r, 'a0', 'Rally'), buffs(r, 'a2', 'Rally'), buffs(r, 'a3', 'Rally')]).toEqual([[10], [10], []]);
    expect([grows(r, 'a0', 'Fortify'), grows(r, 'a2', 'Fortify'), grows(r, 'a3', 'Fortify')]).toEqual([[20], [20], []]);
    expect(events(r, 'shield', (x) => x.on).map((x) => x.uid)).toEqual(['a2']);
    const pack = fight([unit(0, 300, '', 'grass'), unit(10, 300, 'Pack 10', 'grass'), unit(0, 300, '', 'fire')], [wall()]);
    expect(buffs(pack, 'a1', 'Pack')).toEqual([10]);
    const guardian = fight([unit(0, 300, 'Guardian 10'), unit(0, 300, 'Taunt')], [unit(30, 500)]);
    expect(damages(guardian, 'a1', 'attack')[0]).toBe(20);
  });

  it('Mend, Baton Pass and Legacy', () => {
    kw('Mend', 'Baton Pass', 'Legacy');
    const mend = fight([unit(0, 100, 'Taunt'), unit(0, 300, 'Mend 10; Baton Pass 20'), wall()], [unit(30, 500)], 3);
    expect(events(mend, 'heal', (x) => x.uid === 'a0' && x.why === 'Mend').length).toBeGreaterThan(0);
    expect(buffs(mend, 'a2', 'Baton Pass')[0]).toBe(20);
    const legacy = fight([wall(), unit(0, 10, 'Legacy 20; Taunt'), wall(), wall()], [unit(50, 500)]);
    expect([buffs(legacy, 'a0', 'Legacy'), buffs(legacy, 'a2', 'Legacy'), buffs(legacy, 'a3', 'Legacy')]).toEqual([[20], [20], []]);
  });

  it('Vanguard, Rearguard, Leader and Loner', () => {
    kw('Vanguard', 'Rearguard', 'Leader', 'Loner');
    const both = 'Vanguard 10; Rearguard 20';
    const r = fight([unit(0, 300, both), unit(0, 300, both), unit(0, 300, both)], [wall()]);
    expect([buffs(r, 'a0', 'Vanguard'), buffs(r, 'a1', 'Vanguard'), buffs(r, 'a2', 'Vanguard')]).toEqual([[10], [], []]);
    expect([grows(r, 'a0', 'Rearguard'), grows(r, 'a1', 'Rearguard'), grows(r, 'a2', 'Rearguard')]).toEqual([[], [], [20]]);
    const leader = fight([unit(0, 300, 'Leader 20', 'water'), unit(0, 300, '', 'fire'), unit(0, 300, '', 'water')], [wall()]);
    expect([buffs(leader, 'a0', 'Leader'), buffs(leader, 'a1', 'Leader'), buffs(leader, 'a2', 'Leader')]).toEqual([[], [], [20]]);
    const loner = fight([unit(0, 300, 'Loner 20', 'darkness'), unit(0, 300, 'Loner 20', 'fire'), unit(0, 300, '', 'fire')], [wall()]);
    expect([buffs(loner, 'a0', 'Loner'), grows(loner, 'a0', 'Loner'), buffs(loner, 'a1', 'Loner')]).toEqual([[20], [20], []]);
  });
});

describe('across', () => {
  it('Intimidate, Pounce, Glare, Supersonic and Will-O-Wisp reach the Pokémon in the same place', () => {
    kw('Intimidate', 'Pounce', 'Glare', 'Supersonic', 'Will-O-Wisp');
    const r = fight([wall(), unit(0, 300, 'Intimidate 20; Pounce 10; Glare; Will-O-Wisp')], [unit(30, 300), unit(30, 300), unit(30, 300)]);
    expect([buffs(r, 'b0', 'Intimidate'), buffs(r, 'b1', 'Intimidate'), buffs(r, 'b2', 'Intimidate')]).toEqual([[], [-20], []]);
    expect(damages(r, 'b1', 'Pounce')).toEqual([10]);
    expect(statuses(r, 'b1').slice(0, 2).sort()).toEqual(['burned', 'paralyzed']);
    expect(statuses(r, 'b0')).toEqual([]);
    expect(statuses(fight([unit(0, 300, 'Supersonic')], [unit(0, 300)]), 'b0')).toEqual(['confused']);
  });

  it('Transform becomes the Pokémon across from it; Sketch takes the keywords of the ally on its left', () => {
    kw('Transform', 'Sketch');
    const r = fight([unit(10, 40, 'Transform')], [unit(50, 200, 'Armor 10', 'metal')]);
    expect(events(r, 'become')[0]).toMatchObject({ uid: 'a0', attack: 50, hp: 200, type: 'metal', abilities: [{ k: 'Armor', n: 10 }] });
    const sketch = fight([unit(0, 300, 'Thorns 10; Taunt'), unit(0, 300, 'Sketch; Taunt')], [unit(10, 500)]);
    expect(events(sketch, 'become')[0]!.abilities.map((a) => a.k)).toEqual(['Sketch', 'Taunt', 'Thorns']);
  });
});

describe('moving', () => {
  it('Roar sends the Pokémon across to the end of its line before anything else', () => {
    kw('Roar');
    // b0, with Rally, is sent to the end: its neighbour is then b2 alone.
    const r = fight([unit(0, 300, 'Roar')], [unit(0, 300, 'Rally 10'), wall(), wall()]);
    expect(events(r, 'move', (x) => x.why === 'Roar').map((x) => x.uid)).toEqual(['b0']);
    expect([buffs(r, 'b1', 'Rally'), buffs(r, 'b2', 'Rally')]).toEqual([[], [10]]);
  });

  it('Whirlwind moves its target, U-turn itself', () => {
    const whirl = fight([unit(10, 300, 'Whirlwind; Face-off')], [wall(), wall()]);
    expect(events(whirl, 'move', (x) => x.why === 'Whirlwind')[0]!.uid).toBe('b0');
    const turn = fight([unit(10, 300, 'U-turn'), wall()], [wall()]);
    expect(events(turn, 'move', (x) => x.why === 'U-turn')[0]!.uid).toBe('a0');
  });
});

describe('fainting', () => {
  it('Explode, Destiny Bond, Family and Memento', () => {
    kw('Explode', 'Destiny Bond', 'Family', 'Memento');
    const explode = fight([unit(0, 10, 'Explode 20')], [unit(50, 300), wall()]);
    expect([damages(explode, 'b0', 'Explode'), damages(explode, 'b1', 'Explode')]).toEqual([[20], [20]]);
    const bond = fight([unit(0, 10, 'Destiny Bond')], [unit(50, 300)]);
    expect(bond.winner).toBe('draw');
    const family = fight([unit(30, 50, 'Family')], [unit(50, 300)]);
    expect(events(family, 'join', (x) => x.why === 'Family')[0]).toMatchObject({ attack: 20, hp: 30 });
    const memento = fight([unit(0, 10, 'Memento 20'), wall()], [unit(50, 300)]);
    expect(buffs(memento, 'b0', 'Memento')).toEqual([-20]);
  });
});

describe('Special Conditions', () => {
  it('Paralyze flips a coin: a Paralyzed Pokémon misses its next attack and does not strike back until then', () => {
    kw('Paralyze', 'Static');
    const all = seeds.map((seed) => fight([unit(10, 500, 'Paralyze')], [unit(10, 500)], seed));
    const paralyzed = all.reduce((n, r) => n + statuses(r, 'b0').filter((s) => s === 'paralyzed').length, 0);
    expect(paralyzed).toBeGreaterThan(0);
    for (const r of all) expect(events(r, 'miss', (x) => x.uid === 'b0' && x.why === 'Paralyzed').length).toBeLessThanOrEqual(statuses(r, 'b0').length);
    const stat = seeds.map((seed) => fight([unit(10, 500)], [unit(0, 500, 'Static')], seed));
    expect(stat.some((r) => statuses(r, 'a0').includes('paralyzed'))).toBe(true);
  });

  it('Confuse: tails does 30 to itself, which ends it', () => {
    kw('Confuse', 'Cute Charm');
    const all = seeds.map((seed) => fight([unit(10, 500, 'Confuse')], [unit(10, 500)], seed));
    expect(all.some((r) => damages(r, 'b0', 'Confused').includes(TUNING.confusion))).toBe(true);
    for (const r of all) expect(damages(r, 'b0', 'Confused').length).toBeLessThanOrEqual(statuses(r, 'b0').length);
    expect(statuses(fight([unit(10, 500)], [unit(0, 500, 'Cute Charm')]), 'a0')[0]).toBe('confused');
  });

  it('Burn halves the attack of the Pokémon hit, its strike back to that hit too, until its next attack is made', () => {
    kw('Burn', 'Flame Body');
    const r = fight([unit(0, 500, 'Burn; Quick')], [unit(50, 500)]);
    // Burned as it's hit: 50 is halved and rounded up to 30 for its strike back and its next attack.
    const taken = [...damages(r, 'a0', 'strike back'), ...damages(r, 'a0', 'attack')];
    expect(taken.every((d) => d === 30)).toBe(true);
    expect(events(r, 'status', (x) => x.uid === 'b0' && x.status === 'burned' && !!x.off).length).toBeGreaterThan(0);
    const body = fight([unit(40, 500)], [unit(0, 500, 'Flame Body')]);
    expect(statuses(body, 'a0')[0]).toBe('burned');
    expect(hits(body, 'b0').slice(0, 2)).toEqual([40, 20]);
  });

  it('Paralyzed and Confused replace each other, Burned sits beside them; Safeguard and Full Heal keep all three off', () => {
    kw('Safeguard');
    const r = fight([unit(0, 500, 'Glare; Supersonic; Will-O-Wisp')], [unit(0, 500)]);
    expect(statuses(r, 'b0').sort()).toEqual(['burned', 'confused', 'paralyzed']);
    expect(events(r, 'miss', (x) => x.uid === 'b0' && x.why === 'Paralyzed')).toHaveLength(0); // Confused came last
    const opener = 'Glare; Will-O-Wisp';
    expect(statuses(fight([unit(0, 500, opener)], [unit(0, 500, 'Safeguard')]), 'b0')).toEqual([]);
    const beside = fight([unit(0, 500, opener), unit(0, 500, opener), unit(0, 500, opener)], [unit(0, 500), unit(0, 500, 'Safeguard'), unit(0, 500), unit(0, 500)]);
    expect([statuses(beside, 'b0'), statuses(beside, 'b2')]).toEqual([[], []]);
    expect(statuses(fight([unit(0, 500, opener)], [unit(0, 500)], 1, [undefined, 'Full Heal']), 'b0')).toEqual([]);
  });
});

describe('other keywords', () => {
  it('Weaken and Pay Day', () => {
    kw('Weaken', 'Pay Day');
    expect(buffs(fight([unit(10, 500, 'Weaken 10')], [unit(30, 100)]), 'b0', 'Weaken')[0]).toBe(-10);
    expect(fight([unit(50, 500, 'Pay Day')], [wall(10), wall(10)]).payDays).toEqual([2, 0]);
  });

  it('every keyword has its words and a test here', () => {
    for (const k of KEYWORD_NAMES) expect(KEYWORDS[k].text({ k, n: 10, type: 'water' }).length, k).toBeGreaterThan(10);
    expect(KEYWORD_NAMES.filter((k) => !tested.has(k))).toEqual([]);
  });
});

describe('type synergies', () => {
  const six = (type: UnitType, attack = 10, hp = 100) => Array.from({ length: 6 }, () => unit(attack, hp, '', type));
  const board = (units: Unit[]): Board => ({ units });

  it('are counted at 2, 4 and 6 of a type, and can be muted', () => {
    const r = simulateBattle(board([...six('grass').slice(0, 4), ...six('fire').slice(0, 2)]), board([unit(0, 100)]), 1);
    expect(events(r, 'synergy').map((x) => [x.type, x.level])).toEqual([['grass', 2], ['fire', 1]]);
    expect(events(simulateBattle(board(six('grass')), board([unit(0, 100)]), 1, { mute: [['grass']] }), 'synergy')).toEqual([]);
    expect(SYNERGY_TYPES).toHaveLength(9);
  });

  it('Leech heals Grass Pokémon as they hit; Blaze burns and adds damage to the Burned', () => {
    const leech = fight([unit(10, 100, '', 'grass'), unit(10, 100, '', 'grass')], [unit(20, 500)]);
    expect(events(leech, 'heal', (x) => x.why === 'Leech')[0]!.amount).toBe(TUNING.grass[0]);
    // Double Strike's second hit finds its target Burned by the first.
    const blaze = fight([unit(10, 500, 'Double Strike; Quick', 'fire'), unit(10, 500, '', 'fire')], [unit(0, 500)]);
    expect(statuses(blaze, 'b0')[0]).toBe('burned');
    expect(damages(blaze, 'b0', 'attack').slice(0, 2)).toEqual([10, 10 + TUNING.fire[0]!]);
  });

  it('Current, Pressure, Versatile and Plating read the board', () => {
    const current = fight([unit(0, 100, '', 'water'), unit(0, 100, '', 'water'), unit(0, 100, '', 'fire'), unit(0, 100, '', 'water')], [wall()]);
    expect([grows(current, 'a0', 'Current'), grows(current, 'a1', 'Current'), grows(current, 'a3', 'Current')]).toEqual([[10], [10], []]);
    const pressure = fight([unit(0, 100, '', 'psychic'), unit(0, 100, '', 'psychic')], [unit(30, 100), unit(30, 100), unit(30, 100)]);
    expect([buffs(pressure, 'b0', 'Pressure'), buffs(pressure, 'b1', 'Pressure'), buffs(pressure, 'b2', 'Pressure')]).toEqual([[-10], [-10], []]);
    const versatile = fight([unit(0, 100), unit(0, 100), unit(0, 100, '', 'fire'), unit(0, 100, '', 'water')], [wall()]);
    expect(grows(versatile, 'a0', 'Versatile')).toEqual([20]);
    const plating = fight([unit(0, 100, 'Taunt', 'fire'), unit(0, 100, '', 'metal'), unit(0, 100, '', 'metal')], [unit(30, 500)]);
    expect(damages(plating, 'a0', 'attack')[0]).toBe(20);
  });

  it('Quick, Duel and Prey', () => {
    const quick = fight([unit(10, 100, '', 'lightning'), unit(10, 100, '', 'lightning')], [unit(0, 500)]);
    expect(quick.events.filter((e) => e.e === 'attack').slice(0, 1)).toMatchObject([{ uid: 'a0' }]);
    for (const seed of seeds) {
      const duel = fight([unit(10, 300, '', 'fighting'), unit(10, 300, '', 'fighting')], [wall(), wall(), wall()], seed);
      expect(attacksBy(duel, 'a1').slice(0, 4).every((t) => t === 'b1')).toBe(true);
      expect(damages(duel, 'b1', 'attack')[0]).toBe(10 + TUNING.fighting[0]!);
      expect(damages(duel, 'b0', 'attack')[0]).toBe(10 + TUNING.fighting[0]!);
    }
    const prey = fight([unit(10, 500, '', 'darkness'), unit(10, 500, '', 'darkness')], [wall(200)]);
    expect(hits(prey, 'b0').slice(0, 2)).toEqual([10, 10 + TUNING.darkness[0]!]);
  });
});

describe('Trainers', () => {
  it('PlusPower, Defender and Clefairy Doll read places; the Energy Removals the most attack', () => {
    const plus = fight([unit(10, 100), unit(10, 100), unit(10, 100)], [wall()], 1, ['PlusPower']);
    expect([buffs(plus, 'a0', 'PlusPower'), buffs(plus, 'a1', 'PlusPower'), buffs(plus, 'a2', 'PlusPower')]).toEqual([[TUNING.plusPower], [TUNING.plusPower], []]);
    const defender = fight([wall(), wall(), wall()], [unit(30, 500)], 1, ['Defender']);
    expect(events(defender, 'shield', (x) => x.on).map((x) => x.uid)).toEqual(['a0', 'a2']);
    const doll = fight([wall(100), wall(100)], [unit(10, 500)], 1, ['Clefairy Doll']);
    expect(events(doll, 'become')[0]).toMatchObject({ uid: 'a1', hp: 100 + TUNING.clefairyDoll, why: 'Clefairy Doll' });
    expect(attacksBy(doll, 'b0').slice(0, 3)).toEqual(['a1', 'a1', 'a1']);
    const removal = fight([wall()], [unit(30, 100), unit(50, 100), unit(40, 100)], 1, ['Super Energy Removal']);
    expect([buffs(removal, 'b0', 'Super Energy Removal'), buffs(removal, 'b1', 'Super Energy Removal'), buffs(removal, 'b2', 'Super Energy Removal')]).toEqual([[], [-20], [-20]]);
  });

  it('Potion and Super Potion heal neighbours', () => {
    // The Taunt Pokémon falls under half on the second hit: it heals 30, its neighbour 30 too (it had been hit).
    const potion = fight([unit(0, 100), unit(0, 100, 'Taunt')], [unit(30, 900, 'Splash 10')], 1, ['Potion']);
    expect(events(potion, 'heal', (x) => x.why === 'Potion').map((x) => [x.uid, x.amount])).toEqual([['a1', 30], ['a0', 30]]);
    const superPotion = fight([unit(0, 100), unit(0, 20, 'Taunt'), unit(0, 100)], [unit(30, 900, 'Splash 10')], 1, ['Super Potion']);
    expect(events(superPotion, 'heal', (x) => x.why === 'Super Potion').slice(0, 2).map((x) => [x.uid, x.amount])).toEqual([['a0', 10], ['a2', 10]]);
  });

  it('Gust of Wind aims the first 2 attacks at the most attack, with no strike back, past a Taunt', () => {
    const r = fight([unit(10, 500)], [unit(0, 300, 'Taunt'), unit(50, 300)], 1, ['Gust of Wind']);
    expect(attacksBy(r, 'a0').slice(0, 3)).toEqual(['b1', 'b1', 'b0']);
    expect(damages(r, 'a0', 'strike back')).toEqual([]);
  });

  it('Revive and Scoop Up bring a Pokémon back; Imposter Professor Oak counts 2 fewer', () => {
    expect(events(fight([unit(0, 20)], [unit(50, 500)], 1, ['Revive']), 'join', (x) => x.why === 'Revive')).toHaveLength(1);
    expect(events(fight([unit(0, 20), wall(10)], [unit(50, 500)], 1, ['Scoop Up']), 'join', (x) => x.why === 'Scoop Up')).toHaveLength(1);
    const r = fight([unit(0, 100, '', 'grass'), unit(0, 100, '', 'grass'), unit(0, 100, '', 'grass')], [wall()], 1, [undefined, 'Imposter Professor Oak']);
    expect(events(r, 'synergy')).toEqual([]);
  });
});
