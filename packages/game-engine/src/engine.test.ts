import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, isBasicPokemon, lookupCard, type GameAction, type GameState } from './index.js';
import { TEST_CARDS, testDeck } from './test-cards.js';

const newGame = () => createGame({ id: 'ash', deck: testDeck('fire') }, { id: 'misty', deck: testDeck('water') }, 42, TEST_CARDS);

function act(state: GameState, player: string, action: GameAction): GameState {
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

const basicsIn = (state: GameState, player: string) =>
  state.players[player]!.hand.filter((c) => isBasicPokemon(lookupCard(state.cards, c.defId)));

function setup(state: GameState): GameState {
  for (const id of state.playerOrder) state = act(state, id, { type: 'SET_ACTIVE', cardUid: basicsIn(state, id)[0]!.uid });
  return state;
}

/** Puts a specific card into a player's hand (test helper; bypasses the rules). */
function giveCard(state: GameState, player: string, defId: string): [GameState, string] {
  const next = structuredClone(state);
  const uid = `test-${defId}`;
  next.players[player]!.hand.push({ uid, defId });
  return [next, uid];
}

describe('game engine', () => {
  it('deals 7-card hands and 6 prizes, each hand containing a Basic', () => {
    const s = newGame();
    for (const p of Object.values(s.players)) {
      expect(p.hand).toHaveLength(7);
      expect(p.prizes).toHaveLength(6);
      expect(p.deck).toHaveLength(17);
      expect(basicsIn(s, p.id).length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(newGame()).toEqual(newGame());
  });

  it('stores only the definitions the decks use', () => {
    expect(Object.keys(newGame().cards).sort()).toEqual(['charmander', 'charmeleon', 'fire-energy', 'squirtle', 'water-energy']);
  });

  it('rejects decks too small to deal a hand and prizes', () => {
    expect(() =>
      createGame({ id: 'a', deck: testDeck('fire').slice(0, 13) }, { id: 'b', deck: testDeck('water') }, 1, TEST_CARDS),
    ).toThrow(/needs more than 13 cards/);
  });

  it('moves to playing once both actives are chosen', () => {
    expect(setup(newGame()).phase).toBe('playing');
  });

  it('does not allow evolved Pokémon to be played as Basics', () => {
    let s = newGame();
    let uid: string;
    [s, uid] = giveCard(s, 'ash', 'charmeleon');
    expect(applyAction(s, 'ash', { type: 'SET_ACTIVE', cardUid: uid })).toEqual({ ok: false, error: 'Must choose a Basic Pokémon from your hand' });
    s = setup(s);
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: uid })).toEqual({ ok: false, error: 'Must play a Basic Pokémon from your hand' });
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
    const energies = s.players.ash!.hand.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');
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

  it('only includes definitions of visible cards in the player view', () => {
    const s = setup(newGame());
    const view = getPlayerView(s, 'ash');
    const visible = new Set([...view.self.hand, view.self.active!.card, view.opponent.active!.card].map((c) => c.defId));
    expect(new Set(Object.keys(view.cards))).toEqual(visible);
  });
});
