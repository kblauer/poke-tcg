import { describe, expect, it } from 'vitest';
import { random, rngFrom } from './random.js';
import { afterFlip, afterRoundSummary, BOARD_CONFIGS, boardTotals, displayLevel, levelsGained, maxPayout, newBoard, newVoltorbFlipState, nextLevel, settleRound, VOLTORB, voltorbFlipStateOf, type RoundSummary, type VoltorbBoard, type VoltorbCard, type VoltorbFlipState } from './voltorb-flip.js';

const rand = (seed: number) => {
  const rng = rngFrom(seed);
  return () => Math.floor(random(rng) * 2 ** 32);
};
const withRounds = (...rounds: Partial<RoundSummary>[]): VoltorbFlipState => {
  let s = newVoltorbFlipState();
  for (const r of rounds) s = afterRoundSummary(s, { outcome: 'quit', cardsFlipped: 0, boardId: 0, level: 7, ...r });
  return s;
};
// The first board of Lv. `level` (1-8): each level has 10, Lv. 1's first.
const boardOf = (level: number) => 10 * (level - 1);

describe('Voltorb Flip', () => {
  it('starts at Lv. 1', () => {
    expect(displayLevel(nextLevel(newVoltorbFlipState()))).toBe(1);
  });

  it('moves the level as voltorb_flip_game.c does', () => {
    // A won round goes up one level; Lv. 2 or more flipped cards take it to as many levels as were flipped, at most its own.
    expect(displayLevel(nextLevel(withRounds({ outcome: 'won', boardId: boardOf(1) })))).toBe(2);
    expect(displayLevel(nextLevel(withRounds({ outcome: 'won', boardId: boardOf(4) })))).toBe(5);
    expect(displayLevel(nextLevel(withRounds({ outcome: 'lost', boardId: boardOf(4), cardsFlipped: 2 })))).toBe(2);
    expect(displayLevel(nextLevel(withRounds({ outcome: 'lost', boardId: boardOf(4), cardsFlipped: 9 })))).toBe(4);
    expect(displayLevel(nextLevel(withRounds({ outcome: 'lost', boardId: boardOf(4), cardsFlipped: 0 })))).toBe(1);
    expect(displayLevel(nextLevel(withRounds({ outcome: 'won', boardId: boardOf(8) })))).toBe(8);
    // Winning Lv. 7 isn't enough for Lv. 8: only the streak below reaches it.
    expect(displayLevel(nextLevel(withRounds({ outcome: 'won', boardId: boardOf(7) })))).toBe(7);
    expect(displayLevel(nextLevel(withRounds({ outcome: 'lost', boardId: boardOf(8), cardsFlipped: 7 })))).toBe(7);
    // From Lv. 5, five rounds in a row of 8 or more cards without a loss give Lv. 8.
    const five = Array.from({ length: 5 }, () => ({ outcome: 'quit' as const, boardId: boardOf(5), cardsFlipped: 8 }));
    expect(displayLevel(nextLevel(withRounds(...five)))).toBe(8);
    expect(displayLevel(nextLevel(withRounds(...five.slice(0, 4), { outcome: 'lost', boardId: boardOf(5), cardsFlipped: 8 })))).toBe(5);
  });

  it('lays out each board with its config’s cards and no more free multipliers than it allows', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = seed % 8;
      const s = withRounds({ outcome: 'won', boardId: level === 0 ? 70 : 10 * (7 - level) - 10 });
      const board = newBoard(s, rand(seed));
      expect(board.level).toBe(nextLevel(s));
      expect(Math.floor(board.boardId / 10)).toBe(7 - board.level);
      const [voltorbs, twos, threes, perRowCol, total] = BOARD_CONFIGS[board.boardId]!;
      const count = (c: VoltorbCard) => board.cards.filter((x) => x === c).length;
      expect([count(VOLTORB), count(2), count(3), count(1)]).toEqual([voltorbs, twos, threes, 25 - voltorbs - twos - threes]);
      const { voltorbsPerRow, voltorbsPerCol } = boardTotals(board.cards);
      const free = board.cards.map((c, i) => (c === 2 || c === 3) && (voltorbsPerRow[Math.floor(i / 5)] === 0 || voltorbsPerCol[i % 5] === 0));
      // The 1000 tries nearly always find a board within the limits.
      expect(free.filter(Boolean).length).toBeLessThan(total + (seed % 50 === 0 ? 1 : 0));
      for (let k = 0; k < 5; k++) {
        expect(free.filter((f, i) => f && Math.floor(i / 5) === k).length).toBeLessThan(perRowCol + 1);
        expect(free.filter((f, i) => f && i % 5 === k).length).toBeLessThan(perRowCol + 1);
      }
    }
  });

  it('sums each row and column', () => {
    const cards: VoltorbCard[] = [1, 2, 3, 4, 1, ...Array<VoltorbCard>(20).fill(1)];
    const t = boardTotals(cards);
    expect(t.pointsPerRow[0]).toBe(7);
    expect(t.voltorbsPerRow[0]).toBe(1);
    expect(t.pointsPerCol[3]).toBe(4);
    expect(t.voltorbsPerCol[3]).toBe(1);
    expect(maxPayout(cards)).toBe(6);
    expect(afterFlip(0, 3)).toBe(3);
    expect(afterFlip(3, 1)).toBe(3);
    expect(afterFlip(3, 2)).toBe(6);
  });

  describe('settling a round', () => {
    const board: VoltorbBoard = { boardId: 0, level: 7, cards: [3, 2, 4, 1, 1, ...Array<VoltorbCard>(20).fill(1)] };
    it('pays a quit round its coins and a won one every card’s', () => {
      expect(settleRound(board, [3, 0], 'quit')).toEqual({ payout: 3, summary: { outcome: 'quit', cardsFlipped: 2, boardId: 0, level: 7 } });
      expect(settleRound(board, [], 'quit')).toMatchObject({ payout: 0 });
      expect(settleRound(board, [0, 4, 1], 'won')).toEqual({ payout: 6, summary: { outcome: 'won', cardsFlipped: 3, boardId: 0, level: 7 } });
    });
    it('pays nothing for a Voltorb, which isn’t counted as flipped', () => {
      expect(settleRound(board, [0, 2], 'lost')).toEqual({ payout: 0, summary: { outcome: 'lost', cardsFlipped: 1, boardId: 0, level: 7 } });
    });
    it('turns down rounds the board couldn’t have played', () => {
      expect(settleRound(board, [2, 0], 'lost')).toHaveProperty('error');
      expect(settleRound(board, [0, 0], 'quit')).toHaveProperty('error');
      expect(settleRound(board, [0, 1], 'quit')).toHaveProperty('error');
      expect(settleRound(board, [0, 1, 3], 'won')).toHaveProperty('error');
      expect(settleRound(board, [0], 'won')).toHaveProperty('error');
      expect(settleRound(board, [0], 'lost')).toHaveProperty('error');
      expect(settleRound(board, [25], 'quit')).toHaveProperty('error');
    });
  });

  it('keeps the last 5 rounds and tells the level’s change', () => {
    let s = withRounds({ outcome: 'won', boardId: boardOf(3), level: 5 });
    s = { ...s, board: newBoard(s, rand(3)) };
    expect(levelsGained(s)).toBe(1);
    s = withRounds({}, {}, {}, {}, {}, { cardsFlipped: 6 });
    expect(s.head).toBe(1);
    expect(s.history[0]!.cardsFlipped).toBe(6);
    expect(voltorbFlipStateOf(null)).toEqual(newVoltorbFlipState());
    expect(voltorbFlipStateOf(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
