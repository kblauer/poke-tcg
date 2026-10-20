import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, powerError, retreatCost, situationCounts, usableAttacks, type GameState, type InPlayPokemon, type PowerChoices, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, C, F, FI, G, L, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const situation = (s: GameState, source: Target) => ({ me: ash(s), opp: misty(s), counts: situationCounts(ash(s), misty(s)), source, cards: s.cards, turn: s.turn });
const usePower = (s: GameState, source: Target, choices: PowerChoices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards[def.id] = def;
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards[def.id] = def;
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (id: string, name: string): CardDef => ({ id, kind: 'trainer', name, imageUrl: null, text: '' });

const arcanine = mon('ecard2-2', 'Arcanine', F, 90, [['Fire Blow', [C, C, C], 30]], { stage: 'stage1', retreatCost: 3, ...power('Extreme Speed') });
const ariados = mon('ecard2-3', 'Ariados', G, 70, [['Spider Force', [G, C], 20]], { stage: 'stage1', retreatCost: 0, ...power('Gluey Slime') });
const houndoom = mon('ecard2-15', 'Houndoom', 'darkness', 70, [['Fireworks', [F, C], 30], ['Dark Impact', ['darkness', C, C], 40]], { stage: 'stage1' });
const jumpluff = mon('ecard2-17', 'Jumpluff', G, 70, [['Cotton Punch', [G], 30]], { stage: 'stage2', ...power('Fluff') });
const ninetales = mon('ecard2-25', 'Ninetales', F, 80, [['Miracle Tail', [F], 10], ['Roasting Heat', [F, C, C], 40]], { stage: 'stage1' });
const scizor = mon('ecard2-32', 'Scizor', 'metal', 80, [['Snatch', ['metal', C], 20]], { stage: 'stage1', ...power('Poison Resistance') });
const slowbro = mon('ecard2-33', 'Slowbro', W, 80, [['Energy Cannon', [W, C], 30]], { stage: 'stage1', ...power('Dense Body') });
const sudowoodo = mon('ecard2-36', 'Sudowoodo', FI, 60, [['Copy', [C], 0], ['Energy Draw', [FI], 0]]);
const umbreon = mon('ecard2-41', 'Umbreon', 'darkness', 80, [['Shadow Bind', [C, C, C], 30]], { stage: 'stage1', ...power('Dark Moon') });
const zapdos = mon('ecard2-44', 'Zapdos', L, 80, [['Plasma', [C], 10]], { ...power('Anti-Lightning') });
const gloom = mon('ecard2-49', 'Gloom', G, 70, [['Sleep Sap', [C, C], 20]], { stage: 'stage1', ...power('Enervating Pollen') });
const kingdra = mon('ecard2-148', 'Kingdra', C, 110, [['Aquabomb', [W, W, L], 40]], { stage: 'stage2', ...power('Crystal Type') });
const octillery = mon('ecard2-26', 'Octillery', W, 80, [['Smokescreen', [W, C, C], 40]], { stage: 'stage1', ...power('Suction Cups') });
const crystal: CardDef = { id: 'ecard2-146', kind: 'energy', name: 'Crystal Energy', imageUrl: null, energyType: 'colorless', basic: false };
const boost: CardDef = { id: 'ecard2-145', kind: 'energy', name: 'Boost Energy', imageUrl: null, energyType: 'colorless', amount: 3, basic: false };
const warp: CardDef = { id: 'ecard2-147', kind: 'energy', name: 'Warp Energy', imageUrl: null, energyType: 'colorless', basic: false };

describe('Aquapolis', () => {
  it('Extreme Speed: 1 less to retreat for each Energy; Gluey Slime: 1 more for each Active Pokémon (only 1)', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    const arc = put(s, 'ash', 'active', arcanine, ['fire', 'fire']);
    expect(retreatCost(arc, s.cards, [ash(s), misty(s)])).toBe(1);
    put(s, 'misty', 0, ariados);
    put(s, 'misty', 1, ariados);
    expect(retreatCost(arc, s.cards, [ash(s), misty(s)])).toBe(2);
  });

  it("Dark Impact: the Defending Pokémon can't use Poké-Powers during its player's next turn, but Poké-Bodies work", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', houndoom, ['darkness', 'fire', 'fire']);
    s.cards.darkness = { id: 'darkness', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness', basic: false };
    put(s, 'misty', 'active', { ...umbreon, hp: 200 }, ['darkness']);
    const after = attack(s, 1);
    expect(misty(after).active!.effects?.noPokePowers).toBe(after.turn);
    const theirs = { me: misty(after), opp: ash(after), counts: situationCounts(misty(after), ash(after)), source: 'active' as Target, cards: after.cards, turn: after.turn };
    expect(powerError(theirs)).toBe("Dark Impact: Umbreon can't use Poké-Powers this turn");
  });

  it('Fluff: with a damage counter on it, heads prevents the opponent\'s attack', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    const j = put(s, 'misty', 'active', jumpluff);
    expect(misty(attack(flips(s, true), 1)).active!.damage).toBe(30);
    j.damage = 10;
    expect(misty(attack(flips(s, true), 1)).active!.damage).toBe(10);
    expect(misty(attack(flips(s, false), 1)).active!.damage).toBe(40);
  });

  it('Miracle Tail: heads gives the Special Condition chosen, Burned included', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', ninetales, ['fire']);
    expect(misty(attack(flips(s, true, false), 0, { condition: 'burned' })).active!.burned).toBe(true);
  });

  it("Poison Resistance: Scizor can't be Poisoned", () => {
    const s = duel('gastly', 'onix', { energy: ['psychic'] });
    put(s, 'ash', 'active', mon('base1-x', 'Weedle', G, 40, [['Poison Sting', [G], 10]]), ['grass']);
    put(s, 'misty', 'active', scizor);
    const after = attack(s, 0);
    expect(misty(after).active!.poison ?? 0).toBe(0);
  });

  it('Dense Body: 20 less from a Basic Pokémon, not from an Evolved one', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    put(s, 'misty', 'active', { ...slowbro, weakness: null });
    expect(misty(attack(s, 1)).active!.damage).toBe(10);
  });

  it("Copy: copies the Defending Pokémon's attack if Sudowoodo has its Energy", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', sudowoodo, ['fighting']);
    // Onix's Rock Throw (Fighting): Sudowoodo has the Energy.
    expect(misty(attack(s, 0, { copyIndex: 0 })).active!.damage).toBe(10);
    // Harden (Fighting, Fighting): it doesn't.
    const after = attack(s, 0, { copyIndex: 1 });
    expect(after.log?.some((l) => l.text.includes("doesn't have the Energy for Harden"))).toBe(true);
  });

  it('Dark Moon: up to as many cards as Darkness Energy go from the opponent\'s hand into their deck; they draw as many', () => {
    const s = duel('charmander', 'onix');
    s.cards.darkness = { id: 'darkness', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness', basic: false };
    put(s, 'ash', 'active', umbreon, ['darkness', 'darkness']);
    const handSize = misty(s).hand.length;
    const started = usePower(s, 'active');
    expect(started.pendingChoice).toMatchObject({ kind: 'oppHandTrainer', count: 2 });
    const one = act(started, 'ash', { type: 'RESOLVE_CHOICE', cardUid: misty(started).hand[0]!.uid });
    const done = act(one, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(misty(done).hand).toHaveLength(handSize);
    expect(done.pendingChoice).toBeUndefined();
  });

  it('Anti-Lightning: Lightning Energy cards can\'t be attached to Zapdos from the hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', zapdos);
    ash(s).hand = [{ uid: 'l', defId: 'lightning' }];
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'l', target: 'active' })).toMatchObject({ ok: false });
  });

  it('Enervating Pollen: Resistance takes off at most 10', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'], bench: [] });
    put(s, 'misty', 'active', mon('base1-y', 'Resistor', C, 100, [], { resistance: { type: F, amount: 30 } }));
    expect(misty(attack(s, 1)).active!.damage).toBe(0);
    put(s, 'misty', 0, gloom);
    expect(misty(attack(s, 1)).active!.damage).toBe(20);
  });

  it('Crystal Type: a Water Energy card attached from the hand makes Kingdra a Water Pokémon for the turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', kingdra);
    ash(s).hand = [{ uid: 'w', defId: 'water' }];
    const after = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'w', target: 'active' });
    expect(ash(after).active!.crystalType).toBe('water');
    expect(ash(endTurn(after, 'ash')).active!.crystalType).toBeUndefined();
  });

  it("Suction Cups: the opponent's Active Pokémon that retreats loses every Energy card", () => {
    const s = endTurn(duel('charmander', 'onix', { energy: ['fire'] }), 'ash');
    put(s, 'ash', 'active', octillery);
    put(s, 'misty', 0, mon('base1-z', 'Benched', C, 50, []));
    misty(s).active!.energy = [{ uid: 'f1', defId: 'fighting' }, { uid: 'f2', defId: 'fighting' }];
    const after = act(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: ['f1'] });
    expect(misty(after).bench[0]!.energy).toEqual([]);
  });

  it('Crystal Energy: 1 Energy of each type of basic Energy attached, one at a time', () => {
    const s = duel('charmander', 'onix');
    s.cards[crystal.id] = crystal;
    const p = put(s, 'ash', 'active', mon('base1-q', 'Mixed', C, 100, [['Hit', [W, F], 50]]), ['ecard2-146', 'fire']);
    expect(energyPool(p, s.cards)).toEqual(['fire', 'fire']);
    p.energy.push({ uid: 'w', defId: 'water' });
    expect(energyPool(p, s.cards)).toEqual(['crystal:fire,water', 'fire', 'water']);
    p.energy = p.energy.filter((e) => e.defId !== 'water');
    expect(usableAttacks(p, s.cards)).toHaveLength(1);
  });

  it('Boost Energy: only on an Evolved Pokémon; provides 3; discarded at the end of the turn', () => {
    const s = duel('charmander', 'onix');
    s.cards[boost.id] = boost;
    const uid = hand(s, 'ash', boost);
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' })).toEqual({ ok: false, error: 'Boost Energy can only be attached to an Evolved Pokémon' });
    ash(s).active!.evolvedFrom = [{ uid: 'base', defId: 'base1-46' }];
    const attached = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' });
    expect(energyPool(ash(attached).active!, attached.cards)).toHaveLength(3);
    expect(ash(endTurn(attached, 'ash')).active!.energy).toEqual([]);
  });

  it('Warp Energy: attached to the Active Pokémon, it switches with a Benched Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    const uid = hand(s, 'ash', warp);
    const after = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' });
    expect(ash(after).active!.card.defId).toBe('base1-63');
  });

  it('Weakness Guard: no Weakness while attached', () => {
    const s = duel('squirtle', 'charmander', { energy: ['water'] });
    const uid = hand(s, 'misty', trainer('ecard2-141', 'Weakness Guard'));
    const guarded = act(endTurn(s, 'ash'), 'misty', { type: 'PLAY_TRAINER', cardUid: uid, choices: { target: 'active' } });
    const back = endTurn(guarded, 'misty');
    expect(misty(attack(back, 0)).active!.damage).toBe(10);
  });
});
