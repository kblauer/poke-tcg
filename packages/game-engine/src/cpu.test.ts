import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getCard, runCpu, starterDeck, type GameState } from './index.js';

const newGame = () => createGame({ id: 'player', deck: starterDeck('fire') }, { id: 'cpu', deck: starterDeck('water') }, 7);

function playerSetsActive(state: GameState): GameState {
  const basic = state.players.player!.hand.find((c) => getCard(c.defId).kind === 'pokemon')!;
  const res = applyAction(state, 'player', { type: 'SET_ACTIVE', cardUid: basic.uid });
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

describe('dummy CPU', () => {
  it('chooses an active during setup, then waits for the player', () => {
    const { state, actions } = runCpu(newGame(), 'cpu');
    expect(actions).toEqual([{ type: 'SET_ACTIVE', cardUid: expect.any(String) }]);
    expect(state.players.cpu!.active).not.toBeNull();
    expect(state.phase).toBe('setup');
  });

  it('ends its turn and hands control back to the player', () => {
    let state = playerSetsActive(runCpu(newGame(), 'cpu').state);
    const res = applyAction(state, 'player', { type: 'END_TURN' });
    if (!res.ok) throw new Error(res.error);
    ({ state } = runCpu(res.state, 'cpu'));
    expect(state.currentPlayer).toBe('player');
    expect(state.turn).toBe(3);
  });

  it('does nothing when it is not its move', () => {
    const state = playerSetsActive(runCpu(newGame(), 'cpu').state);
    expect(runCpu(state, 'cpu').actions).toEqual([]);
  });
});
