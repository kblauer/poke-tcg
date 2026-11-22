import { describe, expect, it } from 'vitest';
import { rngFrom, trainerFavorites } from '@poke-tcg/campaign';
import { BOARD_SIZE } from './battle.js';
import { DRAFT, applySafariAction, createSafari, isLegendary, type SafariAction, type SafariState } from './draft.js';
import { allUnits } from './species.js';
import { unitScore } from './units.js';
import { BLUE_STARTERS, BLUE_TEAM, BLUE_TRAINER, CORE_SIZE, DIFFICULTY_TIER, EASY_BATTLES, GYM_LEADERS, MEDIUM_TIERS, OPENING_SIZES, OPPONENT_PAY, arrange, leaderOpponent, opponentChoice, placementScore, rollBoard, rollChampion, rollOpponents, trainerOpponent, type Opponent } from './opponents.js';

const units = allUnits();
const byId = new Map(units.map((u) => [u.id, u]));
const tiersOf = (o: Opponent) => o.board.map((id) => byId.get(id)!.tier);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function must(state: SafariState, action: SafariAction): SafariState {
  const result = applySafariAction(state, action, units);
  if (!result.ok) throw new Error(`${action.type}: ${result.error}`);
  return result.state;
}

describe('a step\'s opponents', () => {
  const rng = rngFrom(5);
  const steps = Array.from({ length: 3000 }, (_, i) => rollOpponents(rng, units, i % 15, []));

  it('offers 3, 2 or 1 (4:2:1), easiest first, each a different difficulty paying more the harder; no easy one after the 6th battle', () => {
    expect(EASY_BATTLES).toBe(6);
    const early = steps.filter((_, i) => i % 15 < EASY_BATTLES);
    const late = steps.filter((_, i) => i % 15 >= EASY_BATTLES);
    expect(early.some((s) => s.some((o) => o.difficulty === 'easy'))).toBe(true);
    for (const s of late) {
      expect(s.length).toBeLessThanOrEqual(2);
      expect(s.some((o) => o.difficulty === 'easy')).toBe(false);
    }
    const counts = [1, 2, 3].map((n) => early.filter((s) => s.length === n).length / early.length);
    expect(counts[2]).toBeCloseTo(4 / 7, 1);
    expect(counts[1]).toBeCloseTo(2 / 7, 1);
    expect(counts[0]).toBeCloseTo(1 / 7, 1);
    const order = ['easy', 'medium', 'hard', 'gymLeader'];
    for (const step of steps) {
      const ranks = step.map((o) => order.indexOf(o.difficulty));
      expect(ranks).toEqual([...new Set(ranks)].sort((a, b) => a - b));
      for (const o of step) expect(o.pay).toBe(OPPONENT_PAY[o.difficulty]);
      expect(new Set(step.map((o) => o.name)).size).toBe(step.length);
    }
  });

  it('gives each different units (3, 4 and 5 in the first battles, then 6), no legendary, around the curve\'s tier for its difficulty', () => {
    expect(OPENING_SIZES).toEqual([3, 4, 5]);
    steps.forEach((step, i) => {
      for (const o of step) expect(o.board, `battle ${(i % 15) + 1}`).toHaveLength(OPENING_SIZES[i % 15] ?? BOARD_SIZE);
    });
    for (const step of steps) for (const o of step) {
      expect(new Set(o.board).size).toBe(o.board.length);
      for (const id of o.board) expect(isLegendary(byId.get(id)!), id).toBe(false);
    }
    // Battle 6 (index 5): medium tier 3, easy 2, hard 4, a leader 5 (where its type has the units).
    const at5 = steps.filter((_, i) => i % 15 === 5).flat();
    for (const d of ['easy', 'medium', 'hard'] as const) expect(mean(at5.filter((o) => o.difficulty === d).flatMap(tiersOf))).toBeCloseTo(MEDIUM_TIERS[5]! + DIFFICULTY_TIER[d], 0);
    // Evolved units are on the boards.
    expect(steps.flat().some((o) => o.board.some((id) => byId.get(id)!.stage === 'stage2'))).toBe(true);
  });

  it('makes an easy opponent of the first battles weaker than tier 1, a late gym leader stronger than tier 5', () => {
    const score = (ids: string[]) => mean(ids.map((id) => unitScore(byId.get(id)!)));
    const tier = (t: number) => score(units.filter((u) => u.tier === t && !isLegendary(u)).map((u) => u.id));
    const easy = Array.from({ length: 200 }, () => trainerOpponent(rng, units, 'Youngster Joey', 'easy', 0));
    for (const o of easy) expect(tiersOf(o).every((t) => t === 1)).toBe(true);
    expect(score(easy.flatMap((o) => o.board))).toBeLessThan(tier(1));
    const late = Array.from({ length: 200 }, () => trainerOpponent(rng, units, 'Youngster Joey', 'hard', 6));
    expect(score(late.flatMap((o) => o.board))).toBeGreaterThan(tier(5));
  });

  it('always offers an easy opponent for the first battle, with whatever else was rolled', () => {
    const first = steps.filter((_, i) => i % 15 === 0);
    for (const step of first) expect(step[0]!.difficulty).toBe('easy');
    expect(first.some((s) => s.length > 1)).toBe(true);
  });

  it('brings a gym leader as the hardest on about 1 step in 4 of 2 or 3, never one already met', () => {
    const many = steps.filter((s) => s.length >= 2);
    expect(many.filter((s) => s.at(-1)!.difficulty === 'gymLeader').length / many.length).toBeCloseTo(0.25, 1);
    expect(steps.filter((s) => s.length === 1).every((s) => s[0]!.difficulty !== 'gymLeader')).toBe(true);
    const met = GYM_LEADERS.slice(0, 7).map((l) => l.id);
    for (let i = 0; i < 300; i++) for (const o of rollOpponents(rng, units, 7, met)) if (o.difficulty === 'gymLeader') expect(o.boss).toBe(GYM_LEADERS[7]!.id);
    expect(rollOpponents(rng, units, 7, GYM_LEADERS.map((l) => l.id)).every((o) => o.difficulty !== 'gymLeader')).toBe(true);
  });

  it('builds a trainer class\'s board from their favourite Pokémon where they can', () => {
    const swimmer = Array.from({ length: 200 }, () => trainerOpponent(rng, units, 'Swimmer Luis', 'medium', 2));
    const favourites = trainerFavorites('Swimmer Luis')!;
    const liked = swimmer.flatMap((o) => o.board).filter((id) => favourites.includes(byId.get(id)!.name)).length;
    expect(liked / (200 * BOARD_SIZE)).toBeGreaterThan(0.3);
    expect(swimmer.filter((o) => o.type === 'water').length).toBeGreaterThan(100);
  });
});

describe('the gym leaders', () => {
  it('play their own team\'s Pokémon first, of their type otherwise, with their Trainer', () => {
    const rng = rngFrom(9);
    expect(GYM_LEADERS.map((l) => l.trainer)).toEqual(['Defender', 'Super Potion', 'PlusPower', 'Potion', 'Gust of Wind', 'Imposter Professor Oak', 'Revive', 'Super Energy Removal']);
    for (const leader of GYM_LEADERS) {
      const boards = Array.from({ length: 100 }, () => leaderOpponent(rng, units, leader, 3));
      for (const o of boards) {
        expect(o).toMatchObject({ name: leader.name, boss: leader.id, difficulty: 'gymLeader', type: leader.type, trainer: leader.trainer, pay: 850 });
        for (const id of o.board) expect(byId.get(id)!.type === leader.type || leader.team.includes(byId.get(id)!.name)).toBe(true);
      }
      // Every Pokémon of their team is a unit, and on their boards more often than a board of the type holds them.
      for (const name of leader.team) expect(units.find((u) => u.name === name), `${leader.name}: ${name}`).toBeDefined();
      const onTeam = (ids: string[]) => ids.filter((id) => leader.team.includes(byId.get(id)!.name)).length;
      const own = onTeam(boards.flatMap((o) => o.board));
      const plain = onTeam(Array.from({ length: 100 }, () => rollBoard(rng, units, 3, (u) => u.type === leader.type, () => false)).flat().map((u) => u.id));
      expect(own / 600, leader.name).toBeGreaterThan(0.4);
      expect(own, leader.name).toBeGreaterThan(plain * 1.1);
    }
  });
});

describe('a board built round a type, and placed', () => {
  it('a trainer\'s board holds CORE_SIZE of the type shown', () => {
    const rng = rngFrom(21);
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 60; i++) {
        const o = trainerOpponent(rng, units, 'Hiker Otis', difficulty, 3);
        expect(o.board.filter((id) => byId.get(id)!.type === o.type).length, difficulty).toBeGreaterThanOrEqual(CORE_SIZE[difficulty]);
      }
    }
  });

  it('arrange keeps the board\'s Pokémon and finds the best line', () => {
    const rng = rngFrom(22);
    const named = (...names: string[]) => names.map((name) => units.find((u) => u.name === name)!);
    // Machoke's Rally reaches two neighbours inside the line, one at an end.
    const line = arrange(rng, named('Machoke', 'Vigoroth', 'Ursaring', 'Wailmer'));
    expect(line.map((u) => u.name).sort()).toEqual(['Machoke', 'Ursaring', 'Vigoroth', 'Wailmer']);
    expect([1, 2]).toContain(line.findIndex((u) => u.name === 'Machoke'));
    // Smeargle's Sketch takes the keywords of the Pokémon on its left.
    const sketch = arrange(rng, named('Smeargle', 'Sandslash', 'Wailmer'));
    expect(sketch.findIndex((u) => u.name === 'Smeargle')).toBe(sketch.findIndex((u) => u.name === 'Sandslash') + 1);
    for (let i = 0; i < 20; i++) {
      const rolled = rollBoard(rng, units, 3, () => true, () => false);
      expect(placementScore(arrange(rng, rolled))).toBeGreaterThanOrEqual(placementScore(rolled));
    }
  });
});

describe('Champion Blue', () => {
  it('plays his FireRed team and one of the starters\' last evolutions, with Defender', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const blue = rollChampion(rngFrom(s), units);
      expect(blue).toMatchObject({ name: 'Blue', boss: 'blue', difficulty: 'champion', pay: 1000, trainer: BLUE_TRAINER });
      const names = blue.board.map((id) => byId.get(id)!.name);
      const starter = names.filter((name) => !BLUE_TEAM.includes(name));
      expect(names).toHaveLength(6);
      expect(starter).toHaveLength(1);
      expect(BLUE_STARTERS).toContain(starter[0]);
      seen.add(starter[0]!);
      // His line is placed: no other order of it scores more.
      expect(placementScore(blue.board.map((id) => byId.get(id)!))).toBeGreaterThanOrEqual(placementScore([...blue.board].reverse().map((id) => byId.get(id)!)));
    }
    expect(seen.size).toBe(3);
    expect(BLUE_TRAINER).toBe('Defender');
    expect(rollChampion(rngFrom(1), units).board.filter((id) => !['3', '6', '9'].includes(id)).sort()).toEqual(['112', '130', '18', '59', '65']); // Rhydon, Gyarados, Pidgeot, Arcanine, Alakazam
  });
});

describe('the battle step in the draft', () => {
  const start = createSafari(4, units);
  const shop = must(start, { type: 'PICK_STARTER', unit: start.starters[0]! });

  it('offers opponents with the shop, shows only their trainer, type, difficulty and pay', () => {
    expect(shop.opponents.length).toBeGreaterThanOrEqual(1);
    const shown = opponentChoice(shop.opponents[0]!);
    expect(shown).not.toHaveProperty('board');
    expect(shown).not.toHaveProperty('trainer');
    expect(Object.keys(shown).sort()).toEqual(expect.arrayContaining(['difficulty', 'name', 'pay', 'type']));
  });

  it('takes the chosen one to the board screen, where only the order and the Trainer change, then battles', () => {
    let s = must(shop, { type: 'CHOOSE', index: 0 });
    expect(s.phase).toBe('ready');
    expect(s.opponent).toEqual(shop.opponents[0]);
    for (const action of [{ type: 'BUY', index: 0 }, { type: 'REROLL' }, { type: 'TIER_UP' }, { type: 'CHOOSE', index: 0 }, { type: 'SELL', place: { zone: 'board', at: 0 } }] as SafariAction[]) {
      expect(applySafariAction(s, action, units)).toEqual({ ok: false, error: 'The opponent is chosen: start the battle' });
    }
    s = must(s, { type: 'MOVE', from: { zone: 'board', at: 0 }, to: { zone: 'board', at: 3 } });
    s = must(s, { type: 'BATTLE' });
    expect(s.last!.against.name).toBe(shop.opponents[0]!.name);
    expect(s.last!.opponent.units.map((u) => u.id)).toEqual(shop.opponents[0]!.board);
    expect(s.phase === 'shop' || s.phase === 'lost').toBe(true);
    expect(applySafariAction(shop, { type: 'BATTLE' }, units)).toEqual({ ok: false, error: 'Choose an opponent first' });
    expect(applySafariAction(shop, { type: 'CHOOSE', index: 7 }, units)).toEqual({ ok: false, error: 'No such opponent' });
  });

  it('remembers the leaders fought, and offers only the run\'s Blue after the 15 battles, the same each try', () => {
    const leader: Opponent = { name: 'Misty', boss: 'misty', difficulty: 'gymLeader', type: 'water', pay: 850, board: [units[0]!.id] };
    let s = must({ ...shop, opponents: [leader] }, { type: 'CHOOSE', index: 0 });
    expect(s.leadersMet).toEqual(['misty']);
    s = must({ ...shop, battles: DRAFT.battles - 1, hp: 3 }, { type: 'CHOOSE', index: 0 });
    s = must(s, { type: 'BATTLE' });
    if (s.phase === 'shop') {
      expect(s.opponents).toEqual([s.champion]);
      expect(s.champion).toEqual(start.champion);
    }
  });
});
