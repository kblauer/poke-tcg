import { describe, expect, it } from 'vitest';
import { applyAction, type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const tryRetreat = (s: GameState, player: string) =>
  applyAction(s, player, { type: 'RETREAT', slot: 0, energyUids: s.players[player]!.active!.energy.map((e) => e.uid) });

describe('Neo Discovery attacks', () => {
  it('Counter: on heads, an attack that damages Wobbuffet next turn takes the same damage back, without Weakness or Resistance', () => {
    let s = attack(duel('wobbuffet', 'machoke', { energy: ['psychic'], defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 0);
    s = attack(flips(s, true), 0, {}, 'misty');
    expect([ash(s).active!.damage, misty(s).active!.damage]).toEqual([50, 50]);
  });

  it('Counter: tails sends nothing back', () => {
    let s = attack(duel('wobbuffet', 'machoke', { energy: ['psychic'], defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 0);
    s = attack(flips(s, false), 0, {}, 'misty');
    expect(misty(s).active!.damage).toBe(0);
  });

  it("Secrete Poison: an attack that damages Kakuna next turn Poisons the attacker and does 10 to each of its player's benched Pokémon", () => {
    let s = attack(duel('kakuna', 'machoke', { energy: ['grass', 'grass'], defenderEnergy: ['fighting', 'fighting', 'fighting'], oppBench: ['charmander'] }), 0);
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(50);
    // Poisoned, and the Poison's first 10 between the turns.
    expect([misty(s).active!.poison, misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([10, 10, 10]);
  });

  it("Harden (Metapod): attack damage of 20 or less next turn is prevented, more isn't", () => {
    const s = attack(duel('metapod', 'charmander', { energy: ['grass', 'grass'], defenderEnergy: ['fire', 'fire'] }), 0);
    expect(ash(attack(structuredClone(s), 0, {}, 'misty')).active!.damage).toBe(0);
    expect(ash(attack(structuredClone(s), 1, {}, 'misty')).active!.damage).toBe(30);
  });

  it("Slime: an attack on Wooper next turn needs heads from the attacking player to do damage", () => {
    const s = attack(duel('wooper', 'charmander', { energy: ['water'], defenderEnergy: ['fire'] }), 0);
    expect(ash(attack(flips(s, false), 0, {}, 'misty')).active!.damage).toBe(0);
    expect(ash(attack(flips(s, true), 0, {}, 'misty')).active!.damage).toBe(10);
  });

  it('Pursuit: the Defending Pokémon takes 10 when it retreats next turn', () => {
    const s = attack(duel('umbreonPursuit', 'machoke', { energy: ['fire', 'fire', 'fire'], defenderEnergy: ['fighting'], oppBench: ['charmander'] }), 1);
    expect(misty(s).active!.damage).toBe(30);
    const res = tryRetreat(s, 'misty');
    expect(res.ok && res.state.players.misty!.bench[0]!.damage).toBe(40);
  });

  it('Lock-on: next turn, tails for Electric Bolt on the same Defending Pokémon count as heads', () => {
    let s = attack(duel('magnemiteNeo', 'machoke', { energy: ['fire', 'fire'] }), 0);
    s = attack(flips(endTurn(s, 'misty'), false, false), 1);
    expect([misty(s).active!.damage, misty(s).active!.condition]).toEqual([50, 'paralyzed']);
  });

  it('Electric Bolt: without Lock-on, a tails does nothing', () => {
    const s = attack(flips(duel('magnemiteNeo', 'machoke', { energy: ['fire', 'fire'] }), true, false), 1);
    expect(misty(s).active!.damage).toBe(0);
  });

  it('Sketch: copies the attack the Defending Pokémon used last turn', () => {
    let s = endTurn(duel('smeargleNeo', 'charmander', { energy: ['fire', 'fire'], defenderEnergy: ['fire'] }), 'ash');
    s = attack(s, 0, {}, 'misty');
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(10);
  });

  it("Sketch: nothing to copy if the Defending Pokémon didn't attack", () => {
    const s = attack(duel('smeargleNeo', 'charmander', { energy: ['fire', 'fire'] }), 0);
    expect(misty(s).active!.damage).toBe(0);
  });

  it('Burst: heads then heads, 40 to Pineco, 10 to every benched Pokémon and 40 to the Defending Pokémon', () => {
    const s = attack(flips(duel('pineco', 'machoke', { energy: ['grass'], bench: ['charmander'], oppBench: ['charmander'] }), true, true), 0);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, ash(s).bench[0]!.damage]).toEqual([40, 10, 10]);
    expect(ash(s).discard.some((c) => c.defId === id('pineco'))).toBe(true);
  });

  it('Burst: heads then tails, the self and Bench damage but none to the Defending Pokémon (agreed)', () => {
    const s = attack(flips(duel('pineco', 'machoke', { energy: ['grass'], bench: ['charmander'], oppBench: ['charmander'] }), true, false), 0);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, ash(s).bench[0]!.damage]).toEqual([0, 10, 10]);
  });

  it('Burst: tails then heads, only the 40 to the Defending Pokémon', () => {
    const s = attack(flips(duel('pineco', 'machoke', { energy: ['grass'], bench: ['charmander'], oppBench: ['charmander'] }), false, true), 0);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, ash(s).active!.damage]).toEqual([40, 0, 0]);
  });

  it('Triple Poison: on heads, the Defending Pokémon takes 30 between turns', () => {
    const s = attack(flips(duel('beedrillNeo', 'machoke', { energy: ['grass'] }), true), 0);
    expect([misty(s).active!.poison, misty(s).active!.damage]).toEqual([30, 40]);
  });

  it('Plunder: discards the Trainer cards attached to the Defending Pokémon before the damage', () => {
    const s = duel('houndourDark', 'machoke', { energy: ['fire', 'fire'] });
    misty(s).active!.attached = [{ card: { uid: 'defender-1', defId: id('defender') }, until: 99 }];
    const after = attack(s, 1);
    expect([misty(after).active!.damage, misty(after).active!.attached, misty(after).discard.map((c) => c.uid)]).toEqual([20, [], ['defender-1']]);
  });

  it('Hatch: on heads, Metapod is healed and evolves with a card from the deck', () => {
    let s = duel('metapod', 'charmander', { energy: ['grass', 'grass'] });
    ash(s).active!.damage = 30;
    ash(s).deck.push({ uid: 'butterfree-1', defId: id('butterfreeNeo') });
    s = attack(flips(s, true), 1);
    expect([ash(s).active!.damage, s.pendingChoice?.kind]).toEqual([0, 'evolveFromDeck']);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'butterfree-1' });
    expect(ash(s).active!.card.defId).toBe(id('butterfreeNeo'));
  });

  it('Hatch: tails does nothing, not even the search (agreed)', () => {
    let s = duel('metapod', 'charmander', { energy: ['grass', 'grass'] });
    ash(s).active!.damage = 30;
    s = attack(flips(s, false), 1);
    expect([ash(s).active!.damage, s.pendingChoice]).toEqual([30, undefined]);
  });

  it("Shockwave: heads, 10 to each of the opponent's Pokémon and they switch; tails, nothing at all (agreed)", () => {
    const s = duel('yanma', 'squirtle', { energy: ['grass'], oppBench: ['charmander'] });
    const heads = attack(flips(s, true), 0);
    expect([misty(heads).active!.card.defId, misty(heads).active!.damage, misty(heads).bench[0]!.damage]).toEqual([id('charmander'), 10, 10]);
    const tails = attack(flips(s, false), 0);
    expect([misty(tails).active!.card.defId, misty(tails).active!.damage]).toEqual([id('squirtle'), 0]);
  });

  it('Collect Fire: a Fire Energy card from the discard pile is attached to Houndour', () => {
    const s = duel('houndourFire', 'machoke', { energy: ['fire', 'fire'] });
    ash(s).discard.push({ uid: 'fire-d', defId: 'fire' }, { uid: 'water-d', defId: 'water' });
    const after = attack(s, 1);
    expect([ash(after).active!.energy.map((e) => e.uid).includes('fire-d'), ash(after).discard.map((c) => c.uid)]).toEqual([true, ['water-d']]);
  });

  it('Trample: a flip for each benched Pokémon, both sides; 30 to it on heads', () => {
    const s = duel('tyranitar', 'machoke', { energy: ['fire', 'fire', 'fire', 'fire'], bench: ['charmander'], oppBench: ['charmander', 'squirtle'] });
    const after = attack(flips(s, true, false, true), 1);
    expect([misty(after).active!.damage, misty(after).bench[0]!.damage, misty(after).bench[1]!.damage, ash(after).bench[0]!.damage]).toEqual([50, 30, 0, 30]);
  });

  it("Belly Drum: 3 damage counters on Poliwhirl, then up to 2 basic Energy from the deck, unless that Knocked it Out", () => {
    const s = attack(duel('poliwhirl', 'charmander', { energy: ['water'] }), 0);
    expect([ash(s).active!.damage, s.pendingChoice?.source]).toEqual([30, 'Belly Drum']);
    const hurt = duel('poliwhirl', 'charmander', { energy: ['water'], bench: ['charmander'] });
    ash(hurt).active!.damage = 40;
    expect(attack(hurt, 0).pendingChoice).toBeUndefined();
  });

  it('Fury Cutter: 3 heads of 4 do 40 more', () => {
    const s = attack(flips(duel('scytherNeo', 'machoke', { energy: ['grass', 'grass'] }), true, true, true, false), 0);
    expect(misty(s).active!.damage).toBe(50);
  });

  it('False Swipe: half the remaining HP, rounded down to the nearest 10', () => {
    const s = duel('scizor', 'machoke', { energy: ['fire'] });
    misty(s).active!.damage = 10;
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Dust Devil: 10 to every non-Fighting Pokémon in play, both sides', () => {
    const s = attack(duel('pupitar', 'squirtle', { energy: ['fighting', 'fighting'], bench: ['charmander', 'machoke'], oppBench: ['charmander'] }), 1);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, ash(s).bench[0]!.damage, ash(s).bench[1]!.damage, ash(s).active!.damage]).toEqual([10, 10, 10, 0, 0]);
  });

  it("Energy Cycle: on heads, an Energy card moves from the Defending Pokémon to one of the opponent's benched Pokémon", () => {
    const s = attack(flips(duel('xatuNeo', 'squirtle', { energy: ['psychic'], defenderEnergy: ['water'], oppBench: ['charmander'] }), true), 0);
    expect([misty(s).active!.energy.length, misty(s).bench[0]!.energy.length]).toEqual([0, 1]);
  });

  it("Feint Attack: 30 to a benched Pokémon, without Weakness or Resistance", () => {
    const s = attack(duel('umbreonFeint', 'squirtle', { energy: ['fire', 'fire', 'fire'], oppBench: ['charmander'] }), 1, { oppTarget: 0 });
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([0, 30]);
  });

  it('Hyper Reverse: 10 for each Energy card on the Defending Pokémon, and that many damage counters off Butterfree', () => {
    const s = duel('butterfreeNeo', 'machoke', { energy: ['grass', 'grass', 'grass'], defenderEnergy: ['fighting', 'fighting'] });
    ash(s).active!.damage = 30;
    const after = attack(s, 1);
    expect([misty(after).active!.damage, ash(after).active!.damage]).toEqual([20, 10]);
  });

  it("Scout: shows the opponent's hand", () => {
    expect(attack(duel('sentret', 'squirtle', { energy: ['fire'] }), 0).pendingChoice?.kind).toBe('lookOppHand');
  });
});
