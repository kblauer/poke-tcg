import { describe, expect, it } from 'vitest';
import { applyAction, createGame, isBasicPokemon, lookupCard, runCpu, type GameState } from '../index.js';
import { TEST_CARDS, testDeck } from '../test-cards.js';

/** A new game in which the player won the turn-order flip. */
const newGame = () => ({ ...createGame({ id: 'player', deck: testDeck('fire') }, { id: 'cpu', deck: testDeck('water') }, 7, TEST_CARDS), currentPlayer: 'player' });

function playerSetsActive(state: GameState): GameState {
  const basic = state.players.player!.hand.find((c) => isBasicPokemon(lookupCard(state.cards, c.defId)))!;
  const res = applyAction(state, 'player', { type: 'SET_ACTIVE', cardUid: basic.uid });
  if (!res.ok) throw new Error(res.error);
  const ready = applyAction(res.state, 'player', { type: 'START_BATTLE' });
  if (!ready.ok) throw new Error(ready.error);
  return ready.state;
}

describe('CPU (gym leader by default)', () => {
  it('chooses an active during setup, starts the battle, then waits for the player', () => {
    const { state, actions } = runCpu(newGame(), 'cpu');
    expect(actions).toEqual([{ type: 'SET_ACTIVE', cardUid: expect.any(String) }, { type: 'START_BATTLE' }]);
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

  it('takes the first turn when it won the turn-order flip, once the player has chosen an active', () => {
    let state = playerSetsActive(runCpu({ ...newGame(), currentPlayer: 'cpu' }, 'cpu').state);
    expect([state.phase, state.currentPlayer, state.turn]).toEqual(['playing', 'cpu', 1]);
    ({ state } = runCpu(state, 'cpu'));
    expect([state.currentPlayer, state.turn]).toEqual(['player', 2]);
  });

  describe('on its turn', () => {
    /** The CPU (fire deck) has Charmander active, no bench and only `hand` in hand; it's the CPU's turn `turn`. */
    function cpuTurn(hand: string[], turn = 4): GameState {
      let s = createGame({ id: 'player', deck: testDeck('water') }, { id: 'cpu', deck: testDeck('fire') }, 7, TEST_CARDS);
      s = structuredClone(s);
      const cpu = s.players.cpu!;
      cpu.active = { card: { uid: 'cpu-active', defId: 'charmander' }, evolvedFrom: [], damage: 0, energy: [], playedTurn: 0 };
      cpu.hand = hand.map((defId, i) => ({ uid: `h${i}-${defId}`, defId }));
      s.players.player!.active = { card: { uid: 'p-active', defId: 'squirtle' }, evolvedFrom: [], damage: 0, energy: [], playedTurn: 0 };
      s.phase = 'playing';
      s.turn = turn;
      s.currentPlayer = 'cpu';
      return s;
    }

    it('benches its Basics, attaches energy, then attacks', () => {
      const { state, actions } = runCpu(cpuTurn(['charmander', 'charmander', 'fire-energy', 'fire-energy']), 'cpu');
      expect(actions.map((a) => a.type)).toEqual(['PLAY_BENCH', 'PLAY_BENCH', 'ATTACH_ENERGY', 'ATTACK']);
      const cpu = state.players.cpu!;
      expect(cpu.bench.filter(Boolean)).toHaveLength(2);
      expect(cpu.active!.energy.map((e) => e.defId)).toEqual(['fire-energy']);
      expect(cpu.hand.map((c) => c.defId)).toEqual(['fire-energy']);
      expect(state.currentPlayer).toBe('player');
    });

    it('attaches energy of any type to a colorless cost', () => {
      const { state } = runCpu(cpuTurn(['water-energy']), 'cpu');
      expect(state.players.cpu!.active!.energy.map((e) => e.defId)).toEqual(['water-energy']);
    });

    it('evolves when it can', () => {
      const { state, actions } = runCpu(cpuTurn(['charmeleon', 'charizard']), 'cpu');
      // Charizard can't follow on the same turn Charmeleon was played.
      expect(actions.map((a) => a.type)).toEqual(['EVOLVE', 'END_TURN']);
      expect(state.players.cpu!.active!.card.defId).toBe('charmeleon');
    });

    it("doesn't evolve on its first turn", () => {
      const { actions } = runCpu(cpuTurn(['charmeleon'], 2), 'cpu');
      expect(actions).toEqual([{ type: 'END_TURN' }]);
    });

    it('stops benching when the bench is full', () => {
      const { state } = runCpu(cpuTurn(Array<string>(6).fill('charmander')), 'cpu');
      expect(state.players.cpu!.bench.every(Boolean)).toBe(true);
      expect(state.players.cpu!.hand.filter((c) => c.defId === 'charmander')).toHaveLength(1);
    });
  });

  it('does nothing when it is not its move', () => {
    const state = playerSetsActive(runCpu(newGame(), 'cpu').state);
    expect(runCpu(state, 'cpu').actions).toEqual([]);
  });
});
