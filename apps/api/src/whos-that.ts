import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { shapeFromMask, WHOS_THAT_CARDS, type WhosThatCard, type WhosThatShape } from '@poke-tcg/campaign';
import { TRPCError } from '@trpc/server';
import { catalogIndex } from './catalog.js';

/**
 * Who's That Pokémon?'s pictures (README: Who's That Pokémon?): a round's shape is read from its holo's mask here and
 * sent alone, never the card or the mask's file, so the browser can't tell which card it is until it's named. The masks
 * are the web app's (apps/web/public/holo-masks); the Vercel build copies them beside the function (vercel-build.mjs).
 */
const MASK_DIRS = [new URL('./holo-masks/', import.meta.url), new URL('../../web/public/holo-masks/', import.meta.url)];

/**
 * A mask's alpha, row by row: the masks are 8-bit grey-and-alpha PNGs, not interlaced (tools/holo-masks), so this reads
 * just those, undoing each row's filter (the PNG spec's None, Sub, Up, Average and Paeth).
 */
export function maskAlpha(png: Buffer): { width: number; height: number; alpha: Uint8Array } {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 4 || png[28] !== 0) throw new Error('Not an 8-bit grey-and-alpha mask');
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const data = inflateSync(Buffer.concat(chunks));
  const bpp = 2;
  const stride = width * bpp;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[out + x - bpp]! : 0;
      const b = y > 0 ? rows[out - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? rows[out - stride + x - bpp]! : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]!;
      rows[out + x] = (data[src + x]! + predictor) & 0xff;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rows[i * bpp + 1]!;
  return { width, height, alpha };
}

const shapes = new Map<string, WhosThatShape>();

/** A card's silhouette (shapeFromMask), read once per instance. INTERNAL_SERVER_ERROR if its mask can't be read. */
export async function cardShape(cardId: string): Promise<WhosThatShape> {
  const cached = shapes.get(cardId);
  if (cached) return cached;
  for (const dir of MASK_DIRS) {
    const png = await readFile(new URL(`${cardId}.png`, dir)).catch(() => null);
    if (!png) continue;
    const shape = shapeFromMask(cardId, maskAlpha(png).alpha);
    if (!shape) break;
    shapes.set(cardId, shape);
    return shape;
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `No silhouette for ${cardId}` });
}

/** The cards the game picks from (WHOS_THAT_CARDS), with their names: those in the catalog. */
export async function whosThatCards(): Promise<WhosThatCard[]> {
  const index = await catalogIndex();
  return WHOS_THAT_CARDS.flatMap((id) => {
    const row = index.get(id);
    return row ? [{ id, name: row.name }] : [];
  });
}

/** A card's name, for the answer revealed. */
export const cardName = async (cardId: string) => (await catalogIndex()).get(cardId)?.name ?? cardId;
