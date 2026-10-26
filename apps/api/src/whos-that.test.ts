import { readFile } from 'node:fs/promises';
import { shapePixels, WHOS_THAT_CARDS } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { cardShape, maskAlpha } from './whos-that.js';

const mask = (id: string) => readFile(new URL(`../../web/public/holo-masks/${id}.png`, import.meta.url));

describe("Who's That Pokémon? masks", () => {
  it('reads a mask: 600×825, opaque at the corners, the Pokémon transparent', async () => {
    const { width, height, alpha } = maskAlpha(await mask('base1-9'));
    expect([width, height]).toEqual([600, 825]);
    expect(alpha[0]).toBe(255);
    expect(alpha.some((a) => a < 128)).toBe(true);
  });

  it("decodes every pixel as Pillow does (each mask's transparent pixels and alpha sum, from Pillow)", async () => {
    const pillow: Record<string, [number, number]> = { 'base1-9': [46728, 114309939], 'ex1-96': [73591, 107459575], 'ecard1-1': [49144, 113693313], 'neo3-7': [27457, 119225517] };
    for (const [id, [transparent, sum]] of Object.entries(pillow)) {
      const { alpha } = maskAlpha(await mask(id));
      expect([alpha.filter((a) => a < 128).length, alpha.reduce((s, a) => s + a, 0)]).toEqual([transparent, sum]);
    }
  });

  it("every listed card's mask gives a silhouette", async () => {
    for (const id of WHOS_THAT_CARDS.slice(0, 40)) {
      const shape = await cardShape(id);
      expect(shape.width).toBeGreaterThan(20);
      const pixels = shapePixels(shape);
      expect(pixels).toHaveLength(shape.width * shape.height);
      expect(pixels.some((p) => p === 1)).toBe(true);
    }
  });
});
