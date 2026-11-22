// Safari Draft (issue #239, section 6.2; redesigned with the units, 2026-11-22): the opponents. Each battle step offers
// 1–3 opponents of different difficulties, a harder one paying more; trainer classes with their sprites, gym leaders now
// and then as the hardest; after the 15 battles, Champion Blue. An opponent is just a board (a battle is a pure function
// of two boards and a seed).
//
// The user's (2026-11-18, the issue's "Not specified yet"):
//   - a board's strength is a fixed curve by the battle's number (MEDIUM_TIERS: a medium opponent's tier), an easy one a
//     tier lower, a hard one a tier higher, a gym leader two (hard + 1); good drafting is rewarded, never scaled away.
//     A board mixes tiers around its target (BOARD_SPREAD) and holds evolved units;
//   - a step offers 3 opponents, 2 or 1 (OFFER_WEIGHTS 4:2:1, as the Badge Challenge's steps), none of them easy after
//     the 6th battle (EASY_BATTLES, 2026-11-22: 2 or 1 from then); about 1 step in 4 a gym
//     leader takes the hardest slot (LEADER_CHANCE), each of the 8 at most once a run;
//   - a gym leader's board is their type's, with their Trainer (GYM_LEADERS);
//   - Blue's board is his FireRed Champion team, each one's unit (Pidgeot, Alakazam, Rhydon, Gyarados, Arcanine and one of
//     Venusaur, Charizard and Blastoise, rolled once a run);
//   - the opponents' boards grow over the first battles, Battlegrounds' way (the user's, 2026-11-18, step 7's balance
//     pass): OPENING_SIZES, 3 Pokémon in battle 1, 4 in battle 2, 5 in battle 3, 6 from battle 4 (opponentSize).
//
// The redesign (the user's, 2026-11-22: the opponents fit the units' design, where a Pokémon's place and type matter;
// how is mine, to check with the user):
//   - a trainer's board is built round a type: CORE_SIZE of its Pokémon are of one type (2 for an easy opponent, 3 for a
//     medium one, 4 for a hard one), so it has a type synergy the player can read from the type shown. The type is one
//     their class's favourite Pokémon have (the Badge Challenge's TRAINER_FAVORITES), which the board takes
//     FAVOURITE_SHARE of the time where its tier has some;
//   - a medium or hard trainer, a gym leader, Blue and a legendary's board place their Pokémon (`arrange`: the line that
//     gets the most from its own keywords and synergies, `placementScore`); an easy trainer's line is as it was rolled.
//     Nothing reads the player's board: the player sees the opponent's line before the battle and answers it;
//   - a gym leader's board is their own team's Pokémon wherever the tier has one, of their type otherwise, placed, with a
//     Trainer card that fits it (Brock's Shields at both ends, Lt. Surge's first two hitting harder…);
//   - Blue plays Defender (a Shield at each end of his line).
// Also mine: with one opponent it's easy, medium or hard at random, and a gym leader comes only on a step of 2 or 3; no
// opponent's board holds a legendary (they're the encounters' rewards). Kanto's leaders only: the others have no battle
// sprite.
import { TRAINERS, trainerFavorites, weighted, int, chance, sample, pick, type Rng } from '@poke-tcg/campaign';
import { BOARD_SIZE } from './battle.js';
import { TUNING, synergyLevel, type TrainerName } from './effects.js';
import { TOP_TIER, UNIT_TYPES, hasKeyword, unitScore, type Keyword, type Unit, type UnitType } from './units.js';

/** A legendary's board (an encounter, encounters.ts) pays nothing but the legendary. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'gymLeader' | 'champion' | 'legendary';

/** What beating an opponent pays (issue #239, section 7). */
export const OPPONENT_PAY: Record<Difficulty, number> = { easy: 450, medium: 550, hard: 700, gymLeader: 850, champion: 1000, legendary: 0 };
/** A medium opponent's tier by battle (0–14): the fixed curve (the user's, 2026-11-18). */
export const MEDIUM_TIERS = [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5];
/** Each difficulty's tier against the curve. */
export const DIFFICULTY_TIER: Record<Exclude<Difficulty, 'champion' | 'legendary'>, number> = { easy: -1, medium: 0, hard: 1, gymLeader: 2 };
/** The opponents' boards in the first battles (the user's, 2026-11-18): then BOARD_SIZE. */
export const OPENING_SIZES = [3, 4, 5];
/** How many Pokémon an opponent of battle `battle` (0–14) fields. */
export const opponentSize = (battle: number) => OPENING_SIZES[battle] ?? BOARD_SIZE;
/** How many opponents a step offers: 3, 2 or 1, by weight. */
export const OFFER_WEIGHTS: [count: number, weight: number][] = [[3, 4], [2, 2], [1, 1]];
export const LEADER_CHANCE = 0.25;
/** Easy opponents are offered in the first battles only (the user's, 2026-11-22): from this battle (0–14) on, medium and hard. */
export const EASY_BATTLES = 6;
/** A board unit's tier against its target: one lower, the same or one higher, by weight (mine). Not at the tiers' ends (rollBoard). */
const BOARD_SPREAD: [offset: number, weight: number][] = [[-1, 1], [0, 2], [1, 1]];
/** How often a slot takes the trainer's favourite, where the tier has one (mine). A gym leader's own team: always. */
const FAVOURITE_SHARE = 0.7;
/** How many of a trainer's Pokémon are of their board's type (mine): the synergy the board is built round. */
export const CORE_SIZE: Record<'easy' | 'medium' | 'hard', number> = { easy: 2, medium: 3, hard: 4 };

/**
 * Kanto's gym leaders: their type, their own team's Pokémon (their board's, whatever their type, wherever the tier has
 * one) and their Trainer (the leaders the user's, 2026-11-18; the teams and Trainers mine).
 */
export const GYM_LEADERS: { id: string; name: string; type: UnitType; trainer: TrainerName; team: string[] }[] = [
  // Rock: Taunt and Sturdy walls, a Shield at each end.
  { id: 'brock', name: 'Brock', type: 'fighting', trainer: 'Defender', team: ['Geodude', 'Graveler', 'Golem', 'Onix', 'Rhyhorn', 'Rhydon', 'Kabuto', 'Kabutops', 'Sudowoodo'] },
  // Water side by side (Current), its neighbours healed as one faints.
  { id: 'misty', name: 'Misty', type: 'water', trainer: 'Super Potion', team: ['Staryu', 'Starmie', 'Psyduck', 'Golduck', 'Goldeen', 'Seaking', 'Horsea', 'Seadra', 'Lapras'] },
  // The leftmost attack first (Quick), and the first two hit harder.
  { id: 'lt-surge', name: 'Lt. Surge', type: 'lightning', trainer: 'PlusPower', team: ['Pikachu', 'Raichu', 'Voltorb', 'Electrode', 'Magnemite', 'Magneton', 'Electabuzz', 'Jolteon'] },
  // Paralysis and healing.
  { id: 'erika', name: 'Erika', type: 'grass', trainer: 'Potion', team: ['Oddish', 'Gloom', 'Vileplume', 'Bellossom', 'Bellsprout', 'Weepinbell', 'Victreebel', 'Tangela', 'Exeggcute', 'Exeggutor'] },
  // Explosions and Confusion, aimed past a Taunt.
  { id: 'koga', name: 'Koga', type: 'grass', trainer: 'Gust of Wind', team: ['Koffing', 'Weezing', 'Grimer', 'Muk', 'Zubat', 'Golbat', 'Crobat', 'Venonat', 'Venomoth', 'Ekans', 'Arbok'] },
  // Pressure on the Pokémon across, the player's synergies cut.
  { id: 'sabrina', name: 'Sabrina', type: 'psychic', trainer: 'Imposter Professor Oak', team: ['Abra', 'Kadabra', 'Alakazam', 'Mr. Mime', 'Gastly', 'Haunter', 'Gengar', 'Jynx', 'Espeon'] },
  // Burns, and one that comes back.
  { id: 'blaine', name: 'Blaine', type: 'fire', trainer: 'Revive', team: ['Growlithe', 'Arcanine', 'Ponyta', 'Rapidash', 'Vulpix', 'Ninetales', 'Magmar', 'Charmander', 'Charmeleon', 'Charizard'] },
  // Ground: Duels with the Pokémon across, the player's strongest weakened.
  { id: 'giovanni', name: 'Giovanni', type: 'fighting', trainer: 'Super Energy Removal', team: ['Sandshrew', 'Sandslash', 'Diglett', 'Dugtrio', 'Rhyhorn', 'Rhydon', 'Cubone', 'Marowak', 'Onix', 'Nidoking', 'Nidoqueen'] },
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
  /** The type shown: a leader's, a trainer's board's (the type it's built round), else the board's most common. */
  type: UnitType;
  pay: number;
  /** Unit ids, left to right, and the Trainer they play. */
  board: string[];
  trainer?: TrainerName;
}

const clampTier = (t: number) => Math.min(TOP_TIER, Math.max(1, t));

/** The type most of a board's units are (the first such on a tie). */
export function mainType(units: readonly Unit[]): UnitType {
  const counts = new Map<UnitType, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'colorless';
}

/**
 * A board of `size` (6) different units around `target`'s tier, from `allowed`, taking `liked` ones `share` of the time
 * where the slot's tier has some; its first `core.count` are of `core.type`, while that type has any left. A tier with
 * nothing allowed widens to the nearest that has. At the ends of the tiers the board stays on the end tier (a spread
 * there could only go one way): a target below tier 1 takes the weaker half of its tier-1 units, one above the top tier
 * the stronger half of the top tier's (unitScore), so an easy opponent of the first battles is easier than a board of
 * tier-1 units, and a gym leader of the last harder than one of the top tier.
 */
export function rollBoard(rng: Rng, units: readonly Unit[], target: number, allowed: (u: Unit) => boolean, liked: (u: Unit) => boolean, size = BOARD_SIZE, share = FAVOURITE_SHARE, core?: { type: UnitType; count: number }): Unit[] {
  const usable = units.filter((u) => allowed(u) && !u.legendary);
  const end = target <= 1 || target >= TOP_TIER;
  const board: Unit[] = [];
  while (board.length < size) {
    const free = usable.filter((u) => !board.includes(u));
    const ofCore = core && board.length < core.count ? free.filter((u) => u.type === core.type) : [];
    const left = ofCore.length ? ofCore : free;
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
    board.push(pick(rng, fav.length && chance(rng, share) ? fav : tier));
  }
  return board;
}

const n = (u: Unit, k: Keyword) => u.abilities.find((a) => a.k === k)?.n ?? 0;

/**
 * What a line gets from its own places (mine): its keywords that read a neighbour, its type synergies that read one, who
 * attacks first. In attack points, roughly; nothing of the other side is known.
 */
export function placementScore(line: readonly Unit[]): number {
  const level = (type: UnitType) => synergyLevel(line.filter((u) => u.type === type).length);
  const current = TUNING.water[level('water') - 1] ?? 0;
  const plating = TUNING.metal[level('metal') - 1] ?? 0;
  const quick = TUNING.lightning[level('lightning') - 1] ?? 0;
  let score = 0;
  let lightning = 0;
  line.forEach((u, i) => {
    const left = line[i - 1];
    const right = line[i + 1];
    const beside = [left, right].filter((v): v is Unit => !!v);
    // A neighbour's attack is worth more on a Pokémon that will use it for long.
    for (const v of beside) score += n(u, 'Rally') * (1 + v.hp / 200);
    if (hasKeyword(u, 'Safeguard')) score += 5 * beside.length;
    // A Bodyguard takes the attacks aimed at its neighbours: beside the Pokémon that hit hardest and fall soonest.
    if (hasKeyword(u, 'Bodyguard')) for (const v of beside) score += v.attack / 5 - v.hp / 20;
    if (right) score += n(u, 'Baton Pass') * (0.5 + right.attack / 100);
    if (hasKeyword(u, 'Sketch') && left) score += 15 * left.abilities.filter((a) => a.k !== 'Sketch' && a.k !== 'Transform' && !hasKeyword(u, a.k)).length;
    // Splash reaches a target's neighbours, and a Taunt Pokémon is the target: at an end of the line it has one.
    if (hasKeyword(u, 'Taunt')) score += 5 * (2 - beside.length);
    if (u.type === 'water') score += current * beside.filter((v) => v.type === 'water').length;
    if (plating && beside.some((v) => v.type === 'metal')) score += plating;
    // Lightning's Quick: the leftmost attack before the battle.
    if (u.type === 'lightning' && lightning++ < quick) score += u.attack / 2;
    // Left to right is the order of attack: the hardest hits first.
    score += (u.attack * (line.length - i)) / 100;
  });
  return score;
}

/** Every order of a list. */
function orders<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((x, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** A board placed: the order of its units with the best placementScore (a random one of the best). */
export function arrange(rng: Rng, board: readonly Unit[]): Unit[] {
  let best: Unit[] = [...board];
  let top = -Infinity;
  for (const line of orders(sample(rng, board, board.length))) {
    const score = placementScore(line);
    if (score > top + 1e-9) [best, top] = [line, score];
  }
  return best;
}

/** Champion Blue for a run: his team's units, one starter's line rolled, placed. */
export function rollChampion(rng: Rng, units: readonly Unit[]): Opponent {
  const lines = [...BLUE_TEAM, pick(rng, BLUE_STARTERS)];
  const board = arrange(rng, lines.map((name) => units.find((u) => u.name === name)).filter((u): u is Unit => !!u));
  return { name: 'Blue', boss: 'blue', difficulty: 'champion', type: mainType(board), pay: OPPONENT_PAY.champion, board: board.map((u) => u.id), trainer: BLUE_TRAINER };
}

/** A gym leader's board around `target`: their own team's Pokémon wherever the tier has one, of their type otherwise, placed. */
export function leaderOpponent(rng: Rng, units: readonly Unit[], leader: (typeof GYM_LEADERS)[number], target: number, size = BOARD_SIZE): Opponent {
  const own = (u: Unit) => leader.team.includes(u.name);
  const board = arrange(rng, rollBoard(rng, units, target, (u) => u.type === leader.type || own(u), own, size, 1));
  return { name: leader.name, boss: leader.id, difficulty: 'gymLeader', type: leader.type, pay: OPPONENT_PAY.gymLeader, board: board.map((u) => u.id), trainer: leader.trainer };
}

/** The type a trainer's board is built round: one their favourites have, of those with enough Pokémon near `target`'s tier. */
function coreType(rng: Rng, units: readonly Unit[], favourites: readonly string[], target: number, count: number): UnitType {
  const near = units.filter((u) => !u.legendary && Math.abs(u.tier - clampTier(target)) <= 1);
  const enough = UNIT_TYPES.filter((type) => near.filter((u) => u.type === type).length >= count + 2);
  const liked = near.filter((u) => favourites.includes(u.name) && enough.includes(u.type));
  return liked.length ? pick(rng, liked).type : pick(rng, enough.length ? enough : UNIT_TYPES);
}

/**
 * A trainer class's board: around `target`, built round a type (CORE_SIZE of it), their favourite Pokémon where they
 * can; placed unless they're an easy opponent.
 */
export function trainerOpponent(rng: Rng, units: readonly Unit[], name: string, difficulty: Exclude<Difficulty, 'gymLeader' | 'champion' | 'legendary'>, target: number, size = BOARD_SIZE): Opponent {
  const favourites = trainerFavorites(name) ?? [];
  const count = Math.min(CORE_SIZE[difficulty], size);
  const type = coreType(rng, units, favourites, target, count);
  const rolled = rollBoard(rng, units, target, () => true, (u) => favourites.includes(u.name), size, FAVOURITE_SHARE, { type, count });
  const board = difficulty === 'easy' ? sample(rng, rolled, rolled.length) : arrange(rng, rolled);
  return { name, difficulty, type, pay: OPPONENT_PAY[difficulty], board: board.map((u) => u.id) };
}

/**
 * A battle step's opponents, easiest first: 1–3 trainer classes of different difficulties, a gym leader in the hardest
 * slot about 1 step in 4 (`met`: the leaders met this run, never again), the first battle's always with an easy one.
 * `battle` is the step's battle, 0–14.
 */
export function rollOpponents(rng: Rng, units: readonly Unit[], battle: number, met: readonly string[]): Opponent[] {
  const medium = MEDIUM_TIERS[Math.min(battle, MEDIUM_TIERS.length - 1)]!;
  // No easy opponent after the 6th battle (the user's, 2026-11-22): a step then offers 2 at most.
  const all: readonly ('easy' | 'medium' | 'hard')[] = battle < EASY_BATTLES ? ['easy', 'medium', 'hard'] : ['medium', 'hard'];
  const count = Math.min(weighted(rng, OFFER_WEIGHTS), all.length);
  const kinds: Difficulty[] = count === all.length ? [...all] : sample(rng, all, count).sort((a, b) => all.indexOf(a) - all.indexOf(b));
  // The first battle always offers an easy opponent (the user's, 2026-11-18), with whatever else was rolled.
  if (battle === 0) kinds[0] = 'easy';
  const leaders = GYM_LEADERS.filter((l) => !met.includes(l.id));
  if (count >= 2 && leaders.length && chance(rng, LEADER_CHANCE)) kinds[kinds.length - 1] = 'gymLeader';
  const names = sample(rng, TRAINERS, kinds.length);
  return kinds.map((kind, i) => {
    if (kind === 'gymLeader') return leaderOpponent(rng, units, leaders[int(rng, leaders.length)]!, medium + DIFFICULTY_TIER.gymLeader, opponentSize(battle));
    return trainerOpponent(rng, units, names[i]!, kind as 'easy' | 'medium' | 'hard', medium + DIFFICULTY_TIER[kind as 'easy' | 'medium' | 'hard'], opponentSize(battle));
  });
}

/** What the choice shows of an opponent before it's picked: never its board (issue #239, 6.2). */
export const opponentChoice = ({ board: _board, trainer: _trainer, ...shown }: Opponent) => shown;
