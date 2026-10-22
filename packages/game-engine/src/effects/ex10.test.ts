import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, mon, tryAttack, C, F, FI, G, L, P, W } from './test-kit.js';

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
/** Gives the Pokémon a Pokémon Tool card. */
function tool(s: GameState, p: InPlayPokemon, cardId: string, name: string) {
  s.cards = { ...s.cards, [cardId]: { id: cardId, kind: 'trainer', name, imageUrl: null, text: '' } };
  (p.attached ??= []).push({ card: { uid: `${cardId}-${n++}`, defId: cardId }, until: Number.MAX_SAFE_INTEGER, tool: true });
}
const evolved = (p: InPlayPokemon) => (p.evolvedFrom = [{ uid: `under-${n++}`, defId: 'charmander' }]);
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const hitter = (damage: number) => mon(`hitter-${damage}`, 'Machop', FI, 300, [['Punch', [C], damage]]);

describe('EX Unseen Forces', () => {
  it("Intimidating Ring: the opponent's Basic Pokémon can't attack", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('ex10-18', 'Ursaring', C, 80, [], { stage: 'stage1', ...power('Intimidating Ring') }));
    const res = tryAttack(s, 0);
    expect(!res.ok && res.error).toContain('Intimidating Ring');
  });

  it('Lonesome: with fewer Pokémon in play, the opponent can play no Trainer cards but Supporters', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'misty', 'active', mon('ex10-7', 'Houndoom', F, 70, [], { stage: 'stage1', ...power('Lonesome') }));
    const potion = hand(s, 'ash', trainer('ex10-95', 'Potion'));
    const res = applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: potion, choices: { target: 'active' } });
    expect(!res.ok && res.error).toContain('Lonesome');
  });

  it("Stages of Evolution: Hitmonchan's 30 more HP and Hitmonlee's 20 more damage only as an Evolved Pokémon", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex10-25', 'Hitmonlee', FI, 60, [['Kick', [C], 20]], power('Stages of Evolution')), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    evolved(ash(s).active!);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    // Hitmonchan: 70 HP, 100 as an Evolved Pokémon (once an action has refreshed it).
    s = duel('charmander', 'onix');
    const chan = put(s, 'misty', 'active', mon('ex10-24', 'Hitmonchan', FI, 70, [], power('Stages of Evolution')));
    evolved(chan);
    put(s, 'ash', 'active', hitter(80), ['fighting']);
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.fire!), target: 'active' });
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(80);
  });

  it('Spiral Swirl and Curse Powder: Knocked Out as the Active Pokémon, the attacker is Confused and takes 3 damage counters', () => {
    const s = duel('charmander', 'onix', { oppBench: ['onix'] });
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    const poli = put(s, 'misty', 'active', mon('ex10-11', 'Poliwrath', FI, 120, [], { stage: 'stage2', ...power('Spiral Swirl') }));
    evolved(poli);
    poli.damage = 100;
    tool(s, poli, 'ex10-80', 'Curse Powder');
    const after = attack(s, 0);
    expect(ash(after).active!.condition).toBe('confused');
    expect(ash(after).active!.damage).toBe(30);
  });

  it('Golden Wing: Knocked Out by an attack, Ho-Oh ex may move up to 2 Energy cards to its player\'s other Pokémon', () => {
    const s = duel('charmander', 'onix', { oppBench: ['onix'] });
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    const hooh = put(s, 'misty', 'active', mon('ex10-104', 'Ho-Oh ex', F, 110, [], { ex: true, ...power('Golden Wing') }), ['fire', 'water']);
    hooh.damage = 100;
    const after = attack(s, 0);
    const asked = [after.pendingChoice, ...(after.queuedChoices ?? [])].find((c) => c?.source === 'Golden Wing');
    expect(asked).toMatchObject({ kind: 'energyGrounding', goldenWing: 2 });
  });

  it('Energy Root: 20 more HP, and its Pokémon\'s Poké-Bodies stop', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'misty', 'active', mon('plain', 'Pidgey', C, 60, []));
    tool(s, p, 'ex10-83', 'Energy Root');
    put(s, 'ash', 'active', hitter(70), ['fighting']);
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.fire!), target: 'active' });
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(70);
  });

  it('Sitrus Berry: between turns, 3 damage counters off a Pokémon with at least 3, then discarded', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'misty', 'active', big('Snorlax'));
    p.damage = 40;
    tool(s, p, 'ex10-91', 'Sitrus Berry');
    s = endTurn(s, 'ash');
    expect(misty(s).active!.damage).toBe(10);
    expect(misty(s).active!.attached ?? []).toHaveLength(0);
  });

  it('Energy Evolution: an Energy card attached from the hand lets its player evolve Eevee from the deck into that type', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex10-55', 'Eevee', C, 40, [], power('Energy Evolution')));
    const vap = mon('vap', 'Vaporeon', W, 70, [], { stage: 'stage1', evolvesFrom: 'Eevee' });
    const flare = mon('flare', 'Flareon', F, 70, [], { stage: 'stage1', evolvesFrom: 'Eevee' });
    s.cards = { ...s.cards, vap, flare };
    ash(s).deck.unshift({ uid: 'vap-1', defId: 'vap' }, { uid: 'flare-1', defId: 'flare' });
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.water!), target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'evolveFromDeck', names: ['Vaporeon'], optional: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'vap-1' });
    expect(ash(s).active!.card.defId).toBe('vap');
  });

  it("Darker Ring and Blissful Support: evolving from the hand, a Benched Pokémon of the opponent's is switched in; Energy and damage go", () => {
    let s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', mon('eevee', 'Eevee', C, 40, []));
    const umbreon = hand(s, 'ash', mon('ex10-112', 'Umbreon ex', 'darkness', 110, [], { stage: 'stage1', evolvesFrom: 'Eevee', ex: true, ...power('Darker Ring') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: umbreon, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'oppBenchPick', purpose: 'gust' });
    const benched = misty(s).bench[0]!.card.uid;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(misty(s).active!.card.uid).toBe(benched);

    s = duel('charmander', 'onix');
    const chansey = put(s, 'ash', 'active', mon('chansey', 'Chansey', C, 90, []), ['fire', 'water']);
    chansey.damage = 50;
    const blissey = hand(s, 'ash', mon('ex10-101', 'Blissey ex', C, 160, [], { stage: 'stage1', evolvesFrom: 'Chansey', ex: true, ...power('Blissful Support') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: blissey, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'blissful' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(ash(s).active!.damage).toBe(0);
    expect(ash(s).active!.energy).toHaveLength(0);
  });

  it('Spiky Shell: 3 damage counters on the Defending Pokémon at the end of the opponent\'s next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex10-6', 'Forretress', 'metal', 70, [['Spiky Shell', [C], 20]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(20);
    s = endTurn(s, 'misty');
    expect(misty(s).active!.damage).toBe(50);
  });

  it("Meta Voltage: behind on Prize cards, 40 to each of the player's Pokémon, Raikou ☆ too (agreed)", () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('ex10-114', 'Raikou ☆', L, 80, [['Meta Voltage', [C], 70]]), ['lightning']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).prizes = ash(s).prizes.slice(0, 3);
    const after = attack(s, 0);
    expect(ash(after).active!.damage).toBe(40);
    expect(ash(after).bench[0]!.damage).toBe(40);
  });

  it('Extra Comet Punch: 30 more the next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex10-36', 'Clefable', C, 80, [['Extra Comet Punch', [C], 30]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0);
    s = endTurn(s, 'misty');
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(90);
  });

  it("Psyloop: 30 more for each Trainer card the opponent has in play", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex10-102', 'Espeon ex', P, 110, [['Psyloop', [C], 60]], { stage: 'stage1', ex: true }), ['psychic']);
    const def = put(s, 'misty', 'active', big('Snorlax'));
    tool(s, def, 'ex10-85', 'Fluffy Berry');
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
  });

  it('Bouncy Move: up to 5 damage counters on Meganium, 10 more each', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex10-9', 'Meganium', G, 100, [['Bouncy Move', [C], 50]], { stage: 'stage2' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0, { amount: 3 });
    expect(ash(after).active!.damage).toBe(30);
    expect(misty(after).active!.damage).toBe(80);
  });
});
