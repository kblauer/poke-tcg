import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, flips, mon, C, F, FI, G, P, W } from './test-kit.js';

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
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards[def.id] = def;
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const D = 'darkness';

describe('EX Emerald', () => {
  it("Dark Hole: on the Bench, Darkness Weakness doesn't apply to its player's Pokémon", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dark', 'Mightyena', D, 70, [['Bite', [C], 30]]), ['fire']);
    put(s, 'misty', 'active', big('Medicham', { weakness: { type: D, multiplier: 2 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    put(s, 'misty', 0, mon('ex9-94', 'Dusclops ex', P, 100, [], { stage: 'stage1', ex: true, ...power('Dark Hole') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it("Wise Aura: no Pokémon but Pokémon-ex can use Poké-Powers, either player's", () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex9-95', 'Medicham ex', FI, 110, [], { stage: 'stage1', ex: true, ...power('Wise Aura') }));
    put(s, 'ash', 0, mon('ex8-10', 'Ludicolo', W, 100, [], { stage: 'stage2', ...power('Swing Dance') }));
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(false);
  });

  it('Mystic Scale: no Technical Machines can be played', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 0, mon('ex9-96', 'Milotic ex', W, 130, [], { stage: 'stage1', ex: true, ...power('Mystic Scale') }));
    const machine = hand(s, 'ash', trainer('ex4-79', 'Team Aqua Technical Machine 01'));
    put(s, 'ash', 'active', mon('aqua', "Team Aqua's Spheal", W, 50, []));
    const res = applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: machine, choices: { target: 'active' } });
    expect(!res.ok && res.error).toContain('Mystic Scale');
  });

  it("Green Essence: its player's Active Pokémon with Grass Energy attached can't have Special Conditions", () => {
    let s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('grassy', 'Grovyle', G, 70, []), ['grass']);
    put(s, 'misty', 0, mon('ex9-10', 'Sceptile', G, 100, [], { stage: 'stage2', ...power('Green Essence') }));
    put(s, 'ash', 'active', mon('sleeper', 'Jigglypuff', C, 50, [['Sing', [C], 0]]), ['fire']);
    s.cards.sleeper = { ...(s.cards.sleeper as PokemonCardDef), attacks: [{ name: 'Sing', cost: [C], damage: 0, text: 'The Defending Pokémon is now Asleep.' }] };
    // Its Green Essence works once an action has refreshed it.
    s = act(s, 'ash', { type: 'END_TURN' });
    expect(misty(s).active!.greenEssence).toBe(true);
  });

  it("Battle Frontier: Colorless, Darkness and Metal Evolved Pokémon's Poké-Powers and Poké-Bodies don't work", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    const vig = put(s, 'misty', 'active', mon('ex8-50', 'Vigoroth', C, 80, [], { stage: 'stage1', ...power('Vigorous Aura') }));
    vig.evolvedFrom = [{ uid: 'sl', defId: 'hitter' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    const gym = hand(s, 'ash', trainer('ex9-75', 'Battle Frontier'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: gym });
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it("Mr. Stone's Project: up to 2 basic Energy cards from the discard pile (agreed: basic Energy cards)", () => {
    let s = duel('charmander', 'onix');
    s.players.ash!.discard.push({ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }, { uid: 'g1', defId: 'grass' }, { uid: 'pk', defId: 'big-x' });
    s.cards['big-x'] = big('X');
    const card = hand(s, 'ash', trainer('ex9-79', "Mr. Stone's Project"));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: card, choices: { pick: 1 } });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    expect(ash(s).hand.map((c) => c.uid)).toEqual(expect.arrayContaining(['w1', 'f1']));
    expect(ash(s).discard.map((c) => c.uid)).toContain('g1');
  });

  it('Eruption: 20 more for each Energy card the players discard from the top of their decks', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex9-14', 'Groudon', FI, 80, [['Eruption', [C], 40]]), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    s.players.ash!.deck.unshift({ uid: 'top1', defId: 'fire' });
    s.players.misty!.deck.unshift({ uid: 'top2', defId: 'water' });
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
  });

  it("Rai-shield: 30 less from the opponent's Pokémon-ex; Magma Armor: Camerupt ex can't be Asleep", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex-hitter', 'Machamp ex', FI, 150, [['Punch', [C], 60]], { ex: true }), ['fighting']);
    put(s, 'misty', 'active', mon('ex9-97', 'Raichu ex', 'lightning', 100, [], { stage: 'stage1', ex: true, ...power('Rai-shield') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    put(s, 'ash', 'active', mon('sleepy', 'Jigglypuff', C, 50, [['Sing', [C], 0]]), ['fire']);
    s.cards.sleepy = { ...(s.cards.sleepy as PokemonCardDef), attacks: [{ name: 'Sing', cost: [C], damage: 0, text: 'The Defending Pokémon is now Asleep.' }] };
    put(s, 'misty', 'active', mon('ex9-92', 'Camerupt ex', F, 120, [], { stage: 'stage1', ex: true, ...power('Magma Armor') }));
    expect(misty(attack(flips(s, true), 0)).active!.condition ?? null).toBeNull();
  });

  it("Cursed Glare: the opponent can't attach Special Energy (but Darkness and Metal) from the hand to their Active Pokémon", () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex9-91', 'Cacturne ex', G, 110, [], { stage: 'stage1', ex: true, ...power('Cursed Glare') }));
    const special = hand(s, 'ash', { id: 'ex9-89', kind: 'energy', name: 'Multi Energy', imageUrl: null, energyType: 'colorless', anyType: true, basic: false });
    const res = applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: special, target: 'active' });
    expect(!res.ok && res.error).toContain('Cursed Glare');
    const dark = hand(s, 'ash', { id: 'ex1-93', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness', basic: false });
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: dark, target: 'active' }).ok).toBe(true);
  });
});
