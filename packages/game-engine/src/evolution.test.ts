import { describe, expect, it } from 'vitest';
import { applyAction, createGame, isBasicPokemon, lookupCard, type GameAction, type GameState } from './index.js';
import { TEST_CARDS, testDeck } from './test-cards.js';

function act(state: GameState, player: string, action: GameAction): GameState {
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

/** Puts a specific card into a player's hand (bypasses the rules). */
function give(state: GameState, player: string, defId: string): [GameState, string] {
  const next = structuredClone(state);
  const uid = `test-${defId}-${next.players[player]!.hand.length}`;
  next.players[player]!.hand.push({ uid, defId });
  return [next, uid];
}

/** Both actives chosen; ash (fire) has Charmander active and it's turn 1. */
function started(): GameState {
  let s = createGame({ id: 'ash', deck: testDeck('fire') }, { id: 'misty', deck: testDeck('water') }, 42, TEST_CARDS);
  for (const id of s.playerOrder) {
    const basic = s.players[id]!.hand.find((c) => isBasicPokemon(lookupCard(s.cards, c.defId)))!;
    s = act(s, id, { type: 'SET_ACTIVE', cardUid: basic.uid });
    s = act(s, id, { type: 'START_BATTLE' });
  }
  return s;
}

/** Ends turns until it's ash's turn again. */
const toAshsNextTurn = (s: GameState) => act(act(s, 'ash', { type: 'END_TURN' }), 'misty', { type: 'END_TURN' });

describe('evolution', () => {
  it("is not allowed on a player's first turn", () => {
    let [s, uid] = give(started(), 'ash', 'charmeleon');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' })).toEqual({ ok: false, error: "You can't evolve on your first turn" });
  });

  it('evolves Basic → Stage 1 → Stage 2 on separate turns, keeping damage and energy', () => {
    let s = toAshsNextTurn(started());
    let uid: string;
    // Pretend the active has taken damage and has energy attached.
    s.players.ash!.active!.damage = 30;
    [s, uid] = give(s, 'ash', 'fire-energy');
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' });
    const basicUid = s.players.ash!.active!.card.uid;

    [s, uid] = give(s, 'ash', 'charmeleon');
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' });
    const active = s.players.ash!.active!;
    expect(active.card.defId).toBe('charmeleon');
    expect(active.evolvedFrom.map((c) => c.uid)).toEqual([basicUid]);
    expect(active.damage).toBe(30);
    expect(active.energy).toHaveLength(1);

    let zard: string;
    [s, zard] = give(s, 'ash', 'charizard');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: zard, target: 'active' })).toEqual({
      ok: false,
      error: 'Charmeleon was played or evolved this turn',
    });

    s = toAshsNextTurn(s);
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: zard, target: 'active' });
    expect(s.players.ash!.active!.card.defId).toBe('charizard');
    expect(s.players.ash!.active!.evolvedFrom.map((c) => c.defId)).toEqual(['charmander', 'charmeleon']);
  });

  it('requires the matching pre-evolution', () => {
    let [s, uid] = give(toAshsNextTurn(started()), 'ash', 'charizard');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' })).toEqual({
      ok: false,
      error: 'Charizard evolves from Charmeleon',
    });
  });

  it('rejects Basics and non-Pokémon as evolutions, and empty slots as targets', () => {
    let s = toAshsNextTurn(started());
    let basic: string, energy: string, stage1: string;
    [s, basic] = give(s, 'ash', 'charmander');
    [s, energy] = give(s, 'ash', 'fire-energy');
    [s, stage1] = give(s, 'ash', 'charmeleon');
    const notEvolution = { ok: false, error: 'Must evolve with a Stage 1 or Stage 2 Pokémon from your hand' };
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: basic, target: 'active' })).toEqual(notEvolution);
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: energy, target: 'active' })).toEqual(notEvolution);
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: stage1, target: 2 })).toEqual({ ok: false, error: 'Evolve one of your Pokémon in play' });
  });

  it('does not allow evolving a Pokémon benched this turn, but does on a later turn', () => {
    let s = toAshsNextTurn(started());
    let mon: string, evo: string;
    [s, mon] = give(s, 'ash', 'charmander');
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: mon, slot: 1 });
    [s, evo] = give(s, 'ash', 'charmeleon');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: evo, target: 1 })).toEqual({
      ok: false,
      error: 'Charmander was played or evolved this turn',
    });
    s = act(toAshsNextTurn(s), 'ash', { type: 'EVOLVE', cardUid: evo, target: 1 });
    expect(s.players.ash!.bench[1]!.card.defId).toBe('charmeleon');
  });

  it('discards the whole evolution stack when knocked out', () => {
    let s = toAshsNextTurn(started());
    let evo: string, water: string;
    [s, evo] = give(s, 'ash', 'charmeleon');
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: evo, target: 'active' });
    s = act(s, 'ash', { type: 'END_TURN' });
    // Misty's Squirtle uses Bubble (20) on a Charmeleon that has 20 HP left.
    s.players.ash!.active!.damage = 60;
    [s, water] = give(s, 'misty', 'water-energy');
    s = act(s, 'misty', { type: 'ATTACH_ENERGY', cardUid: water, target: 'active' });
    s = act(s, 'misty', { type: 'ATTACK', attackIndex: 0 });
    expect(s.players.ash!.discard.map((c) => c.defId)).toEqual(['charmander', 'charmeleon']);
  });
});
