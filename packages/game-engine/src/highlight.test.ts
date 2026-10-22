import { describe, expect, it } from 'vitest';
import type { GameAction, GameState } from './engine.js';
import { act, duel, give, id } from './effects/test-kit.js';
import { moveHighlights } from './highlight.js';

/** Ash's moves one after another, with the highlights of each. */
function moves(start: GameState, ...build: ((s: GameState) => GameAction)[]) {
  const actions: GameAction[] = [];
  const states: GameState[] = [];
  let s = start;
  for (const next of build) {
    const action = next(s);
    s = act(s, 'ash', action);
    actions.push(action);
    states.push(s);
  }
  return moveHighlights(start, 'ash', actions, states);
}

describe('move highlights', () => {
  it('Energy Removal shows the card and the Pokémon whose Energy went', () => {
    const s = duel('charmander', 'squirtle', { defenderEnergy: ['water', 'water'] });
    const [er] = give(s, 'ash', 'energyremoval');
    expect(moves(s, () => ({ type: 'PLAY_TRAINER', cardUid: er! }))).toEqual([{ defId: id('energyremoval'), pokemon: [{ player: 'misty', target: 'active' }] }]);
  });

  it('attaching Energy shows the Energy card and the Pokémon it went to; a Trainer that changes no Pokémon shows only itself', () => {
    const s = duel('charmander', 'squirtle', { bench: ['charmander'] });
    const [fire, bill] = give(s, 'ash', 'fire', 'bill');
    expect(
      moves(
        s,
        () => ({ type: 'ATTACH_ENERGY', cardUid: fire!, target: 0 }),
        () => ({ type: 'PLAY_TRAINER', cardUid: bill! }),
      ),
    ).toEqual([
      { defId: id('fire'), pokemon: [{ player: 'ash', target: 0 }] },
      { defId: id('bill'), pokemon: [] },
    ]);
  });

  it('shows nothing for a move with no card: ending the turn', () => {
    expect(moves(duel('charmander', 'squirtle'), () => ({ type: 'END_TURN' }))).toEqual([null]);
  });
});
