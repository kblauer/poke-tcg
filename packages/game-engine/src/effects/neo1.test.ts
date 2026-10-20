import { describe, expect, it } from 'vitest';
import { applyAction, type GameState, type PowerChoices, type Target, type TrainerChoices } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (uid: string, name: string) => ({ uid, defId: id(name) });
const tryPlay = (s: GameState, player: string, name: string, choices: TrainerChoices = {}) =>
  applyAction(s, player, { type: 'PLAY_TRAINER', cardUid: give(s, player, name)[0]!, choices });
const tryRetreat = (s: GameState, player: string) =>
  applyAction(s, player, { type: 'RETREAT', slot: 0, energyUids: s.players[player]!.active!.energy.map((e) => e.uid) });
const tryPower = (s: GameState, source: Target, choices: PowerChoices) => applyAction(s, 'ash', { type: 'USE_POWER', source, choices });

describe('Neo Genesis attacks', () => {
  it('Screech: attacks that damage the Defending Pokémon do 20 more through the next turn', () => {
    let s = attack(duel('onixNeo', 'squirtle', { energy: ['fighting', 'fighting'], defenderEnergy: ['water'] }), 0);
    s = attack(endTurn(s, 'misty'), 1);
    // Rage's 10, and 20 more.
    expect(misty(s).active!.damage).toBe(30);
  });

  it("Jaw Clamp: the Defending Pokémon can't retreat and nothing can switch it out, until the end of its owner's next turn", () => {
    let s = attack(duel('croconaw', 'squirtle', { energy: ['water', 'water', 'water'], defenderEnergy: ['water'], oppBench: ['charmander'] }), 1);
    expect(misty(s).active!.damage).toBe(30);
    expect(tryRetreat(s, 'misty')).toMatchObject({ ok: false, error: expect.stringContaining("can't retreat") });
    // Its own Switch too (agreed), and Scoop Up can't take it.
    expect(tryPlay(structuredClone(s), 'misty', 'switch', { target: 0 })).toMatchObject({ ok: false, error: expect.stringContaining("can't be switched out") });
    expect(tryPlay(structuredClone(s), 'misty', 'scoopup', { target: 'active' })).toMatchObject({ ok: false });
    s = endTurn(s, 'misty');
    expect(misty(s).active!.effects?.heldBy).toBeUndefined();
  });

  it("Mean Look: no retreating while Murkrow is the Active Pokémon, but a Switch still works", () => {
    let s = attack(duel('murkrow', 'squirtle', { energy: ['darkness'], defenderEnergy: ['water'], oppBench: ['charmander'], bench: ['charmander'] }), 0);
    expect(tryRetreat(s, 'misty')).toMatchObject({ ok: false, error: "Squirtle can't retreat while Murkrow is the Active Pokémon" });
    expect(tryPlay(structuredClone(s), 'misty', 'switch', { target: 0 })).toMatchObject({ ok: true });
    // Once Murkrow is benched, it's over.
    s = endTurn(s, 'misty');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'switch')[0]!, choices: { target: 0 } });
    s = endTurn(s, 'ash');
    expect(tryRetreat(s, 'misty')).toMatchObject({ ok: true });
  });

  it('Endure: on heads, an attack that would Knock Out Phanpy next turn leaves it with 10 HP', () => {
    let s = attack(flips(duel('phanpy', 'charmander', { energy: ['fighting'], defenderEnergy: ['fire', 'fire'] }), true), 1);
    ash(s).active!.damage = 30;
    s = attack(s, 1, {}, 'misty');
    expect([ash(s).active!.card.defId, ash(s).active!.damage]).toEqual([id('phanpy'), 30]);
  });

  it("Pollen Shield: Bayleef can't become Asleep next turn", () => {
    let s = attack(duel('bayleef', 'haunter', { energy: ['grass', 'grass', 'grass'], defenderEnergy: ['psychic'] }), 1);
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.condition ?? null).toBeNull();
  });

  it('Char: heads puts a Char counter on the Defending Pokémon; its owner flips after every turn, 2 damage counters on tails', () => {
    const s = attack(flips(duel('quilava', 'machoke', { energy: ['fire', 'fire', 'fire'] }), true, false), 1);
    expect([misty(s).active!.charCounter, misty(s).active!.damage]).toEqual([true, 50]);
  });

  it("Freeze: on heads, the Defending Pokémon can't attack until it's benched or evolves", () => {
    const s = attack(flips(duel('piloswine', 'squirtle', { energy: ['water', 'water'], defenderEnergy: ['water'] }), true), 0);
    expect(tryAttack(s, 0, {}, 'misty')).toEqual({ ok: false, error: "Squirtle can't attack" });
  });

  it("Spider Web: on heads, the Defending Pokémon can't retreat", () => {
    const s = attack(flips(duel('ariados', 'squirtle', { energy: ['grass'], defenderEnergy: ['water'], oppBench: ['charmander'] }), true), 0);
    expect(tryRetreat(s, 'misty')).toEqual({ ok: false, error: "Squirtle can't retreat" });
  });

  it('Zzzap: 20 damage to each Pokémon in play with a Pokémon Power, both sides', () => {
    const s = attack(duel('pichuNeo', 'alakazam', { energy: ['lightning'], bench: ['blastoise', 'charmander'], oppBench: ['venusaur', 'charmander'] }), 0);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, misty(s).bench[1]!.damage, ash(s).bench[0]!.damage, ash(s).bench[1]!.damage, ash(s).active!.damage]).toEqual([20, 20, 0, 20, 0, 0]);
  });

  it("Sputter: every Pokémon Power stops working until the end of the attacker's next turn", () => {
    let s = duel('magby', 'squirtle', { energy: ['fire'], bench: ['alakazam'] });
    ash(s).bench[0]!.damage = 20;
    s = attack(s, 0);
    s = endTurn(s, 'misty');
    expect(tryPower(s, 0, { from: 0, to: 'active', counters: 1 })).toMatchObject({ ok: false });
    s = endTurn(endTurn(s, 'ash'), 'misty');
    expect(tryPower(s, 0, { from: 0, to: 'active', counters: 1 })).toMatchObject({ ok: true });
  });

  it("Super Metronome: on heads, copies an attack of any of the opponent's Pokémon", () => {
    const s = attack(flips(duel('togetic', 'squirtle', { energy: ['fire'], oppBench: ['raticate'] }), true), 0, { copyFrom: 0, copyIndex: 0 });
    // Raticate's Bite.
    expect(misty(s).active!.damage).toBe(20);
  });

  it('Pilfer: Aipom and its cards go into the deck, and on heads a card from the discard pile; with no Pokémon left, its player loses', () => {
    let s = flips(duel('aipom', 'squirtle', { energy: ['fire'], bench: ['charmander'] }), true);
    ash(s).discard = [card('d1', 'potion')];
    s = attack(s, 0, { discardUids: ['d1'] });
    expect(ash(s).deck.map((c) => c.uid)).toContain('d1');
    expect([ash(s).active?.card.defId ?? null, ash(s).discard.length, ash(s).deck.some((c) => c.defId === id('aipom'))]).toEqual([null, 0, true]);
    // Agreed: allowed with no Bench, and then Aipom's player has no Pokémon left.
    expect(attack(duel('aipom', 'squirtle', { energy: ['fire'] }), 0).winner).toBe('misty');
  });

  it('Static Electricity: searches for a Lightning Energy card for each Mareep in play, both players, for the attacking Mareep', () => {
    const s = attack(duel('mareep', 'mareep', { energy: ['lightning'], bench: ['mareep'] }), 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'energyType', type: 'lightning', count: 3, attachToActive: true, optional: true });
  });

  it('Elemental Blast discards a Fire, a Water and a Lightning Energy card; without all three it can\'t be used', () => {
    const s = attack(duel('lugia', 'machoke', { energy: ['fire', 'water', 'lightning', 'fire'] }), 0);
    expect([ash(s).discard.map((c) => c.defId).sort(), ash(s).active!.energy.map((e) => e.defId)]).toEqual([['fire', 'lightning', 'water'], ['fire']]);
    expect(tryAttack(duel('lugia', 'machoke', { energy: ['fire', 'water', 'water'] }), 0)).toMatchObject({ ok: false });
  });

  it("Baton Pass moves Ledian's Energy to a benched Pokémon and switches them", () => {
    const s = attack(duel('ledian', 'squirtle', { energy: ['grass', 'grass'], bench: ['charmander'] }), 0, { ownBenchSlot: 0 });
    expect([ash(s).active!.card.defId, ash(s).active!.energy.length, ash(s).bench[0]!.energy.length]).toEqual([id('charmander'), 2, 0]);
  });

  it('Fin Slap does 10 more if an attack damaged Horsea during the last turn', () => {
    let s = duel('horseaNeo', 'raticate', { energy: ['water', 'water'], defenderEnergy: ['fire'] });
    expect(misty(attack(structuredClone(s), 0)).active!.damage).toBe(20);
    s = attack(endTurn(s, 'ash'), 0, {}, 'misty');
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Riptide: 10 more for each Energy card in the discard pile, which are then shuffled into the deck', () => {
    let s = duel('feraligatrRiptide', 'machoke', { energy: ['water', 'water', 'water'] });
    ash(s).discard = [card('e1', 'water'), card('e2', 'fire'), card('t1', 'potion')];
    const deck = ash(s).deck.length;
    s = attack(s, 0);
    expect([misty(s).active!.damage, ash(s).discard.map((c) => c.uid), ash(s).deck.length]).toEqual([30, ['t1'], deck + 2]);
  });

  it('Flower Dance: 30 for each Bellossom in play', () => {
    const s = attack(duel('bellossom', 'machoke', { energy: ['grass', 'grass', 'grass'], bench: ['bellossom'] }), 1);
    expect(misty(s).active!.damage).toBe(60);
  });

  it("Growth: on heads, any Energy cards from the hand (up to 2) can be attached to Sunkern", () => {
    let s = flips(duel('sunkern', 'machoke', { energy: ['grass'] }), true);
    ash(s).hand = [card('dc', 'dce'), card('f1', 'fire'), card('p', 'potion')];
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'attachFromHand', count: 2 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'dc' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    // After the Grass Energy it already had.
    expect(ash(s).active!.energy.map((e) => e.uid).slice(1)).toEqual(['dc', 'f1']);
  });
});
