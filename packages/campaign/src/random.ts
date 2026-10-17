// Seeded randomness for runs. The state is a plain number kept in RunState, so a run can be saved as JSON
// and replays the same way from the same seed.
import { nextRandom } from '@poke-tcg/game-engine';

/** A random number generator's state; the helpers below advance it in place. */
export interface Rng {
  state: number;
}

export const rngFrom = (seed: number): Rng => ({ state: seed });

/** A number in [0, 1). */
export function random(rng: Rng): number {
  const [value, next] = nextRandom(rng.state);
  rng.state = next;
  return value;
}

/** An integer in [0, n). */
export const int = (rng: Rng, n: number) => Math.floor(random(rng) * n);

/** An integer in [min, max]. */
export const between = (rng: Rng, min: number, max: number) => min + int(rng, max - min + 1);

export const chance = (rng: Rng, p: number) => random(rng) < p;

export const pick = <T>(rng: Rng, items: readonly T[]): T => {
  if (!items.length) throw new Error('Nothing to pick from');
  return items[int(rng, items.length)]!;
};

/** One item, with probability proportional to its weight. */
export function weighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = random(rng) * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll < 0) return item;
  }
  return items.at(-1)![0];
}

/** Up to `n` different items, in random order. */
export function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (out.length < n && rest.length) out.push(rest.splice(int(rng, rest.length), 1)[0]!);
  return out;
}

/** A fresh seed for something rolled later (an opponent's deck). */
export const seed = (rng: Rng) => int(rng, 2 ** 31);
