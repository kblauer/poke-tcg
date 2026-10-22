import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, mon, tryAttack, C, F, FI, G, L, P, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards = { ...s.cards, [def.id]: def };
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
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const evolved = (p: InPlayPokemon) => (p.evolvedFrom = [{ uid: `under-${n++}`, defId: 'charmander' }]);

describe('EX Holon Phantoms', () => {
  it("Holon's Castform: attached as Energy (the turn's attachment), it returns an Energy card and provides 2 of every type", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('user', 'Machop', FI, 60, [['Punch', [FI, W], 30]]), ['fire', 'grass']);
    const castform = hand(s, 'ash', mon('ex13-44', "Holon's Castform", C, 50, [['Delta Draw', [C], 0]]));
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: castform, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'discardAttached', toHand: true, holonReturn: castform });
    const fire = ash(s).active!.energy.find((e) => e.defId === 'fire')!.uid;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: fire });
    expect(ash(s).hand.some((c) => c.uid === fire)).toBe(true);
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['grass', 'any', 'any']);
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.water!), target: 'active' }).ok).toBe(false);
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it("Holon's Castform: only onto a Pokémon with an Energy card attached", () => {
    const s = duel('charmander', 'onix');
    const castform = hand(s, 'ash', mon('ex13-44', "Holon's Castform", C, 50, []));
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: castform, target: 'active' }).ok).toBe(false);
  });

  it("Dual Aura: with Latios in play, each player's Evolved Pokémon (not Pokémon-ex) can't use Poké-Bodies", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 300, [['Punch', [C], 30]]), ['fighting']);
    const shelgon = put(s, 'misty', 'active', mon('ex11-54', 'Shelgon δ', F, 70, [], { stage: 'stage1', ...power('Exoskeleton') }));
    evolved(shelgon);
    put(s, 'ash', 0, mon('ex13-11', 'Latias δ', F, 70, [], power('Dual Aura')));
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    put(s, 'ash', 1, mon('latios', 'Latios δ', W, 80, []));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Delta Reactor: with a Holon Stadium in play, each one adds 10 for δ Pokémon (agreed)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('delta', 'Beldum δ', L, 50, [['Ram', [C], 10]]), ['lightning']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('ex13-8', 'Gyarados δ', L, 90, [], { stage: 'stage1', ...power('Delta Reactor') }));
    put(s, 'ash', 1, mon('ex13-8', 'Gyarados δ', L, 90, [], { stage: 'stage1', ...power('Delta Reactor') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex13-87', 'Holon Lake')) });
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Form Change: Deoxys δ finds a Deoxys too (agreed)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex13-3', 'Deoxys δ', 'darkness', 70, [], power('Form Change')), ['fire']);
    s.cards = { ...s.cards, plain: mon('ex8-16', 'Deoxys', P, 70, []) };
    ash(s).deck.unshift({ uid: 'plain-1', defId: 'plain' });
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'plain-1' });
    expect(ash(s).active!.card.uid).toBe('plain-1');
  });

  it('δ Rainbow Energy: every type on a δ Pokémon, Colorless otherwise', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'ex13-98': { id: 'ex13-98', kind: 'energy', name: 'δ Rainbow Energy', imageUrl: null, energyType: 'colorless', basic: false } };
    const delta = put(s, 'ash', 'active', mon('delta', 'Beldum δ', L, 50, []), ['ex13-98']);
    const plain = put(s, 'ash', 0, mon('plain', 'Beldum', L, 50, []), ['ex13-98']);
    expect(energyPool(delta, s.cards)).toEqual(['any']);
    expect(energyPool(plain, s.cards)).toEqual(['colorless']);
  });

  it('Delta Reduction: 30 less damage next turn, before Weakness and Resistance', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex13-4', 'Deoxys δ', 'metal', 80, [['Delta Reduction', [C], 30]], { weakness: { type: 'fighting', multiplier: 2 } }), ['fire']);
    put(s, 'misty', 'active', mon('punch', 'Machop', FI, 300, [['Punch', [C], 50]]), ['fighting']);
    s = attack(s, 0);
    s = attack(s, 0, undefined, 'misty');
    expect(ash(s).active!.damage).toBe(40);
  });

  it("Psyloop counts the opponent's EX Legend Maker Fossils in play as Trainer cards (agreed)", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex10-102', 'Espeon ex', P, 110, [['Psyloop', [C], 60]], { stage: 'stage1', ex: true }), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    s.cards = { ...s.cards, 'ex12-79': { id: 'ex12-79', kind: 'pokemon', name: 'Mysterious Fossil', imageUrl: null, type: 'colorless', hp: 50, stage: 'basic', evolvesFrom: null, attacks: [], retreatCost: 0, trainerText: '' } };
    misty(s).bench[0] = { card: { uid: 'fossil', defId: 'ex12-79' }, evolvedFrom: [], damage: 0, energy: [], playedTurn: 0 };
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
  });

  it("Holon Lake: δ Pokémon can use Delta Call", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('delta', 'Beldum δ', L, 50, [['Ram', [L], 10]]), ['fire']);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex13-87', 'Holon Lake')) });
    s = attack(s, 1);
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'deltaPokemon' });
  });

  it('Deceive: the opponent picks one of their Pokémon for 4 damage counters', () => {
    let s = duel('charmander', 'onix', { oppBench: ['onix'] });
    put(s, 'ash', 'active', mon('ex13-48', 'Persian δ', 'darkness', 70, [['Deceive', [C], 0]], { stage: 'stage1' }), ['fire']);
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'ownCounters', count: 4 });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(misty(s).bench[0]!.damage).toBe(40);
  });

  it('Fellowship: Bellossom δ can use the attacks of its player\'s Benched Oddish line', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex13-19', 'Bellossom δ', W, 100, [['Aqua Flower', [C], 40]], { stage: 'stage2', ...power('Fellowship') }), ['water']);
    put(s, 'ash', 0, mon('gloom', 'Gloom', G, 60, [['Ooze', [C], 20]], { stage: 'stage1' }));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 1)).active!.damage).toBe(20);
  });

  it('Delta Supply: a basic Energy card from the hand to a δ Pokémon, beside the turn\'s attachment', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex13-7', 'Flygon δ', G, 110, [], { stage: 'stage2', ...power('Delta Supply') }));
    put(s, 'ash', 0, mon('delta', 'Beldum δ', L, 50, []));
    const card = hand(s, 'ash', s.cards.grass!);
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { cardUid: card, to: 0 } });
    expect(ash(s).bench[0]!.energy.map((e) => e.uid)).toEqual([card]);
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.fire!), target: 'active' }).ok).toBe(true);
  });
});

