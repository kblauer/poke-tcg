import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, getPlayerView, inPlayDef, retreatCost, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, C, F, FI, G, P, W } from './test-kit.js';

// Boundaries Crossed (README: Generation 5): its attacks, Abilities and Trainers.
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
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const ability = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const use = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });
const play = (s: GameState, cardUid: string, choices = {}, player = 'ash') => act(s, player, { type: 'PLAY_TRAINER', cardUid, choices });
const pile = (k: number, defId = id('charmander')) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId }));

describe('Boundaries Crossed attacks', () => {
  it('Hundred Furious Lashes: 30 for each Grass Energy, and not again next turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-6', 'Tangrowth', G, 130, [['Hundred Furious Lashes', [G], 30]], { stage: 'stage1' }), ['grass', 'grass', 'grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(90);
    expect(ash(after).active!.effects?.amnesia).toMatchObject({ attack: 'Hundred Furious Lashes' });
  });

  it('Fluffy Tag: switched with a Benched Pokémon, whose attacks do 40 more on the next turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-15', 'Whimsicott', G, 80, [['Fluffy Tag', [C], 0]], { stage: 'stage1' }), ['grass']);
    const tagged = put(s, 'ash', 0, mon('tagged', 'Machop', FI, 70, [['Punch', [C], 20]]), ['fighting']);
    const after = attack(s, 0, { ownBenchSlot: 0 });
    expect(ash(after).active!.card.uid).toBe(tagged.card.uid);
    expect(ash(after).active!.effects?.nextTurnMore).toEqual({ amount: 40, turn: s.turn + 2 });
  });

  it('Damage Counterpunch: 60 more with damage counters on it; Facade-like conditions aside', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-28', 'Darmanitan', F, 130, [['Damage Counterpunch', [F, C, C], 60]], { stage: 'stage1' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    ash(s).active!.damage = 10;
    expect(misty(attack(s, 0)).active!.damage).toBe(120);
  });

  it('Firefighting: only a Fire Energy is offered, and it\'s discarded', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-33', 'Psyduck', W, 60, [['Firefighting', [W], 0]]), ['water']);
    const target = put(s, 'misty', 'active', big('Snorlax'), ['fire', 'water']);
    const fire = target.energy[0]!.uid;
    const after = attack(s, 0, { defenderEnergyUid: fire });
    expect(misty(after).active!.energy.map((e) => e.defId)).toEqual(['water']);
  });

  it('Super Fang: damage counters until the Defending Pokémon has 10 HP left', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-105', 'Raticate', C, 80, [['Super Fang', [C, C, C], 0]], { stage: 'stage1' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: C, multiplier: 2 } })).damage = 50;
    expect(misty(attack(s, 0)).active!.damage).toBe(290);
  });

  it("Land's Judgment: every Fighting Energy may go for 70 more", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-89', 'Landorus-EX', FI, 180, [["Land's Judgment", [FI, FI, C], 80]], { pokemonEX: true }), ['fighting', 'fighting', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0, { boost: false })).active!.damage).toBe(80);
    const after = attack(s, 0, { boost: true });
    expect(misty(after).active!.damage).toBe(150);
    expect(ash(after).active!.energy.map((e) => e.defId)).toEqual(['fire']);
  });

  it('Assist: heads, the Benched Pokémon\'s attack picked is used; tails, nothing', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-91', 'Liepard', 'darkness', 80, [['Assist', [C, C, C], 0]], { stage: 'stage1' }), ['fire', 'fire', 'fire']);
    put(s, 'ash', 0, mon('helper', 'Machop', FI, 70, [['Punch', [C], 20], ['Big Punch', [C, C, C, C], 70]]));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(flips(s, true), 0, { ownBenchSlot: 0, amount: 1 })).active!.damage).toBe(70);
    expect(misty(attack(flips(s, false), 0, { ownBenchSlot: 0, amount: 1 })).active!.damage).toBe(0);
  });

  it('Dream Waltz: used while Asleep, for 30 more', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-69', 'Musharna', P, 100, [['Dream Waltz', [P, C, C], 60]], { stage: 'stage1' }), ['psychic', 'psychic', 'psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).active!.condition = 'asleep';
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
  });

  it('Jet Woofer: the top card of the opponent\'s deck discarded for each Psychic Energy', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-71', 'Swoobat', P, 90, [['Jet Woofer', [P], 0]], { stage: 'stage1' }), ['psychic', 'psychic']);
    const after = attack(s, 0);
    expect(misty(after).discard.length).toBe(misty(s).discard.length + 2);
  });

  it('Flying Beatdown: a Grass and a Fighting Energy discarded Paralyze the Defending Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-99', 'Flygon', 'dragon', 140, [['Flying Beatdown', [G, FI, C, C], 80]], { stage: 'stage2' }), ['grass', 'fighting', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0, { boost: true });
    expect(misty(after).active!.condition).toBe('paralyzed');
    expect(ash(after).active!.energy.map((e) => e.defId)).toEqual(['fire', 'fire']);
  });

  it('Steel Slash: no damage from a Pokémon-EX\'s attack on the next turn, but from other Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-94', 'Scizor', 'metal', 100, [['Steel Slash', [C, C], 40]], { stage: 'stage1' }), ['fire', 'fire']);
    put(s, 'misty', 'active', mon('ex-hitter', 'Mewtwo-EX', P, 170, [['X Ball', [C], 60]], { pokemonEX: true }), ['psychic']);
    const after = attack(s, 0);
    expect(ash(attack(after, 0, {}, 'misty')).active!.damage).toBe(0);
    put(after, 'misty', 'active', mon('plain-hitter', 'Mewtwo', P, 120, [['Ball', [C], 60]]), ['psychic']);
    expect(ash(attack(after, 0, {}, 'misty')).active!.damage).toBe(60);
  });

  it('Healing Melody: heads, 60 off each of the player\'s Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw7-117', 'Lopunny', C, 90, [['Healing Melody', [C], 0]], { stage: 'stage1' }), ['fire']).damage = 70;
    ash(s).bench[0]!.damage = 30;
    const after = attack(flips(s, true), 0);
    expect(ash(after).active!.damage).toBe(10);
    expect(ash(after).bench[0]!.damage).toBe(0);
  });

  it('Defog: the Stadium in play discarded for 40 more', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-43', 'Swanna', W, 100, [['Defog', [W, C, C], 60]], { stage: 'stage1' }), ['water', 'water', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    s.cards = { ...s.cards, 'bw8-126': trainer('bw8-126', 'Virbank City Gym') };
    s.stadium = { card: { uid: 'gym', defId: 'bw8-126' }, owner: 'misty' };
    const after = attack(s, 0, { boost: true });
    expect(after.stadium).toBeNull();
    expect(misty(after).discard.some((c) => c.uid === 'gym')).toBe(true);
    expect(misty(after).active!.damage).toBe(100);
  });
});

describe('Boundaries Crossed Abilities', () => {
  it('Allergy Panic: Weakness is ×4, whoever has Vileplume', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: F, multiplier: 2 } }));
    ash(s).active!.energy = [{ uid: 'f1', defId: 'fire' }, { uid: 'f2', defId: 'fire' }];
    expect(misty(attack(s, 1)).active!.damage).toBe(60);
    put(s, 'misty', 0, mon('bw7-3', 'Vileplume', G, 140, [], { stage: 'stage2', ...ability('Allergy Panic') }));
    expect(misty(attack(s, 1)).active!.damage).toBe(120);
  });

  it("Time Recall: the player's Evolved Pokémon use the attacks of the cards they evolved from", () => {
    const s = duel('charmeleon', 'onix', { energy: ['fire', 'fire'] });
    ash(s).active!.evolvedFrom = [{ uid: 'under', defId: id('charmander') }];
    put(s, 'misty', 'active', big('Snorlax'));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 2 }).ok).toBe(false);
    put(s, 'ash', 0, mon('bw7-9', 'Celebi-EX', G, 110, [['Wind Whisk', [G, C, C], 60]], { pokemonEX: true, ...ability('Time Recall') }));
    expect(misty(attack(s, 2)).active!.damage).toBe(30);
  });

  it('Shell Shield: no damage to Squirtle on the Bench', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-54', 'Electivire', 'lightning', 110, [['Electriwave', ['lightning', C, C], 0]], { stage: 'stage1' }), ['lightning', 'lightning', 'lightning']);
    put(s, 'misty', 0, mon('bw7-29', 'Squirtle', W, 60, [], ability('Shell Shield')));
    put(s, 'misty', 1, big('Snorlax'));
    const after = attack(s, 0);
    expect(misty(after).bench[0]!.damage).toBe(0);
    expect(misty(after).bench[1]!.damage).toBe(30);
  });

  it('Deluge: Water Energy cards from the hand to any of the player\'s Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw7-31', 'Blastoise', W, 140, [], { stage: 'stage2', ...ability('Deluge') }));
    const [a, b] = [hand(s, 'ash', { id: 'water', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: 'water' }), hand(s, 'ash', { id: 'water', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: 'water' })];
    let after = use(s, 'active', { cardUid: a, to: 0 });
    after = use(after, 'active', { cardUid: b, to: 'active' });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual([a]);
    expect(ash(after).active!.energy.map((e) => e.uid)).toEqual([b]);
  });

  it('Stickiness: the opponent\'s Active Pokémon retreats for 1 more', () => {
    const s = duel('charmander', 'onix');
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(1);
    put(s, 'misty', 0, mon('bw7-45', 'Jellicent', W, 100, [], { stage: 'stage1', ...ability('Stickiness') }));
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(2);
  });

  it('Rush In: once a turn, from the Bench, switched with the Active Pokémon', () => {
    const s = duel('charmander', 'onix');
    const keldeo = put(s, 'ash', 0, mon('bw7-49', 'Keldeo-EX', W, 170, [], { pokemonEX: true, ...ability('Rush In') }));
    const after = use(s, 0);
    expect(ash(after).active!.card.uid).toBe(keldeo.card.uid);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active' }).ok).toBe(false);
  });

  it("Sinister Hand: a damage counter moved between the opponent's Pokémon", () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw7-63', 'Dusknoir', P, 130, [], { stage: 'stage2', ...ability('Sinister Hand') }));
    misty(s).active!.damage = 20;
    const after = use(s, 'active', { oppFrom: 'active', oppTo: 0 });
    expect(misty(after).active!.damage).toBe(10);
    expect(misty(after).bench[0]!.damage).toBe(10);
  });

  it('Long-Distance Hypnosis: heads, the opponent\'s Active is Asleep; tails, the player\'s', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw7-68', 'Munna', P, 60, [], ability('Long-Distance Hypnosis')));
    expect(misty(use(flips(s, true), 'active')).active!.condition).toBe('asleep');
    expect(ash(use(flips(s, false), 'active')).active!.condition).toBe('asleep');
  });

  it('Poison Point: the Attacking Pokémon that damages it is Poisoned', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    put(s, 'misty', 'active', mon('bw7-74', 'Scolipede', G, 140, [], { stage: 'stage2', ...ability('Poison Point') }));
    expect(ash(attack(s, 0)).active!.poison).toBe(10);
  });

  it('Sturdy: from full HP, left with 10 HP instead of Knocked Out', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machamp', FI, 300, [['Smash', [C], 200]]), ['fighting']);
    put(s, 'misty', 'active', mon('bw7-85', 'Crustle', FI, 100, [], { stage: 'stage1', ...ability('Sturdy') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
    misty(s).active!.damage = 10;
    expect(misty(attack(s, 0)).active).toBeNull();
  });

  it('Sand Slammer: between turns, as the Active Pokémon, a damage counter on each of the opponent\'s Pokémon', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw7-99', 'Flygon', 'dragon', 140, [], { stage: 'stage2', ...ability('Sand Slammer') }));
    const after = endTurn(s, 'ash');
    expect(misty(after).active!.damage).toBe(10);
    expect(misty(after).bench[0]!.damage).toBe(10);
  });

  it('Transform: Ditto becomes a Basic Pokémon from the hand, keeping its damage and Energy, the Ditto card under it', () => {
    const s = duel('charmander', 'onix');
    const ditto = put(s, 'ash', 'active', mon('bw7-108', 'Ditto', C, 70, [], ability('Transform')), ['fire']);
    ditto.damage = 20;
    const basic = hand(s, 'ash', mon('base1-46', 'Charmander', F, 50, [['Scratch', [C], 10]]));
    const after = use(s, 'active', { cardUid: basic });
    const now = ash(after).active!;
    expect(now.card.uid).toBe(basic);
    expect(now.damage).toBe(20);
    expect(now.energy.length).toBe(1);
    expect(now.attached).toEqual([{ card: ditto.card, until: Number.MAX_SAFE_INTEGER, legendHalf: true }]);
    expect(misty(attack(after, 0)).active!.damage).toBe(10);
  });

  it('Sentinel: no Supporter cards for the opponent while Stoutland is Active', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('bw7-122', 'Stoutland', C, 140, [], { stage: 'stage2', ...ability('Sentinel') }));
    const juniper = hand(s, 'ash', trainer('bw1-101', 'Professor Juniper'));
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: juniper })).toEqual({ ok: false, error: "Sentinel: you can't play Supporter cards" });
  });
});

describe('Boundaries Crossed Trainers', () => {
  it('Hugh: each player draws or discards to 5 cards, the opponent first', () => {
    const s = duel('charmander', 'onix');
    ash(s).hand = [];
    ash(s).deck = pile(10);
    misty(s).hand = [...pile(6), { uid: 'w', defId: 'water' }];
    const hugh = hand(s, 'ash', trainer('bw7-130', 'Hugh'));
    const after = play(s, hugh);
    expect(ash(after).hand.length).toBe(5);
    expect(after.pendingChoice).toMatchObject({ player: 'misty', kind: 'discardFromHand', count: 2 });
    for (const done of settles(after)) expect(misty(done).hand.length).toBe(5);
  });

  it('Skyla: a Trainer card from the deck; Town Map: the Prize cards face up', () => {
    const s = duel('charmander', 'onix');
    ash(s).deck = [...pile(3), { uid: 'potion-x', defId: 'bw1-100' }];
    s.cards = { ...s.cards, 'bw1-100': trainer('bw1-100', 'Potion') };
    const skyla = hand(s, 'ash', trainer('bw7-134', 'Skyla'));
    // The only Trainer card is taken at once (the same-card rule).
    expect(ash(play(s, skyla)).hand.some((c) => c.uid === 'potion-x')).toBe(true);
    const map = hand(s, 'ash', trainer('bw7-136', 'Town Map'));
    const mapped = play(s, map);
    expect(ash(mapped).faceUpPrizes).toEqual(ash(mapped).prizes.map((c) => c.uid));
  });

  it('Gold Potion: 90 off the Active Pokémon', () => {
    const s = duel('charmander', 'onix');
    ash(s).active!.damage = 40;
    const potion = hand(s, 'ash', trainer('bw7-140', 'Gold Potion'));
    expect(ash(play(s, potion)).active!.damage).toBe(0);
  });

  it('Crystal Edge and Crystal Wall: only for their Kyurem-EX', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('wk', 'White Kyurem-EX', 'dragon', 180, [['Field Crush', [C], 50]], { pokemonEX: true }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const edge = hand(s, 'ash', trainer('bw7-138', 'Crystal Edge'));
    expect(misty(attack(play(s, edge, { target: 'active' }), 0)).active!.damage).toBe(100);
    const black = put(s, 'ash', 0, mon('bk', 'Black Kyurem-EX', 'dragon', 180, [], { pokemonEX: true }));
    const wall = hand(s, 'ash', trainer('bw7-139', 'Crystal Wall'));
    const walled = play(s, wall, { target: 0 });
    expect(inPlayDef(walled.cards, ash(walled).bench[0]!).hp).toBe(300);
    expect(inPlayDef(s.cards, black).hp).toBe(180);
  });

  it('Aspertia City Gym: 20 more HP for each Colorless Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', big('Snorlax'));
    const gym = hand(s, 'ash', trainer('bw7-127', 'Aspertia City Gym'));
    const after = play(s, gym);
    expect(inPlayDef(after.cards, misty(after).active!).hp).toBe(320);
    expect(inPlayDef(after.cards, ash(after).active!).hp).toBe(50);
    expect(getPlayerView(after, 'ash')).toBeTruthy();
  });
});
