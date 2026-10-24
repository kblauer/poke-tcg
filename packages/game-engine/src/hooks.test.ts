// The hooks applyAction runs after an action is accepted (engine.ts): Energy Evolution and Triggered Poison look at the
// Energy a Pokémon has now that it didn't before, whatever moved it.
import { describe, expect, it } from 'vitest';
import { act, duel, endTurn, flips, give, id, pokemon } from './effects/test-kit.js';
import { applyAction, type GameState } from './index.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Energy Evolution (Neo Discovery Eevee)', () => {
  it('attaching an Energy card from the hand: heads asks for an Evolution card of its type from the deck', () => {
    const s = duel('eeveeNeo', 'squirtle');
    ash(s).deck.unshift({ uid: 'deck-jolteon', defId: id('jolteon') });
    const [bolt] = give(s, 'ash', 'lightning');
    let after = act(flips(s, true), 'ash', { type: 'ATTACH_ENERGY', cardUid: bolt!, target: 'active' });
    expect(after.pendingChoice).toMatchObject({ player: 'ash', source: 'Energy Evolution', kind: 'evolveFromDeck', target: 'active', names: ['Jolteon'] });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'deck-jolteon' });
    expect(ash(after).active!.card.defId).toBe(id('jolteon'));
    expect(after.pendingChoice).toBeUndefined();
    // Tails: nothing.
    const tails = act(flips(s, false), 'ash', { type: 'ATTACH_ENERGY', cardUid: bolt!, target: 'active' });
    expect(tails.pendingChoice).toBeUndefined();
  });

  it('works for Energy moved by any effect of its owner’s (Energy Trans), and says so when no card in the deck fits', () => {
    const s = duel('venusaur', 'squirtle', { energy: ['grass'], bench: ['eeveeNeo'] });
    ash(s).deck = ash(s).deck.filter((c) => c.defId !== id('jolteon'));
    const after = act(flips(s, true), 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 'active', to: 0 } });
    expect(ash(after).bench[0]!.energy).toHaveLength(1);
    expect(after.log!.map((l) => l.text)).toContain('Energy Evolution: no card in the deck evolves from Eevee into that type.');
    expect(after.pendingChoice).toBeUndefined();
  });

  it("doesn't run for the other player's Eevee, or while Eevee's power is stopped", () => {
    const s = duel('charmander', 'eeveeNeo');
    // Ash attaches nothing to Misty's Eevee; her own attachment on her turn does count (the Jolteon goes in after her draw).
    let theirs = endTurn(s, 'ash');
    misty(theirs).deck.unshift({ uid: 'deck-jolteon', defId: id('jolteon') });
    const [bolt] = give(theirs, 'misty', 'lightning');
    theirs = act(flips(theirs, true), 'misty', { type: 'ATTACH_ENERGY', cardUid: bolt!, target: 'active' });
    expect(theirs.pendingChoice).toMatchObject({ player: 'misty', kind: 'evolveFromDeck', names: ['Jolteon'] });
    // Asleep: Pokémon Powers stop.
    const asleep = endTurn(s, 'ash');
    misty(asleep).deck.unshift({ uid: 'deck-jolteon', defId: id('jolteon') });
    misty(asleep).active!.condition = 'asleep';
    const [bolt2] = give(asleep, 'misty', 'lightning');
    expect(act(flips(asleep, true), 'misty', { type: 'ATTACH_ENERGY', cardUid: bolt2!, target: 'active' }).pendingChoice).toBeUndefined();
  });
});

describe('Triggered Poison', () => {
  it("a Pokémon with it is Poisoned once its owner attaches an Energy card to it, that turn only", () => {
    const s = duel('charmander', 'squirtle');
    let theirs = endTurn(s, 'ash');
    misty(theirs).active!.effects = { triggeredPoison: theirs.turn };
    const [water] = give(theirs, 'misty', 'water');
    const poisoned = act(theirs, 'misty', { type: 'ATTACH_ENERGY', cardUid: water!, target: 'active' });
    expect(poisoned.players.misty!.active!.poison).toBe(10);
    expect(poisoned.players.misty!.active!.effects?.triggeredPoison).toBeUndefined();
    expect(poisoned.log!.map((l) => l.text)).toContain('Triggered Poison: Squirtle is now Poisoned.');
    // Expired (set for an earlier turn): nothing.
    theirs = endTurn(s, 'ash');
    misty(theirs).active!.effects = { triggeredPoison: theirs.turn - 1 };
    const [water2] = give(theirs, 'misty', 'water');
    expect(act(theirs, 'misty', { type: 'ATTACH_ENERGY', cardUid: water2!, target: 'active' }).players.misty!.active!.poison ?? 0).toBe(0);
  });

  it('a refused action runs no hook', () => {
    const s = duel('charmander', 'squirtle');
    ash(s).active = pokemon('eeveeNeo');
    const result = applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'not-in-hand', target: 'active' });
    expect(result.ok).toBe(false);
    expect(s.pendingChoice).toBeUndefined();
  });
});
