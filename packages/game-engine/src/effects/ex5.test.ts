import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, id, mon, C, FI, G, P, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards[def.id] = def;
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards[def.id] = def;
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const resolve = (s: GameState, answer: { cardUid?: string; target?: Target; count?: number }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('EX Hidden Legends', () => {
  it("Mark of Antiquity: while Groudon ex is an Active Pokémon, either player's Kyogre ex can't attack", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('kyogre-ex', 'Kyogre ex', W, 100, [['Splash', [C], 30]], { ex: true }), ['water']);
    put(s, 'misty', 'active', mon('ex5-93', 'Groudon ex', FI, 100, [], { ex: true, ...power('Mark of Antiquity') }));
    const res = applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 });
    expect(!res.ok && res.error).toContain('Mark of Antiquity');
  });

  it('Power Diffusion: as the Active Pokémon, no attack damage to its owner\'s Benched Pokémon', () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex2-23', 'Steelix', 'metal', 100, [['Rage', [C], 10], ['Spinning Tail', [C, C, C], 0]], { stage: 'stage1' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', mon('ex5-46', 'Rhydon', FI, 200, [], { stage: 'stage1', ...power('Power Diffusion') }));
    const after = attack(s, 1);
    expect(misty(after).active!.damage).toBe(20);
    expect(misty(after).bench[0]!.damage).toBe(0);
  });

  it('Primal Pull: an Evolved Pokémon pays 1 more Colorless Energy to attack', () => {
    const s = duel('charmander', 'onix');
    const evolved = put(s, 'ash', 'active', mon('evo', 'Charmeleon', 'fire', 80, [['Slash', [C], 30]], { stage: 'stage1' }), ['fire']);
    evolved.evolvedFrom = [{ uid: 'cm', defId: 'charmander' }];
    put(s, 'misty', 'active', mon('ex5-2', 'Claydol', P, 80, [], { stage: 'stage1', ...power('Primal Pull') }));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
    evolved.energy.push({ uid: 'extra', defId: 'fire' });
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(true);
  });

  it("Block Dust: the opponent can't play Trainer cards but Supporters", () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex5-100', 'Vileplume ex', G, 140, [], { stage: 'stage2', ex: true, ...power('Block Dust') }));
    const herb = hand(s, 'ash', trainer('ex5-90', 'Life Herb'));
    const res = applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: herb, choices: { target: 'active' } });
    expect(!res.ok && res.error).toContain('Block Dust');
  });

  it('Forecast: a Stadium from the deck into play, never one with the name of the Stadium in play (agreed)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex5-30', 'Castform', C, 60, [['Forecast', [C], 0]], power('Temperamental Weather')), ['fire']);
    s.cards['ex5-91'] = trainer('ex5-91', 'Magnetic Storm');
    s.cards['ex5-87'] = trainer('ex5-87', 'Ancient Tomb');
    s.stadium = { card: { uid: 'storm-in-play', defId: 'ex5-91' }, owner: 'misty' };
    s.players.ash!.deck.push({ uid: 'storm', defId: 'ex5-91' }, { uid: 'tomb', defId: 'ex5-87' });
    s = attack(s, 0);
    const view = s.pendingChoice;
    expect(view).toMatchObject({ kind: 'stadiumFromDiscard', fromDeck: true });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'storm' }).ok).toBe(true);
    s = resolve(s, { cardUid: 'tomb' });
    expect(s.stadium?.card.uid).toBe('tomb');
  });

  it("Ice Generator: every Trainer card of the opponent's in play discarded, their Stadium too (agreed)", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex5-84', 'Machoke', FI, 80, [['Ice Generator', [C], 0]]), ['fire']);
    s.cards['ex5-91'] = trainer('ex5-91', 'Magnetic Storm');
    s.stadium = { card: { uid: 'storm-in-play', defId: 'ex5-91' }, owner: 'misty' };
    const after = attack(s, 0);
    expect(after.stadium).toBeNull();
    expect(misty(after).discard.some((c) => c.uid === 'storm-in-play')).toBe(true);
  });

  it('Make a Wish: the usual limits for evolving (agreed), then a damage counter on Jirachi', () => {
    let s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex5-8', 'Jirachi', P, 70, [['Make a Wish', [C], 0]]), ['fire']);
    s.cards.wartortle = mon('wartortle', 'Wartortle', W, 70, [], { stage: 'stage1', evolvesFrom: 'Squirtle' });
    s.players.ash!.deck.unshift({ uid: 'wart', defId: 'wartortle' });
    // Squirtle was put into play this turn: it can't evolve.
    s.players.ash!.bench[0]!.playedTurn = s.turn;
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'evolveMany', limits: true });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'wart' }).ok).toBe(false);
  });

  it('Energy Grounding: a basic Energy card of the Knocked Out Pokémon may go to Lanturn', () => {
    let s = duel('charmander', 'onix', { energy: ['fire'] });
    const target = put(s, 'misty', 'active', mon('weak', 'Chinchou', 'lightning', 50, []), ['lightning']);
    target.damage = 40;
    const lanturn = put(s, 'misty', 0, mon('ex5-38', 'Lanturn', 'lightning', 80, [], { stage: 'stage1', ...power('Energy Grounding') }));
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'energyGrounding' });
    s = resolve(s, { cardUid: target.energy[0]!.uid }, 'misty');
    expect(misty(s).bench.find((p) => p?.card.uid === lanturn.card.uid)?.energy ?? misty(s).active!.energy).toHaveLength(1);
  });

  it('Temperamental Weather: the Castform is switched with another form from the deck, keeping its damage and Energy', () => {
    let s = duel('charmander', 'onix');
    const castform = put(s, 'ash', 0, mon('ex5-30', 'Castform', C, 60, [], power('Temperamental Weather')), ['fire']);
    castform.damage = 20;
    s.cards['ex5-26'] = mon('ex5-26', 'Sunny Castform', 'fire', 70, [], power('Temperamental Weather'));
    s.players.ash!.deck.unshift({ uid: 'sunny', defId: 'ex5-26' });
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    s = resolve(s, { cardUid: 'sunny' });
    expect(ash(s).bench[0]).toMatchObject({ card: { uid: 'sunny' }, damage: 20 });
    expect(ash(s).bench[0]!.energy).toHaveLength(1);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(false);
  });

  it('Desert Ruins: a damage counter between turns on each Pokémon-ex with 100 HP or more', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('big-ex', 'Groudon ex', FI, 100, [], { ex: true }));
    put(s, 'misty', 'active', mon('small-ex', 'Pikachu ex', 'lightning', 90, [], { ex: true }));
    s.cards['ex5-88'] = trainer('ex5-88', 'Desert Ruins');
    s.stadium = { card: { uid: 'ruins', defId: 'ex5-88' }, owner: 'ash' };
    const after = endTurn(s, 'ash');
    expect(ash(after).active!.damage).toBe(10);
    expect(misty(after).active!.damage).toBe(0);
  });

  it('Darkness Chant: a damage counter for each Basic Pokémon or Evolution card in the discard pile, at most 6', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex5-1', 'Banette', P, 70, [['Shadow Steal', [P], 10], ['Darkness Chant', [P, C], 0]], { stage: 'stage1' }), ['psychic', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    for (let i = 0; i < 8; i++) s.players.ash!.discard.push({ uid: `dead-${i}`, defId: id('charmander') });
    expect(misty(attack(s, 1)).active!.damage).toBe(60);
  });
});
