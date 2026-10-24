import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, flips, mon, tryAttack, C, FI, G, P, W } from './test-kit.js';

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
const DCE: CardDef = { id: 'dce', kind: 'energy', name: 'Double Colorless Energy', imageUrl: null, energyType: 'colorless', amount: 2, basic: false };

describe('EX Crystal Guardians', () => {
  it('Peal of Thunder: the Energy cards among the top 5 are attached one by one, the rest discarded, and the question is over', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('big-Charmeleon', 'Charmeleon', FI, 80, [['Tackle', [C], 10]], { stage: 'stage1' }));
    const charizard = hand(s, 'ash', mon('ex14-4', 'Charizard δ', FI, 120, [['Tackle', [C], 10]], { stage: 'stage2', evolvesFrom: 'Charmeleon', ...power('Peal of Thunder') }));
    ash(s).deck = [{ uid: 'e1', defId: 'fire' }, { uid: 'c1', defId: s.players.misty!.active!.card.defId }, { uid: 'e2', defId: 'water' }, { uid: 'c2', defId: s.players.misty!.active!.card.defId }, { uid: 'c3', defId: s.players.misty!.active!.card.defId }, { uid: 'c4', defId: s.players.misty!.active!.card.defId }];
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: charizard, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'pealTarget' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromTop', attachTo: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'e1' });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromTop' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'e2' });
    expect(s.pendingChoice).toBeUndefined();
    expect(ash(s).active!.energy.map((e) => e.uid)).toEqual(['e1', 'e2']);
    expect(ash(s).discard.map((c) => c.uid)).toEqual(['c1', 'c2', 'c3']);
    expect(ash(s).deck.map((c) => c.uid)).toEqual(['c4']);
  });

  it('Crystal Beach: a Special Energy card providing 2 Energy provides 1 Colorless (agreed)', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, dce: DCE };
    put(s, 'ash', 'active', big('Snorlax'), ['dce', 'fire']);
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['colorless', 'colorless', 'fire']);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex14-75', 'Crystal Beach')) });
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['colorless', 'fire']);
  });

  it('Chlorophyll: a card providing only Colorless Energy on a Grass Pokémon provides as much Grass (agreed)', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, dce: DCE };
    put(s, 'ash', 'active', mon('grassy', 'Oddish', G, 50, [['Leaf', [G, G], 30]]));
    put(s, 'ash', 0, mon('ex14-28', 'Venusaur', G, 150, [], { stage: 'stage2', ...power('Chlorophyll') }));
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', DCE), target: 'active' });
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['grass', 'grass']);
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it('Holon Circle: an attack does nothing, and the Stadium is discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex14-79', 'Holon Circle')) });
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(0);
    expect(s.stadium).toBeNull();
    expect(ash(s).discard.some((c) => c.defId === 'ex14-79')).toBe(true);
  });

  it("Shield Beam: the opponent can't use Poké-Powers during their next turn; Star Light makes it cost less against a Pokémon-ex", () => {
    let s = duel('charmander', 'onix');
    const jirachi = mon('ex14-94', 'Jirachi ex', P, 90, [['Shield Beam', [P, C], 30], ['Super Psy Bolt', [P, C, C], 50]], { ex: true, ...power('Star Light') });
    put(s, 'ash', 'active', jirachi, ['psychic']);
    put(s, 'misty', 'active', mon('ex14-27', 'Swampert', W, 300, [], { stage: 'stage2', ...power('Echo Draw') }));
    expect(tryAttack(s, 0).ok).toBe(false);
    put(s, 'misty', 0, big('Kyogre ex', { ex: true }));
    expect(tryAttack(s, 0).ok).toBe(true);
    s = attack(s, 0);
    expect(s.currentPlayer).toBe('misty');
    const res = applyAction(s, 'misty', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(res.ok).toBe(false);
  });

  it('Mining: a Pokémon Tool found may be attached, or go into the hand', () => {
    for (const attachIt of [true, false]) {
      let s = duel('charmander', 'onix');
      put(s, 'ash', 'active', mon('ex14-9', 'Mawile', 'metal', 60, [['Mining', [C], 0]]), ['fire']);
      s.cards = { ...s.cards, 'ex14-80': trainer('ex14-80', 'Memory Berry') };
      ash(s).deck.unshift({ uid: 'berry', defId: 'ex14-80' });
      s = attack(s, 0);
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'berry' });
      expect(s.pendingChoice).toMatchObject({ kind: 'attachCard', orHand: true });
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE', ...(attachIt && { target: 'active' as Target }) });
      expect(ash(s).active!.attached?.some((a) => a.card.uid === 'berry') ?? false).toBe(attachIt);
      expect(ash(s).hand.some((c) => c.uid === 'berry')).toBe(!attachIt);
      expect(s.currentPlayer).toBe('misty');
    }
  });

  it('Pick and Choose: both Special Conditions chosen', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex14-11', 'Swalot', G, 80, [['Pick and Choose', [C, C], 0]]), ['fire', 'fire']);
    const after = attack(s, 0, { condition: 'burned', amount: 1 });
    expect(misty(after).active!.effects?.attackedOn?.afflictions).toEqual(['burned', 'confused']);
  });

  it("Burn Away: Knocking Out the Defending Pokémon, the damage beyond its HP left goes to Blaziken ex", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex14-90', 'Blaziken ex', 'fire', 150, [['Drag Off', [FI, C], 30], ['Burn Away', [C], 100]], { ex: true }), ['fire']);
    put(s, 'misty', 'active', mon('weak', 'Pidgey', C, 60, []));
    put(s, 'misty', 0, big('Snorlax'));
    expect(ash(attack(s, 1)).active!.damage).toBe(40);
  });

  it("Skill Copy: a Pokémon card from the hand is discarded, and its attack used", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex14-99', 'Alakazam ☆', P, 80, [['Psychic Select', [P], 0], ['Skill Copy', [C, C, C], 0]]), ['psychic', 'psychic', 'psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = [];
    const card = hand(s, 'ash', mon('rammer', 'Tauros', C, 70, [['Ram', [C], 40]]));
    const after = attack(s, 1, { amount: 0 });
    expect(misty(after).active!.damage).toBe(40);
    expect(ash(after).discard.some((c) => c.uid === card)).toBe(true);
  });

  it("Extra Liquid: a Pokémon-ex's attacks cost 1 Colorless more, however many are in play", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('exer', 'Kyogre ex', W, 100, [['Splash', [W], 20]], { ex: true }), ['water']);
    expect(tryAttack(s, 0).ok).toBe(true);
    put(s, 'misty', 0, mon('ex14-96', 'Sceptile ex δ', W, 150, [], { ex: true, stage: 'stage2', ...power('Extra Liquid') }));
    put(s, 'misty', 1, mon('ex14-96', 'Sceptile ex δ', W, 150, [], { ex: true, stage: 'stage2', ...power('Extra Liquid') }));
    expect(tryAttack(s, 0).ok).toBe(false);
    ash(s).active!.energy.push({ uid: 'more', defId: 'fire' });
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it('Dark Eyes: using a Poké-Power puts 2 damage counters on the Pokémon that used it', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex14-27', 'Swampert', W, 100, [], { stage: 'stage2', ...power('Echo Draw') }));
    put(s, 'misty', 'active', mon('ex14-97', 'Shiftry ex', 'darkness', 140, [], { ex: true, stage: 'stage2', ...power('Dark Eyes') }));
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(ash(s).active!.damage).toBe(20);
  });

  it('Windstorm: up to 2 Pokémon Tools and Stadiums in play, either player\'s, discarded', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, tool: trainer('ex14-80', 'Memory Berry') };
    misty(s).active!.attached = [{ card: { uid: 'tool-1', defId: 'tool' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex14-75', 'Crystal Beach')) });
    const stadium = s.stadium!.card.uid;
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex14-85', 'Windstorm')), choices: { discardUids: ['tool-1', stadium] } });
    expect(misty(s).active!.attached).toEqual([]);
    expect(misty(s).discard.some((c) => c.uid === 'tool-1')).toBe(true);
    expect(s.stadium).toBeNull();
  });

  it('Delta Sign: one a turn, whichever Fearow δ', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('ex14-18', 'Fearow δ', 'metal', 70, [], { stage: 'stage1', ...power('Delta Sign') }));
    put(s, 'ash', 1, mon('ex14-18', 'Fearow δ', 'metal', 70, [], { stage: 'stage1', ...power('Delta Sign') }));
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 1, choices: {} }).ok).toBe(false);
  });

  it("Mysterious Shard: the opponent's Pokémon-ex's attacks do nothing to its Pokémon during their next turn", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex14-81', 'Mysterious Shard')), choices: { target: 'active' } });
    s = act(s, 'ash', { type: 'END_TURN' });
    put(s, 'misty', 'active', mon('exer', 'Kyogre ex', W, 100, [['Splash', [C], 50]], { ex: true }), ['water']);
    s = attack(flips(s, true), 0, undefined, 'misty');
    expect(ash(s).active!.damage).toBe(0);
  });
});
