import type { Route } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import type { RunViewData } from '../hooks/useRun';
import { facing, key, placeFigures } from './routeFigures';

/** A 12×12 map walkable everywhere, its encounters going up, with spots at (5,8) and (5,3). */
const route = {
  name: 'Test Route',
  flow: 'up',
  image: '',
  width: 12 * 16,
  height: 12 * 16,
  spots: [{ x: 5, y: 8 }, { x: 5, y: 3 }],
  walkable: Array.from({ length: 12 }, () => '............'),
} as unknown as Route;

const battle = (trainer: string) => ({ kind: 'battle' as const, label: trainer, trainer });
const shop = { kind: 'shop' as const, label: 'Shop' };

/** A run at `position` on the map with these steps (encounters as given). */
const view = (steps: { kind: string; label: string; trainer?: string }[][], position = 0, chosen: (number | undefined)[] = []) =>
  ({ position, phase: 'map', steps: steps.map((options, i) => ({ options, ...(chosen[i] !== undefined && { chosen: chosen[i] }) })), encounter: null, event: null }) as unknown as RunViewData;

describe('placeFigures', () => {
  it("a spot's figures stand beside it (left and right, 2 tiles away) first, then ahead along the flow, then behind", () => {
    const placed = placeFigures(route, view([[battle('Lass Haley'), battle('Youngster Joey'), battle('Hiker Marcos'), battle('Camper Liam')]]), 0, 2);
    expect(placed.map((p) => key(p.tile))).toEqual(['3,8', '7,8', '5,6', '5,10']);
    expect(placed.every((p) => !p.faded)).toBe(true);
    expect(placed.map((p) => p.figure.option)).toEqual([0, 1, 2, 3]);
  });

  it("the current spot is placed first (the best tiles), upcoming spots' figures too, a passed spot's chosen encounter faded", () => {
    const placed = placeFigures(route, view([[battle('Lass Haley'), shop], [battle('Hiker Marcos')]], 1, [1]), 0, 2);
    // The passed shop (its keeper walked up beside the player: the free tile next to the spot), and the current trainer.
    expect(placed.filter((p) => p.faded).map((p) => p.figure.title)).toEqual(['Shop']);
    expect(placed.find((p) => !p.faded)!.tile).toEqual({ x: 3, y: 3 });
    // The option not chosen at the passed spot isn't there.
    expect(placed.some((p) => p.figure.title === 'Lass Haley')).toBe(false);
  });

  it("figures never share a tile with a spot or each other, and a non-battle encounter's figure has its bubble", () => {
    const placed = placeFigures(route, view([[shop, battle('Lass Haley')], [battle('Hiker Marcos'), battle('Camper Liam')]]), 0, 2);
    const tiles = placed.map((p) => key(p.tile));
    expect(new Set(tiles).size).toBe(tiles.length);
    for (const spot of route.spots) expect(tiles).not.toContain(key(spot));
    expect(placed.find((p) => p.figure.title === 'Shop')!.figure.bubble).toBe('shop');
    expect(placed.find((p) => p.figure.title === 'Lass Haley')!.figure.bubble).toBeUndefined();
  });

  it("a map holding only some of the run's steps places only those", () => {
    const placed = placeFigures(route, view([[battle('Lass Haley')], [battle('Hiker Marcos')], [battle('Camper Liam')]]), 0, 2);
    expect(placed.map((p) => p.figure.title).sort()).toEqual(['Hiker Marcos', 'Lass Haley']);
  });
});

describe('facing', () => {
  it('looks along the longer axis, right or left before up or down', () => {
    expect(facing({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe('right');
    expect(facing({ x: 0, y: 0 }, { x: -2, y: 2 })).toBe('left');
    expect(facing({ x: 0, y: 0 }, { x: 1, y: 4 })).toBe('down');
    expect(facing({ x: 0, y: 5 }, { x: 0, y: 2 })).toBe('up');
    expect(facing({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe('up');
  });
});
