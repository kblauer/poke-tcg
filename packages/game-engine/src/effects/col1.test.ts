import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, flips, id, mon, settles, C, F, FI, G, L, P, W } from './test-kit.js';

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
const stadium = (s: GameState, cardId: string, name: string, owner = 'misty') => {
  s.cards = { ...s.cards, [cardId]: trainer(cardId, name) };
  s.stadium = { card: { uid: `stadium-${n++}`, defId: cardId }, owner };
};
const play = (s: GameState, cardId: string, name: string, choices = {}) => {
  s.cards = { ...s.cards, [cardId]: trainer(cardId, name) };
  const uid = `${cardId}-${n++}`;
  ash(s).hand.push({ uid, defId: cardId });
  return act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices });
};

describe('Call of Legends attacks', () => {
  it('Cell Storm: 2 Psychic Energy discarded, 6 damage counters off', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-2', 'Deoxys', P, 80, [['Cell Storm', [P], 60]]), ['psychic', 'psychic', 'fire']).damage = 70;
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0);
    expect([ash(after).active!.damage, ash(after).active!.energy.map((e) => e.defId), misty(after).active!.damage]).toEqual([10, ['fire'], 60]);
  });

  it('Destructive Tsunami: heads, 40 to each of the opponent\'s Pokémon; tails, to each of the player\'s', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-12', 'Kyogre', W, 100, [['Destructive Tsunami', [C], 0]]), ['water']);
    put(s, 'ash', 0, big('Lapras'));
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Pidgey'));
    const heads = attack(flips(s, true), 0);
    const tails = attack(flips(s, false), 0);
    expect([misty(heads).active!.damage, misty(heads).bench[0]!.damage, ash(heads).bench[0]!.damage]).toEqual([40, 40, 0]);
    expect([ash(tails).active!.damage, ash(tails).bench[0]!.damage, misty(tails).active!.damage]).toEqual([40, 40, 0]);
  });

  it('Wormhole: Palkia switched out, then the opponent switches', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('col1-19', 'Palkia', W, 100, [['Wormhole', [C], 60]]), ['water']);
    put(s, 'ash', 0, big('Lapras'));
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Pidgey'));
    s = attack(s, 0, { ownBenchSlot: 0 });
    if (s.pendingChoice) s = act(s, 'misty', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).active!.card.defId, misty(s).active!.card.defId, misty(s).bench[0]!.damage]).toEqual(['big-Lapras', 'big-Pidgey', 60]);
  });

  it('Dimension Sphere: 20 more for each of the player\'s Pokémon in the Lost Zone', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-14', 'Lucario', FI, 90, [['Dimension Sphere', [C], 30]], { stage: 'stage1' }), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).lostZone = [{ uid: 'a', defId: id('charmander') }, { uid: 'b', defId: id('charmander') }, { uid: 'w', defId: 'water' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(70);
  });

  it('Layabout: every damage counter off, not again next turn', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('col1-33', 'Snorlax', C, 100, [['Layabout', [C], 0], ['Clomp Clomp Clobber', [C], 80]]), ['fire']).damage = 60;
    put(s, 'misty', 'active', big('Lapras'));
    s = attack(s, 0);
    s = act(s, 'misty', { type: 'END_TURN' });
    expect([ash(s).active!.damage, applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok]).toEqual([0, false]);
  });

  it('Clomp Clomp Clobber: an Energy card picked to go to the Lost Zone', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-33', 'Snorlax', C, 100, [['Layabout', [C], 0], ['Clomp Clomp Clobber', [C], 80]]), ['fire', 'water']);
    put(s, 'misty', 'active', big('Lapras'));
    s = attack(s, 1);
    const water = ash(s).active!.energy.find((e) => e.defId === 'water')!;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: water.uid });
    expect([ash(s).lostZone?.map((c) => c.defId), ash(s).active!.energy.map((e) => e.defId)]).toEqual([['water'], ['fire']]);
  });

  it('Plow Over: tails, an Energy card on the Defending Pokémon to the Lost Zone', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-34', 'Tangrowth', G, 110, [['Grind', [C], 0], ['Plow Over', [C], 30]], { stage: 'stage1' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'), ['water']);
    expect(misty(attack(flips(s, false), 1)).lostZone?.map((c) => c.defId)).toEqual(['water']);
  });

  it('Lost Claw and Sleepy Lost: cards to the opponent\'s Lost Zone', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-39', 'Zangoose', C, 80, [['Swords Dance', [C], 0], ['Lost Claw', [C], 30]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).hand = [{ uid: 'x', defId: 'water' }];
    expect(misty(attack(s, 1)).lostZone?.map((c) => c.uid)).toEqual(['x']);
    put(s, 'ash', 'active', mon('col1-47', 'Mime Jr.', P, 30, [['Sleepy Lost', [], 0]]));
    misty(s).deck = [{ uid: 'top', defId: 'water' }, ...pile(3)];
    const after = attack(s, 0);
    expect(misty(after).lostZone?.map((c) => c.uid)).toEqual(['top']);
  });

  it('Poison Effect: Poisoned, 60 more and the Poison removed', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-51', 'Seviper', P, 90, [['Poison Buildup', [C], 0], ['Poison Effect', [C], 20]]), ['psychic']).poison = 10;
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 1);
    expect([misty(after).active!.damage, ash(after).active!.poison]).toEqual([80, undefined]);
  });

  it('Prehistoric Wisdom: a card from the hand to the Lost Zone, then 3 drawn', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('col1-69', 'Relicanth', W, 80, [['Prehistoric Wisdom', [C], 0]]), ['water']);
    ash(s).hand = [{ uid: 'a', defId: 'fire' }, { uid: 'b', defId: 'water' }];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'a' });
    expect([ash(s).lostZone?.map((c) => c.uid), ash(s).hand.length]).toEqual([['a'], 4]);
  });

  it('Fake Tears: heads, no Trainer cards for the opponent next turn, 30 less damage', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('col1-73', 'Teddiursa', C, 50, [['Fake Tears', [C], 0]]), ['fire']);
    put(s, 'misty', 'active', hitter(40), ['fighting']);
    s = attack(flips(s, true), 0);
    s.cards = { ...s.cards, 'dp1-109': trainer('dp1-109', 'PlusPower') };
    misty(s).hand.push({ uid: 'pp', defId: 'dp1-109' });
    expect(applyAction(s, 'misty', { type: 'PLAY_TRAINER', cardUid: 'pp' }).ok).toBe(false);
    expect(ash(attack(s, 0, {}, 'misty')).active!.damage).toBe(10);
  });

  it('Raging Thunder: 20 to one of the player\'s own Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-SL9', 'Raikou', L, 90, [['Raging Thunder', [C], 70]]), ['lightning']);
    put(s, 'ash', 0, big('Lapras'));
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0, { ownTarget: 0 });
    expect([misty(after).active!.damage, ash(after).bench[0]!.damage]).toEqual([70, 20]);
  });
});

describe('Call of Legends powers', () => {
  it('Roast Reveal: a Fire Energy card discarded, 3 cards drawn', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('col1-17', 'Ninetales', F, 90, [], { stage: 'stage1', ...body('Roast Reveal') }));
    ash(s).hand = [{ uid: 'f', defId: 'fire' }];
    s = usePower(s, 'active', { cardUid: 'f' });
    expect([ash(s).hand.length, ash(s).discard.some((c) => c.uid === 'f')]).toEqual([3, true]);
  });

  it('Self-Generation: as Pachirisu is benched, up to 2 Lightning Energy cards from the hand attached', () => {
    let s = duel('charmander', 'onix');
    const pachirisu = hand(s, 'ash', mon('col1-18', 'Pachirisu', L, 60, [], body('Self-Generation')));
    ash(s).hand.push({ uid: 'l1', defId: 'lightning' }, { uid: 'l2', defId: 'lightning' });
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: pachirisu, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    while (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).hand.find((c) => c.defId === 'lightning')?.uid });
    expect(ash(s).bench[0]!.energy.length).toBe(2);
  });

  it('Second Sight: the top 3 cards of the opponent\'s deck rearranged', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('col1-32', 'Slowking', P, 80, [], { stage: 'stage1', ...body('Second Sight') }));
    s = usePower(s, 'active', { peek: 'oppDeck' });
    expect(s.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 3, deckOwner: 'misty' });
  });

  it('Ultra-Thick Skin: with Energy attached, 10 less damage', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('col1-66', 'Phanpy', FI, 300, [], body('Ultra-Thick Skin')), ['water']);
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Extreme Speed: 1 less to retreat for each Water Energy', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-SL11', 'Suicune', W, 90, [], { retreatCost: 1, ...body('Extreme Speed') }), ['water']);
    put(s, 'ash', 0, big('Lapras'));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });
});

describe('Call of Legends Trainers', () => {
  it('Lost Remover: a Special Energy card on the opponent\'s Pokémon to the Lost Zone', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'misty', 'active', big('Snorlax'), ['base1-96', 'water']);
    s = play(s, 'col1-80', 'Lost Remover', { oppTarget: 'active', oppEnergyUids: [p.energy[0]!.uid] });
    expect([misty(s).lostZone?.map((c) => c.defId), misty(s).active!.energy.map((e) => e.defId)]).toEqual([['base1-96'], ['water']]);
  });

  it('Lost World: with 6 of the opponent\'s Pokémon in the Lost Zone, the player wins', () => {
    let s = duel('charmander', 'onix');
    stadium(s, 'col1-81', 'Lost World');
    expect(applyAction(s, 'ash', { type: 'USE_STADIUM' }).ok).toBe(false);
    misty(s).lostZone = Array.from({ length: 6 }, (_, i) => ({ uid: `l${i}`, defId: id('charmander') }));
    s = act(s, 'ash', { type: 'USE_STADIUM' });
    expect([s.phase, s.winner]).toEqual(['finished', 'ash']);
  });

  it('Research Record: the cards kept go back on top in order, the rest on the bottom', () => {
    let s = duel('charmander', 'onix');
    ash(s).deck = [{ uid: 'a', defId: 'fire' }, { uid: 'b', defId: 'water' }, { uid: 'c', defId: 'grass' }, { uid: 'd', defId: 'psychic' }, { uid: 'e', defId: 'lightning' }];
    s = play(s, 'col1-84', 'Research Record');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'c' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'd' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'a' });
    expect(ash(s).deck.map((c) => c.uid)).toEqual(['c', 'e', 'd', 'a', 'b']);
    for (const end of settles(play(duel('charmander', 'onix'), 'col1-84', 'Research Record'))) expect(end.pendingChoice).toBeUndefined();
  });
});

describe('Agreed 2026-10-25', () => {
  it("Destructive Tsunami: tails, Kyogre takes its 40 with its own Weakness", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('col1-12', 'Kyogre', W, 300, [['Destructive Tsunami', [C], 0]], { weakness: { type: 'water', multiplier: 2 } }), ['water']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(ash(attack(flips(s, false), 0)).active!.damage).toBe(80);
  });
});
