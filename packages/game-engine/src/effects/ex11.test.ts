import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, mon, tryAttack, C, F, FI, L, P, W } from './test-kit.js';

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
const M = 'metal';
const BASIC_METAL: CardDef = { id: 'basic-metal', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' };
const holonEnergy = (id: string, name: string): CardDef => ({ id, kind: 'energy', name, imageUrl: null, energyType: 'colorless', basic: false });

describe('EX Delta Species', () => {
  it("Binding Aura: the opponent can't attach Energy cards from the hand to an Asleep Pokémon, or evolve it", () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex11-23', 'Hypno', P, 70, [], { stage: 'stage1', ...power('Binding Aura') }));
    const sleeper = put(s, 'ash', 'active', mon('eevee', 'Eevee', C, 40, []));
    sleeper.condition = 'asleep';
    const fire = hand(s, 'ash', s.cards.fire!);
    const res = applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: fire, target: 'active' });
    expect(!res.ok && res.error).toContain('Binding Aura');
    const flareon = hand(s, 'ash', mon('flareon', 'Flareon', F, 70, [], { stage: 'stage1', evolvesFrom: 'Eevee' }));
    const evolve = applyAction(s, 'ash', { type: 'EVOLVE', cardUid: flareon, target: 'active' });
    expect(!evolve.ok && evolve.error).toContain('Binding Aura');
    sleeper.condition = null;
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: fire, target: 'active' }).ok).toBe(true);
  });

  it('Delta Moon: a Special Energy card the opponent attaches from the hand puts a damage counter on that Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'misty', 0, mon('ex11-17', 'Umbreon δ', 'darkness', 70, [], { stage: 'stage1', ...power('Delta Moon') }));
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.fire!), target: 'active' });
    expect(ash(s).active!.damage).toBe(0);
    s.energyAttachedThisTurn = false;
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards['neo1-104']!), target: 'active' });
    expect(ash(s).active!.damage).toBe(10);
  });

  it("Holon Energy GL: with a Lightning Energy card attached, 10 less damage from the opponent's Pokémon-ex", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex-hitter', 'Machamp ex', FI, 150, [['Punch', [C], 60]], { ex: true }), ['fighting']);
    s.cards = { ...s.cards, 'ex11-105': holonEnergy('ex11-105', 'Holon Energy GL') };
    put(s, 'misty', 'active', big('Snorlax'), ['ex11-105', 'lightning']);
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it("Holon Research Tower: basic Energy cards on δ Pokémon are Metal too", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('delta', 'Beldum δ', L, 50, [['Ram', [M], 30]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(tryAttack(s, 0).ok).toBe(false);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex11-94', 'Holon Research Tower')) });
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Delta Aura: with Latios in play, Extra Crush costs Lightning, Metal and Colorless; it does nothing with no Pokémon-ex to hit', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'basic-metal': BASIC_METAL };
    put(s, 'ash', 'active', mon('ex11-8', 'Latias δ', L, 70, [['Extra Crush', [C, C, C, L, M], 80]], power('Delta Aura')), ['lightning', 'basic-metal', 'fire']);
    put(s, 'misty', 'active', big('Snorlax', { ex: true }));
    expect(tryAttack(s, 0).ok).toBe(false);
    put(s, 'ash', 0, mon('latios', 'Latios δ', L, 80, []));
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Prize Shift: a card from the hand becomes a face-up Prize card, and a face-down one goes into the hand', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('ex11-28', 'Slowking', W, 80, [], { stage: 'stage1', ...power('Prize Shift') }));
    const card = hand(s, 'ash', s.cards.fire!);
    const before = ash(s).hand.length;
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { cardUid: card } });
    expect(ash(s).prizes.some((c) => c.uid === card)).toBe(true);
    expect(ash(s).faceUpPrizes).toEqual([card]);
    expect(ash(s).hand).toHaveLength(before);
  });

  it('Duplicate: another Ditto from the deck takes its place; one Duplicate a turn', () => {
    let s = duel('charmander', 'onix');
    const ditto = (id: string) => mon(id, 'Ditto', C, 60, [], power('Duplicate'));
    put(s, 'ash', 'active', ditto('ex11-35'), ['fire']);
    put(s, 'ash', 0, ditto('ex11-36'));
    s.cards = { ...s.cards, 'ex11-37': ditto('ex11-37') };
    ash(s).deck.unshift({ uid: 'deck-ditto', defId: 'ex11-37' });
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'deck-ditto' });
    expect(ash(s).active!.card.uid).toBe('deck-ditto');
    expect(ash(s).active!.energy).toHaveLength(1);
    const res = applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    expect(!res.ok && res.error).toContain('Duplicate');
  });

  it("Final Sting: Beedrill is Knocked Out; the opponent's Active Pokémon is Paralyzed and Poisoned for 2 damage counters", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('ex11-1', 'Beedrill δ', 'grass', 90, [], { stage: 'stage2', ...power('Final Sting') }));
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    expect(ash(s).bench[0]).toBeNull();
    expect(misty(s).active!.condition).toBe('paralyzed');
    expect(misty(s).active!.poison).toBe(20);
  });

  it('Holon Ruins: with a δ Pokémon in play, a card drawn and then one discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('delta', 'Beldum δ', L, 50, []));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex11-96', 'Holon Ruins')) });
    ash(s).hand.push({ uid: 'w', defId: 'water' });
    const size = ash(s).hand.length;
    s = act(s, 'ash', { type: 'USE_STADIUM' });
    expect(ash(s).hand).toHaveLength(size + 1);
    expect(s.pendingChoice).toMatchObject({ kind: 'discardFromHand', count: 1 });
  });

  it('Reversal Aura: with more Prize cards left, 20 more to the Active Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex11-44', 'Hariyama', FI, 80, [['Punch', [C], 30]], { stage: 'stage1', ...power('Reversal Aura') }), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    misty(s).prizes = misty(s).prizes.slice(0, 3);
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it("Shining Horn: as its player's only Pokémon in play, Skarmory stops the opponent's Basic Pokémon attacking", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('basic', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    put(s, 'misty', 'active', mon('ex11-55', 'Skarmory', M, 70, [], power('Shining Horn')));
    const res = tryAttack(s, 0);
    expect(!res.ok && res.error).toContain('Shining Horn');
    put(s, 'misty', 0, big('Snorlax'));
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it('Delta Control: 1 of the top 4 cards into the hand, the other 3 on the bottom of the deck', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('ex11-11', 'Metagross δ', L, 100, [], { stage: 'stage2', ...power('Delta Control') }));
    ash(s).deck[1] = { uid: 'w', defId: 'water' };
    const top = ash(s).deck.slice(0, 4).map((c) => c.uid);
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: top[1] });
    expect(ash(s).hand.some((c) => c.uid === top[1])).toBe(true);
    expect(ash(s).deck.slice(-3).map((c) => c.uid)).toEqual([top[0], top[2], top[3]]);
  });

  it("Conductive Body: as the Active Pokémon, Beldum retreats for 1 less for each Beldum on the Bench (as printed)", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex11-59', 'Beldum δ', L, 50, [], { retreatCost: 1, ...power('Conductive Body') }));
    put(s, 'ash', 0, mon('beldum', 'Beldum', M, 50, []));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });
});
