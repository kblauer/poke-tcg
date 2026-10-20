import { describe, expect, it } from 'vitest';
import { type GameState } from '../index.js';
import { act, attack, duel, flips, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Southern Islands attacks', () => {
  it("Rainbow Wave: 20 to each of the opponent's Pokémon of the attached Energy's type, Benched ones too", () => {
    const s = attack(duel('mewSI', 'haunter', { energy: ['psychic'], oppBench: ['gastly', 'charmander'] }), 0);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, misty(s).bench[1]!.damage]).toEqual([20, 20, 0]);
  });

  it('Rainbow Wave: with Energy of two types, it asks which', () => {
    const res = tryAttack(duel('mewSI', 'haunter', { energy: ['psychic', 'fire'], oppBench: ['charmander'] }), 0);
    expect(res.ok).toBe(false);
    const s = attack(duel('mewSI', 'haunter', { energy: ['psychic', 'fire'], oppBench: ['charmander'] }), 0, { type: 'fire' });
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([0, 20]);
  });

  it('Strange Scent: each player who flips heads removes 3 damage counters (at once, when they are all on one Pokémon)', () => {
    const start = duel('ivysaurSI', 'machoke', { energy: ['grass'] });
    ash(start).active!.damage = 30;
    misty(start).active!.damage = 50;
    const s = attack(flips(start, true, true), 0);
    expect([ash(s).active!.damage, misty(s).active!.damage]).toEqual([0, 20]);
  });

  it('Strange Scent: with damage counters on several Pokémon, they are removed one at a time', () => {
    const start = duel('ivysaurSI', 'machoke', { energy: ['grass'], bench: ['charmander'] });
    ash(start).active!.damage = 20;
    ash(start).bench[0]!.damage = 20;
    let s = attack(flips(start, true, false), 0);
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'removeDamage', count: 3 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).active!.damage, ash(s).bench[0]!.damage, s.currentPlayer]).toEqual([0, 10, 'misty']);
  });

  it('Tentacle Grip: 2 cards for each heads, one coin per Water Energy', () => {
    const start = duel('tentacruelSI', 'machoke', { energy: ['water', 'water'] });
    const before = ash(start).hand.length;
    const s = attack(flips(start, true, false), 0);
    expect(ash(s).hand.length).toBe(before + 2);
  });

  it('Poison Sting (Tentacruel): heads Paralyzes, as printed', () => {
    const s = attack(flips(duel('tentacruelSI', 'machoke', { energy: ['water', 'water'] }), true), 1);
    expect(misty(s).active!.condition).toBe('paralyzed');
  });

  it('Gentle Song: 2 damage counters off Lapras and the Defending Pokémon, which is now Asleep', () => {
    const start = duel('laprasSI', 'machoke', { energy: ['water'] });
    ash(start).active!.damage = 30;
    misty(start).active!.damage = 10;
    // Misty's Asleep flip between the turns: tails, so it stays Asleep.
    const s = attack(flips(start, false), 0);
    expect([ash(s).active!.damage, misty(s).active!.damage, misty(s).active!.condition]).toEqual([10, 0, 'asleep']);
  });

  it("Lick Wounds: asks whose Pokémon when both players' are damaged; heads removes 2 counters", () => {
    const start = duel('lickitungSI', 'machoke', { energy: ['fire'] });
    ash(start).active!.damage = 30;
    misty(start).active!.damage = 30;
    expect(tryAttack(start, 0).ok).toBe(false);
    const s = attack(flips(start, true), 0, { side: 'opponent', oppTarget: 'active' });
    expect([ash(s).active!.damage, misty(s).active!.damage]).toEqual([30, 10]);
  });

  it('Paradise Pollen: heads heals Vileplume and the chosen benched Pokémon', () => {
    const start = duel('vileplumeSI', 'machoke', { energy: ['grass'], bench: ['charmander'] });
    ash(start).active!.damage = 30;
    ash(start).bench[0]!.damage = 10;
    const s = attack(flips(start, true), 0, { ownBenchSlot: 0 });
    expect([ash(s).active!.damage, ash(s).bench[0]!.damage]).toEqual([10, 0]);
  });

  it('Rampage: 10 more for each damage counter on Primeape; tails Confuses it after the damage', () => {
    const start = duel('primeapeSI', 'machoke', { energy: ['fighting', 'fighting'] });
    ash(start).active!.damage = 30;
    const s = attack(flips(start, false), 1);
    expect([misty(s).active!.damage, ash(s).active!.condition]).toEqual([50, 'confused']);
  });

  it('Squirt: 10 to the chosen Pokémon, without Weakness', () => {
    const s = attack(duel('marillSI', 'machoke', { energy: ['water'], oppBench: ['charmander'] }), 0, { oppTarget: 0 });
    expect(misty(s).bench[0]!.damage).toBe(10);
  });
});
