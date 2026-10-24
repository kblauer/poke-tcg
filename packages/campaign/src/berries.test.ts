import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BERRIES } from './berries.js';
import { blenderFrame, blenderRanking, makePokeblock, newBlenderGame, opponentBerries, pokeblockLevel, proximity, speedToRpm, type Random16 } from './berry-blender.js';
import { BERRY_FARM_MAP } from './berry-farm-map.js';
import { berriesOf, FARM_TREES, farmOf, farmView, GROW_MS, harvest, RIPE, stageAt } from './berry-farm.js';
import { rngFrom } from './random.js';

const NOW = Date.UTC(2026, 9, 24, 12);

describe('berries', () => {
  it('are the 42 of Ruby, Sapphire and Emerald but the Enigma Berry, each with its icon and tree in the web app', () => {
    expect(BERRIES).toHaveLength(42);
    expect([BERRIES[0]!.id, BERRIES.at(-1)!.id]).toEqual(['cheri', 'starf']);
    const pub = new URL('../../../apps/web/public/extras/', import.meta.url);
    const missing = BERRIES.flatMap((b) => [`berries/${b.id}.png`, `trees/${b.id}.png`]).filter((f) => !existsSync(new URL(f, pub)));
    expect(missing).toEqual([]);
  });
});

describe('the Berry Farm', () => {
  it('has a plot for every berry, each picked from a walkable tile below it', () => {
    expect(BERRY_FARM_MAP.plots.length).toBeGreaterThanOrEqual(BERRIES.length);
    expect(new Set(FARM_TREES.map((t) => `${t.plot.x},${t.plot.y}`)).size).toBe(BERRIES.length);
    for (const { plot } of FARM_TREES) expect(BERRY_FARM_MAP.walkable[plot.y + 1]![plot.x]).toBe('.');
  });

  it('grows a tree through its 5 stages in GROW_MS, ripe until picked', () => {
    expect(stageAt(NOW, NOW)).toBe(0);
    expect(stageAt(NOW, NOW + GROW_MS / 4)).toBe(1);
    expect(stageAt(NOW, NOW + GROW_MS - 1)).toBe(3);
    expect(stageAt(NOW, NOW + GROW_MS)).toBe(RIPE);
    expect(stageAt(NOW, NOW + 100 * GROW_MS)).toBe(RIPE);
  });

  it('starts a new farm with a fifth of its trees ripe, the others ripening over the hours after', () => {
    const view = farmView(farmOf(null, NOW), NOW);
    expect(view).toHaveLength(BERRIES.length);
    expect(view.filter((t) => t.stage === RIPE)).toHaveLength(Math.ceil(BERRIES.length / 5) - 1);
    expect(view.every((t) => t.ripeAt <= NOW + GROW_MS)).toBe(true);
  });

  it('keeps a saved farm, adding a tree for a berry it lacks', () => {
    const farm = farmOf({ planted: { cheri: NOW - 5 } }, NOW);
    expect(farm.planted.cheri).toBe(NOW - 5);
    expect(Object.keys(farm.planted)).toHaveLength(BERRIES.length);
  });

  it('picks only a ripe tree, for between its least and most berries, planting it again', () => {
    const farm = { planted: { cheri: NOW - GROW_MS, oran: NOW } };
    const rng = rngFrom(7);
    for (let i = 0; i < 20; i++) {
      const { farm: after, count } = harvest(farm, 'cheri', NOW, rng);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
      expect(after.planted.cheri).toBe(NOW);
    }
    expect(() => harvest(farm, 'oran', NOW, rng)).toThrow(/isn't ripe/);
    expect(() => harvest(farm, 'enigma', NOW, rng)).toThrow(/No enigma tree/);
  });

  it('reads an account\'s berries, dropping anything that isn\'t a berry or a positive count', () => {
    expect(berriesOf({ cheri: 3, oran: 0, nope: 2, pecha: 'x' })).toEqual({ cheri: 3 });
    expect(berriesOf(null)).toEqual({});
  });
});

/** A seeded Random() (0-65535). */
const random16 = (seed: number): Random16 => {
  const rng = rngFrom(seed);
  return () => Math.floor(rngNext(rng) * 65536);
};
const rngNext = (rng: ReturnType<typeof rngFrom>) => {
  rng.state = (rng.state * 1103515245 + 12345) >>> 0;
  return rng.state / 2 ** 32;
};

describe('the Berry Blender', () => {
  it("scores a press by the arrow's place: Best right on the player's arrow (top left), Good either side, else a Miss", () => {
    expect(proximity(0x2000, 0)).toBe('best');
    expect(proximity(0x1000, 0)).toBe('good');
    expect(proximity(0x8000, 0)).toBe('miss');
    expect(proximity(0xe000, 1)).toBe('best');
  });

  it('speeds up for a Best, and a Miss slows it, never below the least speed', () => {
    const game = newBlenderGame();
    game.arrowPos = 0x2000 - game.speed;
    expect(blenderFrame(game, true, random16(1))).toContainEqual({ player: 0, score: 'best' });
    expect(game.speed).toBe(128 + 96);
    expect(game.scores[0]).toEqual([1, 0, 0]);
    const slow = newBlenderGame();
    slow.arrowPos = 0x8000;
    blenderFrame(slow, true, random16(1));
    expect(slow.speed).toBe(128);
    expect(slow.scores[0]![2]).toBe(1);
  });

  it('plays a whole game to the full progress bar, the people scoring too', () => {
    const game = newBlenderGame();
    const random = random16(3);
    let frames = 0;
    while (!game.over && frames < 60 * 60 * 10) {
      blenderFrame(game, proximity((game.arrowPos + game.speed) & 0xffff, 0) === 'best', random);
      frames++;
    }
    expect(game.over).toBe(true);
    expect(game.maxRpm).toBeGreaterThan(speedToRpm(128));
    expect(game.scores.slice(1).every(([best, good]) => best + good > 0)).toBe(true);
    expect(blenderRanking(game.scores)[0]).toBe(0);
  });

  it('ranks by Bests, then Goods, then the fewest Misses', () => {
    expect(blenderRanking([[1, 0, 0], [1, 2, 0], [0, 9, 0], [1, 2, 3]])).toEqual([1, 3, 0, 2]);
  });

  it("gives the people 3 of the game's 5 berries, never the player's own", () => {
    expect(opponentBerries('cheri')).toEqual(['aspear', 'rawst', 'pecha']);
    expect(opponentBerries('leppa')).toEqual(['cheri', 'pecha', 'rawst']);
    for (const b of BERRIES) expect(opponentBerries(b.id)).not.toContain(b.id);
  });

  it('makes the Pokéblock the game does', () => {
    // Cheri with Aspear, Rawst and Pecha: spicy 10 - dry 0, dry 0 - sweet 10 < 0 (one cancelled), the rest 0: Red, 9 × 1.15 at 50.00 RPM.
    const red = makePokeblock(['cheri', ...opponentBerries('cheri')], 5000, rngFrom(1));
    expect(red).toEqual({ color: 'red', flavors: [10, 0, 0, 0, 0], feel: 21 });
    expect(pokeblockLevel(red)).toBe(10);
    // The same berry twice is Black, with 3 flavours of 2.
    const black = makePokeblock(['cheri', 'cheri', 'pecha', 'rawst'], 5000, rngFrom(1));
    expect(black.color).toBe('black');
    expect(black.flavors.filter((f) => f === 2)).toHaveLength(3);
  });
});
