import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, retreatCost, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, settles, C, FI, G, L, P, W } from './test-kit.js';

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
/** A card under a Pokémon in play (what it evolved from). */
function under(s: GameState, p: InPlayPokemon, def: PokemonCardDef) {
  s.cards = { ...s.cards, [def.id]: def };
  p.evolvedFrom.push({ uid: `${def.id}-${n++}`, defId: def.id });
}
/** Diamond & Pearl's basic Metal Energy. */
const METAL: CardDef = { id: 'dp1-130', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' };
const withMetal = (s: GameState) => ((s.cards = { ...s.cards, [METAL.id]: METAL }), s);
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
/** Cards on top of a player's deck, first on top. */
const stack = (s: GameState, player: string, ...defIds: string[]) => s.players[player]!.deck.unshift(...defIds.map((defId) => ({ uid: `deck-${defId}-${n++}`, defId })));

describe('Diamond & Pearl attacks', () => {
  it("Revenge: 50 more after one of the player's Pokémon was Knocked Out by damage from the opponent's attack last turn", () => {
    let s = duel('charmander', 'onix');
    Object.assign(s, { currentPlayer: 'misty', turn: 4 });
    put(s, 'misty', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 50]]), ['fighting']);
    put(s, 'ash', 'active', mon('weak', 'Pidgey', C, 40, []));
    put(s, 'ash', 0, mon('dp1-31', 'Machamp', FI, 130, [['Revenge', [FI], 20]], { stage: 'stage2' }), ['fighting']);
    s = attack(s, 0, undefined, 'misty');
    expect(ash(s).knockedOutByAttack).toBe(4);
    s = act(s, 'ash', { type: 'PROMOTE', slot: 0 });
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(70);
  });

  it('Accelerative Dive: heads, no attack damage to Staraptor until the end of its next turn, its own Brave Heart included', () => {
    let s = flips(duel('charmander', 'onix'), true);
    const staraptor = put(s, 'ash', 'active', mon('dp1-16', 'Staraptor', C, 100, [['Accelerative Dive', [C], 30], ['Brave Heart', [C], 100]], { stage: 'stage2' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0);
    expect(misty(s).active!.damage).toBe(30);
    expect(ash(s).active!.effects).toMatchObject({ preventDamage: 5, selfProof: 5 });
    s = flips(endTurn(s, 'misty'), false);
    s = attack(s, 1);
    expect(ash(s).active!.damage).toBe(0);
    expect(staraptor.damage).toBe(0);
  });

  it('Flash Cannon: Dialga\'s Energy back to the hand, the Defending Pokémon\'s top card shuffled into its deck', () => {
    let s = withMetal(duel('charmander', 'onix'));
    put(s, 'ash', 'active', mon('dp1-1', 'Dialga', 'metal', 90, [['Time Bellow', ['metal'], 10], ['Flash Cannon', ['metal'], 40]]), ['dp1-130', 'dp1-130']);
    const defender = put(s, 'misty', 'active', big('Wartortle', { stage: 'stage1', evolvesFrom: 'Squirtle' }));
    under(s, defender, big('Squirtle'));
    const [deck, held] = [misty(s).deck.length, misty(s).hand.length];
    s = attack(s, 1, { boost: true });
    expect(ash(s).active!.energy).toEqual([]);
    expect(ash(s).hand.filter((c) => c.defId === 'dp1-130')).toHaveLength(2);
    expect(s.cards[misty(s).active!.card.defId]!.name).toBe('Squirtle');
    expect([...misty(s).deck, ...misty(s).hand].some((c) => c.defId === 'big-Wartortle')).toBe(true);
    expect(misty(s).deck.length + misty(s).hand.length).toBe(deck + held + 1);
  });

  it('Transback: heads, Palkia\'s Energy discarded and the Defending Pokémon shuffled into its deck; nothing without the flip', () => {
    let s = flips(duel('charmander', 'onix'), true);
    put(s, 'ash', 'active', mon('dp1-11', 'Palkia', W, 90, [['Spacial Rend', [W], 10], ['Transback', [W], 40]]), ['water']);
    put(s, 'misty', 0, big('Snorlax'));
    const deck = misty(s).deck.length;
    s = attack(s, 1, { boost: true });
    expect(misty(s).active).toBeNull();
    expect(misty(s).deck.length).toBe(deck + 1);
    expect(ash(s).discard.map((c) => c.defId)).toContain('water');
    const kept = flips(duel('charmander', 'onix'), false);
    put(kept, 'ash', 'active', mon('dp1-11', 'Palkia', W, 90, [['Spacial Rend', [W], 10], ['Transback', [W], 40]]), ['water']);
    expect(misty(attack(kept, 1, { boost: true })).active).not.toBeNull();
  });

  it('See Beyond: a hand card becomes a face-up Prize card and a face-down one goes into the hand', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp1-34', 'Noctowl', C, 90, [['See Beyond', [C], 0]], { stage: 'stage1' }), ['grass']);
    ash(s).prizes = [{ uid: 'p1', defId: 'grass' }, { uid: 'p2', defId: 'grass' }];
    const card = hand(s, 'ash', trainer('dp1-118', 'Potion'));
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'handToPrize', player: 'ash' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: card });
    expect(ash(s).prizes.map((c) => c.uid)).toContain(card);
    expect(ash(s).faceUpPrizes).toEqual([card]);
    expect(ash(s).hand.some((c) => c.uid === 'p1' || c.uid === 'p2')).toBe(true);
  });

  it('Gravity Wave: 10 to each of the opponent\'s Benched Pokémon with no Retreat Cost', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp1-47', 'Dusclops', P, 80, [['Roam', [P], 0], ['Gravity Wave', [P], 30]], { stage: 'stage1' }), ['psychic']);
    put(s, 'misty', 0, big('Pidgey', { retreatCost: 0 }));
    put(s, 'misty', 1, big('Snorlax', { retreatCost: 4 }));
    const after = attack(s, 1);
    expect(misty(after).bench.map((p) => p?.damage)).toEqual([10, 0, undefined, undefined, undefined]);
  });

  it('Fake Tears: heads, no Trainer cards for the opponent next turn and 30 less damage to Bonsly', () => {
    let s = flips(duel('charmander', 'onix'), true);
    put(s, 'ash', 'active', mon('dp1-71', 'Bonsly', FI, 40, [['Fake Tears', [], 0]]));
    put(s, 'misty', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 50]]), ['fighting']);
    s = endTurn(attack(s, 0), 'misty');
    const potion = hand(s, 'misty', trainer('dp1-118', 'Potion'));
    expect(applyAction(s, 'misty', { type: 'PLAY_TRAINER', cardUid: potion }).ok).toBe(false);
  });

  it('Moon Impact (a shared wording): 20 more for a Clefairy evolved from Cleffa', () => {
    const s = duel('charmander', 'onix');
    const clefairy = put(s, 'ash', 'active', mon('dp1-77', 'Clefairy', C, 60, [['Sing', [C], 0], ['Moon Impact', [C], 20]]), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 1)).active!.damage).toBe(20);
    under(s, clefairy, mon('dp1-78', 'Cleffa', C, 40, []));
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Harden (a shared wording): attack damage of 30 or less to Cascoon is prevented next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp1-44', 'Cascoon', G, 80, [['Harden', [G], 0]], { stage: 'stage1' }), ['grass']);
    put(s, 'misty', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30], ['Smash', [C], 40]]), ['fighting']);
    s = attack(s, 0);
    expect(ash(attack(s, 0, undefined, 'misty')).active!.damage).toBe(0);
    expect(ash(attack(s, 1, undefined, 'misty')).active!.damage).toBe(40);
  });
});

describe('Diamond & Pearl Poké-Powers and Poké-Bodies', () => {
  const luxio = mon('luxio', 'Luxio', L, 80, [], { stage: 'stage1', evolvesFrom: 'Shinx' });

  it('Sharp Eye: as Luxray evolves, may put a Basic Pokémon from the opponent\'s hand onto their Bench and switch it in', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', luxio);
    const luxray = hand(s, 'ash', mon('dp1-7', 'Luxray', L, 120, [], { stage: 'stage2', evolvesFrom: 'Luxio', power: { name: 'Sharp Eye', text: '' } }));
    misty(s).hand = [];
    const pidgey = hand(s, 'misty', mon('pidgey', 'Pidgey', C, 40, []));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: luxray, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'sharpEye' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'oppHandToActive' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: pidgey });
    expect(misty(s).active!.card.uid).toBe(pidgey);
  });

  it('Earth Fissure: as Rhyperior evolves, may discard the top 3 cards of the opponent\'s deck', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('rhydon', 'Rhydon', FI, 90, [], { stage: 'stage1', evolvesFrom: 'Rhyhorn' }));
    const rhyperior = hand(s, 'ash', mon('dp1-12', 'Rhyperior', FI, 140, [], { stage: 'stage2', evolvesFrom: 'Rhydon', power: { name: 'Earth Fissure', text: '' } }));
    const deck = misty(s).deck.length;
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: rhyperior, target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([misty(s).deck.length, misty(s).discard.length]).toEqual([deck - 3, 3]);
  });

  it('Magnetize: the Active Pokémon with Metal Energy attached retreats for free while Magnezone is in play', () => {
    const s = withMetal(duel('charmander', 'onix'));
    const active = put(s, 'ash', 'active', big('Steelix', { retreatCost: 4 }), ['dp1-130']);
    expect(retreatCost(active, s.cards, [ash(s), misty(s)])).toBe(4);
    put(s, 'ash', 0, mon('dp1-8', 'Magnezone', 'metal', 120, [], { stage: 'stage2', power: { name: 'Magnetize', text: '' } }));
    expect(retreatCost(active, s.cards, [ash(s), misty(s)])).toBe(0);
    active.energy = [];
    expect(retreatCost(active, s.cards, [ash(s), misty(s)])).toBe(4);
  });

  it('Supreme Command: 2 cards from the opponent\'s hand set aside until the end of their next turn', () => {
    let s = duel('charmander', 'onix');
    const empoleon = mon('dp1-4', 'Empoleon', W, 130, [], { stage: 'stage2' });
    const lvx = put(s, 'ash', 'active', mon('dp1-120', 'Empoleon', W, 140, [], { stage: 'levelUp', power: { name: 'Supreme Command', text: '' } }));
    under(s, lvx, empoleon);
    misty(s).hand = [];
    for (let i = 0; i < 3; i++) hand(s, 'misty', trainer('dp1-118', 'Potion'));
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect([misty(s).hand.length, misty(s).setAside?.cards.length]).toEqual([1, 2]);
    s = endTurn(s, 'ash');
    expect(misty(s).setAside?.cards.length).toBe(2);
    s = endTurn(s, 'misty');
    expect(misty(s).setAside).toBeUndefined();
    expect(misty(s).hand.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Diamond & Pearl Trainers', () => {
  it('Professor Rowan: one card kept, the rest shuffled into the deck, 4 drawn', () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    const keep = hand(s, 'ash', trainer('dp1-118', 'Potion'));
    hand(s, 'ash', trainer('dp1-119', 'Switch'));
    const rowan = hand(s, 'ash', trainer('dp1-112', 'Professor Rowan'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: rowan, choices: { handUids: [keep] } });
    expect(ash(s).hand).toHaveLength(5);
    expect(ash(s).hand.some((c) => c.uid === keep)).toBe(true);
  });

  it('Rival: the opponent picks 3 of the top 5 cards for the hand; the deck is shuffled', () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    stack(s, 'ash', 'grass', 'fire', 'water', 'psychic', 'fighting');
    const rival = hand(s, 'ash', trainer('dp1-113', 'Rival'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: rival });
    expect(s.pendingChoice).toMatchObject({ kind: 'rival', player: 'misty' });
    const [a, b, c] = (s.pendingChoice as { looked: string[] }).looked;
    for (const uid of [a, b, c]) s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: uid });
    expect(s.pendingChoice).toBeUndefined();
    expect(ash(s).hand.map((card) => card.defId).sort()).toEqual(['fire', 'grass', 'water']);
  });

  it('Speed Stadium: a card drawn for each heads before a tails', () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    const stadium = hand(s, 'ash', trainer('dp1-114', 'Speed Stadium'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: stadium });
    s = act(flips(s, true, true, false), 'ash', { type: 'USE_STADIUM' });
    expect(ash(s).hand).toHaveLength(2);
  });

  it('Night Pokémon Center: 2 heads heals the Pokémon; 2 tails discards its Energy', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['grass', 'fire']).damage = 50;
    const play = (state: GameState) => act(state, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(state, 'ash', trainer('dp1-108', 'Night Pokémon Center')), choices: { target: 'active' } });
    expect(ash(play(flips(structuredClone(s), true, true))).active!.damage).toBe(0);
    const tails = ash(play(flips(structuredClone(s), false, false))).active!;
    expect([tails.damage, tails.energy.length]).toEqual([50, 0]);
  });
});

describe('Diamond & Pearl pending choices terminate', () => {
  it('Rival (rival), See Beyond (handToPrize), Earth Fissure and Sharp Eye (mayUse)', () => {
    let s = duel('charmander', 'onix');
    stack(s, 'ash', 'grass', 'fire', 'water', 'psychic', 'fighting');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp1-113', 'Rival')) });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();

    const prize = duel('charmander', 'onix');
    put(prize, 'ash', 'active', mon('dp1-34', 'Noctowl', C, 90, [['See Beyond', [C], 0]], { stage: 'stage1' }), ['grass']);
    ash(prize).prizes = [{ uid: 'p1', defId: 'grass' }];
    for (const end of settles(attack(prize, 0))) expect(end.pendingChoice).toBeUndefined();

    const fissure = duel('charmander', 'onix');
    put(fissure, 'ash', 'active', mon('rhydon', 'Rhydon', FI, 90, [], { stage: 'stage1', evolvesFrom: 'Rhyhorn' }));
    const card = hand(fissure, 'ash', mon('dp1-12', 'Rhyperior', FI, 140, [], { stage: 'stage2', evolvesFrom: 'Rhydon', power: { name: 'Earth Fissure', text: '' } }));
    for (const end of settles(act(fissure, 'ash', { type: 'EVOLVE', cardUid: card, target: 'active' }))) expect(end.pendingChoice).toBeUndefined();

    const eye = duel('charmander', 'onix');
    put(eye, 'ash', 'active', mon('luxio', 'Luxio', L, 80, [], { stage: 'stage1', evolvesFrom: 'Shinx' }));
    hand(eye, 'misty', mon('pidgey', 'Pidgey', C, 40, []));
    const luxray = hand(eye, 'ash', mon('dp1-7', 'Luxray', L, 120, [], { stage: 'stage2', evolvesFrom: 'Luxio', power: { name: 'Sharp Eye', text: '' } }));
    for (const end of settles(act(eye, 'ash', { type: 'EVOLVE', cardUid: luxray, target: 'active' }))) expect(end.pendingChoice).toBeUndefined();
  });
});
