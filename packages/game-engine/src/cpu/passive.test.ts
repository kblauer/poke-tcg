import { describe, expect, it } from 'vitest';
import { applyDebug, createGame, runCpu, type GameState } from '../index.js';
import { TEST_CARDS, testDeck } from '../test-cards.js';

describe('passive CPU', () => {
  /** The passive CPU (fire deck) has Charmander active, no bench and only `hand` in hand; it's the CPU's turn `turn`. */
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
    s.cpuDifficulty = 'passive';
    return s;
  }

  it('benches its Basics, attaches matching energy, then ends its turn without attacking', () => {
    const { state, actions } = runCpu(cpuTurn(['charmander', 'charmander', 'fire-energy', 'fire-energy']), 'cpu');
    expect(actions.map((a) => a.type)).toEqual(['PLAY_BENCH', 'PLAY_BENCH', 'ATTACH_ENERGY', 'END_TURN']);
    const cpu = state.players.cpu!;
    expect(cpu.bench.filter(Boolean)).toHaveLength(2);
    expect(cpu.active!.energy.map((e) => e.defId)).toEqual(['fire-energy']);
    expect(cpu.hand.map((c) => c.defId)).toEqual(['fire-energy']);
    expect(state.currentPlayer).toBe('player');
  });

  it("doesn't attach energy that matches none of its Pokémon", () => {
    const { state, actions } = runCpu(cpuTurn(['water-energy']), 'cpu');
    expect(actions).toEqual([{ type: 'END_TURN' }]);
    expect(state.players.cpu!.active!.energy).toEqual([]);
  });

  it('evolves when it can', () => {
    const { state, actions } = runCpu(cpuTurn(['charmeleon', 'charizard']), 'cpu');
    // Charizard can't follow on the same turn Charmeleon was played.
    expect(actions.map((a) => a.type)).toEqual(['EVOLVE', 'END_TURN']);
    expect(state.players.cpu!.active!.card.defId).toBe('charmeleon');
  });

  it('stops benching when the bench is full', () => {
    const { state } = runCpu(cpuTurn(Array<string>(6).fill('charmander')), 'cpu');
    expect(state.players.cpu!.bench.every(Boolean)).toBe(true);
    expect(state.players.cpu!.hand.filter((c) => c.defId === 'charmander')).toHaveLength(1);
  });

  it('plays the gym leader instead once the difficulty is changed (debug)', () => {
    const s = cpuTurn(['fire-energy']);
    const res = applyDebug(s, 'player', { type: 'SET_CPU_DIFFICULTY', difficulty: 'gymLeader' });
    if (!res.ok) throw new Error(res.error);
    expect(res.state.cpuDifficulty).toBe('gymLeader');
    expect(res.state.log!.at(-1)!.text).toBe('Debug: set the CPU to Gym leader.');
    expect(runCpu(res.state, 'cpu').actions.map((a) => a.type)).toEqual(['ATTACH_ENERGY', 'ATTACK']);
  });
});
