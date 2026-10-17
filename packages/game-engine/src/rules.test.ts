import { describe, expect, it } from 'vitest';
import { cardImplemented, getPlayerView, type CardDef } from './index.js';
import { attack, CARDS, duel, id } from './effects/test-kit.js';

describe('battle rules', () => {
  it('typeDamage multiplies the base damage of attacks by Pokémon of that type, before weakness', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    s.rules = [{ kind: 'typeDamage', type: 'fire', multiplier: 2 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(60);
    // Other types aren't affected.
    s.rules = [{ kind: 'typeDamage', type: 'water', multiplier: 2 }];
    expect(attack(s, 1).players.misty!.active!.damage).toBe(30);
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
