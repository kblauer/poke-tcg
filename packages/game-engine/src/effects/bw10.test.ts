import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, getPlayerView, usableAttacks, type GameState, type InPlayPokemon, type PlayerState } from '../index.js';
import { act, attack, C, duel, F, FI, flips, G, L, mon, P, settles, W } from './test-kit.js';

// Plasma Blast (README: Generation 5): its attacks, Abilities and Trainers. The cards are set up here (not in test-kit's
// BY_NAME): `setup` puts them into a duel's library.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const M = 'metal' as const;
const D = 'darkness' as const;
const plasma = { teamPlasma: true };

const LIB: Record<string, CardDef> = {};
const def = <T extends CardDef>(d: T) => ((LIB[d.id] = d), d);
const trainer = (id: string, name: string, extra: object = {}) => def({ id, kind: 'trainer', name, imageUrl: null, text: '', ...extra });

const masquerain = def(mon('bw10-2', 'Masquerain', G, 90, [], { stage: 'stage1', power: { name: 'Tool Reversal', text: '' } }));
const cradily = def(mon('bw10-4', 'Cradily', G, 130, [['Lifesplosion', [G], 0]], { stage: 'stage1' }));
const accelgor = def(mon('bw10-8', 'Accelgor', G, 90, [['Retribution', [C], 20]], { stage: 'stage1' }));
const virizion = def(mon('bw10-9', 'Virizion-EX', G, 170, [['Emerald Slash', [G, C], 50]], { pokemonEX: true, power: { name: 'Verdant Wind', text: '' } }));
const genesect = def(mon('bw10-11', 'Genesect-EX', G, 170, [['Megalo Cannon', [G, G, C], 100]], { pokemonEX: true, power: { name: 'Red Signal', text: '' }, ...plasma }));
const volcarona = def(mon('bw10-13', 'Volcarona', F, 100, [['Solar Transporter', [C], 0]], { stage: 'stage1', ...plasma }));
const suicune = def(mon('bw10-20', 'Suicune', W, 100, [], { power: { name: 'Safeguard', text: '' } }));
const glalie = def(mon('bw10-22', 'Glalie', W, 100, [['Reflect Energy', [W, C, C], 60]], { stage: 'stage1' }));
const froslass = def(mon('bw10-23', 'Froslass', W, 80, [], { stage: 'stage1', power: { name: 'Cursed Glare', text: '' } }));
const relicanth = def(mon('bw10-24', 'Relicanth', W, 90, [['Fossil Hunt', [C], 0]]));
const carracosta = def(mon('bw10-28', 'Carracosta', W, 140, [['Fossil Clutch', [W, C, C], 50]], { stage: 'stage1' }));
const eelektross = def(mon('bw10-33', 'Eelektross', L, 140, [['Crush and Burn', [L, C], 0]], { stage: 'stage2' }));
const drifblim = def(mon('bw10-35', 'Drifblim', P, 100, [['Gust', [P, C, C], 60]], { stage: 'stage1', power: { name: 'Drifting Balloon', text: '' } }));
const mesprit = def(mon('bw10-37', 'Mesprit', P, 70, [], { power: { name: 'Mental Shroud', text: '' } }));
const uxie = def(mon('test-uxie', 'Uxie', P, 70, []));
const azelfPlain = def(mon('test-azelf', 'Azelf', P, 70, []));
const azelf = def(mon('bw10-38', 'Azelf', P, 70, [['Psyjamming', [P, C, C], 0]]));
const musharna = def(mon('bw10-40', 'Musharna', P, 90, [['Precognitive Dream', [P], 0]], { stage: 'stage1' }));
const golurk = def(mon('bw10-46', 'Golurk', P, 130, [['Iron Fist of Justice', [C, C], 60]], { stage: 'stage1' }));
const machoke = def(mon('bw10-48', 'Machoke', FI, 90, [['Last-Chance Chop', [C], 20]], { stage: 'stage1' }));
const machamp = def(mon('bw10-49', 'Machamp', FI, 150, [['Close Combat', [FI, C, C, C], 120]], { stage: 'stage2', power: { name: 'Badge of Discipline', text: '' } }));
const throh = def(mon('bw10-51', 'Throh', FI, 110, [['Shoulder Throw', [FI, C, C], 0]]));
const sawk = def(mon('bw10-52', 'Sawk', FI, 100, [['Kick of Righteousness', [C], 10]]));
const archeops = def(mon('bw10-54', 'Archeops', FI, 130, [['Swift Dive', [FI, FI], 100]], { stage: 'stage1' }));
const houndoom = def(mon('bw10-56', 'Houndoom', D, 100, [['Blazing Claws', [D, C, C], 60]], { stage: 'stage1' }));
const jirachi = def(mon('bw10-60', 'Jirachi-EX', M, 90, [], { pokemonEX: true, power: { name: 'Stellar Guidance', text: '' } }));
const shelgon = def(mon('test-shelgon', 'Shelgon', 'dragon', 80, [], { stage: 'stage1' }));
const salamence = def(mon('bw10-64', 'Salamence', 'dragon', 140, [['Gaia Crush', [F, W, C, C], 100]], { stage: 'stage2', evolvesFrom: 'Shelgon', power: { name: 'Breakwing', text: '' } }));
const dialga = def(mon('bw10-65', 'Dialga-EX', M, 180, [['Reverse Edge', [P, M, C], 50], ['Fast Forward', [C, C, C, C], 90]], { pokemonEX: true, ...plasma }));
const palkia = def(mon('bw10-66', 'Palkia-EX', W, 180, [['Dimension Heal', [G, W, C, C], 80]], { pokemonEX: true, ...plasma }));
const haxorus = def(mon('bw10-69', 'Haxorus', 'dragon', 140, [['Dragonaxe', [M], 0], ['Strike of the Champion', [FI, M], 0]], { stage: 'stage2' }));
const porygonZ = def(mon('bw10-74', 'Porygon-Z', C, 130, [], { stage: 'stage2', power: { name: 'Plasma Transfer', text: '' }, ...plasma }));
const chatot = def(mon('bw10-77', 'Chatot', C, 70, [['Misinformation', [C], 0]]));
const escavalier = def(mon('test-escavalier', 'Escavalier', M, 60, []));
const stage2 = def(mon('test-stage2', 'Big One', G, 150, [], { stage: 'stage2', evolvesFrom: 'Middle One' }));
const target = def(mon('test-target', 'Target', W, 200, []));
const big = def(mon('test-big', 'Big', W, 300, []));
const plasmaMon = def(mon('test-plasma', 'Plasma Mon', W, 200, [], { ...plasma, retreatCost: 2 }));
const resistant = def(mon('test-resist', 'Resistant', W, 200, [], { resistance: { type: FI, amount: 20 } }));
const caitlin = trainer('bw10-78', 'Caitlin');
const iris = trainer('bw10-81', 'Iris');
const plumeFossil = trainer('bw10-82', 'Plume Fossil');
const reversal = trainer('bw10-86', 'Reversal Trigger', plasma);
const bangle = trainer('bw10-88', 'Silver Bangle');
const mirror = trainer('bw10-89', 'Silver Mirror');
const gBooster = trainer('bw10-92', 'G Booster', { aceSpec: true, ...plasma });
const gScope = trainer('bw10-93', 'G Scope', { aceSpec: true, ...plasma });
const masterBall = trainer('bw10-94', 'Master Ball', { aceSpec: true });
const cyclone = trainer('bw10-95', 'Scoop Up Cyclone', { aceSpec: true });
const stadium = trainer('bw10-test-stadium', 'Some Stadium');
const supporter = trainer('bw1-101', 'Professor Juniper');
def({ id: 'bw8-127', kind: 'energy', name: 'Plasma Energy', imageUrl: null, energyType: 'colorless', basic: false, ...plasma });
def({ id: 'mtl', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' });
def({ id: 'drk', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' });

let n = 0;
const card = (d: CardDef | { id: string }) => ({ uid: `${d.id}-${n++}`, defId: d.id });
const poke = (d: PokemonCardDef, energy: string[] = []): InPlayPokemon => ({ card: card(d), evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 });
function setup(attacker: PokemonCardDef, defender: PokemonCardDef, opts: { energy?: string[]; bench?: PokemonCardDef[]; oppBench?: PokemonCardDef[] } = {}): GameState {
  const s = duel('charmander', 'charmander');
  s.cards = { ...s.cards, ...LIB };
  ash(s).active = poke(attacker, opts.energy);
  misty(s).active = poke(defender);
  (opts.bench ?? []).forEach((d, i) => (ash(s).bench[i] = poke(d)));
  (opts.oppBench ?? []).forEach((d, i) => (misty(s).bench[i] = poke(d)));
  return s;
}
const hand = (p: PlayerState, d: CardDef | { id: string }) => {
  const c = card(d);
  p.hand.push(c);
  return c.uid;
};
const use = (s: GameState, source: 'active' | number, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const play = (s: GameState, cardUid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });
const tool = (p: InPlayPokemon, d: CardDef) => (p.attached ??= []).push({ card: card(d), until: Number.MAX_SAFE_INTEGER, tool: true });
const options = (s: GameState) => (getPlayerView(s, 'ash').self.pendingChoice as { options: ({ uid: string } | number | string)[] }).options;

describe('attacks', () => {
  it('Lifesplosion: a Stage 2 Pokémon from the deck onto the Bench for each Energy attached', () => {
    const s = setup(cradily, target, { energy: ['grass', 'grass'] });
    ash(s).deck.unshift(card(stage2), card(stage2), card(stage2));
    // Every Stage 2 card in the deck is the same card: they're taken at once (the same-card rule).
    const after = attack(s, 0);
    expect(ash(after).bench.filter((p) => p?.card.defId === 'test-stage2')).toHaveLength(2);
  });

  it('Retribution: after an Escavalier was Knocked Out by the opponent\'s attack last turn, the Defending Pokémon\'s Energy into their hand', () => {
    const s = setup(accelgor, target, { energy: ['grass'], bench: [escavalier] });
    // Misty's turn: her attack Knocks Out the Escavalier switched in.
    const theirs = structuredClone(s);
    theirs.currentPlayer = 'misty';
    misty(theirs).active = poke(sawk, ['fighting']);
    [ash(theirs).active, ash(theirs).bench[0]] = [ash(theirs).bench[0]!, ash(theirs).active];
    ash(theirs).active!.damage = 50;
    const ko = act(theirs, 'misty', { type: 'ATTACK', attackIndex: 0 });
    expect(ash(ko).knockedOutByAttackNames).toEqual(['Escavalier']);
    misty(s).active!.energy.push({ uid: 'w1', defId: 'water' });
    ash(s).knockedOutByAttack = s.turn - 1;
    ash(s).knockedOutByAttackNames = ['Escavalier'];
    const after = attack(s, 0);
    expect(misty(after).active!.energy).toEqual([]);
    expect(misty(after).hand.some((c) => c.uid === 'w1')).toBe(true);
  });

  it('Emerald Slash: Grass Energy cards from the deck onto a Benched Pokémon', () => {
    const s = setup(virizion, target, { energy: ['grass', 'grass'], bench: [suicune] });
    ash(s).deck.unshift({ uid: 'g1', defId: 'grass' }, { uid: 'g2', defId: 'grass' });
    const after = attack(s, 0);
    expect(settles(after).some((d) => ash(d).bench[0]!.energy.length === 2)).toBe(true);
  });

  it('Solar Transporter: the Team Plasma cards among the top 5 into the hand, the rest discarded', () => {
    const s = setup(volcarona, target, { energy: ['fire'] });
    ash(s).deck.unshift({ uid: 'p1', defId: 'bw8-127' }, { uid: 'x1', defId: 'fire' });
    const after = attack(s, 0);
    expect(ash(after).hand.some((c) => c.uid === 'p1')).toBe(true);
    expect(ash(after).discard.some((c) => c.uid === 'x1')).toBe(true);
  });

  it('Reflect Energy: a Water Energy from Glalie to a Benched Pokémon', () => {
    const s = setup(glalie, target, { energy: ['water', 'fire', 'fire'], bench: [suicune] });
    const water = ash(s).active!.energy[0]!.uid;
    const after = attack(s, 0, { energyUids: [water], ownBenchSlot: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual([water]);
  });

  it('Fossil Hunt: 2 Fossil Item cards from the discard pile; Fossil Clutch: 50 more for discarding one from the hand', () => {
    const s = setup(relicanth, target, { energy: ['water'] });
    ash(s).discard.push(card(plumeFossil), card(plumeFossil), card(caitlin));
    const uids = ash(s).discard.filter((c) => c.defId === 'bw10-82').map((c) => c.uid);
    expect(ash(attack(s, 0, { discardUids: uids })).hand.filter((c) => c.defId === 'bw10-82')).toHaveLength(2);
    const c = setup(carracosta, target, { energy: ['water', 'water', 'water'] });
    hand(ash(c), plumeFossil);
    expect(misty(attack(c, 0, { amount: 0 })).active!.damage).toBe(100);
    expect(misty(attack(c, 0, { amount: -1 })).active!.damage).toBe(50);
  });

  it('Crush and Burn: 30 for each Energy card discarded from the player\'s Pokémon', () => {
    const s = setup(eelektross, target, { energy: ['lightning', 'fire'], bench: [suicune] });
    ash(s).bench[0]!.energy.push({ uid: 'b1', defId: 'water' });
    const after = attack(s, 0, { energyUids: ['b1', ash(s).active!.energy[1]!.uid] });
    expect(misty(after).active!.damage).toBe(60);
    expect(ash(after).bench[0]!.energy).toEqual([]);
  });

  it('Psyjamming: the opponent\'s Special Energy moved between their Pokémon as the player likes', () => {
    const s = setup(azelf, target, { energy: ['psychic', 'fire', 'fire'], oppBench: [suicune] });
    misty(s).active!.energy.push({ uid: 'pe', defId: 'bw8-127' }, { uid: 'bw', defId: 'water' });
    const asked = attack(s, 0);
    expect(options(asked).map((c) => (c as { uid: string }).uid)).toEqual(['pe']);
    expect(settles(asked).length).toBeGreaterThan(0);
    let after = act(asked, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'pe' });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(misty(after).bench[0]!.energy.map((e) => e.uid)).toEqual(['pe']);
  });

  it('Precognitive Dream: 3 cards drawn, then Musharna is Asleep', () => {
    const s = setup(musharna, target, { energy: ['psychic'] });
    const before = ash(s).hand.length;
    const after = attack(s, 0);
    expect(ash(after).hand.length).toBeGreaterThanOrEqual(before + 3);
  });

  it('Iron Fist of Justice: nothing with a Team Plasma Pokémon in play', () => {
    const s = setup(golurk, target, { energy: ['fire', 'fire'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    ash(s).bench[0] = poke(porygonZ);
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Last-Chance Chop, Swift Dive, Shoulder Throw, Kick of Righteousness, Blazing Claws', () => {
    const chop = setup(machoke, target, { energy: ['fire'] });
    ash(chop).active!.damage = 80;
    expect(misty(attack(chop, 0)).active!.damage).toBe(90);
    const dive = setup(archeops, target, { energy: ['fighting', 'fighting'] });
    ash(dive).active!.damage = 80;
    expect(misty(attack(dive, 0)).active!.damage).toBe(50);
    const thrown = setup(throh, plasmaMon, { energy: ['fighting', 'fire', 'fire'] });
    expect(misty(attack(thrown, 0)).active!.damage).toBe(40);
    expect(misty(attack(setup(sawk, plasmaMon, { energy: ['fire'] }), 0)).active!.damage).toBe(50);
    // Burned, then 20 between turns (the flip after it tails).
    const claws = misty(attack(flips(setup(houndoom, plasmaMon, { energy: ['drk', 'fire', 'fire'] }), false), 0)).active!;
    expect(claws).toMatchObject({ damage: 120 + 20, burned: true });
  });

  it('Close Combat: tails, 30 more damage to Machamp next turn', () => {
    const s = setup(machamp, target, { energy: ['fighting', 'fire', 'fire', 'fire'] });
    expect(ash(attack(flips(s, false), 0)).active!.effects?.takeMore).toEqual({ amount: 30, until: s.turn + 1 });
    expect(ash(attack(flips(s, true), 0)).active!.effects?.takeMore).toBeUndefined();
  });

  it('Gaia Crush: the Stadium discarded; Fast Forward: a card of the opponent\'s deck for each Plasma Energy; Dimension Heal', () => {
    const s = setup(salamence, target, { energy: ['fire', 'water', 'fire', 'fire'] });
    s.stadium = { card: card(stadium), owner: 'misty' };
    expect(attack(s, 0).stadium).toBeNull();
    const d = setup(dialga, target, { energy: ['bw8-127', 'bw8-127', 'fire', 'fire'] });
    const deck = misty(d).deck.length;
    // 2 discarded, and 1 drawn as Misty's turn starts.
    expect(misty(attack(d, 1)).deck.length).toBe(deck - 3);
    const p = setup(palkia, target, { energy: ['grass', 'water', 'bw8-127', 'fire'] });
    ash(p).active!.damage = 50;
    expect(ash(attack(p, 0)).active!.damage).toBe(30);
  });

  it('Dragonaxe: 40 for each Metal Energy; Strike of the Champion: a Team Plasma Pokémon Knocked Out', () => {
    const s = setup(haxorus, target, { energy: ['mtl', 'mtl', 'fighting'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
    expect(misty(attack(s, 1)).active!.damage).toBe(0);
    const p = setup(haxorus, plasmaMon, { energy: ['mtl', 'fighting'], });
    misty(p).bench[0] = poke(target);
    const prizes = ash(p).prizes.length;
    expect(ash(attack(p, 1)).prizes.length).toBe(prizes - 1);
  });

  it('Misinformation: every Pokémon Tool on the opponent\'s Pokémon discarded', () => {
    const s = setup(chatot, target, { energy: ['fire'], oppBench: [suicune] });
    tool(misty(s).active!, bangle);
    tool(misty(s).bench[0]!, mirror);
    const after = attack(s, 0);
    expect([misty(after).active!, misty(after).bench[0]!].every((p) => !p.attached?.length)).toBe(true);
  });
});

describe('Abilities', () => {
  it('Tool Reversal: a Pokémon Tool back into the hand, as often as the player likes', () => {
    const s = setup(masquerain, target, { bench: [suicune] });
    tool(ash(s).active!, bangle);
    tool(ash(s).bench[0]!, mirror);
    let after = use(s, 'active', { from: 'active' });
    after = use(after, 'active', { from: 0 });
    expect(ash(after).hand.filter((c) => c.defId === 'bw10-88' || c.defId === 'bw10-89')).toHaveLength(2);
  });

  it('Verdant Wind: the player\'s Pokémon with Grass Energy have no Special Conditions and get none', () => {
    const confused = setup(virizion, sawk, { energy: ['grass'] });
    ash(confused).active!.condition = 'confused';
    const after = act(confused, 'ash', { type: 'END_TURN' });
    expect(ash(after).active!.condition ?? null).toBeNull();
    expect(ash(after).active!.greenEssence).toBe(true);
  });

  it('Red Signal: a Plasma Energy attached from the hand, the player may switch in one of the opponent\'s Benched Pokémon', () => {
    const s = setup(genesect, target, { oppBench: [suicune] });
    const energy = hand(ash(s), { id: 'bw8-127' });
    const asked = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: energy, target: 'active' });
    expect(settles(asked).length).toBeGreaterThan(0);
    expect(misty(act(asked, 'ash', { type: 'RESOLVE_CHOICE', target: 0 })).active!.card.defId).toBe('bw10-20');
    expect(misty(act(asked, 'ash', { type: 'RESOLVE_CHOICE' })).active!.card.defId).toBe('test-target');
  });

  it('Safeguard: nothing from Pokémon-EX; Silver Mirror: nothing from Team Plasma Pokémon', () => {
    expect(misty(attack(setup(virizion, suicune, { energy: ['grass', 'fire'] }), 0)).active!.damage).toBe(0);
    const s = setup(dialga, target, { energy: ['psychic', 'mtl', 'fire'] });
    tool(misty(s).active!, mirror);
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(0);
  });

  it('Cursed Glare: no Special Energy from the hand onto any of the player\'s Pokémon while the opponent\'s Froslass is Active', () => {
    const s = setup(sawk, froslass, { bench: [suicune] });
    const energy = hand(ash(s), { id: 'bw8-127' });
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: energy, target: 0 }).ok).toBe(false);
    const basic = hand(ash(s), { id: 'water' });
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: basic, target: 0 }).ok).toBe(true);
  });

  it('Drifting Balloon: 1 Colorless less for each of the opponent\'s Team Plasma Pokémon', () => {
    const s = setup(drifblim, plasmaMon, { energy: ['psychic', 'fire'] });
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(true);
    const plain = setup(drifblim, target, { energy: ['psychic', 'fire'] });
    expect(applyAction(plain, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
  });

  it('Mental Shroud: no Weakness for the player\'s Pokémon with their Uxie and Azelf in play; Badge of Discipline: no Resistance', () => {
    const weakTarget = { ...target, id: 'test-weak', weakness: { type: FI, multiplier: 2 } } as PokemonCardDef;
    LIB['test-weak'] = weakTarget;
    const s = setup(sawk, weakTarget, { energy: ['fire'], oppBench: [mesprit, uxie] });
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    misty(s).bench[2] = poke(azelfPlain);
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
    const r = setup(sawk, resistant, { energy: ['fire'], bench: [machamp] });
    expect(misty(attack(r, 0)).active!.damage).toBe(10);
  });

  it('Stellar Guidance: a Supporter card from the deck as Jirachi-EX is benched; Breakwing: the opponent\'s Tools discarded, if the player likes', () => {
    const s = setup(sawk, target);
    ash(s).deck.unshift(card(supporter));
    const benched = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: hand(ash(s), jirachi), slot: 0 });
    expect(ash(benched).hand.some((c) => c.defId === 'bw1-101') || !!benched.pendingChoice).toBe(true);
    const e = setup(sawk, target, { bench: [shelgon] });
    tool(misty(e).active!, bangle);
    const asked = act(e, 'ash', { type: 'EVOLVE', cardUid: hand(ash(e), salamence), target: 0 });
    expect(asked.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'breakwing' });
    expect(misty(act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 0 })).active!.attached).toEqual([]);
    expect(misty(act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 1 })).active!.attached).toHaveLength(1);
  });

  it('Plasma Transfer: a Plasma Energy from one of the player\'s Pokémon to another', () => {
    const s = setup(porygonZ, target, { energy: ['bw8-127'], bench: [suicune] });
    const uid = ash(s).active!.energy[0]!.uid;
    const after = use(s, 'active', { from: 'active', energyUid: uid, to: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual([uid]);
  });
});

describe('Trainers', () => {
  it('Caitlin: cards from the hand on the bottom of the deck, then as many drawn', () => {
    const s = setup(sawk, target);
    ash(s).hand = [];
    const a = hand(ash(s), { id: 'fire' });
    hand(ash(s), { id: 'water' });
    let after = play(s, hand(ash(s), caitlin));
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: a });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(ash(after).deck.at(-1)!.uid).toBe(a);
    expect(ash(after).hand).toHaveLength(2);
  });

  it('Iris: 10 more to the Active Pokémon for each Prize card the opponent has taken', () => {
    const s = setup(sawk, target, { energy: ['fire'] });
    misty(s).prizes = misty(s).prizes.slice(0, 4);
    const after = play(s, hand(ash(s), iris));
    expect(misty(attack(after, 0)).active!.damage).toBe(30);
  });

  it('Reversal Trigger: a Team Plasma Pokémon Knocked Out by the opponent\'s attack, any card from the deck', () => {
    const s = setup(sawk, plasmaMon, { energy: ['fire'], oppBench: [target] });
    misty(s).active!.damage = 190;
    misty(s).deck.unshift(card(supporter));
    tool(misty(s).active!, reversal);
    const after = attack(s, 0);
    const asked = [after.pendingChoice, ...(after.queuedChoices ?? [])].find((c) => c?.source === 'Reversal Trigger');
    expect(asked).toMatchObject({ player: 'misty', kind: 'pickFromDeck' });
  });

  it('Silver Bangle: 30 more to an Active Pokémon-EX', () => {
    const s = setup(sawk, virizion, { energy: ['fire'] });
    tool(ash(s).active!, bangle);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('G Booster and G Scope: only Genesect-EX can use their attacks', () => {
    const s = setup(genesect, big, { energy: ['grass', 'grass', 'grass', 'grass'], oppBench: [suicune] });
    tool(ash(s).active!, gBooster);
    expect(usableAttacks(ash(s).active!, s.cards).map((a) => a.attack.name)).toContain('G Booster');
    const after = attack(s, 1);
    expect(misty(after).active!.damage).toBe(200);
    expect(ash(after).active!.energy).toHaveLength(2);
    // (Suicune's Safeguard would keep it off a Suicune: Genesect-EX is a Pokémon-EX.)
    const scope = setup(genesect, target, { energy: ['grass', 'grass', 'grass'], oppBench: [suicune, target] });
    tool(ash(scope).active!, gScope);
    expect(misty(attack(scope, 1, { benchSlot: 0 })).bench[0]!.damage).toBe(0);
    expect(misty(attack(scope, 1, { benchSlot: 1 })).bench[1]!.damage).toBe(100);
    const other = setup(sawk, target);
    tool(ash(other).active!, gBooster);
    expect(usableAttacks(ash(other).active!, other.cards).map((a) => a.attack.name)).not.toContain('G Booster');
  });

  it('Master Ball: any Pokémon from the deck; Scoop Up Cyclone: a Pokémon and its cards into the hand', () => {
    const s = setup(sawk, target, { bench: [suicune] });
    ash(s).deck = [card(suicune), { uid: 'f', defId: 'fire' }, ...ash(s).deck];
    const ball = play(s, hand(ash(s), masterBall));
    expect(ball.pendingChoice ?? ash(ball).hand.some((c) => c.defId === 'bw10-20')).toBeTruthy();
    ash(s).bench[0]!.energy.push({ uid: 'e', defId: 'water' });
    const scooped = play(s, hand(ash(s), cyclone), { target: 0 });
    expect(ash(scooped).bench[0]).toBeNull();
    expect(ash(scooped).hand.some((c) => c.uid === 'e')).toBe(true);
  });
});
