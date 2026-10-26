import { describe, expect, it } from 'vitest';
import { namesMatch, type CardDef, type PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, mon, C, F, FI, G, P, W } from './test-kit.js';

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
const resolve = (s: GameState, answer: { cardUid?: string; target?: Target }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });
const fossil = (id: string, name: string): PokemonCardDef => ({ id, kind: 'pokemon', name, imageUrl: null, type: C, hp: 40, stage: 'basic', evolvesFrom: null, attacks: [], retreatCost: 0, trainerText: `Play ${name} as if it were a Basic Pokémon.` });
const DARKNESS_ENERGY: CardDef = { id: 'ex1-93', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness', basic: false };
const MULTI_ENERGY: CardDef = { id: 'ex2-93', kind: 'energy', name: 'Multi Energy', imageUrl: null, energyType: 'colorless', anyType: true, basic: false };

describe('EX Sandstorm', () => {
  it('Random Curse: 5 damage counters on any of the opponent\'s Pokémon, Active and Benched (agreed)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-4', 'Dusclops', P, 70, [['Judgement', [P, C], 0], ['Random Curse', [P, C, C], 0]], { stage: 'stage1' }), ['psychic', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Onix'));
    s = attack(s, 1);
    expect(s.pendingChoice).toMatchObject({ kind: 'placeCounters', count: 5, active: true });
    for (const target of ['active', 0, 0, 'active', 0] as Target[]) s = resolve(s, { target });
    expect(misty(s).active!.damage).toBe(20);
    expect(misty(s).bench[0]!.damage).toBe(30);
  });

  it('Split Blast: 50 to each of the opponent\'s Pokémon instead, with a Benched one (agreed); an Energy card discarded', () => {
    const s = duel('charmander', 'onix');
    const typhlosion = put(s, 'ash', 'active', mon('ex2-99', 'Typhlosion ex', F, 160, [['Ring of Fire', [F, C, C], 40], ['Split Blast', [F, F, F, C, C], 100]], { stage: 'stage2', ex: true }), ['fire', 'fire', 'fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Onix'));
    const after = attack(s, 1, { boost: true, energyUids: [typhlosion.energy[0]!.uid] });
    expect(misty(after).active!.damage).toBe(50);
    expect(misty(after).bench[0]!.damage).toBe(50);
    expect(ash(after).active!.energy).toHaveLength(4);
    expect(misty(attack(s, 1, { boost: false, energyUids: [typhlosion.energy[0]!.uid] })).active!.damage).toBe(100);
  });

  it('Primal Veil: while Armaldo is an Active Pokémon, neither player can play Supporter cards', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex2-1', 'Armaldo', FI, 120, [['Blade Arms', [FI, FI, C], 60]], { stage: 'stage2', ...power('Primal Veil') }));
    const uid = hand(s, 'ash', trainer('ex3-88', 'TV Reporter'));
    const res = applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain('Primal Veil');
  });

  it('Safeguard: attacks by the opponent\'s Pokémon-ex do nothing to Wobbuffet; other attacks do', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex2-26', 'Wobbuffet', P, 80, [['Flip Over', [P, C, C], 50]], power('Safeguard')));
    put(s, 'ash', 'active', mon('ex-attacker', 'Chansey ex', C, 120, [['Tackle', [C], 30]], { ex: true }), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    put(s, 'ash', 'active', mon('plain-attacker', 'Chansey', C, 120, [['Tackle', [C], 30]]), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Energy Variation: Kecleon is every type of basic Energy attached, so Weakness to any of them applies (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-18', 'Kecleon', C, 60, [['Tackle', [C], 20]], power('Energy Variation')), ['fire']);
    put(s, 'misty', 'active', big('Onix', { weakness: { type: W, multiplier: 2 } }));
    const water = hand(s, 'ash', { id: 'water', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: W });
    const attached = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: water, target: 'active' });
    expect(ash(attached).active!.variedTypes).toEqual(['fire', 'water']);
    expect(misty(attack(attached, 0)).active!.damage).toBe(40);
    put(s, 'ash', 'active', mon('ex2-18', 'Kecleon', C, 60, [['Tackle', [C], 20]], power('Energy Variation')), ['fire', 'fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Baby Evolution: Pikachu from the hand onto Pichu the turn it was played, all its damage counters off (agreed)', () => {
    const s = duel('charmander', 'onix');
    s.turn = 1;
    const pichu = put(s, 'ash', 0, mon('ex2-20', 'Pichu', 'lightning', 40, [['Energy Retrieval', ['lightning'], 0]], power('Baby Evolution')));
    pichu.playedTurn = 1;
    pichu.damage = 20;
    const uid = hand(s, 'ash', mon('ex2-pikachu', 'Pikachu', 'lightning', 60, [['Thundershock', ['lightning'], 10]]));
    const after = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { cardUid: uid } });
    expect(ash(after).bench[0]!.card.defId).toBe('ex2-pikachu');
    expect(ash(after).bench[0]!.damage).toBe(0);
    // A Pikachu ex never counts as Pikachu (agreed).
    const t = duel('charmander', 'onix');
    put(t, 'ash', 0, mon('ex2-20', 'Pichu', 'lightning', 40, [], power('Baby Evolution')));
    hand(t, 'ash', mon('pikachu-ex', 'Pikachu ex', 'lightning', 70, [], { ex: true }));
    expect(applyAction(t, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(false);
  });

  it('Rare Candy: a Stage 2 card straight onto its Fossil (agreed), not on the first turn or onto a Pokémon played this turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, fossil('ex2-90', 'Claw Fossil'));
    const armaldo = mon('ex2-1', 'Armaldo', FI, 120, [['Blade Arms', [FI, FI, C], 60]], { stage: 'stage2', evolvesFrom: 'Anorith', evolvesFromBasic: 'Claw Fossil' });
    const card = hand(s, 'ash', armaldo);
    const candy = hand(s, 'ash', trainer('ex2-88', 'Rare Candy'));
    const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: candy, choices: { handUids: [card], target: 0 } });
    expect(ash(after).bench[0]!.card.defId).toBe('ex2-1');
    const first = duel('charmander', 'onix');
    first.turn = 2;
    put(first, 'ash', 0, fossil('ex2-90', 'Claw Fossil'));
    hand(first, 'ash', armaldo);
    expect(applyAction(first, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(first, 'ash', trainer('ex2-88', 'Rare Candy')) }).ok).toBe(false);
  });

  it('Multi Energy: every type, but only Colorless beside another Special Energy card (checked all the time, agreed)', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex2-93'] = MULTI_ENERGY;
    s.cards['ex1-93'] = DARKNESS_ENERGY;
    put(s, 'ash', 'active', mon('water-attacker', 'Wailmer', W, 80, [['Splash', [W], 30]]), ['ex2-93']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    const dark = hand(s, 'ash', DARKNESS_ENERGY);
    const attached = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: dark, target: 'active' });
    expect(applyAction(attached, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
  });

  it('Lunar Eclipse: only with its owner\'s own Solrock in play (agreed); Lunatone is then a Darkness Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('ex2-8', 'Lunatone', P, 60, [], power('Lunar Eclipse')));
    put(s, 'misty', 0, mon('ex2-13', 'Solrock', FI, 70, [], power('Solar Eclipse')));
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} }).ok).toBe(false);
    put(s, 'ash', 1, mon('ex2-13', 'Solrock', FI, 70, [], power('Solar Eclipse')));
    const after = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: {} });
    expect(ash(after).bench[0]!.crystalType).toBe('darkness');
  });

  it('Target Slash: 30 more against a Seviper or a variant (Team Aqua\'s Seviper), never Seviper ex (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-14', 'Zangoose', C, 70, [['Target Slash', [C], 10]]), ['fire']);
    put(s, 'misty', 'active', big("Team Aqua's Seviper"));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    put(s, 'misty', 'active', big('Seviper ex', { ex: true }));
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
  });

  it("Supernatural: a Supporter card's effect from the opponent's hand, for Sableye's player; the card stays there (agreed)", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-10', 'Sableye', 'darkness', 60, [['Supernatural', [C], 0], ['Dark Bind', ['darkness', C], 20]]), ['fire']);
    const birch = hand(s, 'misty', trainer('ex1-89', 'Professor Birch'));
    const before = ash(s).hand.length;
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'supernatural' });
    s = resolve(s, { cardUid: birch });
    expect(ash(s).hand.length).toBe(Math.max(before, 6));
    expect(misty(s).hand.some((c) => c.uid === birch)).toBe(true);
  });

  it("Supernatural: a Supporter's questions are asked during the attack (agreed: Mr. Briney's Compassion's Pokémon)", () => {
    let s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex2-10', 'Sableye', 'darkness', 60, [['Supernatural', [C], 0], ['Dark Bind', ['darkness', C], 20]]), ['fire']);
    const briney = hand(s, 'misty', trainer('ex3-87', "Mr. Briney's Compassion"));
    const benched = ash(s).bench[0]!.card.uid;
    s = attack(s, 0);
    s = resolve(s, { cardUid: briney });
    expect(s.pendingChoice).toMatchObject({ kind: 'supernatural', cardUid: briney });
    s = resolve(s, { target: 0 });
    expect(ash(s).hand.some((c) => c.uid === benched)).toBe(true);
    expect(misty(s).hand.some((c) => c.uid === briney)).toBe(true);
  });

  it('namesMatch: every variant counts as its name (agreed), never a Pokémon-ex', () => {
    expect(namesMatch("Team Aqua's Seviper", 'Seviper')).toBe(true);
    expect(namesMatch('Kabuto δ', 'Kabuto')).toBe(true);
    expect(namesMatch('Dark Golbat', 'Golbat')).toBe(true);
    expect(namesMatch("Brock's Onix", 'Onix')).toBe(true);
    expect(namesMatch("Lt. Surge's Raichu", 'Raichu')).toBe(true);
    expect(namesMatch('Shining Magikarp', 'Magikarp')).toBe(true);
    expect(namesMatch('Mew ☆', 'Mew')).toBe(true);
    expect(namesMatch('Seviper ex', 'Seviper')).toBe(false);
    expect(namesMatch('Mr. Mime', 'Mime')).toBe(false);
  });

  it('Rain Dish: a damage counter off between turns, Benched too', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('ex2-66', 'Lotad', W, 40, [], power('Rain Dish'))).damage = 20;
    expect(ash(endTurn(s, 'ash')).bench[0]!.damage).toBe(10);
  });

  it("Strike and Run: up to 3 Basic Pokémon onto the Bench, then Dunsparce may switch with a Benched Pokémon", () => {
    let s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex2-60', 'Dunsparce', C, 50, [['Strike and Run', [C], 0]]), ['fire']);
    ash(s).deck.push({ uid: 'sq', defId: 'base1-63' });
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'basic', toBench: true });
    s = resolve(s, {});
    expect(s.pendingChoice).toMatchObject({ kind: 'switchIn', optional: true });
    s = resolve(s, { target: 0 });
    expect(ash(s).active!.card.defId).not.toBe('ex2-60');
  });

  it('Primal Lock: the opponent can\'t play Pokémon Tools, and theirs are discarded', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 0, mon('ex2-94', 'Aerodactyl ex', C, 100, [], { ex: true, stage: 'stage1', ...power('Primal Lock') }));
    const berry = hand(s, 'ash', trainer('ex3-82', 'Balloon Berry'));
    const res = applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: berry, choices: { target: 'active' } });
    expect(!res.ok && res.error).toContain('Primal Lock');
  });

  it('Poison Payback: damaged as the Active Pokémon, the Attacking Pokémon is Poisoned', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    put(s, 'misty', 'active', mon('ex2-57', 'Cacnea', G, 200, [], power('Poison Payback')));
    expect(ash(attack(s, 0)).active!.poison).toBe(10);
  });
});

describe('Fossils', () => {
  it('Claw Fossil is played onto the Bench as a 40 HP Basic Pokémon', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex2-90'] = fossil('ex2-90', 'Claw Fossil');
    s.players.ash!.hand.push({ uid: 'claw', defId: 'ex2-90' });
    const after = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: 'claw', slot: 0 });
    expect(ash(after).bench[0]!.card.defId).toBe('ex2-90');
    // As the Active Pokémon, it can't retreat.
    const active = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(active, 'ash', 'active', fossil('ex2-90', 'Claw Fossil'));
    expect(applyAction(active, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(false);
  });
});
