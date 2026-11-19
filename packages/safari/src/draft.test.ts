import { describe, expect, it } from 'vitest';
import { int, rngFrom } from '@poke-tcg/campaign';
import { BOARD_SIZE, type Board } from './battle.js';
import { DRAFT, LEGENDARIES, applySafariAction, bankablePokedollars, battlePay, battleBoard, cardUnit, createSafari, draftPool, isLegendary, rerollPrice, sellPrice, shopSize, tierPrice, wantedCards, type Card, type PokemonCard, type SafariAction, type SafariState, type SafariSystemAction } from './draft.js';
import { gen1Units } from './gen1.js';
import type { Opponent } from './opponents.js';

const units = gen1Units();
const pool = draftPool(units);
const unit = (id: string) => pool.units.get(id)!;
/** 12 units that never merge with each other: no evolution line, all names different, none a test uses for itself. */
const FILL = units
  .filter((u) => pool.lone(u) && !isLegendary(u) && !['Tauros', 'Kangaskhan'].includes(u.name))
  .filter((u, i, all) => all.findIndex((v) => v.name === u.name) === i)
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
/** A board that loses to any full one, and the shop's 6 strongest units (they never merge with each other). */
const weak = (): Board => ({ units: [units.filter((u) => u.tier === 1).sort((a, b) => a.attack + a.hp - b.attack - b.hp)[0]!] });
const STRONG = pool.shop[4]!.filter((u) => u.stage === 'stage1').filter((u, i, all) => all.findIndex((v) => v.evolvesFrom === u.evolvesFrom) === i).slice(0, BOARD_SIZE).map((u) => u.id);
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
  it('shows no Stage 2 and no legendary in a shop, every print of the legendaries out', () => {
    for (const tier of pool.shop) for (const u of tier) expect(u.stage === 'stage2' || isLegendary(u), u.id).toBe(false);
    expect(units.filter(isLegendary).map((u) => u.name)).toEqual(expect.arrayContaining(['Mewtwo', "Rocket's Mewtwo", "Blaine's Moltres", 'Mew', 'Articuno', 'Zapdos']));
    expect(isLegendary({ name: 'Mewtwo' }) && isLegendary({ name: "Rocket's Zapdos" }) && !isLegendary({ name: 'Meowth' })).toBe(true);
    expect(LEGENDARIES).toHaveLength(5);
    // Stage 1s are sold, at the higher tiers only.
    expect(pool.shop[0]!.some((u) => u.stage === 'stage1')).toBe(true); // Gen 1 has one tier-1 Stage 1
    expect(pool.shop[3]!.filter((u) => u.stage === 'stage1').length).toBeGreaterThan(20);
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
    expect(refused(start, { type: 'PICK_STARTER', unit: 'base1-4' })).toBe('Not one of the starters');
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
    let s = shop(['base1-4']); // Charizard: no partners, so the shop's favour shows nothing for it
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
    let s = shop(FILL.slice(0, 5), [], ['base1-43', 'base5-50']);
    s = must(s, { type: 'BUY', index: 0 });
    expect(ids(s.board)[5]).toBe('base1-43');
    expect(s.pokedollars).toBe(1000 - DRAFT.cardPrice[0]!);
    expect(s.shop!.offers).toEqual([null, 'base5-50']);
    expect(refused(s, { type: 'BUY', index: 0 })).toBe('No card there');
    s = must(s, { type: 'BUY', index: 1 });
    expect(ids(s.inventory)[0]).toBe('base5-50');
    s.pokedollars = 10;
    s.shop!.offers = ['base1-61'];
    expect(refused(s, { type: 'BUY', index: 0 })).toBe('Not enough ₱');
  });

  it('with no room, buys only a card that completes a merge', () => {
    const s = shop([...FILL.slice(0, 2), 'base1-26', ...FILL.slice(2, 5)], FILL.slice(5, 11), ['base1-46', 'base1-26']);
    expect(refused(s, { type: 'BUY', index: 0 })).toBe('No room: sell a card first');
    // A second Dratini merges with the board's (into Dragonair or Dark Dragonair): room for it.
    const after = must(must(s, { type: 'BUY', index: 1 }), { type: 'PICK', unit: 'base1-18' });
    expect(ids(after.board)[2]).toBe('base1-18');
    expect([...after.board, ...after.inventory].filter(Boolean)).toHaveLength(12);
  });

  it('sells for 75% of the price, rounded down', () => {
    const s = shop(['base1-61', 'base3-56', 'base1-32'], [], []);
    expect(sellPrice(s.board[0]!, pool)).toBe(45);
    expect(sellPrice(s.board[1]!, pool)).toBe(45); // Tentacool: Cowardice's full price went with the powers
    expect(sellPrice(s.board[2]!, pool)).toBe(Math.floor(DRAFT.cardPrice[unit('base1-32').tier - 1]! * 0.75));
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
    const s = shop(['base5-33', 'base1-61']);
    expect(shopSize(s)).toBe(3);
    s.shopTier = 4;
    expect(shopSize(s)).toBe(5);
  });

  it('keeps a frozen shop\'s unbought cards for the next, filling the rest; a reroll unfreezes', () => {
    let s = shop(['base1-61'], [], ['base1-43', 'base3-55', 'base1-26']);
    s = must(s, { type: 'BUY', index: 0 });
    s = must(s, { type: 'FREEZE' });
    expect(s.shop!.frozen).toBe(true);
    s = fight(s, weak(), 450);
    expect(s.shop!.offers.slice(0, 2)).toEqual(['base3-55', 'base1-26']);
    expect(s.shop!.offers).toHaveLength(3);
    expect(s.shop!.frozen).toBe(false);
    s = must(must(s, { type: 'FREEZE' }), { type: 'REROLL' });
    expect(s.shop!.frozen).toBe(false);
  });
});

describe('merging', () => {
  it('merges 2 Basics into the Stage 1, the player picking between 2 the TCG allows', () => {
    // Charmander evolves into Charmeleon or Dark Charmeleon: both are offered.
    let s = shop([FILL[0]!, 'base1-46'], [], ['base5-50']);
    s = must(s, { type: 'BUY', index: 0 });
    expect(s.pick).toMatchObject({ kind: 'merge', from: ['Charmander', 'Charmander'], place: { zone: 'board', at: 1 } });
    expect([...s.pick!.options].sort()).toEqual(['base1-24', 'base5-32']);
    expect(refused(s, { type: 'REROLL' })).toBe('Pick the card first');
    expect(refused(s, { type: 'PICK', unit: 'base1-4' })).toBe('Not one of the choices');
    s = must(s, { type: 'PICK', unit: 'base5-32' });
    expect(ids(s.board)).toEqual([FILL[0], 'base5-32', null, null, null, null]);
    expect(s.pick).toBeNull();
  });

  it('merges the board and the inventory together, the result in the board part\'s place', () => {
    let s = shop([FILL[0]!, 'base1-26'], [FILL[1]!]);
    s = must(s, { type: 'GIFT', unit: 'base5-53' }); // a Dratini, to the inventory: 2 Dratini make Dragonair or Dark Dragonair
    expect(s.pick!.place).toEqual({ zone: 'board', at: 1 });
    s = must(s, { type: 'PICK', unit: 'base1-18' });
    expect(ids(s.board)).toEqual([FILL[0], 'base1-18', null, null, null, null]);
    expect(ids(s.inventory)).toEqual([FILL[1], null, null, null, null, null]);
  });

  it('gives the only card a merge can give with no pick, and merges on up to the Stage 2', () => {
    // Two Dark Charmeleon make Dark Charizard, its only Stage 2.
    let s = shop(['base5-32'], [FILL[0]!]);
    s = must(s, { type: 'GIFT', unit: 'base5-32' });
    expect(s.pick).toBeNull();
    expect(ids(s.board)[0]).toBe('base5-4');
    expect(s.log.at(-1)).toBe('Dark Charmeleon and Dark Charmeleon merged into Dark Charizard.');
    // Two Charmander merging into a Charmeleon beside another make Charizard.
    s = shop(['base1-24', 'base1-46'], []);
    s = must(s, { type: 'GIFT', unit: 'base5-50' });
    s = must(s, { type: 'PICK', unit: 'base1-24' });
    expect(ids(s.board)).toEqual(['base1-4', null, null, null, null, null]);
  });

  it('follows the TCG\'s lines: owners\' Pokémon only with their owner\'s, Dark Pokémon from their plain Basic', () => {
    let s = shop(['base3-47'], []);
    s = must(s, { type: 'GIFT', unit: 'gym1-38' });
    expect(ids(s.board)).toEqual(['base3-47', 'gym1-38', null, null, null, null]);
    s = must(s, { type: 'GIFT', unit: 'gym2-68' }); // a second Brock's Geodude, another print: Brock's Graveler
    expect(s.pick!.options.every((id) => unit(id).name === "Brock's Graveler")).toBe(true);
    // Charmeleon and Dark Charmeleon evolve into different cards: no merge.
    s = shop(['base1-24'], []);
    s = must(s, { type: 'GIFT', unit: 'base5-32' });
    expect(ids(s.board)).toEqual(['base1-24', 'base5-32', null, null, null, null]);
  });

  it('keeps the parts\' bonuses, one both had once', () => {
    let s = shop(['base5-32'], []);
    (s.board[0] as PokemonCard).bonuses = [{ from: 'up', attack: 10, hp: 0 }, { from: 'tough', attack: 0, hp: 20 }];
    s.board[1] = card('base5-32', 1, { bonuses: [{ from: 'up', attack: 10, hp: 0 }] });
    s = must(s, { type: 'GIFT', unit: FILL[0]! }); // anything: settles the merge that was set up by hand
    const made = s.board.find((c) => c?.kind === 'pokemon' && c.unit === 'base5-4') as PokemonCard;
    expect(made.bonuses.map((b) => b.from)).toEqual(['up', 'tough']);
    expect(cardUnit(made, pool)).toMatchObject({ attack: unit('base5-4').attack + 10, hp: unit('base5-4').hp + 20 });
  });
});

describe('golden copies', () => {
  const lone = units.filter((u) => pool.lone(u));
  const twoPrints = lone.find((u) => !isLegendary(u) && lone.filter((v) => v.name === u.name).length >= 2)!;

  it('only a Pokémon with no evolution line goes golden', () => {
    expect(pool.lone(unit('base2-47'))).toBe(true); // Tauros
    expect(pool.lone(unit('base1-61'))).toBe(false); // Rattata: Raticate
    expect(pool.lone(unit('base1-26'))).toBe(false); // Dratini
    expect(pool.lone(unit('base1-24'))).toBe(false); // Charmeleon
    expect(pool.lone(unit('base1-4'))).toBe(false); // Charizard
  });

  it('makes 3 of a name golden, +20 attack and +20 HP, the player picking the print', () => {
    let s = shop(['base2-47', 'base2-47'], []);
    s = must(s, { type: 'GIFT', unit: 'base2-47' });
    const golden = s.board[0] as PokemonCard;
    expect(golden).toMatchObject({ unit: 'base2-47', golden: true });
    expect(cardUnit(golden, pool)).toMatchObject({ attack: unit('base2-47').attack + 20, hp: unit('base2-47').hp + 20 });
    expect(ids(s.board).filter(Boolean)).toHaveLength(1);
    // A golden copy is never part of another.
    s = must(must(s, { type: 'GIFT', unit: 'base2-47' }), { type: 'GIFT', unit: 'base2-47' });
    expect(ids(s.board).filter(Boolean)).toHaveLength(3);

    const other = lone.find((u) => u.name === twoPrints.name && u.id !== twoPrints.id)!;
    s = shop([twoPrints.id, other.id], []);
    s = must(s, { type: 'GIFT', unit: twoPrints.id });
    expect(s.pick).toMatchObject({ kind: 'golden' });
    expect([...s.pick!.options].sort()).toEqual([twoPrints.id, other.id].sort());
    s = must(s, { type: 'PICK', unit: other.id });
    expect(s.board[0]).toMatchObject({ unit: other.id, golden: true });
  });
});

describe('the shop\'s favour for cards held', () => {
  it('knows each unit\'s partners: the same stage evolving into the same card, or a golden copy\'s name', () => {
    const mates = (id: string) => pool.mates(id).map((u) => u.id).sort();
    expect(mates('base5-50')).toEqual(['base1-46', 'base5-50']); // Charmander, either print (Blaine's isn't his line)
    expect(mates('base1-24')).toEqual(['base1-24']); // Charmeleon: Dark Charmeleon evolves into another card
    expect(mates('base2-47')).toEqual(['base2-47']); // Tauros
    expect(mates('base1-4')).toEqual([]); // Charizard: nothing above it
  });

  it('shows a held card\'s partners about DRAFT.favour more often', () => {
    const share = (held: string[]) => {
      let s = shop(held);
      s.pokedollars = 1e6;
      let seen = 0;
      for (let i = 0; i < 1500; i++) {
        s = must(s, { type: 'REROLL' });
        seen += s.shop!.offers.filter((id) => id === 'base5-50').length;
      }
      return seen / 1500;
    };
    const lift = share(['base5-50']) - share([FILL[0]!]);
    expect(lift).toBeGreaterThan(DRAFT.favour * 0.6);
    expect(lift).toBeLessThan(DRAFT.favour * 3 * 1.5);
  });

  it('weighs a card by the battles it has been held, and a merge keeps its oldest part\'s', () => {
    const s = shop([], []);
    s.battles = 6;
    s.shopTier = 5;
    s.board[0] = card('base5-50', 1, { since: 0 });
    s.board[1] = card('base2-47', 2, { since: 5 });
    expect(wantedCards(s, pool).map((w) => w.weight)).toEqual([7, 2]);
    const merged = must({ ...s, board: [card('base5-32', 1, { since: 2 }), null, null, null, null, null] }, { type: 'GIFT', unit: 'base5-32' });
    expect(merged.board[0]).toMatchObject({ unit: 'base5-4', since: 2 });
  });
});

describe('gifts', () => {
  it('gives a card to a free place, and loses a gift with no room', () => {
    let s = shop([FILL[0]!], []);
    s = must(s, { type: 'GIFT', unit: 'base5-12' }); // Dark Slowbro: Reel In's gift went with the powers
    expect([...s.board, ...s.inventory].filter(Boolean)).toHaveLength(2);

    s = shop(FILL.slice(0, 6), FILL.slice(6, 12));
    s = must(s, { type: 'GIFT', unit: 'base5-5' });
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
    let s = shop(['base1-46'], [], ['base5-50']);
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
          { type: 'PICK', unit: s.pick?.options[int(rng, s.pick.options.length)] ?? 'base1-4' },
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
