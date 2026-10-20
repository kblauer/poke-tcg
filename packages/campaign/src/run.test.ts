import { describe, expect, it } from 'vitest';
import { expandDeck, STARTER_DECK } from './decks.js';
import { ITEMS, itemText, MAX_CONSUMABLES_PER_RUN, shopStock } from './items.js';
import { RUN_TYPE_IDS, RUN_TYPES, runType, type RunType, type RunTypeId } from './run-types.js';
import { ROUTE_4 } from './kanto-routes.js';
import { onPath, PEWTER_GYM, ROUTE_2, routePath } from './routes.js';
import { applyRunAction, bankablePokedollars, battleReward, battleSetup, battlesCompleted, battlesFought, createRun, isBattleKind, isBossKind, MAX_CENTERS, REQUIRED_BATTLES, MAX_HP, needsBattle, runView, STARTING_POKEDOLLARS, type EncounterKind, type RunAction, type RunState, type RunSystemAction } from './run.js';
import { GEN2_SETS } from './pool.js';
import { GEN2_TEST_POOL, TEST_POOL } from './test-pool.js';

const deck = expandDeck(STARTER_DECK);
const fresh = (seed = 1) => createRun('celadon', deck, seed);

function act(state: RunState, action: RunAction | RunSystemAction, gear: string[] = [], pool = TEST_POOL): RunState {
  const res = applyRunAction(state, action, pool, gear);
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
function fight(state: RunState, won: boolean, gear: string[] = [], conceded = false): RunState {
  let s = state.phase === 'map' ? act(state, { type: 'CHOOSE', option: 0 }, gear) : state;
  if (s.encounter?.kind === 'elite') s = act(s, { type: 'ACCEPT' }, gear);
  expect(needsBattle(s)).toBe(true);
  s = act(s, { type: 'BATTLE_STARTED', gameId: 'g1' }, gear);
  return act(s, { type: 'BATTLE_OVER', gameId: 'g1', won, ...(conceded && { conceded }) }, gear);
}

describe('createRun', () => {
  it('a gym run has 10 steps of 1–3 options (one per route spot), then a Gym Trainer and the gym leader, with 3 HP and ₱500', () => {
    const s = fresh();
    expect(s.steps).toHaveLength(12);
    for (const step of s.steps.slice(0, 10)) {
      expect(step.options.length).toBeGreaterThanOrEqual(1);
      expect(step.options.length).toBeLessThanOrEqual(3);
      expect(step.options.every((o) => !['gymTrainer', 'gymLeader', 'eliteFour', 'champion'].includes(o.kind))).toBe(true);
    }
    expect(s.steps[10]!.options).toEqual([expect.objectContaining({ kind: 'gymTrainer', label: 'Celadon Gym Trainer', boss: 'erika' })]);
    expect(s.steps[11]!.options).toEqual([{ kind: 'gymLeader', label: 'Gym Leader Erika', trainer: 'Erika', boss: 'erika' }]);
    expect(s.steps[0]!.options.every((o) => o.kind === 'battle')).toBe(true);
    expect([s.hp, s.maxHp, s.pokedollars]).toEqual([MAX_HP, MAX_HP, STARTING_POKEDOLLARS]);
  });

  it(`every run has at least ${REQUIRED_BATTLES} required battles (the first step one), at most ${MAX_CENTERS} Pokémon Centers, and a non-battle encounter alone about half the time`, () => {
    const counts = [0, 0, 0, 0];
    let battleSteps = 0;
    let pairs = 0;
    for (let seed = 0; seed < 200; seed++) {
      for (const type of ['pewter', 'celadon'] as const) {
        const s = createRun(type, deck, seed);
        const encounters = s.steps.filter((st) => !st.options.some((o) => o.kind === 'gymTrainer' || isBossKind(o.kind)));
        // A required battle offers only trainers: one, or two to choose between.
        const required = encounters.filter((st) => st.options.every((o) => o.kind === 'battle'));
        expect(required.length).toBeGreaterThanOrEqual(REQUIRED_BATTLES);
        expect(encounters[0]!.options.every((o) => o.kind === 'battle')).toBe(true);
        for (const st of encounters.filter((x) => x.options.some((o) => o.kind === 'battle' || o.kind === 'elite'))) {
          battleSteps++;
          if (st.options.filter((o) => o.kind === 'battle' || o.kind === 'elite').length >= 2) pairs++;
        }
        expect(s.steps.flatMap((st) => st.options).filter((o) => o.kind === 'center').length).toBeLessThanOrEqual(MAX_CENTERS);
        // How many options the steps offering a non-battle encounter have.
        for (const st of encounters.filter((x) => x.options.some((o) => !isBattleKind(o.kind)))) counts[st.options.length]!++;
      }
    }
    const total = counts[1]! + counts[2]! + counts[3]!;
    expect(counts[1]! / total).toBeGreaterThan(0.4);
    expect(counts[1]! / total).toBeLessThan(0.6);
    expect(counts[2]!).toBeGreaterThan(counts[3]!);
    // A lone trainer gets a second 75% of the time (PAIR_CHANCE): in these 10-encounter runs about two thirds of the steps
    // offering a trainer battle offer two (the required battles being a bigger share than in a longer run).
    expect(pairs / battleSteps, `${pairs} of ${battleSteps}`).toBeGreaterThan(0.61);
    expect(pairs / battleSteps, `${pairs} of ${battleSteps}`).toBeLessThan(0.71);
  });

  it('every gym has its own run, with its leader last', () => {
    const leaders: Record<string, string> = { pewter: 'Brock', cerulean: 'Misty', vermilion: 'Lt. Surge', celadon: 'Erika', fuchsia: 'Koga', saffron: 'Sabrina', cinnabar: 'Blaine', viridian: 'Giovanni' };
    for (const [type, leader] of Object.entries(leaders)) {
      const s = createRun(type as RunTypeId, deck, 1);
      expect(s.steps.at(-1)!.options[0]).toMatchObject({ kind: 'gymLeader', trainer: leader });
      expect(s.steps.at(-2)!.options[0]!.kind).toBe('gymTrainer');
    }
  });

  it('the Kanto Gym Challenge is the 8 gym leaders back to back, with a Pokémon Center after the fourth and no Gym Trainers', () => {
    const s = createRun('kantoGyms', deck, 1);
    expect(s.steps.map((st) => st.options.map((o) => o.kind).join())).toEqual([...Array(4).fill('gymLeader'), 'center', ...Array(4).fill('gymLeader')]);
    const bosses = s.steps.flatMap((st) => st.options.filter((o) => o.kind === 'gymLeader').map((o) => o.trainer));
    expect(bosses).toEqual(['Brock', 'Misty', 'Lt. Surge', 'Erika', 'Sabrina', 'Koga', 'Blaine', 'Giovanni']);
  });

  it('Kanto Champion is the 8 gym leaders, the Elite Four and the Champion back to back (no encounters or Gym Trainers)', () => {
    const s = createRun('kantoChampion', deck, 1);
    expect(s.steps).toHaveLength(8 + 4 + 1);
    expect(s.steps.every((st) => st.options.length === 1 && isBossKind(st.options[0]!.kind))).toBe(true);
    expect(s.steps.slice(-5).map((st) => st.options[0]!.label)).toEqual(['Elite Four Lorelei', 'Elite Four Bruno', 'Elite Four Agatha', 'Elite Four Lance', 'Champion Blue']);
  });

  it('the Pewter City run is 10 encounters (one per Route 2 spot), then the Gym Trainer and Brock', () => {
    const s = createRun('pewter', deck, 1);
    expect(s.steps).toHaveLength(12);
    expect(s.steps.slice(0, 10).every((st) => st.options.length >= 1 && st.options.every((o) => !isBossKind(o.kind) && o.kind !== 'gymTrainer'))).toBe(true);
    expect(s.steps.slice(10).map((st) => st.options[0]!.kind)).toEqual(['gymTrainer', 'gymLeader']);
    expect(runType('pewter').routes?.[0]?.spots).toHaveLength(10);
  });

  it('every Route 2 spot can be walked to from the one before, the gatehouse (spots 4 to 5) the only fade', () => {
    const spots = ROUTE_2.spots;
    const walks = spots.slice(1).map((to, i) => routePath(ROUTE_2, spots[i]!, to));
    expect(walks.every((w) => w !== null)).toBe(true);
    expect(walks.map((w) => w!.filter((s) => s.fade).length)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0]);
    expect(Math.max(...walks.map((w) => w!.length))).toBeLessThanOrEqual(30);
  });

  it('every Route 4 spot can be walked to from the one before, the tunnel (spots 3 to 4) the only fade', () => {
    const walks = ROUTE_4.spots.slice(1).map((to, i) => routePath(ROUTE_4, ROUTE_4.spots[i]!, to));
    expect(walks.every((w) => w !== null)).toBe(true);
    expect(walks.map((w) => w!.filter((s) => s.fade).length)).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0]);
    expect(Math.max(...walks.map((w) => w!.length))).toBeLessThanOrEqual(40);
  });

  it("the Vermilion City run crosses Route 5 (3 encounters, to Saffron's gatehouse) then Route 6 (7, from Saffron's gate), each walkable", () => {
    const [r5, r6] = runType('vermilion').routes!;
    expect([r5!.spots.length, r6!.spots.length]).toEqual([3, 7]);
    expect(createRun('vermilion', deck, 1).steps).toHaveLength(12);
    expect(r6!.spots[0]).toEqual({ x: 13, y: 8 });
    const walks = [
      ...r5!.spots.slice(1).map((to, i) => routePath(r5!, r5!.spots[i]!, to)),
      routePath(r5!, r5!.spots[2]!, r5!.exit!),
      routePath(r6!, r6!.entrance!, r6!.spots[0]!),
      ...r6!.spots.slice(1).map((to, i) => routePath(r6!, r6!.spots[i]!, to)),
    ];
    expect(walks.map((w) => w !== null)).toEqual(walks.map(() => true));
  });

  it('every route and gym has an entrance, and on a route the player can walk from it to the first spot', () => {
    for (const type of RUN_TYPE_IDS.map(runType)) {
      for (const map of type.routes ?? []) expect(map.entrance && routePath(map, map.entrance, map.spots[0]!), `${type.id} ${map.name}`).toBeTruthy();
      // Gyms' puzzles (Saffron's teleport pads) can split them until their links are given: there the player fades instead.
      if (type.gym) expect(type.gym.entrance, `${type.id} ${type.gym.name}`).toBeDefined();
    }
  });

  it('the Saffron City run climbs the Pokémon Tower, 1F to 5F (2 encounters a floor), each floor walked from its entrance to its exit', () => {
    const floors = runType('saffron').routes!;
    expect(floors.map((f) => f.name)).toEqual([1, 2, 3, 4, 5].map((n) => `Pokémon Tower ${n}F`));
    for (const f of floors) {
      const stops = [f.entrance!, ...f.spots, f.exit!];
      expect(f.spots, f.name).toHaveLength(2);
      expect(stops.slice(1).map((to, i) => routePath(f, stops[i]!, to) !== null), f.name).toEqual(stops.slice(1).map(() => true));
    }
  });

  /** The trainers of the battles on a run's route steps (the first `encounters` steps), over many runs. */
  const routeTrainers = (type: RunTypeId, encounters: number, runs = 60) =>
    Array.from({ length: runs }, (_, seed) => createRun(type, deck, seed + 1).steps.slice(0, encounters))
      .flat()
      .flatMap((s) => s.options.filter((o) => o.kind === 'battle').map((o) => o.trainer!));

  it("most of Route 17's trainers (the Fuchsia City run) are Bikers, and most of the Power Plant's (Viridian City) Team Rocket Grunts", () => {
    for (const [type, cls] of [['fuchsia', 'Biker'], ['viridian', 'Rocket Grunt']] as const) {
      const trainers = routeTrainers(type, 10);
      const share = trainers.filter((t) => t.startsWith(`${cls} `)).length / trainers.length;
      expect(share, type).toBeGreaterThan(0.7);
      expect(share, type).toBeLessThan(0.9);
    }
  });

  it("Route 20's trainers (the Cinnabar Island run) are Swimmers, but for its battle on land by the Seafoam Islands, always a battle against another trainer", () => {
    const route = runType('cinnabar').routes![0]!;
    const land = route.landBattle!;
    expect(route.walkable[route.spots[land]!.y]![route.spots[land]!.x]).toBe('.');
    for (let seed = 1; seed <= 30; seed++) {
      const steps = createRun('cinnabar', deck, seed).steps;
      steps.slice(0, 10).forEach((s, i) => {
        const battles = s.options.filter((o) => o.kind === 'battle');
        if (i === land) {
          expect(battles.length).toBeGreaterThan(0);
          expect(battles.every((o) => !o.trainer!.startsWith('Swimmer '))).toBe(true);
        } else expect(battles.every((o) => o.trainer!.startsWith('Swimmer '))).toBe(true);
      });
    }
  });

  it("Route 20's spots with no land near (surfed, out at sea) offer only battles, those ashore only non-battle encounters", () => {
    const route = runType('cinnabar').routes![0]!;
    const dry = route.spots.map((s) => [-3, -2, -1, 0, 1, 2, 3].some((dy) => [-3, -2, -1, 0, 1, 2, 3].some((dx) => Math.abs(dx) + Math.abs(dy) <= 3 && route.walkable[s.y + dy]?.[s.x + dx] === '.')));
    expect(dry.some((d) => !d)).toBe(true);
    for (let seed = 1; seed <= 30; seed++) {
      createRun('cinnabar', deck, seed).steps.slice(0, 10).forEach((s, i) => {
        if (!dry[i]) expect(s.options.every((o) => o.kind === 'battle')).toBe(true);
        // Ashore (land near, not the land battle's spot): only non-battle encounters.
        else if (i !== route.landBattle) expect(s.options.every((o) => !isBattleKind(o.kind))).toBe(true);
      });
    }
  });

  it('the Kanto Gym Challenge and Champion runs have a map per step: each boss in their gym or room, and the Pokémon Center', () => {
    for (const id of ['kantoGyms', 'kantoChampion'] as const) {
      const type = runType(id);
      const steps = createRun(id, deck, 1).steps;
      expect(type.routes, id).toHaveLength(steps.length);
      steps.forEach((s, i) => {
        const map = type.routes![i]!;
        expect(map.spots, `${id} ${map.name}`).toHaveLength(1);
        expect(map.name, id).toBe(s.options[0]!.kind === 'center' ? 'Pokémon Center' : map.name);
        // The player walks up from the entrance: 4 steps, 5 tiles from the boss.
        expect(routePath(map, map.entrance!, map.spots[0]!)?.length, `${id} ${map.name}`).toBeLessThanOrEqual(6);
      });
    }
    expect(runType('kantoGyms').routes!.map((m) => m.name)).toEqual(['Pewter Gym', 'Cerulean Gym', 'Vermilion Gym', 'Celadon Gym', 'Pokémon Center', 'Saffron Gym', 'Fuchsia Gym', 'Cinnabar Gym', 'Viridian Gym']);
  });

  it("Pewter Gym: the Gym Trainer's and Brock's spots can be walked to from the door, one after the other", () => {
    const { entrance, spots } = PEWTER_GYM;
    expect(routePath(PEWTER_GYM, entrance!, spots[0]!)).not.toBeNull();
    expect(routePath(PEWTER_GYM, spots[0]!, spots[1]!)).not.toBeNull();
    expect(runType('pewter').gym?.spots).toHaveLength(runType('pewter').segments.reduce((n, s) => n + s.bosses.length * 2, 0));
  });

  it("every route spot is on a walkable tile of its route's map", () => {
    for (const type of Object.values(RUN_TYPES) as RunType[]) {
      for (const map of [...(type.routes ?? []), type.gym]) for (const spot of [...(map?.spots ?? []), ...(map?.entrance ? [map.entrance] : []), ...(map?.exit ? [map.exit] : [])]) expect(onPath(map!, spot), `${type.id} ${map!.name} ${spot.x},${spot.y}`).toBe(true);
    }
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

  it('some trainers pay twice the ₱, some twice the EXP, some offer rarer cards', () => {
    const leaning = (focus: 'pokedollars' | 'exp' | 'cards') => {
      const s = at('battle');
      s.steps[s.position]!.options[0]!.focus = focus;
      return fight(s, true);
    };
    const money = leaning('pokedollars');
    expect(money.pokedollars - STARTING_POKEDOLLARS).toBeGreaterThanOrEqual(200);
    expect(leaning('exp').exp).toBe(20);
    const cards = leaning('cards');
    expect(battleReward('battle', 'cards').rarity).toBe('uncommon');
    const rarities = (cards.encounter as { offers: string[] }).offers.map((id) => TEST_POOL.find((c) => c.def.id === id)!.rarity);
    expect(rarities.every((r) => r !== 'common')).toBe(true);
  });

  it('trainer battles on the map lean different ways', () => {
    const foci = new Set<string | undefined>();
    for (let seed = 1; seed <= 30; seed++) for (const step of fresh(seed).steps) for (const o of step.options) if (o.kind === 'battle') foci.add(o.focus);
    expect(foci).toEqual(new Set([undefined, 'pokedollars', 'exp', 'cards']));
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
    s.position = 11;
    const chosen = act(s, { type: 'CHOOSE', option: 0 });
    const setup = battleSetup(chosen, TEST_POOL);
    expect(setup.difficulty).toBe('gymLeader');
    expect(setup.deck).toHaveLength(60);
    expect(setup.deck.filter((id) => id === 'base1-99')).toHaveLength(18);
    const lost = fight(chosen, false);
    expect([lost.phase, lost.position, lost.hp]).toEqual(['map', 11, 2]);
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
    expect(battleSetup(s, TEST_POOL).rules).toEqual([{ kind: 'typeDamage', type: 'fire', multiplier: 2, label: 'Fire Pokémon do double damage' }]);
    s = act(fight(s, true), { type: 'LEAVE' });
    expect(s.rules[0]!.battlesLeft).toBe(1);
    s.steps[s.position] = at('battle').steps[0]!;
    expect(fight(s, false).rules).toEqual([]);
  });
});

describe('bosses and Gym Trainers', () => {
  it("a Gym Trainer must be fought: a random deck of their gym's type at Trainer difficulty; losing costs 1 HP and moves on", () => {
    const s = fresh();
    s.position = 10;
    expect(applyRunAction(s, { type: 'CHOOSE', option: 1 }, TEST_POOL).ok).toBe(false);
    const chosen = act(s, { type: 'CHOOSE', option: 0 });
    const setup = battleSetup(chosen, TEST_POOL);
    expect(setup.difficulty).toBe('trainer');
    const energy = setup.deck.filter((id) => ['base1-99', 'base1-98', 'base1-102', 'base1-100', 'base1-101', 'base1-97'].includes(id));
    expect(energy.every((id) => id === 'base1-99')).toBe(true);
    const lost = fight(chosen, false);
    expect([lost.position, lost.hp]).toEqual([11, 2]);
  });

  it('a gym leader beaten mid-run gives a better reward and their badge, and the run goes on', () => {
    const s = createRun('kantoGyms', deck, 1);
    const won = fight(s, true);
    expect(won.encounter).toMatchObject({ kind: 'reward', trainer: 'Brock' });
    expect(won.badges).toEqual(['boulder-badge']);
    expect(won.exp).toBe(100);
    expect(act(won, { type: 'LEAVE' })).toMatchObject({ phase: 'map', position: 1 });
  });

  it('the Elite Four and the Champion play their own decks at Gym leader difficulty; the Champion ends the run with the ribbon', () => {
    const s = createRun('kantoChampion', deck, 1);
    s.position = s.steps.length - 5;
    const lorelei = act(s, { type: 'CHOOSE', option: 0 });
    expect(battleSetup(lorelei, TEST_POOL)).toMatchObject({ difficulty: 'gymLeader', opponent: 'Lorelei' });
    expect(battleSetup(lorelei, TEST_POOL).deck.filter((id) => id === 'base3-2')).toHaveLength(4);
    s.position = s.steps.length - 1;
    const blue = act(s, { type: 'CHOOSE', option: 0 });
    expect(battleSetup(blue, TEST_POOL).deck).toContain('base3-4');
    const won = fight(blue, true);
    expect(won.phase).toBe('won');
    expect(won.badges).toEqual(['champion-ribbon']);
  });

  it('a run saved before there were several bosses still finds its gym leader', () => {
    const s = fresh();
    s.position = 11;
    delete s.steps[11]!.options[0]!.boss;
    const chosen = act(s, { type: 'CHOOSE', option: 0 });
    expect(battleSetup(chosen, TEST_POOL).deck.filter((id) => id === 'base1-99')).toHaveLength(18);
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

describe('switching decks', () => {
  const other = Array<string>(60).fill('base1-98');

  it('on the map, replaces the run deck and names it', () => {
    const s = act(at('battle'), { type: 'SET_DECK', deck: other, name: 'Fire' });
    expect([s.deck, s.deckName, s.phase, s.log.at(-1)]).toEqual([other, 'Fire', 'map', 'Switched decks: now battling with Fire.']);
    // The battle chosen next is played with it (the server starts it with `deck`).
    expect(act(s, { type: 'CHOOSE', option: 0 }).deck).toEqual(other);
  });

  it('not during an encounter', () => {
    const s = act(at('battle'), { type: 'CHOOSE', option: 0 });
    expect(applyRunAction(s, { type: 'SET_DECK', deck: other, name: 'Fire' }, TEST_POOL)).toEqual({ ok: false, error: 'Decks can only be switched on the map' });
  });

  it('a new run keeps the name of the deck it started with', () => {
    expect(createRun('celadon', deck, 1, 'Starter deck').deckName).toBe('Starter deck');
  });
});

describe('the post-run shop', () => {
  it('stocks 3–4 consumables, 1–2 misc items and 1 piece of gear, the same for the same seed', () => {
    const sizes = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const stock = shopStock(seed);
      const count = (category: string) => stock.filter((i) => i.category === category).length;
      expect([3, 4]).toContain(count('consumable'));
      expect([1, 2]).toContain(count('misc'));
      expect(count('equipment')).toBe(1);
      expect(stock).toHaveLength(count('consumable') + count('misc') + 1);
      expect(new Set(stock.map((i) => i.id)).size).toBe(stock.length);
      expect(stock.map((i) => i.price)).toEqual([...stock.map((i) => i.price)].sort((a, b) => a! - b!));
      expect(shopStock(seed)).toEqual(stock);
      sizes.add(`${count('consumable')}/${count('misc')}`);
    }
    // Every mix comes up.
    expect(sizes).toEqual(new Set(['3/1', '3/2', '4/1', '4/2']));
  });
});

describe('items', () => {
  const use = (s: RunState, itemId: string) => applyRunAction(s, { type: 'USE_ITEM', itemId }, TEST_POOL);

  it(`only ${MAX_CONSUMABLES_PER_RUN} consumables per run; misc items keep to their per-run limit`, () => {
    let s = fresh();
    for (let i = 0; i < MAX_CONSUMABLES_PER_RUN; i++) s = act(s, { type: 'USE_ITEM', itemId: 'x-attack' });
    expect(use(s, 'x-attack').ok).toBe(false);
    for (let i = 0; i < 5; i++) s = act(s, { type: 'USE_ITEM', itemId: 'nugget' });
    expect(s.pokedollars).toBe(STARTING_POKEDOLLARS + 5 * 300);
    expect(use(s, 'potion').ok).toBe(false); // full HP
    s.hp = 1;
    s = act(s, { type: 'USE_ITEM', itemId: 'potion' });
    expect(s.hp).toBe(2);
    expect(use(s, 'potion').ok).toBe(false); // once per run
    expect(use(s, 'rainbow-badge').ok).toBe(false);
    expect(use(s, 'trainer-cap').ok).toBe(false);
  });

  it('every consumable and piece of equipment has effects, and every misc item a use', () => {
    for (const def of Object.values(ITEMS)) {
      if (def.category === 'consumable' || def.category === 'equipment') expect(def.effects?.length, def.id).toBeGreaterThan(0);
      if (def.category === 'misc') expect(def.use, def.id).toBeDefined();
      expect(itemText(def)).not.toMatch(/undefined/);
    }
  });

  it('consumables are used before a battle, and last their number of battles', () => {
    let s = act(at('battle'), { type: 'CHOOSE', option: 0 });
    s = act(s, { type: 'BATTLE_STARTED', gameId: 'g1' });
    expect(use(s, 'x-attack').ok).toBe(false);
    s = act(at('battle'), { type: 'USE_ITEM', itemId: 'guard-spec' });
    s = fight(s, true);
    expect(s.consumables).toEqual([{ itemId: 'guard-spec', battlesLeft: 1 }]);
  });

  it("equipment and consumables' battle effects are the player's battle rules, named for the item", () => {
    let s = act(at('battle'), { type: 'USE_ITEM', itemId: 'x-attack' });
    s = act(s, { type: 'CHOOSE', option: 0 });
    expect(battleSetup(s, TEST_POOL, { gear: ['charcoal', 'padded-vest', 'amulet-coin', 'great-ball'], player: 'me' }).rules).toEqual([
      { kind: 'damageBonus', player: 'me', amount: 10, type: 'fire', label: 'Charcoal' },
      { kind: 'damageGuard', player: 'me', amount: 10, label: 'Padded Vest' },
      { kind: 'openingHand', player: 'me', cards: 1, label: 'Great Ball' },
      { kind: 'damageBonus', player: 'me', amount: 10, label: 'X Attack' },
    ]);
    expect(battleSetup(s, TEST_POOL).rules).toEqual([]);
  });

  it('₱ and EXP bonuses add to battles won', () => {
    const plain = fight(at('battle'), true);
    const prize = plain.pokedollars - STARTING_POKEDOLLARS;
    const geared = fight(act(at('battle'), { type: 'USE_ITEM', itemId: 'lucky-egg' }), true, ['trainer-cap', 'amulet-coin', 'exp-share']);
    expect(geared.pokedollars - STARTING_POKEDOLLARS).toBe(Math.round((prize * 1.25) / 10) * 10 + 20);
    expect(geared.exp).toBe(Math.round(plain.exp * 2.25));
  });

  it('more cards to pick from, and lower prices', () => {
    expect(act(at('gift'), { type: 'CHOOSE', option: 0 }, ['cycling-shorts']).encounter).toMatchObject({ offers: { length: 4 } });
    expect(fight(at('battle'), true, ['safari-hat', 'ultra-ball']).encounter).toMatchObject({ kind: 'reward', offers: { length: 5 } });
    const shop = (gear: string[]) => (act(at('shop'), { type: 'CHOOSE', option: 0 }, gear).encounter as { stock: { price: number }[] }).stock;
    const prices = shop([]).map((c) => c.price);
    expect(shop(['running-shoes']).map((c) => c.price)).toEqual(prices.map((p) => Math.round((p * 0.8) / 10) * 10));
    expect(act(at('center'), { type: 'CHOOSE', option: 0 }, ['hiking-pants']).encounter).toEqual({ kind: 'center', price: 80 });
  });

  it('an Escape Rope leaves a battle without losing HP; a boss or Gym Trainer is still there to fight', () => {
    let s = act(at('battle'), { type: 'CHOOSE', option: 0 });
    s = act(s, { type: 'BATTLE_STARTED', gameId: 'g1' });
    s = act(s, { type: 'USE_ITEM', itemId: 'escape-rope' });
    expect([s.hp, s.position, s.phase, s.encounter]).toEqual([MAX_HP, 1, 'map', null]);
    expect(use(s, 'escape-rope').ok).toBe(false);
    const gym = fresh();
    gym.position = gym.steps.length - 1;
    s = act(act(gym, { type: 'CHOOSE', option: 0 }), { type: 'USE_ITEM', itemId: 'escape-rope' });
    expect([s.position, s.phase, s.steps[s.position]!.chosen]).toEqual([gym.steps.length - 1, 'map', undefined]);
  });

  it("the Itemfinder reveals a step's Mysteries, and Repel re-rolls a step but not at a gym", () => {
    let s = act(at('event'), { type: 'USE_ITEM', itemId: 'itemfinder' });
    const revealed = s.steps[s.position]!.options[0]!;
    expect(revealed.event).toBeDefined();
    expect(revealed.label).not.toBe('event');
    expect(use(s, 'itemfinder').ok).toBe(false); // nothing left to reveal
    expect(act(s, { type: 'CHOOSE', option: 0 }).encounter).toEqual({ kind: 'event', event: revealed.event });

    s = act(at('event'), { type: 'USE_ITEM', itemId: 'repel' });
    // New options (1–3), not the lone Mystery that was there.
    expect(s.steps[s.position]!.options.length).toBeGreaterThanOrEqual(1);
    expect(s.steps[s.position]!.options).not.toEqual([{ kind: 'event', label: 'event' }]);
    const gym = fresh();
    gym.position = gym.steps.length - 1;
    expect(use(gym, 'repel').ok).toBe(false);
    expect(use(act(at('shop'), { type: 'CHOOSE', option: 0 }), 'repel').ok).toBe(false); // not on the map
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
      let s = createRun(RUN_TYPE_IDS[seed % RUN_TYPE_IDS.length]!, deck, seed);
      let games = 0;
      for (let guard = 0; s.phase !== 'won' && guard < 2000; guard++) {
        if (s.phase === 'lost') s = act(s, { type: 'RESTORE_HP' });
        else if (s.phase === 'map') s = act(s, { type: 'CHOOSE', option: (seed + s.position) % s.steps[s.position]!.options.length });
        else if (needsBattle(s)) s = act(s, { type: 'BATTLE_STARTED', gameId: `g${++games}` });
        else if (s.encounter && 'gameId' in s.encounter && s.encounter.gameId) s = act(s, { type: 'BATTLE_OVER', gameId: s.encounter.gameId, won: games % 3 !== 0 });
        else if (s.encounter?.kind === 'elite') s = act(s, { type: 'ACCEPT' });
        else if (s.encounter?.kind === 'reward' || s.encounter?.kind === 'gift') s = act(s, { type: 'PICK', index: 0 });
        else s = act(s, { type: 'LEAVE' });
      }
      expect(s.phase).toBe('won');
      expect(s.position).toBe(s.steps.length - 1);
    }
  });
});

describe('conceding', () => {
  it('ends the run while choosing the next step; with no battle finished, none of its ₱ are banked', () => {
    const s = act(fresh(), { type: 'CONCEDE' });
    expect([s.phase, s.conceded, battlesFought(s), bankablePokedollars(s)]).toEqual(['lost', true, 0, 0]);
    expect(s.log.at(-1)).toBe('Conceded the run before completing a battle: no ₱ banked.');
  });

  it('banks the ₱ once a battle is finished, won or lost', () => {
    for (const won of [true, false]) {
      let s = fight(at('battle'), won);
      if (s.encounter?.kind === 'reward') s = act(s, { type: 'LEAVE' });
      s = act(s, { type: 'CONCEDE' });
      expect([battlesFought(s), battlesCompleted(s), bankablePokedollars(s)]).toEqual([1, 1, s.pokedollars]);
      expect(s.pokedollars).toBeGreaterThan(0);
    }
  });

  it('a conceded battle doesn’t count: conceding it and then the run banks nothing', () => {
    const s = act(fight(at('battle'), false, [], true), { type: 'CONCEDE' });
    expect([battlesFought(s), battlesCompleted(s), bankablePokedollars(s)]).toEqual([1, 0, 0]);
    expect(s.log).toContain('Lost to Lass Haley (conceded): −1 HP.');
  });

  it('a run lost by conceding every battle banks nothing either', () => {
    let s = fresh();
    for (let i = 0; i < MAX_HP; i++) {
      s.steps[s.position] = { options: [{ kind: 'battle', label: 'battle', trainer: 'Lass Haley' }] };
      s = fight(s, false, [], true);
    }
    expect([s.phase, s.conceded, bankablePokedollars(s)]).toEqual(['lost', undefined, 0]);
    expect(s.log.at(-1)).toBe('Out of HP: the run is lost, without completing a battle: no ₱ banked.');
  });

  it('older runs count every battle they finished as completed', () => {
    expect(battlesCompleted({ battlesFought: 2, log: [] })).toBe(2);
    expect(battlesCompleted({ battlesFought: 2, battlesCompleted: 1, log: [] })).toBe(1);
  });

  it('only while choosing the next step, and a conceded run can’t be retried', () => {
    const encounter = act(at('shop'), { type: 'CHOOSE', option: 0 });
    expect(applyRunAction(encounter, { type: 'CONCEDE' }, TEST_POOL, [])).toEqual({ ok: false, error: 'Finish this encounter first' });
    const conceded = act(fresh(), { type: 'CONCEDE' });
    expect(applyRunAction(conceded, { type: 'RESTORE_HP' }, TEST_POOL, [])).toEqual({ ok: false, error: 'A conceded run is over' });
  });

  it('counts the battles of older runs from their log', () => {
    expect(battlesFought({ log: ['Beat Lass Haley: +₱200, +10 EXP.', 'Bought Potion.', 'Lost to Hiker Marcos: −1 HP.'] })).toBe(2);
  });
});

describe('Gen 2 runs', () => {
  it("a Johto gym run ends with its gym leader, and its Gym Trainer and leader play Gen 2 decks", () => {
    let s = createRun('violet', deck, 7);
    expect(s.steps).toHaveLength(26);
    expect(s.steps.at(-1)!.options[0]).toMatchObject({ kind: 'gymLeader', boss: 'falkner' });
    for (const kind of ['gymTrainer', 'gymLeader'] as const) {
      s = createRun('violet', deck, 7);
      s.position = s.steps.findIndex((step) => step.options[0]!.kind === kind);
      s = act(s, { type: 'CHOOSE', option: 0 }, [], GEN2_TEST_POOL);
      const setup = battleSetup(s, GEN2_TEST_POOL);
      expect(setup.deck).toHaveLength(60);
      expect(setup.deck.filter((id) => !GEN2_SETS.includes(id.split('-')[0]!))).toEqual([]);
    }
  });
});
