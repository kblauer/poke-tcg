import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, flips, id, mon, settles, C, F, FI, G, P, W } from './test-kit.js';

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
const pile = (k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const hitter = (damage: number, extra: Partial<PokemonCardDef> = {}) => mon(`hitter-${damage}`, 'Machop', FI, 300, [['Punch', [C], damage]], extra);
const usePower = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });
const decks = (s: GameState) => {
  ash(s).deck = pile(10);
  misty(s).deck = pile(10);
};

describe('Unleashed powers', () => {
  it('Psychic Float: the Active Pokémon with a Psychic Energy retreats for free', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax', { retreatCost: 3 }), ['psychic']);
    put(s, 'ash', 0, mon('hgss2-4', 'Metagross', P, 130, [], { stage: 'stage2', ...body('Psychic Float') }));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });

  it('Leap Frog: a Benched Water Pokémon switched in', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss2-7', 'Politoed', W, 120, [], { stage: 'stage2', ...body('Leap Frog') }));
    put(s, 'ash', 0, mon('lapras-x', 'Lapras', W, 80, []));
    expect(ash(usePower(s, 'active', { to: 0 })).active!.card.defId).toBe('lapras-x');
  });

  it('Wash Out: a Water Energy card from the Bench to the Active Pokémon, any number of times', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('hgss2-13', 'Blastoise', W, 130, [], { stage: 'stage2', ...body('Wash Out') }), ['water', 'water']);
    const [w1, w2] = ash(s).bench[0]!.energy;
    s = usePower(s, 0, { from: 0, energyUid: w1!.uid });
    s = usePower(s, 0, { from: 0, energyUid: w2!.uid });
    expect(ash(s).active!.energy.length).toBe(2);
  });

  it('Water Acceleration: a Water Energy card from the hand attached to Floatzel', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss2-16', 'Floatzel', W, 80, [], { stage: 'stage1', ...body('Water Acceleration') }));
    ash(s).hand = [{ uid: 'w1', defId: 'water' }];
    expect(ash(usePower(s, 'active', { cardUid: 'w1' })).active!.energy.map((e) => e.uid)).toEqual(['w1']);
  });

  it('Energy Signal: a Grass Energy card attached from the hand, the Defending Pokémon is Confused', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss2-23', 'Roserade', G, 90, [], { stage: 'stage1', ...body('Energy Signal') }));
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = [{ uid: 'g1', defId: 'grass' }];
    expect(misty(act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'g1', target: 'active' })).active!.condition).toBe('confused');
  });

  it('Stardust Song: benched from the hand, a Psychic Energy card from the discard pile for each heads', () => {
    let s = duel('charmander', 'onix');
    ash(s).discard = [{ uid: 'p1', defId: 'psychic' }, { uid: 'p2', defId: 'psychic' }];
    const jirachi = hand(s, 'ash', mon('hgss2-1', 'Jirachi', P, 60, [], body('Stardust Song')));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: jirachi, slot: 0 });
    s = act(flips(s, true, true, false), 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(ash(s).bench[0]!.energy.length).toBe(2);
  });

  it('Celebration Wind: benched from the hand, Energy cards moved among the player\'s Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['water']);
    const shaymin = hand(s, 'ash', mon('hgss2-8', 'Shaymin', G, 70, [], body('Celebration Wind')));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: shaymin, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'deltaSwitch', anyEnergy: true });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
  });

  it('Berserk: with damage counters on it, 60 more', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss2-89', 'Ursaring', C, 110, [['Slash', [C], 30]], { stage: 'stage1', ...body('Berserk') }), ['fire']).damage = 10;
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
  });
});

describe('Unleashed attacks', () => {
  it("Time Hollow: up to as many of the opponent's Evolved Pokémon as Energy on Jirachi lose their top card", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss2-1', 'Jirachi', P, 60, [['Time Hollow', [C], 0]]), ['psychic']);
    const evolved = put(s, 'misty', 'active', mon('charmeleon-x', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    evolved.evolvedFrom.push({ uid: 'char', defId: id('charmander') });
    s = attack(s, 0, { benchSlots: [-1] });
    expect([misty(s).active!.card.uid, misty(s).hand.some((c) => c.defId === 'charmeleon-x')]).toEqual(['char', true]);
  });

  it('Hydro Launcher: 2 Water Energy back into the hand, 100 to one of the opponent\'s Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss2-13', 'Blastoise', W, 130, [['Hydro Launcher', [C], 0]], { stage: 'stage2' }), ['water', 'water', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0, { oppTarget: 'active' });
    expect([ash(s).active!.energy.map((e) => e.defId), ash(s).hand.filter((c) => c.defId === 'water').length, misty(s).active!.damage]).toEqual([['fire'], 2, 100]);
  });

  it('Power Claw: nothing on the Defending Pokémon but Weakness and Resistance changes the damage', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss2-88', 'Tyranitar', 'darkness', 160, [['Darkness Howl', [C], 0], ['Power Claw', [C], 60]], { stage: 'stage2' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax', { resistance: { type: 'darkness', amount: 20 } }), ['fire']).effects = { reduceDamage: { amount: 30, until: 99 } };
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Thunder Fall: every Energy discarded, 80 to each Pokémon with a Poké-Power, both players\'', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'hgss2-91': mon('hgss2-91', 'Entei & Raikou LEGEND', F, 140, [['Thunder Fall', [C], 0]]) };
    put(s, 'ash', 'active', mon('hgss2-90', 'Entei & Raikou LEGEND', F, 140, [['Detonation Spin', [C], 90], ['Thunder Fall', [C], 0]]), ['fire', 'lightning']);
    put(s, 'ash', 0, mon('pl1-3', 'Blaziken', F, 130, [], { stage: 'stage2', ...body('Fire Breath') }));
    put(s, 'misty', 'active', mon('pl1-9', 'Giratina', P, 300, [], body('Let Loose')));
    put(s, 'misty', 0, big('Snorlax'));
    s = attack(s, 1);
    expect([ash(s).active!.energy.length, ash(s).bench[0]!.damage, misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([0, 80, 80, 0]);
  });
});

describe('Unleashed Trainers', () => {
  it('Good Rod: heads, a Pokémon from the discard pile on top of the deck', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'hgss2-76': trainer('hgss2-76', 'Good Rod'), 'dp1-110': trainer('dp1-110', 'Poké Ball') };
    ash(s).hand = [{ uid: 'rod', defId: 'hgss2-76' }];
    ash(s).discard = [{ uid: 'c1', defId: id('charmander') }, { uid: 'b1', defId: 'dp1-110' }];
    s = act(flips(s, true), 'ash', { type: 'PLAY_TRAINER', cardUid: 'rod' });
    expect(ash(s).deck[0]?.uid).toBe('c1');
  });

  it('Judge: each player shuffles their hand away and draws 4', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    s.cards = { ...s.cards, 'hgss2-78': trainer('hgss2-78', 'Judge') };
    ash(s).hand = [{ uid: 'judge', defId: 'hgss2-78' }, ...pile(6)];
    misty(s).hand = pile(7);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'judge' });
    expect([ash(s).hand.length, misty(s).hand.length]).toEqual([4, 4]);
  });

  it('Pokémon Circulator: the opponent picks the Pokémon switched in', () => {
    let s = duel('charmander', 'onix');
    put(s, 'misty', 0, big('Snorlax'));
    put(s, 'misty', 1, big('Lapras'));
    s.cards = { ...s.cards, 'hgss2-81': trainer('hgss2-81', 'Pokémon Circulator') };
    ash(s).hand = [{ uid: 'circ', defId: 'hgss2-81' }];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'circ' });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'switchIn' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', target: 1 });
    expect(misty(s).active!.card.defId).toBe('big-Lapras');
  });

  it("Cheerleader's Cheer: 3 cards drawn, then the opponent may draw one", () => {
    let s = duel('charmander', 'onix');
    decks(s);
    s.cards = { ...s.cards, 'hgss2-71': trainer('hgss2-71', "Cheerleader's Cheer") };
    ash(s).hand = [{ uid: 'cheer', defId: 'hgss2-71' }];
    misty(s).hand = [];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'cheer' });
    expect([ash(s).hand.length, s.pendingChoice?.player]).toEqual([3, 'misty']);
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 1 });
    expect(misty(s).hand.length).toBe(1);
  });
});
