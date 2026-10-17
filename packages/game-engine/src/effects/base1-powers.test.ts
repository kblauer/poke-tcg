import { describe, expect, it } from 'vitest';
import { applyAction, energyPool, nextPowerChoice, powerTakesHandCard, type GameState, type PowerChoices, type Target } from '../index.js';
import { act, attack, duel, endTurn, id, pokemon } from './test-kit.js';

const power = (state: GameState, source: Target, choices?: PowerChoices, player = 'ash') =>
  act(state, player, { type: 'USE_POWER', source, choices });
const tryPower = (state: GameState, source: Target, choices?: PowerChoices, player = 'ash') =>
  applyAction(state, player, { type: 'USE_POWER', source, choices });

describe('Base Set Pokémon Powers', () => {
  describe('Damage Swap', () => {
    it('moves a damage counter between your Pokémon, as often as you like', () => {
      let s = duel('alakazam', 'squirtle', { bench: ['charmander', 'bulbasaur'] });
      s.players.ash!.active!.damage = 30;
      s = power(s, 'active', { from: 'active', to: 0 });
      s = power(s, 'active', { from: 'active', to: 1 });
      expect(s.players.ash!.active!.damage).toBe(10);
      expect(s.players.ash!.bench[0]!.damage).toBe(10);
      expect(s.players.ash!.bench[1]!.damage).toBe(10);
      expect(s.currentPlayer).toBe('ash');
    });

    it("can't Knock Out the Pokémon receiving the counter", () => {
      const s = duel('alakazam', 'squirtle', { bench: ['bulbasaur'] });
      s.players.ash!.active!.damage = 20;
      s.players.ash!.bench[0]!.damage = 30; // 40 HP
      expect(tryPower(s, 'active', { from: 'active', to: 0 })).toMatchObject({ ok: false });
    });

    it("doesn't work while Alakazam is Asleep, Confused or Paralyzed", () => {
      const s = duel('alakazam', 'squirtle', { bench: ['charmander'] });
      s.players.ash!.active!.damage = 20;
      s.players.ash!.active!.condition = 'confused';
      expect(tryPower(s, 'active', { from: 'active', to: 0 })).toEqual({ ok: false, error: "Alakazam is Confused and can't use Damage Swap" });
    });
  });

  describe('Rain Dance', () => {
    it("attaches Water Energy from the hand to Water Pokémon without using the turn's attachment", () => {
      let s = duel('blastoise', 'charmander', { bench: ['squirtle', 'charmander'] });
      s.players.ash!.hand = [{ uid: 'w1', defId: 'water' }, { uid: 'w2', defId: 'water' }, { uid: 'f1', defId: 'fire' }];
      s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'f1', target: 1 });
      s = power(s, 'active', { to: 'active' });
      s = power(s, 'active', { to: 0 });
      expect(s.players.ash!.active!.energy.map((e) => e.uid)).toEqual(['w1']);
      expect(s.players.ash!.bench[0]!.energy.map((e) => e.uid)).toEqual(['w2']);
      expect(s.energyAttachedThisTurn).toBe(true);
    });

    it('only attaches to Water Pokémon', () => {
      const s = duel('blastoise', 'charmander', { bench: ['charmander'] });
      s.players.ash!.hand = [{ uid: 'w1', defId: 'water' }];
      expect(tryPower(s, 'active', { to: 0 })).toEqual({ ok: false, error: 'Invalid choice: attach it to' });
    });
  });

  it('Energy Burn turns all of Charizard\'s Energy into Fire for the turn', () => {
    let s = duel('charizard', 'nidoking', { energy: ['water', 'water', 'fire', 'fire'] });
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0, choices: { energyUids: [] } }).ok).toBe(false);
    s = power(s, 'active');
    expect(energyPool(s.players.ash!.active!, s.cards)).toEqual(['fire', 'fire', 'fire', 'fire']);
    const w = s.players.ash!.active!.energy.filter((e) => e.defId === 'water').map((e) => e.uid);
    s = attack(s, 0, { energyUids: w });
    expect(s.players.misty!.active).toBeNull(); // 100 damage KOs Nidoking (90 HP)
  });

  it('Energy Burn wears off at the end of the turn', () => {
    let s = power(duel('charizard', 'nidoking', { energy: ['water'] }), 'active');
    s = endTurn(s, 'ash');
    expect(energyPool(s.players.ash!.active!, s.cards)).toEqual(['water']);
  });

  describe('Strikes Back', () => {
    it('does 10 damage to the attacker when an attack damages Machamp', () => {
      const s = attack(duel('charmander', 'machamp', { energy: ['fire'] }), 0);
      expect(s.players.ash!.active!.damage).toBe(10);
    });

    it("doesn't work if Machamp is already Paralyzed", () => {
      const s = duel('charmander', 'machamp', { energy: ['fire'] });
      s.players.misty!.active!.condition = 'paralyzed';
      expect(attack(s, 0).players.ash!.active!.damage).toBe(0);
    });
  });

  it('Energy Trans moves a Grass Energy between your Pokémon', () => {
    let s = duel('venusaur', 'charmander', { energy: ['grass', 'fire'], bench: ['bulbasaur'] });
    s = power(s, 'active', { from: 'active', to: 0 });
    expect(s.players.ash!.active!.energy.map((e) => e.defId)).toEqual(['fire']);
    expect(s.players.ash!.bench[0]!.energy.map((e) => e.defId)).toEqual(['grass']);
  });

  describe('Buzzap', () => {
    it('knocks out Electrode, gives a prize, and attaches it as 2 Energy of the chosen type', () => {
      const s = duel('charmander', 'squirtle', { bench: ['electrode'] });
      s.players.ash!.bench[0]!.energy.push({ uid: 'l1', defId: 'lightning' });
      const after = power(s, 0, { to: 'active', type: 'fire' });
      const ash = after.players.ash!;
      expect(ash.bench[0]).toBeNull();
      expect(energyPool(ash.active!, after.cards)).toEqual(['fire', 'fire']);
      expect(ash.discard.map((c) => c.uid)).toEqual(['l1']);
      expect(after.players.misty!.hand.length).toBe(s.players.misty!.hand.length + 1);
    });

    it("asks for the type, and the target when there's a choice", () => {
      const s = duel('charmander', 'squirtle', { bench: ['electrode', 'bulbasaur'] });
      const situation = { me: s.players.ash!, opp: s.players.misty!, source: 0 as Target, cards: s.cards, turn: s.turn };
      expect(nextPowerChoice(situation, {})?.prompt).toBe('Attach Electrode to');
      expect(nextPowerChoice(situation, { to: 'active' })?.prompt).toBe('Choose the type of Energy it becomes');
    });

    it('from the active spot, the player promotes and the turn goes on', () => {
      let s = duel('electrode', 'squirtle', { bench: ['charmander'] });
      s = power(s, 'active', { to: 0, type: 'fire' });
      expect(s.phase).toBe('promote');
      expect(s.pendingPromotion).toBe('ash');
      s = act(s, 'ash', { type: 'PROMOTE', slot: 0 });
      expect(s.phase).toBe('playing');
      expect(s.currentPlayer).toBe('ash');
      expect(s.turn).toBe(3);
      // The 2-energy card pays Ember's Fire + Colorless cost, and is the Fire Energy card it discards.
      s = attack(s, 1);
      expect(s.players.misty!.active!.damage).toBe(30);
      expect(s.players.ash!.discard.map((c) => c.defId)).toContain(id('electrode'));
    });

    it('pays a retreat cost of 2 with one card', () => {
      const s = duel('charmander', 'squirtle', { bench: ['electrode', 'bulbasaur'] });
      s.cards = { ...s.cards, [id('charmander')]: { ...s.cards[id('charmander')]!, retreatCost: 2 } as never };
      let after = power(s, 0, { to: 'active', type: 'water' });
      const card = after.players.ash!.active!.energy[0]!.uid;
      after = act(after, 'ash', { type: 'RETREAT', slot: 1, energyUids: [card] });
      expect(after.players.ash!.active!.card.defId).toBe(id('bulbasaur'));
    });
  });

  it('only Rain Dance takes an Energy card from the hand (so dropping energy on Charizard is a normal attachment)', () => {
    const s = duel('charizard', 'squirtle', { bench: ['blastoise'] });
    s.players.ash!.hand = [{ uid: 'f', defId: 'fire' }, { uid: 'w', defId: 'water' }];
    const situation = (source: Target) => ({ me: s.players.ash!, opp: s.players.misty!, source, cards: s.cards, turn: s.turn });
    expect(powerTakesHandCard(situation('active'), 'f')).toBe(false); // Energy Burn
    expect(powerTakesHandCard(situation(0), 'f')).toBe(false);
    expect(powerTakesHandCard(situation(0), 'w')).toBe(true); // Rain Dance
  });

  it("can't be used on the opponent's turn", () => {
    const s = duel('charmander', 'alakazam');
    s.players.misty!.active!.damage = 20;
    s.players.misty!.bench[0] = pokemon('charmander');
    expect(tryPower(s, 'active', { from: 'active', to: 0 }, 'misty')).toEqual({ ok: false, error: 'Not your turn' });
  });
});
