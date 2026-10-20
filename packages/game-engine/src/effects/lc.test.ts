import { describe, expect, it } from 'vitest';
import { attackEffect, powerError, situationCounts, type GameState, type Target } from '../index.js';
import { LC_REPRINTS } from './lc.js';
import { attack, duel, flips, mon, C, G, P } from './test-kit.js';

// The checks against the TCGdex snapshot (every card mapped, every attack's effect) are in packages/campaign/src/lc.test.ts.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const situation = (s: GameState, source: Target) => ({ me: ash(s), opp: misty(s), counts: situationCounts(ash(s), misty(s)), source, cards: s.cards, turn: s.turn });
const reprintOf = (original: string) => Object.keys(LC_REPRINTS).find((k) => LC_REPRINTS[k] === original)!;

describe('Legendary Collection', () => {
  it("plays a reprint's attack like the original (Jolteon's Pin Missile, under TCGdex's misspelling too)", () => {
    const jolteon = reprintOf('base2-4');
    expect(attackEffect(jolteon, 'Pin Missile')).toBe(attackEffect('base2-4', 'Pin Missile'));
    expect(attackEffect(jolteon, 'Pin Missle')).toBe(attackEffect('base2-4', 'Pin Missile'));
  });

  it('has the printed damage TCGdex leaves out (Dark Dragonite: Giant Tail, 70 on heads)', () => {
    const lc = reprintOf('base5-5');
    expect(attackEffect(lc, 'Giant Tail')?.damage).toBe('70');
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire', 'fire', 'fire'] });
    s.cards[lc] = mon(lc, 'Dark Dragonite', C, 70, [['Giant Tail', [C, C, C, C], 70]], { stage: 'stage2' });
    ash(s).active!.card.defId = lc;
    expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(70);
  });

  it("stops its powers while the Pokémon is Poisoned, unlike the original (Alakazam's Damage Swap)", () => {
    const lc = reprintOf('base1-1');
    const s = duel('alakazam', 'squirtle', { bench: ['charmander'] });
    ash(s).active!.damage = 20;
    ash(s).active!.poison = 10;
    expect(powerError(situation(s, 'active'))).toBeNull();
    s.cards[lc] = mon(lc, 'Alakazam', P, 80, [['Confuse Ray', [P, P, P], 30]], { stage: 'stage2', power: { name: 'Damage Swap', text: '' } });
    ash(s).active!.card.defId = lc;
    expect(powerError(situation(s, 'active'))).toBe("Alakazam is Poisoned and can't use Damage Swap");
  });

  it("stops Toxic Gas while its Muk is Burned", () => {
    const lc = reprintOf('base3-13');
    const s = duel('blastoise', 'charmander', { oppBench: ['muk'] });
    s.cards[lc] = mon(lc, 'Muk', G, 70, [['Sludge', [G, G, G], 30]], { stage: 'stage1', power: { name: 'Toxic Gas', text: '' } });
    misty(s).bench[0]!.card.defId = lc;
    ash(s).hand = [{ uid: 'w', defId: 'water' }];
    expect(powerError(situation(s, 'active'))).toBe("Toxic Gas: Rain Dance can't be used");
    misty(s).bench[0]!.burned = true;
    expect(powerError(situation(s, 'active'))).toBeNull();
  });

  it("stops Haunter's Transparency while it's Confused, not only Asleep", () => {
    const lc = reprintOf('base3-21');
    const s = duel('charmander', 'haunterF', { energy: ['fire'] });
    s.cards[lc] = mon(lc, 'Haunter', P, 50, [['Nightmare', [P, C], 10]], { stage: 'stage1', power: { name: 'Transparency', text: '' } });
    misty(s).active!.card.defId = lc;
    misty(s).active!.condition = 'confused';
    // No flip for Transparency: the attack's damage goes through.
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
  });

  it('maps every card (110)', () => {
    expect(Object.keys(LC_REPRINTS)).toHaveLength(110);
  });
});
