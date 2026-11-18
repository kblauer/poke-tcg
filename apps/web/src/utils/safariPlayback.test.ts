import { int, rngFrom, sample } from '@poke-tcg/campaign';
import { simulateBattle, TRAINER_NAMES, type Board } from '@poke-tcg/safari';
import { describe, expect, it } from 'vitest';
import { gen1Units } from '../../../../packages/safari/src/gen1';
import { playbackFrames, startLines } from './safariPlayback';

const units = gen1Units();

/** A random board of up to 6 units, a Trainer half the time. */
function board(seed: number): Board {
  const rng = rngFrom(seed);
  const picked = sample(rng, units, 1 + int(rng, 6));
  return int(rng, 2) ? { units: picked, trainer: TRAINER_NAMES[int(rng, TRAINER_NAMES.length)]! } : { units: picked };
}

describe("Safari Draft's battle playback", () => {
  it('starts with each board left to right, as the battle names them', () => {
    const [a, b] = startLines(board(1), board(2));
    expect(a.map((f) => f.uid)).toEqual(a.map((_, i) => `a${i}`));
    expect(b.map((f) => f.uid)).toEqual(b.map((_, i) => `b${i}`));
  });

  it('ends where the battle ends: its winner, and the Pokémon left standing on each side', () => {
    for (let seed = 0; seed < 300; seed++) {
      const mine = board(seed * 2 + 1);
      const theirs = board(seed * 2 + 2);
      const result = simulateBattle(mine, theirs, seed);
      const frames = playbackFrames(mine, theirs, result.events);
      const last = frames.at(-1)!;
      expect(last.winner, `seed ${seed}`).toBe(result.winner);
      expect([last.lines[0].length, last.lines[1].length], `seed ${seed}`).toEqual(result.left);
      for (const frame of frames) {
        for (const line of frame.lines) {
          expect(new Set(line.map((f) => f.uid)).size).toBe(line.length);
          for (const f of line) expect(f.hp).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
