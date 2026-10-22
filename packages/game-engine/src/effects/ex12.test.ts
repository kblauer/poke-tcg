import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, tryAttack, C, F, FI, G, P, W } from './test-kit.js';

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
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const REACT: CardDef = { id: 'ex12-82', kind: 'energy', name: 'React Energy', imageUrl: null, energyType: 'colorless', basic: false };
const evolved = (p: InPlayPokemon) => (p.evolvedFrom = [{ uid: `under-${n++}`, defId: 'charmander' }]);

describe('EX Legend Maker', () => {
  it("Stench: as the Active Pokémon, no Pokémon can use Poké-Powers", () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex12-11', 'Muk', G, 70, [], { stage: 'stage1', ...power('Stench') }));
    put(s, 'ash', 0, mon('ex13-35', 'Aerodactyl δ', F, 70, [], { stage: 'stage1', ...power('Primal Light') }));
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(false);
  });

  it('Reactive Booster: React Energy on Huntail provides 2 Energy of every type', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'ex12-82': REACT };
    put(s, 'ash', 0, mon('ex12-17', 'Gorebyss', W, 70, [], { stage: 'stage1', ...power('Reactive Booster') }));
    put(s, 'ash', 1, mon('huntail', 'Huntail', W, 80, [], { stage: 'stage1' }), ['ex12-82']);
    s = endTurn(s, 'ash');
    expect(energyPool(ash(s).bench[1]!, s.cards)).toEqual(['any', 'any']);
  });

  it("Wobbuffet's Stages of Evolution: the opponent's Active Pokémon costs 1 more to retreat", () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('free', 'Pidgey', C, 50, [], { retreatCost: 0 }));
    const wob = put(s, 'misty', 0, mon('ex12-28', 'Wobbuffet', P, 80, [], power('Stages of Evolution')));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
    evolved(wob);
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(false);
  });

  it("Pattern Distraction: the opponent's Basic Pokémon's attack does nothing on tails", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('basic', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    put(s, 'misty', 'active', mon('ex12-26', 'Spinda', C, 300, [], power('Pattern Distraction')));
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(0);
    expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(30);
  });

  it('Ancient Protection: the Omanyte and Kabuto lines have no Weakness', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('grassy', 'Oddish', G, 50, [['Leaf', [C], 20]]), ['grass']);
    put(s, 'misty', 'active', mon('omastar', 'Omastar', W, 100, [], { stage: 'stage2', weakness: { type: 'grass', multiplier: 2 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    put(s, 'misty', 0, mon('ex12-36', 'Kabuto', FI, 60, [], { stage: 'stage1', ...power('Ancient Protection') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Shadow Curse: Knocked Out by an attack, Gengar may put 3 damage counters on one of the opponent\'s Pokémon', () => {
    const s = duel('charmander', 'onix', { oppBench: ['onix'] });
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 300, [['Punch', [C], 30]]), ['fighting']);
    const gengar = put(s, 'misty', 'active', mon('ex12-5', 'Gengar', P, 100, [], { stage: 'stage2', ...power('Shadow Curse') }));
    gengar.damage = 90;
    const after = attack(s, 0);
    const asked = [after.pendingChoice, ...(after.queuedChoices ?? [])].find((c) => c?.source === 'Shadow Curse');
    expect(asked).toMatchObject({ kind: 'placeCounters', count: 3, together: true, optional: true });
  });

  it('Giant Stump: 3 Benched Pokémon at most; played, its player discards down to 3', () => {
    let s = duel('charmander', 'onix', { bench: ['charmander', 'charmander', 'charmander', 'charmander'] });
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex12-75', 'Giant Stump')) });
    expect(s.pendingChoice).toMatchObject({ kind: 'narrowGym', limit: 3, discard: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(ash(s).bench.filter(Boolean)).toHaveLength(3);
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: hand(s, 'ash', s.cards[id('charmander')]!), slot: 0 }).ok).toBe(false);
  });

  it('Strange Cave: a Fossil Pokémon from the hand onto the Bench, as a Basic Pokémon', () => {
    let s = duel('charmander', 'onix');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex12-77', 'Strange Cave')) });
    const kabuto = hand(s, 'ash', mon('kabuto', 'Kabuto', FI, 60, [], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil' }));
    s = act(s, 'ash', { type: 'USE_STADIUM' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: kabuto });
    expect(ash(s).bench[0]).toMatchObject({ asBasic: true });
  });

  it('Full Flame: Burned does 4 damage counters, and evolving keeps it', () => {
    let s = duel('charmander', 'onix');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex12-74', 'Full Flame')) });
    misty(s).active!.burned = true;
    s = endTurn(flips(s, false), 'ash');
    expect(misty(s).active!.damage).toBe(40);
    const evo = hand(s, 'misty', mon('steelix', 'Steelix', 'metal', 120, [], { stage: 'stage1', evolvesFrom: 'Onix' }));
    misty(s).active!.playedTurn = 0;
    s = act(s, 'misty', { type: 'EVOLVE', cardUid: evo, target: 'active' });
    expect(misty(s).active!.burned).toBe(true);
  });

  it("Cursed Stone: a damage counter on each Pokémon with a Poké-Power between turns", () => {
    let s = duel('charmander', 'onix');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex12-72', 'Cursed Stone')) });
    put(s, 'misty', 0, mon('ex13-35', 'Aerodactyl δ', F, 70, [], { stage: 'stage1', ...power('Primal Light') }));
    s = endTurn(s, 'ash');
    expect(misty(s).bench[0]!.damage).toBe(10);
  });

  it('Fire Remedy: a Rainbow Energy attached from the hand counts as Fire (agreed)', () => {
    let s = duel('charmander', 'onix');
    const arcanine = put(s, 'ash', 'active', mon('ex12-83', 'Arcanine ex', F, 120, [], { stage: 'stage1', ex: true, ...power('Fire Remedy') }));
    arcanine.damage = 30;
    arcanine.condition = 'confused';
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards['base5-17']!), target: 'active' });
    // Rainbow Energy's damage counter, then Fire Remedy's.
    expect(ash(s).active!.damage).toBe(30);
    expect(ash(s).active!.condition).toBeNull();
  });

  it("Jagged Stone: damaged as the Active Pokémon, Claw Fossil puts a damage counter on the attacker", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 300, [['Punch', [C], 10]]), ['fighting']);
    s.cards = { ...s.cards, 'ex12-78': { id: 'ex12-78', kind: 'pokemon', name: 'Claw Fossil', imageUrl: null, type: 'colorless', hp: 40, stage: 'basic', evolvesFrom: null, attacks: [], retreatCost: 0, trainerText: '', power: { name: 'Jagged Stone', text: '' } } };
    misty(s).active = { card: { uid: 'claw', defId: 'ex12-78' }, evolvedFrom: [], damage: 0, energy: [], playedTurn: 0 };
    expect(ash(attack(s, 0)).active!.damage).toBe(10);
  });

  it('Versatile: Mew ex can use the attacks of the Pokémon in play', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex12-88', 'Mew ex', P, 90, [['Power Move', [P], 0]], { ex: true, ...power('Versatile') }), ['psychic']);
    put(s, 'misty', 'active', mon('kicker', 'Hitmonlee', FI, 300, [['Kick', [C], 40]]));
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Emerge: heads, Cascoon evolves from the deck (the first-turn limit is no limit, agreed)', () => {
    let s = duel('charmander', 'onix');
    const cascoon = put(s, 'ash', 'active', mon('ex12-30', 'Cascoon', G, 70, [], { stage: 'stage1', evolvesFrom: 'Wurmple', ...power('Emerge') }));
    cascoon.playedTurn = s.turn;
    s.cards = { ...s.cards, dustox: mon('dustox', 'Dustox', G, 100, [], { stage: 'stage2', evolvesFrom: 'Cascoon' }) };
    ash(s).deck.unshift({ uid: 'dustox-1', defId: 'dustox' });
    s = act(flips(s, true), 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'dustox-1' });
    expect(ash(s).active!.card.defId).toBe('dustox');
    expect(tryAttack(s, 0).ok).toBe(false);
  });
});
