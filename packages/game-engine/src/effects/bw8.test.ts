import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, retreatCost, typesOf, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, C, F, FI, G, L, P, W } from './test-kit.js';

// Plasma Storm (README: Generation 5): its attacks, Abilities, Trainers and Plasma Energy.
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
const trainer = (cardId: string, name: string, extra: object = {}): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '', ...extra });
const ability = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const use = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });
const play = (s: GameState, cardUid: string, choices = {}, player = 'ash') => act(s, player, { type: 'PLAY_TRAINER', cardUid, choices });
const pile = (k: number, defId = id('charmander')) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId }));
/** Plasma Energy, as the catalog makes it. */
const PLASMA: CardDef = { id: 'bw8-127', kind: 'energy', name: 'Plasma Energy', imageUrl: null, energyType: 'colorless', basic: false, teamPlasma: true };
const withPlasma = (s: GameState) => void (s.cards = { ...s.cards, [PLASMA.id]: PLASMA });

describe('Plasma Storm attacks', () => {
  it('Sting Missile: Combee and its cards shuffled into the deck', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw8-4', 'Combee', G, 30, [['Sting Missile', [G], 30]]), ['grass']);
    const deck = ash(s).deck.length;
    const after = attack(s, 0);
    expect(ash(after).active?.card.defId).not.toBe('bw8-4');
    expect(ash(after).deck.length + ash(after).hand.length).toBeGreaterThanOrEqual(deck + 2);
  });

  it('Damage Beat: 20 for each damage counter on the Defending Pokémon; Facade: 60 more while Poisoned', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-5', 'Vespiquen', G, 100, [['Gather Order', [G], 0], ['Damage Beat', [G, C], 20]], { stage: 'stage1' }), ['grass', 'grass']);
    put(s, 'misty', 'active', big('Snorlax')).damage = 30;
    expect(misty(attack(s, 1)).active!.damage).toBe(90);
    put(s, 'ash', 'active', mon('bw8-81', 'Conkeldurr', FI, 140, [['Facade', [C, C, C], 60]], { stage: 'stage2' }), ['fire', 'fire', 'fire']).poison = 10;
    expect(misty(attack(s, 0)).active!.damage).toBe(150);
  });

  it('Gather Order: Combee from the deck onto the Bench, as many as the player likes', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-5', 'Vespiquen', G, 100, [['Gather Order', [G], 0]], { stage: 'stage1' }), ['grass']);
    s.cards = { ...s.cards, 'bw8-4': mon('bw8-4', 'Combee', G, 30, []) };
    ash(s).deck = [...pile(3), { uid: 'c1', defId: 'bw8-4' }, { uid: 'c2', defId: 'bw8-4' }];
    const after = attack(s, 0);
    expect(ash(after).bench.filter((p) => p?.card.defId === 'bw8-4').length).toBe(2);
  });

  it('Miracle Powder: heads, the Special Condition picked', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-13', 'Amoonguss', G, 90, [['Astonish', [C], 0], ['Miracle Powder', [G, C], 30]], { stage: 'stage1' }), ['grass', 'grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(flips(s, true), 1, { condition: 'confused' })).active!.condition).toBe('confused');
    misty(s).hand = pile(5);
    expect(misty(attack(flips(s, true), 0)).hand.length).toBe(3);
  });

  it('Power Flame and Frost Prison: with a Plasma Energy card attached', () => {
    const s = duel('charmander', 'onix');
    withPlasma(s);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'ash', 'active', mon('bw8-14', 'Moltres-EX', F, 170, [['Destructive Flame', [F, C], 30], ['Power Flame', [F, F, C, C], 80]], { pokemonEX: true }), ['fire', 'fire', 'fire', 'fire']);
    expect(misty(attack(s, 1)).active!.damage).toBe(80);
    ash(s).active!.energy[3] = { uid: 'pl', defId: 'bw8-127' };
    expect(misty(attack(s, 1)).active!.damage).toBe(120);
    put(s, 'ash', 'active', mon('bw8-25', 'Articuno-EX', W, 170, [['Frost Prison', [W, W, C, C], 80]], { pokemonEX: true }), ['water', 'water', 'water', 'bw8-127']);
    expect(misty(attack(s, 0)).active!.condition).toBe('paralyzed');
  });

  it('Luring Flame: the Benched Pokémon switched in is Burned; Fiery Licks: 50 for each Fire Energy card discarded', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw8-23', 'Heatmor', F, 90, [['Luring Flame', [F], 0], ['Fiery Licks', [F, F, F], 50]]), ['fire', 'fire', 'fire']);
    const lured = misty(s).bench[0]!;
    const after = attack(s, 0, { benchSlot: 0 });
    expect(misty(after).active!.card.uid).toBe(lured.card.uid);
    // Burned: its 20 damage between turns (the coin after it may cure it).
    expect(misty(after).active!.damage).toBe(20);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).deck = [{ uid: 'e1', defId: 'fire' }, { uid: 'e2', defId: 'water' }, { uid: 'e3', defId: 'fire' }, ...pile(5)];
    expect(misty(attack(s, 1)).active!.damage).toBe(100);
  });

  it('Groovy Dance: an Energy discarded Confuses the Defending Pokémon', () => {
    const s = duel('charmander', 'onix');
    const lud = put(s, 'ash', 'active', mon('bw8-31', 'Ludicolo', W, 130, [['Groovy Dance', [W, W, C], 70]], { stage: 'stage2', ...ability('Rain Dish') }), ['water', 'water', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0, { energyUids: [] })).active!.condition ?? null).toBeNull();
    const after = attack(s, 0, { energyUids: [lud.energy[0]!.uid] });
    expect(misty(after).active!.condition).toBe('confused');
    expect(ash(after).active!.energy.length).toBe(2);
  });

  it('Seafaring: Water Energy cards from the discard pile to the Benched Pokémon, one for each heads', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw8-34', 'Manaphy', W, 70, [['Seafaring', [W], 0]], ability('Final Wish')), ['water']);
    ash(s).discard.push({ uid: 'w1', defId: 'water' }, { uid: 'w2', defId: 'water' }, { uid: 'f1', defId: 'fire' });
    const after = attack(flips(s, true, true, false), 0);
    // The two Water Energy cards are the same card: the first is taken at once, and its Pokémon asked.
    expect(after.pendingChoice).toMatchObject({ kind: 'attachCard', only: { bench: true } });
    expect(settles(after).some((done) => ash(done).bench[0]!.energy.length === 2)).toBe(true);
  });

  it('Enefountain and Double Assist: 2 basic Energy cards to the Pokémon picked', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw8-37', 'Vanilluxe', W, 130, [['Enefountain', [C], 30]], { stage: 'stage2' }), ['water']);
    ash(s).hand = [{ uid: 'h1', defId: 'fire' }, { uid: 'h2', defId: 'water' }, ...pile(2)];
    const fountain = attack(s, 0, { ownTarget: 0 });
    expect(fountain.pendingChoice).toMatchObject({ kind: 'attachFromHand', count: 2, basic: true, target: 0 });
    settles(fountain);
    put(s, 'ash', 'active', mon('bw8-47', 'Magnezone', L, 140, [['Double Assist', [L], 30]], { stage: 'stage2' }), ['lightning']);
    ash(s).discard.push({ uid: 'd1', defId: 'fire' }, { uid: 'd2', defId: 'water' });
    const assist = attack(s, 0, { ownTarget: 0 });
    expect(assist.pendingChoice).toMatchObject({ kind: 'attachFromDiscard', count: 2, target: 0 });
    settles(assist);
  });

  it('Electribonus: a Lightning Energy card discarded for 3 cards; Poltergeist: 20 for each Trainer card in the opponent\'s hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-49', 'Rotom', L, 60, [['Electribonus', [C], 0], ['Poltergeist', [L, C], 20]]), ['lightning', 'lightning']);
    ash(s).hand = [{ uid: 'l1', defId: 'lightning' }];
    ash(s).deck = pile(10);
    const after = attack(s, 0);
    expect(ash(after).discard.some((c) => c.uid === 'l1')).toBe(true);
    expect(ash(after).hand.length).toBe(3);
    put(s, 'misty', 'active', big('Snorlax'));
    misty(s).hand = [{ uid: 't1', defId: 'base1-94' }, { uid: 't2', defId: 'base1-95' }, ...pile(2)];
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Discharge: every Lightning Energy card discarded, 30 for each; Powerful Storm: 20 for each Energy on the player\'s Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'ash', 'active', mon('bw8-51', 'Galvantula', L, 80, [['Discharge', [L], 30]], { stage: 'stage1' }), ['lightning', 'lightning', 'fire']);
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(60);
    expect(ash(after).active!.energy.map((e) => e.defId)).toEqual(['fire']);
    put(s, 'ash', 'active', mon('bw8-61', 'Gallade', P, 140, [['Powerful Storm', [C, C], 20]], { stage: 'stage2' }), ['psychic', 'psychic']);
    ash(s).bench[0]!.energy = [{ uid: 'b1', defId: 'fire' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Tool Drop: 20 for each Pokémon Tool in play; Ensnarl: 20 for each Colorless of the Retreat Cost', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', big('Snorlax', { retreatCost: 3 }));
    misty(s).active!.attached = [{ card: { uid: 'tool1', defId: 'bw8-130' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    ash(s).active!.attached = [{ card: { uid: 'tool2', defId: 'bw8-130' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    s.cards = { ...s.cards, 'bw8-130': trainer('bw8-130', 'Victory Piece') };
    const charmander = ash(s).active!;
    put(s, 'ash', 'active', mon('bw8-65', 'Trubbish', P, 70, [['Tool Drop', [P, C], 20]]), ['psychic', 'psychic']).attached = charmander.attached;
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    put(s, 'ash', 'active', mon('bw8-67', 'Garbodor', P, 110, [['Ensnarl', [C, C], 20]], { stage: 'stage1' }), ['psychic', 'psychic']);
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Biosmog: Poisoned, and heads discards the Energy picked', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-66', 'Garbodor', P, 110, [['Biosmog', [C], 20]], { stage: 'stage1' }), ['psychic']);
    const target = put(s, 'misty', 'active', big('Snorlax'), ['water']);
    const after = attack(flips(s, true), 0, { defenderEnergyUid: target.energy[0]!.uid });
    expect(misty(after).active!.poison).toBe(10);
    expect(misty(after).active!.energy).toEqual([]);
  });

  it('Damakinesis: 6 damage counters moved from the player\'s Pokémon to the Defending Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw8-70', 'Beheeyem', P, 90, [['Damakinesis', [P, C, C], 0]], { stage: 'stage1' }), ['psychic', 'psychic', 'psychic']).damage = 40;
    ash(s).bench[0]!.damage = 30;
    put(s, 'misty', 'active', big('Snorlax'));
    let after = attack(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'moveCounters', count: 6, toActive: true });
    expect(applyAction(after, 'ash', { type: 'RESOLVE_CHOICE' }).ok).toBe(false);
    expect(settles(after, 14).length).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) {
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: i < 4 ? 'active' : 0 });
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    }
    expect(after.pendingChoice?.kind).not.toBe('moveCounters');
    expect(misty(after).active!.damage).toBe(60);
    expect(ash(after).active!.damage).toBe(0);
    expect(ash(after).bench[0]!.damage).toBe(10);
  });

  it('Cargo Jet: a Team Plasma card discarded for 3 cards; Teampact: 30 for each Team Plasma Pokémon', () => {
    const s = duel('charmander', 'onix');
    withPlasma(s);
    put(s, 'ash', 'active', mon('bw8-87', 'Skarmory', 'metal', 90, [['Cargo Jet', [C], 0]]), ['fire']);
    ash(s).hand = [{ uid: 'pl', defId: 'bw8-127' }];
    ash(s).deck = pile(10);
    const after = attack(s, 0);
    expect(ash(after).discard.some((c) => c.uid === 'pl')).toBe(true);
    expect(ash(after).hand.length).toBe(3);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'ash', 'active', mon('bw8-101', 'Snorlax', C, 130, [['Teampact', [C, C, C, C, C], 30]], ability('Block')), ['fire', 'fire', 'fire', 'fire', 'fire']);
    put(s, 'ash', 0, mon('plasma1', 'Deoxys-EX', P, 170, [], { pokemonEX: true, teamPlasma: true }));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Sweet Kiss: the opponent draws a card; Destructive Sound: the Item cards in their hand discarded', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-103', 'Togetic', C, 80, [['Sweet Kiss', [C], 30]], { stage: 'stage1' }), ['fire']);
    const handSize = misty(s).hand.length;
    expect(misty(attack(s, 0)).hand.length).toBe(handSize + 2);
    put(s, 'ash', 'active', mon('bw8-107', 'Exploud', C, 140, [['Destructive Sound', [C, C, C], 0]], { stage: 'stage2' }), ['fire', 'fire', 'fire']);
    s.cards = { ...s.cards, 'bw1-101': trainer('bw1-101', 'Professor Juniper') };
    misty(s).hand = [{ uid: 'item', defId: 'base1-94' }, { uid: 'sup', defId: 'bw1-101' }];
    const after = attack(s, 0);
    expect(misty(after).discard.map((c) => c.uid)).toContain('item');
    expect(misty(after).hand.map((c) => c.uid)).toContain('sup');
  });
});

describe('Plasma Storm Abilities', () => {
  it('Fair-Weather Heal: once a turn, 20 off a Pokémon with Grass Energy attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-7', 'Cherrim', G, 80, [], { stage: 'stage1', ...ability('Fair-Weather Heal') }), ['grass']).damage = 30;
    const after = use(s, 'active', { to: 'active' });
    expect(ash(after).active!.damage).toBe(10);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active', choices: { to: 'active' } }).ok).toBe(false);
  });

  it('Free Flight: no Retreat Cost with no Energy attached; Block: the opponent\'s Active Pokémon can\'t retreat', () => {
    const s = duel('charmander', 'onix');
    const zubat = put(s, 'ash', 'active', mon('bw8-53', 'Zubat', P, 50, [], { retreatCost: 1, ...ability('Free Flight') }));
    expect(retreatCost(zubat, s.cards, [ash(s), misty(s)])).toBe(0);
    zubat.energy = [{ uid: 'f', defId: 'fire' }];
    expect(retreatCost(zubat, s.cards, [ash(s), misty(s)])).toBe(1);
    ash(s).bench[0] = { card: { uid: 'b', defId: id('charmander') }, evolvedFrom: [], damage: 0, energy: [], playedTurn: 0 };
    put(s, 'misty', 'active', mon('bw8-101', 'Snorlax', C, 130, [], ability('Block')));
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: ['f'] }).ok).toBe(false);
  });

  it('Rain Dish: 20 off Ludicolo between turns; Rough Skin: 2 damage counters on the attacker', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    put(s, 'ash', 0, mon('bw8-31', 'Ludicolo', W, 130, [], { stage: 'stage2', ...ability('Rain Dish') })).damage = 30;
    expect(ash(endTurn(s, 'ash')).bench[0]!.damage).toBe(10);
    put(s, 'misty', 'active', mon('bw8-33', 'Sharpedo', W, 300, [], { stage: 'stage1', ...ability('Rough Skin') }));
    expect(ash(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Spiteful Spirit and Aftermath: Knocked Out by the opponent\'s attack', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'], oppBench: ['charmander'] });
    put(s, 'misty', 'active', mon('bw8-39', 'Jellicent', P, 10, [], { stage: 'stage1', ...ability('Spiteful Spirit') }));
    const spited = attack(s, 0);
    expect(ash(spited).active!.condition).toBe('confused');
    expect(ash(spited).active!.poison).toBe(10);
    put(s, 'misty', 'active', mon('bw8-58', 'Weezing', P, 10, [], { stage: 'stage1', ...ability('Aftermath') }));
    expect(ash(attack(s, 0)).discard.length).toBe(ash(s).discard.length + 3);
  });

  it('Final Wish: Knocked Out by the opponent\'s attack, a card from the deck (asked between turns)', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'], oppBench: ['charmander'] });
    put(s, 'misty', 'active', mon('bw8-34', 'Manaphy', W, 10, [], ability('Final Wish')));
    misty(s).deck = [...pile(3), { uid: 'w', defId: 'water' }];
    const after = attack(s, 0);
    const asked = [after.pendingChoice, ...(after.queuedChoices ?? [])].find((c) => c?.source === 'Final Wish');
    expect(asked).toMatchObject({ player: 'misty', kind: 'pickFromDeck', filter: 'any' });
  });

  it('Dual Brains: a second Supporter card in a turn, but not a third', () => {
    const s = duel('charmander', 'onix');
    ash(s).deck = pile(20);
    put(s, 'ash', 0, mon('bw8-46', 'Magnezone', L, 140, [], { stage: 'stage2', ...ability('Dual Brains') }));
    const a = hand(s, 'ash', trainer('bw8-118', 'Colress'));
    let after = play(s, a);
    const b = hand(after, 'ash', trainer('bw8-118', 'Colress'));
    after = play(after, b);
    const c = hand(after, 'ash', trainer('bw8-118', 'Colress'));
    expect(applyAction(after, 'ash', { type: 'PLAY_TRAINER', cardUid: c }).ok).toBe(false);
  });

  it('Night Sight: once a turn, a card drawn; Premonition: the top 2 cards put back in any order', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-55', 'Crobat', P, 130, [], { stage: 'stage2', ...ability('Night Sight') }));
    const size = ash(s).hand.length;
    expect(ash(use(s, 'active')).hand.length).toBe(size + 1);
    put(s, 'ash', 'active', mon('bw8-73', 'Lunatone', FI, 90, [], ability('Premonition')));
    ash(s).deck = [{ uid: 'a', defId: 'fire' }, { uid: 'b', defId: 'water' }, ...pile(3)];
    let after = use(s, 'active');
    expect(after.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 2 });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', order: ['b', 'a'] });
    expect(ash(after).deck.slice(0, 2).map((c) => c.uid)).toEqual(['b', 'a']);
  });

  it('Dual Armor: with Metal Energy attached, Lucario is Fighting and Metal', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-78', 'Lucario', FI, 100, [['Punch', [C], 10]], { stage: 'stage1', ...ability('Dual Armor') }), [id('metal')]);
    const after = attack(s, 0);
    expect(typesOf(inPlayDef(after.cards, ash(after).active!)).sort()).toEqual(['fighting', 'metal']);
  });

  it('Plasma Steel: no damage to the player\'s Metal Pokémon from the opponent\'s Pokémon-EX', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex-hitter', 'Mewtwo-EX', P, 170, [['X Ball', [C], 60]], { pokemonEX: true }), ['fire']);
    put(s, 'misty', 'active', mon('bw8-90', 'Klinklang', 'metal', 130, [], { stage: 'stage2', ...ability('Plasma Steel') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    put(s, 'ash', 'active', mon('plain-hitter', 'Mewtwo', P, 120, [['Ball', [C], 60]]), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Moon Guidance: heads, a card that evolves from one of the player\'s Pokémon put onto it', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw8-98', 'Clefable', C, 90, [], { stage: 'stage1', ...ability('Moon Guidance') }));
    put(s, 'ash', 0, mon('charmander-x', 'Charmander', F, 50, []));
    ash(s).deck = [...pile(2, 'water'), { uid: 'evo', defId: id('charmeleon') }];
    const after = use(flips(s, true), 'active');
    expect(after.pendingChoice).toMatchObject({ kind: 'evolveMany', once: true });
    expect(settles(after).length).toBeGreaterThan(0);
    expect(use(flips(s, false), 'active').pendingChoice).toBeUndefined();
  });

  it('Bright Veil: the opponent\'s Item cards do nothing to the player\'s Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('bw8-104', 'Togekiss', C, 140, [], { stage: 'stage2', ...ability('Bright Veil') }));
    const laser = hand(s, 'ash', trainer('bw8-123', 'Hypnotoxic Laser'));
    const after = play(flips(s, true), laser);
    expect(misty(after).active!.poison ?? 0).toBe(0);
    expect(misty(after).active!.condition ?? null).toBeNull();
  });

  it('Overflow: 1 more Prize card for a Knock Out by its attack', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw8-108', 'Lugia-EX', C, 180, [['Aeroblast', [C], 60]], { pokemonEX: true, ...ability('Overflow') }), ['fire']);
    const prizes = ash(s).prizes.length;
    misty(s).active!.damage = 80;
    expect(ash(attack(s, 0)).prizes.length).toBe(prizes - 2);
  });

  it('Big Wing: once a turn, as the Active Pokémon, the opponent switches', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', mon('bw8-116', 'Braviary', C, 100, [], { stage: 'stage1', ...ability('Big Wing') }));
    const benched = misty(s).bench[0]!;
    expect(misty(use(s, 'active')).active!.card.uid).toBe(benched.card.uid);
  });
});

describe('Plasma Storm Trainers', () => {
  it('Bicycle: cards drawn until the hand has 4; Colress: a card for each Benched Pokémon, both players\'', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'], oppBench: ['charmander', 'charmander'] });
    ash(s).hand = [];
    ash(s).deck = pile(20);
    const bike = hand(s, 'ash', trainer('bw8-117', 'Bicycle'));
    expect(ash(play(s, bike)).hand.length).toBe(4);
    const colress = hand(s, 'ash', trainer('bw8-118', 'Colress'));
    expect(ash(play(s, colress)).hand.length).toBe(3);
  });

  it('Colress Machine: a Plasma Energy card from the deck onto a Team Plasma Pokémon only', () => {
    const s = duel('charmander', 'onix');
    withPlasma(s);
    const plasma = put(s, 'ash', 0, mon('plasma1', 'Deoxys-EX', P, 170, [], { pokemonEX: true, teamPlasma: true }));
    ash(s).deck = [...pile(3), { uid: 'pe', defId: 'bw8-127' }];
    const machine = hand(s, 'ash', trainer('bw8-119', 'Colress Machine', { teamPlasma: true }));
    let after = play(s, machine);
    if (after.pendingChoice?.kind === 'pickFromDeck') after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'pe' });
    expect(after.pendingChoice).toMatchObject({ kind: 'attachCard', only: { plasma: true } });
    expect(applyAction(after, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' }).ok).toBe(false);
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual(['pe']);
    expect(plasma.card.defId).toBe('plasma1');
  });

  it('Escape Rope: both players switch, the opponent first', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'], oppBench: ['charmander', 'squirtle'] });
    const mine = ash(s).bench[0]!;
    const rope = hand(s, 'ash', trainer('bw8-120', 'Escape Rope'));
    const after = play(s, rope);
    expect(ash(after).active!.card.uid).toBe(mine.card.uid);
    expect(after.pendingChoice).toMatchObject({ player: 'misty', kind: 'switchIn' });
    expect(settles(after).every((done) => misty(done).active!.card.defId !== id('onix'))).toBe(true);
  });

  it('Ether: a basic Energy card on top is attached; anything else stays on top', () => {
    const s = duel('charmander', 'onix');
    ash(s).deck = [{ uid: 'top', defId: 'water' }, ...pile(3)];
    const ether = hand(s, 'ash', trainer('bw8-121', 'Ether'));
    let after = play(s, ether);
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(ash(after).active!.energy.map((e) => e.uid)).toEqual(['top']);
    ash(s).deck = [{ uid: 'top2', defId: id('charmander') }, ...pile(3)];
    const ether2 = hand(s, 'ash', trainer('bw8-121', 'Ether'));
    expect(ash(play(s, ether2)).deck[0]!.uid).toBe('top2');
  });

  it('Hypnotoxic Laser: Poisoned, and heads Asleep too; Virbank City Gym: 2 more damage counters for Poison', () => {
    const s = duel('charmander', 'onix');
    const laser = hand(s, 'ash', trainer('bw8-123', 'Hypnotoxic Laser'));
    const after = play(flips(s, true), laser);
    expect(misty(after).active!.poison).toBe(10);
    expect(misty(after).active!.condition).toBe('asleep');
    const gym = hand(after, 'ash', trainer('bw8-126', 'Virbank City Gym'));
    const checked = endTurn(play(after, gym), 'ash');
    expect(misty(checked).active!.damage).toBe(30);
  });

  it('Plasma Frigate: no Weakness with a Plasma Energy card attached', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    withPlasma(s);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: F, multiplier: 2 } }), ['bw8-127']);
    const frigate = hand(s, 'ash', trainer('bw8-124', 'Plasma Frigate'));
    expect(misty(attack(s, 1)).active!.damage).toBe(60);
    expect(misty(attack(play(s, frigate), 1)).active!.damage).toBe(30);
  });

  it('Team Plasma Grunt: a Team Plasma card discarded, then 4 cards drawn', () => {
    const s = duel('charmander', 'onix');
    withPlasma(s);
    ash(s).hand = [{ uid: 'pe', defId: 'bw8-127' }];
    ash(s).deck = pile(10);
    const grunt = hand(s, 'ash', trainer('bw8-125', 'Team Plasma Grunt', { teamPlasma: true }));
    const after = play(s, grunt, { handUids: ['pe'] });
    expect(ash(after).hand.length).toBe(4);
    ash(s).hand = [];
    const again = hand(s, 'ash', trainer('bw8-125', 'Team Plasma Grunt', { teamPlasma: true }));
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: again }).ok).toBe(false);
  });

  it('Scramble Switch: switched, then the old Active Pokémon\'s Energy moved as the player likes', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'], energy: ['fire', 'water'] });
    const scramble = hand(s, 'ash', trainer('bw8-129', 'Scramble Switch'));
    const after = play(s, scramble, { target: 0 });
    expect(after.pendingChoice).toMatchObject({ kind: 'shiftEnergy', from: 0, to: 'active', any: true });
    expect(settles(after).length).toBeGreaterThan(0);
  });

  it('Victory Piece: Victini-EX attacks whatever Energy is attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('vic', 'Victini-EX', F, 110, [['Turbo Energize', [F, F, C], 40]], { pokemonEX: true }));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
    const piece = hand(s, 'ash', trainer('bw8-130', 'Victory Piece'));
    expect(misty(attack(play(s, piece, { target: 'active' }), 0)).active!.damage).toBe(40);
  });
});
