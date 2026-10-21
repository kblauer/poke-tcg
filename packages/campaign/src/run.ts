// A run: steps of encounters chosen one at a time on a map (2–3 options each), with bosses along the way
// (each gym leader after a Gym Trainer that must be fought), ending with its last boss (see run-types.ts).
// RunState is plain JSON (saved in Run.state); applyRunAction is its reducer, like the engine's applyAction.
// Battles themselves are engine games: the API starts one when the run asks for it (needsBattle) and
// reports the result back with BATTLE_OVER. The account's equipped items (`gear`) are passed in with each
// action, so equipment takes effect from the next encounter; the consumables in effect are in the state.
import type { BattleRule, CardDef, CpuDifficulty, EnergyType, PlayerId } from '@poke-tcg/game-engine';
import { boss, bossLabel, type BossId, type BossKind } from './bosses.js';
import { expandDeck, generateDeck, trainerFavorites } from './decks.js';
import { activeEffects, battleRules, effectTotal, item, ITEMS, MAX_CONSUMABLES_PER_RUN, type ActiveEffect } from './items.js';
import { byId, DECK_TYPES, offerable, PRICES, rarityWeight, type PoolCard, type Rarity } from './pool.js';
import { between, chance, pick, random, rngFrom, sample, seed, weighted, type Rng } from './random.js';
import { finalBoss, runGeneration, runType, type RunType, type RunTypeId } from './run-types.js';
import type { Route, RouteSpot } from './routes.js';

export const MAX_HP = 3;
export const STARTING_POKEDOLLARS = 500;

/** Battles: a trainer, an Ace Trainer (elite, can be declined), a gym's Gym Trainer, or a boss. */
export type BattleKind = 'battle' | 'elite' | 'gymTrainer' | BossKind;
export type EncounterKind = BattleKind | 'shop' | 'gift' | 'trade' | 'event' | 'center';

const BATTLE_KINDS: readonly string[] = ['battle', 'elite', 'gymTrainer', 'gymLeader', 'eliteFour', 'champion'];
export const isBattleKind = (kind: string): kind is BattleKind => BATTLE_KINDS.includes(kind);
const BOSS_KINDS: readonly string[] = ['gymLeader', 'eliteFour', 'champion'];
/** Bosses are fought again after a loss, and give a better reward. */
export const isBossKind = (kind: string): kind is BossKind => BOSS_KINDS.includes(kind);

/** A choice on the map. What's inside (a shop's stock, a gift's cards) is rolled when it's chosen. */
export interface MapEncounter {
  kind: EncounterKind;
  label: string;
  /** Battles: the opponent's name. */
  trainer?: string;
  /** Bosses: who; Gym Trainers: whose gym. Missing on gym leaders of runs saved before there were several. */
  boss?: BossId;
  /** A Mystery revealed by the Itemfinder: the event it will be. */
  event?: RunEvent;
  /** Trainer battles: what their reward leans to, if anything (battleReward). */
  focus?: RewardFocus;
}

export interface Step {
  options: MapEncounter[];
  /** The option taken, once chosen. */
  chosen?: number;
}

/** A decision-based event: accept it or walk away. */
export type RunEvent =
  | { id: 'typeFrenzy'; type: EnergyType; battles: number }
  | { id: 'gamble'; stake: number; prize: number }
  | { id: 'bargain'; cardId: string }
  | { id: 'donation'; cost: number; exp: number }
  | { id: 'luckyFind'; pokedollars: number };

/** The encounter being played. */
export type Encounter =
  /** `deckSeed` rolls a trainer's deck; `gameId` is the battle once started. An elite battle can be declined first. */
  | { kind: BattleKind; trainer: string; deckSeed: number; accepted?: boolean; gameId?: string; boss?: BossId; focus?: RewardFocus }
  | { kind: 'shop'; stock: { cardId: string; price: number; sold?: boolean }[] }
  | { kind: 'gift'; offers: string[] }
  | { kind: 'trade'; give: string; get: string }
  | { kind: 'event'; event: RunEvent }
  | { kind: 'center'; price: number }
  /** After a battle won: the ₱ and EXP already added, and cards to pick one of. */
  | { kind: 'reward'; offers: string[]; pokedollars: number; exp: number; trainer: string };

export interface RunState {
  /** Bumped by every action; saves check it (optimistic concurrency, like games). */
  version: number;
  type: RunTypeId;
  rngState: number;
  hp: number;
  maxHp: number;
  /** ₱ to spend in this run. Banked when the run ends, if a battle was finished without conceding it (bankablePokedollars). */
  pokedollars: number;
  /** EXP earned this run, added to the account when the run is beaten. */
  exp: number;
  /** The deck used in battles (trades change it, and it can be switched for another of the account's decks before a battle). */
  deck: string[];
  /** The name of the account's deck it came from, for the screen. Missing in older runs. */
  deckName?: string;
  /** The deck the run started with. */
  startingDeck: string[];
  /** Cards gained during the run (gifts, rewards, shops, trades), in the order they came. Each is unlocked for the deck builder as it's gained; only trades put one in the run's deck. */
  gained: string[];
  steps: Step[];
  /** The step being played (or chosen next). */
  position: number;
  /** map: choosing the next encounter; encounter: playing it; won/lost: the run is over. */
  phase: 'map' | 'encounter' | 'won' | 'lost';
  /** The player gave up the run (CONCEDE): it's lost, and its ₱ are banked only if a battle was finished without conceding it. */
  conceded?: boolean;
  /** Battles finished this run, won or lost. Missing in older runs (see battlesFought). */
  battlesFought?: number;
  /** Battles finished without the player conceding the game, won or lost. Missing in older runs (see battlesCompleted). */
  battlesCompleted?: number;
  encounter: Encounter | null;
  /** Battle rules from events, for the next `battlesLeft` battles. */
  rules: { rule: BattleRule; battlesLeft: number; label: string }[];
  /** Consumables in effect, for the next `battlesLeft` battles. */
  consumables: { itemId: string; battlesLeft: number }[];
  consumablesUsed: number;
  /** Times each misc item was used this run. */
  itemUses: Record<string, number>;
  /** Key items earned in this run (badges, the Champion's ribbon), given to the account as they're earned. Missing in older runs. */
  badges?: string[];
  /** What happened, oldest first. */
  log: string[];
}

export type RunAction =
  /** Take option `option` of the current step. */
  | { type: 'CHOOSE'; option: number }
  /** Accept the encounter: fight an elite trainer, make a trade, accept an event, heal at a Pokémon Center. */
  | { type: 'ACCEPT' }
  /** Walk away: leave a shop, skip a gift or reward, decline a trade, event, elite battle or heal. */
  | { type: 'LEAVE' }
  /** Pick card `index` of a gift or reward. */
  | { type: 'PICK'; index: number }
  /** Buy card `index` of a shop. */
  | { type: 'BUY'; index: number }
  /** Give up the run while choosing the next step: the cards gained stay unlocked, and its ₱ are banked if a battle was finished without conceding it. */
  | { type: 'CONCEDE' };

/** Actions only the server sends (battles, items, the testing retry). Never accepted from clients. */
export type RunSystemAction =
  | { type: 'BATTLE_STARTED'; gameId: string }
  /** `conceded`: the player conceded the game, so it doesn't count as a completed battle (battlesCompleted). */
  | { type: 'BATTLE_OVER'; gameId: string; won: boolean; conceded?: boolean }
  | { type: 'USE_ITEM'; itemId: string }
  | { type: 'RESTORE_HP' }
  /** Switch to another of the account's decks (the server loads it and checks it can be played), on the map before choosing a battle. */
  | { type: 'SET_DECK'; deck: string[]; name: string };

export type RunResult = { ok: true; state: RunState } | { ok: false; error: string };

/** The trainers met in battles on the map (and as single battles' random trainers); trainerFavorites picks their Pokémon from their class. */
export const TRAINERS = [
  'Youngster Joey', 'Lass Haley', 'Bug Catcher Rick', 'Hiker Marcos', 'Picnicker Gina', 'Camper Liam', 'Super Nerd Glenn',
  'Swimmer Luis', 'Fisherman Ned', 'Beauty Lola', 'Gentleman Arthur', 'Biker Jaren', 'Juggler Kirk', 'Cooltrainer Mary',
  'Rocker Luca', 'Gambler Hugo', 'Sailor Duncan', 'Psychic Tyron', 'Black Belt Koichi', 'Bird Keeper Sebastian',
];

/** How often each kind of encounter is offered on the map. */
const KIND_WEIGHTS: [EncounterKind, number][] = [
  ['battle', 40],
  ['elite', 6],
  ['shop', 12],
  ['gift', 10],
  ['trade', 10],
  ['event', 14],
  ['center', 8],
];

const GYM_TRAINERS = ['Jr. Trainer Ken', 'Jr. Trainer Ami', 'Cooltrainer Rio', 'Cooltrainer Saki', 'Gym Guide Tom', 'Lass Nora', 'Black Belt Hideki', 'Beauty Tamia', 'Juggler Nate', 'Burglar Quinn', 'Scientist Ted', 'Rocker Dax'];

const LABELS: Record<Exclude<EncounterKind, BattleKind>, string> = {
  shop: 'Card Shop',
  gift: 'Free Card',
  trade: 'Card Trade',
  event: 'Mystery',
  center: 'Pokémon Center',
};

/** Rewards for winning each kind of battle, and the least rarity of the cards offered after it. */
/** What each kind of battle pays when won: ₱ (a range), EXP, and how rare the cards to pick from are. */
export const REWARDS: Record<BattleKind, { pokedollars: [number, number]; exp: number; rarity: Rarity }> = {
  battle: { pokedollars: [100, 150], exp: 10, rarity: 'common' },
  elite: { pokedollars: [250, 250], exp: 25, rarity: 'uncommon' },
  gymTrainer: { pokedollars: [150, 200], exp: 15, rarity: 'uncommon' },
  gymLeader: { pokedollars: [500, 500], exp: 100, rarity: 'rare' },
  eliteFour: { pokedollars: [600, 600], exp: 120, rarity: 'rare' },
  champion: { pokedollars: [1000, 1000], exp: 200, rarity: 'rare' },
};

/**
 * What a trainer battle's reward leans to, so they differ: twice the ₱, twice the EXP, or cards one rarity up. Shown
 * on the map before choosing. The amounts are placeholders, to balance later (agreed with the user).
 */
export type RewardFocus = 'pokedollars' | 'exp' | 'cards';
export const REWARD_FOCUS_LABELS: Record<RewardFocus, string> = { pokedollars: 'Big payout', exp: 'Extra EXP', cards: 'Rarer cards' };
/** How often a trainer battle leans each way (null: an ordinary reward). */
const FOCUS_WEIGHTS: [RewardFocus | null, number][] = [
  [null, 4],
  ['pokedollars', 2],
  ['exp', 2],
  ['cards', 2],
];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'holo'];

/** What a battle pays when won (REWARDS), with its trainer's `focus`. */
export function battleReward(kind: BattleKind, focus?: RewardFocus): (typeof REWARDS)[BattleKind] {
  const r = REWARDS[kind];
  if (focus === 'pokedollars') return { ...r, pokedollars: [r.pokedollars[0] * 2, r.pokedollars[1] * 2] };
  if (focus === 'exp') return { ...r, exp: r.exp * 2 };
  if (focus === 'cards') return { ...r, rarity: RARITIES[Math.min(RARITIES.indexOf(r.rarity) + 1, RARITIES.length - 1)]! };
  return r;
}

export const CENTER_PRICE = 100;
export const SHOP_SIZE = 5;
export const OFFERS = 3;
const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, holo: 3 };

/**
 * Who a battle on a map's spot can be against: its route's `trainers` (that share of the time) or, for the rest and the
 * route's `landBattle`, any trainer but those trainers' classes. Undefined: any trainer.
 */
type TrainerPool = { names: string[]; share: number; others: string[] } | undefined;

const classOf = (trainer: string) => trainer.split(' ').slice(0, -1).join(' ');

/** Whether a spot of a route has land (not water) within 3 tiles of it, for a non-battle encounter's NPC to stand on. */
const landNear = (route: Route, spot: RouteSpot) => {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && route.walkable[spot.y + dy]?.[spot.x + dx] === '.') return true;
  return false;
};

/**
 * The trainer pool for encounter step `encounter` of a run type with routes (the spot it's on), if its route has one;
 * whether it's the route's `landBattle`; and on a surfed route (agreed with the user), `atSea`, a spot with no land near
 * it, which offers only battles (non-battle encounters' NPCs can't swim), or `ashore`, a spot with land near it (not the
 * land battle's), which offers only non-battle encounters, so the route isn't all battles.
 */
function poolAt(type: RunType, encounter: number): { pool: TrainerPool; landBattle: boolean; atSea: boolean; ashore: boolean } {
  let first = 0;
  for (const route of type.routes ?? []) {
    if (encounter < first + route.spots.length) {
      const surf = route.travel === 'surf';
      const near = surf && landNear(route, route.spots[encounter - first]!);
      const landBattle = !!route.trainers && route.landBattle === encounter - first;
      const sea = { atSea: surf && !near, ashore: near && !landBattle };
      if (!route.trainers) return { pool: undefined, landBattle: false, ...sea };
      const classes = new Set(route.trainers.names.map(classOf));
      const others = TRAINERS.filter((t) => !classes.has(classOf(t)));
      return { pool: landBattle ? { names: [], share: 0, others } : { ...route.trainers, others }, landBattle, ...sea };
    }
    first += route.spots.length;
  }
  return { pool: undefined, landBattle: false, atSea: false, ashore: false };
}

function mapEncounter(rng: Rng, kind: EncounterKind, pool?: TrainerPool): MapEncounter {
  if (kind === 'battle') {
    const trainer = pool ? (pool.share > 0 && chance(rng, pool.share) ? pick(rng, pool.names) : pick(rng, pool.others)) : pick(rng, TRAINERS);
    const focus = weighted(rng, FOCUS_WEIGHTS);
    return { kind, label: trainer, trainer, ...(focus && { focus }) };
  }
  if (kind === 'elite') {
    const trainer = `Ace Trainer ${pick(rng, ['Cal', 'Gwen', 'Paige', 'Rolf', 'Vera', 'Quinn'])}`;
    return { kind, label: trainer, trainer };
  }
  if (isBattleKind(kind)) throw new Error('Gym Trainers and bosses are added separately');
  return { kind, label: LABELS[kind] };
}

/** Steps that are a single trainer battle, which can't be skipped: at least this many per run (agreed with the user). */
export const REQUIRED_BATTLES = 4;

/**
 * How often a step offering a single trainer and nothing else (a required battle, or a step rolled that way) offers a
 * second trainer to choose between, one of whom must still be fought (agreed with the user: 75%). Steps with a non-battle
 * option keep their options. In a 10-encounter run, about two thirds of the steps offering a trainer battle offer two.
 */
export const PAIR_CHANCE = 0.75;

/** A step's options with a second trainer to choose between now and then (PAIR_CHANCE), when they're a single trainer. */
function pairUp(rng: Rng, options: MapEncounter[], pool?: TrainerPool): MapEncounter[] {
  const [only] = options;
  if (options.length !== 1 || only!.kind !== 'battle' || !chance(rng, PAIR_CHANCE)) return options;
  let second = mapEncounter(rng, 'battle', pool);
  while (second.trainer === only!.trainer) second = mapEncounter(rng, 'battle', pool);
  return [only!, second];
}

/** Pokémon Centers offered in a run, at most (agreed with the user). */
export const MAX_CENTERS = 2;

/**
 * How many options a step offers, weighted so that a step offering a non-battle encounter has only that one option about
 * half the time (agreed with the user), two more often than three.
 */
const OPTION_COUNTS: [number, number][] = [
  [1, 4],
  [2, 2],
  [3, 1],
];

/** The Pokémon Centers a run's steps offer (all of them but `except`, the step being rolled again). */
const centersOffered = (steps: readonly Step[], except?: number) => steps.filter((s, i) => i !== except).flatMap((s) => s.options).filter((o) => o.kind === 'center').length;

/**
 * The options of step `i` (not a required battle, a gym's or a boss's): 1–3 (OPTION_COUNTS), a single one being an
 * encounter to go through (a shop, a gift…). Pokémon Centers come from step 3 while the run has offered fewer than
 * MAX_CENTERS (`centers`), elite trainers from step 5. `noBattles`: only non-battle encounters (a surfed route's spot ashore).
 */
function rollOptions(rng: Rng, i: number, centers: number, pool?: TrainerPool, noBattles = false): MapEncounter[] {
  const kinds = KIND_WEIGHTS.filter(([k]) => (k !== 'center' || (i >= 3 && centers < MAX_CENTERS)) && (k !== 'elite' || i >= 5) && !(noBattles && isBattleKind(k)));
  const count = weighted(rng, OPTION_COUNTS);
  const options: MapEncounter[] = [];
  for (let o = 0; o < count; o++) {
    const left = kinds.filter(([k]) => k === 'battle' || !options.some((opt) => opt.kind === k));
    options.push(mapEncounter(rng, weighted(rng, left), pool));
  }
  return options;
}

/**
 * The consumables used from the Inventory before the run (`itemIds`, agreed with the user) put in effect at its start,
 * all at once (not one at a time): they're among the run's MAX_CONSUMABLES_PER_RUN, so at most that many count, and
 * another can be used in the run (one at a time) once they've all run out.
 */
export function withConsumablesBefore(prev: RunState, itemIds: readonly string[]): RunState {
  const state = structuredClone(prev);
  for (const id of itemIds) {
    const def = ITEMS[id];
    if (def?.category !== 'consumable' || state.consumablesUsed >= MAX_CONSUMABLES_PER_RUN) continue;
    state.consumablesUsed += 1;
    state.consumables.push({ itemId: def.id, battlesLeft: def.battles ?? 1 });
    state.log.push(`Used ${def.name} before the run.`);
  }
  return state;
}

/** A new run of `type` with `deck`. The map is fixed by the seed; what's in each encounter is rolled when it's entered. */
/** A new run of `typeId` with the deck (`deckName`: the account deck it came from). */
export function createRun(typeId: RunTypeId, deck: string[], runSeed: number, deckName?: string): RunState {
  const type = runType(typeId);
  const rng = rngFrom(runSeed);
  const steps: Step[] = [];
  // The required battles (REQUIRED_BATTLES): the first encounter step and others at random.
  const encounters = type.segments.reduce((n, s) => n + s.steps, 0);
  // A surfed route's spots ashore offer no battles, so they're never required ones.
  const others = Array.from({ length: Math.max(0, encounters - 1) }, (_, k) => k + 1).filter((k) => !poolAt(type, k).ashore);
  const required = new Set(encounters ? [0, ...sample(rng, others, Math.min(REQUIRED_BATTLES, encounters) - 1)] : []);
  let encounter = 0;
  for (const segment of type.segments) {
    for (let n = 0; n < segment.steps; n++, encounter++) {
      // On a route with its own trainers (routes.ts), its battles are mostly those; its `landBattle` spot is always a battle,
      // and so is a surfed route's spot out at sea.
      const { pool, landBattle, atSea, ashore } = poolAt(type, encounter);
      const battle = (required.has(encounter) && !ashore) || landBattle || atSea;
      steps.push({ options: pairUp(rng, battle ? [mapEncounter(rng, 'battle', pool)] : rollOptions(rng, steps.length, centersOffered(steps), pool, ashore), pool) });
    }
    if (segment.center) steps.push({ options: [{ kind: 'center', label: LABELS.center }] });
    for (const id of segment.bosses) {
      const b = boss(id);
      // A gym leader has one of the gym's trainers to beat first, the only option on its step (not in a Gym Challenge or Champion run).
      // One of the gym's own trainers (FireRed's, in Kanto), or anyone from the general list.
      if (b.gym && segment.gymTrainers !== false) steps.push({ options: [{ kind: 'gymTrainer', label: `${b.gym.city} Gym Trainer`, trainer: pick(rng, b.gym.trainers ?? GYM_TRAINERS), boss: id }] });
      steps.push({ options: [{ kind: b.kind, label: bossLabel(b), trainer: b.name, boss: id }] });
    }
  }
  return {
    version: 0,
    type: typeId,
    rngState: rng.state,
    hp: MAX_HP,
    maxHp: MAX_HP,
    pokedollars: STARTING_POKEDOLLARS,
    exp: 0,
    deck: [...deck],
    ...(deckName && { deckName }),
    startingDeck: [...deck],
    gained: [],
    steps,
    position: 0,
    phase: 'map',
    encounter: null,
    rules: [],
    consumables: [],
    consumablesUsed: 0,
    itemUses: {},
    badges: [],
    log: [`Started the ${type.name} run.`],
  };
}

/** `n` different cards to offer, rarer ones less often (at least `minRarity` when possible). */
function offerCards(rng: Rng, pool: readonly PoolCard[], n: number, minRarity: Rarity = 'common'): string[] {
  let options = offerable(pool).filter((c) => RARITY_RANK[c.rarity] >= RARITY_RANK[minRarity]);
  if (!options.length) options = offerable(pool);
  const out: string[] = [];
  while (out.length < n && options.length) {
    const card = weighted(rng, options.map((c) => [c, rarityWeight(c)] as const));
    out.push(card.def.id);
    options = options.filter((c) => c.def.id !== card.def.id);
  }
  return out;
}

function rollEvent(rng: Rng, state: RunState, pool: readonly PoolCard[]): RunEvent {
  const events: RunEvent['id'][] = ['typeFrenzy', 'typeFrenzy', 'gamble', 'donation', 'luckyFind'];
  if (state.hp > 1) events.push('bargain');
  switch (pick(rng, events)) {
    case 'typeFrenzy':
      return { id: 'typeFrenzy', type: pick(rng, DECK_TYPES), battles: 3 };
    case 'gamble':
      return { id: 'gamble', stake: 100, prize: 300 };
    case 'bargain':
      return { id: 'bargain', cardId: offerCards(rng, pool, 1, 'rare')[0]! };
    case 'donation':
      return { id: 'donation', cost: 50, exp: 15 };
    default:
      return { id: 'luckyFind', pokedollars: between(rng, 5, 10) * 10 };
  }
}

/** A price less `percent`%, to the nearest ₱10. */
const discounted = (price: number, percent: number) => Math.max(0, Math.round((price * (100 - Math.min(percent, 100))) / 1000) * 10);

/** How many more cards items add to pick from (or for sale) at a kind of encounter. */
const moreOffers = (effects: readonly ActiveEffect[], encounter: 'gift' | 'reward' | 'shop') =>
  effectTotal(effects, (e) => (e.kind === 'moreOffers' && e.encounter === encounter ? e.count : 0));

function rollEncounter(rng: Rng, state: RunState, option: MapEncounter, pool: readonly PoolCard[], effects: readonly ActiveEffect[]): Encounter {
  switch (option.kind) {
    case 'elite':
      return { kind: 'elite', trainer: option.trainer!, deckSeed: seed(rng), accepted: false };
    case 'battle':
    case 'gymTrainer':
    case 'gymLeader':
    case 'eliteFour':
    case 'champion':
      return { kind: option.kind, trainer: option.trainer!, deckSeed: seed(rng), ...(option.boss && { boss: option.boss }), ...(option.focus && { focus: option.focus }) };
    case 'shop': {
      const cards = byId(pool);
      const discount = effectTotal(effects, (e) => (e.kind === 'shopDiscount' ? e.percent : 0));
      return {
        kind: 'shop',
        stock: offerCards(rng, pool, SHOP_SIZE + moreOffers(effects, 'shop')).map((cardId) => ({ cardId, price: discounted(PRICES[cards.get(cardId)!.rarity], discount) })),
      };
    }
    case 'gift':
      return { kind: 'gift', offers: offerCards(rng, pool, OFFERS + moreOffers(effects, 'gift')) };
    case 'trade': {
      // They ask for one of your cards (not basic Energy if you have anything else) and offer one at least as rare.
      const cards = byId(pool);
      const yours = [...new Set(state.deck)].filter((id) => cards.has(id));
      const wanted = yours.filter((id) => offerable([cards.get(id)!]).length);
      const give = pick(rng, wanted.length ? wanted : yours);
      const get = offerCards(rng, pool.filter((c) => c.def.id !== give), 1, cards.get(give)?.rarity)[0]!;
      return { kind: 'trade', give, get };
    }
    case 'event':
      return { kind: 'event', event: option.event ?? rollEvent(rng, state, pool) };
    case 'center':
      return { kind: 'center', price: discounted(CENTER_PRICE, effectTotal(effects, (e) => (e.kind === 'centerDiscount' ? e.percent : 0))) };
  }
}

type BattleEncounter = Extract<Encounter, { deckSeed: number }>;
const battleOf = (state: RunState): BattleEncounter | null => {
  const e = state.encounter;
  return e && isBattleKind(e.kind) ? (e as BattleEncounter) : null;
};

/** Whether the run is waiting for the server to start a battle (it then sends BATTLE_STARTED). */
export const needsBattle = (state: RunState) => {
  const e = battleOf(state);
  return state.phase === 'encounter' && !!e && (e.kind !== 'elite' || !!e.accepted) && !e.gameId;
};

/** The current battle's game, if one is under way. */
export const currentGameId = (state: RunState) => battleOf(state)?.gameId ?? null;

/** The boss of a boss or Gym Trainer battle (a gym leader saved without one is the run's own). */
const bossOf = (state: RunState, e: BattleEncounter) => (e.boss ? boss(e.boss) : isBossKind(e.kind) ? finalBoss(runType(state.type)) : null);

/**
 * What the server needs to start the battle: the CPU's deck, how it plays, and the battle rules in effect
 * (the run's, and with `items`, the battle effects of the gear and the consumables in effect as rules for the player).
 * Bosses play their own deck at Gym leader difficulty; a Gym Trainer a random deck of their gym's type, at
 * Trainer difficulty (from its gym's favourite Pokémon when its type has no basic Energy); Ace Trainers a random deck at Gym
 * leader difficulty; other trainers a deck suiting their name (trainerFavorites) at Trainer difficulty. Random decks are
 * the run's generation's (its Energy and Trainers; `pool` should be its pool too).
 */
export function battleSetup(
  state: RunState,
  pool: readonly PoolCard[],
  items?: { gear: readonly string[]; player: PlayerId },
): { deck: string[]; difficulty: CpuDifficulty; rules: BattleRule[]; opponent: string } {
  const e = battleOf(state);
  if (!e) throw new Error('No battle to start');
  const rules = [...state.rules.map((r) => ({ ...r.rule, label: r.label })), ...(items ? battleRules(activeEffects(items.gear, state.consumables), items.player) : [])];
  const b = bossOf(state, e);
  if (isBossKind(e.kind)) return { deck: expandDeck(b!.deck), difficulty: 'gymLeader', rules, opponent: e.trainer };
  const deckRules = runGeneration(state.type).deckRules;
  const gym = e.kind === 'gymTrainer' ? b?.gym : undefined;
  // A Gym Trainer's deck is of their gym's type, or for a type with no basic Energy (Colorless, Metal) built from the gym's favourites.
  const type = gym && gym.type in deckRules.basicEnergy ? gym.type : undefined;
  // A trainer's deck suits their name (a Swimmer's Water Pokémon); a Gym Trainer's suits their gym instead.
  const favorites = e.kind === 'battle' ? trainerFavorites(e.trainer) : gym && !type ? gym.favorites : undefined;
  return { deck: generateDeck(pool, rngFrom(e.deckSeed), { type, favorites, rules: deckRules }), difficulty: e.kind === 'elite' ? 'gymLeader' : 'trainer', rules, opponent: e.trainer };
}

const typeName = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** What an event says and what accepting it costs, for the screen. `cardName` names a card id. */
export function eventInfo(event: RunEvent, cardName: (id: string) => string): { title: string; text: string; accept: string } {
  switch (event.id) {
    case 'typeFrenzy':
      return {
        title: `${typeName(event.type)} Frenzy`,
        text: `A strange festival is under way. If you join in, ${typeName(event.type)} Pokémon (yours and your opponents') do double damage in your next ${event.battles} battles.`,
        accept: 'Join in',
      };
    case 'gamble':
      return { title: 'Coin Toss', text: `A gambler offers a bet: pay ₱${event.stake} and flip a coin. Heads wins ₱${event.prize}.`, accept: `Bet ₱${event.stake}` };
    case 'bargain':
      return { title: 'Shady Dealer', text: `A shady dealer offers you ${cardName(event.cardId)}, for a price: you lose 1 HP.`, accept: 'Take the deal' };
    case 'donation':
      return { title: 'Pokémon Fan Club', text: `The Fan Club asks for a ₱${event.cost} donation. In return, the chairman tells you stories worth ${event.exp} EXP.`, accept: `Donate ₱${event.cost}` };
    case 'luckyFind':
      return { title: 'Lucky Find', text: `You spot ₱${event.pokedollars} on the ground.`, accept: 'Pick it up' };
  }
}

/** Battles finished in the run, won or lost; older runs, which didn't count them, from their log. */
export const battlesFought = (state: Pick<RunState, 'battlesFought' | 'log'>) => state.battlesFought ?? state.log.filter((line) => /^(Beat .+: \+₱|Lost to .+: −1 HP)/.test(line)).length;

/** Battles finished without the player conceding the game, won or lost; older runs, which didn't count them, count every battle finished. */
export const battlesCompleted = (state: Pick<RunState, 'battlesCompleted' | 'battlesFought' | 'log'>) => state.battlesCompleted ?? battlesFought(state);

/**
 * The ₱ that go to the bank when the run ends (beaten, lost or conceded): all of them once a battle was finished without
 * conceding it, won or lost (agreed with the user), and none before, so conceding the first battle and the run can't bank
 * the starting ₱. The same first completed battle unlocks the generation's next booster pack (the API, nextPack).
 */
export const bankablePokedollars = (state: Pick<RunState, 'battlesCompleted' | 'battlesFought' | 'log' | 'pokedollars'>) => (battlesCompleted(state) > 0 ? state.pokedollars : 0);

/** Ends the current encounter and moves to the next step's choices. */
function nextStep(state: RunState) {
  state.encounter = null;
  state.position += 1;
  state.phase = 'map';
}

/** One battle fewer for each battle rule and consumable in effect. */
function tickBattles(state: RunState) {
  state.rules = state.rules.map((r) => ({ ...r, battlesLeft: r.battlesLeft - 1 })).filter((r) => r.battlesLeft > 0);
  state.consumables = state.consumables.map((c) => ({ ...c, battlesLeft: c.battlesLeft - 1 })).filter((c) => c.battlesLeft > 0);
}

/**
 * Applies a player's or the server's action to a run. Pure: returns a new state, or an error.
 * `pool` is the card pool encounters offer cards from; `gear` the account's equipped items.
 */
export function applyRunAction(prev: RunState, action: RunAction | RunSystemAction, pool: readonly PoolCard[], gear: readonly string[] = []): RunResult {
  const state = structuredClone(prev);
  const fail = (error: string): RunResult => ({ ok: false, error });
  const ok = (): RunResult => {
    state.version += 1;
    return { ok: true, state };
  };
  const rng: Rng = { state: state.rngState };
  const done = () => {
    state.rngState = rng.state;
    return ok();
  };
  const name = (id: string) => byId(pool).get(id)?.def.name ?? id;
  const e = state.encounter;
  const effects = activeEffects(gear, state.consumables);

  if (action.type === 'RESTORE_HP') {
    if (state.phase !== 'lost') return fail('The run is still going');
    if (state.conceded) return fail('A conceded run is over');
    state.hp = state.maxHp;
    state.phase = 'map';
    state.log.push(`Restored to ${state.maxHp} HP (testing).`);
    return ok();
  }
  if (state.phase === 'won' || state.phase === 'lost') return fail('This run is over');

  switch (action.type) {
    case 'CONCEDE': {
      if (state.phase !== 'map') return fail('Finish this encounter first');
      state.phase = 'lost';
      state.conceded = true;
      const banked = bankablePokedollars(state);
      state.log.push(banked ? `Conceded the run: ₱${banked} banked.` : 'Conceded the run before completing a battle: no ₱ banked.');
      return ok();
    }

    case 'CHOOSE': {
      if (state.phase !== 'map') return fail('Finish this encounter first');
      const step = state.steps[state.position];
      const option = step?.options[action.option];
      if (!step || !option) return fail('No such option');
      step.chosen = action.option;
      state.encounter = rollEncounter(rng, state, option, pool, effects);
      state.phase = 'encounter';
      return done();
    }

    case 'SET_DECK': {
      if (state.phase !== 'map') return fail('Decks can only be switched on the map');
      state.deck = [...action.deck];
      state.deckName = action.name;
      state.log.push(`Switched decks: now battling with ${action.name}.`);
      return ok();
    }

    case 'BATTLE_STARTED': {
      if (!needsBattle(state)) return fail('No battle to start');
      (e as Extract<Encounter, { gameId?: string }>).gameId = action.gameId;
      return ok();
    }

    case 'BATTLE_OVER': {
      if (!e || currentGameId(state) !== action.gameId) return fail('Not the current battle');
      const battle = e as BattleEncounter;
      // The battle's consumables (`effects`, from before) count for its rewards; one of their battles is over.
      tickBattles(state);
      const completed = battlesCompleted(state);
      state.battlesFought = battlesFought(state) + 1;
      state.battlesCompleted = completed + (action.conceded ? 0 : 1);
      if (action.won) {
        const reward = battleReward(battle.kind, battle.focus);
        const prize = between(rng, reward.pokedollars[0] / 10, reward.pokedollars[1] / 10) * 10;
        const pokedollars =
          Math.round((prize * (100 + effectTotal(effects, (x) => (x.kind === 'pokedollarBonus' ? x.percent : 0)))) / 1000) * 10 +
          effectTotal(effects, (x) => (x.kind === 'winPokedollars' ? x.amount : 0));
        const exp = Math.round((reward.exp * (100 + effectTotal(effects, (x) => (x.kind === 'expBonus' ? x.percent : 0)))) / 100);
        state.pokedollars += pokedollars;
        state.exp += exp;
        state.log.push(`Beat ${battle.trainer}: +₱${pokedollars}, +${exp} EXP.`);
        const b = isBossKind(battle.kind) ? bossOf(state, battle) : null;
        const keyItem = b?.gym?.badge ?? b?.prize;
        if (keyItem) state.badges = [...(state.badges ?? []), keyItem];
        if (state.position === state.steps.length - 1) {
          state.encounter = null;
          state.phase = 'won';
          state.log.push(`Beat the ${runType(state.type).name} run!`);
        } else {
          state.encounter = { kind: 'reward', offers: offerCards(rng, pool, OFFERS + moreOffers(effects, 'reward'), reward.rarity), pokedollars, exp, trainer: battle.trainer };
        }
        return done();
      }
      state.hp -= 1;
      state.log.push(`Lost to ${battle.trainer}${action.conceded ? ' (conceded)' : ''}: −1 HP.`);
      // A boss stays to be fought again; any other battle (a Gym Trainer too) is over, won or not.
      if (isBossKind(battle.kind)) {
        state.encounter = null;
        state.phase = 'map';
        delete state.steps[state.position]!.chosen;
      } else {
        nextStep(state);
      }
      if (state.hp <= 0) {
        state.phase = 'lost';
        state.log.push(bankablePokedollars(state) ? 'Out of HP: the run is lost.' : 'Out of HP: the run is lost, without completing a battle: no ₱ banked.');
      }
      return done();
    }

    case 'ACCEPT': {
      if (!e) return fail('Nothing to accept');
      switch (e.kind) {
        case 'elite':
          if (e.accepted) return fail('The battle has started');
          e.accepted = true;
          return ok();
        case 'trade': {
          const i = state.deck.indexOf(e.give);
          if (i < 0) return fail(`You have no ${name(e.give)} in your deck`);
          state.deck[i] = e.get;
          state.gained.push(e.get);
          state.log.push(`Traded ${name(e.give)} for ${name(e.get)}.`);
          nextStep(state);
          return ok();
        }
        case 'center':
          if (state.hp >= state.maxHp) return fail('You already have full HP');
          if (state.pokedollars < e.price) return fail(`Healing costs ₱${e.price}`);
          state.pokedollars -= e.price;
          state.hp += 1;
          state.log.push(`Healed 1 HP at the Pokémon Center for ₱${e.price}.`);
          nextStep(state);
          return ok();
        case 'event': {
          const ev = e.event;
          const info = eventInfo(ev, name);
          if (ev.id === 'typeFrenzy') {
            state.rules.push({ rule: { kind: 'typeDamage', type: ev.type, multiplier: 2 }, battlesLeft: ev.battles, label: `${typeName(ev.type)} Pokémon do double damage` });
            state.log.push(`${info.title}: ${typeName(ev.type)} Pokémon do double damage for ${ev.battles} battles.`);
          } else if (ev.id === 'gamble') {
            if (state.pokedollars < ev.stake) return fail(`The bet is ₱${ev.stake}`);
            state.pokedollars -= ev.stake;
            const heads = random(rng) < 0.5;
            if (heads) state.pokedollars += ev.prize;
            state.log.push(heads ? `Coin Toss: heads! Won ₱${ev.prize}.` : `Coin Toss: tails. Lost ₱${ev.stake}.`);
          } else if (ev.id === 'bargain') {
            if (state.hp <= 1) return fail('That would cost your last HP');
            state.hp -= 1;
            state.gained.push(ev.cardId);
            state.log.push(`${info.title}: got ${name(ev.cardId)} for 1 HP.`);
          } else if (ev.id === 'donation') {
            if (state.pokedollars < ev.cost) return fail(`The donation is ₱${ev.cost}`);
            state.pokedollars -= ev.cost;
            state.exp += ev.exp;
            state.log.push(`${info.title}: donated ₱${ev.cost} for ${ev.exp} EXP.`);
          } else {
            state.pokedollars += ev.pokedollars;
            state.log.push(`${info.title}: found ₱${ev.pokedollars}.`);
          }
          nextStep(state);
          return done();
        }
        default:
          return fail("There's nothing to accept here");
      }
    }

    case 'LEAVE': {
      if (!e) return fail('Nothing to leave');
      if (isBattleKind(e.kind) && (e.kind !== 'elite' || e.accepted)) return fail("You can't walk away from a battle");
      nextStep(state);
      return ok();
    }

    case 'PICK': {
      if (e?.kind !== 'gift' && e?.kind !== 'reward') return fail('No cards to pick from');
      const cardId = e.offers[action.index];
      if (!cardId) return fail('No such card');
      state.gained.push(cardId);
      state.log.push(`Got ${name(cardId)}.`);
      nextStep(state);
      return ok();
    }

    case 'BUY': {
      if (e?.kind !== 'shop') return fail('Not in a shop');
      const offer = e.stock[action.index];
      if (!offer || offer.sold) return fail('Not for sale');
      if (state.pokedollars < offer.price) return fail(`Not enough ₱ (${offer.price} needed)`);
      state.pokedollars -= offer.price;
      offer.sold = true;
      state.gained.push(offer.cardId);
      state.log.push(`Bought ${name(offer.cardId)} for ₱${offer.price}.`);
      return ok();
    }

    case 'USE_ITEM': {
      const def = item(action.itemId);
      if (def.category === 'consumable') {
        if (state.consumablesUsed >= MAX_CONSUMABLES_PER_RUN) return fail(`Only ${MAX_CONSUMABLES_PER_RUN} consumables can be used per run`);
        if (currentGameId(state)) return fail('Use consumables before a battle starts');
        // One at a time (agreed with the user): another waits until the one in effect has run out.
        const active = state.consumables[0];
        if (active) return fail(`${item(active.itemId).name} is still active`);
        state.consumablesUsed += 1;
        state.consumables.push({ itemId: def.id, battlesLeft: def.battles ?? 1 });
        state.log.push(`Used ${def.name}.`);
        return ok();
      }
      if (def.category !== 'misc' || !def.use) return fail(`${def.name} can't be used`);
      const used = state.itemUses[def.id] ?? 0;
      if (def.perRun !== undefined && used >= def.perRun) return fail(`${def.name} can only be used ${def.perRun === 1 ? 'once' : `${def.perRun} times`} per run`);
      const use = def.use;
      const step = state.steps[state.position];
      const notOnMap = state.phase !== 'map' || !step ? fail(`Use ${def.name} when choosing where to go`) : null;
      switch (use.kind) {
        case 'escape': {
          const battle = battleOf(state);
          if (!battle) return fail('There is no battle to escape from');
          if (battle.kind === 'elite' && !battle.accepted) return fail('You can still walk away from this one');
          // A boss or Gym Trainer stays to be fought again; any other battle is over.
          if (isBossKind(battle.kind) || battle.kind === 'gymTrainer') {
            state.encounter = null;
            state.phase = 'map';
            delete step!.chosen;
          } else {
            nextStep(state);
          }
          state.log.push(`Escaped from ${battle.trainer} with an ${def.name}.`);
          break;
        }
        case 'reveal': {
          if (notOnMap) return notOnMap;
          const mysteries = step!.options.filter((o) => o.kind === 'event' && !o.event);
          if (!mysteries.length) return fail('There is no Mystery here to reveal');
          for (const o of mysteries) {
            o.event = rollEvent(rng, state, pool);
            o.label = eventInfo(o.event, name).title;
          }
          state.log.push(`${def.name}: the Mystery here is ${mysteries.map((o) => o.label).join(' and ')}.`);
          break;
        }
        case 'reroll':
          if (notOnMap) return notOnMap;
          if (step!.options.some((o) => o.kind === 'gymTrainer' || isBossKind(o.kind))) return fail(`${def.name} doesn't work at a gym`);
          step!.options = pairUp(rng, rollOptions(rng, state.position, centersOffered(state.steps, state.position)));
          state.log.push(`Used ${def.name}: new encounters to choose from.`);
          break;
        case 'heal':
          if (state.hp >= state.maxHp) return fail('You already have full HP');
          state.hp = Math.min(state.maxHp, state.hp + use.hp);
          state.log.push(`Used ${def.name}: healed ${use.hp} HP.`);
          break;
        case 'pokedollars':
          state.pokedollars += use.amount;
          state.log.push(`Sold a ${def.name} for ₱${use.amount}.`);
          break;
      }
      state.itemUses[def.id] = used + 1;
      return done();
    }
  }
}

/** What the player sees of a run: everything but the RNG and opponents' deck seeds, plus the cards it mentions. */
export function runView(state: RunState, pool: readonly PoolCard[]) {
  const { rngState: _, ...rest } = state;
  const e = state.encounter;
  const encounter = e && 'deckSeed' in e ? (({ deckSeed: __, ...visible }) => visible)(e) : e;
  const ids = new Set([...state.deck, ...state.gained]);
  if (e?.kind === 'shop') e.stock.forEach((s) => ids.add(s.cardId));
  if (e?.kind === 'gift' || e?.kind === 'reward') e.offers.forEach((id) => ids.add(id));
  if (e?.kind === 'trade') [e.give, e.get].forEach((id) => ids.add(id));
  if (e?.kind === 'event' && e.event.id === 'bargain') ids.add(e.event.cardId);
  const cards = byId(pool);
  const defs: Record<string, CardDef & { rarity?: Rarity }> = {};
  for (const id of ids) {
    const c = cards.get(id);
    if (c) defs[id] = { ...c.def, rarity: c.rarity };
  }
  const name = (id: string) => defs[id]?.name ?? id;
  return {
    ...rest,
    encounter,
    event: e?.kind === 'event' ? eventInfo(e.event, name) : null,
    cards: defs,
  };
}

export type RunView = ReturnType<typeof runView>;
