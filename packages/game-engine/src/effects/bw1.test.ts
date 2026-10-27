import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { matchTemplate } from './ex-templates.js';
import { act, attack, duel, endTurn, give, id, settles } from './test-kit.js';

// Black & White (README: Generation 5): its Abilities (a kind of their own, agreed), its new Trainers and attacks, and the
// shared wordings reading its text.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const use = (s: GameState, source: 'active' | number, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const play = (s: GameState, cardUid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });
/** The template a wording matched (its key), if it did. */
const keyOf = (m: ReturnType<typeof matchTemplate>) => (Array.isArray(m) ? m[0] : null);

describe('Abilities', () => {
  it('Royal Heal: 10 off each of its player\'s Pokémon between turns, even while Serperior is Asleep', () => {
    const s = duel('serperior', 'charmander', { bench: ['charmander'] });
    ash(s).active!.damage = 30;
    ash(s).active!.condition = 'asleep';
    ash(s).bench[0]!.damage = 10;
    const after = endTurn(s, 'ash');
    expect(ash(after).active!.damage).toBe(20);
    expect(ash(after).bench[0]!.damage).toBe(0);
  });

  it('Inferno Fandango: Fire Energy cards from the hand onto any Pokémon, as often as the player likes, while Paralyzed too', () => {
    const s = duel('emboar', 'charmander', { bench: ['charmander'] });
    ash(s).active!.condition = 'paralyzed';
    const [a, b] = give(s, 'ash', 'fire', 'fire');
    let after = use(s, 'active', { cardUid: a, to: 0 });
    after = use(after, 'active', { cardUid: b, to: 'active' });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual([a]);
    expect(ash(after).active!.energy.map((e) => e.uid)).toEqual([b]);
  });

  it('Shell Armor: 20 less damage from attacks, after Weakness and Resistance', () => {
    const s = duel('charmander', 'samurott', { energy: ['fire', 'fire'] });
    expect(misty(attack(s, 1)).active!.damage).toBe(10);
  });

  it('Damage Swap: may Knock Out the Pokémon the counter goes to (agreed), whose opponent takes a Prize card', () => {
    const s = duel('reuniclus', 'charmander', { bench: ['charmander', 'charmander'] });
    ash(s).bench[0]!.damage = 40;
    ash(s).bench[1]!.damage = 40;
    const prizes = misty(s).prizes.length;
    const after = use(s, 'active', { from: 0, to: 1, counters: 1 });
    expect(ash(after).bench[1]).toBeNull();
    expect(misty(after).prizes.length).toBe(prizes - 1);
  });
});

describe('attacks', () => {
  it('Do the Wave: 20 for each Benched Pokémon', () => {
    const s = duel('cinccino', 'samurott', { energy: ['fire', 'fire'], bench: ['charmander', 'charmander', 'charmander'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Revenge: 70 more after the opponent\'s attack Knocked Out one of the player\'s Pokémon during their last turn', () => {
    const s = duel('bouffalant', 'emboar', { energy: ['fire', 'fire'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    ash(s).knockedOutByAttack = s.turn - 1;
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
  });

  it('Leaf Tornado: Grass Energy moved between the player\'s Pokémon as they like, one at a time, until they stop', () => {
    const s = duel('serperior', 'samurott', { energy: ['grass', 'grass'], bench: ['charmander'] });
    let after = attack(s, 0);
    const view = getPlayerView(after, 'ash').self.pendingChoice;
    expect(view).toMatchObject({ kind: 'pickAttached', optional: true });
    expect(settles(after).length).toBeGreaterThan(0);
    const [first] = ash(after).active!.energy;
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: first!.uid });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual([first!.uid]);
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(after.pendingChoice).toBeUndefined();
  });

  it('Pickup: an Item card from the discard pile (agreed: any Trainer but a Supporter or a Stadium), not a Supporter', () => {
    const s = duel('lillipup', 'samurott', { energy: ['fire'] });
    ash(s).discard.push({ uid: 'juniper-x', defId: id('juniper') }, { uid: 'potion-x', defId: id('potionBW') }, { uid: 'switch-x', defId: id('switch') });
    const after = attack(s, 0);
    const options = (getPlayerView(after, 'ash').self.pendingChoice as { options: { uid: string }[] }).options.map((c) => c.uid);
    expect(options.sort()).toEqual(['potion-x', 'switch-x']);
  });
});

describe('Trainers', () => {
  it('PlusPower: 10 more for the turn, before Weakness, even after a switch', () => {
    const s = duel('charmander', 'charmander', { energy: ['fire'], bench: ['charmander'] });
    const [plus] = give(s, 'ash', 'plusPowerBW');
    const after = attack(play(s, plus!), 0);
    expect(misty(after).active!.damage).toBe(20);
    expect(ash(after).discard.some((c) => c.defId === id('plusPowerBW'))).toBe(true);
  });

  it('Potion: 30 off; Revive: a Basic Pokémon onto the Bench with no damage counters; Professor Juniper: a Supporter', () => {
    const s = duel('charmander', 'charmander');
    ash(s).active!.damage = 40;
    const [potion] = give(s, 'ash', 'potionBW');
    expect(ash(play(s, potion!, { target: 'active' })).active!.damage).toBe(10);
    ash(s).discard.push({ uid: 'dead', defId: id('charmander') });
    const [revive] = give(s, 'ash', 'reviveBW');
    const revived = play(s, revive!, { discardUids: ['dead'] });
    expect(ash(revived).bench.find((p) => p?.card.uid === 'dead')?.damage).toBe(0);
    const [a, b] = give(s, 'ash', 'juniper', 'juniper');
    const once = play(s, a!);
    expect(applyAction(once, 'ash', { type: 'PLAY_TRAINER', cardUid: b! }).ok).toBe(false);
  });
});

describe('the shared wordings read Black & White\'s text', () => {
  it('"this Pokémon" is the attacker, and "N more damage" the older "N damage plus N more damage"', () => {
    expect(matchTemplate('Flip a coin. If heads, this attack does 30 more damage.', 'Leavanny', 30, [])).toEqual(['flipForMore', 30, 30, 30]);
    expect(matchTemplate('Heal 20 damage from this Pokémon.', 'Maractus', 20, [])).toEqual(['heal', 20, 2]);
    expect(keyOf(matchTemplate('This Pokémon does 10 damage to itself.', 'Tepig', 30, []))).toBeTruthy();
  });

  it('a Pokémon-EX wording never matches a Pokémon-ex one, nor the other way round (agreed)', () => {
    expect(keyOf(matchTemplate('If the Defending Pokémon is a Pokémon-EX, this attack does 30 more damage.', 'Terrakion', 30, []))).toBe('pokemonEXMore');
    expect(keyOf(matchTemplate('If the Defending Pokémon is a Pokémon-ex, this attack does 40 damage plus 40 more damage.', 'Zangoose', 40, []))).not.toBe('pokemonEXMore');
  });
});
