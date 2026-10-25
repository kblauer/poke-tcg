import { describe, expect, it } from 'vitest';
import { applyAction, pendingChoiceView, type GameState, type PowerChoices, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, pokemon } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const tryPower = (s: GameState, source: Target, choices: PowerChoices = {}) => applyAction(s, 'ash', { type: 'USE_POWER', source, choices });
const power = (s: GameState, source: Target, choices: PowerChoices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const deckCard = (s: GameState, player: string, name: string) => {
  const card = { uid: `${name}-deck-${s.players[player]!.deck.length}`, defId: id(name) };
  s.players[player]!.deck.unshift(card);
  return card.uid;
};

describe('Neo Discovery Pokémon Powers', () => {
  it("Spikes: 10 damage to the opponent's benched Pokémon that becomes their Active Pokémon during their turn", () => {
    let s = endTurn(duel('forretress', 'squirtle', { defenderEnergy: ['water'], oppBench: ['charmander'] }), 'ash');
    s = act(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: misty(s).active!.energy.map((e) => e.uid) });
    expect([misty(s).active!.card.defId, misty(s).active!.damage]).toEqual([id('charmander'), 10]);
  });

  it("Spikes: not when the attacker's own effect brings the Pokémon in during its owner's turn", () => {
    const s = attack(duel('forretress', 'machoke', { energy: ['fire', 'fire', 'fire'], oppBench: ['charmander'] }), 0);
    // Rapid Spin: the one benched Pokémon comes straight in, during Ash's turn.
    expect([misty(s).active!.card.defId, misty(s).active!.damage]).toEqual([id('charmander'), 0]);
  });

  it('Frog Song: 40 more damage while more than 3 Poliwag line Pokémon are in play, both sides', () => {
    const s = duel('politoed', 'wobbuffet', { energy: ['water', 'water'], bench: ['poliwagNeo', 'poliwagNeo'], oppBench: ['poliwagNeo'] });
    expect(misty(attack(flips(s, true, false), 0)).active!.damage).toBe(80);
    misty(s).bench[0] = null;
    expect(misty(attack(flips(s, true, false), 0)).active!.damage).toBe(40);
  });

  it('Anger: Hidden Power does 10 more for each damage counter on Unown A', () => {
    const s = duel('unownD', 'machoke', { energy: ['psychic'], bench: ['unownA'] });
    ash(s).bench[0]!.damage = 20;
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it("Unown D: 30 less damage from a Darkness Pokémon, unless there's more than 1 Unown D", () => {
    let s = endTurn(duel('machoke', 'houndourDark', { bench: ['unownD'], defenderEnergy: ['fire'] }), 'ash');
    expect(ash(attack(structuredClone(s), 0, {}, 'misty')).active!.damage).toBe(0);
    ash(s).bench[1] = pokemon('unownD');
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(10);
  });

  it('Find: with Unown F, I, N and D on the Bench, a Trainer card from the deck', () => {
    const s = duel('charmander', 'squirtle', { bench: ['unownF', 'unownI', 'unownN'] });
    expect(tryPower(s, 0)).toMatchObject({ ok: false, error: 'You need Unown F, I, N and D on your Bench' });
    ash(s).bench[3] = pokemon('unownD');
    deckCard(s, 'ash', 'switch');
    deckCard(s, 'ash', 'bill');
    const after = power(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'trainer' });
  });

  it('Undo: with Unown U, N, D and O on the Bench, the Active Pokémon and its cards go back to the hand', () => {
    const s = duel('charmander', 'squirtle', { energy: ['fire'], bench: ['unownU', 'unownN', 'unownD', 'unownO'] });
    const after = power(s, 0);
    expect([after.phase, ash(after).active, ash(after).hand.length - ash(s).hand.length]).toEqual(['promote', null, 2]);
  });

  it("Engage: the opponent may take a new hand of 4, then the Unown's owner may", () => {
    let s = duel('charmander', 'squirtle');
    const [unown] = give(s, 'ash', 'unownE');
    give(s, 'misty', 'water');
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: unown!, slot: 0 });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'engage' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(misty(s).hand.length).toBe(4);
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'engage' });
    const hand = ash(s).hand.length;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 1 });
    expect([ash(s).hand.length, s.pendingChoice]).toEqual([hand, undefined]);
  });

  it('Increase: when played from the hand, an Unown from the deck may go onto the Bench', () => {
    let s = duel('charmander', 'squirtle');
    const [unown] = give(s, 'ash', 'unownI');
    const found = deckCard(s, 'ash', 'unownO');
    // The only Unown in the deck: taken without a question (the same-card rule).
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: unown!, slot: 0 });
    expect(ash(s).bench[1]!.card.uid).toBe(found);
  });

  it("Observe: shows the top 5 cards of the opponent's deck, in order", () => {
    const s = power(duel('charmander', 'squirtle', { bench: ['unownO'] }), 0);
    const view = pendingChoiceView(s, s.pendingChoice!);
    expect(view.kind === 'oppHand' && view.cards.map((c) => c.uid)).toEqual(misty(s).deck.slice(0, 5).map((c) => c.uid));
    expect(misty(act(s, 'ash', { type: 'RESOLVE_CHOICE' })).deck).toEqual(misty(s).deck);
  });

  it("Gaze: a benched Pokémon's power stops working this turn, until it leaves the Bench", () => {
    let s = duel('igglybuff', 'squirtle', { oppBench: ['machamp'] });
    s = power(s, 'active', { oppFrom: 0 });
    expect([misty(s).bench[0]!.powerOffUntil, misty(s).bench[0]!.gazed]).toEqual([3, true]);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'gustofwind')[0]!, choices: { target: 0 } });
    expect(misty(s).active!.powerOffUntil).toBeUndefined();
  });

  it('Energy Evolution: attaching an Energy card, heads evolves Eevee from the deck into that type', () => {
    let s = duel('eeveeNeo', 'squirtle');
    const espeon = deckCard(s, 'ash', 'espeonNeo');
    deckCard(s, 'ash', 'umbreonPursuit');
    const [energy] = give(s, 'ash', 'psychic');
    s = act(flips(s, true), 'ash', { type: 'ATTACH_ENERGY', cardUid: energy!, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'evolveFromDeck', names: ['Espeon'] });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: espeon });
    expect(ash(s).active!.card.defId).toBe(id('espeonNeo'));
  });

  it('Energy Evolution: tails does nothing; and it works the turn Eevee was played (agreed)', () => {
    let s = duel('eeveeNeo', 'squirtle');
    ash(s).active!.playedTurn = 3;
    deckCard(s, 'ash', 'espeonNeo');
    expect(act(flips(s, false), 'ash', { type: 'ATTACH_ENERGY', cardUid: give(s, 'ash', 'psychic')[0]!, target: 'active' }).pendingChoice).toBeUndefined();
    s = act(flips(s, true), 'ash', { type: 'ATTACH_ENERGY', cardUid: give(s, 'ash', 'psychic')[0]!, target: 'active' });
    expect(s.pendingChoice?.kind).toBe('evolveFromDeck');
  });

  it('Revive Friends: heads puts a Kabuto from the deck onto the Bench', () => {
    let s = duel('kabutoNeo', 'squirtle');
    const kabuto = deckCard(s, 'ash', 'kabutoNeo');
    // The only Kabuto in the deck: benched without a question (the same-card rule).
    s = power(flips(s, true), 'active');
    expect(ash(s).bench[0]!.card.uid).toBe(kabuto);
    expect(tryPower(s, 'active')).toMatchObject({ ok: false });
  });

  it('Fossil: heads puts a card that evolves from Mysterious Fossil from the deck onto the Bench', () => {
    let s = duel('omanyteNeo', 'squirtle');
    const omanyte = deckCard(s, 'ash', 'omanyte');
    deckCard(s, 'ash', 'kabuto');
    s = power(flips(s, true), 'active');
    expect(s.pendingChoice).toMatchObject({ filter: 'evolvesFrom', name: 'Mysterious Fossil' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: omanyte });
    expect(ash(s).bench[0]!.card.uid).toBe(omanyte);
  });
});
