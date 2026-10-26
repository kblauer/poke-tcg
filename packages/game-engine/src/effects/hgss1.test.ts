import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, id, mon, settles, C, F, FI, G, L, P, W } from './test-kit.js';

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
const pile = (k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const hitter = (damage: number, extra: Partial<PokemonCardDef> = {}) => mon(`hitter-${damage}`, 'Machop', FI, 300, [['Punch', [C], damage]], extra);
const usePower = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });
const decks = (s: GameState) => {
  ash(s).deck = pile(10);
  misty(s).deck = pile(10);
};
const lugia = (cardId: string) => mon(cardId, 'Lugia LEGEND', W, 130, [['Elemental Blast', [F, W, L], 200]], body('Ocean Grow'));

describe('Pokémon LEGEND', () => {
  it('both halves go onto the Bench together, as one Pokémon', () => {
    let s = duel('charmander', 'onix');
    const top = hand(s, 'ash', lugia('hgss1-113'));
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: top, slot: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/other half/) });
    hand(s, 'ash', lugia('hgss1-114'));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: top, slot: 0 });
    // Ocean Grow is asked as it comes into play.
    if (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 1 });
    expect([ash(s).bench[0]!.card.uid, ash(s).bench[0]!.attached?.map((a) => a.legendHalf), ash(s).hand.some((c) => c.defId.startsWith('hgss1-11'))]).toEqual([top, [true], false]);
  });

  it('a LEGEND Knocked Out gives up 2 Prize cards, both halves discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(200), ['fighting']);
    const legend = put(s, 'misty', 'active', lugia('hgss1-113'));
    s.cards = { ...s.cards, 'hgss1-114': lugia('hgss1-114') };
    legend.attached = [{ card: { uid: 'half', defId: 'hgss1-114' }, until: Number.MAX_SAFE_INTEGER, legendHalf: true }];
    put(s, 'misty', 0, big('Snorlax'));
    decks(s);
    const prizes = ash(s).prizes.length;
    s = attack(s, 0);
    expect([ash(s).prizes.length, misty(s).discard.some((c) => c.uid === 'half')]).toEqual([prizes - 2, true]);
  });

  it('a LEGEND is no Basic Pokémon for setup', () => {
    const s = duel('charmander', 'onix');
    s.phase = 'setup';
    const top = hand(s, 'ash', lugia('hgss1-113'));
    hand(s, 'ash', lugia('hgss1-114'));
    ash(s).bench = [null, null, null, null, null];
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: top, slot: 0 }).ok).toBe(false);
  });

  it('Ocean Grow: the Energy cards among the top 5 attached to Lugia LEGEND, the rest discarded', () => {
    let s = duel('charmander', 'onix');
    const top = hand(s, 'ash', lugia('hgss1-113'));
    hand(s, 'ash', lugia('hgss1-114'));
    ash(s).deck = [{ uid: 'w1', defId: 'water' }, { uid: 'c1', defId: id('charmander') }, { uid: 'f1', defId: 'fire' }, ...pile(5)];
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: top, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([ash(s).bench[0]!.energy.map((e) => e.uid), ash(s).discard.length]).toEqual([['w1', 'f1'], 3]);
  });
});

describe('HeartGold & SoulSilver powers', () => {
  it('Sweet Sleeping Face: while Asleep, no damage from attacks', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('hgss1-17', 'Cleffa', C, 30, [], body('Sweet Sleeping Face'))).condition = 'asleep';
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Green Shield: no Weakness for its player\'s Grass Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('grassy', 'Tangela', G, 300, [], { weakness: { type: 'fighting', multiplier: 2 } }));
    put(s, 'misty', 0, mon('hgss1-46', 'Metapod', G, 80, [], { stage: 'stage1', ...body('Green Shield') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('RETURN: benched from the hand, every Energy card on one of the player\'s Pokémon back into the hand', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['water', 'fire']);
    const unown = hand(s, 'ash', mon('hgss1-54', 'Unown', P, 50, [], body('RETURN')));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: unown, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect([ash(s).active!.energy.length, ash(s).hand.filter((c) => c.defId === 'water' || c.defId === 'fire').length]).toEqual([0, 2]);
  });

  it('Blissful Nurse: evolving from the hand, every damage counter off, the damaged Pokémon\'s Energy discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('chansey-x', 'Chansey', C, 90, []), ['water']).damage = 30;
    put(s, 'ash', 0, big('Snorlax'), ['fire']);
    const blissey = hand(s, 'ash', mon('hgss1-106', 'Blissey', C, 130, [], { stage: 'stage1', evolvesFrom: 'Chansey', ...body('Blissful Nurse') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: blissey, target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([ash(s).active!.damage, ash(s).active!.energy.length, ash(s).bench[0]!.energy.length]).toEqual([0, 0, 1]);
  });

  it('Afterburner: a basic Fire Energy card from the discard pile attached, a damage counter on that Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss1-110', 'Typhlosion', F, 140, [], { stage: 'stage2', ...body('Afterburner') }));
    put(s, 'ash', 0, big('Snorlax'));
    ash(s).discard = [{ uid: 'f1', defId: 'fire' }];
    s = usePower(s, 'active');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).bench[0]!.energy.map((e) => e.uid), ash(s).bench[0]!.damage]).toEqual([['f1'], 10]);
  });

  it('Second Sight: the top 3 cards of either deck rearranged', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss1-12', 'Slowking', P, 80, [], { stage: 'stage1', ...body('Second Sight') }));
    decks(s);
    s = usePower(s, 'active', { fromSide: 'opp' });
    expect(s.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 3, deckOwner: 'misty' });
  });
});

describe('HeartGold & SoulSilver attacks and Trainers', () => {
  it('Graffiti: the Defending Pokémon\'s attacks cost 1 Colorless more next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss1-44', 'Igglybuff', C, 30, [['Graffiti', [], 0]]));
    put(s, 'misty', 'active', hitter(30), ['fighting']);
    decks(s);
    s = attack(s, 0);
    expect(applyAction(s, 'misty', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
  });

  it('Playground: each player benches Basic Pokémon from their deck, the player first', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss1-28', 'Pichu', L, 30, [['Playground', [], 0]]));
    s.cards = { ...s.cards, sq: mon('sq', 'Squirtle', W, 50, []) };
    ash(s).deck = [{ uid: 'a1', defId: 'sq' }, { uid: 'a2', defId: id('charmander') }, { uid: 'w', defId: 'water' }];
    misty(s).deck = [{ uid: 'm1', defId: 'sq' }, { uid: 'm2', defId: id('charmander') }, { uid: 'f', defId: 'fire' }];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'a1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'a2' });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'pickFromDeck' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'm1' });
    // Misty's last Basic Pokémon is taken without asking (the same-card rule).
    expect([ash(s).bench.filter(Boolean).length, misty(s).bench.filter(Boolean).length]).toEqual([2, 2]);
  });

  it('Static Electricity: Lightning Energy cards from the deck for each Mareep in play, attached to it', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hgss1-73', 'Mareep', L, 40, [['Static Electricity', [C], 0]]), ['lightning']);
    put(s, 'misty', 'active', mon('mareep-x', 'Mareep', L, 40, []));
    ash(s).deck = [{ uid: 'l1', defId: 'lightning' }, { uid: 'l2', defId: 'lightning' }, { uid: 'l3', defId: 'lightning' }, ...pile(3)];
    s = attack(s, 0);
    expect(ash(s).active!.energy.length).toBe(3);
  });

  it('Fisherman: 4 basic Energy cards from the discard pile, not fewer when there are 4', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'hgss1-92': trainer('hgss1-92', 'Fisherman') };
    ash(s).hand = [{ uid: 'fish', defId: 'hgss1-92' }];
    ash(s).discard = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }, { uid: 'g1', defId: 'grass' }, { uid: 'l1', defId: 'lightning' }, { uid: 'p1', defId: 'psychic' }];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'fish' });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE' }).ok).toBe(false);
    for (const uid of ['w1', 'f1', 'g1', 'l1']) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: uid });
    expect([ash(s).hand.length, s.pendingChoice]).toEqual([4, undefined]);
  });

  it('Pokégear 3.0: a Supporter card among the top 7', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'hgss1-96': trainer('hgss1-96', 'Pokégear 3.0'), 'hgss1-97': trainer('hgss1-97', 'Pokémon Collector'), 'hgss1-101': trainer('hgss1-101', "Professor Oak's New Theory") };
    ash(s).hand = [{ uid: 'gear', defId: 'hgss1-96' }];
    ash(s).deck = [{ uid: 'col', defId: 'hgss1-97' }, { uid: 'oak', defId: 'hgss1-101' }, ...pile(5)];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'gear' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'oak' });
    expect(ash(s).hand.map((c) => c.uid)).toEqual(['oak']);
  });
});
