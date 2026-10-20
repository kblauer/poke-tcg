import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, attackSituation, energyPool, inPlayDef, pendingChoiceView, powerError, resolveChoices, retreatCost, situationCounts, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, mon, C, F, FI, G, L, P, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const situation = (s: GameState, source: Target) => ({ me: ash(s), opp: misty(s), counts: situationCounts(ash(s), misty(s)), source, cards: s.cards, turn: s.turn });
const resolve = (s: GameState, answer: { cardUid?: string; target?: Target; count?: number }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });
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
const energyCard = (cardId: string, name: string, amount = 1): CardDef => ({ id: cardId, kind: 'energy', name, imageUrl: null, energyType: 'colorless', amount, basic: false });
const evolved = (p: InPlayPokemon) => void (p.evolvedFrom = [{ uid: `under-${n++}`, defId: id('charmander') }]);

const aerodactyl = mon('ecard3-1', 'Aerodactyl', FI, 70, [['Bite', [C], 30]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil', ...power('Ancient Wind') });
const growlithe = mon('ecard3-62', 'Growlithe', F, 50, [['Flare', [F], 10]]);
const arcanine = mon('ecard3-3', 'Arcanine', F, 80, [['Shake', [C], 10]], { stage: 'stage1', evolvesFrom: 'Growlithe', ...power('Energy Recharge') });
const beedrill = mon('ecard3-5', 'Beedrill', G, 80, [['Needle Rush', [C, C], 10]], { stage: 'stage2', evolvesFrom: 'Kakuna', ...power('Venom Spray') });
const dewgong = mon('ecard3-7', 'Dewgong', W, 80, [['Freeze Lock', [W, C], 20]], { stage: 'stage1' });
const kabutops = mon('ecard3-14', 'Kabutops', FI, 90, [['Dual Cut', [C], 50]], { stage: 'stage2', ...power('Primal Aura') });
const magneton = mon('ecard3-19', 'Magneton', L, 80, [['Electric Blast', [L, C, C], 40]], { stage: 'stage1' });
const nidoqueen = mon('ecard3-22', 'Nidoqueen', G, 110, [['Double Claw', [G, C, C], 30]], { stage: 'stage2', ...power('Evolution Helper') });
const omastar = mon('ecard3-23', 'Omastar', W, 90, [['Spook', [W, W, C], 50]], { stage: 'stage2', evolvesFrom: 'Omanyte', ...power('Primal Stare') });
const steelix = mon('ecard3-31', 'Steelix', 'metal', 100, [['Squeeze', ['metal', 'metal', C], 20]], { stage: 'stage1', ...power('Rare Metal') });
const umbreon = mon('ecard3-32', 'Umbreon', 'darkness', 70, [['Sharp Claws', ['darkness', C], 10]], { stage: 'stage1', ...power('Dark Gaze') });
const wigglytuff = mon('ecard3-34', 'Wigglytuff', C, 70, [['Do the Wave', [C, C], 10]], { stage: 'stage1', ...power('Good Neighbor') });
const xatu = mon('ecard3-35', 'Xatu', P, 80, [['Warp Hole', [C, C, C], 30]], { stage: 'stage1', ...power('Synchronicity') });
const kabuto = mon('ecard3-37', 'Kabuto', FI, 50, [['Scratch', [FI, C], 30]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil', ...power('Thick Shell') });
const omanyte = mon('ecard3-41', 'Omanyte', W, 60, [['Water of Evolution', [C], 0]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil' });
const wobbuffet = mon('ecard3-45', 'Wobbuffet', P, 70, [['Return Attack', [P, C], 10]], { ...power('Mirror Coat') });
const abra = mon('ecard3-46', 'Abra', P, 40, [['Headbutt', [C, C], 20]], { ...power('Psychoflow') });
const buriedFossil = mon('ecard3-47', 'Buried Fossil', C, 30, [], { ...power('Reconstruction') });
const ditto = mon('ecard3-51', 'Ditto', C, 50, [['Copy', [C], 0]], { ...power('Prismatic Body') });
const dunsparce = mon('ecard3-53', 'Dunsparce', C, 40, [['Tail Shake', [C], 10]], { ...power('Slippery Skin') });
const kakuna = mon('ecard3-70', 'Kakuna', G, 70, [['Poisonpowder', [G], 0]], { stage: 'stage1', evolvesFrom: 'Weedle', ...power('Exoskeleton') });
const nidoran = mon('ecard3-82', 'Nidoran♀', G, 50, [['Poison Sting', [C, C], 10]]);
const shuckle = mon('ecard3-96', 'Shuckle', G, 100, [['Poisonous Saliva', [G, C], 10]], { ...power('Vase Body') });

describe('Skyridge Pokémon', () => {
  it('Buried Fossil: Pokémon that evolve from Mysterious Fossil go onto it, and it can’t be affected by Special Conditions', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    put(s, 'ash', 0, buriedFossil);
    const uid = hand(s, 'ash', kabuto);
    expect(ash(act(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 0 })).bench[0]!.card.defId).toBe('ecard3-37');
    put(s, 'ash', 'active', nidoran, ['fire', 'fire']);
    put(s, 'misty', 'active', buriedFossil);
    expect(misty(attack(s, 0)).active!.poison ?? 0).toBe(0);
  });

  it('Primal Aura: no Evolution cards from the hand onto Benched Pokémon (either player); Primal Stare: not onto the Active Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'misty', 'active', kabutops);
    const [card] = give(s, 'ash', 'charmeleon');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: card!, target: 0 })).toEqual({ ok: false, error: "Primal Aura: Evolution cards can't be played onto Benched Pokémon" });
    expect(ash(act(s, 'ash', { type: 'EVOLVE', cardUid: card!, target: 'active' })).active!.card.defId).toBe(id('charmeleon'));
    put(s, 'misty', 'active', omastar);
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: card!, target: 'active' })).toEqual({ ok: false, error: "Primal Stare: Evolution cards can't be played onto your Active Pokémon" });
    expect(ash(act(s, 'ash', { type: 'EVOLVE', cardUid: card!, target: 0 })).bench[0]!.card.defId).toBe(id('charmeleon'));
  });

  it('Ancient Wind: every Poké-Body is ignored until the end of the turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', aerodactyl, ['fighting']);
    put(s, 'misty', 'active', shuckle);
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
    const windy = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(misty(attack(windy, 0)).active!.damage).toBe(30);
  });

  it("Dark Gaze: Benched Pokémon can't use Poké-Powers while Umbreon is Active", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, wigglytuff);
    expect(powerError(situation(s, 0))).toBeNull();
    put(s, 'misty', 'active', umbreon);
    expect(powerError(situation(s, 0))).toBe("Dark Gaze: Benched Pokémon can't use Poké-Powers");
  });

  it("Good Neighbor: once a turn whichever Wigglytuff; heads, 2 damage counters off each Active Pokémon", () => {
    const s = flips(duel('charmander', 'onix'), true);
    put(s, 'ash', 0, wigglytuff);
    put(s, 'ash', 1, wigglytuff);
    ash(s).active!.damage = 30;
    misty(s).active!.damage = 10;
    const after = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    expect([ash(after).active!.damage, misty(after).active!.damage]).toEqual([10, 0]);
    expect(powerError(situation(after, 1))).toBe('Good Neighbor has already been used this turn');
  });

  it('Mirror Coat: Poisoned by the attack, Wobbuffet poisons the attacker', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', nidoran, ['fire', 'fire']);
    put(s, 'misty', 'active', wobbuffet);
    const after = attack(s, 0);
    expect([misty(after).active!.poison, ash(after).active!.poison]).toEqual([10, 10]);
  });

  it('Prismatic Body and Rare Metal change what basic Energy cards provide', () => {
    const s = duel('charmander', 'onix');
    expect(energyPool(put(s, 'ash', 0, ditto, ['fire', 'water']), s.cards)).toEqual(['any', 'any']);
    expect(energyPool(put(s, 'ash', 1, steelix, ['fire']), s.cards)).toEqual(['metal']);
  });

  it('Thick Shell: 10 less damage from Evolved Pokémon only', () => {
    const s = duel('charmander', 'onix');
    const hitter = put(s, 'ash', 'active', mon('sk-hitter', 'Hitter', C, 80, [['Hit', [C], 30]]), ['fire']);
    put(s, 'misty', 'active', kabuto);
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    evolved(hitter);
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Psychoflow and Slippery Skin: Retreat Cost 0', () => {
    const s = duel('charmander', 'onix');
    const a = put(s, 'ash', 'active', abra, ['fire']);
    expect(retreatCost(a, s.cards, [ash(s), misty(s)])).toBe(1);
    a.energy.push({ uid: 'p', defId: 'psychic' });
    expect(retreatCost(a, s.cards, [ash(s), misty(s)])).toBe(0);
    const d = put(s, 'ash', 'active', dunsparce);
    expect(retreatCost(d, s.cards, [ash(s), misty(s)])).toBe(1);
    evolved(misty(s).active!);
    expect(retreatCost(d, s.cards, [ash(s), misty(s)])).toBe(0);
  });

  it("Freeze Lock: heads, the opponent can't attach Energy cards from the hand to their Active Pokémon next turn", () => {
    const s = flips(duel('charmander', 'onix'), true);
    put(s, 'ash', 'active', dewgong, ['water', 'water']);
    const after = attack(s, 0);
    misty(after).hand.push({ uid: 'f', defId: 'fighting' });
    expect(applyAction(after, 'misty', { type: 'ATTACH_ENERGY', cardUid: 'f', target: 'active' })).toMatchObject({ ok: false });
  });

  it('Energy Recharge: evolving the Active Pokémon, 3 coins; a basic Energy card from the discard pile for each heads', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', growlithe);
    ash(s).discard.push({ uid: 'd1', defId: 'fire' }, { uid: 'd2', defId: 'water' }, { uid: 'd3', defId: 'fire' });
    const asked = act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', arcanine), target: 'active' });
    expect(asked.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'energyRecharge' });
    const two = resolve(flips(asked, true, true, false), { count: 0 });
    expect(two.pendingChoice).toMatchObject({ kind: 'attachFromDiscard', count: 2 });
    const done = resolve(resolve(two, { cardUid: 'd2' }), { cardUid: 'd1' });
    expect(ash(done).active!.energy.map((e) => e.uid)).toEqual(['d2', 'd1']);
    expect(done.pendingChoice).toBeUndefined();
  });

  it('Venom Spray: evolving the Active Pokémon, the Defending Pokémon is Paralyzed and Poisoned', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', kakuna);
    const after = act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', beedrill), target: 'active' });
    expect([misty(after).active!.condition, misty(after).active!.poison]).toEqual(['paralyzed', 10]);
  });

  it('Investigate: the player picks 1 or 2 of a player\'s Prize cards to look at; with 2 or fewer, they\'re all shown', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ecard3-40', 'Noctowl', C, 70, [['Triple Smash', [C, C], 10]], { stage: 'stage1', ...power('Investigate') }));
    misty(s).prizes = [0, 1, 2, 3].map((i) => ({ uid: `p${i}`, defId: id('charmander') }));
    const asked = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { peek: 'oppPrize' } });
    expect(pendingChoiceView(asked, asked.pendingChoice!)).toMatchObject({ kind: 'options', labels: ['Prize 1', 'Prize 2', 'Prize 3', 'Prize 4'] });
    const one = resolve(asked, { count: 2 });
    expect(pendingChoiceView(one, one.pendingChoice!)).toMatchObject({ kind: 'options', labels: ['Prize 1', 'Prize 2', 'Prize 4', 'Only that one'] });
    const two = resolve(one, { count: 2 });
    expect(pendingChoiceView(two, two.pendingChoice!)).toMatchObject({ kind: 'oppHand', cards: [{ uid: 'p2' }, { uid: 'p3' }] });
    const only = resolve(one, { count: 3 });
    expect(pendingChoiceView(only, only.pendingChoice!)).toMatchObject({ kind: 'oppHand', cards: [{ uid: 'p2' }] });
    expect(resolve(only, {}).pendingChoice).toBeUndefined();
    misty(s).prizes = misty(s).prizes.slice(0, 2);
    const few = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { peek: 'oppPrize' } });
    expect(pendingChoiceView(few, few.pendingChoice!)).toMatchObject({ kind: 'oppHand', cards: [{ uid: 'p0' }, { uid: 'p1' }] });
  });

  it('Streaming Mantle: both players discard their top 3 cards; each picks 3 basic Energy cards to shuffle back when they have more', () => {
    const s = duel('charmander', 'onix');
    const slugma = mon('ecard3-slugma', 'Slugma', F, 50, [['Ember', [F], 10]]);
    const magcargo = mon('ecard3-18', 'Magcargo', F, 80, [['Crushing Lava', [F, C], 40]], { stage: 'stage1', evolvesFrom: 'Slugma', ...power('Streaming Mantle') });
    put(s, 'ash', 'active', slugma);
    for (const player of [ash(s), misty(s)]) player.deck = [0, 1, 2, 3].map((i) => ({ uid: `${player.id}-top${i}`, defId: id('charmander') }));
    ash(s).discard = ['fire', 'water', 'fire', 'grass'].map((e, i) => ({ uid: `a${i}`, defId: e }));
    misty(s).discard = ['fighting', 'water'].map((e, i) => ({ uid: `m${i}`, defId: e }));
    const asked = resolve(act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', magcargo), target: 'active' }), { count: 0 });
    expect(misty(asked).deck.map((c) => c.uid)).toEqual(['misty-top3']);
    expect(asked.pendingChoice).toMatchObject({ player: 'ash', kind: 'discardToDeck', count: 3, filter: 'basicEnergy', then: 'misty' });
    const done = resolve(resolve(resolve(asked, { cardUid: 'a3' }), { cardUid: 'a1' }), { cardUid: 'a0' });
    expect(done.pendingChoice).toBeUndefined();
    expect(ash(done).discard.map((c) => c.uid)).toContain('a2');
    expect(ash(done).deck.map((c) => c.uid)).toEqual(expect.arrayContaining(['a0', 'a1', 'a3', 'ash-top3']));
    // Misty had only 2: both go back by themselves.
    expect(misty(done).deck.map((c) => c.uid).sort()).toEqual(['m0', 'm1', 'misty-top3']);
    // With more than 3, Misty picks hers after Ash.
    misty(s).discard.push(...['grass', 'fire'].map((e, i) => ({ uid: `m${i + 2}`, defId: e })));
    const theirs = resolve(resolve(resolve(resolve(act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', magcargo), target: 'active' }), { count: 0 }), { cardUid: 'a3' }), { cardUid: 'a1' }), { cardUid: 'a0' });
    expect(theirs.pendingChoice).toMatchObject({ player: 'misty', kind: 'discardToDeck', count: 3 });
    expect(resolve(theirs, { cardUid: 'm1' }, 'misty').pendingChoice).toMatchObject({ player: 'misty', count: 2 });
  });

  it('Evolution Helper: from the Bench, the Active Pokémon evolves with a card from the deck', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, nidoqueen);
    ash(s).deck.push({ uid: 'evo', defId: id('charmeleon') });
    const asked = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    expect(asked.pendingChoice).toMatchObject({ kind: 'evolveFromDeck', names: ['Charmeleon'] });
    expect(ash(resolve(asked, { cardUid: 'evo' })).active!.card.defId).toBe(id('charmeleon'));
  });

  it('Electric Blast: discarding the Lightning Energy cards, that many damage counters on Benched Pokémon as the player likes', () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle', 'squirtle'] });
    put(s, 'ash', 'active', magneton, ['lightning', 'lightning', 'lightning']);
    const asked = attack(s, 0, { boost: true });
    expect(ash(asked).active!.energy).toEqual([]);
    const done = resolve(resolve(resolve(asked, { target: 0 }), { target: 1 }), { target: 0 });
    expect(misty(done).bench.filter(Boolean).map((p) => p!.damage)).toEqual([20, 10]);
  });

  it('Water of Evolution: an Omastar from the hand onto Omanyte', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', omanyte, ['water']);
    const uid = hand(s, 'ash', omastar);
    const asked = attack(s, 0);
    expect(ash(resolve(asked, { cardUid: uid })).active!.card.defId).toBe('ecard3-23');
  });
});

describe('Skyridge Trainers and Energy', () => {
  const play = (s: GameState, uid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices });

  it('Mirage Stadium: tails, the Pokémon can’t retreat this turn and keeps its Energy', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'], bench: ['squirtle'] });
    s.cards['ecard3-132'] = trainer('ecard3-132', 'Mirage Stadium');
    s.stadium = { card: { uid: 'mirage', defId: 'ecard3-132' }, owner: 'misty' };
    const uid = ash(s).active!.energy[0]!.uid;
    const stuck = act(flips(s, false), 'ash', { type: 'RETREAT', slot: 0, energyUids: [uid] });
    expect([ash(stuck).active!.card.defId, ash(stuck).active!.energy.length]).toEqual([id('charmander'), 1]);
    expect(ash(act(flips(s, true), 'ash', { type: 'RETREAT', slot: 0, energyUids: [uid] })).active!.card.defId).toBe(id('squirtle'));
  });

  it('Star Piece: between turns, a Benched Pokémon with 2 damage counters evolves from the deck', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    ash(s).deck.push({ uid: 'evo', defId: id('charmeleon') });
    const piece = play(s, hand(s, 'ash', trainer('ecard3-139', 'Star Piece')), { target: 0 });
    ash(piece).bench[0]!.damage = 20;
    const after = endTurn(piece, 'ash');
    expect([ash(after).bench[0]!.card.defId, ash(after).bench[0]!.attached ?? []]).toEqual([id('charmeleon'), []]);
  });

  it('Crystal Shard: Colorless while attached, discarded at the end of a turn its Pokémon attacks', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    const shard = play(s, hand(s, 'ash', trainer('ecard3-122', 'Crystal Shard')), { target: 'active' });
    expect(inPlayDef(shard.cards, ash(shard).active!).type).toBe('colorless');
    const after = attack(shard, 0);
    expect(ash(after).discard.map((c) => c.defId)).toContain('ecard3-122');
  });

  it('Bounce Energy: only onto a Pokémon with basic Energy; returns one to the hand and provides 2', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    const uid = hand(s, 'ash', energyCard('ecard3-142', 'Bounce Energy', 2));
    ash(s).bench[0] = { card: { uid: 'b', defId: id('squirtle') }, evolvedFrom: [], damage: 0, energy: [], playedTurn: 0 };
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 0 })).toEqual({ ok: false, error: 'Bounce Energy can only be attached to a Pokémon with basic Energy cards attached' });
    const after = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' });
    expect(ash(after).hand.map((c) => c.defId)).toContain('fire');
    expect(energyPool(ash(after).active!, after.cards)).toEqual(['colorless', 'colorless']);
  });

  it("Cyclone Energy: attached to the Active Pokémon, the opponent switches theirs", () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    const after = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', energyCard('ecard3-143', 'Cyclone Energy')), target: 'active' });
    expect(misty(after).active!.card.defId).toBe(id('squirtle'));
  });

  it('Retro Energy: an Evolved Pokémon may lose 2 damage counters and its top card', () => {
    const s = duel('charmeleon', 'onix');
    evolved(ash(s).active!);
    ash(s).active!.damage = 30;
    const asked = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', energyCard('ecard3-144', 'Retro Energy')), target: 'active' });
    const after = resolve(asked, { count: 0 });
    expect([ash(after).active!.card.defId, ash(after).active!.damage]).toEqual([id('charmander'), 10]);
  });

  it('Synchronicity: Xatu can take a Miracle Sphere for other types', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, xatu);
    const after = play(s, hand(s, 'ash', trainer('ecard3-129', 'Miracle Sphere α')), { target: 0 });
    expect(ash(after).bench[0]!.attached?.map((a) => a.card.defId)).toEqual(['ecard3-129']);
  });

  it('Mystery Plate β – Stone Crush: with the opponent at 5 or more Prize cards, draw 3', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    const plated = play(s, hand(s, 'ash', trainer('ecard3-134', 'Mystery Plate β')), { target: 'active' });
    expect(misty(plated).prizes.length).toBeGreaterThanOrEqual(5);
    const before = ash(plated).hand.length;
    expect(ash(attack(plated, 2)).hand.length).toBe(before + 3);
  });

  it('Mystery Plate δ – Healing Oasis: its Pokémon is asked for only when the opponent has exactly 2 Prize cards left', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    ash(s).active!.damage = 20;
    const plated = play(s, hand(s, 'ash', trainer('ecard3-136', 'Mystery Plate δ')), { target: 'active' });
    // With one Pokémon to choose, the answer fills itself in.
    const answered = (state: GameState) => resolveChoices(attackSituation(state, ash(state), misty(state)), 2, {});
    expect(answered(plated)).toEqual({ choices: {} });
    misty(plated).prizes = misty(plated).prizes.slice(0, 2);
    expect(answered(plated)).toEqual({ choices: { ownTarget: 'active' } });
    expect(ash(attack(plated, 2, { ownTarget: 'active' })).active!.damage).toBe(0);
  });

  it('Oracle: 2 cards from the deck on top, in the order chosen', () => {
    const s = duel('charmander', 'onix');
    const [a, b] = [ash(s).deck.at(-1)!.uid, ash(s).deck.at(-2)!.uid];
    const picked = resolve(resolve(play(s, hand(s, 'ash', trainer('ecard3-138', 'Oracle'))), { cardUid: a }), { cardUid: b });
    expect(picked.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 2 });
    const done = act(picked, 'ash', { type: 'RESOLVE_CHOICE', order: [b, a] });
    expect(ash(done).deck.slice(0, 2).map((c) => c.uid)).toEqual([b, a]);
  });

  it('Underground Expedition: 2 of the bottom 4 cards into the hand', () => {
    const s = duel('charmander', 'onix');
    const bottom = ash(s).deck.slice(-4).map((c) => c.uid);
    const done = resolve(resolve(play(s, hand(s, 'ash', trainer('ecard3-140', 'Underground Expedition'))), { cardUid: bottom[0] }), { cardUid: bottom[3] });
    expect(ash(done).hand.map((c) => c.uid)).toEqual(expect.arrayContaining([bottom[0], bottom[3]]));
    expect(ash(done).deck.slice(-2).map((c) => c.uid)).toEqual([bottom[1], bottom[2]]);
  });
});
