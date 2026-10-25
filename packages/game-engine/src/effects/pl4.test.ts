import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, type GameState, type InPlayPokemon, type Target } from '../index.js';
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
const withTool = (s: GameState, p: InPlayPokemon, cardId: string, name: string) => {
  s.cards = { ...s.cards, [cardId]: trainer(cardId, name) };
  p.attached = [{ card: { uid: `${cardId}-${n++}`, defId: cardId }, until: Number.MAX_SAFE_INTEGER, tool: true }];
};

describe('Arceus powers', () => {
  it('Fire Formation and Competitiveness: 10 more for each Fire Pokémon on the Bench; 30 more with no Supporter played', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-1', 'Charizard', F, 140, [['Burn', [C], 50]], { stage: 'stage2', ...body('Fire Formation') }), ['fire']);
    put(s, 'ash', 0, mon('f1', 'Vulpix', F, 50, []));
    put(s, 'ash', 1, mon('f2', 'Ponyta', F, 60, []));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(70);
    put(s, 'ash', 'active', mon('pl4-7', 'Probopass', 'metal', 100, [['Slam', [C], 40]], { stage: 'stage1', ...body('Competitiveness') }), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(70);
  });

  it('Top Accelerator: a basic Energy card on top attached; anything else discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-8', 'Salamence', C, 140, [], { stage: 'stage2', ...body('Top Accelerator') }));
    ash(s).deck = [{ uid: 'w1', defId: 'water' }, ...pile(3)];
    s = usePower(s, 'active');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(ash(s).active!.energy.map((e) => e.uid)).toEqual(['w1']);
  });

  it('Cloudy Sky: 10 less to Grass and Fire Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('grass-x', 'Tangela', G, 300, []));
    put(s, 'misty', 0, mon('pl4-15', 'Cherrim', G, 80, [], { stage: 'stage1', ...body('Cloudy Sky') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Keystone Seal: as the Active Pokémon, no Trainer cards for anyone', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('pl4-32', 'Spiritomb', 'darkness', 60, [], body('Keystone Seal')));
    s.cards = { ...s.cards, 'dp1-110': trainer('dp1-110', 'Poké Ball') };
    ash(s).hand = [{ uid: 'ball', defId: 'dp1-110' }];
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'ball' })).toMatchObject({ ok: false, error: expect.stringMatching(/Keystone Seal/) });
  });

  it('Cloak Evolution: Burmy evolves the turn it was played', () => {
    let s = duel('charmander', 'onix');
    const burmy = hand(s, 'ash', mon('pl4-56', 'Burmy Plant Cloak', G, 40, [], body('Cloak Evolution')));
    const wormadam = hand(s, 'ash', mon('wormadam-x', 'Wormadam Plant Cloak', G, 80, [], { stage: 'stage1', evolvesFrom: 'Burmy Plant Cloak' }));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: burmy, slot: 0 });
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: wormadam, target: 0 }).ok).toBe(true);
  });

  it('Rock Reaction: a Fighting Energy card attached from the hand, Dome Fossil evolves from the deck', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'pl4-92': mon('pl4-92', 'Dome Fossil', C, 50, [], { trainerText: 'x', ...body('Rock Reaction') }), kabuto: mon('kabuto', 'Kabuto', FI, 80, [], { stage: 'stage1', evolvesFrom: 'Dome Fossil' }) };
    put(s, 'ash', 0, s.cards['pl4-92'] as PokemonCardDef);
    ash(s).deck = [{ uid: 'k', defId: 'kabuto' }, ...pile(3)];
    ash(s).hand = [{ uid: 'f1', defId: 'fighting' }];
    s = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'f1', target: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'evolveFromDeck', source: 'Rock Reaction' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'k' });
    expect(ash(s).bench[0]!.card.uid).toBe('k');
  });

  it("Level-Down: an opponent's Pokémon LV.X loses its Level-Up card", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-97', 'Gengar', P, 140, [], { stage: 'levelUp', ...body('Level-Down') }));
    const lvx = put(s, 'misty', 'active', mon('lvx-x', 'Dialga', 'metal', 120, [], { stage: 'levelUp' }));
    lvx.evolvedFrom.push({ uid: 'below', defId: id('onix') });
    lvx.levelUpFrom = id('onix');
    const after = usePower(s, 'active', { oppFrom: 'active' });
    expect([misty(after).active!.card.uid, misty(after).deck.some((c) => c.defId === 'lvx-x')]).toEqual(['below', true]);
  });

  it('Double Fall: 1 more Prize card for a Pokémon Salamence Knocks Out this turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('salamence-x', 'Salamence', C, 140, []), ['fire']);
    put(s, 'misty', 'active', mon('weak', 'Caterpie', G, 30, []));
    put(s, 'misty', 0, big('Snorlax'));
    decks(s);
    const lvx = hand(s, 'ash', mon('pl4-98', 'Salamence', C, 160, [['Steam Blast', [C], 100]], { stage: 'levelUp', ...body('Double Fall') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: lvx, target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    const prizes = ash(s).prizes.length;
    s = attack(s, 0);
    expect(ash(s).prizes.length).toBe(prizes - 2);
  });

  it('Star Barrier and Wild Guard: no Weakness with Energy attached; nothing from Pokémon SP', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('pl4-SH12', 'Shinx', L, 300, [], { weakness: { type: 'fighting', multiplier: 2 }, ...body('Star Barrier') }), ['lightning']);
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    put(s, 'ash', 'active', mon('sp', 'Crobat G', P, 80, [['Bite', [C], 30]]), ['psychic']);
    put(s, 'misty', 'active', mon('pl4-28', 'Rapidash', F, 80, [], { stage: 'stage1', ...body('Wild Guard') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });
});

describe('Arceus Trainers', () => {
  it('Bench Shield: no attack damage to its Benched Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-10', 'Giratina', P, 100, [['Over Slash', [C, C], 0]]), ['psychic', 'psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    withTool(s, put(s, 'misty', 0, big('Lapras')), 'pl4-83', 'Bench Shield');
    expect(misty(attack(s, 0)).bench[0]!.damage).toBe(0);
  });

  it('Expert Belt: 20 more HP and damage; Knocked Out, 1 more Prize card', () => {
    let s = duel('charmander', 'onix');
    withTool(s, put(s, 'ash', 'active', hitter(30), ['fighting']), 'pl4-87', 'Expert Belt');
    const belted = put(s, 'misty', 'active', mon('weak', 'Caterpie', G, 30, []));
    withTool(s, belted, 'pl4-87', 'Expert Belt');
    put(s, 'misty', 0, big('Snorlax'));
    decks(s);
    const prizes = ash(s).prizes.length;
    s = attack(s, 0);
    expect(ash(s).prizes.length).toBe(prizes - 2);
  });

  it('Lucky Egg: Knocked Out by an attack, cards drawn until the hand has 7', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(100), ['fighting']);
    withTool(s, put(s, 'misty', 'active', mon('weak', 'Caterpie', G, 30, [])), 'pl4-88', 'Lucky Egg');
    put(s, 'misty', 0, big('Snorlax'));
    decks(s);
    misty(s).hand = pile(2);
    s = attack(s, 0);
    expect(misty(s).hand.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Arceus attacks', () => {
  it('Recruit: a Supporter from the opponent\'s hand used, then discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-29', 'Raticate', C, 70, [['Recruit', [C], 0]], { stage: 'stage1' }), ['fire']);
    decks(s);
    s.cards = { ...s.cards, 'dp6-130': trainer('dp6-130', "Buck's Training") };
    misty(s).hand = [{ uid: 'buck', defId: 'dp6-130' }, { uid: 'w1', defId: 'water' }];
    const handSize = ash(s).hand.length;
    s = attack(s, 0);
    if (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'buck' });
    expect([ash(s).hand.length, misty(s).discard.some((c) => c.uid === 'buck')]).toEqual([handSize + 2, true]);
  });

  it('Time Spiral: the top Evolution card of an Evolved Pokémon shuffled into the deck', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-23', 'Omastar', W, 120, [['Time Spiral', [C], 0]], { stage: 'stage2' }), ['water']);
    const evolved = put(s, 'misty', 'active', mon('charmeleon-x', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    evolved.evolvedFrom.push({ uid: 'char', defId: id('charmander') });
    s = attack(s, 0, { oppTarget: 'active' });
    expect([misty(s).active!.card.uid, misty(s).deck.some((c) => c.defId === 'charmeleon-x')]).toEqual(['char', true]);
  });

  it('Damage Roller: damage counters until the Defending Pokémon has Swalot\'s HP left', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-9', 'Swalot', P, 100, [['Damage Roller', [C], 0]], { stage: 'stage1' }), ['psychic']).damage = 40;
    put(s, 'misty', 'active', mon('snorlax-x', 'Snorlax', C, 100, []));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Sky Spear and Metal Barrier: Energy to the Lost Zone; nothing from Pokémon LV.X next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-AR5', 'Arceus', C, 80, [['Ripple Swell', [], 0], ['Sky Spear', [C], 0]]), ['fire', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 1, { oppTarget: 'active' });
    expect([misty(s).active!.damage, ash(s).lostZone?.length]).toEqual([80, 2]);
    put(s, 'ash', 'active', mon('pl4-AR9', 'Arceus', 'metal', 90, [['Metal Barrier', [C], 40]]), ['fire']);
    put(s, 'misty', 'active', mon('lvx-y', 'Dialga', 'metal', 120, [['Punch', [C], 50]], { stage: 'levelUp' }), ['fire']);
    s.currentPlayer = 'ash';
    decks(s);
    s = attack(s, 0);
    s = attack(s, 0, undefined, 'misty');
    expect(ash(s).active!.damage).toBe(0);
  });

  it('Tumble Down: Fighting Energy cards discarded from the hand, 30 for each', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-19', 'Golem', FI, 140, [['Tumble Down', [C], 0]], { stage: 'stage2' }), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).hand = [{ uid: 'f1', defId: 'fighting' }, { uid: 'f2', defId: 'fighting' }, { uid: 'w1', defId: 'water' }];
    s = attack(s, 0, { amount: 2 });
    expect([misty(s).active!.damage, ash(s).hand.map((c) => c.uid)]).toEqual([60, ['w1']]);
  });

  it('Darkness Grace: a card from the deck evolves a Pokémon, then a damage counter on Spiritomb', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl4-32', 'Spiritomb', 'darkness', 60, [['Darkness Grace', [], 0]]));
    put(s, 'ash', 0, mon('charmander-y', 'Charmander', F, 50, []));
    s.cards = { ...s.cards, 'charmeleon-y': mon('charmeleon-y', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }) };
    ash(s).deck = [{ uid: 'cm', defId: 'charmeleon-y' }, ...pile(3)];
    s = attack(s, 0);
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'cm' });
    expect([ash(s).bench[0]!.card.uid, ash(s).active!.damage]).toEqual(['cm', 10]);
  });
});

describe('Arceus Dowsing Code', () => {
  it('benched from the hand, up to 2 Pokémon Tool cards from the discard pile shuffled into the deck', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'pl4-88': trainer('pl4-88', 'Lucky Egg'), 'pl4-83': trainer('pl4-83', 'Bench Shield') };
    ash(s).discard = [{ uid: 'egg', defId: 'pl4-88' }, { uid: 'shield', defId: 'pl4-83' }];
    const porygon = hand(s, 'ash', mon('pl4-26', 'Porygon-Z G', C, 80, [], body('Dowsing Code')));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: porygon, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'egg' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect([ash(s).discard.map((c) => c.uid), ash(s).deck.some((c) => c.uid === 'egg')]).toEqual([['shield'], true]);
    expect(inPlayDef(s.cards, ash(s).bench[0]!).name).toBe('Porygon-Z G');
  });
});
