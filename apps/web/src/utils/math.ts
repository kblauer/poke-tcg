/** Rounds to a set number of decimal places (default 3). */
export const round = (value: number, precision = 3) => parseFloat(value.toFixed(precision));

/** Limits a value to [min, max] (default 0–100). */
export const clamp = (value: number, min = 0, max = 100) => Math.min(Math.max(value, min), max);

/** Re-maps a value from one range to another, e.g. adjust(10, 0, 100, 100, 0) = 90. */
export const adjust = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) =>
  round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin));

/** A whole number with commas between its thousands (1,250), whatever the browser's locale. */
export const commas = (n: number) => n.toLocaleString('en-US');
