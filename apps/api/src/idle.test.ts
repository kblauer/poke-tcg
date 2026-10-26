import { createIdleRun } from '@poke-tcg/idle';
import { describe, expect, it } from 'vitest';
import { bankedMoney } from '@poke-tcg/idle';
import { idleStatusOf, mergeNotes } from './idle.js';

describe('the Idle Adventure on the server', () => {
  it("merges a segment's dex notes, each stat's best on its own", () => {
    const merged = mergeNotes([
      { species: 4, ivs: [31, 0, 5, 0, 0, 0], evs: [0, 10, 0, 0, 0, 0] },
      { species: 4, ivs: [2, 20, 1, 0, 0, 0], evs: [0, 4, 8, 0, 0, 0] },
      { species: 16, seen: true },
    ]);
    expect(merged.get(4)).toEqual({ caught: true, shiny: false, iv: [31, 20, 5, 0, 0, 0], ev: [0, 10, 8, 0, 0, 0] });
    // Seen only: not caught, no stats.
    expect(merged.get(16)).toEqual({ caught: false, shiny: false, iv: [0, 0, 0, 0, 0, 0], ev: [0, 0, 0, 0, 0, 0] });
  });

  it('gives a run its status from its phase', () => {
    const s = createIdleRun({ species: 1 }, 1);
    expect(idleStatusOf(s)).toBe('ACTIVE');
    expect(idleStatusOf({ ...s, phase: 'won' })).toBe('BEATEN');
    expect(idleStatusOf({ ...s, phase: 'given-up' })).toBe('GIVEN_UP');
    // Only a run that beat the Champion banks its money (the user's).
    expect(bankedMoney({ ...s, phase: 'won', money: 5000 })).toBe(5000);
    expect(bankedMoney({ ...s, phase: 'given-up', money: 5000 })).toBe(0);
  });
});
