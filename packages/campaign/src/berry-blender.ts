// The Berry Blender (the Extras page), as Pokémon Emerald plays it with 3 people at the Lilycove Contest Hall (the
// pret/pokeemerald decompilation's src/berry_blender.c, ported frame by frame): the player (the arrow top left) and MISS,
// LADDIE and LASSIE each put in a berry, then the blender's arrow spins and each presses A as it passes their own
// arrow: a Best or Good speeds it up and fills the progress bar, a Miss slows it; when the bar is full the berries make a
// Pokéblock, better the faster the blender ever went. The web app runs `blenderFrame` 60 times a second (the game's
// frame rate); the API makes the Pokéblock (`makePokeblock`) from the berries and the top speed.
import { BERRIES, berryInfo, FLAVORS } from './berries.js';
import type { Rng } from './random.js';
import { int } from './random.js';

/** The game's random number (Random(): 0-65535). */
export type Random16 = () => number;

export const BLENDER_PLAYERS = 4;
/** The people blending with the player, in the arrows' order after theirs (top right, bottom left, bottom right). */
export const BLENDER_OPPONENTS = ['MISS', 'LADDIE', 'LASSIE'] as const;
export const MAX_PROGRESS = 1000;
export const MAX_ARROW_POS = 0x10000;
export const MIN_ARROW_SPEED = 0x80;
/** How far the arrow turns as the blender's centre drops in at the start. */
export const ARROW_FALL_ROTATION = 0x5800;
/** Where on the arrow's turn (its position / 256, + 24) each player's hit range starts: theirs is 48 long, its Best the 8 from 20 in. */
const HIT_RANGE_START = [32, 224, 96, 160];
/** The players' arrows' centres on the 240x160 screen (top left, top right, bottom left, bottom right). */
export const PLAYER_ARROW_POS: readonly (readonly [number, number])[] = [[72, 32], [168, 32], [72, 128], [168, 128]];
/** With 4 players, each speed change is divided by 4 (sNumPlayersToSpeedDivisor). */
const SPEED_DIVISOR = 4;

export type Score = 'best' | 'good' | 'miss';
const SCORE_INDEX: Record<Score, 0 | 1 | 2> = { best: 0, good: 1, miss: 2 };

export interface BlenderGame {
  /** The arrow's angle: 0 up, 0x4000 left, 0x8000 down, 0xC000 right (it turns anticlockwise). */
  arrowPos: number;
  speed: number;
  progress: number;
  /** The progress bar as drawn: it creeps up to `progress` 2 a frame, and the game ends when it's full. */
  shownProgress: number;
  /** The fastest the blender has gone, in hundredths of an RPM. */
  maxRpm: number;
  frames: number;
  slowdownTimer: number;
  /** Each player's Best, Good and Miss counts. */
  scores: [number, number, number][];
  /** The screen's shake (a Best at high speed), back to 0 a pixel a frame. */
  bgX: number;
  bgY: number;
  /** The scores the people made last frame, counted this frame (as the game's tasks do), by player. */
  pending: (Score | null)[];
  /** Whether each person has already pressed during the arrow's current pass of their window. */
  didInput: boolean[];
  /** Misses still to come: a person who fumbles presses late (Task_OpponentMiss). */
  missTimers: { player: number; frames: number }[];
  over: boolean;
}

/** A score made this frame: who, and which. */
export interface BlenderHit {
  player: number;
  score: Score;
}

/** A blender about to start, its arrow up (the 4 players' start). */
export function newBlenderGame(): BlenderGame {
  return {
    arrowPos: 0,
    speed: MIN_ARROW_SPEED,
    progress: 0,
    shownProgress: 0,
    maxRpm: 0,
    frames: 0,
    slowdownTimer: 0,
    scores: Array.from({ length: BLENDER_PLAYERS }, () => [0, 0, 0] as [number, number, number]),
    bgX: 0,
    bgY: 0,
    pending: Array(BLENDER_PLAYERS).fill(null),
    didInput: Array(BLENDER_PLAYERS).fill(false),
    missTimers: [],
    over: false,
  };
}

/** The blender's speed in hundredths of an RPM, as shown at the bottom of the screen. */
export const speedToRpm = (speed: number) => Math.floor((60 * 60 * 100 * speed) / MAX_ARROW_POS);

/** How close the arrow is to a player's own arrow (GetArrowProximity): Best, Good or a Miss. */
export function proximity(arrowPos: number, player: number): Score {
  const pos = (arrowPos >> 8) + 24;
  const start = HIT_RANGE_START[player]!;
  if (pos >= start && pos < start + 48) return pos >= start + 20 && pos < start + 28 ? 'best' : 'good';
  return 'miss';
}

/** UpdateSpeedFromHit (and the screen's shake for a Best at speed). */
function speedUp(game: BlenderGame, score: Score, random: Random16) {
  if (score === 'best') {
    if (game.speed < 1500) game.speed += Math.trunc(384 / SPEED_DIVISOR);
    else {
      game.speed += Math.trunc(128 / SPEED_DIVISOR);
      const strength = Math.trunc(game.speed / 100) - 10;
      if (game.bgX === 0) game.bgX = (random() % strength) - Math.trunc(strength / 2);
      if (game.bgY === 0) game.bgY = (random() % strength) - Math.trunc(strength / 2);
    }
  } else if (score === 'good') {
    if (game.speed < 1500) game.speed += Math.trunc(256 / SPEED_DIVISOR);
  } else {
    game.speed = Math.max(MIN_ARROW_SPEED, game.speed - Math.trunc(256 / SPEED_DIVISOR));
  }
}

/** A score counted (UpdateOpponentScores): the speed, the progress and the player's tally. */
function count(game: BlenderGame, player: number, score: Score, random: Random16) {
  speedUp(game, score, random);
  if (score === 'best') game.progress = Math.min(MAX_PROGRESS, game.progress + Math.trunc(game.speed / 55));
  else if (score === 'good') game.progress += Math.trunc(game.speed / 70);
  const tally = game.scores[player]!;
  if (score !== 'miss' || tally[2] < 999) tally[SCORE_INDEX[score]]++;
}

/** `Random() / 655`: a number 0-100. */
const roll = (random: Random16) => Math.trunc(random() / 655);

/**
 * Each person's press this frame (Task_HandleOpponent1-3): once each time the arrow passes their window, a Best, a Good,
 * a late Miss or nothing, at random, by how fast the blender is going; counted next frame. MISS (player 1) presses in
 * their Best window and, as in the game (a bug it shipped with), only ever makes a Good below 500; LADDIE and LASSIE
 * press in a window just before theirs.
 */
function opponents(game: BlenderGame, random: Random16) {
  for (let player = 1; player < BLENDER_PLAYERS; player++) {
    const start = HIT_RANGE_START[player]!;
    const ahead = ((game.arrowPos + 0x1800) & 0xffff) >> 8;
    const inWindow = player === 1 ? proximity(game.arrowPos, player) === 'best' : ahead > start + 20 && ahead < start + 40;
    if (!inWindow) {
      game.didInput[player] = false;
      continue;
    }
    if (game.didInput[player]) continue;
    game.didInput[player] = true;
    const r = roll(random);
    const miss = () => game.missTimers.push({ player, frames: 6 });
    let score: Score | null = null;
    if (player === 1) {
      if (game.speed < 500) score = 'good';
      else if (game.speed < 1500) {
        if (r > 80) score = 'best';
        else if (r >= 21 && r <= 80) score = 'good';
        else if (r < 10) miss();
      } else if (r <= 90) {
        if (r >= 71) score = 'good';
        else if (r < 30) miss();
      } else score = 'best';
    } else if (player === 2) {
      if (game.speed < 500) score = r > 66 ? 'best' : 'good';
      else {
        if (r > 65) score = 'best';
        if (r > 40 && r <= 65) score = 'good';
        if (r < 10) miss();
      }
    } else {
      if (game.speed < 500) score = r > 88 ? 'best' : 'good';
      else {
        if (r > 60) score = 'best';
        else if (r > 55 && r <= 60) score = 'good';
        if (r < 5) miss();
      }
    }
    if (score) game.pending[player] = score;
  }
  game.missTimers = game.missTimers.filter((t) => {
    if (--t.frames > 0) return true;
    game.pending[t.player] = 'miss';
    return false;
  });
}

/**
 * One frame of the game (CB2_PlayBlender), changing `game` in place: the arrow turns; the player's press (A, a click or
 * Space), if any, scores by how close the arrow is to their arrow; the scores made are counted; the blender slows a
 * little every 6 frames; the progress bar creeps up; the top speed is kept; the people decide their presses. Returns the
 * scores counted this frame (for the Best, Good and Miss symbols and sounds).
 */
export function blenderFrame(game: BlenderGame, pressed: boolean, random: Random16): BlenderHit[] {
  if (game.over) return [];
  game.arrowPos = (game.arrowPos + game.speed) & 0xffff;
  if (game.frames < 99 * 60 * 60 + 59 * 60) game.frames++;
  if (pressed) game.pending[0] = proximity(game.arrowPos, 0);
  if (++game.slowdownTimer > 5) {
    if (game.speed > MIN_ARROW_SPEED) game.speed--;
    game.slowdownTimer = 0;
  }
  const hits: BlenderHit[] = [];
  game.pending.forEach((score, player) => {
    if (!score) return;
    count(game, player, score, random);
    hits.push({ player, score });
  });
  game.pending = Array(BLENDER_PLAYERS).fill(null);
  if (game.shownProgress < game.progress) game.shownProgress += 2;
  game.maxRpm = Math.max(game.maxRpm, speedToRpm(game.speed));
  for (const axis of ['bgX', 'bgY'] as const) game[axis] -= Math.sign(game[axis]);
  if (game.shownProgress >= MAX_PROGRESS) {
    game.shownProgress = game.progress = MAX_PROGRESS;
    game.over = true;
    return hits;
  }
  opponents(game, random);
  return hits;
}

/**
 * The music's tempo after a frame's scores (UpdateOpponentScores' m4aMPlayTempoControl), as a speed (1 the song's own):
 * above 1500 the music speeds up with the blender, ((speed − 750) / 20 + 256) / 256, otherwise its own. Or null when the
 * frame doesn't set it: the game only does on a Miss, or on LADDIE's (player 2's) Best or Good, a bug it shipped with (it
 * reads the scores as gRecvCmds[BLENDER_COMM_SCORE][i], which only lines up for player 2); the speed it uses is the
 * blender's after the frame's scores.
 */
export function blenderTempo(game: BlenderGame, hits: readonly BlenderHit[]): number | null {
  if (!hits.some((h) => h.score === 'miss' || h.player === 2)) return null;
  return game.speed > 1500 ? (Math.trunc((game.speed - 750) / 20) + 256) / 256 : 1;
}

/**
 * The places, best first (SortScores): by Bests, then Goods, then the fewest Misses; each a player's index (0 the
 * player, then MISS, LADDIE and LASSIE).
 */
export function blenderRanking(scores: readonly (readonly number[])[]): number[] {
  const points = scores.map(([best = 0, good = 0, miss = 0]) => 1000000 * best + 1000 * good + 1000 - miss);
  return scores.map((_, i) => i).sort((a, b) => points[b]! - points[a]! || a - b);
}

// The 5 berries the people put in: 3 of them, by the player's berry (sOpponentBerrySets): the player's own never among
// them; for any other berry, a set by its place in the list.
const NPC_BERRY_SETS = [
  ['aspear', 'rawst', 'pecha'],
  ['cheri', 'aspear', 'rawst'],
  ['chesto', 'cheri', 'aspear'],
  ['pecha', 'chesto', 'cheri'],
  ['rawst', 'pecha', 'chesto'],
  ['cheri', 'pecha', 'rawst'],
  ['chesto', 'rawst', 'aspear'],
  ['pecha', 'aspear', 'cheri'],
  ['rawst', 'cheri', 'chesto'],
  ['aspear', 'chesto', 'pecha'],
];

/** The berries MISS, LADDIE and LASSIE put in with the player's (SetOpponentsBerryData). */
export function opponentBerries(playerBerry: string): string[] {
  const i = BERRIES.findIndex((b) => b.id === playerBerry);
  if (i < 0) throw new Error(`Unknown berry ${playerBerry}`);
  return NPC_BERRY_SETS[i < 5 ? i : (i % 5) + 5]!;
}

/** The Pokéblocks' colours (PBLOCK_CLR_*), each its name in the game ("Red Pokéblock"). */
export const POKEBLOCK_COLORS = ['red', 'blue', 'pink', 'green', 'yellow', 'purple', 'indigo', 'brown', 'liteBlue', 'olive', 'gray', 'black', 'white', 'gold'] as const;
export type PokeblockColor = (typeof POKEBLOCK_COLORS)[number];
export const POKEBLOCK_NAMES: Record<PokeblockColor, string> = {
  red: 'Red', blue: 'Blue', pink: 'Pink', green: 'Green', yellow: 'Yellow', purple: 'Purple', indigo: 'Indigo', brown: 'Brown',
  liteBlue: 'LiteBlue', olive: 'Olive', gray: 'Gray', black: 'Black', white: 'White', gold: 'Gold',
};

export interface Pokeblock {
  color: PokeblockColor;
  /** Its flavours, in FLAVORS' order. */
  flavors: number[];
  /** Its feel (the sheen it gives; lower is smoother). */
  feel: number;
}

/** Its level: its strongest flavour (GetHighestPokeblocksFlavorLevel). */
export const pokeblockLevel = (block: Pokeblock) => Math.max(...block.flavors);

// A Black Pokéblock's flavours, at random one of these (sBlackPokeblockFlavorFlags), each flavour in it 2.
const BLACK_FLAVORS: Flavor3[] = [
  ['sour', 'bitter', 'sweet'], ['sour', 'sweet', 'dry'], ['sour', 'dry', 'spicy'], ['sour', 'bitter', 'dry'], ['sour', 'bitter', 'spicy'],
  ['bitter', 'sweet', 'dry'], ['bitter', 'sweet', 'spicy'], ['bitter', 'dry', 'spicy'], ['sweet', 'dry', 'spicy'], ['sour', 'sweet', 'spicy'],
];
type Flavor3 = [(typeof FLAVORS)[number], (typeof FLAVORS)[number], (typeof FLAVORS)[number]];

/** The colour (CalculatePokeblockColor): Black for nothing, too many flavours cancelled or the same berry twice; then White, Gray, Gold, one flavour's or the stronger of two's. */
function pokeblockColor(berries: readonly string[], flavors: number[], negatives: number): PokeblockColor {
  if (flavors.every((f) => f === 0) || negatives > 3) return 'black';
  if (new Set(berries).size < berries.length) return 'black';
  const present = flavors.flatMap((f, i) => (f > 0 ? [i] : []));
  if (present.length > 3) return 'white';
  if (present.length === 3) return 'gray';
  if (flavors.some((f) => f > 50)) return 'gold';
  const single: PokeblockColor[] = ['red', 'blue', 'pink', 'green', 'yellow'];
  if (present.length === 1) return single[present[0]!]!;
  const double: PokeblockColor[] = ['purple', 'indigo', 'brown', 'liteBlue', 'olive'];
  const [a, b] = present as [number, number];
  return double[flavors[a]! >= flavors[b]! ? a : b]!;
}

/**
 * The Pokéblock the berries make (CalculatePokeblock): their flavours added up, each less the next one's (spicy less dry
 * … sour less spicy), the ones gone below 0 set to 0 and their number taken from the others, then multiplied by the top
 * speed (`maxRpm`, hundredths of an RPM: ×(1 + RPM/3330)) and rounded; its feel their smoothness's average less the
 * number of berries. A Black one's flavours are 3 of the 5 at 2, at random.
 */
export function makePokeblock(berries: readonly string[], maxRpm: number, rng: Rng): Pokeblock {
  const infos = berries.map((id) => {
    const info = berryInfo(id);
    if (!info) throw new Error(`Unknown berry ${id}`);
    return info;
  });
  const sums = FLAVORS.map((_, i) => infos.reduce((s, b) => s + b.flavors[i]!, 0));
  const smooth = infos.reduce((s, b) => s + b.smoothness, 0);
  const flavors = sums.map((s, i) => s - sums[(i + 1) % FLAVORS.length]!);
  const negatives = flavors.filter((f) => f < 0).length;
  for (let i = 0; i < flavors.length; i++) {
    if (flavors[i]! < 0) flavors[i] = 0;
    else if (flavors[i]! > 0) flavors[i] = Math.max(0, flavors[i]! - negatives);
  }
  const factor = Math.trunc(maxRpm / 333) + 100;
  for (let i = 0; i < flavors.length; i++) {
    const f = Math.trunc((flavors[i]! * factor) / 10);
    flavors[i] = Math.trunc(f / 10) + (f % 10 > 4 ? 1 : 0);
  }
  const color = pokeblockColor(berries, flavors, negatives);
  const feel = Math.max(0, Math.trunc(smooth / berries.length) - berries.length);
  if (color === 'black') {
    const set = BLACK_FLAVORS[int(rng, BLACK_FLAVORS.length)]!;
    FLAVORS.forEach((f, i) => (flavors[i] = set.includes(f) ? 2 : 0));
  }
  return { color, flavors: flavors.map((f) => Math.min(255, f)), feel: Math.min(255, feel) };
}
