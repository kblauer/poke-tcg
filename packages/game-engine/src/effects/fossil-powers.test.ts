import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, powerError, type GameState, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const usePower = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });
const tryPower = (s: GameState, source: Target, choices = {}, player = 'ash') => applyAction(s, player, { type: 'USE_POWER', source, choices });
const situation = (s: GameState, source: Target) => ({ me: ash(s), opp: misty(s), source, cards: s.cards, turn: s.turn });

describe('Fossil Pokémon Powers', () => {
  describe('Prehistoric Power', () => {
    it('stops both players playing Evolution cards, until Aerodactyl is Confused', () => {
      const s = endTurn(duel('aerodactyl', 'charmander'), 'ash');
      const [charmeleon] = give(s, 'misty', 'charmeleon');
      const evolve = { type: 'EVOLVE', cardUid: charmeleon!, target: 'active' } as const;
      expect(applyAction(s, 'misty', evolve)).toEqual({ ok: false, error: 'Prehistoric Power: no Evolution cards can be played' });
      ash(s).active!.condition = 'confused';
      expect(applyAction(s, 'misty', evolve).ok).toBe(true);
    });
  });

  describe('Toxic Gas', () => {
    it('stops other powers from being used', () => {
      const s = duel('blastoise', 'charmander', { oppBench: ['muk'] });
      ash(s).hand = [{ uid: 'w', defId: 'water' }];
      expect(powerError(situation(s, 'active'))).toBe("Toxic Gas: Rain Dance can't be used");
    });

    it('stops powers that react to attacks (Strikes Back)', () => {
      const s = attack(duel('charmander', 'machamp', { energy: ['fire'], bench: ['muk'] }), 0);
      expect(ash(s).active!.damage).toBe(0);
    });

    it('stops working while Muk is Asleep, Confused or Paralyzed', () => {
      const s = duel('charmander', 'machamp', { energy: ['fire'] });
      ash(s).active!.condition = null;
      misty(s).bench[0] = { ...misty(s).active!, card: { uid: 'm', defId: id('muk') }, condition: 'asleep' };
      expect(ash(attack(s, 0)).active!.damage).toBe(10);
    });
  });

  describe('Transform', () => {
    it("Ditto copies the Defending Pokémon's attacks and HP, using any Energy", () => {
      const s = attack(duel('ditto', 'charizard', { energy: ['water', 'water', 'water', 'water'] }), 0);
      expect(misty(s).active!.damage).toBe(100);
      expect(ash(s).active!.energy).toHaveLength(2);
    });

    it('stops being a copy when Confused, and is Knocked Out if its damage is more than its own HP', () => {
      const s = duel('ditto', 'charizard', { bench: ['charmander'] });
      ash(s).active!.damage = 60;
      ash(s).active!.condition = 'confused';
      const after = act(s, 'ash', { type: 'END_TURN' });
      expect(ash(after).active).toBeNull();
      expect(misty(after).prizes).toHaveLength(5);
    });

    it("copies the Defending Pokémon's power too", () => {
      const s = attack(duel('machamp', 'ditto', { energy: ['fighting', 'fighting', 'fighting', 'fighting'] }), 0);
      expect(misty(s).active!.damage).toBe(60);
      // Ditto as Machamp: Strikes Back.
      expect(ash(s).active!.damage).toBe(10);
    });

    it("doesn't work with Toxic Gas in play, or on the Bench", () => {
      const gas = endTurn(duel('charizard', 'ditto', { bench: ['muk'] }), 'ash');
      expect(misty(gas).active!.transformed).toBeUndefined();
      const benched = endTurn(duel('charizard', 'onix', { oppBench: ['ditto'] }), 'ash');
      expect(misty(benched).bench[0]!.transformed).toBeUndefined();
      const active = endTurn(duel('charizard', 'ditto'), 'ash');
      expect(misty(active).active!.transformed).toBe(id('charizard'));
    });
  });

  describe('Step In', () => {
    it('switches the benched Dragonite with the Active Pokémon, once a turn', () => {
      let s = duel('charmander', 'onix', { bench: ['dragonite'] });
      ash(s).active!.condition = 'paralyzed';
      s = usePower(s, 0);
      expect(s.cards[ash(s).active!.card.defId]!.name).toBe('Dragonite');
      expect(ash(s).bench[0]!.condition).toBeNull();
      expect(tryPower(s, 'active')).toEqual({ ok: false, error: 'Dragonite must be on your Bench' });
      // Back on the Bench the same turn, it can't Step In again.
      ash(s).active!.energy.push({ uid: 'e', defId: 'fire' });
      s = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: ['e'] });
      expect(tryPower(s, 0)).toEqual({ ok: false, error: 'Dragonite has already used Step In this turn' });
    });
  });

  describe('Curse', () => {
    it("moves a damage counter between the opponent's Pokémon, once a turn", () => {
      let s = duel('gengar', 'onix', { oppBench: ['charmander'] });
      misty(s).active!.damage = 20;
      s = usePower(s, 'active', { oppFrom: 'active', oppTo: 0 });
      expect([misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([10, 10]);
      expect(tryPower(s, 'active', { oppFrom: 'active', oppTo: 0 })).toEqual({ ok: false, error: 'Gengar has already used Curse this turn' });
    });

    it('can Knock Out the Defending Pokémon: the opponent promotes and the turn goes on', () => {
      let s = duel('gengar', 'onix', { oppBench: ['charmander', 'squirtle'] });
      misty(s).active!.damage = 80;
      misty(s).bench[0]!.damage = 10;
      s = usePower(s, 'active', { oppFrom: 0, oppTo: 'active' });
      expect(s.phase).toBe('promote');
      expect(s.pendingPromotion).toBe('misty');
      expect(ash(s).prizes).toHaveLength(5);
      s = act(s, 'misty', { type: 'PROMOTE', slot: 1 });
      expect([s.phase, s.currentPlayer, s.turn]).toEqual(['playing', 'ash', 3]);
    });

    it("can't be used without damage on the opponent's Pokémon", () => {
      expect(powerError(situation(duel('gengar', 'onix', { oppBench: ['charmander'] }), 'active'))).toBe("None of your opponent's Pokémon have damage counters");
    });
  });

  describe('Transparency', () => {
    it('heads prevents the attack; tails it hits', () => {
      expect(misty(attack(flips(duel('charmander', 'haunterF', { energy: ['fire'] }), true), 0)).active!.damage).toBe(0);
      expect(misty(attack(flips(duel('charmander', 'haunterF', { energy: ['fire'] }), false), 0)).active!.damage).toBe(10);
    });

    it("flips against its owner's attacks on the Bench too, and still works while Confused", () => {
      const s = duel('magnetonF', 'onix', { energy: ['lightning', 'lightning', 'lightning', 'lightning'], bench: ['haunterF', 'charmander'] });
      ash(s).bench[0]!.condition = 'confused';
      const after = attack(flips(s, true), 1);
      expect(ash(after).bench.slice(0, 2).map((p) => p!.damage)).toEqual([0, 20]);
    });
  });

  describe('Kabuto Armor', () => {
    it('halves the damage, rounded down to the nearest 10, after PlusPower', () => {
      const s = duel('charmander', 'kabuto', { energy: ['fire', 'fire'] });
      expect(misty(attack(s, 1)).active!.damage).toBe(10);
      ash(s).active!.attached = [{ card: { uid: 'pp', defId: id('pluspower') }, until: 3 }];
      // 30 + 10 = 40, halved to 20.
      expect(misty(attack(s, 1)).active!.damage).toBe(20);
    });
  });

  describe('Strange Behavior', () => {
    it("moves damage counters from the player's Pokémon to Slowbro, but never Knocks it Out", () => {
      let s = duel('slowbro', 'onix', { bench: ['charmander'] });
      ash(s).bench[0]!.damage = 20;
      s = usePower(s, 'active', { from: 0 });
      s = usePower(s, 'active', { from: 0 });
      expect([ash(s).active!.damage, ash(s).bench[0]!.damage]).toEqual([20, 0]);
      ash(s).active!.damage = 50;
      ash(s).bench[0]!.damage = 10;
      expect(tryPower(s, 'active', { from: 0 })).toEqual({ ok: false, error: 'That would Knock Out Slowbro' });
    });
  });

  describe('Clairvoyance', () => {
    it("shows the opponent's hand while Omanyte's power works", () => {
      const s = duel('omanyte', 'onix');
      expect(getPlayerView(s, 'ash').opponent.hand).toEqual(misty(s).hand);
      expect(getPlayerView(s, 'misty').opponent.hand).toBeUndefined();
      ash(s).active!.condition = 'asleep';
      expect(getPlayerView(s, 'ash').opponent.hand).toBeUndefined();
    });
  });

  describe('Cowardice', () => {
    it('returns Tentacool to the hand and discards its cards', () => {
      let s = duel('charmander', 'onix', { bench: ['tentacool'] });
      ash(s).bench[0]!.energy.push({ uid: 'e', defId: 'water' });
      s = usePower(s, 0);
      expect(ash(s).bench[0]).toBeNull();
      expect(ash(s).hand.some((c) => c.defId === id('tentacool'))).toBe(true);
      expect(ash(s).discard.map((c) => c.uid)).toEqual(['e']);
    });

    it("can't be used the turn Tentacool was put into play", () => {
      const s = duel('charmander', 'onix', { bench: ['tentacool'] });
      ash(s).bench[0]!.playedTurn = 3;
      expect(tryPower(s, 0)).toEqual({ ok: false, error: "Tentacool can't use Cowardice the turn it was put into play" });
    });

    it('from the active spot: a new Active Pokémon is promoted and the turn goes on', () => {
      let s = usePower(duel('tentacool', 'onix', { bench: ['charmander'] }), 'active');
      expect([s.phase, s.pendingPromotion]).toEqual(['promote', 'ash']);
      s = act(s, 'ash', { type: 'PROMOTE', slot: 0 });
      expect([s.phase, s.currentPlayer]).toEqual(['playing', 'ash']);
    });
  });
});
