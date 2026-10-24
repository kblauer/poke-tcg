import { describe, expect, it } from 'vitest';
import { expBarFill } from './StatusBox';

describe('expBarFill', () => {
  it('a battle (10 EXP) is a fifth of the bar, an Extra EXP battle (20) two fifths', () => {
    expect(expBarFill(10)).toEqual({ cycles: 0, percent: 20 });
    expect(expBarFill(20)).toEqual({ cycles: 0, percent: 40 });
  });

  it('crossing the end at 50 starts a new cycle with the excess', () => {
    expect(expBarFill(50)).toEqual({ cycles: 1, percent: 0 });
    expect(expBarFill(60)).toEqual({ cycles: 1, percent: 20 });
    expect(expBarFill(100)).toEqual({ cycles: 2, percent: 0 });
    expect(expBarFill(115)).toEqual({ cycles: 2, percent: 30 });
  });
});
