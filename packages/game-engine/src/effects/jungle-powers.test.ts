import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, inPlayDef, retreatCost, type GameState, type PokemonCardDef, type PowerChoices, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const usePower = (s: GameState, source: Target, choices: PowerChoices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const tryPower = (s: GameState, source: Target, choices: PowerChoices = {}) => applyAction(s, 'ash', { type: 'USE_POWER', source, choices });

describe('Jungle Pokémon Powers', () => {
  describe('Invisible Wall', () => {
    it('prevents attack damage of 30 or more, but not less, and stops while Mr. Mime is Confused', () => {
      expect(misty(attack(duel('charmander', 'mrMime', { energy: ['fire', 'fire'] }), 1)).active!.damage).toBe(0);
      expect(misty(attack(duel('charmander', 'mrMime', { energy: ['fire'] }), 0)).active!.damage).toBe(10);
      const confused = duel('charmander', 'mrMime', { energy: ['fire', 'fire'] });
      misty(confused).active!.condition = 'confused';
      expect(misty(attack(confused, 1)).active!.damage).toBe(30);
    });
  });

  describe('Thick Skinned', () => {
    it("Snorlax can't become Paralyzed or Poisoned", () => {
      expect(misty(attack(flips(duel('squirtle', 'snorlax', { energy: ['water'] }), true), 0)).active!.condition ?? null).toBeNull();
      expect(misty(attack(duel('nidoking', 'snorlax', { energy: ['grass', 'grass', 'grass'] }), 1)).active!.poison ?? 0).toBe(0);
    });
  });

  describe('Shift', () => {
    it("changes Venomoth's type to another Pokémon's in play, once a turn, until it leaves play", () => {
      let s = usePower(duel('venomoth', 'charmander'), 'active', { type: 'fire' });
      expect(inPlayDef(s.cards, ash(s).active!).type).toBe('fire');
      expect(tryPower(s, 'active', { type: 'fire' })).toMatchObject({ ok: false });
      s = endTurn(endTurn(s, 'ash'), 'misty');
      expect(inPlayDef(s.cards, ash(s).active!).type).toBe('fire');
      // Only types of other Pokémon in play, not Colorless.
      expect(tryPower(duel('venomoth', 'clefairy'), 'active')).toEqual({ ok: false, error: 'No other Pokémon in play has a type to change to' });
    });
  });

  describe('Heal', () => {
    it('on heads removes a damage counter; with one damaged Pokémon there is nothing to choose', () => {
      const s = duel('vileplume', 'onix');
      ash(s).active!.damage = 20;
      expect(ash(usePower(flips(s, true), 'active')).active!.damage).toBe(10);
      expect(ash(usePower(flips(s, false), 'active')).active!.damage).toBe(20);
    });

    it('with several damaged Pokémon, the player clicks one after heads', () => {
      const s = flips(duel('vileplume', 'onix', { bench: ['charmander'] }), true);
      ash(s).active!.damage = 20;
      ash(s).bench[0]!.damage = 20;
      let after = usePower(s, 'active');
      expect(getPlayerView(after, 'ash').self.pendingChoice).toMatchObject({ kind: 'ownPokemon', options: ['active', 0] });
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
      expect([ash(after).active!.damage, ash(after).bench[0]!.damage]).toEqual([20, 10]);
      expect(tryPower(after, 'active')).toEqual({ ok: false, error: 'Vileplume has already used Heal this turn' });
    });
  });

  describe('Retreat Aid', () => {
    it('each benched Dodrio takes 1 off the Active Pokémon\'s retreat cost', () => {
      const s = duel('charmander', 'onix', { bench: ['dodrio', 'dodrio'] });
      s.cards = { ...s.cards, [id('charmander')]: { ...(s.cards[id('charmander')] as PokemonCardDef), retreatCost: 3 } };
      expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(1);
      expect(retreatCost(ash(s).active!, s.cards)).toBe(3);
      ash(s).active!.energy.push({ uid: 'e', defId: 'fire' });
      const after = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: ['e'] });
      expect(after.cards[ash(after).active!.card.defId]!.name).toBe('Dodrio');
    });

    it('stops with Toxic Gas in play', () => {
      const s = duel('charmander', 'onix', { bench: ['dodrio'], oppBench: ['muk'] });
      expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(1);
    });
  });

  describe('Peek', () => {
    it("shows the top card of the opponent's deck to the player only, until their next action", () => {
      const s = usePower(duel('mankey', 'onix'), 'active', { peek: 'oppDeck' });
      expect(getPlayerView(s, 'ash').self.peek?.card.uid).toBe(misty(s).deck[0]!.uid);
      expect(getPlayerView(s, 'misty').self.peek).toBeUndefined();
      expect(s.log!.at(-1)!.text).toBe("Looked at the top card of the opponent's deck.");
      expect(getPlayerView(act(s, 'ash', { type: 'END_TURN' }), 'ash').self.peek).toBeUndefined();
    });

    it('can look at a chosen Prize card or a random card from the hand', () => {
      const s = duel('mankey', 'onix');
      expect(getPlayerView(usePower(s, 'active', { peek: 'oppPrize', prize: 2 }), 'ash').self.peek?.card.uid).toBe(misty(s).prizes[2]!.uid);
      const hand = getPlayerView(usePower(s, 'active', { peek: 'oppHand' }), 'ash').self.peek!.card;
      expect(misty(s).hand.map((c) => c.uid)).toContain(hand.uid);
      expect(tryPower(s, 'active', { peek: 'prize', prize: 9 })).toMatchObject({ ok: false });
    });
  });
});
