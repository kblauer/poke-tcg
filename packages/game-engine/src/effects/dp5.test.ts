import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, retreatCost, type GameState, type InPlayPokemon, type Target } from '../index.js';
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
function under(s: GameState, p: InPlayPokemon, def: PokemonCardDef) {
  s.cards = { ...s.cards, [def.id]: def };
  p.evolvedFrom.push({ uid: `${def.id}-${n++}`, defId: def.id });
}
const pile = (k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const energyCard = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'energy', name, imageUrl: null, energyType: 'colorless', basic: false } as CardDef);
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const eevee = mon('eevee', 'Eevee', C, 50, []);

describe('Majestic Dawn powers', () => {
  it('Darkness Shade and Freezing Screech: asked as they go onto the Bench, and they end', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'misty', 'active', big('Lapras'));
    const darkrai = hand(s, 'ash', mon('dp5-3', 'Darkrai', 'darkness', 80, [], body('Darkness Shade')));
    const asked = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: darkrai, slot: 0 });
    expect(asked.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'darknessShade' });
    expect(misty(act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 0 })).active!.condition).toBe('asleep');
    for (const end of settles(asked)) expect(end.pendingChoice).toBeUndefined();
    const articuno = hand(s, 'ash', mon('dp5-1', 'Articuno', W, 100, [], body('Freezing Screech')));
    const screech = act(flips(s, true), 'ash', { type: 'PLAY_BENCH', cardUid: articuno, slot: 1 });
    expect(misty(act(screech, 'ash', { type: 'RESOLVE_CHOICE', count: 0 })).active!.condition).toBe('paralyzed');
  });

  it('Sheet Lightning: heads, a damage counter on each of the opponent\'s Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'misty', 'active', big('Lapras'));
    put(s, 'misty', 0, big('Onix'));
    const zapdos = hand(s, 'ash', mon('dp5-14', 'Zapdos', L, 100, [], body('Sheet Lightning')));
    const asked = act(flips(s, true), 'ash', { type: 'PLAY_BENCH', cardUid: zapdos, slot: 0 });
    const after = act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([misty(after).active!.damage, misty(after).bench[0]!.damage]).toEqual([10, 10]);
  });

  it("Primal Swirl: the opponent's Benched Evolved Pokémon go back a stage", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('omanyte', 'Omanyte', W, 70, [], { stage: 'stage1' }));
    put(s, 'misty', 'active', big('Lapras'));
    const benched = put(s, 'misty', 0, mon('ivysaur', 'Ivysaur', G, 80, [], { stage: 'stage1' }));
    under(s, benched, mon('bulbasaur', 'Bulbasaur', G, 50, []));
    const omastar = hand(s, 'ash', mon('dp5-26', 'Omastar', W, 110, [], { stage: 'stage2', evolvesFrom: 'Omanyte', ...body('Primal Swirl') }));
    const asked = act(s, 'ash', { type: 'EVOLVE', cardUid: omastar, target: 'active' });
    expect(asked.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'primalSwirl' });
    const after = act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([misty(after).bench[0]!.card.defId, misty(after).hand.some((c) => c.defId === 'ivysaur')]).toEqual(['bulbasaur', true]);
  });

  it('Mode Crash: levelling up, every Special Energy card the opponent has in play discarded', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, dce: energyCard('dce', 'Double Colorless Energy') };
    put(s, 'ash', 'active', mon('porygonz', 'Porygon-Z', C, 110, [], { stage: 'stage2' }));
    ash(s).active!.playedTurn = 1;
    put(s, 'misty', 'active', big('Lapras'), ['dce', 'water']);
    const lvx = hand(s, 'ash', mon('dp5-100', 'Porygon-Z', C, 130, [], { stage: 'levelUp', ...body('Mode Crash') }));
    const asked = act(s, 'ash', { type: 'EVOLVE', cardUid: lvx, target: 'active' });
    expect(asked.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'modeCrash' });
    expect(misty(act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 0 })).active!.energy.map((e) => e.defId)).toEqual(['water']);
  });

  it('Sunlight Veil and Moonlight Veil: the Eeveelutions get 20 HP, no Weakness and free retreat', () => {
    const s = duel('charmander', 'onix');
    const umbreon = put(s, 'ash', 'active', mon('dp5-32', 'Umbreon', 'darkness', 80, [], { stage: 'stage1', retreatCost: 1, weakness: { type: FI, multiplier: 2 }, ...body('Moonlight Veil') }));
    under(s, umbreon, eevee);
    const espeon = put(s, 'ash', 0, mon('dp5-18', 'Espeon', P, 80, [], { stage: 'stage1', ...body('Sunlight Veil') }));
    under(s, espeon, eevee);
    expect(retreatCost(umbreon, s.cards, [ash(s), misty(s)], null)).toBe(0);
    const t = endTurn(s, 'ash');
    expect(inPlayDef(t.cards, ash(t).active!).hp).toBe(100);
    put(t, 'misty', 'active', mon('punch', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    expect(ash(attack(t, 0, undefined, 'misty')).active!.damage).toBe(30);
  });

  it('Primal Shell: no Trainer cards for the opponent, but Supporters', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'misty', 'active', mon('dp5-6', 'Kabutops', FI, 120, [], { stage: 'stage2', ...body('Primal Shell') }));
    const ball = hand(s, 'ash', trainer('dp1-110', 'Poké Ball'));
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: ball })).toMatchObject({ ok: false, error: expect.stringMatching(/Primal Shell/) });
  });

  it('Ancient Guidance: heads, a Fossil from the deck onto the Bench', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp5-67', 'Kabuto', FI, 80, [], { stage: 'stage1', ...body('Ancient Guidance') }));
    s.cards = { ...s.cards, helix: mon('helix', 'Helix Fossil', C, 50, [], { trainerText: 'x' }) };
    ash(s).deck = [{ uid: 'h', defId: 'helix' }, ...pile(3)];
    s = act(flips(s, true), 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'h' });
    expect(ash(s).bench[0]?.card.uid).toBe('h');
  });

  it("Unown Q's QUICK: attached as a Pokémon Tool, 1 less to retreat", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax', { retreatCost: 2 }));
    put(s, 'ash', 0, mon('dp5-49', 'Unown Q', P, 30, [], body('QUICK')));
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { to: 'active' } });
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)], null)).toBe(1);
  });
});

describe('Majestic Dawn attacks', () => {
  it('Restore: a Pokémon from the discard pile onto the Bench, then basic Energy cards attached, and it ends', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp5-97', 'Garchomp', C, 140, [['Restore', [], 0]], { stage: 'levelUp' }));
    s.cards = { ...s.cards, gabite: mon('gabite', 'Gabite', C, 80, [], { stage: 'stage1' }) };
    ash(s).discard = [{ uid: 'g', defId: 'gabite' }, { uid: 'f1', defId: 'fire' }, { uid: 'f2', defId: 'fire' }];
    const asked = attack(s, 0);
    expect(asked.pendingChoice).toMatchObject({ kind: 'discardToBench', filter: 'restore' });
    for (const end of settles(asked)) expect(end.pendingChoice).toBeUndefined();
    let t = act(asked, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'g' });
    t = act(t, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    t = act(t, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f2' });
    expect([ash(t).bench[0]?.card.uid, ash(t).bench[0]?.energy.length, ash(t).bench[0]?.asBasic]).toEqual(['g', 2, true]);
  });

  it('Fountain: up to 2 basic Water Energy cards to the Benched Pokémon only', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp5-8', 'Manaphy', W, 70, [['Chase Up', [C], 0], ['Fountain', [C], 30]]), ['water']);
    put(s, 'ash', 0, big('Lapras'));
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = [];
    hand(s, 'ash', s.cards.water!);
    s = attack(s, 1);
    expect(s.pendingChoice).toMatchObject({ kind: 'attachFromHand', benchOnly: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).hand[0]!.uid });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' }).ok).toBe(false);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(ash(s).bench[0]!.energy).toHaveLength(1);
  });

  it('Mega Bravo: 40 for each Fire Energy discarded', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp5-22', 'Infernape', F, 110, [['Mega Bravo', [F], 0]], { stage: 'stage2' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0);
    expect([misty(after).active!.damage, ash(after).active!.energy.length]).toEqual([120, 0]);
  });
});

describe('Majestic Dawn Trainers and Energy', () => {
  it('Call Energy: on the Active Pokémon, up to 2 Basic Pokémon onto the Bench, then the turn ends', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'dp5-92': energyCard('dp5-92', 'Call Energy') };
    put(s, 'ash', 'active', big('Snorlax'), ['dp5-92']);
    ash(s).deck = pile(6);
    misty(s).deck = pile(6);
    const uid = ash(s).active!.energy[0]!.uid;
    s = act(s, 'ash', { type: 'USE_ENERGY', cardUid: uid });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', source: 'Call Energy' });
    for (const end of settles(s)) expect(end.currentPlayer).toBe('misty');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).deck[0]!.uid });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).deck[0]!.uid });
    expect([ash(s).bench.filter(Boolean).length, s.currentPlayer]).toEqual([2, 'misty']);
  });

  it('Health Energy and Recover Energy: attached from the hand, a damage counter or the Special Conditions off', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', big('Snorlax'));
    p.damage = 30;
    p.condition = 'confused';
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', energyCard('dp5-94', 'Health Energy')), target: 'active' });
    expect(ash(s).active!.damage).toBe(20);
    s = { ...s, energyAttachedThisTurn: false };
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', energyCard('dp5-96', 'Recover Energy')), target: 'active' });
    expect(ash(s).active!.condition).toBeFalsy();
  });

  it('Dawn Stadium: Energy from the hand to a Grass or Water Pokémon heals and cures it', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', mon('lotad', 'Lotad', W, 50, []));
    p.damage = 20;
    p.poison = 10;
    s.cards = { ...s.cards, 'dp5-79': trainer('dp5-79', 'Dawn Stadium') };
    s.stadium = { card: { uid: 'dawn', defId: 'dp5-79' }, owner: 'misty' };
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.water!), target: 'active' });
    expect([ash(s).active!.damage, ash(s).active!.poison ?? 0]).toEqual([10, 0]);
  });
});
