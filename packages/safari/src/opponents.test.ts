import { describe, expect, it } from 'vitest';
import { rngFrom, trainerFavorites } from '@poke-tcg/campaign';
import { namesMatch } from '@poke-tcg/game-engine';
import { BOARD_SIZE } from './battle.js';
import { DRAFT, applySafariAction, createSafari, isLegendary, type SafariAction, type SafariState } from './draft.js';
import { gen1Units } from './gen1.js';
import { unitScore } from './units.js';
import { BLUE_STARTERS, BLUE_TEAM, DIFFICULTY_TIER, GYM_LEADERS, MEDIUM_TIERS, OPPONENT_PAY, leaderOpponent, opponentChoice, rollChampion, rollOpponents, trainerOpponent, type Opponent } from './opponents.js';

const units = gen1Units();
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

  it('offers 3, 2 or 1 (4:2:1), easiest first, each a different difficulty paying more the harder', () => {
    const counts = [1, 2, 3].map((n) => steps.filter((s) => s.length === n).length / steps.length);
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

  it('gives each 6 different units, no legendary, around the curve\'s tier for its difficulty', () => {
    for (const step of steps) for (const o of step) {
      expect(o.board).toHaveLength(BOARD_SIZE);
      expect(new Set(o.board).size).toBe(BOARD_SIZE);
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
    const liked = swimmer.flatMap((o) => o.board).filter((id) => favourites.some((f) => namesMatch(byId.get(id)!.name, f))).length;
    expect(liked / (200 * BOARD_SIZE)).toBeGreaterThan(0.3);
    expect(swimmer.filter((o) => o.type === 'water').length).toBeGreaterThan(100);
  });
});

describe('the gym leaders', () => {
  it('play 6 of their type, their own prints first, with their Trainer', () => {
    const rng = rngFrom(9);
    expect(GYM_LEADERS.map((l) => l.trainer)).toEqual(['Defender', 'Super Potion', 'PlusPower', 'Full Heal', 'Gust of Wind', 'Imposter Professor Oak', 'Scoop Up', 'Super Energy Removal']);
    for (const leader of GYM_LEADERS) {
      const boards = Array.from({ length: 100 }, () => leaderOpponent(rng, units, leader, 3));
      for (const o of boards) {
        expect(o).toMatchObject({ name: leader.name, boss: leader.id, difficulty: 'gymLeader', type: leader.type, trainer: leader.trainer, pay: 850 });
        for (const id of o.board) expect(byId.get(id)!.type).toBe(leader.type);
      }
      const own = boards.flatMap((o) => o.board).filter((id) => byId.get(id)!.name.startsWith(`${leader.name}'s `)).length;
      // Giovanni has only 3 Fighting prints of his own.
      expect(own / 600, leader.name).toBeGreaterThan(leader.id === 'giovanni' ? 0.2 : 0.4);
    }
  });
});

describe('Champion Blue', () => {
  it('plays the strongest plain print of his team\'s lines and one starter\'s, with Defender', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const blue = rollChampion(rngFrom(s), units);
      expect(blue).toMatchObject({ name: 'Blue', boss: 'blue', difficulty: 'champion', pay: 1000, trainer: 'Defender' });
      const names = blue.board.map((id) => byId.get(id)!.name);
      expect(names.slice(0, 5)).toEqual(BLUE_TEAM);
      expect(BLUE_STARTERS).toContain(names[5]);
      seen.add(names[5]!);
    }
    expect(seen.size).toBe(3);
    expect(rollChampion(rngFrom(1), units).board).toContain('base1-6'); // Gyarados, his line's strongest plain print
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
