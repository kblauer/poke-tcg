import { describe, expect, it } from 'vitest';
import { int, rngFrom } from '@poke-tcg/campaign';
import { BOARD_SIZE, type Board } from './battle.js';
import { DRAFT, applySafariAction, bankablePokedollars, battlePay, battleBoard, cardUnit, createSafari, draftPool, isLegendary, rerollPrice, sellPrice, shopSize, tierPrice, wantedCards, type Card, type PokemonCard, type SafariAction, type SafariState, type SafariSystemAction } from './draft.js';
import { allUnits } from './species.js';
import type { Opponent } from './opponents.js';

const units = allUnits();
const pool = draftPool(units);
const unit = (id: string) => pool.units.get(id)!;
/** 12 units that never merge with each other: no evolution line, all different Pokémon, none a test uses for itself. */
const FILL = units
  .filter((u) => pool.lone(u) && !isLegendary(u) && !['Tauros', 'Kangaskhan'].includes(u.name))
  .slice(0, 12)
  .map((u) => u.id);

function must(state: SafariState, action: SafariAction | SafariSystemAction): SafariState {
  const result = applySafariAction(state, action, units);
  if (!result.ok) throw new Error(`${action.type}: ${result.error}`);
  return result.state;
}
const refused = (state: SafariState, action: SafariAction | SafariSystemAction) => {
  const result = applySafariAction(state, action, units);
  return result.ok ? null : result.error;
};

const card = (id: string, key: number, extra: Partial<PokemonCard> = {}): Card => ({ key, kind: 'pokemon', unit: id, bonuses: [], ...extra });
/** A run in its first shop, with these cards (the starter left out), ₱1,000 and the shop's cards `offers`. */
function shop(board: string[], inventory: string[] = [], offers: string[] = [], seed = 1): SafariState {
  const start = createSafari(seed, units);
  const s = must(start, { type: 'PICK_STARTER', unit: start.starters[0]! });
  let key = 100;
  s.board = Array.from({ length: BOARD_SIZE }, (_, i) => (board[i] ? card(board[i]!, key++) : null));
  s.inventory = Array.from({ length: DRAFT.inventory }, (_, i) => (inventory[i] ? card(inventory[i]!, key++) : null));
  s.nextKey = key;
  s.pokedollars = 1000;
  s.shop = { offers: [...offers], frozen: false, oak: false };
  s.encounterSteps = []; // no encounter step unless a test sets one
  s.encounters = [];
  return s;
}
const ids = (cards: readonly (Card | null)[]) => cards.map((c) => (c?.kind === 'pokemon' ? c.unit : c?.kind === 'trainer' ? c.trainer : null));
/** A board that loses to any full one, and 6 of the shop's strong units (Stage 1s, all different: they never merge with each other). */
const weak = (): Board => ({ units: [units.filter((u) => u.tier === 1).sort((a, b) => a.attack + a.hp - b.attack - b.hp)[0]!] });
const STRONG = pool.shop[3]!.filter((u) => u.stage === 'stage1').slice(0, BOARD_SIZE).map((u) => u.id);
const strong: Board = { units: units.filter((u) => u.tier === 5).sort((a, b) => b.attack + b.hp - a.attack - a.hp).slice(0, BOARD_SIZE), trainer: 'Defender' };
/** A battle lost for sure: only the weakest unit on the board against `strong` (the board put back after). */
function lose(s: SafariState, pay: number): SafariState {
  const after = fight({ ...s, board: [card(weak().units[0]!.id, 999), null, null, null, null, null] }, strong, pay);
  return { ...after, board: s.board };
}
/** The step's one opponent set to `board` (the Champion after the 15 battles), chosen and fought. */
function fight(s: SafariState, board: Board, pay: number): SafariState {
  const difficulty = s.battles >= DRAFT.battles ? ('champion' as const) : ('medium' as const);
  const opponent: Opponent = { name: 'Test', difficulty, type: 'colorless', pay, board: board.units.map((u) => u.id), ...(board.trainer && { trainer: board.trainer }) };
  return must(must({ ...s, opponents: [opponent] }, { type: 'CHOOSE', index: 0 }), { type: 'BATTLE' });
}

describe('the pool', () => {
  it('shows no Stage 2 and no legendary in a shop', () => {
    for (const tier of pool.shop) for (const u of tier) expect(u.stage === 'stage2' || isLegendary(u), u.id).toBe(false);
    expect(units.filter(isLegendary).map((u) => u.name)).toEqual(expect.arrayContaining(['Mewtwo', 'Mew', 'Articuno', 'Zapdos', 'Moltres', 'Lugia', 'Rayquaza']));
    expect(units.filter(isLegendary)).toHaveLength(21);
    expect(isLegendary(unit('150')) && !isLegendary(unit('52'))).toBe(true); // Mewtwo, Meowth
    // Stage 1s are sold, at the higher tiers only: an evolved unit is at least a tier above what it evolves from.
    expect(pool.shop[0]!.some((u) => u.stage === 'stage1')).toBe(false);
    expect(pool.shop[2]!.filter((u) => u.stage === 'stage1').length).toBeGreaterThan(20);
  });

  it('offers 3 different tier-1 Basics to start, and the same seed the same run', () => {
    const a = createSafari(7, units);
    expect(a.starters).toHaveLength(3);
    expect(new Set(a.starters).size).toBe(3);
    for (const id of a.starters) expect(unit(id)).toMatchObject({ tier: 1, stage: 'basic' });
    expect(createSafari(7, units)).toEqual(a);
    expect(a).toMatchObject({ phase: 'starter', hp: 3, pokedollars: 300 });
  });
});

describe('the start', () => {
  it('puts the starter on the board and opens a tier-1 shop of 3', () => {
    const start = createSafari(3, units);
    expect(refused(start, { type: 'PICK_STARTER', unit: '6' })).toBe('Not one of the starters');
    expect(refused(start, { type: 'BUY', index: 0 })).toBe('Pick a starter first');
    const s = must(start, { type: 'PICK_STARTER', unit: start.starters[1]! });
    expect(s.phase).toBe('shop');
    expect(ids(s.board)[0]).toBe(start.starters[1]);
    expect(s.shop!.offers).toHaveLength(3);
    for (const id of s.shop!.offers) expect(unit(id!).tier).toBe(1);
    expect(s.version).toBe(1);
  });
});

describe('the shop', () => {
  it('shows tier N and lower, more often the lower tiers, never the same unit twice', () => {
    const seen = [0, 0, 0, 0, 0];
    let s = shop(['6']); // Charizard: no partners, so the shop's favour shows nothing for it
    s.shopTier = 5;
    s.pokedollars = 1e6;
    for (let i = 0; i < 400; i++) {
      s = must(s, { type: 'REROLL' });
      const offers = s.shop!.offers as string[];
      expect(offers).toHaveLength(5);
      expect(new Set(offers).size).toBe(5);
      for (const id of offers) seen[unit(id).tier - 1]!++;
    }
    // Weights 16/15/13/11/9 a tier.
    expect(seen[0]! / 2000).toBeCloseTo(16 / 64, 1);
    expect(seen[4]! / 2000).toBeCloseTo(9 / 64, 1);
    expect(seen[0]).toBeGreaterThan(seen[4]!);
  });

  it('places a bought card on the board, then in the inventory', () => {
    let s = shop(FILL.slice(0, 5), [], ['43', '4']); // Oddish and Charmander, both tier 1
    s = must(s, { type: 'BUY', index: 0 });
    expect(ids(s.board)[5]).toBe('43');
    expect(s.pokedollars).toBe(1000 - DRAFT.cardPrice[0]!);
    expect(s.shop!.offers).toEqual([null, '4']);
    expect(refused(s, { type: 'BUY', index: 0 })).toBe('No card there');
    s = must(s, { type: 'BUY', index: 1 });
    expect(ids(s.inventory)[0]).toBe('4');
    s.pokedollars = 10;
    s.shop!.offers = ['19'];
    expect(refused(s, { type: 'BUY', index: 0 })).toBe('Not enough ₱');
  });

  it('with no room, buys only a card that completes a merge', () => {
    const s = shop([...FILL.slice(0, 2), '265', ...FILL.slice(2, 5)], FILL.slice(5, 11), ['4', '265']);
    expect(refused(s, { type: 'BUY', index: 0 })).toBe('No room: sell a card first');
    // A second Wurmple merges with the board's (into Silcoon or Cascoon): room for it.
    const after = must(must(s, { type: 'BUY', index: 1 }), { type: 'PICK', unit: '266' });
    expect(ids(after.board)[2]).toBe('266');
    expect([...after.board, ...after.inventory].filter(Boolean)).toHaveLength(12);
  });

  it('sells for 75% of the price, rounded down', () => {
    const s = shop(['19', '72', '5'], [], []); // Rattata and Tentacool (tier 1), Charmeleon
    expect(sellPrice(s.board[0]!, pool)).toBe(45);
    expect(sellPrice(s.board[1]!, pool)).toBe(45);
    expect(sellPrice(s.board[2]!, pool)).toBe(Math.floor(DRAFT.cardPrice[unit('5').tier - 1]! * 0.75));
    const sold = must(s, { type: 'SELL', place: { zone: 'board', at: 1 } });
    expect(sold.pokedollars).toBe(1045);
    expect(sold.board[1]).toBeNull();
    expect(refused(sold, { type: 'SELL', place: { zone: 'board', at: 1 } })).toBe('No card there');
    expect(refused(sold, { type: 'SELL', place: { zone: 'board', at: 9 } })).toBe('No such place');
  });

  it('raises the tier for less each battle since the last, never under half', () => {
    expect(tierPrice({ shopTier: 1, sinceTier: 0 })).toBe(200);
    expect(tierPrice({ shopTier: 1, sinceTier: 3 })).toBe(140);
    expect(tierPrice({ shopTier: 1, sinceTier: 20 })).toBe(100);
    expect(tierPrice({ shopTier: 4, sinceTier: 2 })).toBe(460);
    expect(tierPrice({ shopTier: 5, sinceTier: 0 })).toBeNull();
    let s = shop(STRONG);
    s.sinceTier = 2;
    s = must(s, { type: 'TIER_UP' });
    expect(s).toMatchObject({ shopTier: 2, sinceTier: 0, pokedollars: 840 });
    s.shopTier = 5;
    expect(refused(s, { type: 'TIER_UP' })).toBe('The shop is at its top tier');
  });

  it('rerolls for ₱20, every one free after Professor Oak', () => {
    let s = shop(STRONG);
    expect(rerollPrice(s)).toBe(20);
    s = must(s, { type: 'REROLL' });
    expect(s.pokedollars).toBe(980);
    s.shop!.oak = true;
    expect(rerollPrice(s)).toBe(0);
    s = must(s, { type: 'REROLL' });
    expect(s.pokedollars).toBe(980);
  });

  it("shows its tier's number of cards", () => {
    const s = shop(['20', '19']);
    expect(shopSize(s)).toBe(3);
    s.shopTier = 4;
    expect(shopSize(s)).toBe(5);
  });

  it('keeps a frozen shop\'s unbought cards for the next, filling the rest; a reroll unfreezes', () => {
    let s = shop(['19'], [], ['43', '72', '147']);
    s = must(s, { type: 'BUY', index: 0 });
    s = must(s, { type: 'FREEZE' });
    expect(s.shop!.frozen).toBe(true);
    s = fight(s, weak(), 450);
    expect(s.shop!.offers.slice(0, 2)).toEqual(['72', '147']);
    expect(s.shop!.offers).toHaveLength(3);
    expect(s.shop!.frozen).toBe(false);
    s = must(must(s, { type: 'FREEZE' }), { type: 'REROLL' });
    expect(s.shop!.frozen).toBe(false);
  });
});

describe('merging', () => {
  it('merges 2 Basics into the Stage 1, the player picking between 2 where the line branches', () => {
    // Wurmple evolves into Silcoon or Cascoon: both are offered.
    let s = shop([FILL[0]!, '265'], [], ['265']);
    s = must(s, { type: 'BUY', index: 0 });
    expect(s.pick).toMatchObject({ kind: 'merge', from: ['Wurmple', 'Wurmple'], place: { zone: 'board', at: 1 } });
    expect([...s.pick!.options].sort()).toEqual(['266', '268']);
    expect(refused(s, { type: 'REROLL' })).toBe('Pick the card first');
    expect(refused(s, { type: 'PICK', unit: '6' })).toBe('Not one of the choices');
    s = must(s, { type: 'PICK', unit: '268' });
    expect(ids(s.board)).toEqual([FILL[0], '268', null, null, null, null]);
    expect(s.pick).toBeNull();
    // Eevee evolves into 5 Pokémon: 2 of them at random, never the same one twice.
    const eevee = must(shop(['133'], [], ['133']), { type: 'BUY', index: 0 });
    expect(eevee.pick!.options).toHaveLength(2);
    expect(new Set(eevee.pick!.options).size).toBe(2);
    for (const id of eevee.pick!.options) expect(['134', '135', '136', '196', '197']).toContain(id);
  });

  it('merges the board and the inventory together, the result in the board part\'s place', () => {
    let s = shop([FILL[0]!, '79'], [FILL[1]!, '79']); // a Slowpoke in each: 2 Slowpoke make Slowbro or Slowking
    s = must(s, { type: 'GIFT', unit: FILL[2]! }); // anything: settles the merge that was set up by hand
    expect(s.pick!.place).toEqual({ zone: 'board', at: 1 });
    expect([...s.pick!.options].sort()).toEqual(['199', '80']);
    s = must(s, { type: 'PICK', unit: '80' });
    expect(ids(s.board)).toEqual([FILL[0], '80', FILL[2], null, null, null]);
    expect(ids(s.inventory)).toEqual([FILL[1], null, null, null, null, null]);
  });

  it('gives the only card a merge can give with no pick, and merges on up to the Stage 2', () => {
    // Two Charmeleon make Charizard, its only Stage 2.
    let s = shop(['5'], [FILL[0]!]);
    s = must(s, { type: 'GIFT', unit: '5' });
    expect(s.pick).toBeNull();
    expect(ids(s.board)[0]).toBe('6');
    expect(s.log.at(-1)).toBe('Charmeleon and Charmeleon merged into Charizard.');
    // Two Charmander merging into a Charmeleon beside another make Charizard.
    s = shop(['5', '4'], []);
    s = must(s, { type: 'GIFT', unit: '4' });
    expect(s.pick).toBeNull();
    expect(ids(s.board)).toEqual(['6', null, null, null, null, null]);
  });

  it('follows the games\' lines: only 2 of the same Pokémon merge, a branching one into its own evolutions only', () => {
    // Charmander, Squirtle and Charmeleon: three different Pokémon, a line's two stages among them.
    let s = shop(['4'], []);
    s = must(must(s, { type: 'GIFT', unit: '7' }), { type: 'GIFT', unit: '5' });
    expect(s.pick).toBeNull();
    expect(ids(s.board)).toEqual(['4', '7', '5', null, null, null]);
    // Silcoon and Cascoon, both from Wurmple, evolve into different Pokémon: no merge.
    s = shop(['266'], []);
    s = must(s, { type: 'GIFT', unit: '268' });
    expect(ids(s.board)).toEqual(['266', '268', null, null, null, null]);
    // Every pair of a Pokémon gives only what evolves from it, a stage up.
    for (const u of units.filter((v) => v.stage !== 'stage2' && pool.into(v.name).length)) {
      const merged = must(shop([u.id], []), { type: 'GIFT', unit: u.id });
      const made = merged.pick ? merged.pick.options : [ids(merged.board)[0]!];
      for (const id of made) expect(unit(id).evolvesFrom, `${u.name} into ${unit(id).name}`).toBe(u.name);
      expect(ids(merged.board).filter(Boolean), u.name).toHaveLength(merged.pick ? 0 : 1);
    }
  });

  it('keeps the parts\' bonuses, one both had once', () => {
    let s = shop(['5'], []);
    (s.board[0] as PokemonCard).bonuses = [{ from: 'up', attack: 10, hp: 0 }, { from: 'tough', attack: 0, hp: 20 }];
    s.board[1] = card('5', 1, { bonuses: [{ from: 'up', attack: 10, hp: 0 }] });
    s = must(s, { type: 'GIFT', unit: FILL[0]! }); // anything: settles the merge that was set up by hand
    const made = s.board.find((c) => c?.kind === 'pokemon' && c.unit === '6') as PokemonCard;
    expect(made.bonuses.map((b) => b.from)).toEqual(['up', 'tough']);
    expect(cardUnit(made, pool)).toMatchObject({ attack: unit('6').attack + 10, hp: unit('6').hp + 20 });
  });
});

describe('golden copies', () => {
  it('only a Pokémon with no evolution line goes golden', () => {
    expect(pool.lone(unit('128'))).toBe(true); // Tauros
    expect(pool.lone(unit('19'))).toBe(false); // Rattata: Raticate
    expect(pool.lone(unit('147'))).toBe(false); // Dratini
    expect(pool.lone(unit('5'))).toBe(false); // Charmeleon
    expect(pool.lone(unit('6'))).toBe(false); // Charizard
  });

  it('makes 3 of a Pokémon golden, +20 attack and +20 HP, with no pick', () => {
    let s = shop(['128', '128'], []);
    s = must(s, { type: 'GIFT', unit: '128' });
    expect(s.pick).toBeNull();
    const golden = s.board[0] as PokemonCard;
    expect(golden).toMatchObject({ unit: '128', golden: true });
    expect(cardUnit(golden, pool)).toMatchObject({ attack: unit('128').attack + 20, hp: unit('128').hp + 20 });
    expect(ids(s.board).filter(Boolean)).toHaveLength(1);
    expect(s.log.at(-1)).toBe('3 Tauros made a golden Tauros.');
    // A golden copy is never part of another.
    s = must(must(s, { type: 'GIFT', unit: '128' }), { type: 'GIFT', unit: '128' });
    expect(ids(s.board).filter(Boolean)).toHaveLength(3);
    // 3 of a Pokémon with an evolution line never go golden: 2 merge, the third waits.
    s = must(must(shop(['4'], []), { type: 'GIFT', unit: '4' }), { type: 'GIFT', unit: '4' });
    expect(ids(s.board)).toEqual(['5', '4', null, null, null, null]);
  });
});

describe('the shop\'s favour for cards held', () => {
  it('knows each unit\'s partner: another of the same Pokémon, for a merge or a golden copy', () => {
    const mates = (id: string) => pool.mates(id).map((u) => u.id).sort();
    expect(mates('4')).toEqual(['4']); // Charmander
    expect(mates('5')).toEqual(['5']); // Charmeleon
    expect(mates('133')).toEqual(['133']); // Eevee, whichever Pokémon it evolves into
    expect(mates('128')).toEqual(['128']); // Tauros
    expect(mates('6')).toEqual([]); // Charizard: nothing above it
  });

  it('shows a held card\'s partners about DRAFT.favour more often', () => {
    const share = (held: string[]) => {
      let s = shop(held);
      s.pokedollars = 1e6;
      let seen = 0;
      for (let i = 0; i < 1500; i++) {
        s = must(s, { type: 'REROLL' });
        seen += s.shop!.offers.filter((id) => id === '4').length;
      }
      return seen / 1500;
    };
    const lift = share(['4']) - share([FILL[0]!]);
    expect(lift).toBeGreaterThan(DRAFT.favour * 0.6);
    expect(lift).toBeLessThan(DRAFT.favour * 3 * 1.5);
  });

  it('weighs a card by the battles it has been held, and a merge keeps its oldest part\'s', () => {
    const s = shop([], []);
    s.battles = 6;
    s.shopTier = 5;
    s.board[0] = card('4', 1, { since: 0 });
    s.board[1] = card('128', 2, { since: 5 });
    expect(wantedCards(s, pool).map((w) => w.weight)).toEqual([7, 2]);
    const merged = must({ ...s, board: [card('5', 1, { since: 2 }), null, null, null, null, null] }, { type: 'GIFT', unit: '5' });
    expect(merged.board[0]).toMatchObject({ unit: '6', since: 2 });
  });
});

describe('gifts', () => {
  it('gives a card to a free place, and loses a gift with no room', () => {
    let s = shop([FILL[0]!], []);
    s = must(s, { type: 'GIFT', unit: '80' }); // Slowbro
    expect([...s.board, ...s.inventory].filter(Boolean)).toHaveLength(2);

    s = shop(FILL.slice(0, 6), FILL.slice(6, 12));
    s = must(s, { type: 'GIFT', unit: '6' });
    expect(s.log.filter((l) => l.startsWith('No room for'))).toHaveLength(1);
  });

  it('keeps Trainer cards in the inventory, plays the chosen one in the next battle and uses it up', () => {
    let s = shop(STRONG.slice(0, 5), []);
    s = must(s, { type: 'GIFT', trainer: 'Bill' });
    const bill = s.inventory[0]!;
    expect(bill).toMatchObject({ kind: 'trainer', trainer: 'Bill' });
    expect(refused(s, { type: 'MOVE', from: { zone: 'inventory', at: 0 }, to: { zone: 'board', at: 3 } })).toBe('Trainer cards stay in the inventory');
    expect(refused(s, { type: 'SET_TRAINER', key: 999 })).toBe('No such Trainer card');
    s = must(s, { type: 'SET_TRAINER', key: bill.key });
    expect(battleBoard(s, pool).trainer).toBe('Bill');
    const before = s.pokedollars;
    s = fight(s, strong, 450);
    expect(s.last).toMatchObject({ bill: DRAFT.bill });
    expect(s.pokedollars).toBe(before + DRAFT.bill + s.last!.payDay + battlePay(450, s.last!.winner === 0 ? 1 : s.last!.winner === 'draw' ? DRAFT.drawShare : DRAFT.lossShare));
    expect(s.inventory[0]).toBeNull();
    expect(s.trainer).toBeNull();

    s = must(s, { type: 'GIFT', trainer: 'Professor Oak' });
    s = must(s, { type: 'SET_TRAINER', key: s.inventory[0]!.key });
    s = fight(s, weak(), 450);
    expect(s.shop!.oak).toBe(true);
    expect(rerollPrice(s)).toBe(0);
    s = fight(s, weak(), 450);
    expect(s.shop!.oak).toBe(false);
  });
});

describe('the board', () => {
  it('swaps any two places, empty ones too', () => {
    const [a, b, c] = FILL as [string, string, string];
    let s = shop([a, b], [c]);
    s = must(s, { type: 'MOVE', from: { zone: 'board', at: 0 }, to: { zone: 'board', at: 4 } });
    expect(ids(s.board)).toEqual([null, b, null, null, a, null]);
    s = must(s, { type: 'MOVE', from: { zone: 'inventory', at: 0 }, to: { zone: 'board', at: 1 } });
    expect(ids(s.board)[1]).toBe(c);
    expect(ids(s.inventory)[0]).toBe(b);
    expect(battleBoard(s, pool).units.map((u) => u.id)).toEqual([c, a]);
    expect(refused(s, { type: 'MOVE', from: { zone: 'board', at: 0 }, to: { zone: 'board', at: 1 } })).toBe('No card there');
  });
});

describe('battles and the run', () => {
  it('pays a win, half for a loss and 3/4 for a draw (rounded down to ₱10), costs a loss 1 HP, a draw nothing, and opens the next shop', () => {
    let s = shop(STRONG);
    s = fight(s, weak(), 550);
    expect(s.last!.winner).toBe(0);
    expect(s).toMatchObject({ battles: 1, hp: 3, sinceTier: 1 });
    expect(s.pokedollars).toBe(1000 + 550 + s.last!.payDay);
    const before = s.pokedollars;
    s = lose(s, 550);
    expect(s.last!.winner).toBe(1);
    expect(s).toMatchObject({ battles: 2, hp: 2 });
    expect(s.pokedollars).toBe(before + 270 + s.last!.payDay);
    expect([battlePay(450, DRAFT.lossShare), battlePay(450, DRAFT.drawShare), battlePay(1000, DRAFT.drawShare), battlePay(0, DRAFT.lossShare)]).toEqual([220, 330, 750, 0]);
    expect(s.shop!.offers.length).toBe(3);
    s.board = s.board.map(() => null);
    expect(refused(must(s, { type: 'CHOOSE', index: 0 }), { type: 'BATTLE' })).toBe('Put a Pokémon on the board first');
  });

  it('loses the run at 0 HP, banking nothing', () => {
    let s = shop(STRONG);
    for (let i = 0; i < 3; i++) s = lose(s, 550);
    expect(s).toMatchObject({ phase: 'lost', hp: 0, shop: null });
    expect(bankablePokedollars(s)).toBe(0);
    expect(refused(s, { type: 'REROLL' })).toBe('This run is over');
  });

  it('fights the Champion after 15 battles, again after a loss, and banks the ₱ on beating him', () => {
    let s = shop(STRONG);
    s.battles = 15;
    s = lose(s, 1000);
    expect(s).toMatchObject({ phase: 'shop', battles: 15, championTries: 1, hp: 2 });
    expect(s.last!.champion).toBe(true);
    s = fight(s, weak(), 1000);
    expect(s.phase).toBe('won');
    expect(bankablePokedollars(s)).toBe(s.pokedollars);
    expect(s.pokedollars).toBeGreaterThanOrEqual(2000);
  });

  it('conceding loses the run, even with a pick waiting', () => {
    let s = shop(['133'], [], ['133']); // 2 Eevee: a pick between 2 of its evolutions
    s = must(s, { type: 'BUY', index: 0 });
    expect(s.pick).not.toBeNull();
    s = must(s, { type: 'CONCEDE' });
    expect(s).toMatchObject({ phase: 'lost', conceded: true, pick: null });
    expect(bankablePokedollars(s)).toBe(0);
  });

  it('never throws, whatever is asked, and never holds more than its room', () => {
    const rng = rngFrom(11);
    const place = () => ({ zone: int(rng, 2) ? ('board' as const) : ('inventory' as const), at: int(rng, 7) });
    for (let run = 0; run < 30; run++) {
      let s = createSafari(run, units);
      for (let step = 0; step < 300 && s.phase !== 'won' && s.phase !== 'lost'; step++) {
        const actions: (SafariAction | SafariSystemAction)[] = [
          { type: 'PICK_STARTER', unit: s.starters[int(rng, 3)]! },
          { type: 'BUY', index: int(rng, 6) },
          { type: 'SELL', place: place() },
          { type: 'MOVE', from: place(), to: place() },
          { type: 'REROLL' },
          { type: 'FREEZE' },
          { type: 'TIER_UP' },
          { type: 'PICK', unit: s.pick?.options[int(rng, s.pick.options.length)] ?? '6' },
          { type: 'SET_TRAINER', key: s.inventory.find((c) => c?.kind === 'trainer')?.key ?? null },
          { type: 'GIFT', unit: units[int(rng, units.length)]!.id },
          { type: 'GIFT', trainer: 'PlusPower' },
          { type: 'CHOOSE', index: int(rng, 3) },
          { type: 'ENCOUNTER', index: int(rng, 2) },
          { type: 'TAKE', index: int(rng, 7) },
          { type: 'LEAVE' },
          { type: 'BATTLE' },
          { type: 'BATTLE' },
        ];
        const result = applySafariAction(s, actions[int(rng, actions.length)]!, units);
        if (!result.ok) continue;
        s = result.state;
        expect(s.board).toHaveLength(BOARD_SIZE);
        expect(s.inventory).toHaveLength(DRAFT.inventory);
        expect(s.pokedollars).toBeGreaterThanOrEqual(0);
        expect(s.board.every((c) => c?.kind !== 'trainer')).toBe(true);
        const keys = [...s.board, ...s.inventory].filter(Boolean).map((c) => c!.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
});
