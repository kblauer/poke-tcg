import { describe, expect, it } from 'vitest';
import { feedPoffin, feedPokeblock, natureFlavors, NO_CONDITION, type Condition } from './condition.js';
import {
  ACCESSORY_LIMIT,
  actingTurn,
  canEnter,
  canUseMove,
  contestMove,
  createContest,
  danceAll,
  danceTiming,
  DANCE_LEADS,
  finishDance,
  finishVisual,
  outfitError,
  PLAYER,
  ribbonId,
  roundPoints,
  scarfModifier,
  visualScore,
  type ContestState,
  type DancePress,
} from './contest.js';
import { CONTEST_ENTRANTS } from './contest-data.js';

const player = (moves = ['thunder-shock', 'quick-attack', 'thunderbolt', 'agility'], condition: Condition = [120, 40, 40, 40, 60, 100]) => ({ species: 25, name: 'Pikachu', trainer: 'Red', moves, condition });

/** A contest played through with the player's first usable move to Dexter each turn and no dance presses. */
function playThrough(seed: number, rank = 0, category = 0): ContestState {
  let s = createContest({ rank, category, player: player(), postgame: false }, seed);
  const v = finishVisual(s, [0, 1]);
  if ('error' in v) throw new Error(v.error);
  const d = finishDance(v, []);
  if ('error' in d) throw new Error(d.error);
  s = d;
  while (s.phase === 'acting') {
    const move = s.entrants[PLAYER]!.moves.find((m) => canUseMove(s.acting!, PLAYER, m))!;
    const t = actingTurn(s, move, 1);
    if ('error' in t) throw new Error(t.error);
    s = t;
  }
  return s;
}

describe('condition', () => {
  const HARDY = 0;
  const LONELY = 1; // likes spicy, dislikes sour
  const BOLD = 5; // likes sour, dislikes spicy
  it('adds each flavour to its condition and the feel to the sheen, kept to 255', () => {
    expect(feedPokeblock([0, 0, 0, 0, 0, 0], [10, 0, 5, 0, 1], 20, HARDY)).toEqual([10, 0, 5, 0, 1, 20]);
    expect(feedPoffin([250, 0, 0, 0, 0, 250], [10, 0, 0, 0, 0], 20, HARDY)).toEqual([255, 0, 0, 0, 0, 255]);
  });
  it("won't eat with a full sheen", () => {
    expect(feedPokeblock([0, 0, 0, 0, 0, 255], [10, 0, 0, 0, 0], 1, HARDY)).toBeNull();
    expect(feedPoffin([0, 0, 0, 0, 0, 255], [10, 0, 0, 0, 0], 1, HARDY)).toBeNull();
  });
  it('knows each nature’s liked and disliked flavour', () => {
    expect(natureFlavors(HARDY)).toBeNull();
    expect(natureFlavors(LONELY)).toEqual({ liked: 0, disliked: 4 });
    expect(natureFlavors(15)).toEqual({ liked: 1, disliked: 0 }); // Modest: dry, not spicy
  });
  it('gives a Pokéblock a tenth more of a liked flavour when the nature likes it overall, a tenth less of a disliked one when not', () => {
    // Lonely: spicy 25 liked, sour 10 disliked: gain 15 > 0, spicy +3 (2.5 rounded up), sour unchanged.
    expect(feedPokeblock(NO_CONDITION, [25, 0, 0, 0, 10], 5, LONELY)).toEqual([28, 0, 0, 0, 10, 5]);
    // Bold: spicy 25 disliked, sour 10 liked: gain −15, spicy −3, sour unchanged.
    expect(feedPokeblock(NO_CONDITION, [25, 0, 0, 0, 10], 5, BOLD)).toEqual([22, 0, 0, 0, 10, 5]);
  });
  it('gives a Poffin ×1.1 of the liked flavour and ×0.9 of the disliked', () => {
    expect(feedPoffin(NO_CONDITION, [20, 0, 0, 0, 20], 10, LONELY)).toEqual([22, 0, 0, 0, 18, 10]);
    expect(feedPoffin(NO_CONDITION, [10, 0, 0, 0, 10], 10, LONELY)).toEqual([11, 0, 0, 0, 9, 10]);
  });
});

describe('moves', () => {
  it('knows every Kanto move, the Idle Adventure spellings too', () => {
    for (const key of ['tackle', 'smokescreen', 'self-destruct', 'soft-boiled', 'leech-seed']) expect(contestMove(key)).not.toBeNull();
    expect(contestMove('leech-seed')!.effect).toBe(21);
  });
});

describe('entering', () => {
  it('needs 2 moves and the ranks below', () => {
    expect(canEnter([], 0, 0, 1)).toMatch(/2 moves/);
    expect(canEnter([], 0, 0, 2)).toBeNull();
    expect(canEnter([], 0, 1, 2)).toMatch(/Normal/);
    expect(canEnter([ribbonId(0, 0)], 0, 1, 2)).toBeNull();
    expect(canEnter([ribbonId(0, 0)], 1, 1, 2)).not.toBeNull();
  });
  it('picks 3 different entrants of the rank and category, every rank and category', () => {
    for (let rank = 0; rank < 4; rank++)
      for (let category = 0; category < 5; category++)
        for (const postgame of [false, true])
          for (let seed = 1; seed < 20; seed++) {
            const s = createContest({ rank, category, player: player(), postgame }, seed * 7919);
            const npcs = s.entrants.slice(1).map((e) => e.npc!);
            expect(new Set(npcs).size).toBe(3);
            for (const i of npcs) {
              const n = CONTEST_ENTRANTS[i]!;
              expect(n.rank).toBe(rank);
              expect(n.categories >> category & 1).toBe(1);
              expect(n.official || n.practice).toBe(0);
              if (!postgame) expect(n.postgame).toBe(0);
            }
          }
  });
  it('draws the Normal Rank theme from Created, Natural and Colorful', () => {
    for (let seed = 1; seed < 50; seed++) expect([2, 3, 4]).toContain(createContest({ rank: 0, category: 0, player: player(), postgame: false }, seed).theme);
  });
});

describe('the Visual Competition', () => {
  it('scores the primary condition and half the two beside it and the sheen', () => {
    // Cool: Cool + (Tough + Beauty + Sheen) / 2.
    expect(visualScore(0, 0, 2, [3, 1, 3, 1, 2, 30], []).condition).toBe(3 + 16);
    expect(visualScore(0, 0, 2, [3, 1, 3, 1, 2, 30], []).hearts).toBe(1);
    expect(visualScore(3, 0, 2, [255, 255, 255, 255, 255, 255], []).hearts).toBe(8);
  });
  it('raises the condition score with a scarf, most for the category’s own', () => {
    expect(scarfModifier(0, 'red-scarf')).toBe(110);
    expect(scarfModifier(0, 'blue-scarf')).toBe(105);
    expect(scarfModifier(0, 'yellow-scarf')).toBe(105);
    expect(scarfModifier(0, 'pink-scarf')).toBe(100);
    expect(scarfModifier(0, null)).toBe(100);
    expect(visualScore(0, 0, 2, [100, 0, 0, 0, 0, 0], [], 'red-scarf').condition).toBe(110);
  });
  it('gives stars for the theme points, none for none', () => {
    // Created (2): Peculiar Spoon (40) is 2 points, Specs (56-58) 2 each.
    expect(visualScore(0, 0, 2, NO_CONDITION, []).stars).toBe(0);
    expect(visualScore(0, 0, 2, NO_CONDITION, [40]).stars).toBe(1);
    expect(visualScore(0, 0, 2, NO_CONDITION, [40, 56, 57, 58, 59]).themePoints).toBe(10);
    expect(visualScore(0, 0, 2, NO_CONDITION, [40, 56, 57, 58, 59]).stars).toBe(4);
  });
  it('limits the accessories by rank and copies', () => {
    expect(outfitError(0, Array(ACCESSORY_LIMIT[0] + 1).fill(0))).toMatch(/At most/);
    expect(outfitError(3, [61, 61])).toMatch(/Too many/);
    expect(outfitError(3, Array(9).fill(0))).toBeNull();
    expect(outfitError(3, Array(10).fill(0))).toMatch(/Too many/);
  });
});

describe('the Dance Competition', () => {
  it('times the Normal Rank dance as Platinum does', () => {
    const t = danceTiming(0, 0);
    expect(t.song).toBe('SEQ_CO_KASHI');
    expect(t.beat).toBe(150000);
    expect(t.cycleFrames).toBe(240);
    expect(t.turnStarts[0]).toBe(60);
    expect(t.turnStarts[1]).toBe(240 * 2 + 120 + 60);
    expect(t.cooldown).toBe(13);
    expect(t.leadUntil).toBe(117);
  });
  it('lets the CPUs dance and gives the player nothing without presses', () => {
    for (let seed = 1; seed < 30; seed++) {
      const v = finishVisual(createContest({ rank: seed % 4, category: seed % 5, player: player(), postgame: false }, seed), []) as ContestState;
      const { steps, score } = danceAll(v, []);
      const t = danceTiming(v.rank, v.category);
      expect(steps).toHaveLength(8);
      expect(score[PLAYER]).toBe(0);
      for (let c = 1; c < 4; c++) expect(score[c]).toBeLessThanOrEqual(16 * t.steps);
      // Each CPU leads its own turn with a cycle's steps.
      for (let cycle = 0; cycle < 6; cycle++) expect(steps[cycle]!.filter((s) => s.contestant === DANCE_LEADS[cycle >> 1]).length).toBe(t.steps);
    }
  });
  it('grades steps on the beat, copied the same way, Excellent', () => {
    const v = finishVisual(createContest({ rank: 0, category: 0, player: player(), postgame: false }, 1234), []) as ContestState;
    const t = danceTiming(0, 0);
    const first = danceAll(v, []);
    const presses: DancePress[] = [];
    // Copy each CPU lead's steps a half cycle on, on their half-beats.
    for (let cycle = 0; cycle < 6; cycle++)
      for (const s of first.steps[cycle]!.filter((s) => s.contestant === DANCE_LEADS[cycle >> 1]))
        presses.push({ cycle, frame: Math.trunc(((s.index + t.halfBeats / 2) * Math.trunc(t.beat / 2) + 5000) / 10000), move: s.move });
    // Lead on the beats.
    for (const cycle of [6, 7]) for (let b = 1; b <= t.steps; b++) presses.push({ cycle, frame: Math.trunc((b * t.beat + 5000) / 10000), move: (b % 4) + 1 });
    const again = danceAll(v, presses);
    const mine = again.steps.flat().filter((s) => s.contestant === PLAYER);
    expect(mine.length).toBe(8 * t.steps);
    expect(mine.every((s) => s.grade === 'excellent')).toBe(true);
    expect(again.score[PLAYER]).toBe(16 * t.steps);
  });
  it('misses a copied step the wrong way', () => {
    const v = finishVisual(createContest({ rank: 0, category: 0, player: player(), postgame: false }, 99), []) as ContestState;
    const t = danceTiming(0, 0);
    const s = danceAll(v, []).steps[0]!.find((x) => x.contestant === 3)!;
    const frame = Math.trunc(((s.index + t.halfBeats / 2) * Math.trunc(t.beat / 2) + 5000) / 10000);
    const mine = danceAll(v, [{ cycle: 0, frame, move: (s.move % 4) + 1 }]).steps[0]!.find((x) => x.contestant === PLAYER)!;
    expect(mine.grade).toBe('miss');
  });
});

describe('the Acting Competition', () => {
  it('refuses a move not known, the same move twice, an unknown judge', () => {
    const v = finishVisual(createContest({ rank: 0, category: 0, player: player(), postgame: false }, 5), []) as ContestState;
    const d = finishDance(v, []) as ContestState;
    expect(actingTurn(d, 'surf', 0)).toHaveProperty('error');
    expect(actingTurn(d, 'quick-attack', 3)).toHaveProperty('error');
    const t = actingTurn(d, 'quick-attack', 0) as ContestState;
    expect(actingTurn(t, 'quick-attack', 0)).toHaveProperty('error');
  });
  it('plays 4 turns to a placing over many contests', () => {
    for (let seed = 1; seed < 120; seed++) {
      const s = playThrough(seed * 31, seed % 4, seed % 5);
      expect(s.phase).toBe('results');
      const a = s.acting!;
      expect(a.turns).toHaveLength(4);
      for (const turn of a.turns) {
        expect([...turn.order].sort()).toEqual([0, 1, 2, 3]);
        for (const p of turn.performances) expect(p.voltage).toBeLessThanOrEqual(50);
        for (const sc of turn.scores) expect(sc).toBeGreaterThanOrEqual(0);
      }
      // A CPU never repeats a move unless a Consecutive Use let it.
      for (let c = 1; c < 4; c++)
        for (let i = 1; i < 4; i++) {
          const m = a.turns[i]!.performances.find((p) => p.contestant === c)!.move;
          const prev = a.turns[i - 1]!.performances.find((p) => p.contestant === c)!.move;
          if (m === prev) expect(contestMove(prev)!.effect).toBe(7);
        }
      expect(a.voltage.every((x) => x >= 0 && x <= 40 && x % 10 === 0)).toBe(true);
      expect(a.totals).toEqual([0, 1, 2, 3].map((c) => a.turns.reduce((sum, t) => sum + t.scores[c]!, 0)));
      expect([...s.result!.placing].sort()).toEqual([0, 1, 2, 3]);
    }
  });
  it('gives the main judge’s full Voltage 8 hearts', () => {
    // Every turn a Cool move to Dexter in a Cool contest; with the CPUs' Cool moves it fills in some contests.
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const s = playThrough(seed, 0, 0);
      for (const t of s.acting!.turns) for (const p of t.performances) if (p.maxVoltage) {
        expect(p.maxVoltage).toBe(p.judge === 1 ? 80 : 50);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('the results', () => {
  it('weighs each round against its best', () => {
    expect(roundPoints([12, 6, 0, 3], 3333)).toEqual([33, 17, 0, 8]);
    expect(roundPoints([0, 0, 0, 0], 3333)).toEqual([0, 0, 0, 0]);
  });
});
