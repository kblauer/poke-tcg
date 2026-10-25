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
const trainer = (cardId: string, name: string, extra: Partial<CardDef> = {}): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '', ...extra }) as CardDef;
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

describe('Undaunted attacks', () => {
  it('Solar Suggestion: damage counters moved from the player\'s Pokémon to the opponent\'s, one at a time', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-2', 'Espeon', P, 90, [['Solar Suggestion', [P], 0]], { stage: 'stage1' }), ['psychic']).damage = 20;
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect([ash(s).active!.damage, misty(s).active!.damage, s.pendingChoice]).toEqual([0, 20, undefined]);
  });

  it('Solar Suggestion settles whatever the answers', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-2', 'Espeon', P, 90, [['Solar Suggestion', [P], 0]], { stage: 'stage1' }), ['psychic']).damage = 30;
    put(s, 'ash', 0, big('Snorlax')).damage = 30;
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0);
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
  });

  it('Ninja Fang: Paralyzed only if it had no damage counters', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-4', 'Gliscor', FI, 90, [['Ninja Fang', [FI], 30]], { stage: 'stage1' }), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.condition).toBe('paralyzed');
    misty(s).active!.damage = 10;
    expect(misty(attack(s, 0)).active!.condition).toBeFalsy();
  });

  it('Lava Flow: the Fire Energy cards chosen discarded, 20 more each', () => {
    const s = duel('charmander', 'onix');
    const magcargo = put(s, 'ash', 'active', mon('hgss3-6', 'Magcargo', F, 100, [['Lava Flow', [F, F, C], 60]], { stage: 'stage1' }), ['fire', 'fire', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    const fire = magcargo.energy.filter((e) => e.defId === 'fire').map((e) => e.uid);
    const after = attack(s, 0, { energyUids: fire });
    expect([misty(after).active!.damage, ash(after).active!.energy.map((e) => e.defId)]).toEqual([100, ['water']]);
  });

  it('Blessed Wings: every damage counter off the player\'s Pokémon, Togekiss shuffled into the deck', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-9', 'Togekiss', C, 120, [['Blessed Wings', [C, C], 0]], { stage: 'stage2' }), ['fire', 'fire']).damage = 50;
    put(s, 'ash', 0, big('Snorlax')).damage = 60;
    put(s, 'misty', 'active', big('Lapras'));
    s = attack(s, 0);
    expect([ash(s).active?.card.defId ?? null, ash(s).bench[0]?.damage ?? 0, ash(s).deck.some((c) => c.defId === 'hgss3-9')]).toEqual([null, 0, true]);
  });

  it('Moonlight Fang: next turn, attacks of Pokémon with a Poké-Power or Poké-Body do nothing to Umbreon', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('hgss3-10', 'Umbreon', 'darkness', 90, [['Moonlight Fang', [C], 30]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', hitter(50, body('Anything')), ['fighting']);
    s = attack(s, 0);
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(0);
  });

  it('Plasma Arrow: 20 for each Energy on the chosen Pokémon, no Weakness or Resistance', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-20', 'Rotom', L, 60, [['Plasma Arrow', [L], 0]]), ['lightning']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: 'lightning', multiplier: 2 } }), ['water', 'water']);
    put(s, 'misty', 0, big('Lapras'), ['base1-96']);
    expect(misty(attack(s, 0, { oppTarget: 'active' })).active!.damage).toBe(40);
  });

  it('Selfish Draw: the top card left is discarded and a card drawn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-56', 'Mawile', 'metal', 60, [['Selfish Draw', [C], 0]]), ['fire']);
    ash(s).deck = [{ uid: 'top', defId: 'fire' }, { uid: 'next', defId: 'water' }];
    ash(s).hand = [];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect([ash(s).hand.map((c) => c.uid), ash(s).discard.some((c) => c.uid === 'top')]).toEqual([['next'], true]);
  });

  it('Plead: the opponent says yes (2 cards drawn) or no (20 damage)', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('hgss3-70', 'Togepi', C, 40, [['Plead', [C], 0]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = [];
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'beforeAttack', question: 'plead' });
    const yes = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
    const no = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 1 });
    expect([ash(yes).hand.length, misty(yes).active!.damage, ash(no).hand.length, misty(no).active!.damage]).toEqual([2, 0, 0, 20]);
  });

  it('Rambunctious Party: the Basic Pokémon among the top 5 onto the Bench', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-66', 'Slowpoke', W, 60, [['Rambunctious Party', [C], 0]]), ['fire']);
    ash(s).bench = [null, null, null, null, null];
    ash(s).deck = [{ uid: 'b1', defId: id('charmander') }, { uid: 'e1', defId: 'fire' }, { uid: 'b2', defId: id('charmander') }, ...pile(5)];
    s = attack(s, 0);
    expect(ash(s).bench.filter(Boolean).length).toBe(4);
  });

  it('Mega Tidal Wave: 30 to each Benched Pokémon for each Energy card among the opponent\'s top 5', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-87', 'Kyogre & Groudon LEGEND', W, 150, [['Massive Eruption', [C], 0], ['Mega Tidal Wave', [C], 0]]), ['water']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    misty(s).deck = [{ uid: 'w1', defId: 'water' }, { uid: 'w2', defId: 'water' }, ...pile(5)];
    s = attack(s, 1);
    expect([misty(s).bench[0]!.damage, misty(s).active!.damage, misty(s).discard.filter((c) => c.defId === 'water').length]).toEqual([60, 0, 2]);
  });
});

describe('Undaunted powers', () => {
  it('Hustle Step: a damage counter off each of the player\'s Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-1', 'Bellossom', G, 110, [], { stage: 'stage2', ...body('Hustle Step') })).damage = 20;
    put(s, 'ash', 0, big('Snorlax')).damage = 10;
    s = usePower(s, 'active');
    expect([ash(s).active!.damage, ash(s).bench[0]!.damage]).toEqual([10, 0]);
  });

  it('Retreat Aid: 2 less for a Pokémon-ex too', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax ex', { ex: true, retreatCost: 2 }));
    put(s, 'ash', 0, mon('hgss3-11', 'Dodrio', C, 80, [], { stage: 'stage1', ...body('Retreat Aid') }));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });

  it('Mischievous Trick: a Prize card switched with the top card of the deck', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-20', 'Rotom', L, 60, [], body('Mischievous Trick')));
    ash(s).deck = [{ uid: 'top', defId: 'fire' }, ...pile(3)];
    const prizes = ash(s).prizes.map((c) => c.uid);
    s = usePower(s, 'active');
    expect([ash(s).prizes.some((c) => c.uid === 'top'), prizes.includes(ash(s).deck[0]!.uid)]).toEqual([true, true]);
  });

  it("Defense Sign: no attack damage to its player's Benched Grass Pokémon", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-20', 'Rotom', L, 60, [['Plasma Arrow', [L], 0]]), ['lightning']);
    put(s, 'misty', 'active', mon('hgss3-23', 'Vespiquen', G, 100, [], { stage: 'stage1', ...body('Defense Sign') }));
    put(s, 'misty', 0, mon('oddish-x', 'Oddish', G, 40, []), ['water']);
    put(s, 'misty', 1, big('Snorlax'), ['water']);
    expect([misty(attack(s, 0, { oppTarget: 0 })).bench[0]!.damage, misty(attack(s, 0, { oppTarget: 1 })).bench[1]!.damage]).toEqual([0, 20]);
  });

  it('Allergy Flower: neither player can play Trainer cards', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 0, mon('hgss3-24', 'Vileplume', G, 120, [], { stage: 'stage2', ...body('Allergy Flower') }));
    s.cards = { ...s.cards, 'dp1-109': trainer('dp1-109', 'PlusPower') };
    ash(s).hand = [{ uid: 'pp', defId: 'dp1-109' }];
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'pp' })).toMatchObject({ ok: false, error: expect.stringMatching(/Allergy Flower/) });
  });

  it('Claw Snag: as Weavile evolves, a card from the opponent\'s hand discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('sneasel-x', 'Sneasel', 'darkness', 60, []));
    const weavile = hand(s, 'ash', mon('hgss3-25', 'Weavile', 'darkness', 80, [], { stage: 'stage1', evolvesFrom: 'Sneasel', ...body('Claw Snag') }));
    misty(s).hand = [{ uid: 'x', defId: 'water' }, { uid: 'y', defId: 'fire' }];
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: weavile, target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'y' });
    expect([misty(s).hand.map((c) => c.uid), misty(s).discard.some((c) => c.uid === 'y')]).toEqual([['x'], true]);
  });

  it('Active Volcano: a Fire Energy card on top is attached to Slugma; anything else is discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-67', 'Slugma', F, 60, [], body('Active Volcano')));
    ash(s).deck = [{ uid: 'f', defId: 'fire' }, ...pile(2)];
    s = usePower(s, 'active');
    expect(ash(s).active!.energy.map((e) => e.uid)).toEqual(['f']);
  });

  it('Evolution Memories: the attacks of the player\'s Benched Pokémon that evolve from Eevee', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-81', 'Espeon', P, 100, [], { stage: 'stage1', evolvesFrom: 'Eevee', ...body('Evolution Memories') }), ['fire']);
    put(s, 'ash', 0, mon('flareon-x', 'Flareon', F, 90, [['Ember', [C], 50]], { stage: 'stage1', evolvesFrom: 'Eevee' }));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it('Red Armor: no damage from Pokémon with a Special Energy card attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(60), ['base1-96']);
    put(s, 'misty', 'active', mon('hgss3-84', 'Scizor', 'metal', 100, [], { stage: 'stage1', ...body('Red Armor') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    ash(s).active!.energy = [{ uid: 'f', defId: 'fighting' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it("Opponent's Choice: the opponent picks the card for the hand; the other goes on the bottom", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-85', 'Slowking', P, 100, [], { stage: 'stage1', ...body("Opponent's Choice") }));
    ash(s).deck = [{ uid: 'a', defId: 'fire' }, { uid: 'b', defId: 'water' }, ...pile(3)];
    ash(s).hand = [];
    s = usePower(s, 'active');
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'marley', fromDeck: true });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'b' });
    expect([ash(s).hand.map((c) => c.uid), ash(s).deck[ash(s).deck.length - 1]!.uid, ash(s).deck.length]).toEqual([['b'], 'a', 4]);
  });

  it('Cloud-Covered Moon: heads, the Active Umbreon and its cards back into the hand', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss3-86', 'Umbreon', 'darkness', 100, [], { stage: 'stage1', ...body('Cloud-Covered Moon') }), ['fire']);
    put(s, 'ash', 0, big('Snorlax'));
    s = usePower(flips(s, true), 'active');
    expect(ash(s).hand.filter((c) => c.defId === 'hgss3-86' || c.defId === 'fire').length).toBe(2);
  });

  it('Space Virus: 1 more Prize card for a Pokémon its attack Knocks Out', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    put(s, 'ash', 'active', mon('hgss3-89', 'Rayquaza & Deoxys LEGEND', C, 140, [['Hit', [C], 100]], body('Space Virus')), ['fire']);
    put(s, 'misty', 'active', mon('weak-x', 'Pidgey', C, 40, []));
    put(s, 'misty', 0, big('Snorlax'));
    const prizes = ash(s).prizes.length;
    s = attack(s, 0);
    expect(ash(s).prizes.length).toBe(prizes - 2);
  });
});

describe('Undaunted Trainers', () => {
  it('Burned Tower: heads, a basic Energy card from the discard pile into the hand', () => {
    let s = duel('charmander', 'onix');
    stadium(s, 'hgss3-71', 'Burned Tower');
    ash(s).discard = [{ uid: 'f', defId: 'fire' }];
    // One card: no question (the same-card rule).
    s = act(flips(s, true), 'ash', { type: 'USE_STADIUM' });
    expect(ash(s).hand.some((c) => c.uid === 'f')).toBe(true);
  });

  it('Energy Exchanger: an Energy card from the hand on top of the deck, then an Energy card from the deck', () => {
    let s = duel('charmander', 'onix');
    ash(s).deck = [...pile(3), { uid: 'w', defId: 'water' }];
    ash(s).hand = [{ uid: 'f', defId: 'fire' }];
    s = play(s, 'hgss3-73', 'Energy Exchanger', { handUids: ['f'] });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w' });
    expect([ash(s).hand.map((c) => c.uid), ash(s).deck.some((c) => c.uid === 'f')]).toEqual([['w'], true]);
  });

  it('Flower Shop Lady: Pokémon, then basic Energy cards, from the discard pile into the deck', () => {
    let s = duel('charmander', 'onix');
    ash(s).discard = [{ uid: 'c', defId: id('charmander') }, { uid: 'f', defId: 'fire' }];
    s = play(s, 'hgss3-74', 'Flower Shop Lady');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'c' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f' });
    expect([ash(s).discard.filter((c) => c.uid === 'c' || c.uid === 'f').length, s.pendingChoice]).toEqual([0, undefined]);
  });

  it('Legend Box: both halves of a LEGEND among the top 10 onto the Bench, with the Energy cards shown', () => {
    let s = duel('charmander', 'onix');
    const half = (cardId: string) => mon(cardId, 'Lugia LEGEND', W, 130, []);
    s.cards = { ...s.cards, 'hgss1-113': half('hgss1-113'), 'hgss1-114': half('hgss1-114') };
    ash(s).bench = [null, null, null, null, null];
    ash(s).deck = [{ uid: 'top', defId: 'hgss1-113' }, { uid: 'w', defId: 'water' }, { uid: 'bottom', defId: 'hgss1-114' }, ...pile(10)];
    s = play(s, 'hgss3-75', 'Legend Box');
    expect([ash(s).bench[0]?.card.uid, ash(s).bench[0]?.energy.map((e) => e.uid), ash(s).bench[0]?.attached?.[0]?.card.uid]).toEqual(['top', ['w'], 'bottom']);
  });

  it('Ruins of Alph: no Resistance', () => {
    const s = duel('charmander', 'onix');
    stadium(s, 'hgss3-76', 'Ruins of Alph');
    put(s, 'ash', 'active', hitter(50), ['fighting']);
    put(s, 'misty', 'active', big('Pidgey', { resistance: { type: 'fighting', amount: 30 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it("Sage's Training: 2 of the top 5 into the hand, the rest discarded", () => {
    let s = duel('charmander', 'onix');
    ash(s).deck = pile(8);
    ash(s).hand = [];
    ash(s).deck[0] = { uid: 'w', defId: 'water' };
    s = play(s, 'hgss3-77', "Sage's Training");
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w' });
    expect([ash(s).hand.length, ash(s).discard.length, ash(s).deck.length]).toEqual([2, 4, 3]);
  });

  it("Team Rocket's Trickery: 2 cards drawn, then the opponent discards a card", () => {
    let s = duel('charmander', 'onix');
    decks(s);
    ash(s).hand = [];
    misty(s).hand = [{ uid: 'x', defId: 'water' }, { uid: 'y', defId: 'fire' }];
    s = play(s, 'hgss3-78', "Team Rocket's Trickery");
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'x' });
    expect([ash(s).hand.length, misty(s).hand.map((c) => c.uid)]).toEqual([2, ['y']]);
  });

  it('Alph Lithograph: the Stadium back into its owner\'s hand', () => {
    let s = duel('charmander', 'onix');
    stadium(s, 'hgss3-76', 'Ruins of Alph');
    s = play(s, 'hgss3-THREE', 'Alph Lithograph');
    expect([s.stadium, misty(s).hand.some((c) => c.defId === 'hgss3-76')]).toEqual([null, true]);
  });
});
