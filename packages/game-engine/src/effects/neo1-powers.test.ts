import { describe, expect, it } from 'vitest';
import { applyAction, energyPool, type GameState, type PowerChoices, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (uid: string, name: string) => ({ uid, defId: id(name) });
const power = (s: GameState, source: Target, choices: PowerChoices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const evolve = (s: GameState, name: string, target: Target = 'active') => act(s, 'ash', { type: 'EVOLVE', cardUid: give(s, 'ash', name)[0]!, target });
const resolve = (s: GameState, player: string, answer: { cardUid?: string; count?: number } = {}) => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('Neo Genesis Pokémon Powers', () => {
  it("Berserk: when Feraligatr is played from the hand, heads discards the top 5 cards of the opponent's deck, tails its owner's", () => {
    const heads = evolve(flips(duel('croconaw', 'machoke'), true), 'feraligatrBerserk');
    expect([misty(heads).discard.length, ash(heads).discard.length]).toEqual([5, 0]);
    const tails = evolve(flips(duel('croconaw', 'machoke'), false), 'feraligatrBerserk');
    expect([misty(tails).discard.length, ash(tails).discard.length]).toEqual([0, 5]);
  });

  it('Downpour discards a Water Energy card from the hand, as often as you like', () => {
    let s = duel('feraligatrRiptide', 'machoke');
    ash(s).hand = [card('w1', 'water'), card('w2', 'water'), card('f1', 'fire')];
    s = power(power(s, 'active', { cardUid: 'w1' }), 'active', { cardUid: 'w2' });
    expect([ash(s).discard.map((c) => c.uid), ash(s).hand.map((c) => c.uid)]).toEqual([['w1', 'w2'], ['f1']]);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} })).toEqual({ ok: false, error: 'No Water Energy cards in your hand' });
  });

  it("Final Blow: at 20 HP or less, Megahorn's base damage may be 120 (asked)", () => {
    const s = duel('heracross', 'machamp', { energy: ['grass', 'grass', 'grass'] });
    // Not asked at full HP, and a "yes" sent anyway does nothing.
    expect(misty(attack(flips(structuredClone(s), true), 0, { boost: true })).active!.damage).toBe(60);
    ash(s).active!.damage = 40;
    expect(tryAttack(structuredClone(s), 0)).toMatchObject({ ok: false, error: expect.stringContaining('Final Blow') });
    expect(attack(flips(structuredClone(s), true), 0, { boost: true }).log!.map((l) => l.text)).toContain('Final Blow: Megahorn does 120.');
    expect(misty(attack(flips(s, true), 0, { boost: false })).active!.damage).toBe(60);
  });

  it("Hydroelectric Power: Floodlight may do 10 more for each Water Energy not used for its cost (asked)", () => {
    const s = flips(duel('lanturn', 'machoke', { energy: ['lightning', 'lightning', 'water', 'water'] }), false);
    expect(tryAttack(structuredClone(s), 0)).toMatchObject({ ok: false, error: expect.stringContaining('Hydroelectric Power') });
    expect(misty(attack(structuredClone(s), 0, { boost: true })).active!.damage).toBe(40);
    expect(misty(attack(s, 0, { boost: false })).active!.damage).toBe(20);
  });

  it('Herbal Scent: when Meganium is played from the hand, you may flip; heads heals every Grass Pokémon in play, both players\'', () => {
    let s = duel('bayleef', 'bulbasaur', { bench: ['charmander'] });
    ash(s).active!.damage = 30;
    misty(s).active!.damage = 20;
    ash(s).bench[0]!.damage = 10;
    s = evolve(flips(s, true), 'meganiumHerbal');
    expect(s.pendingChoice).toMatchObject({ kind: 'mayFlip', power: 'herbalScent' });
    s = resolve(s, 'ash', { count: 0 });
    expect([ash(s).active!.damage, misty(s).active!.damage, ash(s).bench[0]!.damage]).toEqual([0, 0, 10]);
  });

  it("Wild Growth: each Grass Energy card on its owner's Grass Pokémon provides 2 Grass Energy; two Meganium don't stack", () => {
    let s = duel('bayleef', 'machoke', { energy: ['grass'], bench: ['meganiumWild', 'meganiumWild'] });
    // Worked out after every action.
    s = endTurn(endTurn(s, 'ash'), 'misty');
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['grass', 'grass']);
    // Poisonpowder costs Grass and Colorless.
    expect(tryAttack(s, 0)).toMatchObject({ ok: true });
  });

  it("Mind Games: Slowking's owner may flip when the opponent plays a Trainer card; heads, it does nothing and goes on top of their deck", () => {
    let s = duel('charmander', 'slowking');
    ash(s).active!.damage = 20;
    const [potion] = give(s, 'ash', 'potion');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: potion!, choices: { target: 'active' } });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'mindGames', flips: 1 });
    const stopped = resolve(flips(structuredClone(s), true), 'misty', { count: 0 });
    expect([ash(stopped).active!.damage, ash(stopped).deck[0]!.uid]).toEqual([20, potion]);
    const played = resolve(flips(structuredClone(s), false), 'misty', { count: 0 });
    expect(ash(played).active!.damage).toBe(0);
    expect(ash(resolve(s, 'misty', { count: 1 })).active!.damage).toBe(0);
  });

  it('Fire Recharge: once a turn, heads attaches a Fire Energy card from the discard pile to a Fire Pokémon', () => {
    let s = flips(duel('typhlosionRecharge', 'machoke'), true);
    ash(s).discard = [card('f1', 'fire')];
    s = power(s, 'active', { to: 'active' });
    expect(ash(s).active!.energy.map((e) => e.uid)).toEqual(['f1']);
    ash(s).discard = [card('f2', 'fire')];
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { to: 'active' } })).toMatchObject({ ok: false });
  });

  it('Fire Boost: when Typhlosion is played from the hand, you may flip; heads attaches up to 4 Fire Energy cards from the deck to it', () => {
    let s = flips(duel('quilava', 'machoke'), true);
    ash(s).deck = [card('f1', 'fire'), card('c1', 'charmander'), card('f2', 'fire')];
    s = resolve(evolve(s, 'typhlosionBoost'), 'ash', { count: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'energyType', type: 'fire', count: 4, attachTo: 'active' });
    s = resolve(resolve(s, 'ash', { cardUid: 'f1' }), 'ash', { cardUid: 'f2' });
    expect(ash(s).active!.energy.map((e) => e.uid)).toEqual(['f1', 'f2']);
  });

  it("Playful Punch: heads does 20 damage to the opponent's Active Pokémon; either way, the turn ends", () => {
    const s = power(flips(duel('elekid', 'machoke'), true), 'active');
    expect([misty(s).active!.damage, s.currentPlayer]).toEqual([20, 'misty']);
  });

  it("Glaring Gaze: heads looks at the opponent's hand, and they shuffle a Trainer card from it into their deck", () => {
    let s = flips(duel('noctowl', 'machoke'), true);
    misty(s).hand = [card('p1', 'potion'), card('c1', 'charmander')];
    s = power(s, 'active');
    expect(s.pendingChoice).toMatchObject({ kind: 'oppHandTrainer', source: 'Glaring Gaze' });
    s = resolve(s, 'ash', { cardUid: 'p1' });
    expect([misty(s).hand.map((c) => c.uid), misty(s).deck.some((c) => c.uid === 'p1')]).toEqual([['c1'], true]);
  });
});
