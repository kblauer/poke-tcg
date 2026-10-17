import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { act, attack, duel, flips, give, id, pokemon } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Wizards Promo Pokémon Powers', () => {
  it('Special Delivery draws a card, then puts a card from the hand on top of the deck', () => {
    let s = duel('charmander', 'onix', { bench: ['dragoniteP'] });
    ash(s).hand = [];
    const top = ash(s).deck[0]!.uid;
    s = act(s, 'ash', { type: 'USE_POWER', source: 0 });
    expect(ash(s).hand.map((c) => c.uid)).toEqual([top]);
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromHand', options: [{ uid: top }] });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: top });
    expect([ash(s).hand, ash(s).deck[0]!.uid]).toEqual([[], top]);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0 })).toEqual({ ok: false, error: 'Dragonite has already used Special Delivery this turn' });
  });

  it('Solar Power: both Active Pokémon are no longer Asleep, Confused, Paralyzed or Poisoned, but stay Burned', () => {
    let s = duel('charmander', 'onix', { bench: ['venusaurP'] });
    Object.assign(ash(s).active!, { condition: 'confused', burned: true });
    Object.assign(misty(s).active!, { condition: 'asleep', poison: 10 });
    s = act(s, 'ash', { type: 'USE_POWER', source: 0 });
    expect([ash(s).active!.condition, ash(s).active!.burned, misty(s).active!.condition, misty(s).active!.poison]).toEqual([null, true, null, 0]);
  });

  it("Bolt: on heads, an Entei damaged but not Knocked Out is shuffled into its owner's deck", () => {
    const s = duel('charmander', 'entei', { energy: ['fire'], oppBench: ['squirtle'] });
    const deck = misty(s).deck.length;
    const shuffled = attack(flips(s, true), 0);
    expect(misty(shuffled).active).toBeNull();
    expect(misty(shuffled).deck.length).toBe(deck + 1);
    expect(shuffled.pendingPromotion).toBe('misty');
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(10);
  });

  it('Join needs Unown J, O, I and N on the Bench, then takes a Pokémon card from the deck', () => {
    let s = duel('charmander', 'onix', { bench: ['unownJ', 'unownO', 'unownI'] });
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0 })).toEqual({ ok: false, error: 'You need Unown J, O, I and N on your Bench' });
    ash(s).bench[3] = pokemon('unownN');
    s = act(s, 'ash', { type: 'USE_POWER', source: 0 });
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck' });
  });

  it('Neutral Shield: attacks by Evolved Pokémon do nothing to Mew', () => {
    const s = duel('charmeleon', 'mewN', { energy: ['fire', 'fire', 'fire'] });
    ash(s).active!.evolvedFrom = [{ uid: 'base', defId: id('charmander') }];
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    ash(s).active!.evolvedFrom = [];
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it("Aurora Veil: while Articuno is Active, attacks don't affect its owner's Benched Pokémon", () => {
    const s = duel('magnetonF', 'articunoA', { energy: ['lightning', 'lightning', 'lightning', 'lightning'], oppBench: ['charmander'] });
    expect(misty(attack(s, 1)).bench[0]!.damage).toBe(0);
    // Not while Articuno is Poisoned.
    misty(s).active!.poison = 10;
    expect(misty(attack(s, 1)).bench[0]!.damage).toBe(20);
  });

  it("Guard: while Snorlax is Active, the Defending Pokémon can't retreat", () => {
    const s = duel('charmander', 'snorlaxG', { energy: ['fire'], bench: ['squirtle'] });
    const energy = ash(s).active!.energy.map((e) => e.uid);
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: energy })).toEqual({ ok: false, error: "Guard: Charmander can't retreat" });
    misty(s).active!.burned = true;
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: energy })).toMatchObject({ ok: true });
  });

  it('Pure Body: a Water Energy card from the hand attached to Suicune makes its owner discard an Energy card from it', () => {
    let s = duel('suicune', 'onix', { energy: ['fire'] });
    const [water] = give(s, 'ash', 'water');
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: water!, target: 'active' });
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickAttached', options: [{ defId: 'fire' }, { uid: water }] });
    const fire = ash(s).active!.energy[0]!.uid;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: fire });
    expect(ash(s).active!.energy.map((e) => e.uid)).toEqual([water]);
    expect(ash(s).discard.map((c) => c.uid)).toEqual([fire]);
  });

  it('Pure Body discards the only Energy straight away, and ignores other types', () => {
    let s = duel('suicune', 'onix');
    const [water, fire] = give(s, 'ash', 'water', 'fire');
    const watered = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: water!, target: 'active' });
    expect([ash(watered).active!.energy, watered.pendingChoice]).toEqual([[], undefined]);
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: fire!, target: 'active' });
    expect(ash(s).active!.energy.map((e) => e.uid)).toEqual([fire]);
  });

  it("Chain Reaction: after any Pokémon evolves, Eevee's owner may evolve it from the deck, even on the other player's turn", () => {
    let s = duel('charmander', 'onix', { oppBench: ['eeveeP'] });
    misty(s).deck.push({ uid: 'jolt', defId: id('jolteon') });
    const [charmeleon] = give(s, 'ash', 'charmeleon');
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: charmeleon!, target: 'active' });
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', optional: true, options: [{ uid: 'jolt' }] });
    expect(applyAction(s, 'ash', { type: 'END_TURN' })).toEqual({ ok: false, error: 'Waiting for your opponent to finish Chain Reaction' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'jolt' });
    expect(misty(s).bench[0]!.card.uid).toBe('jolt');
    expect([s.pendingChoice, s.currentPlayer]).toEqual([undefined, 'ash']);
  });

  it('Chain Reaction can be skipped', () => {
    let s = duel('charmander', 'onix', { oppBench: ['eeveeP'] });
    misty(s).deck.push({ uid: 'jolt', defId: id('jolteon') });
    const [charmeleon] = give(s, 'ash', 'charmeleon');
    s = act(act(s, 'ash', { type: 'EVOLVE', cardUid: charmeleon!, target: 'active' }), 'misty', { type: 'RESOLVE_CHOICE' });
    expect([misty(s).bench[0]!.card.defId, s.pendingChoice]).toEqual([id('eeveeP'), undefined]);
  });
});
