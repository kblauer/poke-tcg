import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, gymLeaderCpu, runCpu, type GameState } from '../index.js';
import { act, attack, duel, flips, give, id, pokemon, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Promo cards', () => {
  describe('Mewtwo (Wizards Promo 3): Energy Absorption', () => {
    it('attaches up to 2 Energy cards from the discard pile, and needs one there', () => {
      const s = duel('mewtwoP', 'onix', { energy: ['psychic'] });
      expect(tryAttack(s, 0)).toEqual({ ok: false, error: 'There are no Energy cards in your discard pile' });
      ash(s).discard.push({ uid: 'd1', defId: 'fire' }, { uid: 'd2', defId: 'water' }, { uid: 'd3', defId: 'water' });
      const after = attack(s, 0, { discardUids: ['d1', 'd2'] });
      expect(ash(after).active!.energy.map((e) => e.uid)).toEqual([expect.any(String), 'd1', 'd2']);
      expect(ash(after).discard.map((c) => c.uid)).toEqual(['d3']);
    });
  });

  describe('Jigglypuff (Wizards Promo 7)', () => {
    it('First Aid removes a damage counter; Double-Edge does 20 to itself', () => {
      const s = duel('jigglypuffP', 'onix', { energy: ['fire', 'fire', 'fire'] });
      ash(s).active!.damage = 20;
      expect(ash(attack(s, 0)).active!.damage).toBe(10);
      const edge = attack(s, 1);
      expect([misty(edge).active!.damage, ash(edge).active!.damage]).toEqual([40, 40]);
    });
  });

  describe('Super Energy Retrieval (Neo Genesis)', () => {
    it('trades 2 other cards for 4 basic Energy cards from the discard pile', () => {
      const s = duel('charmander', 'onix');
      ash(s).hand = [];
      const [ser, a, b] = give(s, 'ash', 'superer', 'potion', 'potion');
      ash(s).discard.push(...['e1', 'e2', 'e3', 'e4', 'e5'].map((uid) => ({ uid, defId: 'fire' })), { uid: 'dce', defId: 'base1-96' });
      expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: ser!, choices: { handUids: [a!, b!], discardUids: ['e1', 'e2', 'e3'] } })).toMatchObject({ ok: false });
      const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: ser!, choices: { handUids: [a!, b!], discardUids: ['e1', 'e2', 'e3', 'e4'] } });
      expect(ash(after).hand.map((c) => c.uid).sort()).toEqual(['e1', 'e2', 'e3', 'e4']);
    });

    it('takes all of them when there are fewer than 4, and needs 2 other cards', () => {
      const s = duel('charmander', 'onix');
      ash(s).hand = [];
      const [ser, a] = give(s, 'ash', 'superer', 'potion');
      ash(s).discard.push({ uid: 'e1', defId: 'fire' }, { uid: 'e2', defId: 'water' });
      expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: ser! })).toEqual({ ok: false, error: 'You need 2 other cards in your hand' });
      const [b] = give(s, 'ash', 'potion');
      const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: ser!, choices: { handUids: [a!, b!] } });
      expect(ash(after).hand.map((c) => c.uid).sort()).toEqual(['e1', 'e2']);
    });
  });

  describe('Wizards Promo attacks', () => {
    it("Growl: the Defending Pokémon's attacks on Pikachu next turn do 10 less, after Weakness", () => {
      let s = attack(duel('pikachuP1', 'onix', { energy: ['lightning'], defenderEnergy: ['fighting'] }), 0);
      // Rock Throw: 10, doubled by Weakness, then 10 less.
      s = act(s, 'misty', { type: 'ATTACK', attackIndex: 0 });
      expect(ash(s).active!.damage).toBe(10);
    });

    it('Light Screen halves the damage done to Electabuzz next turn', () => {
      let s = attack(duel('electabuzzP', 'raticate', { energy: ['lightning'], defenderEnergy: ['fire'] }), 0);
      s = act(s, 'misty', { type: 'ATTACK', attackIndex: 0 });
      expect(ash(s).active!.damage).toBe(10);
    });

    it('Baby Pokémon rule: attacking an Active Baby takes heads first; tails ends the turn', () => {
      const s = duel('charmander', 'cleffa', { energy: ['fire'] });
      const tails = attack(flips(s, false), 0);
      expect([misty(tails).active!.damage, tails.currentPlayer]).toEqual([0, 'misty']);
      expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(10);
    });

    it('Recharge attaches a Lightning Energy card from the deck to Pikachu', () => {
      let s = duel('pikachuP4', 'onix', { energy: ['lightning'] });
      ash(s).deck.push({ uid: 'w1', defId: 'water' }, { uid: 'l1', defId: 'lightning' });
      // The only Lightning Energy card in the deck: attached without a question (the same-card rule).
      s = attack(s, 0);
      expect(ash(s).active!.energy.map((e) => e.uid)).toContain('l1');
      expect(ash(s).active!.energy.map((e) => e.uid)).not.toContain('w1');
      expect(s.currentPlayer).toBe('misty');
    });

    it('Flames of Rage discards 2 Fire Energy and does 10 more for each damage counter', () => {
      const s = duel('arcanineP', 'onix', { energy: ['fire', 'fire', 'water'] });
      ash(s).active!.damage = 20;
      const after = attack(s, 1);
      expect(misty(after).active!.damage).toBe(60);
      expect(ash(after).active!.energy.map((e) => e.defId)).toEqual(['water']);
    });

    it("Devolution Beam returns an Evolved Pokémon's top card to its owner's hand and ends its Special Conditions", () => {
      const s = duel('mewP', 'onix', { energy: ['psychic', 'psychic'] });
      misty(s).active = { ...pokemon('charmeleon'), evolvedFrom: [{ uid: 'cm', defId: id('charmander') }], condition: 'asleep' };
      const after = attack(s, 1);
      expect(misty(after).active!.card.uid).toBe('cm');
      expect(misty(after).active!.condition).toBeNull();
      expect(misty(after).hand.map((c) => c.defId)).toContain(id('charmeleon'));
    });

    it("Cat Punch on tails does 20 to one of the opponent's benched Pokémon instead", () => {
      const s = attack(flips(duel('meowthP', 'onix', { energy: ['fire', 'fire'], oppBench: ['squirtle'] }), false), 0);
      expect([misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([0, 20]);
    });

    it('Cat Punch: with several benched Pokémon, the opponent picks the one that takes the 20, and then the turn ends', () => {
      let s = attack(flips(duel('meowthP', 'onix', { energy: ['fire', 'fire'], oppBench: ['squirtle', 'charmander'] }), false), 0);
      expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'ownPokemon', purpose: 'benchDamage', options: [0, 1] });
      expect(runCpu(s, 'misty', gymLeaderCpu).actions[0]).toEqual({ type: 'RESOLVE_CHOICE', target: 1 });
      s = act(s, 'misty', { type: 'RESOLVE_CHOICE', target: 1 });
      expect([misty(s).bench[0]!.damage, misty(s).bench[1]!.damage, s.currentPlayer]).toEqual([0, 20, 'misty']);
    });

    it("Energy Control moves a basic Energy card between the opponent's Pokémon on heads", () => {
      const s = flips(duel('mewtwoP12', 'onix', { energy: ['psychic'], defenderEnergy: ['fighting'], oppBench: ['squirtle'] }), true);
      const energy = misty(s).active!.energy[0]!.uid;
      const after = attack(s, 0, { oppTarget: 'active', oppEnergyUid: energy, oppTo: 0 });
      expect([misty(after).active!.energy, misty(after).bench[0]!.energy.map((e) => e.uid)]).toEqual([[], [energy]]);
    });

    it("Telekinesis does 30 to any of the opponent's Pokémon, without Weakness", () => {
      const s = duel('mewtwoP12', 'charmander', { energy: ['psychic', 'psychic', 'psychic'], oppBench: ['squirtle'] });
      expect(misty(attack(s, 1, { oppTarget: 0 })).bench[0]!.damage).toBe(30);
    });

    it("Texture Magic changes Cool Porygon's Resistance and the Defending Pokémon's Weakness", () => {
      const s = attack(duel('porygonP', 'charmander', { energy: ['fire', 'fire', 'fire'] }), 0, { type: 'fire', weaknessType: 'psychic' });
      expect([ash(s).active!.effects?.resistance, misty(s).active!.effects?.weakness]).toEqual(['fire', 'psychic']);
    });

    it("Miraculous Comeback flips a coin for each Pokémon in play: 10 per heads to the defender, 10 per tails to itself", () => {
      const s = attack(flips(duel('rocketMeowth', 'onix', { energy: ['fire'], oppBench: ['squirtle'] }), true, false, true), 0);
      expect([misty(s).active!.damage, ash(s).active!.damage]).toEqual([20, 10]);
    });

    it("Synchronize needs the same number of Energy cards on both Pokémon", () => {
      const s = duel('sabrinaAbra', 'onix', { energy: ['psychic', 'fire'] });
      expect(tryAttack(s, 1)).toMatchObject({ ok: false });
      misty(s).active!.energy = [{ uid: 'x', defId: 'water' }, { uid: 'y', defId: 'water' }];
      expect(misty(attack(s, 1)).active!.damage).toBe(40);
    });

    it('Hyper Flame discards 1 Fire Energy on heads, all Energy on tails', () => {
      const s = duel('moltresP', 'onix', { energy: ['fire', 'fire', 'fire', 'water'] });
      const heads = attack(flips(s, true), 0);
      expect([misty(heads).active!.damage, ash(heads).active!.energy.length]).toEqual([60, 3]);
      const tails = attack(flips(s, false), 0);
      expect([misty(tails).active!.damage, ash(tails).active!.energy.length]).toEqual([60, 0]);
    });

    it("Birthday Surprise: it's never your birthday", () => {
      const s = attack(duel('birthdayPikachu', 'onix', { energy: ['lightning', 'lightning'] }), 0);
      expect(misty(s).active!.damage).toBe(30);
      expect(s.log!.map((e) => e.text)).toContain("It's not your birthday, liar");
    });

    it("Marill's Water Gun counts any Energy beyond the cost, at most 20 more", () => {
      const s = duel('marill', 'onix', { energy: ['water', 'water', 'fire', 'fire', 'fire'] });
      expect(misty(attack(s, 0)).active!.damage).toBe(40);
    });

    it("Togepi's Snivel takes 20 off the Defending Pokémon's attacks on Togepi, before Weakness", () => {
      let s = attack(duel('togepi', 'raticate', { energy: ['fire'], defenderEnergy: ['fire'] }), 0);
      s = act(s, 'misty', { type: 'ATTACK', attackIndex: 0 });
      expect(ash(s).active!.damage).toBe(0);
    });

    it("Mini-Metronome copies an attack on heads, discard included, as Colorless", () => {
      const s = duel('togepi', 'charmander', { energy: ['fire', 'fire'] });
      const fire = ash(s).active!.energy[0]!.uid;
      const heads = attack(flips(s, true), 1, { copyIndex: 1, energyUids: [fire] });
      expect([misty(heads).active!.damage, ash(heads).active!.energy.length]).toEqual([30, 1]);
      const tails = attack(flips(s, false), 1, { copyIndex: 1, energyUids: [fire] });
      expect([misty(tails).active!.damage, ash(tails).active!.energy.length]).toEqual([0, 2]);
    });

    it('Paint puts a Coloring counter on the Defending Pokémon on heads: it changes type', () => {
      const s = attack(flips(duel('smeargle', 'onix', { energy: ['fire'] }), true), 0, { type: 'water' });
      expect(misty(s).active!.shiftedType).toBe('water');
    });

    it("Protective Flame: attacks can't affect the Benched Pokémon during the opponent's next turn", () => {
      let s = duel('entei', 'magnetonF', { energy: ['fire', 'fire', 'fire'], defenderEnergy: ['lightning', 'lightning', 'lightning', 'lightning'], bench: ['charmander'] });
      s = act(attack(s, 0), 'misty', { type: 'ATTACK', attackIndex: 1 });
      expect(ash(s).bench[0]!.damage).toBe(0);
    });

    it("Let's Play! puts a Baby Pokémon from the deck onto the Bench", () => {
      let s = duel('pichu', 'onix', { energy: ['fire'] });
      ash(s).deck.push({ uid: 'baby', defId: id('cleffa') }, { uid: 'baby2', defId: id('magby') });
      s = attack(s, 0);
      expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ options: [{ uid: 'baby' }, { uid: 'baby2' }] });
      expect(ash(act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'baby' })).bench[0]!.card.uid).toBe('baby');
    });

    it('Rapid Spin: the opponent switches, then the attacker switches with a benched Pokémon', () => {
      const s = attack(duel('hitmontop', 'onix', { energy: ['fighting', 'fighting', 'fire'], bench: ['charmander'], oppBench: ['squirtle'] }), 1, { ownBenchSlot: 0 });
      expect([misty(s).active!.card.defId, misty(s).bench[0]!.damage, ash(s).active!.card.defId]).toEqual([id('squirtle'), 30, id('charmander')]);
    });

    it("Pain Split puts damage counters on the Defending Pokémon, one for each on Misdreavus", () => {
      const s = duel('misdreavus', 'onix', { energy: ['psychic'] });
      ash(s).active!.damage = 30;
      expect(misty(attack(s, 0)).active!.damage).toBe(30);
    });

    it('Burning Fire discards any Fire Energy cards on your Pokémon for 10 more each', () => {
      const s = duel('magmarP', 'onix', { energy: ['fire', 'fire'], bench: ['charmander'] });
      ash(s).bench[0]!.energy = [{ uid: 'bf', defId: 'fire' }];
      const after = attack(s, 0, { energyUids: [ash(s).active!.energy[0]!.uid, 'bf'] });
      expect([misty(after).active!.damage, ash(after).active!.energy.length, ash(after).bench[0]!.energy.length]).toEqual([30, 1, 0]);
    });

    it("Slashing Strike can't be used during Scyther's next turn", () => {
      let s = attack(duel('scytherP', 'onix', { energy: ['grass', 'grass'] }), 0);
      s = act(s, 'misty', { type: 'END_TURN' });
      expect(tryAttack(s, 0)).toEqual({ ok: false, error: "Scyther can't use Slashing Strike this turn" });
    });

    it('Lightning Bolt does 20 to the Pokémon with a Lightning Rod marker, with Weakness', () => {
      let s = duel('electabuzzL', 'onix', { energy: ['lightning', 'lightning'], oppBench: ['pidgeotto'] });
      s = act(attack(s, 0, { oppTarget: 0 }), 'misty', { type: 'END_TURN' });
      expect(misty(s).bench[0]!.lightningRod).toBe(true);
      s = attack(s, 1);
      // The unmarked Defending Pokémon takes 10; Pidgeotto 20, doubled by its Lightning Weakness.
      expect([misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([10, 40]);
    });

    it("Roll Over: Snorlax falls Asleep, and on heads so does the Defending Pokémon", () => {
      // Heads for Roll Over, then tails for both Sleep checks between turns.
      const s = attack(flips(duel('snorlaxG', 'onix', { energy: ['fire', 'fire', 'fire', 'fire'] }), true, false, false), 0);
      expect([ash(s).active!.condition, misty(s).active!.condition]).toEqual(['asleep', 'asleep']);
    });
  });
});
