import { describe, expect, it } from 'vitest';
import { BERRIES } from './berries.js';
import { POFFIN_BERRY_DATA } from './berry-data-gen4.js';
import { batterScale, cookFrame, cookTime, makePoffin, MAX_SPEED, newCookGame, PHASE_FRAMES, poffinLevel, poffinName, POT_CENTER, strokeLength, wrongWay, type CookGame, type Random32 } from './poffin-cooking.js';

/** A seeded MTRNG_Next stand-in (0 to 2³² − 1). */
const random32 = (seed: number): Random32 => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0);
};

/** The stylus on a circle round the pot, `r` px out, at `angle` (radians, clockwise on screen from the right). */
const at = (angle: number, r = 50) => ({ x: Math.round(POT_CENTER.x + r * Math.cos(angle)), y: Math.round(POT_CENTER.y + r * Math.sin(angle)) });

/** Stirs round and round (clockwise, + `step` radians a frame; anticlockwise with a negative step) for `frames` frames. */
function stirFor(game: CookGame, frames: number, step: number, random: Random32, from = 0) {
  let a = from;
  for (let i = 0; i < frames && !game.over; i++) {
    a += step;
    cookFrame(game, at(a), random);
  }
  return a;
}

describe('Poffin cooking', () => {
  it('has Platinum\'s values for every berry the farm grows', () => {
    expect(BERRIES.every((b) => POFFIN_BERRY_DATA[b.id])).toBe(true);
    expect(POFFIN_BERRY_DATA.oran).toEqual({ flavors: [10, 10, 0, 10, 10], smoothness: 20 });
  });

  it('measures a stroke round the pot as the game does: + clockwise on the screen, − anticlockwise, 0 at rest', () => {
    expect(strokeLength(0, -50, 10, -50)).toBe(10);
    expect(strokeLength(0, -50, -10, -50)).toBe(-10);
    expect(strokeLength(0, -50, 0, -50)).toBe(0);
  });

  it('speeds the batter up as it\'s stirred, up to its top speed, and slows it when let go', () => {
    const random = random32(1);
    const game = newCookGame(random);
    stirFor(game, 60, 0.6, random);
    expect(game.speed).toBeGreaterThan(0);
    stirFor(game, 120, 1.2, random);
    expect(game.speed).toBeLessThanOrEqual(MAX_SPEED);
    const fast = game.speed;
    for (let i = 0; i < 5; i++) cookFrame(game, null, random);
    expect(game.speed).toBeLessThan(fast);
    expect(batterScale(MAX_SPEED)).toBe(1.25);
    expect(batterScale(0)).toBe(1);
  });

  it('counts laps only the arrow\'s way, and ends a phase after 16 of them or 20 seconds', () => {
    const random = random32(2);
    const game = newCookGame(random);
    game.direction = 0;
    game.directionTimer = 10_000;
    stirFor(game, 400, 0.45, random);
    expect(game.phase).toBeGreaterThanOrEqual(1);
    const idle = newCookGame(random);
    for (let i = 0; i < PHASE_FRAMES; i++) cookFrame(idle, null, random);
    expect(idle.phase).toBe(0);
    cookFrame(idle, null, random);
    expect(idle.phase).toBe(1);
  });

  it('burns after 3 seconds too slow (the first time a warning), and spills after a second flat out', () => {
    const random = random32(3);
    const game = newCookGame(random);
    const burns: (string | null)[] = [];
    for (let i = 0; i < 90 * 3; i++) burns.push(cookFrame(game, null, random).burn);
    expect(burns.filter(Boolean)).toEqual(['warning', 'burn', 'burn']);
    expect(game.burns).toBe(2);
    const fast = newCookGame(random);
    fast.speed = MAX_SPEED;
    fast.direction = 0;
    let spilled = false;
    let a = 0;
    for (let i = 0; i < 40; i++) {
      a += 1.5;
      spilled ||= cookFrame(fast, at(a, 60), random).spill;
    }
    expect(spilled).toBe(true);
    expect(fast.spills).toBeGreaterThanOrEqual(1);
  });

  it('waits to change the arrow while the batter goes the wrong way', () => {
    const random = random32(4);
    const game = newCookGame(random);
    game.direction = 1;
    game.speed = 2000;
    game.directionTimer = 5;
    expect(wrongWay(game)).toBe(true);
    cookFrame(game, null, random);
    expect(game.directionTimer).toBe(5);
  });

  it('plays a whole cooking to the end', () => {
    const random = random32(5);
    const game = newCookGame(random);
    let a = 0;
    while (!game.over && game.frames < 30 * 70) {
      const step = game.direction === 0 ? 0.5 : -0.5;
      a += step;
      cookFrame(game, at(a), random);
    }
    expect(game.over).toBe(true);
    expect(game.frames).toBeLessThanOrEqual(PHASE_FRAMES * 3);
  });

  it("makes the Poffin the game does", () => {
    // Cheri alone, in 40 seconds, no mistakes: spicy 10 − dry 0, sour 0 − spicy 10 < 0 (one cancelled): 9 × 1.5 = 14 (rounded).
    const cheri = makePoffin(['cheri'], { frames: 1200, spills: 0, burns: 0 }, random32(6));
    expect(cheri).toEqual({ type: 0, flavors: [14, 0, 0, 0, 0], smoothness: 24 });
    expect(poffinName(cheri)).toBe('Spicy Poffin');
    expect(poffinLevel(cheri)).toBe(14);
    // Each spill and burn takes a point off.
    expect(makePoffin(['cheri'], { frames: 1200, spills: 2, burns: 1 }, random32(6)).flavors[0]).toBe(11);
    // Two flavours: the stronger first.
    const spelon = makePoffin(['spelon'], { frames: 1800, spills: 0, burns: 0 }, random32(6));
    expect(poffinName(spelon)).toBe('Spicy-Dry Poffin');
    expect(spelon.smoothness).toBe(34);
    // The same berry twice with others is Foul: 3 flavours at 2.
    const foul = makePoffin(['cheri', 'cheri'], { frames: 1800, spills: 0, burns: 0 }, random32(6));
    expect(poffinName(foul)).toBe('Foul Poffin');
    expect(foul.flavors.filter((f) => f === 2)).toHaveLength(3);
  });

  it('shows the time as the results do', () => {
    expect(cookTime(30 * 75 + 15)).toEqual({ minutes: 1, seconds: 15, hundredths: 50 });
  });
});
