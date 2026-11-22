// Safari Draft (issue #239, sections 4, 6 and 7): the draft. A run's state (SafariState: plain JSON, with a version, as
// TowerState and RunState are) and its reducer, applySafariAction, which takes the units it plays with (draftPool's).
//
// What the issue fixes:
//   - the start: the player picks 1 of 3 random tier-1 Basics, gets the starting ₱ and a first shop;
//   - 15 battles, then the Champion, on 3 HP: a lost battle costs 1 and the run moves on; a draw costs nothing and pays
//     nothing; the Champion is fought again after a loss while HP lasts, and after a draw; beating him ends the run won,
//     its ₱ banked (by the API); at 0 HP, or conceded, the run is lost and banks nothing;
//   - after every battle a shop: cards to buy, the shop tier (bought with ₱, 20 cheaper for every battle since the last
//     was bought, never under half), reroll and freeze; a card's price by its tier, sold back for 75% rounded down;
//   - 6 on the board, 6 in the inventory; a Trainer card takes inventory room; one Trainer chosen for a battle is used up;
//   - merging by the games' evolution lines (issue #254), by name (unitEvolvesFrom): any 2 units that could evolve
//     into the same card merge, at once, counting the board and the inventory together; the result the player's pick of
//     2 random ones the TCG allows; a merged unit keeps its parts' bonuses, one both had once;
//   - golden copies: 3 of the same name of a Pokémon with no evolution line make a golden one, the player picking which
//     (one unit a Pokémon now, issue #254: nothing left to pick);
//   - Stage 2s and the legendaries are never in a shop.
//
// The user's (2026-11-18, the issue's "Not specified yet"):
//   - a shop of tier N shows units of tier N or lower, Battlegrounds' way: a tier by DRAFT.tierWeights, then any of its
//     units;
//   - golden is +20 attack and +20 HP (DRAFT.golden);
//   - the shop favours the cards the player has (wantedCards, DRAFT.favour): a shop card is a partner of one of them
//     (a unit it would merge with, or of a golden copy's name) that often, the card picked by how many battles it has been
//     held, so a Pokémon held for many battles can be fully evolved or golden by about the 10th (2026-11-18);
//   - the legendaries kept out of shops are species.ts's (issue #254: 21 of Gen 1–3's, isLegendary);
//   - with no room, a card is bought only if it completes a merge or a golden copy (which frees room); a gift with no room
//     is lost (and said so in the log).
//
// Mine, placeholders to check with the user (README: Safari Draft):
//   - a bought card goes to the board's first free place, the inventory's when the board is full; a merge's result takes
//     the place of its first part, a board part's before an inventory one's;
//   - a merge with only one card it can give, or a golden copy, gives it with no pick;
//   - when several merges are possible, the board's cards go first, left to right, then the inventory's;
//   - a freeze keeps the shop's unbought cards for the next shop, which fills the rest; a reroll unfreezes;
//   - Bill pays DRAFT.bill, Pay Day DRAFT.payDay a Knock Out (won or lost); a Trainer card sells as a tier-1 card.
//
// A battle step (opponents.ts, step 3): the shop shows 1–3 opponents, never their boards; CHOOSE takes one (phase
// `ready`: its board is shown, and only the board's order and the Trainer can still change, the issue's 6.2), BATTLE
// plays it. After the 15 battles the only opponent is the Champion, rolled when the run starts. The 5 encounter steps
// (encounters.ts, step 4) come between battles: the step's opponents and one encounter, or two encounters; ENCOUNTER opens
// one (phase `encounter`: TAKE an option or a special shop's card, LEAVE to end it), a battle there is an extra one (not
// one of the 15), and a legendary's board is fought for the legendary. GIFT, the server's, gives a card.
import { chance, int, pick as pickOne, rngFrom, sample, seed as newSeed, weighted, type Rng } from '@poke-tcg/campaign';
import { BOARD_SIZE, simulateBattle, type Board, type SideId } from './battle.js';
import { TRAINER_NAMES, type TrainerName } from './effects.js';
import { GIFT_CHOICES, LEGENDARY_FROM, MAX_KEYWORDS, SPECIAL_SHOP, UPGRADES, UPGRADE_CHOICES, UPGRADE_KEYWORDS, legendaryOpponent, legendaryUnits, rollEncounterOffers, rollEncounterSteps, type EncounterOffer, type EncounterStep, type OpenEncounter, type Upgrade } from './encounters.js';
import { rollChampion, rollOpponents, type Opponent } from './opponents.js';
import { TOP_TIER, abilityName, unitEvolvesFrom, type Ability, type Unit, type UnitStage } from './units.js';

/** The draft's numbers: the issue's (section 7, approved as placeholders) but where marked. */
export const DRAFT = {
  battles: 15,
  hp: 3,
  startPokedollars: 300,
  starters: 3,
  inventory: 6,
  /** A card's price by its tier, 1 to 5. */
  cardPrice: [60, 90, 120, 160, 200],
  /** Selling refunds this share of the price, rounded down. */
  sellShare: 0.75,
  /** A shop's first reroll, and how much more each one after it costs in the same shop (the user's, 2026-11-22: a new shop starts again; the step mine). */
  reroll: 20,
  rerollStep: 10,
  /** The shop tier: what tiers 2 to 5 cost, 20 cheaper for every battle since the last was bought, never under half (dearer by the tier: the user's, 2026-11-22; the numbers mine). */
  tierPrice: [200, 300, 450, 600],
  tierDiscount: 20,
  /** Cards a shop shows, by its tier. */
  shopSize: [3, 4, 4, 5, 5],
  /** How likely a shop card is of each tier, 1 to 5, among those the shop's tier shows (the user's: Battlegrounds' copy counts). */
  tierWeights: [16, 15, 13, 11, 9],
  /**
   * How often a shop card is a partner of a card the player has (one it would merge with, or a golden copy's name), the
   * card picked by how many battles the player has held it (the user's, 2026-11-18: the shop favours cards you have, so a
   * Pokémon held for many battles can be fully evolved or golden by about the 10th; the share measured with the economy
   * check's bot, with the encounters' card gifts (which favour them too) and Rare Candy: at 0.04 80% of runs alive at
   * battle 10 hold a Stage 2 or golden copy by then, the first by battle 7–8 (median), a golden copy about one run in 3;
   * none 68% and almost never a golden copy, 0.08 95% by battle 6. Before the encounters 0.08 gave 78% by battle 8).
   */
  favour: 0.04,
  /** A golden copy's bonus (the user's, 2026-11-18). */
  golden: { attack: 20, hp: 20 },
  /**
   * The share of an opponent's pay a battle not won still brings (the user's, 2026-11-18): a loss half, a draw three
   * quarters, rounded down to ₱10.
   */
  lossShare: 0.5,
  drawShare: 0.75,
  /** Mine, placeholders: what Bill pays after the battle, Pay Day for each Knock Out, a Trainer card's price. */
  bill: 100,
  payDay: 20,
  trainerPrice: 60,
};

/** Never in a shop: encounter rewards only (issue #254, section 1: species.ts marks them). */
export const isLegendary = (u: Pick<Unit, 'legendary'>) => !!u.legendary;

/** A unit's lasting bonus: an upgrade's (step 4). A merge keeps each `from` once. */
export interface Bonus {
  from: string;
  attack: number;
  hp: number;
  /** A keyword upgrade's: one more keyword for the Pokémon. */
  ability?: Ability;
}

/** One of the player's cards. `key` is the card's own for the whole run. */
/** A Pokémon card's `since`: the battles fought when it was gained (a merge's the oldest part's), for the shop's favour. */
export type Card = { key: number; kind: 'pokemon'; unit: string; golden?: true; bonuses: Bonus[]; since?: number } | { key: number; kind: 'trainer'; trainer: TrainerName };
export type PokemonCard = Extract<Card, { kind: 'pokemon' }>;

export type Zone = 'board' | 'inventory';
export interface Place {
  zone: Zone;
  at: number;
}

export interface Shop {
  /** Unit ids; null once bought. */
  offers: (string | null)[];
  /** Kept for the next shop (FREEZE). */
  frozen: boolean;
  /** Every reroll free (Professor Oak). */
  oak: boolean;
  /** Rerolls made in this shop: each costs more than the last (absent on a shop saved before 2026-11-22). */
  rerolls?: number;
}

/** A merge's or golden copy's result, waiting for the player's pick (PICK). Its parts are already gone. */
export interface DraftPick {
  /** evolve: Rare Candy's (an upgrade). */
  kind: 'merge' | 'golden' | 'evolve';
  options: string[];
  /** What it was made of, for the screen and the log. */
  from: string[];
  bonuses: Bonus[];
  place: Place;
  /** The oldest part's `since`. */
  since: number;
}

/** The last battle: enough to play it again (simulateBattle is a pure function of the boards and the seed). */
export interface SafariBattle {
  mine: Board;
  opponent: Board;
  seed: number;
  winner: SideId | 'draw';
  champion: boolean;
  /** Who it was against: the opponent's name, boss and difficulty. */
  against: Pick<Opponent, 'name' | 'boss' | 'difficulty'>;
  /** ₱ it brought: the opponent's pay (all of it for a win, a share for a draw or a loss), Pay Day's, Bill's. */
  pay: number;
  payDay: number;
  bill: number;
}

/** The rules a run is played by: 2 is issue #254's units (one a species), 3 its Trainer cards and keywords by generation (2026-11-22). A saved run of other rules can't be played on. */
export const RULES = 3;

export interface SafariState {
  /** The rules it was started under (RULES). */
  rules: number;
  /** Bumped by every action; saves check it (optimistic concurrency, as runs). */
  version: number;
  rngState: number;
  /**
   * starter: picking the first Pokémon; shop: between battles, the shop open and the opponents offered; ready: an opponent
   * chosen, its board shown, the battle not yet started; encounter: an encounter open; won: the Champion beaten; lost: 0 HP
   * or conceded.
   */
  phase: 'starter' | 'shop' | 'ready' | 'encounter' | 'won' | 'lost';
  /** The starters offered. */
  starters: string[];
  hp: number;
  pokedollars: number;
  /** Battles fought before the Champion (DRAFT.battles of them), and tries at him. */
  battles: number;
  championTries: number;
  shopTier: number;
  /** Battles since the shop tier was last bought (its price falls with them). */
  sinceTier: number;
  shop: Shop | null;
  /** Left to right: the board's order is the battle's. */
  board: (Card | null)[];
  inventory: (Card | null)[];
  /** The inventory Trainer card (its key) played in the next battle. */
  trainer: number | null;
  pick: DraftPick | null;
  /** Cards still to be given once a pick is made (Reel In, Summon Minions). */
  gifts: string[];
  nextKey: number;
  /** The next shop's rerolls are free (Professor Oak). */
  oakNext: boolean;
  conceded: boolean;
  /** The step's opponents (their boards hidden until chosen: the API's view), the one chosen, and Blue for this run. */
  opponents: Opponent[];
  opponent: Opponent | null;
  champion: Opponent;
  /** The gym leaders fought this run (their ids): each at most once. */
  leadersMet: string[];
  /** The encounter steps still to come, in order; the step's encounters offered, and the one open. */
  encounterSteps: EncounterStep[];
  encounters: EncounterOffer[];
  encounter: OpenEncounter | null;
  /** A legendary's board has been offered and taken (once a run). */
  legendaryMet: boolean;
  last: SafariBattle | null;
  log: string[];
}

export type SafariAction =
  | { type: 'PICK_STARTER'; unit: string }
  /** Buy the shop's card at `index`. */
  | { type: 'BUY'; index: number }
  | { type: 'SELL'; place: Place }
  /** Swap what's in two places (an empty one too): the board's order, the board and the inventory. */
  | { type: 'MOVE'; from: Place; to: Place }
  | { type: 'REROLL' }
  /** Freeze the shop for the next one, or unfreeze it. */
  | { type: 'FREEZE' }
  | { type: 'TIER_UP' }
  /** A merge's or golden copy's result. */
  | { type: 'PICK'; unit: string }
  /** The inventory Trainer card (its key) for the next battle, or none. */
  | { type: 'SET_TRAINER'; key: number | null }
  /** Battle the step's opponent at `index`: its board is shown, the shop closes. */
  | { type: 'CHOOSE'; index: number }
  /** Start the chosen battle. */
  | { type: 'BATTLE' }
  /** Open the step's encounter at `index` (a legendary's board: its battle, as CHOOSE). */
  | { type: 'ENCOUNTER'; index: number }
  /** Take the open encounter's option at `index`: an upgrade, a gift, or a special shop's card (its cards, then its Trainers). */
  | { type: 'TAKE'; index: number }
  /** End the open encounter, taking nothing more. */
  | { type: 'LEAVE' }
  | { type: 'CONCEDE' };

/** Actions only the server sends. Never accepted from clients. */
export type SafariSystemAction =
  /** A card given (step 4's encounters). */
  | { type: 'GIFT'; unit: string }
  | { type: 'GIFT'; trainer: TrainerName };

export type SafariResult = { ok: true; state: SafariState } | { ok: false; error: string };

/** The units a draft plays with, and what the shop and the merges read from them. Built once per unit list (draftPool). */
export interface DraftPool {
  units: ReadonlyMap<string, Unit>;
  /** The units a shop can show, by tier (index 0 is tier 1): no Stage 2, no legendary. */
  shop: readonly Unit[][];
  /** Tier-1 Basics a shop can show: the starters and the gifts. */
  firstTier: readonly Unit[];
  /** The units of the next stage that evolve from a Pokémon. */
  into(name: string): readonly Unit[];
  /** A Pokémon with no evolution line: it evolves from nothing and nothing evolves from it (golden copies). */
  lone(unit: Unit): boolean;
  /** The units a shop can show that would merge with this one, or make a golden copy with it (the same name): its partners. */
  mates(id: string): readonly Unit[];
}

const pools = new WeakMap<readonly Unit[], DraftPool>();
const NEXT_STAGE: Partial<Record<UnitStage, UnitStage>> = { basic: 'stage1', stage1: 'stage2' };

export function draftPool(units: readonly Unit[]): DraftPool {
  const known = pools.get(units);
  if (known) return known;
  const byId = new Map(units.map((u) => [u.id, u]));
  const shown = units.filter((u) => u.stage !== 'stage2' && !isLegendary(u));
  const into = new Map<string, Unit[]>();
  const intoOf = (name: string) => {
    if (!into.has(name)) into.set(name, units.filter((u) => u.stage !== 'basic' && unitEvolvesFrom(u, name)));
    return into.get(name)!;
  };
  const mates = new Map<string, Unit[]>();
  const lone = (u: Unit) => u.stage === 'basic' && !u.evolvesFrom && intoOf(u.name).length === 0;
  const targets = (u: Unit) => intoOf(u.name).filter((t) => t.stage === NEXT_STAGE[u.stage]);
  const matesOf = (id: string) => {
    if (!mates.has(id)) {
      const u = byId.get(id)!;
      const mine = new Set(targets(u).map((t) => t.id));
      mates.set(id, lone(u) ? shown.filter((v) => v.name === u.name) : mine.size ? shown.filter((v) => v.stage === u.stage && targets(v).some((t) => mine.has(t.id))) : []);
    }
    return mates.get(id)!;
  };
  const pool: DraftPool = {
    units: byId,
    shop: Array.from({ length: TOP_TIER }, (_, t) => shown.filter((u) => u.tier === t + 1)),
    firstTier: shown.filter((u) => u.tier === 1 && u.stage === 'basic'),
    into: intoOf,
    lone,
    mates: matesOf,
  };
  pools.set(units, pool);
  return pool;
}

const unitOf = (pool: DraftPool, id: string) => {
  const u = pool.units.get(id);
  if (!u) throw new Error(`Unknown unit ${id}`);
  return u;
};

/** A card's unit as it fights: its unit with its bonuses (stats, learned keywords) and golden's. */
export function cardUnit(card: PokemonCard, pool: DraftPool): Unit {
  const u = unitOf(pool, card.unit);
  const bonuses = card.golden ? [...card.bonuses, { from: 'golden', ...DRAFT.golden }] : card.bonuses;
  if (!bonuses.length) return u;
  const learned = bonuses.flatMap((b) => (b.ability && !u.abilities.some((a) => a.k === b.ability!.k) ? [b.ability] : []));
  return { ...u, attack: u.attack + bonuses.reduce((s, b) => s + b.attack, 0), hp: u.hp + bonuses.reduce((s, b) => s + b.hp, 0), abilities: [...u.abilities, ...learned.filter((a, i) => learned.findIndex((x) => x.k === a.k) === i)] };
}

/** The player's side of the next battle: the board's Pokémon left to right, and the Trainer chosen. */
export function battleBoard(state: SafariState, pool: DraftPool): Board {
  const units = state.board.filter((c): c is PokemonCard => c?.kind === 'pokemon').map((c) => cardUnit(c, pool));
  const trainer = state.inventory.find((c) => c?.kind === 'trainer' && c.key === state.trainer);
  return trainer?.kind === 'trainer' ? { units, trainer: trainer.trainer } : { units };
}

/** An opponent's side of its battle. */
export const opponentBoard = (o: Pick<Opponent, 'board' | 'trainer'>, pool: DraftPool): Board => ({ units: o.board.map((id) => unitOf(pool, id)), ...(o.trainer && { trainer: o.trainer }) });

/** What an opponent's `pay` brings at `share` of it (a win all, a draw or a loss DRAFT's shares), rounded down to ₱10. */
export const battlePay = (pay: number, share: number) => Math.floor((pay * share) / 10) * 10;

/** What a card costs in a shop. */
export const cardPrice = (tier: number) => DRAFT.cardPrice[tier - 1]!;

/** What a card sells for: 75% of its price rounded down. */
export function sellPrice(card: Card, pool: DraftPool): number {
  if (card.kind === 'trainer') return Math.floor(DRAFT.trainerPrice * DRAFT.sellShare);
  return Math.floor(cardPrice(unitOf(pool, card.unit).tier) * DRAFT.sellShare);
}

/** What the next shop tier costs now, or null at the top. */
export function tierPrice(state: Pick<SafariState, 'shopTier' | 'sinceTier'>): number | null {
  const base = DRAFT.tierPrice[state.shopTier - 1];
  if (base === undefined) return null;
  return Math.max(base / 2, base - DRAFT.tierDiscount * state.sinceTier);
}

/** What a reroll costs now: more for each one made in this shop, nothing with Professor Oak. */
export const rerollPrice = (state: Pick<SafariState, 'shop'>): number => (!state.shop || state.shop.oak ? 0 : DRAFT.reroll + DRAFT.rerollStep * (state.shop.rerolls ?? 0));

/** How many cards a shop shows: its tier's. */
export const shopSize = (state: Pick<SafariState, 'shopTier'>) => DRAFT.shopSize[state.shopTier - 1]!;

/** Whether the next battle is the Champion. */
export const championNext = (state: Pick<SafariState, 'battles'>) => state.battles >= DRAFT.battles;

/** The ₱ a run banks when it ends: all of them once the Champion is beaten, nothing lost or conceded. */
export const bankablePokedollars = (state: SafariState) => (state.phase === 'won' ? state.pokedollars : 0);

/** The player's cards the shop favours: each with its partners a shop of `tier` can show, weighted by battles held. */
export function wantedCards(state: SafariState, pool: DraftPool): { weight: number; mates: readonly Unit[] }[] {
  return [...state.board, ...state.inventory]
    .filter((c): c is PokemonCard => c?.kind === 'pokemon' && !c.golden)
    .map((c) => ({ weight: 1 + state.battles - (c.since ?? 0), mates: pool.mates(c.unit).filter((u) => u.tier <= state.shopTier) }))
    .filter((w) => w.mates.length);
}

/**
 * Shop cards, `count` of them, none the same unit as another or as `keep`: each a partner of a card in `wanted`
 * DRAFT.favour of the time, else any by the tiers' weights.
 */
function rollOffers(rng: Rng, pool: DraftPool, tier: number, count: number, keep: readonly string[] = [], wanted: readonly { weight: number; mates: readonly Unit[] }[] = []): string[] {
  const out: string[] = [];
  const taken = new Set(keep);
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const open = wanted.map((w) => [w.mates.filter((u) => !taken.has(u.id)), w.weight] as const).filter(([mates]) => mates.length);
    if (open.length && chance(rng, DRAFT.favour)) {
      const mates = weighted(rng, open);
      const u = mates[int(rng, mates.length)]!;
      taken.add(u.id);
      out.push(u.id);
      continue;
    }
    const tiers = pool.shop.slice(0, tier).map((units, t) => [units, DRAFT.tierWeights[t]!] as const).filter(([units]) => units.some((u) => !taken.has(u.id)));
    if (!tiers.length) break;
    const units = weighted(rng, tiers).filter((u) => !taken.has(u.id));
    const u = units[int(rng, units.length)]!;
    taken.add(u.id);
    out.push(u.id);
  }
  return out;
}

/** A new run (`runSeed` from the server), at its starter pick. */
export function createSafari(runSeed: number, units: readonly Unit[]): SafariState {
  const pool = draftPool(units);
  const rng = rngFrom(runSeed);
  const starters = sample(rng, pool.firstTier, DRAFT.starters).map((u) => u.id);
  const champion = rollChampion(rng, units);
  const encounterSteps = rollEncounterSteps(rng);
  return {
    rules: RULES,
    version: 0,
    rngState: rng.state,
    phase: 'starter',
    starters,
    hp: DRAFT.hp,
    pokedollars: DRAFT.startPokedollars,
    battles: 0,
    championTries: 0,
    shopTier: 1,
    sinceTier: 0,
    shop: null,
    board: Array<Card | null>(BOARD_SIZE).fill(null),
    inventory: Array<Card | null>(DRAFT.inventory).fill(null),
    trainer: null,
    pick: null,
    gifts: [],
    nextKey: 1,
    oakNext: false,
    conceded: false,
    opponents: [],
    opponent: null,
    champion,
    leadersMet: [],
    encounterSteps,
    encounters: [],
    encounter: null,
    legendaryMet: false,
    last: null,
    log: ['Started a Safari Draft.'],
  };
}

const zoneOf = (state: SafariState, zone: Zone) => (zone === 'board' ? state.board : state.inventory);
const validPlace = (state: SafariState, p: Place) => (p.zone === 'board' || p.zone === 'inventory') && Number.isInteger(p.at) && p.at >= 0 && p.at < zoneOf(state, p.zone).length;
const at = (state: SafariState, p: Place) => zoneOf(state, p.zone)[p.at] ?? null;
const put = (state: SafariState, p: Place, card: Card | null) => (zoneOf(state, p.zone)[p.at] = card);

/** The first free place: the board's for a Pokémon, then the inventory's. */
function freePlace(state: SafariState, card: Card): Place | null {
  const board = card.kind === 'pokemon' ? state.board.indexOf(null) : -1;
  if (board >= 0) return { zone: 'board', at: board };
  const inventory = state.inventory.indexOf(null);
  return inventory >= 0 ? { zone: 'inventory', at: inventory } : null;
}

/** A merge or golden copy that can be made: its parts (a part with no place is the card coming in) and what it can give. */
interface Combo {
  kind: 'merge' | 'golden' | 'evolve';
  parts: { card: PokemonCard; place: Place | null }[];
  targets: string[];
}

/** The first merge or golden copy among the player's cards, or one `incoming` completes. The board's first, left to right. */
function findCombo(state: SafariState, pool: DraftPool, incoming?: PokemonCard): Combo | null {
  const placed = [...state.board.map((card, i) => ({ card, place: { zone: 'board', at: i } as Place })), ...state.inventory.map((card, i) => ({ card, place: { zone: 'inventory', at: i } as Place }))]
    .filter((x): x is { card: PokemonCard; place: Place } => x.card?.kind === 'pokemon' && !x.card.golden);
  const all: Combo['parts'] = incoming ? [{ card: incoming, place: null }, ...placed] : placed;
  const needs = (parts: Combo['parts']) => !incoming || parts.includes(all[0]!);

  // Golden copies: 3 of the same name, of a Pokémon with no evolution line.
  const byName = new Map<string, Combo['parts']>();
  for (const part of all) {
    const u = unitOf(pool, part.card.unit);
    if (!pool.lone(u)) continue;
    const group = byName.get(u.name) ?? [];
    group.push(part);
    byName.set(u.name, group);
    if (group.length === 3 && needs(group)) return { kind: 'golden', parts: group, targets: [...new Set(group.map((p) => p.card.unit))] };
  }

  // Merges: 2 of a stage that could evolve into the same card.
  for (let i = 0; i < (incoming ? 1 : all.length); i++) {
    const a = unitOf(pool, all[i]!.card.unit);
    const next = NEXT_STAGE[a.stage];
    if (!next) continue;
    const intoA = pool.into(a.name).filter((t) => t.stage === next);
    if (!intoA.length) continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = unitOf(pool, all[j]!.card.unit);
      if (b.stage !== a.stage) continue;
      const targets = intoA.filter((t) => unitEvolvesFrom(t, b.name)).map((t) => t.id);
      if (targets.length) return { kind: 'merge', parts: [all[i]!, all[j]!], targets };
    }
  }
  return null;
}

/** Applies a player's or the server's action to a run. Pure: returns a new state, or an error. */
export function applySafariAction(prev: SafariState, action: SafariAction | SafariSystemAction, units: readonly Unit[]): SafariResult {
  const pool = draftPool(units);
  const state = structuredClone(prev);
  const rng: Rng = { state: state.rngState };
  const fail = (error: string): SafariResult => ({ ok: false, error });
  const ok = (): SafariResult => {
    state.rngState = rng.state;
    state.version += 1;
    return { ok: true, state };
  };
  const name = (id: string) => unitOf(pool, id).name;

  const place = (card: Card, p: Place) => put(state, p, card);

  /** Makes a merge's or golden copy's card at `p`. */
  const make = (kind: DraftPick['kind'], unit: string, bonuses: Bonus[], p: Place, from: string[], since: number) => {
    const card: PokemonCard = { key: state.nextKey++, kind: 'pokemon', unit, bonuses, since, ...(kind === 'golden' && { golden: true as const }) };
    place(card, p);
    state.log.push(kind === 'golden' ? `3 ${from[0]} made a golden ${name(unit)}.` : kind === 'evolve' ? `${from[0]} evolved into ${name(unit)}.` : `${from.join(' and ')} merged into ${name(unit)}.`);
  };

  /** Takes a combo's parts and makes its card, or asks which (PICK). */
  const startCombo = (combo: Combo) => {
    for (const part of combo.parts) if (part.place) put(state, part.place, null);
    const p = (combo.parts.find((x) => x.place?.zone === 'board') ?? combo.parts.find((x) => x.place))!.place!;
    const bonuses: Bonus[] = [];
    for (const b of combo.parts.flatMap((x) => x.card.bonuses)) if (!bonuses.some((k) => k.from === b.from)) bonuses.push(b);
    const from = combo.parts.map((x) => name(x.card.unit));
    // A merge offers 2 of the cards it can give (never the same one twice); a golden copy its one unit.
    const options = combo.kind === 'golden' ? combo.targets : sample(rng, combo.targets, 2);
    const since = Math.min(...combo.parts.map((x) => x.card.since ?? 0));
    if (options.length === 1) make(combo.kind, options[0]!, bonuses, p, from, since);
    else state.pick = { kind: combo.kind, options, from, bonuses, place: p, since };
  };

  /** Adds a card: in a free place, or as part of a merge it completes. False: no room. */
  const add = (card: Card): boolean => {
    const p = freePlace(state, card);
    if (p) {
      place(card, p);
      return true;
    }
    const combo = card.kind === 'pokemon' ? findCombo(state, pool, card) : null;
    if (!combo) return false;
    startCombo(combo);
    return true;
  };

  /** Makes every merge and gives every gift until a pick is waiting or nothing's left. */
  const settle = () => {
    while (!state.pick) {
      const combo = findCombo(state, pool);
      if (combo) {
        startCombo(combo);
        continue;
      }
      const gift = state.gifts.shift();
      if (!gift) return;
      const card: Card = { key: state.nextKey++, kind: 'pokemon', unit: gift, bonuses: [], since: state.battles };
      state.log.push(add(card) ? `Got ${name(gift)}.` : `No room for ${name(gift)}: it was lost.`);
    }
  };

  const openShop = () => {
    const kept = state.shop?.frozen ? state.shop.offers.filter((o): o is string => !!o) : [];
    const size = shopSize(state);
    state.shop = { offers: [...kept, ...rollOffers(rng, pool, state.shopTier, Math.max(0, size - kept.length), kept, wantedCards(state, pool))], frozen: false, oak: state.oakNext, rerolls: 0 };
    state.oakNext = false;
    openStep();
  };

  /** Whether the step under way is an encounter step. */
  const atEncounterStep = () => state.encounterSteps[0]?.after === state.battles && !championNext(state);

  /** The next step's choices: the battle step's opponents, or an encounter step's. */
  const openStep = () => {
    const step = atEncounterStep() ? state.encounterSteps[0]! : null;
    if (step) {
      const legendaries = !state.legendaryMet && state.battles >= LEGENDARY_FROM ? legendaryUnits(units, isLegendary) : [];
      state.opponents = step.battle ? rollOpponents(rng, units, state.battles, state.leadersMet) : [];
      state.encounters = rollEncounterOffers(rng, step.battle ? 1 : 2, legendaries);
    } else {
      state.opponents = championNext(state) ? [state.champion] : rollOpponents(rng, units, state.battles, state.leadersMet);
      state.encounters = [];
    }
    state.opponent = null;
    state.encounter = null;
    state.phase = 'shop';
  };

  /** The encounter step is over: the next step's choices (the shop stays as it was). */
  const finishEncounter = () => {
    state.encounterSteps.shift();
    openStep();
  };

  const held = () => [...state.board, ...state.inventory].filter((c): c is PokemonCard => c?.kind === 'pokemon');
  /** A held card, the longer held the likelier (as the shop's favour). */
  const longHeld = (cards: readonly PokemonCard[]) => weighted(rng, cards.map((c) => [c, 1 + state.battles - (c.since ?? 0)] as const));
  /** The cards a held Pokémon could evolve into now (Rare Candy). */
  const evolutions = (c: PokemonCard) => {
    const u = unitOf(pool, c.unit);
    return c.golden ? [] : pool.into(u.name).filter((t) => t.stage === NEXT_STAGE[u.stage]);
  };

  /** The keywords an upgrade could give a held Pokémon: those it hasn't, while it has fewer than MAX_KEYWORDS. */
  const learnable = (c: PokemonCard) => {
    const has = cardUnit(c, pool).abilities;
    return has.length >= MAX_KEYWORDS ? [] : UPGRADE_KEYWORDS.filter((a) => !has.some((x) => x.k === a.k));
  };

  /** An encounter's options, rolled as it opens. */
  const openEncounter = (offer: EncounterOffer): OpenEncounter => {
    switch (offer.kind) {
      case 'upgrade': {
        const cards = held();
        const kinds: ('stats' | 'keyword' | 'rareCandy')[] = [];
        if (cards.length) kinds.push('stats');
        if (cards.some((c) => learnable(c).length)) kinds.push('keyword');
        if (cards.some((c) => evolutions(c).length)) kinds.push('rareCandy');
        const chosen = sample(rng, kinds, UPGRADE_CHOICES);
        while (chosen.length < UPGRADE_CHOICES && cards.length) chosen.push('stats');
        const stats = sample(rng, ['protein', 'hpUp'] as const, 2);
        const upgrades = chosen.map((kind): Upgrade => {
          if (kind === 'stats') {
            const c = longHeld(cards);
            return { kind: stats.shift() ?? 'protein', key: c.key, unit: c.unit };
          }
          if (kind === 'keyword') {
            const c = longHeld(cards.filter((x) => learnable(x).length));
            return { kind, key: c.key, unit: c.unit, ability: pickOne(rng, learnable(c)) };
          }
          const c = longHeld(cards.filter((x) => evolutions(x).length));
          return { kind, key: c.key, unit: c.unit };
        });
        return { kind: 'upgrade', upgrades };
      }
      case 'cardGift': {
        const wanted = wantedCards(state, pool);
        const mate = wanted.length ? pickOne(rng, weighted(rng, wanted.map((w) => [w.mates, w.weight] as const))) : undefined;
        const keep = mate ? [mate.id] : [];
        return { kind: 'cardGift', cards: [...keep, ...rollOffers(rng, pool, state.shopTier, GIFT_CHOICES - keep.length, keep, wanted)] };
      }
      case 'trainerGift':
        return { kind: 'trainerGift', trainers: sample(rng, TRAINER_NAMES, GIFT_CHOICES) };
      case 'specialShop':
        return { kind: 'specialShop', cards: rollOffers(rng, pool, Math.min(TOP_TIER, state.shopTier + 1), SPECIAL_SHOP.cards, [], wantedCards(state, pool)), trainers: sample(rng, TRAINER_NAMES, SPECIAL_SHOP.trainers) };
      case 'legendary':
        throw new Error('A legendary\'s board is a battle');
    }
  };

  if (state.phase === 'won' || state.phase === 'lost') return fail('This run is over');
  if (state.pick && action.type !== 'PICK' && action.type !== 'CONCEDE') return fail('Pick the card first');

  switch (action.type) {
    case 'PICK_STARTER': {
      if (state.phase !== 'starter') return fail('The starter is picked');
      if (!state.starters.includes(action.unit)) return fail('Not one of the starters');
      add({ key: state.nextKey++, kind: 'pokemon', unit: action.unit, bonuses: [], since: 0 });
      state.log.push(`Picked ${name(action.unit)}.`);
      state.phase = 'shop';
      settle();
      openShop();
      return ok();
    }

    case 'PICK': {
      const pick = state.pick;
      if (!pick) return fail('Nothing to pick');
      if (!pick.options.includes(action.unit)) return fail('Not one of the choices');
      state.pick = null;
      make(pick.kind, action.unit, pick.bonuses, pick.place, pick.from, pick.since);
      settle();
      return ok();
    }

    case 'CONCEDE': {
      state.phase = 'lost';
      state.conceded = true;
      state.pick = null;
      state.log.push('Conceded the run.');
      return ok();
    }
  }

  if (state.phase === 'starter' || !state.shop) return fail('Pick a starter first');
  const shop = state.shop;
  if (state.phase === 'ready' && action.type !== 'MOVE' && action.type !== 'SET_TRAINER' && action.type !== 'BATTLE') return fail('The opponent is chosen: start the battle');
  if (state.phase === 'encounter' && !['TAKE', 'LEAVE', 'MOVE', 'SELL', 'SET_TRAINER'].includes(action.type)) return fail('Finish the encounter first');
  if (state.phase === 'shop' && (action.type === 'TAKE' || action.type === 'LEAVE')) return fail('No encounter under way');

  switch (action.type) {
    case 'BUY': {
      const id = shop.offers[action.index];
      if (!id) return fail('No card there');
      const price = cardPrice(unitOf(pool, id).tier);
      if (state.pokedollars < price) return fail('Not enough ₱');
      shop.offers[action.index] = null;
      state.pokedollars -= price;
      if (!add({ key: state.nextKey++, kind: 'pokemon', unit: id, bonuses: [], since: state.battles })) return fail('No room: sell a card first');
      state.log.push(`Bought ${name(id)} for ₱${price}.`);
      settle();
      return ok();
    }

    case 'SELL': {
      if (!validPlace(state, action.place)) return fail('No such place');
      const card = at(state, action.place);
      if (!card) return fail('No card there');
      const price = sellPrice(card, pool);
      put(state, action.place, null);
      if (card.key === state.trainer) state.trainer = null;
      state.pokedollars += price;
      state.log.push(`Sold ${card.kind === 'pokemon' ? name(card.unit) : card.trainer} for ₱${price}.`);
      return ok();
    }

    case 'MOVE': {
      if (!validPlace(state, action.from) || !validPlace(state, action.to)) return fail('No such place');
      const a = at(state, action.from);
      const b = at(state, action.to);
      if (!a) return fail('No card there');
      if ((a.kind === 'trainer' && action.to.zone === 'board') || (b?.kind === 'trainer' && action.from.zone === 'board')) return fail('Trainer cards stay in the inventory');
      put(state, action.from, b);
      put(state, action.to, a);
      return ok();
    }

    case 'REROLL': {
      const price = rerollPrice(state);
      if (state.pokedollars < price) return fail('Not enough ₱');
      state.pokedollars -= price;
      shop.rerolls = (shop.rerolls ?? 0) + 1;
      shop.frozen = false;
      shop.offers = rollOffers(rng, pool, state.shopTier, shopSize(state), [], wantedCards(state, pool));
      return ok();
    }

    case 'FREEZE': {
      shop.frozen = !shop.frozen;
      return ok();
    }

    case 'TIER_UP': {
      const price = tierPrice(state);
      if (price === null) return fail('The shop is at its top tier');
      if (state.pokedollars < price) return fail('Not enough ₱');
      state.pokedollars -= price;
      state.shopTier++;
      state.sinceTier = 0;
      state.log.push(`Raised the shop to tier ${state.shopTier} for ₱${price}.`);
      return ok();
    }

    case 'SET_TRAINER': {
      if (action.key !== null && !state.inventory.some((c) => c?.kind === 'trainer' && c.key === action.key)) return fail('No such Trainer card');
      state.trainer = action.key;
      return ok();
    }

    case 'GIFT': {
      if ('unit' in action) unitOf(pool, action.unit);
      const card: Card = 'unit' in action ? { key: state.nextKey++, kind: 'pokemon', unit: action.unit, bonuses: [], since: state.battles } : { key: state.nextKey++, kind: 'trainer', trainer: action.trainer };
      const what = card.kind === 'pokemon' ? name(card.unit) : card.trainer;
      state.log.push(add(card) ? `Got ${what}.` : `No room for ${what}: it was lost.`);
      settle();
      return ok();
    }

    case 'CHOOSE': {
      const chosen = state.opponents[action.index];
      if (!chosen) return fail('No such opponent');
      state.opponent = chosen;
      state.phase = 'ready';
      if (chosen.difficulty === 'gymLeader' && chosen.boss) state.leadersMet.push(chosen.boss);
      state.log.push(`Chose to battle ${chosen.name}.`);
      return ok();
    }

    case 'ENCOUNTER': {
      const offer = state.encounters[action.index];
      if (!offer) return fail('No such encounter');
      if (offer.kind === 'legendary') {
        state.legendaryMet = true;
        state.opponent = legendaryOpponent(rng, units, unitOf(pool, offer.legendary!), state.battles);
        state.phase = 'ready';
        state.log.push(`Chose to battle the legendary ${name(offer.legendary!)}.`);
        return ok();
      }
      state.encounter = openEncounter(offer);
      state.phase = 'encounter';
      return ok();
    }

    case 'TAKE': {
      const open = state.encounter!;
      if (open.kind === 'upgrade') {
        const upgrade = open.upgrades[action.index];
        if (!upgrade) return fail('No such upgrade');
        const where = [...state.board.map((c, at) => ({ c, place: { zone: 'board', at } as Place })), ...state.inventory.map((c, at) => ({ c, place: { zone: 'inventory', at } as Place }))].find((x) => x.c?.key === upgrade.key);
        const card = where?.c;
        if (!where || card?.kind !== 'pokemon') return fail('That card is gone');
        if (upgrade.kind === 'rareCandy') {
          const targets = evolutions(card).map((t) => t.id);
          if (!targets.length) return fail('It can\'t evolve');
          startCombo({ kind: 'evolve', parts: [{ card, place: where.place }], targets });
        } else if (upgrade.kind === 'keyword') {
          card.bonuses.push({ from: `TM ${state.nextKey++}`, attack: 0, hp: 0, ability: upgrade.ability });
          state.log.push(`${name(card.unit)} learned ${abilityName(upgrade.ability)}.`);
        } else {
          const boost = UPGRADES[upgrade.kind];
          card.bonuses.push({ from: `${boost.name} ${state.nextKey++}`, attack: boost.attack, hp: boost.hp });
          state.log.push(`${name(card.unit)} took ${boost.name}.`);
        }
        settle();
        finishEncounter();
        return ok();
      }
      if (open.kind === 'cardGift' || open.kind === 'trainerGift') {
        const card: Card | undefined =
          open.kind === 'cardGift'
            ? open.cards[action.index] !== undefined ? { key: state.nextKey++, kind: 'pokemon', unit: open.cards[action.index]!, bonuses: [], since: state.battles } : undefined
            : open.trainers[action.index] !== undefined ? { key: state.nextKey++, kind: 'trainer', trainer: open.trainers[action.index]! } : undefined;
        if (!card) return fail('No such gift');
        const what = card.kind === 'pokemon' ? name(card.unit) : card.trainer;
        state.log.push(add(card) ? `Got ${what}.` : `No room for ${what}: it was lost.`);
        settle();
        finishEncounter();
        return ok();
      }
      // The special shop: its cards, then its Trainer cards.
      const cardAt = open.cards[action.index];
      const trainer = open.trainers[action.index - open.cards.length];
      if (action.index < open.cards.length ? !cardAt : !trainer) return fail('No card there');
      const price = cardAt ? cardPrice(unitOf(pool, cardAt).tier) : SPECIAL_SHOP.trainerPrice;
      if (state.pokedollars < price) return fail('Not enough ₱');
      state.pokedollars -= price;
      const bought: Card = cardAt ? { key: state.nextKey++, kind: 'pokemon', unit: cardAt, bonuses: [], since: state.battles } : { key: state.nextKey++, kind: 'trainer', trainer: trainer! };
      if (!add(bought)) return fail('No room: sell a card first');
      if (cardAt) open.cards[action.index] = null;
      else open.trainers[action.index - open.cards.length] = null;
      state.log.push(`Bought ${cardAt ? name(cardAt) : trainer} for ₱${price}.`);
      settle();
      return ok();
    }

    case 'LEAVE': {
      finishEncounter();
      return ok();
    }

    case 'BATTLE': {
      const against = state.opponent;
      if (state.phase !== 'ready' || !against) return fail('Choose an opponent first');
      const mine = battleBoard(state, pool);
      if (!mine.units.length) return fail('Put a Pokémon on the board first');
      const opponent = opponentBoard(against, pool);
      const champion = against.difficulty === 'champion';
      // A battle at an encounter step (a step's opponent there, or a legendary's board) is an extra one, not one of the 15.
      const extra = atEncounterStep();
      const seed = newSeed(rng);
      const result = simulateBattle(mine, opponent, seed, { events: false });
      const won = result.winner === 0;
      const payDay = result.payDays[0] * DRAFT.payDay;
      const bill = mine.trainer === 'Bill' ? DRAFT.bill : 0;
      const share = won ? 1 : result.winner === 'draw' ? DRAFT.drawShare : DRAFT.lossShare;
      const pay = battlePay(against.pay, share) + payDay + bill;
      state.pokedollars += pay;
      state.last = { mine, opponent, seed, winner: result.winner, champion, against: { name: against.name, difficulty: against.difficulty, ...(against.boss && { boss: against.boss }) }, pay, payDay, bill };
      if (mine.trainer) {
        state.inventory = state.inventory.map((c) => (c?.key === state.trainer ? null : c));
        state.trainer = null;
        if (mine.trainer === 'Professor Oak') state.oakNext = true;
      }
      const outcome = won ? 'Won' : result.winner === 'draw' ? 'Drew' : 'Lost';
      state.log.push(`${outcome} ${champion ? 'against the Champion' : extra ? 'an extra battle' : `battle ${state.battles + 1}`} (${against.name})${pay ? `: +₱${pay}` : ''}.`);
      if (result.winner === 1) state.hp--;
      if (champion) state.championTries++;
      else if (extra) state.encounterSteps.shift();
      else state.battles++;
      if (won && against.difficulty === 'legendary') {
        const legend = against.board[0]!;
        state.log.push(add({ key: state.nextKey++, kind: 'pokemon', unit: legend, bonuses: [], since: state.battles }) ? `${name(legend)} joined the team.` : `No room for ${name(legend)}: it was lost.`);
        settle();
      }
      state.opponent = null;
      state.opponents = [];
      if (champion && won) {
        state.phase = 'won';
        state.shop = null;
        state.log.push(`Beat the Champion with ₱${state.pokedollars}.`);
        return ok();
      }
      if (state.hp <= 0) {
        state.phase = 'lost';
        state.shop = null;
        state.log.push('Out of HP: the run is lost.');
        return ok();
      }
      state.sinceTier++;
      openShop();
      return ok();
    }
  }
  return fail('Unknown action');
}
