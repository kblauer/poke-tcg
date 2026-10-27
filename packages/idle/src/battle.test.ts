import { rngFrom } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { Battle, EXP_RATE, simulateBattle, opponentMon, type BattleSetup } from './battle.js';
import { CATCH, catchTextFrame, CHALLENGE_MS, FRAME_MS, INTRO_MS, openingLines, openingMs, READ_MS, SHAKES_AT } from './battle-timing.js';
import { catchChance, catchOdds, shakeThreshold } from './catch.js';
import { moveData, species } from './data.js';
import { ENCOUNTERS } from './data/gen1/encounters.js';
import { MARTS } from './data/gen1/marts.js';
import { MOVES } from './data/gen1/moves.js';
import { SPECIES } from './data/gen1/species.js';
import { TRAINERS } from './data/gen1/trainers.js';
import { levelEvolution, evolve } from './evolution.js';
import { autoSlots, basicFor, basicMove, cooldownTicks, createMon, lastFourMoves, movePower, movesUpTo } from './mon.js';
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

describe('auto-catch', () => {
  /** The player's actions in a wild battle with auto-catch on: each move used or ball thrown, in order. */
  const actions = (me: Mon, wild: Mon, seed = 1) =>
    simulateBattle(setup([me], [opponentMon(wild)], { bag: { 'poke-ball': 20 }, settings: { autoHeal: false, tryCatch: true } }), rngFrom(seed))
      .events.filter((e) => (e.t === 'move' && e.side === 0) || e.t === 'ball')
      .map((e) => (e.t === 'ball' ? 'ball' : (e as { move: string }).move));

  it('hits with the basic move, again above 60% HP, then throws balls', () => {
    // A level-5 Charmander's Scratch leaves a level-10 Rattata well above 60%: two hits, then balls.
    const a = actions(mon(4, 5), mon(19, 10));
    expect(a.slice(0, 2)).toEqual(['scratch', 'scratch']);
    expect(a.slice(2).every((x) => x === 'ball')).toBe(true);
    expect(a.length).toBeGreaterThan(2);
  });

  it('throws a ball instead of a hit that could knock the Pokémon out', () => {
    expect(actions(mon(6, 60), mon(16, 3))[0]).toBe('ball');
  });
});

describe('moves and cooldowns', () => {
  it('picks basic moves by the agreed rule', () => {
    expect(basicMove(4)).toBe('scratch');
    expect(basicMove(5)).toBe('scratch');
    expect(basicMove(6)).toBe('scratch');
    expect(basicMove(11)).toBe('tackle'); // Metapod: Caterpie's.
    expect(basicMove(128)).not.toBe('tackle'); // Tauros doesn't evolve: one step stronger.
  });

  it("never gives a Pokémon Struggle as its basic move (but Ditto, which has no other), its pre-evolution's instead", () => {
    // A wild Kakuna knows only Harden: Weedle's Poison Sting.
    expect(basicFor({ species: 14, moves: ['harden'] })).toBe('poison-sting');
    expect(basicFor({ species: 129, moves: ['splash'] })).toBe('tackle');
    for (const s of SPECIES) {
      if (s.id === 132) continue;
      for (let l = 1; l <= 100; l++) {
        expect(basicFor({ species: s.id, moves: lastFourMoves(s.id, l) }), `${s.name} ${l}`).not.toBe('struggle');
        expect(basicFor({ species: s.id, moves: movesUpTo(s.id, l) }), `${s.name} ${l}`).not.toBe('struggle');
      }
    }
  });

  it('cools moves down by power', () => {
    expect(cooldownTicks('scratch')).toBe(2);
    expect(cooldownTicks('ember')).toBe(2);
    expect(cooldownTicks('flamethrower')).toBe(5);
    expect(cooldownTicks('hyper-beam')).toBe(6);
    expect(cooldownTicks('sleep-powder')).toBe(5);
    expect(cooldownTicks('growl')).toBe(2);
    expect(cooldownTicks('thunder-wave')).toBe(4);
    expect(movePower('seismic-toss')).toBe(60);
    expect(movePower('growl')).toBe(0);
  });

  it('uses the strongest slot move off cooldown, the basic move while they all cool down', () => {
    // A Charmeleon with Flamethrower (5 ticks), Slash (4) and Ember (2); Scratch its basic move.
    const b = new Battle(setup([mon(5, 40, { moves: ['scratch', 'ember', 'slash', 'flamethrower'], slots: ['ember', 'slash', 'flamethrower'], autoSlots: false })], [mon(1, 40)]), rngFrom(1));
    const me = b.active[0];
    const tick = () => {
      const m = b.chooseMove(me);
      for (const [k, n] of Object.entries(me.cooldowns)) n > 1 ? (me.cooldowns[k] = n - 1) : delete me.cooldowns[k];
      return m;
    };
    expect([tick(), tick(), tick(), tick(), tick(), tick()]).toEqual(['flamethrower', 'slash', 'ember', 'scratch', 'ember', 'flamethrower']);
  });

  it('opens with a status move set by hand against each foe Pokémon, then uses it by power; on the automatic pick by power', () => {
    const moves = ['scratch', 'smokescreen', 'flamethrower'];
    const battle = (autoSlots: boolean) => new Battle(setup([mon(5, 40, { moves, slots: ['flamethrower', 'smokescreen'], autoSlots })], [mon(1, 40), mon(4, 40)], { kind: 'trainer' }), rngFrom(1));
    const b = battle(false);
    const me = b.active[0];
    // Set by hand: Smokescreen first, then Flamethrower; with Flamethrower cooling down, Smokescreen again (before the
    // basic move), no longer first: once Smokescreen's cooled down too and Flamethrower is ready, Flamethrower.
    expect([b.chooseMove(me), b.chooseMove(me)]).toEqual(['smokescreen', 'flamethrower']);
    me.cooldowns = { flamethrower: 3 };
    expect(b.chooseMove(me)).toBe('smokescreen');
    me.cooldowns = {};
    expect(b.chooseMove(me)).toBe('flamethrower');
    // The foe's next Pokémon: Smokescreen first again.
    me.cooldowns = {};
    b.sendOut(b.foes[1]!);
    expect(b.chooseMove(me)).toBe('smokescreen');
    // On the automatic pick: by power from the start.
    expect(battle(true).chooseMove(battle(true).active[0])).toBe('flamethrower');
  });

  it("gives a quarter of the game's experience", () => {
    expect(EXP_RATE).toBe(0.25);
    // Bulbasaur (base 64) at level 10, beaten by a lone Charmander: 64 × 10 / 7 = 91, a quarter 22.
    const r = simulateBattle(setup([mon(4, 30)], [opponentMon(mon(1, 10))]), rngFrom(3));
    expect(r.events.find((e) => e.t === 'exp')).toMatchObject({ gained: 22 });
  });

  it('knows the game\'s moves at a level', () => {
    expect(lastFourMoves(4, 5)).toEqual(['scratch', 'growl']);
    expect(autoSlots({ species: 4, moves: ['scratch', 'growl', 'ember', 'metal-claw'] })).toEqual(['metal-claw', 'ember', 'growl']);
  });

  it('gives experience to Pokémon that fainted in the battle too', () => {
    // A Magikarp led out (it only splashes) faints to the Bulbasaur; the Charizard after it wins. Both faced it.
    const r = simulateBattle(setup([mon(129, 2, { uid: 'karp' }), mon(6, 60, { uid: 'zard' })], [opponentMon(mon(1, 10))]), rngFrom(3));
    expect(r.events.some((e) => e.t === 'faint' && e.side === 0)).toBe(true);
    const gained = (uid: string) => r.events.find((e) => e.t === 'exp' && e.uid === uid);
    expect(gained('karp')).toBeDefined();
    expect(gained('zard')).toBeDefined();
  });

  it("times FireRed's intro, send-outs and catches", () => {
    // The intro at twice the game's speed: the band (16 frames), the slides (60), a wild Pokémon's healthbox (23).
    expect(INTRO_MS).toBeCloseTo(99 * FRAME_MS);
    // The opening runs to turn 1: both send-outs' lines, the foe's first.
    const wild = simulateBattle(setup([mon(4, 10)], [opponentMon(mon(16, 5))]), rngFrom(1)).events;
    expect(openingLines(wild).map((e) => e.t)).toEqual(['send', 'send']);
    // A wild battle: the intro, "appeared!" read, the player's throw (32 + 25 frames), its Pokémon out (12), its healthbox (23), read.
    expect(openingMs(wild, 'wild')).toBeCloseTo(INTRO_MS + READ_MS + (32 + 25 + 12 + 23) * FRAME_MS + READ_MS);
    // A trainer's: their challenge, and their send-out's 60-frame pause, ball (17), Pokémon (12), healthbox (23).
    const trainer = simulateBattle(setup([mon(4, 10)], [opponentMon(mon(16, 5))], { kind: 'trainer' }), rngFrom(1)).events;
    expect(openingMs(trainer, 'trainer')).toBeCloseTo(INTRO_MS + CHALLENGE_MS + (60 + 17 + 12 + 23) * FRAME_MS + READ_MS + (32 + 25 + 12 + 23) * FRAME_MS + READ_MS);
    // Catching: the shakes start after the throw, the ball's opening, the wait, the drawing in, the close, the bounces and the wait.
    expect(SHAKES_AT).toBe(34 + 10 + 10 + 30 + 10 + 84 + 31);
    expect(catchTextFrame(0, false)).toBe(SHAKES_AT + CATCH.breakText);
    expect(catchTextFrame(2, false)).toBe(SHAKES_AT + 2 * 59 + CATCH.breakText);
    // Caught: the click 40 frames after the 3rd shake, "Gotcha!" 95 after the click; the whole line still fits a tick.
    expect(catchTextFrame(4, true)).toBe(SHAKES_AT + 2 * 59 + 28 + 40 + 95);
    expect(catchTextFrame(4, true) * FRAME_MS + READ_MS).toBeLessThan(10000);
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
