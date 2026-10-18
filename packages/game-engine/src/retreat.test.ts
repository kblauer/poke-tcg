import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, isBasicPokemon, lookupCard, type GameAction, type GameState, type PokemonCardDef } from './index.js';
import { TEST_CARDS, testDeck } from './test-cards.js';

function act(state: GameState, player: string, action: GameAction): GameState {
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

/** Both actives chosen and ash has a second Charmander on bench slot 2. Ash's active (retreat cost 1) has no energy yet. */
function started(): GameState {
  let s = createGame({ id: 'ash', deck: testDeck('fire') }, { id: 'misty', deck: testDeck('water') }, 42, TEST_CARDS);
  for (const id of s.playerOrder) {
    const basic = s.players[id]!.hand.find((c) => isBasicPokemon(lookupCard(s.cards, c.defId)))!;
    s = act(s, id, { type: 'SET_ACTIVE', cardUid: basic.uid });
    s = act(s, id, { type: 'START_BATTLE' });
  }
  s = structuredClone(s);
  s.players.ash!.hand.push({ uid: 'bench-mon', defId: 'charmander' });
  return act(s, 'ash', { type: 'PLAY_BENCH', cardUid: 'bench-mon', slot: 2 });
}

/** Attaches energy straight to ash's active (bypasses the once-per-turn rule). */
function withEnergy(state: GameState, ...uids: string[]): GameState {
  const s = structuredClone(state);
  s.players.ash!.active!.energy.push(...uids.map((uid) => ({ uid, defId: 'fire-energy' })));
  return s;
}

const retreat = (slot: number, ...energyUids: string[]): GameAction => ({ type: 'RETREAT', slot, energyUids });

describe('retreat', () => {
  it('swaps the active with the benched Pokémon and discards the chosen energy', () => {
    let s = withEnergy(started(), 'e1', 'e2');
    const oldActive = s.players.ash!.active!.card.uid;
    s.players.ash!.active!.damage = 20;
    s = act(s, 'ash', retreat(2, 'e2'));
    const ash = s.players.ash!;
    expect(ash.active!.card.uid).toBe('bench-mon');
    expect(ash.bench[2]!.card.uid).toBe(oldActive);
    expect(ash.bench[2]!.damage).toBe(20);
    expect(ash.bench[2]!.energy.map((e) => e.uid)).toEqual(['e1']);
    expect(ash.discard.map((e) => e.uid)).toEqual(['e2']);
    expect(s.currentPlayer).toBe('ash');
  });

  it('requires discarding exactly the retreat cost from the active', () => {
    const s = withEnergy(started(), 'e1', 'e2');
    expect(applyAction(s, 'ash', retreat(2))).toEqual({ ok: false, error: 'Retreating costs 1 energy' });
    expect(applyAction(s, 'ash', retreat(2, 'e1', 'e2'))).toEqual({ ok: false, error: 'Retreating costs 1 energy' });
    expect(applyAction(s, 'ash', retreat(2, 'e1', 'e1')).ok).toBe(false);
    expect(applyAction(s, 'ash', retreat(2, 'not-attached'))).toEqual({ ok: false, error: 'Discard energy attached to your active Pokémon' });
  });

  it("can't retreat without enough energy", () => {
    expect(applyAction(started(), 'ash', retreat(2))).toEqual({ ok: false, error: 'Retreating costs 1 energy' });
  });

  it('retreats for free when the cost is 0', () => {
    let s = started();
    s = structuredClone(s);
    s.cards.charmander = { ...(s.cards.charmander as PokemonCardDef), retreatCost: 0 };
    s = act(s, 'ash', retreat(2));
    expect(s.players.ash!.active!.card.uid).toBe('bench-mon');
  });

  it('needs a benched Pokémon in the chosen slot', () => {
    const s = withEnergy(started(), 'e1');
    expect(applyAction(s, 'ash', retreat(0, 'e1'))).toEqual({ ok: false, error: 'Retreat to one of your benched Pokémon' });
    const noBench = structuredClone(s);
    noBench.players.ash!.bench[2] = null;
    expect(applyAction(noBench, 'ash', retreat(2, 'e1'))).toEqual({ ok: false, error: 'No benched Pokémon to switch in' });
  });

  it('allows one retreat per turn, again next turn', () => {
    let s = act(withEnergy(started(), 'e1', 'e2', 'e3'), 'ash', retreat(2, 'e1'));
    s = withEnergy(s, 'e4');
    expect(applyAction(s, 'ash', retreat(2, 'e4'))).toEqual({ ok: false, error: 'You can only retreat once per turn' });
    expect(getPlayerView(s, 'ash').retreatedThisTurn).toBe(true);
    s = act(act(s, 'ash', { type: 'END_TURN' }), 'misty', { type: 'END_TURN' });
    expect(applyAction(s, 'ash', retreat(2, 'e4')).ok).toBe(true);
  });

  it("can't retreat on the opponent's turn", () => {
    const s = withEnergy(started(), 'e1');
    expect(applyAction(s, 'misty', retreat(2, 'e1'))).toEqual({ ok: false, error: 'Not your turn' });
  });
});
