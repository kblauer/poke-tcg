import { describe, expect, it } from 'vitest';
import { applyAction, attackDamage, createGame, type GameState, type PokemonCardDef } from './index.js';
import { TEST_CARDS, testDeck } from './test-cards.js';

const charmander = TEST_CARDS.charmander as PokemonCardDef;
const squirtle = TEST_CARDS.squirtle as PokemonCardDef;
const scratch = charmander.attacks[0]!; // 10 damage, fire attacker
const hit = (damage: number) => ({ ...scratch, damage });

describe('weakness and resistance', () => {
  it('deals base damage without weakness or resistance', () => {
    expect(attackDamage(hit(30), charmander, squirtle)).toBe(30);
  });

  it("multiplies damage when the defender is weak to the attacker's type", () => {
    const weak = { ...squirtle, weakness: { type: 'fire' as const, multiplier: 2 } };
    expect(attackDamage(hit(30), charmander, weak)).toBe(60);
  });

  it("subtracts resistance, never going below 0", () => {
    const resists = { ...squirtle, resistance: { type: 'fire' as const, amount: 30 } };
    expect(attackDamage(hit(40), charmander, resists)).toBe(10);
    expect(attackDamage(hit(20), charmander, resists)).toBe(0);
  });

  it('applies weakness before resistance', () => {
    const both = { ...squirtle, weakness: { type: 'fire' as const, multiplier: 2 }, resistance: { type: 'fire' as const, amount: 30 } };
    expect(attackDamage(hit(20), charmander, both)).toBe(10);
  });

  it("ignores other types and attacks that deal no damage", () => {
    const weak = { ...squirtle, weakness: { type: 'lightning' as const, multiplier: 2 } };
    expect(attackDamage(hit(30), charmander, weak)).toBe(30);
    expect(attackDamage(hit(0), charmander, { ...squirtle, weakness: { type: 'fire', multiplier: 2 } })).toBe(0);
  });

  it('applies to attacks in a game', () => {
    let s: GameState = createGame({ id: 'ash', deck: testDeck('fire') }, { id: 'misty', deck: testDeck('water') }, 42, {
      ...TEST_CARDS,
      squirtle: { ...squirtle, hp: 100, weakness: { type: 'fire', multiplier: 2 } },
    });
    s = structuredClone(s);
    const inPlay = (uid: string, defId: string, energy: string[] = []) => ({
      card: { uid, defId },
      evolvedFrom: [],
      damage: 0,
      energy: energy.map((e, i) => ({ uid: `${uid}-e${i}`, defId: e })),
      playedTurn: 0,
    });
    s.players.ash!.active = inPlay('a', 'charmander', ['fire-energy']);
    s.players.misty!.active = inPlay('m', 'squirtle');
    Object.assign(s, { phase: 'playing', turn: 3, currentPlayer: 'ash' });
    const res = applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 });
    if (!res.ok) throw new Error(res.error);
    expect(res.state.players.misty!.active!.damage).toBe(20);
  });
});
