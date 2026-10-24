// Poffin cooking (the Extras page), as Pokémon Platinum plays it alone at the Poffin House (the pret/pokeplatinum
// decompilation's src/overlay083/ov83_0223F7F4.c, ported frame by frame, and src/poffin.c): the player puts in a berry
// and stirs the batter round the pot, the way the arrow says, through 3 phases (each over after 16 laps or 20 seconds),
// the batter going faster the faster they stir. Stirring flat out for a second spills it (but in the last phase); too
// slowly for 3 seconds, it burns (the first time only a warning). The Poffin's flavours are the berry's, stronger the
// quicker it was cooked, less a point for each spill and burn. The game runs at 30 frames a second; the web app calls
// `cookFrame` for each with where the stylus (the pointer) is; the API makes the Poffin (`makePoffin`).
import { POFFIN_BERRY_DATA } from './berry-data-gen4.js';

/** The game's random number (MTRNG_Next: 0 to 2³² − 1). */
export type Random32 = () => number;

export const COOK_FPS = 30;
/** The pot's centre on the touch screen (256x192). */
export const POT_CENTER = { x: 128, y: 96 } as const;
export const PHASES = 3;
/** Each phase's length (20 seconds) and laps (16) to end it. */
export const PHASE_FRAMES = 20 * 30;
const PHASE_LAPS = [16, 16, 16];
/** The batter's top speed, either way, and the speed at or under which it burns. */
export const MAX_SPEED = 3640;
export const SLOW_SPEED = 910;
/** How much a stroke speeds the batter up (8/204, then 7/204: FX_Div's fx32, 160 and 140 / 4096) and how much it slows each frame, by phase. */
const STROKE = [160, 140, 140];
const FRICTION = [64, 72, 80];
/** How long a direction lasts before the next is drawn, by phase (plus up to 2 seconds at random). */
const DIRECTION_FRAMES = [30 * 5, 30 * 4, 30 * 3];
/** The batter's circumference in the game's sums (2 × 68 × 3.140, fx32: 427). */
const CIRCUMFERENCE = 427;

/** Which way to stir: 0 clockwise (the speed positive), 1 anticlockwise. */
export type StirDirection = 0 | 1;

export interface CookGame {
  /** The stylus: where it is, where it was last frame, and whether it was down. */
  touch: { x: number; y: number; prevX: number; prevY: number; held: boolean };
  /** Its stroke this frame (ApproximateArcLength × 160, signed: + clockwise). */
  stroke: number;
  /** The batter's speed (−3640 to 3640) and angle (65536 a turn), and the laps stirred this phase the arrow's way. */
  speed: number;
  angle: number;
  laps: number;
  /** The phase (0-2; 3 when it's over), its frame, and the batter's fade into the next phase's (31 down to 0 near its end). */
  phase: number;
  phaseFrame: number;
  fade: number;
  /** The arrow: its way, the frames until the next is drawn, and its bias (0-4: a draw of 0-4 at or under it is anticlockwise). */
  direction: StirDirection;
  directionTimer: number;
  directionBias: number;
  /** Mistakes: spills and burns, and their timers (as the game, these timers carry on where they were). */
  spills: number;
  burns: number;
  spillTimer: number;
  burnTimer: number;
  burnWarned: boolean;
  /** Every frame cooked. */
  frames: number;
  over: boolean;
}

/** What happened this frame, for the sounds and pictures. */
export interface CookEvents {
  /** A lap's turn of the batter past its start the arrow's way (the stirring sound). */
  lap: boolean;
  /** A direction was drawn (the arrow shows, even when it's the same way). */
  newDirection: boolean;
  spill: boolean;
  /** A burn: 'warning' the first time it's too slow, 'burn' after. */
  burn: 'warning' | 'burn' | null;
  /** A new phase began (or, `over`, the last ended). */
  newPhase: boolean;
}

/** A pot about to be stirred: the arrow's first way drawn (ov83_0223FDB0). */
export function newCookGame(random: Random32): CookGame {
  const game: CookGame = {
    touch: { x: POT_CENTER.x, y: POT_CENTER.y, prevX: POT_CENTER.x, prevY: POT_CENTER.y, held: false },
    stroke: 0,
    speed: 0,
    angle: 0,
    laps: 0,
    phase: 0,
    phaseFrame: 0,
    fade: 31,
    direction: 0,
    directionTimer: -1,
    directionBias: 2,
    spills: 0,
    burns: 0,
    spillTimer: 0,
    burnTimer: 0,
    burnWarned: false,
    frames: 0,
    over: false,
  };
  drawDirection(game, random);
  return game;
}

/**
 * A stroke's length along the pot (ApproximateArcLength, as the game works it out): the move from `prev` to the stylus,
 * both from the pot's centre, onto (y, x) of `prev` made unit length (the game's, not quite the tangent), floored, its
 * sign the way round it went (+ clockwise on the screen).
 */
export function strokeLength(prevX: number, prevY: number, x: number, y: number) {
  const cross = prevX * y - x * prevY;
  const r = Math.hypot(prevX, prevY);
  const dot = r ? (prevY / r) * (x - prevX) + (prevX / r) * (y - prevY) : 0;
  const length = Math.abs(Math.floor(dot));
  return length && (cross <= 0 ? -length : length);
}

/** Where the stylus is and its stroke (ov83_0223F83C). */
function moveTouch(game: CookGame, touch: { x: number; y: number } | null) {
  const t = game.touch;
  if (touch) {
    t.x = touch.x;
    t.y = touch.y;
    if (!t.held) {
      t.prevX = t.x;
      t.prevY = t.y;
    }
  }
  game.stroke = strokeLength(t.prevX - POT_CENTER.x, t.prevY - POT_CENTER.y, t.x - POT_CENTER.x, t.y - POT_CENTER.y) * 160;
  t.prevX = t.x;
  t.prevY = t.y;
  t.held = !!touch;
}

/** How far out the batter reaches at this speed: 1 to 1.25 times (ov83_0223FB68, an fx32 as a number). */
export function batterScale(speed: number) {
  const over = Math.max(0, Math.abs(speed) - SLOW_SPEED);
  return 1 + (0.25 * over) / (MAX_SPEED - SLOW_SPEED);
}

/** Where the stylus is: in the pot (0), at its middle (1: half a stroke) or outside it (2: none). The pot reaches 72 to 88 px out, wider the faster it goes. */
function zone(game: CookGame) {
  const d = Math.floor(Math.hypot(game.touch.x - POT_CENTER.x, game.touch.y - POT_CENTER.y));
  const reach = Math.floor(batterScale(game.speed) * 64) + 8;
  return d < 16 ? 1 : d > reach ? 2 : 0;
}

/** The batter's turn this frame (ov83_0223F900): the stroke speeds it up, it slows a little, it turns, and a lap the arrow's way counts. */
function stir(game: CookGame): boolean {
  const z = zone(game);
  const stroke = z === 0 ? game.stroke : z === 1 ? Math.trunc(game.stroke / 2) : 0;
  game.speed += Math.floor((stroke * STROKE[game.phase]!) / 4096);
  const friction = FRICTION[game.phase]!;
  if (game.speed > 0) game.speed = Math.max(0, game.speed - friction);
  else if (game.speed < 0) game.speed = Math.min(0, game.speed + friction);
  game.speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, game.speed));
  const before = game.angle & 0xffff;
  game.angle += Math.trunc((Math.trunc(game.speed / 160) * 0xffff) / CIRCUMFERENCE);
  const after = game.angle & 0xffff;
  const lap = (game.direction === 0 && game.speed >= 0 && before > after) || (game.direction === 1 && game.speed < 0 && before < after);
  if (lap) game.laps++;
  return lap;
}

/** Whether the batter is going the wrong way (ov83_0223FC3C). */
export const wrongWay = (game: CookGame) => (game.speed < 0 && game.direction === 0) || (game.speed > 0 && game.direction === 1);

/** The arrow's next way, drawn (ov83_0223FBBC's draw): a run of the same way makes a change likelier, a change resets it. */
function drawDirection(game: CookGame, random: Random32) {
  const r = random() >>> 0;
  const way: StirDirection = r % 5 <= game.directionBias ? 1 : 0;
  if (way === game.direction) {
    if (game.direction === 1) game.directionBias = Math.max(0, game.directionBias - 1);
    else game.directionBias = Math.min(4, game.directionBias + 1);
  } else {
    game.direction = way;
    game.directionBias = 2;
  }
  game.directionTimer = DIRECTION_FRAMES[Math.min(game.phase, PHASES - 1)]! + (r % (2 * 30));
}

/**
 * One of the game's frames (ov83_0223FDD8 and ov83_0223FFA0), changing `game` in place: the phase moves on (after its
 * 16 laps or 20 seconds), the stylus (`touch`, in the touch screen's pixels, or null when it's up) stirs the batter,
 * a spill or burn is checked, and the arrow's way may change (its countdown waits while the batter goes the wrong way).
 */
export function cookFrame(game: CookGame, touch: { x: number; y: number } | null, random: Random32): CookEvents {
  const events: CookEvents = { lap: false, newDirection: false, spill: false, burn: null, newPhase: false };
  if (game.over) return events;
  // The phase (ov83_0223FC58).
  if (game.phaseFrame === PHASE_FRAMES || game.laps >= PHASE_LAPS[game.phase]!) {
    game.phase++;
    game.phaseFrame = 0;
    events.newPhase = true;
    if (game.phase >= PHASES) {
      game.over = true;
      return events;
    }
    game.laps = 0;
  }
  const framesLeft = PHASE_FRAMES - game.phaseFrame;
  const lapsLeft = PHASE_LAPS[game.phase]! - game.laps;
  game.fade = Math.min(framesLeft <= 60 ? Math.trunc((31 * framesLeft) / 60) : 31, lapsLeft <= 5 ? Math.trunc((31 * lapsLeft) / 5) : 31);
  game.phaseFrame++;
  moveTouch(game, touch);
  events.lap = stir(game);
  // Spills and burns (ov83_0223FAAC).
  const speed = Math.abs(game.speed);
  if (game.phase !== 2 && speed >= MAX_SPEED) {
    if (++game.spillTimer >= 30) {
      game.spills = Math.min(9999, game.spills + 1);
      events.spill = true;
      game.spillTimer = 0;
    }
    game.burnWarned = false;
  } else if (speed <= SLOW_SPEED) {
    if (++game.burnTimer >= 30 * 3) {
      game.burnTimer = 0;
      if (!game.burnWarned) {
        events.burn = 'warning';
        game.burnWarned = true;
      } else {
        events.burn = 'burn';
        game.burns = Math.min(9999, game.burns + 1);
      }
    }
  } else game.burnWarned = false;
  // The arrow (ov83_0223FBBC): its countdown waits while the batter goes the wrong way.
  if (!wrongWay(game)) {
    if (game.directionTimer < 0) {
      drawDirection(game, random);
      events.newDirection = true;
    }
    game.directionTimer--;
  }
  game.frames++;
  return events;
}

/** The Poffins' types, in the game's order (the type's index, `enum PoffinType`), each its name in the game. */
export const POFFIN_TYPES = [
  'Spicy', 'Spicy-Dry', 'Spicy-Sweet', 'Spicy-Bitter', 'Spicy-Sour',
  'Dry-Spicy', 'Dry', 'Dry-Sweet', 'Dry-Bitter', 'Dry-Sour',
  'Sweet-Spicy', 'Sweet-Dry', 'Sweet', 'Sweet-Bitter', 'Sweet-Sour',
  'Bitter-Spicy', 'Bitter-Dry', 'Bitter-Sweet', 'Bitter', 'Bitter-Sour',
  'Sour-Spicy', 'Sour-Dry', 'Sour-Sweet', 'Sour-Bitter', 'Sour',
  'Rich', 'Overripe', 'Foul', 'Mild',
].map((name) => `${name} Poffin`);
const RICH = 25;
const OVERRIPE = 26;
const FOUL = 27;
const MILD = 28;

export interface Poffin {
  /** Its type, an index into POFFIN_TYPES. */
  type: number;
  /** Its flavours: spicy, dry, sweet, bitter, sour. */
  flavors: number[];
  smoothness: number;
}

/** A Poffin's name ("Spicy-Dry Poffin"). */
export const poffinName = (poffin: Pick<Poffin, 'type'>) => POFFIN_TYPES[poffin.type] ?? 'Poffin';

/** Its level (Poffin_CalcLevel): its type's main flavour, or its strongest for a Rich, Overripe, Foul or Mild one; at most 99. */
export function poffinLevel(poffin: Poffin) {
  const main = Math.trunc(poffin.type / 5);
  return Math.min(99, main < 5 ? poffin.flavors[main]! : Math.max(...poffin.flavors));
}

/** A Foul Poffin (Poffin_MakeFoul): 3 flavours of the 5 at random at 2. */
function foul(smoothness: number, random: Random32): Poffin {
  const flavors = [0, 0, 0, 0, 0];
  for (let set = 0; set < 3; ) {
    const i = (random() >>> 0) % 5;
    if (flavors[i]) continue;
    flavors[i] = 2;
    set++;
  }
  return { type: FOUL, flavors, smoothness };
}

/** Poffin_MakePoffin: its type from its flavours (one, the stronger of two first, Rich for 3, Overripe for 4 or 5, Mild with any at 50 or more); Foul for none or `isFoul`. */
function poffinOf(flavors: number[], smoothness: number, isFoul: boolean, random: Random32): Poffin {
  const present = flavors.flatMap((f, i) => (f ? [i] : []));
  if (isFoul || !present.length) return foul(smoothness, random);
  let type: number;
  if (present.length === 1) type = present[0]! * 5 + present[0]!;
  else if (present.length === 2) {
    const [a, b] = present as [number, number];
    type = flavors[a]! >= flavors[b]! ? a * 5 + b : b * 5 + a;
  } else type = present.length === 3 ? RICH : OVERRIPE;
  if (flavors.some((f) => f >= 50)) type = MILD;
  return { type, flavors: [...flavors], smoothness };
}

/** The berry's flavours and smoothness as Platinum has them (berry-data-gen4.ts). */
export function poffinBerry(berry: string) {
  const data = POFFIN_BERRY_DATA[berry];
  if (!data) throw new Error(`Unknown berry ${berry}`);
  return data;
}

/**
 * The Poffin a cooking makes (ov83_0223FFD4), from the berries put in (one, cooking alone) and how it went: their
 * flavours added up, each less the next one's, less the number gone below 0; then times 1800 / the frames it took (as a
 * percentage, rounded), rounded, less the spills and burns, at least 0. Its smoothness is their average less the number
 * of berries, at least 15. Foul when the same berry went in twice (with others) or 4 or more flavours cancelled out.
 */
export function makePoffin(berries: readonly string[], cooked: { frames: number; spills: number; burns: number }, random: Random32): Poffin {
  const data = berries.map(poffinBerry);
  const sums = [0, 1, 2, 3, 4].map((i) => data.reduce((s, b) => s + b.flavors[i]!, 0));
  const smooth = data.reduce((s, b) => s + b.smoothness, 0);
  const same = Math.max(...berries.map((b) => berries.filter((o) => o === b).length));
  let isFoul = same >= 2 && berries.length > 1;
  const flavors = sums.map((s, i) => s - sums[(i + 1) % 5]!);
  const negatives = flavors.filter((f) => f < 0).length;
  for (let i = 0; i < 5; i++) flavors[i]! -= negatives;
  if (negatives >= 4) isFoul = true;
  let rate = Math.trunc((PHASE_FRAMES * PHASES * 1000) / Math.max(1, cooked.frames));
  if (rate % 10 >= 5) rate += 10;
  rate = Math.trunc(rate / 10);
  for (let i = 0; i < 5; i++) {
    let v = flavors[i]! * rate;
    if (v % 100 >= 50) v += 100;
    flavors[i] = Math.max(0, Math.trunc(v / 100) - (cooked.burns + cooked.spills));
  }
  const smoothness = Math.max(15, Math.trunc(smooth / berries.length) - berries.length);
  return poffinOf(
    flavors.map((f) => f & 0xff),
    smoothness & 0xff,
    isFoul,
    random,
  );
}

/** The cooking's time as the results show it (ov83_022401AC): minutes, seconds and hundredths, from frames at 30 a second. */
export function cookTime(frames: number) {
  const minutes = Math.trunc(frames / (60 * 30));
  const seconds = Math.trunc((frames - minutes * 60 * 30) / 30);
  const hundredths = Math.trunc((100 * (frames - minutes * 60 * 30 - seconds * 30)) / 30);
  return { minutes, seconds, hundredths };
}
