// Safari Draft (issue #239, section 10): the economy check. A simple buying bot plays whole runs through the draft
// (applySafariAction) against the draft's own opponents (opponents.ts), and reports what the runs bank against the
// issue's target, an average run banking about ₱3,000–5,000, and how each difficulty goes. tools/safari/economy.ts runs
// it and writes the report.
//
// The bot sees what a player sees of the opponents offered, their difficulty and pay, never their boards: it takes the
// hardest whose tier by the curve (MEDIUM_TIERS, DIFFICULTY_TIER) is below its board's average (a tier beats the one
// below 93–95% of the time), or the easiest offered.
//
// The bot: picks the best starter and merge result (unitScore); raises the shop tier once its board is full and it can
// still buy a card after; buys what completes a merge, then what pairs with a card it holds (a merge or golden copy on the
// way), then the strongest card; sells its weakest card that pairs with nothing for a clearly stronger one or one that
// pairs; rerolls once when nothing was worth buying; and keeps its 6 strongest on the board. At an encounter step it takes
// an encounter, never a legendary's board (an upgrade first, then a card gift, the special shop, a Trainer gift): Rare
// Candy, then Protein; the gift that pairs with a card held, else the strongest; the special shop's cards that complete a
// merge or pair, and a Trainer card while it holds none. It plays its best Trainer card (TRAINER_RANK) in every battle.
import { BOARD_SIZE } from './battle.js';
import type { TrainerName } from './effects.js';
import type { EncounterKind } from './encounters.js';
import { applySafariAction, cardPrice, cardUnit, createSafari, draftPool, tierPrice, type Card, type DraftPool, type Place, type PokemonCard, type SafariAction, type SafariState, type SafariSystemAction } from './draft.js';
import { DIFFICULTY_TIER, MEDIUM_TIERS, type Difficulty } from './opponents.js';
import { TOP_TIER, unitScore, type Unit } from './units.js';

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
  /** The battle (1–16) by which the run first held a Stage 2 or a golden copy, if it did. */
  firstTop: number | null;
  /** Battles fought (the Champion's and extra ones too), and of the 15 when the run ended. */
  fought: number;
  battles: number;
  /** Encounters taken. */
  encounters: number;
  /** Battles fought and won by the opponent's difficulty. */
  byDifficulty: Partial<Record<Difficulty, { fought: number; won: number }>>;
}

/** The Trainer cards by what the balance report measured them worth (their average over tiers 1, 3 and 5), the best first. */
export const TRAINER_RANK: TrainerName[] = ['Defender', 'PlusPower', 'Imposter Professor Oak', 'Super Potion', 'Super Energy Removal', 'Pokémon Center', 'Gust of Wind', 'Scoop Up', 'Gambler', 'Full Heal', 'Revive', 'Energy Removal', 'Potion', 'Bill', 'Professor Oak'];
/** The encounters the bot takes, the likeliest to help first (never a legendary's board). */
const ENCOUNTER_RANK: EncounterKind[] = ['upgrade', 'cardGift', 'specialShop', 'trainerGift'];

const clampTier = (t: number) => Math.min(TOP_TIER, Math.max(1, t));

const pokemon = (cards: readonly (Card | null)[]) => cards.filter((c): c is PokemonCard => c?.kind === 'pokemon');
/** The player's Pokémon cards and where they are. */
const placed = (state: SafariState) =>
  (['board', 'inventory'] as const).flatMap((zone) => (zone === 'board' ? state.board : state.inventory).map((c, at) => ({ c, place: { zone, at } as Place }))).filter((x): x is { c: PokemonCard; place: Place } => x.c?.kind === 'pokemon');
const scoreOf = (card: PokemonCard, pool: DraftPool) => unitScore(cardUnit(card, pool));

/** Plays one run with the bot. Throws if the draft refuses an action the bot thought legal more than it should. */
export function botRun(units: readonly Unit[], seed: number): BotRun {
  const pool = draftPool(units);
  let state = createSafari(seed, units);
  const out: BotRun = { won: false, banked: 0, pokedollars: 0, hp: 0, battlesLost: 0, draws: 0, championTries: 0, shopTier: 1, bought: 0, sold: 0, merges: 0, goldens: 0, rerolls: 0, earned: 0, onCards: 0, onTiers: 0, onRerolls: 0, fromSales: 0, firstTop: null, fought: 0, battles: 0, encounters: 0, byDifficulty: {} };
  const apply = (action: SafariAction | SafariSystemAction) => {
    const result = applySafariAction(state, action, units);
    if (!result.ok) throw new Error(`The bot's ${action.type} was refused: ${result.error}`);
    const before = state;
    state = result.state;
    const log = state.log.slice(before.log.length);
    out.merges += log.filter((l) => l.includes('merged into')).length;
    out.goldens += log.filter((l) => l.includes('made a golden')).length;
    if (out.firstTop === null && pokemon([...state.board, ...state.inventory]).some((c) => c.golden || pool.units.get(c.unit)!.stage === 'stage2')) out.firstTop = state.battles + 1;
    return before;
  };
  const tryApply = (action: SafariAction) => applySafariAction(state, action, units);
  const pickBest = () => {
    while (state.pick) apply({ type: 'PICK', unit: [...state.pick.options].sort((a, b) => unitScore(pool.units.get(b)!) - unitScore(pool.units.get(a)!))[0]! });
  };

  /** Takes what helps from the open encounter. */
  const resolveEncounter = () => {
    const open = state.encounter;
    if (!open) return;
    const cards = pokemon([...state.board, ...state.inventory]);
    const pairs = (id: string) => cards.some((c) => !c.golden && pool.mates(c.unit).some((u) => u.id === id));
    if (open.kind === 'upgrade') {
      const order = ['rareCandy', 'protein', 'keyword', 'hpUp'];
      const best = open.upgrades.map((u, i) => ({ u, i })).sort((a, b) => order.indexOf(a.u.kind) - order.indexOf(b.u.kind))[0];
      apply(best ? { type: 'TAKE', index: best.i } : { type: 'LEAVE' });
      return;
    }
    if (open.kind === 'cardGift') {
      const best = open.cards.map((id, i) => ({ i, pairs: pairs(id), score: unitScore(pool.units.get(id)!) })).sort((a, b) => Number(b.pairs) - Number(a.pairs) || b.score - a.score)[0]!;
      apply({ type: 'TAKE', index: best.i });
      return;
    }
    if (open.kind === 'trainerGift') {
      const best = open.trainers.map((t, i) => ({ i, rank: TRAINER_RANK.indexOf(t) })).sort((a, b) => a.rank - b.rank)[0]!;
      apply({ type: 'TAKE', index: best.i });
      return;
    }
    // The special shop.
    for (let guard = 0; guard < 10 && state.encounter?.kind === 'specialShop'; guard++) {
      const shop = state.encounter;
      const want = shop.cards.findIndex((id) => !!id && pairs(id) && cardPrice(pool.units.get(id)!.tier) <= state.pokedollars && tryApply({ type: 'TAKE', index: shop.cards.indexOf(id) }).ok);
      if (want >= 0) {
        out.onCards += cardPrice(pool.units.get(shop.cards[want]!)!.tier);
        apply({ type: 'TAKE', index: want });
        out.bought++;
        pickBest();
        continue;
      }
      const t = shop.trainers.findIndex((x) => !!x);
      if (t >= 0 && !state.inventory.some((c) => c?.kind === 'trainer') && state.pokedollars >= 100 + cardPrice(state.shopTier) && tryApply({ type: 'TAKE', index: shop.cards.length + t }).ok) {
        out.onCards += 100;
        apply({ type: 'TAKE', index: shop.cards.length + t });
        continue;
      }
      break;
    }
    if (state.encounter) apply({ type: 'LEAVE' });
  };

  apply({ type: 'PICK_STARTER', unit: [...state.starters].sort((a, b) => unitScore(pool.units.get(b)!) - unitScore(pool.units.get(a)!))[0]! });
  pickBest();

  for (let step = 0; step < 100 && state.phase === 'shop'; step++) {
    pickBest();
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
      /** Whether a unit would pair with a card held (a merge or golden copy on the way). */
      const pairs = (id: string, but?: number) => cards.some((c) => c.key !== but && !c.golden && pool.mates(c.unit).some((u) => u.id === id));
      const offers = shop.offers
        .map((id, index) => ({ id, index }))
        .filter((o): o is { id: string; index: number } => !!o.id && cardPrice(pool.units.get(o.id)!.tier) <= state.pokedollars)
        .map((o) => {
          const tried = tryApply({ type: 'BUY', index: o.index });
          const merges = tried.ok && pokemon([...tried.state.board, ...tried.state.inventory]).length + (tried.state.pick ? 1 : 0) <= cards.length;
          return { ...o, ok: tried.ok, merges, pairs: pairs(o.id), score: unitScore(pool.units.get(o.id)!) };
        })
        .sort((a, b) => Number(b.merges) - Number(a.merges) || Number(b.pairs) - Number(a.pairs) || b.score - a.score);
      const best = offers[0];
      if (best?.ok) {
        const price = cardPrice(pool.units.get(best.id)!.tier);
        apply({ type: 'BUY', index: best.index });
        out.bought++;
        out.onCards += price;
        continue;
      }
      // No room: sell the weakest card that pairs with nothing held, for a clearly stronger one or one that pairs.
      const all = placed(state).sort((a, b) => scoreOf(a.c, pool) - scoreOf(b.c, pool));
      const weakest = all.find((x) => !pairs(x.c.unit, x.c.key)) ?? all[0];
      if (best && weakest && (best.score > scoreOf(weakest.c, pool) * 1.15 || (best.pairs && !pairs(weakest.c.unit, weakest.c.key)))) {
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

    // An encounter step: an encounter (not a legendary's board), whenever one is offered.
    const encounter = ENCOUNTER_RANK.map((kind) => state.encounters.findIndex((e) => e.kind === kind)).find((i) => i >= 0);
    if (encounter !== undefined) {
      apply({ type: 'ENCOUNTER', index: encounter });
      out.encounters++;
      resolveEncounter();
      pickBest();
      continue;
    }

    // Its best Trainer card.
    const trainers = state.inventory.filter((c): c is Extract<Card, { kind: 'trainer' }> => c?.kind === 'trainer').sort((a, b) => TRAINER_RANK.indexOf(a.trainer) - TRAINER_RANK.indexOf(b.trainer));
    if (trainers[0] && state.trainer !== trainers[0].key) apply({ type: 'SET_TRAINER', key: trainers[0].key });

    // The hardest opponent a tier below the board's average (a tier beats the one below 93–95% of the time), else the easiest.
    const mine = pokemon(state.board).map((c) => pool.units.get(c.unit)!.tier);
    const strength = Math.round(mine.reduce((x, y) => x + y, 0) / Math.max(1, mine.length));
    const tierOf = (d: Difficulty) => (d === 'champion' || d === 'legendary' ? TOP_TIER : clampTier(MEDIUM_TIERS[Math.min(state.battles, MEDIUM_TIERS.length - 1)]! + DIFFICULTY_TIER[d]));
    const index = state.opponents.map((o, i) => ({ o, i })).reverse().find(({ o }) => tierOf(o.difficulty) < strength)?.i ?? 0;
    const difficulty = state.opponents[index]!.difficulty;
    apply({ type: 'CHOOSE', index });
    const before = apply({ type: 'BATTLE' });
    out.earned += state.pokedollars - before.pokedollars;
    out.fought++;
    const tally = (out.byDifficulty[difficulty] ??= { fought: 0, won: 0 });
    tally.fought++;
    if (state.last!.winner === 0) tally.won++;
    if (state.last!.winner === 1) out.battlesLost++;
    if (state.last!.winner === 'draw') out.draws++;
  }

  Object.assign(out, { won: state.phase === 'won', banked: state.phase === 'won' ? state.pokedollars : 0, pokedollars: state.pokedollars, hp: state.hp, championTries: state.championTries, shopTier: state.shopTier, battles: state.battles });
  return out;
}

/** Many bot runs, from consecutive seeds. */
export const botRuns = (units: readonly Unit[], runs: number, seed: number) => Array.from({ length: runs }, (_, i) => botRun(units, seed + i));
