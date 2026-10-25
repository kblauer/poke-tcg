import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, retreatCost, type GameState, type TrainerChoices } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (uid: string, name: string) => ({ uid, defId: id(name) });
/** Ash plays the Trainer `name` from the hand. */
const play = (s: GameState, name: string, choices: TrainerChoices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
const tryPlay = (s: GameState, name: string, choices: TrainerChoices = {}) => applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
const resolve = (s: GameState, player: string, answer: { cardUid?: string; target?: 'active' | number; count?: number } = {}) => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('Gym Heroes Trainers', () => {
  it('Brock removes a damage counter from each of your damaged Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle', 'squirtle'] });
    ash(s).active!.damage = 20;
    ash(s).bench[0]!.damage = 10;
    const after = play(s, 'brockG');
    expect([ash(after).active!.damage, ash(after).bench[0]!.damage, ash(after).bench[1]!.damage]).toEqual([10, 0, 0]);
  });

  it('Erika: you draw up to 3, then your opponent may draw up to 3', () => {
    let s = play(duel('charmander', 'onix'), 'erikaG');
    const [mine, theirs] = [ash(s).hand.length, misty(s).hand.length];
    s = resolve(resolve(s, 'ash', { count: 2 }), 'misty', { count: 3 });
    expect([ash(s).hand.length, misty(s).hand.length]).toEqual([mine + 2, theirs + 3]);
  });

  it('Lt. Surge puts a Basic Pokémon from the hand into play as the Active Pokémon; the old one goes to the Bench', () => {
    const s = duel('charmander', 'onix');
    ash(s).hand = [];
    expect(tryPlay(s, 'ltSurge')).toEqual({ ok: false, error: 'You have no Basic Pokémon cards in your hand' });
    const [squirtle] = give(s, 'ash', 'squirtle');
    const after = play(s, 'ltSurge', { handUids: [squirtle!] });
    expect([ash(after).active!.card.uid, ash(after).bench[0]!.card.defId]).toEqual([squirtle, id('charmander')]);
  });

  it('Misty: discard 2 cards; attacks by Pokémon with Misty in their names do 20 more damage this turn', () => {
    let s = duel('mistysTentacoolC', 'onix', { energy: ['water', 'water'] });
    ash(s).hand = [card('h1', 'fire'), card('h2', 'water')];
    s = play(s, 'mistyG', { handUids: ['h1', 'h2'] });
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(40);
    expect(misty(attack(flips(duel('mistysTentacoolC', 'onix', { energy: ['water', 'water'] }), false), 0)).active!.damage).toBe(20);
  });

  it("The Rocket's Training Gym makes retreating cost 1 more; Cerulean City Gym makes it cost 1 less for Misty's Pokémon", () => {
    const s = duel('mistysCloyster', 'onix');
    const cost = (stadium: string) => retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)], card('st', stadium));
    expect([cost('trainingGym'), cost('ceruleanGym'), retreatCost(misty(s).active!, s.cards, [misty(s), ash(s)], card('st', 'ceruleanGym'))]).toEqual([2, 0, 1]);
  });

  it('No Removal Gym: Energy Removal needs 2 other cards discarded from the hand', () => {
    const s = duel('charmander', 'onix', { defenderEnergy: ['fighting'] });
    s.stadium = { card: card('gym', 'noRemovalGym'), owner: 'misty' };
    ash(s).hand = [card('h1', 'fire'), card('er', 'energyremoval')];
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'er', choices: { oppTarget: 'active' } })).toMatchObject({ ok: false });
    ash(s).hand.push(card('h2', 'water'));
    const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'er', choices: { handUids: ['h1', 'h2'], oppTarget: 'active' } });
    expect([ash(after).hand, misty(after).active!.energy, ash(after).discard.length]).toEqual([[], [], 3]);
  });

  it('Minion of Team Rocket: both heads returns a benched Pokémon to its hand; otherwise the turn ends', () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    const heads = act(flips(s, true, true), 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'minion')[0]!, choices: { oppTarget: 0 } });
    expect([misty(heads).bench[0], misty(heads).hand.at(-1)!.defId, heads.currentPlayer]).toEqual([null, id('squirtle'), 'ash']);
    const tails = act(flips(s, true, false), 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'minion')[0]!, choices: { oppTarget: 0 } });
    expect([misty(tails).bench[0]!.card.defId, tails.currentPlayer]).toEqual([id('squirtle'), 'misty']);
  });

  it("Tickling Machine: heads sets the opponent's hand aside until the end of their next turn; tails ends your turn", () => {
    let s = duel('charmander', 'onix');
    const hand = misty(s).hand.length;
    s = act(flips(s, true), 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'ticklingMachine')[0]!, choices: {} });
    expect([misty(s).hand.length, misty(s).setAside?.cards.length]).toEqual([0, hand]);
    s = endTurn(s, 'ash');
    expect(misty(s).hand.length).toBe(1);
    s = endTurn(s, 'misty');
    expect([misty(s).hand.length, misty(s).setAside]).toEqual([hand + 1, undefined]);
    const tails = duel('charmander', 'onix');
    expect(act(flips(tails, false), 'ash', { type: 'PLAY_TRAINER', cardUid: give(tails, 'ash', 'ticklingMachine')[0]!, choices: {} }).currentPlayer).toBe('misty');
  });

  it("Misty's Wrath: 2 of the top 7 cards go into the hand; the rest are discarded", () => {
    let s = duel('charmander', 'onix');
    ash(s).deck = Array.from({ length: 9 }, (_, i) => card(`d${i}`, i === 0 ? 'fire' : 'water'));
    s = play(s, 'mistysWrath');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: ash(s).deck.slice(0, 7) });
    s = resolve(resolve(s, 'ash', { cardUid: 'd3' }), 'ash', { cardUid: 'd5' });
    expect([ash(s).deck.map((c) => c.uid), ash(s).hand.slice(-2).map((c) => c.uid), ash(s).discard.length]).toEqual([['d7', 'd8'], ['d3', 'd5'], 6]);
  });

  it("Erika's Maids trades 2 cards from the hand for up to 2 Pokémon with Erika in their names from the deck", () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [card('h1', 'fire'), card('h2', 'water')];
    ash(s).deck = [card('o1', 'erikasOddish'), card('o2', 'erikasGloom'), card('o3', 'erikasDratini'), card('c1', 'charmander')];
    s = play(s, 'erikasMaids', { handUids: ['h1', 'h2'] });
    s = resolve(s, 'ash', { cardUid: 'o2' });
    s = resolve(s, 'ash');
    expect([ash(s).hand.map((c) => c.uid), ash(s).deck.map((c) => c.uid).sort()]).toEqual([['o2'], ['c1', 'h1', 'h2', 'o1', 'o3']]);
  });

  it("Erika's Perfume puts Basic Pokémon from the opponent's hand onto their Bench", () => {
    let s = duel('charmander', 'onix');
    misty(s).hand = [card('m1', 'squirtle'), card('m2', 'water')];
    s = play(s, 'erikasPerfume');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'oppHand', options: [{ uid: 'm1' }], optional: true });
    s = resolve(s, 'ash', { cardUid: 'm1' });
    expect([misty(s).bench[0]!.card.uid, misty(s).hand.map((c) => c.uid), s.pendingChoice]).toEqual(['m1', ['m2'], undefined]);
  });

  it("Lt. Surge's Treaty: the opponent chooses; both take a Prize card, or you draw a card", () => {
    let s = play(duel('charmander', 'onix'), 'surgesTreaty');
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'options' });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 })).toMatchObject({ ok: false });
    const prizes = resolve(s, 'misty', { count: 0 });
    expect([ash(prizes).prizes.length, misty(prizes).prizes.length]).toEqual([5, 5]);
    const hand = ash(s).hand.length;
    s = resolve(s, 'misty', { count: 1 });
    expect([ash(s).hand.length, ash(s).prizes.length]).toEqual([hand + 1, 6]);
  });

  it('Secret Mission: look at the opponent’s hand, then discard any number of cards and draw as many', () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [card('h1', 'fire'), card('h2', 'water')];
    s = play(s, 'secretMission');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'oppHand', cards: misty(s).hand });
    s = resolve(resolve(resolve(s, 'ash'), 'ash', { cardUid: 'h1' }), 'ash');
    expect([ash(s).hand.length, ash(s).discard.some((c) => c.uid === 'h1'), s.pendingChoice]).toEqual([2, true, undefined]);
  });

  it('Energy Flow returns Energy cards from your Pokémon to your hand', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'], bench: ['squirtle'] });
    ash(s).bench[0]!.energy = [card('w1', 'water')];
    const fire = ash(s).active!.energy[0]!.uid;
    const after = play(s, 'energyFlow', { energyUids: [fire, 'w1'] });
    expect([ash(after).active!.energy.length, ash(after).bench[0]!.energy, ash(after).hand.slice(-2).map((c) => c.uid)]).toEqual([1, [], [fire, 'w1']]);
  });

  it('Trash Exchange shuffles the discard pile into the deck, then discards as many from the top', () => {
    const s = duel('charmander', 'onix');
    ash(s).discard = [card('x1', 'fire'), card('x2', 'fire'), card('x3', 'fire')];
    const deck = ash(s).deck.length;
    const after = play(s, 'trashExchange');
    // The 3 cards, then Trash Exchange itself.
    expect([ash(after).deck.length, ash(after).discard.length]).toEqual([deck, 4]);
  });

});
