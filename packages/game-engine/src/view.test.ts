// getPlayerView: what each player may see, and nothing more.
import { describe, expect, it } from 'vitest';
import { act, duel, flips, give, id } from './effects/test-kit.js';
import { FACE_DOWN, getPlayerView, type GameState } from './index.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const play = (s: GameState, name: string, choices?: Record<string, unknown>, player = 'ash') => {
  const [uid] = give(s, player, name);
  return act(s, player, { type: 'PLAY_TRAINER', cardUid: uid!, choices });
};

describe('getPlayerView', () => {
  it('never shows the RNG, the decks or the opponent’s hand', () => {
    const s = duel('charmander', 'squirtle');
    for (const player of ['ash', 'misty']) {
      const view = getPlayerView(s, player);
      expect(view).not.toHaveProperty('rngState');
      expect(view.self).not.toHaveProperty('deck');
      expect(view.opponent).not.toHaveProperty('hand');
      expect(view.opponent).not.toHaveProperty('deck');
      expect(view.opponent.handCount).toBe(s.players[player === 'ash' ? 'misty' : 'ash']!.hand.length);
    }
  });

  it("Lt. Surge's Secret Plan: a face-down Pokémon is FACE_DOWN to the opponent, its card and definition hidden, but itself to its owner", () => {
    let s = duel('squirtle', 'onix');
    ash(s).hand = [{ uid: 'hidden', defId: id('charizard') }];
    s = play(s, 'secretPlan', { handUids: ['hidden'] });
    const theirs = getPlayerView(s, 'misty');
    expect(theirs.opponent.bench[0]!.card).toEqual({ uid: 'hidden', defId: FACE_DOWN.id });
    expect(theirs.cards[FACE_DOWN.id]).toBe(FACE_DOWN);
    expect(theirs.cards[id('charizard')]).toBeUndefined();
    const mine = getPlayerView(s, 'ash');
    expect(mine.self.bench[0]!.card.defId).toBe(id('charizard'));
    expect(mine.cards[id('charizard')]).toBeDefined();
  });

  it('a pending choice is shown only to the player it belongs to, also when it isn’t their turn (Computer Error)', () => {
    let s = duel('charmander', 'onix');
    misty(s).hand = [];
    s = play(s, 'computererror');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'drawCount', max: 5 });
    expect(getPlayerView(s, 'misty').self.pendingChoice).toBeNull();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    // Now the opponent's, during Ash's turn.
    expect(s.currentPlayer).toBe('ash');
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'drawCount' });
    expect(getPlayerView(s, 'ash').self.pendingChoice).toBeNull();
  });

  it("Clairvoyance: the opponent's hand is in the view only while the power works, and only for its owner", () => {
    const s = duel('omanyte', 'onix');
    expect(getPlayerView(s, 'ash').opponent.hand).toEqual(misty(s).hand);
    expect(getPlayerView(s, 'misty').opponent.hand).toBeUndefined();
    // The hand's definitions come with it.
    for (const c of misty(s).hand) expect(getPlayerView(s, 'ash').cards[c.defId]).toBeDefined();
    ash(s).active!.condition = 'confused';
    expect(getPlayerView(s, 'ash').opponent.hand).toBeUndefined();
  });

  it('Here Comes Team Rocket!: both players’ Prize cards are in both views, face up for the rest of the game', () => {
    let s = duel('charmander', 'onix');
    expect(getPlayerView(s, 'ash').self.prizes).toBeUndefined();
    expect(getPlayerView(s, 'ash').opponent.prizes).toBeUndefined();
    s = play(s, 'teamRocket');
    for (const player of ['ash', 'misty']) {
      const view = getPlayerView(s, player);
      expect(view.self.prizes).toEqual(s.players[player]!.prizes);
      expect(view.opponent.prizes).toEqual(s.players[player === 'ash' ? 'misty' : 'ash']!.prizes);
      for (const c of [...view.self.prizes!, ...view.opponent.prizes!]) expect(view.cards[c.defId]).toBeDefined();
    }
  });

  it("attackDamage is in the current player's view only, one entry per attack, null for one they can't use", () => {
    const s = duel('charmander', 'squirtle', { energy: ['fire'] });
    const mine = getPlayerView(s, 'ash');
    // Scratch (C) can be used; Ember (F C) can't with one Energy.
    expect(mine.attackDamage).toEqual([expect.objectContaining({ min: 10, max: 10 }), null]);
    expect(getPlayerView(s, 'misty').attackDamage).toBeUndefined();
    // The same state viewed again gives the same ranges.
    expect(getPlayerView(s, 'ash').attackDamage).toEqual(mine.attackDamage);
    // Not during setup or once the game is over.
    expect(getPlayerView({ ...s, phase: 'finished', winner: 'ash' }, 'ash').attackDamage).toBeUndefined();
  });

  it("the opponent's Pokémon are hidden during setup, and the view's cards are only those visible", () => {
    const s = duel('charmander', 'squirtle', { oppBench: ['onix'] });
    const setup = { ...s, phase: 'setup' as const };
    expect(getPlayerView(setup, 'ash').opponent.active).toBeNull();
    expect(getPlayerView(setup, 'ash').opponent.bench.every((p) => p === null)).toBe(true);
    const view = getPlayerView(flips(s, true), 'ash');
    const visible = new Set([...ash(s).hand, ash(s).active!.card, misty(s).active!.card, misty(s).bench[0]!.card].map((c) => c.defId));
    for (const defId of Object.keys(view.cards)) expect(visible.has(defId) || ash(s).discard.some((c) => c.defId === defId), defId).toBe(true);
  });
});
