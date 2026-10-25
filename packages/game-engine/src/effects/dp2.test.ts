import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, retreatCost, usableAttacks, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, C, F, FI, G, L, P, W } from './test-kit.js';

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
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const hitter = (damage = 30, extra: Partial<PokemonCardDef> = {}) => mon(`hitter-${damage}`, 'Machop', FI, 60, [['Punch', [C], damage]], extra);
const cards = (s: GameState, player: string, k: number) => Array.from({ length: k }, () => hand(s, player, trainer('dp1-118', 'Potion')));

describe('Pokémon LV.X powers', () => {
  it("Electivire LV.X: its own Shocking Tail and its previous level's Intense Voltage both work", () => {
    let s = duel('charmander', 'onix');
    const lvx = put(s, 'ash', 'active', mon('dp2-121', 'Electivire', L, 120, [], { stage: 'levelUp', ...body('Shocking Tail') }));
    under(s, lvx, mon('dp1-81', 'Electabuzz', L, 70, []));
    const electivire = mon('dp1-3', 'Electivire', L, 100, [], { stage: 'stage1', ...body('Intense Voltage') });
    s.cards = { ...s.cards, [electivire.id]: electivire, elekid: mon('elekid', 'Elekid', L, 40, []) };
    lvx.evolvedFrom.unshift({ uid: 'e', defId: 'elekid' });
    lvx.evolvedFrom.push({ uid: 'prev', defId: electivire.id });
    lvx.levelUpFrom = electivire.id;
    put(s, 'ash', 0, big('Pikachu'), ['lightning']);
    expect(inPlayDef(s.cards, lvx).power?.name).toBe('Intense Voltage');
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 0, energyUid: ash(s).bench[0]!.energy[0]!.uid } });
    expect(ash(s).active!.energy).toHaveLength(1);
    // Shocking Tail, as the Active Pokémon: the opponent's attachment from the hand puts 2 damage counters on.
    s = endTurn(s, 'ash');
    const fire = hand(s, 'misty', s.cards.fire!);
    s = act(s, 'misty', { type: 'ATTACH_ENERGY', cardUid: fire, target: 'active' });
    expect(misty(s).active!.damage).toBe(20);
  });
});

describe('Mysterious Treasures questions for the opponent', () => {
  it("Power Cancel: 2 cards from the Alakazam's player's hand stop the opponent's Poké-Power; Done lets it work", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-6', 'Bronzong', 'metal', 90, [], { stage: 'stage1', ...body('Miracle Oracle') }));
    put(s, 'misty', 0, mon('dp2-2', 'Alakazam', P, 100, [], { stage: 'stage2', ...body('Power Cancel') }));
    misty(s).hand = [];
    const [a, b] = cards(s, 'misty', 2);
    let asked = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(asked.pendingChoice).toMatchObject({ kind: 'powerCancel', player: 'misty' });
    const handBefore = ash(asked).hand.length;
    asked = act(act(asked, 'misty', { type: 'RESOLVE_CHOICE', cardUid: a }), 'misty', { type: 'RESOLVE_CHOICE', cardUid: b });
    expect([ash(asked).hand.length, misty(asked).hand.length, ash(asked).active!.powerUsedTurn]).toEqual([handBefore, 0, asked.turn]);
    const passed = act(act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }), 'misty', { type: 'RESOLVE_CHOICE' });
    expect(passed.pendingChoice).toMatchObject({ kind: 'discardFromHand', source: 'Miracle Oracle' });
    for (const end of settles(act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }))) expect(end.pendingChoice).toBeUndefined();
  });

  it('Charity Tail: 10 if the opponent discards 2 cards first, 80 if not', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-3', 'Ambipom', C, 80, [['Tail Influence', [C], 30], ['Charity Tail', [C], 80]], { stage: 'stage1' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).hand = [];
    const [a, b] = cards(s, 'misty', 2);
    const asked = attack(s, 1);
    expect(asked.pendingChoice).toMatchObject({ kind: 'beforeAttack', question: 'discardTwo', player: 'misty' });
    const paid = act(act(asked, 'misty', { type: 'RESOLVE_CHOICE', cardUid: a }), 'misty', { type: 'RESOLVE_CHOICE', cardUid: b });
    expect(misty(paid).active!.damage).toBe(10);
    expect(misty(act(asked, 'misty', { type: 'RESOLVE_CHOICE' })).active!.damage).toBe(80);
    for (const end of settles(asked)) expect(end.pendingChoice).toBeUndefined();
  });

  it("Trick Play: a wrong guess takes 50; a right one does 20 to Mr. Mime", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-30', 'Mr. Mime', P, 70, [['Trick Play', [C], 0]], body('Airy Wall')), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    const asked = attack(s, 0, { boost: true });
    expect(asked.pendingChoice).toMatchObject({ kind: 'beforeAttack', question: 'guessCoin' });
    const wrong = act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: 1 });
    expect(misty(wrong).active!.damage).toBe(50);
    const right = act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([misty(right).active!.damage, ash(right).active!.damage]).toEqual([0, 20]);
  });

  it('Ice Bind: the opponent discards a card, or the Defending Pokémon is Paralyzed', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-39', 'Walrein', W, 130, [['Ice Bind', [C], 70]], { stage: 'stage2' }), ['water']);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).hand = [];
    const [card] = cards(s, 'misty', 1);
    const asked = attack(s, 0);
    expect(asked.pendingChoice).toMatchObject({ kind: 'iceBind', player: 'misty' });
    expect(misty(act(asked, 'misty', { type: 'RESOLVE_CHOICE', cardUid: card })).active!.condition ?? null).toBeNull();
    expect(misty(act(asked, 'misty', { type: 'RESOLVE_CHOICE' })).active!.condition).toBe('paralyzed');
    for (const end of settles(asked)) expect(end.pendingChoice).toBeUndefined();
  });

  it("Team Galactic's Wager: hands into the decks, Rock-Paper-Scissors (a tie again), the winner up to 6 cards, the loser up to 3", () => {
    let s = duel('charmander', 'onix');
    const wager = hand(s, 'ash', trainer('dp2-115', "Team Galactic's Wager"));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: wager });
    expect(s.pendingChoice).toMatchObject({ kind: 'rps', player: 'ash' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    const tie = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(tie.pendingChoice).toMatchObject({ kind: 'rps', player: 'ash' });
    const won = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 2 });
    expect([ash(won).hand.length, misty(won).hand.length]).toEqual([6, 3]);
    // Every answer but a tie ends it (a tie is played again, as the card says).
    for (const answer of [1, 2]) expect(act(s, 'misty', { type: 'RESOLVE_CHOICE', count: answer }).pendingChoice).toBeUndefined();
  });
});

describe('Mysterious Treasures Poké-Bodies', () => {
  it("Downer Material: the opponent's Basic Pokémon's attacks cost 1 Colorless more with Uxie, Mesprit and Azelf in play", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('basic', 'Pidgey', C, 50, [['Gust', [C], 10]]), ['grass']);
    put(s, 'misty', 'active', mon('dp2-4', 'Azelf', P, 60, [], body('Downer Material')));
    put(s, 'misty', 0, mon('uxie', 'Uxie', P, 60, []));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(true);
    put(s, 'misty', 1, mon('mesprit', 'Mesprit', P, 60, []));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
  });

  it('Mother Pheromone: the Nidoran line attacks for 1 Colorless less', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('nidorino', 'Nidorino', P, 80, [['Horn', [P, C], 30]], { stage: 'stage1' }), ['psychic']);
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
    put(s, 'ash', 0, mon('dp2-31', 'Nidoqueen', P, 120, [], { stage: 'stage2', ...body('Mother Pheromone') }));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(true);
  });

  it('Upper Material frees the lake trio; Sticky adds 1 to every other Pokémon', () => {
    const s = duel('charmander', 'onix');
    const uxie = put(s, 'ash', 'active', mon('uxie', 'Uxie', P, 60, [], { retreatCost: 1 }));
    put(s, 'ash', 0, mon('dp2-14', 'Mesprit', P, 60, [], { retreatCost: 1, ...body('Upper Material') }));
    expect(retreatCost(uxie, s.cards, [ash(s), misty(s)])).toBe(1);
    put(s, 'ash', 1, mon('azelf', 'Azelf', P, 60, []));
    expect(retreatCost(uxie, s.cards, [ash(s), misty(s)])).toBe(0);
    const snorlax = put(s, 'misty', 'active', big('Snorlax', { retreatCost: 2 }));
    put(s, 'ash', 2, mon('dp2-20', 'Ariados', G, 80, [], { stage: 'stage1', ...body('Sticky') }));
    expect(retreatCost(snorlax, s.cards, [misty(s), ash(s)])).toBe(3);
  });

  it('Airy Wall: no damage from an attacker with 2 or fewer Energy cards', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('dp2-30', 'Mr. Mime', P, 70, [], body('Airy Wall')));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    ash(s).active!.energy.push({ uid: 'x1', defId: 'fighting' }, { uid: 'x2', defId: 'fighting' });
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Cold Fat: 40 less while Dewgong is Asleep; Craggy Face: 20 less from Stage 2 Evolved Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(60), ['fighting']);
    put(s, 'misty', 'active', mon('dp2-45', 'Dewgong', W, 200, [], { stage: 'stage1', ...body('Cold Fat') })).condition = 'asleep';
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    const stage2 = put(s, 'ash', 'active', hitter(60, { stage: 'stage2' }), ['fighting']);
    under(s, stage2, mon('m1', 'Machop', FI, 60, []));
    put(s, 'misty', 'active', mon('dp2-25', 'Glalie', W, 200, [], { stage: 'stage1', ...body('Craggy Face') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it("Rainbow Scale: 40 more to an Active Pokémon weak to a type of Energy attached (Garchomp is Colorless: no Weakness); Dragon DNA: its Basic's attacks, 30 more", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-9', 'Garchomp', C, 130, [['Slash', [C], 30]], { stage: 'stage2', ...body('Rainbow Scale') }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: F, multiplier: 2 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(70);
    const gyarados = put(s, 'ash', 'active', mon('dp2-26', 'Gyarados', W, 120, [['Enrage', [W], 80]], { stage: 'stage1', ...body('Dragon DNA') }), ['water']);
    under(s, gyarados, mon('carp', 'Magikarp', W, 30, [['Splash', [C], 10]]));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(usableAttacks(gyarados, s.cards).map((u) => u.attack.name)).toEqual(['Enrage', 'Splash']);
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it("Dark Genes: Murkrow uses Honchkrow's attack without the Energy while Honchkrow has it", () => {
    const s = duel('charmander', 'onix');
    const murkrow = put(s, 'ash', 'active', mon('murkrow', 'Murkrow', 'darkness', 60, [['Peck', [C], 10]]));
    const honch = put(s, 'ash', 0, mon('dp2-10', 'Honchkrow', 'darkness', 90, [['Dark Wing Flaps', ['darkness', C], 50]], { stage: 'stage1', ...body('Dark Genes') }));
    expect(usableAttacks(murkrow, s.cards, { bench: ash(s).bench, sides: [ash(s), misty(s)] })).toHaveLength(1);
    honch.energy.push({ uid: 'd1', defId: id('darkness') }, { uid: 'd2', defId: id('darkness') });
    const list = usableAttacks(murkrow, s.cards, { bench: ash(s).bench, sides: [ash(s), misty(s)] });
    expect(list.map((u) => [u.attack.name, u.attack.cost.length])).toEqual([['Peck', 1], ['Dark Wing Flaps', 0]]);
  });

  it('Torrid Wave: Burned for 3 damage counters between turns', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-123', 'Magmortar', F, 130, [], { stage: 'levelUp', ...body('Torrid Wave') }));
    put(s, 'misty', 'active', big('Snorlax'));
    s = act(flips(s, false), 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(misty(s).active!.burnDamage).toBe(30);
    s = endTurn(flips(s, false), 'ash');
    expect(misty(s).active!.damage).toBe(30);
  });

  it('Poison Sacs: the opponent\'s Poisoned Pokémon stays Poisoned when it evolves', () => {
    let s = duel('charmander', 'onix');
    const charmander = ash(s).active!;
    charmander.poison = 10;
    put(s, 'misty', 0, mon('dp2-36', 'Toxicroak', P, 90, [], { stage: 'stage1', ...body('Poison Sacs') }));
    const charmeleon = hand(s, 'ash', mon('base1-24', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: charmeleon, target: 'active' });
    expect(ash(s).active!.poison).toBe(10);
  });

  it('EQUIP: Unown E attaches itself as a Pokémon Tool, 10 more HP', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 0, mon('dp2-65', 'Unown E', P, 50, [], body('EQUIP')), ['psychic']);
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { to: 'active' } });
    expect(ash(s).bench[0]).toBeNull();
    expect(inPlayDef(s.cards, ash(s).active!).hp).toBe(60);
    expect(ash(s).discard.map((c) => c.defId)).toContain('psychic');
  });

  it("Memory Out: damaged by the opponent's attack, the Attacking Pokémon can't use it next turn", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('dp2-18', 'Uxie', P, 200, [], body('Memory Out')));
    expect(ash(attack(s, 0)).active!.effects?.amnesia).toEqual({ attack: 'Punch', until: s.turn + 2 });
  });
});

describe('Mysterious Treasures attacks and Trainers', () => {
  it('Hidden Power (Unown E): every coin the opponent flips next turn is tails', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-65', 'Unown E', P, 50, [['Hidden Power', [C], 0]]), ['psychic']);
    s = endTurn(attack(s, 0), 'misty');
    expect(misty(s).tailsUntil).toBe(s.turn - 1);
  });

  it('Hidden Power (Unown I): the Energy card is face down, 1 Colorless Energy, until the end of the next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-37', 'Unown I', P, 50, [['Hidden Power', [C], 0]]), ['psychic']);
    const defender = put(s, 'misty', 'active', big('Snorlax'), ['fire']);
    s = attack(s, 0, { defenderEnergyUid: defender.energy[0]!.uid });
    expect(misty(s).active!.energy[0]!.faceDownUntil).toBe(s.turn);
    s = endTurn(s, 'misty');
    expect(ash(s).active).not.toBeNull();
    expect(misty(s).active!.energy[0]!.faceDownUntil).toBeUndefined();
  });

  it("Bind Pulse: no Special Energy cards from the opponent's hand next turn", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-4', 'Azelf', P, 60, [['Bind Pulse', [C], 10]]), ['psychic']);
    s = attack(s, 0);
    const dce = hand(s, 'misty', { id: 'base1-96', kind: 'energy', name: 'Double Colorless Energy', imageUrl: null, energyType: 'colorless', amount: 2, basic: false });
    expect(applyAction(s, 'misty', { type: 'ATTACH_ENERGY', cardUid: dce, target: 'active' }).ok).toBe(false);
  });

  it("Spike Armor: the opponent's attack that damages Sandslash puts 4 damage counters on the attacker", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-61', 'Sandslash', FI, 200, [['Spike Armor', [C], 0]], { stage: 'stage1' }), ['fighting']);
    put(s, 'misty', 'active', hitter(30), ['fighting']);
    s = attack(attack(s, 0), 0, undefined, 'misty');
    expect(misty(s).active!.damage).toBe(40);
  });

  it('Lake Boundary: every Weakness is ×2, "+20" ones too', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: FI, multiplier: 1, plus: 20 } }));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp2-112', 'Lake Boundary')) });
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Quick Ball: the first Pokémon from the top into the hand; Dusk Ball: a Pokémon from the bottom 7', () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    s.cards = { ...s.cards, pidgey: mon('pidgey', 'Pidgey', C, 40, []) };
    ash(s).deck = [{ uid: 'g1', defId: 'grass' }, { uid: 'g2', defId: 'grass' }, { uid: 'p1', defId: 'pidgey' }, { uid: 'g3', defId: 'grass' }];
    const quick = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp2-114', 'Quick Ball')) });
    expect(ash(quick).hand.map((c) => c.uid)).toEqual(['p1']);
    const dusk = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp2-110', 'Dusk Ball')) });
    expect(dusk.pendingChoice).toMatchObject({ kind: 'bottomPick', pokemon: true });
    const took = act(dusk, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'p1' });
    expect(ash(took).hand.map((c) => c.uid)).toContain('p1');
  });

  it('Kind Egg: up to as many hand cards as Blissey has Energy back into the deck, then as many drawn', () => {
    let s = duel('charmander', 'onix');
    const blissey = put(s, 'ash', 'active', mon('dp2-5', 'Blissey', C, 130, [], { stage: 'stage1', ...body('Kind Egg') }), ['grass', 'grass']);
    under(s, blissey, mon('happiny', 'Happiny', C, 60, []));
    ash(s).hand = [];
    const [a] = cards(s, 'ash', 3);
    s = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(s.pendingChoice).toMatchObject({ kind: 'shuffleFromHand', count: 2, thenDraw: true });
    s = act(act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: a }), 'ash', { type: 'RESOLVE_CHOICE' });
    expect(ash(s).hand).toHaveLength(3);
    expect(s.pendingChoice).toBeUndefined();
  });

  it('Persuade: the new Defending Pokémon can\'t retreat during the opponent\'s next turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp2-35', 'Sudowoodo', FI, 80, [['Sidestep', [C], 20], ['Persuade', [C], 30]]), ['fighting']);
    put(s, 'misty', 0, big('Pidgey'));
    const after = attack(s, 1);
    expect(misty(after).active!.effects?.noRetreat).toBe(s.turn + 1);
  });
});

describe('Mysterious Treasures pending choices terminate', () => {
  it.each([
    ['dp2-39', 'Walrein', 'Sealeo', 'Freeze-up'],
    ['dp2-44', 'Croconaw', 'Totodile', 'Evolutionary Vitality'],
    ['dp2-23', 'Crobat', 'Golbat', 'Evolutionary Toxic'],
  ])('%s %s: mayUse as it evolves', (cardId, name, from, power) => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon(`${from}-x`, from, W, 80, [], { stage: 'stage1' }));
    const card = hand(s, 'ash', mon(cardId, name, W, 120, [], { stage: 'stage2', evolvesFrom: from, ...body(power) }));
    const asked = act(s, 'ash', { type: 'EVOLVE', cardUid: card, target: 'active' });
    expect(asked.pendingChoice).toMatchObject({ kind: 'mayUse' });
    for (const end of settles(asked)) expect(end.pendingChoice).toBeUndefined();
  });
});
