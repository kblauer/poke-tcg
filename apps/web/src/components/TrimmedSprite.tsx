import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** An image's size and the box its visible (not fully transparent) pixels fill (and the image, to draw from). */
interface Trim {
  img: HTMLImageElement;
  width: number;
  height: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each image's trim, measured once a page load. */
const trims = new Map<string, Trim>();

/** Measures an image's visible box (drawn on a canvas, its alpha read): the whole image if it has none. */
function measure(img: HTMLImageElement): Trim {
  const { naturalWidth: width, naturalHeight: height } = img;
  const canvas = document.createElement('canvas');
  Object.assign(canvas, { width, height });
  const ctx = canvas.getContext('2d');
  if (!ctx) return { img, width, height, x: 0, y: 0, w: width, h: height };
  ctx.drawImage(img, 0, 0);
  const alpha = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha[(y * width + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? { img, width, height, x: 0, y: 0, w: width, h: height } : { img, width, height, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The screen's device pixels a CSS pixel, followed as it changes (the browser zoomed, the window moved to another screen). */
function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const onResize = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return dpr;
}

/**
 * A pixel-art sprite without the transparent margin round it (the Idle Adventure's starters: FireRed's 64x64 front
 * sprites fill only about 40px of it), at about `scale` CSS pixels a sprite pixel. The image files are left whole (the
 * battle screen places them by FireRed's coordinates); the margin is measured in the browser once an image and cut off
 * here. Pixel perfect (the user's): drawn on a canvas, unsmoothed, at a whole number of the screen's device pixels a
 * sprite pixel (`scale` rounded to one, at least 1), so every pixel is the same size whatever the display scaling.
 * Nothing is shown until it's measured.
 */
export function TrimmedSprite({ src, scale, className = '' }: { src: string; scale: number; className?: string }) {
  const [trim, setTrim] = useState(() => trims.get(src) ?? null);
  const dpr = useDevicePixelRatio();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const known = trims.get(src);
    if (known) return setTrim(known);
    let live = true;
    const img = new Image();
    img.onload = () => {
      const t = measure(img);
      trims.set(src, t);
      if (live) setTrim(t);
    };
    img.src = src;
    return () => void (live = false);
  }, [src]);
  const device = Math.max(1, Math.round(scale * dpr));
  useLayoutEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !trim) return;
    el.width = trim.w * device;
    el.height = trim.h * device;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(trim.img, trim.x, trim.y, trim.w, trim.h, 0, 0, el.width, el.height);
  }, [trim, device]);
  if (!trim) return null;
  return <canvas ref={canvas} className={`inline-block shrink-0 [image-rendering:pixelated] ${className}`} style={{ width: (trim.w * device) / dpr, height: (trim.h * device) / dpr }} aria-hidden />;
}
