import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { attackEffect } from './index.js';
import { act, attack, duel, endTurn, flips, id, pokemon, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const name = (s: GameState, p: { card: { defId: string } } | null) => (p ? s.cards[p.card.defId]!.name : null);
const C3 = ['fire', 'fire', 'fire'];

describe('Jungle attacks', () => {
  it('the non-holo prints share the holo effects', () => {
    expect(attackEffect('base2-17', 'Metronome')).toBe(attackEffect('base2-1', 'Metronome'));
    expect(attackEffect('base2-32', 'Do the Wave')).toBe(attackEffect('base2-16', 'Do the Wave'));
  });

  describe('damage', () => {
    it('Chain Lightning hits benched Pokémon of the Defending Pokémon\'s type on both sides', () => {
      const s = attack(duel('electrodeJ', 'charmander', { energy: ['lightning', 'lightning', 'lightning'], bench: ['charmander', 'squirtle'], oppBench: ['charmander', 'squirtle'] }), 1);
      expect(ash(s).bench.slice(0, 2).map((p) => p!.damage)).toEqual([10, 0]);
      expect(misty(s).bench.slice(0, 2).map((p) => p!.damage)).toEqual([10, 0]);
      // Not when the Defending Pokémon is Colorless.
      const colorless = attack(duel('electrodeJ', 'clefairy', { energy: ['lightning', 'lightning', 'lightning'], oppBench: ['clefairy'] }), 1);
      expect(misty(colorless).bench[0]!.damage).toBe(0);
    });

    it('Big Eggsplosion flips a coin per Energy, Double Colorless counting 2', () => {
      const s = attack(flips(duel('exeggutor', 'onix', { energy: ['dce', 'psychic'] }), true, true, true), 1);
      expect(misty(s).active!.damage).toBe(60);
    });

    it('Boyfriends counts each Nidoking in play; Do the Wave each benched Pokémon', () => {
      expect(misty(attack(duel('nidoqueen', 'onix', { energy: ['grass', 'fire'], bench: ['nidoking', 'nidoking'] }), 0)).active!.damage).toBe(60);
      expect(misty(attack(duel('wigglytuff', 'onix', { energy: C3, bench: ['charmander', 'charmander', 'squirtle'] }), 1)).active!.damage).toBe(40);
    });

    it("Vaporeon's Water Gun counts extra Water Energy only", () => {
      expect(misty(attack(duel('vaporeon', 'onix', { energy: ['water', 'water', 'fire', 'fire'] }), 1)).active!.damage).toBe(30);
      expect(misty(attack(duel('vaporeon', 'onix', { energy: ['water', 'water', 'water', 'water'] }), 1)).active!.damage).toBe(40);
    });

    it("Flareon's Flamethrower discards a Fire Energy card", () => {
      const s = attack(duel('flareon', 'onix', { energy: ['fire', 'fire', 'water', 'water'] }), 1);
      expect(ash(s).discard.map((c) => c.defId)).toEqual(['fire']);
    });

    it('Swords Dance makes Slash do 60 base damage on the next turn', () => {
      let s = attack(duel('scyther', 'onix', { energy: ['grass', 'fire', 'fire'] }), 0);
      s = endTurn(s, 'misty');
      expect(misty(attack(s, 1)).active!.damage).toBe(60);
    });
  });

  describe('moving Pokémon', () => {
    it('Hurricane returns the Defending Pokémon and its cards to the hand', () => {
      const s = duel('pidgeot', 'onix', { energy: C3, defenderEnergy: ['fighting'], oppBench: ['charmander'] });
      const hand = misty(s).hand.length;
      const after = attack(s, 1);
      expect(misty(after).active).toBeNull();
      expect(misty(after).hand.length).toBe(hand + 2);
      expect([after.phase, after.pendingPromotion]).toEqual(['promote', 'misty']);
    });

    it("Hurricane doesn't return a Pokémon it Knocks Out", () => {
      const s = duel('pidgeot', 'onix', { energy: C3, oppBench: ['charmander'] });
      misty(s).active!.damage = 70;
      const after = attack(s, 1);
      expect(misty(after).discard.some((c) => c.defId === id('onix'))).toBe(true);
      expect(ash(after).prizes).toHaveLength(5);
    });

    it('Teleport switches the attacker with a benched Pokémon', () => {
      const s = attack(duel('exeggutor', 'onix', { energy: ['psychic'], bench: ['charmander'] }), 0);
      expect([name(s, ash(s).active), name(s, ash(s).bench[0]!)]).toEqual(['Charmander', 'Exeggutor']);
    });

    it('Ram damages Rhydon and then switches in a benched Pokémon', () => {
      const s = attack(duel('rhydon', 'onix', { energy: ['fighting', 'fighting', 'fighting', 'fighting'], oppBench: ['charmander'] }), 1);
      expect(ash(s).active!.damage).toBe(20);
      expect(name(s, misty(s).active)).toBe('Charmander');
      expect(misty(s).bench[0]!.damage).toBe(50);
    });

    it('Ram: the opponent picks the Pokémon switched in, even when the Defending Pokémon was Knocked Out', () => {
      let s = duel('rhydon', 'charmander', { energy: ['fighting', 'fighting', 'fighting', 'fighting'], oppBench: ['squirtle', 'bulbasaur'] });
      s = act(attack(s, 1), 'misty', { type: 'RESOLVE_CHOICE', target: 1 });
      // Charmander (50 HP) took 50 and was Knocked Out on the Bench, so Bulbasaur stays Active with no promotion.
      expect([name(s, misty(s).active), misty(s).bench[1], s.phase, s.currentPlayer]).toEqual(['Bulbasaur', null, 'playing', 'misty']);
    });
  });

  describe('lasting effects', () => {
    it("Acid: on heads the Defending Pokémon can't retreat next turn", () => {
      const s = attack(flips(duel('victreebel', 'onix', { energy: ['grass', 'grass'], defenderEnergy: ['fighting'], oppBench: ['charmander'] }), true), 1);
      const energy = misty(s).active!.energy[0]!.uid;
      expect(applyAction(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: [energy] })).toEqual({ ok: false, error: "Onix can't retreat this turn" });
    });

    it("Tail Wag: on heads the Defending Pokémon can't attack Eevee next turn", () => {
      const s = attack(flips(duel('eevee', 'charmander', { energy: ['fire'], defenderEnergy: ['fire'] }), true), 0);
      expect(tryAttack(s, 0, undefined, 'misty')).toEqual({ ok: false, error: "Charmander can't attack Eevee this turn" });
    });

    it("Pounce and Snivel: the Defending Pokémon's next attack on them does 10 or 20 less", () => {
      let s = attack(duel('persian', 'charmander', { energy: C3, defenderEnergy: ['fire', 'fire'] }), 1);
      s = attack(s, 1, undefined, 'misty');
      expect(ash(s).active!.damage).toBe(20);
      let c = attack(duel('cubone', 'charmander', { energy: ['fire'], defenderEnergy: ['fire', 'fire'] }), 0);
      c = attack(c, 1, undefined, 'misty');
      expect(ash(c).active!.damage).toBe(10);
    });

    it('Petal Dance and Foul Odor Confuse the attacker after the damage', () => {
      const petal = attack(flips(duel('vileplume', 'onix', { energy: ['grass', 'grass', 'grass'] }), true, true, false), 0);
      expect(misty(petal).active!.damage).toBe(80);
      expect(ash(petal).active!.condition).toBe('confused');
      const odor = attack(duel('gloom', 'onix', { energy: ['grass', 'grass'] }), 1);
      expect([ash(odor).active!.condition, misty(odor).active!.condition]).toEqual(['confused', 'confused']);
    });
  });

  describe('cards', () => {
    it('Fetch draws a card', () => {
      const s = duel('kangaskhan', 'onix', { energy: ['fire'] });
      const hand = ash(s).hand.length;
      expect(ash(attack(s, 0)).hand.length).toBe(hand + 1);
    });

    it('Call for Friend puts a Fighting Basic Pokémon from the deck onto the Bench', () => {
      let s = duel('marowak', 'onix', { energy: ['fighting', 'fighting', 'fire'] });
      ash(s).deck.push(pokemon('onix').card, pokemon('cubone').card);
      s = attack(s, 1);
      const options = getPlayerView(s, 'ash').self.pendingChoice;
      expect(options?.kind === 'pickFromDeck' && options.options.map((c) => s.cards[c.defId]!.name)).toEqual(['Cubone', 'Onix']);
    });

    it('Call for Family (Nidoran♀) finds either Nidoran', () => {
      let s = duel('nidoranF', 'onix', { energy: ['grass', 'grass'] });
      ash(s).deck.push(pokemon('nidoranM').card, pokemon('nidoranF').card);
      s = attack(s, 1);
      const options = getPlayerView(s, 'ash').self.pendingChoice;
      expect(options?.kind === 'pickFromDeck' && options.options).toHaveLength(2);
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: options?.kind === 'pickFromDeck' ? options.options[0]!.uid : '' });
      expect(ash(s).bench[0]).not.toBeNull();
    });
  });
});
