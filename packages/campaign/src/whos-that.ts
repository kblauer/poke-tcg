import { int, pick, rngFrom, sample, type Rng } from './random.js';
import { WHOS_THAT_CARDS } from './whos-that-cards.js';

/**
 * Who's That Pokémon? (README: Who's That Pokémon?): a holo's Pokémon shown as the anime's silhouette, to be named. Its
 * shape is the holo mask's cut-out (apps/web/public/holo-masks): the API reads the mask and sends only the shape
 * (`shapeFromMask`, never the card or its file, so the answer stays on the server), the browser paints it on the screen
 * (apps/web/src/utils/whosThat.ts), as tools/whos-that/whos_that.py draws it. Nothing is drawn ahead of time (the user's).
 * A run's Mystery event (10 seconds to name it, for EXP) and the Extras mode (10 in a row, timed, with leaderboards).
 */
export { WHOS_THAT_CARDS };

/** A run's event: seconds to name the Pokémon, the API's allowance for the round trip, and the EXP it pays (a placeholder). */
export const WHOS_THAT_RUN_MS = 10_000;
export const WHOS_THAT_GRACE_MS = 1_500;
export const WHOS_THAT_EXP = 20;
/** The Extras mode: Pokémon a game, and the time a pass counts for (it's never the fastest). */
export const WHOS_THAT_ROUNDS = 10;
export const WHOS_THAT_PASS_MS = 30_000;

/** A card the game can show: a holo with a cut-out (WHOS_THAT_CARDS) and its name. */
export interface WhosThatCard {
  id: string;
  name: string;
}

// A card's name to its Pokémon's: owners' and Team Aqua's/Magma's/Rocket's, Dark, Light, Shining and Cool, the Birthday
// Pikachu's blank, and the Pokémon-ex, δ, ☆ and Unown's letter marks.
const PREFIX = /^(?:Dark |Light |Shining |Cool |Team (?:Aqua|Magma|Rocket)'s |Lt\. Surge's |_+'s |[A-Z][a-z]+'s )/;
const SUFFIX = /(?: ex| δ| ☆| \[[A-Z?!]\])+$/;

/** The Pokémon a card shows: "Rocket's Hitmonchan ex" is Hitmonchan. */
export const whosThatAnswer = (name: string) => name.replace(PREFIX, '').replace(SUFFIX, '').trim();

/** A typed name as it's compared: lower case, no accents, spaces or punctuation ("Mr. Mime" and "mr mime" are "mrmime"). */
export const answerKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Whether `guess` names the Pokémon on card `name`. */
export const namesPokemon = (guess: string, name: string) => answerKey(guess) !== '' && answerKey(guess) === answerKey(whosThatAnswer(name));

/** The UTC day a time falls on ("2026-10-26"): the daily playlist's and the rotation's day. */
export const whosThatDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** A day's seed: the same for everyone, all day. */
const daySeed = (day: string) => [...day].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 0x57a7);

/** One card of each of `count` different Pokémon, at random. */
function distinctPokemon(rng: Rng, cards: readonly WhosThatCard[], count: number): string[] {
  const byPokemon = new Map<string, string[]>();
  for (const c of cards) {
    const key = answerKey(whosThatAnswer(c.name));
    byPokemon.set(key, [...(byPokemon.get(key) ?? []), c.id]);
  }
  return sample(rng, [...byPokemon.values()], Math.min(count, byPokemon.size)).map((ids) => pick(rng, ids));
}

/** A game of the Extras mode: 10 different Pokémon. */
export const whosThatGame = (rng: Rng, cards: readonly WhosThatCard[]) => distinctPokemon(rng, cards, WHOS_THAT_ROUNDS);

/** The day's playlist, the same 10 for every player (the daily leaderboard's). */
export const dailyPlaylist = (day: string, cards: readonly WhosThatCard[]) => distinctPokemon(rngFrom(daySeed(day)), cards, WHOS_THAT_ROUNDS);

/**
 * The rotating list's picture of the day, for a run's events that use it (`source: 'rotation'`): fixed holos, one a day
 * in turn, the same for every player that day. Every id is in WHOS_THAT_CARDS (a test checks). Charizard, Blastoise,
 * Venusaur, Mewtwo, Raichu, Zapdos, Alakazam, Nidoqueen, Venomoth, Lapras, Dragonite, Lugia, Jumpluff, Umbreon, Ho-Oh,
 * Chansey ex, Hitmonchan ex, Typhlosion ex, Articuno ex, Deoxys ex.
 */
export const WHOS_THAT_ROTATION: readonly string[] = [
  'base1-4', 'base1-2', 'base1-15', 'base1-10', 'base1-14', 'base1-16', 'base1-1', 'base2-7', 'base2-13', 'base3-10',
  'base3-4', 'neo1-9', 'neo1-7', 'neo2-13', 'neo3-7', 'ex1-96', 'ex1-98', 'ex2-99', 'ex6-114', 'ex9-93',
];
export const rotationCard = (day: string) => WHOS_THAT_ROTATION[Math.floor(Date.parse(day) / 86_400_000) % WHOS_THAT_ROTATION.length]!;

/** A game's times: the fastest Pokémon named (passes aside; null if every one was passed) and the average, in ms. */
export function whosThatTimes(times: readonly number[], passed: readonly boolean[]) {
  const named = times.filter((_, i) => !passed[i]);
  return { fastestMs: named.length ? Math.min(...named) : null, averageMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0 };
}

/**
 * A silhouette's shape: `width` × `height` pixels of the Pokémon (trimmed to it), as runs of pixels left to right, top
 * to bottom, alternating outside and inside, starting outside (base 36, comma separated). `x`, `y`: where it is on the
 * card's 600×825 scan, for the reveal, which shows the card's art through the shape.
 */
export interface WhosThatShape {
  width: number;
  height: number;
  x: number;
  y: number;
  runs: string;
}

/** The card scans' size (TCGdex's, the masks'): a card image of another size is scaled from it. */
export const CARD_SCAN = { width: 600, height: 825 } as const;

// The art windows of TCGdex's 600×825 scans (the masks' size), as tools/holo-masks/make_masks.py's ART.
const MASK_WIDTH = CARD_SCAN.width;
const ART = { wotc: [63, 97, 541, 428], ecard: [57, 103, 580, 400], ex: [46, 79, 554, 390] } as const;
const artWindow = (cardId: string) => ART[cardId.startsWith('ecard') ? 'ecard' : cardId.startsWith('ex') ? 'ex' : 'wotc'];

/**
 * The shape of the Pokémon in a holo mask (its alpha, 600×825, row by row): the transparent part of the art window,
 * trimmed to the Pokémon. Null when the cut-out isn't a Pokémon's (none, or nearly the whole window), as the script's.
 */
export function shapeFromMask(cardId: string, alpha: Uint8Array): WhosThatShape | null {
  const [x0, y0, x1, y1] = artWindow(cardId);
  const inside = (x: number, y: number) => alpha[y * MASK_WIDTH + x]! < 128;
  let count = 0;
  let left: number = x1;
  let top: number = y1;
  let right: number = x0 - 1;
  let bottom: number = y0 - 1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (inside(x, y)) {
        count++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  const share = count / ((x1 - x0) * (y1 - y0));
  if (share <= 0.05 || share >= 0.75) return null;
  const runs: number[] = [];
  let state = false;
  let run = 0;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      if (inside(x, y) !== state) {
        runs.push(run);
        state = !state;
        run = 0;
      }
      run++;
    }
  runs.push(run);
  return { width: right - left + 1, height: bottom - top + 1, x: left, y: top, runs: runs.map((r) => r.toString(36)).join(',') };
}

/** A shape's pixels, row by row: 1 inside the Pokémon, 0 outside. */
export function shapePixels(shape: WhosThatShape): Uint8Array {
  const pixels = new Uint8Array(shape.width * shape.height);
  let i = 0;
  shape.runs.split(',').forEach((r, n) => {
    const length = parseInt(r, 36);
    if (n % 2) pixels.fill(1, i, i + length);
    i += length;
  });
  return pixels;
}

/** A random card for a run's event (`source: 'random'`). */
export const randomWhosThatCard = (rng: Rng, cards: readonly WhosThatCard[]) => cards[int(rng, cards.length)]!.id;
