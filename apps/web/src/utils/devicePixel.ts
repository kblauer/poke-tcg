/**
 * A length in CSS pixels on a whole device pixel (the map's pan), so the scaled pixels stay on the device's grid. In a
 * file of its own, with no imports: the run maps and the Battle Tower use it, and must not load the Idle Adventure's data
 * with it (it was in the Idle Adventure's GameScreen; scripts/check-dist.mjs checks).
 */
export const onDevicePixel = (cssPx: number) => {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(cssPx * dpr) / dpr;
};
