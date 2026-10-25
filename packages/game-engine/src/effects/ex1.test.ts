import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, pendingChoiceView, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, mon, C, F, FI, G, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const resolve = (s: GameState, answer: { cardUid?: string; target?: Target; count?: number; order?: string[] }, player = 'ash') => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });
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
const usePower = (s: GameState, source: Target, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });

const hariyama = mon('ex1-8', 'Hariyama', FI, 90, [['Super Slap Push', [FI], 0], ['Mega Throw', [FI, C, C], 40]], { stage: 'stage1' });
const chansey = mon('ex1-96', 'Chansey ex', C, 120, [['Healing Egg', [C, C], 0], ['Double-edge', [C, C, C], 80]], { ex: true });
const beautifly = mon('ex1-2', 'Beautifly', G, 80, [['Stun Spore', [G], 20]], { stage: 'stage2', ...power('Withering Dust') });
const mightyena = mon('ex1-10', 'Mightyena', 'darkness', 70, [['Shakedown', ['darkness', C, C], 40]], { stage: 'stage1', ...power('Intimidating Fang') });
const sharpedo = mon('ex1-22', 'Sharpedo', W, 70, [['Dark Slash', [W, C, C], 40]], { stage: 'stage1', ...power('Rough Skin') });
const silcoon = mon('ex1-43', 'Silcoon', G, 60, [['Gooey Thread', [G], 10]], { stage: 'stage1', ...power('Hard Cocoon') });
const combusken = mon('ex1-28', 'Combusken', F, 80, [['Lunge', [C, C], 50]], { stage: 'stage1', ...power('Natural Cure') });
const blaziken = mon('ex1-3', 'Blaziken', F, 100, [['Fire Stream', [F, C, C], 50]], { stage: 'stage2', ...power('Firestarter') });
const delcatty = mon('ex1-5', 'Delcatty', C, 70, [['Max Energy Source', [C], 10]], { stage: 'stage1', ...power('Energy Draw') });
const pelipper = mon('ex1-19', 'Pelipper', W, 70, [['Stockpile', [C], 0], ['Spit Up', [W, C], 30], ['Swallow', [W, C, C], 20]], { stage: 'stage1' });
const camerupt = mon('ex1-4', 'Camerupt', F, 90, [['Lava Burn', [F, C], 20], ['Fire Spin', [F, F, C, C], 100]], { stage: 'stage1' });
const big = (name: string, type = W) => mon(`big-${name}`, name, type, 200, [['Tackle', [C], 30]], { resistance: { type: 'darkness', amount: 30 } });

describe('EX Ruby & Sapphire', () => {
  it('Pokémon-ex: Knocked Out, it gives up 2 Prize cards', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'], oppBench: ['squirtle'] });
    const ex = put(s, 'misty', 'active', chansey);
    ex.damage = 110;
    const prizes = ash(s).prizes.length;
    expect(ash(attack(s, 0)).prizes).toHaveLength(prizes - 2);
  });

  it('Mega Throw: 40 more against a Pokémon-ex', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hariyama, ['fighting', 'fighting', 'fighting']);
    put(s, 'misty', 'active', { ...chansey, hp: 300 });
    expect(misty(attack(s, 1)).active!.damage).toBe(80);
    put(s, 'misty', 'active', big('Onix', FI));
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Withering Dust: while Beautifly is in play, no Resistance for the Active Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dark', 'Houndour', 'darkness', 60, [['Bite', [C], 40]]), ['fire']);
    put(s, 'misty', 'active', big('Wailmer'));
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
    put(s, 'misty', 0, beautifly);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it("Intimidating Fang: as the Active Pokémon, the opponent's attacks do 10 less to its player's Pokémon (before Weakness)", () => {
    const s = duel('charmander', 'onix', { energy: ['fire'] });
    put(s, 'misty', 'active', { ...mightyena, hp: 200, weakness: { type: F, multiplier: 2 } });
    // Scratch 10 − 10 = 0, doubled: 0.
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Rough Skin: as the Active Pokémon, damaged by an attack, 2 damage counters on the Attacking Pokémon (even when Knocked Out)', () => {
    const s = duel('charmander', 'onix', { energy: ['fire'], oppBench: ['squirtle'] });
    put(s, 'misty', 'active', sharpedo).damage = 60;
    expect(ash(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Hard Cocoon: heads, 30 less damage from the opponent\'s attack', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    put(s, 'misty', 'active', silcoon);
    // Ember 30 (Silcoon has no Weakness here): heads (Hard Cocoon) takes it to 0.
    expect(misty(attack(flips(s, true), 1)).active!.damage).toBe(0);
    expect(misty(attack(flips(s, false), 1)).active!.damage).toBe(30);
  });

  it('Natural Cure: a Fire Energy card from the hand removes all its Special Conditions', () => {
    const s = duel('charmander', 'onix');
    const c = put(s, 'ash', 'active', combusken);
    Object.assign(c, { condition: 'asleep', poison: 10, burned: true });
    const [fire] = give(s, 'ash', 'fire');
    const after = ash(act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: fire!, target: 'active' })).active!;
    expect([after.condition, after.poison, after.burned]).toEqual([null, 0, false]);
  });

  it('Firestarter: a Fire Energy card from the discard pile to a Benched Pokémon, once a turn', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    put(s, 'ash', 'active', blaziken);
    ash(s).discard.push({ uid: 'df', defId: id('fire') });
    const after = usePower(s, 'active', { cardUid: 'df', to: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual(['df']);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active', choices: { cardUid: 'df', to: 0 } }).ok).toBe(false);
  });

  it('Energy Draw: discard an Energy card from the hand, then draw up to 3', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', delcatty);
    ash(s).hand = [];
    const [fire] = give(s, 'ash', 'fire');
    const asked = usePower(s, 'active', { cardUid: fire });
    expect(asked.pendingChoice).toMatchObject({ kind: 'drawCount', max: 3 });
    expect(ash(resolve(asked, { count: 2 })).hand).toHaveLength(2);
  });

  it("Stockpile: during its player's next turn, Spit Up does 70", () => {
    let s = duel('charmander', 'onix', { energy: ['water', 'water'] });
    put(s, 'ash', 'active', pelipper, ['water', 'water']);
    s = attack(s, 0);
    s = endTurn(s, 'misty');
    expect(misty(attack(s, 1)).active!.damage).toBe(70);
  });

  it('Fire Spin: 2 basic Energy cards are discarded for its damage', () => {
    const s = duel('charmander', 'onix');
    const camel = put(s, 'ash', 'active', camerupt, ['fire', 'fire', 'water', 'water']);
    put(s, 'misty', 'active', big('Wailord'));
    const uids = camel.energy.slice(2).map((e) => e.uid);
    const after = attack(s, 1, { energyUids: uids });
    expect(misty(after).active!.damage).toBe(100);
    expect(ash(after).discard.map((c) => c.uid)).toEqual(expect.arrayContaining(uids));
  });

  it('Lady Outing: up to 3 basic Energy cards, each of a different type', () => {
    const s = duel('charmander', 'onix');
    ash(s).deck = ['fire', 'fire', 'water', 'grass'].map((e, i) => ({ uid: `e${i}`, defId: id(e) }));
    const asked = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex1-83', 'Lady Outing')) });
    const one = resolve(asked, { cardUid: 'e0' });
    const options = pendingChoiceView(one, one.pendingChoice!);
    expect(options).toMatchObject({ kind: 'pickFromDeck', options: [{ uid: 'e3' }, { uid: 'e2' }] });
  });

  it('PokéNav: a Pokémon or Energy card from the top 3; the others back on top in the order chosen', () => {
    const s = duel('charmander', 'onix');
    s.cards['base1-94'] = trainer('base1-94', 'Potion');
    ash(s).deck = [{ uid: 't1', defId: 'base1-94' }, { uid: 'p1', defId: id('charmander') }, { uid: 'x', defId: id('fire') }, { uid: 't2', defId: 'base1-94' }];
    const asked = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex1-88', 'PokéNav')) });
    const took = resolve(asked, { cardUid: 'p1' });
    expect(ash(took).hand.map((c) => c.uid)).toContain('p1');
    expect(took.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 2 });
    expect(ash(resolve(took, { order: ['x', 't1'] })).deck.map((c) => c.uid)).toEqual(['x', 't1', 't2']);
  });

  it('Professor Birch: draw until there are 6 cards in the hand', () => {
    const s = duel('charmander', 'onix');
    ash(s).hand = [{ uid: 'h1', defId: id('fire') }];
    expect(ash(act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex1-89', 'Professor Birch')) })).hand).toHaveLength(6);
  });

  describe('rulings agreed with the user', () => {
    it('"Each Defending Pokémon" is the Active one only (agreed 2026-10-22): Super Slap Push', () => {
      const s = duel('charmander', 'onix', { oppBench: ['squirtle', 'charmander'] });
      put(s, 'ash', 'active', hariyama, ['fighting']);
      const after = attack(s, 0);
      expect([misty(after).active!.damage, misty(after).bench[0]!.damage, misty(after).bench[1]!.damage]).toEqual([20, 0, 0]);
    });

    it('Special Conditions on "each Defending Pokémon" go only on the Active one: Poison Smog', () => {
      const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
      put(s, 'ash', 'active', mon('ex1-24', 'Weezing', G, 80, [['Confusion Gas', [G], 10], ['Poison Smog', [G, C], 0]], { stage: 'stage1' }), ['grass', 'grass']);
      const after = attack(s, 1);
      expect([misty(after).active!.poison, misty(after).bench[0]!.poison ?? 0, misty(after).bench[0]!.damage]).toEqual([10, 0, 10]);
    });

    it("Fast Stream: the opponent moves an Energy card from their Defending Pokémon to one of their Benched Pokémon, picking both", () => {
      const s = duel('charmander', 'onix', { defenderEnergy: ['fighting', 'fighting'], oppBench: ['squirtle'] });
      put(s, 'ash', 'active', mon('ex1-21', 'Seaking', W, 70, [['Water Arrow', [W], 0], ['Fast Stream', [C, C], 30]], { stage: 'stage1' }), ['water', 'water']);
      const asked = attack(s, 1);
      expect(asked.pendingChoice).toMatchObject({ player: 'misty', kind: 'fastStream' });
      const energy = misty(asked).active!.energy[0]!.uid;
      const moved = resolve(resolve(asked, { cardUid: energy }, 'misty'), { target: 0 }, 'misty');
      expect([misty(moved).active!.energy.length, misty(moved).bench[0]!.energy.map((e) => e.uid)]).toEqual([1, [energy]]);
    });

    it('Energy counts what it provides; Cannonball counts the Energy beyond its cost of 2', () => {
      const s = duel('charmander', 'onix');
      put(s, 'ash', 'active', mon('ex1-29', 'Delcatty', C, 80, [['Energy Call', [C], 10], ['Cannonball', [C, C], 30]], { stage: 'stage1' }), ['fire', 'fire', 'fire', 'fire']);
      put(s, 'misty', 'active', big('Wailord'));
      expect(misty(attack(s, 1)).active!.damage).toBe(50);
    });

    it('Lazy: as the Active Pokémon, the opponent\'s Pokémon (an older Pokémon Power too) can\'t use powers', () => {
      const s = duel('blastoise', 'onix');
      put(s, 'misty', 'active', mon('ex1-12', 'Slaking', C, 120, [['Critical Move', [C, C, C, C], 100]], { stage: 'stage2', ...power('Lazy') }));
      const [water] = give(s, 'ash', 'water');
      expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { cardUid: water, to: 'active' } })).toMatchObject({ ok: false, error: "Lazy: your Pokémon can't use Poké-Powers" });
    });

    it('Psy Shadow: a Psychic Energy card from the deck to a Pokémon, then 2 damage counters on it (it may Knock it Out)', () => {
      const s = duel('charmander', 'onix', { bench: ['charmander'] });
      put(s, 'ash', 'active', mon('ex1-7', 'Gardevoir', 'psychic', 100, [['Energy Burst', ['psychic'], 10]], { stage: 'stage2', ...power('Psy Shadow') }));
      ash(s).deck.push({ uid: 'psy', defId: id('psychic') });
      ash(s).bench[0]!.damage = 40;
      // The Psychic Energy is the only card it can take, so it's taken without asking (the same-card rule).
      const attach = usePower(s, 'active');
      expect(attach.pendingChoice).toMatchObject({ kind: 'attachCard', counters: 2 });
      expect(ash(resolve(attach, { target: 0 })).discard.map((c) => c.uid)).toContain('psy');
    });

    it('Water Call attaches from the hand, so it sets off Natural Remedy', () => {
      const s = duel('charmander', 'onix', { bench: ['charmander'] });
      put(s, 'ash', 'active', mon('ex1-23', 'Swampert', W, 100, [['Water Arrow', [W], 0]], { stage: 'stage2', ...power('Natural Remedy') })).damage = 30;
      put(s, 'ash', 0, mon('ex1-13', 'Swampert', W, 110, [['Hypno Splash', [W, W, C, C], 50]], { stage: 'stage2', ...power('Water Call') }));
      const [water] = give(s, 'ash', 'water');
      expect(ash(usePower(s, 0, { cardUid: water })).active!.damage).toBe(20);
    });

    it("EX Pokémon Reversal: heads, the opponent picks the Benched Pokémon that comes in", () => {
      const s = duel('charmander', 'onix', { oppBench: ['squirtle', 'charmander'] });
      const asked = act(flips(s, true), 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('ex1-87', 'Pokémon Reversal')) });
      expect(asked.pendingChoice).toMatchObject({ player: 'misty', kind: 'switchIn' });
    });

    it('Signs of Evolution: one card of each name in the pair', () => {
      const s = duel('charmander', 'onix');
      put(s, 'ash', 'active', mon('ex1-78', 'Wurmple', G, 50, [['Signs of Evolution', [C], 0], ['Poison Barb', [G], 0]]), ['grass']);
      const silcoon = mon('silcoon', 'Silcoon', G, 60, [], { stage: 'stage1', evolvesFrom: 'Wurmple' });
      s.cards.silcoon = silcoon;
      ash(s).deck = [{ uid: 's1', defId: 'silcoon' }, { uid: 's2', defId: 'silcoon' }];
      // Both options are Silcoons, so one is taken without asking (the same-card rule), and only one.
      const one = attack(s, 0, { boost: true });
      expect(one.pendingChoice).toBeUndefined();
      expect([ash(one).hand.filter((c) => c.defId === 'silcoon').length, ash(one).deck.filter((c) => c.defId === 'silcoon').length]).toEqual([1, 1]);
    });
  });

  it('Lum Berry removes every Special Condition between turns, Burned included; Oran Berry 2 damage counters', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex1-84'] = trainer('ex1-84', 'Lum Berry');
    s.cards['ex1-85'] = trainer('ex1-85', 'Oran Berry');
    Object.assign(ash(s).active!, { burned: true, attached: [{ card: { uid: 'lum', defId: 'ex1-84' }, until: Number.MAX_SAFE_INTEGER, tool: true }] });
    Object.assign(misty(s).active!, { damage: 30, attached: [{ card: { uid: 'oran', defId: 'ex1-85' }, until: Number.MAX_SAFE_INTEGER, tool: true }] });
    // Tails on the Burned flip: still Burned for Lum Berry.
    const after = endTurn(flips(s, false), 'ash');
    expect(ash(after).active!.burned).toBe(false);
    expect(ash(after).discard.map((c) => c.uid)).toContain('lum');
    expect(misty(after).active!.damage).toBe(10);
  });
});
