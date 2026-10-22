import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, usableAttacks, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, id, mon, C, F, G, P, W } from './test-kit.js';

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
const trainer = (cardId: string, name: string, text = ''): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const D = 'darkness';
const R_ENERGY: CardDef = { id: 'ex7-95', kind: 'energy', name: 'R Energy', imageUrl: null, energyType: 'darkness', amount: 2, basic: false };
const DARK_METAL: CardDef = { id: 'ex7-94', kind: 'energy', name: 'Dark Metal Energy', imageUrl: null, energyType: 'darkness', basic: false };
const resolve = (s: GameState, answer: { cardUid?: string; target?: Target; count?: number }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });

describe('EX Team Rocket Returns', () => {
  it('Darkest Impulse: 2 damage counters on each Pokémon the opponent evolves from the hand, one Darkest Impulse however many (agreed)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('ex7-2', 'Dark Ampharos', 'lightning', 120, [], { stage: 'stage2', ...power('Darkest Impulse') }));
    put(s, 'misty', 0, mon('ex7-2', 'Dark Ampharos', 'lightning', 120, [], { stage: 'stage2', ...power('Darkest Impulse') }));
    const uid = hand(s, 'ash', mon('charmeleon', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' });
    expect(ash(s).active!.damage).toBe(20);
  });

  it('R Energy: 2 Darkness Energy, 10 more damage each (agreed: they add up); only on a Dark or Rocket\'s Pokémon; discarded at the end of the turn', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex7-95'] = R_ENERGY;
    put(s, 'ash', 'active', mon('rockets', "Rocket's Meowth", D, 60, [['Bite', [D, D, D, D], 20]]), ['ex7-95', 'ex7-95']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(40);
    expect(ash(after).active!.energy).toHaveLength(0);
    put(s, 'ash', 'active', mon('plain', 'Meowth', C, 60, []));
    const uid = hand(s, 'ash', R_ENERGY);
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' }).ok).toBe(false);
  });

  it('Dark Metal Energy: Darkness or Metal, 1 at a time, and nothing else (no Darkness Energy damage)', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex7-94'] = DARK_METAL;
    put(s, 'ash', 'active', mon('steel', 'Dark Steelix', 'metal', 100, [['Iron Tail', ['metal'], 30], ['Bite', [D], 30]], { types: ['metal', D] }), ['ex7-94']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    expect(misty(attack(s, 1)).active!.damage).toBe(30);
  });

  it("Rocket's Hideout (Team Rocket Returns): 20 more HP for Pokémon with Rocket's in their names too; Rocket's Tricky Gym gives them Feint Attack", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('rocket-mon', "Rocket's Snorlax ex", D, 100, [['Tackle', [C], 10]], { ex: true }), ['fire']);
    const hideout = hand(s, 'ash', trainer('ex7-87', "Rocket's Hideout", "Each Pokémon with Dark or Rocket's in its name (both yours and your opponent's) gets +20 HP."));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hideout });
    expect(inPlayDef(s.cards, ash(s).active!).hp).toBe(120);
    s.cards['ex7-90'] = trainer('ex7-90', "Rocket's Tricky Gym");
    s.stadium = { card: { uid: 'gym', defId: 'ex7-90' }, owner: 'ash' };
    const names = usableAttacks(ash(s).active!, s.cards, { stadium: s.stadium.card }).map((u) => u.attack.name);
    expect(names).toEqual(['Tackle', 'Feint Attack']);
    expect(usableAttacks(misty(s).active!, s.cards, { stadium: s.stadium.card }).map((u) => u.attack.name)).not.toContain('Feint Attack');
  });

  it('Dark Seed: the Defending Pokémon can\'t retreat, and 5 damage counters at the end of the next turn, unless it was benched (agreed)', () => {
    let s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex7-17', 'Dark Raticate', D, 70, [['Dark Seed', [C], 0]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax', { retreatCost: 0 }));
    s = attack(s, 0);
    expect(applyAction(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(false);
    expect(misty(endTurn(s, 'misty')).active!.damage).toBe(50);
  });

  it("Holy Shield: attacks by the opponent's Pokémon with Dark in their names don't affect Togetic", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dark', 'Dark Arbok', G, 90, [['Bite', [C], 30]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', mon('ex7-14', 'Togetic', C, 70, [], { stage: 'stage1', ...power('Holy Shield') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it("Dual Armor: with Metal Energy attached, Rocket's Scizor ex is Darkness and Metal (Weakness to either type's attackers changes)", () => {
    let s = duel('charmander', 'onix');
    s.cards['neo1-19'] = { id: 'neo1-19', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal', basic: false };
    put(s, 'ash', 'active', mon('ex7-101', "Rocket's Scizor ex", D, 120, [['Claw', [C], 30]], { stage: 'stage1', ex: true, ...power('Dual Armor') }));
    put(s, 'misty', 'active', big('Onix', { weakness: { type: 'metal', multiplier: 2 } }));
    // Attached from the hand: from then on it's a Metal Pokémon too, so the Defending Onix's Weakness applies.
    const metal = hand(s, 'ash', s.cards['neo1-19']);
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: metal, target: 'active' });
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Surprise! Time Machine: an Evolved Pokémon devolves, then evolves from the deck again (agreed: no limits)', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', mon('charmeleon', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    p.evolvedFrom = [{ uid: 'cm', defId: id('charmander') }];
    p.playedTurn = s.turn;
    s.cards['other-meleon'] = mon('other-meleon', 'Charmeleon', F, 70, [], { stage: 'stage1', evolvesFrom: 'Charmander' });
    s.players.ash!.deck.unshift({ uid: 'other', defId: 'other-meleon' });
    const uid = hand(s, 'ash', trainer('ex7-91', 'Surprise! Time Machine'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices: { target: 'active' } });
    expect(s.pendingChoice).toMatchObject({ kind: 'evolveFromDeck' });
    s = resolve(s, { cardUid: 'other' });
    expect(ash(s).active!.card.uid).toBe('other');
  });

  it('Swoop! Teleporter: a Basic Pokémon from the deck takes the place of one in play, with its damage; the old one is discarded', () => {
    let s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', mon('basic-a', 'Sentret', C, 50, []), ['fire']);
    p.damage = 30;
    s.cards['basic-b'] = mon('basic-b', 'Delibird', W, 70, []);
    s.players.ash!.deck.unshift({ uid: 'deli', defId: 'basic-b' });
    const uid = hand(s, 'ash', trainer('ex7-92', 'Swoop! Teleporter'));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices: { target: 'active' } });
    s = resolve(s, { cardUid: 'deli' });
    expect(ash(s).active).toMatchObject({ card: { uid: 'deli' }, damage: 30 });
    expect(ash(s).active!.energy).toHaveLength(1);
    expect(ash(s).discard.some((c) => c.uid === p.card.uid)).toBe(true);
  });

  it('Detour: the effect of the player\'s Supporter card in play (agreed: as Supernatural)', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex7-24', 'Magby', F, 50, [['Detour', [C], 0]]), ['fire']);
    const oak = hand(s, 'ash', trainer('ex6-98', "Prof. Oak's Research"));
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: oak });
    expect(ash(s).hand).toHaveLength(5);
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'supernatural', own: true });
    s = resolve(s, { cardUid: oak });
    expect(ash(s).hand).toHaveLength(5);
    expect(s.currentPlayer).toBe('misty');
  });

  it("Insomnia: Drowzee can't be Asleep; Double Tackle hits only the Active Pokémon (agreed: \"each Defending Pokémon\")", () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex7-32', 'Dark Dragonair', D, 80, [['Double Tackle', [C], 0], ['Hypnosis', [C], 0]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', mon('ex7-54', 'Drowzee', P, 50, [], power('Insomnia')));
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(20);
    expect(misty(after).bench[0]!.damage).toBe(0);
  });

  it("Pow! Hand Extension: only with more Prize cards left than the opponent", () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    const uid = hand(s, 'ash', trainer('ex7-85', 'Pow! Hand Extension'));
    s.players.ash!.prizes = s.players.misty!.prizes.slice(0, 1);
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices: { pick: 1, oppTarget: 0 } }).ok).toBe(false);
    s.players.ash!.prizes = [...s.players.misty!.prizes, { uid: 'extra', defId: 'fire' }];
    const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: uid, choices: { pick: 1, oppTarget: 0 } });
    expect(misty(after).active!.card.defId).toBe(misty(s).bench[0]!.card.defId);
  });

  it('Raging Thunder: 30 to one of the player\'s Pokémon, Rocket\'s Zapdos ex itself included, with no Weakness (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex7-106', "Rocket's Zapdos ex", D, 100, [['Plasma', [C], 10], ['Raging Thunder', [C], 60]], { ex: true, weakness: { type: 'lightning', multiplier: 2 } }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 1, { ownTarget: 'active' });
    expect(misty(after).active!.damage).toBe(60);
    expect(ash(after).active!.damage).toBe(30);
  });

  it('Spring Back: with the opponent at 1 Prize card, 50 more and a Special Condition', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex7-109', 'Treecko ☆', G, 70, [['Tackle', [C], 10], ['Spring Back', [C], 20]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 1)).active!.damage).toBe(20);
    s.players.misty!.prizes = s.players.misty!.prizes.slice(0, 1);
    const after = attack(s, 1);
    // 70, then 10 Poison damage at the checkup.
    expect(misty(after).active).toMatchObject({ damage: 80, poison: 10 });
  });
});

