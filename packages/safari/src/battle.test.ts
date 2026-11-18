import { int, rngFrom, sample } from '@poke-tcg/campaign';
import type { EnergyType } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleEvent, type BattleResult, type Board } from './battle.js';
import { KEYWORDS, SPEC, TRAINERS, TRAINER_NAMES, TUNING, synergyLevel, type TrainerName } from './effects.js';
import { gen1Units } from './gen1.js';
import { KEYWORD_NAMES, type Unit } from './units.js';

const TYPES: EnergyType[] = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless'];
let made = 0;
/** A test unit: 10 attack, 100 HP, each of a different type from the last 6, so a line of them has no synergy. */
const unit = (over: Partial<Unit> = {}): Unit => ({ id: `test-${made}`, name: `Test ${made}`, type: TYPES[made++ % TYPES.length]!, stage: 'basic', hp: 100, attack: 10, tier: 1, evolvesFrom: null, ...over });
const side = (b: Unit[] | Board): Board => (Array.isArray(b) ? { units: b } : b);
const play = (a: Unit[] | Board, b: Unit[] | Board, seed = 1) => simulateBattle(side(a), side(b), seed);
const events = <E extends BattleEvent['e']>(r: BattleResult, e: E) => r.events.filter((x): x is Extract<BattleEvent, { e: E }> => x.e === e);
const damage = (r: BattleResult, uid: string, why?: string) => events(r, 'damage').filter((d) => d.uid === uid && (!why || d.why === why));
/** The battles of seeds 1 to `n`: a rule that hangs on a coin is checked on each. */
const seeds = (n: number, a: Unit[] | Board, b: Unit[] | Board) => Array.from({ length: n }, (_, i) => play(a, b, i + 1));

describe('a battle', () => {
  const units = gen1Units();

  it('is the same from the same boards and seed', () => {
    const rng = rngFrom(11);
    for (let i = 0; i < 50; i++) {
      const a = { units: sample(rng, units, 6), trainer: TRAINER_NAMES[int(rng, TRAINER_NAMES.length)]! };
      const b = { units: sample(rng, units, 6) };
      const seed = int(rng, 2 ** 31);
      expect(simulateBattle(a, b, seed)).toEqual(simulateBattle(a, b, seed));
    }
  });

  it('always ends, never by the round cap, whatever the boards and Trainers', () => {
    const rng = rngFrom(5);
    for (let i = 0; i < 4000; i++) {
      const board = (): Board => ({ units: sample(rng, units, 1 + int(rng, 6)), ...(int(rng, 2) ? { trainer: TRAINER_NAMES[int(rng, TRAINER_NAMES.length)]! } : {}) });
      const r = simulateBattle(board(), board(), int(rng, 2 ** 31), { events: i % 10 === 0 });
      expect(r.capped).toBe(false);
      expect(r.winner).toBe(!!r.left[0] === !!r.left[1] ? 'draw' : r.left[0] ? 0 : 1);
    }
  });

  it('ends when neither side can hurt the other: rising damage', () => {
    const wall = () => unit({ attack: 10, hp: 30, keyword: 'Harden' });
    const r = play([wall()], [wall()]);
    expect(r.capped).toBe(false);
    expect(r.rounds).toBeGreaterThanOrEqual(TUNING.risingFrom);
    expect(damage(r, 'a0').every((d) => d.amount === TUNING.rising * (r.rounds - TUNING.risingFrom + 1) || d.amount % TUNING.rising === 0)).toBe(true);
    expect(events(r, 'round').find((x) => x.round === TUNING.risingFrom)?.rising).toBe(TUNING.rising);
  });

  it('favours neither side: mirrored boards win as often from either', () => {
    const rng = rngFrom(3);
    let a = 0;
    let first = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const board = { units: sample(rng, units, 6) };
      const r = simulateBattle(board, board, int(rng, 2 ** 31), { events: false });
      a += r.winner === 'draw' ? 0.5 : r.winner === 0 ? 1 : 0;
      first += r.first === 0 ? 1 : 0;
    }
    expect(a / n).toBeGreaterThan(0.47);
    expect(a / n).toBeLessThan(0.53);
    expect(first / n).toBeGreaterThan(0.47);
    expect(first / n).toBeLessThan(0.53);
  });

  it('deals damage both ways at once: two Pokémon that Knock each other Out draw', () => {
    const r = play([unit({ attack: 30, hp: 30 })], [unit({ attack: 30, hp: 30 })]);
    expect(r.winner).toBe('draw');
    expect(events(r, 'attack')).toHaveLength(1);
    expect(events(r, 'faint').map((f) => f.uid).sort()).toEqual(['a0', 'b0']);
  });

  it("alternates sides, each side's Pokémon attacking left to right and round again", () => {
    const r = play([unit(), unit(), unit()], [unit({ hp: 200 }), unit({ hp: 200 })]);
    const attacks = events(r, 'attack').map((x) => x.uid);
    expect(attacks.map((uid) => uid[0]).slice(0, 6)).toEqual(r.first === 0 ? ['a', 'b', 'a', 'b', 'a', 'b'] : ['b', 'a', 'b', 'a', 'b', 'a']);
    expect(attacks.filter((uid) => uid[0] === 'a').slice(0, 7)).toEqual(['a0', 'a1', 'a2', 'a0', 'a1', 'a2', 'a0']);
    expect(attacks.filter((uid) => uid[0] === 'b').slice(0, 5)).toEqual(['b0', 'b1', 'b0', 'b1', 'b0']);
  });

  it('passes the attack to the next living Pokémon on the right when one faints', () => {
    // b0 Knocks Out whichever of a's it hits; a's order goes on from the one after its last attacker.
    for (const r of seeds(20, [unit({ hp: 10 }), unit({ hp: 10 }), unit({ hp: 10 }), unit({ hp: 10 })], [unit({ hp: 500, attack: 50 })])) {
      const gone = new Set<string>();
      let last = -1;
      for (const e of r.events) {
        if (e.e === 'faint') gone.add(e.uid);
        if (e.e !== 'attack' || e.uid[0] !== 'a') continue;
        const living = [0, 1, 2, 3].filter((i) => !gone.has(`a${i}`));
        const next = living.find((i) => i > last) ?? living[0]!;
        expect(e.uid).toBe(`a${next}`);
        last = next;
      }
    }
  });

  it('counts type synergies at 2, 4 and 6', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(synergyLevel)).toEqual([0, 0, 1, 1, 2, 2, 3]);
    const fighting = (n: number) => Array.from({ length: n }, () => unit({ type: 'fighting' }));
    for (const [n, level] of [[2, 1], [4, 2], [6, 3]] as const) {
      const r = play(fighting(n), [unit({ hp: 500 })]);
      expect(events(r, 'synergy')).toEqual([{ e: 'synergy', side: 0, type: 'fighting', level }]);
      expect(events(r, 'buff').filter((x) => x.why === 'Brawn').map((x) => x.attack)).toEqual(Array(n).fill(TUNING.fighting[level - 1]));
    }
  });
});

describe('Special Conditions', () => {
  const units = gen1Units();

  it('follow the rules in every random battle', () => {
    const rng = rngFrom(9);
    for (let i = 0; i < 300; i++) {
      const r = simulateBattle({ units: sample(rng, units, 6) }, { units: sample(rng, units, 6) }, int(rng, 2 ** 31));
      const state = new Map<string, { condition: string | null; ticks: number }>();
      const of = (uid: string) => state.get(uid) ?? state.set(uid, { condition: null, ticks: 0 }).get(uid)!;
      for (const e of r.events) {
        if (e.e === 'status') {
          if (e.status === 'poisoned') of(e.uid).ticks = TUNING.poisonTicks;
          else if (e.status === 'cured') Object.assign(of(e.uid), { condition: null, ticks: 0 });
          else if (e.status === 'awake') of(e.uid).condition = null;
          else if (e.status !== 'blind') of(e.uid).condition = e.status; // the newest replaces the last
        } else if (e.e === 'join') state.delete(e.uid);
        else if (e.e === 'damage' && e.why === 'Poison') expect(--of(e.uid).ticks, 'a poisoning ends after its ticks').toBeGreaterThanOrEqual(0);
        else if (e.e === 'miss' && ['Asleep', 'Paralyzed', 'Confused'].includes(e.why)) {
          expect(of(e.uid).condition).toBe(e.why.toLowerCase());
          if (e.why !== 'Asleep') of(e.uid).condition = null; // Paralysis ends with the miss, Confusion with its tails
        } else if (e.e === 'attack') expect(of(e.uid).condition === 'asleep' || of(e.uid).condition === 'paralyzed', 'no attack while Asleep or Paralyzed').toBe(false);
      }
    }
  });

  it('Poison takes its amount after each of its side\'s turns, 3 times, and the strongest amount stays', () => {
    const r = play([unit({ keyword: 'Poison', hp: 500 })], [unit({ hp: 500, attack: 0 })]);
    const ticks = damage(r, 'b0', 'Poison');
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks.every((t) => t.amount === TUNING.poison)).toBe(true);
    const toxic = play([unit({ keyword: 'Toxic', hp: 500 }), unit({ keyword: 'Poison', hp: 500 })], [unit({ hp: 900, attack: 0 })]);
    const amounts = damage(toxic, 'b0', 'Poison').map((t) => t.amount);
    const firstToxic = amounts.indexOf(TUNING.toxic);
    expect(firstToxic).toBeGreaterThanOrEqual(0);
    expect(amounts.slice(firstToxic, firstToxic + 6).every((a) => a === TUNING.toxic)).toBe(true);
  });

  it('a Confused Pokémon hurts itself on tails and is then no longer Confused', () => {
    let tails = 0;
    for (const r of seeds(30, [unit({ keyword: 'Confuse', hp: 300, attack: 0 })], [unit({ hp: 300 })])) {
      for (const [i, e] of r.events.entries()) {
        if (e.e !== 'miss' || e.why !== 'Confused') continue;
        tails++;
        expect(r.events[i + 1]).toMatchObject({ e: 'damage', uid: 'b0', amount: TUNING.confusion, why: 'Confused' });
      }
    }
    expect(tails).toBeGreaterThan(10);
  });

  it("an Asleep or Paralyzed Pokémon doesn't strike back, and Blind's coin covers a strike back", () => {
    for (const keyword of ['Sleep', 'Paralyze'] as const) {
      for (const r of seeds(15, [unit({ keyword, hp: 400, attack: 10 })], [unit({ hp: 400, attack: 10 })])) {
        let resting = false;
        for (const [i, e] of r.events.entries()) {
          if (e.e === 'status' && e.uid === 'b0') resting = e.status === 'asleep' || e.status === 'paralyzed';
          if (e.e === 'miss' && e.uid === 'b0' && e.why === 'Paralyzed') resting = false;
          // Each of a0's attacks on a resting b0: no strike back before the next attack.
          if (e.e !== 'attack' || e.uid !== 'a0' || !resting) continue;
          const next = r.events.findIndex((x, j) => j > i && (x.e === 'attack' || x.e === 'miss' || x.e === 'end'));
          expect(r.events.slice(i, next).some((x) => x.e === 'damage' && x.why === 'strike back')).toBe(false);
        }
      }
    }
    const blinded = seeds(30, [unit({ keyword: 'Blind', hp: 400, attack: 10 })], [unit({ hp: 400, attack: 0 }), unit({ hp: 400, attack: 10 })]);
    expect(blinded.some((r) => events(r, 'miss').some((m) => m.why === 'Blind'))).toBe(true);
  });

  it("a strike back carries its Pokémon's on-hit keyword, but not its attack-only ones", () => {
    const poisoned = play([unit({ hp: 300 })], [unit({ keyword: 'Poison', hp: 300, attack: 10 })]);
    expect(events(poisoned, 'status').some((s) => s.uid === 'a0' && s.status === 'poisoned')).toBe(true);
    // Weaken works on its own attacks only: once for each attack a0 makes, never for its strikes back.
    const weak = play([unit({ keyword: 'Weaken', hp: 200 })], [unit({ hp: 200, attack: 50 })]);
    expect(damage(weak, 'b0', 'strike back').length).toBeGreaterThan(0);
    expect(events(weak, 'buff').filter((x) => x.why === 'Weaken')).toHaveLength(events(weak, 'attack').filter((x) => x.uid === 'a0').length);
  });
});

describe('keywords', () => {
  it('every keyword has its effect, and every effect its words', () => {
    expect(Object.keys(KEYWORDS).sort()).toEqual([...KEYWORD_NAMES].sort());
    for (const h of Object.values(KEYWORDS)) expect(h.text.length).toBeGreaterThan(5);
  });

  it('Explode: when it faints, damage to every opposing Pokémon', () => {
    const r = play([unit({ keyword: 'Explode', hp: 10 })], [unit({ hp: 300 }), unit({ hp: 300 })]);
    expect(events(r, 'damage').filter((d) => d.why === 'Explode').map((d) => [d.uid, d.amount])).toEqual([['b0', 10], ['b1', 10]]);
  });

  it('Destiny Bond: the Pokémon that Knocked it Out faints too', () => {
    const r = play([unit({ keyword: 'Destiny Bond', hp: 10, attack: 10 })], [unit({ hp: 300 })]);
    expect(r.winner).toBe('draw');
  });

  it('Family: a 10-attack, 30-HP copy takes its place, once', () => {
    const r = play([unit({ keyword: 'Family', hp: 10, name: 'Bellsprout' })], [unit({ hp: 300, attack: 50 })]);
    expect(events(r, 'join')).toEqual([{ e: 'join', uid: 'a1', side: 0, at: 0, name: 'Bellsprout', attack: TUNING.familyAttack, hp: TUNING.familyHp, why: 'Family' }]);
    expect(r.winner).toBe(1);
  });

  it('Guard: a coin when first hit, heads no damage', () => {
    const blocked = seeds(40, [unit({ hp: 300 })], [unit({ keyword: 'Guard', hp: 300 })]).map((r) => events(r, 'blocked').filter((x) => x.uid === 'b0').length);
    expect(Math.max(...blocked)).toBe(1);
    expect(Math.min(...blocked)).toBe(0);
  });

  it('Harden: 10 less from every hit', () => {
    const r = play([unit({ attack: 30, hp: 300 })], [unit({ keyword: 'Harden', hp: 60, attack: 10 })]);
    expect(damage(r, 'b0').every((d) => d.amount === 30 - TUNING.harden)).toBe(true);
  });

  it('Flurry: two hits, the first sure and the second on a coin, and one strike back', () => {
    const hits = new Set<number>();
    for (const r of seeds(40, [unit({ keyword: 'Flurry', attack: 20, hp: 900 })], [unit({ hp: 900, attack: 10 })])) {
      const first = r.events.findIndex((e) => e.e === 'attack' && e.uid === 'a0');
      const next = r.events.findIndex((e, i) => i > first && (e.e === 'attack' || e.e === 'end'));
      const exchange = r.events.slice(first + 1, next);
      hits.add(exchange.filter((e) => e.e === 'damage' && e.uid === 'b0').length);
      expect(exchange.filter((e) => e.e === 'damage' && e.uid === 'a0')).toHaveLength(1);
    }
    expect([...hits].sort()).toEqual([1, 2]);
  });

  it('Charge: every second attack does double', () => {
    const r = play([unit({ keyword: 'Charge', attack: 20, hp: 900 })], [unit({ hp: 900, attack: 0 })]);
    expect(damage(r, 'b0', 'attack').slice(0, 4).map((d) => d.amount)).toEqual([20, 40, 20, 40]);
  });

  it('Recoil: +10 attack, and 10 to itself each attack', () => {
    const r = play([unit({ keyword: 'Recoil', attack: 20, hp: 900 })], [unit({ hp: 90, attack: 0 })]);
    expect(damage(r, 'b0').every((d) => d.amount === 20 + TUNING.recoilAttack)).toBe(true);
    expect(damage(r, 'a0', 'Recoil')).toHaveLength(events(r, 'attack').filter((x) => x.uid === 'a0').length);
  });

  it('Drain: heals half the damage it deals, rounded up', () => {
    const r = play([unit({ keyword: 'Drain', attack: 30, hp: 100 })], [unit({ hp: 900, attack: 40 })]);
    expect(events(r, 'heal').filter((h) => h.uid === 'a0' && h.why === 'Drain')[0]?.amount).toBe(20);
  });

  it('Finisher: more to a Pokémon already damaged', () => {
    const r = play([unit({ keyword: 'Finisher', attack: 20, hp: 900 })], [unit({ hp: 200, attack: 0 })]);
    expect(damage(r, 'b0').slice(0, 3).map((d) => d.amount)).toEqual([20, 20 + TUNING.finisher, 20 + TUNING.finisher]);
  });

  it('Enrage: more attack each time it is hit', () => {
    const r = play([unit({ keyword: 'Enrage', attack: 10, hp: 900 })], [unit({ hp: 900, attack: 10 })]);
    const hitsTaken = damage(r, 'a0').length;
    expect(events(r, 'buff').filter((x) => x.uid === 'a0' && x.why === 'Enrage')).toHaveLength(hitsTaken);
  });

  it("Copycat: attacks with its target's attack when that's higher", () => {
    const r = play([unit({ keyword: 'Copycat', attack: 10, hp: 900 })], [unit({ hp: 900, attack: 50 })]);
    expect(damage(r, 'b0', 'attack').every((d) => d.amount === 50)).toBe(true);
    expect(damage(r, 'b0', 'strike back').every((d) => d.amount === 10)).toBe(true);
  });

  it("Splash: its attacks also damage the target's neighbours", () => {
    const r = play([unit({ keyword: 'Splash', attack: 10, hp: 900 })], [unit({ hp: 900, attack: 0 }), unit({ hp: 900, attack: 0 }), unit({ hp: 900, attack: 0 })]);
    const first = r.events.findIndex((e) => e.e === 'attack' && e.uid === 'a0') as number;
    const target = (r.events[first] as Extract<BattleEvent, { e: 'attack' }>).target;
    const splashed = events(r, 'damage').filter((d) => d.why === 'Splash').slice(0, target === 'b1' ? 2 : 1).map((d) => d.uid);
    expect(splashed).toEqual(target === 'b1' ? ['b0', 'b2'] : ['b1']);
  });

  it('Weaken and Unburden take attack off their targets', () => {
    const weak = play([unit({ keyword: 'Weaken', hp: 900 })], [unit({ hp: 900, attack: 30 })]);
    expect(events(weak, 'buff').filter((x) => x.uid === 'b0').slice(0, 2)).toEqual([{ e: 'buff', uid: 'b0', attack: -TUNING.weaken, why: 'Weaken' }, { e: 'buff', uid: 'b0', attack: -TUNING.weaken, why: 'Weaken' }]);
    const unburden = play([unit({ keyword: 'Unburden', hp: 900 })], [unit({ hp: 900, attack: 30 })]);
    expect(events(unburden, 'buff').filter((x) => x.uid === 'b0')).toHaveLength(1);
  });

  it('Mend: after it attacks, the most damaged ally heals', () => {
    const r = play([unit({ keyword: 'Mend', hp: 900 }), unit({ hp: 900 })], [unit({ hp: 900, attack: 30 })]);
    expect(events(r, 'heal').some((h) => h.why === 'Mend' && h.uid === 'a1' && h.amount <= TUNING.mend)).toBe(true);
  });

  it('Pay Day: counts its Knock Outs', () => {
    const r = play([unit({ keyword: 'Pay Day', attack: 50, hp: 900 })], [unit({ hp: 10 }), unit({ hp: 10 })]);
    expect(r.payDays).toEqual([2, 0]);
  });
});

describe('type synergies', () => {
  const six = (type: EnergyType, over: Partial<Unit> = {}) => Array.from({ length: 6 }, () => unit({ type, ...over }));

  it('Grass poisons what its Pokémon hit', () => {
    const r = play(six('grass', { hp: 900 }), [unit({ hp: 900, attack: 0 })]);
    expect(damage(r, 'b0', 'Poison')[0]?.amount).toBe(TUNING.grass[2]);
  });

  it("Fire's attacks also damage the target's neighbours", () => {
    const r = play(six('fire', { hp: 900 }), [unit({ hp: 900 }), unit({ hp: 900 }), unit({ hp: 900 })]);
    expect(events(r, 'damage').filter((d) => d.why === 'Splash')[0]?.amount).toBe(TUNING.fire[2]);
  });

  it('Water takes less from every hit', () => {
    const r = play([unit({ attack: 50, hp: 900 })], six('water', { hp: 300, attack: 0 }));
    expect(events(r, 'damage').filter((d) => d.why === 'attack')[0]?.amount).toBe(50 - TUNING.water[2]!);
  });

  it('the leftmost Lightning Pokémon attack once before the normal order, with no strike back', () => {
    const four = [...Array.from({ length: 4 }, () => unit({ type: 'lightning', hp: 900 })), unit({ type: 'fire', hp: 900 })];
    const r = play(four, [unit({ hp: 900, attack: 30 })]);
    expect(TUNING.lightning).toEqual([1, 3, 6]);
    const attacks = events(r, 'attack').filter((x) => x.uid[0] === 'a').map((x) => x.uid);
    expect(attacks.slice(0, 5)).toEqual(['a0', 'a1', 'a2', 'a0', 'a1']);
    // The 3 Quick attacks come before b0's first, and none is struck back.
    const firstB = r.events.findIndex((e) => e.e === 'attack' && e.uid === 'b0');
    const quick = r.events.slice(0, firstB).filter((e) => e.e === 'attack' || e.e === 'damage');
    expect(quick.filter((e) => e.e === 'attack')).toHaveLength(3 + (r.first === 0 ? 1 : 0));
    expect(quick.filter((e) => e.e === 'damage' && e.why === 'strike back')).toHaveLength(r.first === 0 ? 1 : 0);
  });

  it('Psychic damages every opposing Pokémon at the start', () => {
    const r = play(six('psychic'), [unit({ hp: 900 }), unit({ hp: 900 })]);
    expect(events(r, 'damage').filter((d) => d.why === 'Mind').map((d) => [d.uid, d.amount])).toEqual([['b0', TUNING.psychic[2]], ['b1', TUNING.psychic[2]]]);
  });

  it('Colorless gains HP for each other type on the board, and no attack', () => {
    const r = play([unit({ type: 'colorless' }), unit({ type: 'colorless' }), unit({ type: 'fire' }), unit({ type: 'water' })], [unit({ hp: 900 })]);
    expect(events(r, 'buff')).toEqual([]);
    expect(events(r, 'grow').filter((x) => x.why === 'Versatile').map((x) => [x.uid, x.hp])).toEqual([['a0', 20], ['a1', 20]]);
    // A board of Colorless alone has no other type.
    expect(events(play(six('colorless'), [unit({ hp: 900 })]), 'grow')).toEqual([]);
  });
});

describe('Trainers', () => {
  const line = (over: Partial<Unit> = {}) => [unit(over), unit(over), unit(over), unit(over)];
  const withTrainer = (trainer: TrainerName, units: Unit[]): Board => ({ units, trainer });

  it('every Trainer of the issue is one a side can play', () => {
    expect(TRAINER_NAMES).toHaveLength(15);
    for (const text of Object.values(TRAINERS)) expect(text.length).toBeGreaterThan(5);
  });

  it('PlusPower, Gambler and the Energy Removals change attack before the battle', () => {
    expect(events(play(withTrainer('PlusPower', line()), line()), 'buff').filter((x) => x.why === 'PlusPower').map((x) => x.attack)).toEqual(Array(4).fill(TUNING.plusPower));
    // Tails gives nothing (the balance pass): no buff at all.
    const gambles = seeds(20, withTrainer('Gambler', line()), line()).map((r) => events(r, 'buff').find((x) => x.why === 'Gambler')?.attack ?? 0);
    expect([...new Set(gambles)].sort((a, b) => a - b)).toEqual([TUNING.gamblerTails, TUNING.gamblerHeads]);
    const strong = [unit({ attack: 50 }), unit({ attack: 40 }), unit({ attack: 10 })];
    expect(events(play(withTrainer('Energy Removal', line()), strong), 'buff').map((x) => x.uid)).toEqual(['b0']);
    expect(events(play(withTrainer('Super Energy Removal', line()), strong), 'buff').map((x) => [x.uid, x.attack])).toEqual([['b0', -TUNING.energyRemoval], ['b1', -TUNING.energyRemoval]]);
  });

  it('Defender takes 10 off every hit', () => {
    const r = play(withTrainer('Defender', line({ hp: 60 })), [unit({ attack: 30, hp: 900 })]);
    expect(events(r, 'damage').filter((d) => d.uid[0] === 'a').every((d) => d.amount === 30 - TUNING.defender)).toBe(true);
  });

  it('Potion heals the first Pokémon to fall under half, once; Super Potion each the first time it is hit', () => {
    const potion = play(withTrainer('Potion', line({ hp: 100 })), [unit({ attack: 60, hp: 900 })]);
    expect(events(potion, 'heal').filter((h) => h.why === 'Potion')).toHaveLength(1);
    const superPotion = play(withTrainer('Super Potion', line({ hp: 100 })), [unit({ attack: 30, hp: 900 })]);
    const healed = events(superPotion, 'heal').filter((h) => h.why === 'Super Potion').map((h) => h.uid);
    expect(new Set(healed).size).toBe(healed.length);
    expect(healed.length).toBeGreaterThan(1);
  });

  it("Full Heal keeps Poison and Paralysis off, not Sleep", () => {
    const poison = play(withTrainer('Full Heal', line({ hp: 300 })), [unit({ keyword: 'Poison', hp: 900 })]);
    expect(events(poison, 'status')).toEqual([]);
    const sleep = play(withTrainer('Full Heal', line({ hp: 300 })), [unit({ keyword: 'Sleep', hp: 900 })]);
    expect(events(sleep, 'status').some((s) => s.status === 'asleep')).toBe(true);
  });

  it('Revive brings the first to faint back where it stood with half its HP, once', () => {
    const r = play(withTrainer('Revive', line({ hp: 100 })), [unit({ attack: 200, hp: 900 })]);
    const back = events(r, 'join');
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ hp: 50, why: 'Revive' });
    expect(events(r, 'faint').filter((f) => f.uid[0] === 'a')).toHaveLength(5);
  });

  it('Scoop Up: the first that would faint goes to the end of the line fully healed, and the next Pokémon attacks at once', () => {
    const r = play(withTrainer('Scoop Up', line({ hp: 100 })), [unit({ attack: 200, hp: 900 })]);
    const left = r.events.findIndex((e) => e.e === 'leave');
    expect(left).toBeGreaterThan(0);
    expect(events(r, 'leave')).toHaveLength(1);
    expect(r.events[left + 1]).toMatchObject({ e: 'join', at: 3, hp: 100, why: 'Scoop Up' });
    expect(r.events.slice(left + 2).find((e) => e.e === 'attack')?.uid[0]).toBe('a');
    expect(events(r, 'faint').filter((f) => f.uid[0] === 'a')).toHaveLength(4);
  });

  it('Pokémon Center heals the side fully once it is down to 3', () => {
    let heals = 0;
    for (const r of seeds(20, withTrainer('Pokémon Center', line({ hp: 100, attack: 30 })), [unit({ attack: 60, hp: 2000 })])) {
      const order = r.events.filter((e) => e.e === 'faint' || (e.e === 'heal' && e.why === 'Pokémon Center'));
      const healed = order.filter((e) => e.e === 'heal');
      heals += healed.length;
      // Only between the side's first faint (4 down to 3) and its second, and to full.
      for (const h of healed) expect(order.slice(0, order.indexOf(h)).filter((e) => e.e === 'faint')).toHaveLength(1);
      expect(healed.every((h) => h.e === 'heal' && h.hp === 100)).toBe(true);
    }
    expect(heals).toBeGreaterThan(0);
  });

  it('Gust of Wind aims the first 2 attacks at the opposing Pokémon with the most attack, with no strike back', () => {
    for (const r of seeds(10, withTrainer('Gust of Wind', line({ hp: 900 })), [unit({ hp: 900 }), unit({ hp: 900, attack: 40 }), unit({ hp: 900 })])) {
      expect(events(r, 'attack').filter((x) => x.uid[0] === 'a').slice(0, 2).map((x) => x.target)).toEqual(['b1', 'b1']);
      // b1 strikes back with 40: only from the side's third attack on it.
      const third = r.events.findIndex((e, i) => e.e === 'attack' && e.uid[0] === 'a' && r.events.slice(0, i).filter((x) => x.e === 'attack' && x.uid[0] === 'a').length === 2);
      expect(r.events.slice(0, third).some((e) => e.e === 'damage' && e.why === 'strike back' && e.amount === 40)).toBe(false);
    }
  });

  it("Imposter Professor Oak counts 2 fewer for the opponent's synergies", () => {
    const fighting = Array.from({ length: 4 }, () => unit({ type: 'fighting' }));
    expect(events(play(withTrainer('Imposter Professor Oak', line()), fighting), 'synergy')).toEqual([{ e: 'synergy', side: 1, type: 'fighting', level: 1 }]);
  });

  it('Bill and Professor Oak change nothing in the battle itself', () => {
    const a = line();
    const b = line();
    for (const trainer of ['Bill', 'Professor Oak'] as const) expect(play(withTrainer(trainer, a), b, 4).events.filter((e) => e.e !== 'trainer')).toEqual(play(a, b, 4).events);
  });
});

describe('Taunt and the tuning', () => {
  it('Taunt: every attack goes at a Taunt Pokémon while one stands, then at random', () => {
    for (const r of seeds(10, [unit({ hp: 900 }), unit({ hp: 900 }), unit({ hp: 900 })], [unit({ hp: 900 }), unit({ keyword: 'Taunt', hp: 60 }), unit({ hp: 900 })])) {
      const at = events(r, 'attack').filter((x) => x.uid[0] === 'a');
      const fell = r.events.findIndex((e) => e.e === 'faint' && e.uid === 'b1');
      const before = r.events.slice(0, fell < 0 ? undefined : fell).filter((e): e is Extract<BattleEvent, { e: 'attack' }> => e.e === 'attack' && e.uid[0] === 'a');
      expect(before.length).toBeGreaterThan(0);
      expect(before.every((x) => x.target === 'b1')).toBe(true);
      if (fell >= 0) expect(at.length).toBeGreaterThan(before.length);
    }
    // Gust of Wind's aim comes first.
    const gust = play({ units: [unit({ hp: 900 })], trainer: 'Gust of Wind' }, [unit({ hp: 900, attack: 50 }), unit({ keyword: 'Taunt', hp: 900 })]);
    expect(events(gust, 'attack').filter((x) => x.uid === 'a0')[0]!.target).toBe('b0');
  });

  it("the numbers battles play by are the issue's but for the balance pass's changes", () => {
    expect(Object.keys(TUNING)).toEqual(Object.keys(SPEC));
    const changed = (Object.keys(SPEC) as (keyof typeof SPEC)[]).filter((k) => JSON.stringify(SPEC[k]) !== JSON.stringify(TUNING[k]));
    expect(changed.sort()).toEqual(
      [
        'blindAttackOnly', 'explode', 'gust', 'gustStruckBack', 'lightning', 'quickStruckBack', 'restingStrikesBack', 'scoopUpReturns', 'versatileAttack', 'versatileOwn',
        // Step 7's balance pass (the user's, 2026-11-18); Whirlwind's and Charge's switches stay off.
        'blindAtOnce', 'flurrySure', 'gamblerTails',
      ].sort(),
    );
    expect([TUNING.whirlwindUnanswered, TUNING.chargeUnanswered]).toEqual([false, false]);
  });

  /** What a's first attack drew back: the strike back's damage events in its exchange. */
  const firstExchange = (r: BattleResult, uid: string) => {
    const at = r.events.findIndex((e) => e.e === 'attack' && e.uid === uid);
    const next = r.events.findIndex((e, i) => i > at && (e.e === 'attack' || e.e === 'end'));
    return r.events.slice(at + 1, next);
  };

  it("Blind: its target's strike back to the hit flips a coin too", () => {
    const backs = seeds(30, [unit({ keyword: 'Blind', hp: 900 })], [unit({ hp: 900, attack: 30 })]).map((r) => firstExchange(r, 'a0').filter((e) => e.e === 'damage' && e.uid === 'a0').length);
    expect(Math.min(...backs)).toBe(0);
    expect(Math.max(...backs)).toBe(1);
  });
});
