import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, retreatCost, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, C, F, FI, G, P, W } from './test-kit.js';

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
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const DCE: CardDef = { id: 'dce', kind: 'energy', name: 'Double Colorless Energy', imageUrl: null, energyType: 'colorless', amount: 2, basic: false };
const resolve = (s: GameState, answer: { cardUid?: string; target?: Target; count?: number }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('EX FireRed & LeafGreen', () => {
  it("Fiery Aura: Burned Pokémon take 4 damage counters between turns, both players' (agreed)", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex6-13', 'Rapidash', F, 80, [], { stage: 'stage1', ...power('Fiery Aura') })).burned = true;
    put(s, 'misty', 'active', big('Snorlax')).burned = true;
    const after = endTurn(flips(s, false, false), 'ash');
    expect(ash(after).active!.damage).toBe(40);
    expect(misty(after).active!.damage).toBe(40);
  });

  it('Power Gene: 10 more for each Nidoking in play (agreed: they add up)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('nidorino', 'Nidorino', G, 70, [['Horn Attack', [C], 20]], { stage: 'stage1' }), ['fire']);
    put(s, 'ash', 0, mon('ex6-8', 'Nidoking', FI, 120, [], { stage: 'stage2', ...power('Power Gene') }));
    put(s, 'ash', 1, mon('ex6-8', 'Nidoking', FI, 120, [], { stage: 'stage2', ...power('Power Gene') }));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Retreat Aid: each Dodrio on the Bench takes 2 off the Active Pokémon\'s Retreat Cost (agreed: they add up), not a Pokémon-ex\'s', () => {
    const s = duel('charmander', 'onix');
    const active = put(s, 'ash', 'active', mon('heavy', 'Snorlax', C, 90, [], { retreatCost: 4 }));
    put(s, 'ash', 0, mon('ex6-21', 'Dodrio', C, 70, [], { stage: 'stage1', ...power('Retreat Aid') }));
    expect(retreatCost(active, s.cards, [ash(s), misty(s)])).toBe(2);
    put(s, 'ash', 1, mon('ex6-21', 'Dodrio', C, 70, [], { stage: 'stage1', ...power('Retreat Aid') }));
    expect(retreatCost(active, s.cards, [ash(s), misty(s)])).toBe(0);
    const ex = put(s, 'ash', 'active', mon('heavy-ex', 'Snorlax ex', C, 120, [], { retreatCost: 4, ex: true }));
    expect(retreatCost(ex, s.cards, [ash(s), misty(s)])).toBe(4);
  });

  it('Family Bonds: the Nidoran line retreats for free; Spiral: an opponent\'s Confused Active Pokémon can\'t retreat', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    const nidorino = put(s, 'ash', 'active', mon('nidorino', 'Nidorino', G, 70, [], { stage: 'stage1', retreatCost: 2 }));
    put(s, 'ash', 1, mon('ex6-9', 'Nidoqueen', FI, 120, [], { stage: 'stage2', ...power('Family Bonds') }));
    expect(retreatCost(nidorino, s.cards, [ash(s), misty(s)])).toBe(0);
    put(s, 'misty', 'active', mon('ex6-11', 'Poliwrath', W, 120, [], { stage: 'stage2', ...power('Spiral') }));
    nidorino.condition = 'confused';
    const res = applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] });
    expect(!res.ok && res.error).toContain('Spiral');
  });

  it("Magic Odds: an attack's final damage of 30 is prevented, 20 isn't", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30], ['Jab', [C], 20]]), ['fire']);
    put(s, 'misty', 'active', mon('ex6-110', 'Mr. Mime ex', P, 80, [], { ex: true, ...power('Magic Odds') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    expect(misty(attack(s, 1)).active!.damage).toBe(20);
  });

  it('Form Variation: Ditto takes the place of a Basic Pokémon from the discard pile, damage kept; its power works this turn (agreed)', () => {
    let s = duel('charmander', 'onix');
    const ditto = put(s, 'ash', 0, mon('ex6-4', 'Ditto', C, 60, [], power('Form Variation')));
    ditto.damage = 20;
    s.cards['ex7-21'] = mon('ex7-21', 'Delibird', W, 70, [], power('Gift Exchange'));
    s.players.ash!.discard.push({ uid: 'delibird', defId: 'ex7-21' });
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { cardUid: 'delibird' } });
    expect(ash(s).bench[0]).toMatchObject({ card: { uid: 'delibird' }, damage: 20 });
    expect(ash(s).discard.some((c) => c.defId === 'ex6-4')).toBe(true);
    expect(ash(s).bench[0]!.powerUsedTurn).toBeUndefined();
  });

  it('EXP. ALL: the Active Pokémon Knocked Out by the opponent, a basic Energy card of its goes to the Pokémon with EXP. ALL (agreed: asked first)', () => {
    let s = duel('charmander', 'onix');
    s.currentPlayer = 'misty';
    put(s, 'misty', 'active', mon('hitter', 'Machamp', FI, 100, [['Punch', [C], 100]]), ['fighting']);
    const target = put(s, 'ash', 'active', mon('weak', 'Pikachu', 'lightning', 50, []), ['lightning']);
    const holder = put(s, 'ash', 0, mon('holder', 'Raichu', 'lightning', 80, [], { stage: 'stage1' }));
    s.cards['ex6-91'] = trainer('ex6-91', 'EXP. ALL');
    holder.attached = [{ card: { uid: 'exp', defId: 'ex6-91' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    s = attack(s, 0, {}, 'misty');
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'energyGrounding', source: 'EXP. ALL' });
    s = resolve(s, { cardUid: target.energy[0]!.uid });
    const raichu = [ash(s).active, ...ash(s).bench].find((p) => p?.card.uid === holder.card.uid)!;
    expect(raichu.energy).toHaveLength(1);
    expect(raichu.attached ?? []).toHaveLength(0);
  });

  it('Burn Down: Energy providing 5 Fire Energy discarded (agreed: Double Colorless counts 2 with Energy Flame); 200 that nothing on the Defending Pokémon changes', () => {
    const s = duel('charmander', 'onix');
    s.cards.dce = DCE;
    put(s, 'ash', 'active', mon('ex6-105', 'Charizard ex', F, 160, [['Burn Down', [F, F, F, F, F], 200]], { stage: 'stage2', ex: true, ...power('Energy Flame') }), ['dce', 'dce', 'fire', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(200);
    expect(ash(after).active!.energy).toHaveLength(1);
  });

  it('Crush and Burn: 20 more for each Energy card discarded (agreed: Double Colorless is 1 card)', () => {
    const s = duel('charmander', 'onix');
    s.cards.dce = DCE;
    const electrode = put(s, 'ash', 'active', mon('ex6-107', 'Electrode ex', 'lightning', 90, [['Crush and Burn', ['lightning', C], 30]], { stage: 'stage1', ex: true }), ['lightning', 'dce']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0, { energyUids: electrode.energy.map((e) => e.uid) });
    expect(misty(after).active!.damage).toBe(70);
  });

  it("Toss and Turn can be used while Snorlax is Asleep, for 30 more; Mt. Moon stops a Pokémon with less than 70 HP's Poké-Power", () => {
    const s = duel('charmander', 'onix');
    const snorlax = put(s, 'ash', 'active', mon('ex6-15', 'Snorlax', C, 90, [['Toss and Turn', [C, C, C], 30]], power('Rest Up')), ['fire', 'fire', 'fire']);
    snorlax.condition = 'asleep';
    put(s, 'misty', 'active', big('Onix'));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    s.cards['ex6-94'] = trainer('ex6-94', 'Mt. Moon');
    s.stadium = { card: { uid: 'moon', defId: 'ex6-94' }, owner: 'misty' };
    put(s, 'ash', 0, mon('ex6-34', 'Haunter', P, 60, [], { stage: 'stage1', ...power('Head Trip') }));
    const res = applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    expect(!res.ok && res.error).toContain('Mt. Moon');
  });

  it('Acid Sampler: as the Active Pokémon, a damage counter on the opponent\'s Active Pokémon between turns; Sooth Dust heals its own', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex6-17', 'Victreebel', G, 110, [], { stage: 'stage2', ...power('Acid Sampler') }));
    put(s, 'misty', 'active', big('Snorlax'));
    const butterfree = put(s, 'misty', 0, mon('ex6-2', 'Butterfree', G, 100, [], { stage: 'stage2', ...power('Sooth Dust') }));
    butterfree.damage = 30;
    const after = endTurn(s, 'ash');
    expect(misty(after).active!.damage).toBe(10);
    // Sooth Dust works only as its player's Active Pokémon.
    expect(misty(after).bench[0]!.damage).toBe(30);
  });

  it('Legendary Ascent: played onto the Bench, its owner may switch it in, then move basic Energy cards of its type to it', () => {
    let s = duel('charmander', 'onix');
    const active = put(s, 'ash', 'active', mon('wet', 'Squirtle', W, 50, []), ['water', 'fire']);
    s.cards['ex6-114'] = mon('ex6-114', 'Articuno ex', W, 110, [], { ex: true, ...power('Legendary Ascent') });
    s.players.ash!.hand.push({ uid: 'articuno', defId: 'ex6-114' });
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: 'articuno', slot: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'legendaryAscent' });
    s = resolve(s, { count: 0 });
    expect(ash(s).active!.card.uid).toBe('articuno');
    s = resolve(s, { cardUid: active.energy[0]!.uid });
    expect(ash(s).active!.energy).toHaveLength(1);
    expect(ash(s).bench[0]!.energy.map((e) => e.defId)).toEqual(['fire']);
  });

  it('Look for Friends: cards from the top until a Basic Pokémon, which goes into the hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex6-70', 'Nidoran♀', G, 50, [['Look for Friends', [C], 0]]), ['fire']);
    s.players.ash!.deck = [{ uid: 'e1', defId: 'fire' }, { uid: 'e2', defId: 'fire' }, { uid: 'b', defId: id('squirtle') }, { uid: 'e3', defId: 'fire' }];
    const after = attack(s, 0);
    expect(ash(after).hand.some((c) => c.uid === 'b')).toBe(true);
    expect(ash(after).deck).toHaveLength(3);
  });
});
