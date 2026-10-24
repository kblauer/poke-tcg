import { CPU_ID, HUMAN_ID } from '@poke-tcg/shared';
import { describe, expect, it } from 'vitest';
import { battleOverAction } from './runs.js';

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
