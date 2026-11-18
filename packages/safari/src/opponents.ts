// Safari Draft (issue #239, section 6.2): the opponents. Each battle step offers 1–3 opponents of different difficulties,
// a harder one paying more; trainer classes with their sprites, gym leaders now and then as the hardest; after the 15
// battles, Champion Blue. An opponent is just a board (a battle is a pure function of two boards and a seed).
//
// The user's (2026-11-18, the issue's "Not specified yet"):
//   - a board's strength is a fixed curve by the battle's number (MEDIUM_TIERS: a medium opponent's tier), an easy one a
//     tier lower, a hard one a tier higher, a gym leader two (hard + 1); good drafting is rewarded, never scaled away.
//     A board mixes tiers around its target (BOARD_SPREAD) and holds evolved units;
//   - a step offers 3 opponents, 2 or 1 (OFFER_WEIGHTS 4:2:1, as the Badge Challenge's steps); about 1 step in 4 a gym
//     leader takes the hardest slot (LEADER_CHANCE), each of the 8 at most once a run;
//   - a gym leader's board is 6 of their type, their own prints first (Misty's Seadra…), with their Trainer (GYM_LEADERS);
//   - Blue's board is his FireRed Champion team, the strongest plain print of each line (Pidgeot, Alakazam, Rhydon,
//     Gyarados, Arcanine and one of Venusaur, Charizard and Blastoise, rolled once a run), with Defender.
//
// Mine, placeholders to check with the user: a trainer class's board takes its favourite Pokémon (the Badge Challenge's
// TRAINER_FAVORITES) where its tier has some, FAVOURITE_SHARE of the time; with one opponent it's easy, medium or hard at
// random, and a gym leader comes only on a step of 2 or 3; the type shown is the board's most common type; no opponent's
// board holds a legendary (they're the encounters' rewards).
import { TRAINERS, trainerFavorites, weighted, int, chance, sample, pick, type Rng } from '@poke-tcg/campaign';
import { namesMatch, type EnergyType } from '@poke-tcg/game-engine';
import { BOARD_SIZE } from './battle.js';
import type { TrainerName } from './effects.js';
import { TOP_TIER, unitScore, type Unit } from './units.js';

/** A legendary's board (an encounter, encounters.ts) pays nothing but the legendary. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'gymLeader' | 'champion' | 'legendary';

/** What beating an opponent pays (issue #239, section 7). */
export const OPPONENT_PAY: Record<Difficulty, number> = { easy: 450, medium: 550, hard: 700, gymLeader: 850, champion: 1000, legendary: 0 };
/** A medium opponent's tier by battle (0–14): the fixed curve (the user's, 2026-11-18). */
export const MEDIUM_TIERS = [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5];
/** Each difficulty's tier against the curve. */
export const DIFFICULTY_TIER: Record<Exclude<Difficulty, 'champion' | 'legendary'>, number> = { easy: -1, medium: 0, hard: 1, gymLeader: 2 };
/** How many opponents a step offers: 3, 2 or 1, by weight. */
export const OFFER_WEIGHTS: [count: number, weight: number][] = [[3, 4], [2, 2], [1, 1]];
export const LEADER_CHANCE = 0.25;
/** A board unit's tier against its target: one lower, the same or one higher, by weight (mine). Not at the tiers' ends (rollBoard). */
const BOARD_SPREAD: [offset: number, weight: number][] = [[-1, 1], [0, 2], [1, 1]];
/** How often a slot takes the trainer's favourite or the leader's own print, where the tier has one (mine). */
const FAVOURITE_SHARE = 0.7;

/** Kanto's gym leaders: their type in the TCG, their own prints' owner's name, their Trainer (the user's, 2026-11-18). */
export const GYM_LEADERS: { id: string; name: string; type: EnergyType; trainer: TrainerName }[] = [
  { id: 'brock', name: 'Brock', type: 'fighting', trainer: 'Defender' },
  { id: 'misty', name: 'Misty', type: 'water', trainer: 'Super Potion' },
  { id: 'lt-surge', name: 'Lt. Surge', type: 'lightning', trainer: 'PlusPower' },
  { id: 'erika', name: 'Erika', type: 'grass', trainer: 'Full Heal' },
  { id: 'koga', name: 'Koga', type: 'grass', trainer: 'Gust of Wind' },
  { id: 'sabrina', name: 'Sabrina', type: 'psychic', trainer: 'Imposter Professor Oak' },
  { id: 'blaine', name: 'Blaine', type: 'fire', trainer: 'Scoop Up' },
  { id: 'giovanni', name: 'Giovanni', type: 'fighting', trainer: 'Super Energy Removal' },
];

/** Blue's FireRed Champion team: these lines always, and one of the starters' (the user's, 2026-11-18). */
export const BLUE_TEAM = ['Pidgeot', 'Alakazam', 'Rhydon', 'Gyarados', 'Arcanine'];
export const BLUE_STARTERS = ['Venusaur', 'Charizard', 'Blastoise'];
export const BLUE_TRAINER: TrainerName = 'Defender';

/**
 * An opponent offered. Its board is the server's until it's picked (issue #239, 6.2: the choice shows the trainer, their
 * type, the difficulty and the pay).
 */
export interface Opponent {
  /** "Swimmer Luis" (the web's trainerSprite reads the class from it), "Misty", "Blue". */
  name: string;
  /** A boss's id: their sprite (public/trainers/<boss>.png). */
  boss?: string;
  difficulty: Difficulty;
  /** The type shown: a leader's, else the board's most common. */
  type: EnergyType;
  pay: number;
  /** Unit ids, left to right, and the Trainer they play. */
  board: string[];
  trainer?: TrainerName;
}

const clampTier = (t: number) => Math.min(TOP_TIER, Math.max(1, t));
const isLegendaryName = (name: string) => ['Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Mew'].some((n) => namesMatch(name, n));

/** The type most of a board's units are (the first such on a tie). */
export function mainType(units: readonly Unit[]): EnergyType {
  const counts = new Map<EnergyType, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'colorless';
}

/**
 * A board of 6 different units around `target`'s tier, from `allowed`, taking `liked` ones FAVOURITE_SHARE of the time
 * where the slot's tier has some. A tier with nothing allowed widens to the nearest that has. At the ends of the tiers
 * the board stays on the end tier (a spread there could only go one way): a target below tier 1 takes the weaker half of
 * its tier-1 units, one above the top tier the stronger half of the top tier's (unitScore), so an easy opponent of the
 * first battles is easier than a board of tier-1 units, and a gym leader of the last harder than one of the top tier.
 */
export function rollBoard(rng: Rng, units: readonly Unit[], target: number, allowed: (u: Unit) => boolean, liked: (u: Unit) => boolean): Unit[] {
  const usable = units.filter((u) => allowed(u) && !isLegendaryName(u.name));
  const end = target <= 1 || target >= TOP_TIER;
  const board: Unit[] = [];
  while (board.length < BOARD_SIZE) {
    const left = usable.filter((u) => !board.includes(u));
    if (!left.length) break;
    const want = clampTier(target + (end ? 0 : weighted(rng, BOARD_SPREAD)));
    const near = Math.min(...left.map((u) => Math.abs(u.tier - want)));
    let tier = left.filter((u) => Math.abs(u.tier - want) === near);
    if ((target < 1 || target > TOP_TIER) && tier.length > 1) {
      const ranked = [...tier].sort((a, b) => unitScore(a) - unitScore(b));
      const half = Math.ceil(ranked.length / 2);
      tier = target < 1 ? ranked.slice(0, half) : ranked.slice(-half);
    }
    const fav = tier.filter(liked);
    board.push(pick(rng, fav.length && chance(rng, FAVOURITE_SHARE) ? fav : tier));
  }
  return board;
}

/** Champion Blue for a run: his team's strongest plain prints, one starter's line rolled. */
export function rollChampion(rng: Rng, units: readonly Unit[]): Opponent {
  const lines = [...BLUE_TEAM, pick(rng, BLUE_STARTERS)];
  const board = lines
    .map((name) => {
      const prints = units.filter((u) => u.name === name);
      const any = prints.length ? prints : units.filter((u) => namesMatch(u.name, name));
      return [...any].sort((a, b) => unitScore(b) - unitScore(a))[0];
    })
    .filter((u): u is Unit => !!u);
  return { name: 'Blue', boss: 'blue', difficulty: 'champion', type: mainType(board), pay: OPPONENT_PAY.champion, board: board.map((u) => u.id), trainer: BLUE_TRAINER };
}

/** A gym leader's board: 6 of their type around `target`, their own prints first. */
export function leaderOpponent(rng: Rng, units: readonly Unit[], leader: (typeof GYM_LEADERS)[number], target: number): Opponent {
  const own = `${leader.name}'s `;
  const board = rollBoard(rng, units, target, (u) => u.type === leader.type, (u) => u.name.startsWith(own));
  return { name: leader.name, boss: leader.id, difficulty: 'gymLeader', type: leader.type, pay: OPPONENT_PAY.gymLeader, board: board.map((u) => u.id), trainer: leader.trainer };
}

/** A trainer class's board: around `target`, their favourite Pokémon where they can. */
export function trainerOpponent(rng: Rng, units: readonly Unit[], name: string, difficulty: Exclude<Difficulty, 'gymLeader' | 'champion' | 'legendary'>, target: number): Opponent {
  const favourites = trainerFavorites(name) ?? [];
  const board = rollBoard(rng, units, target, () => true, (u) => favourites.some((f) => namesMatch(u.name, f)));
  return { name, difficulty, type: mainType(board), pay: OPPONENT_PAY[difficulty], board: board.map((u) => u.id) };
}

/**
 * A battle step's opponents, easiest first: 1–3 trainer classes of different difficulties, a gym leader in the hardest
 * slot about 1 step in 4 (`met`: the leaders met this run, never again). `battle` is the step's battle, 0–14.
 */
export function rollOpponents(rng: Rng, units: readonly Unit[], battle: number, met: readonly string[]): Opponent[] {
  const medium = MEDIUM_TIERS[Math.min(battle, MEDIUM_TIERS.length - 1)]!;
  const count = weighted(rng, OFFER_WEIGHTS);
  const all = ['easy', 'medium', 'hard'] as const;
  const kinds: Difficulty[] = count === 3 ? [...all] : sample(rng, all, count).sort((a, b) => all.indexOf(a) - all.indexOf(b));
  const leaders = GYM_LEADERS.filter((l) => !met.includes(l.id));
  if (count >= 2 && leaders.length && chance(rng, LEADER_CHANCE)) kinds[kinds.length - 1] = 'gymLeader';
  const names = sample(rng, TRAINERS, kinds.length);
  return kinds.map((kind, i) => {
    if (kind === 'gymLeader') return leaderOpponent(rng, units, leaders[int(rng, leaders.length)]!, medium + DIFFICULTY_TIER.gymLeader);
    return trainerOpponent(rng, units, names[i]!, kind as 'easy' | 'medium' | 'hard', medium + DIFFICULTY_TIER[kind as 'easy' | 'medium' | 'hard']);
  });
}

/** What the choice shows of an opponent before it's picked: never its board (issue #239, 6.2). */
export const opponentChoice = ({ board: _board, trainer: _trainer, ...shown }: Opponent) => shown;
