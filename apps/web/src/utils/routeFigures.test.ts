import type { Route } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import type { RunViewData } from '../hooks/useRun';
import { facing, key, layOutCards, placeFigures } from './routeFigures';

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

  it('a chosen encounter keeps the tile it stood on while it was chosen, not the best one (the second of two included)', () => {
    const steps = [[battle('Lass Haley'), battle('Youngster Joey')], [battle('Hiker Marcos')]];
    // Choosing: Lass on the left (3,8), Joey on the right (7,8).
    expect(placeFigures(route, view(steps), 0, 2).filter((p) => p.spot === route.spots[0]).map((p) => [p.figure.title, key(p.tile)])).toEqual([['Lass Haley', '3,8'], ['Youngster Joey', '7,8']]);
    // Joey chosen: still on the right once his battle is under way, and once passed.
    const underWay = { ...view(steps, 0, [1]), phase: 'encounter', encounter: { kind: 'battle', trainer: 'Youngster Joey' } } as unknown as RunViewData;
    expect(placeFigures(route, underWay, 0, 2).find((p) => p.figure.title === 'Youngster Joey')!.tile).toEqual({ x: 7, y: 8 });
    expect(placeFigures(route, view(steps, 1, [1]), 0, 2).find((p) => p.figure.title === 'Youngster Joey')!.tile).toEqual({ x: 7, y: 8 });
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

describe('layOutCards', () => {
  const card = { w: 176, h: 108 };
  const opts = { zoom: 3, minZoom: 2, card, view: { w: 390, h: 650 }, top: 8, bottom: 160, gap: 4, redDrop: 0 };
  const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < card.w && Math.abs(a.y - b.y) < card.h;

  it('pushes apart the cards of figures standing side by side', () => {
    const laid = layOutCards([{ option: 0, dx: -2, dy: 1, drop: 0, h: 108 }, { option: 1, dx: -1, dy: 1, drop: 0, h: 108 }], [], opts);
    expect(overlaps(laid.cards[0]!, laid.cards[1]!)).toBe(false);
    // Inside the view.
    for (const c of laid.cards) expect(c.x).toBeGreaterThanOrEqual(8 - 195);
  });

  it('rests the player higher, and zooms out, to keep the cards below clear of the bottom corners', () => {
    const laid = layOutCards([{ option: 0, dx: 0, dy: -3, drop: 0, h: 108 }, { option: 1, dx: 0, dy: 2, drop: 0, h: 108 }], [], opts);
    expect(laid.zoom).toBeLessThan(3);
    const below = laid.cards[1]!;
    const above = laid.cards[0]!;
    expect(laid.restY + below.y + 108).toBeLessThanOrEqual(650 - 160);
    expect(laid.restY + above.y).toBeGreaterThanOrEqual(8);
  });

  it('keeps the middle and the zoom when everything fits', () => {
    const laid = layOutCards([{ option: 0, dx: 0, dy: -1, drop: 0, h: 108 }], [], opts);
    expect(laid).toMatchObject({ zoom: 3, restY: 325 });
  });
});
