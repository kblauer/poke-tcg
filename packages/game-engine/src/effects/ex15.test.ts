import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, mon, tryAttack, C, F, FI, G, L, P, W } from './test-kit.js';

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

describe('EX Dragon Frontiers', () => {
  it("Holon Veil: the player's Pokémon count as δ Pokémon (Delta Circle)", () => {
    let s = duel('charmander', 'onix');
    const ampharos = mon('ex15-1', 'Ampharos δ', L, 130, [['Delta Circle', [C, C, C], 20]], { stage: 'stage2', ...power('Holon Veil') });
    put(s, 'ash', 'active', ampharos, ['fire', 'fire']);
    put(s, 'ash', 0, mon('plain', 'Mareep', L, 50, []));
    put(s, 'misty', 'active', big('Snorlax'));
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.fire!), target: 'active' });
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it("Imprison: a Pokémon with an Imprison marker can't use Poké-Powers", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex15-93', 'Gardevoir ex δ', F, 150, [], { ex: true, stage: 'stage2', ...power('Imprison') }));
    put(s, 'misty', 'active', mon('ex14-27', 'Swampert', W, 100, [], { stage: 'stage2', ...power('Echo Draw') }));
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { oppTo: 'active' } });
    expect(misty(s).active!.imprisoned).toBe(true);
    s = act(s, 'ash', { type: 'END_TURN' });
    expect(applyAction(s, 'misty', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });

  it('Snorlax δ: Dozing (its Poké-Power) takes 2 damage counters off and it falls Asleep', () => {
    let s = duel('charmander', 'onix');
    const snorlax = put(s, 'ash', 'active', mon('ex15-10', 'Snorlax δ', G, 90, [], { ...power('Bedhead') }));
    snorlax.damage = 30;
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(ash(s).active).toMatchObject({ damage: 10, condition: 'asleep' });
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });

  it('Electromark and Shock-wave: a Pokémon with a Shock-wave marker is Knocked Out', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex15-99', 'Tyranitar ex δ', L, 150, [['Electromark', [L, C], 0], ['Shock-wave', [L, L, C], 0]], { ex: true }), ['lightning', 'lightning', 'lightning']);
    put(s, 'misty', 'active', big('Snorlax'));
    const benched = put(s, 'misty', 0, big('Lapras'));
    expect(tryAttack(s, 1).ok).toBe(true);
    s = attack(s, 0, { oppTarget: 0 });
    expect(benched.shockwave ?? misty(s).bench[0]!.shockwave).toBe(true);
    s = act(s, 'misty', { type: 'END_TURN' });
    s = attack(s, 1, { oppTarget: 0 });
    expect(misty(s).bench[0]?.card.uid).not.toBe(benched.card.uid);
    expect(ash(s).prizes.length).toBe(5);
  });

  it("Dragon Roar: the damage counters beyond a Knock Out go on the opponent's Bench", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex15-91', 'Dragonite ex δ', G, 150, [['Deafen', [C, C], 40], ['Dragon Roar', [C], 0]], { ex: true }), ['grass']);
    put(s, 'misty', 'active', mon('weak', 'Pidgey', C, 50, []));
    put(s, 'misty', 0, big('Snorlax'));
    s = attack(s, 1);
    expect(misty(s).active!.damage).toBe(50);
    expect(s.pendingChoice).toMatchObject({ kind: 'placeCounters', count: 3 });
  });

  it("Delta Copy: an attack of the opponent's δ Pokémon, whatever the Energy; Mimicry needs the Energy", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex15-11', 'Togetic δ', W, 60, [['Delta Copy', [C], 0]]), ['water']);
    put(s, 'misty', 'active', mon('ex15-13', 'Arbok δ', F, 90, [['Big Bite', [F, F, F], 60]]));
    expect(misty(attack(s, 0, { amount: 0 })).active!.damage).toBe(60);
    put(s, 'ash', 'active', mon('ex15-101', 'Mew ☆ δ', W, 70, [['Mimicry', [C], 0], ['Rainbow Wave', [W], 0]]), ['water']);
    expect(misty(attack(s, 0, { amount: 0 })).active!.damage).toBe(0);
  });

  it('Rage Aura: Special Circuit costs Lightning while the player has more Prize cards left', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex15-97', 'Rayquaza ex δ', L, 110, [['Special Circuit', [L, C], 0], ['Sky-high Claws', [L, L, C, C], 70]], { ex: true, ...power('Rage Aura') }), ['lightning', 'lightning']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(tryAttack(s, 1).ok).toBe(false);
    misty(s).prizes.pop();
    expect(tryAttack(s, 1).ok).toBe(true);
    ash(s).active!.energy.pop();
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it('Island Hermit: up to 2 Prize cards turned face up, then 2 cards drawn', () => {
    let s = duel('charmander', 'onix');
    const handBefore = ash(s).hand.length;
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex15-76', 'Island Hermit')), choices: { pick: 2 } });
    expect(ash(s).faceUpPrizes).toHaveLength(2);
    expect(ash(s).hand.length).toBe(handBefore + 2);
  });

  it("Holon Legacy: δ Pokémon have no Weakness and can't use Poké-Powers", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    put(s, 'misty', 'active', mon('delta', 'Pikachu δ', L, 300, [], { weakness: { type: FI, multiplier: 2 } }));
    put(s, 'ash', 0, mon('ex15-93', 'Gardevoir ex δ', F, 150, [], { ex: true, stage: 'stage2', ...power('Imprison') }));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex15-74', 'Holon Legacy')) });
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    expect(ash(s).bench[0]!.stadiumMuted).toBe('powers');
  });

  it('Dark Horn: a Pokémon card discarded from the hand for 20 to a Benched Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex15-6', 'Nidoking δ', 'darkness', 150, [['Dark Horn', [C], 60]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    ash(s).hand = [];
    hand(s, 'ash', mon('extra', 'Nidoran', P, 50, []));
    const after = attack(s, 0, { amount: 0, benchSlot: 0 });
    expect(misty(after).bench[0]!.damage).toBe(20);
    expect(ash(after).discard.some((c) => c.defId === 'extra')).toBe(true);
  });
});
