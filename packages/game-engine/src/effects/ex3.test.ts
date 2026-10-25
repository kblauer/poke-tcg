import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, C, F, G, P, W } from './test-kit.js';

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
const L = 'lightning';

describe('EX Dragon', () => {
  it('Dragon Dance: next turn, whichever Pokémon attacks does 40 more to the Defending Pokémon, never the Bench (agreed 2026-10-22)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex3-2', 'Altaria', C, 80, [['Dragon Dance', [C], 0]], { stage: 'stage1' }), ['fire']);
    put(s, 'ash', 0, mon('ex2-23', 'Steelix', 'metal', 100, [['Rage', [C], 10], ['Spinning Tail', [C, C, C], 0]], { stage: 'stage1' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Onix'));
    s = attack(s, 0);
    s = endTurn(s, 'misty');
    // Ash's next turn: Steelix in for Altaria, then Spinning Tail (20 to each): 60 to the Active Pokémon, 20 to the Benched one.
    s = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [ash(s).active!.energy[0]!.uid] });
    s = attack(s, 1);
    expect(misty(s).active!.damage).toBe(60);
    expect(misty(s).bench[0]!.damage).toBe(20);
  });

  it('Dragon Crush: heads, 10 to the Defending Pokémon and an Energy card from it (agreed: the Active Pokémon only); tails nothing', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex3-32', 'Gyarados', W, 100, [['Dragon Crush', [W], 0]], { stage: 'stage1' }), ['water']);
    put(s, 'misty', 'active', big('Snorlax'), ['fire']);
    put(s, 'misty', 0, big('Onix'), ['water']);
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(0);
    s = attack(flips(s, true), 0);
    expect(misty(s).active!.damage).toBe(10);
    expect(misty(s).bench[0]!.damage).toBe(0);
    // The Fire Energy is the only card to discard, so it's discarded without asking (the same-card rule).
    expect(misty(s).active!.energy).toHaveLength(0);
    expect(misty(s).bench[0]!.energy).toHaveLength(1);
  });

  it('Wonder Guard: attacks by the opponent\'s Evolved Pokémon and Pokémon-ex do nothing to Shedinja', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex3-11', 'Shedinja', G, 30, [], { stage: 'stage1', ...power('Wonder Guard') }));
    const evolved = put(s, 'ash', 'active', mon('evolved', 'Charmeleon', F, 80, [['Slash', [C], 20]], { stage: 'stage1' }), ['fire']);
    evolved.evolvedFrom = [{ uid: 'charmander-x', defId: 'charmander' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    put(s, 'ash', 'active', mon('basic', 'Charmander', F, 50, [['Slash', [C], 20]]), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Submerge: on the Bench, no damage from the opponent\'s attacks', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-23', 'Steelix', 'metal', 100, [['Rage', [C], 10], ['Spinning Tail', [C, C, C], 0]], { stage: 'stage1' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, mon('ex3-48', 'Whiscash', W, 90, [], { stage: 'stage1', ...power('Submerge') }));
    const after = attack(s, 1);
    expect(misty(after).active!.damage).toBe(20);
    expect(misty(after).bench[0]!.damage).toBe(0);
  });

  it('Conductivity: a damage counter on a Pokémon the opponent attaches an Energy card to from the hand, only 1 however many Ampharos ex', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex3-89', 'Ampharos ex', L, 150, [], { stage: 'stage2', ex: true, ...power('Conductivity') }));
    put(s, 'misty', 0, mon('ex3-89', 'Ampharos ex', L, 150, [], { stage: 'stage2', ex: true, ...power('Conductivity') }));
    const water = hand(s, 'ash', { id: 'water', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: 'water' });
    expect(ash(act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: water, target: 'active' })).active!.damage).toBe(10);
  });

  it("Toxic Gas (Muk ex): only as its owner's Active Pokémon, every other Poké-Power is ignored", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('ex2-55', 'Xatu', P, 70, [], { stage: 'stage1', ...power('Healing Wind') }));
    s.players.ash!.active!.damage = 20;
    const muk = mon('ex3-96', 'Muk ex', G, 100, [], { stage: 'stage1', ex: true, ...power('Toxic Gas') });
    put(s, 'misty', 0, muk);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(true);
    put(s, 'misty', 'active', muk);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(false);
  });

  it('Low Pressure System: Grass and Lightning Pokémon have 10 more HP', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('grass-mon', 'Oddish', G, 50, []));
    const uid = hand(s, 'ash', trainer('ex3-86', 'Low Pressure System'));
    const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid });
    expect(inPlayDef(after.cards, ash(after).bench[0]!).hp).toBe(60);
  });

  it("Mr. Briney's Compassion: the Active Pokémon and its cards back to the hand (agreed), a Benched one then promoted; never a Pokémon-ex", () => {
    let s = duel('charmander', 'onix', { energy: ['fire'], bench: ['squirtle'] });
    const uid = hand(s, 'ash', trainer('ex3-87', "Mr. Briney's Compassion"));
    const active = ash(s).active!;
    const returned = [active.card.uid, active.energy[0]!.uid];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices: { target: 'active' } });
    expect(returned.every((u) => ash(s).hand.some((c) => c.uid === u))).toBe(true);
    expect(ash(s).active?.card.uid ?? null).not.toBe(returned[0]);
    const ex = duel('charmander', 'onix');
    put(ex, 'ash', 'active', mon('lone-ex', 'Latias ex', C, 90, [], { ex: true }));
    expect(applyAction(ex, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(ex, 'ash', trainer('ex3-87', "Mr. Briney's Compassion")), choices: { target: 'active' } }).ok).toBe(false);
  });

  it('TV Reporter: draw 3 cards, then discard 1 from the hand', () => {
    let s = duel('charmander', 'onix');
    const uid = hand(s, 'ash', trainer('ex3-88', 'TV Reporter'));
    ash(s).hand.push({ uid: 'w', defId: 'water' });
    const before = ash(s).hand.length;
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid });
    expect(ash(s).hand).toHaveLength(before - 1 + 3);
    expect(s.pendingChoice).toMatchObject({ kind: 'discardFromHand', count: 1 });
    s = resolve(s, { cardUid: ash(s).hand[0]!.uid });
    expect(ash(s).hand).toHaveLength(before + 1);
  });

  it('Power Pinchers: as the Active Pokémon, its attacks do 10 more before Weakness', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex3-3', 'Crawdaunt', W, 80, [['Tackle', [C], 20]], { stage: 'stage1', ...power('Power Pinchers') }), ['water']);
    put(s, 'misty', 'active', big('Onix', { weakness: { type: W, multiplier: 2 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Big Explosion: 80 to each Active Pokémon, Graveler too (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex3-29', 'Graveler', 'fighting', 200, [['Grind', [C], 10], ['Big Explosion', [C, C], 0]], { stage: 'stage1' }), ['fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 1);
    expect(misty(after).active!.damage).toBe(80);
    expect(ash(after).active!.damage).toBe(80);
  });

  it('Luster Purge: Energy cards providing 3 Energy discarded (Double Colorless is 2, agreed)', () => {
    const s = duel('charmander', 'onix');
    s.cards.dce = { id: 'dce', kind: 'energy', name: 'Double Colorless Energy', imageUrl: null, energyType: 'colorless', amount: 2, basic: false };
    const latios = put(s, 'ash', 'active', mon('ex3-94', 'Latios ex', C, 100, [['Energy Stream', [C], 10], ['Luster Purge', [G, L, C], 100]], { ex: true }), ['grass', 'lightning', 'dce', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 1, { energyUids: [latios.energy[2]!.uid, latios.energy[3]!.uid] });
    expect(ash(after).active!.energy.map((e) => e.defId)).toEqual(['grass', 'lightning']);
  });

  it('Mist Ball: Rainbow or Multi Energy counts as the Fire or Water Energy (agreed)', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex2-93'] = { id: 'ex2-93', kind: 'energy', name: 'Multi Energy', imageUrl: null, energyType: 'colorless', anyType: true, basic: false };
    put(s, 'ash', 'active', mon('ex3-93', 'Latias ex', C, 90, [['Mist Ball', [F, W, C], 100]], { ex: true }), ['fire', 'ex2-93', 'grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(ash(attack(s, 0)).active!.energy.map((e) => e.defId)).toEqual(['grass']);
  });

  it('Glowing Screen: with its own Volbeat in play, 30 less from a Fighting Pokémon (agreed: the opponent\'s Volbeat doesn\'t count)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('fighter', 'Machop', 'fighting', 50, [['Punch', [C], 40]]), ['fire']);
    put(s, 'misty', 'active', mon('ex2-38', 'Illumise', G, 60, [], power('Glowing Screen')));
    put(s, 'ash', 0, mon('ex2-53', 'Volbeat', G, 60, [], power('Uplifting Glow')));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    put(s, 'misty', 0, mon('ex2-53', 'Volbeat', G, 60, [], power('Uplifting Glow')));
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
  });
});

const resolve = (s: GameState, answer: { cardUid?: string; target?: Target }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });
