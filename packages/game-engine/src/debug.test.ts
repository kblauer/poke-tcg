import { describe, expect, it } from 'vitest';
import { applyDebug, type DebugCommand } from './debug.js';
import type { GameState } from './engine.js';
import { duel } from './effects/test-kit.js';

const run = (state: GameState, command: DebugCommand, cards = {}) => {
  const result = applyDebug(state, 'ash', command, cards);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

describe('debug commands', () => {
  it('turns Special Conditions on and off on either active: Asleep, Confused and Paralyzed replace each other', () => {
    let s = duel('charmander', 'squirtle');
    s = run(s, { type: 'SET_CONDITION', side: 'opponent', condition: 'burned', on: true });
    s = run(s, { type: 'SET_CONDITION', side: 'opponent', condition: 'poisoned', on: true });
    s = run(s, { type: 'SET_CONDITION', side: 'opponent', condition: 'asleep', on: true });
    s = run(s, { type: 'SET_CONDITION', side: 'opponent', condition: 'paralyzed', on: true });
    const squirtle = s.players.misty!.active!;
    expect([squirtle.burned, squirtle.poison, squirtle.condition, squirtle.paralyzedTurn]).toEqual([true, 10, 'paralyzed', s.turn]);
    expect(s.log?.at(-1)?.text).toBe('Debug: Squirtle is now Paralyzed.');
    s = run(s, { type: 'SET_CONDITION', side: 'opponent', condition: 'burned', on: false });
    s = run(s, { type: 'SET_CONDITION', side: 'self', condition: 'confused', on: true });
    expect(s.players.misty!.active!.burned).toBe(false);
    expect(s.players.ash!.active!.condition).toBe('confused');
    expect(s.log?.at(-1)?.text).toBe('Debug: Charmander is now Confused.');
  });


  it('ends the game won by the player, and logs it', () => {
    const s = run(duel('charmander', 'squirtle'), { type: 'WIN' });
    expect([s.phase, s.winner]).toEqual(['finished', 'ash']);
    expect(s.log?.at(-1)?.text).toBe('Debug: won the game.');
    expect(applyDebug(s, 'ash', { type: 'WIN' }).ok).toBe(false);
  });

  it('puts a new copy of a card into the hand, with a unique uid, and logs it', () => {
    const s = duel('charmander', 'squirtle');
    const before = s.players.ash!.hand.length;
    const next = run(run(s, { type: 'ADD_TO_HAND', defId: 'fire' }), { type: 'ADD_TO_HAND', defId: 'fire' });
    const hand = next.players.ash!.hand;
    expect(hand).toHaveLength(before + 2);
    expect(new Set(hand.map((c) => c.uid)).size).toBe(hand.length);
    expect(next.log?.at(-1)?.text).toBe('Debug: put Fire Energy into the hand.');
    expect(next.version).toBe(s.version + 2);
  });

  it('adds a card from outside the library when its def is passed in', () => {
    const s = duel('charmander', 'squirtle');
    const extra = { 'base1-58': { id: 'base1-58', kind: 'pokemon' as const, name: 'Pikachu', imageUrl: null, hp: 40 } };
    const next = run(s, { type: 'ADD_TO_HAND', defId: 'base1-58' }, extra as never);
    expect(next.cards['base1-58']?.name).toBe('Pikachu');
    expect(next.players.ash!.hand.at(-1)?.defId).toBe('base1-58');
  });

  it('rejects an unknown card', () => {
    expect(applyDebug(duel('charmander', 'squirtle'), 'ash', { type: 'ADD_TO_HAND', defId: 'nope' }).ok).toBe(false);
  });

  it('draws the top card of the deck', () => {
    const s = duel('charmander', 'squirtle');
    const top = s.players.ash!.deck[0]!;
    const next = run(s, { type: 'DRAW' });
    expect(next.players.ash!.hand.at(-1)).toEqual(top);
    expect(next.players.ash!.deck).toHaveLength(s.players.ash!.deck.length - 1);
  });

  it("sets the HP left on either side's Pokémon, within 10 and its max", () => {
    const s = duel('charmander', 'squirtle', { oppBench: ['bulbasaur'] });
    expect(run(s, { type: 'SET_HP', side: 'self', target: 'active', hp: 20 }).players.ash!.active!.damage).toBe(30);
    expect(run(s, { type: 'SET_HP', side: 'opponent', target: 0, hp: 10 }).players.misty!.bench[0]!.damage).toBe(30);
    expect(applyDebug(s, 'ash', { type: 'SET_HP', side: 'self', target: 'active', hp: 0 }).ok).toBe(false);
    expect(applyDebug(s, 'ash', { type: 'SET_HP', side: 'self', target: 'active', hp: 60 }).ok).toBe(false);
    expect(applyDebug(s, 'ash', { type: 'SET_HP', side: 'self', target: 'active', hp: 25 }).ok).toBe(false);
    expect(applyDebug(s, 'ash', { type: 'SET_HP', side: 'self', target: 2, hp: 10 }).ok).toBe(false);
  });

  it("doesn't change the state it was given", () => {
    const s = duel('charmander', 'squirtle');
    const copy = structuredClone(s);
    run(s, { type: 'DRAW' });
    expect(s).toEqual(copy);
  });
});
