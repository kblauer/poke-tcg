import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, usableAttacks, type GameState, type InPlayPokemon, type Target } from '../index.js';
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
const pile = (k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const hitter = (damage: number, extra: Partial<PokemonCardDef> = {}) => mon(`hitter-${damage}`, 'Machop', FI, 300, [['Punch', [C], damage]], extra);
const usePower = (s: GameState, source: Target, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const METAL: CardDef = { id: 'dp1-130', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' };
const decks = (s: GameState) => {
  ash(s).deck = pile(10);
  misty(s).deck = pile(10);
};

describe('Legends Awakened attacks', () => {
  it('Doom Desire: the Defending Pokémon is Knocked Out at the end of the opponent\'s next turn', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'dp1-130': METAL };
    put(s, 'ash', 'active', mon('dp6-31', 'Jirachi', 'metal', 70, [['One Desire', [], 0], ['Doom Desire', [C], 0]]), ['dp1-130']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    s = attack(s, 1);
    expect(ash(s).active!.energy).toHaveLength(0);
    s = endTurn(s, 'misty');
    expect(misty(s).discard.some((c) => c.defId === 'big-Snorlax') || s.phase === 'promote').toBe(true);
  });

  it('Magical Step: Confused, it does 60 to itself instead of 30', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-56', 'Grumpig', P, 90, [['Magical Step', [], 0]], { stage: 'stage1' }));
    put(s, 'misty', 'active', hitter(10));
    misty(s).active!.energy = [{ uid: 'f', defId: 'fighting' }];
    decks(s);
    s = attack(s, 0);
    s = attack(flips(s, false), 0, undefined, 'misty');
    expect(misty(s).active!.damage).toBe(60);
  });

  it('Devoluter (Technical Machine TS-2): the top card of an Evolved Pokémon back into the opponent\'s hand', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['water']);
    const ivysaur = put(s, 'misty', 'active', mon('ivysaur', 'Ivysaur', G, 80, [], { stage: 'stage1' }));
    under(s, ivysaur, mon('bulbasaur', 'Bulbasaur', G, 50, []));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp6-137', 'Technical Machine TS-2')), choices: { target: 'active' } });
    const attacks = usableAttacks(ash(s).active!, s.cards, { defender: misty(s).active, sides: [ash(s), misty(s)] });
    const index = attacks.findIndex((a) => a.attack.name === 'Devoluter');
    expect(index).toBeGreaterThanOrEqual(0);
    s = attack(s, index, { oppTarget: 'active' });
    expect([misty(s).active!.card.defId, misty(s).hand.some((c) => c.defId === 'ivysaur'), ash(s).active!.attached?.length]).toEqual(['bulbasaur', true, 1]);
  });

  it('Mach Descent: base 60 when Swellow was on the Bench this turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax', { retreatCost: 0 }));
    put(s, 'ash', 0, mon('dp6-73', 'Swellow', C, 80, [['Mach Descent', [C], 30]], { stage: 'stage1' }), ['water']);
    put(s, 'misty', 'active', big('Lapras'));
    ash(s).turnStartActive = ash(s).active!.card.uid;
    s = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] });
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });
});

describe('Legends Awakened powers', () => {
  it('Form Change: another Deoxys from the deck takes its place, with everything on it', () => {
    let s = duel('charmander', 'onix');
    const normal = put(s, 'ash', 'active', mon('dp6-1', 'Deoxys Normal Forme', P, 90, [], body('Form Change')), ['psychic']);
    normal.damage = 20;
    s.cards = { ...s.cards, attackForme: mon('attackForme', 'Deoxys Attack Forme', P, 80, []) };
    ash(s).deck = [{ uid: 'af', defId: 'attackForme' }, ...pile(3)];
    s = usePower(s, 'active');
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'af' });
    expect([ash(s).active!.card.uid, ash(s).active!.damage, ash(s).active!.energy.length]).toEqual(['af', 20, 1]);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });

  it('Time Walk: a Pokémon from the Prize cards swapped for a card from the hand, and it ends', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    ash(s).prizes = [{ uid: 'prize-mon', defId: id('charmander') }, ...pile(5)];
    ash(s).hand = [{ uid: 'h1', defId: 'water' }];
    const azelf = hand(s, 'ash', mon('dp6-19', 'Azelf', P, 70, [], body('Time Walk')));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: azelf, slot: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'timeWalk' });
    for (const end of settles(s)) expect([end.pendingChoice, ash(end).prizes.length]).toEqual([undefined, 6]);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'prize-mon' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'h1' });
    expect([ash(s).hand.some((c) => c.uid === 'prize-mon'), ash(s).prizes.some((c) => c.uid === 'h1')]).toEqual([true, true]);
  });

  it('Resent: Knocked Out by an attack, 4 damage counters on the Attacking Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-40', 'Shedinja', G, 60, [], { stage: 'stage1', ...body('Resent') }));
    put(s, 'ash', 0, big('Snorlax'));
    put(s, 'misty', 'active', hitter(80));
    misty(s).active!.energy = [{ uid: 'f', defId: 'fighting' }];
    decks(s);
    s = endTurn(s, 'ash');
    s = attack(s, 0, undefined, 'misty');
    expect(misty(s).active!.damage).toBe(40);
  });

  it('Slow Start: Regigigas can\'t attack until the opponent has 3 or fewer Prize cards left', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-15', 'Regigigas', C, 120, [['Punch', [C], 50]], body('Slow Start')), ['water']);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).prizes = pile(4);
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/Slow Start/) });
    misty(s).prizes = pile(3);
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it('Fossil Armor, Steel Coating and WALL reduce the damage', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(60), ['fighting']);
    put(s, 'misty', 'active', mon('dp6-18', 'Armaldo', FI, 140, [], { stage: 'stage2', ...body('Fossil Armor') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    const t = duel('charmander', 'onix');
    t.cards = { ...t.cards, 'dp1-130': METAL };
    put(t, 'ash', 'active', hitter(60), ['fighting']);
    put(t, 'misty', 'active', mon('dp6-13', 'Probopass', FI, 90, [], { stage: 'stage1', ...body('Steel Coating') }), ['dp1-130', 'dp1-130', 'dp1-130']);
    expect(misty(attack(t, 0)).active!.damage).toBe(40);
    const u = duel('charmander', 'onix');
    put(u, 'ash', 'active', hitter(60), ['fighting']);
    put(u, 'misty', 'active', mon('dp6-80', 'Unown W', P, 90, [], body('WALL')));
    expect(misty(attack(u, 0)).active!.damage).toBe(50);
  });

  it('Psybarrier: nothing from Pokémon that aren\'t Evolved', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(60), ['fighting']);
    put(s, 'misty', 'active', mon('dp6-144', 'Mewtwo', P, 120, [], { stage: 'levelUp', ...body('Psybarrier') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Ditto DNA: the opponent\'s Active Pokémon\'s HP and attacks', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-27', 'Ditto', C, 60, [], body('Ditto DNA')), ['water']);
    put(s, 'misty', 'active', mon('gyarados', 'Gyarados', W, 130, [['Splash', [C], 40]]));
    decks(s);
    s = endTurn(endTurn(s, 'ash'), 'misty');
    expect(inPlayDef(s.cards, ash(s).active!).hp).toBe(130);
    const attacks = usableAttacks(ash(s).active!, s.cards, { defender: misty(s).active, sides: [ash(s), misty(s)] });
    expect(attacks.map((a) => a.attack.name)).toContain('Splash');
  });

  it('Regi Move: 2 cards discarded, then the opponent switches their Basic Active Pokémon, and it ends', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-36', 'Regice', W, 90, [], body('Regi Move')));
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    ash(s).hand = pile(2);
    const asked = usePower(s, 'active');
    for (const end of settles(asked)) {
      expect(end.pendingChoice).toBeUndefined();
      expect([ash(end).hand.length, misty(end).active!.card.defId]).toEqual([0, 'big-Lapras']);
    }
  });

  it('Iron Shell: tails, 2 damage counters on every Pokémon but Forretress, and it ends', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-28', 'Forretress', 'metal', 90, [], { stage: 'stage1', ...body('Iron Shell') }));
    put(s, 'misty', 'active', big('Snorlax'));
    s = act(flips(s, false), 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', s.cards.water!), target: 'active' });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'ironShell' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([ash(s).active!.damage, misty(s).active!.damage]).toEqual([0, 20]);
  });

  it('Cast-off Shell: evolving, Shedinja from the hand onto the Bench as a Basic Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('nincada', 'Nincada', G, 50, []));
    s.cards = { ...s.cards, shedinja: mon('shedinja', 'Shedinja', G, 60, [], { stage: 'stage1', evolvesFrom: 'Nincada' }) };
    ash(s).hand = [{ uid: 'shed', defId: 'shedinja' }];
    const ninjask = hand(s, 'ash', mon('dp6-67', 'Ninjask', G, 80, [], { stage: 'stage1', evolvesFrom: 'Nincada', ...body('Cast-off Shell') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: ninjask, target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([ash(s).bench[0]?.card.uid, ash(s).bench[0]?.asBasic]).toEqual(['shed', true]);
  });

  it('?: the opponent guesses the type; a wrong guess draws a card', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('dp6-82', 'Unown ?', P, 70, [], body('?')));
    decks(s);
    const fire = hand(s, 'ash', mon('vulpix', 'Vulpix', F, 50, []));
    const asked = usePower(s, 0, { cardUid: fire });
    expect(asked.pendingChoice).toMatchObject({ kind: 'guess', player: 'misty', answer: 1 });
    expect(ash(act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: 2 })).hand.length).toBe(ash(s).hand.length + 1);
  });

  it('?: either type of a Pokémon with two is a right guess (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('dp6-82', 'Unown ?', P, 70, [], body('?')));
    decks(s);
    const dual = hand(s, 'ash', mon('dual', 'Magnemite', 'lightning', 50, [], { types: ['lightning', 'metal'] }));
    const asked = usePower(s, 0, { cardUid: dual });
    expect(asked.pendingChoice).toMatchObject({ kind: 'guess', answers: [3, 7] });
    const handSize = ash(asked).hand.length;
    expect([3, 7, 0].map((count) => ash(act(asked, 'misty', { type: 'RESOLVE_CHOICE', count })).hand.length)).toEqual([handSize, handSize, handSize + 1]);
  });

  it('Speed Gain: coins until tails, basic Fire or Lightning Energy from the discard pile', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-14', 'Rayquaza', C, 100, [], body('Speed Gain')));
    // A second Fire Energy, so the second card is still a choice (the same-card rule).
    ash(s).discard = [{ uid: 'f1', defId: 'fire' }, { uid: 'f2', defId: 'fire' }, { uid: 'l1', defId: 'lightning' }, { uid: 'w1', defId: 'water' }];
    s = usePower(flips(s, true, true, false), 'active');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'l1' });
    expect([ash(s).active!.energy.length, s.pendingChoice]).toEqual([2, undefined]);
  });

  it('Electric Trans: Lightning and Metal Energy moved between the player\'s Pokémon, any number of times', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp6-142', 'Magnezone', 'metal', 140, [], { stage: 'levelUp', ...body('Electric Trans') }), ['lightning', 'lightning']);
    put(s, 'ash', 0, big('Snorlax'));
    const [a, b] = ash(s).active!.energy;
    s = usePower(s, 'active', { from: 'active', energyUid: a!.uid, to: 0 });
    s = usePower(s, 'active', { from: 'active', energyUid: b!.uid, to: 0 });
    expect(ash(s).bench[0]!.energy).toHaveLength(2);
  });
});

describe('Legends Awakened Trainers', () => {
  it("Buck's Training: 2 cards drawn, and the Active Pokémon's attacks do 10 more this turn", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).deck = pile(5);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp6-130', "Buck's Training")) });
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it("Cynthia's Feelings: 8 cards after a Knock Out last turn", () => {
    let s = duel('charmander', 'onix');
    ash(s).deck = pile(10);
    ash(s).knockedOutTurn = s.turn - 1;
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp6-131', "Cynthia's Feelings")) });
    expect(ash(s).hand).toHaveLength(8);
  });

  it('Stark Mountain: a basic Fire or Fighting Energy card moved, once', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['fire', 'fire']);
    put(s, 'ash', 0, big('Lapras'));
    s.cards = { ...s.cards, 'dp6-135': trainer('dp6-135', 'Stark Mountain') };
    s.stadium = { card: { uid: 'stark', defId: 'dp6-135' }, owner: 'misty' };
    s = act(s, 'ash', { type: 'USE_STADIUM' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).active!.energy[0]!.uid });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).bench[0]!.energy.length, s.pendingChoice]).toEqual([1, undefined]);
  });

  it('Snowpoint Temple: 20 more HP for Pokémon that aren\'t Evolved', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    s.cards = { ...s.cards, 'dp6-134': trainer('dp6-134', 'Snowpoint Temple') };
    s.stadium = { card: { uid: 'snow', defId: 'dp6-134' }, owner: 'misty' };
    decks(s);
    s = endTurn(s, 'ash');
    expect(inPlayDef(s.cards, ash(s).active!).hp).toBe(320);
  });

  it('Bubble Coat: no Weakness, and discarded once its Pokémon is damaged', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', big('Snorlax', { weakness: { type: FI, multiplier: 2 } }));
    s.cards = { ...s.cards, 'dp6-129': trainer('dp6-129', 'Bubble Coat') };
    p.attached = [{ card: { uid: 'coat', defId: 'dp6-129' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    put(s, 'misty', 'active', hitter(30), ['fighting']);
    decks(s);
    s = endTurn(s, 'ash');
    s = attack(s, 0, undefined, 'misty');
    expect([ash(s).active!.damage, ash(s).active!.attached?.length ?? 0]).toEqual([30, 0]);
  });
});

void L;
