import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { attackEffect } from './index.js';
import { act, attack, duel, endTurn, flips, give, id, pokemon, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Fossil attacks', () => {
  it('the non-holo prints share the holo effects', () => {
    expect(attackEffect('base3-17', 'Blizzard')).toBe(attackEffect('base3-2', 'Blizzard'));
    expect(attackEffect('base3-30', 'Thunderstorm')).toBe(attackEffect('base3-15', 'Thunderstorm'));
  });

  describe('damage', () => {
    it('Water Gun counts extra Water Energy only, up to 20 more damage', () => {
      expect(misty(attack(duel('lapras', 'onix', { energy: ['water', 'fire'] }), 0)).active!.damage).toBe(10);
      expect(misty(attack(duel('lapras', 'onix', { energy: ['water', 'water', 'fire', 'fire'] }), 0)).active!.damage).toBe(20);
      expect(misty(attack(duel('lapras', 'onix', { energy: ['water', 'water', 'water', 'water'] }), 0)).active!.damage).toBe(30);
      // Seadra's Colorless cost uses up one of the extras.
      expect(misty(attack(duel('seadra', 'onix', { energy: ['water', 'water', 'water'] }), 0)).active!.damage).toBe(30);
    });

    it("Sonicboom ignores Weakness", () => {
      expect(misty(attack(duel('magnetonF', 'squirtle', { energy: ['lightning', 'lightning'] }), 0)).active!.damage).toBe(20);
    });

    it('Stone Barrage flips until tails', () => {
      const s = attack(flips(duel('geodude', 'onix', { energy: ['fighting', 'fighting'] }), true, true, false), 0);
      expect(misty(s).active!.damage).toBe(20);
    });

    it('Clamp does nothing on tails, and paralyzes on heads', () => {
      const tails = attack(flips(duel('cloyster', 'onix', { energy: ['water', 'water'] }), false), 0);
      expect(misty(tails).active!.damage).toBe(0);
      const heads = attack(flips(duel('cloyster', 'onix', { energy: ['water', 'water'] }), true), 0);
      expect(misty(heads).active!.damage).toBe(30);
      expect(misty(heads).active!.condition).toBe('paralyzed');
    });

    it('Dive Bomb does nothing on tails', () => {
      const s = attack(flips(duel('moltres', 'onix', { energy: ['fire', 'fire', 'fire', 'fire'] }), false), 1);
      expect(misty(s).active!.damage).toBe(0);
    });
  });

  describe('healing', () => {
    it('Absorb heals half the damage done, rounded up to the nearest 10', () => {
      const s = duel('kabutops', 'onix', { energy: ['fighting', 'fighting', 'fighting', 'fighting'] });
      ash(s).active!.damage = 40;
      expect(ash(attack(s, 1)).active!.damage).toBe(20);
    });

    it('Leech Life heals the damage done', () => {
      const s = duel('zubat', 'onix', { energy: ['grass', 'grass'] });
      ash(s).active!.damage = 20;
      expect(ash(attack(s, 1)).active!.damage).toBe(10);
    });

    it("Spacing Out can't be used without damage counters", () => {
      expect(tryAttack(duel('slowpoke', 'onix', { energy: ['psychic'] }), 0)).toEqual({ ok: false, error: 'Slowpoke has no damage counters' });
      const s = duel('slowpoke', 'onix', { energy: ['psychic'] });
      ash(s).active!.damage = 20;
      expect(ash(attack(flips(s, true), 0)).active!.damage).toBe(10);
    });
  });

  describe('benched Pokémon', () => {
    it('Dark Mind damages the only benched Pokémon without asking', () => {
      const s = attack(duel('gengar', 'onix', { energy: ['psychic', 'psychic', 'psychic'], oppBench: ['charmander'] }), 0);
      expect(misty(s).active!.damage).toBe(30);
      expect(misty(s).bench[0]!.damage).toBe(10);
    });

    it('Defender takes 20 off damage to a benched Pokémon', () => {
      const s = duel('hitmonlee', 'onix', { energy: ['fighting', 'fighting'], oppBench: ['charmander'] });
      misty(s).bench[0]!.attached = [{ card: { uid: 'def', defId: id('defender') }, until: 4 }];
      expect(misty(attack(s, 0)).bench[0]!.damage).toBe(0);
      // Selfdestruct's damage to its own Bench too.
      const own = duel('magnetonF', 'onix', { energy: ['lightning', 'lightning', 'lightning', 'lightning'], bench: ['charmander', 'squirtle'] });
      ash(own).bench[0]!.attached = [{ card: { uid: 'def', defId: id('defender') }, until: 4 }];
      expect(ash(attack(own, 1)).bench.slice(0, 2).map((p) => p!.damage)).toEqual([0, 20]);
    });

    it("Defender takes 20 off damage an attack does to the attacker itself", () => {
      const s = flips(duel('zapdosF', 'onix', { energy: ['lightning', 'lightning', 'lightning', 'lightning'], oppBench: ['charmander', 'squirtle'] }), false, false);
      ash(s).active!.attached = [{ card: { uid: 'def', defId: id('defender') }, until: 4 }];
      // 2 tails = 20 to itself, all taken off by Defender.
      expect(ash(attack(s, 0)).active!.damage).toBe(0);
    });

    it('Stretch Kick asks which benched Pokémon when there are several', () => {
      const s = duel('hitmonlee', 'onix', { energy: ['fighting', 'fighting'], oppBench: ['charmander', 'squirtle'] });
      expect(tryAttack(s, 0)).toMatchObject({ ok: false });
      const after = attack(s, 0, { benchSlot: 1 });
      expect(misty(after).bench.slice(0, 2).map((p) => p!.damage)).toEqual([0, 20]);
    });

    it('Gigashock hits every benched Pokémon when there are 3 or fewer, and asks for 3 otherwise', () => {
      const energy = ['lightning', 'lightning', 'lightning', 'lightning'];
      const few = attack(duel('raichuF', 'onix', { energy, oppBench: ['charmander', 'squirtle'] }), 0);
      expect(misty(few).bench.slice(0, 2).map((p) => p!.damage)).toEqual([10, 10]);

      const many = duel('raichuF', 'onix', { energy, oppBench: ['charmander', 'squirtle', 'clefairy', 'gastly'] });
      expect(tryAttack(many, 0)).toMatchObject({ ok: false });
      expect(tryAttack(many, 0, { benchSlots: [0, 1] })).toMatchObject({ ok: false });
      const after = attack(many, 0, { benchSlots: [0, 1, 3] });
      expect(misty(after).bench.slice(0, 4).map((p) => p!.damage)).toEqual([10, 10, 0, 10]);
      expect(misty(after).active!.damage).toBe(30);
    });

    it('Thunderstorm flips for each benched Pokémon; Zapdos takes 10 per tails', () => {
      const s = flips(duel('zapdosF', 'onix', { energy: ['lightning', 'lightning', 'lightning', 'lightning'], oppBench: ['charmander', 'squirtle'] }), true, false);
      const after = attack(s, 0);
      expect(misty(after).bench.slice(0, 2).map((p) => p!.damage)).toEqual([20, 0]);
      expect(ash(after).active!.damage).toBe(10);
    });

    it("Blizzard hits the opponent's Bench on heads and its own on tails", () => {
      const opts = { energy: ['water', 'water', 'water', 'water'], bench: ['charmander'], oppBench: ['charmander'] };
      const heads = attack(flips(duel('articuno', 'onix', opts), true), 1);
      expect([misty(heads).bench[0]!.damage, ash(heads).bench[0]!.damage]).toEqual([10, 0]);
      const tails = attack(flips(duel('articuno', 'onix', opts), false), 1);
      expect([misty(tails).bench[0]!.damage, ash(tails).bench[0]!.damage]).toEqual([0, 10]);
    });

    it('Terror Strike switches in a benched Pokémon on heads, after the damage', () => {
      const s = attack(flips(duel('arbok', 'onix', { energy: ['grass'], oppBench: ['charmander'] }), true), 0);
      expect(s.cards[misty(s).active!.card.defId]!.name).toBe('Charmander');
      expect(misty(s).bench[0]!.damage).toBe(10);
    });
  });

  describe('lasting effects', () => {
    it('Smokescreen: the Defending Pokémon needs heads to attack next turn', () => {
      let s = attack(duel('horsea', 'charmander', { energy: ['water'], defenderEnergy: ['fire'] }), 0);
      s = attack(flips(s, false), 0, undefined, 'misty');
      expect(ash(s).active!.damage).toBe(0);
      expect(s.log!.some((l) => l.coin?.reason === 'Smokescreen')).toBe(true);
    });

    it('Minimize reduces damage by 20 during the next turn', () => {
      let s = attack(duel('grimer', 'charmander', { energy: ['grass'], defenderEnergy: ['fire', 'fire'] }), 1);
      s = attack(s, 1, undefined, 'misty');
      expect(ash(s).active!.damage).toBe(10);
      expect(ash(s).active!.effects?.minimize).toBeUndefined();
    });

    it("Headache: the opponent can't play Trainer cards, Clefairy Doll included, next turn", () => {
      const s = attack(duel('psyduck', 'onix', { energy: ['psychic'] }), 0);
      const [potion] = give(s, 'misty', 'potion');
      const [doll] = give(s, 'misty', 'doll');
      misty(s).active!.damage = 20;
      expect(applyAction(s, 'misty', { type: 'PLAY_TRAINER', cardUid: potion! })).toEqual({ ok: false, error: "You can't play Trainer cards this turn" });
      expect(applyAction(s, 'misty', { type: 'PLAY_BENCH', cardUid: doll!, slot: 0 })).toEqual({ ok: false, error: "You can't play Trainer cards this turn" });
      // It's over after that turn.
      let later = endTurn(s, 'misty');
      later = endTurn(later, 'ash');
      expect(applyAction(later, 'misty', { type: 'PLAY_BENCH', cardUid: doll!, slot: 0 }).ok).toBe(true);
    });

    it('Headache works even when the Defending Pokémon is protected by Agility or Barrier', () => {
      const s = duel('psyduck', 'onix', { energy: ['psychic'] });
      misty(s).active!.effects = { preventAll: 4 };
      expect(misty(attack(s, 0)).noTrainersUntil).toBe(4);
    });
  });

  describe('cards', () => {
    it('Wildfire discards any number of Fire Energy, and that many cards from the top of the opponent\'s deck', () => {
      const s = duel('moltres', 'onix', { energy: ['fire', 'fire', 'dce'] });
      const fires = ash(s).active!.energy.slice(0, 2).map((e) => e.uid);
      // The Fire Energy are offered; Double Colorless isn't.
      expect(tryAttack(s, 0, { energyUids: [ash(s).active!.energy[2]!.uid] })).toMatchObject({ ok: false });
      const deck = misty(s).deck.length;
      const after = attack(s, 0, { energyUids: fires });
      expect(ash(after).active!.energy.map((e) => e.defId)).toEqual([id('dce')]);
      // 2 discarded, then 1 drawn at the start of Misty's turn.
      expect(misty(after).deck.length).toBe(deck - 3);
      expect(misty(after).discard.length).toBe(2);
      // Discarding none is allowed too.
      expect(misty(attack(s, 0, { energyUids: [] })).deck.length).toBe(deck - 1);
    });

    it('Energy Conversion puts up to 2 Energy cards from the discard pile into the hand', () => {
      const s = duel('gastlyF', 'onix', { energy: ['psychic', 'psychic'] });
      ash(s).discard.push({ uid: 'd1', defId: 'fire' }, { uid: 'd2', defId: 'water' }, { uid: 'd3', defId: id('potion') });
      expect(tryAttack(s, 1)).toMatchObject({ ok: false });
      expect(tryAttack(s, 1, { discardUids: ['d3'] })).toMatchObject({ ok: false });
      const after = attack(s, 1, { discardUids: ['d1', 'd2'] });
      expect(ash(after).hand.map((c) => c.uid)).toEqual(expect.arrayContaining(['d1', 'd2']));
      expect(ash(after).discard.map((c) => c.uid)).toEqual(['d3']);
      expect(ash(after).active!.damage).toBe(10);
      expect(attack(s, 1, { discardUids: ['d2'] }).players.ash!.hand.some((c) => c.uid === 'd2')).toBe(true);
    });

    it("Energy Conversion can't be used without an Energy card in the discard pile, and takes a single one without asking", () => {
      const s = duel('gastlyF', 'onix', { energy: ['psychic', 'psychic'] });
      ash(s).discard.push({ uid: 'd3', defId: id('potion') });
      expect(tryAttack(s, 1)).toEqual({ ok: false, error: 'There are no Energy cards in your discard pile' });
      ash(s).discard.push({ uid: 'd1', defId: 'fire' });
      const after = attack(s, 1);
      expect(ash(after).hand.some((c) => c.uid === 'd1')).toBe(true);
      expect(ash(after).active!.damage).toBe(10);
    });

    it("Scavenge needs a Psychic Energy to discard", () => {
      const s = duel('slowpoke', 'onix', { energy: ['psychic', 'psychic'] });
      s.players.ash!.active!.energy[1] = { uid: 'w', defId: 'water' };
      s.players.ash!.active!.energy[0] = { uid: 'p', defId: 'psychic' };
      // Psychic-only cost [P, P] can't be paid with one Psychic, so give it a third.
      s.players.ash!.active!.energy.push({ uid: 'p2', defId: 'psychic' });
      expect(tryAttack(s, 1, { energyUids: ['w'] })).toMatchObject({ ok: false });
      expect(attack(s, 1, { energyUids: ['p'] }).players.ash!.active!.energy.map((e) => e.uid)).toEqual(['w', 'p2']);
    });

    it('Scavenge discards an Energy and takes a Trainer card from the discard pile', () => {
      const s = duel('slowpoke', 'onix', { energy: ['psychic', 'psychic'] });
      ash(s).discard.push({ uid: 't1', defId: id('potion') });
      const after = attack(s, 1);
      expect(ash(after).hand.some((c) => c.uid === 't1')).toBe(true);
      expect(ash(after).discard.map((c) => c.defId)).toEqual(['psychic']);
      expect(ash(after).active!.energy).toHaveLength(1);
    });
  });

  describe('searches after an attack', () => {
    it('Call for Family puts a Krabby from the deck onto the Bench, then the turn ends', () => {
      let s = duel('krabby', 'onix', { energy: ['water'] });
      ash(s).deck.push({ uid: 'k1', defId: id('krabby') });
      // The only option is the Krabby, so it's taken without asking (the same-card rule).
      s = attack(s, 0);
      expect(ash(s).bench[0]!.card.uid).toBe('k1');
      expect(s.currentPlayer).toBe('misty');
    });

    it("Call for Family can't be used with a full Bench", () => {
      const s = duel('krabby', 'onix', { energy: ['water'], bench: ['charmander', 'charmander', 'charmander', 'charmander', 'charmander'] });
      expect(tryAttack(s, 0)).toEqual({ ok: false, error: 'Your Bench is full' });
    });

    it("Prophecy rearranges the top 3 cards of the opponent's deck", () => {
      let s = duel('hypno', 'onix', { energy: ['psychic'] });
      misty(s).deck.splice(0, 3, pokemon('squirtle').card, pokemon('clefairy').card, pokemon('gastly').card);
      const top = misty(s).deck.slice(0, 3).map((c) => c.uid);
      expect(tryAttack(s, 0)).toMatchObject({ ok: false });
      s = attack(s, 0, { deck: 'opponent' });
      const view = getPlayerView(s, 'ash').self.pendingChoice;
      expect(view).toMatchObject({ kind: 'arrangeTop' });
      expect(view?.kind === 'arrangeTop' && view.cards.map((c) => c.uid)).toEqual(top);
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE', order: [...top].reverse() });
      // Misty drew the new top card at the start of her turn.
      expect(misty(s).hand.at(-1)!.uid).toBe(top[2]);
      expect(misty(s).deck.slice(0, 2).map((c) => c.uid)).toEqual([top[1], top[0]]);
    });
  });
});
