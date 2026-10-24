import { describe, expect, it } from 'vitest';
import { hpBarFill } from './HpBar';

describe('hpBarFill', () => {
  it('goes full and green, 45% yellow, 15% red, then empty', () => {
    expect(hpBarFill(3, 3)).toEqual({ percent: 100, color: 'green' });
    expect(hpBarFill(2, 3)).toEqual({ percent: 45, color: 'yellow' });
    expect(hpBarFill(1, 3)).toEqual({ percent: 15, color: 'red' });
    expect(hpBarFill(0, 3).percent).toBe(0);
  });
});
