import { describe, expect, it } from 'vitest';
import { TOWER_ROOMS } from './battle-tower-maps.js';
import { TOWER_TRAINERS } from './battle-tower-trainers.js';
import { expandDeck, STARTER_DECK } from './decks.js';
import { routePath } from './routes.js';
import { GEN2_TEST_POOL, GEN3_TEST_POOL, TEST_POOL } from './test-pool.js';
import {
  applyTowerAction,
  createTower,
  floorsBeaten,
  floorTrainers,
  isCheckpoint,
  nextIsNewGeneration,
  startFloors,
  TOP_FLOOR,
  towerBattleSetup,
  towerOpponentDeck,
  TOWER_DECK_NAMES,
  mainType,
  towerGameId,
  towerGeneration,
  towerNeedsBattle,
  towerReward,
  towerSprites,
  towerView,
  type TowerAction,
  type TowerState,
  type TowerSystemAction,
} from './tower.js';

const DECK = expandDeck(STARTER_DECK);

function act(state: TowerState, action: TowerAction | TowerSystemAction): TowerState {
  const r = applyTowerAction(state, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Lets the next opponent in, starts the battle and ends it. */
function fight(state: TowerState, won: boolean, extra: { conceded?: boolean; skipped?: boolean } = {}): TowerState {
  const gameId = `g${state.version}`;
  return act(act(act(state, { type: 'CONTINUE' }), { type: 'BATTLE_STARTED', gameId }), { type: 'BATTLE_OVER', gameId, won, ...extra });
}

describe('Battle Tower floors', () => {
  it('gives each band of 10 floors a generation, staying with the last one with cards', () => {
    expect([1, 10, 11, 20, 21, 30, 31, 99].map(towerGeneration)).toEqual([1, 1, 2, 2, 3, 3, 3, 3]);
    expect([1, 11, 21, 50].map(towerSprites)).toEqual(['frlg', 'hgss', 'rse', 'rse']);
  });

  it('makes every 5th floor a checkpoint, starting later challenges on the floor after one', () => {
    expect([4, 5, 10, 11].map(isCheckpoint)).toEqual([false, true, true, false]);
    expect(startFloors(0)).toEqual([1]);
    expect(startFloors(4)).toEqual([1]);
    expect(startFloors(5)).toEqual([1, 6]);
    expect(startFloors(12)).toEqual([1, 6, 11]);
  });

  it("pays Battle Points, more on later generations' floors", () => {
    expect([1, 10, 11, 21, 60].map((f) => towerReward(f).bp)).toEqual([1, 1, 2, 3, 3]);
  });

  it('meets only trainers with a sprite in the floor\'s set', () => {
    for (const floor of [1, 11, 21]) {
      const set = towerSprites(floor);
      expect(floorTrainers(floor).length).toBeGreaterThan(50);
      expect(floorTrainers(floor).every((t) => t.sprites[set])).toBe(true);
    }
    expect(TOWER_TRAINERS.every((t) => t.before && t.win && t.lose)).toBe(true);
  });
});

describe('a Battle Tower challenge', () => {
  it('lets an opponent in, battles them and moves up a floor on a win, paying the floor\'s reward', () => {
    let s = createTower(DECK, 7, 1, 'Starter');
    expect(s.phase).toBe('between');
    expect(towerNeedsBattle(s)).toBe(false);
    s = act(s, { type: 'CONTINUE' });
    expect(s.phase).toBe('battle');
    expect(towerNeedsBattle(s)).toBe(true);
    expect(s.opponent!.sprite).toBe(floorTrainers(1).find((t) => t.name === s.opponent!.name && t.trainerClass === s.opponent!.trainerClass)!.sprites.frlg);
    s = act(s, { type: 'BATTLE_STARTED', gameId: 'g1' });
    expect(towerGameId(s)).toBe('g1');
    expect(towerNeedsBattle(s)).toBe(false);
    s = act(s, { type: 'BATTLE_OVER', gameId: 'g1', won: true });
    expect(s).toMatchObject({ phase: 'between', floor: 2, wins: 1, opponent: null, ...towerReward(1) });
    expect(s.last).toMatchObject({ floor: 1, won: true, line: expect.any(String), checkpoint: false });
    expect(floorsBeaten(s)).toBe(1);
  });

  it('ends at the first loss, saying the opponent\'s winning line', () => {
    let s = fight(fight(createTower(DECK, 3), true), false);
    expect(s.phase).toBe('lost');
    expect(s.last).toMatchObject({ floor: 2, won: false, bp: 0 });
    expect(applyTowerAction(s, { type: 'CONTINUE' })).toEqual({ ok: false, error: 'This challenge is over' });
    s = fight(createTower(DECK, 3), false, { conceded: true });
    expect(s.phase).toBe('lost');
  });

  it('reaches a checkpoint on every 5th floor, and starts from the floor after one', () => {
    let s = createTower(DECK, 11, 6);
    for (let i = 0; i < 5; i++) s = fight(s, true);
    expect(s.floor).toBe(11);
    expect(s.last!.checkpoint).toBe(true);
    expect(floorsBeaten(s)).toBe(10);
    expect(startFloors(floorsBeaten(s))).toContain(11);
  });

  it('meets a new trainer on every floor of a generation', () => {
    let s = createTower(DECK, 5);
    for (let i = 0; i < 10; i++) s = fight(s, true);
    expect(new Set(s.met).size).toBe(10);
  });

  it('goes up into a new generation\'s rooms after its 10th floor', () => {
    let s = createTower(DECK, 9, 6);
    for (let i = 0; i < 4; i++) s = fight(s, true);
    expect(nextIsNewGeneration(s)).toBe(false);
    s = fight(s, true);
    expect(s.floor).toBe(11);
    expect(nextIsNewGeneration(s)).toBe(true);
    s = act(s, { type: 'CONTINUE' });
    expect(s.opponent!.sprite.startsWith('hgss/')).toBe(true);
  });

  it('saves between battles, refusing to go on until taken up again', () => {
    let s = act(fight(createTower(DECK, 6), true), { type: 'SAVE' });
    expect(s.saved).toBe(true);
    expect(applyTowerAction(s, { type: 'CONTINUE' }).ok).toBe(false);
    s = act(s, { type: 'RESUME' });
    expect(s).toMatchObject({ saved: false, floor: 2, wins: 1 });
    expect(act(s, { type: 'CONTINUE' }).phase).toBe('battle');
    expect(applyTowerAction(act(s, { type: 'CONTINUE' }), { type: 'SAVE' }).ok).toBe(false);
  });

  it('can be given up between battles, saved or not', () => {
    const s = act(fight(createTower(DECK, 6), true), { type: 'QUIT' });
    expect(s).toMatchObject({ phase: 'lost', quit: true, wins: 1 });
    expect(act(act(createTower(DECK, 6), { type: 'SAVE' }), { type: 'QUIT' }).phase).toBe('lost');
    expect(applyTowerAction(act(createTower(DECK, 6), { type: 'CONTINUE' }), { type: 'QUIT' }).ok).toBe(false);
  });

  it('is won by beating floor 100, the last start floor being 96', () => {
    let s = createTower(DECK, 8, TOP_FLOOR);
    s = fight(s, true);
    expect(s).toMatchObject({ phase: 'won', floor: TOP_FLOOR, wins: 1 });
    expect(floorsBeaten(s)).toBe(TOP_FLOOR);
    expect(applyTowerAction(s, { type: 'CONTINUE' }).ok).toBe(false);
    expect(startFloors(TOP_FLOOR).at(-1)).toBe(96);
  });

  it('gives a battle skipped by debug no BP', () => {
    const s = fight(createTower(DECK, 1), true, { skipped: true });
    expect(s).toMatchObject({ floor: 2, wins: 1, bp: 0 });
  });

  it('turns away actions out of turn', () => {
    const s = act(createTower(DECK, 2), { type: 'CONTINUE' });
    expect(applyTowerAction(s, { type: 'CONTINUE' }).ok).toBe(false);
    expect(applyTowerAction(s, { type: 'BATTLE_OVER', gameId: 'nope', won: true }).ok).toBe(false);
    expect(applyTowerAction(createTower(DECK, 2), { type: 'BATTLE_STARTED', gameId: 'g' }).ok).toBe(false);
  });

  it('builds each floor\'s opponent a deck of its generation at Gym leader difficulty, hidden from the view', () => {
    for (const [floor, pool] of [[1, TEST_POOL], [11, GEN2_TEST_POOL], [21, GEN3_TEST_POOL]] as const) {
      const s = act(createTower(DECK, 4, floor), { type: 'CONTINUE' });
      const setup = towerBattleSetup(s, pool);
      expect(setup.deck).toHaveLength(60);
      expect(setup.difficulty).toBe('gymLeader');
      const ids = new Set(pool.map((c) => c.def.id));
      expect(setup.deck.every((id) => ids.has(id))).toBe(true);
      expect(towerView(s).opponent).not.toHaveProperty('deckSeed');
      expect(towerView(s)).not.toHaveProperty('rngState');
    }
  });
});

describe("the tower's deck names", () => {
  it('gives each opponent a themed name for their deck from its main type, the same every time', () => {
    const s = act(createTower(DECK, 4, 11), { type: 'CONTINUE' });
    const a = towerOpponentDeck(s, GEN2_TEST_POOL);
    expect(a).toEqual(towerOpponentDeck(s, GEN2_TEST_POOL));
    expect(a.deck).toEqual(towerBattleSetup(s, GEN2_TEST_POOL).deck);
    expect(TOWER_DECK_NAMES[mainType(a.deck, GEN2_TEST_POOL)]).toContain(a.name);
    expect(a.name).not.toContain(s.opponent!.name);
    for (const names of Object.values(TOWER_DECK_NAMES)) expect(names.length).toBeGreaterThan(3);
  });
});

describe('Battle Tower rooms', () => {
  it('can be walked from the door to each place the player goes', () => {
    for (const rooms of Object.values(TOWER_ROOMS)) {
      const { lobby, elevator, corridor, room } = rooms;
      expect(routePath(lobby, lobby.points.entrance!, lobby.points.desk!), lobby.name).not.toBeNull();
      expect(routePath(lobby, lobby.points.desk!, lobby.points.elevator!), lobby.name).not.toBeNull();
      // To the BP Shop's vendor and back, where the lobby has one (Gen 1's).
      if (lobby.points.shop) expect(routePath(lobby, lobby.points.desk!, lobby.points.shop), lobby.name).not.toBeNull();
      expect(elevator.points.entrance, elevator.name).toBeDefined();
      if (corridor) expect(routePath(corridor, corridor.points.entrance!, corridor.points.door!), corridor.name).not.toBeNull();
      expect(routePath(room, room.points.entrance!, room.points.player!), room.name).not.toBeNull();
      expect(routePath(room, room.points.opponentEntrance!, room.points.opponent!), room.name).not.toBeNull();
      // Gen 1's attendant speaks from his counter; the others walk up to the player.
      if (room.points.attendantSpot) expect(routePath(room, room.points.attendant!, room.points.attendantSpot), room.name).not.toBeNull();
      // Up to a new generation's floors, the attendant (Gen 1's stays at his counter) and then the player walk out of the battle room by its door.
      if (room.points.attendantSpot) expect(routePath(room, room.points.attendant!, room.points.entrance!), room.name).not.toBeNull();
      expect(routePath(room, room.points.player!, room.points.entrance!), room.name).not.toBeNull();
    }
    // HGSS's and Emerald's receptionists lead the player from the desk to the elevator (the web's towerScripts.ts).
    for (const lobby of [TOWER_ROOMS[2].lobby, TOWER_ROOMS[3].lobby]) expect(routePath(lobby, lobby.points.receptionist!, lobby.points.elevator!), lobby.name).not.toBeNull();
  });
});
