import { describe, expect, it } from 'vitest';
import { cardImplemented, createGame, getPlayerView, HAND_SIZE, type CardDef } from './index.js';
import { flipCoin } from './status.js';
import { attack, CARDS, duel, flips, id } from './effects/test-kit.js';

describe('battle rules', () => {
  it('typeDamage multiplies the base damage of attacks by Pokémon of that type, before weakness', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    s.rules = [{ kind: 'typeDamage', type: 'fire', multiplier: 2 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(60);
    // Other types aren't affected.
    s.rules = [{ kind: 'typeDamage', type: 'water', multiplier: 2 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(30);
  });

  it("damageBonus adds to the base damage of the player's attacks (of the type, if given)", () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    s.rules = [{ kind: 'damageBonus', player: 'ash', amount: 10 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(40);
    s.rules = [{ kind: 'damageBonus', player: 'ash', amount: 10, type: 'water' }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(30);
    s.rules = [{ kind: 'damageBonus', player: 'misty', amount: 10 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(30);
    // Added before weakness: Squirtle's Bubble on a Water-weak Charmander does (10 + 10) × 2.
    const w = duel('squirtle', 'charmander', { energy: ['water'] });
    w.rules = [{ kind: 'damageBonus', player: 'ash', amount: 10, type: 'water' }];
    expect(attack(w, 0).players.misty!.active!.damage).toBe(40);
  });

  it("damageGuard takes damage off attacks on the player's Pokémon (of the type, if given), after weakness", () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    s.rules = [{ kind: 'damageGuard', player: 'misty', amount: 10 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(20);
    s.rules = [{ kind: 'damageGuard', player: 'misty', amount: 10, type: 'fighting' }, { kind: 'damageGuard', player: 'misty', amount: 10, type: 'grass' }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(20);
    s.rules = [{ kind: 'damageGuard', player: 'ash', amount: 10 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(30);
    const w = duel('squirtle', 'charmander', { energy: ['water'] });
    w.rules = [{ kind: 'damageGuard', player: 'misty', amount: 10 }];
    expect(attack(w, 0).players.misty!.active!.damage).toBe(10);
  });

  it("conditionGuard stops the opponent's attacks giving the player's Pokémon those conditions", () => {
    const s = duel('gloom', 'onix', { energy: ['grass'] });
    s.rules = [{ kind: 'conditionGuard', player: 'misty', conditions: ['poisoned'], label: 'Antidote' }];
    const after = attack(s, 0);
    expect(after.players.misty!.active!.poison).toBeFalsy();
    expect(after.log!.map((l) => l.text)).toContain('Antidote protected Onix from that.');
    s.rules = [{ kind: 'conditionGuard', player: 'misty', conditions: ['confused'] }];
    expect(attack(s, 0).players.misty!.active!.poison).toBe(10);
  });

  it("luckyFlips makes the player's next flips heads, counting down", () => {
    const s = flips(duel('charmander', 'onix'), false, false, false);
    s.rules = [{ kind: 'luckyFlips', player: 'ash', flips: 1 }];
    expect(flipCoin(s, 'Test', 'misty')).toBe(false);
    expect(flipCoin(s, 'Test', 'ash')).toBe(true);
    expect(flipCoin(s, 'Test', 'ash')).toBe(false);
    expect(s.rules[0]).toMatchObject({ flips: 0 });
  });

  it('openingHand deals the player more cards, and createGame puts the rules in force', () => {
    const deck = Array<string>(20).fill(id('charmander'));
    const s = createGame({ id: 'ash', deck }, { id: 'misty', deck }, 1, CARDS, [{ kind: 'openingHand', player: 'ash', cards: 2, label: 'Great Ball' }]);
    expect(s.players.ash!.hand).toHaveLength(HAND_SIZE + 2);
    expect(s.players.misty!.hand).toHaveLength(HAND_SIZE);
    expect(s.rules).toHaveLength(1);
    expect(s.log!.at(-1)!.text).toBe('Drew 2 extra cards (Great Ball).');
  });

  it('are in both players’ views', () => {
    const s = duel('charmander', 'onix');
    s.rules = [{ kind: 'typeDamage', type: 'fire', multiplier: 2 }];
    expect(getPlayerView(s, 'misty').rules).toEqual(s.rules);
  });
});

describe('cardImplemented', () => {
  it('needs an effect for every attack with text, the power and Trainers', () => {
    expect(cardImplemented(CARDS[id('charmander')]!)).toBe(true);
    expect(cardImplemented(CARDS[id('ninetales')]!)).toBe(true);
    const made = (def: Partial<CardDef>) => ({ ...CARDS[id('charmander')]!, ...def }) as CardDef;
    expect(cardImplemented(made({ id: 'none-1', attacks: [{ name: 'Mystery', cost: [], damage: 10, text: 'Does something.' }] }))).toBe(false);
    expect(cardImplemented(made({ id: 'none-1', attacks: [{ name: 'Tackle', cost: [], damage: 10, text: null }] }))).toBe(true);
    expect(cardImplemented(made({ id: 'none-1', attacks: [], power: { name: 'Mystery', text: '' } }))).toBe(false);
    expect(cardImplemented({ id: 'none-2', kind: 'trainer', name: 'Mystery', imageUrl: null, text: '' })).toBe(false);
    expect(cardImplemented({ id: 'base1-91', kind: 'trainer', name: 'Bill', imageUrl: null, text: '' })).toBe(true);
  });
});
