import { CARD_SCAN, shapePixels, type WhosThatShape } from '@poke-tcg/campaign';

/**
 * Who's That Pokémon?'s drawing, as tools/whos-that/whos_that.py draws it (keep the two alike): the Pokémon's shape
 * (from the API: never its card) in the anime's dark blue, with a darker shadow below and right, scaled into the burst
 * on the screen's left (BOX, shares of public/whos-that/template.webp, 1280×720). Drawn as it's played, nothing ahead of
 * time (the user's). The reveal paints the card's own art through the same shape, so the Pokémon appears in its place.
 */
export const BOX = { left: 0.09, top: 0.15, width: 0.4, height: 0.7 };
const SCREEN = { width: 1280, height: 720 };
const FILL = 'rgb(36, 104, 164)';
const SHADOW = 'rgb(20, 66, 112)';
/** The canvas over the burst, in the template's pixels. */
export const BOX_PX = { width: Math.round(SCREEN.width * BOX.width), height: Math.round(SCREEN.height * BOX.height) };
const OFFSET = Math.round(SCREEN.height * 0.012);

/** The shape as a white-on-transparent canvas, one pixel a pixel. */
function maskCanvas(shape: WhosThatShape) {
  const canvas = document.createElement('canvas');
  canvas.width = shape.width;
  canvas.height = shape.height;
  const image = new ImageData(shape.width, shape.height);
  shapePixels(shape).forEach((p, i) => {
    if (p) image.data.set([255, 255, 255, 255], i * 4);
  });
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas;
}

/** Where the shape goes in the box: as large as fits, room left for the shadow, centred. */
function place(shape: WhosThatShape) {
  const scale = Math.min((BOX_PX.width - OFFSET) / shape.width, (BOX_PX.height - OFFSET) / shape.height);
  const width = Math.round(shape.width * scale);
  const height = Math.round(shape.height * scale);
  return { x: Math.floor((BOX_PX.width - OFFSET - width) / 2), y: Math.floor((BOX_PX.height - OFFSET - height) / 2), width, height };
}

/** A layer the size of the placed shape: `paint` draws on it, then only the shape's part of it is kept. */
function throughShape(mask: HTMLCanvasElement, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext('2d')!;
  paint(ctx);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mask, 0, 0, width, height);
  return layer;
}

/** Draws the silhouette on the box's canvas (BOX_PX). */
export function drawSilhouette(canvas: HTMLCanvasElement, shape: WhosThatShape) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mask = maskCanvas(shape);
  const { x, y, width, height } = place(shape);
  const tinted = (colour: string) =>
    throughShape(mask, width, height, (layer) => {
      layer.fillStyle = colour;
      layer.fillRect(0, 0, width, height);
    });
  ctx.drawImage(tinted(SHADOW), x + OFFSET, y + OFFSET);
  ctx.drawImage(tinted(FILL), x, y);
}

/** Draws the reveal on the box's canvas: the card's art (`image`, the card's scan at any size) through the shape. */
export function drawReveal(canvas: HTMLCanvasElement, shape: WhosThatShape, image: HTMLImageElement) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { x, y, width, height } = place(shape);
  const k = image.naturalWidth / CARD_SCAN.width;
  const art = throughShape(maskCanvas(shape), width, height, (layer) => {
    layer.imageSmoothingQuality = 'high';
    layer.drawImage(image, shape.x * k, shape.y * k, shape.width * k, shape.height * k, 0, 0, width, height);
  });
  ctx.drawImage(art, x, y);
}

/** A time in seconds, to the hundredth ("1.23 s"). */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
