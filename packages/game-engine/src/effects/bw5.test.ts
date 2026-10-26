import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, getPlayerView, retreatCost, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, tryAttack, C, F, G, L, P, W, FI } from './test-kit.js';

// Dark Explorers (README: Generation 5): its attacks, Abilities and Trainers.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards = { ...s.cards, [def.id]: def, [DARK.id]: DARK };
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards = { ...s.cards, [def.id]: def };
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const ability = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const use = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });
const play = (s: GameState, cardUid: string, choices = {}, player = 'ash') => act(s, player, { type: 'PLAY_TRAINER', cardUid, choices });

const DARK: CardDef = { id: 'bw-darkness', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' };
const D = 'darkness' as const;
const flareon = mon('bw5-12', 'Flareon', F, 90, [['Sand-Attack', [C], 20], ['Fire Slash', [F, C, C], 60]], { stage: 'stage1' });
const accelgor = mon('bw5-11', 'Accelgor', G, 90, [['Hammer In', [G], 20], ['Deck and Cover', [C, C], 50]], { stage: 'stage1' });
const eelektross = mon('bw5-47', 'Eelektross', L, 140, [['Suction Heal', [L, C, C], 40], ['Slurp Shakedown', [L, L, C, C], 0]], { stage: 'stage2' });
const galvantula = mon('bw5-43', 'Galvantula', L, 80, [['Quick Turn', [L], 20], ['Electrisilk', [L, C], 30]], { stage: 'stage1' });
const yamask = mon('bw5-51', 'Yamask', P, 60, [['Astonish', [C], 10]]);
const cofagrigus = mon('bw5-52', 'Cofagrigus', P, 100, [['Chuck', [C, C], 40]], { stage: 'stage1' });
const sableye = mon('bw5-62', 'Sableye', D, 70, [['Confuse Ray', [C], 10], ['Junk Hunt', [D], 0]]);
const groudon = mon('bw5-54', 'Groudon-EX', FI, 180, [['Tromp', [FI, C], 20], ['Giant Claw', [FI, FI, C], 80]], { pokemonEX: true });
const haxorus = mon('bw5-89', 'Haxorus', C, 140, [['Guillotine', [C, C, C], 60], ['Stunning Uppercut', [C, C, C, C], 80]], { stage: 'stage2' });
const venusaur = mon('bw5-3', 'Venusaur', G, 140, [['Poison Powder', [G, G, C, C], 70]], { stage: 'stage2', ...ability('Floral Scent') });
const volcarona = mon('bw5-22', 'Volcarona', F, 110, [['Burning Wind', [F, C, C], 70]], { stage: 'stage1', ...ability('Scorching Scales') });
const slowbro = mon('bw5-24', 'Slowbro', W, 100, [['Lazy Headbutt', [W, C], 80]], { stage: 'stage1', ...ability('Airhead') });
const empoleon = mon('bw5-29', 'Empoleon', W, 140, [['Attack Command', [W], 10]], { stage: 'stage2', ...ability('Diving Draw') });
const espeon = mon('bw5-48', 'Espeon', P, 90, [['Psy Report', [P, C, C], 60]], { stage: 'stage1', ...ability('Solar Revelation') });
const aerodactyl = mon('bw5-53', 'Aerodactyl', FI, 90, [['Wing Attack', [C, C, C], 40]], { restored: true, ...ability('Ancient Scream') });
const darkrai = mon('bw5-63', 'Darkrai-EX', D, 180, [['Night Spear', [D, D, C], 90]], { pokemonEX: true, retreatCost: 2, ...ability('Dark Cloak') });
const blissey = mon('bw5-82', 'Blissey', C, 130, [['Double-Edge', [C, C, C], 90]], { stage: 'stage1', ...ability('Softboiled') });
const darkDummy = mon('test-dark', 'Scraggy', D, 100, [['Bite', [C], 20]]);

describe('Dark Explorers attacks', () => {
  it('Fire Slash: a Fire Energy discarded for 30 more, if the player says so', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', flareon, ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const more = attack(s, 1, { boost: true });
    expect(misty(more).active!.damage).toBe(90);
    expect(ash(more).active!.energy).toHaveLength(2);
    expect(misty(attack(s, 1, { boost: false })).active!.damage).toBe(60);
  });

  it('Deck and Cover: Paralyzed and Poisoned, then Accelgor and its cards are shuffled into the deck', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    const p = put(s, 'ash', 'active', accelgor, ['grass', 'grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 1);
    expect(misty(after).active!.damage).toBeGreaterThanOrEqual(50);
    expect(misty(after).active!.poison).toBeTruthy();
    expect(ash(after).active?.card.uid).not.toBe(p.card.uid);
    expect(ash(after).deck.map((c) => c.uid)).toContain(p.card.uid);
  });

  it('Slurp Shakedown: the player picks the new Defending Pokémon, which takes the 60', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', eelektross, ['lightning', 'lightning', 'lightning', 'lightning']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    const after = attack(s, 1, { benchSlot: 0 });
    expect(misty(after).active!.card.defId).toBe('big-Lapras');
    expect(misty(after).active!.damage).toBe(60);
    expect(misty(after).bench[0]!.damage).toBe(0);
  });

  it('Electrisilk: 40 more to a Defending Pokémon with no Retreat Cost', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', galvantula, ['lightning', 'lightning']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 1)).active!.damage).toBe(30);
    put(s, 'misty', 'active', big('Pidgey', { retreatCost: 0 }));
    expect(misty(attack(s, 1)).active!.damage).toBe(70);
  });

  it('Astonish: heads, a random card from the opponent\'s hand is shuffled into their deck', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', yamask, ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const [handSize, deckSize] = [misty(s).hand.length, misty(s).deck.length];
    // The opponent draws at the start of their turn: 1 card into the deck, then 1 out.
    const after = attack(flips(s, true), 0);
    expect(misty(after).hand.length).toBe(handSize);
    expect(misty(after).deck.length).toBe(deckSize);
    expect(misty(attack(flips(s, false), 0)).hand.length).toBe(handSize + 1);
  });

  it('Chuck: 40 for each Pokémon Tool card discarded from the hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', cofagrigus, ['psychic', 'psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    hand(s, 'ash', trainer('bw5-92', 'Dark Claw'));
    hand(s, 'ash', trainer('bw5-92', 'Dark Claw'));
    const after = attack(s, 0, { amount: 2 });
    expect(misty(after).active!.damage).toBe(80);
    expect(ash(after).discard.filter((c) => c.defId === 'bw5-92')).toHaveLength(2);
  });

  it('Junk Hunt: only Item cards from the discard pile (agreed: not a Supporter)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', sableye, [DARK.id]);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).discard.push({ uid: 'potion-x', defId: id('potionBW') }, { uid: 'juniper-x', defId: id('juniper') }, { uid: 'switch-x', defId: id('switch') });
    const after = attack(s, 1);
    const options = (getPlayerView(after, 'ash').self.pendingChoice as { options: { uid: string }[] }).options.map((c) => c.uid);
    expect(options.sort()).toEqual(['potion-x', 'switch-x']);
    expect(settles(after).length).toBeGreaterThan(0);
  });

  it('Giant Claw: 40 more to a Defending Pokémon with 2 or more damage counters', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', groudon, ['fighting', 'fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax')).damage = 20;
    expect(misty(attack(s, 1)).active!.damage).toBe(140);
  });

  it('Stunning Uppercut: 2 heads Paralyze, 2 tails do nothing', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', haxorus, ['fire', 'fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const heads = attack(flips(s, true, true), 1);
    expect(misty(heads).active!.damage).toBe(80);
    expect(misty(heads).active!.condition).toBe('paralyzed');
    expect(misty(attack(flips(s, false, false), 1)).active!.damage).toBe(0);
  });
});

describe('Dark Explorers Abilities', () => {
  it('Floral Scent: a Pokémon from the deck, once a turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', venusaur);
    put(s, 'misty', 'active', big('Snorlax'));
    // A deck of identical cards answers the search itself (the same-card rule).
    const size = ash(s).hand.length;
    const after = use(s, 'active');
    expect(ash(after).hand.length).toBe(size + 1);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });

  it('Diving Draw: a card discarded, 2 drawn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', empoleon);
    const size = ash(s).hand.length;
    const after = use(s, 'active', { cardUid: ash(s).hand[0]!.uid });
    expect(ash(after).hand.length).toBe(size + 1);
    expect(ash(after).discard).toHaveLength(1);
  });

  it('Airhead: no attacks with 2, 4 or 6 Prize cards left', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', slowbro, ['water', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(tryAttack(s, 0).ok).toBe(false);
    ash(s).prizes = ash(s).prizes.slice(0, 3);
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it('Scorching Scales: 4 damage counters for the opponent\'s Burned Pokémon, not the player\'s', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, volcarona);
    put(s, 'misty', 'active', big('Snorlax')).burned = true;
    put(s, 'ash', 'active', big('Lapras')).burned = true;
    const after = endTurn(s, 'ash');
    expect(misty(after).active!.damage).toBe(40);
    expect(ash(after).active!.damage).toBe(20);
  });

  it('Ancient Scream: 10 more for each Aerodactyl, before Weakness and Resistance', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'ash', 0, aerodactyl);
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    put(s, 'ash', 1, aerodactyl);
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Dark Cloak: no Retreat Cost with any Darkness Energy attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, darkrai);
    const p = put(s, 'ash', 'active', big('Snorlax'));
    expect(retreatCost(p, s.cards, [ash(s), misty(s)], null)).toBe(1);
    p.energy.push({ uid: 'd1', defId: DARK.id });
    expect(retreatCost(p, s.cards, [ash(s), misty(s)], null)).toBeLessThanOrEqual(0);
  });

  it('Solar Revelation: nothing but damage to the opponent\'s Pokémon with Energy attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', haxorus, ['fire', 'fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'), ['psychic']);
    put(s, 'misty', 0, espeon);
    const after = attack(flips(s, true, true), 1);
    expect(misty(after).active!.damage).toBe(80);
    expect(misty(after).active!.condition).toBeFalsy();
  });

  it('Softboiled: heads, 30 off the Active Pokémon, once a turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', blissey).damage = 50;
    const after = use(flips(s, true), 'active');
    expect(ash(after).active!.damage).toBe(20);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });
});

describe('Dark Explorers Trainers', () => {
  it('Dark Claw: 20 more for a Darkness Pokémon\'s attacks, nothing for others', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', darkDummy, ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const claw = hand(s, 'ash', trainer('bw5-92', 'Dark Claw'));
    const clawed = play(s, claw, { target: 'active' });
    expect(misty(attack(clawed, 0)).active!.damage).toBe(40);
    const t = duel('charmander', 'onix', { energy: ['fire'] });
    put(t, 'misty', 'active', big('Snorlax'));
    const other = play(t, hand(t, 'ash', trainer('bw5-92', 'Dark Claw')), { target: 'active' });
    expect(misty(attack(other, 0)).active!.damage).toBe(10);
  });

  it('Dark Patch: a basic Darkness Energy card from the discard pile onto a Benched Darkness Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, darkDummy);
    ash(s).discard.push({ uid: 'dk', defId: DARK.id });
    const after = play(s, hand(s, 'ash', trainer('bw5-93', 'Dark Patch')), { discardUids: ['dk'], target: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual(['dk']);
  });

  it('Enhanced Hammer: only a Special Energy card can go', () => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'misty', 'active', big('Snorlax'), [id('dce'), 'water']);
    const uid = hand(s, 'ash', trainer('bw5-94', 'Enhanced Hammer'));
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices: { oppTarget: 'active', oppEnergyUids: [p.energy[1]!.uid] } }).ok).toBe(false);
    const after = play(s, uid, { oppTarget: 'active', oppEnergyUids: [p.energy[0]!.uid] });
    expect(misty(after).active!.energy.map((e) => e.defId)).toEqual(['water']);
  });

  it('Hooligans Jim & Cas: heads, 3 random cards from the opponent\'s hand into their deck', () => {
    const s = flips(duel('charmander', 'onix'), true);
    const [handSize, deckSize] = [misty(s).hand.length, misty(s).deck.length];
    const after = play(s, hand(s, 'ash', trainer('bw5-95', 'Hooligans Jim & Cas')));
    expect(misty(after).hand.length).toBe(handSize - 3);
    expect(misty(after).deck.length).toBe(deckSize + 3);
  });

  it('Random Receiver: the first Supporter card in the deck', () => {
    const s = duel('charmander', 'onix');
    ash(s).deck.splice(4, 0, { uid: 'jun', defId: id('juniper') });
    const after = play(s, hand(s, 'ash', trainer('bw5-99', 'Random Receiver')));
    expect(ash(after).hand.map((c) => c.uid)).toContain('jun');
  });

  it('Rare Candy: a Stage 2 card straight onto its Basic Pokémon, not a Stage 1, nor on the first turn', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    const zard = hand(s, 'ash', { ...s.cards[id('charizard')]! });
    const meleon = hand(s, 'ash', { ...s.cards[id('charmeleon')]! });
    const candy = hand(s, 'ash', trainer('bw5-100', 'Rare Candy'));
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: candy, choices: { handUids: [meleon], target: 0 } }).ok).toBe(false);
    const after = play(s, candy, { handUids: [zard], target: 0 });
    expect(ash(after).bench[0]!.card.uid).toBe(zard);
    expect(applyAction({ ...s, turn: 2 }, 'ash', { type: 'PLAY_TRAINER', cardUid: candy, choices: { handUids: [zard], target: 0 } }).ok).toBe(false);
  });

  it('Twist Mountain: heads, a Restored Pokémon from the hand onto the Bench, as it is', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'bw5-101': trainer('bw5-101', 'Twist Mountain') };
    s.stadium = { card: { uid: 'tm', defId: 'bw5-101' }, owner: 'misty' };
    const aero = hand(s, 'ash', aerodactyl);
    expect(applyAction(s, 'misty', { type: 'USE_STADIUM' }).ok).toBe(false);
    let after = act(flips(s, true), 'ash', { type: 'USE_STADIUM' });
    expect(after.pendingChoice).toMatchObject({ kind: 'handToBench', restored: true });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: aero });
    const benched = ash(after).bench.find((p) => p?.card.uid === aero)!;
    expect(benched).toBeTruthy();
    expect(benched.asBasic).toBeUndefined();
  });

  it('Ultra Ball: 2 cards discarded, then a Pokémon from the deck', () => {
    const s = duel('charmander', 'onix');
    const ball = hand(s, 'ash', trainer('bw5-102', 'Ultra Ball'));
    const [a, b] = ash(s).hand;
    ash(s).deck.unshift({ uid: 'zard', defId: id('charizard') });
    const after = play(s, ball, { handUids: [a!.uid, b!.uid] });
    expect(ash(after).discard.map((c) => c.uid)).toEqual(expect.arrayContaining([a!.uid, b!.uid]));
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'pokemon' });
    expect(settles(after).length).toBeGreaterThan(0);
  });
});
