import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, isBasicPokemon, lookupCard, TURN_ORDER_FLIP, type GameAction, type GameState } from './index.js';
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
  for (const id of state.playerOrder) state = act(state, id, { type: 'START_BATTLE' });
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

  it('flips a coin for turn order: heads the first player goes first, tails the second', () => {
    const firsts = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const s = createGame({ id: 'ash', deck: testDeck('fire') }, { id: 'misty', deck: testDeck('water') }, seed, TEST_CARDS);
      const [flip, goes] = s.log!;
      expect(flip).toMatchObject({ player: 'ash', coin: { reason: TURN_ORDER_FLIP } });
      expect(s.currentPlayer).toBe(flip!.coin!.heads ? 'ash' : 'misty');
      expect(goes).toMatchObject({ text: 'Goes first.', player: s.currentPlayer });
      // Whoever goes first starts once both actives are chosen.
      expect(setup(s).currentPlayer).toBe(s.currentPlayer);
      firsts.add(s.currentPlayer);
    }
    expect(firsts).toEqual(new Set(['ash', 'misty']));
  });

  it('is deterministic for a given seed', () => {
    expect(newGame()).toEqual(newGame());
  });

  it('shares the card library between states and never changes it', () => {
    // Every action copies the state but its library (cloneState); a frozen library throws on any write to it.
    const freeze = (value: unknown) => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const v of Object.values(value)) freeze(v);
      }
    };
    const start = newGame();
    freeze(start.cards);
    let s = setup(start);
    for (let i = 0; i < 6 && s.phase === 'playing'; i++) {
      const bench = basicsIn(s, s.currentPlayer)[0];
      if (bench) s = act(s, s.currentPlayer, { type: 'PLAY_BENCH', cardUid: bench.uid, slot: s.players[s.currentPlayer]!.bench.indexOf(null) });
      s = act(s, s.currentPlayer, { type: 'END_TURN' });
    }
    expect(s.cards).toBe(start.cards);
    const active = s.players.ash!.active!.card.defId;
    expect(getPlayerView(s, 'ash').cards[active]).toBe(start.cards[active]);
  });

  it('stores only the definitions the decks use', () => {
    expect(Object.keys(newGame().cards).sort()).toEqual(['charizard', 'charmander', 'charmeleon', 'fire-energy', 'squirtle', 'water-energy']);
  });

  it('rejects decks too small to deal a hand and prizes', () => {
    expect(() =>
      createGame({ id: 'a', deck: testDeck('fire').slice(0, 13) }, { id: 'b', deck: testDeck('water') }, 1, TEST_CARDS),
    ).toThrow(/needs more than 13 cards/);
  });

  it('moves to playing once both actives are chosen', () => {
    expect(setup(newGame()).phase).toBe('playing');
  });

  describe('setup', () => {
    /** Ash with two Basics in hand (an extra Charmander and Squirtle given), nothing placed yet. */
    function placing(): [GameState, string, string, string] {
      let s = newGame();
      let a: string, b: string;
      [s, a] = giveCard(s, 'ash', 'squirtle');
      [s, b] = giveCard(s, 'ash', 'charmander');
      return [s, basicsIn(s, 'ash')[0]!.uid, a, b];
    }

    it('places an active and benched Basics face down, and starts once both players start the battle', () => {
      let [s, active, a] = placing();
      s = act(act(s, 'ash', { type: 'SET_ACTIVE', cardUid: active }), 'ash', { type: 'PLAY_BENCH', cardUid: a, slot: 2 });
      expect(s.players.ash!.bench[2]!.card.uid).toBe(a);
      // The opponent sees neither, and the log doesn't name them.
      const seen = getPlayerView(s, 'misty').opponent;
      expect([seen.active, seen.bench.every((p) => p === null)]).toEqual([null, true]);
      expect(s.log!.slice(-2).map((e) => e.text)).toEqual(['Chose an Active Pokémon.', 'Put a Pokémon on the Bench.']);
      s = act(s, 'ash', { type: 'START_BATTLE' });
      expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: basicsIn(s, 'ash')[0]!.uid, slot: 0 })).toEqual({ ok: false, error: 'Waiting for your opponent to start the battle' });
      expect([s.phase, getPlayerView(s, 'misty').opponent.ready]).toEqual(['setup', true]);
      s = act(act(s, 'misty', { type: 'SET_ACTIVE', cardUid: basicsIn(s, 'misty')[0]!.uid }), 'misty', { type: 'START_BATTLE' });
      expect(s.phase).toBe('playing');
      expect(getPlayerView(s, 'misty').opponent.bench[2]!.card.uid).toBe(a);
      expect(s.log!.slice(-2).map((e) => e.text)).toEqual(['Active: Charmander. Bench: Squirtle.', 'Active: Squirtle.']);
    });

    it('needs an active to start the battle, and takes everything back with Reset', () => {
      let [s, active, a, b] = placing();
      expect(applyAction(s, 'ash', { type: 'START_BATTLE' })).toEqual({ ok: false, error: 'Choose an Active Pokémon first' });
      expect(applyAction(s, 'ash', { type: 'RESET_SETUP' })).toEqual({ ok: false, error: 'You have no Pokémon to take back' });
      s = act(act(act(s, 'ash', { type: 'PLAY_BENCH', cardUid: a, slot: 0 }), 'ash', { type: 'PLAY_BENCH', cardUid: b, slot: 4 }), 'ash', { type: 'SET_ACTIVE', cardUid: active });
      const hand = s.players.ash!.hand.length;
      s = act(s, 'ash', { type: 'RESET_SETUP' });
      expect([s.players.ash!.active, s.players.ash!.bench.every((p) => p === null), s.players.ash!.hand.length]).toEqual([null, true, hand + 3]);
    });

    it('only takes Basic Pokémon cards, and nothing else until the battle starts', () => {
      let [s] = placing();
      let evolution: string;
      [s, evolution] = giveCard(s, 'ash', 'charmeleon');
      expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: evolution, slot: 0 })).toEqual({ ok: false, error: 'Only Basic Pokémon can be put on the Bench before the battle' });
      expect(applyAction(s, 'ash', { type: 'END_TURN' })).toEqual({ ok: false, error: 'Place your Pokémon, then start the battle' });
    });
  });

  it('does not allow evolved Pokémon to be played as Basics', () => {
    let s = newGame();
    let uid: string;
    [s, uid] = giveCard(s, 'ash', 'charmeleon');
    expect(applyAction(s, 'ash', { type: 'SET_ACTIVE', cardUid: uid })).toEqual({ ok: false, error: 'Must choose a Basic Pokémon from your hand' });
    s = setup(s);
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: uid, slot: 0 })).toEqual({ ok: false, error: 'Must play a Basic Pokémon from your hand' });
  });

  describe('bench', () => {
    it('starts with 5 empty slots', () => {
      expect(newGame().players.ash!.bench).toEqual([null, null, null, null, null]);
    });

    it('keeps a Pokémon in the slot it was played to', () => {
      let s = setup(newGame());
      let uid: string;
      [s, uid] = giveCard(s, 'ash', 'charmander');
      s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: uid, slot: 3 });
      expect(s.players.ash!.bench.map((p) => p?.card.uid ?? null)).toEqual([null, null, null, uid, null]);
    });

    it('rejects occupied and out-of-range slots', () => {
      let s = setup(newGame());
      let a: string, b: string;
      [s, a] = giveCard(s, 'ash', 'charmander');
      s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: a, slot: 1 });
      [s, b] = giveCard(s, 'ash', 'squirtle');
      expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: b, slot: 1 })).toEqual({ ok: false, error: 'That bench slot is occupied' });
      expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: b, slot: 5 })).toEqual({ ok: false, error: 'Invalid bench slot' });
    });

    it('attaches energy to a benched Pokémon by slot, not to empty slots', () => {
      let s = setup(newGame());
      let mon: string, energy: string;
      [s, mon] = giveCard(s, 'ash', 'charmander');
      s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: mon, slot: 2 });
      [s, energy] = giveCard(s, 'ash', 'fire-energy');
      expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: energy, target: 0 })).toEqual({ ok: false, error: 'Attach energy to one of your Pokémon' });
      s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: energy, target: 2 });
      expect(s.players.ash!.bench[2]!.energy.map((e) => e.uid)).toEqual([energy]);
    });

    it('promotes from a slot and leaves it empty', () => {
      let s = setup(newGame());
      let mon: string;
      [s, mon] = giveCard(s, 'ash', 'charmander');
      s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: mon, slot: 4 });
      // Simulate a knockout of ash's active.
      s = structuredClone(s);
      s.players.ash!.active = null;
      s.phase = 'promote';
      s.pendingPromotion = 'ash';
      expect(applyAction(s, 'ash', { type: 'PROMOTE', slot: 0 })).toEqual({ ok: false, error: 'That bench slot is empty' });
      s = act(s, 'ash', { type: 'PROMOTE', slot: 4 });
      expect(s.players.ash!.active!.card.uid).toBe(mon);
      expect(s.players.ash!.bench).toEqual([null, null, null, null, null]);
    });
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
