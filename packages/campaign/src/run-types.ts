// The kinds of run a player can pick: one per Kanto gym, all eight gyms in a row, and the whole League.
// A run is made of segments: some encounters to choose from, then (before a gym leader) a Gym Trainer that
// must be fought, then the segment's bosses one after another. The run is beaten with its last boss.
import { BOSSES, boss, ELITE_FOUR, KANTO_GYMS, type Boss, type BossId } from './bosses.js';

export interface RunSegment {
  /** Steps with 2–3 encounters to choose from. */
  steps: number;
  /** Fought in order, after the steps. A gym leader has a Gym Trainer before them. */
  bosses: BossId[];
}

export interface RunType {
  id: string;
  name: string;
  description: string;
  segments: RunSegment[];
}

/** One gym: 24 encounters, the Gym Trainer, then the gym leader (the 26th fight). */
const gymRun = (id: BossId, city: string) => {
  const b = boss(id);
  return {
    id: city.toLowerCase(),
    name: `${city} City`,
    description: `Trainers and encounters around ${city} City, then the gym: a Gym Trainer, and ${b.title} ${b.name} with the ${b.deckName} deck.`,
    segments: [{ steps: 24, bosses: [id] }],
  };
};

export const RUN_TYPES = {
  pewter: gymRun('brock', 'Pewter'),
  cerulean: gymRun('misty', 'Cerulean'),
  vermilion: gymRun('surge', 'Vermilion'),
  celadon: gymRun('erika', 'Celadon'),
  fuchsia: gymRun('koga', 'Fuchsia'),
  saffron: gymRun('sabrina', 'Saffron'),
  cinnabar: gymRun('blaine', 'Cinnabar'),
  viridian: gymRun('giovanni', 'Viridian'),
  kantoGyms: {
    id: 'kantoGyms',
    name: 'Kanto Gym Challenge',
    description: "All eight Kanto gyms in one run, Brock to Giovanni: 5 encounters, a Gym Trainer and the gym leader for each.",
    segments: KANTO_GYMS.map((id) => ({ steps: 5, bosses: [id] })),
  },
  kantoChampion: {
    id: 'kantoChampion',
    name: 'Kanto Champion',
    description: 'All eight gyms (4 encounters, a Gym Trainer and the gym leader each), then Victory Road and the Elite Four back to back, and Champion Blue.',
    segments: [...KANTO_GYMS.map((id) => ({ steps: 4, bosses: [id] })), { steps: 5, bosses: [...ELITE_FOUR, 'blue'] }],
  },
} satisfies Record<string, RunType>;

export type RunTypeId = keyof typeof RUN_TYPES;
export const RUN_TYPE_IDS = Object.keys(RUN_TYPES) as RunTypeId[];

/** The run a new account starts in. */
export const FIRST_RUN: RunTypeId = 'celadon';

export const runType = (id: string): RunType => {
  const type = (RUN_TYPES as Record<string, RunType>)[id];
  if (!type) throw new Error(`Unknown run type: ${id}`);
  return type;
};

/** The run's bosses in order; the last one beats the run. */
export const runBosses = (type: RunType): Boss[] => type.segments.flatMap((s) => s.bosses.map(boss));

/** The boss that ends the run. */
export const finalBoss = (type: RunType): Boss => runBosses(type).at(-1)!;

/** For the picker: who the run's bosses are, e.g. "Gym Leader Brock" or "8 gym leaders, the Elite Four and Champion Blue". */
export function bossSummary(type: RunType): string {
  const bosses = runBosses(type);
  if (bosses.length === 1) return `${bosses[0]!.title} ${bosses[0]!.name}`;
  const gyms = bosses.filter((b) => b.kind === 'gymLeader').length;
  const champion = bosses.find((b) => b.kind === 'champion');
  return `${gyms} gym leaders${champion ? `, the Elite Four and Champion ${champion.name}` : ''}`;
}

/** Every boss id, for checks. */
export const BOSS_IDS = Object.keys(BOSSES) as BossId[];
