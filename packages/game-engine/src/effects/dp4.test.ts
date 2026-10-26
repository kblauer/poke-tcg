import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { retreatCost, usableAttacks, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, C, F, FI, G, P, W } from './test-kit.js';

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
/** Basic Darkness and Metal Energy (Diamond & Pearl's). */
const BASIC = {
  'dp1-129': { id: 'dp1-129', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' },
  'dp1-130': { id: 'dp1-130', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' },
} as Record<string, CardDef>;
const basics = (s: GameState) => void (s.cards = { ...s.cards, ...BASIC });
const usePower = (s: GameState, source: Target, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const decks = (s: GameState) => {
  ash(s).deck = pile(10);
  misty(s).deck = pile(10);
};

describe('Great Encounters attacks', () => {
  it('Endless Darkness: Asleep with 2 coins between turns; 2 tails Knock it Out', () => {
    let s = duel('charmander', 'onix');
    basics(s);
    put(s, 'ash', 'active', mon('dp4-104', 'Darkrai', 'darkness', 100, [['Endless Darkness', [C], 40]], { stage: 'levelUp' }), ['dp1-129']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    s = attack(flips(s, false, false), 0);
    expect(misty(s).active?.card.defId).not.toBe('big-Snorlax');
    expect(misty(s).discard.some((c) => c.defId === 'big-Snorlax') || s.phase === 'promote').toBe(true);
  });

  it('Moon Skip: 1 more Prize card for a Knock Out', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-103', 'Cresselia', P, 100, [['Moon Skip', [C], 40]], { stage: 'levelUp' }), ['psychic']);
    put(s, 'misty', 'active', mon('weak', 'Caterpie', G, 40, []));
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    ash(s).prizes = pile(6);
    s = attack(s, 0);
    expect(ash(s).prizes).toHaveLength(4);
  });

  it('Carry In: a Pokémon Tool, a Supporter and a basic Energy card from the deck, and it ends', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-21', 'Lapras', W, 80, [['Carry In', [W], 0]]), ['water']);
    s.cards = { ...s.cards, 'dp4-97': trainer('dp4-97', 'Amulet Coin'), 'dp4-99': trainer('dp4-99', 'Leftovers'), 'dp1-112': trainer('dp1-112', 'Professor Rowan'), 'dp1-113': trainer('dp1-113', 'Rival') };
    // Two different cards of each kind, so each is asked (the same-card rule).
    ash(s).deck = [{ uid: 'coin', defId: 'dp4-97' }, { uid: 'leftovers', defId: 'dp4-99' }, { uid: 'rowan', defId: 'dp1-112' }, { uid: 'rival', defId: 'dp1-113' }, { uid: 'w', defId: 'water' }, { uid: 'f', defId: 'fire' }, ...pile(3)];
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ source: 'Carry In', filter: 'tool' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'coin' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'rowan' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w' });
    expect(ash(s).hand.map((c) => c.uid)).toEqual(expect.arrayContaining(['coin', 'rowan', 'w']));
  });

  it('Hydro Reflect: the Energy cards may move to the Benched Pokémon, and it ends', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-106', 'Palkia', W, 120, [['Hydro Reflect', [C], 60]], { stage: 'levelUp' }), ['water', 'water']);
    put(s, 'ash', 0, big('Lapras'));
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0, { boost: true });
    expect(after.pendingChoice).toMatchObject({ kind: 'distributeEnergy' });
    for (const end of settles(after)) expect(ash(end).bench[0]!.energy).toHaveLength(2);
  });
});

describe('Great Encounters powers', () => {
  it('Time Skip: 2 tails end the opponent\'s next turn once they draw', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-105', 'Dialga', 'metal', 110, [], { stage: 'levelUp', ...body('Time Skip') }));
    decks(s);
    s = usePower(flips(s, false, false), 'active');
    s = endTurn(s, 'ash');
    expect([s.currentPlayer, s.turn]).toEqual(['ash', 5]);
  });

  it('Time Skip: 2 heads end the player\'s own turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-105', 'Dialga', 'metal', 110, [], { stage: 'levelUp', ...body('Time Skip') }));
    decks(s);
    s = usePower(flips(s, true, true), 'active');
    expect(s.currentPlayer).toBe('misty');
  });

  it('Toxic Virus: Poisoned Pokémon take 1 more damage counter between turns', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('dp4-31', 'Weezing', P, 80, [], { stage: 'stage1', ...body('Toxic Virus') }));
    put(s, 'misty', 'active', big('Lapras')).poison = 10;
    decks(s);
    s = endTurn(s, 'ash');
    expect(misty(s).active!.damage).toBe(20);
  });

  it('Cosmic Power: up to 2 cards on the bottom, then cards drawn until 6, and it ends', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-15', 'Claydol', FI, 80, [], { stage: 'stage1', ...body('Cosmic Power') }));
    ash(s).hand = pile(3);
    ash(s).deck = pile(10);
    s = usePower(s, 'active');
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).hand[0]!.uid });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).hand[0]!.uid });
    expect([ash(s).hand.length, ash(s).deck.length, s.pendingChoice]).toEqual([6, 7, undefined]);
  });

  it('FAKE: the opponent guesses; a wrong guess draws the player a card', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('dp4-56', 'Unown F', P, 50, [], body('FAKE')));
    decks(s);
    const asked = usePower(s, 0);
    expect(asked.pendingChoice).toMatchObject({ kind: 'guess', player: 'misty' });
    const answer = (asked.pendingChoice as { answer: number }).answer;
    expect(ash(act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: 1 - answer })).hand.length).toBe(ash(s).hand.length + 1);
    expect(ash(act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: answer })).hand.length).toBe(ash(s).hand.length);
    expect(misty(act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: answer })).hand.length).toBe(misty(s).hand.length);
  });

  it('Download: a Supporter from the hand discarded and its effect used', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-49', 'Porygon2', C, 70, [], { stage: 'stage1', ...body('Download') }));
    ash(s).hand = [];
    const oak = hand(s, 'ash', trainer('dp3-122', "Professor Oak's Visit"));
    // A Water Energy among the cards drawn, so the card for the bottom is asked (the same-card rule).
    ash(s).deck = [{ uid: 'deck-water', defId: 'water' }, ...pile(5)];
    s = usePower(s, 'active');
    expect(s.pendingChoice).toMatchObject({ kind: 'supernatural', ownHand: true });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: oak });
    expect(ash(s).discard.some((c) => c.uid === oak)).toBe(true);
    expect(s.pendingChoice).toMatchObject({ kind: 'handToDeck', source: "Professor Oak's Visit" });
  });

  it('Serene Grace: evolving from the hand, basic Energy cards from the top 10 attached to any Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('togetic', 'Togetic', C, 70, [], { stage: 'stage1' }));
    put(s, 'ash', 0, big('Lapras'));
    // Two different Energy cards, so the first is asked; the last one left is taken for the player (the same-card rule).
    ash(s).deck = [{ uid: 'w1', defId: 'water' }, { uid: 'w2', defId: 'fire' }, ...pile(5)];
    const togekiss = hand(s, 'ash', mon('dp4-11', 'Togekiss', C, 120, [], { stage: 'stage2', evolvesFrom: 'Togetic', ...body('Serene Grace') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: togekiss, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'sereneGrace' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    // The Fire Energy, the only card left, needs only its Pokémon.
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    if (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect([ash(s).bench[0]!.energy.length, ash(s).active!.energy.length, s.pendingChoice]).toEqual([1, 1, undefined]);
  });

  it('Restructure: the opponent picks the player\'s Pokémon to switch in, then the player picks theirs', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-106', 'Palkia', W, 120, [], { stage: 'levelUp', ...body('Restructure') }));
    put(s, 'ash', 0, big('Lapras'));
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Onix'));
    const asked = usePower(s, 'active');
    expect(asked.pendingChoice).toMatchObject({ kind: 'oppBenchPick', player: 'misty' });
    for (const end of settles(asked)) {
      expect(end.pendingChoice).toBeUndefined();
      expect([ash(end).active!.card.defId, misty(end).active!.card.defId]).toEqual(['big-Lapras', 'big-Onix']);
    }
  });

  it("LINK: Unown L can use another Unown's attacks", () => {
    const s = duel('charmander', 'onix');
    const unownL = put(s, 'ash', 'active', mon('dp4-91', 'Unown L', P, 50, [['Hidden Power', [P, C], 0]], body('LINK')));
    put(s, 'misty', 'active', mon('dp4-57', 'Unown G', P, 50, [['Hidden Power', [P, C], 50]]));
    const names = usableAttacks(unownL, s.cards, { defender: misty(s).active, sides: [ash(s), misty(s)] }).map((a) => a.attack.damage);
    expect(names).toContain(50);
  });

  it('Anger Point: 40 more with damage counters on it', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp4-27', 'Primeape', FI, 90, [['Punch', [C], 20]], { stage: 'stage1', ...body('Anger Point') }), ['fighting']).damage = 10;
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Marvel Scale: nothing from a Pokémon LV.X', () => {
    const s = duel('charmander', 'onix');
    basics(s);
    put(s, 'ash', 'active', mon('lvx', 'Dialga', 'metal', 110, [['Punch', [C], 60]], { stage: 'levelUp' }), ['dp1-130']);
    put(s, 'misty', 'active', mon('dp4-25', 'Milotic', W, 90, [], { stage: 'stage1', ...body('Marvel Scale') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Dark Shadow: basic Darkness Energy cards do 10 more', () => {
    const s = duel('charmander', 'onix');
    basics(s);
    put(s, 'ash', 'active', mon('dark-hitter', 'Absol', 'darkness', 70, [['Bite', [C], 20]]), ['dp1-129', 'dp1-129']);
    put(s, 'ash', 0, mon('dp4-104', 'Darkrai', 'darkness', 100, [], { stage: 'levelUp', ...body('Dark Shadow') }));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Sunlight: with Lunatone in play, no Resistance for Psychic and Fighting Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('psy', 'Abra', P, 50, [['Psybeam', [C], 40]]), ['psychic']);
    put(s, 'ash', 0, mon('dp4-85', 'Solrock', FI, 70, [], body('Sunlight')));
    put(s, 'ash', 1, mon('dp4-76', 'Lunatone', FI, 60, []));
    put(s, 'misty', 'active', big('Umbreon', { resistance: { type: P, amount: 20 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });
});

describe('Great Encounters Trainers', () => {
  it('Amulet Coin draws a card and Leftovers heals at the end of the turn, as the Active Pokémon', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', big('Snorlax'));
    p.damage = 30;
    s.cards = { ...s.cards, 'dp4-99': trainer('dp4-99', 'Leftovers') };
    p.attached = [{ card: { uid: 'left', defId: 'dp4-99' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    decks(s);
    s = endTurn(s, 'ash');
    expect(ash(s).active!.damage).toBe(20);
    let t = duel('charmander', 'onix');
    const q = put(t, 'ash', 'active', big('Snorlax'));
    t.cards = { ...t.cards, 'dp4-97': trainer('dp4-97', 'Amulet Coin') };
    q.attached = [{ card: { uid: 'coin', defId: 'dp4-97' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    decks(t);
    const before = ash(t).hand.length;
    t = endTurn(t, 'ash');
    expect(ash(t).hand.length).toBe(before + 1);
  });

  it('Moonlight Stadium: Psychic and Darkness Pokémon retreat for free', () => {
    const s = duel('charmander', 'onix');
    const abra = put(s, 'ash', 'active', mon('psy', 'Abra', P, 50, [], { retreatCost: 2 }));
    const stadium = { uid: 'moon', defId: 'dp4-100' };
    s.cards = { ...s.cards, 'dp4-100': trainer('dp4-100', 'Moonlight Stadium') };
    expect(retreatCost(abra, s.cards, [ash(s), misty(s)], stadium)).toBe(0);
  });

  it('Premier Ball: a Pokémon LV.X from the deck', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, lvx: mon('lvx', 'Dialga', 'metal', 110, [], { stage: 'levelUp' }), lvx2: mon('lvx2', 'Palkia', W, 120, [], { stage: 'levelUp' }) };
    // Two different Pokémon LV.X, so the one to take is asked (the same-card rule).
    ash(s).deck = [{ uid: 'lvx-1', defId: 'lvx' }, { uid: 'lvx-2', defId: 'lvx2' }, ...pile(3)];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp4-101', 'Premier Ball')), choices: { pick: 0 } });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'lvx-1' });
    expect(ash(s).hand.some((c) => c.uid === 'lvx-1')).toBe(true);
  });

  it("Felicity's Drawing: 2 cards discarded draw 4", () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = pile(2);
    ash(s).deck = pile(6);
    const uids = ash(s).hand.map((c) => c.uid);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp4-98', "Felicity's Drawing")), choices: { handUids: uids } });
    expect(ash(s).hand).toHaveLength(4);
  });
});

void F;
