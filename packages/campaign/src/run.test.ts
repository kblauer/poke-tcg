import { describe, expect, it } from 'vitest';
import { expandDeck, STARTER_DECK } from './decks.js';
import { MAX_CONSUMABLES_PER_RUN } from './items.js';
import { applyRunAction, battleSetup, createRun, MAX_HP, needsBattle, runView, STARTING_POKEDOLLARS, type EncounterKind, type RunAction, type RunState, type RunSystemAction } from './run.js';
import { TEST_POOL } from './test-pool.js';

const deck = expandDeck(STARTER_DECK);
const fresh = (seed = 1) => createRun('celadon', deck, seed);

function act(state: RunState, action: RunAction | RunSystemAction): RunState {
  const res = applyRunAction(state, action, TEST_POOL);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

/** A run whose current step offers only `kind`. */
function at(kind: EncounterKind, seed = 1): RunState {
  const s = fresh(seed);
  s.steps[s.position] = { options: [{ kind, label: kind, trainer: kind === 'battle' || kind === 'elite' ? 'Lass Haley' : undefined }] };
  return s;
}

/** Plays a battle from choosing it to its end. */
function fight(state: RunState, won: boolean): RunState {
  let s = state.phase === 'map' ? act(state, { type: 'CHOOSE', option: 0 }) : state;
  if (s.encounter?.kind === 'elite') s = act(s, { type: 'ACCEPT' });
  expect(needsBattle(s)).toBe(true);
  s = act(s, { type: 'BATTLE_STARTED', gameId: 'g1' });
  return act(s, { type: 'BATTLE_OVER', gameId: 'g1', won });
}

describe('createRun', () => {
  it('has 25 steps of 2–3 options, then the gym leader, with 3 HP and ₱500', () => {
    const s = fresh();
    expect(s.steps).toHaveLength(26);
    for (const step of s.steps.slice(0, 25)) {
      expect(step.options.length).toBeGreaterThanOrEqual(2);
      expect(step.options.length).toBeLessThanOrEqual(3);
      expect(step.options.every((o) => o.kind !== 'gymLeader')).toBe(true);
    }
    expect(s.steps[25]!.options).toEqual([{ kind: 'gymLeader', label: 'Gym Leader Erika', trainer: 'Erika' }]);
    expect(s.steps[0]!.options.every((o) => o.kind === 'battle')).toBe(true);
    expect([s.hp, s.maxHp, s.pokedollars]).toEqual([MAX_HP, MAX_HP, STARTING_POKEDOLLARS]);
  });

  it('differs from seed to seed', () => {
    expect(fresh(1).steps).not.toEqual(fresh(2).steps);
  });
});

describe('battles', () => {
  it('a win pays ₱ and EXP, then offers 3 cards to pick one of', () => {
    const s = fight(at('battle'), true);
    expect(s.encounter?.kind).toBe('reward');
    expect(s.pokedollars).toBeGreaterThanOrEqual(STARTING_POKEDOLLARS + 100);
    expect(s.exp).toBe(10);
    const offers = (s.encounter as { offers: string[] }).offers;
    expect(offers).toHaveLength(3);
    const picked = act(s, { type: 'PICK', index: 1 });
    expect(picked.gained).toEqual([offers[1]]);
    expect([picked.phase, picked.position]).toEqual(['map', 1]);
  });

  it('a loss costs 1 HP and moves on; losing the last HP loses the run, and the testing retry restores it', () => {
    let s = fight(at('battle'), false);
    expect([s.hp, s.phase, s.position]).toEqual([2, 'map', 1]);
    s.hp = 1;
    s.steps[s.position] = at('battle').steps[0]!;
    s = fight(s, false);
    expect([s.hp, s.phase, s.position]).toEqual([0, 'lost', 2]);
    expect(applyRunAction(s, { type: 'CHOOSE', option: 0 }, TEST_POOL)).toEqual({ ok: false, error: 'This run is over' });
    s = act(s, { type: 'RESTORE_HP' });
    expect([s.hp, s.phase, s.position]).toEqual([3, 'map', 2]);
  });

  it('the gym leader uses the Flower Power deck at Gym leader difficulty; losing means fighting them again, winning beats the run', () => {
    const s = fresh();
    s.position = 25;
    const chosen = act(s, { type: 'CHOOSE', option: 0 });
    const setup = battleSetup(chosen, TEST_POOL);
    expect(setup.difficulty).toBe('gymLeader');
    expect(setup.deck).toHaveLength(60);
    expect(setup.deck.filter((id) => id === 'base1-99')).toHaveLength(18);
    const lost = fight(chosen, false);
    expect([lost.phase, lost.position, lost.hp]).toEqual(['map', 25, 2]);
    const won = fight(lost, true);
    expect(won.phase).toBe('won');
    expect(won.exp).toBe(100);
  });

  it('trainers get a generated 60-card deck at Trainer difficulty; elite trainers can be declined, or fought at Gym leader difficulty', () => {
    const s = act(at('battle'), { type: 'CHOOSE', option: 0 });
    expect(battleSetup(s, TEST_POOL)).toMatchObject({ difficulty: 'trainer', opponent: 'Lass Haley' });
    expect(battleSetup(s, TEST_POOL).deck).toHaveLength(60);
    const elite = act(at('elite'), { type: 'CHOOSE', option: 0 });
    expect(needsBattle(elite)).toBe(false);
    expect(act(elite, { type: 'LEAVE' }).position).toBe(1);
    expect(battleSetup(act(elite, { type: 'ACCEPT' }), TEST_POOL).difficulty).toBe('gymLeader');
    expect(applyRunAction(s, { type: 'LEAVE' }, TEST_POOL).ok).toBe(false);
  });

  it('battle rules from events last their number of battles', () => {
    let s = at('event');
    s = act(s, { type: 'CHOOSE', option: 0 });
    s.encounter = { kind: 'event', event: { id: 'typeFrenzy', type: 'fire', battles: 2 } };
    s = act(s, { type: 'ACCEPT' });
    expect(s.rules.map((r) => r.rule)).toEqual([{ kind: 'typeDamage', type: 'fire', multiplier: 2 }]);
    s.steps[s.position] = at('battle').steps[0]!;
    s = act(s, { type: 'CHOOSE', option: 0 });
    expect(battleSetup(s, TEST_POOL).rules).toEqual([{ kind: 'typeDamage', type: 'fire', multiplier: 2 }]);
    s = act(fight(s, true), { type: 'LEAVE' });
    expect(s.rules[0]!.battlesLeft).toBe(1);
    s.steps[s.position] = at('battle').steps[0]!;
    expect(fight(s, false).rules).toEqual([]);
  });
});

describe('other encounters', () => {
  it('shops sell cards for ₱ until you leave', () => {
    let s = act(at('shop'), { type: 'CHOOSE', option: 0 });
    const shop = s.encounter as Extract<RunState['encounter'], { kind: 'shop' }>;
    expect(shop.stock).toHaveLength(5);
    s = act(s, { type: 'BUY', index: 0 });
    expect(s.pokedollars).toBe(STARTING_POKEDOLLARS - shop.stock[0]!.price);
    expect(s.gained).toEqual([shop.stock[0]!.cardId]);
    expect(applyRunAction(s, { type: 'BUY', index: 0 }, TEST_POOL).ok).toBe(false);
    s.pokedollars = 0;
    expect(applyRunAction(s, { type: 'BUY', index: 1 }, TEST_POOL).ok).toBe(false);
    expect(act(s, { type: 'LEAVE' }).phase).toBe('map');
  });

  it('a trade swaps one of your deck cards for theirs', () => {
    const s = act(at('trade'), { type: 'CHOOSE', option: 0 });
    const trade = s.encounter as Extract<RunState['encounter'], { kind: 'trade' }>;
    expect(deck).toContain(trade.give);
    const after = act(s, { type: 'ACCEPT' });
    expect(after.deck).toHaveLength(60);
    expect(after.deck.filter((id) => id === trade.give).length).toBe(deck.filter((id) => id === trade.give).length - 1);
    expect(after.gained).toEqual([trade.get]);
  });

  it('a Pokémon Center heals 1 HP for ₱100, not past the maximum', () => {
    const s = act(at('center'), { type: 'CHOOSE', option: 0 });
    expect(applyRunAction(s, { type: 'ACCEPT' }, TEST_POOL)).toEqual({ ok: false, error: 'You already have full HP' });
    s.hp = 2;
    const healed = act(s, { type: 'ACCEPT' });
    expect([healed.hp, healed.pokedollars]).toEqual([3, STARTING_POKEDOLLARS - 100]);
  });

  it('gifts give one of 3 cards, or nothing if skipped', () => {
    const s = act(at('gift'), { type: 'CHOOSE', option: 0 });
    expect((s.encounter as { offers: string[] }).offers).toHaveLength(3);
    expect(act(s, { type: 'LEAVE' }).gained).toEqual([]);
  });
});

describe('items', () => {
  it(`only ${MAX_CONSUMABLES_PER_RUN} consumables per run; misc items keep to their per-run limit`, () => {
    let s = fresh();
    for (let i = 0; i < MAX_CONSUMABLES_PER_RUN; i++) s = act(s, { type: 'USE_ITEM', itemId: 'x-attack' });
    expect(applyRunAction(s, { type: 'USE_ITEM', itemId: 'x-attack' }, TEST_POOL).ok).toBe(false);
    s = act(s, { type: 'USE_ITEM', itemId: 'escape-rope' });
    expect(applyRunAction(s, { type: 'USE_ITEM', itemId: 'escape-rope' }, TEST_POOL).ok).toBe(false);
    for (let i = 0; i < 5; i++) s = act(s, { type: 'USE_ITEM', itemId: 'coin-case' });
    expect(applyRunAction(s, { type: 'USE_ITEM', itemId: 'rainbow-badge' }, TEST_POOL).ok).toBe(false);
  });
});

describe('runView', () => {
  it('hides the RNG and deck seeds', () => {
    const s = act(at('battle'), { type: 'CHOOSE', option: 0 });
    const view = runView(s, TEST_POOL);
    expect(view).not.toHaveProperty('rngState');
    expect(view.encounter).not.toHaveProperty('deckSeed');
  });
});

describe('a whole run', () => {
  it('can be played from start to finish choosing at random, and every step is reachable', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = fresh(seed);
      let games = 0;
      for (let guard = 0; s.phase !== 'won' && guard < 500; guard++) {
        if (s.phase === 'lost') s = act(s, { type: 'RESTORE_HP' });
        else if (s.phase === 'map') s = act(s, { type: 'CHOOSE', option: (seed + s.position) % s.steps[s.position]!.options.length });
        else if (needsBattle(s)) s = act(s, { type: 'BATTLE_STARTED', gameId: `g${++games}` });
        else if (s.encounter && 'gameId' in s.encounter && s.encounter.gameId) s = act(s, { type: 'BATTLE_OVER', gameId: s.encounter.gameId, won: games % 3 !== 0 });
        else if (s.encounter?.kind === 'elite') s = act(s, { type: 'ACCEPT' });
        else if (s.encounter?.kind === 'reward' || s.encounter?.kind === 'gift') s = act(s, { type: 'PICK', index: 0 });
        else s = act(s, { type: 'LEAVE' });
      }
      expect(s.phase).toBe('won');
      expect(s.position).toBe(25);
    }
  });
});
