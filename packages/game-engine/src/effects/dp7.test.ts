import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, createGame, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, CARDS, duel, endTurn, flips, id, mon, settles, C, F, FI, G, L, P, W } from './test-kit.js';

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
function under(s: GameState, p: InPlayPokemon, def: PokemonCardDef) {
  s.cards = { ...s.cards, [def.id]: def };
  p.evolvedFrom.push({ uid: `${def.id}-${n++}`, defId: def.id });
}
const pile = (k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const hitter = (damage: number, extra: Partial<PokemonCardDef> = {}) => mon(`hitter-${damage}`, 'Machop', FI, 300, [['Punch', [C], damage]], extra);
const usePower = (s: GameState, source: Target, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const decks = (s: GameState) => {
  ash(s).deck = pile(10);
  misty(s).deck = pile(10);
};

describe('Stormfront powers', () => {
  it('Ectoplasm: Dusknoir LV.X Knocked Out goes into play as a Stadium card, and damages each of the opponent\'s Pokémon between turns', () => {
    let s = duel('charmander', 'onix');
    const dusknoir = put(s, 'ash', 'active', mon('dp7-96', 'Dusknoir', P, 140, [], { stage: 'levelUp', ...body('Ectoplasm') }));
    under(s, dusknoir, mon('dusknoir', 'Dusknoir', P, 120, [], { stage: 'stage2' }));
    dusknoir.levelUpFrom = 'dusknoir';
    put(s, 'ash', 0, big('Snorlax'));
    put(s, 'misty', 'active', hitter(200), ['fighting']);
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    ash(s).prizes = pile(6);
    misty(s).prizes = pile(6);
    s = endTurn(s, 'ash');
    s = attack(s, 0, undefined, 'misty');
    expect([s.stadium?.card.defId, s.stadium?.owner, misty(s).prizes.length]).toEqual(['dp7-96', 'ash', 5]);
    if (s.phase === 'promote') s = act(s, 'ash', { type: 'PROMOTE', slot: 0 });
    // Between the opponent's turn and this one, and again now.
    s = endTurn(s, 'ash');
    expect(misty(s).bench[0]!.damage).toBe(20);
    // Another Stadium sends Dusknoir LV.X back to its owner's hand.
    s = act(s, 'misty', { type: 'PLAY_TRAINER', cardUid: hand(s, 'misty', trainer('dp6-134', 'Snowpoint Temple')) });
    expect(ash(s).hand.some((c) => c.defId === 'dp7-96')).toBe(true);
  });

  it('Overeager: the player whose Active Pokémon has it goes first', () => {
    const cards = { ...CARDS, 'dp7-48': mon('dp7-48', 'Sableye', 'darkness', 60, [], body('Overeager')) };
    const deck = Array<string>(20).fill(id('charmander'));
    let s = createGame({ id: 'ash', deck: ['dp7-48', ...deck] }, { id: 'misty', deck }, 1, cards);
    const first = s.currentPlayer;
    s.players.ash!.hand.push({ uid: 'sab', defId: 'dp7-48' });
    s = act(s, 'ash', { type: 'SET_ACTIVE', cardUid: 'sab' });
    const basic = misty(s).hand.find((c) => c.defId === id('charmander'))!;
    s = act(s, 'misty', { type: 'SET_ACTIVE', cardUid: basic.uid });
    s = act(act(s, 'ash', { type: 'START_BATTLE' }), 'misty', { type: 'START_BATTLE' });
    expect(s.currentPlayer).toBe('ash');
    void first;
  });

  it('Energy Link: Energy cards moved between Pokémon with Energy Link', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'dp7-83': trainer('dp7-83', 'Energy Link') };
    const a = put(s, 'ash', 'active', big('Snorlax'), ['water', 'water']);
    const b = put(s, 'ash', 0, big('Lapras'));
    a.attached = [{ card: { uid: 'l1', defId: 'dp7-83' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    b.attached = [{ card: { uid: 'l2', defId: 'dp7-83' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    s = act(s, 'ash', { type: 'USE_TOOL', target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'shiftEnergy', from: 'active', to: 0 });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: a.energy[0]!.uid });
    if (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(ash(s).bench[0]!.energy).toHaveLength(1);
  });

  it('Heat Metal: the opponent\'s Burned Pokémon stay Burned', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-97', 'Heatran', F, 120, [], { stage: 'levelUp', ...body('Heat Metal') }));
    put(s, 'misty', 'active', big('Lapras')).burned = true;
    decks(s);
    s = endTurn(flips(s, true, true, true), 'ash');
    expect(misty(s).active!.burned).toBe(true);
  });

  it('No Guard: 60 more damage both ways', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-98', 'Machamp', FI, 150, [['Punch', [C], 20]], { stage: 'levelUp', ...body('No Guard') }), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
    const t = duel('charmander', 'onix');
    put(t, 'ash', 'active', hitter(20), ['fighting']);
    put(t, 'misty', 'active', mon('dp7-98', 'Machamp', FI, 150, [], { stage: 'levelUp', ...body('No Guard') }));
    expect(misty(attack(t, 0)).active!.damage).toBe(80);
  });

  it('Battle Rush: no Colorless Energy needed while the opponent has a Pokémon of 120 HP or more', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-24', 'Salamence', C, 140, [['Dragon Claw', [F, C, C], 80]], { stage: 'stage2', ...body('Battle Rush') }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
  });

  it('Sacrifice: one of the player\'s Pokémon Knocked Out, then its Energy cards can go on Regigigas LV.X', () => {
    let s = duel('charmander', 'onix');
    const gigas = put(s, 'ash', 'active', mon('dp7-100', 'Regigigas', C, 150, [], { stage: 'levelUp', ...body('Sacrifice') }));
    gigas.damage = 90;
    // Two different Energy cards, so where they go is asked (the same-card rule).
    put(s, 'ash', 0, big('Snorlax'), ['water', 'fire']);
    misty(s).prizes = pile(6);
    s = usePower(s, 'active', { to: 0 });
    expect([ash(s).bench[0], misty(s).prizes.length, ash(s).active!.damage]).toEqual([null, 5, 10]);
    expect(s.pendingChoice).toMatchObject({ kind: 'attachFromDiscard', source: 'Sacrifice' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
  });

  it('Shadow Command: 2 cards drawn, discarded down to 6, 2 damage counters on Dusknoir', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-1', 'Dusknoir', P, 120, [], { stage: 'stage2', ...body('Shadow Command') }));
    ash(s).hand = pile(6);
    // A Water Energy drawn, so the cards to discard are asked (the same-card rule).
    ash(s).deck = [{ uid: 'deck-water', defId: 'water' }, ...pile(4)];
    s = usePower(s, 'active');
    expect([ash(s).hand.length, ash(s).active!.damage]).toEqual([8, 20]);
    for (const end of settles(s)) expect(ash(end).hand).toHaveLength(6);
  });

  it('Fainting Spell: Knocked Out by an attack, heads Knocks Out the Defending Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-18', 'Gengar', P, 110, [], { stage: 'stage2', ...body('Fainting Spell') }));
    put(s, 'ash', 0, big('Snorlax'));
    put(s, 'misty', 'active', mon('punch', 'Machop', FI, 60, [['Punch', [C], 200]]), ['fighting']);
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    s = endTurn(s, 'ash');
    s = attack(flips(s, true), 0, undefined, 'misty');
    expect(misty(s).discard.some((c) => c.defId === 'punch')).toBe(true);
  });

  it('Emperor Aura: evolving the Active Pokémon, no Energy from the hand for the opponent next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('prinplup', 'Prinplup', W, 80, [], { stage: 'stage1' }));
    put(s, 'misty', 'active', big('Lapras'));
    decks(s);
    const empoleon = hand(s, 'ash', mon('dp7-2', 'Empoleon', 'metal', 130, [], { stage: 'stage2', evolvesFrom: 'Prinplup', ...body('Emperor Aura') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: empoleon, target: 'active' });
    s = endTurn(act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 }), 'ash');
    const water = hand(s, 'misty', s.cards.water!);
    expect(applyAction(s, 'misty', { type: 'ATTACH_ENERGY', cardUid: water, target: 'active' })).toMatchObject({ ok: false, error: expect.stringMatching(/Emperor Aura/) });
  });
});

describe('Stormfront attacks', () => {
  it('Land Shake: Basic Pokémon the opponent benches next turn get 2 damage counters', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-11', 'Torterra', FI, 140, [['Crash Impact', [C], 60], ['Land Shake', [C], 80]], { stage: 'stage2' }), ['grass']);
    put(s, 'misty', 'active', big('Lapras'));
    decks(s);
    s = attack(s, 1);
    const basic = hand(s, 'misty', mon('vulpix', 'Vulpix', F, 50, []));
    s = act(s, 'misty', { type: 'PLAY_BENCH', cardUid: basic, slot: 0 });
    expect(misty(s).bench[0]!.damage).toBe(20);
  });

  it('Impersonate: a Supporter from the deck discarded and its effect used', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-48', 'Sableye', 'darkness', 60, [['Impersonate', [], 0]]));
    put(s, 'misty', 'active', big('Lapras'));
    s.cards = { ...s.cards, 'dp3-126': trainer('dp3-126', "Team Galactic's Mars"), 'dp1-112': trainer('dp1-112', 'Professor Rowan') };
    // Two different Supporters, so the one to use is asked (the same-card rule).
    ash(s).deck = [{ uid: 'mars', defId: 'dp3-126' }, { uid: 'rowan', defId: 'dp1-112' }, ...pile(5)];
    misty(s).hand = pile(2);
    const handBefore = ash(s).hand.length;
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'mars' });
    expect([ash(s).discard.some((c) => c.uid === 'mars'), ash(s).hand.length - handBefore]).toEqual([true, 2]);
    expect((s.log ?? []).some((e) => e.text.includes('on the bottom of their deck'))).toBe(true);
  });

  it('Take Out: a Defending Pokémon that isn\'t Evolved is Knocked Out', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-20', 'Machamp', FI, 130, [['Take Out', [C], 40]], { stage: 'stage2' }), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    const after = attack(s, 0);
    expect(misty(after).discard.some((c) => c.defId === 'big-Snorlax')).toBe(true);
  });

  it('Night Spin: next turn, nothing from a Pokémon with 2 Energy or less', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-1', 'Dusknoir', P, 120, [['Damage Even', [C], 0], ['Night Spin', [C], 50]], { stage: 'stage2' }), ['psychic']);
    put(s, 'misty', 'active', hitter(60), ['fighting', 'fighting']);
    decks(s);
    s = attack(s, 1);
    expect(ash(attack(s, 0, undefined, 'misty')).active!.damage).toBe(0);
  });

  it('Link Lightning: after Voltage Shoot the turn Raichu LV.X levelled up, another attack', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('raichu', 'Raichu', L, 90, [['Thunder', [C], 30]], { stage: 'stage1' }), ['lightning', 'lightning', 'lightning']);
    ash(s).active!.playedTurn = 1;
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    hand(s, 'ash', s.cards.lightning!);
    hand(s, 'ash', s.cards.lightning!);
    const lvx = hand(s, 'ash', mon('dp7-99', 'Raichu', L, 110, [['Voltage Shoot', [C], 0]], { stage: 'levelUp', ...body('Link Lightning') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: lvx, target: 'active' });
    s = attack(s, 0, { oppTarget: 'active' });
    // The turn stays open for one more attack (not Voltage Shoot) or End Turn, and nothing else.
    expect([s.currentPlayer, s.pendingChoice]).toEqual(['ash', undefined]);
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0, choices: { oppTarget: 'active' } })).toMatchObject({ ok: false, error: expect.stringMatching(/Link Lightning/) });
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: ash(s).hand[0]!.uid, target: 'active' })).toMatchObject({ ok: false, error: expect.stringMatching(/Link Lightning/) });
    const ended = act(s, 'ash', { type: 'END_TURN' });
    expect([misty(ended).active!.damage, ended.currentPlayer]).toEqual([80, 'misty']);
    s = attack(s, 1);
    expect([misty(s).active!.damage, s.currentPlayer]).toEqual([110, 'misty']);
  });

  it('Ramming Strike: coins until tails, and the player may start again with 2 damage counters on Mamoswine', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-21', 'Mamoswine', W, 140, [['Ramming Strike', [C], 0]], { stage: 'stage2' }), ['water']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(flips(s, true, true, false), 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'rammingStrike', heads: 2 });
    s = act(flips(s, true, false), 'ash', { type: 'RESOLVE_CHOICE', count: 1 });
    expect([ash(s).active!.damage, s.pendingChoice]).toMatchObject([20, { kind: 'rammingStrike', heads: 1 }]);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([misty(s).active!.damage, s.currentPlayer]).toEqual([30, 'misty']);
  });

  it('Ramming Strike: no starting again when 2 damage counters would Knock Out Mamoswine', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-21', 'Mamoswine', W, 140, [['Ramming Strike', [C], 0]], { stage: 'stage2' }), ['water']).damage = 120;
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(flips(s, false), 0);
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', count: 1 }).ok).toBe(false);
    for (const end of settles(s)) expect([ash(end).active!.damage, end.currentPlayer]).toEqual([120, 'misty']);
  });

  it('Burst Ball: exactly 3 Energy cards, picked from any of the Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-8', 'Raichu', L, 100, [['Burst Ball', [C], 100]], { stage: 'stage1' }), ['lightning', 'lightning', 'water']);
    put(s, 'ash', 0, big('Snorlax'), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    const [, l2, w] = ash(s).active!.energy;
    const fire = ash(s).bench[0]!.energy[0]!;
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0, choices: { energyUids: [l2!.uid, w!.uid] } }).ok).toBe(false);
    s = attack(s, 0, { energyUids: [l2!.uid, w!.uid, fire.uid] });
    expect([ash(s).active!.energy.length, ash(s).bench[0]!.energy.length, misty(s).active!.damage]).toEqual([1, 0, 100]);
  });

  it('Lifting: a basic Energy card for each Basic Pokémon it put onto the Bench, only for those', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-16', 'Drifblim', P, 100, [['Lifting', [C], 0]], { stage: 'stage1' }), ['water']);
    put(s, 'ash', 0, big('Snorlax'));
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    ash(s).deck = [{ uid: 'sq', defId: id('squirtle') }, { uid: 'ch', defId: id('charmander') }, { uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'sq' });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'basicEnergy', attachTo: 1 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    // The Charmander was the only Basic left and the Fire Energy the only Energy, so they went without asking.
    expect([ash(s).bench.map((p) => p?.energy.map((e) => e.uid)), s.currentPlayer]).toEqual([[[], ['w1'], ['f1'], undefined, undefined], 'misty']);
  });

  it('Evolutionary Gas: the attack can be used and does nothing', () => {
    let s = duel('charmander', 'onix');
    (put(s, 'ash', 'active', hitter(30), ['fighting']).effects ??= {}).fizzle = s.turn;
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(s, 0);
    expect([misty(s).active!.damage, s.currentPlayer]).toEqual([0, 'misty']);
  });

  it('Pitch-Dark: no Trainer cards at all next turn, Supporters too', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp7-62', 'Gastly', P, 50, [['Pitch-Dark', [C], 0]]), ['water']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(s, 0);
    expect(misty(s).noTrainersUntil).toBe(s.turn);
  });
});

describe('Stormfront Trainers', () => {
  it("Poké Drawer +: 2 played at once find any 2 cards", () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    // A Water Energy in the deck, so the cards to take are asked (the same-card rule).
    ash(s).deck = [{ uid: 'deck-water', defId: 'water' }, ...pile(4)];
    hand(s, 'ash', trainer('dp7-89', 'Poké Drawer +'));
    const first = hand(s, 'ash', trainer('dp7-89', 'Poké Drawer +'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: first, choices: { pick: 1 } });
    expect([ash(s).discard.filter((c) => c.defId === 'dp7-89').length, s.pendingChoice]).toMatchObject([2, { kind: 'pickFromDeck', count: 2 }]);
  });

  it("Marley's Request: the opponent picks which of 2 Trainer cards goes into the hand", () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, a: trainer('a', 'Potion'), b: trainer('b', 'Switch') };
    ash(s).discard = [{ uid: 'ta', defId: 'a' }, { uid: 'tb', defId: 'b' }];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp7-87', "Marley's Request")), choices: { discardUids: ['ta', 'tb'] } });
    expect(s.pendingChoice).toMatchObject({ kind: 'marley', player: 'misty' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'tb' });
    expect(ash(s).hand.some((c) => c.uid === 'tb')).toBe(true);
  });

  it('Luxury Ball: not with a Luxury Ball in the discard pile', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'dp7-86': trainer('dp7-86', 'Luxury Ball') };
    ash(s).discard = [{ uid: 'old', defId: 'dp7-86' }];
    ash(s).deck = pile(3);
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp7-86', 'Luxury Ball')) }).ok).toBe(false);
  });
});

void G;
