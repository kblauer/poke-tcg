import { describe, expect, it } from 'vitest';
import { coinRoundError, MAX_COINS } from './game-corner.js';
import { newRouletteGame, ROULETTE_GRID, rouletteFrame, rouletteMultiplier, selectionKind, type RouletteEvent, type RouletteGame, type RouletteInput } from './roulette.js';

/** The game's Random(): its linear congruential generator from a seed. */
function gbaRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 24691) >>> 0;
    return state >>> 16;
  };
}

interface Round {
  bet: number;
  payout: number;
  /** The selection bet on, its multiplier, and the square the ball fell into. */
  selection: number;
  multiplier: number;
  square: number;
}

/**
 * Plays `balls` balls (or until the player has to leave), pressing A every other frame: yes to play and to keep playing,
 * and betting on `pick(game)` (a grid selection clicked) each time. Returns each ball's round and the coins seen.
 */
function play(game: RouletteGame, seed: number, balls: number, pick: (game: RouletteGame) => number | undefined = () => undefined) {
  const random = gbaRandom(seed);
  const rounds: Round[] = [];
  const coins: number[] = [];
  let exited = false;
  for (let frame = 0; frame < balls * 3000 && rounds.length < balls && !exited; frame++) {
    const input: RouletteInput = { a: frame % 2 === 0 };
    if (game.task === 'handleBetGridInput' && frame % 2 === 0) {
      const selection = pick(game);
      if (selection !== undefined) input.select = selection;
    }
    const events: RouletteEvent[] = rouletteFrame(game, input, random);
    for (const e of events) {
      if (e.type === 'round') rounds.push({ ...e, selection: game.betSelection, multiplier: game.multiplier, square: game.hitSquares[game.ballNum - 1]! });
      if (e.type === 'exit') exited = true;
    }
    coins.push(game.coins);
  }
  return { rounds, coins, exited };
}

/** Whether the square is in the selection (its column or row, or itself). */
const inSelection = (square: number, selection: number) => !!(ROULETTE_GRID[selection]!.inSelectionFlags & (1 << square));

describe('the roulette', () => {
  it('pays a square 12 times, and a column or row by how many of its squares have been hit', () => {
    const empty = { hitFlags: 0, pokeHits: [0, 0, 0, 0], colorHits: [0, 0, 0] };
    expect(rouletteMultiplier(empty, 6)).toBe(12);
    expect(rouletteMultiplier(empty, 1)).toBe(4);
    expect(rouletteMultiplier(empty, 5)).toBe(3);
    expect(rouletteMultiplier({ ...empty, pokeHits: [2, 0, 0, 0] }, 1)).toBe(12);
    expect(rouletteMultiplier({ ...empty, pokeHits: [3, 0, 0, 0] }, 1)).toBe(0);
    expect(rouletteMultiplier({ ...empty, colorHits: [0, 1, 0] }, 10)).toBe(4);
    expect(rouletteMultiplier({ ...empty, colorHits: [0, 2, 0] }, 10)).toBe(6);
    expect(rouletteMultiplier({ ...empty, colorHits: [0, 0, 3] }, 15)).toBe(12);
    expect(rouletteMultiplier({ ...empty, hitFlags: 1 << 6 }, 6)).toBe(0);
  });

  for (const [kind, pick] of [
    ['square', (g: RouletteGame) => [6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19].find((s) => !(g.hitFlags & (1 << s)))],
    ['column', (g: RouletteGame) => [1, 2, 3, 4].find((s) => !(g.hitFlags & (1 << s)))],
    ['row', (g: RouletteGame) => [5, 10, 15].find((s) => !(g.hitFlags & (1 << s)))],
  ] as const) {
    it(`pays a ${kind} its multiplier when the ball falls in it, and nothing otherwise`, () => {
      for (const table of [0, 1] as const) {
        const { rounds } = play(newRouletteGame(table, 500, 15), 7 + table, 30, pick);
        expect(rounds.length).toBe(30);
        for (const r of rounds) {
          expect(selectionKind(r.selection)).toBe(kind);
          expect(r.bet).toBe(table ? 3 : 1);
          expect(r.payout).toBe(inSelection(r.square, r.selection) ? r.bet * r.multiplier : 0);
          expect(coinRoundError('roulette', r.bet, r.payout)).toBeNull();
        }
      }
    });
  }

  it('always ends a ball in a slot not hit before in its round of 6', () => {
    for (const table of [0, 1] as const) {
      for (const hours of [2, 8, 12, 20]) {
        const game = newRouletteGame(table, 2000, hours);
        const { rounds } = play(game, 1000 + hours * 2 + table, 60);
        expect(rounds.length).toBe(60);
        for (let i = 0; i < rounds.length; i += 6) {
          const squares = rounds.slice(i, i + 6).map((r) => r.square);
          expect(squares.every((s) => selectionKind(s) === 'square')).toBe(true);
          expect(new Set(squares).size).toBe(squares.length);
        }
      }
    }
  });

  it('plays the same with the same random numbers', () => {
    const a = play(newRouletteGame(1, 300, 9), 42, 18);
    const b = play(newRouletteGame(1, 300, 9), 42, 18);
    expect(a.rounds).toEqual(b.rounds);
    expect(a.rounds.map((r) => r.square)).not.toEqual(play(newRouletteGame(1, 300, 9), 43, 18).rounds.map((r) => r.square));
  });

  it('keeps the coins between 0 and the Coin Case’s 9999', () => {
    const full = play(newRouletteGame(0, MAX_COINS - 2, 15), 5, 40, (g) => [5, 10, 15].find((s) => !(g.hitFlags & (1 << s))));
    expect(Math.max(...full.coins)).toBeLessThanOrEqual(MAX_COINS);
    expect(full.coins).toContain(MAX_COINS);
    const poor = play(newRouletteGame(1, 6, 15), 3, 40, (g) => [6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19].find((s) => !(g.hitFlags & (1 << s))));
    expect(Math.min(...poor.coins)).toBeGreaterThanOrEqual(0);
  });

  it('sends the player away when the coins run out, or when they say no', () => {
    // 3 coins at the right table: one ball on a square, then (most likely) no coins left.
    const game = newRouletteGame(1, 3, 15);
    const { rounds, exited } = play(game, 11, 5, () => 6);
    if (rounds[0]!.payout === 0) {
      expect(exited).toBe(true);
      expect(game.coins).toBe(0);
    }
    const broke = newRouletteGame(1, 2, 15);
    expect(play(broke, 1, 1).exited).toBe(true);
    expect(broke.message).toBeNull();
    const no = newRouletteGame(0, 50, 15);
    const random = gbaRandom(1);
    rouletteFrame(no, {}, random);
    rouletteFrame(no, {}, random);
    expect(no.yesNo).toBe(0);
    expect(rouletteFrame(no, { b: true }, random)).toContainEqual({ type: 'exit' });
  });
});
