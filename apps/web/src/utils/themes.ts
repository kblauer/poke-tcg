/**
 * Colour themes (picked on the Settings page, `useColorTheme`). The app's chrome is Tailwind's slate (the dark neutrals:
 * backgrounds, panels, rings, text) and its yellow accent (the page lit in the menu, selection rings, ₱), and Tailwind v4
 * reads every colour class from a CSS variable (`--color-slate-800`), so a theme only redefines those variables on
 * `<html>`; no component changes. A theme is a hue and a strength for each: the shades keep Tailwind's own lightness
 * steps, so every text and background pair stays as readable as the default. Only yellow 50–400 (the accent shades) are
 * themed: 500 and darker mean things in play (Paralyzed, Lightning, the gym leader's icon) and stay yellow.
 */

export interface ColorTheme {
  id: string;
  name: string;
  /** The generation it's drawn from (0: the default). */
  gen: 0 | 1 | 2 | 3;
  /** Where its colours come from, shown under its name. */
  from: string;
  /** The neutrals' OKLCH hue, and how strongly they're tinted with it (1: as much as Tailwind's slate is blue). */
  hue: number;
  tint: number;
  /** The accent's OKLCH hue, and its strength (1: as strong as Tailwind's yellow, or as much as the hue allows). */
  accent: number;
  accentTint?: number;
}

export const DEFAULT_THEME = 'slate';

export const GENERATION_NAMES: Record<ColorTheme['gen'], string> = { 0: 'Default', 1: 'Generation 1 · Kanto', 2: 'Generation 2 · Johto', 3: 'Generation 3 · Hoenn' };

export const COLOR_THEMES: ColorTheme[] = [
  { id: DEFAULT_THEME, name: 'Slate', gen: 0, from: 'The original look', hue: 257, tint: 1, accent: 95 },

  { id: 'bulbasaur', name: 'Bulbasaur', gen: 1, from: 'Starter: teal skin, a green bulb', hue: 175, tint: 1.6, accent: 140 },
  { id: 'charmander', name: 'Charmander', gen: 1, from: 'Starter: orange scales, a tail flame', hue: 45, tint: 1.6, accent: 75 },
  { id: 'squirtle', name: 'Squirtle', gen: 1, from: 'Starter: blue skin, a tan shell', hue: 230, tint: 1.6, accent: 75, accentTint: 0.7 },
  { id: 'pikachu', name: 'Pikachu', gen: 1, from: 'Partner: yellow fur, red cheeks', hue: 70, tint: 1.1, accent: 25 },
  { id: 'red', name: 'Red Version', gen: 1, from: "Game: Pokémon Red's box", hue: 22, tint: 1.9, accent: 30 },
  { id: 'blue', name: 'Blue Version', gen: 1, from: "Game: Pokémon Blue's box", hue: 258, tint: 2.2, accent: 235 },
  { id: 'game-boy', name: 'Game Boy', gen: 1, from: "UI: the original Game Boy's green screen", hue: 125, tint: 1.8, accent: 120 },
  { id: 'viridian-forest', name: 'Viridian Forest', gen: 1, from: 'Route: deep woods, Pikachu in the grass', hue: 150, tint: 1.7, accent: 100 },
  { id: 'lavender-town', name: 'Lavender Town', gen: 1, from: 'Route: the Pokémon Tower at dusk', hue: 305, tint: 1.6, accent: 330 },
  { id: 'seafoam-islands', name: 'Seafoam Islands', gen: 1, from: "Route: icy caves, Articuno's blue", hue: 215, tint: 1.3, accent: 195 },

  { id: 'chikorita', name: 'Chikorita', gen: 2, from: 'Starter: pale green, a leaf', hue: 130, tint: 1.4, accent: 115 },
  { id: 'cyndaquil', name: 'Cyndaquil', gen: 2, from: 'Starter: a navy back, flames', hue: 215, tint: 1.4, accent: 45 },
  { id: 'totodile', name: 'Totodile', gen: 2, from: 'Starter: blue scales, red spikes', hue: 235, tint: 1.6, accent: 25 },
  { id: 'gold', name: 'Gold Version', gen: 2, from: 'Game: Pokémon Gold, Ho-Oh', hue: 85, tint: 1.3, accent: 92 },
  { id: 'silver', name: 'Silver Version', gen: 2, from: 'Game: Pokémon Silver, Lugia', hue: 250, tint: 0.4, accent: 245, accentTint: 0.25 },
  { id: 'crystal', name: 'Crystal Version', gen: 2, from: 'Game: Pokémon Crystal, Suicune', hue: 205, tint: 1.8, accent: 195 },
  { id: 'ecruteak', name: 'Ecruteak City', gen: 2, from: "Route: old wood, the Tin Tower's vermilion", hue: 55, tint: 1.2, accent: 35 },
  { id: 'ilex-forest', name: 'Ilex Forest', gen: 2, from: "Route: a dark wood, Celebi's shrine", hue: 160, tint: 1.6, accent: 130 },
  { id: 'lake-of-rage', name: 'Lake of Rage', gen: 2, from: 'Route: night water, the red Gyarados', hue: 262, tint: 1.6, accent: 20 },

  { id: 'treecko', name: 'Treecko', gen: 3, from: 'Starter: green skin, a red belly', hue: 145, tint: 1.6, accent: 22 },
  { id: 'torchic', name: 'Torchic', gen: 3, from: 'Starter: orange down, a yellow crest', hue: 50, tint: 1.6, accent: 98 },
  { id: 'mudkip', name: 'Mudkip', gen: 3, from: 'Starter: blue skin, orange gills', hue: 240, tint: 1.6, accent: 55 },
  { id: 'ruby', name: 'Ruby Version', gen: 3, from: 'Game: Pokémon Ruby, Groudon', hue: 15, tint: 1.9, accent: 5 },
  { id: 'sapphire', name: 'Sapphire Version', gen: 3, from: 'Game: Pokémon Sapphire, Kyogre', hue: 262, tint: 2, accent: 240 },
  { id: 'emerald', name: 'Emerald Version', gen: 3, from: 'Game: Pokémon Emerald, Rayquaza', hue: 160, tint: 1.9, accent: 95 },
  { id: 'route-113', name: 'Route 113', gen: 3, from: 'Route: grey volcanic ash falling', hue: 75, tint: 0.5, accent: 90, accentTint: 0.3 },
  { id: 'sootopolis', name: 'Sootopolis City', gen: 3, from: 'Route: a crater lake, white stone', hue: 200, tint: 1.6, accent: 175 },
  { id: 'fallarbor', name: 'Fallarbor Town', gen: 3, from: 'Route: ash-dusted roofs, autumn', hue: 35, tint: 0.9, accent: 60 },
];

// Tailwind v4's slate and yellow: each shade's lightness and chroma (slate's hue is about 257, yellow's about 95).
const NEUTRAL: [shade: number, l: number, c: number][] = [
  [50, 0.984, 0.003], [100, 0.968, 0.007], [200, 0.929, 0.013], [300, 0.869, 0.022], [400, 0.704, 0.04], [500, 0.554, 0.046],
  [600, 0.446, 0.043], [700, 0.372, 0.044], [800, 0.279, 0.041], [900, 0.208, 0.042], [950, 0.129, 0.042],
];
const ACCENT: [shade: number, l: number, c: number][] = [[50, 0.987, 0.026], [100, 0.973, 0.071], [200, 0.945, 0.129], [300, 0.905, 0.182], [400, 0.852, 0.199]];

/** An OKLCH colour in linear sRGB (outside 0–1 when sRGB can't show it). */
function linearRgb(l: number, c: number, h: number): number[] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
}

/** Whether an OKLCH colour is inside sRGB. */
function inGamut(l: number, c: number, h: number): boolean {
  return linearRgb(l, c, h).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

/** An OKLCH colour (its chroma cut to sRGB) as `r, g, b` 0–255, for a canvas's `rgba(…)`. */
function rgbTriplet(l: number, c: number, h: number): string {
  const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return linearRgb(l, Math.min(c, maxChroma(l, h, c)), h)
    .map((v) => Math.round(255 * Math.max(0, Math.min(1, gamma(v)))))
    .join(', ');
}

/**
 * The playmats' colours (Playmat.tsx draws them on a canvas, which CSS variables don't reach), as `r, g, b`: the faint
 * resting lines (the theme's slate-400) and the light a click sends through them, a bright version of the theme's hue
 * (as sky-300 is of slate's blue; Slate keeps exactly those), fainter for the barely tinted themes.
 */
export function playmatColors(t: ColorTheme): { line: string; glow: string } {
  if (t.id === DEFAULT_THEME) return { line: '148, 163, 184', glow: '125, 211, 252' };
  return { line: rgbTriplet(0.704, 0.04 * t.tint, t.hue), glow: rgbTriplet(0.828, 0.111 * Math.min(1, t.tint), t.hue) };
}

/** The most chroma sRGB can show at a lightness and hue, up to `max`. */
function maxChroma(l: number, h: number, max = 0.4): number {
  if (inGamut(l, max, h)) return max;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(l, mid, h)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** An OKLCH colour, its chroma cut to what sRGB can show at that lightness and hue (browsers clipping it instead would shift the hue). */
function oklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${Math.min(c, maxChroma(l, h, c)).toFixed(4)} ${h})`;
}

/**
 * An accent shade: yellow is vivid even very light, most hues aren't (a red as light as yellow-300 is nearly white), so it
 * goes up to 0.2 darker to find the chroma it asks for.
 */
function accentShade(l: number, c: number, h: number): string {
  let best = l;
  let bestC = maxChroma(l, h, c);
  for (let x = l - 0.01; x >= l - 0.2 && bestC < c * 0.85; x -= 0.01) {
    const m = maxChroma(x, h, c);
    if (m > bestC) [best, bestC] = [x, m];
  }
  return oklch(best, c, h);
}

/** The CSS variables a theme sets on `<html>`: `--color-slate-*` and `--color-yellow-50`…`400`. */
export function themeVars(t: ColorTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [shade, l, c] of NEUTRAL) vars[`--color-slate-${shade}`] = oklch(l, c * t.tint, t.hue);
  for (const [shade, l, c] of ACCENT) vars[`--color-yellow-${shade}`] = accentShade(l, c * (t.accentTint ?? 1), t.accent);
  return vars;
}

export function findTheme(id: string): ColorTheme {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0]!;
}
