import { describe, expect, it } from 'vitest';
import { attackDamageRanges } from './cpu/shared.js';
import { attack, duel } from './effects/test-kit.js';

// The attack list's damage numbers (PlayerView.attackDamage): each attack played out on a copy of the game.
describe('attack damage preview', () => {
  it('Karate Chop does 50 less 10 for each damage counter on Machoke', () => {
    const s = duel('machoke', 'squirtle', { energy: ['fighting', 'fighting', 'fighting'] });
    expect(attackDamageRanges(s, 'ash')[0]).toEqual({ min: 50, max: 50 });
    s.players.ash!.active!.damage = 20;
    expect(attackDamageRanges(s, 'ash')[0]).toEqual({ min: 30, max: 30 });
  });

  it('counts Weakness, on variable and plain damage alike', () => {
    const s = duel('machoke', 'pikachuP1', { energy: ['fighting', 'fighting', 'fighting', 'fighting'] });
    s.players.ash!.active!.damage = 20;
    // Karate Chop 30, doubled; Submission 60, doubled.
    expect(attackDamageRanges(s, 'ash').slice(0, 2)).toEqual([
      { min: 60, max: 60 },
      { min: 120, max: 120 },
    ]);
  });

  it("shows 0 for an attack the Defending Pokémon's effect would stop (Harden)", () => {
    // Onix Hardens, which ends Ash's turn.
    const s = attack(duel('onix', 'squirtle', { energy: ['fighting', 'fighting'], defenderEnergy: ['water'] }), 1);
    expect(s.currentPlayer).toBe('misty');
    // Bubble's 10 is no more than 30: Harden prevents it.
    expect(attackDamageRanges(s, 'misty')[0]).toEqual({ min: 0, max: 0 });
  });

  it('is null for an attack that can\'t be used', () => {
    const s = duel('machoke', 'squirtle', { energy: ['fighting'] });
    expect(attackDamageRanges(s, 'ash')[0]).toBeNull();
  });
});
