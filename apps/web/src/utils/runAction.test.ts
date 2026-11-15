import { describe, expect, it } from 'vitest';
import { afterRunAction, spottedWait, SPOTTED_MS } from './runAction';

describe('afterRunAction', () => {
  it('opens the game a move started', () => {
    expect(afterRunAction({ gameId: null }, { gameId: 'g1' })).toBe('battle');
    expect(afterRunAction(null, { gameId: 'g1' })).toBe('battle');
    // A gym leader fought again: another game.
    expect(afterRunAction({ gameId: 'g1' }, { gameId: 'g2' })).toBe('battle');
  });

  it('goes back to the run when the battle under way is gone (an Escape Rope)', () => {
    expect(afterRunAction({ gameId: 'g1' }, { gameId: null })).toBe('escaped');
    expect(afterRunAction({ gameId: 'g1' }, {})).toBe('escaped');
  });

  it('only takes the mark off after any other move', () => {
    // A plain move on the map, or an event chosen (its NPC marked, with no "!").
    expect(afterRunAction({ gameId: null }, { gameId: null })).toBe('settled');
    expect(afterRunAction(null, {})).toBe('settled');
    // An item used during a battle that goes on.
    expect(afterRunAction({ gameId: 'g1' }, { gameId: 'g1' })).toBe('settled');
  });
});

describe('spottedWait', () => {
  it('holds a battle back until its "!" has shown long enough', () => {
    expect(spottedWait(1000, 1000)).toBe(SPOTTED_MS);
    expect(spottedWait(1000, 1400)).toBe(SPOTTED_MS - 400);
    expect(spottedWait(1000, 1000 + SPOTTED_MS + 5)).toBe(0);
  });

  it('doesn\'t wait when no "!" is shown (a spotted event, a battle started some other way)', () => {
    expect(spottedWait(null, 5000)).toBe(0);
  });
});
