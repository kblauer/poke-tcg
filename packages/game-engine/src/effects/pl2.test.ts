import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, inPlayDef, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, C, F, FI, G, L, P, W } from './test-kit.js';

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
const energy = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'energy', name, imageUrl: null, energyType: 'colorless', basic: false });
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

describe('Rising Rivals powers', () => {
  it("Unlucky Wind: the opponent's coins during their turn are tails", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-87', 'Psyduck', W, 60, [['Headache', [], 0], ['Latent Power', [C], 30]]), ['water']);
    put(s, 'misty', 'active', mon('pl2-13', 'Shiftry', 'darkness', 300, [], { stage: 'stage2', ...body('Unlucky Wind') }));
    ash(s).hand = [{ uid: 'w1', defId: 'water' }];
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'w1', target: 'active' });
    const after = attack(flips(s, true), 1);
    expect([misty(after).active!.damage, ash(after).active!.condition]).toEqual([0, 'confused']);
  });

  it('Boundary Aura: every Weakness is ×2', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: 'fighting', multiplier: 2, plus: 20 } }));
    put(s, 'misty', 0, mon('pl2-8', 'Lucario GL', FI, 80, [], body('Boundary Aura')));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Sticky Hold: retreated to the Bench, its Energy cards may move to the new Active Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-21', 'Gastrodon East Sea', W, 90, [], { stage: 'stage1', retreatCost: 1, ...body('Sticky Hold') }), ['water', 'fire']);
    put(s, 'ash', 0, big('Snorlax'));
    const water = ash(s).active!.energy[0]!.uid;
    s = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [water] });
    expect(s.pendingChoice).toMatchObject({ kind: 'shiftEnergy', from: 0, to: 'active' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).bench[0]!.energy[0]!.uid });
    expect(ash(s).active!.energy.length).toBe(1);
  });

  it("Territoriality: the player's Active Pokémon damaged, 2 damage counters on the attacker", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, mon('pl2-29', 'Nidoking', FI, 130, [], { stage: 'stage2', ...body('Territoriality') }));
    put(s, 'misty', 1, mon('pl2-29', 'Nidoking', FI, 130, [], { stage: 'stage2', ...body('Territoriality') }));
    expect(ash(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Frost Wind and Sand Armor: 10 less, after Weakness and Resistance', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('pl2-41', 'Glaceon', W, 80, [], { stage: 'stage1', ...body('Frost Wind') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    put(s, 'misty', 'active', mon('pl2-42', 'Hippowdon E4', FI, 90, [], body('Sand Armor')), ['fighting']);
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Energy Refresh: an Energy card attached from the hand takes 2 damage counters off its Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-45', 'Leafeon', G, 90, [], { stage: 'stage1', ...body('Energy Refresh') }));
    put(s, 'ash', 0, big('Snorlax')).damage = 50;
    ash(s).hand = [{ uid: 'g1', defId: 'grass' }];
    expect(ash(act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'g1', target: 0 })).bench[0]!.damage).toBe(30);
  });

  it('Colorful Body: Kecleon is every type', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-67', 'Kecleon', C, 70, [], body('Colorful Body')));
    s = endTurn(s, 'ash');
    expect(inPlayDef(s.cards, ash(s).active!).types?.length).toBe(9);
  });

  it("Bad Sleeping Habits: while Snorlax is Asleep, the opponent's Active Pokémon can't retreat", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Lapras', { retreatCost: 0 }));
    put(s, 'ash', 0, big('Snorlax2'));
    put(s, 'misty', 'active', mon('pl2-81', 'Snorlax', C, 100, [], body('Bad Sleeping Habits'))).condition = 'asleep';
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(false);
    misty(s).active!.condition = null;
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });

  it('Overgrow: with 60 HP or less left, 30 more', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-85', 'Turtwig GL', G, 90, [['Bite', [C], 20]], body('Overgrow')), ['grass']).damage = 30;
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it('Camouflage Gas: Knocked Out while Confused, no Prize card', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(100), ['fighting']);
    const weezing = put(s, 'misty', 'active', mon('pl2-87', 'Weezing', P, 80, [], { stage: 'stage1', ...body('Camouflage Gas') }));
    weezing.condition = 'confused';
    put(s, 'misty', 0, big('Snorlax'));
    const before = ash(s).prizes.length;
    expect(ash(attack(s, 0)).prizes.length).toBe(before);
  });

  it('Water Rescue: a Knocked Out Water Pokémon may go back into the hand, asked between turns', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(100), ['fighting']);
    put(s, 'misty', 'active', mon('lapras-x', 'Lapras', W, 80, []), ['water']);
    put(s, 'misty', 0, mon('pl2-104', 'Floatzel GL', W, 100, [], { stage: 'levelUp', ...body('Water Rescue') }));
    decks(s);
    s = attack(s, 0);
    const asked = s.pendingChoice?.kind === 'waterRescue' ? s : s;
    expect(asked.pendingChoice).toMatchObject({ kind: 'waterRescue', player: 'misty' });
    const yes = act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(misty(yes).hand.some((c) => c.defId === 'lapras-x') && misty(yes).hand.some((c) => c.defId === 'water')).toBe(true);
    for (const end of settles(asked)) expect(end.pendingChoice?.kind).not.toBe('waterRescue');
  });

  it('Maternal Comfort: a damage counter off each Pokémon between turns, once however many Nidoqueen', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-30', 'Nidoqueen', P, 120, [], { stage: 'stage2', ...body('Maternal Comfort') })).damage = 30;
    put(s, 'ash', 0, mon('pl2-30', 'Nidoqueen', P, 120, [], { stage: 'stage2', ...body('Maternal Comfort') })).damage = 30;
    decks(s);
    s = endTurn(s, 'ash');
    expect([ash(s).active!.damage, ash(s).bench[0]!.damage]).toEqual([20, 20]);
  });

  it('Undevelop: the Eeveelution goes back into the hand, Eevee stays', () => {
    const s = duel('charmander', 'onix');
    const flareon = put(s, 'ash', 'active', mon('pl2-19', 'Flareon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Eevee', ...body('Undevelop') }));
    flareon.evolvedFrom.push({ uid: 'eevee', defId: id('charmander') });
    const after = usePower(s, 'active');
    expect([ash(after).hand.some((c) => c.defId === 'pl2-19'), ash(after).active!.card.uid]).toEqual([true, 'eevee']);
  });

  it('Final Wish: Knocked Out by attack damage, a card from the deck into the hand', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(100), ['fighting']);
    put(s, 'misty', 'active', mon('pl2-7', 'Jirachi', 'metal', 60, [], body('Final Wish')));
    put(s, 'misty', 0, big('Snorlax'));
    misty(s).deck = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }];
    misty(s).hand = [];
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ source: 'Final Wish', player: 'misty', kind: 'pickFromDeck' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    expect(misty(s).hand.map((c) => c.uid)).toEqual(['f1']);
  });

  it('Sand Reset: Energy, Tools and Stadiums in play shuffled into the decks, once a game', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-107', 'Hippowdon', FI, 130, [], { stage: 'levelUp', ...body('Sand Reset') }), ['fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax'), ['water']);
    stadium(s, 'pl1-104', 'Broken Time-Space');
    const after = usePower(s, 'active');
    expect([ash(after).active!.energy.length, misty(after).active!.energy.length, after.stadium, misty(after).deck.some((c) => c.defId === 'pl1-104')]).toEqual([0, 0, null, true]);
    expect(applyAction({ ...after, turn: after.turn + 2 }, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });

  it('Rainbow Float: Pokémon of a type of a basic Energy card on Flygon retreat for free', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('water-x', 'Lapras', W, 80, [], { retreatCost: 2 }));
    put(s, 'ash', 0, mon('pl2-5', 'Flygon', C, 120, [], { stage: 'stage2', ...body('Rainbow Float') }), ['water']);
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });
});

describe('Rising Rivals attacks', () => {
  it('Crunch: attack damage to the Defending Pokémon is 40 more until the end of the next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-49', 'Sharpedo', 'darkness', 90, [['Crunch', [C], 20]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(s, 0);
    s = endTurn(s, 'misty');
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
  });

  it('Seal Off: no Poké-Powers or Poké-Bodies for the Defending Pokémon next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-13', 'Shiftry', 'darkness', 130, [['Conform', [C], 40], ['Seal Off', [C], 60]], { stage: 'stage2' }), ['fire']);
    put(s, 'misty', 'active', mon('pl1-3', 'Blaziken', F, 300, [], { stage: 'stage2', ...body('Fire Breath') }));
    decks(s);
    s = attack(s, 1);
    expect(applyAction(s, 'misty', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });

  it('Needle Shock: no Special Conditions after Needle Shock last turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-15', 'Beedrill', G, 110, [['Needle Shock', [C], 30]], { stage: 'stage2' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(s, 0);
    expect(misty(s).active!.condition).toBe('paralyzed');
    s = endTurn(s, 'misty');
    misty(s).active!.condition = null;
    misty(s).active!.poison = undefined;
    s = attack(s, 0);
    expect([misty(s).active!.condition, misty(s).active!.poison]).toEqual([null, undefined]);
  });

  it('Brush Off: the Defending Pokémon and its cards shuffled into the deck', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-46', 'Machamp GL', FI, 100, [['Brush Off', [C], 0]]), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'), ['water']);
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    s = attack(s, 0);
    expect([misty(s).deck.some((c) => c.defId === 'big-Snorlax'), misty(s).deck.some((c) => c.defId === 'water')]).toEqual([true, true]);
  });

  it('Calling Wave: up to 2 Gastrodon onto the Bench as Basic Pokémon, 2 damage counters on each', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-21', 'Gastrodon East Sea', W, 90, [['Calling Wave', [C], 0]], { stage: 'stage1' }), ['water']);
    s.cards = { ...s.cards, gw: mon('gw', 'Gastrodon West Sea', FI, 110, [], { stage: 'stage1' }), ge: mon('ge', 'Gastrodon East Sea', W, 90, [], { stage: 'stage1' }) };
    ash(s).deck = [{ uid: 'gw1', defId: 'gw' }, { uid: 'ge1', defId: 'ge' }, ...pile(3)];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'gw1' });
    expect([ash(s).bench[0]?.damage, ash(s).bench[0]?.asBasic, ash(s).bench[1]?.damage]).toEqual([20, true, 20]);
  });

  it('Exercise: Energy cards discarded from the hand, a damage counter off Snorlax for each', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl2-111', 'Snorlax', C, 130, [['Exercise', [C], 80]], { stage: 'levelUp' }), ['fire']).damage = 50;
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect([ash(s).active!.damage, ash(s).hand.map((c) => c.uid)]).toEqual([40, ['f1']]);
  });
});

describe('Rising Rivals Trainers and Energy', () => {
  it("Charon's Choice: a Rotom from the deck takes the place of one in play, and the card goes back into the hand", () => {
    let s = duel('charmander', 'onix');
    const heat = put(s, 'ash', 'active', mon('heat-rotom', 'Heat Rotom', L, 80, []), ['fire']);
    heat.damage = 20;
    heat.condition = 'paralyzed';
    s.cards = { ...s.cards, 'wash-rotom': mon('wash-rotom', 'Wash Rotom', L, 90, []), 'pl2-RT6': trainer('pl2-RT6', "Charon's Choice") };
    ash(s).deck = [{ uid: 'wash', defId: 'wash-rotom' }, ...pile(3)];
    ash(s).hand = [{ uid: 'charon', defId: 'pl2-RT6' }];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'charon', choices: { target: 'active' } });
    expect([ash(s).active!.card.uid, ash(s).active!.damage, ash(s).active!.condition ?? null, ash(s).active!.energy.length, ash(s).deck.some((c) => c.defId === 'heat-rotom')]).toEqual(['wash', 20, null, 1, true]);
    decks(s);
    s = endTurn(s, 'ash');
    expect(ash(s).hand.some((c) => c.uid === 'charon')).toBe(true);
  });

  it('Pokémon Contest Hall: heads, a Basic Pokémon onto the Bench, then a Pokémon Tool attached to it', () => {
    let s = duel('charmander', 'onix');
    stadium(s, 'pl2-93', 'Pokémon Contest Hall');
    s.cards = { ...s.cards, 'pl1-110': trainer('pl1-110', 'Memory Berry'), squirtle: mon('squirtle-x', 'Squirtle', W, 50, []), 'squirtle-x': mon('squirtle-x', 'Squirtle', W, 50, []) };
    ash(s).deck = [{ uid: 'sq', defId: 'squirtle-x' }, { uid: 'berry', defId: 'pl1-110' }, ...pile(3)];
    s = act(flips(s, true), 'ash', { type: 'USE_STADIUM' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'sq' });
    // The deck's only Pokémon Tool is taken without asking (the same-card rule).
    expect(ash(s).bench[0]?.attached?.map((a) => a.card.uid)).toEqual(['berry']);
  });

  it('SP Energy: every type on a Pokémon SP, Colorless otherwise; Upper Energy: 2 Colorless while behind on Prize cards', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'pl2-101': energy('pl2-101', 'SP Energy'), 'pl2-102': energy('pl2-102', 'Upper Energy') };
    put(s, 'ash', 'active', mon('crobat-g', 'Crobat G', P, 80, []), ['pl2-101']);
    put(s, 'ash', 0, big('Snorlax'), ['pl2-101', 'pl2-102']);
    misty(s).prizes = misty(s).prizes.slice(0, 3);
    s = endTurn(s, 'ash');
    expect([energyPool(ash(s).active!, s.cards), energyPool(ash(s).bench[0]!, s.cards)]).toEqual([['any'], ['colorless', 'colorless', 'colorless']]);
  });

  it('Technical Machine G: discarded from a Pokémon that is no longer a Pokémon SP', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'pl2-95': trainer('pl2-95', "Team Galactic's Invention G-107 Technical Machine G") };
    put(s, 'ash', 'active', big('Snorlax')).attached = [{ card: { uid: 'tm', defId: 'pl2-95' }, until: Number.MAX_SAFE_INTEGER }];
    s = endTurn(s, 'ash');
    expect([ash(s).active!.attached?.length ?? 0, ash(s).discard.some((c) => c.uid === 'tm')]).toEqual([0, true]);
  });

  it('Sunyshore City Gym: Lightning Pokémon ignore Resistance and have no Weakness', () => {
    const s = duel('charmander', 'onix');
    stadium(s, 'pl2-94', 'Sunyshore City Gym');
    put(s, 'ash', 'active', mon('zap', 'Pikachu', L, 60, [['Shock', [C], 30]]), ['lightning']);
    put(s, 'misty', 'active', big('Snorlax', { resistance: { type: 'lightning', amount: 30 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });
});
