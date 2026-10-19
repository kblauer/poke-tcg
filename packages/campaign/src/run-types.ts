// The kinds of run a player can pick: one per Kanto gym, all eight gyms in a row, and the whole League.
// A run is made of segments: some encounters to choose from, then (before a gym leader) a Gym Trainer that
// must be fought, then the segment's bosses one after another. The run is beaten with its last boss.
// Each belongs to a generation, whose booster packs its runs unlock (GENERATIONS); the Gym Challenge needs the
// generation's badges and the Champion run a beaten Gym Challenge (runTypeLock).
import type { EnergyType } from '@poke-tcg/game-engine';
import { BOSSES, boss, ELITE_FOUR, KANTO_GYMS, type Boss, type BossId } from './bosses.js';
import { BASIC_ENERGY } from './pool.js';

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
  /** The generation it belongs to (a key of GENERATIONS). */
  generation: number;
  /** What unlocks it, if it isn't open from the start: every gym badge of its generation, or a beaten Gym Challenge. */
  requires?: 'badges' | 'gymChallenge';
}

/** One gym: 24 encounters, the Gym Trainer, then the gym leader (the 26th fight). */
const gymRun = (id: BossId, city: string) => {
  const b = boss(id);
  return {
    id: city.toLowerCase(),
    name: `${city} City`,
    description: `Trainers and encounters around ${city} City, then the gym: a Gym Trainer, and ${b.title} ${b.name} with the ${b.deckName} deck.`,
    segments: [{ steps: 24, bosses: [id] }],
    generation: 1,
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
    generation: 1,
    requires: 'badges',
  },
  kantoChampion: {
    id: 'kantoChampion',
    name: 'Kanto Champion',
    description: 'All eight gyms (4 encounters, a Gym Trainer and the gym leader each), then Victory Road and the Elite Four back to back, and Champion Blue.',
    segments: [...KANTO_GYMS.map((id) => ({ steps: 4, bosses: [id] })), { steps: 5, bosses: [...ELITE_FOUR, 'blue'] }],
    generation: 1,
    requires: 'gymChallenge',
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

/**
 * A generation of runs (agreed with the user): its region, its gyms (whose badges unlock its Gym Challenge), its Gym
 * Challenge run (beating it unlocks its Champion run), and its sets' booster packs in release order. An account starts
 * with no packs: the first battle finished without conceding in a run unlocks the generation's next pack, and beating
 * a run of the generation unlocks them all. Gen 2 (Neo Genesis onwards) comes with its runs.
 */
export interface Generation {
  region: string;
  gyms: BossId[];
  gymChallenge: RunTypeId;
  packs: string[];
}

export const GENERATIONS: Record<number, Generation> = {
  1: { region: 'Kanto', gyms: KANTO_GYMS, gymChallenge: 'kantoGyms', packs: ['base1', 'base2', 'basep', 'base3', 'base4', 'base5', 'gym1', 'gym2'] },
};

export const generation = (id: number): Generation => {
  const g = GENERATIONS[id];
  if (!g) throw new Error(`Unknown generation: ${id}`);
  return g;
};

/** The badges (key item ids) of a generation's gyms. */
export const generationBadges = (g: Generation) => g.gyms.map((id) => boss(id).gym!.badge);

/** The next pack a run of the generation unlocks: its first set not unlocked yet, or null when all are. */
export const nextPack = (g: Generation, unlocked: ReadonlySet<string>) => g.packs.find((id) => !unlocked.has(id)) ?? null;

/**
 * Why a run type can't be started yet, or null if it can: the Gym Challenge needs every badge of its generation (key
 * items the account has, `badges`), and the Champion run its generation's Gym Challenge beaten (`beaten`: run types won).
 */
export function runTypeLock(type: RunType, account: { badges: ReadonlySet<string>; beaten: ReadonlySet<string> }): string | null {
  const g = generation(type.generation);
  if (type.requires === 'badges') {
    const missing = generationBadges(g).filter((b) => !account.badges.has(b)).length;
    return missing ? `Earn all ${g.gyms.length} ${g.region} badges first (${missing} to go)` : null;
  }
  if (type.requires === 'gymChallenge' && !account.beaten.has(g.gymChallenge)) return `Beat the ${runType(g.gymChallenge).name} first`;
  return null;
}

/** The types a boss's deck is built around: its basic Energy's, the most first. */
export function bossTypes(b: Boss): EnergyType[] {
  const typeOf = new Map(Object.entries(BASIC_ENERGY).map(([type, id]) => [id, type as EnergyType]));
  return b.deck
    .filter(([id]) => typeOf.has(id))
    .sort((x, y) => y[1] - x[1])
    .map(([id]) => typeOf.get(id)!);
}

/** Every boss id, for checks. */
export const BOSS_IDS = Object.keys(BOSSES) as BossId[];
