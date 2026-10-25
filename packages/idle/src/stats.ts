// Gen 3 stats and experience: the stat formulas (pokemon.c's CalculateMonStats), natures (gNatureStatTable) and the
// growth rates' experience tables (experience_tables.h), all with the game's integer division.
import { species } from './data.js';
import type { GrowthRate, Stats } from './types.js';

export const NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious',
  'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
] as const;

/** The stats a nature raises and lowers, in the game's order (Attack, Defense, Speed, Sp. Atk, Sp. Def) mapped to ours. */
const NATURE_STATS = [1, 2, 5, 3, 4] as const;

/** A nature's multiplier, in tenths, for a stat (1–5: Attack…Speed in our order): 11, 9 or 10. */
export function natureTenths(nature: number, stat: number): number {
  const up = NATURE_STATS[Math.floor(nature / 5)]!;
  const down = NATURE_STATS[nature % 5]!;
  if (up === down) return 10;
  return stat === up ? 11 : stat === down ? 9 : 10;
}

export const STAT_NAMES = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'] as const;

/** A Pokémon's six stats from its species, level, IVs, EVs and nature (Gen 3's formulas). */
export function calcStats(speciesId: number, level: number, ivs: Stats, evs: Stats, nature: number): Stats {
  const base = species(speciesId).base;
  const core = (i: number) => Math.floor(((2 * base[i]! + ivs[i]! + Math.floor(evs[i]! / 4)) * level) / 100);
  const out = [0, 0, 0, 0, 0, 0] as Stats;
  out[0] = core(0) + level + 10;
  for (let i = 1; i < 6; i++) out[i] = Math.floor(((core(i) + 5) * natureTenths(nature, i)) / 10);
  return out;
}

/** The total experience needed for a level (experience_tables.h). */
export function expForLevel(growth: GrowthRate, n: number): number {
  // Every table starts 0, 1 (levels 0 and 1); the formulas from level 2.
  if (n <= 1) return Math.max(0, n);
  const cube = n * n * n;
  const t = Math.trunc;
  switch (growth) {
    case 'slow':
      return t((5 * cube) / 4);
    case 'fast':
      return t((4 * cube) / 5);
    case 'mediumFast':
      return cube;
    case 'mediumSlow':
      return t((6 * cube) / 5) - 15 * n * n + 100 * n - 140;
    case 'erratic':
      return n <= 50 ? t(((100 - n) * cube) / 50) : n <= 68 ? t(((150 - n) * cube) / 100) : n <= 98 ? t((t((1911 - 10 * n) / 3) * cube) / 500) : t(((160 - n) * cube) / 100);
    case 'fluctuating':
      return n <= 15 ? t(((t((n + 1) / 3) + 24) * cube) / 50) : n <= 36 ? t(((n + 14) * cube) / 50) : t(((t(n / 2) + 32) * cube) / 50);
  }
}

export const MAX_LEVEL = 100;

/** The level a total of experience reaches. */
export function levelForExp(growth: GrowthRate, exp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expForLevel(growth, level + 1)) level++;
  return level;
}

/** At most 255 EVs in a stat and 510 in all (Gen 3). */
export const MAX_EV = 255;
export const MAX_TOTAL_EV = 510;

/** EVs after gaining `gain` (each capped at 255 and the total at 510, in stat order as the game adds them). */
export function addEvs(evs: Stats, gain: Stats): Stats {
  const out = [...evs] as Stats;
  let total = out.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 6; i++) {
    const add = Math.min(gain[i]!, MAX_EV - out[i]!, MAX_TOTAL_EV - total);
    if (add <= 0) continue;
    out[i]! += add;
    total += add;
  }
  return out;
}
