// The agreed map rules checked on every run type (run.test.ts checks them on Pewter and Celadon): required battles,
// Pokémon Centers and Ace Trainers, the surfed routes' spots, Repel, Escape Rope, trades across generations, the Gym
// Trainers' lists and the music's route per step on runs with several maps.
import { describe, expect, it } from 'vitest';
import { boss } from './bosses.js';
import { expandDeck, STARTER_DECK } from './decks.js';
import { runMusic } from './music.js';
import { routeAt, RUN_TYPE_IDS, runType, type RunTypeId } from './run-types.js';
import { applyRunAction, battlesCompleted, createRun, isBattleKind, isBossKind, landNear, MAX_CENTERS, MAX_HP, needsBattle, REQUIRED_BATTLES, type EncounterKind, type RunAction, type RunState, type RunSystemAction, type Step } from './run.js';
import { GEN2_TEST_POOL, TEST_POOL } from './test-pool.js';

const deck = expandDeck(STARTER_DECK);
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function act(state: RunState, action: RunAction | RunSystemAction, pool = TEST_POOL): RunState {
  const res = applyRunAction(state, action, pool, []);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

/** A run whose current step offers only `kind`. */
function at(kind: EncounterKind, type: RunTypeId = 'celadon', withDeck = deck): RunState {
  const s = createRun(type, withDeck, 1);
  s.steps[s.position] = { options: [{ kind, label: kind, trainer: kind === 'battle' ? 'Lass Haley' : undefined }] };
  return s;
}

/** Plays a battle from choosing it to its end. */
function fight(state: RunState, won: boolean, extra: { conceded?: true; skipped?: true } = {}): RunState {
  let s = state.phase === 'map' ? act(state, { type: 'CHOOSE', option: 0 }) : state;
  expect(needsBattle(s)).toBe(true);
  s = act(s, { type: 'BATTLE_STARTED', gameId: 'g1' });
  return act(s, { type: 'BATTLE_OVER', gameId: 'g1', won, ...extra });
}

/** A run's encounter steps: those before the Gym Trainers' and bosses'. */
const encounterSteps = (steps: Step[]) => steps.filter((st) => !st.options.some((o) => o.kind === 'gymTrainer' || isBossKind(o.kind)));
const isSwimmer = (trainer: string | undefined) => !!trainer?.startsWith('Swimmer ');

describe('the map generator, on every run type', () => {
  it.each(RUN_TYPE_IDS)(`%s: the first encounter a battle, at least ${REQUIRED_BATTLES} required battles (as far as the encounters go), at most ${MAX_CENTERS} rolled Pokémon Centers (from step 3), Ace Trainers from step 5, 1–3 options a step`, (id) => {
    const type = runType(id);
    const encounters = type.segments.reduce((n, s) => n + s.steps, 0);
    const fixedCenters = type.segments.filter((s) => s.center).length;
    for (const seed of SEEDS) {
      const s = createRun(id, deck, seed);
      // The encounter steps, and a Gym Challenge's fixed Pokémon Center (segment.center).
      const steps = encounterSteps(s.steps);
      expect(steps.length, `seed ${seed}`).toBe(encounters + fixedCenters);
      expect(s.steps.flatMap((st) => st.options).filter((o) => o.kind === 'center').length).toBeLessThanOrEqual(MAX_CENTERS + fixedCenters);
      if (!encounters) continue;
      expect(steps[0]!.options.every((o) => o.kind === 'battle'), `seed ${seed}: the first step`).toBe(true);
      const required = steps.filter((st) => st.options.every((o) => o.kind === 'battle'));
      expect(required.length, `seed ${seed}`).toBeGreaterThanOrEqual(Math.min(REQUIRED_BATTLES, encounters));
      steps.forEach((st, i) => {
        expect(st.options.length).toBeGreaterThanOrEqual(1);
        expect(st.options.length).toBeLessThanOrEqual(3);
        if (i < 3) expect(st.options.some((o) => o.kind === 'center'), `seed ${seed} step ${i}`).toBe(false);
        if (i < 5) expect(st.options.some((o) => o.kind === 'elite'), `seed ${seed} step ${i}`).toBe(false);
      });
    }
  });

  it.each(RUN_TYPE_IDS)('%s: every gym leader has a Gym Trainer the step before, except in the Gym Challenge and Champion runs', (id) => {
    const type = runType(id);
    const steps = createRun(id, deck, 1).steps;
    steps.forEach((st, i) => {
      const leader = st.options.find((o) => o.kind === 'gymLeader');
      if (!leader) return;
      const segment = type.segments.find((seg) => seg.bosses.includes(leader.boss!))!;
      const before = steps[i - 1]?.options[0];
      if (segment.gymTrainers === false) expect(before?.kind, `${id}: ${leader.trainer}`).not.toBe('gymTrainer');
      else expect(before, `${id}: ${leader.trainer}`).toMatchObject({ kind: 'gymTrainer', boss: leader.boss });
    });
  });

  it('surfed routes: spots at sea offer only battles (Swimmers where the route has them), spots ashore no battles, the land battle a battle against anyone else, spots on land ordinary', () => {
    const surfed = RUN_TYPE_IDS.filter((id) => runType(id).routes?.some((r) => r.travel === 'surf'));
    expect(surfed.sort()).toEqual(['cianwood', 'cinnabar', 'dewford', 'mossdeep', 'sootopolis']);
    for (const id of surfed) {
      const type = runType(id);
      type.routes!.forEach((route, r) => {
        if (route.travel !== 'surf') return;
        const first = type.routes!.slice(0, r).reduce((n, x) => n + x.spots.length, 0);
        for (const seed of SEEDS) {
          const steps = createRun(id, deck, seed).steps;
          route.spots.forEach((spot, i) => {
            const label = `${id} seed ${seed} spot ${i}`;
            const options = steps[first + i]!.options;
            const battles = options.filter((o) => o.kind === 'battle');
            const onLand = !!route.landSpots && route.walkable[spot.y]?.[spot.x] === '.';
            if (route.landBattle === i) {
              expect(options.every((o) => o.kind === 'battle'), label).toBe(true);
              expect(battles.some((o) => isSwimmer(o.trainer)), label).toBe(false);
            } else if (onLand) {
              expect(battles.some((o) => isSwimmer(o.trainer)), label).toBe(false);
            } else if (!landNear(route, spot)) {
              expect(options.every((o) => o.kind === 'battle'), label).toBe(true);
              if (route.trainers) expect(battles.every((o) => isSwimmer(o.trainer)), label).toBe(true);
            } else {
              expect(options.every((o) => !isBattleKind(o.kind)), label).toBe(true);
            }
          });
        }
      });
    }
  });

  it("Johto's and Hoenn's Gym Trainers come from their gym's own list where it has one, like Kanto's", () => {
    for (const id of RUN_TYPE_IDS) {
      for (const seed of SEEDS.slice(0, 8)) {
        for (const st of createRun(id, deck, seed).steps) {
          const gymTrainer = st.options.find((o) => o.kind === 'gymTrainer');
          if (!gymTrainer) continue;
          const own = boss(gymTrainer.boss!).gym?.trainers;
          if (own) expect(own, `${id}: ${gymTrainer.trainer}`).toContain(gymTrainer.trainer);
        }
      }
    }
    // Every generation has gyms with their own lists.
    for (const ids of [['pewter', 'vermilion'], ['violet', 'goldenrod'], ['rustboro', 'mauville']] as const) {
      expect(ids.some((id) => boss(runType(id).segments[0]!.bosses[0]!).gym?.trainers?.length), ids.join()).toBeTruthy();
    }
  });
});

describe('Repel', () => {
  const repel = (s: RunState) => act(s, { type: 'USE_ITEM', itemId: 'repel' });

  it("keeps the route's rules on a bike route (Route 17's Bikers, Route 110's Triathletes) and on Johto's and Hoenn's surfed ones", () => {
    const rolled = (id: RunTypeId, position: number) => SEEDS.map((seed) => {
      const s = createRun(id, deck, seed);
      s.position = position;
      return repel(s).steps[position]!.options;
    });
    for (const [id, cls] of [['fuchsia', 'Biker'], ['mauville', 'Triathlete']] as const) {
      const trainers = rolled(id, 1).flat().filter((o) => o.kind === 'battle').map((o) => o.trainer!);
      expect(trainers.some((t) => t.startsWith(`${cls} `)), id).toBe(true);
      expect(trainers.some(isSwimmer), id).toBe(false);
    }
    for (const id of ['cianwood', 'dewford', 'mossdeep'] as const) {
      const route = runType(id).routes![0]!;
      const sea = route.spots.findIndex((spot, i) => !landNear(route, spot) && i !== route.landBattle);
      expect(sea, id).toBeGreaterThanOrEqual(0);
      for (const options of rolled(id, sea)) expect(options.every((o) => o.kind === 'battle'), id).toBe(true);
      const shore = route.spots.findIndex((spot, i) => landNear(route, spot) && i !== route.landBattle && !(route.landSpots && route.walkable[spot.y]?.[spot.x] === '.'));
      if (shore >= 0) for (const options of rolled(id, shore)) expect(options.every((o) => !isBattleKind(o.kind)), id).toBe(true);
    }
  });

  it('on a required-battle step re-rolls it like any other: it can turn into a non-battle encounter (as the rules stand; an open design question)', () => {
    const rerolled = SEEDS.map((seed) => repel(createRun('celadon', deck, seed)).steps[0]!.options);
    expect(rerolled.some((options) => options.some((o) => !isBattleKind(o.kind)))).toBe(true);
    expect(rerolled.some((options) => options.every((o) => o.kind === 'battle'))).toBe(true);
  });
});

describe('trades across generations', () => {
  it("a Johto deck in a Kanto run: none of its cards are in the pool, one is still asked for and a Kanto card offered", () => {
    const johto = GEN2_TEST_POOL.filter((c) => c.def.kind === 'pokemon').slice(0, 15).flatMap((c) => Array<string>(4).fill(c.def.id));
    expect(johto).toHaveLength(60);
    const s = act(at('trade', 'celadon', johto), { type: 'CHOOSE', option: 0 });
    const trade = s.encounter as Extract<RunState['encounter'], { kind: 'trade' }>;
    expect(johto).toContain(trade.give);
    expect(TEST_POOL.some((c) => c.def.id === trade.get)).toBe(true);
    const after = act(s, { type: 'ACCEPT' });
    expect([after.deck.length, after.gained]).toEqual([60, [trade.get]]);
  });

  it('a deck of nothing but basic Energy: the Energy is asked for (there is nothing else), any card offered', () => {
    const energy = Array<string>(60).fill('base1-99');
    const s = act(at('trade', 'celadon', energy), { type: 'CHOOSE', option: 0 });
    const trade = s.encounter as Extract<RunState['encounter'], { kind: 'trade' }>;
    expect(trade.give).toBe('base1-99');
    expect(trade.get).not.toBe('base1-99');
    expect(act(s, { type: 'ACCEPT' }).deck.filter((id) => id === 'base1-99')).toHaveLength(59);
  });
});

describe('leaving and losing battles', () => {
  it('an Escape Rope from a Gym Trainer keeps the step, the Gym Trainer still to be fought', () => {
    const s = createRun('celadon', deck, 1);
    s.position = s.steps.length - 2;
    expect(s.steps[s.position]!.options[0]!.kind).toBe('gymTrainer');
    let out = act(s, { type: 'CHOOSE', option: 0 });
    out = act(out, { type: 'BATTLE_STARTED', gameId: 'g1' });
    out = act(out, { type: 'USE_ITEM', itemId: 'escape-rope' });
    expect([out.position, out.phase, out.hp, out.encounter, out.steps[out.position]!.chosen]).toEqual([s.position, 'map', MAX_HP, null, undefined]);
    expect(needsBattle(act(out, { type: 'CHOOSE', option: 0 }))).toBe(true);
  });

  it('a battle skipped on the last step (the gym leader) still beats the run and grants the badge, with no EXP or reward', () => {
    const s = createRun('celadon', deck, 1);
    s.position = s.steps.length - 1;
    const won = fight(s, true, { skipped: true });
    expect([won.phase, won.exp, won.encounter]).toEqual(['won', 0, null]);
    expect(won.badges).toEqual([boss('erika').gym!.badge]);
  });

  it("a conceded gym leader battle costs 1 HP, isn't a completed battle, and the leader is fought again", () => {
    const s = createRun('celadon', deck, 1);
    s.position = s.steps.length - 1;
    const lost = fight(s, false, { conceded: true });
    expect([lost.phase, lost.position, lost.hp, battlesCompleted(lost)]).toEqual(['map', s.steps.length - 1, MAX_HP - 1, 0]);
    expect(lost.log.at(-1)).toContain('conceded');
    expect(needsBattle(act(lost, { type: 'CHOOSE', option: 0 }))).toBe(true);
  });

  it('a conceded gym leader battle in a Champion run: the same, at any step', () => {
    const s = createRun('kantoChampion', deck, 1);
    s.position = 3;
    const lost = fight(s, false, { conceded: true });
    expect([lost.position, lost.hp, lost.badges]).toEqual([3, MAX_HP - 1, []]);
  });
});

describe('music over runs with several maps', () => {
  const names = (id: RunTypeId) => {
    const type = runType(id);
    return createRun(id, deck, 1).steps.map((_, p) => routeAt(type, p)?.route.name ?? null);
  };

  it("Vermilion City: Route 5's 3 steps, then Route 6's 7, then the gym (no route)", () => {
    expect(names('vermilion')).toEqual([...Array(3).fill('Route 5'), ...Array(7).fill('Route 6'), null, null]);
  });

  it("Saffron City: the Pokémon Tower's floors, 2 steps each, 1F to 5F", () => {
    expect(names('saffron').slice(0, 10)).toEqual(['1F', '1F', '2F', '2F', '3F', '3F', '4F', '4F', '5F', '5F'].map((f) => `Pokémon Tower ${f}`));
  });

  it("Olivine City and Mahogany Town: the upper maps' steps follow the lower's", () => {
    expect(names('olivine').slice(0, 10)).toEqual([...Array(8).fill('Route 42'), 'Route 42 (upper)', 'Route 42 (upper)']);
    expect(names('mahogany').slice(0, 10)).toEqual([...Array(5).fill('Route 44'), ...Array(5).fill('Route 44 (upper)')]);
  });

  it('every step of those runs has a song, and a step on another map with the same song keeps the same cue', () => {
    for (const id of ['vermilion', 'saffron', 'olivine', 'mahogany'] as const) {
      const run = createRun(id, deck, 1);
      const cues = run.steps.map((_, p) => runMusic({ type: id, position: p, phase: 'map', steps: run.steps, encounter: null, log: run.log }, 'original'));
      for (const cue of cues) expect(cue.songs.length, id).toBeGreaterThan(0);
      // The route's song keeps playing across the map change (Route 5 and Route 6 share Route 3's theme), so the cue key is the same.
      if (id === 'vermilion') expect(cues[2]!.key).toBe(cues[3]!.key);
    }
  });
});
