// A run: 25 steps of encounters chosen one at a time on a map (2–3 options each), then the gym leader.
// RunState is plain JSON (saved in Run.state); applyRunAction is its reducer, like the engine's applyAction.
// Battles themselves are engine games: the API starts one when the run asks for it (needsBattle) and
// reports the result back with BATTLE_OVER.
import type { BattleRule, CardDef, CpuDifficulty, EnergyType } from '@poke-tcg/game-engine';
import { expandDeck, generateDeck } from './decks.js';
import { item, MAX_CONSUMABLES_PER_RUN } from './items.js';
import { byId, DECK_TYPES, offerable, PRICES, rarityWeight, type PoolCard, type Rarity } from './pool.js';
import { between, pick, random, rngFrom, seed, weighted, type Rng } from './random.js';
import { runType, type RunTypeId } from './run-types.js';

export const MAX_HP = 3;
export const STARTING_POKEDOLLARS = 500;

export type EncounterKind = 'battle' | 'elite' | 'gymLeader' | 'shop' | 'gift' | 'trade' | 'event' | 'center';

/** A choice on the map. What's inside (a shop's stock, a gift's cards) is rolled when it's chosen. */
export interface MapEncounter {
  kind: EncounterKind;
  label: string;
  /** Battles: the opponent's name. */
  trainer?: string;
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
  | { kind: 'battle' | 'elite' | 'gymLeader'; trainer: string; deckSeed: number; accepted?: boolean; gameId?: string }
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
  /** ₱ to spend in this run. Banked when the next run starts. */
  pokedollars: number;
  /** EXP earned this run, added to the account when the run is beaten. */
  exp: number;
  /** The deck used in battles (trades change it). */
  deck: string[];
  /** The deck the run started with. */
  startingDeck: string[];
  /** Cards gained during the run (gifts, rewards, shops, trades), in the order they came. Each is unlocked for the deck builder as it's gained; only trades put one in the run's deck. */
  gained: string[];
  steps: Step[];
  /** The step being played (or chosen next). */
  position: number;
  /** map: choosing the next encounter; encounter: playing it; won/lost: the run is over. */
  phase: 'map' | 'encounter' | 'won' | 'lost';
  encounter: Encounter | null;
  /** Battle rules from events, for the next `battlesLeft` battles. */
  rules: { rule: BattleRule; battlesLeft: number; label: string }[];
  /** Consumables in effect, for the next `battlesLeft` battles. */
  consumables: { itemId: string; battlesLeft: number }[];
  consumablesUsed: number;
  /** Times each misc item was used this run. */
  itemUses: Record<string, number>;
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
  | { type: 'BUY'; index: number };

/** Actions only the server sends (battles, items, the testing retry). Never accepted from clients. */
export type RunSystemAction =
  | { type: 'BATTLE_STARTED'; gameId: string }
  | { type: 'BATTLE_OVER'; gameId: string; won: boolean }
  | { type: 'USE_ITEM'; itemId: string }
  | { type: 'RESTORE_HP' };

export type RunResult = { ok: true; state: RunState } | { ok: false; error: string };

const TRAINERS = [
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

const LABELS: Record<Exclude<EncounterKind, 'battle' | 'elite' | 'gymLeader'>, string> = {
  shop: 'Card Shop',
  gift: 'Free Card',
  trade: 'Card Trade',
  event: 'Mystery',
  center: 'Pokémon Center',
};

/** Rewards for winning each kind of battle. */
const REWARDS = { battle: { pokedollars: [100, 150], exp: 10 }, elite: { pokedollars: [250, 250], exp: 25 }, gymLeader: { pokedollars: [500, 500], exp: 100 } } as const;

const CENTER_PRICE = 100;
const SHOP_SIZE = 5;
const OFFERS = 3;
const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, holo: 3 };

function mapEncounter(rng: Rng, kind: EncounterKind): MapEncounter {
  if (kind === 'battle') {
    const trainer = pick(rng, TRAINERS);
    return { kind, label: trainer, trainer };
  }
  if (kind === 'elite') {
    const trainer = `Ace Trainer ${pick(rng, ['Cal', 'Gwen', 'Paige', 'Rolf', 'Vera', 'Quinn'])}`;
    return { kind, label: trainer, trainer };
  }
  if (kind === 'gymLeader') throw new Error('The gym leader is added separately');
  return { kind, label: LABELS[kind] };
}

/** A new run of `type` with `deck`. The map is fixed by the seed; what's in each encounter is rolled when it's entered. */
export function createRun(typeId: RunTypeId, deck: string[], runSeed: number): RunState {
  const type = runType(typeId);
  const rng = rngFrom(runSeed);
  const steps: Step[] = [];
  for (let i = 0; i < type.steps; i++) {
    // The first step is always a battle or two; Pokémon Centers and elite trainers come later.
    const kinds = KIND_WEIGHTS.filter(([k]) => (i === 0 ? k === 'battle' : (k !== 'center' || i >= 3) && (k !== 'elite' || i >= 5)));
    const count = i === 0 ? 2 : between(rng, 2, 3);
    const options: MapEncounter[] = [];
    for (let n = 0; n < count; n++) {
      const left = kinds.filter(([k]) => k === 'battle' || !options.some((o) => o.kind === k));
      options.push(mapEncounter(rng, weighted(rng, left)));
    }
    steps.push({ options });
  }
  steps.push({ options: [{ kind: 'gymLeader', label: `Gym Leader ${type.leader.name}`, trainer: type.leader.name }] });
  return {
    version: 0,
    type: typeId,
    rngState: rng.state,
    hp: MAX_HP,
    maxHp: MAX_HP,
    pokedollars: STARTING_POKEDOLLARS,
    exp: 0,
    deck: [...deck],
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

function rollEncounter(rng: Rng, state: RunState, option: MapEncounter, pool: readonly PoolCard[]): Encounter {
  switch (option.kind) {
    case 'battle':
    case 'gymLeader':
      return { kind: option.kind, trainer: option.trainer!, deckSeed: seed(rng) };
    case 'elite':
      return { kind: 'elite', trainer: option.trainer!, deckSeed: seed(rng), accepted: false };
    case 'shop': {
      const cards = byId(pool);
      return { kind: 'shop', stock: offerCards(rng, pool, SHOP_SIZE).map((cardId) => ({ cardId, price: PRICES[cards.get(cardId)!.rarity] })) };
    }
    case 'gift':
      return { kind: 'gift', offers: offerCards(rng, pool, OFFERS) };
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
      return { kind: 'event', event: rollEvent(rng, state, pool) };
    case 'center':
      return { kind: 'center', price: CENTER_PRICE };
  }
}

/** Whether the run is waiting for the server to start a battle (it then sends BATTLE_STARTED). */
export const needsBattle = (state: RunState) => {
  const e = state.encounter;
  return state.phase === 'encounter' && !!e && (e.kind === 'battle' || e.kind === 'gymLeader' || (e.kind === 'elite' && !!e.accepted)) && !e.gameId;
};

/** The current battle's game, if one is under way. */
export const currentGameId = (state: RunState) => {
  const e = state.encounter;
  return e && (e.kind === 'battle' || e.kind === 'elite' || e.kind === 'gymLeader') ? (e.gameId ?? null) : null;
};

/** What the server needs to start the battle: the CPU's deck, how it plays, and the battle rules in effect. */
export function battleSetup(state: RunState, pool: readonly PoolCard[]): { deck: string[]; difficulty: CpuDifficulty; rules: BattleRule[]; opponent: string } {
  const e = state.encounter;
  if (!e || (e.kind !== 'battle' && e.kind !== 'elite' && e.kind !== 'gymLeader')) throw new Error('No battle to start');
  const rules = state.rules.map((r) => r.rule);
  if (e.kind === 'gymLeader') return { deck: expandDeck(runType(state.type).leader.deck), difficulty: 'gymLeader', rules, opponent: e.trainer };
  return { deck: generateDeck(pool, rngFrom(e.deckSeed)), difficulty: e.kind === 'elite' ? 'gymLeader' : 'trainer', rules, opponent: e.trainer };
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
 * `pool` is the card pool encounters offer cards from.
 */
export function applyRunAction(prev: RunState, action: RunAction | RunSystemAction, pool: readonly PoolCard[]): RunResult {
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

  if (action.type === 'RESTORE_HP') {
    if (state.phase !== 'lost') return fail('The run is still going');
    state.hp = state.maxHp;
    state.phase = 'map';
    state.log.push(`Restored to ${state.maxHp} HP (testing).`);
    return ok();
  }
  if (state.phase === 'won' || state.phase === 'lost') return fail('This run is over');

  switch (action.type) {
    case 'CHOOSE': {
      if (state.phase !== 'map') return fail('Finish this encounter first');
      const step = state.steps[state.position];
      const option = step?.options[action.option];
      if (!step || !option) return fail('No such option');
      step.chosen = action.option;
      state.encounter = rollEncounter(rng, state, option, pool);
      state.phase = 'encounter';
      return done();
    }

    case 'BATTLE_STARTED': {
      if (!needsBattle(state)) return fail('No battle to start');
      (e as Extract<Encounter, { gameId?: string }>).gameId = action.gameId;
      return ok();
    }

    case 'BATTLE_OVER': {
      if (!e || currentGameId(state) !== action.gameId) return fail('Not the current battle');
      const battle = e as Extract<Encounter, { deckSeed: number }>;
      tickBattles(state);
      if (action.won) {
        const reward = REWARDS[battle.kind];
        const pokedollars = between(rng, reward.pokedollars[0] / 10, reward.pokedollars[1] / 10) * 10;
        state.pokedollars += pokedollars;
        state.exp += reward.exp;
        state.log.push(`Beat ${battle.trainer}: +₱${pokedollars}, +${reward.exp} EXP.`);
        if (battle.kind === 'gymLeader') {
          state.encounter = null;
          state.phase = 'won';
          state.log.push(`Beat the ${runType(state.type).name} run!`);
        } else {
          state.encounter = { kind: 'reward', offers: offerCards(rng, pool, OFFERS, battle.kind === 'elite' ? 'uncommon' : 'common'), pokedollars, exp: reward.exp, trainer: battle.trainer };
        }
        return done();
      }
      state.hp -= 1;
      state.log.push(`Lost to ${battle.trainer}: −1 HP.`);
      // A gym leader stays to be fought again; any other battle is over, won or not.
      if (battle.kind === 'gymLeader') {
        state.encounter = null;
        state.phase = 'map';
        delete state.steps[state.position]!.chosen;
      } else {
        nextStep(state);
      }
      if (state.hp <= 0) {
        state.phase = 'lost';
        state.log.push('Out of HP: the run is lost.');
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
      if (e.kind === 'battle' || e.kind === 'gymLeader' || (e.kind === 'elite' && e.accepted)) return fail("You can't walk away from a battle");
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
        state.consumablesUsed += 1;
        state.consumables.push({ itemId: def.id, battlesLeft: def.battles ?? 1 });
      } else if (def.category === 'misc') {
        const used = state.itemUses[def.id] ?? 0;
        if (def.perRun !== undefined && used >= def.perRun) return fail(`${def.name} can only be used ${def.perRun === 1 ? 'once' : `${def.perRun} times`} per run`);
        state.itemUses[def.id] = used + 1;
      } else {
        return fail(`${def.name} can't be used`);
      }
      state.log.push(`Used ${def.name}.`);
      return ok();
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
