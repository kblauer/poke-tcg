import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, gymLeaderCpu, passiveCpu, runCpu, type GameState } from '../index.js';
import { act, attack, duel, flips, give } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Wizards Promo Trainers', () => {
  it('Computer Error: the player draws up to 5, then the opponent does, and the turn is over', () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    misty(s).hand = [];
    const [error] = give(s, 'ash', 'computererror');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: error! });
    expect(getPlayerView(s, 'ash').self.pendingChoice).toEqual({ kind: 'drawCount', prompt: 'Computer Error: draw up to 5 cards', max: 5 });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', count: 6 })).toEqual({ ok: false, error: 'Draw between 0 and 5 cards' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 2 });
    expect(ash(s).hand.length).toBe(2);
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'drawCount' });
    expect(applyAction(s, 'ash', { type: 'END_TURN' })).toEqual({ ok: false, error: 'Waiting for your opponent to finish Computer Error' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 5 });
    // 5, and the card drawn at the start of their turn.
    expect([misty(s).hand.length, s.currentPlayer]).toEqual([6, 'misty']);
  });

  it('Computer Error: a CPU opponent draws 5 during the other player’s turn', () => {
    let s = duel('charmander', 'onix');
    misty(s).hand = [];
    const [error] = give(s, 'ash', 'computererror');
    s = act(act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: error! }), 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    for (const cpu of [passiveCpu, gymLeaderCpu]) {
      const [first] = runCpu(s, 'misty', cpu).actions;
      expect(first).toEqual({ type: 'RESOLVE_CHOICE', count: 5 });
    }
  });

  it('Pokémon Center heals all your Pokémon and discards their Energy', () => {
    let s = duel('charmander', 'onix', { energy: ['fire'] });
    ash(s).active!.damage = 30;
    const [center] = give(s, 'ash', 'pokemoncenterP');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: center! });
    expect([ash(s).active!.damage, ash(s).active!.energy]).toEqual([0, []]);
  });

  it('Lucky Stadium stays in play; each player may flip once during their turn to draw a card', () => {
    let s = duel('charmander', 'onix');
    const [lucky, again] = give(s, 'ash', 'luckystadium', 'luckystadium');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: lucky! });
    expect(s.stadium).toEqual({ card: { uid: lucky, defId: 'basep-41' }, owner: 'ash' });
    expect(ash(s).discard).toEqual([]);
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: again! })).toEqual({ ok: false, error: 'Lucky Stadium is already in play' });
    const hand = ash(s).hand.length;
    s = act(flips(s, true), 'ash', { type: 'USE_STADIUM' });
    expect(ash(s).hand.length).toBe(hand + 1);
    expect(applyAction(s, 'ash', { type: 'USE_STADIUM' })).toEqual({ ok: false, error: 'You already used the Stadium this turn' });
    // The opponent can use it during their turn.
    s = act(s, 'ash', { type: 'END_TURN' });
    expect(applyAction(s, 'misty', { type: 'USE_STADIUM' })).toMatchObject({ ok: true });
  });

  it("A new Stadium replaces the one in play, which goes to its owner's discard pile", () => {
    let s = duel('charmander', 'onix');
    const [lucky] = give(s, 'ash', 'luckystadium');
    s = act(act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: lucky! }), 'ash', { type: 'END_TURN' });
    const [tower] = give(s, 'misty', 'pokemontower');
    s = act(s, 'misty', { type: 'PLAY_TRAINER', cardUid: tower! });
    expect([s.stadium?.card.uid, ash(s).discard.map((c) => c.uid)]).toEqual([tower, [lucky]]);
  });

  it('Pokémon Tower: Trainers that put discarded cards into the hand can’t be played, and attacks leave them there', () => {
    let s = duel('slowpoke', 'onix', { energy: ['psychic', 'psychic'] });
    const [tower, retrieval, other] = give(s, 'ash', 'pokemontower', 'energyretrieval', 'potion');
    ash(s).discard.push({ uid: 'e1', defId: 'fire' }, { uid: 'bill', defId: 'base1-91' });
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: tower! });
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: retrieval!, choices: { handUids: [other!], discardUids: ['e1'] } })).toEqual({
      ok: false,
      error: 'Pokémon Tower: cards in discard piles stay there',
    });
    // Scavenge still discards its Psychic Energy, but Bill stays in the discard pile.
    s = attack(s, 1, { discardUids: ['bill'] });
    expect(ash(s).discard.map((c) => c.uid)).toContain('bill');
  });
});
