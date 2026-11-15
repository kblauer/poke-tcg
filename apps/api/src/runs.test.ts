import { CPU_ID, HUMAN_ID } from '@poke-tcg/shared';
import { describe, expect, it } from 'vitest';
import { battleOverAction, retryError } from './runs.js';

describe("a finished game's BATTLE_OVER", () => {
  it('is won when the player is the winner, lost otherwise (the CPU, or no winner)', () => {
    expect(battleOverAction('g1', HUMAN_ID, 0, false)).toEqual({ type: 'BATTLE_OVER', gameId: 'g1', won: true });
    expect(battleOverAction('g1', CPU_ID, 0, false)).toEqual({ type: 'BATTLE_OVER', gameId: 'g1', won: false });
    expect(battleOverAction('g1', null, 0, false)).toEqual({ type: 'BATTLE_OVER', gameId: 'g1', won: false });
  });

  it("carries `conceded` only when the player conceded (a CONCEDE among their action rows), and `skipped` only for the debug skip", () => {
    expect(battleOverAction('g1', CPU_ID, 1, false)).toEqual({ type: 'BATTLE_OVER', gameId: 'g1', won: false, conceded: true });
    expect(battleOverAction('g1', HUMAN_ID, 0, true)).toEqual({ type: 'BATTLE_OVER', gameId: 'g1', won: true, skipped: true });
    // Neither flag is ever present as false: the run keys on their presence.
    expect(Object.keys(battleOverAction('g1', HUMAN_ID, 0, false))).toEqual(['type', 'gameId', 'won']);
  });
});

describe('carrying a lost run on (the Retry testing aid)', () => {
  it('is only for the latest run, with no other under way', () => {
    expect(retryError('b', 'b', [])).toBeNull();
    // Carried on already: still the only one under way.
    expect(retryError('b', 'b', ['b'])).toBeNull();
    // An older lost run, a newer one started since (two tabs): it would be ACTIVE where nothing shows it.
    expect(retryError('a', 'b', ['b'])).toBe('Only your latest run can be carried on');
    expect(retryError('a', 'b', [])).toBe('Only your latest run can be carried on');
    expect(retryError('b', 'b', ['a'])).toBe('Finish your current run first');
    expect(retryError('a', null, [])).toBe('Only your latest run can be carried on');
  });
});
