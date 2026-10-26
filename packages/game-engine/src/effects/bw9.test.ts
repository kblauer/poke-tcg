import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { getPlayerView, inPlayDef, retreatCost, type GameState, type InPlayPokemon, type PlayerState } from '../index.js';
import { act, attack, C, duel, F, flips, G, L, mon, P, settles, W } from './test-kit.js';

// Plasma Freeze (README: Generation 5): its attacks, Abilities and Trainers. The cards are set up here (not in test-kit's
// BY_NAME): `setup` puts them into a duel's library.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const D = 'darkness' as const;
const plasma = { teamPlasma: true };

const LIB: Record<string, CardDef> = {};
const def = <T extends CardDef>(d: T) => ((LIB[d.id] = d), d);
const trainer = (id: string, name: string, extra: object = {}) => def({ id, kind: 'trainer', name, imageUrl: null, text: '', ...extra });

const beedrill = def(mon('bw9-3', 'Beedrill', G, 130, [['Swift Sting', [G], 20]], { stage: 'stage2' }));
const cacturne = def(mon('bw9-10', 'Cacturne', G, 90, [['Payback', [G, C], 30]], { stage: 'stage1' }));
const heatran = def(mon('bw9-13', 'Heatran-EX', F, 180, [['Heat Boiler', [F, C, C], 60], ['Dynamite Press', [F, F, C, C], 80]], { pokemonEX: true, ...plasma }));
const reshiram = def(mon('bw9-17', 'Reshiram', F, 130, [['Fusion Flare', [F, C, C, C], 80]]));
const zekrom = def(mon('bw9-39', 'Zekrom', L, 130, [['Fusion Bolt', [L, C, C, C], 80]]));
const zekromEX = def(mon('bw4-51', 'Zekrom-EX', L, 180, [], { pokemonEX: true }));
const chandelure = def(mon('bw9-16', 'Chandelure', F, 130, [], { stage: 'stage2', power: { name: 'Flare Navigate', text: '' } }));
const quagsire = def(mon('bw9-22', 'Quagsire', W, 100, [], { stage: 'stage1', power: { name: 'Laid-Back', text: '' } }));
const glaceon = def(mon('bw9-23', 'Glaceon', W, 100, [], { stage: 'stage1', power: { name: 'Freeze Zone', text: '' }, ...plasma }));
const electrode = def(mon('bw9-33', 'Electrode', L, 90, [['Tackle', [C], 30]], { stage: 'stage1', power: { name: 'Magnetic Draw', text: '' } }));
const thundurus = def(mon('bw9-38', 'Thundurus-EX', L, 170, [['Raiden Knuckle', [L], 30], ['Thunderous Noise', [L, L, C, C], 90]], { pokemonEX: true, ...plasma }));
const grimer = def(mon('bw9-45', 'Grimer', P, 70, [['Lure Poison', [P], 0]]));
const mrMime = def(mon('bw9-47', 'Mr. Mime', P, 70, [], { power: { name: 'Bench Barrier', text: '' } }));
const espeon = def(mon('bw9-48', 'Espeon', P, 90, [['Shadow Ball', [P], 0]], { stage: 'stage1' }));
const metagross = def(mon('bw9-52', 'Metagross', 'metal', 140, [], { stage: 'stage2', power: { name: 'Plasma Search', text: '' }, ...plasma }));
const deoxys = def(mon('bw9-53', 'Deoxys-EX', P, 170, [['Helix Force', [P, C], 30]], { pokemonEX: true, power: { name: 'Power Connect', text: '' }, ...plasma }));
const cofagrigus = def(mon('bw9-56', 'Cofagrigus', P, 100, [], { stage: 'stage1', power: { name: 'Six Feet Under', text: '' }, ...plasma }));
const umbreon = def(mon('bw9-64', 'Umbreon', D, 100, [], { stage: 'stage1', power: { name: 'Dark Shade', text: '' }, ...plasma }));
const weavile = def(mon('bw9-66', 'Weavile', D, 90, [['Vilify', [D, C], 0]], { stage: 'stage1', ...plasma }));
const hydreigon = def(mon('bw9-78', 'Hydreigon', D, 150, [['Tractorbeam', [D, C, C], 0], ['Obsidian Fang', [D, C, C, C], 80]], { stage: 'stage2' }));
const kingdra = def(mon('bw9-84', 'Kingdra', 'dragon', 140, [['Dragon Vortex', [C], 0]], { stage: 'stage2' }));
const latias = def(mon('bw9-85', 'Latias-EX', 'dragon', 170, [], { pokemonEX: true, power: { name: 'Bright Down', text: '' } }));
const raticate = def(mon('bw9-88', 'Raticate', C, 80, [['Transfer Junk', [C], 0]], { stage: 'stage1', ...plasma }));
const miltank = def(mon('bw9-93', 'Miltank', C, 100, [['Max Milk', [C, C], 0]]));
const kecleon = def(mon('bw9-94', 'Kecleon', C, 90, [], { power: { name: 'Color Change', text: '' } }));
const staraptor = def(mon('bw9-97', 'Staraptor', C, 140, [['Strong Breeze', [C, C, C, C], 0]], { stage: 'stage2' }));
const tornadus = def(mon('bw9-98', 'Tornadus-EX', C, 170, [['Windfall', [C], 0], ['Jet Blast', [C, C, C, C], 60]], { pokemonEX: true, ...plasma }));
const target = def(mon('test-target', 'Target', W, 200, [], { weakness: { type: P, multiplier: 2 } }));
const weak = def(mon('test-weak', 'Weak', W, 60, []));
const heavy = def(mon('test-heavy', 'Heavy', F, 100, [], { retreatCost: 2 }));
const heavyPlasma = def(mon('test-heavy-plasma', 'Heavy Plasma', F, 100, [], { retreatCost: 2, ...plasma }));
const floatStone = trainer('bw9-99', 'Float Stone');
const frozenCity = trainer('bw9-100', 'Frozen City', plasma);
const ghetsis = trainer('bw9-101', 'Ghetsis', plasma);
const shadowTriad = trainer('bw9-102', 'Shadow Triad', plasma);
const badge = trainer('bw9-104', 'Team Plasma Badge', plasma);
const plasmaBall = trainer('bw9-105', 'Team Plasma Ball', plasma);
const lifeDew = trainer('bw9-107', 'Life Dew', { aceSpec: true });
const rockGuard = trainer('bw9-108', 'Rock Guard', { aceSpec: true });
const potion = trainer('bw1-100', 'Potion');
const darkEnergy = def({ id: 'dark', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' });
const plasmaEnergy = def({ id: 'bw8-127', kind: 'energy', name: 'Plasma Energy', imageUrl: null, energyType: 'colorless', basic: false, ...plasma });

let n = 0;
const card = (d: CardDef) => ({ uid: `${d.id}-${n++}`, defId: d.id });
const poke = (d: PokemonCardDef, energy: string[] = []): InPlayPokemon => ({ card: card(d), evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 });
/** Ash's `attacker` against Misty's `defender`, with these cards in the library. */
function setup(attacker: PokemonCardDef, defender: PokemonCardDef, opts: { energy?: string[]; bench?: PokemonCardDef[]; oppBench?: PokemonCardDef[] } = {}): GameState {
  const s = duel('charmander', 'charmander');
  s.cards = { ...s.cards, ...LIB };
  ash(s).active = poke(attacker, opts.energy);
  misty(s).active = poke(defender);
  (opts.bench ?? []).forEach((d, i) => (ash(s).bench[i] = poke(d)));
  (opts.oppBench ?? []).forEach((d, i) => (misty(s).bench[i] = poke(d)));
  return s;
}
const hand = (p: PlayerState, d: CardDef) => {
  const c = card(d);
  p.hand.push(c);
  return c.uid;
};
const use = (s: GameState, source: 'active' | number, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const play = (s: GameState, cardUid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });
const tool = (p: InPlayPokemon, d: CardDef) => (p.attached ??= []).push({ card: card(d), until: Number.MAX_SAFE_INTEGER, tool: true });

describe('attacks', () => {
  it('Swift Sting: with full HP, 40 more, Confused and Poisoned; with damage, 20', () => {
    const s = setup(beedrill, target, { energy: ['grass'] });
    const full = misty(attack(s, 0)).active!;
    // 60, and Poison's 10 between turns.
    expect(full).toMatchObject({ damage: 70, condition: 'confused' });
    expect(full.poison).toBeGreaterThan(0);
    ash(s).active!.damage = 10;
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Payback: at 1 Prize card left, 60 more and an Energy of the Defending Pokémon\'s discarded', () => {
    const s = setup(cacturne, target, { energy: ['grass', 'grass'] });
    misty(s).active!.energy.push({ uid: 'w', defId: 'water' });
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    ash(s).prizes = []; // whose Prize cards it counts: the opponent's
    misty(s).prizes = misty(s).prizes.slice(0, 1);
    const after = attack(s, 0);
    expect(misty(after).active).toMatchObject({ damage: 90, energy: [] });
  });

  it('Heat Boiler: 60 more with a Special Condition; Dynamite Press: with Plasma Energy, 10 more for each damage counter', () => {
    const s = setup(heatran, target, { energy: ['fire', 'fire', 'fire', 'bw8-127'] });
    ash(s).active!.condition = 'confused';
    expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(120);
    ash(s).active!.condition = null;
    misty(s).active!.damage = 30;
    expect(misty(attack(s, 1)).active!.damage).toBe(30 + 110);
    ash(s).active!.energy.pop();
    ash(s).active!.energy.push({ uid: 'f4', defId: 'fire' });
    expect(misty(attack(s, 1)).active!.damage).toBe(30 + 80);
  });

  it('Fusion Flare: 40 more with Zekrom on the Bench, not Zekrom-EX', () => {
    const s = setup(reshiram, target, { energy: ['fire', 'fire', 'fire', 'fire'], bench: [zekromEX] });
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
    ash(s).bench[1] = poke(zekrom);
    expect(misty(attack(s, 0)).active!.damage).toBe(120);
  });

  it('Raiden Knuckle: an Energy card from the discard pile onto a Benched Team Plasma Pokémon', () => {
    const s = setup(thundurus, target, { energy: ['lightning'], bench: [reshiram, deoxys] });
    ash(s).discard.push({ uid: 'disc-w', defId: 'water' });
    const after = attack(s, 0, { discardUids: ['disc-w'], ownBenchSlot: 1 });
    expect(ash(after).bench[1]!.energy.map((e) => e.uid)).toEqual(['disc-w']);
    expect(() => attack(s, 0, { discardUids: ['disc-w'], ownBenchSlot: 0 })).toThrow();
  });

  it('Lure Poison: heads, the Benched Pokémon picked is switched in and Poisoned', () => {
    const s = setup(grimer, target, { energy: ['psychic'], oppBench: [espeon] });
    const after = attack(flips(s, true), 0, { benchSlot: 0 });
    expect(inPlayDef(after.cards, misty(after).active!).name).toBe('Espeon');
    expect(misty(after).active!.poison).toBeGreaterThan(0);
    expect(misty(attack(flips(s, false), 0, { benchSlot: 0 })).active!.card.defId).toBe('test-target');
  });

  it('Shadow Ball: 40 to a Benched Pokémon with its Weakness; Bench Barrier keeps it off', () => {
    const s = setup(espeon, target, { energy: ['psychic'], oppBench: [target] });
    expect(misty(attack(s, 0, { oppTarget: 0 })).bench[0]!.damage).toBe(80);
    misty(s).bench[1] = poke(mrMime);
    expect(misty(attack(s, 0, { oppTarget: 0 })).bench[0]!.damage).toBe(0);
  });

  it('Vilify: 30 for each Pokémon discarded from the hand, picked after the attack', () => {
    const s = setup(weavile, target, { energy: ['dark', 'fire'] });
    ash(s).hand = [];
    hand(ash(s), reshiram);
    hand(ash(s), zekrom);
    hand(ash(s), potion);
    const after = attack(s, 0, { amount: 2 });
    expect(misty(after).active!.damage).toBe(60);
    for (const done of settles(after)) expect(ash(done).discard.filter((c) => c.defId === 'bw9-17' || c.defId === 'bw9-39')).toHaveLength(2);
  });

  it('Tractorbeam: the Benched Pokémon picked is switched in and takes 40; Obsidian Fang discards Pokémon Tools first', () => {
    const s = setup(hydreigon, target, { energy: ['dark', 'fire', 'fire', 'fire'], oppBench: [espeon] });
    const pulled = attack(s, 0, { benchSlot: 0 });
    expect(misty(pulled).active).toMatchObject({ damage: 40, card: { defId: 'bw9-48' } });
    tool(misty(s).active!, floatStone);
    const fanged = attack(s, 1);
    expect(misty(fanged).active!.attached).toEqual([]);
    expect(misty(fanged).discard.some((c) => c.defId === 'bw9-99')).toBe(true);
  });

  it('Dragon Vortex: 20 for each Water and Lightning Energy card in the discard pile, then shuffled into the deck', () => {
    const s = setup(kingdra, target, { energy: ['water'] });
    ash(s).discard.push({ uid: 'a', defId: 'water' }, { uid: 'b', defId: 'lightning' }, { uid: 'c', defId: 'fire' });
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(40);
    expect(ash(after).discard.map((c) => c.uid)).toEqual(['c']);
    expect(ash(after).deck.some((c) => c.uid === 'a')).toBe(true);
  });

  it('Transfer Junk: one Team Plasma card of each kind from the discard pile', () => {
    const s = setup(raticate, target, { energy: ['fire'] });
    ash(s).discard.push({ uid: 'p1', defId: 'bw9-66' }, { uid: 'p2', defId: 'bw9-88' }, { uid: 't1', defId: 'bw9-105' }, { uid: 'e1', defId: 'bw8-127' }, { uid: 'x', defId: 'bw9-17' });
    const after = attack(s, 0, { discardUids: ['p1', 'p2', 't1'] });
    expect(ash(after).hand.map((c) => c.uid).filter((u) => ['p1', 'p2', 't1', 'e1'].includes(u))).toEqual(['p1', 't1']);
  });

  it('Max Milk: every damage counter off one of the player\'s Pokémon, then Miltank\'s Energy discarded', () => {
    const s = setup(miltank, target, { energy: ['fire', 'fire'], bench: [reshiram] });
    ash(s).bench[0]!.damage = 70;
    const after = attack(s, 0, { ownTarget: 0 });
    expect(ash(after).bench[0]!.damage).toBe(0);
    expect(ash(after).active!.energy).toEqual([]);
  });

  it('Strong Breeze: the Defending Pokémon and its cards shuffled into the opponent\'s deck', () => {
    const s = setup(staraptor, target, { energy: ['fire', 'fire', 'fire', 'fire'], oppBench: [espeon] });
    const deck = misty(s).deck.length;
    const after = attack(s, 0);
    expect(misty(after).active).toBeNull();
    expect(misty(after).deck.length).toBe(deck + 1);
  });

  it('Windfall: the hand shuffled into the deck, 6 drawn; Jet Blast: 30 more for each Plasma Energy', () => {
    const s = setup(tornadus, target, { energy: ['fire', 'fire', 'bw8-127', 'bw8-127'] });
    expect(ash(attack(s, 0)).hand).toHaveLength(6);
    expect(misty(attack(s, 1)).active!.damage).toBe(120);
  });
});

describe('Abilities', () => {
  it('Flare Navigate: a Fire Energy card from the deck onto a Pokémon, which takes a damage counter', () => {
    const s = setup(chandelure, target, { bench: [reshiram] });
    ash(s).deck.unshift({ uid: 'deck-fire', defId: 'fire' });
    const asked = use(s, 'active');
    expect(settles(asked).length).toBeGreaterThan(0);
    // The only Fire Energy card is taken at once (the same-card rule); then where it goes.
    const after = act(asked, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(ash(after).bench[0]).toMatchObject({ damage: 10, energy: [{ uid: 'deck-fire' }] });
  });

  it('Laid-Back: 20 less damage from attacks', () => {
    const s = setup(reshiram, quagsire, { energy: ['fire', 'fire', 'fire', 'fire'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Freeze Zone: Team Plasma Pokémon (Team Plasma Badge too) retreat for 2 less', () => {
    const s = setup(heavyPlasma, target, { bench: [glaceon, heavy] });
    const cost = (p: InPlayPokemon) => retreatCost(p, s.cards, [ash(s), misty(s)]);
    expect(cost(ash(s).active!)).toBe(0);
    expect(cost(ash(s).bench[1]!)).toBe(2);
    tool(ash(s).bench[1]!, badge);
    expect(cost(ash(s).bench[1]!)).toBe(0);
  });

  it('Magnetic Draw: cards drawn until the hand has 4, once a turn', () => {
    const s = setup(electrode, target);
    ash(s).hand = [];
    const after = use(s, 'active');
    expect(ash(after).hand).toHaveLength(4);
    ash(after).hand.pop();
    expect(() => use(after, 'active')).toThrow();
  });

  it('Plasma Search: a Team Plasma card from the deck, once a turn whichever Metagross', () => {
    const s = setup(metagross, target, { bench: [metagross] });
    ash(s).deck.unshift({ uid: 'ball', defId: 'bw9-105' }, { uid: 'nope', defId: 'bw1-100' });
    // The only Team Plasma card is taken at once (the same-card rule).
    const after = use(s, 'active');
    expect(ash(after).hand.map((c) => c.uid)).toContain('ball');
    expect(ash(after).hand.map((c) => c.uid)).not.toContain('nope');
    expect(() => use(after, 0)).toThrow();
  });

  it('Power Connect: 10 more from the player\'s Team Plasma Pokémon but Deoxys-EX', () => {
    const s = setup(thundurus, target, { energy: ['lightning'], bench: [deoxys] });
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    const own = setup(deoxys, weak, { energy: ['psychic', 'fire'], bench: [deoxys] });
    expect(misty(attack(own, 0)).active!.damage).toBe(30);
  });

  it('Six Feet Under: Cofagrigus Knocked Out, then 3 damage counters on the opponent\'s Pokémon', () => {
    const s = setup(reshiram, target, { bench: [cofagrigus] });
    const prizes = misty(s).prizes.length;
    const asked = use(s, 0);
    expect(ash(asked).bench[0]).toBeNull();
    expect(misty(asked).prizes.length).toBe(prizes - 1);
    let after = asked;
    for (let i = 0; i < 3; i++) after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(misty(after).active!.damage).toBe(30);
  });

  it('Dark Shade: 20 more HP for the player\'s Team Plasma Pokémon', () => {
    const s = setup(reshiram, target, { bench: [umbreon, deoxys] });
    const after = act(s, 'ash', { type: 'END_TURN' });
    expect(inPlayDef(after.cards, ash(after).bench[1]!).hp).toBe(190);
    expect(inPlayDef(after.cards, ash(after).active!).hp).toBe(130);
  });

  it('Bright Down: nothing from the opponent\'s Pokémon with Abilities', () => {
    const s = setup(electrode, latias, { energy: ['lightning'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    const plain = setup(reshiram, latias, { energy: ['fire', 'fire', 'fire', 'fire'] });
    expect(misty(attack(plain, 0)).active!.damage).toBe(80);
  });

  it('Color Change: as the Active Pokémon, the type of the opponent\'s Active Pokémon', () => {
    const s = setup(kecleon, target);
    const after = act(s, 'ash', { type: 'END_TURN' });
    expect(inPlayDef(after.cards, ash(after).active!).type).toBe('water');
  });
});

describe('Trainers', () => {
  it('Float Stone: no Retreat Cost', () => {
    const s = setup(heavy, target);
    tool(ash(s).active!, floatStone);
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(0);
  });

  it('Frozen City: 2 damage counters on a Pokémon that isn\'t Team Plasma an Energy card is attached to from the hand', () => {
    const s = setup(reshiram, target, { bench: [deoxys] });
    s.stadium = { card: card(frozenCity), owner: 'ash' };
    const fire = hand(ash(s), { id: 'fire' } as CardDef);
    const after = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: fire, target: 'active' });
    expect(ash(after).active!.damage).toBe(20);
    const other = hand(ash(s), { id: 'fire' } as CardDef);
    expect(ash(act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: other, target: 0 })).bench[0]!.damage).toBe(0);
  });

  it('Ghetsis: the opponent\'s Item cards shuffled into their deck, a card drawn for each', () => {
    const s = setup(reshiram, target);
    misty(s).hand = [card(potion), card(floatStone), card(ghetsis), card(reshiram)];
    const mine = ash(s).hand.length;
    const after = play(s, hand(ash(s), ghetsis));
    expect(misty(after).hand.map((c) => c.defId).sort()).toEqual(['bw9-101', 'bw9-17']);
    expect(ash(after).hand.length).toBe(mine + 2);
  });

  it('Shadow Triad: a Team Plasma card from the discard pile; Team Plasma Ball: a Team Plasma Pokémon from the deck', () => {
    const s = setup(reshiram, target);
    ash(s).discard.push({ uid: 'px', defId: 'bw8-127' }, { uid: 'no', defId: 'fire' });
    // The only Team Plasma card (not Shadow Triad itself) is taken at once (the same-card rule).
    const triad = play(s, hand(ash(s), shadowTriad));
    expect(ash(triad).hand.map((c) => c.uid)).toContain('px');
    expect(ash(triad).discard.map((c) => c.uid)).toContain('no');
    ash(s).deck.unshift({ uid: 'dx', defId: 'bw9-53' }, { uid: 'rx', defId: 'bw9-17' });
    const ball = play(s, hand(ash(s), plasmaBall));
    expect(ash(ball).hand.map((c) => c.uid)).toContain('dx');
    expect(ash(ball).hand.map((c) => c.uid)).not.toContain('rx');
  });

  it('Life Dew: 1 Prize card fewer; Rock Guard: 6 damage counters on the attacker', () => {
    const s = setup(reshiram, weak, { energy: ['fire', 'fire', 'fire', 'fire'] });
    const prizes = ash(s).prizes.length;
    tool(misty(s).active!, lifeDew);
    misty(s).bench[0] = poke(espeon);
    expect(ash(attack(s, 0)).prizes.length).toBe(prizes);
    misty(s).active!.attached = [];
    tool(misty(s).active!, rockGuard);
    expect(ash(attack(s, 0)).active!.damage).toBe(60);
  });
});
