import { describe, expect, it } from 'vitest';
import { applyAction, type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, id, tryAttack } from './test-kit.js';

describe('Base Set attacks', () => {
  describe('energy discards', () => {
    it('Ember discards a Fire Energy without asking when they are all the same', () => {
      const s = attack(duel('charmander', 'squirtle', { energy: ['fire', 'fire'] }), 1);
      expect(s.players.ash!.active!.energy.map((e) => e.defId)).toEqual(['fire']);
      expect(s.players.ash!.discard.map((e) => e.defId)).toEqual(['fire']);
      expect(s.players.misty!.active!.damage).toBe(30);
    });

    it('Fire Spin asks which 2 Energy to discard when they differ', () => {
      const s = duel('charizard', 'squirtle', { energy: ['fire', 'fire', 'fire', 'fire', 'water'] });
      expect(tryAttack(s, 0)).toEqual({ ok: false, error: 'Choose 2 Energy to discard' });
      const water = s.players.ash!.active!.energy[4]!.uid;
      const fire = s.players.ash!.active!.energy[0]!.uid;
      const after = attack(s, 0, { energyUids: [water, fire] });
      expect(after.players.ash!.discard.map((e) => e.defId).sort()).toEqual(['fire', 'water']);
    });
  });

  describe('special conditions', () => {
    it("Paralysis stops attacking and retreating, and wears off after its owner's next turn", () => {
      let s = attack(flips(duel('squirtle', 'charmander', { energy: ['water'], oppBench: ['charmander'] }), true), 0);
      const misty = () => s.players.misty!;
      expect(misty().active!.condition).toBe('paralyzed');
      s = structuredClone(s);
      misty().active!.energy.push({ uid: 'e', defId: 'fire' });
      expect(tryAttack(s, 0, undefined, 'misty')).toEqual({ ok: false, error: 'Charmander is Paralyzed and can\'t attack' });
      expect(applyAction(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: ['e'] }).ok).toBe(false);
      s = endTurn(s, 'misty');
      expect(misty().active!.condition).toBeNull();
    });

    it('Sleep: the Pokémon wakes on heads between turns', () => {
      let s = attack(flips(duel('clefairy', 'squirtle', { energy: ['fire'] }), true, false), 0);
      // Checkup after Ash's turn: tails, still asleep.
      expect(s.players.misty!.active!.condition).toBe('asleep');
      s = flips(s, true); // Checkup after Misty's turn: heads.
      s = endTurn(s, 'misty');
      expect(s.players.misty!.active!.condition).toBeNull();
    });

    it('Poison does 10 damage after every turn; Toxic 20', () => {
      let s = attack(duel('nidoking', 'charmander', { energy: ['grass', 'grass', 'grass'] }), 1);
      // 20 from the attack + 20 Toxic at the end of the turn.
      expect(s.players.misty!.active!.damage).toBe(40);
      expect(s.players.misty!.active!.poison).toBe(20);
      s = endTurn(s, 'misty');
      expect(s.players.misty!.active).toBeNull();
    });

    it('Confusion: tails means 20 damage to itself and no attack', () => {
      const s = duel('charmander', 'squirtle', { energy: ['fire'] });
      s.players.ash!.active!.condition = 'confused';
      const after = attack(flips(s, false), 0);
      expect(after.players.ash!.active!.damage).toBe(20);
      expect(after.players.misty!.active!.damage).toBe(0);
      expect(after.currentPlayer).toBe('misty');
    });

    it('Confusion: Defender takes 20 off the damage it does to itself', () => {
      const s = duel('charmander', 'squirtle', { energy: ['fire'] });
      s.players.ash!.active!.condition = 'confused';
      s.players.ash!.active!.attached = [{ card: { uid: 'def', defId: id('defender') }, until: 4 }];
      expect(attack(flips(s, false), 0).players.ash!.active!.damage).toBe(0);
    });

    it('Confusion: retreating needs heads, and the energy is discarded either way', () => {
      const s = duel('charmander', 'squirtle', { energy: ['fire'], bench: ['charmander'] });
      s.players.ash!.active!.condition = 'confused';
      const energy = s.players.ash!.active!.energy[0]!.uid;
      const failed = act(flips(s, false), 'ash', { type: 'RETREAT', slot: 0, energyUids: [energy] });
      expect(failed.players.ash!.active!.card.uid).toBe(s.players.ash!.active!.card.uid);
      expect(failed.players.ash!.discard).toHaveLength(1);
      expect(failed.retreatedThisTurn).toBe(true);
      const worked = act(flips(s, true), 'ash', { type: 'RETREAT', slot: 0, energyUids: [energy] });
      expect(worked.players.ash!.bench[0]!.condition).toBeNull();
    });
  });

  it('Pokémon Checkup handles Poison, then Sleep, then Paralysis, across both actives', () => {
    let s = duel('charmander', 'squirtle');
    const ash = s.players.ash!.active!;
    const misty = s.players.misty!.active!;
    Object.assign(ash, { poison: 10, condition: 'paralyzed', paralyzedTurn: 2 });
    Object.assign(misty, { poison: 10, condition: 'asleep' });
    s = endTurn(flips(s, true), 'ash');
    const checkup = s.log!.map((l) => l.text);
    expect(checkup).toEqual([
      'Ended the turn.',
      'Charmander takes 10 Poison damage.',
      'Squirtle takes 10 Poison damage.',
      'Squirtle is Asleep: heads.',
      'Squirtle woke up.',
      'Charmander is no longer Paralyzed.',
      'Turn 4.',
    ]);
  });

  it('Poison KOs between turns and the owner promotes', () => {
    const s = duel('charmander', 'bulbasaur', { energy: ['fire'], oppBench: ['squirtle'] });
    s.players.misty!.active!.damage = 30;
    s.players.misty!.active!.poison = 10;
    const after = endTurn(s, 'ash');
    expect(after.players.misty!.active).toBeNull();
    expect(after.phase).toBe('promote');
    expect(after.pendingPromotion).toBe('misty');
    expect(after.players.ash!.hand.length).toBe(s.players.ash!.hand.length + 1); // prize
  });

  it('Weakness doubles Ember against a Grass Pokémon', () => {
    const s = attack(duel('charmander', 'bulbasaur', { energy: ['fire', 'fire'], oppBench: ['squirtle'] }), 1);
    expect(s.players.misty!.active).toBeNull(); // 60 damage KOs Bulbasaur (40 HP)
  });

  it('Withdraw prevents damage during the opponent\'s next turn only', () => {
    let s = attack(flips(duel('squirtle', 'charmander', { energy: ['water', 'water'], defenderEnergy: ['fire'] }), true), 1);
    s = attack(s, 0, undefined, 'misty');
    expect(s.players.ash!.active!.damage).toBe(0);
    s = endTurn(s, 'ash');
    s = attack(s, 0, undefined, 'misty');
    expect(s.players.ash!.active!.damage).toBe(10);
  });

  it('Harden prevents attacks of 30 damage or less', () => {
    let s = attack(duel('onix', 'charmander', { energy: ['fighting', 'fighting'], defenderEnergy: ['fire', 'fire'] }), 1);
    s = attack(s, 1, undefined, 'misty'); // Ember: 30
    expect(s.players.ash!.active!.damage).toBe(0);
  });

  it('Selfdestruct damages both benches and itself; the attacker wins a simultaneous win', () => {
    const s = duel('magnemite', 'squirtle', { energy: ['lightning', 'lightning'], bench: ['charmander'], oppBench: ['squirtle'] });
    s.players.ash!.prizes = s.players.ash!.prizes.slice(0, 1);
    s.players.misty!.prizes = s.players.misty!.prizes.slice(0, 1);
    const after = attack(s, 1);
    expect(after.players.ash!.bench[0]!.damage).toBe(10);
    expect(after.players.misty!.bench[0]!.damage).toBe(10);
    // Both actives are Knocked Out and both players take their last prize.
    expect(after.phase).toBe('finished');
    expect(after.winner).toBe('ash');
  });

  it('Selfdestruct knocking out both actives asks both players to promote, the next player last', () => {
    const s = duel('magnemite', 'squirtle', { energy: ['lightning', 'lightning'], bench: ['charmander'], oppBench: ['squirtle'] });
    let after = attack(s, 1);
    expect(after.pendingPromotion).toBe('ash');
    after = act(after, 'ash', { type: 'PROMOTE', slot: 0 });
    expect(after.pendingPromotion).toBe('misty');
    after = act(after, 'misty', { type: 'PROMOTE', slot: 0 });
    expect(after.phase).toBe('playing');
    expect(after.currentPlayer).toBe('misty');
  });

  it('Lure asks which benched Pokémon to switch in', () => {
    const s = duel('ninetales', 'squirtle', { energy: ['fire', 'fire'], oppBench: ['charmander', 'bulbasaur'] });
    expect(tryAttack(s, 0)).toMatchObject({ ok: false });
    const after = attack(s, 0, { benchSlot: 1 });
    expect(after.players.misty!.active!.card.defId).toBe(id('bulbasaur'));
    expect(after.players.misty!.bench[1]!.card.defId).toBe(id('squirtle'));
  });

  it('Whirlwind damages, then switches in the first benched Pokémon', () => {
    const after = attack(duel('pidgeotto', 'squirtle', { energy: ['fire', 'fire'], oppBench: ['charmander'] }), 0);
    expect(after.players.misty!.bench[0]!.damage).toBe(20);
    expect(after.players.misty!.active!.card.defId).toBe(id('charmander'));
  });

  it('Whirlpool discards the chosen Energy from the defender', () => {
    const s = duel('poliwrath', 'nidoking', { energy: ['water', 'water', 'water', 'water'], defenderEnergy: ['fire', 'water'] });
    const water = s.players.misty!.active!.energy[1]!.uid;
    const after = attack(s, 1, { defenderEnergyUid: water });
    expect(after.players.misty!.active!.energy.map((e) => e.defId)).toEqual(['fire']);
  });

  it('Water Gun counts up to 2 extra Water Energy', () => {
    const after = attack(duel('poliwrath', 'nidoking', { energy: ['water', 'water', 'water', 'water', 'water', 'fire'] }), 0);
    // Cost W W C is paid with W W + Fire, leaving 3 Water: capped at +20.
    expect(after.players.misty!.active!.damage).toBe(50);
  });

  it('Metronome copies an attack without its discard, as Colorless', () => {
    const s = duel('clefairy', 'charmander', { energy: ['water', 'water', 'water'], defenderEnergy: ['fire', 'fire'] });
    const after = attack(s, 1, { copyIndex: 1 }); // Ember
    expect(after.players.misty!.active!.damage).toBe(30);
    expect(after.players.ash!.active!.energy).toHaveLength(3);
  });

  it('Mirror Move reflects the damage taken last turn, without weakness', () => {
    let s = duel('pidgeotto', 'charmander', { energy: ['fire', 'fire', 'fire'], defenderEnergy: ['fire', 'fire'] });
    s = endTurn(s, 'ash');
    s = attack(s, 1, undefined, 'misty'); // Ember: 30 to Pidgeotto
    s = attack(s, 1);
    expect(s.players.misty!.active!.damage).toBe(30);
  });

  it('Destiny Bond knocks out the Pokémon that knocks out Gastly', () => {
    let s = duel('gastly', 'charmander', { energy: ['psychic', 'psychic'], defenderEnergy: ['fire', 'fire'], bench: ['gastly'], oppBench: ['charmander'] });
    s = attack(s, 1);
    expect(s.players.ash!.active!.energy).toHaveLength(1);
    s = attack(s, 1, undefined, 'misty');
    expect(s.players.ash!.active).toBeNull();
    expect(s.players.misty!.active).toBeNull();
  });

  it('Super Fang does half the remaining HP, rounded up to 10, ignoring weakness', () => {
    const s = duel('raticate', 'charmander', { energy: ['fire', 'fire', 'fire'] });
    s.players.misty!.active!.damage = 20; // 30 HP left
    expect(attack(s, 1).players.misty!.active!.damage).toBe(40);
  });

  it('Leek Slap can only be used once while Farfetch\'d stays in play', () => {
    let s = attack(flips(duel('farfetchd', 'nidoking', { energy: ['fire'] }), true), 0);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 0)).toEqual({ ok: false, error: "Farfetch'd has already used Leek Slap" });
  });

  it('Dream Eater needs the defender to be Asleep', () => {
    const s = duel('haunter', 'charmander', { energy: ['psychic', 'psychic'] });
    expect(tryAttack(s, 1)).toEqual({ ok: false, error: 'The Defending Pokémon must be Asleep' });
    s.players.misty!.active!.condition = 'asleep';
    expect(attack(s, 1).players.misty!.active).toBeNull();
  });

  it('Leech Seed heals 10 when it does damage', () => {
    const s = duel('bulbasaur', 'squirtle', { energy: ['grass', 'grass'] });
    s.players.ash!.active!.damage = 20;
    expect(attack(s, 0).players.ash!.active!.damage).toBe(10);
  });

  it('logs attacks, coin flips and their results', () => {
    const s = attack(flips(duel('squirtle', 'charmander', { energy: ['water'] }), true), 0);
    expect(s.log!.map((l) => l.text)).toEqual(
      expect.arrayContaining(['Squirtle used Bubble.', 'Charmander took 20 damage.', 'Coin flip: heads.', 'Charmander is now Paralyzed.']),
    );
  });
});
