import { describe, expect, it } from 'vitest';
import type { CardDef, CardLibrary } from '../cards.js';
import { applyAction, getPlayerView, type GameState, type InPlayPokemon } from '../index.js';
import { act, C, CARDS, duel, F, FI, flips, G, L, mon, P, settles, W } from './test-kit.js';

// Emerging Powers (README: Generation 5): its attacks, Abilities and Trainers.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

const CARD_DEFS: CardDef[] = [
  mon('bw2-2', 'Simisage', G, 90, [["Fire's Power", [C, C], 30]], { stage: 'stage1', evolvesFrom: 'Pansage' }),
  mon('bw2-7', 'Leavanny', G, 130, [['Nurturing', [C], 0]], { stage: 'stage2', evolvesFrom: 'Swadloon' }),
  mon('bw2-5', 'Sewaddle', G, 50, [['Bug Bite', [G], 10]]),
  mon('bw2-6', 'Swadloon', G, 80, [['Leaf Shield', [G], 0]], { stage: 'stage1', evolvesFrom: 'Sewaddle' }),
  mon('bw2-14', 'Lilligant', G, 90, [['Bemusing Aroma', [G], 20]], { stage: 'stage1', evolvesFrom: 'Petilil' }),
  mon('bw2-24', 'Basculin', W, 80, [['Final Gambit', [W, C, C], 80]]),
  mon('bw2-25', 'Basculin', W, 80, [['Splatter', [W, C], 0]]),
  mon('bw2-26', 'Ducklett', W, 60, [['Roost', [C], 0]]),
  mon('bw2-28', 'Cubchoo', W, 60, [['Rest', [C, C], 0]]),
  mon('bw2-37', 'Swoobat', P, 80, [['Phat Sound', [P, C], 0]], { stage: 'stage1', evolvesFrom: 'Woobat' }),
  mon('bw2-41', 'Sigilyph', P, 90, [['Telekinesis', [P, C, C], 0]]),
  mon('bw2-46', 'Gothorita', P, 70, [['Deleting Glare', [P], 0]], { stage: 'stage1', evolvesFrom: 'Gothita' }),
  mon('bw2-47', 'Gothitelle', P, 130, [['Psychic', [P, C], 30]], { stage: 'stage2', evolvesFrom: 'Gothorita', power: { name: 'Magic Room', text: '' } }),
  mon('bw2-48', 'Gothitelle', P, 130, [['Mental Shock', [P, C, C], 60]], { stage: 'stage2', evolvesFrom: 'Gothorita' }),
  mon('bw2-51', 'Boldore', FI, 90, [['Smack Down', [FI, C], 20]], { stage: 'stage1', evolvesFrom: 'Roggenrola' }),
  mon('bw2-53', 'Gigalith', FI, 150, [['Shear', [FI], 0]], { stage: 'stage2', evolvesFrom: 'Boldore' }),
  mon('bw2-59', 'Sawk', FI, 90, [['Five Fierce Chops', [FI, C], 20]]),
  mon('bw2-62', 'Krookodile', 'darkness', 140, [['Crunch', [C], 20]], { stage: 'stage2', evolvesFrom: 'Krokorok', power: { name: 'Black Eyes', text: '' } }),
  mon('bw2-65', 'Liepard', 'darkness', 80, [['Feint Attack', ['darkness'], 0]], { stage: 'stage1', evolvesFrom: 'Purrloin' }),
  mon('bw2-73', 'Ferrothorn', 'metal', 100, [['Power Whip', [C, C], 0]], { stage: 'stage1', evolvesFrom: 'Ferroseed' }),
  mon('bw2-76', 'Klinklang', 'metal', 140, [['Zap Cannon', ['metal', C, C], 80]], { stage: 'stage2', evolvesFrom: 'Klang' }),
  mon('bw2-79', 'Watchog', C, 80, [['Watcheck', [C], 0], ['Quick Tail Smash', [C, C], 20]], { stage: 'stage1', evolvesFrom: 'Patrat' }),
  mon('bw2-82', 'Unfezant', C, 130, [['Tailwind', [C], 0], ['Feather Strike', [C, C, C], 40]], { stage: 'stage2', evolvesFrom: 'Tranquill' }),
  { id: 'bwt-darkness', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' },
  { id: 'bwt-metal', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' },
  mon('bwt-mewtwo', 'Mewtwo', P, 120, [['Psychic', [P], 10]], { weakness: { type: P, multiplier: 2 }, resistance: { type: FI, amount: 20 } }),
  { id: 'bw2-90', kind: 'trainer', name: 'Bianca', imageUrl: null, text: '' },
  { id: 'bw2-91', kind: 'trainer', name: 'Cheren', imageUrl: null, text: '' },
  { id: 'bw2-93', kind: 'trainer', name: 'Great Ball', imageUrl: null, text: '' },
  { id: 'bw2-94', kind: 'trainer', name: 'Max Potion', imageUrl: null, text: '' },
  { id: 'bw1-100', kind: 'trainer', name: 'Potion', imageUrl: null, text: '' },
  { id: 'bw1-101', kind: 'trainer', name: 'Professor Juniper', imageUrl: null, text: '' },
];
const LIB: CardLibrary = { ...CARDS, ...Object.fromEntries(CARD_DEFS.map((d) => [d.id, d])) };

let n = 0;
/** A Pokémon in play (by card id) with Energy (by Energy card id: 'fire', 'water'…). */
const put = (defId: string, energy: string[] = []): InPlayPokemon => ({ card: { uid: `${defId}#${n++}`, defId }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}#${n++}`, defId: e })), playedTurn: 0 });
/** A card (by id) into a player's hand; its uid. */
const hand = (s: GameState, player: string, defId: string) => {
  const card = { uid: `${defId}#${n++}`, defId };
  s.players[player]!.hand.push(card);
  return card.uid;
};
/** Ash's `attacker` against Misty's `defender` (card ids), on Ash's turn 3. */
function game(attacker: string, defender: string, opts: { energy?: string[]; defenderEnergy?: string[]; bench?: string[]; oppBench?: string[] } = {}): GameState {
  const s = duel('charmander', 'charmander');
  s.cards = LIB;
  ash(s).hand = [];
  misty(s).hand = [];
  ash(s).active = put(attacker, opts.energy);
  misty(s).active = put(defender, opts.defenderEnergy);
  (opts.bench ?? []).forEach((d, i) => (ash(s).bench[i] = put(d)));
  (opts.oppBench ?? []).forEach((d, i) => (misty(s).bench[i] = put(d)));
  return s;
}
const attack = (s: GameState, attackIndex: number, choices = {}) => act(s, 'ash', { type: 'ATTACK', attackIndex, choices });
const play = (s: GameState, cardUid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });
const resolve = (s: GameState, player: string, answer = {}) => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('attacks', () => {
  it("Fire's Power: Burned only with a Fire Energy attached", () => {
    expect(misty(attack(flips(game('bw2-2', 'bwt-mewtwo', { energy: ['fire', 'grass'] }), false), 0)).active!.burned).toBe(true);
    expect(misty(attack(game('bw2-2', 'bwt-mewtwo', { energy: ['grass', 'grass'] }), 0)).active!.burned).toBeFalsy();
  });

  it('Nurturing: one of the player\'s Pokémon evolved from the deck', () => {
    const s = game('bw2-7', 'base1-46', { energy: ['grass'], bench: ['bw2-5'] });
    ash(s).deck.unshift({ uid: 'swadloon', defId: 'bw2-6' });
    const after = attack(s, 0, { ownTarget: 0 });
    expect(after.pendingChoice).toMatchObject({ kind: 'evolveFromDeck', target: 0 });
    expect(settles(after).length).toBeGreaterThan(0);
    expect(ash(resolve(after, 'ash', { cardUid: 'swadloon' })).bench[0]!.card.defId).toBe('bw2-6');
  });

  it('Bemusing Aroma: heads Paralyzed and Poisoned, tails Confused', () => {
    const heads = misty(attack(flips(game('bw2-14', 'base1-46', { energy: ['grass'] }), true), 0)).active!;
    expect([heads.condition, !!heads.poison]).toEqual(['paralyzed', true]);
    expect(misty(attack(flips(game('bw2-14', 'base1-46', { energy: ['grass'] }), false), 0)).active!.condition).toBe('confused');
  });

  it('Final Gambit: 80 to itself on 2 tails only', () => {
    expect(ash(attack(flips(game('bw2-24', 'bwt-mewtwo', { energy: ['water', 'water', 'water'] }), false, false), 0)).active?.damage ?? 80).toBe(80);
    expect(ash(attack(flips(game('bw2-24', 'bwt-mewtwo', { energy: ['water', 'water', 'water'] }), true, false), 0)).active!.damage).toBe(0);
  });

  it('Splatter and Telekinesis: 1 of the opponent\'s Pokémon; Telekinesis without Weakness', () => {
    expect(misty(attack(game('bw2-25', 'base1-46', { energy: ['water', 'water'], oppBench: ['base1-46'] }), 0, { oppTarget: 0 })).bench[0]!.damage).toBe(30);
    expect(misty(attack(game('bw2-41', 'bwt-mewtwo', { energy: ['psychic', 'psychic', 'psychic'] }), 0, { oppTarget: 'active' })).active!.damage).toBe(50);
  });

  it("Roost: 40 off, and it can't retreat during the player's next turn", () => {
    const s = game('bw2-26', 'base1-46', { energy: ['water'], bench: ['base1-46'] });
    ash(s).active!.damage = 50;
    let after = attack(s, 0);
    expect(ash(after).active!.damage).toBe(10);
    after = act(after, 'misty', { type: 'END_TURN' });
    expect(applyAction(after, 'ash', { type: 'RETREAT', slot: 0, energyUids: ash(after).active!.energy.map((e) => e.uid) }).ok).toBe(false);
  });

  it('Rest: 60 off, then Asleep', () => {
    const s = game('bw2-28', 'base1-46', { energy: ['water', 'water'] });
    ash(s).active!.damage = 50;
    const after = attack(flips(s, false), 0);
    expect(ash(after).active!.damage).toBe(0);
    expect(ash(after).active!.condition).toBe('asleep');
  });

  it('Phat Sound: 10 for each heads to each of the opponent\'s Pokémon', () => {
    const after = attack(flips(game('bw2-37', 'base1-46', { energy: ['psychic', 'psychic'], oppBench: ['base1-46'] }), true, true, false), 0);
    expect([misty(after).active!.damage, misty(after).bench[0]!.damage]).toEqual([20, 20]);
  });

  it('Deleting Glare: heads, the chosen Energy card off a Benched Pokémon', () => {
    const s = game('bw2-46', 'base1-46', { energy: ['psychic'], oppBench: ['base1-46'] });
    misty(s).bench[0]!.energy.push({ uid: 'w', defId: 'water' });
    const after = attack(flips(s, true), 0, { oppTarget: 0, oppEnergyUid: 'w' });
    expect(misty(after).bench[0]!.energy).toEqual([]);
    expect(misty(after).discard.map((c) => c.uid)).toContain('w');
  });

  it('Mental Shock: tails discards the chosen Energy card from the Defending Pokémon', () => {
    const s = game('bw2-48', 'bw2-82', { energy: ['psychic', 'psychic', 'psychic'], defenderEnergy: ['fire'] });
    const uid = misty(s).active!.energy[0]!.uid;
    const after = attack(flips(s, false), 0, { defenderEnergyUid: uid });
    expect(misty(after).active!.energy).toEqual([]);
    expect(misty(after).active!.condition).toBeFalsy();
  });

  it('Smack Down: 60 more against a Fighting Resistance', () => {
    expect(misty(attack(game('bw2-51', 'bwt-mewtwo', { energy: ['fighting', 'fighting'] }), 0)).active!.damage).toBe(60);
  });

  it('Shear: the Fighting Energy cards among the top 5 attached, the rest discarded', () => {
    const s = game('bw2-53', 'base1-46', { energy: ['fighting'] });
    ash(s).deck.unshift({ uid: 'f1', defId: 'fighting' }, { uid: 'x1', defId: 'base1-46' }, { uid: 'f2', defId: 'fighting' });
    const after = attack(s, 0);
    expect(ash(after).active!.energy.map((e) => e.uid)).toEqual(expect.arrayContaining(['f1', 'f2']));
    expect(ash(after).discard.map((c) => c.uid)).toContain('x1');
    expect(ash(after).discard).toHaveLength(3);
  });

  it("Five Fierce Chops: 20 for each heads; it can't attack next turn", () => {
    const after = attack(flips(game('bw2-59', 'base1-46', { energy: ['fighting', 'fighting'] }), true, true, false, false, false), 0);
    expect(misty(after).active!.damage).toBe(40);
    expect(ash(after).active!.effects?.noAttack).toBe(5);
  });

  it('Feint Attack and Power Whip: 1 of the opponent\'s Pokémon', () => {
    expect(misty(attack(game('bw2-65', 'bwt-mewtwo', { energy: ['bwt-darkness'] }), 0, { oppTarget: 'active' })).active!.damage).toBe(30);
    expect(misty(attack(game('bw2-73', 'base1-46', { energy: ['bwt-metal', 'bwt-metal', 'bwt-metal'], oppBench: ['base1-46'] }), 0, { oppTarget: 0 })).bench[0]!.damage).toBe(30);
  });

  it("Zap Cannon: tails, it can't use Zap Cannon next turn", () => {
    const after = attack(flips(game('bw2-76', 'bwt-mewtwo', { energy: ['bwt-metal', 'bwt-metal', 'bwt-metal'] }), false), 0);
    expect(ash(after).active!.effects?.amnesia).toMatchObject({ attack: 'Zap Cannon' });
  });

  it('Watcheck: the top 5 cards of the opponent\'s deck in any order', () => {
    const after = attack(game('bw2-79', 'base1-46', { energy: ['fire'] }), 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 5, deckOwner: 'misty' });
    expect(settles(after).length).toBeGreaterThan(0);
  });

  it('Quick Tail Smash: not flipping is 20; heads 80, tails nothing', () => {
    const s = game('bw2-79', 'base1-46', { energy: ['fire', 'fire'] });
    s.players.misty!.active!.card.defId = 'bwt-mewtwo';
    expect(misty(attack(s, 1, { boost: false })).active!.damage).toBe(20);
    expect(misty(attack(flips(s, true), 1, { boost: true })).active!.damage).toBe(80);
    expect(misty(attack(flips(s, false), 1, { boost: true })).active!.damage).toBe(0);
  });

  it('Tailwind: an Energy card from the hand onto any of the player\'s Pokémon. Feather Strike: heads 40 more', () => {
    const s = game('bw2-82', 'bwt-mewtwo', { energy: ['fire', 'fire', 'fire'], bench: ['base1-46'] });
    hand(s, 'ash', 'water');
    const after = attack(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'attachFromHand', anyTarget: true });
    expect(settles(after).length).toBeGreaterThan(0);
    expect(misty(attack(flips(s, true), 1)).active!.damage).toBe(80);
  });
});

describe('Abilities', () => {
  it('Magic Room: no Item cards while the opponent\'s Gothitelle is Active, Supporters still', () => {
    const s = game('base1-46', 'bw2-47');
    ash(s).active!.damage = 30;
    const potion = hand(s, 'ash', 'bw1-100');
    const juniper = hand(s, 'ash', 'bw1-101');
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: potion, choices: { target: 'active' } })).toEqual({ ok: false, error: "Magic Room: you can't play Item cards" });
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: juniper }).ok).toBe(true);
    misty(s).bench[0] = misty(s).active;
    misty(s).active = put('base1-46');
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: potion, choices: { target: 'active' } }).ok).toBe(true);
  });

  it('Black Eyes: once a turn from the Active Spot, heads discards an Energy card from the opponent\'s Active Pokémon', () => {
    const s = game('bw2-62', 'base1-46', { defenderEnergy: ['fire', 'water'], bench: ['base1-46'] });
    let after = act(flips(s, true), 'ash', { type: 'USE_POWER', source: 'active' });
    expect(after.pendingChoice).toMatchObject({ kind: 'removeEach', source: 'Black Eyes' });
    expect(settles(after).length).toBeGreaterThan(0);
    after = resolve(after, 'ash', { cardUid: misty(after).active!.energy[0]!.uid });
    expect(misty(after).active!.energy).toHaveLength(1);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active' }).ok).toBe(false);
    ash(s).bench[0] = ash(s).active;
    ash(s).active = put('base1-46');
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0 }).ok).toBe(false);
  });
});

describe('Trainers', () => {
  it('Bianca draws up to 6 cards in the hand; Cheren draws 3', () => {
    const s = game('base1-46', 'base1-46');
    const bianca = hand(s, 'ash', 'bw2-90');
    hand(s, 'ash', 'water');
    expect(ash(play(s, bianca)).hand).toHaveLength(6);
    const t = game('base1-46', 'base1-46');
    expect(ash(play(t, hand(t, 'ash', 'bw2-91'))).hand).toHaveLength(3);
  });

  it('Great Ball: a Pokémon among the top 7 cards, or none', () => {
    const s = game('base1-46', 'base1-46');
    ash(s).deck.unshift({ uid: 'mew', defId: 'bwt-mewtwo' }, { uid: 'w', defId: 'water' });
    const after = play(s, hand(s, 'ash', 'bw2-93'));
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromTop', master: true });
    const view = getPlayerView(after, 'ash').self.pendingChoice as { optional?: boolean; options: { uid: string }[] };
    expect(view.optional).toBe(true);
    expect(view.options.map((c) => c.uid)).toContain('mew');
    expect(view.options.map((c) => c.uid)).not.toContain('w');
    expect(ash(resolve(after, 'ash', { cardUid: 'mew' })).hand.map((c) => c.uid)).toEqual(['mew']);
  });

  it('Max Potion: all damage healed, then every Energy card attached discarded', () => {
    const s = game('base1-46', 'base1-46', { energy: ['fire', 'fire'] });
    ash(s).active!.damage = 40;
    const after = play(s, hand(s, 'ash', 'bw2-94'), { target: 'active' });
    expect([ash(after).active!.damage, ash(after).active!.energy.length, ash(after).discard.filter((c) => c.defId === 'fire').length]).toEqual([0, 0, 2]);
  });
});
