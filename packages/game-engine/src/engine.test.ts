import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getCard, getPlayerView, starterDeck, type GameAction, type GameState } from './index.js';

const newGame = () =>
  createGame({ id: 'ash', deck: starterDeck('fire') }, { id: 'misty', deck: starterDeck('water') }, 42);

function act(state: GameState, player: string, action: GameAction): GameState {
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

function setup(state: GameState): GameState {
  for (const id of state.playerOrder) {
    const basic = state.players[id]!.hand.find((c) => getCard(c.defId).kind === 'pokemon')!;
    state = act(state, id, { type: 'SET_ACTIVE', cardUid: basic.uid });
  }
  return state;
}

describe('game engine', () => {
  it('deals 7-card hands and 6 prizes, each hand containing a Basic', () => {
    const s = newGame();
    for (const p of Object.values(s.players)) {
      expect(p.hand).toHaveLength(7);
      expect(p.prizes).toHaveLength(6);
      expect(p.deck).toHaveLength(47);
      expect(p.hand.some((c) => getCard(c.defId).kind === 'pokemon')).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(newGame()).toEqual(newGame());
  });

  it('moves to playing once both actives are chosen', () => {
    expect(setup(newGame()).phase).toBe('playing');
  });

  it('rejects actions out of turn and does not mutate input', () => {
    const s = setup(newGame());
    const before = structuredClone(s);
    const res = applyAction(s, 'misty', { type: 'END_TURN' });
    expect(res).toEqual({ ok: false, error: 'Not your turn' });
    expect(s).toEqual(before);
  });

  it('allows only one energy attachment per turn', () => {
    let s = setup(newGame());
    const energies = s.players.ash!.hand.filter((c) => getCard(c.defId).kind === 'energy');
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: energies[0]!.uid, target: 'active' });
    const res = applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: energies[1]!.uid, target: 'active' });
    expect(res.ok).toBe(false);
  });

  it('hides opponent hand, deck order and RNG from the player view', () => {
    const view = getPlayerView(setup(newGame()), 'ash');
    expect(view.opponent).not.toHaveProperty('hand');
    expect(view.self).not.toHaveProperty('deck');
    expect(view).not.toHaveProperty('rngState');
    expect(view.opponent.handCount).toBe(6);
  });
});
