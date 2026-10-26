import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, retreatCost, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, flips, id, mon, settles, tryAttack, C, F, FI, G, L, P, W } from './test-kit.js';

// Dragons Exalted (README: Generation 5): its attacks, Abilities (Garbotoxin, the first effect to name them), Trainers and
// Blend Energy.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards = { ...s.cards, [def.id]: def, ...ENERGY };
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
const tool = (s: GameState, p: InPlayPokemon, cardId: string, name: string) => {
  s.cards = { ...s.cards, [cardId]: trainer(cardId, name) };
  (p.attached ??= []).push({ card: { uid: `${cardId}-${n++}`, defId: cardId }, until: Number.MAX_SAFE_INTEGER, tool: true });
};

const ENERGY: Record<string, CardDef> = {
  'bw-darkness': { id: 'bw-darkness', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' },
  'bw-metal': { id: 'bw-metal', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' },
  'bw6-117': { id: 'bw6-117', kind: 'energy', name: 'Blend Energy Grass Fire Psychic Darkness', imageUrl: null, energyType: 'colorless', basic: false },
};
const D = 'darkness' as const;
const DR = 'dragon' as const;
const M = 'metal' as const;

const hooh = mon('bw6-22', 'Ho-Oh-EX', F, 160, [['Rainbow Burn', [C, C, C], 20]], { pokemonEX: true, ...ability('Rebirth') });
const feebas = mon('bw6-27', 'Feebas', W, 30, [['Add-a-Dash', [W], 0]]);
const manectric = mon('bw6-44', 'Manectric', L, 90, [['Energy Assist', [L], 0]], { stage: 'stage1' });
const dustox = mon('bw6-47', 'Dustox', P, 110, [['Hazardous Scales', [P], 0]], { stage: 'stage2' });
const drifblim = mon('bw6-51', 'Drifblim', P, 100, [['Shadow Steal', [C], 50], ['Plentiful Placement', [P, C], 0]], { stage: 'stage1' });
const gothitelle = mon('bw6-57', 'Gothitelle', P, 130, [['Doom Decree', [P, C], 0]], { stage: 'stage2' });
const marowak = mon('bw6-61', 'Marowak', FI, 90, [['Vortex Chop', [FI, C, C], 60]], { stage: 'stage1' });
const baltoy = mon('bw6-63', 'Baltoy', FI, 60, [['Reverse Spin', [C, C], 0]]);
const claydol = mon('bw6-64', 'Claydol', FI, 90, [['Rapid Spin', [C, C], 30]], { stage: 'stage1' });
const gigalith = mon('bw6-67', 'Gigalith', FI, 140, [['Revenge Cannon', [FI, C, C], 10]], { stage: 'stage2' });
const probopass = mon('bw6-82', 'Probopass', M, 120, [['Magnetic Lines', [C, C], 30]], { stage: 'stage1' });
const rayquaza = mon('bw6-85', 'Rayquaza-EX', DR, 170, [['Celestial Roar', [C], 0], ['Dragon Burst', [F, L], 60]], { pokemonEX: true });
const audino = mon('bw6-108', 'Audino', C, 90, [['Wake-up Beam', [C, C], 40]]);
const jumpluff = mon('bw6-3', 'Jumpluff', G, 90, [['Acrobatics', [G], 20]], { stage: 'stage2', evolvesFrom: 'Skiploom', ...ability('Leave It to the Wind') });
const ninjask = mon('bw6-11', 'Ninjask', G, 60, [['Night Slash', [G, C], 60]], { stage: 'stage1', evolvesFrom: 'Nincada', ...ability('Cast-off Shell') });
const nincada = mon('bw6-10', 'Nincada', G, 50, [['Scratch', [C], 10]]);
const shedinja = mon('bw6-48', 'Shedinja', P, 60, [['Cursed Drop', [P], 0]], { stage: 'stage1', evolvesFrom: 'Nincada', retreatCost: 0, ...ability('Empty Shell') });
const ninetales = mon('bw6-19', 'Ninetales', F, 90, [['Hexed Flame', [F], 20]], { stage: 'stage1', evolvesFrom: 'Vulpix', ...ability('Bright Look') });
const vulpix = mon('bw6-18', 'Vulpix', F, 60, [['Ember', [F], 10]]);
const ampharos = mon('bw6-40', 'Ampharos', L, 140, [['Electrobullet', [L, C, C], 70]], { stage: 'stage2', ...ability('Electromagnetic Wall') });
const mew = mon('bw6-46', 'Mew-EX', P, 120, [['Replace', [P], 0]], { pokemonEX: true, ...ability('Versatile') });
const sigilyph = mon('bw6-52', 'Sigilyph', P, 90, [['Psychic', [P, C, C], 50]], { ...ability('Safeguard') });
const garbodor = mon('bw6-54', 'Garbodor', P, 100, [['Sludge Toss', [P, P, C], 60]], { stage: 'stage1', ...ability('Garbotoxin') });
const aggron = mon('bw6-80', 'Aggron', M, 140, [['Giga Horn', [M, M, C], 90]], { stage: 'stage2', evolvesFrom: 'Lairon', ...ability('Toppling Wind') });
const lairon = mon('bw6-79', 'Lairon', M, 90, [['Headbutt', [C], 20]], { stage: 'stage1', evolvesFrom: 'Aron' });
const altaria = mon('bw6-84', 'Altaria', DR, 70, [['Glide', [W, M, C], 40]], { stage: 'stage1', ...ability('Fight Song') });
const hydreigon = mon('bw6-97', 'Hydreigon', DR, 150, [['Dragonblast', [P, D, D, C], 140]], { stage: 'stage2', ...ability('Dark Trance') });
const slaking = mon('bw6-103', 'Slaking', C, 150, [['Crushing Blow', [C, C, C, C], 100]], { stage: 'stage2', ...ability('Unobservant') });
const bouffalant = mon('bw6-110', 'Bouffalant', C, 100, [['Gold Breaker', [C, C, C], 60]], { ...ability('Bouffer') });
const dragon = mon('test-dragon', 'Dratini', DR, 100, [['Tail Whip', [C], 10]]);
const exAttacker = mon('test-ex', 'Tyranitar ex', D, 150, [['Bite', [C], 30]], { ex: true });
const EXAttacker = mon('test-EX', 'Kyurem-EX', DR, 180, [['Bite', [C], 30]], { pokemonEX: true });

describe('Dragons Exalted attacks', () => {
  it('Rainbow Burn: 20 more for each type of basic Energy attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hooh, ['fire', 'fire', 'water', 'bw6-117']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Add-a-Dash: a card drawn for each heads', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', feebas, ['water']);
    const size = ash(s).hand.length;
    expect(ash(attack(flips(s, true, true), 0)).hand.length).toBe(size + 2);
  });

  it('Energy Assist: 2 basic Energy cards from the discard pile onto the Benched Pokémon picked first', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander', 'charmander'] });
    put(s, 'ash', 'active', manectric, ['lightning']);
    ash(s).discard.push({ uid: 'e1', defId: 'fire' }, { uid: 'e2', defId: 'water' });
    const after = attack(s, 0, { ownBenchSlot: 1 });
    expect(after.pendingChoice).toMatchObject({ kind: 'attachFromDiscard', count: 2, target: 1 });
    for (const done of settles(after)) expect(ash(done).bench[0]!.energy).toHaveLength(0);
  });

  it('Hazardous Scales: Asleep, Burned and Poisoned', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', dustox, ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    // Between turns: Burn's 20 and Poison's 10 (the flips may then cure them).
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(30);
  });

  it('Shadow Steal: 50 for each Special Energy card in the opponent\'s discard pile; Plentiful Placement: 4 counters on any of theirs', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', drifblim, ['psychic', 'psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    misty(s).discard.push({ uid: 'd1', defId: id('dce') }, { uid: 'd2', defId: id('dce') }, { uid: 'd3', defId: 'water' });
    expect(misty(attack(s, 0)).active!.damage).toBe(100);
    expect(misty(attack(s, 1, { oppTarget: 0 })).bench[0]!.damage).toBe(40);
  });

  it('Doom Decree: 2 heads Knock Out the Defending Pokémon', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', gothitelle, ['psychic', 'psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    const prizes = ash(s).prizes.length;
    expect(ash(attack(flips(s, true, true), 0)).prizes.length).toBe(prizes - 1);
    expect(misty(attack(flips(s, true, false), 0)).active!.card.defId).toBe('big-Snorlax');
  });

  it('Vortex Chop: 30 more to a Defending Pokémon with Resistance', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', marowak, ['fighting', 'fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    put(s, 'misty', 'active', big('Pidgeot', { resistance: { type: 'grass', amount: 20 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
  });

  it('Reverse Spin: the opponent shuffles their hand into their deck and draws 4', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', baltoy, ['fighting', 'fighting']);
    // They draw 1 more at the start of their turn.
    expect(misty(attack(s, 0)).hand.length).toBe(5);
  });

  it('Rapid Spin: the attacker switches (its player\'s pick), then the opponent switches (theirs)', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', claydol, ['fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    const after = attack(s, 0, { ownBenchSlot: 0 });
    expect(ash(after).bench[0]!.card.defId).toBe('bw6-64');
    expect(misty(after).active!.card.defId).toBe('big-Lapras');
    expect(misty(after).bench[0]!.damage).toBe(30);
  });

  it('Revenge Cannon: 10 more for each damage counter on the player\'s Benched Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander', 'charmander'] });
    put(s, 'ash', 'active', gigalith, ['fighting', 'fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).bench[0]!.damage = 20;
    ash(s).bench[1]!.damage = 30;
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Magnetic Lines: an Energy from the Defending Pokémon to one of the opponent\'s Benched Pokémon, if the player says so', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', probopass, ['bw-metal', 'bw-metal']);
    const d = put(s, 'misty', 'active', big('Snorlax'), ['water']);
    put(s, 'misty', 0, big('Lapras'));
    const after = attack(s, 0, { boost: true, defenderEnergyUid: d.energy[0]!.uid, benchSlot: 0 });
    expect(misty(after).active!.energy).toHaveLength(0);
    expect(misty(after).bench[0]!.energy).toHaveLength(1);
  });

  it('Celestial Roar: the Energy cards among the top 3 attached; Dragon Burst: all of one type discarded, 60 each', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', rayquaza, ['fire', 'fire', 'lightning']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).deck.unshift({ uid: 'top1', defId: 'fire' }, { uid: 'top2', defId: id('charmander') }, { uid: 'top3', defId: 'water' });
    const roar = attack(s, 0);
    expect(ash(roar).active!.energy.map((e) => e.uid)).toEqual(expect.arrayContaining(['top1', 'top3']));
    expect(ash(roar).discard.map((c) => c.uid)).toContain('top2');
    const burst = attack(s, 1, { type: 'fire' });
    expect(misty(burst).active!.damage).toBe(120);
    expect(ash(burst).active!.energy).toHaveLength(1);
  });

  it('Wake-up Beam: every Special Condition off the Defending Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', audino, ['fire', 'fire']);
    const d = put(s, 'misty', 'active', big('Snorlax'));
    d.condition = 'asleep';
    expect(misty(attack(s, 0)).active!.condition).toBeFalsy();
  });
});

describe('Dragons Exalted Abilities', () => {
  it('Garbotoxin: with a Pokémon Tool attached, no other Abilities work (Bouffer), either player\'s', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire', 'fire'] });
    s.cards = { ...s.cards };
    put(s, 'ash', 'active', big('Ursaring', { attacks: [{ name: 'Slash', cost: [C], damage: 50, text: null }] }), ['fire']);
    put(s, 'misty', 'active', bouffalant);
    const g = put(s, 'ash', 0, garbodor);
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    tool(s, g, 'bw6-114', 'Giant Cape');
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it('Garbotoxin stops a used Ability too, and not its own', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hydreigon, ['bw-darkness']);
    put(s, 'ash', 0, big('Lapras'));
    const g = put(s, 'misty', 0, garbodor);
    tool(s, g, 'bw6-114', 'Giant Cape');
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 'active', energyUid: ash(s).active!.energy[0]!.uid, to: 0 } }).ok).toBe(false);
  });

  it('Safeguard: nothing from Pokémon-EX, but Pokémon-ex attack it as usual (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', EXAttacker, ['fire']);
    put(s, 'misty', 'active', sigilyph);
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    put(s, 'ash', 'active', exAttacker, ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Electromagnetic Wall: 3 damage counters on a Pokémon the opponent attaches Energy to from their hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', ampharos);
    const e = hand(s, 'ash', s.cards.fire!);
    const after = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: e, target: 'active' });
    expect(ash(after).active!.damage).toBe(30);
  });

  it('Versatile: the attacks of the opponent\'s Pokémon too', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mew, ['fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax', { attacks: [{ name: 'Body Slam', cost: [C, C], damage: 40, text: null }] }));
    // Replace is its own; Body Slam is the Defending Pokémon's.
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Empty Shell: no Prize card for Shedinja', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', big('Ursaring', { attacks: [{ name: 'Slash', cost: [C], damage: 60, text: null }] }), ['fire']);
    put(s, 'misty', 'active', shedinja);
    const prizes = ash(s).prizes.length;
    expect(ash(attack(s, 0)).prizes.length).toBe(prizes);
  });

  it('Fight Song: 20 more for each Altaria, only for Dragon Pokémon', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'ash', 0, altaria);
    put(s, 'ash', 1, altaria);
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
    put(s, 'ash', 'active', dragon, ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it('Unobservant: no attacks while the opponent\'s Active Pokémon is a Basic Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', slaking, ['fire', 'fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(tryAttack(s, 0).ok).toBe(false);
    put(s, 'misty', 'active', big('Snorlax', { stage: 'stage1' }));
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it('Cast-off Shell: evolving from the hand, a Shedinja from the deck onto the Bench, as the Stage 1 it is', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', nincada);
    s.cards = { ...s.cards, [shedinja.id]: shedinja };
    ash(s).deck.unshift({ uid: 'shed', defId: shedinja.id });
    const card = hand(s, 'ash', ninjask);
    // The one Shedinja in the deck is taken for the player (the same-card rule: searches take the most).
    const after = act(s, 'ash', { type: 'EVOLVE', cardUid: card, target: 'active' });
    const shed = ash(after).bench.find((p) => p?.card.uid === 'shed')!;
    expect(shed).toBeTruthy();
    expect(shed.asBasic).toBeUndefined();
  });

  it('Bright Look and Toppling Wind ask first, as the card evolves from the hand', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    put(s, 'ash', 'active', vulpix);
    let after = act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', ninetales), target: 'active' });
    expect(after.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'brightLook' });
    expect(settles(after).length).toBeGreaterThan(0);
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(misty(after).active!.card.defId).toBe(id('charmander'));
    const t = duel('charmander', 'onix');
    put(t, 'ash', 'active', lairon);
    const deck = misty(t).deck.length;
    const toppled = act(act(t, 'ash', { type: 'EVOLVE', cardUid: hand(t, 'ash', aggron), target: 'active' }), 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(misty(toppled).deck.length).toBe(deck - 3);
  });

  it('Leave It to the Wind: Jumpluff and its cards back into the hand, but never the only Pokémon in play', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', jumpluff, ['grass']);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
    put(s, 'ash', 0, big('Lapras'));
    const size = ash(s).hand.length;
    const after = use(s, 'active');
    expect(ash(after).hand.length).toBe(size + 2);
  });

  it('Dark Trance: Darkness Energy moved as often as the player likes', () => {
    const s = duel('charmander', 'onix');
    const h = put(s, 'ash', 'active', hydreigon, ['bw-darkness', 'bw-darkness']);
    put(s, 'ash', 0, big('Lapras'));
    let after = use(s, 'active', { from: 'active', energyUid: h.energy[0]!.uid, to: 0 });
    after = use(after, 'active', { from: 'active', energyUid: h.energy[1]!.uid, to: 0 });
    expect(ash(after).bench[0]!.energy).toHaveLength(2);
  });

  it('Bouffer: 20 less damage, after Weakness and Resistance', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    put(s, 'misty', 'active', bouffalant);
    expect(misty(attack(s, 1)).active!.damage).toBe(10);
  });
});

describe('Dragons Exalted Trainers and Blend Energy', () => {
  it('Devolution Spray: the top card back into the hand, and no evolving it again this turn', () => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', ninjask);
    p.evolvedFrom = [{ uid: 'nin', defId: nincada.id }];
    s.cards = { ...s.cards, [nincada.id]: nincada };
    const after = play(s, hand(s, 'ash', trainer('bw6-113', 'Devolution Spray')), { target: 'active' });
    expect(ash(after).active!.card.uid).toBe('nin');
    const back = ash(after).hand.find((c) => c.defId === ninjask.id)!;
    expect(applyAction(after, 'ash', { type: 'EVOLVE', cardUid: back.uid, target: 'active' }).ok).toBe(false);
  });

  it('Giant Cape: 20 more HP; Rescue Scarf: Knocked Out by an attack, the Pokémon back into the hand', () => {
    const s = duel('charmander', 'onix', { oppBench: ['charmander'] });
    const p = put(s, 'misty', 'active', big('Pidgey', { hp: 60 }));
    put(s, 'ash', 'active', big('Ursaring', { attacks: [{ name: 'Slash', cost: [C], damage: 70, text: null }] }), ['fire']);
    tool(s, p, 'bw6-114', 'Giant Cape');
    expect(misty(attack(s, 0)).active!.card.uid).toBe(p.card.uid);
    p.attached = [];
    tool(s, p, 'bw6-115', 'Rescue Scarf');
    const after = attack(s, 0);
    expect(misty(after).hand.map((c) => c.uid)).toContain(p.card.uid);
    expect(misty(after).discard.map((c) => c.defId)).toContain('bw6-115');
  });

  it('Tool Scrapper: up to 2 Pokémon Tool cards in play, either player\'s, discarded', () => {
    const s = duel('charmander', 'onix');
    const mine = put(s, 'ash', 'active', big('Lapras'));
    const theirs = put(s, 'misty', 'active', big('Snorlax'));
    tool(s, mine, 'bw6-114', 'Giant Cape');
    tool(s, theirs, 'bw6-115', 'Rescue Scarf');
    const uids = [mine.attached![0]!.card.uid, theirs.attached![0]!.card.uid];
    const after = play(s, hand(s, 'ash', trainer('bw6-116', 'Tool Scrapper')), { discardUids: uids });
    expect(ash(after).active!.attached ?? []).toHaveLength(0);
    expect(misty(after).active!.attached ?? []).toHaveLength(0);
    expect(misty(after).discard.map((c) => c.defId)).toContain('bw6-115');
  });

  it('Blend Energy: any one of its 4 types while attached', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Typhlosion', { attacks: [{ name: 'Flare', cost: [F, P], damage: 40, text: null }] }), ['fire', 'bw6-117']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(tryAttack(s, 0).ok).toBe(true);
    put(s, 'ash', 'active', big('Typhlosion', { attacks: [{ name: 'Flare', cost: [W, P], damage: 40, text: null }] }), ['fire', 'bw6-117']);
    expect(tryAttack(s, 0).ok).toBe(false);
    void retreatCost;
  });
});

describe('Dragons Exalted searches', () => {
  const beautifly = mon('bw6-8', 'Beautifly', G, 110, [['Triple Energy', [G], 0]], { stage: 'stage2' });
  const rufflet = mon('bw6-111', 'Rufflet', C, 60, [['Chirp', [C], 0]]);
  const terrakion = mon('bw6-71', 'Terrakion-EX', FI, 170, [['Pump-up Smash', [FI, FI, C], 90]], { pokemonEX: true });
  const roserade = mon('bw6-15', 'Roserade', G, 90, [['Squeeze', [G, C], 30]], { stage: 'stage1', evolvesFrom: 'Roselia', ...ability('Le Parfum') });
  const roselia = mon('bw6-12', 'Roselia', G, 70, [['Relaxing Fragrance', [G], 0]]);
  const gabite = mon('bw6-89', 'Gabite', DR, 80, [['Dragonslice', [W, FI], 20]], { stage: 'stage1', ...ability('Dragon Call') });

  it('Triple Energy: basic Energy cards of 3 different types, each attached as the player likes', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', beautifly, ['grass']);
    ash(s).deck.unshift({ uid: 'f1', defId: 'fire' }, { uid: 'f2', defId: 'fire' }, { uid: 'w1', defId: 'water' }, { uid: 'g1', defId: 'grass' });
    const after = attack(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromDeck', distinct: 'type', attach: true });
    for (const done of settles(after)) {
      const attached = [ash(done).active!, ash(done).bench[0]!].flatMap((p) => p.energy.map((e) => e.defId));
      expect(attached.filter((d) => d === 'fire').length).toBeLessThanOrEqual(1);
    }
  });

  it('Chirp: Pokémon with Fighting Resistance from the deck', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', rufflet, ['fire']);
    const bird = mon('test-bird', 'Pidgey', C, 50, [], { resistance: { type: 'fighting', amount: 20 } });
    s.cards = { ...s.cards, [bird.id]: bird };
    ash(s).deck.unshift({ uid: 'b1', defId: bird.id }, { uid: 'b2', defId: bird.id });
    // Both are the same card: taken for the player (the same-card rule); the Charmanders aren't options.
    const size = ash(s).hand.length;
    const after = attack(s, 0);
    expect(ash(after).hand.map((c) => c.uid)).toEqual(expect.arrayContaining(['b1', 'b2']));
    expect(ash(after).hand).toHaveLength(size + 2);
  });

  it('Pump-up Smash: 2 basic Energy cards from the hand onto Benched Pokémon only', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', terrakion, ['fighting', 'fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    hand(s, 'ash', s.cards.fire!);
    hand(s, 'ash', s.cards.water!);
    const after = attack(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'attachFromHand', benchOnly: true, count: 2 });
    for (const done of settles(after)) expect(ash(done).active!.energy).toHaveLength(3);
  });

  it('Le Parfum: evolving from the hand, any card from the deck; Dragon Call: a Dragon Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', roselia);
    ash(s).deck.unshift({ uid: 'jun', defId: id('juniper') });
    const after = act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', roserade), target: 'active' });
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'any', optional: true });
    expect(settles(after).length).toBeGreaterThan(0);
    const t = duel('charmander', 'onix');
    put(t, 'ash', 'active', gabite);
    t.cards = { ...t.cards, [dragon.id]: dragon };
    t.players.ash!.deck.unshift({ uid: 'drat', defId: dragon.id });
    expect(ash(use(t, 'active')).hand.map((c) => c.uid)).toContain('drat');
  });

  it('Toppling Wind may be declined', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', lairon);
    const after = act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', aggron), target: 'active' });
    expect(after.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'topplingWind' });
    expect(settles(after).length).toBe(2);
    expect(misty(act(after, 'ash', { type: 'RESOLVE_CHOICE', count: 1 })).deck.length).toBe(misty(s).deck.length);
  });
});
