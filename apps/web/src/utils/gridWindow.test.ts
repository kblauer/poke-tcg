import { describe, expect, it } from 'vitest';
import { gridHeight, gridWindow, OVERSCAN_ROWS } from './gridWindow';

// 6 columns, rows 56px apart, cards 200px tall: each card hangs over the next 3 rows (and into a fourth).
const layout = { columns: 6, pitch: 56, cardHeight: 200 };

describe('the card grid’s row window', () => {
  it('is as tall as the last row’s top and its card', () => {
    expect(gridHeight(0, layout)).toBe(0);
    expect(gridHeight(1, layout)).toBe(200);
    expect(gridHeight(6, layout)).toBe(200);
    expect(gridHeight(7, layout)).toBe(256);
    expect(gridHeight(5160, layout)).toBe(859 * 56 + 200);
  });

  it('starts at the top, through the viewport and the overscan', () => {
    expect(gridWindow(5160, layout, 0, 600)).toEqual({ first: 0, last: Math.floor(600 / 56) + OVERSCAN_ROWS });
  });

  it('keeps the rows above whose cards still hang into the viewport', () => {
    const top = 56 * 100;
    const { first } = gridWindow(5160, layout, top, 600);
    // Row 97's card ends at 97 × 56 + 200 = 5632, past the viewport's top (5600); row 96's (5576) doesn't reach it.
    expect(first).toBe(96);
    expect(first * 56 + 200).toBeLessThanOrEqual(top);
    expect((first + 1) * 56 + 200).toBeGreaterThan(top);
  });

  it('ends at the last row, and renders nothing with no cards', () => {
    const rows = Math.ceil(5160 / 6);
    expect(gridWindow(5160, layout, 1e6, 600).last).toBe(rows - 1);
    expect(gridWindow(5160, layout, 1e6, 600).first).toBeLessThanOrEqual(rows - 1);
    expect(gridWindow(0, layout, 0, 600)).toEqual({ first: 0, last: -1 });
    expect(gridWindow(4, layout, 0, 600)).toEqual({ first: 0, last: 0 });
  });
});
