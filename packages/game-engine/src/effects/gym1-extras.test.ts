import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, gymLeaderCpu, type GameState, type TrainerChoices } from '../index.js';
import { act, attack, duel, flips, give, id, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (uid: string, name: string) => ({ uid, defId: id(name) });
const play = (s: GameState, name: string, choices: TrainerChoices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
const resolve = (s: GameState, player: string, answer: { cardUid?: string; target?: 'active' | number; count?: number } = {}) => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('Gym Heroes: the cards that ask during play', () => {
  it("Bench Guard: after the attack, the owner is asked whether to move 10 of a benched Pokémon's damage to Brock's Rhydon", () => {
    let s = attack(flips(duel('erikasDragonair', 'onix', { energy: ['fire', 'fire', 'fire'], oppBench: ['squirtle', 'brocksRhydon'] }), true), 0);
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'options' });
    s = resolve(s, 'misty', { count: 0 });
    expect([misty(s).bench[0]!.damage, misty(s).bench[1]!.damage, s.pendingChoice, s.currentPlayer]).toEqual([0, 20, undefined, 'misty']);
    const kept = resolve(attack(flips(duel('erikasDragonair', 'onix', { energy: ['fire', 'fire', 'fire'], oppBench: ['squirtle', 'brocksRhydon'] }), true), 0), 'misty', { count: 1 });
    expect([misty(kept).bench[0]!.damage, misty(kept).bench[1]!.damage]).toEqual([10, 10]);
  });

  it("Flee is asked before the attack; if it damages Misty's Tentacruel, it takes the damage, nothing else, and switches out", () => {
    const s = act(duel('nidoking', 'mistysTentacruel', { energy: ['grass', 'grass', 'grass'], oppBench: ['squirtle'] }), 'ash', { type: 'ATTACK', attackIndex: 1 });
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'ownPokemon', purpose: 'switchIn', optional: true });
    const fled = resolve(s, 'misty', { target: 0 });
    expect([misty(fled).active!.card.defId, misty(fled).bench[0]!.card.defId, misty(fled).bench[0]!.damage, misty(fled).bench[0]!.poison]).toEqual([id('squirtle'), id('mistysTentacruel'), 20, 0]);
    const stayed = resolve(s, 'misty');
    expect([misty(stayed).active!.card.defId, misty(stayed).active!.poison]).toEqual([id('mistysTentacruel'), 20]);
  });

  it('Crosscounter: on heads, an attack that damages Rocket’s Hitmonchan takes double the damage back, with Weakness and Resistance', () => {
    const s = attack(duel('rocketsHitmonchan', 'onix', { energy: ['fighting'], defenderEnergy: ['fighting'] }), 0);
    expect(misty(attack(flips(s, true), 0, {}, 'misty')).active!.damage).toBe(20);
    expect(misty(attack(flips(s, false), 0, {}, 'misty')).active!.damage).toBe(0);
  });

  it("Celadon City Gym: discard an Energy card from your Erika's Active Pokémon to cure it, as often as you like", () => {
    const s = duel('erikasOddish', 'onix', { energy: ['grass'] });
    s.stadium = { card: card('gym', 'celadonGym'), owner: 'misty' };
    ash(s).active!.condition = 'asleep';
    ash(s).active!.poison = 10;
    const after = act(s, 'ash', { type: 'USE_STADIUM' });
    expect([ash(after).active!.condition, ash(after).active!.poison, ash(after).active!.energy]).toEqual([null, 0, []]);
    expect(applyAction(after, 'ash', { type: 'USE_STADIUM' })).toMatchObject({ ok: false });
    // Different Energy cards: the player picks which.
    ash(s).active!.energy.push(card('w1', 'water'));
    expect(getPlayerView(act(s, 'ash', { type: 'USE_STADIUM' }), 'ash').self.pendingChoice).toMatchObject({ kind: 'pickAttached' });
  });

  it("Vermilion City Gym: an attack by Lt. Surge's Pokémon asks whether to flip; heads 10 more, tails 10 to itself", () => {
    const s = duel('surgesRattata', 'onix', { energy: ['fire', 'fire'] });
    s.stadium = { card: card('gym', 'vermilionGym'), owner: 'misty' };
    expect(tryAttack(s, 1)).toMatchObject({ ok: false });
    expect(misty(attack(flips(s, true), 1, { vermilionFlip: true })).active!.damage).toBe(30);
    const tails = attack(flips(s, false), 1, { vermilionFlip: true });
    expect([misty(tails).active!.damage, ash(tails).active!.damage]).toEqual([20, 10]);
    expect(misty(attack(s, 1, { vermilionFlip: false })).active!.damage).toBe(20);
    // The CPU always flips (with nothing else to do first).
    ash(s).hand = [];
    expect(gymLeaderCpu(s, 'ash')).toMatchObject({ type: 'ATTACK', choices: { vermilionFlip: true } });
  });

  it('Charity: its Pokémon may do less damage, and it returns to the hand at the end of the turn', () => {
    let s = play(duel('charmander', 'onix', { energy: ['fire', 'fire'] }), 'charity');
    s = attack(s, 1, { damageCap: 10 });
    expect([misty(s).active!.damage, ash(s).hand.some((c) => c.defId === id('charity')), ash(s).active!.attached]).toEqual([10, true, []]);
  });

  it('Recall: the Active Pokémon can use the attacks of the cards it evolved from this turn', () => {
    const s = duel('charmeleon', 'onix', { energy: ['fire'] });
    ash(s).active!.evolvedFrom = [card('base', 'charmander')];
    expect(tryAttack(s, 1)).toEqual({ ok: false, error: 'Invalid attack' });
    expect(misty(attack(play(s, 'recall'), 1)).active!.damage).toBe(10);
    const basic = duel('charmander', 'onix');
    expect(applyAction(basic, 'ash', { type: 'PLAY_TRAINER', cardUid: give(basic, 'ash', 'recall')[0]!, choices: {} })).toEqual({ ok: false, error: 'Your Active Pokémon has no Basic Pokémon or Evolution card under it' });
  });

  it("Sabrina's ESP: after an attack that flips coins, the player may re-flip them all once", () => {
    let s = play(duel('sabrinasDrowzee', 'onix', { energy: ['psychic'] }), 'sabrinasESP', { target: 'active' });
    s = attack(flips(s, false, true), 0);
    expect([misty(s).active!.effects?.noAttack, getPlayerView(s, 'ash').self.pendingChoice?.kind]).toEqual([undefined, 'options']);
    const again = resolve(s, 'ash', { count: 1 });
    expect([misty(again).active!.effects?.noAttack, again.currentPlayer, again.pendingChoice]).toEqual([4, 'misty', undefined]);
    const kept = resolve(s, 'ash', { count: 0 });
    expect([misty(kept).active!.effects?.noAttack, kept.currentPlayer]).toEqual([undefined, 'misty']);
  });

  it('Narrow Gym: each player with 5 benched Pokémon returns 1 to the hand, the opponent first; then 4 at most', () => {
    const five = ['squirtle', 'squirtle', 'squirtle', 'squirtle', 'squirtle'];
    let s = play(duel('charmander', 'onix', { bench: five, oppBench: five }), 'narrowGym');
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 })).toMatchObject({ ok: false });
    s = resolve(resolve(s, 'misty', { target: 4 }), 'ash', { target: 2 });
    expect([misty(s).bench.filter(Boolean).length, ash(s).bench.filter(Boolean).length, s.pendingChoice]).toEqual([4, 4, undefined]);
    const [basic] = give(s, 'ash', 'charmander');
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: basic!, slot: 2 })).toMatchObject({ ok: false });
  });

  it("Blaine's Quiz #1: the opponent guesses the Pokémon's length; right, they draw 2, wrong, you do", () => {
    let s = duel('squirtle', 'onix');
    ash(s).hand = [card('quizzed', 'charmander')];
    s = play(s, 'blainesQuiz', { handUids: ['quizzed'] });
    const view = getPlayerView(s, 'misty').self.pendingChoice;
    expect(view?.kind === 'options' && view.labels.includes(`2' 0"`) && view.labels.length).toBe(4);
    const right = s.pendingChoice?.kind === 'quiz' ? s.pendingChoice.answer : -1;
    const [mine, theirs] = [ash(s).hand.length, misty(s).hand.length];
    const guessed = resolve(s, 'misty', { count: right });
    expect([ash(guessed).hand.length, misty(guessed).hand.length]).toEqual([mine, theirs + 2]);
    const missed = resolve(s, 'misty', { count: (right + 1) % 4 });
    expect([ash(missed).hand.length, ash(missed).hand[0]!.uid]).toEqual([mine + 2, 'quizzed']);
  });

});
