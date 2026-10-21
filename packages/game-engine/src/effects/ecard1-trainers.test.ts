import { describe, expect, it } from 'vitest';
import type { CardDef } from '../cards.js';
import { applyAction, type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, F } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

/** Puts the card `def` into `player`'s hand and returns its uid. */
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards[def.id] = def;
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const trainer = (id: string, name: string): CardDef => ({ id, kind: 'trainer', name, imageUrl: null, text: '' });
const play = (s: GameState, cardUid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });

const billsMaintenance = trainer('ecard1-137', "Bill's Maintenance");
const copycat = trainer('ecard1-138', 'Copycat');
const dualBall = trainer('ecard1-139', 'Dual Ball');
const removal2 = trainer('ecard1-140', 'Energy Removal 2');
const nurse = trainer('ecard1-145', 'Pokémon Nurse');
const reversal = trainer('ecard1-146', 'Pokémon Reversal');
const oaksResearch = trainer('ecard1-149', "Professor Oak's Research");
const charm = trainer('ecard1-150', 'Strength Charm');
const metal: CardDef = { id: 'ecard1-159', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal', basic: false };

describe('Expedition Trainers', () => {
  it('only one Supporter card each turn', () => {
    const s = duel('charmander', 'onix');
    const first = hand(s, 'ash', oaksResearch);
    const second = hand(s, 'ash', copycat);
    const after = play(s, first);
    expect(applyAction(after, 'ash', { type: 'PLAY_TRAINER', cardUid: second })).toEqual({ ok: false, error: 'You can play only one Supporter card each turn' });
    expect(applyAction(endTurn(endTurn(after, 'ash'), 'misty'), 'ash', { type: 'PLAY_TRAINER', cardUid: second }).ok).toBe(true);
  });

  it("Professor Oak's Research: shuffle the hand into the deck, then draw 5", () => {
    const s = duel('charmander', 'onix');
    ash(s).hand = [{ uid: 'a', defId: 'fire' }, { uid: 'b', defId: 'fire' }];
    const after = play(s, hand(s, 'ash', oaksResearch));
    expect(ash(after).hand).toHaveLength(5);
  });

  it("Bill's Maintenance: shuffle 1 other card from the hand into the deck, then draw 3; not with no other card in the hand", () => {
    const s = duel('charmander', 'onix');
    ash(s).hand = [];
    const alone = hand(s, 'ash', billsMaintenance);
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: alone })).toEqual({ ok: false, error: 'You have no other cards in your hand' });
    ash(s).hand.push({ uid: 'x', defId: 'fire' });
    const deck = ash(s).deck.length;
    const after = play(s, alone, { handUids: ['x'] });
    expect(ash(after).hand).toHaveLength(3);
    expect(ash(after).deck).toHaveLength(deck + 1 - 3);
  });

  it("Copycat: draw as many cards as the opponent has in their hand", () => {
    const s = duel('charmander', 'onix');
    misty(s).hand = misty(s).hand.slice(0, 3);
    expect(ash(play(s, hand(s, 'ash', copycat))).hand).toHaveLength(3);
  });

  it('Dual Ball: a Basic Pokémon (not a Baby) from the deck for each heads', () => {
    const s = duel('charmander', 'onix');
    const after = play(flips(s, true, true), hand(s, 'ash', dualBall));
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'basicNotBaby', count: 2 });
    expect(play(flips(s, false, false), hand(s, 'ash', dualBall)).pendingChoice).toBeUndefined();
  });

  it('Energy Removal 2: heads discards the chosen Energy card', () => {
    const s = duel('charmander', 'onix', { defenderEnergy: ['fighting'] });
    const uid = misty(s).active!.energy[0]!.uid;
    const choices = { oppTarget: 'active', oppEnergyUids: [uid] };
    expect(misty(play(flips(s, true), hand(s, 'ash', removal2), choices)).active!.energy).toEqual([]);
    expect(misty(play(flips(s, false), hand(s, 'ash', removal2), choices)).active!.energy).toHaveLength(1);
  });

  it('Pokémon Nurse: removes all damage counters from the Pokémon, then discards its Energy cards', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    ash(s).active!.damage = 30;
    const after = play(s, hand(s, 'ash', nurse), { target: 'active' });
    expect(ash(after).active!.damage).toBe(0);
    expect(ash(after).active!.energy).toEqual([]);
  });

  it("Pokémon Reversal: heads switches the chosen Benched Pokémon with the Defending Pokémon", () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    expect(misty(play(flips(s, true), hand(s, 'ash', reversal), { oppTarget: 0 })).active!.card.defId).toBe('base1-63');
    expect(misty(play(flips(s, false), hand(s, 'ash', reversal), { oppTarget: 0 })).active!.card.defId).toBe('base1-56');
  });

  it('Strength Charm: 10 more damage after Weakness and Resistance, then discarded at the end of that turn', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    const charged = play(s, hand(s, 'ash', charm), { target: 'active' });
    const after = attack(charged, 1);
    expect(misty(after).active!.damage).toBe(40);
    expect(ash(after).active!.attached ?? []).toEqual([]);
    expect(ash(after).discard.map((c) => c.defId)).toContain('ecard1-150');
  });

  it("Expedition's Metal Energy plays by the EX rules (agreed): nothing less from a non-Metal attacker", () => {
    const s = duel('charmander', 'onix');
    s.cards[metal.id] = metal;
    ash(s).active!.energy = [{ uid: 'f', defId: 'fire' }, { uid: 'm', defId: 'ecard1-159' }];
    expect(misty(attack(s, 1)).active!.damage).toBe(30);
    s.cards['base1-56'] = { ...(s.cards['base1-56'] as ReturnType<typeof mon>), weakness: { type: F, multiplier: 2 } };
    expect(misty(attack(s, 1)).active!.damage).toBe(60);
  });
});
