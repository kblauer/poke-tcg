import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, getPlayerView, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { usableAttacks } from '../attacks.js';
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
const solrock = () => mon('hgss4-9', 'Solrock', FI, 70, [], body('Heal Block'));
const lunatone = () => mon('lunatone-x', 'Lunatone', FI, 60, []);

describe('Triumphant: Heal Block', () => {
  it('with Lunatone in play, damage counters removed by a power go back', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-1', 'Bellossom', G, 110, [], { stage: 'stage2', ...body('Hustle Step') })).damage = 30;
    put(s, 'misty', 0, solrock());
    put(s, 'misty', 1, lunatone());
    s = usePower(s, 'active');
    expect(ash(s).active!.damage).toBe(30);
  });

  it('without Lunatone, nothing is stopped', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-1', 'Bellossom', G, 110, [], { stage: 'stage2', ...body('Hustle Step') })).damage = 30;
    put(s, 'misty', 0, solrock());
    s = usePower(s, 'active');
    expect(ash(s).active!.damage).toBe(20);
  });

  it('damage counters can still be moved', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-2', 'Espeon', P, 90, [['Solar Suggestion', [P], 0]], { stage: 'stage1' }), ['psychic']).damage = 10;
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, solrock());
    put(s, 'misty', 1, lunatone());
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect([ash(s).active!.damage, misty(s).active!.damage]).toEqual([0, 10]);
  });
});

describe('Triumphant attacks', () => {
  it('Toxic Fang: heads, Poisoned with 2 damage counters between turns', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-4', 'Drapion', 'darkness', 100, [['Toxic Fang', [C], 40]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(flips(s, true), 0)).active!.poison).toBe(20);
  });

  it('Thunder Shot: 50 to each of the opponent\'s Pokémon with Energy cards attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-20', 'Electivire', L, 100, [['Thunder Shot', [L], 0]], { stage: 'stage1' }), ['lightning']);
    put(s, 'misty', 'active', big('Snorlax'), ['water']);
    put(s, 'misty', 0, big('Lapras'), ['water']);
    put(s, 'misty', 1, big('Pidgey'));
    const after = attack(s, 0);
    expect([misty(after).active!.damage, misty(after).bench[0]!.damage, misty(after).bench[1]!.damage]).toEqual([50, 50, 0]);
  });

  it('Headwind: the Defending Pokémon\'s attacks cost 2 Colorless more next turn', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('hgss4-29', 'Pidgeot', C, 120, [['Headwind', [C], 20]], { stage: 'stage2' }), ['fire']);
    put(s, 'misty', 'active', hitter(30), ['water']);
    s = attack(s, 0);
    expect(applyAction(s, 'misty', { type: 'ATTACK', attackIndex: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/energy/i) });
  });

  it('Lost Crisis: 2 Energy cards to the Lost Zone; the Pokémon it Knocks Out goes there too, with its cards', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('hgss4-99', 'Darkrai & Cresselia LEGEND', 'darkness', 150, [['Lost Crisis', [C], 100], ["Moon's Invite", [P], 0]]), ['fire', 'water', 'psychic']);
    put(s, 'misty', 'active', mon('weak-x', 'Pidgey', C, 50, []), ['water']);
    put(s, 'misty', 0, big('Snorlax'));
    const [d1, d2] = ash(s).active!.energy;
    s = attack(s, 0, { energyUids: [d1!.uid, d2!.uid] });
    expect([ash(s).lostZone?.length, misty(s).lostZone?.map((c) => c.defId).sort()]).toEqual([2, ['water', 'weak-x']]);
  });

  it("Moon's Invite settles whatever the answers", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-99', 'Darkrai & Cresselia LEGEND', 'darkness', 150, [['Lost Crisis', [C], 100], ["Moon's Invite", [P], 0]]), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax')).damage = 20;
    put(s, 'misty', 0, big('Lapras'));
    s = attack(s, 1);
    expect(s.pendingChoice).toMatchObject({ kind: 'moveCounters', fromSide: 'opp' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    const moved = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([misty(moved).active!.damage, misty(moved).bench[0]!.damage]).toEqual([10, 10]);
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
  });

  it('Sudden Delete and Time Control', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('hgss4-101', 'Palkia & Dialga LEGEND', W, 160, [['Sudden Delete', [C], 0], ['Time Control', [C], 0]]), ['neo1-19', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'), ['water']);
    const deleted = attack(s, 0, { benchSlot: 0 });
    expect([misty(deleted).bench[0], misty(deleted).hand.some((c) => c.defId === 'big-Lapras')]).toEqual([null, true]);
    const prizes = misty(s).prizes.length;
    s = attack(s, 1);
    expect([misty(s).prizes.length, ash(s).active!.energy.map((e) => e.defId)]).toEqual([prizes + 2, ['water']]);
  });

  it('Vicious Claw: a Pokémon from the hand to the Lost Zone; with none, nothing', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-91', 'Absol', 'darkness', 80, [['Vicious Claw', [C], 70]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = [{ uid: 'f', defId: 'fire' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    ash(s).hand = [{ uid: 'c', defId: id('charmander') }, { uid: 'f', defId: 'fire' }];
    s = attack(s, 0);
    expect([misty(s).active!.damage, ash(s).lostZone?.map((c) => c.uid)]).toEqual([70, ['c']]);
  });

  it('Hurl into Darkness: up to a Pokémon for each Psychic Energy, from the opponent\'s hand to the Lost Zone', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-94', 'Gengar', P, 130, [['Hurl into Darkness', [P], 0]], { stage: 'stage2' }), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).hand = [{ uid: 'a', defId: id('charmander') }, { uid: 'b', defId: 'big-Snorlax' }, { uid: 'w', defId: 'water' }];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'a' });
    // Their turn starts with a card drawn.
    expect([misty(s).lostZone?.map((c) => c.uid), misty(s).hand.length, s.pendingChoice]).toEqual([['a'], 3, undefined]);
  });

  it('See Off: a Pokémon from the deck to the Lost Zone', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-97', 'Mew', P, 60, [['See Off', [P], 0]]), ['psychic']);
    ash(s).deck = [{ uid: 'c', defId: id('charmander') }, { uid: 'f', defId: 'fire' }];
    s = attack(s, 0);
    expect(ash(s).lostZone?.map((c) => c.uid)).toEqual(['c']);
  });

  it('Messenger: the search first, then Pidgey shuffled into the deck', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-71', 'Pidgey', C, 50, [['Messenger', [C], 0]]), ['fire']);
    put(s, 'ash', 0, big('Snorlax'));
    ash(s).deck = [{ uid: 'c', defId: id('charmander') }, { uid: 'w', defId: 'water' }];
    ash(s).hand = [];
    s = attack(s, 0);
    expect(ash(s).hand.map((c) => c.uid)).toEqual(['c']);
    expect(ash(s).deck.some((c) => c.defId === 'hgss4-71')).toBe(true);
  });
});

describe('Triumphant powers', () => {
  it('Pheromone Stamina: 20 more HP for each Nidoqueen', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-6', 'Nidoking', FI, 140, [], { stage: 'stage2', ...body('Pheromone Stamina') }));
    put(s, 'ash', 0, mon('nidoqueen-x', 'Nidoqueen', FI, 130, [], { stage: 'stage2' }));
    s = act(s, 'ash', { type: 'END_TURN' });
    expect(ash(s).active!.hpPlus).toBe(20);
  });

  it('Dittobolic: the opponent can have only 4 Benched Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'misty', 0, mon('hgss4-17', 'Ditto', C, 40, [], body('Dittobolic')));
    for (const [slot, name] of ['A', 'B', 'C', 'D'].entries()) put(s, 'ash', slot, big(name));
    s = act(s, 'ash', { type: 'END_TURN' });
    s = act(s, 'misty', { type: 'END_TURN' });
    const c = hand(s, 'ash', mon('basic-x', 'Rattata', C, 40, []));
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: c, slot: 4 })).toMatchObject({ ok: false, error: expect.stringMatching(/Dittobolic/) });
  });

  it('Eye of Disaster: 2 damage counters on a Basic Pokémon the opponent benches', () => {
    let s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('hgss4-91', 'Absol', 'darkness', 80, [], body('Eye of Disaster')));
    const c = hand(s, 'ash', mon('basic-x', 'Rattata', C, 40, []));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: c, slot: 0 });
    expect(ash(s).bench[0]!.damage).toBe(20);
  });

  it('Catastrophe: the opponent\'s Knocked Out Pokémon goes to the Lost Zone, its other cards discarded', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('hgss4-94', 'Gengar', P, 130, [['Hit', [C], 100]], { stage: 'stage2', ...body('Catastrophe') }), ['psychic']);
    put(s, 'misty', 'active', mon('weak-x', 'Pidgey', C, 50, []), ['water']);
    put(s, 'misty', 0, big('Snorlax'));
    s = attack(s, 0);
    expect([misty(s).lostZone?.map((c) => c.defId), misty(s).discard.some((c) => c.defId === 'water')]).toEqual([['weak-x'], true]);
  });

  it('Lost Link: the attacks of the Pokémon in either Lost Zone', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-97', 'Mew', P, 60, [['See Off', [P], 0]], body('Lost Link')), ['psychic']);
    s.cards = { ...s.cards, 'lost-x': mon('lost-x', 'Lost', C, 60, [['Lost Punch', [C], 40]]) };
    misty(s).lostZone = [{ uid: 'l', defId: 'lost-x' }];
    const names = usableAttacks(ash(s).active!, s.cards, { sides: [ash(s), misty(s)] }).map((a) => a.attack.name);
    expect(names).toEqual(['See Off', 'Lost Punch']);
    expect(getPlayerView(s, 'ash').opponent.lostZone?.length).toBe(1);
  });

  it('Insight: with as many cards in the hand as the opponent, its attacks cost nothing', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-98', 'Yanmega', G, 110, [['Sonic Vision', [G, G], 40]], { stage: 'stage1', ...body('Insight') }));
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = pile(2);
    misty(s).hand = pile(2);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Energymite: Electrode Knocked Out, the Energy cards among the top 7 attached', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('hgss4-93', 'Electrode', L, 90, [], { stage: 'stage1', ...body('Energymite') }));
    ash(s).deck = [{ uid: 'f', defId: 'fire' }, ...pile(8)];
    const prizes = misty(s).prizes.length;
    s = usePower(s, 0);
    expect([ash(s).bench[0], misty(s).prizes.length]).toEqual([null, prizes - 1]);
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
  });

  it('Fighting Tag: the Active Pokémon\'s Fighting Energy moved to Machamp, then the two switched', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['fighting', 'fire']);
    put(s, 'ash', 0, mon('hgss4-95', 'Machamp', FI, 150, [], { stage: 'stage2', ...body('Fighting Tag') }));
    s = usePower(s, 0);
    expect([ash(s).active!.card.defId, ash(s).active!.energy.map((e) => e.defId), ash(s).bench[0]!.energy.map((e) => e.defId)]).toEqual(['hgss4-95', ['fighting'], ['fire']]);
  });

  it('Lonely Bone: 20 less for each Marowak in the discard pile', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(60), ['fighting']);
    put(s, 'misty', 'active', mon('hgss4-60', 'Cubone', FI, 400, [], body('Lonely Bone')));
    s.cards = { ...s.cards, 'marowak-x': mon('marowak-x', 'Marowak', FI, 80, []) };
    misty(s).discard = [{ uid: 'm1', defId: 'marowak-x' }, { uid: 'm2', defId: 'marowak-x' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Natural Remedy: a Water Energy card from the hand takes 2 damage counters off', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss4-22', 'Golduck', W, 90, [], { stage: 'stage1', ...body('Natural Remedy') })).damage = 30;
    ash(s).hand = [{ uid: 'w', defId: 'water' }];
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'w', target: 'active' });
    expect(ash(s).active!.damage).toBe(10);
  });
});

describe('Triumphant Trainers', () => {
  it('Black Belt: behind on Prize cards, 40 more to the opponent\'s Active Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).prizes = misty(s).prizes.slice(0, 2);
    s = play(s, 'hgss4-85', 'Black Belt');
    expect(misty(attack(s, 0)).active!.damage).toBe(70);
  });

  it('Indigo Plateau: 30 more HP for a Pokémon LEGEND', () => {
    let s = duel('charmander', 'onix');
    stadium(s, 'hgss4-86', 'Indigo Plateau');
    put(s, 'ash', 'active', mon('hgss4-99', 'Darkrai & Cresselia LEGEND', 'darkness', 150, []));
    s = act(s, 'ash', { type: 'END_TURN' });
    expect(ash(s).active!.hpPlus).toBe(30);
  });

  it('Junk Arm: 2 cards discarded, then a Trainer card that isn\'t Junk Arm back into the hand', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'dp1-109': trainer('dp1-109', 'PlusPower'), 'hgss4-87': trainer('hgss4-87', 'Junk Arm') };
    ash(s).discard = [{ uid: 'junk', defId: 'hgss4-87' }, { uid: 'pp', defId: 'dp1-109' }];
    ash(s).hand = [{ uid: 'a', defId: 'fire' }, { uid: 'b', defId: 'water' }];
    s = play(s, 'hgss4-87', 'Junk Arm', { handUids: ['a', 'b'] });
    expect(ash(s).hand.map((c) => c.uid)).toEqual(['pp']);
  });

  it('Seeker: each player returns a Benched Pokémon, the player first', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, big('Snorlax'));
    put(s, 'ash', 1, big('Lapras'));
    put(s, 'misty', 0, big('Pidgey'));
    put(s, 'misty', 1, big('Rattata'));
    s = play(s, 'hgss4-88', 'Seeker');
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'narrowGym', returnOne: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', target: 1 });
    expect([ash(s).bench[0], misty(s).bench[1], ash(s).hand.some((c) => c.defId === 'big-Snorlax'), misty(s).hand.some((c) => c.defId === 'big-Rattata')]).toEqual([null, null, true, true]);
  });

  it('Twins: only behind on Prize cards', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'hgss4-89': trainer('hgss4-89', 'Twins') };
    ash(s).hand = [{ uid: 't', defId: 'hgss4-89' }];
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 't' })).toMatchObject({ ok: false });
  });

  it('Rescue Energy: Knocked Out by an attack\'s damage, its Pokémon back into the hand', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    s.cards = { ...s.cards, 'hgss4-90': { id: 'hgss4-90', kind: 'energy', name: 'Rescue Energy', imageUrl: null, energyType: 'colorless', basic: false } as CardDef };
    put(s, 'ash', 'active', hitter(100), ['fighting']);
    put(s, 'misty', 'active', mon('weak-x', 'Pidgey', C, 50, []), ['hgss4-90']);
    put(s, 'misty', 0, big('Snorlax'));
    s = attack(s, 0);
    expect([misty(s).hand.some((c) => c.defId === 'weak-x'), misty(s).discard.some((c) => c.defId === 'hgss4-90')]).toEqual([true, true]);
  });

  it('Alph Lithograph: the player\'s Prize cards shown', () => {
    let s = duel('charmander', 'onix');
    s = play(s, 'hgss4-FOUR', 'Alph Lithograph');
    expect(s.pendingChoice).toMatchObject({ kind: 'lookOppDeck', own: true, prizes: true });
    expect(act(s, 'ash', { type: 'RESOLVE_CHOICE' }).pendingChoice).toBeUndefined();
  });
});
