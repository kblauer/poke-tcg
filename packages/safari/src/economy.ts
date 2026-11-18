// Safari Draft (issue #239, section 10): the economy check. A simple buying bot plays whole runs through the draft
// (applySafariAction) against stand-in opponents, and reports what the runs bank against the issue's target, an average
// run banking about ₱3,000–5,000. tools/safari/economy.ts runs it and writes the report.
//
// The opponents are a stand-in until step 3 builds them: each battle one of each difficulty (easy, medium, hard, gym
// leader), paying the issue's 450 / 550 / 700 / 850, with a board of 6 random units one tier apart by difficulty around a
// tier that rises through the run (STANDIN_TIERS); the Champion a top-tier board with Defender, paying 1,000. The bot
// takes the hardest a tier below its board's average, or the easiest.
//
// The bot: picks the best starter and merge result (unitScore), raises the shop tier once its board is full and it can still buy a card after,
// buys what completes a merge first and then the strongest card, sells its weakest card for a clearly stronger one, rerolls
// once when nothing was worth buying, and keeps its 6 strongest on the board.
import { int, rngFrom, sample, type Rng } from '@poke-tcg/campaign';
import { BOARD_SIZE, type Board } from './battle.js';
import { applySafariAction, cardPrice, cardUnit, createSafari, draftPool, tierPrice, type Card, type DraftPool, type Place, type PokemonCard, type SafariAction, type SafariState, type SafariSystemAction } from './draft.js';
import { TOP_TIER, unitScore, type Unit } from './units.js';

/** What the stand-in opponents pay by difficulty (the issue's easy / medium / hard / gym leader), and the Champion. */
export const STANDIN_PAY = [450, 550, 700, 850];
export const STANDIN_CHAMPION_PAY = 1000;
/** The tier a medium opponent's board is, by battle (0–14): easier ones a tier lower, harder ones higher. */
export const STANDIN_TIERS = [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5];

/** One run the bot played. */
export interface BotRun {
  won: boolean;
  /** ₱ banked (0 unless won), and ₱ held at the end either way. */
  banked: number;
  pokedollars: number;
  hp: number;
  battlesLost: number;
  draws: number;
  championTries: number;
  shopTier: number;
  /** Cards bought, sold, merges and golden copies made, rerolls paid for. */
  bought: number;
  sold: number;
  merges: number;
  goldens: number;
  rerolls: number;
  /** ₱ earned by battles, spent on cards, on the shop tier and on rerolls, and got back selling. */
  earned: number;
  onCards: number;
  onTiers: number;
  onRerolls: number;
  fromSales: number;
}

const clampTier = (t: number) => Math.min(TOP_TIER, Math.max(1, t));

/**
 * The stand-in opponents for the next battle, easiest first: one of each difficulty, its board 6 random units of its
 * tier, and what it pays; the Champion alone.
 */
export function standInOpponents(rng: Rng, units: readonly Unit[], state: SafariState): { opponent: Board; pay: number; tier: number }[] {
  const board = (tier: number) => sample(rng, units.filter((u) => u.tier === tier), BOARD_SIZE);
  if (state.battles >= STANDIN_TIERS.length) return [{ opponent: { units: board(TOP_TIER), trainer: 'Defender' }, pay: STANDIN_CHAMPION_PAY, tier: TOP_TIER }];
  return STANDIN_PAY.map((pay, difficulty) => {
    const tier = clampTier(STANDIN_TIERS[state.battles]! + difficulty - 1);
    return { opponent: { units: board(tier) }, pay, tier };
  });
}

const pokemon = (cards: readonly (Card | null)[]) => cards.filter((c): c is PokemonCard => c?.kind === 'pokemon');
/** The player's Pokémon cards and where they are. */
const placed = (state: SafariState) =>
  (['board', 'inventory'] as const).flatMap((zone) => (zone === 'board' ? state.board : state.inventory).map((c, at) => ({ c, place: { zone, at } as Place }))).filter((x): x is { c: PokemonCard; place: Place } => x.c?.kind === 'pokemon');
const scoreOf = (card: PokemonCard, pool: DraftPool) => unitScore(cardUnit(card, pool));

/** Plays one run with the bot. Throws if the draft refuses an action the bot thought legal more than it should. */
export function botRun(units: readonly Unit[], seed: number): BotRun {
  const pool = draftPool(units);
  const rng = rngFrom(seed ^ 0x5afa21);
  let state = createSafari(seed, units);
  const out: BotRun = { won: false, banked: 0, pokedollars: 0, hp: 0, battlesLost: 0, draws: 0, championTries: 0, shopTier: 1, bought: 0, sold: 0, merges: 0, goldens: 0, rerolls: 0, earned: 0, onCards: 0, onTiers: 0, onRerolls: 0, fromSales: 0 };
  const apply = (action: SafariAction | SafariSystemAction) => {
    const result = applySafariAction(state, action, units);
    if (!result.ok) throw new Error(`The bot's ${action.type} was refused: ${result.error}`);
    const before = state;
    state = result.state;
    const log = state.log.slice(before.log.length);
    out.merges += log.filter((l) => l.includes('merged into')).length;
    out.goldens += log.filter((l) => l.includes('made a golden')).length;
    return before;
  };
  const tryApply = (action: SafariAction) => applySafariAction(state, action, units);
  const pickBest = () => {
    while (state.pick) apply({ type: 'PICK', unit: [...state.pick.options].sort((a, b) => unitScore(pool.units.get(b)!) - unitScore(pool.units.get(a)!))[0]! });
  };

  apply({ type: 'PICK_STARTER', unit: [...state.starters].sort((a, b) => unitScore(pool.units.get(b)!) - unitScore(pool.units.get(a)!))[0]! });
  pickBest();

  for (let step = 0; step < 100 && state.phase === 'shop'; step++) {
    // The shop.
    let rerolled = 0;
    for (let guard = 0; guard < 40; guard++) {
      pickBest();
      const shop = state.shop!;
      const tier = tierPrice(state);
      if (tier !== null && pokemon(state.board).length === BOARD_SIZE && state.pokedollars >= tier + cardPrice(state.shopTier)) {
        apply({ type: 'TIER_UP' });
        out.onTiers += tier;
        continue;
      }
      const cards = pokemon([...state.board, ...state.inventory]);
      const offers = shop.offers
        .map((id, index) => ({ id, index }))
        .filter((o): o is { id: string; index: number } => !!o.id && cardPrice(pool.units.get(o.id)!.tier) <= state.pokedollars)
        .map((o) => {
          const tried = tryApply({ type: 'BUY', index: o.index });
          const merges = tried.ok && pokemon([...tried.state.board, ...tried.state.inventory]).length + (tried.state.pick ? 1 : 0) <= cards.length;
          return { ...o, ok: tried.ok, merges, score: unitScore(pool.units.get(o.id)!) };
        })
        .sort((a, b) => Number(b.merges) - Number(a.merges) || b.score - a.score);
      const best = offers[0];
      if (best?.ok) {
        const price = cardPrice(pool.units.get(best.id)!.tier);
        apply({ type: 'BUY', index: best.index });
        out.bought++;
        out.onCards += price;
        continue;
      }
      // No room: sell the weakest card for a clearly stronger one.
      const weakest = placed(state).sort((a, b) => scoreOf(a.c, pool) - scoreOf(b.c, pool))[0];
      if (best && weakest && best.score > scoreOf(weakest.c, pool) * 1.15) {
        const before = apply({ type: 'SELL', place: weakest.place });
        out.sold++;
        out.fromSales += state.pokedollars - before.pokedollars;
        continue;
      }
      if (!rerolled && state.pokedollars >= 20 + cardPrice(1)) {
        const before = apply({ type: 'REROLL' });
        out.rerolls++;
        out.onRerolls += before.pokedollars - state.pokedollars;
        rerolled++;
        continue;
      }
      break;
    }
    pickBest();

    // The 6 strongest on the board.
    for (let guard = 0; guard < 12; guard++) {
      const everyone = placed(state);
      const top = new Set([...everyone].sort((a, b) => scoreOf(b.c, pool) - scoreOf(a.c, pool)).slice(0, BOARD_SIZE).map((x) => x.c.key));
      const up = everyone.find((x) => x.place.zone === 'inventory' && top.has(x.c.key));
      if (!up) break;
      const down = state.board.findIndex((c) => !c || !top.has(c.key));
      apply({ type: 'MOVE', from: up.place, to: { zone: 'board', at: down } });
    }

    // The hardest opponent a tier below the board's average (a tier beats the one below 93–95% of the time), else the easiest.
    const mine = pokemon(state.board).map((c) => pool.units.get(c.unit)!.tier);
    const strength = Math.round(mine.reduce((x, y) => x + y, 0) / Math.max(1, mine.length));
    const choices = standInOpponents(rng, units, state);
    const { opponent, pay } = [...choices].reverse().find((o) => o.tier < strength) ?? choices[0]!;
    const before = apply({ type: 'FIGHT', opponent, pay });
    out.earned += state.pokedollars - before.pokedollars;
    if (state.last!.winner === 1) out.battlesLost++;
    if (state.last!.winner === 'draw') out.draws++;
  }

  Object.assign(out, { won: state.phase === 'won', banked: state.phase === 'won' ? state.pokedollars : 0, pokedollars: state.pokedollars, hp: state.hp, championTries: state.championTries, shopTier: state.shopTier });
  return out;
}

/** Many bot runs, from consecutive seeds. */
export const botRuns = (units: readonly Unit[], runs: number, seed: number) => Array.from({ length: runs }, (_, i) => botRun(units, seed + i));
