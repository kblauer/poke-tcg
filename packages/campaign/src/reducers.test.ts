// The run's and the Battle Tower's reducers, held to what every state and action must do (#204), as `settles` holds the
// engine's questions: every run type is played through with its own generation's pool and a deck of it (run.test.ts's
// whole runs play half the run types, all with Gen 1's pool), choosing at random and taking the trades, with the deck
// kept legal after every action; and from the states on the way, every action, the server's included and with answers
// that fit nothing, either succeeds with the version one up or is refused with the state untouched (it's frozen), never
// thrown, and every state that isn't over can be left.
import { describe, expect, it } from 'vitest';
import { deckErrors, expandDeck, generateDeck, STARTER_DECK } from './decks.js';
import { ITEMS } from './items.js';
import type { PoolCard } from './pool.js';
import { int, rngFrom, type Rng } from './random.js';
import { applyRunAction, createRun, needsBattle, type RunAction, type RunState, type RunSystemAction } from './run.js';
import { RUN_TYPE_IDS, runGeneration, runType, type RunTypeId } from './run-types.js';
import { catalogDef, GEN2_TEST_POOL, GEN3_TEST_POOL, GEN4_TEST_POOL, TEST_POOL } from './test-pool.js';
import { applyTowerAction, createTower, TOP_FLOOR, type TowerAction, type TowerState, type TowerSystemAction } from './tower.js';

const POOLS: Record<number, PoolCard[]> = { 1: TEST_POOL, 2: GEN2_TEST_POOL, 3: GEN3_TEST_POOL, 4: GEN4_TEST_POOL };
const poolOf = (type: RunTypeId) => POOLS[runType(type).generation]!;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

type AnyRunAction = RunAction | RunSystemAction;

/** A run's battle under way, if there is one. */
const gameOf = (s: RunState) => (s.encounter && 'gameId' in s.encounter ? s.encounter.gameId : undefined);

/** Every action to throw at a run state: each player action with answers in and out of range, and the server's, for this battle and for none. */
function runActions(s: RunState): AnyRunAction[] {
  const item = Object.keys(ITEMS)[0]!;
  return [
    ...[0, 1, 2, 5].map((option): AnyRunAction => ({ type: 'CHOOSE', option })),
    { type: 'ACCEPT' },
    { type: 'LEAVE' },
    ...[0, 2, 10].map((index): AnyRunAction => ({ type: 'PICK', index })),
    ...[0, 2, 10].map((index): AnyRunAction => ({ type: 'BUY', index })),
    { type: 'CONCEDE' },
    { type: 'BATTLE_STARTED', gameId: 'new' },
    ...[gameOf(s) ?? 'none', 'another'].flatMap((gameId): AnyRunAction[] => [
      { type: 'BATTLE_OVER', gameId, won: true },
      { type: 'BATTLE_OVER', gameId, won: false },
      { type: 'BATTLE_OVER', gameId, won: false, conceded: true },
      { type: 'BATTLE_OVER', gameId, won: true, skipped: true },
    ]),
    { type: 'USE_ITEM', itemId: item },
    { type: 'USE_ITEM', itemId: 'no-such-item' },
    { type: 'RESTORE_HP' },
    { type: 'SET_DECK', deck: s.deck, name: 'The same deck' },
    { type: 'WHOS_THAT_STARTED', cardId: 'base1-4', at: 0 },
    { type: 'WHOS_THAT_OVER', won: true, answer: 'Charizard' },
    { type: 'WHOS_THAT_OVER', won: false, answer: '' },
  ];
}

/** What's wrong with how the reducer takes `action` from `state` (frozen): nothing, for a success one version up or a refusal with a reason. */
function totality<S extends { version: number }, A>(state: S, action: A, apply: (s: S, a: A) => { ok: true; state: S } | { ok: false; error: string }): string | null {
  const before = JSON.stringify(state);
  try {
    const r = apply(deepFreeze(state), action);
    if (JSON.stringify(state) !== before) return 'changed the state it was given';
    if (r.ok) return r.state.version === state.version + 1 ? null : `version ${state.version} to ${r.state.version}`;
    return r.error ? null : 'refused with no reason';
  } catch (e) {
    return `threw: ${(e as Error).message}`;
  }
}

/** The next action of a run played at random: the map's options, battles started and ended (one in four lost), and whatever the encounter takes, trades first. */
function nextRunAction(s: RunState, rng: Rng, pool: readonly PoolCard[], games: number): AnyRunAction {
  if (s.phase === 'lost') return { type: 'RESTORE_HP' };
  if (s.phase === 'map') return { type: 'CHOOSE', option: int(rng, s.steps[s.position]!.options.length) };
  if (needsBattle(s)) return { type: 'BATTLE_STARTED', gameId: `g${games}` };
  const gameId = gameOf(s);
  if (gameId) return { type: 'BATTLE_OVER', gameId, won: int(rng, 4) !== 0 };
  const tries: AnyRunAction[] = [{ type: 'ACCEPT' }, { type: 'PICK', index: int(rng, 3) }, { type: 'PICK', index: 0 }, { type: 'BUY', index: int(rng, 3) }, { type: 'LEAVE' }];
  // A shop is left once something was tried in it, or the run would buy for ever.
  const order = s.encounter?.kind === 'shop' && int(rng, 2) ? [tries[4]!] : s.encounter?.kind === 'trade' || int(rng, 3) ? tries : [tries[4]!, ...tries];
  return order.find((a) => applyRunAction(s, a, pool).ok) ?? { type: 'LEAVE' };
}

/**
 * Faults the played runs show today, by their line, each with where it was reported. A run may show only these, and each
 * must still be seen in some run, so a fix takes its entry out.
 */
const KNOWN: Record<string, string> = {};

describe('every run type, played through with its own generation’s pool', () => {
  const seen = new Set<string>();

  it('covers every generation with runs', () => {
    expect([...new Set(RUN_TYPE_IDS.map((id) => runType(id).generation))].sort()).toEqual([1, 2, 3, 4]);
  });

  it.each(RUN_TYPE_IDS)('%s: reaches its end, the deck legal after every action, and the reducer total on the way', (type) => {
    const pool = poolOf(type);
    for (const seed of [1, 2]) {
      const rng = rngFrom(seed * 7919);
      const deck = generateDeck(pool, rngFrom(seed), { rules: runGeneration(type).deckRules });
      expect(deckErrors(deck, catalogDef)).toEqual([]);
      let s = createRun(type, deck, seed);
      let games = 0;
      const faults = new Set<string>();
      for (let guard = 0; s.phase !== 'won'; guard++) {
        expect(guard, `${type}, seed ${seed}: the run never ends`).toBeLessThan(3000);
        // The reducer is total: on the first seed, from every third state (each try costs a copy of the run).
        if (seed === 1 && guard % 3 === 0) {
          const results = runActions(s).map((a) => [a, totality(s, a, (state, action) => applyRunAction(state, action, pool))] as const);
          for (const [a, fault] of results) if (fault) faults.add(`${JSON.stringify(a)}: ${fault}`);
          if (!results.some(([a]) => applyRunAction(s, a, pool).ok)) faults.add(`${s.phase}/${s.encounter?.kind ?? '-'}: no action is taken`);
        }
        const action = nextRunAction(s, rng, pool, ++games);
        const r = applyRunAction(s, action, pool);
        if (!r.ok) throw new Error(`${type}, seed ${seed}: ${JSON.stringify(action)} refused in ${s.phase}/${s.encounter?.kind ?? '-'}: ${r.error}`);
        s = r.state;
        for (const error of deckErrors(s.deck, catalogDef)) faults.add(`the run deck after ${action.type} (${s.encounter?.kind ?? s.phase}): ${error}`);
      }
      for (const fault of faults) seen.add(fault);
      expect([...faults].filter((fault) => !(fault in KNOWN))).toEqual([]);
      expect(s.position).toBe(s.steps.length - 1);
    }
  });

  it('every known fault is still seen', () => {
    expect(Object.keys(KNOWN).filter((fault) => !seen.has(fault))).toEqual([]);
  });
});

/** The first gym run of each generation, for the trades below. */
const FIRST_RUNS: Record<number, RunTypeId> = { 1: 'pewter', 2: 'violet', 3: 'rustboro', 4: 'oreburgh' };
/**
 * Generations whose trades can leave the run deck against the deck rules today (#204 area 6, bug 2: the card received is
 * any card of the pool, whatever the deck already holds: a fifth copy, a second Shining Pokémon, a fifth Unown), each
 * asserted to still do so: take a generation out with the fix.
 */
// (Empty since #211: a trade offers only cards the deck can still take, takesCopy.)
const TRADE_BREAKS: Record<number, string> = {};

describe('a trade', () => {
  it.each([1, 2, 3, 4])('in Generation %i leaves the run deck legal, over 400 seeds (or is a known gap, and still one)', (generation) => {
    const type = FIRST_RUNS[generation]!;
    const pool = poolOf(type);
    const deck = generation === 1 ? expandDeck(STARTER_DECK) : generateDeck(pool, rngFrom(1), { rules: runGeneration(type).deckRules });
    expect(deckErrors(deck, catalogDef)).toEqual([]);
    const broken: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const s = createRun(type, deck, seed);
      s.steps[s.position] = { options: [{ kind: 'trade', label: 'Trade' }] };
      const offered = applyRunAction(s, { type: 'CHOOSE', option: 0 }, pool);
      if (!offered.ok) throw new Error(offered.error);
      const traded = applyRunAction(offered.state, { type: 'ACCEPT' }, pool);
      if (!traded.ok) throw new Error(traded.error);
      const errors = deckErrors(traded.state.deck, catalogDef);
      if (errors.length) broken.push(`seed ${seed}: ${errors.join(', ')}`);
    }
    if (generation in TRADE_BREAKS) expect(broken.length, `Generation ${generation}'s trades keep the deck legal now: take it out of TRADE_BREAKS`).toBeGreaterThan(0);
    else expect(broken).toEqual([]);
    // (400 trades a generation: about 5 s for Gen 4's pool since takesCopy, past vitest's 5 s default.)
  }, 30_000);
});

type AnyTowerAction = TowerAction | TowerSystemAction;

function towerActions(s: TowerState): AnyTowerAction[] {
  return [
    { type: 'CONTINUE' },
    { type: 'SAVE' },
    { type: 'RESUME' },
    { type: 'QUIT' },
    { type: 'BATTLE_STARTED', gameId: 'new' },
    ...[s.opponent?.gameId ?? 'none', 'another'].flatMap((gameId): AnyTowerAction[] => [
      { type: 'BATTLE_OVER', gameId, won: true },
      { type: 'BATTLE_OVER', gameId, won: false },
      { type: 'BATTLE_OVER', gameId, won: false, conceded: true },
      { type: 'BATTLE_OVER', gameId, won: true, skipped: true },
    ]),
  ];
}

describe('the Battle Tower’s reducer', () => {
  const DECK = expandDeck(STARTER_DECK);

  it('takes or refuses every action from every state on the way, and gives Battle Points and wins only for a battle won', () => {
    const phases = new Set<string>();
    const faults = new Set<string>();
    for (const [seed, startFloor] of [[1, 1], [2, 1], [3, 6], [4, 96], [5, 96], [6, 100]] as const) {
      const rng = rngFrom(seed);
      let s = createTower(DECK, seed, startFloor);
      for (let guard = 0; guard < 400 && s.phase !== 'won' && s.phase !== 'lost'; guard++) {
        const actions = towerActions(s);
        phases.add(`${s.phase}${s.saved ? ' (saved)' : ''}${s.opponent?.gameId ? ' (game)' : ''}`);
        for (const a of actions) {
          const fault = totality(s, a, applyTowerAction);
          if (fault) faults.add(`${s.phase}, ${JSON.stringify(a)}: ${fault}`);
          const r = applyTowerAction(s, a);
          if (!r.ok) continue;
          const wonBattle = a.type === 'BATTLE_OVER' && a.won;
          if (!wonBattle && (r.state.bp !== s.bp || r.state.wins !== s.wins || r.state.floor !== s.floor)) faults.add(`${a.type} changed the Battle Points, wins or floor`);
          if (wonBattle && r.state.wins !== s.wins + 1) faults.add('a battle won is not one more win');
          if (wonBattle && 'skipped' in a && r.state.bp !== s.bp) faults.add('a skipped battle gave Battle Points');
        }
        const taken = actions.filter((a) => applyTowerAction(s, a).ok);
        if (!taken.length) faults.add(`${s.phase}: no action is taken`);
        // On: mostly forwards (a battle let in, started, won), now and then a save taken up again; never QUIT, and a loss only late.
        const forward = taken.filter((a) => a.type !== 'QUIT' && !(a.type === 'BATTLE_OVER' && !a.won && guard < 300) && !(a.type === 'SAVE' && int(rng, 4)));
        s = (applyTowerAction(s, forward[int(rng, forward.length)] ?? taken[0]!) as { ok: true; state: TowerState }).state;
      }
      phases.add(s.phase);
      // An ended challenge refuses everything.
      if (s.phase === 'won' || s.phase === 'lost') for (const a of towerActions(s)) if (applyTowerAction(s, a).ok) faults.add(`${a.type} taken after the challenge was ${s.phase}`);
    }
    expect([...faults]).toEqual([]);
    expect([...phases].sort()).toEqual(['battle', 'battle (game)', 'between', 'between (saved)', 'lost', 'won']);
    expect(TOP_FLOOR).toBe(100);
  }, 60_000);
});
