// Safari Draft (issue #239, section 9): what the browser gets of a run. The server keeps the rest: the RNG state (so the
// shop's next rolls and the battles' coins can't be foreseen), the step's opponents' boards and Trainers (the choice
// shows only the trainer, type, difficulty and pay: opponentChoice), Blue's board until he's chosen, the encounter steps
// still to come, and the gifts waiting behind a pick. The last battle is sent with its event log, played again from its
// seed (simulateBattle is a pure function of the boards and the seed), for the screen to play back. The prices the screen
// shows (a reroll's, the shop tier's, each card's sale) come with it, worked out by the draft's own rules, so the
// browser needs no unit pool.
import { simulateBattle, type BattleEvent } from './battle.js';
import { SPECIAL_SHOP } from './encounters.js';
import { cardPrice, cardUnit, draftPool, rerollPrice, sellPrice, tierPrice, type SafariBattle, type SafariState } from './draft.js';
import { opponentChoice } from './opponents.js';
import type { Unit } from './units.js';

export interface SafariPrices {
  /** A reroll now: 0 while free (the board's powers, Professor Oak). */
  reroll: number;
  /** The next shop tier, or null at the top. */
  tier: number | null;
  /** What each card held sells for, by its key. */
  sell: Record<number, number>;
  /** The shop's cards (null where bought), and an open special shop's cards then Trainer cards. */
  shop: (number | null)[];
  special: (number | null)[];
}

export type SafariView = Omit<SafariState, 'rngState' | 'opponents' | 'champion' | 'encounterSteps' | 'gifts' | 'last'> & {
  opponents: ReturnType<typeof opponentChoice>[];
  /** The last battle, with its events (the screen plays them back). */
  last: (SafariBattle & { events: BattleEvent[] }) | null;
  prices: SafariPrices;
  /** Each Pokémon card held as it fights, by its key: its print's numbers with its bonuses and golden's (cardUnit). */
  stats: Record<number, { attack: number; hp: number; keyword?: string }>;
};

/** The prices the screen shows, by the draft's rules. */
export function safariPrices(state: SafariState, units: readonly Unit[]): SafariPrices {
  const pool = draftPool(units);
  const tierOf = (id: string) => pool.units.get(id)?.tier ?? 1;
  const held = [...state.board, ...state.inventory].filter((c) => c !== null);
  const open = state.encounter?.kind === 'specialShop' ? state.encounter : null;
  return {
    reroll: rerollPrice(state, pool),
    tier: tierPrice(state),
    sell: Object.fromEntries(held.map((c) => [c.key, sellPrice(c, pool)])),
    shop: state.shop?.offers.map((id) => (id ? cardPrice(tierOf(id)) : null)) ?? [],
    special: open ? [...open.cards.map((id) => (id ? cardPrice(tierOf(id)) : null)), ...open.trainers.map((t) => (t ? SPECIAL_SHOP.trainerPrice : null))] : [],
  };
}

/** Each Pokémon card held as it fights (cardUnit), by its key. */
export function heldStats(state: SafariState, units: readonly Unit[]): SafariView['stats'] {
  const pool = draftPool(units);
  const cards = [...state.board, ...state.inventory].filter((c) => c?.kind === 'pokemon');
  return Object.fromEntries(
    cards.map((c) => {
      const u = cardUnit(c, pool);
      return [c.key, { attack: u.attack, hp: u.hp, ...(u.keyword && { keyword: u.keyword }) }];
    }),
  );
}

export function safariView(state: SafariState, units: readonly Unit[]): SafariView {
  const { rngState: _rng, opponents, champion: _champion, encounterSteps: _steps, gifts: _gifts, last, ...shown } = state;
  return {
    ...shown,
    opponents: opponents.map(opponentChoice),
    last: last && { ...last, events: simulateBattle(last.mine, last.opponent, last.seed).events },
    prices: safariPrices(state, units),
    stats: heldStats(state, units),
  };
}
