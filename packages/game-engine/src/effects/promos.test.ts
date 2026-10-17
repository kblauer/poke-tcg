import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { act, attack, duel, give, tryAttack } from './test-kit.js';

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

  describe('Electrode (Pokémon Web 26)', () => {
    it('Sonicboom ignores Weakness', () => {
      expect(misty(attack(duel('electrodeW', 'squirtle', { energy: ['lightning', 'lightning'] }), 0)).active!.damage).toBe(30);
    });

    it('Energy Spike finds a basic Energy, then attaches it to a Pokémon the player clicks; the turn ends after', () => {
      let s = duel('electrodeW', 'onix', { energy: ['lightning', 'lightning', 'lightning'], bench: ['charmander'] });
      ash(s).deck.push({ uid: 'f1', defId: 'fire' });
      s = attack(s, 1);
      expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: [{ uid: 'f1' }] });
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
      expect(s.currentPlayer).toBe('ash');
      expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'ownPokemon', purpose: 'attach', options: ['active', 0] });
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
      expect(ash(s).bench[0]!.energy.map((e) => e.uid)).toEqual(['f1']);
      expect(s.currentPlayer).toBe('misty');
    });

    it('Energy Spike with no basic Energy in the deck finds nothing and the turn ends', () => {
      let s = attack(duel('electrodeW', 'onix', { energy: ['lightning', 'lightning', 'lightning'] }), 1);
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
      expect([s.pendingChoice, s.currentPlayer]).toEqual([undefined, 'misty']);
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
});
