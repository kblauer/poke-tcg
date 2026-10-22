import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, usableAttacks, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, C, F, FI, G, P, W } from './test-kit.js';

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
const trainer = (cardId: string, name: string, text = ''): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const resolve = (s: GameState, answer: { cardUid?: string; target?: Target; count?: number }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('EX Deoxys', () => {
  it('Bay Dance: next turn, whichever Pokémon is Active does 30 more to the Defending Pokémon, never the Bench (agreed)', () => {
    let s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex8-21', 'Pelipper', W, 70, [['Bay Dance', [C], 10]], { stage: 'stage1', retreatCost: 0 }), ['water']);
    put(s, 'ash', 0, mon('spread', 'Golem', FI, 100, [['Spread', [C], 20]]), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Onix'));
    s = attack(s, 0);
    s = endTurn(s, 'misty');
    s = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] });
    s.cards.spread = mon('spread', 'Golem', FI, 100, [['Spread', [C], 20]]);
    const before = misty(s).active!.damage;
    s = attack(s, 0);
    expect(misty(s).active!.damage - before).toBe(50);
    expect(misty(s).bench[0]!.damage).toBe(0);
  });

  it('Hard Protection: no damage to Shelgon from its own attacks, recoil and Confusion included (agreed)', () => {
    const s = duel('charmander', 'onix');
    const shelgon = put(s, 'ash', 'active', mon('ex8-45', 'Shelgon', C, 80, [['Headbutt', [C], 20], ['Double-edge', [C], 40]], { stage: 'stage1', ...power('Hard Protection'), attacks: [] }), ['fire']);
    s.cards['ex8-45'] = { ...(s.cards['ex8-45'] as PokemonCardDef), attacks: [{ name: 'Rock Smash', cost: [C], damage: 0, text: null }] };
    put(s, 'misty', 'active', big('Snorlax'));
    shelgon.condition = 'confused';
    const after = attack(flips(s, false), 0);
    expect(ash(after).active!.damage).toBe(0);
  });

  it('Intimidating Pattern: 20 less from the opponent\'s attacks to the Bench too (agreed); Lazy Aura only against Pokémon-ex', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('spreader', 'Golem', FI, 100, [['Quake', [C], 40]]), ['fighting']);
    put(s, 'misty', 'active', mon('ex8-39', 'Masquerain', G, 60, [], { stage: 'stage1', ...power('Intimidating Pattern') }));
    put(s, 'misty', 0, big('Onix'));
    s.cards['quake-ex'] = mon('quake-ex', 'Golem ex', FI, 150, [['Quake', [C], 40]], { ex: true });
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    put(s, 'misty', 'active', mon('ex8-15', 'Slaking', C, 120, [], { stage: 'stage2', ...power('Lazy Aura') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    put(s, 'ash', 'active', mon('quake-ex', 'Golem ex', FI, 150, [['Quake', [C], 40]], { ex: true }), ['fighting']);
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
  });

  it("Psyloop: 30 more for each Trainer card the opponent has in play: Tools and their Stadium (agreed)", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex8-29', 'Xatu', P, 70, [['Dazzle Dance', [C], 0], ['Psyloop', [C], 30]], { stage: 'stage1' }), ['fire']);
    const target = put(s, 'misty', 'active', big('Snorlax'));
    s.cards.tool = trainer('tool', 'Buffer Piece');
    target.attached = [{ card: { uid: 't', defId: 'tool' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    s.cards.std = trainer('std', 'Some Stadium');
    s.stadium = { card: { uid: 'st', defId: 'std' }, owner: 'misty' };
    // Buffer Piece takes 20 off: 30 + 60 = 90, less 20.
    expect(misty(attack(s, 1)).active!.damage).toBe(70);
  });

  it("Triple Breach: 10 to 3 of the opponent's Pokémon, the Active one among them if picked", () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle', 'charmander', 'squirtle'] });
    put(s, 'ash', 'active', mon('ex8-24', 'Seaking', W, 70, [['Triple Breach', [C], 0]], { stage: 'stage1' }), ['water']);
    const after = attack(s, 0, { benchSlots: [-1, 0, 2] });
    expect([misty(after).active!.damage, misty(after).bench[0]!.damage, misty(after).bench[1]!.damage, misty(after).bench[2]!.damage]).toEqual([10, 10, 0, 10]);
  });

  it('Form Change: another Deoxys from the deck takes its place, damage kept; only one Form Change a turn', () => {
    let s = duel('charmander', 'onix');
    const deoxys = put(s, 'ash', 0, mon('ex8-16', 'Deoxys', P, 70, [], power('Form Change')));
    deoxys.damage = 20;
    s.cards['ex8-17'] = mon('ex8-17', 'Deoxys', P, 70, [], power('Form Change'));
    s.players.ash!.deck.unshift({ uid: 'other', defId: 'ex8-17' });
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    s = resolve(s, { cardUid: 'other' });
    expect(ash(s).bench[0]).toMatchObject({ card: { uid: 'other' }, damage: 20 });
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(false);
  });

  it('Empty Shell: the opponent takes no Prize cards for Shedinja', () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('hitter', 'Machamp', FI, 100, [['Punch', [C], 100]]), ['fighting']);
    put(s, 'misty', 'active', mon('ex8-14', 'Shedinja', P, 50, [], { stage: 'stage1', ...power('Empty Shell') }));
    const prizes = ash(s).prizes.length;
    expect(ash(attack(s, 0)).prizes).toHaveLength(prizes);
  });

  it("Space Center: a Basic Pokémon's Poké-Body doesn't work; Meteor Falls: an Evolved Pokémon uses its Basic Pokémon's attacks", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    put(s, 'misty', 'active', mon('ex8-57', 'Corphish', W, 40, [], power('Exoskeleton')));
    const center = hand(s, 'ash', trainer('ex8-91', 'Space Center'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: center });
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    const evolved = put(s, 'ash', 'active', mon('evo', 'Machoke', FI, 80, [['Chop', [C], 50]], { stage: 'stage1' }), ['fighting']);
    evolved.evolvedFrom = [{ uid: 'mc', defId: 'hitter' }];
    s.cards['ex8-89'] = trainer('ex8-89', 'Meteor Falls');
    expect(usableAttacks(evolved, s.cards, { stadium: { uid: 'mf', defId: 'ex8-89' } }).map((u) => u.attack.name)).toEqual(['Chop', 'Punch']);
  });

  it('Scramble Energy: 3 Energy of any types while its owner has more Prize cards left; Colorless otherwise', () => {
    let s = duel('charmander', 'onix');
    s.cards['ex8-95'] = { id: 'ex8-95', kind: 'energy', name: 'Scramble Energy', imageUrl: null, energyType: 'colorless', basic: false };
    const p = put(s, 'ash', 'active', mon('evo', 'Charmeleon', F, 80, [['Flare', [F, F, F], 60]], { stage: 'stage1' }));
    p.evolvedFrom = [{ uid: 'cm', defId: 'hitter' }];
    s.cards.hitter = mon('hitter', 'Charmander', F, 50, []);
    const uid = hand(s, 'ash', s.cards['ex8-95']);
    s.players.misty!.prizes = s.players.misty!.prizes.slice(0, 2);
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' });
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['any', 'any', 'any']);
  });

  it("Disconnect: no Trainer cards but Supporters next turn; Commanding Aura: no Stadium cards", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex8-101', 'Manectric ex', 'lightning', 100, [['Disconnect', [C], 40]], { stage: 'stage1', ex: true }), ['lightning']);
    s = attack(s, 0);
    const item = hand(s, 'misty', trainer('ex6-101', 'Potion'));
    expect(applyAction(s, 'misty', { type: 'PLAY_TRAINER', cardUid: item, choices: { target: 'active' } }).ok).toBe(false);
    const t = duel('charmander', 'onix');
    put(t, 'misty', 'active', mon('ex8-100', 'Hariyama ex', FI, 110, [], { stage: 'stage1', ex: true, ...power('Commanding Aura') }));
    const stadium = hand(t, 'ash', trainer('ex8-91', 'Space Center'));
    const res = applyAction(t, 'ash', { type: 'PLAY_TRAINER', cardUid: stadium });
    expect(!res.ok && res.error).toContain('Commanding Aura');
  });

  it('Strength Charm (EX Deoxys): 10 more before Weakness and Resistance', () => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', mon('hit', 'Machop', FI, 60, [['Punch', [C], 20]]), ['fighting']);
    s.cards['ex8-92'] = trainer('ex8-92', 'Strength Charm', 'Whenever an attack from the Pokémon that Strength Charm is attached to does damage to the Active Pokémon, the attack does 10 more damage (before applying Weakness and Resistance).');
    p.attached = [{ card: { uid: 'charm', defId: 'ex8-92' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: FI, multiplier: 2 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it("Lightning Burst: a Darkness Energy card attached to Rocket's Raikou ex lets its owner have the opponent switch", () => {
    let s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex8-108', "Rocket's Raikou ex", 'darkness', 100, [], { ex: true, ...power('Lightning Burst') }));
    s.cards['ex1-93'] = { id: 'ex1-93', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness', basic: false };
    const uid = hand(s, 'ash', s.cards['ex1-93']);
    const benched = misty(s).bench[0]!.card.uid;
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' });
    s = resolve(s, { count: 0 });
    expect(misty(s).active!.card.uid).toBe(benched);
  });
});
