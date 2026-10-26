import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, flips, id, mon, C, F, L, W } from './test-kit.js';

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
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const usePower = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });

describe('HGSS Black Star Promos', () => {
  it('Sacred Fire: heads, 80 to one of the opponent\'s Pokémon, no Weakness', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgssp-HGSS01', 'Ho-Oh', F, 80, [['Sacred Fire', [C], 0]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: 'fire', multiplier: 2 } }));
    put(s, 'misty', 0, big('Lapras'));
    expect(misty(attack(flips(s, true), 0, { oppTarget: 'active' })).active!.damage).toBe(80);
    expect(misty(attack(flips(s, true), 0, { oppTarget: 0 })).bench[0]!.damage).toBe(80);
  });

  it('Recharge: heads, a Lightning Energy card from the deck attached to Pikachu', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgssp-HGSS03', 'Pikachu', L, 70, [['Recharge', [C], 0]]), ['fire']);
    ash(s).deck = [{ uid: 'l', defId: 'lightning' }, { uid: 'w', defId: 'water' }];
    s = attack(flips(s, true), 0);
    expect(ash(s).active!.energy.map((e) => e.uid)).toContain('l');
  });

  it('Energy Assist and Infinite Wind', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgssp-HGSS10', 'Latias', C, 80, [['Energy Assist', [C], 10], ['Infinite Wind', [C], 40]]), ['fire']);
    put(s, 'ash', 0, mon('hgssp-HGSS11', 'Latios', C, 90, [], body('Luster Float'))).damage = 30;
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).discard = [{ uid: 'w', defId: 'water' }];
    const assisted = act(attack(s, 0), 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(ash(assisted).bench[0]!.energy.map((e) => e.uid)).toEqual(['w']);
    s = attack(s, 1);
    expect(ash(s).bench[0]!.damage).toBe(10);
  });

  it('Luster Float: with Latias in play, Latios retreats for free', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgssp-HGSS11', 'Latios', C, 90, [], { retreatCost: 2, ...body('Luster Float') }));
    put(s, 'ash', 0, mon('latias-x', 'Latias', C, 80, []));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });

  it('Ferry: a Supporter card from the discard pile into the hand', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgssp-HGSS14', 'Lapras', W, 90, [['Ferry', [W], 0]]), ['water']);
    s.cards = { ...s.cards, 'hgss4-89': trainer('hgss4-89', 'Twins') };
    ash(s).discard = [{ uid: 't', defId: 'hgss4-89' }];
    s = attack(s, 0);
    expect(ash(s).hand.some((c) => c.uid === 't')).toBe(true);
  });

  it('Night Scope: the opponent\'s hand looked at', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgssp-HGSS06', 'Noctowl', C, 90, [], { stage: 'stage1', ...body('Night Scope') }));
    misty(s).hand = [{ uid: 'x', defId: 'water' }];
    s = usePower(s, 'active');
    expect(s.pendingChoice).toMatchObject({ kind: 'lookOppHand' });
  });

  it('Fermenting Liquid: an Energy card attached to Shuckle from the hand draws a card', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgssp-HGSS15', 'Shuckle', 'fighting', 60, [], body('Fermenting Liquid')));
    ash(s).hand = [{ uid: 'f', defId: 'fire' }];
    ash(s).deck = [{ uid: 'top', defId: id('charmander') }];
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'f', target: 'active' });
    expect(ash(s).hand.map((c) => c.uid)).toEqual(['top']);
  });
});
