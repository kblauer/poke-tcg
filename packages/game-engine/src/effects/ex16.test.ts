import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, mon, tryAttack, C, FI, P, W } from './test-kit.js';

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
const flygon = () => mon('ex16-94', 'Flygon ex', C, 150, [], { ex: true, stage: 'stage1', ...power('Psychic Protector') });
const stadium = (s: GameState, cardId: string, name: string) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer(cardId, name)) });

describe('EX Power Keepers', () => {
  it('Psychic Protector: asked before the attack; the cards picked are discarded for 10 less each, only if Flygon ex is damaged (agreed)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 50], ['Stare', [C], 0]]), ['fighting']);
    put(s, 'misty', 'active', flygon());
    misty(s).hand = [];
    const [a, b] = [hand(s, 'misty', s.cards.fire!), hand(s, 'misty', s.cards.water!)];
    hand(s, 'misty', s.cards.grass!);
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'protector', player: 'misty' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: a });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: b });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE' });
    expect(misty(s).active!.damage).toBe(30);
    expect(misty(s).discard.map((c) => c.uid)).toEqual([a, b]);
  });

  it('Psychic Protector: the cards stay when the attack does no damage', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Stare', [C], 0]]), ['fighting']);
    put(s, 'misty', 'active', flygon());
    const card = hand(s, 'misty', s.cards.fire!);
    s = attack(s, 0);
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: card });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE' });
    expect(misty(s).hand.some((c) => c.uid === card)).toBe(true);
  });

  it('Rock Blast: 20 for each Fighting Energy card discarded, the same Pokémon any number of times, no Weakness', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex16-3', 'Armaldo', FI, 120, [['Rock Blast', [FI], 0]]), ['fighting', 'fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: FI, multiplier: 2 } }));
    put(s, 'misty', 0, big('Lapras'));
    const uids = ash(s).active!.energy.map((e) => e.uid);
    const after = attack(s, 0, { energyUids: uids, benchSlots: [-1, 0, 0] });
    expect(misty(after).active!.damage).toBe(20);
    expect(misty(after).bench[0]!.damage).toBe(40);
    expect(ash(after).active!.energy).toEqual([]);
  });

  it("Skill Hack: an attack of a Pokémon card in the opponent's hand, picked once the attack starts", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex16-97', 'Shiftry ex', 'darkness', 140, [['Skill Hack', [C], 0]], { ex: true }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).hand = [];
    const tauros = hand(s, 'misty', mon('rammer', 'Tauros', C, 70, [['Ram', [C, C, C], 40]]));
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'skillHack', player: 'ash' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: tauros });
    expect(misty(s).active!.damage).toBe(40);
    expect(s.currentPlayer).toBe('misty');
  });

  it("Phoebe's Stadium: Psychic Pokémon retreat for 2 less", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('psy', 'Duskull', P, 50, [], { retreatCost: 2 }));
    put(s, 'ash', 0, big('Snorlax'));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(false);
    s = stadium(s, 'ex16-79', "Phoebe's Stadium");
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });

  it("Steven's Advice: not with 7 or more cards in the hand, itself included", () => {
    const s = duel('charmander', 'onix');
    ash(s).hand = [];
    for (let i = 0; i < 6; i++) hand(s, 'ash', s.cards.fire!);
    const advice = hand(s, 'ash', trainer('ex16-83', "Steven's Advice"));
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: advice }).ok).toBe(false);
    ash(s).hand.shift();
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: advice }).ok).toBe(true);
  });

  it("Drake's Stadium: 10 less to Colorless Active Pokémon; Glacia's Stadium: no Weakness for Water Pokémon (not Pokémon-ex)", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = stadium(s, 'ex16-72', "Drake's Stadium");
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    put(s, 'misty', 'active', mon('watery', 'Spheal', W, 300, [], { weakness: { type: FI, multiplier: 2 } }));
    s = stadium(s, 'ex16-76', "Glacia's Stadium");
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it("Sidney's Stadium: Darkness Pokémon can't be Asleep, Confused or Paralyzed", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex15-42', 'Vibrava δ', P, 70, [['Sonic Noise', [C], 30]]), ['fire']);
    put(s, 'misty', 'active', mon('dark', 'Absol ex', 'darkness', 300, [], { ex: true }));
    s = stadium(s, 'ex16-82', "Sidney's Stadium");
    expect(misty(s).active!.sidneyGuard).toBe(true);
    expect(misty(attack(s, 0)).active!.condition).toBeFalsy();
  });

  it('Metal Gravity: the opponent\'s Active Pokémon retreating with 40 HP or more left gets 3 damage counters', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('runner', 'Rattata', C, 60, [], { retreatCost: 0 }));
    put(s, 'ash', 0, big('Snorlax'));
    put(s, 'misty', 'active', mon('ex16-98', 'Skarmory ex', 'metal', 100, [], { ex: true, ...power('Metal Gravity') }));
    s = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] });
    expect(ash(s).bench[0]!.damage).toBe(30);
  });

  it('Chilling Breath: evolving from the hand, the opponent can\'t play Trainer cards during their next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('sealeo', 'Sealeo', W, 80, [], { stage: 'stage1' }));
    const walrein = hand(s, 'ash', mon('ex16-99', 'Walrein ex', W, 150, [], { ex: true, stage: 'stage2', evolvesFrom: 'Sealeo', ...power('Chilling Breath') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: walrein, target: 0 });
    s = act(s, 'ash', { type: 'END_TURN' });
    const potion = hand(s, 'misty', trainer('ex1-91', 'Potion'));
    expect(applyAction(s, 'misty', { type: 'PLAY_TRAINER', cardUid: potion, choices: { target: 'active' } }).ok).toBe(false);
  });

  it("Sableye's Synergy Effect: with Phoebe's Stadium in play, no damage from the opponent's Pokémon-ex", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('exer', 'Kyogre ex', W, 100, [['Splash', [C], 50]], { ex: true }), ['water']);
    put(s, 'misty', 'active', mon('ex16-22', 'Sableye', 'darkness', 60, [], power('Synergy Effect')));
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
    s = stadium(s, 'ex16-79', "Phoebe's Stadium");
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Magnetic Redraw: each player shuffles their hand into their deck and draws 4', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex16-95', 'Metagross ex', 'metal', 150, [], { ex: true, stage: 'stage2', ...power('Magnetic Redraw') }));
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(ash(s).hand).toHaveLength(4);
    expect(misty(s).hand).toHaveLength(4);
  });

  it("Bench Manipulation: 40 for each tails of the opponent's flips, no Weakness or Resistance", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex16-4', 'Banette', P, 70, [['Bench Manipulation', [C], 0]]), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: P, multiplier: 2 } }));
    expect(tryAttack(s, 0).ok).toBe(true);
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });
});
