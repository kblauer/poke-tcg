import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, C, F, FI, G, P } from './test-kit.js';

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
function under(s: GameState, p: InPlayPokemon, def: PokemonCardDef) {
  s.cards = { ...s.cards, [def.id]: def };
  p.evolvedFrom.push({ uid: `${def.id}-${n++}`, defId: def.id });
}
const pile = (k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const decks = (s: GameState) => {
  ash(s).deck = pile(10);
  misty(s).deck = pile(10);
};

describe('DP Black Star Promos', () => {
  it('Darkness Lost: what it Knocks Out goes to the Lost Zone', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dpp-DP38', 'Giratina', P, 130, [['Darkness Lost', [C], 0]], { stage: 'levelUp' }), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, mon('weak', 'Caterpie', G, 30, []));
    const after = attack(s, 0);
    expect([misty(after).lostZone?.some((c) => c.defId === 'weak'), misty(after).discard.some((c) => c.defId === 'weak'), misty(after).active!.damage]).toEqual([true, false, 30]);
  });

  it('Invisible Tentacles: attacking costs a card from the hand, and it ends', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('punch', 'Machop', FI, 60, [['Punch', [C], 20]]), ['fighting']);
    put(s, 'misty', 'active', mon('dpp-DP38', 'Giratina', P, 130, [], { stage: 'levelUp', ...body('Invisible Tentacles') }));
    decks(s);
    ash(s).hand = [];
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/Invisible Tentacles/) });
    ash(s).hand = pile(1);
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'discardFromHand', source: 'Invisible Tentacles' });
    for (const end of settles(s)) expect([ash(end).hand.length, end.currentPlayer]).toEqual([0, 'misty']);
  });

  it('Multitype: Arceus LV.X is its previous level\'s type', () => {
    const s = duel('charmander', 'onix');
    const lvx = put(s, 'ash', 'active', mon('dpp-DP53', 'Arceus', C, 120, [], { stage: 'levelUp', ...body('Multitype') }));
    under(s, lvx, mon('arceus-fire', 'Arceus', F, 90, []));
    lvx.levelUpFrom = 'arceus-fire';
    expect(inPlayDef(s.cards, lvx).type).toBe('fire');
  });

  it('Bind Eye: evolving keeps the Special Conditions', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dpp-DP36', 'Gliscor', FI, 90, [], { stage: 'stage1', ...body('Bind Eye') }));
    const ivysaur = put(s, 'misty', 'active', mon('bulbasaur', 'Bulbasaur', G, 50, []));
    ivysaur.poison = 10;
    decks(s);
    s = endTurn(s, 'ash');
    const evo = hand(s, 'misty', mon('ivysaur', 'Ivysaur', G, 80, [], { stage: 'stage1', evolvesFrom: 'Bulbasaur' }));
    s = act(s, 'misty', { type: 'EVOLVE', cardUid: evo, target: 'active' });
    expect(misty(s).active!.poison).toBe(10);
  });

  it('Learning: a Pokémon LV.X from the deck levels up one of the player\'s Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dpp-DP35', 'Porygon-Z', C, 120, [['Learning', [], 0]], { stage: 'stage2' }));
    put(s, 'ash', 0, mon('dialga', 'Dialga', 'metal', 90, []));
    s.cards = { ...s.cards, 'dialga-lvx': mon('dialga-lvx', 'Dialga', 'metal', 120, [], { stage: 'levelUp' }) };
    ash(s).deck = [{ uid: 'lvx', defId: 'dialga-lvx' }, ...pile(3)];
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0);
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'lvx' });
    expect([ash(s).bench[0]!.card.uid, ash(s).bench[0]!.levelUpFrom]).toEqual(['lvx', 'dialga']);
  });

  it('Revenge Seed: 60 more after a Grass Pokémon was Knocked Out by an attack last turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dpp-DP39', 'Shaymin', G, 110, [['Seed Flare', [C], 50]], { stage: 'levelUp', ...body('Revenge Seed') }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).grassKnockedOutTurn = s.turn - 1;
    expect(misty(attack(s, 0)).active!.damage).toBe(110);
  });

  it('Healing Breath: levelling up, every Pokémon SP fully healed', () => {
    let s = duel('charmander', 'onix');
    const garchomp = put(s, 'ash', 'active', mon('garchomp-c', 'Garchomp C', C, 100, []));
    garchomp.damage = 50;
    garchomp.playedTurn = 1;
    put(s, 'ash', 0, mon('toxicroak-g', 'Toxicroak G', FI, 90, [])).damage = 30;
    put(s, 'ash', 1, big('Snorlax')).damage = 30;
    const lvx = hand(s, 'ash', mon('dpp-DP46', 'Garchomp C', C, 110, [], { stage: 'levelUp', ...body('Healing Breath') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: lvx, target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([ash(s).active!.damage, ash(s).bench[0]!.damage, ash(s).bench[1]!.damage]).toEqual([0, 0, 30]);
  });

  it('Tropical Wind: heads heals each Active Pokémon, tails makes them Asleep', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax')).damage = 30;
    put(s, 'misty', 'active', big('Lapras')).damage = 10;
    const wind = hand(s, 'ash', trainer('dpp-DP05', 'Tropical Wind'));
    const heads = act(flips(s, true), 'ash', { type: 'PLAY_TRAINER', cardUid: wind });
    expect([ash(heads).active!.damage, misty(heads).active!.damage]).toEqual([10, 0]);
    s = act(flips(s, false), 'ash', { type: 'PLAY_TRAINER', cardUid: wind });
    expect([ash(s).active!.condition, misty(s).active!.condition]).toEqual(['asleep', 'asleep']);
  });

  it('Ultimate Zone: basic Energy cards moved from the Bench to the Active Arceus', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('arceus', 'Arceus', C, 90, []));
    put(s, 'ash', 0, big('Snorlax'), ['fire']);
    s.cards = { ...s.cards, 'dpp-DP55': trainer('dpp-DP55', 'Ultimate Zone') };
    s.stadium = { card: { uid: 'zone', defId: 'dpp-DP55' }, owner: 'misty' };
    s = act(s, 'ash', { type: 'USE_STADIUM' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).bench[0]!.energy[0]!.uid });
    expect(ash(s).active!.energy).toHaveLength(1);
  });

  it('Enigma Berry: damaged by a Fighting Pokémon\'s attack, 4 damage counters off at the end of that turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('punch', 'Machop', FI, 60, [['Punch', [C], 60]]), ['fighting']);
    put(s, 'misty', 'active', mon('dpp-DP24', 'Darkrai', 'darkness', 80, [], body('Enigma Berry')));
    decks(s);
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(20);
  });
});
