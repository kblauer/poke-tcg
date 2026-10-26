import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { act, attack, duel, flips, id, pokemon, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Team Rocket attacks', () => {
  it('Teleport Blast: the player may switch Dark Alakazam with a benched Pokémon, after the damage', () => {
    const s = duel('darkAlakazam', 'onix', { energy: ['psychic', 'psychic', 'psychic'], bench: ['charmander'] });
    const stays = attack(s, 0, { ownBenchSlot: -1 });
    expect([misty(stays).active!.damage, ash(stays).active!.card.defId]).toEqual([30, id('darkAlakazam')]);
    expect(ash(attack(s, 0, { ownBenchSlot: 0 })).active!.card.defId).toBe(id('charmander'));
  });

  it("Stare: 10 damage to any of the opponent's Pokémon, and its Pokémon Power stops working through their next turn", () => {
    let s = duel('darkArbok', 'onix', { energy: ['grass', 'grass'], oppBench: ['venusaur'] });
    misty(s).bench[0]!.energy = [{ uid: 'g1', defId: 'grass' }];
    s = attack(s, 0, { oppTarget: 0 });
    expect([misty(s).bench[0]!.damage, misty(s).bench[0]!.powerOffUntil]).toEqual([10, 4]);
    // Misty's turn: Energy Trans doesn't work.
    expect(applyAction(s, 'misty', { type: 'USE_POWER', source: 0, choices: { from: 0, to: 'active' } })).toMatchObject({ ok: false });
    s = act(act(s, 'misty', { type: 'END_TURN' }), 'ash', { type: 'END_TURN' });
    expect(misty(s).bench[0]!.powerOffUntil).toBeUndefined();
  });

  it('Mirror Shell: damage done to Dark Wartortle next turn is done back to the attacker, without Weakness', () => {
    let s = attack(duel('darkWartortle', 'charmander', { energy: ['water', 'water'], defenderEnergy: ['fire', 'fire'] }), 1);
    s = act(s, 'misty', { type: 'ATTACK', attackIndex: 0 });
    expect([ash(s).active!.damage, misty(s).active!.damage]).toEqual([10, 10]);
  });

  it('Knock Down: the opponent flips; tails does 20 more', () => {
    const s = duel('darkDugtrio', 'onix', { energy: ['fighting', 'fighting'] });
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(40);
    expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(20);
  });

  it('Bench Manipulation: the opponent flips a coin per benched Pokémon; 20 per tails, without Weakness', () => {
    const s = flips(duel('darkHypno', 'onix', { energy: ['psychic', 'psychic', 'psychic'], oppBench: ['squirtle', 'squirtle', 'squirtle'] }), false, true, false);
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it("Fling shuffles the opponent's Active Pokémon and its cards into their deck, and needs a benched Pokémon", () => {
    const s = duel('darkMachamp', 'onix', { energy: ['fighting', 'fighting', 'fighting', 'fire'], defenderEnergy: ['fighting'] });
    expect(tryAttack(s, 1)).toEqual({ ok: false, error: 'Your opponent has no benched Pokémon' });
    misty(s).bench[0] = pokemon('squirtle');
    const deck = misty(s).deck.length;
    const after = attack(s, 1);
    expect([misty(after).active, misty(after).deck.length, after.pendingPromotion]).toEqual([null, deck + 2, 'misty']);
  });

  it("Magnetic Lines moves a basic Energy card from the Defending Pokémon to one of the opponent's benched Pokémon", () => {
    const s = duel('darkMagneton', 'onix', { energy: ['lightning', 'lightning'], defenderEnergy: ['fighting'], oppBench: ['squirtle'] });
    const energy = misty(s).active!.energy[0]!.uid;
    const after = attack(s, 1, { defenderEnergyUid: energy, benchSlot: 0 });
    expect([misty(after).active!.damage, misty(after).active!.energy, misty(after).bench[0]!.energy.map((e) => e.uid)]).toEqual([30, [], [energy]]);
  });

  it('Continuous Fireball: a coin per Energy card, 50 per heads, and that many Energy cards are discarded (the player picks)', () => {
    let s = flips(duel('darkCharizard', 'onix', { energy: ['fire', 'fire', 'water'], oppBench: ['squirtle'] }), true, true, false);
    s = attack(s, 1);
    expect(misty(s).bench[0]).not.toBeNull();
    expect(s.log!.map((e) => e.text)).toContain('Onix took 100 damage.');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickAttached' });
    const water = ash(s).active!.energy.find((e) => e.defId === 'water')!.uid;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: water });
    // The second discard needs no choice: both cards left are Fire. Then the turn is over.
    expect([ash(s).active!.energy.map((e) => e.defId), s.pendingChoice]).toEqual([['fire'], undefined]);
  });

  it("Mass Explosion: 20 for each Koffing, Weezing and Dark Weezing in play, then 20 to each of them, even its own", () => {
    const s = duel('darkWeezing', 'koffingR', { energy: ['grass', 'fire'], bench: ['koffingR'] });
    const after = attack(s, 0);
    // Three in play: 60 to the Defending Koffing, then 20 more; 20 to each of the attacker's.
    expect([misty(after).active, ash(after).bench[0]!.damage, ash(after).active!.damage]).toEqual([null, 20, 20]);
  });

  it('Fireball needs Fire Energy cards; heads discards one of them and does 70, tails nothing', () => {
    const s = duel('darkCharmeleon', 'onix', { energy: ['fire', 'fire', 'fire'] });
    const heads = attack(flips(s, true), 1);
    expect([misty(heads).active!.damage, ash(heads).active!.energy.length]).toEqual([70, 2]);
    expect(misty(attack(flips(s, false), 1)).active!.damage).toBe(0);
  });

  it('Energy Bomb moves every Energy card to the benched Pokémon the player picks, one at a time', () => {
    let s = attack(duel('darkElectrode', 'onix', { energy: ['lightning', 'lightning'], bench: ['charmander', 'squirtle'] }), 1);
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'ownPokemon', purpose: 'attach', options: [0, 1] });
    s = act(act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 }), 'ash', { type: 'RESOLVE_CHOICE', target: 1 });
    expect([ash(s).active!.energy, ash(s).bench[0]!.energy.length, ash(s).bench[1]!.energy.length, s.currentPlayer]).toEqual([[], 1, 1, 'misty']);
  });

  it('Third Eye discards an Energy card to draw up to 3 cards', () => {
    let s = attack(duel('darkGolduck', 'onix', { energy: ['psychic'] }), 0);
    expect(ash(s).active!.energy).toEqual([]);
    const hand = ash(s).hand.length;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 2 });
    // Then the turn ends: no draw for the opponent (unlike Computer Error).
    expect([ash(s).hand.length, s.currentPlayer]).toEqual([hand + 2, 'misty']);
  });

  it("Drag Off switches in one of the opponent's benched Pokémon before doing the damage to it", () => {
    const s = attack(duel('darkMachoke', 'onix', { energy: ['fighting', 'fighting', 'fire'], oppBench: ['squirtle'] }), 0, { benchSlot: 0 });
    expect([misty(s).active!.card.defId, misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([id('squirtle'), 20, 0]);
  });

  it('Flame Pillar: discarding a Fire Energy card does 10 to a benched Pokémon too', () => {
    const s = duel('darkRapidash', 'onix', { energy: ['fire', 'fire'], oppBench: ['squirtle'] });
    const fire = ash(s).active!.energy[0]!.uid;
    const kept = attack(s, 1, { energyUids: [], benchSlot: 0 });
    expect([misty(kept).bench[0]!.damage, ash(kept).active!.energy.length]).toEqual([0, 2]);
    const discarded = attack(s, 1, { energyUids: [fire], benchSlot: 0 });
    expect([misty(discarded).bench[0]!.damage, ash(discarded).active!.energy.length]).toEqual([10, 1]);
  });

  it('Rapid Evolution evolves Magikarp with a Gyarados from the deck, even the turn it was played', () => {
    let s = duel('magikarpR', 'onix', { energy: ['water', 'water', 'water'] });
    ash(s).active!.playedTurn = 3;
    ash(s).deck.push({ uid: 'gyarados', defId: id('gyarados') });
    s = act(attack(s, 1), 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'gyarados' });
    expect([ash(s).active!.card.uid, s.currentPlayer]).toEqual(['gyarados', 'misty']);
  });

  it('Vanish shuffles Abra into the deck, discarding its cards; with no benched Pokémon its player loses', () => {
    const s = duel('abraR', 'onix', { energy: ['psychic'], bench: ['charmander'] });
    const after = attack(s, 0);
    expect([ash(after).active, ash(after).discard.length, after.pendingPromotion]).toEqual([null, 1, 'ash']);
    const lost = attack(duel('abraR', 'onix', { energy: ['psychic'] }), 0);
    expect([lost.phase, lost.winner]).toEqual(['finished', 'misty']);
  });

  it('Magnetism does 10 more for each Magnemite, Magneton and Dark Magneton on the Bench', () => {
    expect(misty(attack(duel('magnemiteR', 'onix', { energy: ['lightning', 'fire'], bench: ['magnemiteR', 'darkMagneton'] }), 1)).active!.damage).toBe(30);
  });

  it("Coin Hurl: on heads, 20 to any of the opponent's Pokémon", () => {
    const s = duel('meowthR', 'onix', { energy: ['fire', 'fire'], oppBench: ['squirtle'] });
    expect(misty(attack(flips(s, true), 0, { oppTarget: 0 })).bench[0]!.damage).toBe(20);
    expect(misty(attack(flips(s, false), 0, { oppTarget: 0 })).bench[0]!.damage).toBe(0);
  });

  it('Afternoon Nap attaches a Psychic Energy card from the deck to Slowpoke', () => {
    let s = duel('slowpokeR', 'onix', { energy: ['fire'] });
    ash(s).deck.push({ uid: 'p1', defId: 'psychic' }, { uid: 'f1', defId: 'fire' });
    // The only Psychic Energy card in the deck: attached without a question (the same-card rule).
    s = attack(s, 0);
    expect(ash(s).active!.energy.map((e) => e.uid)).toContain('p1');
    expect(ash(s).active!.energy.map((e) => e.uid)).not.toContain('f1');
  });
});
